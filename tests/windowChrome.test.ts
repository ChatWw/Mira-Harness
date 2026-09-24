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
  it('keeps the shell controls outside the draggable title-bar region', () => {
    const layoutSource = readFileSync(new URL('../src/layouts/index.vue', import.meta.url), 'utf8')
    const titlebarIndex = layoutSource.indexOf('<WindowsTitlebar')
    const shellBarIndex = layoutSource.indexOf('class="mira-shell__bar"')
    const shellActionsIndex = layoutSource.indexOf('class="mira-shell__actions"')

    expect(titlebarIndex).toBeGreaterThan(-1)
    expect(shellBarIndex).toBeGreaterThan(-1)
    expect(shellActionsIndex).toBeGreaterThan(shellBarIndex)
    expect(layoutSource).toContain('class="mira-shell__canvas"')
    expect(layoutSource).toMatch(/\.mira-shell__canvas\s*\{\s*display:\s*flex;/)
    expect(layoutSource).not.toContain('<AppSidebar')
    expect(layoutSource).toMatch(/\.mira-shell__identity,[\s\S]*?-webkit-app-region:\s*no-drag;/)
    expect(layoutSource).toMatch(/\.mira-shell__actions\s*\{[\s\S]*?-webkit-app-region:\s*no-drag;/)
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
