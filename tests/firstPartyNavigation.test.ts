import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { HARNESS_WORKBENCH_PATH, navigateHarnessHost, parseFirstPartyNavigationPath, resolveHarnessNavigationPath, resolveSettingsReturnPath } from '../src/platform/firstPartyNavigation'

function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [HARNESS_WORKBENCH_PATH, '/settings/general', '/settings/mcp', '/settings/personalization', '/workspace/usage'].map(path => ({ path, component: {} })),
  })
}

describe('first-party Harness navigation', () => {
  it.each(['/settings/general', '/settings/mcp', '/settings/personalization', '/settings/model-config', '/settings/keyboard-shortcuts'])('opens the existing settings route and retains its React return path: %s', path => {
    const target = new URL(resolveHarnessNavigationPath(path), 'https://mira.invalid')
    expect(target.pathname).toBe(path)
    expect(target.searchParams.get('from')).toBe(HARNESS_WORKBENCH_PATH)
    expect(resolveSettingsReturnPath(target.searchParams.get('from'))).toBe(HARNESS_WORKBENCH_PATH)
  })

  it('preserves an explicitly encoded return path, including the original application query', () => {
    const from = '/workspace/chat?draft=unsent%20text'
    const path = `/settings/personalization?from=${encodeURIComponent(from)}`
    expect(parseFirstPartyNavigationPath(path).pathname).toBe('/settings/personalization')
    const target = new URL(resolveHarnessNavigationPath(path), 'https://mira.invalid')
    expect(target.searchParams.get('from')).toBe(from)
    expect(resolveSettingsReturnPath(target.searchParams.get('from'))).toBe(from)
  })

  it('opens the real usage route and preserves the supported history query', () => {
    expect(resolveHarnessNavigationPath('/workspace/usage')).toBe('/workspace/usage')
    expect(resolveHarnessNavigationPath('/workspace/history?q=notes&archive=archived&sort=created-desc&page=2')).toBe('/workspace/history?q=notes&archive=archived&sort=created-desc&page=2')
  })

  it.each([
    '/system/menus', '/settings/unknown', '/workspace/harness-react?injected=1',
    '/settings/general?token=private', '/settings/general?from=//example.com',
    '/settings/general?from=%2F..%2Fsettings', '/settings/general?from=%2Fsettings%2Fmcp',
    '/settings/general?from=%2Fworkspace%2Fchat&from=%2Fworkspace%2Fharness-react',
    '/workspace/usage#injected', '/workspace/usage?q=1', '/settings/general?from=%00',
    '/%2fsettings/general', '/workspace/../settings/general',
  ])('rejects unsupported targets and parameters without redirecting: %s', async path => {
    const push = vi.fn(async () => undefined)
    await expect(navigateHarnessHost({ push }, path)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(push).not.toHaveBeenCalled()
  })

  it.each([undefined, null, ['', HARNESS_WORKBENCH_PATH], '//example.com', '/../../settings', '/settings/general', '/workspace\\chat', '/workspace/chat\n'])('uses the React application as the default for an invalid settings return path: %j', from => {
    expect(resolveSettingsReturnPath(from)).toBe(HARNESS_WORKBENCH_PATH)
  })

  it('awaits the real route guard instead of acknowledging a pending or blocked navigation', async () => {
    const hostRouter = router()
    await hostRouter.push(HARNESS_WORKBENCH_PATH)
    let finishSave!: (saved: boolean) => void
    hostRouter.beforeEach(to => to.path === '/settings/general' ? new Promise<boolean>(resolve => { finishSave = resolve }) : true)
    let settled = false
    const pending = navigateHarnessHost(hostRouter, '/settings/general').finally(() => { settled = true })
    await vi.waitFor(() => expect(finishSave).toBeTypeOf('function'))
    expect(settled).toBe(false)
    expect(hostRouter.currentRoute.value.path).toBe(HARNESS_WORKBENCH_PATH)
    finishSave(false)
    await expect(pending).rejects.toMatchObject({ code: 'NAVIGATION_FAILED' })
    expect(hostRouter.currentRoute.value.path).toBe(HARNESS_WORKBENCH_PATH)
  })

  it('retains the return path across settings sections and returns to React', async () => {
    const hostRouter = router()
    await hostRouter.push(HARNESS_WORKBENCH_PATH)
    await navigateHarnessHost(hostRouter, '/settings/mcp')
    expect(hostRouter.currentRoute.value.path).toBe('/settings/mcp')
    await hostRouter.replace({ path: '/settings/personalization', query: hostRouter.currentRoute.value.query })
    expect(hostRouter.currentRoute.value.query.from).toBe(HARNESS_WORKBENCH_PATH)
    await hostRouter.replace(resolveSettingsReturnPath(hostRouter.currentRoute.value.query.from))
    expect(hostRouter.currentRoute.value.path).toBe(HARNESS_WORKBENCH_PATH)
  })

  it('accepts the current target without treating an already completed navigation as a failure', async () => {
    const hostRouter = router()
    await hostRouter.push(HARNESS_WORKBENCH_PATH)
    await expect(navigateHarnessHost(hostRouter, HARNESS_WORKBENCH_PATH)).resolves.toBeUndefined()
  })
})
