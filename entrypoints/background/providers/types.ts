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
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    helpUrl: 'https://aistudio.google.com/app/apikey',
    modelLimits: {
      'gemini-2.5-flash': { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
      'gemini-2.5-pro':   { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
    },
  },
  'openrouter': {
    id: 'openrouter',
    name: 'OpenRouter',
    requiresKey: true,
    keyPlaceholder: 'sk-or-...',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    models: [
      'anthropic/claude-sonnet-4-6',
      'openai/gpt-4o',
      'google/gemini-2.5-flash',
      'meta-llama/llama-4-maverick',
      'deepseek/deepseek-r1',
    ],
    helpUrl: 'https://openrouter.ai/keys',
    modelLimits: {
      'anthropic/claude-sonnet-4-6':  { contextTokens: 200_000,   maxOutputTokens: 16_384 },
      'openai/gpt-4o':                { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'google/gemini-2.5-flash':      { contextTokens: 1_000_000, maxOutputTokens: 65_536 },
      'meta-llama/llama-4-maverick':  { contextTokens: 128_000,   maxOutputTokens: 16_384 },
      'deepseek/deepseek-r1':         { contextTokens: 128_000,   maxOutputTokens: 16_384 },
    },
  },
  'chrome-nano': {
    id: 'chrome-nano',
    name: 'Chrome Nano [BETA]',
    requiresKey: false,
    keyPlaceholder: '',
    defaultModel: 'nano',
    models: ['nano'],
    helpUrl: 'chrome://flags/#prompt-api-for-gemini-nano',
    modelLimits: {
      'nano': { contextTokens: 4_096, maxOutputTokens: 2_048 },
    },
  },
}

/** Get limits for a specific provider+model combo, with sensible defaults */
export function getModelLimits(providerId: ProviderID, model: string): ModelLimits {
  const config = PROVIDER_CONFIGS[providerId]
  return config?.modelLimits[model] ?? { contextTokens: 128_000, maxOutputTokens: 8_192 }
}
