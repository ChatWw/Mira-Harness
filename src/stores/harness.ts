import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessEvent, HarnessProject, HarnessProjectCreateInput, HarnessSession, HarnessSessionSummary } from '@/config/harness'

export const useHarnessStore = defineStore('harness', () => {
  const sessions = ref<HarnessSessionSummary[]>([])
  const projects = ref<HarnessProject[]>([])
  const activeSession = ref<HarnessSession>()
  const running = ref(false)

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

  return { sessions, projects, activeSession, running, refreshSessions, refreshProjects, createProject, openSession, createSession, deleteSessions, applyEvent }
})
