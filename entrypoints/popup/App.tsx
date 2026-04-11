import { useState, useEffect, useRef } from 'preact/hooks'
import { sendGetSettings, sendUpdateSettings } from '@/utils/message-bus'
import type { Settings, ProviderID } from '@/utils/types'
import { DEFAULT_SETTINGS } from '@/utils/types'
import { PROVIDER_CONFIGS } from '@/entrypoints/background/providers/types'

type ConnectionStatus = 'checking' | 'connected' | 'error' | 'no-key'

export function PopupApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [statusMsg, setStatusMsg] = useState('Checking...')
  const [newDomain, setNewDomain] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const keyRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadAndTest() }, [])

  async function loadAndTest() {
    try {
      const s = await sendGetSettings()
      setSettings(s)
      setKeyDraft(s.apiKey)

      const config = PROVIDER_CONFIGS[s.provider]
      if (config.requiresKey && !s.apiKey) {
        setStatus('no-key')
        setStatusMsg('No API key — add one below')
        setEditingKey(true)
        return
      }

      setStatus('checking')
      setStatusMsg('Verifying connection...')
      const r = await chrome.runtime.sendMessage({ type: 'TEST_API_KEY' })
      if (r?.ok) {
        setStatus('connected')
        setStatusMsg(`Connected to ${config.name}`)
      } else {
        setStatus('error')
        setStatusMsg(r?.error ?? 'Connection failed')
      }
    } catch {
      setStatus('error')
      setStatusMsg('Service worker not responding')
    }
  }

  async function save(patch: Partial<Settings>) {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    await sendUpdateSettings(updated)
  }

  async function saveKey() {
    await save({ apiKey: keyDraft.trim() })
    setEditingKey(false)
    loadAndTest()
  }

  function changeProvider(id: ProviderID) {
    const config = PROVIDER_CONFIGS[id]
    save({ provider: id, model: config.defaultModel, apiKey: id === settings.provider ? settings.apiKey : '' })
    setKeyDraft('')
    setEditingKey(config.requiresKey)
    if (config.requiresKey) {
      setStatus('no-key')
      setStatusMsg(`Switched to ${config.name}`)
    } else {
      // Keyless providers — run connection test immediately
      setStatus('checking')
      setStatusMsg(`Checking ${config.name}...`)
      setTimeout(loadAndTest, 100)
    }
  }

  function changeModel(model: string) {
    save({ model })
  }

  const config = PROVIDER_CONFIGS[settings.provider]
  const statusColor: Record<ConnectionStatus, string> = {
    checking: '#FFAA00', connected: '#44CC44', error: '#FF4444', 'no-key': '#FF4444',
  }

  const maskedKey = settings.apiKey
    ? settings.apiKey.slice(0, 8) + '••••' + settings.apiKey.slice(-4)
    : ''

  return (
    <div class="popup">
      {/* Header */}
      <header class="popup-header">
        <div class="header-left">
          <span
            class={`status-dot${status === 'checking' ? ' status-dot--pulse' : ''}`}
            style={`background:${statusColor[status]};box-shadow:0 0 6px ${statusColor[status]}`}
          />
          <span class="panel-logo">co-reader</span>
        </div>
      </header>

      <div class={`status-bar status-bar--${status}`}>
        <span class="status-msg">{statusMsg}</span>
      </div>

      {/* Provider selector */}
      <section class="popup-section">
        <label class="popup-label">LLM Provider</label>
        <select
          class="provider-select"
          value={settings.provider}
          onChange={(e) => changeProvider((e.target as HTMLSelectElement).value as ProviderID)}
        >
          {Object.values(PROVIDER_CONFIGS).map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.requiresKey ? '' : ' (no key)'}</option>
          ))}
        </select>
      </section>

      {/* Model selector */}
      <section class="popup-section">
        <label class="popup-label">Model</label>
        <select
          class="provider-select"
          value={settings.model}
          onChange={(e) => changeModel((e.target as HTMLSelectElement).value)}
        >
          {config.models.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </section>

      {/* API Key (if required) */}
      {config.requiresKey && (
        <section class="popup-section">
          <label class="popup-label">
            API Key
            {config.helpUrl && (
              <a href={config.helpUrl} target="_blank" rel="noopener noreferrer" class="hint-link" style="margin-left:6px">
                Get key →
              </a>
            )}
          </label>

          {!editingKey && settings.apiKey ? (
            <div class="key-display">
              <code class="key-masked">{maskedKey}</code>
              <button class="change-btn" onClick={() => { setEditingKey(true); setKeyDraft(settings.apiKey); setTimeout(() => keyRef.current?.focus(), 50) }}>
                Change
              </button>
            </div>
          ) : (
            <div class="key-edit">
              <input
                ref={keyRef}
                type={keyVisible ? 'text' : 'password'}
                class="api-key-input"
                value={keyDraft}
                placeholder={config.keyPlaceholder}
                autoFocus
                onInput={(e) => setKeyDraft((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              />
              <div class="key-actions">
                <button class="icon-btn" onClick={() => setKeyVisible(!keyVisible)}>
                  {keyVisible ? '🙈' : '👁'}
                </button>
                <button class="save-btn" onClick={saveKey} disabled={!keyDraft.trim()}>Save</button>
                {settings.apiKey && <button class="cancel-btn" onClick={() => setEditingKey(false)}>Cancel</button>}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Enable toggle */}
      <section class="popup-section">
        <label class="toggle-row">
          <span>Enable co-reader</span>
          <button
            class={`toggle ${settings.enabled ? 'toggle--on' : ''}`}
            onClick={() => save({ enabled: !settings.enabled })}
          >
            {settings.enabled ? 'ON' : 'OFF'}
          </button>
        </label>
      </section>

      {/* Blocked domains */}
      <section class="popup-section">
        <label class="popup-label">Blocked Domains</label>
        <div class="domain-add-row">
          <input
            type="text" class="domain-input" value={newDomain} placeholder="example.com"
            onInput={(e) => setNewDomain((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && addDomain()}
          />
          <button class="add-btn" onClick={addDomain}>Add</button>
        </div>
        <ul class="domain-list">
          {settings.blockedDomains.map(d => (
            <li key={d} class="domain-item">
              <span>{d}</span>
              <button class="remove-btn" onClick={() => save({ blockedDomains: settings.blockedDomains.filter(x => x !== d) })}>✕</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )

  function addDomain() {
    const d = newDomain.trim()
    if (!d || settings.blockedDomains.includes(d)) return
    save({ blockedDomains: [...settings.blockedDomains, d] })
    setNewDomain('')
  }
}
