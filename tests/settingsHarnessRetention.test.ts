// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, onBeforeUnmount, onMounted, watch, type App } from 'vue'
import { createMemoryHistory, createRouter, onBeforeRouteLeave, RouterView, useRoute } from 'vue-router'
import AppRouterView from '../src/app/AppRouterView.vue'

const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()) })

async function fixture(initial = '/workspace/harness-react') {
  const mounted = vi.fn(), unmounted = vi.fn(), leave = vi.fn(() => true), paths: string[] = []
  const harness = defineComponent({ setup() {
    const route = useRoute()
    watch(() => route.path, path => paths.push(path), { immediate: true })
    onMounted(mounted); onBeforeUnmount(unmounted); onBeforeRouteLeave(leave)
    return () => h('div', { 'data-harness': true }, [h('input', { value: 'unsaved draft' }), h('iframe', { title: 'Harness' })])
  } })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { render: () => h(RouterView) }, children: [
      { path: 'workspace/harness-react', name: 'HarnessReact', component: harness },
      { path: 'novel', component: { render: () => h('p', 'Novel') } },
    ] },
    { path: '/settings/:section', component: { setup: () => { const route = useRoute(); return () => h('main', { 'data-settings': true }, route.params.section) } } },
  ] })
  await router.push(initial); await router.isReady()
  const container = document.createElement('div'); document.body.append(container)
  const app: App = createApp(AppRouterView); app.use(router); app.mount(container)
  cleanups.push(() => { app.unmount(); container.remove() })
  const go = async (path: string) => { const failure = await router.push(path); await nextTick(); return failure }
  return { router, container, mounted, unmounted, leave, paths, go }
}

describe('Harness settings round trips', () => {
  it('keeps the same iframe, draft and application route through multiple settings pages and returns', async () => {
    const view = await fixture(), iframe = view.container.querySelector('iframe'), input = view.container.querySelector('input')!
    input.value = 'draft typed before settings'
    for (let index = 0; index < 2; index++) {
      await view.go('/settings/general')
      const surface = view.container.querySelector('.app-route-surface')!
      expect(surface.classList.contains('app-route-surface--hidden')).toBe(true)
      expect(surface.hasAttribute('inert')).toBe(true)
      expect(surface.getAttribute('aria-hidden')).toBe('true')
      expect(view.container.querySelector('[data-settings]')?.textContent).toBe('general')
      await view.go('/settings/model-config')
      expect(view.container.querySelector('[data-settings]')?.textContent).toBe('model-config')
      expect(view.container.querySelector('iframe')).toBe(iframe)
      expect(view.paths).toEqual(['/workspace/harness-react'])
      await view.go('/workspace/harness-react')
      expect(view.container.querySelector('[data-settings]')).toBeNull()
      expect(surface.hasAttribute('inert')).toBe(false)
      expect(surface.classList.contains('app-route-surface--hidden')).toBe(false)
      expect(view.container.querySelector('iframe')).toBe(iframe)
      expect(view.container.querySelector('input')?.value).toBe('draft typed before settings')
    }
    expect(view.mounted).toHaveBeenCalledOnce(); expect(view.unmounted).not.toHaveBeenCalled()
    expect(view.leave).toHaveBeenCalledTimes(2)
  })

  it('honors a failed draft-save leave guard before showing settings', async () => {
    const view = await fixture(); view.leave.mockReturnValue(false)
    expect(await view.go('/settings/general')).toBeTruthy()
    expect(view.container.querySelector('[data-settings]')).toBeNull()
    expect(view.container.querySelector('iframe')).not.toBeNull()
    expect(view.unmounted).not.toHaveBeenCalled()
  })

  it('releases the retained workbench when leaving settings for another application', async () => {
    const view = await fixture()
    await view.go('/settings/general'); await view.go('/novel')
    expect(view.unmounted).toHaveBeenCalledOnce()
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(view.container.textContent).toBe('Novel')
  })

  it('opens settings directly without mounting a background workbench', async () => {
    const view = await fixture('/settings/general')
    expect(view.mounted).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-settings]')?.textContent).toBe('general')
    await view.go('/workspace/harness-react')
    expect(view.mounted).toHaveBeenCalledOnce()
    expect(view.container.querySelector('iframe')).not.toBeNull()
  })
})
