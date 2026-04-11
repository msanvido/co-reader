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
const MIN_CHUNK_SIZE = 4
const MAX_CHUNK_SIZE = 60 // cap to keep output quality high
const DEFAULT_CHUNK_SIZE = 6 // fallback for local/small models

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

  // Get technique, provider, and model limits from settings
  let technique: CompressionTechnique = 'abstractive'
  let providerId = 'anthropic'
  let modelLimits = { contextTokens: 128_000, maxOutputTokens: 8_192 }
  try {
    const [settings, limits] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
      chrome.runtime.sendMessage({ type: 'GET_MODEL_LIMITS' }),
    ])
    if (settings?.compressionTechnique) technique = settings.compressionTechnique
    if (settings?.provider) providerId = settings.provider
    if (limits?.contextTokens) modelLimits = limits
  } catch {}

  const config = COMPRESSION_CONFIGS[technique]
  const isLocal = providerId === 'chrome-nano' || providerId === 'in-browser'
  const concurrency = isLocal ? 1 : 6
  const chunkSize = isLocal ? DEFAULT_CHUNK_SIZE : computeChunkSize(modelLimits)

  console.log(`[co-reader] Starting analysis: ${technique} (${config.passes} pass), chunks of ${chunkSize}, concurrency=${concurrency}`)

  await runChunkedAnalysis(technique, concurrency, chunkSize)
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

// ─── Chunk size calculation ───────────────────────────────────────────────────

/**
 * Compute how many paragraphs to send per LLM call based on model limits.
 * ~250 tokens per paragraph input, ~300 tokens per paragraph output, ~1500 tokens for system prompt + JSON schema.
 */
function computeChunkSize(limits: { contextTokens: number; maxOutputTokens: number }): number {
  const inputBudget = limits.contextTokens - limits.maxOutputTokens - 1500
  const maxByInput = Math.floor(inputBudget / 250)
  const maxByOutput = Math.floor(limits.maxOutputTokens / 300)
  return Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, maxByInput, maxByOutput))
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function runChunkedAnalysis(technique: CompressionTechnique, concurrency: number, chunkSize: number): Promise<void> {
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
  for (let i = 0; i < paragraphs.length; i += chunkSize) chunks.push(paragraphs.slice(i, i + chunkSize))

  const graph: CrossReferenceGraph = {
    url: window.location.href, thesis: '', paragraphRoles: new Map(),
    edges: [], keyTerms: [], sections: [],
  }

  const config = COMPRESSION_CONFIGS[technique]
  const passLabel = config.passes > 1 ? 'Pass 1: ' : ''

  // ── Pass 1: Process chunks in parallel ─────────────────────────────────

  function updateStatus() {
    const done = paragraphSummaries.size
    statusMessage = `${passLabel}Analyzing ${done}/${total} paragraphs...`
    chrome.runtime.sendMessage({ type: 'ANALYSIS_PROGRESS' }).catch(() => {})
  }

  const t0 = Date.now()

  if (technique === 'chain-of-density') {
    await pMap(chunks, async (chunk, i) => {
      if (aborted) return
      console.log(`[co-reader] Chunk ${i + 1}/${chunks.length} START +${Date.now() - t0}ms`)
      const iter1 = await callAnalysis(chunk, title, docType, technique)
      if (!iter1 || aborted) return

      const iter2 = await callRefinement(technique, JSON.stringify(iter1), chunk, title, docType)
      if (aborted) return

      const iter3 = await callRefinement(technique, JSON.stringify(iter2 ?? iter1), chunk, title, docType)
      const final = iter3 ?? iter2 ?? iter1
      preserveHighlightsFromFirstPass(final, iter1)
      mergeResults(final, graph, i === 0)
      updateStatus()
      console.log(`[co-reader] Chunk ${i + 1}/${chunks.length} DONE +${Date.now() - t0}ms (3 rounds)`)
    }, concurrency)
  } else {
    await pMap(chunks, async (chunk, i) => {
      if (aborted) return
      console.log(`[co-reader] Chunk ${i + 1}/${chunks.length} START +${Date.now() - t0}ms`)
      updateStatus()
      const result = await callAnalysis(chunk, title, docType, technique)
      if (result) mergeResults(result, graph, i === 0)
      updateStatus()
      console.log(`[co-reader] Chunk ${i + 1}/${chunks.length} DONE +${Date.now() - t0}ms — ${paragraphSummaries.size} summaries`)
    }, concurrency)
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
      if (refined.thesis) graph.thesis = refined.thesis
      for (const sec of refined.sections ?? []) {
        if (sec.title && sec.sectionSummary) sectionSummaryMap.set(sec.title, sec.sectionSummary)
      }
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

// ─── Concurrency-limited parallel map ────────────────────────────────────────

async function pMap<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
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
