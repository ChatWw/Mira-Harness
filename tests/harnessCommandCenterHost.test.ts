import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { HARNESS_COMMAND_CENTER_EVENT, openHarnessCommandCenter } from '../src/platform/harnessCommandCenter'
import { useCommandPaletteStore } from '../src/stores/commandPalette'

const route = vi.hoisted(() => ({ currentRoute: { value: { path: '/workspace/harness-react' } } }))
vi.mock('@/router', () => ({ default: route }))
vi.mock('@/platform', () => ({ getPreference: (_key: string, fallback: unknown) => fallback, savePreference: vi.fn() }))
beforeEach(() => { setActivePinia(createPinia()); route.currentRoute.value.path = '/workspace/harness-react'; vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} }); vi.stubGlobal('localStorage', { getItem: () => null }); vi.stubGlobal('window', { dispatchEvent: vi.fn() }) })
afterEach(() => vi.unstubAllGlobals())

describe('Vue Shell and React search use one command center', () => {
  it('dispatches one application event on the formal React route instead of opening the Vue palette', () => {
    const palette = useCommandPaletteStore(); palette.open()
    expect(window.dispatchEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: HARNESS_COMMAND_CENTER_EVENT }))
    expect(palette.visible).toBe(false)
  })
  it.each(['/settings/general', '/novel', '/workspace/chat', '/workspace/history'])('retains the existing Vue palette outside React: %s', path => {
    route.currentRoute.value.path = path
    const palette = useCommandPaletteStore(); palette.open()
    expect(palette.visible).toBe(true); expect(window.dispatchEvent).not.toHaveBeenCalled()
    palette.close(); expect(palette.visible).toBe(false)
  })
  it('clears a previously visible Vue palette when the active application changes to React', () => {
    route.currentRoute.value.path = '/settings/general'; const palette = useCommandPaletteStore(); palette.open()
    route.currentRoute.value.path = '/workspace/harness-react'; palette.open()
    expect(palette.visible).toBe(false); expect(window.dispatchEvent).toHaveBeenCalledOnce()
  })
  it('does not divert similarly named or nested routes to a nonexistent frame', () => {
    expect(openHarnessCommandCenter('/workspace/harness-react-other', window)).toBe(false)
    expect(openHarnessCommandCenter('/workspace/harness-react/other', window)).toBe(false)
    expect(window.dispatchEvent).not.toHaveBeenCalled()
  })
})
