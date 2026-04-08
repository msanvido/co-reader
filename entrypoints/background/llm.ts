/**
 * LLM client — routes to the configured provider.
 */
import {
  FULL_PAGE_SYSTEM,
  MICRO_SUMMARY_SYSTEM,
  buildFullPagePrompt,
  buildMicroSummaryPrompt,
} from '@/utils/prompts'
import { parseJsonResponse } from '@/utils/text-utils'
import type {
  MicroSummaryResponse,
  MicroSummaryRequest,
  FullPageAnalysisRequest,
  FullPageAnalysisResponse,
} from '@/utils/types'
import { getSettings } from './settings'
import { createProvider } from './providers'
import type { LLMProvider } from './providers'

async function getProvider(): Promise<LLMProvider> {
  const settings = await getSettings()
  if (settings.provider !== 'chrome-nano' && !settings.apiKey) {
    throw new Error('No API key configured. Open Settings to add one.')
  }
  return createProvider(settings.provider, settings.apiKey, settings.model)
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

export async function fetchFullPageAnalysis(req: FullPageAnalysisRequest): Promise<FullPageAnalysisResponse> {
  const settings = await getSettings()
  const provider = createProvider(settings.provider, settings.apiKey, settings.model)
  const { getModelLimits } = await import('./providers/types')
  const limits = getModelLimits(settings.provider, settings.model)
  const text = await provider.call(FULL_PAGE_SYSTEM, buildFullPagePrompt(req), limits.maxOutputTokens)
  console.log('[co-reader] LLM raw response length:', text.length, 'chars (~', Math.round(text.length / 4), 'tokens)')
  const parsed = parseJsonResponse<FullPageAnalysisResponse>(text)
  if (!parsed) {
    console.error('[co-reader] PARSE FAILED. First 500:', text.slice(0, 500))
    throw new Error('Failed to parse response. Raw start: ' + text.slice(0, 150))
  }
  const returnedParas = parsed.paragraphs?.length ?? 0
  console.log(`[co-reader] Parsed OK: ${returnedParas} paragraphs returned (of ${req.paragraphs.length} sent)`)
  return {
    documentType: parsed.documentType ?? 'unknown',
    thesis: parsed.thesis ?? '',
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    paragraphs: Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [],
    keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
  }
}
