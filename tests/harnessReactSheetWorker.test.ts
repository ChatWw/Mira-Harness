// @vitest-environment happy-dom
import { Blob as NodeBlob } from 'node:buffer'
import { runInNewContext } from 'node:vm'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMiraSheetWorker } from '../apps/harness-react/src/lib/mira-sheet-worker'
import { miraSheetIntegration } from '../scripts/build-harness-react.mjs'

const blobs = new Map<string, NodeBlob>()
let nativeFailure = false
class LocalWorker extends EventTarget {
  static latest: LocalWorker
  nativeTerminate = vi.fn()
  terminate = this.nativeTerminate
  constructor(readonly url: string, readonly options: WorkerOptions) {
    super()
    if (nativeFailure) throw new Error('Worker denied')
    LocalWorker.latest = this
  }
}
let revoke: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers(); nativeFailure = false; blobs.clear()
  revoke = vi.fn((url: string) => blobs.delete(url))
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('Worker', LocalWorker)
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(blob: NodeBlob) { const url = `blob:mira-sheet-${blobs.size}`; blobs.set(url, blob); return url }
    static revokeObjectURL = revoke
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

async function parserScope(worker: LocalWorker) {
  const source = await blobs.get(worker.url)!.text()
  let loaded!: () => void, failed!: (error: Error) => void
  const loading = new Promise<void>((yes, no) => { loaded = yes; failed = no })
  const scope = Object.assign(new EventTarget(), { postMessage: vi.fn((data: unknown) => worker.dispatchEvent(new MessageEvent('message', { data }))) })
  const requests: unknown[] = []
  let importedUrl: string | undefined
  // vm cannot load HTTP ESM; replace only the import expression with a controlled
  // module loader. Every queue, ready/error event and replay runs the real Blob code.
  const injectable = source.replace(/import\(("(?:[^"\\]|\\.)*")\)/, 'loadParser($1)')
  expect(injectable).not.toBe(source)
  runInNewContext(injectable, { self: scope, MessageEvent, loadParser: (url: string) => { importedUrl = url; return loading } })
  const post = (message: unknown, transfer: Transferable[] = []) => {
    const data = structuredClone(message, { transfer })
    scope.dispatchEvent(new MessageEvent('message', { data }))
    return data
  }
  return { scope, requests, importedUrl, post, fail: failed, load: async () => {
    scope.addEventListener('message', event => requests.push((event as MessageEvent).data))
    loaded(); await loading; await Promise.resolve()
  } }
}

describe('local XLSX worker initialization and cleanup', () => {
  it('holds transferred requests during ESM import, replays in order once and then dispatches directly', async () => {
    const worker = createMiraSheetWorker() as unknown as LocalWorker
    const parser = await parserScope(worker)
    expect(parser.importedUrl).toBe(new URL('office/mira-sheet-worker.js', document.baseURI).href)
    expect(worker.options.name).toBe('Mira spreadsheet reader')
    const buffer = new ArrayBuffer(3); new Uint8Array(buffer).set([7, 8, 9])
    const first = parser.post({ id: 1, type: 'load', payload: { buffer } }, [buffer])
    parser.post({ id: 2, type: 'getRowsBatch' })
    expect(buffer.byteLength).toBe(0); expect(parser.requests).toEqual([])
    await parser.load()
    expect(parser.requests).toEqual([first, { id: 2, type: 'getRowsBatch' }])
    expect([...new Uint8Array((parser.requests[0] as any).payload.buffer)]).toEqual([7, 8, 9])
    expect(parser.scope.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'mira-sheet-ready' })
    expect(revoke).toHaveBeenCalledWith(worker.url); expect(vi.getTimerCount()).toBe(0)
    parser.post({ id: 3, type: 'getCellSnapshot' }); expect(parser.requests).toHaveLength(3)
    worker.terminate(); worker.terminate(); expect(worker.nativeTerminate).toHaveBeenCalledOnce()
  })
  it('terminates only once, revokes its bootstrap and cancels the startup timer when closed before import', () => {
    const worker = createMiraSheetWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    worker.terminate(); worker.terminate()
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'mira-sheet-load-error' } }))
    expect(nativeTerminate).toHaveBeenCalledOnce()
  })
  it('reports an import failure through the normal Worker error channel and immediately releases the worker', async () => {
    const worker = createMiraSheetWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    const error = vi.fn(); worker.addEventListener('error', error)
    const parser = await parserScope(LocalWorker.latest)
    parser.post({ id: 1, type: 'load' }); parser.fail(new Error('No local parser'))
    await Promise.resolve(); await Promise.resolve()
    expect(error).toHaveBeenCalledOnce(); expect((error.mock.calls[0][0] as ErrorEvent).message).toContain('表格引擎加载失败')
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    expect(parser.requests).toEqual([])
  })
  it('turns missing initialization into a bounded error instead of leaving the file loading indefinitely', () => {
    const worker = createMiraSheetWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    const error = vi.fn(); worker.addEventListener('error', error)
    vi.advanceTimersByTime(9_999); expect(error).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect((error.mock.calls[0][0] as ErrorEvent).message).toContain('启动超时')
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })
  it('releases the blob even when native construction is denied', () => {
    nativeFailure = true
    expect(() => createMiraSheetWorker()).toThrow('Worker denied')
    expect(revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  it('immediately terminates on native failure and removes its initialization listener', () => {
    const worker = createMiraSheetWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    const error = vi.fn(); worker.addEventListener('error', error)
    worker.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch local script' }))
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'mira-sheet-load-error' } }))
    expect(error).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce()
    worker.terminate(); expect(nativeTerminate).toHaveBeenCalledOnce()
  })
})

describe('pinned XLSX build adapters', () => {
  it('bundles the actual installed viewer with the local worker factory and scoped canvas link routing', async () => {
    const result = await build({ entryPoints: [resolve('node_modules/@extend-ai/react-xlsx/dist/index.js')], bundle: true, format: 'esm', platform: 'browser', target: ['chrome110'], plugins: [miraSheetIntegration()], external: ['react', 'react-dom', 'react/jsx-runtime'], write: false, logLevel: 'silent' })
    const source = result.outputFiles[0].text
    expect(source).toContain('function createMiraSheetWorker()')
    expect(source).toContain('this.worker = createMiraSheetWorker()')
    expect(source).toContain('scrollRef.current?.dispatchEvent(new CustomEvent("mira-document-open-link"')
    expect(source).not.toContain('window.open(')
    expect(source).not.toContain('new Worker(new URL("./xlsx-worker.js"')
  })
  it('rejects dependency drift instead of silently losing the worker or link adapter', async () => {
    const registrations: Array<(args: { path: string }) => Promise<unknown>> = []
    miraSheetIntegration().setup({ onLoad: (_options: unknown, callback: typeof registrations[number]) => registrations.push(callback) })
    // An actual source file without the pinned vendor seams must never be accepted.
    await expect(registrations[0]({ path: resolve('apps/harness-react/src/lib/mira-sheet-worker.ts') })).rejects.toThrow('integration changed')
    const dependency = JSON.parse(await readFile(resolve('node_modules/@extend-ai/react-xlsx/package.json'), 'utf8'))
    expect(dependency.version).toBe('0.16.0')
  })
})
