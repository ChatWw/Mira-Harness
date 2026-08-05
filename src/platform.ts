import { applyPlatformSnapshot, platformPreferences } from '@/config/runtime'
import type { PlatformApi } from '@/types'

export function getPlatformApi(): PlatformApi | undefined {
  return window.platform
}

export function getPreference<T>(key: string, fallback: T): T {
  return (platformPreferences[key] as T | undefined) ?? fallback
}

export function savePreference(key: string, value: unknown) {
  platformPreferences[key] = value
  void getPlatformApi()?.savePreference(key, value)
}

export async function initializePlatform() {
  const api = getPlatformApi()
  if (!api) return
  let snapshot = await api.getSnapshot()
  if (!snapshot.preferences.legacyBrowserStorageMigrated) {
    const legacy = {
      layout: localStorage.getItem('cp-layout-config'),
      themeMode: localStorage.getItem('cp-theme-mode'),
      primaryPreset: localStorage.getItem('cp-primary-preset'),
      recentCommands: localStorage.getItem('cp-command-palette-recent'),
      tabs: sessionStorage.getItem('cp-tabs'),
      legacyBrowserStorageMigrated: true,
    }
    await Promise.all(Object.entries(legacy).map(([key, value]) => api.savePreference(key, value)))
    snapshot = await api.getSnapshot()
  }
  applyPlatformSnapshot(snapshot)
}
