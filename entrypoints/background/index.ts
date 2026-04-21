export default defineBackground(() => {
  console.log('[co-reader] Service worker started')

  // Open side panel on extension icon click
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn('[co-reader] sidePanel error:', e))

  // ── Message handler ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const m = msg as Record<string, unknown>
    console.log('[co-reader SW]', m?.type)

    if (m?.type === 'PING') {
      sendResponse({ ok: true })
      return true
    }

    if (m?.type === 'TEST_API_KEY') {
      import('./llm').then(({ testProvider }) =>
        testProvider().then(r => sendResponse(r))
      ).catch(e => sendResponse({ ok: false, error: String(e) }))
      return true
    }

    if (m?.type === 'LIST_MODELS') {
      const { providerId, apiKey } = (m.payload as { providerId: string; apiKey: string }) ?? { providerId: '', apiKey: '' }
      import('./providers').then(({ createProvider }) => {
        const provider = createProvider(providerId as any, apiKey ?? '', '')
        if (!provider.listModels) {
          sendResponse({ ok: false, error: 'Provider does not support listing models' })
          return
        }
        provider.listModels()
          .then(models => sendResponse({ ok: true, models }))
          .catch(err => sendResponse({ ok: false, error: String(err?.message ?? err) }))
      }).catch(e => sendResponse({ ok: false, error: String(e) }))
      return true
    }

    if (m?.type === 'GET_MICRO_SUMMARY') {
      import('./llm').then(({ fetchMicroSummary }) =>
        fetchMicroSummary(m.payload as any)
          .then(data => sendResponse({ ok: true, data }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
      )
      return true
    }

    if (m?.type === 'GET_MODEL_LIMITS') {
      Promise.all([
        import('./settings'),
        import('./providers/types'),
      ]).then(([{ getSettings }, { getModelLimits }]) =>
        getSettings().then(s => sendResponse(getModelLimits(s.provider, s.model)))
      ).catch(() => sendResponse({ contextTokens: 128000, maxOutputTokens: 8192 }))
      return true
    }

    if (m?.type === 'GET_FULL_PAGE_ANALYSIS') {
      const payload = m.payload as any
      console.log('[co-reader SW] Full page analysis:', payload.paragraphs?.length, 'paragraphs')
      import('./llm').then(({ fetchFullPageAnalysis }) =>
        fetchFullPageAnalysis(payload)
          .then(data => {
            console.log('[co-reader SW] Analysis complete:', data.paragraphs?.length, 'results')
            sendResponse({ ok: true, data })
          })
          .catch(err => {
            console.error('[co-reader SW] Analysis error:', err)
            sendResponse({ ok: false, error: String(err) })
          })
      )
      return true
    }

    if (m?.type === 'GET_SETTINGS') {
      import('./settings').then(({ getSettings }) =>
        getSettings().then(s => sendResponse(s))
      )
      return true
    }

    if (m?.type === 'UPDATE_SETTINGS') {
      import('./settings').then(({ updateSettings }) =>
        updateSettings(m.payload as any).then(s => sendResponse(s))
      )
      return true
    }

    if (m?.type === 'CHECK_DOMAIN_BLOCKED') {
      const payload = m.payload as { hostname: string }
      import('./settings').then(({ isDomainBlocked }) =>
        isDomainBlocked(payload.hostname).then(blocked => sendResponse(blocked))
      )
      return true
    }

    if (m?.type === 'OPEN_SIDE_PANEL') {
      const tabId = sender.tab?.id
      if (tabId) {
        chrome.sidePanel.open({ tabId }).then(() => sendResponse()).catch(() => sendResponse())
      } else {
        sendResponse()
      }
      return true
    }

    return false
  })

  // ── Long-running port handler (no timeout) ────────────────────────────────

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'long-running') return

    port.onMessage.addListener(async (msg) => {
      if (msg?.type === 'FULL_PAGE_ANALYSIS') {
        const payload = msg.payload as any
        console.log('[co-reader SW] Full page analysis via port:', payload.paragraphs?.length, 'paragraphs', 'technique:', payload.compressionTechnique)
        try {
          const { fetchFullPageAnalysis } = await import('./llm')
          const data = await fetchFullPageAnalysis(payload)
          port.postMessage({ ok: true, data })
        } catch (err) {
          console.error('[co-reader SW] Analysis error:', err)
          port.postMessage({ ok: false, error: String(err) })
        }
      }
      if (msg?.type === 'REFINEMENT_PASS') {
        const p = msg.payload as any
        try {
          const { fetchRefinementPass } = await import('./llm')
          const data = await fetchRefinementPass(p.technique, p.prevResults, p.req)
          port.postMessage({ ok: true, data })
        } catch (err) {
          console.error('[co-reader SW] Refinement error:', err)
          port.postMessage({ ok: false, error: String(err) })
        }
      }
    })
  })
})
