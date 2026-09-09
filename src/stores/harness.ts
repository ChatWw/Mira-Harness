import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessContextUsage, HarnessEvent, HarnessProject, HarnessProjectCreateInput, HarnessSession, HarnessSessionSummary, PermissionMode } from '@/config/harness'
import { createHarnessComposerState } from './harnessComposerState'
import { createHarnessInteractionState } from './harnessInteractionState'
import { createHarnessRunStateManager } from './harnessRunState'
export type { HarnessComposerDraft } from './harnessComposerState'
export type { HarnessPendingMemoryConfirmation, HarnessPendingPermissionRequest, HarnessRunError } from './harnessInteractionState'
export type { HarnessRunProgress } from './harnessRunState'

export const useHarnessStore = defineStore('harness', () => {
  const sessions = ref<HarnessSessionSummary[]>([])
  const projects = ref<HarnessProject[]>([])
  const activeSession = ref<HarnessSession>()
  const composerState = createHarnessComposerState()
  const { drafts, lastModelSelection, ensureComposerDraft, updateComposerDraft, removeComposerDraft, setLastModelSelection } = composerState
  const runState = createHarnessRunStateManager({
    getActiveSession: () => activeSession.value,
    setActiveSession: session => { activeSession.value = session; interactionState.syncSession(session) },
    refreshSessions,
    refreshProjects,
  })
  const { running, rendering, activeRun, publicRunState, runningSessionIds, unreadSessionIds } = runState
  const interactionState = createHarnessInteractionState({
    getActiveSession: () => activeSession.value,
    setActiveSession: session => { activeSession.value = session },
    setRunning: value => { running.value = value },
    refreshSessions,
  })
  const { activePlan, activeInteraction, pendingPermissionRequests, pendingMemoryConfirmations, lastRunError, confirmPlan, continuePlan, cancelPlan, answerInteraction, respondPermission, respondMemoryConfirmation } = interactionState

  function startDraft(projectId?: string) {
    runState.clearActive()
    activeSession.value = undefined
    interactionState.clearActive()
    return composerState.createDraft(projectId)
  }

  function clearActiveSession() {
    runState.clearActive()
    activeSession.value = undefined
    interactionState.clearActive()
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
    runState.prepareSession(id)
    const api = getPlatformApi()
    activeSession.value = api ? await api.getHarnessSession(id) : undefined
    interactionState.syncSession(activeSession.value)
    runState.restoreSession(activeSession.value)
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
    runState.removeSessions(ids)
    interactionState.removeSessions(ids)
    await Promise.all([refreshSessions(), refreshProjects()])
  }

  function applyEvent(event: HarnessEvent) {
    if (!runState.acceptEvent(event)) return
    if (event.type === 'title-updated') {
      const title = typeof event.payload.title === 'string' ? event.payload.title : ''
      if (title) {
        sessions.value = sessions.value.map(session => session.id === event.sessionId ? { ...session, title } : session)
        if (activeSession.value?.id === event.sessionId) activeSession.value = { ...activeSession.value, title }
      }
      return
    }
    interactionState.applyEvent(event)
    runState.applyEvent(event)
    if (event.sessionId !== activeSession.value?.id) return
    if (event.type === 'context-usage' && event.payload.usage && typeof event.payload.usage === 'object') {
      activeSession.value = {
        ...activeSession.value,
        context: { ...activeSession.value.context, usage: event.payload.usage as HarnessContextUsage },
      }
    }
  }

  return {
    sessions,
    projects,
    activeSession,
    running,
    rendering,
    activeRun,
    publicRunState,
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
