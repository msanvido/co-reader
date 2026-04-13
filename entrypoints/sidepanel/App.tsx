import { useState, useEffect, useRef } from 'preact/hooks'
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_ARROWS,
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

interface ParagraphData {
  id: string; role: string; summary: string; originalText: string
  highlights: Array<{ text: string; category: string; explanation: string }>
  crossReferences: CrossReference[]
}

interface SectionData {
  title: string
  summary: string
  paragraphs: ParagraphData[]
}

interface AnalysisData {
  thesis: string; keyTerms: string[]
  sections: SectionData[]
  allParagraphs: ParagraphData[]
}

export type AnalysisState = 'idle' | 'running' | 'done' | 'error'

export interface Status {
  state: AnalysisState; message: string
  paragraphsFound: number; paragraphsAnalyzed: number
}

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

function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      class={`copy-url${copied ? ' copy-url--copied' : ''}`}
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      title="Click to copy, then paste in address bar"
    >
      <span class="copy-url-text">{url}</span>
      <span class="copy-url-icon">{copied ? '✓' : '⧉'}</span>
    </button>
  )
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
            <div class="reading-guide">
              {data.thesis && (
                <div class="guide-thesis">{data.thesis}</div>
              )}

              {data.sections.map((section, si) => {
                const hasTitle = section.title && section.title !== document.title
                let paraCounter = 0
                // Calculate global paragraph index offset
                for (let k = 0; k < si; k++) paraCounter += data.sections[k].paragraphs.length

                return (
                  <div key={si} class="guide-section">
                    {/* Section header */}
                    {hasTitle && (
                      <div class="section-header">
                        <div class="section-title">{section.title}</div>
                        {section.summary && (
                          <div class="section-summary">{section.summary}</div>
                        )}
                      </div>
                    )}

                    {/* Paragraphs in this section */}
                    {section.paragraphs.map((para, pi) => {
                      const globalIdx = paraCounter + pi + 1
                      return (
                        <div
                          key={para.id}
                          ref={(el) => { paraRefs.current[para.id] = el }}
                          class={`guide-card${activeParaId === para.id ? ' guide-card--active' : ''}`}
                        >
                          <div class="guide-row" onClick={() => selectParagraph(para.id)}>
                            <span class="guide-num">{globalIdx}</span>
                            <span class="guide-summary">
                              {typeof para.summary === 'string' && (para.summary.includes('\n- ') || para.summary.startsWith('- '))
                                ? <ul class="bullet-summary">{para.summary.split('\n').filter(l => l.trim()).map((line, li) =>
                                    <li key={li}>{line.replace(/^-\s*/, '')}</li>
                                  )}</ul>
                                : String(para.summary ?? '')
                              }
                            </span>
                          </div>

                          {para.crossReferences.length > 0 && activeParaId === para.id && (
                            <div class="guide-tags">
                              {para.crossReferences.map((ref, j) => {
                                const idx = data.allParagraphs.findIndex(p => p.id === ref.targetParagraphId) + 1
                                const color = RELATIONSHIP_COLORS[ref.relationship] ?? '#9E9E9E'
                                const arrow = RELATIONSHIP_ARROWS[ref.relationship] ?? '→'
                                return (
                                  <button
                                    key={`x${j}`}
                                    class="tag tag--xref"
                                    style={`border-color:${color}`}
                                    title={`${RELATIONSHIP_LABELS[ref.relationship]}: ${ref.description}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (idx > 0) selectParagraph(ref.targetParagraphId)
                                    }}
                                  >
                                    {arrow} ¶{idx > 0 ? idx : '?'} {ref.description}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
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

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [statusMsg, setStatusMsg] = useState('Checking...')
  const [editingKey, setEditingKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const keyRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      const s = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      setSettings(s); setKeyDraft(s.apiKey)
      const config = PROVIDER_CONFIGS[s.provider as ProviderID]
      if (config.requiresKey && !s.apiKey) { setStatus('error'); setStatusMsg('No API key'); setEditingKey(true) }
      else { setStatus('ok'); setStatusMsg('Ready') }
    } catch { setStatus('error'); setStatusMsg('Service worker error') }
  }

  async function testConnection() {
    const config = PROVIDER_CONFIGS[settings.provider]
    if (config.requiresKey && !settings.apiKey) { setStatus('error'); setStatusMsg('No API key'); return }
    setStatus('checking'); setStatusMsg('Testing connection...')
    try {
      const r = await chrome.runtime.sendMessage({ type: 'TEST_API_KEY' })
      if (r?.ok) { setStatus('ok'); setStatusMsg(`Connected to ${config.name}`) }
      else { setStatus('error'); setStatusMsg(r?.error ?? 'Failed') }
    } catch { setStatus('error'); setStatusMsg('Service worker error') }
  }

  async function save(patch: Partial<Settings>) {
    const u = { ...settings, ...patch }; setSettings(u)
    await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload: u })
  }
  async function saveKey() { await save({ apiKey: keyDraft.trim() }); setEditingKey(false) }
  function changeProvider(id: ProviderID) {
    const c = PROVIDER_CONFIGS[id]
    save({ provider: id, model: c.defaultModel, apiKey: id === settings.provider ? settings.apiKey : '' })
    setKeyDraft(''); setEditingKey(c.requiresKey)
  }

  const config = PROVIDER_CONFIGS[settings.provider]
  const dotColor = status === 'ok' ? '#44CC44' : status === 'error' ? '#FF4444' : '#FFAA00'
  const masked = settings.apiKey ? settings.apiKey.slice(0, 8) + '••••' + settings.apiKey.slice(-4) : ''

  return (
    <div class="settings-panel">
      <div class={`status-bar status-bar--${status === 'ok' ? 'connected' : status}`}>
        <span class="status-dot" style={`background:${dotColor};box-shadow:0 0 6px ${dotColor}`} />
        <span class="status-msg">{statusMsg}</span>
        <button class="test-btn" onClick={testConnection} disabled={status === 'checking'}>
          {status === 'checking' ? 'Testing...' : 'Test'}
        </button>
      </div>
      <section class="popup-section">
        <label class="popup-label">Provider</label>
        <select class="provider-select" value={settings.provider} onChange={(e) => changeProvider((e.target as HTMLSelectElement).value as ProviderID)}>
          {Object.values(PROVIDER_CONFIGS).map(p => <option key={p.id} value={p.id}>{p.name}{p.requiresKey ? '' : ' (free)'}</option>)}
        </select>
      </section>
      <section class="popup-section">
        <label class="popup-label">Model</label>
        <select class="provider-select" value={settings.model} onChange={(e) => save({ model: (e.target as HTMLSelectElement).value })}>
          {config.models.map(m => <option key={m} value={m}>{m.endsWith(':free') ? '🆓 ' + m.replace(':free', '') : m}</option>)}
        </select>
      </section>
      <section class="popup-section">
        <label class="popup-label">Compression</label>
        <select class="provider-select" value={settings.compressionTechnique}
          onChange={(e) => save({ compressionTechnique: (e.target as HTMLSelectElement).value as CompressionTechnique })}>
          {Object.values(COMPRESSION_CONFIGS).map(c => (
            <option key={c.id} value={c.id}>
              {c.label}{c.costMultiplier > 1 ? ` (${c.costMultiplier}x calls)` : ''}
            </option>
          ))}
        </select>
        <div class="hint-text">{COMPRESSION_CONFIGS[settings.compressionTechnique]?.description}</div>
      </section>
      {config.requiresKey && (
        <section class="popup-section">
          <label class="popup-label">API Key <a href={config.helpUrl} target="_blank" rel="noopener noreferrer" class="hint-link" style="margin-left:6px">Get key →</a></label>
          {!editingKey && settings.apiKey ? (
            <div class="key-display">
              <code class="key-masked">{masked}</code>
              <button class="change-btn" onClick={() => { setEditingKey(true); setKeyDraft(settings.apiKey); setTimeout(() => keyRef.current?.focus(), 50) }}>Change</button>
            </div>
          ) : (
            <div class="key-edit">
              <input ref={keyRef} type={keyVisible ? 'text' : 'password'} class="api-key-input" value={keyDraft} placeholder={config.keyPlaceholder} autoFocus onInput={(e) => setKeyDraft((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && saveKey()} />
              <div class="key-actions">
                <button class="icon-btn" onClick={() => setKeyVisible(!keyVisible)}>{keyVisible ? '🙈' : '👁'}</button>
                <button class="save-btn" onClick={saveKey} disabled={!keyDraft.trim()}>Save</button>
                {settings.apiKey && <button class="cancel-btn" onClick={() => setEditingKey(false)}>Cancel</button>}
              </div>
            </div>
          )}
        </section>
      )}
      <section class="popup-section">
        <label class="toggle-row">
          <span>Enable</span>
          <button class={`toggle ${settings.enabled ? 'toggle--on' : ''}`} onClick={() => save({ enabled: !settings.enabled })}>
            {settings.enabled ? 'ON' : 'OFF'}
          </button>
        </label>
      </section>

      {settings.provider === 'in-browser' && (
        <div class="nano-help">
          <strong>In-Browser Gemma (transformers.js)</strong>
          <p>Runs entirely on-device via WebGPU — no API key, no data sent to any server.</p>
          <p>The model is <strong>downloaded once</strong> from HuggingFace on first use (~500 MB for E2B, ~1.5 GB for E4B) and cached by your browser. Subsequent runs load from cache instantly.</p>
          <p><strong>Requirements:</strong></p>
          <ul>
            <li>Chrome 113+ or Edge 113+ with WebGPU</li>
            <li>GPU with f16 shader support</li>
          </ul>
          <p>Note: Inference is slower than cloud APIs (10-30s per chunk). Best for moderate-length articles.</p>
        </div>
      )}

      {settings.provider === 'chrome-nano' && (
        <div class="nano-help">
          <strong>In-Browser Chrome Native (Gemini Nano)</strong>
          <p>Runs entirely on-device — no API key, no data sent to any server. Requires Chrome 131+ and manual setup:</p>
          <ol>
            <li>
              Copy and paste this into your address bar:
              <CopyUrl url="chrome://flags/#optimization-guide-on-device-model" />
              Set to <strong>Enabled BypassPerfRequirement</strong>
            </li>
            <li>
              Then paste this:
              <CopyUrl url="chrome://flags/#prompt-api-for-gemini-nano" />
              Set to <strong>Enabled</strong>
            </li>
            <li>Relaunch Chrome</li>
            <li>
              Paste this:
              <CopyUrl url="chrome://components" />
              Find <strong>Optimization Guide On Device Model</strong> and click "Check for update" (~1.7GB download)
            </li>
            <li>Wait for download, then restart Chrome</li>
          </ol>
          <p>Note: Output quality is lower than cloud models. Best for short articles.</p>
        </div>
      )}
    </div>
  )
}
