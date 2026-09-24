import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformPreferences } from '../src/config/runtime'

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of Object.keys(platformPreferences)) delete platformPreferences[key]
})

describe('legacy theme preferences', () => {
  it('converts system mode to the current dark mode and resets the old accent color', async () => {
    const values = new Map<string, string>()
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
    const styles = new Map<string, string>()
    vi.stubGlobal('localStorage', localStorage)
    vi.stubGlobal('window', {
      platform: undefined,
      matchMedia: () => ({ matches: true, addEventListener: vi.fn() }),
    })
    vi.stubGlobal('document', {
      documentElement: {
        setAttribute: vi.fn(),
        style: { setProperty: (key: string, value: string) => styles.set(key, value) },
      },
      querySelector: () => null,
    })
    platformPreferences.themeMode = 'system'
    platformPreferences.primaryPreset = 'blue'
    setActivePinia(createPinia())

    const { useThemeStore } = await import('../src/stores/theme')
    const theme = useThemeStore()

    expect(theme.themeMode).toBe('dark')
    expect(theme.themePreference).toBe('dark')
    expect(theme.primaryPresetId).toBe('monochrome')
    expect(styles.get('--cp-primary')).toBe('#f3f3f3')
    expect(platformPreferences.themeMode).toBe('dark')
    expect(platformPreferences.primaryPreset).toBe('monochrome')
    expect(values.get('cp-theme-mode')).toBe('dark')
    expect(values.get('cp-primary-preset')).toBe('monochrome')

    theme.setThemePreference('system')
    expect(theme.themePreference).toBe('dark')
  })
})
