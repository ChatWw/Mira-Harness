import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import { defineComponent, getCurrentInstance, h } from 'vue'
import { applyPlatformSnapshot } from '../src/config/runtime'
import { getApplicationEntryPath } from '../src/config/navigation'
import { HARNESS_WORKBENCH_PATH, resolveSettingsReturnPath } from '../src/platform/firstPartyNavigation'
import type { MenuItem, PlatformSnapshot } from '../src/types'
import NotFoundPage from '../src/pages/exception/index.vue'
import { createVueNodeRenderer, withVueClientRender } from './helpers/vueNodeRenderer'

// Exercise the production route records without loading page components or browser history.
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: () => actual.createMemoryHistory(), createWebHashHistory: () => actual.createMemoryHistory() }
})

let router: Router, syncBusinessRoutes: () => void, applyManagementSnapshot: (snapshot: PlatformSnapshot) => void
const snapshot = (mainMenus: MenuItem[] = []): PlatformSnapshot => ({ mainMenus, microApps: [], preferences: {} })
function stubPages() {
  for (const record of router.getRoutes()) {
    if (record.components) record.components.default = { render: () => null }
  }
}
function restoreRoutes(mainMenus: MenuItem[] = []) {
  applyPlatformSnapshot(snapshot(mainMenus)); syncBusinessRoutes(); stubPages()
}
beforeAll(async () => {
  vi.stubGlobal('window', { platform: {}, location: { protocol: 'file:' } })
  ;({ default: router, syncBusinessRoutes } = await import('../src/router'))
  ;({ applyManagementSnapshot } = await import('../src/pages/backend/platformManagement'))
})
beforeEach(() => restoreRoutes())
afterAll(() => vi.unstubAllGlobals())

describe('official React Harness entry', () => {
  it.each(['/', '/workspace'])('opens the packaged React workbench directly from %s', async path => {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe(HARNESS_WORKBENCH_PATH)
    expect(router.currentRoute.value.name).toBe('HarnessReact')
    expect(router.currentRoute.value.matched.map(record => record.path)).toEqual(['/', HARNESS_WORKBENCH_PATH])
  })

  it.each(['main', 'mira-harness'])('uses the same official host when selecting %s', async code => {
    await router.push('/settings/general')
    await router.push(getApplicationEntryPath(code))
    expect(router.currentRoute.value.path).toBe(HARNESS_WORKBENCH_PATH)
    expect(router.currentRoute.value.name).toBe('HarnessReact')
  })

  it.each([
    '/workspace/chat/legacy%20session?source=history#reply',
    '/workspace/chat?draft=unsent%20text',
    '/workspace/history?q=notes&archive=archived&page=2',
    '/workspace/projects', '/workspace/automations', '/workspace/usage',
  ])('retains explicit legacy links and their session/draft identities: %s', async path => {
    await router.push(path)
    expect(router.currentRoute.value.fullPath).toBe(path)
    if (path.includes('/legacy%20session')) expect(router.currentRoute.value.params.id).toBe('legacy session')
  })

  it('keeps unknown links on the error page and defaults settings return to React', async () => {
    await router.push('/removed-entry')
    expect(router.currentRoute.value.name).toBe('NotFound')
    await router.push('/settings/general')
    await router.push(resolveSettingsReturnPath(undefined))
    expect(router.currentRoute.value.path).toBe(HARNESS_WORKBENCH_PATH)
  })

  it('returns from the real 404 button to React without a legacy intermediate page', async () => {
    await router.push('/404')
    const page = withVueClientRender(NotFoundPage, new URL('../src/pages/exception/index.vue', import.meta.url))
    const wrapper = defineComponent({ setup: () => {
      getCurrentInstance()!.appContext.config.globalProperties.$router = router
      return () => h(page)
    } })
    const renderer = createVueNodeRenderer()
    const { app } = renderer.mount(wrapper, {}, { ElButton: defineComponent({ setup: (_props, { attrs, slots }) => () => h('button', attrs, slots.default?.()) }) })
    try {
      await (renderer.all().find(node => node.type === 'button')!.props.onClick as () => Promise<unknown>)()
      expect(router.currentRoute.value.name).toBe('HarnessReact')
    } finally { app.unmount() }
  })

  it.each([
    HARNESS_WORKBENCH_PATH, '/workspace/chat/legacy%20session?source=history#reply',
    '/workspace/chat?draft=unsent%20text', '/workspace/history?q=notes&archive=archived',
    '/workspace/projects', '/workspace/automations', '/workspace/usage', '/settings/general', '/404',
  ])('does not redirect a valid static page after applying a settings snapshot: %s', async path => {
    await router.push(path)
    const replace = vi.spyOn(router, 'replace')
    try {
      applyManagementSnapshot(snapshot())
      expect(replace).not.toHaveBeenCalled()
      expect(router.currentRoute.value.fullPath).toBe(path)
    } finally { replace.mockRestore() }
  })

  it('returns a removed configurable page to the official React host', async () => {
    const removed: MenuItem = { id: 'retired-page', title: '旧页面', type: 'menu', path: '/retired-page', target: { type: 'component', componentKey: 'aiNovel' } }
    restoreRoutes([removed]); await router.push('/retired-page')
    expect(router.currentRoute.value.fullPath).toBe('/retired-page')
    applyManagementSnapshot(snapshot())
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(HARNESS_WORKBENCH_PATH))
    expect(router.currentRoute.value.name).toBe('HarnessReact')
  })

  it('retains a configurable page that remains present in the new snapshot', async () => {
    const retained: MenuItem = { id: 'retained-page', title: '保留页面', type: 'menu', path: '/retained-page', target: { type: 'component', componentKey: 'aiNovel' } }
    restoreRoutes([retained]); await router.push('/retained-page?chapter=3')
    const replace = vi.spyOn(router, 'replace')
    try {
      applyManagementSnapshot(snapshot([retained]))
      expect(replace).not.toHaveBeenCalled()
      expect(router.currentRoute.value.fullPath).toBe('/retained-page?chapter=3')
    } finally { replace.mockRestore() }
  })
})
