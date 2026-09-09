import type { HarnessEvent, HarnessRunActivity, HarnessSubtask } from '@/config/harness'

export type HarnessPublicRunStatus = 'idle' | 'running' | 'rendering' | 'completed' | 'failed'

export interface HarnessRunState {
  sessionId?: string
  runId?: string
  status: HarnessPublicRunStatus
  startedAt?: number
  completedAt?: number
  activities: HarnessRunActivity[]
  subtasks: HarnessSubtask[]
  lastSequence: number
  processedEventIds: string[]
  error?: string
}

export function createHarnessRunState(): HarnessRunState {
  return {
    status: 'idle',
    activities: [],
    subtasks: [],
    lastSequence: -1,
    processedEventIds: [],
  }
}

function eventIdentity(event: HarnessEvent) {
  return event.eventId || (event.sequence === undefined ? undefined : `${event.sessionId}:${event.runId || 'legacy'}:${event.sequence}`)
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function activities(value: unknown, fallback: HarnessRunActivity[]) {
  return Array.isArray(value) ? value as HarnessRunActivity[] : fallback
}

function subtasks(value: unknown, fallback: HarnessSubtask[]) {
  return Array.isArray(value) ? value as HarnessSubtask[] : fallback
}

/**
 * 将跨进程事件归并为 UI 可见的运行快照。
 * reducer 不修改输入，便于在主进程恢复快照和渲染进程测试中复用。
 */
export function reduceHarnessRunEvent(current: HarnessRunState, event: HarnessEvent): HarnessRunState {
  if (event.runId && event.runId !== current.runId) current = createHarnessRunState()
  const identity = eventIdentity(event)
  if (identity && current.processedEventIds.includes(identity)) return current
  if (event.sequence !== undefined && event.sequence <= current.lastSequence) return current

  const next: HarnessRunState = {
    ...current,
    sessionId: event.sessionId,
    runId: event.runId || current.runId,
    activities: current.activities,
    subtasks: current.subtasks,
    processedEventIds: identity
      ? [...current.processedEventIds.slice(-199), identity]
      : current.processedEventIds,
    lastSequence: event.sequence === undefined ? current.lastSequence : event.sequence,
  }
  const payload = event.payload || {}

  if (event.type === 'run-start') {
    next.status = 'running'
    next.startedAt = numberValue(payload.startedAt, event.occurredAt || Date.now())
    next.completedAt = undefined
    next.error = undefined
    next.activities = activities(payload.activities, [])
    next.subtasks = subtasks(payload.subtasks, [])
  } else if (event.type === 'run-activity') {
    next.activities = activities(payload.activities, current.activities)
    next.subtasks = subtasks(payload.subtasks, current.subtasks)
  } else if (event.type === 'status') {
    if (payload.state === 'running') next.status = 'running'
    else if (payload.state === 'rendering') next.status = 'rendering'
    else if (payload.state === 'failed') next.status = 'failed'
    else if (payload.state === 'idle' || payload.state === 'completed') {
      next.status = payload.state === 'completed' ? 'completed' : current.status === 'failed' ? 'failed' : 'completed'
      next.completedAt = numberValue(payload.completedAt, event.occurredAt || Date.now())
    }
  } else if (event.type === 'message-complete') {
    next.status = 'completed'
    next.completedAt = numberValue(payload.completedAt, event.occurredAt || Date.now())
  } else if (event.type === 'error') {
    next.status = 'failed'
    next.error = typeof payload.message === 'string' ? payload.message : '运行失败，请重试。'
  }

  return next
}
