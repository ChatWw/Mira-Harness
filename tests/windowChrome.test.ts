import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PlatformApi } from '../src/types'
import {
  resolveWindowChrome,
  resolveWindowChromeDelay,
  resolveWindowChromeUpdate,
  syncWindowChrome,
} from '../src/utils/windowChrome'

describe('Windows title-bar chrome', () => {
  it('keeps the sidebar toggle above and outside the draggable title-bar region', () => {
    const layoutSource = readFileSync(new URL('../src/layouts/index.vue', import.meta.url), 'utf8')
    const titlebarIndex = layoutSource.indexOf('<WindowsTitlebar')
    const sidebarControlsIndex = layoutSource.indexOf('class="sidebar-window-controls"')

    expect(titlebarIndex).toBeGreaterThan(-1)
    expect(sidebarControlsIndex).toBeGreaterThan(titlebarIndex)
    expect(layoutSource).toMatch(/\.sidebar-window-controls\s*\{[\s\S]*?z-index:\s*120;[\s\S]*?-webkit-app-region:\s*no-drag !important;/)
  })

  it('keeps the native overlay transparent in light and dark themes', () => {
    expect(resolveWindowChrome('light')).toEqual({ color: '#00000000', symbolColor: '#18181b', height: 36 })
    expect(resolveWindowChrome('dark')).toEqual({ color: '#00000000', symbolColor: '#fafafa', height: 36 })
  })

  it('delays animated symbol updates until the animation midpoint', () => {
    expect(resolveWindowChromeDelay(300, true)).toBe(150)
    expect(resolveWindowChromeUpdate('windows-overlay', 'dark', 500, true)?.delayMs).toBe(250)
  })

  it('syncs immediately when animation is disabled', () => {
    expect(resolveWindowChromeDelay(500, false)).toBe(0)
    expect(resolveWindowChromeUpdate('windows-overlay', 'light', 500, false)?.delayMs).toBe(0)
  })

  it('does nothing outside Windows', async () => {
    const setTitleBarChrome = vi.fn()
    const platform = { windowChrome: 'macos-overlay', setTitleBarChrome } as unknown as PlatformApi

    await expect(syncWindowChrome(platform, 'dark')).resolves.toBe(false)
    expect(resolveWindowChromeUpdate('standard', 'dark', 300, true)).toBeUndefined()
    expect(setTitleBarChrome).not.toHaveBeenCalled()
  })
})
