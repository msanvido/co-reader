import type { LLMProvider, ModelInfo } from './types'

export const WLLAMA_MODELS: ModelInfo[] = [
  {
    id: 'qwen2.5-0.5b',
    label: 'Qwen 2.5 0.5B Instruct (Q4_K_M, ~398 MB)',
    isFree: true,
    contextLength: 4096,
    maxOutput: 2048,
  },
  {
    id: 'llama-3.2-1b',
    label: 'Llama 3.2 1B Instruct (Q4_K_M, ~800 MB)',
    isFree: true,
    contextLength: 4096,
    maxOutput: 2048,
  },
  {
    id: 'smollm2-360m',
    label: 'SmolLM2 360M Instruct (Q8_0, ~387 MB)',
    isFree: true,
    contextLength: 4096,
    maxOutput: 2048,
  },
  {
    id: 'qwen2.5-1.5b',
    label: 'Qwen 2.5 1.5B Instruct (Q4_K_M, ~986 MB)',
    isFree: true,
    contextLength: 4096,
    maxOutput: 2048,
  },
  {
    id: 'smollm2-1.7b',
    label: 'SmolLM2 1.7B Instruct (Q4_K_M, ~1.06 GB)',
    isFree: true,
    contextLength: 4096,
    maxOutput: 2048,
  },
]

/**
 * In-browser llama.cpp provider powered by @wllama/wllama WebAssembly + WebGPU.
 *
 * Runs locally on-device — no API key, no external inference calls.
 * GGUF model weights are downloaded from HuggingFace and cached in browser storage.
 * Inference executes in a Chrome offscreen document because Web Workers and
 * WebGPU/WASM threading require a document context.
 */
export function createWllamaProvider(model: string): LLMProvider {
  return {
    name: 'In-Browser (Wllama / llama.cpp)',

    async call(system, userPrompt, maxTokens) {
      await ensureOffscreen()

      const response = await chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'wllama-generate',
        model,
        system,
        userPrompt,
        maxTokens,
      })

      if (!response?.ok) {
        throw new Error(response?.error ?? 'Wllama generation failed')
      }
      return response.text
    },

    async test() {
      try {
        await ensureOffscreen()

        const response = await chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'wllama-test',
        })

        if (!response?.ok) {
          return { ok: false, error: response?.error ?? 'Wllama check failed' }
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      return WLLAMA_MODELS
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
    justification: 'Run local llama.cpp model inference via @wllama/wllama WebAssembly',
  })

  await creating
  creating = null
}
