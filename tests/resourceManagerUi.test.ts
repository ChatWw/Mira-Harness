// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import ResourceManager from '../src/resource-manager/ResourceManager.vue'
let app: App | undefined, container: HTMLDivElement | undefined
afterEach(() => { app?.unmount(); container?.remove(); vi.unstubAllGlobals(); vi.useRealTimers() })
it('uses the ZCode groups and a single metric column, keeps groups collapsible, and pauses usage polling on storage', async () => {
  vi.useFakeTimers()
  const snapshot = { system: { cpuPercent: 20, memoryUsedBytes: 4096, memoryTotalBytes: 8192 }, processes: [{ pid: 1, name: 'Mira 主进程', cpuPercent: 2, memoryBytes: 2048 }] }
  const getSnapshot = vi.fn(async () => snapshot), scan = vi.fn(async () => ({ root: '/data', totalBytes: 0, finishedAt: 1, volume: null, errors: 0, categories: [] })), cancel = vi.fn(async () => undefined)
  vi.stubGlobal('window', Object.assign(window, { resourceManager: { getSnapshot, storage: { scan, cancel, reveal: vi.fn() }, network: { getSnapshot: vi.fn(async () => ({ records: [], dropped: 0 })), clear: vi.fn() } } }))
  container = document.createElement('div'); document.body.append(container); app = createApp(ResourceManager); app.mount(container)
  await nextTick(); await nextTick()
  expect(container.querySelectorAll('.usage-group')).toHaveLength(3)
  expect(container.querySelector('.process-heading')?.textContent).toBe('进程PIDCPU')
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  buttons[1].click(); await nextTick()
  expect(container.querySelector('.process-heading')?.textContent).toBe('进程PID内存')
  container.querySelector<HTMLButtonElement>('.group-heading')!.click(); await nextTick()
  expect(container.querySelector('[data-testid=resource-manager-group-base] .process-row')).toBeNull()
  buttons[2].click(); await nextTick(); await nextTick(); expect(scan).toHaveBeenCalledOnce()
  const count = getSnapshot.mock.calls.length; await vi.advanceTimersByTimeAsync(3000); expect(getSnapshot).toHaveBeenCalledTimes(count)
  buttons[0].click(); await nextTick(); expect(cancel).toHaveBeenCalledOnce(); expect(getSnapshot).toHaveBeenCalledTimes(count + 1)
})
