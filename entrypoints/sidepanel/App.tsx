import { useState, useEffect, useRef } from 'preact/hooks'
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_LABELS,
  ROLE_COLORS,
} from '@/utils/constants'
import type {
  CrossReference,
  Settings,
  ProviderID,
  CompressionTechnique,
} from '@/utils/types'
import { DEFAULT_SETTINGS } from '@/utils/types'
import { PROVIDER_CONFIGS } from '@/entrypoints/background/providers/types'
import { COMPRESSION_CONFIGS } from '@/utils/compression-prompts'
import { isMissingApiKey } from '@/utils/api-key-check'
import { ControlBar } from './ControlBar'
import { SettingsPanel } from './SettingsPanel'
import { ReadingGuide } from './ReadingGuide'
import type { AnalysisData, ParagraphData, Status } from './types'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/** Find a paragraph by ID across all sections */
function findParagraph(data: AnalysisData | null, id: string): ParagraphData | undefined {
  if (!data) return undefined
  // Check allParagraphs first (flat list)
  if (data.allParagraphs) {
    const found = data.allParagraphs.find(p => p.id === id)
    if (found) return found
  }
  // Fall back to searching sections
  for (const sec of data.sections) {
    const found = sec.paragraphs.find(p => p.id === id)
    if (found) return found
  }
  return undefined
}

async function sendToTab(msg: any): Promise<any> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return null
  try { return await chrome.tabs.sendMessage(tab.id, msg) } catch { return null }
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [status, setStatus] = useState<Status>({ state: 'idle', message: '', paragraphsFound: 0, paragraphsAnalyzed: 0 })
  const [data, setData] = useState<AnalysisData | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeParaId, _setActiveParaId] = useState<string | null>(null)
  const activeParaIdRef = useRef<string | null>(null)
  const [backendInfo, setBackendInfo] = useState('')
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null)
  const [missingApiKey, setMissingApiKey] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const paraRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const dataRef = useRef<AnalysisData | null>(null)

  // Keep ref and state in sync
  function setActiveParaId(id: string | null) {
    activeParaIdRef.current = id
    _setActiveParaId(id)
  }

  useEffect(() => {
    pollStatus()
    loadBackendInfo()
    pollRef.current = setInterval(pollStatus, 1200)

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'ANALYSIS_DONE' || msg?.type === 'ANALYSIS_PROGRESS') {
        pollStatus()
        fetchData()
      }
      // Model download progress from offscreen document
      if (msg?.type === 'MODEL_DOWNLOAD_PROGRESS') {
        setDownloadMsg(msg.percent === -1 ? null : msg.message)
      }
      // User clicked a paragraph on the page → sync panel + highlight
      if (msg?.type === 'PARA_CLICKED' && msg.paragraphId) {
        const paraId = msg.paragraphId
        setActiveParaId(paraId)
        const el = paraRefs.current[paraId]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        const para = findParagraph(dataRef.current, paraId)
        if (para) {
          sendToTab({ type: 'SELECT_PARA', paragraphId: paraId, highlights: para.highlights })
        }
      }
    })

    // Detect tab changes or navigation — reset the panel
    chrome.tabs.onActivated.addListener(() => reset())
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') reset()
    })

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function reset() {
    setData(null)
    setExpandedId(null)
    setActiveParaId(null)
    setStatus({ state: 'idle', message: '', paragraphsFound: 0, paragraphsAnalyzed: 0 })
    // Give the new page a moment to load, then poll
    setTimeout(pollStatus, 500)
  }

  // Scroll sync: poll which paragraph is currently visible in the article
  useEffect(() => {
    if (!data) return
    const syncInterval = setInterval(async () => {
      const result = await sendToTab({ type: 'GET_VISIBLE_PARA' })
      if (result?.id && result.id !== activeParaIdRef.current) {
        setActiveParaId(result.id)
        const el = paraRefs.current[result.id]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 800)
    return () => clearInterval(syncInterval)
  }, [data])

  async function loadBackendInfo() {
    try {
      const s = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      if (s) {
        const config = PROVIDER_CONFIGS[s.provider as ProviderID]
        setBackendInfo(`${config?.name ?? s.provider} · ${s.model}`)
        setMissingApiKey(isMissingApiKey(s.provider, s.apiKey ?? ''))
      }
    } catch {}
  }

  async function pollStatus() {
    const s = await sendToTab({ type: 'GET_STATUS' })
    if (s) {
      setStatus(s)
      if (s.state === 'done' || (s.state === 'running' && s.paragraphsAnalyzed > 0)) fetchData()
    }
  }

  async function fetchData() {
    const result = await sendToTab({ type: 'GET_ANALYSIS' })
    if (result?.data) { setData(result.data); dataRef.current = result.data }
  }

  async function handleStart() {
    setData(null)
    await sendToTab({ type: 'START_ANALYSIS' })
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(pollStatus, 800)
  }

  async function handleStop() {
    await sendToTab({ type: 'STOP_ANALYSIS' })
    pollStatus()
  }

  function selectParagraph(paraId: string) {
    const para = findParagraph(data, paraId)
    sendToTab({
      type: 'SELECT_PARA',
      paragraphId: paraId,
      highlights: para?.highlights ?? [],
    })
    setActiveParaId(paraId)
  }

  return (
    <div class="panel">
      <header class="panel-header">
        <span class="panel-logo">co-reader</span>
        <button
          class={`settings-btn${showSettings ? ' settings-btn--active' : ''}`}
          onClick={() => { const closing = showSettings; setShowSettings(!showSettings); if (closing) loadBackendInfo() }}
        >{showSettings ? '✕' : '⚙'}</button>
      </header>

      {showSettings ? <SettingsPanel /> : (
        <>
          {downloadMsg && (
            <div class="download-banner">{downloadMsg}</div>
          )}
          <ControlBar status={status} onStart={handleStart} onStop={handleStop} missingApiKey={missingApiKey} />

          {data && (
            <ReadingGuide
              data={data}
              activeParaId={activeParaId}
              selectParagraph={selectParagraph}
              paraRefs={paraRefs}
            />
          )}

          {!data && status.state !== 'running' && (
            <div class="panel-empty">
              <p class="panel-empty-title">
                {status.paragraphsFound > 0
                  ? `${status.paragraphsFound} paragraphs detected`
                  : 'Navigate to an article'}
              </p>
              <p class="panel-empty-desc">
                {status.paragraphsFound > 0
                  ? 'Click "Start" to analyze.'
                  : 'Open an article, then click "Start".'}
              </p>
            </div>
          )}
        </>
      )}

      <footer class="panel-footer">
        {backendInfo && <span>{backendInfo}</span>}
        <a href="https://github.com/msanvido/co-reader" target="_blank" rel="noopener noreferrer" class="gh-link" title="View on GitHub">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        </a>
      </footer>
    </div>
  )
}

