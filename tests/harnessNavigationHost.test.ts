import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import HarnessHost from '../src/pages/frontend/harness/react/index.vue'
import { useAppNavigationStore } from '../src/stores/appNavigation'
import { createVueNodeRenderer, withVueClientRender } from './helpers/vueNodeRenderer'
import type { MiraAppNavigationSnapshot } from '../src/platform/appNavigation'

const bridge = vi.hoisted(() => ({
  send: vi.fn(() => true), prepareLeave: vi.fn(async () => undefined), resolveUrl: vi.fn(async () => 'https://mira.test/apps/'),
  state: undefined as undefined | ((value: unknown) => void), reset: undefined as undefined | (() => void),
  frameProps: undefined as undefined | { active?: boolean; navigationSnapshot?: MiraAppNavigationSnapshot; toggleTheme?: () => Promise<'light' | 'dark'>; context?: { theme: 'light' | 'dark' } },
  themeToggle: vi.fn(), themeStore: undefined as undefined | { themeMode: 'light' | 'dark' },
  closeContext: vi.fn<() => Promise<boolean>>(async () => true), windowCommand: vi.fn(async (_action: string) => undefined),
  leave: undefined as undefined | (() => Promise<boolean>), update: undefined as undefined | (() => Promise<boolean>),
  route: { name: 'HarnessReact', fullPath: '/workspace/harness-react', query: {} as Record<string, string> },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute: { value: bridge.route } }), useRoute: () => bridge.route, onBeforeRouteLeave: (callback: () => Promise<boolean>) => { bridge.leave = callback }, onBeforeRouteUpdate: (callback: () => Promise<boolean>) => { bridge.update = callback } }))
vi.mock('@/platform', () => ({ getPlatformApi: () => ({ resolveLocalMicroAppUrl: bridge.resolveUrl, windowCommand: bridge.windowCommand }) }))
vi.mock('@/platform/firstPartyNavigation', () => ({ navigateHarnessHost: vi.fn() }))
vi.mock('@/stores/layout', () => ({ useLayoutStore: () => ({ config: { themeTransitionAnimation: false } }) }))
vi.mock('@/stores/theme', async () => {
  const { reactive } = await import('vue')
  const theme = reactive({ themeMode: 'light' as 'light' | 'dark', primaryColor: '#000', onPrimaryColor: '#fff', toggleThemeModeWithTransition: async () => { bridge.themeToggle(); theme.themeMode = theme.themeMode === 'light' ? 'dark' : 'light' } })
  bridge.themeStore = theme
  return { useThemeStore: () => theme }
})
vi.mock('@/pages/frontend/microAppHost/FirstPartyFrame.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ props: ['navigationSnapshot', 'url', 'toggleTheme', 'context', 'active'], emits: ['navigationState', 'navigationReset', 'error'], setup: (props, { emit, expose }) => {
    bridge.frameProps = props; bridge.state = value => emit('navigationState', value); bridge.reset = () => emit('navigationReset')
    expose({ navigateHistory: bridge.send, prepareLeave: bridge.prepareLeave, openCommandCenter: vi.fn(), closeContext: bridge.closeContext })
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
  bridge.route = reactive({ name: 'HarnessReact', fullPath: '/workspace/harness-react', query: {} as Record<string, string> })
  bridge.themeStore!.themeMode = 'light'; bridge.themeToggle.mockClear()
  bridge.closeContext.mockReset().mockResolvedValue(true); bridge.windowCommand.mockClear()
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('navigator', { language: 'zh-CN' })
})
afterEach(() => { for (const app of mounts.splice(0)) app.unmount(); vi.unstubAllGlobals() })

describe('Harness navigation across the Vue settings boundary', () => {
  it('leaves native close to the settings window while the workbench is retained', async () => {
    await mount(); bridge.route.name = 'SettingsGeneral'; await nextTick()
    expect(bridge.frameProps?.active).toBe(false)
    const event = new Event('mira:close-active-context', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(bridge.closeContext).not.toHaveBeenCalled()
  })
  it('claims native close and deduplicates it while the active resource is saving', async () => {
    await mount()
    let done!: (value: boolean) => void
    bridge.closeContext.mockReturnValueOnce(new Promise(resolve => { done = resolve }))
    const event = new Event('mira:close-active-context', { cancelable: true })
    window.dispatchEvent(event); window.dispatchEvent(new Event('mira:close-active-context', { cancelable: true }))
    expect(event.defaultPrevented).toBe(true); expect(bridge.closeContext).toHaveBeenCalledOnce(); expect(bridge.windowCommand).not.toHaveBeenCalled()
    done(true); await Promise.resolve(); await nextTick(); expect(bridge.windowCommand).not.toHaveBeenCalled()
    bridge.closeContext.mockResolvedValueOnce(false)
    window.dispatchEvent(new Event('mira:close-active-context', { cancelable: true })); await Promise.resolve(); await nextTick()
    expect(bridge.windowCommand).toHaveBeenCalledExactlyOnceWith('close')
  })
  it('keeps the window on failed save and discards a fallback acknowledgement after unmount', async () => {
    const { renderer, app } = await mount()
    bridge.closeContext.mockRejectedValueOnce(new Error('输入保存失败'))
    window.dispatchEvent(new Event('mira:close-active-context', { cancelable: true })); await Promise.resolve(); await nextTick()
    expect(bridge.windowCommand).not.toHaveBeenCalled(); expect(renderer.all().some(node => node.props.role === 'alert' && node.text === '输入保存失败')).toBe(true)
    let done!: (value: boolean) => void
    bridge.closeContext.mockReturnValueOnce(new Promise(resolve => { done = resolve }))
    window.dispatchEvent(new Event('mira:close-active-context', { cancelable: true })); app.unmount(); mounts.splice(mounts.indexOf(app), 1)
    done(false); await Promise.resolve(); await nextTick(); expect(bridge.windowCommand).not.toHaveBeenCalled()
    const event = new Event('mira:close-active-context', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(false)
  })
  it('wires the actual Harness route to the Shell theme owner and republishes its context', async () => {
    await mount()
    expect(bridge.frameProps?.context?.theme).toBe('light')
    expect(await bridge.frameProps?.toggleTheme?.()).toBe('dark'); await nextTick()
    expect(bridge.themeToggle).toHaveBeenCalledOnce(); expect(bridge.frameProps?.context?.theme).toBe('dark')
    expect(await bridge.frameProps?.toggleTheme?.()).toBe('light'); await nextTick()
    expect(bridge.frameProps?.context?.theme).toBe('light')
    expect(bridge.prepareLeave).not.toHaveBeenCalled(); expect(bridge.send).not.toHaveBeenCalled()
  })
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
