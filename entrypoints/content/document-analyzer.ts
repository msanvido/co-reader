/**
 * Document processing pipeline with selectable compression techniques.
 * Single-pass (abstractive, extractive, bullet-points) or multi-pass (hierarchical, chain-of-density).
 */
import type {
  FullPageAnalysisResponse,
  MicroSummaryResponse,
  DeepDiveResponse,
  CrossReferenceGraph,
  DocumentType,
  CompressionTechnique,
} from '@/utils/types'
import { COMPRESSION_CONFIGS } from '@/utils/compression-prompts'
import {
  getAllParagraphsForAnalysis,
  paragraphRegistry,
} from './paragraph-detector'
import { setCrossRefGraph } from './cross-ref-navigator'

const MAX_CHARS_PER_PARA = 1500
const CHUNK_SIZE = 6

// ─── State ────────────────────────────────────────────────────────────────────

export const paragraphSummaries = new Map<string, MicroSummaryResponse>()
export const paragraphDeepDives = new Map<string, DeepDiveResponse>()
export const sectionSummaryMap = new Map<string, string>()

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

export async function startAnalysis(): Promise<void> {
  if (state === 'running') return
  aborted = false
  state = 'running'
  statusMessage = 'Preparing...'
  paragraphSummaries.clear()
  paragraphDeepDives.clear()
  sectionSummaryMap.clear()

  // Get technique from settings
  let technique: CompressionTechnique = 'abstractive'
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
    if (settings?.compressionTechnique) technique = settings.compressionTechnique
  } catch {}

  const config = COMPRESSION_CONFIGS[technique]
  console.log(`[co-reader] Starting analysis with technique: ${technique} (${config.passes} pass${config.passes > 1 ? 'es' : ''})`)

  await runChunkedAnalysis(technique)
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

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function runChunkedAnalysis(technique: CompressionTechnique): Promise<void> {
  let paragraphs = getAllParagraphsForAnalysis()
  if (paragraphs.length < 2) { state = 'error'; statusMessage = 'Too few paragraphs'; return }

  paragraphs = paragraphs.map(p => ({
    ...p,
    text: p.text.length > MAX_CHARS_PER_PARA ? p.text.slice(0, MAX_CHARS_PER_PARA) + '…' : p.text,
  }))

  const total = paragraphs.length
  const docType = detectDocumentType()
  const title = document.title || window.location.hostname

  const chunks: typeof paragraphs[] = []
  for (let i = 0; i < paragraphs.length; i += CHUNK_SIZE) chunks.push(paragraphs.slice(i, i + CHUNK_SIZE))

  const graph: CrossReferenceGraph = {
    url: window.location.href, thesis: '', paragraphRoles: new Map(),
    edges: [], keyTerms: [], sections: [],
  }

  const config = COMPRESSION_CONFIGS[technique]
  let processed = 0

  // ── Pass 1: Process chunks ──────────────────────────────────────────────

  const passLabel = config.passes > 1 ? 'Pass 1: ' : ''

  for (let i = 0; i < chunks.length; i++) {
    if (aborted) return
    const chunk = chunks[i]

    if (technique === 'chain-of-density') {
      statusMessage = `${passLabel}Densifying ${processed}/${total} — round 1/3`
      const iter1 = await callAnalysis(chunk, title, docType, technique)
      if (!iter1) { processed += chunk.length; continue }

      if (aborted) return
      statusMessage = `${passLabel}Densifying ${processed}/${total} — round 2/3`
      const iter2 = await callRefinement(technique, JSON.stringify(iter1), chunk, title, docType)

      if (aborted) return
      statusMessage = `${passLabel}Densifying ${processed}/${total} — round 3/3`
      const iter3 = await callRefinement(technique, JSON.stringify(iter2 ?? iter1), chunk, title, docType)

      // Use densified summaries from latest iteration, but preserve
      // highlights/crossRefs from iter1 if later iterations dropped them
      const final = iter3 ?? iter2 ?? iter1
      preserveHighlightsFromFirstPass(final, iter1)
      mergeResults(final, graph, i === 0)
    } else {
      statusMessage = `${passLabel}Analyzing ${processed}/${total} paragraphs...`
      const result = await callAnalysis(chunk, title, docType, technique)
      if (result) mergeResults(result, graph, i === 0)
    }

    processed += chunk.length
    console.log(`[co-reader] ${passLabel}Chunk ${i + 1}/${chunks.length} done — ${paragraphSummaries.size} summaries`)
    chrome.runtime.sendMessage({ type: 'ANALYSIS_PROGRESS' }).catch(() => {})
  }

  // ── Pass 2: Hierarchical refinement ─────────────────────────────────────

  if (technique === 'hierarchical' && !aborted) {
    statusMessage = 'Pass 2: Refining across sections...'
    chrome.runtime.sendMessage({ type: 'ANALYSIS_PROGRESS' }).catch(() => {})

    const allResults = {
      thesis: graph.thesis,
      sections: Array.from(sectionSummaryMap.entries()).map(([title, summary]) => ({ title, sectionSummary: summary })),
      paragraphs: Array.from(paragraphSummaries.entries()).map(([id, s]) => ({ id, summary: s.summary })),
    }

    const refined = await callRefinement(technique, JSON.stringify(allResults), paragraphs, document.title, docType)
    if (refined) {
      // Merge refined thesis and section summaries
      if (refined.thesis) graph.thesis = refined.thesis
      for (const sec of refined.sections ?? []) {
        if (sec.title && sec.sectionSummary) sectionSummaryMap.set(sec.title, sec.sectionSummary)
      }
      // Merge any new cross-references
      for (const sec of refined.sections ?? []) {
        for (const para of sec.paragraphs ?? []) {
          if (Array.isArray(para.crossReferences)) {
            for (const ref of para.crossReferences) {
              graph.edges.push({
                sourceId: para.id, targetId: ref.targetParagraphId,
                relationship: ref.relationship, description: ref.description,
              })
            }
          }
        }
      }
    }
  }

  if (aborted) return

  setCrossRefGraph(graph)
  const hlCount = Array.from(paragraphDeepDives.values()).reduce((n, d) => n + d.highlights.length, 0)
  state = 'done'
  statusMessage = `${paragraphSummaries.size} summaries, ${hlCount} highlights, ${graph.edges.length} links`
  console.log('[co-reader] Pipeline complete:', statusMessage)
}

// ─── LLM call helpers ─────────────────────────────────────────────────────────

const MAX_RATE_LIMIT_RETRIES = 5

async function callAnalysis(
  chunk: Array<{ id: string; section: string; text: string }>,
  title: string, docType: DocumentType, technique: CompressionTechnique
): Promise<FullPageAnalysisResponse | null> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    if (aborted) return null
    try {
      const result = await sendViaPort('FULL_PAGE_ANALYSIS', {
        title, documentType: docType, paragraphs: chunk, compressionTechnique: technique,
      }) as { ok?: boolean; data?: FullPageAnalysisResponse; error?: string } | undefined
      if (result?.ok && result.data) return result.data
      const err = result?.error ?? ''
      if (isRateLimitError(err) && attempt < MAX_RATE_LIMIT_RETRIES) {
        await handleRateLimit(attempt)
        continue // retry same chunk
      }
      console.warn('[co-reader] Chunk failed:', err)
      return null
    } catch (err) {
      console.error('[co-reader] Chunk error:', err)
      return null
    }
  }
  return null
}

async function callRefinement(
  technique: CompressionTechnique, prevResults: string,
  paragraphs: Array<{ id: string; section: string; text: string }>,
  title: string, docType: DocumentType
): Promise<FullPageAnalysisResponse | null> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    if (aborted) return null
    try {
      const result = await sendViaPort('REFINEMENT_PASS', {
        technique, prevResults,
        req: { title, documentType: docType, paragraphs },
      }) as { ok?: boolean; data?: FullPageAnalysisResponse; error?: string } | undefined
      if (result?.ok && result.data) return result.data
      const err = result?.error ?? ''
      if (isRateLimitError(err) && attempt < MAX_RATE_LIMIT_RETRIES) {
        await handleRateLimit(attempt)
        continue
      }
      console.warn('[co-reader] Refinement failed:', err)
      return null
    } catch (err) {
      console.error('[co-reader] Refinement error:', err)
      return null
    }
  }
  return null
}

function isRateLimitError(err: string): boolean {
  const lower = err.toLowerCase()
  return lower.includes('rate') || lower.includes('429') || lower.includes('quota') || lower.includes('overloaded') || lower.includes('529')
}

async function handleRateLimit(attempt: number): Promise<void> {
  const done = paragraphSummaries.size
  const total = paragraphRegistry.size
  // Exponential backoff: 15s, 30s, 45s, 60s, 60s
  const waitSeconds = Math.min(60, 15 * (attempt + 1))
  for (let wait = waitSeconds; wait > 0; wait--) {
    statusMessage = `Rate limited (${done}/${total}) — retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES} in ${wait}s...`
    chrome.runtime.sendMessage({ type: 'ANALYSIS_PROGRESS' }).catch(() => {})
    await new Promise(r => setTimeout(r, 1000))
    if (aborted) return
  }
}

/** For chain-of-density: if later iterations dropped highlights/crossRefs, restore from iter1 */
function preserveHighlightsFromFirstPass(
  final: FullPageAnalysisResponse,
  iter1: FullPageAnalysisResponse
): void {
  // Build a lookup from iter1
  const iter1Paras = new Map<string, { highlights: any[]; crossReferences: any[] }>()
  for (const sec of iter1.sections ?? []) {
    for (const p of sec.paragraphs ?? []) {
      if (p.id) iter1Paras.set(p.id, { highlights: p.highlights ?? [], crossReferences: p.crossReferences ?? [] })
    }
  }
  // Fill in missing highlights/crossRefs in final
  for (const sec of final.sections ?? []) {
    for (const p of sec.paragraphs ?? []) {
      const orig = iter1Paras.get(p.id)
      if (!orig) continue
      if (!p.highlights || p.highlights.length === 0) p.highlights = orig.highlights
      if (!p.crossReferences || p.crossReferences.length === 0) p.crossReferences = orig.crossReferences
    }
  }
}

// ─── Merge results into state ─────────────────────────────────────────────────

function mergeResults(analysis: FullPageAnalysisResponse, graph: CrossReferenceGraph, isFirst: boolean): void {
  if (isFirst) {
    graph.thesis = analysis.thesis ?? ''
    graph.keyTerms = analysis.keyTerms ?? []
  }

  for (const sec of analysis.sections ?? []) {
    if (sec.title && sec.sectionSummary) sectionSummaryMap.set(sec.title, sec.sectionSummary)

    for (const para of sec.paragraphs ?? []) {
      if (!para.id || !para.summary) continue
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
      graph.paragraphRoles.set(para.id, para.role ?? 'UNKNOWN')

      if (Array.isArray(para.crossReferences)) {
        for (const ref of para.crossReferences) {
          graph.edges.push({
            sourceId: para.id, targetId: ref.targetParagraphId,
            relationship: ref.relationship, description: ref.description,
          })
        }
      }
    }
  }
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
    port.onMessage.addListener((msg) => { resolve(msg); port.disconnect() })
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
    })
    port.postMessage({ type, payload })
  })
}
