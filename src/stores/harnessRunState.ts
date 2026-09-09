import { ref } from 'vue'
import type { HarnessEvent, HarnessRunActivity, HarnessSession, HarnessSubtask } from '@/config/harness'
import { createHarnessRunState, reduceHarnessRunEvent, type HarnessRunState } from './harnessEventReducer'

const STREAM_FRAME_MS = 16
const STREAM_BASE_CHARACTERS_PER_SECOND = 90
const STREAM_DRAIN_WINDOW_MS = 500
const STREAM_MAX_CHARACTERS_PER_FRAME = 48

export interface HarnessRunProgress {
  sessionId: string
  startedAt: number
  activities: HarnessRunActivity[]
  subtasks: HarnessSubtask[]
}

interface HarnessRunStateOptions {
  getActiveSession: () => HarnessSession | undefined
  setActiveSession: (session: HarnessSession) => void
  refreshSessions: () => Promise<void>
  refreshProjects: () => Promise<void>
}

export function createHarnessRunStateManager(options: HarnessRunStateOptions) {
  const running = ref(false)
  const rendering = ref(false)
  const activeRun = ref<HarnessRunProgress>()
  const publicRunState = ref<HarnessRunState>(createHarnessRunState())
  const runningSessionIds = ref<string[]>([])
  const unreadSessionIds = ref<string[]>([])
  const eventStates = new Map<string, HarnessRunState>()
  let queuedMessageSessionId: string | undefined
  let queuedMessageCharacters: string[] = []
  let queuedMessageTimer: number | undefined
  let completedMessageSessionId: string | undefined
  let messageCompletionDeadline: number | undefined
  let streamCharacterCarry = 0

  function resetMessageQueue() {
    if (queuedMessageTimer !== undefined) window.clearTimeout(queuedMessageTimer)
    queuedMessageSessionId = undefined
    queuedMessageCharacters = []
    queuedMessageTimer = undefined
    completedMessageSessionId = undefined
    messageCompletionDeadline = undefined
    streamCharacterCarry = 0
    rendering.value = false
  }

  function prepareSession(sessionId: string) {
    unreadSessionIds.value = unreadSessionIds.value.filter(id => id !== sessionId)
    if (options.getActiveSession()?.id === sessionId) return
    resetMessageQueue()
    activeRun.value = undefined
    publicRunState.value = eventStates.get(sessionId) || createHarnessRunState()
    running.value = runningSessionIds.value.includes(sessionId)
  }

  function restoreSession(session?: HarnessSession) {
    if (!session?.activeRun) return
    const restored: HarnessRunState = {
      ...createHarnessRunState(),
      sessionId: session.id,
      runId: session.activeRun.id,
      status: running.value ? 'running' : 'idle',
      startedAt: session.activeRun.startedAt,
      activities: session.activeRun.activities,
      subtasks: session.activeRun.subtasks,
    }
    eventStates.set(session.id, restored)
    publicRunState.value = restored
    activeRun.value = {
      sessionId: session.id,
      startedAt: session.activeRun.startedAt,
      activities: session.activeRun.activities,
      subtasks: session.activeRun.subtasks,
    }
  }

  function clearActive() {
    resetMessageQueue()
    running.value = false
    activeRun.value = undefined
    publicRunState.value = createHarnessRunState()
  }

  function removeSessions(ids: string[]) {
    const removed = new Set(ids)
    runningSessionIds.value = runningSessionIds.value.filter(id => !removed.has(id))
    unreadSessionIds.value = unreadSessionIds.value.filter(id => !removed.has(id))
    ids.forEach(id => eventStates.delete(id))
  }

  function acceptEvent(event: HarnessEvent) {
    const previous = eventStates.get(event.sessionId) || createHarnessRunState()
    const next = reduceHarnessRunEvent(previous, event)
    if (next === previous) return false
    eventStates.set(event.sessionId, next)
    if (event.sessionId === options.getActiveSession()?.id) publicRunState.value = next
    return true
  }

  function appendMessageDelta(delta: string) {
    if (!delta) return
    const session = options.getActiveSession()
    const last = session?.messages[session.messages.length - 1]
    if (last?.role === 'assistant') last.content += delta
    else session?.messages.push({ id: `stream-${Date.now()}`, role: 'assistant', content: delta, createdAt: Date.now() })
  }

  function finishMessageStream() {
    const sessionId = completedMessageSessionId
    queuedMessageSessionId = undefined
    completedMessageSessionId = undefined
    messageCompletionDeadline = undefined
    rendering.value = false
    if (!sessionId || sessionId !== options.getActiveSession()?.id) return
    const api = window.platform
    if (!api) return
    void api.getHarnessSession(sessionId).then(session => {
      if (options.getActiveSession()?.id !== sessionId) return
      options.setActiveSession(session)
      activeRun.value = undefined
      return Promise.all([options.refreshSessions(), options.refreshProjects()])
    })
  }

  function scheduleMessageQueueFlush() {
    if (queuedMessageTimer === undefined) queuedMessageTimer = window.setTimeout(flushMessageQueue, STREAM_FRAME_MS)
  }

  function getFrameCharacterCount(now: number) {
    const queuedCount = queuedMessageCharacters.length
    if (!queuedCount) return 0
    if (messageCompletionDeadline !== undefined) {
      const remainingMs = Math.max(STREAM_FRAME_MS, messageCompletionDeadline - now)
      return Math.min(STREAM_MAX_CHARACTERS_PER_FRAME, Math.max(1, Math.ceil(queuedCount * STREAM_FRAME_MS / remainingMs)))
    }
    streamCharacterCarry += STREAM_BASE_CHARACTERS_PER_SECOND * STREAM_FRAME_MS / 1000
    const baseCount = Math.floor(streamCharacterCarry)
    streamCharacterCarry -= baseCount
    const adaptiveCount = Math.ceil(queuedCount * STREAM_FRAME_MS / STREAM_DRAIN_WINDOW_MS)
    return Math.min(STREAM_MAX_CHARACTERS_PER_FRAME, Math.max(baseCount, adaptiveCount))
  }

  function flushMessageQueue() {
    if (!queuedMessageSessionId || queuedMessageSessionId !== options.getActiveSession()?.id) {
      resetMessageQueue()
      return
    }
    queuedMessageTimer = undefined
    if (!queuedMessageCharacters.length) {
      rendering.value = false
      finishMessageStream()
      return
    }
    const characterCount = getFrameCharacterCount(Date.now())
    appendMessageDelta(queuedMessageCharacters.splice(0, characterCount).join(''))
    if (queuedMessageCharacters.length) scheduleMessageQueueFlush()
    else {
      rendering.value = false
      finishMessageStream()
    }
  }

  function queueMessageDelta(sessionId: string, delta: string) {
    if (!delta) return
    if (queuedMessageSessionId && queuedMessageSessionId !== sessionId) resetMessageQueue()
    queuedMessageSessionId = sessionId
    queuedMessageCharacters.push(...Array.from(delta))
    rendering.value = true
    scheduleMessageQueueFlush()
  }

  function applyEvent(event: HarnessEvent) {
    if (event.type === 'status') {
      void options.refreshSessions()
      if (event.payload.state === 'running') {
        if (!runningSessionIds.value.includes(event.sessionId)) runningSessionIds.value = [...runningSessionIds.value, event.sessionId]
      } else {
        runningSessionIds.value = runningSessionIds.value.filter(id => id !== event.sessionId)
        if (event.sessionId !== options.getActiveSession()?.id && !unreadSessionIds.value.includes(event.sessionId)) unreadSessionIds.value = [...unreadSessionIds.value, event.sessionId]
      }
    }
    if (event.sessionId !== options.getActiveSession()?.id) return
    if (event.type === 'run-start') activeRun.value = {
      sessionId: event.sessionId,
      startedAt: publicRunState.value.startedAt || Date.now(),
      activities: publicRunState.value.activities,
      subtasks: publicRunState.value.subtasks,
    }
    if (event.type === 'run-activity' && activeRun.value?.sessionId === event.sessionId) activeRun.value = { ...activeRun.value, activities: publicRunState.value.activities, subtasks: publicRunState.value.subtasks }
    if (event.type === 'message-delta') queueMessageDelta(event.sessionId, String(event.payload.delta || ''))
    if (event.type === 'status') {
      running.value = event.payload.state === 'running'
      if (!running.value && !rendering.value) activeRun.value = undefined
    }
    if (event.type === 'message-complete') {
      completedMessageSessionId = event.sessionId
      messageCompletionDeadline = Date.now() + STREAM_DRAIN_WINDOW_MS
      if (queuedMessageTimer === undefined && !queuedMessageCharacters.length) finishMessageStream()
    }
  }

  return { running, rendering, activeRun, publicRunState, runningSessionIds, unreadSessionIds, resetMessageQueue, prepareSession, restoreSession, clearActive, removeSessions, acceptEvent, applyEvent }
}
