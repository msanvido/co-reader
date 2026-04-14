import type { ProviderID } from '@/utils/types'
import { PROVIDER_CONFIGS } from '@/entrypoints/background/providers/types'

/**
 * Returns true if the given provider requires an API key and none is set.
 */
export function isMissingApiKey(provider: ProviderID, apiKey: string): boolean {
  const config = PROVIDER_CONFIGS[provider]
  if (!config) return false
  return config.requiresKey && !apiKey.trim()
}

/**
 * Returns a user-facing error message for a missing API key,
 * or empty string if the provider doesn't require one.
 */
export function apiKeyErrorMessage(provider: ProviderID): string {
  const config = PROVIDER_CONFIGS[provider]
  if (!config?.requiresKey) return ''
  return `${config.name} API key required — open Settings to add one`
}
