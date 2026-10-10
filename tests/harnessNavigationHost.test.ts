import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import HarnessHost from '../src/pages/frontend/harness/react/index.vue'
import { useAppNavigationStore } from '../src/stores/appNavigation'
import { createVueNodeRenderer, withVueClientRender } from './helpers/vueNodeRenderer'
import type { MiraAppNavigationSnapshot } from '../src/platform/appNavigation'

const bridge = vi.hoisted(() => ({
  send: vi.fn(() => true), prepareLeave: vi.fn(async () => undefined), resolveUrl: vi.fn(async () => 'https://mira.test/apps/'),
  state: undefined as undefined | ((value: unknown) => void), reset: undefined as undefined | (() => void),
  frameProps: undefined as undefined | { navigationSnapshot?: MiraAppNavigationSnapshot },
  leave: undefined as undefined | (() => Promise<boolean>),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({}), onBeforeRouteLeave: (callback: () => Promise<boolean>) => { bridge.leave = callback } }))
vi.mock('@/platform', () => ({ getPlatformApi: () => ({ resolveLocalMicroAppUrl: bridge.resolveUrl }) }))
vi.mock('@/platform/firstPartyNavigation', () => ({ navigateHarnessHost: vi.fn() }))
vi.mock('@/stores/theme', () => ({ useThemeStore: () => ({ themeMode: 'light', primaryColor: '#000', onPrimaryColor: '#fff' }) }))
vi.mock('@/pages/frontend/microAppHost/FirstPartyFrame.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['navigationSnapshot', 'url'], emits: ['navigationState', 'navigationReset', 'error'], setup: (props, { emit, expose }) => {
    bridge.frameProps = props; bridge.state = value => emit('navigationState', value); bridge.reset = () => emit('navigationReset')
    expose({ navigateHistory: bridge.send, prepareLeave: bridge.prepareLeave, openCommandCenter: vi.fn() })
    return () => h('div', { 'data-frame': true })
  } }) }
})
const Host = withVueClientRender(HarnessHost, new URL('../src/pages/frontend/harness/react/index.vue', import.meta.url))
const mounts: { unmount(): void }[] = []
const snapshot = (): MiraAppNavigationSnapshot => ({ entries: [{ kind: 'conversation', sessionId: 'a' }, { kind: 'automations', taskId: 'job-a', tab: 'history' }], cursor: 1, detached: true, draft: 'automations' })
const state = () => ({ type: 'mira:app-navigation-state', revision: 7, canGoBack: true, canGoForward: false, busy: false, snapshot: snapshot() })
async function mount() {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(Host, {}, { RouterLink: { render: () => null } })
  mounts.push(app); await Promise.resolve(); await nextTick()
  expect(bridge.frameProps).toBeDefined()
  return { app, renderer }
}
beforeEach(() => {
  setActivePinia(createPinia()); bridge.send.mockReset().mockReturnValue(true); bridge.prepareLeave.mockReset().mockResolvedValue(undefined); bridge.resolveUrl.mockClear()
  bridge.frameProps = undefined; bridge.state = undefined; bridge.reset = undefined; bridge.leave = undefined
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('navigator', { language: 'zh-CN' })
})
afterEach(() => { for (const app of mounts.splice(0)) app.unmount(); vi.unstubAllGlobals() })

describe('Harness navigation across the Vue settings boundary', () => {
  it('holds one initial snapshot for each host mount and restores the latest draft identity after settings', async () => {
    const store = useAppNavigationStore(), first = await mount()
    expect(bridge.frameProps?.navigationSnapshot).toBeUndefined(); expect(store.state).toBeNull()
    const oldState = bridge.state!
    bridge.state!(state()); expect(store.state?.revision).toBe(7)
    expect(bridge.frameProps?.navigationSnapshot).toBeUndefined()
    expect(await bridge.leave!()).toBe(true); expect(bridge.prepareLeave).toHaveBeenCalledOnce()
    first.app.unmount(); mounts.splice(mounts.indexOf(first.app), 1)
    expect(store.state).toBeNull(); expect(store.getSavedSnapshot('mira-harness')).toEqual(snapshot())
    bridge.frameProps = undefined; await mount()
    const initial = bridge.frameProps!.navigationSnapshot!
    expect(initial).toEqual(snapshot()); expect(initial.draft).toBe('automations'); expect(store.state).toBeNull()
    oldState({ ...state(), revision: 99 }); expect(store.state).toBeNull()
    bridge.state!({ ...state(), revision: 0, snapshot: { entries: [{ kind: 'extensions' }], cursor: 0, detached: false } })
    expect(store.state?.revision).toBe(0); expect(bridge.frameProps!.navigationSnapshot).toBe(initial); expect(initial).toEqual(snapshot())
  })

  it('routes commands to the live frame and hides its state on connection invalidation', async () => {
    await mount(); const store = useAppNavigationStore()
    bridge.state!(state()); expect(store.go('back')).toBe(true)
    expect(bridge.send).toHaveBeenCalledExactlyOnceWith({ type: 'mira:app-navigation-command', direction: 'back', expectedRevision: 7 })
    bridge.reset!(); expect(store.state).toBeNull(); expect(store.go('back')).toBe(false)
    expect(store.getSavedSnapshot('mira-harness')).toEqual(snapshot())
    bridge.state!({ ...state(), revision: 0 }); expect(store.go('back')).toBe(true)
  })

  it('retains the current frame and reports a draft-save failure instead of leaving for settings', async () => {
    const { renderer } = await mount(), store = useAppNavigationStore()
    bridge.state!(state()); bridge.prepareLeave.mockRejectedValueOnce(new Error('save blocked'))
    expect(await bridge.leave!()).toBe(false); await nextTick()
    expect(renderer.all().some(node => node.props.role === 'alert' && node.text === 'save blocked')).toBe(true)
    expect(store.state?.revision).toBe(7)
    expect(await bridge.leave!()).toBe(true); await nextTick()
    expect(renderer.all().some(node => node.props.role === 'alert')).toBe(false)
  })
})
