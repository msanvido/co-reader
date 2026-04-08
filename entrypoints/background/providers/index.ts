import type { LLMProvider, ProviderID } from './types'
import { createAnthropicProvider } from './anthropic'
import { createOpenAIProvider } from './openai'
import { createGeminiProvider } from './gemini'
import { createOpenRouterProvider } from './openrouter'
import { createChromeNanoProvider } from './chrome-nano'

export type { LLMProvider, ProviderID, ProviderConfig } from './types'
export { PROVIDER_CONFIGS } from './types'

export function createProvider(providerId: ProviderID, apiKey: string, model: string): LLMProvider {
  switch (providerId) {
    case 'anthropic':   return createAnthropicProvider(apiKey, model)
    case 'openai':      return createOpenAIProvider(apiKey, model)
    case 'gemini':      return createGeminiProvider(apiKey, model)
    case 'openrouter':  return createOpenRouterProvider(apiKey, model)
    case 'chrome-nano': return createChromeNanoProvider()
  }
}
