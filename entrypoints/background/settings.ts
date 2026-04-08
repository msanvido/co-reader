import type { Settings } from '@/utils/types'
import { DEFAULT_SETTINGS } from '@/utils/types'
import { DEFAULT_BLOCKED_PATTERNS } from '@/utils/constants'

const STORAGE_KEY = 'co_reader_settings'

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  if (!result[STORAGE_KEY]) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] as Partial<Settings>) }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const updated = { ...current, ...patch }
  await chrome.storage.local.set({ [STORAGE_KEY]: updated })
  return updated
}

export async function isDomainBlocked(hostname: string): Promise<boolean> {
  if (DEFAULT_BLOCKED_PATTERNS.some(p => p.test(hostname))) return true
  const settings = await getSettings()
  return settings.blockedDomains.some(domain => hostname.includes(domain))
}
