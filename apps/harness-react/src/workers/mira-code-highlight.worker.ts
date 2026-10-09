import { createMiraHighlightCore } from '../lib/code-highlight-core'
import type { MiraHighlightRequest, MiraHighlightResponse } from '../lib/code-highlight-protocol'

const tokenize = createMiraHighlightCore()
const queue: Array<Extract<MiraHighlightRequest, { type: 'highlight' }>> = []
const cancellations = new Map<number, AbortController>()
let running = false
const send = (message: MiraHighlightResponse) => globalThis.postMessage(message)

async function drain() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const request = queue.shift()!
      const controller = cancellations.get(request.id)!
      try {
        const result = await tokenize(request.options, controller.signal)
        if (!controller.signal.aborted) send({ type: 'result', id: request.id, result })
        else send({ type: 'cancelled', id: request.id })
      } catch (error) {
        if (controller.signal.aborted) send({ type: 'cancelled', id: request.id })
        else send({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) })
      } finally { cancellations.delete(request.id) }
      // Give queued cancellation messages a turn even when all results came from tiny snippets.
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
  } finally { running = false }
}

globalThis.onmessage = (event: MessageEvent<MiraHighlightRequest>) => {
  const request = event.data
  if (request.type === 'cancel') {
    cancellations.get(request.id)?.abort()
    const queued = queue.findIndex(item => item.id === request.id)
    if (queued >= 0) { queue.splice(queued, 1); cancellations.delete(request.id); send({ type: 'cancelled', id: request.id }) }
    return
  }
  cancellations.set(request.id, new AbortController())
  queue.push(request)
  void drain()
}
send({ type: 'ready' })
