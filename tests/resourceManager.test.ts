import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ windows: [] as any[], cpus: [{ times: { user: 10, idle: 90 } }], metrics: [{ pid: 42, type: 'Browser', cpu: { percentCPUUsage: 3 }, memory: { workingSetSize: 2048 } }] }))
vi.mock('electron', () => ({
  app: { isPackaged: true, getAppMetrics: () => state.metrics },
  BrowserWindow: class {
    static getAllWindows() { return state.windows }
    callbacks: Record<string, Function> = {}
    id = state.windows.length + 1
    destroyed = false
    constructor(public options: any) { state.windows.push(this) }
    webContents = { id: 100 + this.id, getOSProcessId: () => 1000 + this.id, session: { webRequest: { onBeforeRequest: vi.fn() } }, on: vi.fn(), setWindowOpenHandler: vi.fn() }
    on(event: string, callback: Function) { this.callbacks[event] = callback }
    once(event: string, callback: Function) { this.callbacks[event] = callback }
    isDestroyed() { return this.destroyed }
    isMinimized() { return true }
    restore = vi.fn(); show = vi.fn(); focus = vi.fn(); loadFile = vi.fn(); loadURL = vi.fn()
  },
}))
vi.mock('node:os', () => ({ default: { cpus: () => state.cpus, totalmem: () => 8192, freemem: () => 2048 } }))
beforeEach(() => { vi.resetModules(); state.windows = []; state.cpus = [{ times: { user: 10, idle: 90 } }] })
it('opens one isolated window, restores it, closes and reopens, and blocks reopening during exit', async () => {
  const service = await import('../electron/bootstrap/resourceManager')
  service.openResourceManager()
  const window = state.windows[0]
  expect(window.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false })
  expect(window.loadFile.mock.calls[0][0]).toContain('resource-manager.html')
  window.callbacks['ready-to-show'](); expect(window.show).toHaveBeenCalledOnce()
  service.openResourceManager(); expect(state.windows).toHaveLength(1); expect(window.restore).toHaveBeenCalledOnce(); expect(window.focus).toHaveBeenCalledOnce()
  window.destroyed = true; window.callbacks.closed(); service.openResourceManager(); expect(state.windows).toHaveLength(2)
  service.stopResourceManager(); service.openResourceManager(); expect(state.windows).toHaveLength(2)
  const second = state.windows[1]; second.callbacks['ready-to-show'](); expect(second.show).not.toHaveBeenCalled()
})
it('restricts reads to the monitor and reports real CPU deltas and converts Electron KB to bytes', async () => {
  const service = await import('../electron/bootstrap/resourceManager')
  expect(() => service.getResourceSnapshot(101)).toThrow()
  service.openResourceManager()
  expect(() => service.getResourceSnapshot(999)).toThrow()
  const first = service.getResourceSnapshot(101)
  expect(first.system.cpuPercent).toBeNull()
  expect(first.processes[0]).toMatchObject({ pid: 42, cpuPercent: 3, memoryBytes: 2097152, name: 'Mira 主进程' })
  state.cpus = [{ times: { user: 30, idle: 170 } }]
  expect(service.getResourceSnapshot(101).system).toMatchObject({ cpuPercent: 20, memoryUsedBytes: 6144, memoryTotalBytes: 8192 })
  service.stopResourceManager(); expect(() => service.getResourceSnapshot(101)).toThrow()
})
