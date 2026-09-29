import { isModelProviderAvailable, type HarnessEvent, type HarnessMessage, type HarnessPermissionRequest, type HarnessProject, type HarnessSession, type HarnessSessionSummary, type HarnessUserAnswer, type HarnessWorkspaceFileEntry, type ModelProviderSummary, type ModelSelection } from '../../../src/config/harness'
import type { HarnessBrowserBounds } from '../../../src/platform/firstPartyHarness'

export interface PilotBrowserEvent { sessionId: string; url: string; canGoBack: boolean; canGoForward: boolean; loading: boolean; error?: string }

export interface PilotHost {
  listSessions(): Promise<HarnessSessionSummary[]>
  listProjects(): Promise<HarnessProject[]>
  getSession(id: string): Promise<HarnessSession>
  createSession(projectId?: string): Promise<HarnessSession>
  listProviders(): Promise<ModelProviderSummary[]>
  runMessage(id: string, text: string, selection: ModelSelection, planning: boolean): Promise<void>
  onEvent(listener: (event: HarnessEvent) => void): () => void
  respondPermission(requestId: string, allowed: boolean): Promise<void>
  listPendingPermissions(id: string): Promise<HarnessPermissionRequest[]>
  openSessionProject(id: string): Promise<string>
  abortRun(id: string): Promise<void>
  confirmPlan(id: string, planId: string, selection: ModelSelection): Promise<unknown>
  answerInteraction(id: string, interactionId: string, answers: HarnessUserAnswer[], selection: ModelSelection): Promise<unknown>
  listFiles(id: string, path: string): Promise<{ path: string; entries: HarnessWorkspaceFileEntry[] }>
  readFile(id: string, path: string): Promise<{ path: string; content: string }>
  openTerminal(id: string): Promise<{ terminalId: string; sessionId: string; cwd: string }>
  writeTerminal(id: string, terminalId: string, data: string): Promise<void>
  resizeTerminal(id: string, terminalId: string, columns: number, rows: number): Promise<void>
  closeTerminal(id: string, terminalId: string): Promise<void>
  navigateBrowser(id: string, url: string, bounds: HarnessBrowserBounds): Promise<string>
  setBrowserBounds(id: string, bounds: HarnessBrowserBounds): Promise<void>
  controlBrowser(id: string, action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close'): Promise<void>
  onBrowserEvent(listener: (event: PilotBrowserEvent) => void): () => void
  /** 宿主偏好读写（第一方命名空间）；开发态宿主可以缺省。 */
  getPreference?(key: string): Promise<unknown>
  setPreference?(key: string, value: unknown): Promise<void>
}

export interface PilotState {
  sessions: HarnessSessionSummary[]
  projects: HarnessProject[]
  session?: HarnessSession
  providers: ModelProviderSummary[]
  selection?: ModelSelection
  messages: HarnessMessage[]
  running: boolean
  openingProjectDirectory?: boolean
  permission?: HarnessPermissionRequest
  error?: string
}

export function projectPilotMessage(message: HarnessMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt),
    ...(message.role === 'assistant' ? { status: message.id.startsWith('stream-') ? { type: 'running' as const } : { type: 'complete' as const, reason: 'unknown' as const } } : {}),
  }
}

export function getPilotTaskState(state: PilotState) {
  const latestRun = [...state.messages].reverse().find(message => message.run)?.run
  const failedTool = state.session?.toolCalls.some(tool => tool.status === 'failed' && (!latestRun || tool.createdAt >= latestRun.startedAt))
  const failedActivity = latestRun?.activities.some(activity => activity.status === 'failed')
  if (state.permission || state.session?.pendingInteraction?.status === 'waiting') return '等待确认'
  if (state.running) return '正在执行'
  if (state.session?.status === 'failed' || latestRun?.status === 'failed') return '执行失败'
  if (latestRun?.status === 'stopped') return '已停止，可继续发送'
  if (failedActivity || failedTool) return '部分操作未完成'
  if (state.session?.status === 'completed') return '最近任务已完成'
  return state.session ? '等待下一步' : '尚未开始'
}

export type PilotTaskTone = 'idle' | 'running' | 'waiting' | 'completed' | 'partial' | 'failed' | 'stopped'

export function getPilotTaskTone(taskState: string): PilotTaskTone {
  if (taskState === '正在执行') return 'running'
  if (taskState === '等待确认') return 'waiting'
  if (taskState === '最近任务已完成') return 'completed'
  if (taskState === '部分操作未完成') return 'partial'
  if (taskState === '执行失败') return 'failed'
  if (taskState === '已停止，可继续发送') return 'stopped'
  return 'idle'
}

export function shouldRenderPilotStream(messageId: string, isOptimistic: boolean, streamId?: string) {
  return Boolean(streamId && (streamId === messageId || isOptimistic))
}

export class PilotController {
  private state: PilotState = { sessions: [], projects: [], providers: [], messages: [], running: false }
  private listeners = new Set<() => void>()
  private terminalListeners = new Set<(event: HarnessEvent) => void>()
  private unsubscribe?: () => void
  private generation = 0
  private snapshotVersion = 0
  private permissionRevision = 0
  private activeSessionId?: string
  private disposed = false
  private defaultSelection?: ModelSelection

  constructor(private host: PilotHost) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<PilotState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  async start() {
    this.unsubscribe = this.host.onEvent(this.handleEvent)
    try {
      const [sessions, projects, providers] = await Promise.all([this.host.listSessions(), this.host.listProjects(), this.host.listProviders()])
      if (this.disposed) return
      const available = providers.flatMap(provider => isModelProviderAvailable(provider)
        ? provider.models.filter(model => model.enabled).map(model => ({ providerId: provider.id, modelId: model.id })) : [])
      const storedSelection = await this.readPreference<ModelSelection>('model-selection')
      this.defaultSelection = storedSelection && available.some(item => item.providerId === storedSelection.providerId && item.modelId === storedSelection.modelId)
        ? storedSelection : available[0]
      this.update({ sessions, projects, providers, selection: this.defaultSelection })
      if (sessions[0]) await this.open(sessions[0].id)
    } catch (error) { this.fail(error) }
  }
  async open(id: string) {
    const generation = ++this.generation
    this.snapshotVersion++
    this.activeSessionId = id
    const permissionRevision = this.permissionRevision
    this.update({ session: undefined, messages: [], running: false, openingProjectDirectory: false, permission: undefined, error: undefined })
    try {
      const [session, pendingPermissions] = await Promise.all([this.host.getSession(id), this.host.listPendingPermissions(id)])
      if (generation !== this.generation || this.disposed) return
      const storedSelection = this.state.providers.some(provider => provider.id === session.modelProviderId && isModelProviderAvailable(provider) && provider.models.some(model => model.id === session.modelId && model.enabled))
        ? { providerId: session.modelProviderId!, modelId: session.modelId! } : undefined
      this.update({ session, selection: session.modelProviderId || session.modelId ? storedSelection : this.defaultSelection, messages: session.messages.filter(message => !message.internal), running: Boolean(session.activeRun), permission: permissionRevision === this.permissionRevision ? pendingPermissions[0] : this.state.permission })
    } catch (error) { if (generation === this.generation) this.fail(error) }
  }
  async create(projectId?: string) {
    try {
      if (projectId && !this.state.projects.some(project => project.id === projectId && project.directoryExists)) throw new Error('所选项目目录不可用，请重新选择')
      const session = await this.host.createSession(projectId)
      if (this.disposed) return false
      await this.refreshList()
      await this.open(session.id)
      return this.state.session?.id === session.id
    } catch (error) { this.fail(error); return false }
  }
  select(selection: ModelSelection) {
    this.update({ selection })
    this.writePreference('model-selection', selection)
  }
  private readPreference<T>(key: string): Promise<T | null> {
    if (!this.host.getPreference) return Promise.resolve(null)
    return this.host.getPreference(key).then(value => (value ?? null) as T | null).catch(() => null)
  }
  private writePreference(key: string, value: unknown) {
    void this.host.setPreference?.(key, value).catch(() => undefined)
  }
  async send(text: string, planning = false) {
    const selection = this.state.selection
    if (!text.trim() || !selection || this.state.running || this.state.permission || this.state.session?.pendingInteraction?.status === 'waiting') return
    const session = this.state.session
    if (!session) return
    const generation = this.generation
    this.update({ running: true, error: undefined, messages: [...this.state.messages, { id: `pending-${Date.now()}`, role: 'user', content: text.trim(), createdAt: Date.now() }] })
    try {
      await this.host.runMessage(session.id, text.trim(), selection, planning)
      await this.refreshSession(session.id, generation)
    } catch (error) {
      if (generation === this.generation) { this.fail(error); await this.refreshSession(session.id, generation) }
    }
  }
  async stop() {
    const id = this.state.session?.id
    if (!id) return
    try { await this.host.abortRun(id) } catch (error) { this.fail(error) }
  }
  async openProjectDirectory() {
    const session = this.state.session
    if (!session?.workingDirectory || this.state.openingProjectDirectory) return
    const generation = this.generation
    this.update({ openingProjectDirectory: true, error: undefined })
    try {
      const error = await this.host.openSessionProject(session.id)
      if (generation !== this.generation || this.disposed) return
      if (error) throw new Error(error)
    } catch (error) { if (generation === this.generation) this.fail(error) }
    finally { if (generation === this.generation) this.update({ openingProjectDirectory: false }) }
  }
  async permission(allowed: boolean) {
    const request = this.state.permission
    if (!request) return
    try {
      await this.host.respondPermission(request.requestId, allowed)
      if (this.activeSessionId === request.sessionId && this.state.permission?.requestId === request.requestId) { this.permissionRevision++; this.update({ permission: undefined }) }
    }
    catch (error) { this.fail(error) }
  }
  async confirmPlan() {
    const { session, selection } = this.state
    if (session?.pendingInteraction?.kind !== 'plan-review' || !selection) return
    try { await this.host.confirmPlan(session.id, session.pendingInteraction.planId, selection); await this.refreshSession(session.id, this.generation) }
    catch (error) { this.fail(error) }
  }
  async answerQuestion(answers: HarnessUserAnswer[]) {
    const { session, selection } = this.state
    if (session?.pendingInteraction?.kind !== 'question' || !selection) return
    try { await this.host.answerInteraction(session.id, session.pendingInteraction.id, answers, selection); await this.refreshSession(session.id, this.generation) }
    catch (error) { this.fail(error) }
  }
  listFiles(path = '') {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.listFiles(id, path)
  }
  readFile(path: string) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.readFile(id, path)
  }
  openTerminal() {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.openTerminal(id)
  }
  writeTerminal(terminalId: string, data: string) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.writeTerminal(id, terminalId, data)
  }
  resizeTerminal(terminalId: string, columns: number, rows: number) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.resizeTerminal(id, terminalId, columns, rows)
  }
  closeTerminal(terminalId: string) {
    const id = this.state.session?.id
    if (!id) return Promise.resolve()
    return this.host.closeTerminal(id, terminalId)
  }
  closeTerminalFor(sessionId: string, terminalId: string) { return this.host.closeTerminal(sessionId, terminalId) }
  navigateBrowser(url: string, bounds: HarnessBrowserBounds) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.navigateBrowser(id, url, bounds)
  }
  setBrowserBounds(bounds: HarnessBrowserBounds) {
    const id = this.state.session?.id
    return id ? this.host.setBrowserBounds(id, bounds) : Promise.resolve()
  }
  controlBrowser(action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close') {
    const id = this.state.session?.id
    return id ? this.host.controlBrowser(id, action) : Promise.resolve()
  }
  closeBrowserFor(id: string) { return this.host.controlBrowser(id, 'close') }
  onBrowserEvent = (listener: (event: PilotBrowserEvent) => void) => this.host.onBrowserEvent(listener)
  onTerminalEvent = (listener: (event: HarnessEvent) => void) => { this.terminalListeners.add(listener); return () => { this.terminalListeners.delete(listener) } }
  private refreshList = async () => {
    const sessions = await this.host.listSessions()
    this.update({ sessions })
  }
  private async refreshSession(id: string, generation: number, replaceMessages = true) {
    const version = ++this.snapshotVersion
    try {
      const session = await this.host.getSession(id)
      if (generation !== this.generation || version !== this.snapshotVersion || this.disposed) return
      this.update({ session, ...(replaceMessages ? { messages: session.messages.filter(message => !message.internal) } : {}), running: Boolean(session.activeRun) })
      await this.refreshList()
    } catch (error) { if (generation === this.generation) this.fail(error) }
  }
  private handleEvent = (event: HarnessEvent) => {
    if (event.type === 'terminal-output' || event.type === 'terminal-exit') {
      this.terminalListeners.forEach(listener => listener(event))
      return
    }
    if (event.type === 'status' || event.type === 'title-updated') void this.refreshList().catch(error => this.fail(error))
    if (event.sessionId !== this.activeSessionId) return
    const generation = this.generation
    if (event.type === 'message-delta') {
      const delta = typeof event.payload.delta === 'string' ? event.payload.delta : ''
      if (!delta) return
      const messages = [...this.state.messages]
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant' && last.id.startsWith('stream-')) messages[messages.length - 1] = { ...last, content: last.content + delta }
      else messages.push({ id: `stream-${event.runId || Date.now()}`, role: 'assistant', content: delta, createdAt: Date.now() })
      this.update({ messages, running: true })
    }
    if (event.type === 'permission-request' && typeof event.payload.requestId === 'string') {
      this.permissionRevision++
      this.update({ permission: { sessionId: event.sessionId, requestId: event.payload.requestId, title: String(event.payload.title || '请求权限'), detail: String(event.payload.detail || '') } })
    }
    if (event.type === 'run-start' || event.type === 'status' && event.payload.state === 'running') this.update({ running: true, error: undefined })
    if (event.type === 'error') this.update({ error: String(event.payload.message || '任务执行失败') })
    if (event.type === 'run-activity' || event.type === 'tool-call') void this.refreshSession(event.sessionId, generation, false)
    if (event.type === 'message-complete' || event.type === 'interaction-created' || event.type === 'interaction-resolved' || event.type === 'plan-updated' || event.type === 'status' && event.payload.state !== 'running') {
      if (event.type === 'status' && event.payload.state !== 'running') { this.permissionRevision++; this.update({ running: false, permission: undefined }) }
      void this.refreshSession(event.sessionId, generation)
    }
  }
  private fail(error: unknown) { this.update({ error: error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : '操作失败' }) }
  dispose() { this.disposed = true; this.generation++; this.snapshotVersion++; this.unsubscribe?.(); this.unsubscribe = undefined; this.terminalListeners.clear(); this.listeners.clear() }
}
