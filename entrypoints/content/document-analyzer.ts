/**
 * Document processing pipeline — processes in CHUNKS with live progress.
 * Each chunk is a batch of ~10 paragraphs sent as one LLM call.
 * Results appear in the side panel as each chunk completes.
 */
// sendGetFullPageAnalysis not used — we use a port for long-running calls
import type {
  FullPageAnalysisResponse,
  MicroSummaryResponse,
  DeepDiveResponse,
  CrossReferenceGraph,
  DocumentType,
} from '@/utils/types'
import {
  getAllParagraphsForAnalysis,
  paragraphRegistry,
} from './paragraph-detector'
import { setCrossRefGraph, getCrossRefGraph } from './cross-ref-navigator'

const MAX_CHARS_PER_PARA = 1500
const CHUNK_SIZE = 8  // paragraphs per LLM call

// ─── State ────────────────────────────────────────────────────────────────────

export const paragraphSummaries = new Map<string, MicroSummaryResponse>()
export const paragraphDeepDives = new Map<string, DeepDiveResponse>()

export type AnalysisState = 'idle' | 'running' | 'done' | 'error'
let state: AnalysisState = 'idle'
let statusMessage = ''
let aborted = false

export function getAnalysisStatus() {
  return {
    state,
    message: statusMessage,
    paragraphsFound: paragraphRegistry.size,
    paragraphsAnalyzed: paragraphSummaries.size,
  }
}

export function isPipelineComplete(): boolean { return state === 'done' }

// ─── Start / Stop ─────────────────────────────────────────────────────────────

export async function startAnalysis(): Promise<void> {
  if (state === 'running') return
  aborted = false
  state = 'running'
  statusMessage = 'Preparing...'
  paragraphSummaries.clear()
  paragraphDeepDives.clear()
  await runChunkedAnalysis()
}

export function stopAnalysis(): void {
  aborted = true
  if (paragraphSummaries.size > 0) {
    state = 'done'
    statusMessage = `Stopped — ${paragraphSummaries.size} paragraphs analyzed`
  } else {
    state = 'idle'
    statusMessage = 'Stopped'
  }
}

// ─── Chunked pipeline ─────────────────────────────────────────────────────────

async function runChunkedAnalysis(): Promise<void> {
  let paragraphs = getAllParagraphsForAnalysis()
  if (paragraphs.length < 2) {
    state = 'error'; statusMessage = 'Too few paragraphs'; return
  }

  // Truncate long paragraphs
  paragraphs = paragraphs.map(p => ({
    ...p,
    text: p.text.length > MAX_CHARS_PER_PARA ? p.text.slice(0, MAX_CHARS_PER_PARA) + '…' : p.text,
  }))

  const total = paragraphs.length
  const docType = detectDocumentType()
  const title = document.title || window.location.hostname

  // Split into chunks
  const chunks: typeof paragraphs[] = []
  for (let i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
    chunks.push(paragraphs.slice(i, i + CHUNK_SIZE))
  }

  console.log(`[co-reader] Processing ${total} paragraphs in ${chunks.length} chunks of ~${CHUNK_SIZE}`)

  // Initialize cross-ref graph
  const graph: CrossReferenceGraph = {
    url: window.location.href,
    thesis: '',
    paragraphRoles: new Map(),
    edges: [],
    keyTerms: [],
    sections: [],
  }

  let processed = 0

  for (let i = 0; i < chunks.length; i++) {
    if (aborted) return

    const chunk = chunks[i]
    statusMessage = `Chunk ${i + 1}/${chunks.length} — ${processed}/${total} paragraphs done`

    try {
      const result = await sendViaPort('FULL_PAGE_ANALYSIS', {
        title,
        documentType: docType,
        paragraphs: chunk,
      }) as { ok?: boolean; data?: FullPageAnalysisResponse; error?: string } | undefined

      if (aborted) return

      if (!result?.ok || !result.data) {
        console.warn(`[co-reader] Chunk ${i + 1} failed:`, result?.error)
        statusMessage = `Chunk ${i + 1} failed: ${result?.error?.slice(0, 60) ?? 'unknown'}`
        // Continue to next chunk instead of aborting
        processed += chunk.length
        continue
      }

      const analysis = result.data

      // Merge thesis/terms from first chunk
      if (i === 0) {
        graph.thesis = analysis.thesis ?? ''
        graph.keyTerms = analysis.keyTerms ?? []
        graph.sections = analysis.sections ?? []
      }

      // Process paragraph results
      for (const para of analysis.paragraphs ?? []) {
        paragraphSummaries.set(para.id, {
          role: para.role ?? 'UNKNOWN',
          summary: para.summary ?? '',
          confidence: 0.8,
        })
        paragraphDeepDives.set(para.id, {
          role: para.role ?? 'UNKNOWN',
          summary: para.summary ?? '',
          highlights: Array.isArray(para.highlights) ? para.highlights : [],
          crossReferences: Array.isArray(para.crossReferences) ? para.crossReferences : [],
          argumentativeRole: '',
        })
        const meta = paragraphRegistry.get(para.id)
        if (meta) meta.role = para.role
        graph.paragraphRoles.set(para.id, para.role)

        if (Array.isArray(para.crossReferences)) {
          for (const ref of para.crossReferences) {
            graph.edges.push({
              sourceId: para.id,
              targetId: ref.targetParagraphId,
              relationship: ref.relationship,
              description: ref.description,
            })
          }
        }
      }

      setCrossRefGraph(graph)
      processed += chunk.length

      console.log(`[co-reader] Chunk ${i + 1}/${chunks.length} done — ${paragraphSummaries.size} summaries so far`)

      // Notify side panel that partial results are available
      chrome.runtime.sendMessage({ type: 'ANALYSIS_PROGRESS' }).catch(() => {})

    } catch (err) {
      console.error(`[co-reader] Chunk ${i + 1} error:`, err)
      processed += chunk.length
      // Continue to next chunk
    }
  }

  if (aborted) return

  const hlCount = Array.from(paragraphDeepDives.values()).reduce((n, d) => n + d.highlights.length, 0)
  state = 'done'
  statusMessage = `${paragraphSummaries.size} summaries, ${hlCount} highlights, ${graph.edges.length} links`
  console.log('[co-reader] Pipeline complete:', statusMessage)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectDocumentType(): DocumentType {
  const h = window.location.hostname
  if (window.location.href.endsWith('.pdf') || document.contentType === 'application/pdf') return 'pdf'
  if (h.includes('arxiv') || h.includes('scholar')) return 'academic'
  if (h.includes('wikipedia')) return 'wikipedia'
  return 'article'
}

export function getCachedSummary(id: string): MicroSummaryResponse | undefined {
  return paragraphSummaries.get(id)
}

export function getCachedDeepDive(id: string): DeepDiveResponse | undefined {
  return paragraphDeepDives.get(id)
}

function sendViaPort(type: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'long-running' })
    port.onMessage.addListener((msg) => {
      resolve(msg)
      port.disconnect()
    })
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
    })
    port.postMessage({ type, payload })
  })
}
