import { useEffect, useState } from 'preact/hooks'
import { COMPRESSION_CONFIGS } from '@/utils/compression-prompts'
import type {
  FullPageAnalysisResponse,
  CompressionTechnique,
} from '@/utils/types'

export function isPdfUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return u.pathname.toLowerCase().endsWith('.pdf')
  } catch {
    return false
  }
}

/**
 * Detects whether the active tab is a remote PDF and exposes its URL.
 * Re-detects on tab activation / URL changes.
 */
export function usePdfMode() {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    detect()
    const onActivated = () => detect()
    const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.url || change.status === 'complete') detect()
    }
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }

    async function detect() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        setUrl(isPdfUrl(tab?.url) ? tab!.url! : null)
      } catch {
        setUrl(null)
      }
    }
  }, [])

  return { pdfMode: url !== null, pdfUrl: url }
}

export interface PdfAnalysisResult {
  ok: boolean
  data?: FullPageAnalysisResponse
  paragraphs: Array<{ id: string; section: string; text: string }>
  title: string
  error?: string
}

/**
 * Single-chunk PDF pipeline: fetch → parse → 1-3 LLM passes (driven by technique)
 * → return analysis. Uses the long-running port so we don't get killed by the
 * service worker timeout.
 */
export async function runPdfAnalysis(
  url: string,
  technique: CompressionTechnique,
  onStatus: (msg: string) => void,
): Promise<PdfAnalysisResult> {
  let parsed
  try {
    const { fetchAndParsePdf } = await import('./pdf-loader')
    parsed = await fetchAndParsePdf(url, onStatus)
  } catch (e: any) {
    return { ok: false, paragraphs: [], title: '', error: `Failed to load PDF: ${e?.message ?? e}` }
  }

  const paragraphs = parsed.paragraphs.map((p, i) => ({
    id: `pdf-para-${i + 1}`,
    section: p.section,
    text: p.text,
  }))
  if (paragraphs.length < 2) {
    return { ok: false, paragraphs, title: parsed.title, error: 'Could not extract enough text from this PDF' }
  }

  const config = COMPRESSION_CONFIGS[technique]
  const req = { title: parsed.title, documentType: 'pdf' as const, paragraphs }

  onStatus(`Analyzing ${paragraphs.length} paragraphs (${config.label})…`)
  const pass1 = await callPort('FULL_PAGE_ANALYSIS', { ...req, compressionTechnique: technique })
  if (!pass1?.ok || !pass1.data) {
    return { ok: false, paragraphs, title: parsed.title, error: pass1?.error ?? 'Analysis failed' }
  }

  if (technique === 'hierarchical') {
    onStatus('Refining across sections…')
    const pass2 = await callPort('REFINEMENT_PASS', {
      technique, prevResults: JSON.stringify(pass1.data), req,
    })
    if (pass2?.ok && pass2.data) return { ok: true, data: pass2.data, paragraphs, title: parsed.title }
    return { ok: true, data: pass1.data, paragraphs, title: parsed.title }
  }

  if (technique === 'chain-of-density') {
    onStatus('Densifying summaries (round 2/3)…')
    const iter2 = await callPort('REFINEMENT_PASS', {
      technique, prevResults: JSON.stringify(pass1.data), req,
    })
    const after2 = iter2?.ok && iter2.data ? iter2.data : pass1.data
    onStatus('Densifying summaries (round 3/3)…')
    const iter3 = await callPort('REFINEMENT_PASS', {
      technique, prevResults: JSON.stringify(after2), req,
    })
    const final = iter3?.ok && iter3.data ? iter3.data : after2
    return { ok: true, data: final, paragraphs, title: parsed.title }
  }

  return { ok: true, data: pass1.data, paragraphs, title: parsed.title }
}

interface PortResponse {
  ok?: boolean
  data?: FullPageAnalysisResponse
  error?: string
}

function callPort(type: string, payload: unknown): Promise<PortResponse> {
  return new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: 'long-running' })
    let settled = false
    port.onMessage.addListener((msg) => {
      settled = true
      resolve(msg as PortResponse)
      try { port.disconnect() } catch {}
    })
    port.onDisconnect.addListener(() => {
      if (settled) return
      const err = chrome.runtime.lastError
      resolve({ ok: false, error: err?.message ?? 'port disconnected' })
    })
    port.postMessage({ type, payload })
  })
}
