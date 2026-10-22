import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformPreferences } from '../src/config/runtime'

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of Object.keys(platformPreferences)) delete platformPreferences[key]
})

describe('legacy theme preferences', () => {
  it('preserves system preference, follows OS changes, and toggles only explicit light and dark', async () => {
    const values = new Map<string, string>()
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
    const styles = new Map<string, string>()
    vi.stubGlobal('localStorage', localStorage)
    let dark = true
    let systemChanged: (() => void) | undefined
    vi.stubGlobal('window', {
      platform: undefined,
      matchMedia: () => ({ matches: dark, addEventListener: (_event: string, callback: () => void) => { systemChanged = callback } }),
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
    expect(theme.themePreference).toBe('system')
    expect(theme.primaryPresetId).toBe('monochrome')
    expect(styles.get('--cp-primary')).toBe('#f3f3f3')
    expect(platformPreferences.themeMode).toBe('system')
    expect(platformPreferences.primaryPreset).toBe('monochrome')
    expect(values.get('cp-theme-mode')).toBeUndefined()
    expect(values.get('cp-primary-preset')).toBe('monochrome')

    dark = false; systemChanged?.()
    expect(theme.themeMode).toBe('light')
    expect(theme.themePreference).toBe('system')
    theme.toggleThemeMode()
    expect(theme.themeMode).toBe('dark')
    expect(theme.themePreference).toBe('dark')
    theme.toggleThemeMode()
    expect(theme.themeMode).toBe('light')
    expect(theme.themePreference).toBe('light')
    theme.setThemePreference('system')
    expect(theme.themePreference).toBe('system')
    await theme.toggleThemeModeWithTransition(undefined, false)
    expect(theme.themePreference).toBe('dark')
    expect(platformPreferences.themeMode).toBe('dark')
  })
})
