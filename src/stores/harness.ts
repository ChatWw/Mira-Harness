import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessContextUsage, HarnessEvent, HarnessFileReference, HarnessPendingInteraction, HarnessPlan, HarnessProject, HarnessProjectCreateInput, HarnessRunActivity, HarnessSession, HarnessSessionSummary, HarnessSubtask, HarnessUserAnswer, ModelSelection, PermissionMode, ThinkingLevel } from '@/config/harness'

const DRAFT_STORAGE_KEY = 'mira-harness-composer-drafts'
const MODEL_SELECTION_STORAGE_KEY = 'mira-harness-model-selection'
const STREAM_FRAME_MS = 16
const STREAM_BASE_CHARACTERS_PER_SECOND = 90
const STREAM_DRAIN_WINDOW_MS = 500
const STREAM_MAX_CHARACTERS_PER_FRAME = 48

export interface HarnessComposerDraft {
  text: string
  projectId?: string
  modelSelection?: ModelSelection
  permissionMode?: PermissionMode
  activeSkillIds?: string[]
  activeMcpServerIds?: string[]
  attachments: HarnessFileReference[]
  updatedAt: number
}

function loadDrafts() {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_STORAGE_KEY) || '{}') as Record<string, Partial<HarnessComposerDraft>>
    return Object.fromEntries(Object.entries(value).flatMap(([key, draft]) => {
      if (!draft || typeof draft.text !== 'string' || !Array.isArray(draft.attachments)) return []
      return [[key, {
        text: draft.text,
        projectId: typeof draft.projectId === 'string' ? draft.projectId : undefined,
        modelSelection: draft.modelSelection && typeof draft.modelSelection.providerId === 'string' && typeof draft.modelSelection.modelId === 'string'
          ? {
              providerId: draft.modelSelection.providerId,
              modelId: draft.modelSelection.modelId,
              thinkingLevel: isThinkingLevel(draft.modelSelection.thinkingLevel) ? draft.modelSelection.thinkingLevel : undefined,
            }
          : undefined,
        permissionMode: isPermissionMode(draft.permissionMode) ? draft.permissionMode : undefined,
        activeSkillIds: Array.isArray(draft.activeSkillIds)
          ? [...new Set(draft.activeSkillIds.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id)))]
          : undefined,
        activeMcpServerIds: Array.isArray(draft.activeMcpServerIds)
          ? [...new Set(draft.activeMcpServerIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))]
          : undefined,
        attachments: draft.attachments.filter((file): file is HarnessFileReference => Boolean(file && typeof file.path === 'string' && typeof file.name === 'string')),
        updatedAt: typeof draft.updatedAt === 'number' ? draft.updatedAt : Date.now(),
      }]]
    })) as Record<string, HarnessComposerDraft>
  } catch {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    return {} as Record<string, HarnessComposerDraft>
  }
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high'
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === 'default' || value === 'auto-approve' || value === 'full'
}

export interface HarnessRunProgress {
  sessionId: string
  startedAt: number
  activities: HarnessRunActivity[]
  subtasks: HarnessSubtask[]
}

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

function loadModelSelection(): ModelSelection | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(MODEL_SELECTION_STORAGE_KEY) || 'null') as Partial<ModelSelection> | null
    return value && typeof value.providerId === 'string' && typeof value.modelId === 'string'
      ? { providerId: value.providerId, modelId: value.modelId, thinkingLevel: isThinkingLevel(value.thinkingLevel) ? value.thinkingLevel : undefined }
      : undefined
  } catch {
    localStorage.removeItem(MODEL_SELECTION_STORAGE_KEY)
    return undefined
  }
}

export const useHarnessStore = defineStore('harness', () => {
  const sessions = ref<HarnessSessionSummary[]>([])
  const projects = ref<HarnessProject[]>([])
  const activeSession = ref<HarnessSession>()
  const running = ref(false)
  const rendering = ref(false)
  const activeRun = ref<HarnessRunProgress>()
  const activePlan = ref<HarnessPlan>()
  const activeInteraction = ref<HarnessPendingInteraction>()
  const drafts = ref<Record<string, HarnessComposerDraft>>(loadDrafts())
  const lastModelSelection = ref<ModelSelection | undefined>(loadModelSelection())
  let queuedMessageSessionId: string | undefined
  let queuedMessageCharacters: string[] = []
  let queuedMessageTimer: number | undefined
  let completedMessageSessionId: string | undefined
  let messageCompletionDeadline: number | undefined
  let streamCharacterCarry = 0
  const runningSessionIds = ref<string[]>([])
  const unreadSessionIds = ref<string[]>([])
  const pendingPermissionRequests = ref<Record<string, HarnessPendingPermissionRequest>>({})
  const pendingMemoryConfirmations = ref<Record<string, HarnessPendingMemoryConfirmation>>({})
  const lastRunError = ref<HarnessRunError>()

  function persistDrafts() {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.value))
  }

  function createDraftToken() {
    return crypto.randomUUID()
  }

  function ensureComposerDraft(key: string, projectId?: string) {
    if (!drafts.value[key]) {
      drafts.value = { ...drafts.value, [key]: { text: '', projectId, attachments: [], updatedAt: Date.now() } }
      persistDrafts()
    }
    return drafts.value[key]
  }

  function updateComposerDraft(key: string, patch: Partial<Pick<HarnessComposerDraft, 'text' | 'projectId' | 'attachments' | 'modelSelection' | 'permissionMode' | 'activeSkillIds' | 'activeMcpServerIds'>>) {
    const current = ensureComposerDraft(key)
    drafts.value = { ...drafts.value, [key]: { ...current, ...patch, updatedAt: Date.now() } }
    persistDrafts()
  }

  function removeComposerDraft(key: string) {
    if (!drafts.value[key]) return
    const next = { ...drafts.value }
    delete next[key]
    drafts.value = next
    persistDrafts()
  }

  function startDraft(projectId?: string) {
    resetMessageQueue()
    activeSession.value = undefined
    running.value = false
    const token = createDraftToken()
    ensureComposerDraft(`draft:${token}`, projectId)
    if (lastModelSelection.value) {
      updateComposerDraft(`draft:${token}`, { modelSelection: { ...lastModelSelection.value } })
    }
    return token
  }

  function setLastModelSelection(selection: ModelSelection) {
    lastModelSelection.value = { ...selection }
    localStorage.setItem(MODEL_SELECTION_STORAGE_KEY, JSON.stringify(lastModelSelection.value))
  }

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

  function clearActiveSession() {
    resetMessageQueue()
    activeSession.value = undefined
    running.value = false
    activeRun.value = undefined
    activePlan.value = undefined
    activeInteraction.value = undefined
  }

  async function refreshSessions(query = '') {
    const api = getPlatformApi()
    sessions.value = api ? await api.listHarnessSessions(query) : []
  }

  async function refreshProjects() {
    const api = getPlatformApi()
    projects.value = api ? await api.listHarnessProjects() : []
  }

  async function createProject(input: HarnessProjectCreateInput) {
    const api = getPlatformApi()
    if (!api) return undefined
    const project = await api.createHarnessProject(input)
    await refreshProjects()
    return project || undefined
  }

  async function removeProject(id: string) {
    const api = getPlatformApi()
    if (!api) return
    const isActiveProject = activeSession.value?.projectId === id
    await api.deleteHarnessProject(id)
    if (isActiveProject) clearActiveSession()
    await Promise.all([refreshProjects(), refreshSessions()])
  }

  async function openSession(id: string) {
    unreadSessionIds.value = unreadSessionIds.value.filter(sessionId => sessionId !== id)
    if (activeSession.value?.id !== id) {
      resetMessageQueue()
      activeRun.value = undefined
      running.value = runningSessionIds.value.includes(id)
    }
    const api = getPlatformApi()
    activeSession.value = api ? await api.getHarnessSession(id) : undefined
    activePlan.value = activeSession.value?.activePlan
    activeInteraction.value = activeSession.value?.pendingInteraction
    if (activeSession.value?.activeRun) {
      activeRun.value = {
        sessionId: id,
        startedAt: activeSession.value.activeRun.startedAt,
        activities: activeSession.value.activeRun.activities,
        subtasks: activeSession.value.activeRun.subtasks,
      }
    }
    return activeSession.value
  }

  async function createSession(projectId?: string) {
    const api = getPlatformApi()
    if (!api) return undefined
    activeSession.value = await api.createHarnessSession(projectId)
    await Promise.all([refreshSessions(), refreshProjects()])
    return activeSession.value
  }

  async function setSessionPermission(id: string, permissionMode: PermissionMode) {
    const api = getPlatformApi()
    if (!api) return undefined
    const session = typeof api.setHarnessSessionPermission === 'function'
      ? await api.setHarnessSessionPermission(id, permissionMode)
      : await api.runHarnessMessage(id, `/perm ${permissionMode}`).then(() => api.getHarnessSession(id))
    if (activeSession.value?.id === id) activeSession.value = session
    await refreshSessions()
    return session
  }

  async function setActiveMcpServers(id: string, serverIds: string[]) {
    const api = getPlatformApi()
    if (!api) return undefined
    const session = await api.setHarnessActiveMcpServers(id, [...serverIds])
    if (activeSession.value?.id === id) activeSession.value = session
    return session
  }

  async function setDelegationEnabled(id: string, enabled: boolean) {
    const api = getPlatformApi()
    if (!api) return undefined
    const session = await api.setHarnessDelegationEnabled(id, enabled)
    if (activeSession.value?.id === id) activeSession.value = session
    return session
  }

  async function setSessionPinned(id: string, pinned: boolean) {
    const api = getPlatformApi()
    if (!api) return undefined
    const session = await api.setHarnessSessionPinned(id, pinned)
    if (activeSession.value?.id === id) activeSession.value = session
    await refreshSessions()
    return session
  }

  async function renameSession(id: string, title: string) {
    const api = getPlatformApi()
    if (!api) return undefined
    const session = await api.renameHarnessSession(id, title)
    if (activeSession.value?.id === id) activeSession.value = session
    await refreshSessions()
    return session
  }

  async function deleteSessions(ids: string[]) {
    const api = getPlatformApi()
    if (!api || !ids.length) return
    await api.deleteHarnessSessions(ids)
    if (activeSession.value && ids.includes(activeSession.value.id)) clearActiveSession()
    ids.forEach(id => removeComposerDraft(`session:${id}`))
    sessions.value = sessions.value.filter(session => !ids.includes(session.id))
    const removed = new Set(ids)
    runningSessionIds.value = runningSessionIds.value.filter(id => !removed.has(id))
    unreadSessionIds.value = unreadSessionIds.value.filter(id => !removed.has(id))
    pendingPermissionRequests.value = Object.fromEntries(Object.entries(pendingPermissionRequests.value).filter(([id]) => !removed.has(id)))
    await Promise.all([refreshSessions(), refreshProjects()])
  }

  async function confirmPlan(sessionId: string, planId: string, selection?: ModelSelection) {
    const api = getPlatformApi(); if (!api) return
    running.value = true
    await api.confirmHarnessPlan(sessionId, planId, selection)
  }

  async function continuePlan(sessionId: string, planId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection) {
    const api = getPlatformApi(); if (!api) return
    running.value = true
    await api.continueHarnessPlan(sessionId, planId, message, references, selection)
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

  function appendMessageDelta(delta: string) {
    if (!delta) return
    const last = activeSession.value?.messages[activeSession.value.messages.length - 1]
    if (last?.role === 'assistant') last.content += delta
    else activeSession.value?.messages.push({ id: `stream-${Date.now()}`, role: 'assistant', content: delta, createdAt: Date.now() })
  }

  function finishMessageStream() {
    const sessionId = completedMessageSessionId
    queuedMessageSessionId = undefined
    completedMessageSessionId = undefined
    messageCompletionDeadline = undefined
    rendering.value = false
    if (!sessionId || sessionId !== activeSession.value?.id) return
    const api = getPlatformApi()
    if (!api) return
    void api.getHarnessSession(sessionId).then(session => {
      if (activeSession.value?.id !== sessionId) return
      activeSession.value = session
      activeRun.value = undefined
      return Promise.all([refreshSessions(), refreshProjects()])
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
    if (!queuedMessageSessionId || queuedMessageSessionId !== activeSession.value?.id) {
      resetMessageQueue()
      return
    }
    queuedMessageTimer = undefined
    if (!queuedMessageCharacters.length) {
      rendering.value = false
      queuedMessageTimer = undefined
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
      if (requestId) {
        pendingPermissionRequests.value = {
          ...pendingPermissionRequests.value,
          [event.sessionId]: { requestId, title: typeof event.payload.title === 'string' ? event.payload.title : '请求权限', detail: typeof event.payload.detail === 'string' ? event.payload.detail : '' },
        }
      }
    }
    if (event.type === 'memory-status' && event.payload.status === 'needs_confirmation') {
      const requestId = typeof event.payload.requestId === 'string' ? event.payload.requestId : ''
      const content = typeof event.payload.content === 'string' ? event.payload.content : ''
      if (requestId && content) pendingMemoryConfirmations.value = { ...pendingMemoryConfirmations.value, [event.sessionId]: { requestId, candidateId: typeof event.payload.candidateId === 'string' ? event.payload.candidateId : '', content } }
    }
    if (event.type === 'status') {
      void refreshSessions()
      if (event.payload.state === 'running') {
        if (event.sessionId === activeSession.value?.id) lastRunError.value = undefined
        if (!runningSessionIds.value.includes(event.sessionId)) runningSessionIds.value = [...runningSessionIds.value, event.sessionId]
      } else {
        runningSessionIds.value = runningSessionIds.value.filter(id => id !== event.sessionId)
        const { [event.sessionId]: _removed, ...remaining } = pendingPermissionRequests.value
        pendingPermissionRequests.value = remaining
        if (event.sessionId !== activeSession.value?.id && !unreadSessionIds.value.includes(event.sessionId)) {
          unreadSessionIds.value = [...unreadSessionIds.value, event.sessionId]
        }
      }
    }
    if (event.sessionId !== activeSession.value?.id) return
    if ((event.type === 'plan-updated' || event.type === 'plan-confirmed' || event.type === 'plan-cancelled') && event.payload.plan && typeof event.payload.plan === 'object') {
      activePlan.value = event.payload.plan as HarnessPlan
      activeSession.value = { ...activeSession.value, activePlan: activePlan.value }
      void refreshSessions()
    }
    if (event.type === 'interaction-created' || event.type === 'interaction-resolved') {
      const api = getPlatformApi()
      if (api) void api.getHarnessSession(event.sessionId).then(session => {
        if (activeSession.value?.id !== event.sessionId) return
        activeSession.value = session
        activePlan.value = session.activePlan
        activeInteraction.value = session.pendingInteraction
      })
      void refreshSessions()
    }
    if (event.type === 'error') {
      lastRunError.value = { sessionId: event.sessionId, message: typeof event.payload.message === 'string' ? event.payload.message : '运行失败，请重试。' }
    }
    if (event.type === 'run-start') {
      activeRun.value = {
        sessionId: event.sessionId,
        startedAt: Number(event.payload.startedAt) || Date.now(),
        activities: Array.isArray(event.payload.activities) ? event.payload.activities as HarnessRunActivity[] : [],
        subtasks: Array.isArray(event.payload.subtasks) ? event.payload.subtasks as HarnessSubtask[] : [],
      }
    }
    if (event.type === 'run-activity' && activeRun.value?.sessionId === event.sessionId && Array.isArray(event.payload.activities)) {
      activeRun.value = { ...activeRun.value, activities: event.payload.activities as HarnessRunActivity[], subtasks: Array.isArray(event.payload.subtasks) ? event.payload.subtasks as HarnessSubtask[] : activeRun.value.subtasks }
    }
    if (event.type === 'message-delta') {
      const delta = String(event.payload.delta || '')
      queueMessageDelta(event.sessionId, delta)
    }
    if (event.type === 'context-usage' && event.payload.usage && typeof event.payload.usage === 'object') {
      activeSession.value = {
        ...activeSession.value,
        context: { ...activeSession.value.context, usage: event.payload.usage as HarnessContextUsage },
      }
    }
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

  return {
    sessions,
    projects,
    activeSession,
    running,
    rendering,
    activeRun,
    activePlan,
    activeInteraction,
    drafts,
    lastModelSelection,
    runningSessionIds,
    unreadSessionIds,
    pendingPermissionRequests,
    pendingMemoryConfirmations,
    lastRunError,
    refreshSessions,
    refreshProjects,
    createProject,
    removeProject,
    openSession,
    createSession,
    setSessionPermission,
    setActiveMcpServers,
    setDelegationEnabled,
    setSessionPinned,
    confirmPlan,
    continuePlan,
    cancelPlan,
    answerInteraction,
    renameSession,
    respondPermission,
    respondMemoryConfirmation,
    deleteSessions,
    applyEvent,
    ensureComposerDraft,
    updateComposerDraft,
    removeComposerDraft,
    startDraft,
    setLastModelSelection,
    clearActiveSession,
  }
})
