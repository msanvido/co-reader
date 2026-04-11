import type { ProviderID } from '@/utils/types'
export type { ProviderID }

export interface LLMProvider {
  name: string
  call(system: string, userPrompt: string, maxTokens: number): Promise<string>
  test(): Promise<{ ok: boolean; error?: string }>
}

export interface ModelLimits {
  contextTokens: number
  maxOutputTokens: number
}

export interface ProviderConfig {
  id: ProviderID
  name: string
  requiresKey: boolean
  keyPlaceholder: string
  defaultModel: string
  models: string[]
  helpUrl: string
  /** Per-model context and output limits (tokens) */
  modelLimits: Record<string, ModelLimits>
}

export const PROVIDER_CONFIGS: Record<ProviderID, ProviderConfig> = {
  'anthropic': {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    requiresKey: true,
    keyPlaceholder: 'sk-ant-api03-...',
    defaultModel: 'claude-sonnet-4-6',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    helpUrl: 'https://console.anthropic.com/settings/keys',
    modelLimits: {
      'claude-sonnet-4-6':         { contextTokens: 200_000, maxOutputTokens: 16_384 },
      'claude-haiku-4-5-20251001': { contextTokens: 200_000, maxOutputTokens: 8_192 },
    },
  },
  'openai': {
    id: 'openai',
    name: 'OpenAI (GPT)',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    helpUrl: 'https://platform.openai.com/api-keys',
    modelLimits: {
      'gpt-4o':        { contextTokens: 128_000, maxOutputTokens: 16_384 },
      'gpt-4o-mini':   { contextTokens: 128_000, maxOutputTokens: 16_384 },
      'gpt-4.1':       { contextTokens: 1_000_000, maxOutputTokens: 32_768 },
      'gpt-4.1-mini':  { contextTokens: 1_000_000, maxOutputTokens: 32_768 },
      'o4-mini':       { contextTokens: 200_000, maxOutputTokens: 100_000 },
    },
  },
  'gemini': {
    id: 'gemini',
    name: 'Google Gemini',
    requiresKey: true,
    keyPlaceholder: 'AIza...',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    helpUrl: 'https://aistudio.google.com/app/apikey',
    modelLimits: {
      'gemini-2.5-flash':       { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
      'gemini-2.5-flash-lite':  { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
      'gemini-2.5-pro':         { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
    },
  },
  'openrouter': {
    id: 'openrouter',
    name: 'OpenRouter',
    requiresKey: true,
    keyPlaceholder: 'sk-or-...',
    defaultModel: 'google/gemma-4-31b-it:free',
    models: [
      // ── Free models (verified on OpenRouter) ──
      'google/gemma-4-31b-it:free',
      'google/gemma-3-27b-it:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'nousresearch/hermes-3-llama-3.1-405b:free',
      'qwen/qwen3-coder:free',
      'openai/gpt-oss-120b:free',
      'minimax/minimax-m2.5:free',
      // ── Paid models ──
      'anthropic/claude-opus-4',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-haiku-4.5',
      'openai/gpt-4.1',
      'openai/gpt-4.1-mini',
      'openai/gpt-4o',
      'openai/o4-mini',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-r1-0528',
      'deepseek/deepseek-chat-v3-0324',
      'meta-llama/llama-4-maverick',
      'meta-llama/llama-4-scout',
      'qwen/qwen3-235b-a22b',
      'mistralai/mistral-large-2411',
      'x-ai/grok-3',
      'cohere/command-r-plus',
    ],
    helpUrl: 'https://openrouter.ai/keys',
    modelLimits: {
      // Free models
      'google/gemma-4-31b-it:free':                  { contextTokens: 128_000,   maxOutputTokens: 8_192 },
      'google/gemma-3-27b-it:free':                  { contextTokens: 96_000,    maxOutputTokens: 8_192 },
      'nvidia/nemotron-3-super-120b-a12b:free':      { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'meta-llama/llama-3.3-70b-instruct:free':      { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'nousresearch/hermes-3-llama-3.1-405b:free':   { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'qwen/qwen3-coder:free':                       { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'openai/gpt-oss-120b:free':                    { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'minimax/minimax-m2.5:free':                   { contextTokens: 1_000_000, maxOutputTokens: 16_384 },
      // Paid models
      'anthropic/claude-opus-4':                     { contextTokens: 200_000,   maxOutputTokens: 32_000 },
      'anthropic/claude-sonnet-4.6':                 { contextTokens: 200_000,   maxOutputTokens: 16_384 },
      'anthropic/claude-haiku-4.5':                  { contextTokens: 200_000,   maxOutputTokens: 8_192 },
      'openai/gpt-4.1':                              { contextTokens: 1_000_000, maxOutputTokens: 32_768 },
      'openai/gpt-4.1-mini':                         { contextTokens: 1_000_000, maxOutputTokens: 32_768 },
      'openai/gpt-4o':                               { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'openai/o4-mini':                              { contextTokens: 200_000,   maxOutputTokens: 100_000 },
      'google/gemini-2.5-flash':                     { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
      'google/gemini-2.5-pro':                       { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
      'deepseek/deepseek-r1-0528':                   { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'deepseek/deepseek-chat-v3-0324':              { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'meta-llama/llama-4-maverick':                 { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'meta-llama/llama-4-scout':                    { contextTokens: 512_000,   maxOutputTokens: 16_384 },
      'qwen/qwen3-235b-a22b':                       { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'mistralai/mistral-large-2411':                { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'x-ai/grok-3':                                { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'cohere/command-r-plus':                       { contextTokens: 128_000,   maxOutputTokens: 4_096 },
    },
  },
  'chrome-nano': {
    id: 'chrome-nano',
    name: 'In-Browser Chrome Native',
    requiresKey: false,
    keyPlaceholder: '',
    defaultModel: 'nano',
    models: ['nano'],
    helpUrl: 'https://developer.chrome.com/docs/ai/built-in',
    modelLimits: {
      'nano': { contextTokens: 4_096, maxOutputTokens: 2_048 },
    },
  },
  'in-browser': {
    id: 'in-browser',
    name: 'In-Browser (Gemma)',
    requiresKey: false,
    keyPlaceholder: '',
    defaultModel: 'gemma-4-e2b',
    models: ['gemma-4-e2b', 'gemma-4-e4b'],
    helpUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX',
    modelLimits: {
      'gemma-4-e2b': { contextTokens: 8_192, maxOutputTokens: 2_048 },
      'gemma-4-e4b': { contextTokens: 8_192, maxOutputTokens: 2_048 },
    },
  },
}

/** Get limits for a specific provider+model combo, with sensible defaults */
export function getModelLimits(providerId: ProviderID, model: string): ModelLimits {
  const config = PROVIDER_CONFIGS[providerId]
  return config?.modelLimits[model] ?? { contextTokens: 128_000, maxOutputTokens: 8_192 }
}
