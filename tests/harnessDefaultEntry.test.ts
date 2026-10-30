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

let router: Router, syncBusinessRoutes: () => void
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
})
beforeEach(() => restoreRoutes())
afterAll(() => vi.unstubAllGlobals())

describe('official React Harness entry', () => {
  it.each(['/'])('opens the packaged React workbench directly from %s', async path => {
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
    '/workspace', '/workspace/chat', '/workspace/chat/old-session', '/workspace/projects',
    '/workspace/history', '/workspace/automations', '/workspace/usage',
    '/workspace/harness-pilot', '/workspace/harness-prototype',
    '/settings/python-environment', '/settings/git', '/settings/permissions',
    '/settings/appearance', '/settings/ai-novel', '/settings/unknown',
    '/system/components/loading', '/system/components/icon-selector', '/system/menus',
    '/system/micro-apps', '/system/backup-preferences',
  ])('does not expose the removed entry %s', async path => {
    await router.push(path)
    expect(router.currentRoute.value.name).toBe('NotFound')
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

})
