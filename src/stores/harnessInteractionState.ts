import { ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessEvent, HarnessFileReference, HarnessPendingInteraction, HarnessPlan, HarnessSession, HarnessUserAnswer, ModelSelection } from '@/config/harness'

export interface HarnessPendingPermissionRequest {
  requestId: string
  title: string
  detail: string
}

export interface HarnessPendingMemoryConfirmation {
  requestId: string
  candidateId: string
  content: string
}

export interface HarnessRunError { sessionId: string, message: string }

interface HarnessInteractionStateOptions {
  getActiveSession: () => HarnessSession | undefined
  setActiveSession: (session: HarnessSession) => void
  setRunning: (running: boolean) => void
  refreshSessions: () => Promise<void>
}

export function createHarnessInteractionState(options: HarnessInteractionStateOptions) {
  const activePlan = ref<HarnessPlan>()
  const activeInteraction = ref<HarnessPendingInteraction>()
  const pendingPermissionRequests = ref<Record<string, HarnessPendingPermissionRequest>>({})
  const pendingMemoryConfirmations = ref<Record<string, HarnessPendingMemoryConfirmation>>({})
  const lastRunError = ref<HarnessRunError>()

  function syncSession(session?: HarnessSession) {
    activePlan.value = session?.activePlan
    activeInteraction.value = session?.pendingInteraction
  }

  function clearActive() {
    activePlan.value = undefined
    activeInteraction.value = undefined
  }

  function removeSessions(ids: string[]) {
    const removed = new Set(ids)
    pendingPermissionRequests.value = Object.fromEntries(Object.entries(pendingPermissionRequests.value).filter(([id]) => !removed.has(id)))
    pendingMemoryConfirmations.value = Object.fromEntries(Object.entries(pendingMemoryConfirmations.value).filter(([id]) => !removed.has(id)))
    if (lastRunError.value && removed.has(lastRunError.value.sessionId)) lastRunError.value = undefined
  }

  async function confirmPlan(sessionId: string, planId: string, selection?: ModelSelection) {
    const api = getPlatformApi(); if (!api) return
    options.setRunning(true)
    await api.confirmHarnessPlan(sessionId, planId, selection ? { ...selection } : undefined)
  }

  async function continuePlan(sessionId: string, planId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection) {
    const api = getPlatformApi(); if (!api) return
    options.setRunning(true)
    await api.continueHarnessPlan(sessionId, planId, message, references.map(file => ({ path: file.path, name: file.name })), selection ? { ...selection } : undefined)
  }

  async function cancelPlan(sessionId: string, planId: string) {
    const api = getPlatformApi(); if (!api) return
    await api.cancelHarnessPlan(sessionId, planId)
  }

  async function answerInteraction(sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection?: ModelSelection) {
    const api = getPlatformApi(); if (!api) return
    const plainAnswers = answers.map(answer => ({
      id: answer.id,
      selected: [...answer.selected],
      ...(answer.custom?.trim() ? { custom: answer.custom.trim() } : {}),
    }))
    const plainSelection = selection ? {
      providerId: selection.providerId,
      modelId: selection.modelId,
      ...(selection.thinkingLevel ? { thinkingLevel: selection.thinkingLevel } : {}),
    } : undefined
    await api.answerHarnessInteraction(sessionId, interactionId, plainAnswers, plainSelection)
  }

  async function respondPermission(sessionId: string, allowed: boolean) {
    const request = pendingPermissionRequests.value[sessionId]
    const api = getPlatformApi()
    if (!request || !api) return
    await api.respondHarnessPermission(request.requestId, allowed)
    const { [sessionId]: _removed, ...remaining } = pendingPermissionRequests.value
    pendingPermissionRequests.value = remaining
  }

  async function respondMemoryConfirmation(sessionId: string, approved: boolean) {
    const request = pendingMemoryConfirmations.value[sessionId]
    const api = getPlatformApi()
    if (!request || !api) return
    await api.respondHarnessMemoryConfirmation(request.requestId, approved)
    const { [sessionId]: _removed, ...remaining } = pendingMemoryConfirmations.value
    pendingMemoryConfirmations.value = remaining
  }

  function applyEvent(event: HarnessEvent) {
    if (event.type === 'permission-request') {
      const requestId = typeof event.payload.requestId === 'string' ? event.payload.requestId : ''
      if (requestId) pendingPermissionRequests.value = {
        ...pendingPermissionRequests.value,
        [event.sessionId]: { requestId, title: typeof event.payload.title === 'string' ? event.payload.title : '请求权限', detail: typeof event.payload.detail === 'string' ? event.payload.detail : '' },
      }
    }
    if (event.type === 'memory-status' && event.payload.status === 'needs_confirmation') {
      const requestId = typeof event.payload.requestId === 'string' ? event.payload.requestId : ''
      const content = typeof event.payload.content === 'string' ? event.payload.content : ''
      if (requestId && content) pendingMemoryConfirmations.value = { ...pendingMemoryConfirmations.value, [event.sessionId]: { requestId, candidateId: typeof event.payload.candidateId === 'string' ? event.payload.candidateId : '', content } }
    }
    if (event.type === 'status') {
      if (event.payload.state === 'running' && event.sessionId === options.getActiveSession()?.id) lastRunError.value = undefined
      if (event.payload.state !== 'running') {
        const { [event.sessionId]: _removed, ...remaining } = pendingPermissionRequests.value
        pendingPermissionRequests.value = remaining
      }
    }
    if (event.sessionId !== options.getActiveSession()?.id) return
    if ((event.type === 'plan-updated' || event.type === 'plan-confirmed' || event.type === 'plan-cancelled') && event.payload.plan && typeof event.payload.plan === 'object') {
      activePlan.value = event.payload.plan as HarnessPlan
      options.setActiveSession({ ...options.getActiveSession()!, activePlan: activePlan.value })
      void options.refreshSessions()
    }
    if (event.type === 'interaction-created' || event.type === 'interaction-resolved') {
      const api = getPlatformApi()
      if (api) void api.getHarnessSession(event.sessionId).then(session => {
        if (options.getActiveSession()?.id !== event.sessionId) return
        options.setActiveSession(session)
        syncSession(session)
      })
      void options.refreshSessions()
    }
    if (event.type === 'error') lastRunError.value = { sessionId: event.sessionId, message: typeof event.payload.message === 'string' ? event.payload.message : '运行失败，请重试。' }
  }

  return {
    activePlan,
    activeInteraction,
    pendingPermissionRequests,
    pendingMemoryConfirmations,
    lastRunError,
    syncSession,
    clearActive,
    removeSessions,
    confirmPlan,
    continuePlan,
    cancelPlan,
    answerInteraction,
    respondPermission,
    respondMemoryConfirmation,
    applyEvent,
  }
}
