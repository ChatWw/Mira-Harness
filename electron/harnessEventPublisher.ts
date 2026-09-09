import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { HarnessEvent } from '../src/config/harness'

type BackgroundPublisher = (event: HarnessEvent) => void

/** 为公开 HarnessEvent 补齐幂等与排序元数据。 */
export function createHarnessEventPublisher(backgroundPublisher?: BackgroundPublisher) {
  const activeRuns = new Map<string, { runId: string, sequence: number }>()

  return (sender: WebContents | undefined, event: HarnessEvent) => {
    let activeRun = activeRuns.get(event.sessionId)
    if (event.runId && activeRun?.runId !== event.runId) {
      activeRun = { runId: event.runId, sequence: 0 }
      activeRuns.set(event.sessionId, activeRun)
    }
    const published: HarnessEvent = {
      ...event,
      eventId: event.eventId || randomUUID(),
      occurredAt: event.occurredAt || Date.now(),
      ...(activeRun ? { runId: activeRun.runId, sequence: ++activeRun.sequence } : {}),
    }
    if (sender && !sender.isDestroyed()) sender.send('harness:event', published)
    else backgroundPublisher?.(published)
    if (event.type === 'status' && event.payload.state === 'idle') activeRuns.delete(event.sessionId)
    return published
  }
}
