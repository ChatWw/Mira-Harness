import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMiraHighlightWorkerClient } from '../apps/harness-react/src/lib/code-highlight-worker-client'
import { createMiraCodeHighlighter } from '../apps/harness-react/src/lib/code-highlighter'
import type { MiraHighlightResponse, MiraHighlightResult } from '../apps/harness-react/src/lib/code-highlight-protocol'

const options = (code = 'const mira = 42;') => ({ code, language: 'typescript', themes: ['github-light', 'github-dark'] as [string, string] })
const result = (code = 'const mira = 42;'): MiraHighlightResult => ({ tokens: [[{ content: code, offset: 0 }]] })
const flush = async () => { for (let step = 0; step < 12; step++) await Promise.resolve() }
const clients: Array<ReturnType<typeof createMiraHighlightWorkerClient>> = []
const client = () => { const owner = createMiraHighlightWorkerClient(); clients.push(owner); return owner }

class TestWorker {
  static instances: TestWorker[] = []
  static failConstruction = false
  onmessage?: (event: MessageEvent<MiraHighlightResponse>) => void
  onerror?: (event: ErrorEvent) => void
  onmessageerror?: () => void
  messages: Array<{ type: string; id: number; options?: ReturnType<typeof options> }> = []
  terminated = false
  failSend = false
  constructor(public url: string, public settings: WorkerOptions) {
    if (TestWorker.failConstruction) throw new Error('worker unavailable')
    TestWorker.instances.push(this)
  }
  postMessage(message: TestWorker['messages'][number]) {
    if (this.failSend) throw new Error('transport failed')
    this.messages.push(message)
  }
  terminate() { this.terminated = true }
  emit(message: MiraHighlightResponse) { this.onmessage?.({ data: message } as MessageEvent<MiraHighlightResponse>) }
  complete(index = 0) { const request = this.messages.filter(item => item.type === 'highlight')[index]; this.emit({ type: 'result', id: request.id, result: result(request.options!.code) }) }
}

beforeEach(() => {
  vi.useFakeTimers()
  TestWorker.instances = []
  TestWorker.failConstruction = false
  vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('document', { baseURI: 'http://127.0.0.1:9000/harness-react-app/index.html' })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:null/mira-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(async () => { for (const owner of clients.splice(0)) owner.dispose(); await flush(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Mira highlight Worker transport', () => {
  it('loads only the fixed entry in a classic Blob and revokes it once ready', async () => {
    const owner = client()
    const pending = owner.highlight(options('ignore user import("https://evil.invalid")'))
    const worker = TestWorker.instances[0]
    expect(worker.settings).toEqual({ name: 'mira-code-highlight' })
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(await blob.text()).toContain('import("http://127.0.0.1:9000/harness-react-app/mira-code-highlight.worker.js")')
    expect(await blob.text()).not.toContain('evil.invalid')
    expect(worker.messages).toHaveLength(0)
    worker.emit({ type: 'ready' }); await flush()
    worker.complete()
    expect((await pending).tokens[0][0].content).toContain('evil.invalid')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('associates reverse-order responses with their own requests', async () => {
    const owner = client()
    const first = owner.highlight(options('first'))
    const second = owner.highlight(options('second'))
    const worker = TestWorker.instances[0]
    worker.emit({ type: 'ready' }); await flush()
    worker.complete(1); worker.complete(0)
    expect(await first).toEqual(result('first'))
    expect(await second).toEqual(result('second'))
  })

  it('cancels before initialization and during startup without sending stale code', async () => {
    const owner = client()
    const before = new AbortController(); before.abort()
    await expect(owner.highlight(options(), before.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(TestWorker.instances).toHaveLength(0)
    const during = new AbortController()
    const pending = owner.highlight(options('old'), during.signal)
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    during.abort(); await rejection
    const worker = TestWorker.instances[0]
    worker.emit({ type: 'ready' }); await flush()
    expect(worker.messages).toHaveLength(0)
  })

  it('reuses its warm engine across stream cancellations and ignores the late result', async () => {
    const owner = client()
    const cancel = new AbortController()
    const old = owner.highlight(options('old'), cancel.signal)
    const rejection = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    const worker = TestWorker.instances[0]
    worker.emit({ type: 'ready' }); await flush()
    cancel.abort(); await rejection
    const latest = owner.highlight(options('latest')); await flush()
    expect(TestWorker.instances).toHaveLength(1)
    expect(worker.terminated).toBe(false)
    expect(worker.messages[1]).toEqual({ type: 'cancel', id: 1 })
    worker.complete(0); worker.complete(1)
    expect(await latest).toEqual(result('latest'))
  })

  it('settles cancellation even if its cancel message cannot be posted', async () => {
    const owner = client()
    const cancel = new AbortController()
    const pending = owner.highlight(options(), cancel.signal)
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const worker = TestWorker.instances[0]
    worker.emit({ type: 'ready' }); await flush()
    worker.failSend = true
    expect(() => cancel.abort()).not.toThrow()
    await rejection
    expect(worker.terminated).toBe(true)
  })

  it.each(['loader', 'error', 'messageerror', 'send'] as const)('rejects %s failure and reinitializes on retry', async failure => {
    const owner = client()
    const pending = owner.highlight(options())
    const rejection = expect(pending).rejects.toThrow()
    const worker = TestWorker.instances[0]
    if (failure === 'loader') worker.emit({ type: 'loader-error', message: 'chunk 404' })
    else {
      if (failure === 'send') worker.failSend = true
      worker.emit({ type: 'ready' }); await flush()
      if (failure === 'error') worker.onerror?.({ message: 'worker crashed', preventDefault() {} } as ErrorEvent)
      if (failure === 'messageerror') worker.onmessageerror?.()
    }
    await rejection
    expect(worker.terminated).toBe(true)
    const retry = owner.highlight(options('retry'))
    const current = TestWorker.instances[1]
    // An old owner's delayed events cannot stop or resolve its replacement.
    worker.emit({ type: 'loader-error', message: 'old failure' })
    current.emit({ type: 'ready' }); await flush(); current.complete()
    expect(await retry).toEqual(result('retry'))
  })

  it('retries synchronous constructor failures and releases the failed Blob', async () => {
    const owner = client()
    TestWorker.failConstruction = true
    await expect(owner.highlight(options())).rejects.toThrow('worker unavailable')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    TestWorker.failConstruction = false
    const retry = owner.highlight(options())
    const worker = TestWorker.instances[0]
    worker.emit({ type: 'ready' }); await flush(); worker.complete()
    await retry
  })

  it('clears boot and request deadlines on disposal and bounds a stuck engine', async () => {
    const owner = client()
    const pending = owner.highlight(options())
    const rejection = expect(pending).rejects.toThrow('启动超时')
    await vi.advanceTimersByTimeAsync(10_000); await rejection
    const cancel = new AbortController()
    const next = owner.highlight(options(), cancel.signal)
    const aborted = expect(next).rejects.toMatchObject({ name: 'AbortError' })
    const worker = TestWorker.instances[1]
    worker.emit({ type: 'ready' }); await flush(); cancel.abort(); await aborted
    expect(worker.terminated).toBe(false)
    // Cancellation is immediate, but the owner still has a deadline until the Worker acknowledges it.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminated).toBe(true)
    owner.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds queued requests and retains cancelled transport quota until acknowledgment', async () => {
    const owner = client()
    const requests = Array.from({ length: 256 }, (_, index) => owner.highlight(options(`item ${index}`)))
    const worker = TestWorker.instances[0]
    worker.emit({ type: 'ready' }); await flush()
    await expect(owner.highlight(options('overflow'))).rejects.toThrow('队列已满')
    for (let index = 0; index < 256; index++) worker.complete(index)
    await Promise.all(requests)
    const cancel = new AbortController()
    const huge = owner.highlight(options('x'.repeat(32_000_000)), cancel.signal)
    const aborted = expect(huge).rejects.toMatchObject({ name: 'AbortError' })
    await flush(); cancel.abort(); await aborted
    await expect(owner.highlight(options('quota still retained'))).rejects.toThrow('队列已满')
    const id = worker.messages.filter(message => message.type === 'highlight').at(-1)!.id
    worker.emit({ type: 'cancelled', id })
    const retry = owner.highlight(options('after acknowledgment')); await flush(); worker.complete(257)
    expect(await retry).toEqual(result('after acknowledgment'))
  })
})

describe('Mira shared highlight request consumers', () => {
  it('isolates one subscriber cancellation and caches the successful shared result', async () => {
    let complete!: (value: MiraHighlightResult) => void
    const execute = vi.fn((_options, _signal?: AbortSignal) => new Promise<MiraHighlightResult>(resolve => { complete = resolve }))
    const highlighter = createMiraCodeHighlighter(execute)
    const cancel = new AbortController()
    const first = highlighter.highlight(options(), cancel.signal)
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const second = highlighter.highlight(options())
    cancel.abort(); await rejection
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][1]?.aborted).toBe(false)
    complete(result()); await second
    expect(highlighter.getCached(options())).toEqual(result())
  })

  it('cancels the owner only after all consumers leave and never caches a late old result', async () => {
    const requests: Array<{ signal?: AbortSignal; complete: (value: MiraHighlightResult) => void }> = []
    const highlighter = createMiraCodeHighlighter((_options, signal) => new Promise(resolve => { requests.push({ signal, complete: resolve }) }))
    const cancel = new AbortController()
    const old = highlighter.highlight(options(), cancel.signal)
    const rejection = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    cancel.abort(); await rejection
    expect(requests[0].signal?.aborted).toBe(true)
    const latest = highlighter.highlight(options())
    requests[0].complete(result('old')); await flush()
    expect(highlighter.getCached(options())).toBeUndefined()
    requests[1].complete(result('latest'))
    expect(await latest).toEqual(result('latest'))
    expect(highlighter.getCached(options())).toEqual(result('latest'))
  })
})
