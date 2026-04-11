/**
 * Offscreen document that hosts a local Gemma model via transformers.js.
 *
 * WebGPU is only available in document contexts (not service workers),
 * so the background script creates this offscreen document and
 * communicates via chrome.runtime messages.
 */
import {
  Gemma4ForConditionalGeneration,
  AutoProcessor,
  TextStreamer,
  env,
} from '@huggingface/transformers'

// Don't look for local model files — always fetch from HuggingFace Hub
env.allowLocalModels = false

// Load ONNX runtime WASM from bundled extension files (CDN is blocked by MV3 CSP)
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')

// ── Model state ─────────────────────────────────────────────────────────────

let model: InstanceType<typeof Gemma4ForConditionalGeneration> | null = null
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
let loadedHfId: string | null = null

const MODEL_MAP: Record<string, string> = {
  'gemma-4-e2b': 'onnx-community/gemma-4-E2B-it-ONNX',
  'gemma-4-e4b': 'onnx-community/gemma-4-E4B-it-ONNX',
}

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

// ── Model loading ───────────────────────────────────────────────────────────

/** Send a progress update to all extension contexts (side panel, background) */
function sendProgress(message: string, percent: number) {
  chrome.runtime.sendMessage({
    type: 'MODEL_DOWNLOAD_PROGRESS',
    message,
    percent,
  }).catch(() => {}) // ignore if no listeners
}

async function ensureModel(modelKey: string): Promise<void> {
  const hfId = MODEL_MAP[modelKey]
  if (!hfId) throw new Error(`Unknown model: ${modelKey}`)
  if (loadedHfId === hfId && model && processor) return

  // Dispose previous model if switching
  if (model) {
    await (model as any).dispose()
    model = null
    processor = null
    loadedHfId = null
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
