import type { HarnessEvent, HarnessFileReference, HarnessPermissionRequest, HarnessProject, HarnessSession, HarnessSessionOrderScope, HarnessSessionSummary, HarnessUserAnswer, HarnessWorkspaceFileEntry, ModelProviderSummary, ModelSelection, PermissionMode } from '../../../src/config/harness'
import type { PilotBrowserEvent, PilotHost } from './pilot-state'
import type { HarnessBrowserBounds } from '../../../src/platform/firstPartyHarness'

export class FirstPartyHarnessHost implements PilotHost {
  private sequence = 0
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private listeners = new Set<(event: HarnessEvent) => void>()
  private browserListeners = new Set<(event: PilotBrowserEvent) => void>()

  constructor(private port: MessagePort) {
    port.onmessage = message => {
      const data = message.data
      if (data?.type === 'mira:harness-event') {
        this.listeners.forEach(listener => listener(data.event as HarnessEvent))
        return
      }
      if (data?.type === 'mira:browser-event') {
        this.browserListeners.forEach(listener => listener(data.event as PilotBrowserEvent))
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

  private request<T>(method: string, params?: unknown): Promise<T> {
    const id = String(++this.sequence)
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject })
      try { this.port.postMessage({ type: 'mira:request', id, method, params }) }
      catch (error) { this.pending.delete(id); reject(error) }
    })
  }

  private call<T>(method: string, params?: unknown): Promise<T> {
    return this.request<T>(`harness.${method}`, params)
  }

  listSessions = () => this.call<HarnessSessionSummary[]>('sessions.list')
  listProjects = () => this.call<HarnessProject[]>('projects.list')
  getSession = (id: string) => this.call<HarnessSession>('session.get', { id })
  createSession = (projectId?: string) => this.call<HarnessSession>('session.create', { projectId })
  listProviders = () => this.call<ModelProviderSummary[]>('providers.list')
  runMessage = (sessionId: string, text: string, selection: ModelSelection, planning: boolean, references: HarnessFileReference[] = []) => this.call<void>('message.run', { sessionId, text, references, selection, planning })
  respondPermission = (requestId: string, allowed: boolean) => this.call<void>('permission.respond', { requestId, allowed })
  listPendingPermissions = (sessionId: string) => this.call<HarnessPermissionRequest[]>('permissions.pending', { sessionId })
  openSessionProject = (sessionId: string, target: 'file-manager' | 'terminal' = 'file-manager') => this.call<string>('project.open', { sessionId, target })
  abortRun = (sessionId: string) => this.call<void>('run.abort', { sessionId })
  confirmPlan = (sessionId: string, planId: string, selection: ModelSelection) => this.call<unknown>('plan.confirm', { sessionId, planId, selection })
  answerInteraction = (sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection: ModelSelection) => this.call<unknown>('interaction.answer', { sessionId, interactionId, answers, selection })
  listFiles = (sessionId: string, path: string) => this.call<{ path: string; entries: HarnessWorkspaceFileEntry[] }>('files.list', { sessionId, path })
  readFile = (sessionId: string, path: string) => this.call<{ path: string; content: string }>('files.read', { sessionId, path })
  openTerminal = (sessionId: string) => this.call<{ terminalId: string; sessionId: string; cwd: string }>('terminal.open', { sessionId })
  writeTerminal = (sessionId: string, terminalId: string, data: string) => this.call<void>('terminal.write', { sessionId, terminalId, data })
  resizeTerminal = (sessionId: string, terminalId: string, columns: number, rows: number) => this.call<void>('terminal.resize', { sessionId, terminalId, columns, rows })
  closeTerminal = (sessionId: string, terminalId: string) => this.call<void>('terminal.close', { sessionId, terminalId })
  navigateBrowser = (sessionId: string, url: string, bounds: HarnessBrowserBounds) => this.call<string>('browser.navigate', { sessionId, url, bounds })
  setBrowserBounds = (sessionId: string, bounds: HarnessBrowserBounds) => this.call<void>('browser.bounds', { sessionId, bounds })
  controlBrowser = (sessionId: string, action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close') => this.call<void>('browser.control', { sessionId, action })
  onEvent = (listener: (event: HarnessEvent) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  onBrowserEvent = (listener: (event: PilotBrowserEvent) => void) => { this.browserListeners.add(listener); return () => { this.browserListeners.delete(listener) } }
  getPreference = (key: string) => this.request<unknown>('preferences.get', { key })
  setPreference = (key: string, value: unknown) => this.request<void>('preferences.set', { key, value })
  renameSession = (id: string, title: string) => this.call<void>('session.rename', { id, title })
  setSessionPinned = (id: string, pinned: boolean) => this.call<void>('session.set-pinned', { id, pinned })
  setSessionUnread = (id: string, unread: boolean) => this.call<void>('session.set-unread', { id, unread })
  archiveSession = (id: string) => this.call<void>('session.archive', { id })
  deleteSession = (id: string) => this.call<void>('session.delete', { id })
  moveSession = (id: string, projectId: string) => this.call<void>('session.move', { id, projectId })
  reorderSessions = (scope: HarnessSessionOrderScope, ids: string[]) => this.call<void>('session.reorder', { scope, ids })
  reorderProjects = (ids: string[]) => this.call<void>('projects.reorder', { ids })
  setSessionPermission = (id: string, mode: PermissionMode) => this.call<void>('session.set-permission', { id, mode })
  setSessionSkills = (id: string, skillIds: string[]) => this.call<void>('session.set-skills', { id, skillIds })
  setSessionMcpServers = (id: string, serverIds: string[]) => this.call<void>('session.set-mcp-servers', { id, serverIds })
  setSessionDelegation = (id: string, enabled: boolean) => this.call<void>('session.set-delegation', { id, enabled })
  listSkills = () => this.call<unknown[]>('skills.list')
  listGitBranches = (projectId: string) => this.call<unknown>('git.branches', { projectId })
  checkoutGitBranch = (projectId: string, branch: string) => this.call<void>('git.checkout', { projectId, branch })
  createGitBranch = (projectId: string, branch: string) => this.call<void>('git.create-branch', { projectId, branch })
  respondMemory = (requestId: string, approved: boolean) => this.call<void>('memory.respond', { requestId, approved })
  saveMemory = (id: string, selection: ModelSelection) => this.call<void>('memory.save', { sessionId: id, selection })
  stopSubtasks = (id: string, subtaskId?: string) => this.call<void>('subtask.stop', { sessionId: id, subtaskId })
  rerun = (id: string, selection: ModelSelection) => this.call<void>('run.rerun', { sessionId: id, selection })
  editAndRerun = (id: string, messageId: string, content: string, selection: ModelSelection) => this.call<void>('run.edit-rerun', { sessionId: id, messageId, content, selection })
  cancelPlan = (id: string, planId: string) => this.call<void>('plan.cancel', { sessionId: id, planId })
  continuePlan = (id: string, planId: string, message: string, references: HarnessFileReference[], selection: ModelSelection) => this.call<void>('plan.continue', { sessionId: id, planId, message, references, selection })

  close() {
    this.port.close()
    this.pending.forEach(request => request.reject(new Error('Harness 连接已关闭')))
    this.pending.clear()
    this.listeners.clear()
    this.browserListeners.clear()
  }
}
