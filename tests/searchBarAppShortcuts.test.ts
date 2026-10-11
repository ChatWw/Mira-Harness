// @vitest-environment happy-dom
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, defineComponent, h, nextTick, ssrContextKey, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchBar from '../src/components/SearchBar/index.vue'
import { useCommandPaletteStore } from '../src/stores/commandPalette'
import { HARNESS_COMMAND_CENTER_EVENT } from '../src/platform/harnessCommandCenter'
import { withVueClientRender } from './helpers/vueNodeRenderer'

const route = vi.hoisted(() => ({ currentRoute: { value: { path: '/workspace/harness-react', fullPath: '/workspace/harness-react' } }, push: vi.fn() }))
vi.mock('@/router', () => ({ default: route }))
vi.mock('vue-router', () => ({ useRouter: () => route }))
vi.mock('@/platform', () => ({ getPreference: (_key: string, fallback: unknown) => fallback, savePreference: vi.fn() }))
vi.mock('@/stores/layout', () => ({ useLayoutStore: () => ({ config: { themeTransitionAnimation: false } }) }))
vi.mock('@/stores/theme', () => ({ useThemeStore: () => ({ themeMode: 'light', toggleThemeModeWithTransition: vi.fn() }) }))
vi.mock('@/config/commandPalette', () => ({ findCommandNavigation: () => undefined, getCommandNavigationItems: () => [] }))
vi.mock('@/config/navigation', () => ({ navigateToPath: vi.fn() }))

const Component = withVueClientRender(SearchBar, pathToFileURL(resolve('src/components/SearchBar/index.vue')))
let app: App | undefined
let removeHarnessListener: (() => void) | undefined
beforeEach(() => { setActivePinia(createPinia()); route.currentRoute.value.path = '/workspace/harness-react' })
afterEach(() => { app?.unmount(); app = undefined; removeHarnessListener?.(); removeHarnessListener = undefined; document.body.replaceChildren(); vi.restoreAllMocks() })

async function mount() {
  const pinia = createPinia(); setActivePinia(pinia)
  const palette = useCommandPaletteStore(), applicationSearch = vi.fn()
  window.addEventListener(HARNESS_COMMAND_CENTER_EVENT, applicationSearch)
  removeHarnessListener = () => window.removeEventListener(HARNESS_COMMAND_CENTER_EVENT, applicationSearch)
  const container = document.createElement('div'), shellButton = document.createElement('button')
  shellButton.textContent = 'Shell 全局搜索'; document.body.append(shellButton, container)
  app = createApp(Component); app.use(pinia); app.provide(ssrContextKey, {})
  app.component('el-dialog', defineComponent({ props: ['modelValue'], setup: (props, { slots }) => () => props.modelValue ? h('div', { role: 'dialog', 'aria-label': 'Shell 搜索' }, slots.default?.()) : null }))
  app.component('el-input', defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('input', { value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) }))
  app.component('el-button', { setup: (_, { slots }) => () => h('button', slots.default?.()) })
  app.component('el-empty', { render: () => null }); app.component('AppIcon', { render: () => null })
  app.mount(container); await nextTick(); shellButton.focus()
  const key = async (value: string, options: KeyboardEventInit = {}, consumed = false, legacyIme = false) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })
    if (consumed) event.preventDefault()
    if (legacyIme) Object.defineProperty(event, 'keyCode', { value: 229 })
    shellButton.dispatchEvent(event); await nextTick(); return event
  }
  return { container, palette, applicationSearch, key }
}

describe('Shell search shortcuts through the mounted Vue component', () => {
  it.each(['metaKey', 'ctrlKey'] as const)('routes K and Shift+P from Shell focus to one Harness search with %s', async modifier => {
    const view = await mount()
    for (const shortcut of [{ key: 'k' }, { key: 'P', shiftKey: true }]) {
      expect((await view.key(shortcut.key, { [modifier]: true, shiftKey: shortcut.shiftKey })).defaultPrevented).toBe(true)
      expect(view.palette.visible).toBe(false); expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    }
    expect(view.applicationSearch).toHaveBeenCalledTimes(2)
  })

  it('uses the existing Shell palette outside Harness and retains Escape dismissal', async () => {
    route.currentRoute.value.path = '/novel'
    const view = await mount()
    await view.key('p', { ctrlKey: true, shiftKey: true })
    expect(view.palette.visible).toBe(true); expect(view.container.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    await view.key('k', { metaKey: true })
    expect(view.container.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect((await view.key('Escape')).defaultPrevented).toBe(false)
    expect(view.palette.visible).toBe(false); expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(view.applicationSearch).not.toHaveBeenCalled()
  })

  it('ignores IME, repeat, Alt and already-consumed opening events for both bindings', async () => {
    const view = await mount()
    for (const shortcut of [{ key: 'k' }, { key: 'p', shiftKey: true }]) {
      const options = { ctrlKey: true, shiftKey: shortcut.shiftKey }
      for (const guard of [{ repeat: true }, { isComposing: true }, { altKey: true }]) expect((await view.key(shortcut.key, { ...options, ...guard })).defaultPrevented).toBe(false)
      expect((await view.key(shortcut.key, options, false, true)).defaultPrevented).toBe(false)
      await view.key(shortcut.key, options, true)
    }
    expect(view.applicationSearch).not.toHaveBeenCalled(); expect(view.palette.visible).toBe(false)
  })

  it('ignores nearby combinations and removes its listener when the Shell unmounts', async () => {
    const view = await mount()
    for (const shortcut of [{ key: 'k' }, { key: 'K', metaKey: true, shiftKey: true }, { key: 'p', ctrlKey: true }, { key: 'b', ctrlKey: true }, { key: 'p', shiftKey: true }]) expect((await view.key(shortcut.key, shortcut)).defaultPrevented).toBe(false)
    expect(view.applicationSearch).not.toHaveBeenCalled()
    app!.unmount(); app = undefined
    expect((await view.key('p', { metaKey: true, shiftKey: true })).defaultPrevented).toBe(false)
    expect((await view.key('k', { ctrlKey: true })).defaultPrevented).toBe(false)
    expect(view.applicationSearch).not.toHaveBeenCalled()
  })
})
