import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => {
  let release!: () => void
  let pending: Promise<void>
  const reset = () => { pending = new Promise<void>(resolve => { release = resolve }) }
  reset()
  const closed = new Map<object, Function>()
  const window = { isDestroyed: () => false, hide: vi.fn(), once: vi.fn((event: string, handler: Function) => { if (event === 'closed') closed.set(window, handler) }), webContents: { send: vi.fn() } }
  return { reset, release: () => release(), closed, windows: [window], events: new Map<string, Function>(), window, show: vi.fn(), stop: vi.fn(async () => {}), dispose: vi.fn(() => pending), quit: vi.fn(), exit: vi.fn() }
})
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/tmp/mira-shutdown-test', setPath: vi.fn(), whenReady: () => Promise.resolve(), on: (event: string, handler: Function) => fixture.events.set(event, handler), quit: fixture.quit, exit: fixture.exit },
  BrowserWindow: { getAllWindows: () => fixture.windows },
}))
vi.mock('../electron/services/platformServices', () => ({ createPlatformServices: async () => ({
  database: { getSnapshot: () => ({ preferences: {} }), modelTrace: { flush: vi.fn(async () => {}) } },
  localMicroAppServer: { getApiBaseUrl: () => 'http://127.0.0.1:1/', stop: fixture.stop },
  automationScheduler: { stop: vi.fn() }, workspaceHtml: { closeAll: vi.fn() }, workspaceMedia: { closeAll: vi.fn() },
  harnessRuntime: { disposeCommandJobs: fixture.dispose }, miraFlowController: { dispose: vi.fn(async () => {}) },
  mcpManager: { closeAll: vi.fn(async () => {}) }, mcpAuthorization: { closeAll: vi.fn(async () => {}) },
}) }))
vi.mock('../electron/storage/miraPaths', () => ({ MiraPaths: class { ensure() { return { root: '/tmp/mira-shutdown-test' } } } }))
vi.mock('../electron/bootstrap/windowManager', () => ({ createMainWindow: vi.fn(), destroyTray: vi.fn(), setupApplicationMenu: vi.fn(), setupDevelopmentDockIcon: vi.fn(), setupWindowsTray: vi.fn(), showMainWindow: fixture.show }))
vi.mock('../electron/services/harnessTerminalSessions', () => ({ HarnessTerminalSessions: class { closeAll() {} } }))
vi.mock('../electron/services/harnessWorkspaceWatch', () => ({ HarnessWorkspaceWatch: class { closeAll() {} } }))
vi.mock('../electron/ipc/platformIpc', () => ({ registerPlatformIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/windowIpc', () => ({ registerWindowIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/novelIpc', () => ({ registerNovelIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/automationIpc', () => ({ registerAutomationIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/mcpIpc', () => ({ registerMcpIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/modelIpc', () => ({ registerModelIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/harnessProjectIpc', () => ({ registerHarnessProjectIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/harnessSessionIpc', () => ({ registerHarnessSessionIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/harnessWorkspaceIgnoreIpc', () => ({ registerHarnessWorkspaceIgnoreIpcHandlers: vi.fn() }))
vi.mock('../electron/ipc/miraFlowIpc', () => ({ registerMiraFlowIpc: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  fixture.reset()
  fixture.closed.clear()
  fixture.windows = [fixture.window]
})

it('hides the window before cleanup and rejects Dock activation while quitting', async () => {
  await import('../electron/main')
  await Promise.resolve()
  fixture.events.get('activate')!()
  expect(fixture.show).toHaveBeenCalledOnce()
  const event = { preventDefault: vi.fn() }
  fixture.events.get('before-quit')!(event)
  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(fixture.window.hide).toHaveBeenCalledOnce()
  expect(fixture.dispose).toHaveBeenCalledOnce()
  expect(fixture.stop).not.toHaveBeenCalled()
  fixture.events.get('activate')!()
  expect(fixture.show).toHaveBeenCalledOnce()
  fixture.events.get('before-quit')!({ preventDefault: vi.fn() })
  expect(fixture.dispose).toHaveBeenCalledOnce()
  fixture.release()
  for (let i = 0; i < 15; i++) await Promise.resolve()
  expect(fixture.stop).toHaveBeenCalledOnce()
  expect(fixture.quit).toHaveBeenCalledOnce()
})

it('exits after cleanup and the last window closes when macOS does not finish the resumed quit', async () => {
  await import('../electron/main')
  await Promise.resolve()
  const second = { ...fixture.window, once: vi.fn((event: string, handler: Function) => { if (event === 'closed') fixture.closed.set(second, handler) }) }
  fixture.windows.push(second)
  fixture.events.get('before-quit')!({ preventDefault: vi.fn() })
  expect(fixture.exit).not.toHaveBeenCalled()
  fixture.release()
  for (let i = 0; i < 15; i++) await Promise.resolve()
  expect(fixture.quit).toHaveBeenCalledOnce()
  expect(fixture.exit).not.toHaveBeenCalled()
  const resumed = { preventDefault: vi.fn() }
  fixture.events.get('before-quit')!(resumed)
  expect(resumed.preventDefault).not.toHaveBeenCalled()
  fixture.windows = [second]
  fixture.closed.get(fixture.window)?.()
  expect(fixture.exit).not.toHaveBeenCalled()
  fixture.windows = []
  fixture.closed.get(second)?.()
  expect(fixture.exit).toHaveBeenCalledExactlyOnceWith(0)
})

it('exits after cleanup without another quit when no windows remain', async () => {
  await import('../electron/main')
  await Promise.resolve()
  fixture.windows = []
  fixture.events.get('before-quit')!({ preventDefault: vi.fn() })
  expect(fixture.exit).not.toHaveBeenCalled()
  fixture.release()
  for (let i = 0; i < 15; i++) await Promise.resolve()
  expect(fixture.exit).toHaveBeenCalledExactlyOnceWith(0)
  expect(fixture.quit).not.toHaveBeenCalled()
})
