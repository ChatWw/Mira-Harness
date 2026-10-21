import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { HarnessEvent } from '../../src/config/harness'

type BackgroundPublisher = (event: HarnessEvent) => void

/** 为公开 HarnessEvent 补齐幂等与排序元数据。 */
export function createHarnessEventPublisher(backgroundPublisher?: BackgroundPublisher, observer?: BackgroundPublisher) {
  const activeRuns = new Map<string, string>()
  const sequences = new Map<string, number>()
  // Cancellation may publish final tool/Hook records after the run has settled.
  const recentlySettled = new Set<string>()
  const settledRetentionLimit = 256

  return (sender: WebContents | undefined, event: HarnessEvent) => {
    const startsMainRun = event.type === 'run-start' || event.type === 'status' && event.payload.state === 'running'
    if (event.runId && startsMainRun) activeRuns.set(event.sessionId, event.runId)
    const runId = event.runId || activeRuns.get(event.sessionId)
    const scope = runId ? JSON.stringify([event.sessionId, runId]) : undefined
    const workflowType = event.type === 'workflow-event' ? (event.payload.event as { type?: string } | undefined)?.type : undefined
    if (scope && (startsMainRun || workflowType === 'run-started')) recentlySettled.delete(scope)
    const sequence = scope ? (sequences.get(scope) || 0) + 1 : undefined
    if (scope) sequences.set(scope, sequence!)
    if (scope && (event.type === 'status' && event.payload.state === 'idle' || workflowType === 'run-settled')) {
      recentlySettled.delete(scope)
      recentlySettled.add(scope)
      if (recentlySettled.size > settledRetentionLimit) {
        const oldest = recentlySettled.values().next().value!
        recentlySettled.delete(oldest)
        sequences.delete(oldest)
      }
    }
    const published: HarnessEvent = {
      ...event,
      eventId: event.eventId || randomUUID(),
      occurredAt: event.occurredAt || Date.now(),
      ...(scope ? { runId, sequence } : {}),
    }
    if (sender && !sender.isDestroyed()) sender.send('harness:event', published)
    else backgroundPublisher?.(published)
    observer?.(published)
    if (event.type === 'status' && event.payload.state === 'idle' && activeRuns.get(event.sessionId) === runId) activeRuns.delete(event.sessionId)
    return published
  }
}
