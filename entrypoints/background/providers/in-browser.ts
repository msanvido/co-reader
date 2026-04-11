import type { LLMProvider } from './types'

/**
 * In-browser Gemma provider powered by transformers.js + WebGPU.
 *
 * Runs entirely on-device — no API key, no network calls for inference.
 * The model (~500 MB–1.5 GB) is downloaded once from HuggingFace and cached
 * by the browser. Inference runs in a Chrome offscreen document because
 * WebGPU is not available in service workers.
 */
export function createInBrowserProvider(model: string): LLMProvider {
  return {
    name: 'In-Browser (Gemma)',

    async call(system, userPrompt, maxTokens) {
      await ensureOffscreen()

      const response = await chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'generate',
        model,
        system,
        userPrompt,
        maxTokens,
      })

      if (!response?.ok) {
        throw new Error(response?.error ?? 'In-browser generation failed')
      }
      return response.text
    },

    async test() {
      try {
        await ensureOffscreen()

        const response = await chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'check-gpu',
        })

        if (!response?.ok) {
          return { ok: false, error: response?.error ?? 'WebGPU check failed' }
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
  }
}

// ── Offscreen document lifecycle ────────────────────────────────────────────

let creating: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  const exists = await chrome.offscreen.hasDocument()
  if (exists) return

  if (creating) {
    await creating
    return
  }

  creating = chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run local Gemma model inference via transformers.js with WebGPU',
  })

  await creating
  creating = null
}
