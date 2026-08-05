import { applyPlatformSnapshot, platformPreferences } from '@/config/runtime'
import type { PlatformApi } from '@/types'

const PENDING_PREFERENCES_STORAGE_KEY = 'cp-pending-platform-preferences'
const JSON_PREFERENCE_KEYS = new Set(['layout', 'recentCommands', 'tabs'])

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
  const normalizedPreferences = normalizePreferences(snapshot.preferences)
  if (normalizedPreferences) {
    await Promise.all(Object.entries(normalizedPreferences).map(([key, value]) => api.savePreference(key, value)))
    snapshot = await api.getSnapshot()
  }
  if (!snapshot.preferences.legacyBrowserStorageMigrated) {
    const legacyEntries: Array<[string, string]> = []
    const legacyValues: Array<[string, string | null]> = [
      ['layout', localStorage.getItem('cp-layout-config')],
      ['themeMode', localStorage.getItem('cp-theme-mode')],
      ['primaryPreset', localStorage.getItem('cp-primary-preset')],
      ['recentCommands', localStorage.getItem('cp-command-palette-recent')],
      ['tabs', sessionStorage.getItem('cp-tabs')],
    ]
    for (const [key, value] of legacyValues) {
      if (value !== null) legacyEntries.push([key, value])
    }
    const legacy = Object.fromEntries(legacyEntries.map(([key, value]) => [key, parseLegacyPreference(key, value)]))
    await Promise.all(Object.entries(legacy).map(([key, value]) => api.savePreference(key, value)))
    await api.savePreference('legacyBrowserStorageMigrated', true)
    snapshot = await api.getSnapshot()
  }
  const pending = readPendingPreferences()
  if (Object.keys(pending).length) {
    await Promise.all(Object.entries(pending).map(([key, value]) => api.savePreference(key, JSON.parse(value))))
    localStorage.removeItem(PENDING_PREFERENCES_STORAGE_KEY)
    snapshot = await api.getSnapshot()
  }
  applyPlatformSnapshot(snapshot)
}

function normalizePreferences(preferences: Record<string, unknown>) {
  const normalized = Object.fromEntries(Object.entries(preferences).flatMap(([key, value]) => {
    if (!JSON_PREFERENCE_KEYS.has(key) || typeof value !== 'string') return []
    const parsed = parseLegacyPreference(key, value)
    return typeof parsed === 'string' ? [] : [[key, parsed]]
  }))

  return Object.keys(normalized).length ? normalized : undefined
}

function parseLegacyPreference(key: string, value: string) {
  if (!JSON_PREFERENCE_KEYS.has(key)) return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
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
