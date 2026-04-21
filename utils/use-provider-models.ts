import { useState, useEffect } from 'preact/hooks'
import type { ProviderID } from './types'
import type { ModelInfo } from '@/entrypoints/background/providers/types'
import { sendListModels } from './message-bus'

/**
 * Fetches the live model catalog for providers that expose one (OpenRouter).
 * Returns `models: null` while loading or when the provider has no live catalog —
 * callers should then fall back to the static list in PROVIDER_CONFIGS.
 *
 * Re-fetches when providerId or apiKey changes. Call `refresh()` to force a
 * refetch (e.g. after the user clicks Test).
 */
export function useProviderModels(providerId: ProviderID, apiKey: string) {
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)

  useEffect(() => {
    if (providerId !== 'openrouter') {
      setModels(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    sendListModels(providerId, apiKey)
      .then(r => {
        if (cancelled) return
        if (r.ok && r.models) {
          setModels(r.models)
        } else {
          setModels(null)
          setError(r.error ?? 'Failed to fetch models')
        }
      })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [providerId, apiKey, refreshCounter])

  return {
    models,
    loading,
    error,
    refresh: () => setRefreshCounter(c => c + 1),
  }
}
