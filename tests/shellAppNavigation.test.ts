import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, reactive } from 'vue'
import App from '../src/app/App.vue'
import Layout from '../src/layouts/index.vue'
import { useAppNavigationStore } from '../src/stores/appNavigation'
import { createVueNodeRenderer, withVueClientRender } from './helpers/vueNodeRenderer'

const environment = vi.hoisted(() => ({ route: { path: '/workspace/harness-react', fullPath: '/workspace/harness-react', query: {} }, push: vi.fn(), search: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute: { value: environment.route }, push: environment.push }), useRoute: () => environment.route }))
vi.mock('@/stores/theme', () => ({ useThemeStore: () => ({}) }))
vi.mock('@/stores/layout', () => ({ useLayoutStore: () => ({ config: { componentSize: 'default' } }) }))
vi.mock('@/stores/harness', () => ({ useHarnessStore: () => ({ applyEvent: vi.fn() }) }))
vi.mock('@/stores/commandPalette', () => ({ useCommandPaletteStore: () => ({ open: environment.search }) }))
vi.mock('@/platform', () => ({ getPlatformApi: () => undefined }))
vi.mock('@/hooks/useLoading', () => ({ useLoading: () => ({ active: { value: false }, text: { value: '' } }) }))
vi.mock('@/config/runtime', () => ({ applications: [{ code: 'main', name: 'Mira Harness' }], findRuntimeMicroApp: () => undefined }))
vi.mock('@/config/navigation', () => ({ getAppCodeFromPath: () => 'main', getApplicationEntryPath: () => '/workspace/harness-react', navigateToPath: vi.fn() }))
vi.mock('@/components/AppErrorBoundary.vue', async () => { const { h } = await import('vue'); return { default: { setup: (_props: unknown, { slots }: { slots: { default?: () => unknown } }) => () => h('div', slots.default?.() as never) } } })
vi.mock('@/components/AppLoadingOverlay.vue', () => ({ default: { render: () => null } }))
vi.mock('@/layouts/components/AppMain.vue', () => ({ default: { render: () => null } }))
vi.mock('@/layouts/components/WindowsTitlebar.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/SearchBar/index.vue', () => ({ default: { render: () => null } }))

const ActualApp = withVueClientRender(App, new URL('../src/app/App.vue', import.meta.url))
const ActualLayout = withVueClientRender(Layout, new URL('../src/layouts/index.vue', import.meta.url))
const mounts: { unmount(): void }[] = []
let documentEvents: EventTarget, modals: { selector: string; getClientRects(): unknown[] }[]
const components = {
  RouterView: { render: () => null }, AppIcon: { render: () => null },
  ElConfigProvider: defineComponent({ props: ['size'], setup: (_props, { slots }) => () => slots.default?.() }),
  ElPopover: defineComponent({ props: ['visible'], setup: (props, { slots }) => () => h('div', [slots.reference?.(), props.visible ? slots.default?.() : null]) }),
  ElTooltip: defineComponent({ props: ['content'], setup: (props, { slots }) => () => h('span', { 'data-tooltip': props.content }, slots.default?.()) }),
}
const navigationState = (overrides = {}) => ({ type: 'mira:app-navigation-state', revision: 2, canGoBack: true, canGoForward: true, busy: false, snapshot: { entries: [{ kind: 'conversation', sessionId: 'a' }, { kind: 'extensions' }], cursor: 1, detached: false }, ...overrides })
function mount(component: typeof ActualApp) {
  const renderer = createVueNodeRenderer(), { app } = renderer.mount(component, {}, components)
  mounts.push(app); return renderer
}
function key(overrides: Record<string, unknown> = {}) {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key: '[', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false, repeat: false, keyCode: 0, ...overrides })
  documentEvents.dispatchEvent(event); return event
}
function connect() {
  const store = useAppNavigationStore(), send = vi.fn(() => true), owner = store.register('mira-harness', send)
  owner.receive(navigationState()); return { store, send, owner }
}

beforeEach(() => {
  setActivePinia(createPinia()); environment.route = reactive({ path: '/workspace/harness-react', fullPath: '/workspace/harness-react', query: {} })
  environment.push.mockClear(); environment.search.mockClear(); modals = []
  documentEvents = new EventTarget()
  vi.stubGlobal('document', Object.assign(documentEvents, { querySelectorAll: (selectors: string) => modals.filter(node => selectors.split(',').map(value => value.trim()).includes(node.selector)) }))
  vi.stubGlobal('navigator', { platform: 'MacIntel' })
  vi.stubGlobal('window', { platform: { windowChrome: 'macos-overlay', onWindowNavigate: () => () => undefined } })
})
afterEach(() => { for (const app of mounts.splice(0)) app.unmount(); vi.unstubAllGlobals() })

describe('Shell navigation shortcuts', () => {
  it.each([
    [{}, 'back'], [{ key: ']', metaKey: false, ctrlKey: true }, 'forward'], [{ key: 'å', code: 'BracketLeft' }, 'back'], [{ key: 'Dead', code: 'BracketRight' }, 'forward'],
  ])('dispatches the platform bracket shortcut %j once', (overrides, direction) => {
    if ('ctrlKey' in overrides) vi.stubGlobal('navigator', { platform: 'Win32' })
    mount(ActualApp); const { send } = connect(), event = key(overrides)
    expect(event.defaultPrevented).toBe(true); expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'mira:app-navigation-command', direction, expectedRevision: 2 })
    expect(key(overrides).defaultPrevented).toBe(false); expect(send).toHaveBeenCalledOnce()
  })

  it.each([{ metaKey: false }, { shiftKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { key: 'k' }])('does not claim unrelated, composing or modified keys %j', overrides => {
    mount(ActualApp); const { send } = connect(); expect(key(overrides).defaultPrevented).toBe(false); expect(send).not.toHaveBeenCalled()
  })

  it('does not override an event already consumed by another handler', () => {
    mount(ActualApp); const { send } = connect()
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: '[', metaKey: true, ctrlKey: false }); event.preventDefault()
    documentEvents.dispatchEvent(event); expect(send).not.toHaveBeenCalled()
  })

  it.each(['/novel', '/settings/general', '/workspace/chat', '/workspace/harness-react/nested', '/workspace/harness-react-other'])('does not navigate Harness from %s', path => {
    environment.route.path = path; mount(ActualApp); const { send } = connect()
    expect(key().defaultPrevented).toBe(false); expect(send).not.toHaveBeenCalled()
  })

  it.each(['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]', '[role="menu"]', '.el-dialog', '.el-drawer', '.mira-app-switcher-popper'])('preserves keyboard ownership of a visible %s overlay', selector => {
    mount(ActualApp); const { send } = connect(); modals = [{ selector, getClientRects: () => [{}] }]
    expect(key().defaultPrevented).toBe(false); expect(send).not.toHaveBeenCalled()
  })

  it('checks later visible overlays and ignores hidden ones', () => {
    mount(ActualApp); const { send, owner } = connect()
    modals = [{ selector: '[role="dialog"]', getClientRects: () => [] }, { selector: '[role="menu"]', getClientRects: () => [{}] }]
    expect(key().defaultPrevented).toBe(false); expect(send).not.toHaveBeenCalled()
    modals = [{ selector: '[role="dialog"]', getClientRects: () => [] }]; expect(key().defaultPrevented).toBe(true)
    owner.receive(navigationState({ revision: 3 })); modals = []
    expect(key({ key: ']' }).defaultPrevented).toBe(true); expect(send).toHaveBeenCalledTimes(2)
  })

  it('uses Cmd on macOS and Ctrl on Windows without accepting the opposite modifier', () => {
    mount(ActualApp); const { send } = connect()
    expect(key({ metaKey: false, ctrlKey: true }).defaultPrevented).toBe(false)
    vi.stubGlobal('navigator', { platform: 'Win32' }); expect(key().defaultPrevented).toBe(false)
    expect(key({ metaKey: false, ctrlKey: true }).defaultPrevented).toBe(true); expect(send).toHaveBeenCalledOnce()
  })

  it('leaves unavailable and failed commands unclaimed, then removes its listener on unmount', () => {
    const renderer = mount(ActualApp)
    expect(key().defaultPrevented).toBe(false)
    const { owner, send } = connect(); owner.receive(navigationState({ canGoBack: false }))
    expect(key().defaultPrevented).toBe(false); expect(send).not.toHaveBeenCalled()
    owner.receive(navigationState()); send.mockReturnValueOnce(false)
    expect(key().defaultPrevented).toBe(false); expect(useAppNavigationStore().state?.busy).toBe(false)
    mounts.at(-1)!.unmount(); mounts.pop(); expect(key().defaultPrevented).toBe(false); expect(send).toHaveBeenCalledOnce(); expect(renderer.all()).toHaveLength(1)
  })

  it('preserves the existing settings shortcut and return route', () => {
    mount(ActualApp); connect(); expect(key({ key: ',' }).defaultPrevented).toBe(true)
    expect(environment.push).toHaveBeenCalledWith({ path: '/settings/general', query: { from: '/workspace/harness-react' } })
  })
})

describe('Shell navigation controls', () => {
  it('waits for the current frame state, then disables both arrows during a pending replay', async () => {
    const renderer = mount(ActualLayout)
    const arrows = () => renderer.all().filter(node => node.type === 'button' && ['后退', '前进'].includes(node.props['aria-label'] as string))
    expect(arrows()).toHaveLength(0)
    const { store, send, owner } = connect(); await nextTick()
    expect(arrows().map(node => node.props.disabled)).toEqual([false, false])
    expect(renderer.all().some(node => node.props['data-tooltip'] === '后退 (⌘[)')).toBe(true)
    ;(arrows()[0].props.onClick as () => void)(); await nextTick()
    expect(send).toHaveBeenCalledOnce(); expect(store.state?.busy).toBe(true); expect(arrows().map(node => node.props.disabled)).toEqual([true, true])
    owner.receive(navigationState({ revision: 3, canGoBack: false, canGoForward: true })); await nextTick()
    expect(arrows().map(node => node.props.disabled)).toEqual([true, false])
    environment.route.path = '/novel'; await nextTick(); expect(arrows()).toHaveLength(0)
    environment.route.path = '/settings/general'; await nextTick(); expect(arrows()).toHaveLength(0)
    environment.route.path = '/workspace/harness-react'; await nextTick(); expect(arrows()).toHaveLength(2)
    owner.reset(); await nextTick(); expect(arrows()).toHaveLength(0)
  })

  it('labels Windows shortcuts correctly while preserving the global search and settings actions', async () => {
    window.platform!.windowChrome = 'windows-overlay'
    const renderer = mount(ActualLayout); connect()
    await nextTick(); expect(renderer.all().some(node => node.props['data-tooltip'] === '后退 (Ctrl+[)')).toBe(true)
    const buttons = renderer.all().filter(node => node.type === 'button')
    ;(buttons.find(node => node.props['aria-label'] === '全局搜索')!.props.onClick as () => void)(); expect(environment.search).toHaveBeenCalledOnce()
    ;(buttons.find(node => node.props['aria-label'] === '设置')!.props.onClick as () => void)()
    expect(environment.push).toHaveBeenCalledWith({ path: '/settings/general', query: { from: '/workspace/harness-react' } })
  })
})
