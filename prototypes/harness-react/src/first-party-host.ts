import type { HarnessEvent, HarnessPermissionRequest, HarnessProject, HarnessSession, HarnessSessionSummary, HarnessUserAnswer, ModelProviderSummary, ModelSelection } from '../../../src/config/harness'
import type { PilotHost } from './pilot-state'

export class FirstPartyHarnessHost implements PilotHost {
  private sequence = 0
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private listeners = new Set<(event: HarnessEvent) => void>()

  constructor(private port: MessagePort) {
    port.onmessage = message => {
      const data = message.data
      if (data?.type === 'mira:harness-event') {
        this.listeners.forEach(listener => listener(data.event as HarnessEvent))
        return
      }
      if (data?.type !== 'mira:response' || typeof data.id !== 'string') return
      const request = this.pending.get(data.id)
      if (!request) return
      this.pending.delete(data.id)
      if (data.ok) request.resolve(data.value)
      else request.reject(new Error(typeof data.error?.message === 'string' ? data.error.message : '平台调用失败'))
    }
    port.start()
  }

  private call<T>(method: string, params?: unknown): Promise<T> {
    const id = String(++this.sequence)
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject })
      try { this.port.postMessage({ type: 'mira:request', id, method: `harness.${method}`, params }) }
      catch (error) { this.pending.delete(id); reject(error) }
    })
  }

  listSessions = () => this.call<HarnessSessionSummary[]>('sessions.list')
  listProjects = () => this.call<HarnessProject[]>('projects.list')
  getSession = (id: string) => this.call<HarnessSession>('session.get', { id })
  createSession = (projectId?: string) => this.call<HarnessSession>('session.create', { projectId })
  listProviders = () => this.call<ModelProviderSummary[]>('providers.list')
  runMessage = (sessionId: string, text: string, selection: ModelSelection, planning: boolean) => this.call<void>('message.run', { sessionId, text, selection, planning })
  respondPermission = (requestId: string, allowed: boolean) => this.call<void>('permission.respond', { requestId, allowed })
  listPendingPermissions = (sessionId: string) => this.call<HarnessPermissionRequest[]>('permissions.pending', { sessionId })
  openSessionProject = (sessionId: string) => this.call<string>('project.open', { sessionId })
  abortRun = (sessionId: string) => this.call<void>('run.abort', { sessionId })
  confirmPlan = (sessionId: string, planId: string, selection: ModelSelection) => this.call<unknown>('plan.confirm', { sessionId, planId, selection })
  answerInteraction = (sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection: ModelSelection) => this.call<unknown>('interaction.answer', { sessionId, interactionId, answers, selection })
  onEvent = (listener: (event: HarnessEvent) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  close() {
    this.port.close()
    this.pending.forEach(request => request.reject(new Error('Harness 连接已关闭')))
    this.pending.clear()
    this.listeners.clear()
  }
}
