/**
 * Offscreen document that hosts local LLM inference via:
 * 1. transformers.js with WebGPU (Gemma)
 * 2. @wllama/wllama with WebAssembly & WebGPU (llama.cpp)
 *
 * Web Workers and WebGPU are only available in document contexts (not service workers),
 * so the background script creates this offscreen document and
 * communicates via chrome.runtime messages.
 */
import {
  Gemma4ForConditionalGeneration,
  AutoProcessor,
  TextStreamer,
  env,
} from '@huggingface/transformers'
import { Wllama } from '@wllama/wllama'

// Don't look for local model files — always fetch from HuggingFace Hub
env.allowLocalModels = false

// Load ONNX runtime WASM from bundled extension files (CDN is blocked by MV3 CSP)
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')
}

// ── Gemma Model state ────────────────────────────────────────────────────────

let model: InstanceType<typeof Gemma4ForConditionalGeneration> | null = null
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
let loadedHfId: string | null = null

const MODEL_MAP: Record<string, string> = {
  'gemma-4-e2b': 'onnx-community/gemma-4-E2B-it-ONNX',
  'gemma-4-e4b': 'onnx-community/gemma-4-E4B-it-ONNX',
}

// ── Wllama Model state ───────────────────────────────────────────────────────

interface WllamaModelDef {
  repo: string
  file?: string
  quant?: string
}

const WLLAMA_MODEL_MAP: Record<string, WllamaModelDef> = {
  'qwen2.5-0.5b': {
    repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  'llama-3.2-1b': {
    repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  'smollm2-360m': {
    repo: 'HuggingFaceTB/SmolLM2-360M-Instruct-GGUF',
    file: 'smollm2-360m-instruct-q8_0.gguf',
  },
  'qwen2.5-1.5b': {
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  'smollm2-1.7b': {
    repo: 'HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF',
    file: 'smollm2-1.7b-instruct-q4_k_m.gguf',
  },
}

let wllamaInstance: Wllama | null = null
let loadedWllamaModel: string | null = null

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return false

  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }))

  return true // keep the message channel open for async response
})

async function handleMessage(msg: any): Promise<any> {
  switch (msg.action) {
    case 'check-gpu':
      return checkGPU()
    case 'generate':
      return generate(msg.model, msg.system, msg.userPrompt, msg.maxTokens)
    case 'wllama-test':
      return checkWllama()
    case 'wllama-generate':
      return wllamaGenerate(msg.model, msg.system, msg.userPrompt, msg.maxTokens)
    default:
      return { ok: false, error: `Unknown action: ${msg.action}` }
  }
}

// ── GPU check ───────────────────────────────────────────────────────────────

async function checkGPU(): Promise<{ ok: boolean; error?: string }> {
  const adapter = await navigator.gpu?.requestAdapter()
  if (!adapter) {
    return { ok: false, error: 'WebGPU is not available in your browser. Use Chrome 113+ or Edge 113+.' }
  }
  if (!adapter.features.has('shader-f16')) {
    return { ok: false, error: 'Your GPU does not support f16 shaders, which are required for Gemma inference.' }
  }
  return { ok: true }
}

// ── Wllama environment check ────────────────────────────────────────────────

async function checkWllama(): Promise<{ ok: boolean; error?: string }> {
  if (typeof WebAssembly === 'undefined') {
    return { ok: false, error: 'WebAssembly is not supported in this browser.' }
  }
  try {
    const wasmUrl = chrome.runtime.getURL('wllama/wllama.wasm')
    const res = await fetch(wasmUrl, { method: 'HEAD' })
    if (!res.ok) {
      return { ok: false, error: `wllama.wasm binary not found in extension bundle (${res.status})` }
    }
  } catch (e) {
    return { ok: false, error: `Failed to locate wllama.wasm: ${String(e)}` }
  }
  return { ok: true }
}

// ── Progress notification ───────────────────────────────────────────────────

/** Send a progress update to all extension contexts (side panel, background) */
function sendProgress(message: string, percent: number) {
  chrome.runtime.sendMessage({
    type: 'MODEL_DOWNLOAD_PROGRESS',
    message,
    percent,
  }).catch(() => {}) // ignore if no listeners
}

// ── Gemma Model loading ──────────────────────────────────────────────────────

async function ensureModel(modelKey: string): Promise<void> {
  const hfId = MODEL_MAP[modelKey]
  if (!hfId) throw new Error(`Unknown model: ${modelKey}`)
  if (loadedHfId === hfId && model && processor) return

  // Dispose previous Gemma model if switching
  if (model) {
    await (model as any).dispose()
    model = null
    processor = null
    loadedHfId = null
  }

  // Dispose Wllama if loaded to avoid keeping two models in memory
  if (wllamaInstance) {
    try {
      await wllamaInstance.exit()
    } catch (e) {
      console.warn('[co-reader] Failed to exit wllama when switching to Gemma:', e)
    }
    wllamaInstance = null
    loadedWllamaModel = null
  }

  sendProgress('Downloading model (first run only)...', 0)

  // Track download progress across all files
  const fileProgress: Record<string, number> = {}
  function progress_callback(update: any) {
    if (update.status === 'progress' && update.file) {
      fileProgress[update.file] = update.progress ?? 0
      const values = Object.values(fileProgress)
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      sendProgress(`Downloading model... ${avg}%`, avg)
    }
    if (update.status === 'ready') {
      sendProgress('Loading model into GPU...', 100)
    }
  }

  const [m, p] = await Promise.all([
    Gemma4ForConditionalGeneration.from_pretrained(hfId, {
      dtype: 'q4f16' as any,
      device: 'webgpu',
      progress_callback,
    }),
    AutoProcessor.from_pretrained(hfId),
  ])

  model = m as any
  processor = p
  loadedHfId = hfId

  sendProgress('Model ready', -1) // -1 signals "done"
}

// ── Wllama Model loading ────────────────────────────────────────────────────

async function ensureWllamaModel(modelKey: string): Promise<Wllama> {
  const modelDef = WLLAMA_MODEL_MAP[modelKey]
  if (!modelDef && !modelKey.includes('/')) {
    throw new Error(`Unknown Wllama model: ${modelKey}`)
  }

  if (loadedWllamaModel === modelKey && wllamaInstance && wllamaInstance.isModelLoaded()) {
    return wllamaInstance
  }

  // Dispose Gemma model if loaded to free memory
  if (model) {
    try {
      await (model as any).dispose()
    } catch (e) {
      console.warn('[co-reader] Failed to dispose Gemma model:', e)
    }
    model = null
    processor = null
    loadedHfId = null
  }

  // Dispose previous Wllama instance if model changed
  if (wllamaInstance) {
    try {
      await wllamaInstance.exit()
    } catch (e) {
      console.warn('[co-reader] Failed to exit previous wllama:', e)
    }
    wllamaInstance = null
    loadedWllamaModel = null
  }

  sendProgress('Initializing Wllama runtime...', 0)

  const configPaths = {
    default: chrome.runtime.getURL('wllama/wllama.wasm'),
  }

  const wllama = new Wllama(configPaths, {
    suppressNativeLog: false,
    parallelDownloads: 3,
  })

  sendProgress('Downloading model (first run only)...', 0)

  const progressCallback = ({ loaded, total }: { loaded: number; total: number }) => {
    if (total > 0) {
      const pct = Math.round((loaded / total) * 100)
      sendProgress(`Downloading model... ${pct}%`, pct)
    }
  }

  const target = modelDef ?? { repo: modelKey }

  await wllama.loadModelFromHF(
    {
      repo: target.repo,
      file: target.file,
      quant: target.quant,
    },
    {
      progressCallback,
      n_ctx: 4096,
      n_threads: Math.min(4, navigator.hardwareConcurrency || 4),
    }
  )

  wllamaInstance = wllama
  loadedWllamaModel = modelKey

  sendProgress('Model ready', -1)
  return wllama
}

// ── Text generation ─────────────────────────────────────────────────────────

async function generate(
  modelKey: string,
  system: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    await ensureModel(modelKey)

    // Build prompt using Gemma 4's native turn format
    const prompt = `<|turn>system\n${system}<turn|>\n<|turn>user\n${userPrompt}<turn|>\n<|turn>model\n`

    const inputs = (processor as any).tokenizer(prompt, {
      add_special_tokens: false,
      return_tensor: 'pt',
    })

    let result = ''
    const streamer = new TextStreamer((processor as any).tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        result += text
      },
    })

    await (model as any).generate({
      ...inputs,
      max_new_tokens: maxTokens,
      do_sample: false,
      streamer,
    })

    return { ok: true, text: result.trim() }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

async function wllamaGenerate(
  modelKey: string,
  system: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const wllama = await ensureWllamaModel(modelKey)

    const response = await wllama.createChatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    })

    const text = response.choices?.[0]?.message?.content ?? ''
    return { ok: true, text: text.trim() }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
