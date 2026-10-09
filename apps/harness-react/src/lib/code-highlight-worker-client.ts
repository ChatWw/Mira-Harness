import type { HighlightOptions } from 'streamdown'
import { highlightCancelled, type MiraHighlightResponse, type MiraHighlightResult } from './code-highlight-protocol'

declare const MIRA_HIGHLIGHT_WORKER_PATH: string

export function createMiraHighlightWorkerClient() {
  let worker: Worker | undefined
  let ready: Promise<Worker> | undefined
  let sequence = 0
  let bootstrap: string | undefined
  let startup: { reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> } | undefined
  const pending = new Map<number, { resolve: (result: MiraHighlightResult) => void; reject: (error: Error) => void }>()
  const inFlight = new Map<number, { chars: number; timer: ReturnType<typeof setTimeout> }>()
  let inFlightChars = 0
  const releaseBootstrap = () => { if (bootstrap) URL.revokeObjectURL(bootstrap); bootstrap = undefined }
  const stop = (error: Error) => {
    clearTimeout(startup?.timer)
    startup?.reject(error)
    startup = undefined
    worker?.terminate()
    worker = undefined
    ready = undefined
    releaseBootstrap()
    for (const request of pending.values()) request.reject(error)
    pending.clear()
    for (const request of inFlight.values()) clearTimeout(request.timer)
    inFlight.clear()
    inFlightChars = 0
  }
  const start = () => {
    if (ready) return ready
    ready = new Promise<Worker>((resolve, reject) => {
      startup = { reject }
      const fail = (error: Error) => { reject(error); stop(error) }
      try {
        const path = typeof MIRA_HIGHLIGHT_WORKER_PATH === 'undefined' ? './mira-code-highlight.worker.js' : MIRA_HIGHLIGHT_WORKER_PATH
        const entry = new URL(path, document.baseURI).href
        // Classic Blob + fixed ESM import works in our opaque iframe without widening its sandbox.
        bootstrap = URL.createObjectURL(new Blob([`import(${JSON.stringify(entry)}).catch(error => postMessage({type:'loader-error',message:error.message}))`], { type: 'application/javascript' }))
        worker = new Worker(bootstrap, { name: 'mira-code-highlight' })
        const owner = worker
        startup.timer = setTimeout(() => fail(new Error('代码高亮引擎启动超时')), 10_000)
        owner.onmessage = (event: MessageEvent<MiraHighlightResponse>) => {
          if (worker !== owner) return
          const message = event.data
          if (message.type === 'ready') { clearTimeout(startup?.timer); startup = undefined; releaseBootstrap(); resolve(owner); return }
          if (message.type === 'loader-error') { fail(new Error(message.message)); return }
          const flight = inFlight.get(message.id)
          if (flight) { clearTimeout(flight.timer); inFlight.delete(message.id); inFlightChars -= flight.chars }
          const request = pending.get(message.id)
          if (!request) return
          pending.delete(message.id)
          if (message.type === 'error') request.reject(new Error(message.message))
          else if (message.type === 'cancelled') request.reject(highlightCancelled())
          else request.resolve(message.result)
        }
        owner.onerror = event => { if (worker === owner) { event.preventDefault(); fail(new Error(event.message || '代码高亮引擎出错')) } }
        owner.onmessageerror = () => { if (worker === owner) fail(new Error('代码高亮结果无法读取')) }
      } catch (error) { fail(error instanceof Error ? error : new Error(String(error))) }
    })
    // Construction can fail synchronously; allow the next call to initialize again.
    const current = ready
    void current.catch(() => { if (ready === current) ready = undefined })
    return current
  }
  const highlight = async (options: HighlightOptions, signal?: AbortSignal): Promise<MiraHighlightResult> => {
    if (signal?.aborted) throw highlightCancelled()
    const owner = await new Promise<Worker>((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', abort)
        callback()
      }
      const abort = () => {
        finish(() => reject(highlightCancelled()))
      }
      signal?.addEventListener('abort', abort, { once: true })
      start().then(owner => finish(() => resolve(owner)), error => finish(() => reject(error)))
    })
    if (signal?.aborted) throw highlightCancelled()
    if (worker !== owner) throw highlightCancelled()
    if (inFlight.size >= 256 || inFlightChars + options.code.length > 32_000_000) throw new Error('代码高亮队列已满，请稍后重试')
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const finish = (callback: () => void) => { signal?.removeEventListener('abort', abort); callback() }
      const abort = () => {
        const request = pending.get(id)
        if (!request) return
        pending.delete(id)
        finish(() => reject(highlightCancelled()))
        try { owner.postMessage({ type: 'cancel', id }) }
        catch (error) { if (worker === owner) stop(error instanceof Error ? error : new Error(String(error))) }
        // Keep the warm owner across stream revisions; an active single line finishes before cancel is read.
      }
      const timer = setTimeout(() => { if (worker === owner) stop(new Error('代码高亮超时，请重试')) }, 60_000)
      pending.set(id, {
        resolve: result => finish(() => resolve(result)),
        reject: error => finish(() => reject(error)),
      })
      inFlight.set(id, { chars: options.code.length, timer })
      inFlightChars += options.code.length
      signal?.addEventListener('abort', abort, { once: true })
      try { owner.postMessage({ type: 'highlight', id, options }) }
      catch (error) { stop(error instanceof Error ? error : new Error(String(error))) }
    })
  }
  return { highlight, dispose: () => stop(highlightCancelled()) }
}

export const miraCodeHighlightWorker = createMiraHighlightWorkerClient()
