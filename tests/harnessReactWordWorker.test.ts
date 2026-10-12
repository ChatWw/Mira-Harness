// @vitest-environment happy-dom
import { Blob as NodeBlob } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMiraWordWorker } from '../apps/harness-react/src/lib/mira-word-worker'
import { miraWordIntegration } from '../scripts/build-harness-react.mjs'

const blobs = new Map<string, NodeBlob>()
let denyConstruction = false
class LocalWorker extends EventTarget {
  static latest: LocalWorker
  nativeTerminate = vi.fn()
  terminate = this.nativeTerminate
  constructor(readonly url: string, readonly options: WorkerOptions) {
    super()
    if (denyConstruction) throw new Error('Worker denied')
    LocalWorker.latest = this
  }
}
let revoke: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers(); denyConstruction = false; blobs.clear()
  revoke = vi.fn((url: string) => blobs.delete(url))
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('Worker', LocalWorker)
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(blob: NodeBlob) { const url = `blob:mira-word-${blobs.size}`; blobs.set(url, blob); return url }
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
  // Execute the real Blob bootstrap, replacing only the network module loader.
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

describe('local Word worker initialization and cleanup', () => {
  it('buffers transferred imports until the parser loads, replays once and then dispatches directly', async () => {
    const worker = createMiraWordWorker() as unknown as LocalWorker
    const parser = await parserScope(worker)
    expect(parser.importedUrl).toBe(new URL('office/mira-word-worker.js', document.baseURI).href)
    expect(worker.options.name).toBe('Mira Word reader')
    const buffer = new ArrayBuffer(3); new Uint8Array(buffer).set([7, 8, 9])
    const first = parser.post({ id: 1, type: 'import-docx', buffer }, [buffer])
    parser.post({ id: 2, type: 'import-docx' })
    expect(buffer.byteLength).toBe(0); expect(parser.requests).toEqual([])
    await parser.load()
    expect(parser.requests).toEqual([first, { id: 2, type: 'import-docx' }])
    expect([...new Uint8Array((parser.requests[0] as { buffer: ArrayBuffer }).buffer)]).toEqual([7, 8, 9])
    expect(parser.scope.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'mira-word-ready' })
    expect(revoke).toHaveBeenCalledWith(worker.url); expect(vi.getTimerCount()).toBe(0)
    parser.post({ id: 3, type: 'import-docx' }); expect(parser.requests).toHaveLength(3)
    worker.terminate(); worker.terminate(); expect(worker.nativeTerminate).toHaveBeenCalledOnce()
  })
  it('terminates once and releases the bootstrap and startup timer when closed before import', () => {
    const worker = createMiraWordWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    worker.terminate(); worker.terminate()
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'mira-word-load-error' } }))
    expect(nativeTerminate).toHaveBeenCalledOnce()
  })
  it('reports import failure through the Worker error channel and drops queued requests', async () => {
    const worker = createMiraWordWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    const error = vi.fn(); worker.addEventListener('error', error)
    const parser = await parserScope(LocalWorker.latest)
    parser.post({ id: 1, type: 'import-docx' }); parser.fail(new Error('No local parser'))
    await Promise.resolve(); await Promise.resolve()
    expect(error).toHaveBeenCalledOnce(); expect((error.mock.calls[0][0] as ErrorEvent).message).toContain('Word 引擎加载失败')
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    expect(parser.requests).toEqual([])
  })
  it('bounds missing initialization rather than leaving the reader loading indefinitely', () => {
    const worker = createMiraWordWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    const error = vi.fn(); worker.addEventListener('error', error)
    vi.advanceTimersByTime(9_999); expect(error).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect((error.mock.calls[0][0] as ErrorEvent).message).toContain('启动超时')
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })
  it('releases the Blob when native worker construction is denied', () => {
    denyConstruction = true
    expect(() => createMiraWordWorker()).toThrow('Worker denied')
    expect(revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  it('terminates on a native error and removes its initialization listener', () => {
    const worker = createMiraWordWorker(), nativeTerminate = LocalWorker.latest.nativeTerminate
    const error = vi.fn(); worker.addEventListener('error', error)
    worker.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch local script' }))
    expect(nativeTerminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'mira-word-load-error' } }))
    expect(error).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce()
    worker.terminate(); expect(nativeTerminate).toHaveBeenCalledOnce()
  })
})

describe('pinned Word build adapter', () => {
  it('bundles the installed viewer with the local factory and rejects construction without main-thread parsing', async () => {
    const registrations: Array<(args: { path: string }) => Promise<{ contents: string; loader: string; resolveDir: string }>> = []
    miraWordIntegration().setup({ onLoad: (_options: unknown, callback: typeof registrations[number]) => registrations.push(callback) })
    const vendorPath = resolve('node_modules/@extend-ai/react-docx/dist/index.js')
    const adapted = await registrations[0]({ path: vendorPath })
    // Expose only the real private importer for execution; do not replace its implementation.
    const plugin = { name: 'word-import-test-export', setup(builder: any) {
      builder.onLoad({ filter: /@extend-ai\/react-docx\/dist\/index\.js$/ }, () => ({ ...adapted, contents: `${adapted.contents}\nexport { importDocxBuffer as miraImportForTest };` }))
    } }
    const result = await build({ stdin: { contents: `export { miraImportForTest } from ${JSON.stringify(vendorPath)}`, resolveDir: resolve('.') }, bundle: true, format: 'cjs', platform: 'browser', target: ['chrome110'], plugins: [plugin], external: ['react', 'react-dom', 'react/jsx-runtime'], write: false, logLevel: 'silent' })
    const source = result.outputFiles[0].text
    expect(source.includes('function createMiraWordWorker()')).toBe(true)
    expect(source.includes('return createMiraWordWorker()')).toBe(true)
    expect(source.includes('new Worker(new URL("./docx-import-worker.js"')).toBe(false)
    expect(source.includes('Word reader worker could not start')).toBe(true)
    denyConstruction = true
    const module = { exports: {} as { miraImportForTest: (buffer: ArrayBuffer) => Promise<unknown> } }
    const fetch = vi.fn(() => { throw new Error('Main-thread parser attempted a fetch') })
    runInNewContext(source, { module, exports: module.exports, require: createRequire(import.meta.url), document, URL, Blob: NodeBlob, Worker: LocalWorker, fetch, console, setTimeout, clearTimeout, EventTarget, MessageEvent, ErrorEvent, TextDecoder, TextEncoder })
    await expect(module.exports.miraImportForTest(new ArrayBuffer(3))).rejects.toThrow('Word reader worker could not start')
    expect(fetch).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects source drift instead of silently losing the worker or fail-closed adapter', async () => {
    const registrations: Array<(args: { path: string }) => Promise<unknown>> = []
    miraWordIntegration().setup({ onLoad: (_options: unknown, callback: typeof registrations[number]) => registrations.push(callback) })
    await expect(registrations[0]({ path: resolve('apps/harness-react/src/lib/mira-word-worker.ts') })).rejects.toThrow('integration changed')
    const dependency = JSON.parse(await readFile(resolve('node_modules/@extend-ai/react-docx/package.json'), 'utf8'))
    expect(dependency.version).toBe('0.8.1')
  })
})
