/**
 * LLM client — routes to the configured provider and compression technique.
 */
import {
  MICRO_SUMMARY_SYSTEM,
  buildMicroSummaryPrompt,
} from '@/utils/prompts'
import { parseJsonResponse } from '@/utils/text-utils'
import { COMPRESSION_CONFIGS } from '@/utils/compression-prompts'
import type {
  MicroSummaryResponse,
  MicroSummaryRequest,
  FullPageAnalysisRequest,
  FullPageAnalysisResponse,
  CompressionTechnique,
} from '@/utils/types'
import { getSettings } from './settings'
import { createProvider } from './providers'
import type { LLMProvider } from './providers'

// ── Cached provider (avoids re-reading settings on every parallel chunk) ────

let _cachedProvider: LLMProvider | null = null
let _cachedLimits: { contextTokens: number; maxOutputTokens: number } | null = null
let _cacheExpiry = 0

async function getCachedProviderAndLimits() {
  const now = Date.now()
  if (_cachedProvider && _cachedLimits && now < _cacheExpiry) {
    return { provider: _cachedProvider, limits: _cachedLimits }
  }
  const settings = await getSettings()
  if (settings.provider !== 'chrome-nano' && settings.provider !== 'in-browser' && !settings.apiKey) {
    throw new Error('No API key configured. Open Settings to add one.')
  }
  const { getModelLimits } = await import('./providers/types')
  _cachedProvider = createProvider(settings.provider, settings.apiKey, settings.model)
  _cachedLimits = getModelLimits(settings.provider, settings.model)
  _cacheExpiry = now + 30_000 // 30s TTL — covers a full analysis batch
  return { provider: _cachedProvider, limits: _cachedLimits }
}

async function getProvider(): Promise<LLMProvider> {
  const { provider } = await getCachedProviderAndLimits()
  return provider
}

export async function testProvider(): Promise<{ ok: boolean; error?: string }> {
  try {
    const provider = await getProvider()
    return provider.test()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function fetchMicroSummary(req: MicroSummaryRequest): Promise<MicroSummaryResponse> {
  const provider = await getProvider()
  const text = await provider.call(MICRO_SUMMARY_SYSTEM, buildMicroSummaryPrompt(req), 256)
  const parsed = parseJsonResponse<MicroSummaryResponse>(text)
  if (!parsed) throw new Error('Failed to parse response')
  return {
    role: parsed.role ?? 'UNKNOWN',
    summary: parsed.summary ?? '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  }
}

export async function fetchFullPageAnalysis(
  req: FullPageAnalysisRequest & { compressionTechnique?: CompressionTechnique }
): Promise<FullPageAnalysisResponse> {
  const technique = req.compressionTechnique ?? 'abstractive'
  const config = COMPRESSION_CONFIGS[technique]

  const { provider, limits } = await getCachedProviderAndLimits()
  const text = await provider.call(config.systemPrompt, config.buildUserPrompt(req), limits.maxOutputTokens)
  console.log(`[co-reader] LLM response (${technique}):`, text.length, 'chars')

  return parseAnalysisResponse(text, req.paragraphs.length)
}

/** Pass-2 call for hierarchical and chain-of-density */
export async function fetchRefinementPass(
  technique: CompressionTechnique,
  prevResults: string,
  req: FullPageAnalysisRequest
): Promise<FullPageAnalysisResponse> {
  const config = COMPRESSION_CONFIGS[technique]
  if (!config.pass2SystemPrompt || !config.buildPass2Prompt) {
    throw new Error(`Technique ${technique} does not support multi-pass`)
  }

  const { provider, limits } = await getCachedProviderAndLimits()
  const text = await provider.call(
    config.pass2SystemPrompt,
    config.buildPass2Prompt(prevResults, req),
    limits.maxOutputTokens
  )
  console.log(`[co-reader] Refinement pass (${technique}):`, text.length, 'chars')

  return parseAnalysisResponse(text, req.paragraphs.length)
}

function parseAnalysisResponse(text: string, inputCount: number): FullPageAnalysisResponse {
  const parsed = parseJsonResponse<any>(text)
  if (!parsed) {
    console.error('[co-reader] PARSE FAILED. Length:', text.length, 'Last 100:', text.slice(-100))
    console.error('[co-reader] First 500:', text.slice(0, 500))
    // If the text is long enough, the model likely ran out of tokens.
    // Return what we can — an empty result is better than crashing.
    return { thesis: '', sections: [], keyTerms: [] }
  }

  let sections: FullPageAnalysisResponse['sections'] = []
  if (Array.isArray(parsed.sections) && parsed.sections[0]?.paragraphs) {
    sections = parsed.sections.map((s: any) => ({
      title: s.title ?? '',
      sectionSummary: s.sectionSummary ?? '',
      paragraphs: Array.isArray(s.paragraphs) ? s.paragraphs : [],
    }))
  } else if (Array.isArray(parsed.paragraphs)) {
    sections = [{ title: '', sectionSummary: '', paragraphs: parsed.paragraphs }]
  }

  const totalParas = sections.reduce((n, s) => n + s.paragraphs.length, 0)
  console.log(`[co-reader] Parsed: ${sections.length} sections, ${totalParas} paragraphs (of ${inputCount} sent)`)

  return {
    thesis: parsed.thesis ?? '',
    sections,
    keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
  }
}
