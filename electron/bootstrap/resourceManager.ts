// Sampling and standalone window approach adapted from ZCode (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
import { app, BrowserWindow, shell } from 'electron'
import os from 'node:os'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { MiraStorageSnapshot } from '../../src/config/resourceManager'
import { insideResourceRoot } from './resourceStorage'
import { createResourceNetwork } from './resourceNetwork'
import { join } from 'node:path'
import type { MiraResourceSnapshot } from '../../src/config/resourceManager'

let instance: BrowserWindow | null = null
const network = createResourceNetwork()
let storageScan: AbortController | undefined
let storagePaths = new Set<string>()
let quitting = false
let previousCpu: { busy: number; total: number } | undefined

export function stopResourceManager() {
  quitting = true
  network.stop(); storageScan?.abort(); storagePaths.clear()
  previousCpu = undefined
}

export function openResourceManager() {
  if (quitting) return
  if (instance && !instance.isDestroyed()) {
    if (instance.isMinimized()) instance.restore()
    instance.show(); instance.focus()
    return
  }
  const window = new BrowserWindow({
    width: 900, height: 600, minWidth: 640, minHeight: 420,
    title: 'Mira 资源管理器', backgroundColor: '#1e1e1e', show: false,
    webPreferences: { preload: join(__dirname, '../preload/resourceManager.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  instance = window
  network.start()
  const appSession = window.webContents.session
  const requestObserver: NonNullable<Parameters<typeof window.webContents.session.webRequest.onBeforeRequest>[0]> = (details, callback) => {
    network.record(details.method, details.url, details.webContents?.getOSProcessId() ?? process.pid, details.webContentsId ? 'renderer' : 'main')
    callback({})
  }
  const stopObservation = () => { network.stop(); storageScan?.abort(); storagePaths.clear(); appSession.webRequest.onBeforeRequest(null) }
  window.webContents.on('render-process-gone', stopObservation)
  window.webContents.on('destroyed', stopObservation)
  appSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, requestObserver)
  previousCpu = undefined
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => { if (!quitting && !window.isDestroyed()) window.show() })
  window.on('closed', () => { if (instance === window) { instance = null; previousCpu = undefined; stopObservation() } })
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key.toLowerCase() === 'w' && (process.platform === 'darwin' ? input.meta : input.control)) { event.preventDefault(); window.close() }
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/resource-manager.html`)
  else void window.loadFile(join(__dirname, '../renderer/resource-manager.html'))
}

export function isResourceManagerWindow(window: BrowserWindow) { return instance === window }

export function getResourceSnapshot(senderId: number): MiraResourceSnapshot {
  authorizeResources(senderId)
  const cpus = os.cpus()
  let busy = 0, total = 0
  for (const cpu of cpus) for (const [key, time] of Object.entries(cpu.times)) { total += time; if (key !== 'idle') busy += time }
  const baseline = previousCpu
  previousCpu = { busy, total }
  const cpuPercent = baseline && total > baseline.total ? Math.max(0, Math.min(100, 100 * (busy - baseline.busy) / (total - baseline.total))) : null
  const memoryTotalBytes = os.totalmem()
  const renderers = new Map(BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).map(window => [window.webContents.getOSProcessId(), window === instance ? '资源管理器' : 'Mira 工作台']))
  const names: Record<string, string> = { Browser: 'Mira 主进程', GPU: '图形处理', Tab: 'Mira 页面', Utility: '后台服务', 'Zygote': '进程服务' }
  return {
    sampledAt: Date.now(), system: { cpuPercent, memoryTotalBytes, memoryUsedBytes: Math.max(0, memoryTotalBytes - os.freemem()) },
    processes: app.getAppMetrics().map(metric => ({
      pid: metric.pid, category: 'base', name: renderers.get(metric.pid) ?? names[metric.type] ?? metric.name ?? metric.type,
      cpuPercent: Math.max(0, metric.cpu.percentCPUUsage / (process.platform === 'linux' ? Math.max(1, cpus.length) : 1)),
      memoryBytes: metric.memory.workingSetSize * 1024,
    })),
  }
}

export function authorizeResources(senderId: number) {
  if (quitting || !instance || instance.isDestroyed() || senderId !== instance.webContents.id) throw new Error('资源采样不可用')
}
export async function getResourceStorage(senderId: number) {
  authorizeResources(senderId)
  storageScan?.abort()
  const controller = new AbortController(); storageScan = controller
  const snapshot = await new Promise<MiraStorageSnapshot>((resolveSnapshot, reject) => {
    const worker = new Worker(join(__dirname, 'resourceStorage.worker.js'), { workerData: { root: app.getPath('userData') } })
    const abort = () => { void worker.terminate(); reject(new Error('扫描已取消')) }
    controller.signal.addEventListener('abort', abort, { once: true })
    worker.once('message', (message: { ok: boolean; snapshot: MiraStorageSnapshot }) => {
      if (message.ok) resolveSnapshot(message.snapshot); else reject(new Error('计算失败'))
    })
    worker.once('error', reject)
    worker.once('exit', code => { controller.signal.removeEventListener('abort', abort); if (code !== 0) reject(new Error('计算失败')) })
  })
  authorizeResources(senderId)
  storagePaths = new Set(snapshot.categories.flatMap(category => category.entries.map(entry => entry.path)))
  return snapshot
}
export function cancelResourceStorage(senderId: number) { authorizeResources(senderId); storageScan?.abort() }
export function revealResourceStorage(senderId: number, path: unknown) {
  authorizeResources(senderId)
  if (typeof path !== 'string' || !insideResourceRoot(app.getPath('userData'), resolve(path)) || !storagePaths.has(path)) throw new Error('数据路径无效')
  shell.showItemInFolder(path)
}
export function getResourceNetwork(senderId: number) { authorizeResources(senderId); return network.snapshot() }
export function clearResourceNetwork(senderId: number) { authorizeResources(senderId); network.clear() }
