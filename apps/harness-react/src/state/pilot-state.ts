import { isModelProviderAvailable, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessPermissionRequest, type HarnessProject, type HarnessSession, type HarnessSessionOrderScope, type HarnessSessionSummary, type HarnessUserAnswer, type HarnessWorkspaceFileEntry, type HarnessWorkspaceFileSearchResult, type HarnessWorkspaceGitSnapshot, type HarnessWorkspaceImagePreview, type ModelProviderSummary, type ModelSelection, type PermissionMode } from '../../../../src/config/harness'
import type { HarnessBrowserBounds } from '../../../../src/platform/firstPartyHarness'

export interface PilotBrowserEvent { sessionId: string; url: string; canGoBack: boolean; canGoForward: boolean; loading: boolean; error?: string }
export interface PilotWorkspaceFileEvent { sessionId: string; watchId: string; directory: string; paths: string[]; error?: string }

export interface PilotHost {
  listSessions(): Promise<HarnessSessionSummary[]>
  listProjects(): Promise<HarnessProject[]>
  getSession(id: string): Promise<HarnessSession>
  createSession(projectId?: string): Promise<HarnessSession>
  listProviders(): Promise<ModelProviderSummary[]>
  runMessage(id: string, text: string, selection: ModelSelection, planning: boolean, references?: HarnessFileReference[]): Promise<void>
  onEvent(listener: (event: HarnessEvent) => void): () => void
  respondPermission(requestId: string, allowed: boolean): Promise<void>
  listPendingPermissions(id: string): Promise<HarnessPermissionRequest[]>
  openSessionProject(id: string, target?: 'file-manager' | 'terminal'): Promise<string>
  abortRun(id: string): Promise<void>
  confirmPlan(id: string, planId: string, selection: ModelSelection): Promise<unknown>
  answerInteraction(id: string, interactionId: string, answers: HarnessUserAnswer[], selection: ModelSelection): Promise<unknown>
  listFiles(id: string, path: string): Promise<{ path: string; entries: HarnessWorkspaceFileEntry[] }>
  searchFiles?(sessionId: string, query: string, refresh?: boolean): Promise<HarnessWorkspaceFileSearchResult>
  getWorkspaceGit?(sessionId: string): Promise<HarnessWorkspaceGitSnapshot>
  getWorkspaceIgnored?(sessionId: string, paths: string[]): Promise<string[]>
  watchFiles?(sessionId: string, paths: string[]): Promise<{ watchId: string }>
  unwatchFiles?(sessionId: string, watchId: string): Promise<void>
  listEditors?(refresh?: boolean): Promise<Array<{ id: string; name: string; icon?: string }>>
  openFileInEditor?(sessionId: string, path: string, editorId: string): Promise<void>
  readFile(id: string, path: string): Promise<{ path: string; content: string }>
  readImage?(id: string, path: string): Promise<HarnessWorkspaceImagePreview>
  openTerminal(id: string): Promise<{ terminalId: string; sessionId: string; cwd: string }>
  writeTerminal(id: string, terminalId: string, data: string): Promise<void>
  resizeTerminal(id: string, terminalId: string, columns: number, rows: number): Promise<void>
  closeTerminal(id: string, terminalId: string): Promise<void>
  navigateBrowser(id: string, url: string, bounds: HarnessBrowserBounds): Promise<string>
  setBrowserBounds(id: string, bounds: HarnessBrowserBounds): Promise<void>
  controlBrowser(id: string, action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close'): Promise<void>
  onBrowserEvent(listener: (event: PilotBrowserEvent) => void): () => void
  navigate?(path: string): Promise<void>
  /** 宿主偏好读写（第一方命名空间）；开发态宿主可以缺省。 */
  getPreference?(key: string): Promise<unknown>
  setPreference?(key: string, value: unknown): Promise<void>
  /** 会话管理面（完整第一方宿主都支持；开发态 props 宿主可逐步接入）。 */
  renameSession?(id: string, title: string): Promise<void>
  setSessionPinned?(id: string, pinned: boolean): Promise<void>
  setSessionUnread?(id: string, unread: boolean): Promise<void>
  archiveSession?(id: string): Promise<void>
  deleteSession?(id: string): Promise<void>
  moveSession?(id: string, projectId: string): Promise<void>
  reorderSessions?(scope: HarnessSessionOrderScope, ids: string[]): Promise<void>
  reorderProjects?(ids: string[]): Promise<void>
  setSessionPermission?(id: string, mode: PermissionMode): Promise<void>
  setSessionSkills?(id: string, skillIds: string[]): Promise<void>
  setSessionMcpServers?(id: string, serverIds: string[]): Promise<void>
  setSessionDelegation?(id: string, enabled: boolean): Promise<void>
  listSkills?(): Promise<unknown[]>
  listMcp?(): Promise<Array<{ id: string; name: string; enabled: boolean }>>
  selectFiles?(id: string): Promise<HarnessFileReference[]>
  listGitBranches?(projectId: string): Promise<unknown>
  checkoutGitBranch?(projectId: string, branch: string): Promise<void>
  createGitBranch?(projectId: string, branch: string): Promise<void>
  respondMemory?(requestId: string, approved: boolean): Promise<void>
  saveMemory?(id: string, selection: ModelSelection): Promise<void>
  stopSubtasks?(id: string, subtaskId?: string): Promise<void>
  rerun?(id: string, selection: ModelSelection): Promise<void>
  editAndRerun?(id: string, messageId: string, content: string, selection: ModelSelection): Promise<void>
  cancelPlan?(id: string, planId: string): Promise<void>
  continuePlan?(id: string, planId: string, message: string, references: HarnessFileReference[], selection: ModelSelection): Promise<void>
}

export interface PilotState {
  sessions: HarnessSessionSummary[]
  projects: HarnessProject[]
  session?: HarnessSession
  sessionLoading?: boolean
  providers: ModelProviderSummary[]
  selection?: ModelSelection
  messages: HarnessMessage[]
  running: boolean
  openingProjectDirectory?: boolean
  permission?: HarnessPermissionRequest
  error?: string
  /** 跨会话徽标缓存：运行中 / 未读 / 挂起审批。 */
  runningSessionIds: string[]
  unreadSessionIds: string[]
  pendingPermissions: Record<string, HarnessPermissionRequest>
  /** 当前会话待确认的记忆保存（敏感信息需用户确认）。 */
  memoryConfirmation?: { requestId: string; candidateId?: string; content: string }
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
  private state: PilotState = { sessions: [], projects: [], providers: [], messages: [], running: false, sessionLoading: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  private listeners = new Set<() => void>()
  private terminalListeners = new Set<(event: HarnessEvent) => void>()
  private workspaceFileListeners = new Set<(event: PilotWorkspaceFileEvent) => void>()
  private beforeNavigation = new Set<() => Promise<void> | void>()
  private preferenceWrites = new Map<string, Promise<void>>()
  private unsubscribe?: () => void
  private generation = 0
  private snapshotVersion = 0
  private permissionRevision = 0
  private activeSessionId?: string
  private disposed = false
  private defaultSelection?: ModelSelection
  private sessionSelections = new Map<string, ModelSelection>()

  constructor(private host: PilotHost) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<PilotState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private availableSelection(value: unknown, providers = this.state.providers): ModelSelection | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const { providerId, modelId, thinkingLevel } = value as Record<string, unknown>
    if (typeof providerId !== 'string' || !providerId.trim() || providerId.length > 128 || providerId.includes('\0')
      || typeof modelId !== 'string' || !modelId.trim() || modelId.length > 128 || modelId.includes('\0')) return undefined
    if (thinkingLevel !== undefined && thinkingLevel !== 'off' && thinkingLevel !== 'low' && thinkingLevel !== 'medium' && thinkingLevel !== 'high') return undefined
    if (!providers.some(provider => provider.id === providerId && isModelProviderAvailable(provider) && provider.models.some(model => model.id === modelId && model.enabled))) return undefined
    return { providerId, modelId, ...(thinkingLevel === undefined ? {} : { thinkingLevel }) }
  }
  async start() {
    this.unsubscribe = this.host.onEvent(this.handleEvent)
    const generation = this.generation
    try {
      const [sessions, projects, providers] = await Promise.all([this.host.listSessions(), this.host.listProjects(), this.host.listProviders()])
      if (this.disposed) return
      const available = providers.flatMap(provider => isModelProviderAvailable(provider)
        ? provider.models.filter(model => model.enabled && model.id.trim()).map(model => ({ providerId: provider.id, modelId: model.id })) : [])
      const [storedSelection, storedSession] = await Promise.all([
        this.readPreference<ModelSelection>('model-selection'),
        this.host.getPreference ? this.host.getPreference('active-session').catch(() => undefined) : Promise.resolve(undefined),
      ])
      if (this.disposed) return
      this.defaultSelection = this.availableSelection(storedSelection, providers) ?? available[0]
      this.update({ sessions, projects, providers, selection: this.defaultSelection })
      if (generation !== this.generation || storedSession === null) return
      const restore = typeof storedSession === 'string' ? sessions.find(session => session.id === storedSession) : undefined
      if (restore || sessions[0]) await this.open((restore || sessions[0])!.id)
    } catch (error) { this.fail(error) }
  }
  async open(id: string) {
    const generation = ++this.generation
    this.snapshotVersion++
    this.activeSessionId = id
    const permissionRevision = this.permissionRevision
    this.update({ session: undefined, sessionLoading: true, messages: [], running: false, openingProjectDirectory: false, permission: undefined, memoryConfirmation: undefined, error: undefined })
    try {
      const [session, pendingPermissions, savedSelection] = await Promise.all([
        this.host.getSession(id), this.host.listPendingPermissions(id),
        this.sessionSelections.has(id) ? Promise.resolve(this.sessionSelections.get(id)) : this.readPreference<unknown>(`session-model-selection.${id}`),
      ])
      if (generation !== this.generation || this.disposed) return
      const lastUsedSelection = this.availableSelection({ providerId: session.modelProviderId, modelId: session.modelId })
      const defaultSelection = this.availableSelection(this.defaultSelection)
      const legacySelection = lastUsedSelection && defaultSelection?.providerId === lastUsedSelection.providerId && defaultSelection.modelId === lastUsedSelection.modelId ? defaultSelection : lastUsedSelection
      // 会话元数据只保存模型 ID；未发送的模型选择和推理档位必须从该会话偏好恢复。
      const selection = this.availableSelection(savedSelection) ?? legacySelection ?? (session.modelProviderId || session.modelId ? undefined : defaultSelection)
      if (selection) this.sessionSelections.set(id, selection)
      const permissions = { ...this.state.pendingPermissions }
      if (pendingPermissions[0]) permissions[id] = pendingPermissions[0]
      else delete permissions[id]
      this.update({ session, sessionLoading: false, selection, messages: session.messages.filter(message => !message.internal), running: Boolean(session.activeRun), permission: permissionRevision === this.permissionRevision ? pendingPermissions[0] : this.state.permission, pendingPermissions: permissions })
      if (selection) this.writePreference(`session-model-selection.${id}`, selection)
      this.writePreference('active-session', id)
      await this.markSessionRead(id)
    } catch (error) { if (generation === this.generation) { this.update({ sessionLoading: false }); this.fail(error) } }
  }
  /** Return to the task draft without creating or stopping a persisted session. */
  newConversation() {
    this.generation++
    this.snapshotVersion++
    this.permissionRevision++
    this.activeSessionId = undefined
    this.update({ session: undefined, sessionLoading: false, messages: [], running: false, openingProjectDirectory: false, permission: undefined, memoryConfirmation: undefined, error: undefined })
    this.writePreference('active-session', null)
  }
  /** 打开会话即视为已读：本地清除徽标并通知宿主。 */
  private async markSessionRead(id: string) {
    if (!this.state.unreadSessionIds.includes(id) && !this.state.sessions.find(item => item.id === id)?.unread) return
    const unreadIds = this.state.unreadSessionIds.filter(item => item !== id)
    this.update({ unreadSessionIds: unreadIds, sessions: this.state.sessions.map(item => item.id === id ? { ...item, unread: false } : item) })
    if (this.host.setSessionUnread) { try { await this.host.setSessionUnread(id, false) } catch { /* 徽标清除失败不影响会话使用 */ } }
  }
  async create(projectId?: string) {
    if (this.state.sessionLoading) return false
    const generation = this.generation
    try {
      if (projectId && !this.state.projects.some(project => project.id === projectId && project.directoryExists)) throw new Error('所选项目目录不可用，请重新选择')
      const session = await this.host.createSession(projectId)
      if (this.disposed) return false
      await this.refreshList()
      if (generation !== this.generation) return false
      await this.open(session.id)
      return this.state.session?.id === session.id
    } catch (error) { if (generation === this.generation) this.fail(error); return false }
  }
  select(selection: ModelSelection) {
    this.defaultSelection = selection
    const sessionId = this.state.session?.id
    if (sessionId) {
      this.sessionSelections.set(sessionId, selection)
      this.writePreference(`session-model-selection.${sessionId}`, selection)
    }
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
  async send(text: string, planning = false, references: HarnessFileReference[] = []): Promise<boolean> {
    const selection = this.state.selection
    if (!text.trim() || !selection || this.state.running || this.state.permission || this.state.session?.pendingInteraction?.status === 'waiting') return false
    const session = this.state.session
    if (!session) return false
    const generation = this.generation
    this.update({ running: true, error: undefined, messages: [...this.state.messages, { id: `pending-${Date.now()}`, role: 'user', content: text.trim(), createdAt: Date.now() }] })
    try {
      await this.host.runMessage(session.id, text.trim(), selection, planning, references)
      await this.refreshSession(session.id, generation)
      return true
    } catch (error) {
      if (generation === this.generation) { this.fail(error); await this.refreshSession(session.id, generation) }
      return false
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
  openSessionProject(id: string, target: 'file-manager' | 'terminal' = 'file-manager') { return this.host.openSessionProject(id, target) }
  getSession(id: string) { return this.host.getSession(id) }
  getPreference(key: string) { return this.host.getPreference ? this.host.getPreference(key) : Promise.resolve(null) }
  registerBeforeNavigation(callback: () => Promise<void> | void) {
    this.beforeNavigation.add(callback)
    return () => { this.beforeNavigation.delete(callback) }
  }
  async flushBeforeNavigation() {
    try {
      if (this.disposed) throw new Error('Harness 连接已关闭，无法确认工作台保存')
      for (const callback of this.beforeNavigation) await callback()
      if (this.disposed) throw new Error('Harness 连接已关闭，无法确认工作台保存')
    } catch (error) { this.fail(error); throw error }
  }
  navigate(path: string) { return this.run(async () => {
    await this.flushBeforeNavigation()
    await this.require('navigate')(path)
  }) }
  setPreference(key: string, value: unknown, reportFailure = false) {
    if (!this.host.setPreference) return reportFailure ? Promise.reject(new Error('当前宿主不支持偏好保存')) : Promise.resolve()
    const write = async () => {
      if (this.disposed) throw new Error('Harness 连接已关闭，无法确认偏好保存')
      await this.host.setPreference!(key, value)
      if (this.disposed) throw new Error('Harness 连接已关闭，无法确认偏好保存')
    }
    const previous = this.preferenceWrites.get(key)
    const request = previous ? previous.catch(() => undefined).then(write) : write()
    this.preferenceWrites.set(key, request)
    const cleanup = () => { if (this.preferenceWrites.get(key) === request) this.preferenceWrites.delete(key) }
    void request.then(cleanup, cleanup)
    return reportFailure ? request : request.catch(() => undefined)
  }
  reportError(error: unknown) { this.fail(error) }
  async permission(allowed: boolean) {
    const request = this.state.permission
    if (!request) return
    try {
      await this.host.respondPermission(request.requestId, allowed)
      if (this.activeSessionId === request.sessionId && this.state.permission?.requestId === request.requestId) {
        this.permissionRevision++
        const pendingPermissions = { ...this.state.pendingPermissions }
        delete pendingPermissions[request.sessionId]
        this.update({ permission: undefined, pendingPermissions })
      }
    }
    catch (error) { this.fail(error) }
  }
  async confirmPlan() {
    const { session, selection } = this.state
    if (session?.pendingInteraction?.kind !== 'plan-review' || !selection) return
    try { await this.host.confirmPlan(session.id, session.pendingInteraction.planId, selection); await this.refreshSession(session.id, this.generation) }
    catch (error) { this.fail(error) }
  }
  require<T extends keyof PilotHost>(method: T): NonNullable<PilotHost[T]> {
    const handler = this.host[method]
    if (typeof handler !== 'function') throw new Error('当前宿主不支持该操作')
    return handler as NonNullable<PilotHost[T]>
  }
  /** 会话管理操作统一走这里：宿主失败落到 state.error，成功后刷新列表。 */
  private run(action: () => Promise<void>) { return action().catch(error => this.fail(error)) }
  renameSession(id: string, title: string) { return this.run(async () => { await this.require('renameSession')(id, title); await this.refreshList(); if (id === this.activeSessionId) await this.refreshSession(id, this.generation, false) }) }
  setSessionPinned(id: string, pinned: boolean) { return this.run(async () => { await this.require('setSessionPinned')(id, pinned); await this.refreshList() }) }
  setSessionUnread(id: string, unread: boolean) {
    const unreadIds = unread ? [...new Set([...this.state.unreadSessionIds, id])] : this.state.unreadSessionIds.filter(item => item !== id)
    this.update({ unreadSessionIds: unreadIds, sessions: this.state.sessions.map(item => item.id === id ? { ...item, unread } : item) })
    return this.run(async () => { await this.require('setSessionUnread')(id, unread); await this.refreshList() })
  }
  archiveSession(id: string) { return this.run(async () => {
    await this.require('archiveSession')(id)
    await this.refreshList()
    if (this.activeSessionId === id) {
      if (this.state.sessions[0]) await this.open(this.state.sessions[0].id)
      else this.newConversation()
    }
  }) }
  async deleteSession(id: string) {
    await this.require('deleteSession')(id)
    this.sessionSelections.delete(id)
    this.writePreference(`session-model-selection.${id}`, null)
    const pendingPermissions = { ...this.state.pendingPermissions }
    delete pendingPermissions[id]
    this.update({ pendingPermissions, runningSessionIds: this.state.runningSessionIds.filter(item => item !== id), unreadSessionIds: this.state.unreadSessionIds.filter(item => item !== id) })
    await this.refreshList()
    if (this.activeSessionId === id) {
      if (this.state.sessions[0]) await this.open(this.state.sessions[0].id)
      else this.newConversation()
    }
  }
  moveSession(id: string, projectId: string) { return this.run(async () => { await this.require('moveSession')(id, projectId); await this.refreshList(); if (id === this.activeSessionId) await this.refreshSession(id, this.generation, false) }) }
  reorderSessions(scope: HarnessSessionOrderScope, ids: string[]) { return this.run(async () => { await this.require('reorderSessions')(scope, ids); await this.refreshList() }) }
  reorderProjects(ids: string[]) { return this.run(async () => { await this.require('reorderProjects')(ids); await this.refreshList() }) }
  setSessionPermission(id: string, mode: PermissionMode) { return this.run(async () => { await this.require('setSessionPermission')(id, mode); await this.refreshList(); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  setSessionSkills(id: string, skillIds: string[]) { return this.run(async () => { await this.require('setSessionSkills')(id, skillIds); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  setSessionMcpServers(id: string, serverIds: string[]) { return this.run(async () => { await this.require('setSessionMcpServers')(id, serverIds); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  setSessionDelegation(id: string, enabled: boolean) { return this.run(async () => { await this.require('setSessionDelegation')(id, enabled); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  listSkills() { return this.require('listSkills')() }
  listMcp() { return this.require('listMcp')() }
  selectFiles() {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.require('selectFiles')(id)
  }
  listGitBranches(projectId: string) { return this.require('listGitBranches')(projectId) }
  checkoutGitBranch(projectId: string, branch: string) { return this.require('checkoutGitBranch')(projectId, branch) }
  createGitBranch(projectId: string, branch: string) { return this.require('createGitBranch')(projectId, branch) }
  respondMemory(requestId: string, approved: boolean) {
    return this.run(async () => {
      await this.require('respondMemory')(requestId, approved)
      if (this.state.memoryConfirmation?.requestId === requestId) this.update({ memoryConfirmation: undefined })
    })
  }
  saveMemory() {
    const { session, selection } = this.state
    if (!session || !selection) return Promise.reject(new Error('尚未选择任务或模型'))
    return this.require('saveMemory')(session.id, selection)
  }
  stopSubtasks(subtaskId?: string) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.require('stopSubtasks')(id, subtaskId)
  }
  rerun() {
    return this.restartMessage((session, selection) => this.require('rerun')(session.id, selection))
  }
  editAndRerun(messageId: string, content: string) {
    return this.restartMessage((session, selection) => this.require('editAndRerun')(session.id, messageId, content, selection))
  }
  private async restartMessage(action: (session: HarnessSession, selection: ModelSelection) => Promise<void>) {
    const { session, selection } = this.state
    if (this.state.running || this.state.permission || session?.pendingInteraction?.status === 'waiting') return
    if (!session || !selection) { this.fail(new Error('尚未选择任务或模型')); return }
    const generation = this.generation
    this.update({ running: true, error: undefined })
    try { await action(session, selection) }
    catch (error) { if (generation === this.generation) this.fail(error) }
    await this.refreshSession(session.id, generation)
  }
  cancelPlan(planId: string) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.require('cancelPlan')(id, planId)
  }
  continuePlan(planId: string, message: string, references: HarnessFileReference[] = []) {
    const { session, selection } = this.state
    if (!session || !selection) return Promise.reject(new Error('尚未选择任务或模型'))
    return this.require('continuePlan')(session.id, planId, message, references, selection)
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
  listFilesFor(sessionId: string, path = '') { return this.host.listFiles(sessionId, path) }
  get supportsWorkspaceGit() { return Boolean(this.host.getWorkspaceGit && this.host.getWorkspaceIgnored) }
  getWorkspaceGitFor(sessionId: string) { return this.host.getWorkspaceGit?.(sessionId) ?? Promise.resolve({ available: false, entries: [] } as HarnessWorkspaceGitSnapshot) }
  getWorkspaceIgnoredFor(sessionId: string, paths: string[]) { return this.host.getWorkspaceIgnored?.(sessionId, paths) ?? Promise.resolve([]) }
  searchFilesFor(sessionId: string, query: string, refresh = false): Promise<HarnessWorkspaceFileSearchResult> {
    return this.host.searchFiles ? this.host.searchFiles(sessionId, query, refresh) : Promise.reject(new Error('当前宿主不支持工作目录搜索'))
  }
  get supportsWorkspaceWatch() { return Boolean(this.host.watchFiles && this.host.unwatchFiles) }
  watchFilesFor(sessionId: string, paths: string[]) {
    return this.host.watchFiles ? this.host.watchFiles(sessionId, paths) : Promise.reject(new Error('当前宿主不支持文件自动刷新'))
  }
  unwatchFilesFor(sessionId: string, watchId: string) { return this.host.unwatchFiles?.(sessionId, watchId) ?? Promise.resolve() }
  listEditors(refresh = false) { return this.host.listEditors?.(refresh) ?? Promise.resolve([]) }
  openFileInEditorFor(sessionId: string, path: string, editorId: string) { return this.host.openFileInEditor ? this.host.openFileInEditor(sessionId, path, editorId) : Promise.reject(new Error('当前宿主不支持外部编辑器')) }
  onWorkspaceFilesChanged = (listener: (event: PilotWorkspaceFileEvent) => void) => { this.workspaceFileListeners.add(listener); return () => { this.workspaceFileListeners.delete(listener) } }
  readFile(path: string) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.readFile(id, path)
  }
  readFileFor(sessionId: string, path: string) { return this.host.readFile(sessionId, path) }
  readImageFor(sessionId: string, path: string): Promise<HarnessWorkspaceImagePreview> { return this.host.readImage ? this.host.readImage(sessionId, path) : Promise.reject(new Error('当前宿主不支持图片预览')) }
  openTerminal() {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.openTerminalFor(id)
  }
  openTerminalFor(sessionId: string) { return this.host.openTerminal(sessionId) }
  writeTerminal(terminalId: string, data: string) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.writeTerminalFor(id, terminalId, data)
  }
  writeTerminalFor(sessionId: string, terminalId: string, data: string) { return this.host.writeTerminal(sessionId, terminalId, data) }
  resizeTerminal(terminalId: string, columns: number, rows: number) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.resizeTerminalFor(id, terminalId, columns, rows)
  }
  resizeTerminalFor(sessionId: string, terminalId: string, columns: number, rows: number) { return this.host.resizeTerminal(sessionId, terminalId, columns, rows) }
  closeTerminal(terminalId: string) {
    const id = this.state.session?.id
    if (!id) return Promise.resolve()
    return this.host.closeTerminal(id, terminalId)
  }
  closeTerminalFor(sessionId: string, terminalId: string) { return this.host.closeTerminal(sessionId, terminalId) }
  navigateBrowser(url: string, bounds: HarnessBrowserBounds) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.navigateBrowserFor(id, url, bounds)
  }
  navigateBrowserFor(id: string, url: string, bounds: HarnessBrowserBounds) { return this.host.navigateBrowser(id, url, bounds) }
  setBrowserBounds(bounds: HarnessBrowserBounds) {
    const id = this.state.session?.id
    return id ? this.setBrowserBoundsFor(id, bounds) : Promise.resolve()
  }
  setBrowserBoundsFor(id: string, bounds: HarnessBrowserBounds) { return this.host.setBrowserBounds(id, bounds) }
  controlBrowser(action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close') {
    const id = this.state.session?.id
    return id ? this.controlBrowserFor(id, action) : Promise.resolve()
  }
  controlBrowserFor(id: string, action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close') { return this.host.controlBrowser(id, action) }
  closeBrowserFor(id: string) { return this.controlBrowserFor(id, 'close') }
  onBrowserEvent = (listener: (event: PilotBrowserEvent) => void) => this.host.onBrowserEvent(listener)
  onTerminalEvent = (listener: (event: HarnessEvent) => void) => { this.terminalListeners.add(listener); return () => { this.terminalListeners.delete(listener) } }
  private refreshList = async () => {
    const sessions = await this.host.listSessions()
    this.update({ sessions })
  }
  private async refreshSession(id: string, generation: number, replaceMessages = true) {
    if (generation !== this.generation || id !== this.activeSessionId || this.disposed) return
    const version = ++this.snapshotVersion
    try {
      const session = await this.host.getSession(id)
      if (generation !== this.generation || version !== this.snapshotVersion || this.disposed) return
      this.update({ session, ...(replaceMessages ? { messages: session.messages.filter(message => !message.internal) } : {}), running: Boolean(session.activeRun) })
      await this.refreshList()
    } catch (error) { if (generation === this.generation) this.fail(error) }
  }
  private handleEvent = (event: HarnessEvent) => {
    if (event.type === 'workspace-files-changed') {
      const { watchId, directory, paths, error } = event.payload
      if (typeof watchId === 'string' && typeof directory === 'string' && Array.isArray(paths) && paths.every(path => typeof path === 'string')) {
        this.workspaceFileListeners.forEach(listener => listener({ sessionId: event.sessionId, watchId, directory, paths, ...(typeof error === 'string' ? { error } : {}) }))
      }
      return
    }
    if (event.type === 'terminal-output' || event.type === 'terminal-exit') {
      this.terminalListeners.forEach(listener => listener(event))
      return
    }
    if (event.type === 'status') this.applyStatusBadge(event.sessionId, String(event.payload.state || ''), event.sessionId !== this.activeSessionId)
    if (event.type === 'status' || event.type === 'title-updated') void this.refreshList().catch(error => this.fail(error))
    if (event.type === 'permission-request' && typeof event.payload.requestId === 'string') {
      const request: HarnessPermissionRequest = { sessionId: event.sessionId, requestId: event.payload.requestId, title: String(event.payload.title || '请求权限'), detail: String(event.payload.detail || '') }
      this.permissionRevision++
      if (event.sessionId === this.activeSessionId) this.update({ permission: request, pendingPermissions: { ...this.state.pendingPermissions, [event.sessionId]: request } })
      else this.update({ pendingPermissions: { ...this.state.pendingPermissions, [event.sessionId]: request } })
      return
    }
    if (event.type === 'memory-status' && event.sessionId === this.activeSessionId) {
      const payload = event.payload as { status?: string; requestId?: string; candidateId?: string; content?: string }
      if (payload.status === 'needs_confirmation' && payload.requestId) this.update({ memoryConfirmation: { requestId: payload.requestId, candidateId: payload.candidateId, content: String(payload.content || '') } })
      else if (this.state.memoryConfirmation?.requestId === payload.requestId) this.update({ memoryConfirmation: undefined })
      return
    }
    if (event.type === 'context-usage' && event.sessionId === this.activeSessionId && this.state.session) {
      const usage = event.payload.usage as HarnessContextUsage | undefined
      if (usage && typeof usage.usedTokens === 'number') {
        const session = { ...this.state.session, context: { ...this.state.session.context, usage } }
        this.update({ session })
      }
      return
    }
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
  private applyStatusBadge(sessionId: string, state: string, isBackground: boolean) {
    const running = state === 'running' || state === 'rendering'
    const terminal = state === 'completed' || state === 'failed' || state === 'stopped'
    const runningIds = new Set(this.state.runningSessionIds)
    const unreadIds = new Set(this.state.unreadSessionIds)
    if (running) runningIds.add(sessionId)
    else runningIds.delete(sessionId)
    if (terminal && isBackground) unreadIds.add(sessionId)
    if (!terminal && !isBackground) unreadIds.delete(sessionId)
    const pendingPermissions = { ...this.state.pendingPermissions }
    if (!running && isBackground) delete pendingPermissions[sessionId]
    this.update({ runningSessionIds: [...runningIds], unreadSessionIds: [...unreadIds], pendingPermissions })
  }
  private fail(error: unknown) { this.update({ error: error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : '操作失败' }) }
  dispose() { this.disposed = true; this.generation++; this.snapshotVersion++; this.unsubscribe?.(); this.unsubscribe = undefined; this.terminalListeners.clear(); this.workspaceFileListeners.clear(); this.beforeNavigation.clear(); this.listeners.clear() }
}
