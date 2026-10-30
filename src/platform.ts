import { applyPlatformSnapshot, platformPreferences } from '@/config/runtime'
import type { PlatformApi } from '@/types'

const PENDING_PREFERENCES_STORAGE_KEY = 'cp-pending-platform-preferences'

export function getPlatformApi(): PlatformApi | undefined {
  return window.platform
}

export function getPreference<T>(key: string, fallback: T): T {
  return (platformPreferences[key] as T | undefined) ?? fallback
}

export function savePreference(key: string, value: unknown) {
  const api = getPlatformApi()
  if (!api) {
    platformPreferences[key] = value
    return
  }

  const serialized = JSON.stringify(value)
  const persistedValue = JSON.parse(serialized) as unknown
  platformPreferences[key] = persistedValue
  const pending = readPendingPreferences()
  pending[key] = serialized
  writePendingPreferences(pending)

  void api.savePreference(key, persistedValue).then(() => {
    const latest = readPendingPreferences()
    if (latest[key] !== serialized) return
    delete latest[key]
    writePendingPreferences(latest)
  }).catch(() => undefined)
}

export async function initializePlatform() {
  const api = getPlatformApi()
  if (!api) return
  let snapshot = await api.getSnapshot()
  const pending = readPendingPreferences()
  if (Object.keys(pending).length) {
    await Promise.all(Object.entries(pending).map(([key, value]) => api.savePreference(key, JSON.parse(value))))
    localStorage.removeItem(PENDING_PREFERENCES_STORAGE_KEY)
    snapshot = await api.getSnapshot()
  }
  applyPlatformSnapshot(snapshot)
}

function readPendingPreferences(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_PREFERENCES_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writePendingPreferences(preferences: Record<string, string>) {
  if (Object.keys(preferences).length) localStorage.setItem(PENDING_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  else localStorage.removeItem(PENDING_PREFERENCES_STORAGE_KEY)
}
