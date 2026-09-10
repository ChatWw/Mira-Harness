import type { PlatformApi, ThemeMode } from '@/types'

export const WINDOW_CHROME_HEIGHT = 48

export function resolveWindowChrome(theme: ThemeMode) {
  return {
    color: '#00000000',
    symbolColor: theme === 'dark' ? '#fafafa' : '#18181b',
    height: WINDOW_CHROME_HEIGHT,
  }
}

export function resolveWindowChromeDelay(durationMs: number, animated: boolean) {
  return animated ? Math.max(0, durationMs / 2) : 0
}

export function resolveWindowChromeUpdate(
  windowChrome: PlatformApi['windowChrome'] | undefined,
  theme: ThemeMode,
  durationMs = 0,
  animated = false,
) {
  if (windowChrome !== 'windows-overlay') return undefined
  return {
    chrome: resolveWindowChrome(theme),
    delayMs: resolveWindowChromeDelay(durationMs, animated),
  }
}

export async function syncWindowChrome(platform: PlatformApi | undefined, theme: ThemeMode) {
  const update = resolveWindowChromeUpdate(platform?.windowChrome, theme)
  if (!platform || !update) return false
  await platform.setTitleBarChrome(update.chrome)
  return true
}
