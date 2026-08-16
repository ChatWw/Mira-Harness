import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessEvent, HarnessFileReference, HarnessProject, HarnessProjectCreateInput, HarnessSession, HarnessSessionSummary, ModelSelection } from '@/config/harness'

const DRAFT_STORAGE_KEY = 'mira-harness-composer-drafts'

export interface HarnessComposerDraft {
  text: string
  projectId?: string
  modelSelection?: ModelSelection
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
          ? { providerId: draft.modelSelection.providerId, modelId: draft.modelSelection.modelId }
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

export const useHarnessStore = defineStore('harness', () => {
  const sessions = ref<HarnessSessionSummary[]>([])
  const projects = ref<HarnessProject[]>([])
  const activeSession = ref<HarnessSession>()
  const running = ref(false)
  const drafts = ref<Record<string, HarnessComposerDraft>>(loadDrafts())

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

  function updateComposerDraft(key: string, patch: Partial<Pick<HarnessComposerDraft, 'text' | 'projectId' | 'attachments' | 'modelSelection'>>) {
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
    activeSession.value = undefined
    running.value = false
    const token = createDraftToken()
    ensureComposerDraft(`draft:${token}`, projectId)
    return token
  }

  function clearActiveSession() {
    activeSession.value = undefined
    running.value = false
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

  async function openSession(id: string) {
    const api = getPlatformApi()
    activeSession.value = api ? await api.getHarnessSession(id) : undefined
    return activeSession.value
  }

  async function createSession(projectId?: string) {
    const api = getPlatformApi()
    if (!api) return undefined
    activeSession.value = await api.createHarnessSession(projectId)
    await Promise.all([refreshSessions(), refreshProjects()])
    return activeSession.value
  }

  async function deleteSessions(ids: string[]) {
    const api = getPlatformApi()
    if (!api || !ids.length) return
    await api.deleteHarnessSessions(ids)
    if (activeSession.value && ids.includes(activeSession.value.id)) activeSession.value = undefined
    ids.forEach(id => removeComposerDraft(`session:${id}`))
    await Promise.all([refreshSessions(), refreshProjects()])
  }

  function applyEvent(event: HarnessEvent) {
    if (event.sessionId !== activeSession.value?.id) return
    if (event.type === 'message-delta') {
      const delta = String(event.payload.delta || '')
      const last = activeSession.value.messages[activeSession.value.messages.length - 1]
      if (last?.role === 'assistant') last.content += delta
      else activeSession.value.messages.push({ id: `stream-${Date.now()}`, role: 'assistant', content: delta, createdAt: Date.now() })
    }
    if (event.type === 'status') running.value = event.payload.state === 'running'
    if (event.type === 'message-complete') void openSession(event.sessionId).then(() => Promise.all([refreshSessions(), refreshProjects()]))
  }

  return {
    sessions,
    projects,
    activeSession,
    running,
    drafts,
    refreshSessions,
    refreshProjects,
    createProject,
    openSession,
    createSession,
    deleteSessions,
    applyEvent,
    ensureComposerDraft,
    updateComposerDraft,
    removeComposerDraft,
    startDraft,
    clearActiveSession,
  }
})
