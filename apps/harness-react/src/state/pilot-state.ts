import { isModelProviderAvailable, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessPermissionRequest, type HarnessProject, type HarnessSession, type HarnessSessionOrderScope, type HarnessSessionSummary, type HarnessUserAnswer, type HarnessWorkspaceFileEntry, type HarnessWorkspaceFileSearchResult, type HarnessWorkspaceGitSnapshot, type HarnessWorkspaceImagePreview, type ModelProviderSummary, type ModelSelection, type PermissionMode } from '../../../../src/config/harness'
import type { HarnessAttachmentSaveResult, HarnessBrowserBounds } from '../../../../src/platform/firstPartyHarness'
import type { HarnessHistoryPage, HarnessHistoryQuery } from '../../../../src/config/harness'
import type { SendShortcut } from '../../../../src/config/harness'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail, HarnessSkillMarketItem } from '../../../../src/config/harness'
import type { HarnessConversationSearchResult } from '../../../../src/config/harness'
import type { AutomationOverview, AutomationRun, AutomationRunStatus, AutomationTask, AutomationTaskInput, PermissionConfig } from '../../../../src/config/harness'
import type { HarnessGitContext, HarnessMessagePart, HarnessMessageQueueSnapshot, HarnessMessageSubmissionOptions, HarnessMessageSubmissionResult, HarnessMessageWithdrawal } from '../../../../src/config/harness'
import type { MiraAppNavigationCommand, MiraAppNavigationSnapshot, MiraAppNavigationState } from '../../../../src/platform/appNavigation'
import type { HarnessMessageAttachment } from '../../../../src/config/harness'
import type { HarnessArchivedSnapshot, HarnessArchivedDeletionResult } from '../../../../src/config/harness'

export interface PilotBrowserEvent { sessionId: string; url: string; canGoBack: boolean; canGoForward: boolean; loading: boolean; error?: string }
export interface PilotWorkspaceFileEvent { sessionId: string; watchId: string; directory: string; paths: string[]; error?: string }

export interface PilotHost {
  listSessions(): Promise<HarnessSessionSummary[]>
  listProjects(): Promise<HarnessProject[]>
  getSession(id: string): Promise<HarnessSession>
  createSession(projectId?: string): Promise<HarnessSession>
  prepareSession?(projectId?: string): Promise<HarnessSession>
  listProviders(): Promise<ModelProviderSummary[]>
  runMessage(id: string, text: string, selection: ModelSelection, planning: boolean, references?: HarnessFileReference[]): Promise<void>
  readonly supportsQueueSubmissionOptions?: boolean
  submitMessage?(id: string, text: string, selection: ModelSelection, planning: boolean, references: HarnessFileReference[], submissionId: string, options?: HarnessMessageSubmissionOptions): Promise<HarnessMessageSubmissionResult>
  getMessageQueue?(id: string): Promise<HarnessMessageQueueSnapshot>
  withdrawMessage?(id: string, itemId: string): Promise<HarnessMessageWithdrawal>
  resumeMessageQueue?(id: string): Promise<HarnessMessageQueueSnapshot>
  reorderMessageQueue?(id: string, itemId: string, beforeItemId: string | null): Promise<HarnessMessageQueueSnapshot>
  sendQueuedMessageNow?(id: string, itemId: string, expectedRunId?: string): Promise<HarnessMessageQueueSnapshot>
  onEvent(listener: (event: HarnessEvent) => void): () => void
  respondPermission(requestId: string, allowed: boolean): Promise<void>
  listPendingPermissions(id: string): Promise<HarnessPermissionRequest[]>
  openSessionProject(id: string, target?: 'file-manager' | 'terminal'): Promise<string>
  abortRun(id: string, expectedRunId?: string): Promise<void>
  confirmPlan(id: string, planId: string, selection: ModelSelection): Promise<unknown>
  answerInteraction(id: string, interactionId: string, answers: HarnessUserAnswer[], selection: ModelSelection): Promise<unknown>
  listFiles(id: string, path: string): Promise<{ path: string; entries: HarnessWorkspaceFileEntry[] }>
  searchFiles?(sessionId: string, query: string, refresh?: boolean): Promise<HarnessWorkspaceFileSearchResult>
  getWorkspaceGit?(sessionId: string): Promise<HarnessWorkspaceGitSnapshot>
  getWorkspaceIgnored?(sessionId: string, paths: string[]): Promise<string[]>
  listProjectFiles?(projectId: string, path: string): Promise<{ path: string; entries: HarnessWorkspaceFileEntry[] }>
  searchProjectFiles?(projectId: string, query: string, refresh?: boolean): Promise<HarnessWorkspaceFileSearchResult>
  getProjectWorkspaceGit?(projectId: string): Promise<HarnessWorkspaceGitSnapshot>
  getProjectWorkspaceIgnored?(projectId: string, paths: string[]): Promise<string[]>
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
  getComposerPreferences?(): Promise<{ sendShortcut: SendShortcut; showContextUsage: boolean; followupMode?: 'queue' | 'guide' }>
  browseSkillMarket?(refresh?: boolean): Promise<HarnessSkillMarketCatalog>
  getSkillMarketDetail?(id: string): Promise<HarnessSkillMarketDetail>
  installMarketSkill?(id: string): Promise<HarnessSkillMarketItem>
  listInstalledMarketSkills?(): Promise<HarnessSkillMarketItem[]>
  /** 宿主偏好读写（第一方命名空间）；开发态宿主可以缺省。 */
  getPreference?(key: string): Promise<unknown>
  setPreference?(key: string, value: unknown): Promise<void>
  /** 会话管理面（完整第一方宿主都支持；开发态 props 宿主可逐步接入）。 */
  renameSession?(id: string, title: string): Promise<void>
  setSessionPinned?(id: string, pinned: boolean): Promise<void>
  setSessionUnread?(id: string, unread: boolean): Promise<void>
  archiveSession?(id: string): Promise<void>
  queryHistory?(query: HarnessHistoryQuery): Promise<HarnessHistoryPage>
  getArchivedSnapshot?(): Promise<HarnessArchivedSnapshot>
  deleteArchivedSessions?(snapshotId: string): Promise<HarnessArchivedDeletionResult>
  searchConversations?(query: string): Promise<HarnessConversationSearchResult[]>
  onCommandCenterOpen?(listener: (focusRequestId?: string) => void): () => void
  dismissCommandCenterFocus?(focusRequestId: string): boolean
  onNavigationCommand?(listener: (command: MiraAppNavigationCommand) => void): () => void
  onNavigationRestore?(listener: (snapshot: MiraAppNavigationSnapshot | undefined) => void): () => void
  publishNavigationState?(state: MiraAppNavigationState): void
  renameProject?(id: string, name: string): Promise<void>
  openProject?(id: string, target?: 'file-manager' | 'terminal'): Promise<string>
  selectProject?(): Promise<HarnessProject | null>
  listAutomationTasks?(): Promise<AutomationTask[]>
  getAutomationOverview?(): Promise<AutomationOverview>
  getAutomationNextRuns?(expression: string): Promise<number[]>
  saveAutomationTask?(input: AutomationTaskInput): Promise<AutomationTask>
  setAutomationTaskEnabled?(id: string, enabled: boolean): Promise<AutomationTask>
  deleteAutomationTask?(id: string): Promise<void>
  listAutomationRuns?(id: string, status?: AutomationRunStatus): Promise<AutomationRun[]>
  runAutomationNow?(id: string): Promise<AutomationRun>
  retryAutomationRun?(id: string): Promise<AutomationRun>
  abortAutomationRun?(id: string): Promise<void>
  getHarnessPermissionConfig?(): Promise<PermissionConfig>
  restoreSession?(id: string): Promise<void>
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
  importAttachments?(id: string, files: Array<{ name: string; mediaType: string; data: string }>): Promise<HarnessFileReference[]>
  getAttachment?(id: string, path: string): Promise<HarnessMessageAttachment>
  saveAttachment?(id: string, path: string): Promise<HarnessAttachmentSaveResult>
  stageAttachment?(id: string, path: string): Promise<HarnessFileReference>
  selectAttachments?(id: string): Promise<HarnessFileReference[]>
  listGitBranches?(projectId: string): Promise<unknown>
  getGitContext?(projectId: string): Promise<HarnessGitContext>
  checkoutGitBranch?(projectId: string, branch: string, snapshotToken: string): Promise<HarnessGitContext>
  createGitBranch?(projectId: string, branch: string, snapshotToken: string): Promise<HarnessGitContext>
  respondMemory?(requestId: string, approved: boolean): Promise<void>
  saveMemory?(id: string, selection: ModelSelection): Promise<void>
  stopSubtasks?(id: string, subtaskId?: string): Promise<void>
  rerun?(id: string, selection: ModelSelection): Promise<void>
  editAndRerun?(id: string, messageId: string, content: string, selection: ModelSelection): Promise<void>
  cancelPlan?(id: string, planId: string): Promise<void>
  continuePlan?(id: string, planId: string, message: string, references: HarnessFileReference[], selection: ModelSelection): Promise<void>
}

export interface PilotState {
  initialized?: boolean
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
  queue?: HarnessMessageQueueSnapshot
  queueError?: string
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

function projectPartContent(message: HarnessMessage): HarnessMessage {
  if (!message.parts) return message
  return { ...message, content: message.parts.map(part => part.type === 'text' ? part.text : '').join('') }
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
  private state: PilotState = { initialized: false, sessions: [], projects: [], providers: [], messages: [], running: false, sessionLoading: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  private listeners = new Set<() => void>()
  private deletedSessionListeners = new Set<(id: string) => void>()
  private terminalListeners = new Set<(event: HarnessEvent) => void>()
  private workspaceFileListeners = new Set<(event: PilotWorkspaceFileEvent) => void>()
  private beforeNavigation = new Set<() => Promise<void> | void>()
  private preferenceWrites = new Map<string, Promise<void>>()
  private unsubscribe?: () => void
  private generation = 0
  private snapshotVersion = 0
  private permissionRevision = 0
  private runningRevision = 0
  private runningRevisions = new Map<string, number>()
  private activeSessionId?: string
  private loadingSessionId?: string
  private disposed = false
  private archivedDeletion?: { snapshotId: string; promise: Promise<HarnessArchivedDeletionResult & { refreshError?: string }> }
  private defaultSelection?: ModelSelection
  private sessionSelections = new Map<string, ModelSelection>()
  private queues = new Map<string, HarnessMessageQueueSnapshot>()
  private eventRuns = new Map<string, { id: string; messageId?: string; startedAt: number; sequence: number; retired: Set<string>; closed?: boolean }>()
  private seenEventIds = new Set<string>()
  private livePartKeys = new Set<string>()
  private gitContextRevisions = new Map<string, number>()
  private gitMutationRevisions = new Map<string, number>()

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
    const runningRevision = this.runningRevision
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
      this.applySessionList(sessions, runningRevision)
      this.update({ projects, providers, selection: this.defaultSelection })
      if (generation !== this.generation || storedSession === null) return
      const restore = typeof storedSession === 'string' ? sessions.find(session => session.id === storedSession) : undefined
      if (restore || sessions[0]) await this.open((restore || sessions[0])!.id)
    } catch (error) { this.fail(error) }
    finally { this.update({ initialized: true }) }
  }
  async open(id: string, isCurrent?: () => boolean) {
    if (isCurrent && !isCurrent()) return false
    const generation = ++this.generation
    this.loadingSessionId = id
    this.snapshotVersion++
    if (!isCurrent) { this.livePartKeys.clear(); this.activeSessionId = id }
    const permissionRevision = this.permissionRevision
    this.update(isCurrent ? { sessionLoading: true, error: undefined } : { session: undefined, sessionLoading: true, messages: [], running: false, openingProjectDirectory: false, permission: undefined, memoryConfirmation: undefined, queue: undefined, queueError: undefined, error: undefined })
    try {
      let [session, pendingPermissions, savedSelection, queueResult] = await Promise.all([
        this.host.getSession(id), this.host.listPendingPermissions(id),
        this.sessionSelections.has(id) ? Promise.resolve(this.sessionSelections.get(id)) : this.readPreference<unknown>(`session-model-selection.${id}`),
        this.host.getMessageQueue ? this.host.getMessageQueue(id).then(queue => ({ queue }), error => ({ error: error instanceof Error ? error.message : '待发送列表读取失败' })) : Promise.resolve(undefined),
      ])
      // Reconcile missed boundaries from canonical history; only reread snapshots behind the cursor.
      for (let attempt = 0; generation === this.generation && !this.disposed && !this.reconcileSnapshotRun(session); attempt++) {
        if (attempt >= 3) throw new Error('任务快照尚未同步，请重新打开任务')
        session = await this.host.getSession(id)
      }
      if (generation !== this.generation || this.disposed) return false
      if (isCurrent && !isCurrent()) { this.update({ sessionLoading: false }); return false }
      const lastUsedSelection = this.availableSelection({ providerId: session.modelProviderId, modelId: session.modelId })
      const defaultSelection = this.availableSelection(this.defaultSelection)
      const legacySelection = lastUsedSelection && defaultSelection?.providerId === lastUsedSelection.providerId && defaultSelection.modelId === lastUsedSelection.modelId ? defaultSelection : lastUsedSelection
      // 会话元数据只保存模型 ID；未发送的模型选择和推理档位必须从该会话偏好恢复。
      const selection = this.availableSelection(savedSelection) ?? legacySelection ?? (session.modelProviderId || session.modelId ? undefined : defaultSelection)
      if (selection) this.sessionSelections.set(id, selection)
      const permissions = { ...this.state.pendingPermissions }
      if (permissionRevision === this.permissionRevision) {
        if (pendingPermissions[0]) permissions[id] = pendingPermissions[0]
        else delete permissions[id]
      }
      if (isCurrent) this.livePartKeys.clear()
      this.activeSessionId = id
      this.captureRun(session)
      if (queueResult && 'queue' in queueResult) this.applyQueue(queueResult.queue)
      this.update({ session, sessionLoading: false, selection, messages: session.messages.filter(message => !message.internal).map(projectPartContent), running: Boolean(session.activeRun), openingProjectDirectory: false, memoryConfirmation: undefined, queue: this.queues.get(id), queueError: queueResult && 'error' in queueResult ? queueResult.error : undefined, permission: permissionRevision === this.permissionRevision ? pendingPermissions[0] : this.state.permission, pendingPermissions: permissions })
      if (selection) this.writePreference(`session-model-selection.${id}`, selection)
      this.writePreference('active-session', session.draftState === 'prepared' ? null : id)
      void this.markSessionRead(id)
      return generation === this.generation && !this.disposed && (!isCurrent || isCurrent()) && this.state.session?.id === id
    } catch (error) { if (generation === this.generation && (!isCurrent || isCurrent())) { this.update({ sessionLoading: false }); this.fail(error) } else if (generation === this.generation) this.update({ sessionLoading: false }); return false }
    finally { if (generation === this.generation) this.loadingSessionId = undefined }
  }
  /** Return to the task draft without creating or stopping a persisted session. */
  newConversation() {
    this.generation++
    this.snapshotVersion++
    this.permissionRevision++
    this.livePartKeys.clear()
    this.activeSessionId = undefined
    this.loadingSessionId = undefined
    this.update({ session: undefined, sessionLoading: false, messages: [], running: false, openingProjectDirectory: false, permission: undefined, memoryConfirmation: undefined, queue: undefined, queueError: undefined, error: undefined })
    this.writePreference('active-session', null)
  }
  /** 打开会话即视为已读：本地清除徽标并通知宿主。 */
  private async markSessionRead(id: string) {
    if (!this.state.unreadSessionIds.includes(id) && !this.state.sessions.find(item => item.id === id)?.unread) return
    const unreadIds = this.state.unreadSessionIds.filter(item => item !== id)
    this.update({ unreadSessionIds: unreadIds, sessions: this.state.sessions.map(item => item.id === id ? { ...item, unread: false } : item) })
    if (this.host.setSessionUnread) { try { await this.host.setSessionUnread(id, false) } catch { /* 徽标清除失败不影响会话使用 */ } }
  }
  async create(projectId?: string, isCurrent?: () => boolean) {
    if (this.state.sessionLoading || isCurrent && !isCurrent()) return false
    const generation = this.generation
    try {
      if (projectId && !this.state.projects.some(project => project.id === projectId && project.directoryExists)) throw new Error('所选项目目录不可用，请重新选择')
      const session = await this.host.createSession(projectId)
      if (this.disposed) return false
      await this.refreshList()
      if (generation !== this.generation || isCurrent && !isCurrent()) return false
      const opened = await this.open(session.id, isCurrent)
      return opened && this.getSnapshot().session?.id === session.id
    } catch (error) { if (generation === this.generation && (!isCurrent || isCurrent())) this.fail(error); return false }
  }
  get supportsPreparedSessions() { return Boolean(this.host.prepareSession) }
  async prepare(projectId?: string, isCurrent?: () => boolean) {
    if (this.disposed || this.state.session || this.state.sessionLoading || isCurrent && !isCurrent()) return false
    const generation = this.generation
    this.update({ sessionLoading: true, error: undefined })
    try {
      if (!this.host.prepareSession) throw new Error('当前宿主不支持任务草稿准备')
      if (projectId && !this.state.projects.some(project => project.id === projectId && project.directoryExists)) throw new Error('所选项目目录不可用，请重新选择')
      const session = await this.host.prepareSession(projectId)
      if (generation !== this.generation || this.disposed) return false
      if (isCurrent && !isCurrent()) { this.update({ sessionLoading: false }); return false }
      if (!session.id || session.draftState !== 'prepared') throw new Error('任务草稿准备结果无效')
      const opened = await this.open(session.id, isCurrent)
      return opened && this.getSnapshot().session?.id === session.id
    } catch (error) {
      if (generation === this.generation) {
        this.update({ sessionLoading: false })
        if (!isCurrent || isCurrent()) this.fail(error)
      }
      return false
    }
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
  get supportsMessageQueue() { return Boolean(this.host.submitMessage && this.host.getMessageQueue && this.host.withdrawMessage && this.host.resumeMessageQueue) }
  get supportsQueueSubmissionOptions() { return this.supportsMessageQueue && this.host.supportsQueueSubmissionOptions === true }
  get supportsQueueReorder() { return this.supportsMessageQueue && Boolean(this.host.reorderMessageQueue) }
  get supportsQueueSendNow() { return this.supportsMessageQueue && Boolean(this.host.sendQueuedMessageNow) }
  async send(text: string, planning = false, references: HarnessFileReference[] = [], submissionId: string = crypto.randomUUID(), capturedSelection?: ModelSelection, options?: HarnessMessageSubmissionOptions): Promise<boolean | 'confirmation-required' | 'retry-required'> {
    const selection = capturedSelection ?? this.state.selection
    if (!text.trim() && !references.length || !selection || this.state.sessionLoading) return false
    const session = this.state.session
    if (!session) return false
    if (options && !this.supportsQueueSubmissionOptions) return false
    const generation = this.generation
    if (this.supportsMessageQueue) {
      this.update({ error: undefined })
      try {
        const args = [session.id, text.trim(), { ...selection }, planning, references.map(reference => ({ ...reference })), submissionId] as const
        const receipt = this.supportsQueueSubmissionOptions ? await this.host.submitMessage!(...args, structuredClone(options ?? {})) : await this.host.submitMessage!(...args)
        if (receipt.queue.sessionId !== session.id || 'submissionId' in receipt && receipt.submissionId !== submissionId) throw new Error('待发送确认与原任务不匹配，请重试')
        if (generation === this.generation && this.state.session?.id === session.id) this.applyQueue(receipt.queue)
        if ('confirmationRequired' in receipt) return 'confirmation-required'
        if ('retryRequired' in receipt) {
          await this.refreshSession(session.id, generation, true, true)
          if (generation === this.generation && this.state.session?.id === session.id) this.update({ error: 'reason' in receipt && receipt.reason === 'image-model-unsupported' ? '所选模型不支持图片输入，请在模型设置中启用图片能力或切换支持图片的模型' : '当前任务已变化，请重新发送。' })
          return 'retry-required'
        }
        if (session.draftState === 'prepared') {
          if (generation === this.generation && this.state.session?.id === session.id) {
            this.update({ session: { ...this.state.session, draftState: 'accepted' } })
            this.writePreference('active-session', session.id)
          }
          try { await Promise.all([this.refreshList(), this.host.listProjects().then(projects => this.update({ projects }))]) }
          catch { if (generation === this.generation && this.state.session?.id === session.id && !this.disposed) this.fail(new Error('任务已接纳，但任务列表刷新失败，请重试刷新。')) }
        }
        return true
      } catch (error) { if (generation === this.generation && this.state.session?.id === session.id) this.fail(error); return false }
    }
    if (this.state.running || this.state.permission || session.pendingInteraction?.status === 'waiting') return false
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
  async withdrawMessage(sessionId: string, itemId: string): Promise<HarnessMessageWithdrawal | undefined> {
    if (!this.supportsMessageQueue || this.state.sessionLoading || sessionId !== this.activeSessionId) return undefined
    const generation = this.generation
    try {
      const result = await this.host.withdrawMessage!(sessionId, itemId)
      if (result.item.sessionId !== sessionId || result.item.id !== itemId || result.queue.sessionId !== sessionId) throw new Error('撤回确认与原任务不匹配')
      if (generation === this.generation && sessionId === this.activeSessionId && !this.disposed) this.applyQueue(result.queue)
      return result
    } catch (error) {
      if (generation !== this.generation || sessionId !== this.activeSessionId || this.disposed) return undefined
      this.update({ queueError: error instanceof Error ? error.message : '撤回失败，请重试' }); throw error
    }
  }
  async resumeMessageQueue(sessionId: string): Promise<HarnessMessageQueueSnapshot | undefined> {
    if (!this.supportsMessageQueue || this.state.sessionLoading || sessionId !== this.activeSessionId) return undefined
    const generation = this.generation
    try {
      const queue = await this.host.resumeMessageQueue!(sessionId)
      if (generation !== this.generation || sessionId !== this.activeSessionId || this.disposed) return undefined
      if (queue.sessionId !== sessionId) throw new Error('恢复确认与原任务不匹配')
      this.applyQueue(queue)
      return queue
    } catch (error) {
      if (generation !== this.generation || sessionId !== this.activeSessionId || this.disposed) return undefined
      this.update({ queueError: error instanceof Error ? error.message : '恢复失败，请重试' }); throw error
    }
  }
  async reorderMessageQueue(sessionId: string, itemId: string, beforeItemId: string | null): Promise<HarnessMessageQueueSnapshot | undefined> {
    if (!this.supportsQueueReorder || this.state.sessionLoading || sessionId !== this.activeSessionId) return undefined
    const generation = this.generation
    try {
      const queue = await this.host.reorderMessageQueue!(sessionId, itemId, beforeItemId)
      if (generation !== this.generation || sessionId !== this.activeSessionId || this.disposed) return undefined
      if (queue.sessionId !== sessionId) throw new Error('排序确认与原任务不匹配')
      this.applyQueue(queue)
      return queue
    } catch (error) {
      if (generation !== this.generation || sessionId !== this.activeSessionId || this.disposed) return undefined
      this.update({ queueError: error instanceof Error ? error.message : '排序失败，请重试' }); throw error
    }
  }
  async sendQueuedMessageNow(sessionId: string, itemId: string, expectedRunId?: string): Promise<HarnessMessageQueueSnapshot | undefined> {
    if (!this.supportsQueueSendNow || this.state.sessionLoading || sessionId !== this.activeSessionId) return undefined
    const generation = this.generation
    try {
      const queue = await this.host.sendQueuedMessageNow!(sessionId, itemId, expectedRunId)
      if (generation !== this.generation || sessionId !== this.activeSessionId || this.disposed) return undefined
      if (queue.sessionId !== sessionId) throw new Error('发送确认与原任务不匹配')
      this.applyQueue(queue)
      return queue
    } catch (error) {
      if (generation !== this.generation || sessionId !== this.activeSessionId || this.disposed) return undefined
      this.update({ queueError: error instanceof Error ? error.message : '立即发送失败，请重试' }); throw error
    }
  }
  async stop() {
    const id = this.state.session?.id
    if (!id) return
    const runId = this.state.session?.activeRun?.id
    if (!runId) return
    try { await this.host.abortRun(id, runId) } catch (error) { this.fail(error) }
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
  getComposerPreferences() { return this.host.getComposerPreferences ? this.host.getComposerPreferences() : Promise.resolve({ sendShortcut: 'enter' as const, showContextUsage: true }) }
  browseSkillMarket(refresh = false) { return this.require('browseSkillMarket')(refresh) }
  getSkillMarketDetail(id: string) { return this.require('getSkillMarketDetail')(id) }
  installMarketSkill(id: string) { return this.require('installMarketSkill')(id) }
  listInstalledMarketSkills() { return this.require('listInstalledMarketSkills')() }
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
  async archiveSession(id: string): Promise<void> {
    const generation = this.generation
    if (this.activeSessionId === id) await this.flushBeforeNavigation()
    await this.require('archiveSession')(id)
    if (this.disposed) return
    const wasActive = this.activeSessionId === id
    const loadingOther = Boolean(this.loadingSessionId && this.loadingSessionId !== id)
    const selectReplacement = wasActive && !loadingOther && generation === this.generation
    if (wasActive) {
      if (!loadingOther) this.newConversation()
      else {
        // A newer guarded load must survive removal of the previously displayed task.
        this.activeSessionId = undefined
        this.snapshotVersion++; this.permissionRevision++; this.livePartKeys.clear()
        this.update({ session: undefined, messages: [], running: false, openingProjectDirectory: false, permission: undefined, memoryConfirmation: undefined, queue: undefined, queueError: undefined })
        this.writePreference('active-session', null)
      }
    } else if (this.loadingSessionId === id) {
      this.generation++; this.snapshotVersion++; this.loadingSessionId = undefined
      this.update({ sessionLoading: false })
    }
    this.update({ sessions: this.state.sessions.filter(session => session.id !== id), runningSessionIds: this.state.runningSessionIds.filter(sessionId => sessionId !== id), unreadSessionIds: this.state.unreadSessionIds.filter(sessionId => sessionId !== id) })
    const replacementGeneration = this.generation
    try { await this.refreshList() }
    catch {
      // The archived row has gone; keep a refresh failure visible in the workbench.
      const error = new Error('任务已归档，但任务列表刷新失败，请重试刷新。')
      this.fail(error)
      throw error
    }
    if (selectReplacement && replacementGeneration === this.generation && !this.disposed && this.state.sessions[0]) await this.open(this.state.sessions[0].id)
  }
  queryHistory(query: HarnessHistoryQuery) { return this.require('queryHistory')(query) }
  get supportsArchivedDeletion() { return Boolean(this.host.getArchivedSnapshot && this.host.deleteArchivedSessions) }
  getArchivedSnapshot() { return this.require('getArchivedSnapshot')() }
  refreshSessions() { return this.refreshList() }
  deleteArchivedSessions(snapshotId: string) {
    if (this.archivedDeletion) {
      if (this.archivedDeletion.snapshotId === snapshotId) return this.archivedDeletion.promise
      return Promise.reject(new Error('正在删除归档任务，请稍后重试。'))
    }
    const promise = this.performArchivedDeletion(snapshotId)
    this.archivedDeletion = { snapshotId, promise }
    const finish = () => { if (this.archivedDeletion?.promise === promise) this.archivedDeletion = undefined }
    void promise.then(finish, finish)
    return promise
  }
  private async performArchivedDeletion(snapshotId: string): Promise<HarnessArchivedDeletionResult & { refreshError?: string }> {
    await this.flushBeforeNavigation()
    if (this.disposed) throw new Error('Harness 连接已关闭')
    const result = await this.require('deleteArchivedSessions')(snapshotId)
    if (this.disposed) return result
    const wasActive = this.removeDeletedSessions(result.deletedIds)
    const generation = this.generation
    try {
      await this.refreshList()
      if (wasActive && generation === this.generation && !this.disposed && this.state.sessions[0]) await this.open(this.state.sessions[0].id)
      return result
    } catch { return { ...result, refreshError: '删除操作已完成，但任务列表刷新失败，请重试刷新。' } }
  }
  searchConversations(query: string) { return this.require('searchConversations')(query) }
  onCommandCenterOpen(listener: (focusRequestId?: string) => void) { return this.host.onCommandCenterOpen?.(listener) || (() => undefined) }
  dismissCommandCenterFocus(focusRequestId: string) { return this.host.dismissCommandCenterFocus?.(focusRequestId) ?? false }
  onNavigationCommand(listener: (command: MiraAppNavigationCommand) => void) { return this.host.onNavigationCommand?.(listener) || (() => undefined) }
  onNavigationRestore(listener: (snapshot: MiraAppNavigationSnapshot | undefined) => void) {
    if (this.host.onNavigationRestore) return this.host.onNavigationRestore(listener)
    listener(undefined)
    return () => undefined
  }
  publishNavigationState(state: MiraAppNavigationState) { this.host.publishNavigationState?.(state) }
  onSessionDeleted(listener: (id: string) => void) { this.deletedSessionListeners.add(listener); return () => { this.deletedSessionListeners.delete(listener) } }
  async renameProject(id: string, name: string) { await this.require('renameProject')(id, name); await this.refreshList(); if (this.state.session?.projectId === id) await this.refreshSession(this.state.session.id, this.generation, false) }
  async openProject(id: string, target: 'file-manager' | 'terminal' = 'file-manager') { const error = await this.require('openProject')(id, target); if (error) throw new Error(error) }
  async selectProject() { const project = await this.require('selectProject')(); if (project) await this.refreshList(); return project }
  async createConversation(projectId?: string) {
    if (projectId && !this.state.projects.some(project => project.id === projectId && project.directoryExists)) throw new Error('所选项目目录不可用，请重新选择')
    const session = await this.host.createSession(projectId)
    if (this.disposed) throw new Error('Harness 连接已关闭')
    await this.refreshList()
    return session
  }
  listAutomationTasks() { return this.require('listAutomationTasks')() }
  getAutomationOverview() { return this.require('getAutomationOverview')() }
  getAutomationNextRuns(expression: string) { return this.require('getAutomationNextRuns')(expression) }
  saveAutomationTask(input: AutomationTaskInput) { return this.require('saveAutomationTask')(input) }
  setAutomationTaskEnabled(id: string, enabled: boolean) { return this.require('setAutomationTaskEnabled')(id, enabled) }
  deleteAutomationTask(id: string) { return this.require('deleteAutomationTask')(id) }
  listAutomationRuns(id: string, status?: AutomationRunStatus) { return this.require('listAutomationRuns')(id, status) }
  runAutomationNow(id: string) { return this.require('runAutomationNow')(id) }
  retryAutomationRun(id: string) { return this.require('retryAutomationRun')(id) }
  abortAutomationRun(id: string) { return this.require('abortAutomationRun')(id) }
  getHarnessPermissionConfig() { return this.require('getHarnessPermissionConfig')() }
  async restoreSession(id: string) {
    await this.require('restoreSession')(id)
    await this.refreshList()
    if (this.activeSessionId === id) await this.refreshSession(id, this.generation, false)
  }
  async deleteSession(id: string) {
    if (this.activeSessionId === id) await this.flushBeforeNavigation()
    await this.require('deleteSession')(id)
    const wasActive = this.removeDeletedSessions([id])
    const generation = this.generation
    await this.refreshList()
    if (wasActive && generation === this.generation && !this.disposed) {
      if (this.state.sessions[0]) await this.open(this.state.sessions[0].id)
    }
  }
  private removeDeletedSessions(ids: readonly string[]) {
    const deleted = new Set(ids)
    const wasActive = Boolean(this.activeSessionId && deleted.has(this.activeSessionId))
    if (wasActive) this.newConversation()
    else if (this.loadingSessionId && deleted.has(this.loadingSessionId)) {
      this.generation++; this.snapshotVersion++; this.loadingSessionId = undefined
      this.update({ sessionLoading: false })
    }
    const pendingPermissions = { ...this.state.pendingPermissions }
    for (const id of deleted) {
      this.deletedSessionListeners.forEach(listener => listener(id))
      this.sessionSelections.delete(id)
      this.queues.delete(id); this.eventRuns.delete(id); this.runningRevisions.delete(id)
      this.writePreference(`session-model-selection.${id}`, null)
      delete pendingPermissions[id]
    }
    this.update({ sessions: this.state.sessions.filter(item => !deleted.has(item.id)), pendingPermissions, runningSessionIds: this.state.runningSessionIds.filter(id => !deleted.has(id)), unreadSessionIds: this.state.unreadSessionIds.filter(id => !deleted.has(id)) })
    return wasActive
  }
  async moveSession(id: string, projectId: string) {
    const generation = this.generation
    try {
      await this.require('moveSession')(id, projectId)
      await this.refreshList()
      if (generation === this.generation && id === this.activeSessionId) await this.refreshSession(id, generation, false)
    } catch (error) { if (generation === this.generation && !this.disposed) this.fail(error) }
  }
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
  get supportsAttachments() { return Boolean(this.host.importAttachments && this.host.getAttachment && this.host.selectAttachments) }
  importAttachments(id: string, files: Array<{ name: string; mediaType: string; data: string }>) { return this.require('importAttachments')(id, files) }
  getAttachment(id: string, path: string) { return this.require('getAttachment')(id, path) }
  get supportsAttachmentSave() { return Boolean(this.host.saveAttachment) }
  saveAttachment(id: string, path: string) { return this.require('saveAttachment')(id, path) }
  stageAttachment(id: string, path: string) { return this.require('stageAttachment')(id, path) }
  selectAttachments(id: string) { return this.require('selectAttachments')(id) }
  listGitBranches(projectId: string) { return this.require('listGitBranches')(projectId) }
  get supportsGitActions() { return Boolean(this.host.getGitContext && this.host.checkoutGitBranch && this.host.createGitBranch) }
  async getGitContext(projectId: string) {
    const revision = this.advanceGitContext(projectId)
    const context = await this.require('getGitContext')(projectId)
    if (this.disposed || context.projectId !== projectId || this.gitContextRevisions.get(projectId) !== revision) throw new Error('Git 上下文已更新，请重新打开分支菜单')
    return this.applyGitContext(context)
  }
  checkoutGitBranch(projectId: string, branch: string, snapshotToken: string) {
    return this.changeGitContext(projectId, () => this.require('checkoutGitBranch')(projectId, branch, snapshotToken))
  }
  createGitBranch(projectId: string, branch: string, snapshotToken: string) {
    return this.changeGitContext(projectId, () => this.require('createGitBranch')(projectId, branch, snapshotToken))
  }
  private advanceGitContext(projectId: string) {
    const revision = (this.gitContextRevisions.get(projectId) ?? 0) + 1
    this.gitContextRevisions.set(projectId, revision)
    return revision
  }
  private async changeGitContext(projectId: string, change: () => Promise<HarnessGitContext>) {
    const revision = this.advanceGitContext(projectId)
    this.gitMutationRevisions.set(projectId, revision)
    try {
      const context = await change()
      return context.projectId === projectId && this.gitMutationRevisions.get(projectId) === revision ? this.applyGitContext(context) : context
    } finally { this.advanceGitContext(projectId) }
  }
  private applyGitContext(context: HarnessGitContext) {
    if (!this.disposed) this.update({ projects: this.state.projects.map(project => project.id === context.projectId && project.directory === context.directory ? { ...project, isGitRepository: context.isRepository, gitBranch: context.branchName } : project) })
    return context
  }
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
  listProjectFiles(projectId: string, path = '') { return this.host.listProjectFiles?.(projectId, path) ?? Promise.reject(new Error('当前宿主不支持项目文件浏览')) }
  searchProjectFiles(projectId: string, query: string, refresh = false) { return this.host.searchProjectFiles?.(projectId, query, refresh) ?? Promise.reject(new Error('当前宿主不支持项目文件搜索')) }
  get supportsProjectWorkspaceGit() { return Boolean(this.host.getProjectWorkspaceGit && this.host.getProjectWorkspaceIgnored) }
  getProjectWorkspaceGit(projectId: string) { return this.host.getProjectWorkspaceGit?.(projectId) ?? Promise.reject(new Error('当前宿主不支持项目 Git 状态')) }
  getProjectWorkspaceIgnored(projectId: string, paths: string[]) { return this.host.getProjectWorkspaceIgnored?.(projectId, paths) ?? Promise.reject(new Error('当前宿主不支持项目 Git 忽略状态')) }
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
    const runningRevision = this.runningRevision
    const sessions = await this.host.listSessions()
    this.applySessionList(sessions, runningRevision)
  }
  private applySessionList(sessions: HarnessSessionSummary[], revision: number) {
    const runningIds = new Set(this.state.runningSessionIds)
    for (const session of sessions) {
      if (session.isRunning === undefined || (this.runningRevisions.get(session.id) ?? 0) > revision) continue
      if (session.isRunning) runningIds.add(session.id)
      else runningIds.delete(session.id)
    }
    this.update({ sessions, runningSessionIds: [...runningIds] })
  }
  private async refreshSession(id: string, generation: number, replaceMessages = true, confirmedRunChange = false) {
    if (generation !== this.generation || id !== this.activeSessionId || this.disposed) return
    const version = ++this.snapshotVersion
    try {
      const session = await this.host.getSession(id)
      if (generation !== this.generation || version !== this.snapshotVersion || this.disposed) return
      if (!confirmedRunChange && !this.reconcileSnapshotRun(session)) return
      const eventRun = this.eventRuns.get(id)
      // 宿主明确拒绝旧运行身份后，读取最新权威运行；普通流式快照仍保持原游标保护。
      if (!confirmedRunChange && eventRun && !eventRun.closed && this.state.running && session.activeRun?.id !== eventRun.id) return
      if (!confirmedRunChange && eventRun?.messageId && session.activeRun?.id === eventRun.id && session.activeRun.messageId !== eventRun.messageId) return
      if (eventRun?.closed && session.activeRun?.id === eventRun.id) return
      if (confirmedRunChange && eventRun && session.activeRun?.id !== eventRun.id) eventRun.closed = true
      if (confirmedRunChange && eventRun && session.activeRun?.id === eventRun.id) eventRun.messageId = session.activeRun.messageId
      this.captureRun(session)
      const activeRun = session.activeRun
      const stream = activeRun && (this.state.messages.find(message => message.id === `stream-${activeRun.messageId ?? activeRun.id}`) ?? (!activeRun.messageId ? this.state.messages.find(message => message.id.startsWith('stream-') && !message.runId) : undefined))
      let messages = session.messages.filter(message => !message.internal).map(projectPartContent)
      if (stream) {
        const last = messages[messages.length - 1]
        const partial = activeRun!.messageId ? messages.find(message => message.role === 'assistant' && message.id === activeRun!.messageId) : last?.role === 'assistant' && (last.runId === activeRun!.id || !last.runId && !last.run && !this.state.messages.some(message => message.id === last.id)) ? last : undefined
        if (partial) {
          // Snapshot text may be ahead of delivered events; only the live event cursor owns the stream bytes.
          messages = messages.map(message => message === partial ? projectPartContent({ ...partial, ...stream, parts: this.mergeMessageParts(partial.parts, stream.parts, activeRun!.id) }) : message)
        } else messages = [...messages, stream]
      }
      this.update({ session, ...(replaceMessages || session.activeRun ? { messages } : {}), running: Boolean(session.activeRun) })
      await this.refreshList()
    } catch (error) { if (generation === this.generation && version === this.snapshotVersion) this.fail(error) }
  }
  private mergeMessageParts(saved: HarnessMessagePart[] | undefined, live: HarnessMessagePart[] | undefined, runId: string) {
    if (!saved) return live
    if (!live) return saved
    const parts = saved.map(part => this.livePartKeys.has(`${runId}:${part.id}`) ? live.find(item => item.id === part.id) ?? part : part)
    return [...parts, ...live.filter(part => !parts.some(item => item.id === part.id))]
  }
  private applyMessagePart(event: HarnessEvent) {
    const runId = event.runId ?? this.state.session?.activeRun?.id
    if (!runId) return
    const messages = [...this.state.messages]
    const last = messages[messages.length - 1]
    const messageId = this.eventRuns.get(event.sessionId)?.messageId
    const streamId = `stream-${messageId ?? runId}`
    const current = last?.role === 'assistant' && (last.id === streamId || (messageId ? last.id === messageId : last.runId === runId && !last.run)) ? last : { id: streamId, role: 'assistant' as const, content: '', runId, createdAt: Date.now() }
    const parts = [...(current.parts ?? [])]
    const incoming = event.payload.part as HarnessMessagePart | undefined
    const partId = incoming?.id ?? event.payload.partId
    if (typeof partId !== 'string' || !partId) return
    const index = parts.findIndex(part => part.id === partId)
    const existing = parts[index]
    const resync = () => {
      this.livePartKeys.delete(`${runId}:${partId}`)
      void this.refreshSession(event.sessionId, this.generation)
    }
    let part: HarnessMessagePart
    if (incoming) {
      if (existing && existing.type !== incoming.type) return
      if (incoming.type === 'tool') {
        if (typeof incoming.toolCallId !== 'string' || !incoming.toolCallId) return
        part = { id: partId, type: 'tool', toolCallId: incoming.toolCallId }
      } else {
        if (!['text', 'reasoning'].includes(incoming.type) || typeof incoming.text !== 'string' || !['streaming', 'complete', 'interrupted'].includes(incoming.state) || !Number.isFinite(incoming.startedAt)) return
        if (existing?.type === 'tool') return
        if (existing && existing.state !== 'streaming' && incoming.state === 'streaming') return
        part = { id: partId, type: incoming.type, text: existing && existing.text.length > incoming.text.length ? existing.text : incoming.text, state: incoming.state, startedAt: incoming.startedAt, ...(Number.isFinite(incoming.completedAt) ? { completedAt: incoming.completedAt } : {}), ...(incoming.truncated ? { truncated: true } : {}) }
      }
    } else {
      if (typeof event.payload.delta !== 'string') return
      if (!existing) { resync(); return }
      if (existing.type === 'tool' || existing.state !== 'streaming') return
      const { delta, offset } = event.payload
      if (offset !== undefined) {
        if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) return
        if (offset > existing.text.length) { resync(); return }
        const overlap = Math.min(delta.length, existing.text.length - offset)
        if (existing.text.slice(offset, offset + overlap) !== delta.slice(0, overlap)) { resync(); return }
        part = { ...existing, text: existing.text + delta.slice(overlap) }
      } else part = { ...existing, text: existing.text + delta }
    }
    this.livePartKeys.add(`${runId}:${partId}`)
    if (index < 0) parts.push(part)
    else parts[index] = part
    const message = projectPartContent({ ...current, id: streamId, runId, parts })
    if (current === last) messages[messages.length - 1] = message
    else messages.push(message)
    this.update({ messages, running: true })
  }
  private applyMessageBoundary(event: HarnessEvent) {
    const guide = event.payload.message as HarnessMessage
    const previousId = event.payload.previousAssistantMessageId as string | undefined
    const previous = event.payload.previousAssistantMessage as HarnessMessage | undefined
    const nextId = event.payload.nextAssistantMessageId as string
    this.snapshotVersion++
    let messages = this.state.messages.filter(message => message.id !== guide.id)
    const previousIndex = previousId ? messages.findIndex(message => message.role === 'assistant' && (message.id === previousId || message.id === `stream-${previousId}`)) : -1
    if (previousIndex >= 0) {
      const closed = messages[previousIndex]
      messages[previousIndex] = previous ? projectPartContent(previous) : { ...closed, id: previousId! }
      for (const part of closed.parts ?? []) this.livePartKeys.delete(`${event.runId}:${part.id}`)
    } else if (previous) messages.push(projectPartContent(previous))
    const nextIndex = messages.findIndex(message => message.role === 'assistant' && (message.id === nextId || message.id === `stream-${nextId}`))
    messages.splice(nextIndex >= 0 ? nextIndex : messages.length, 0, guide)
    if (nextIndex < 0) messages.push({ id: `stream-${nextId}`, role: 'assistant', runId: event.runId, content: '', createdAt: guide.createdAt })
    const session = this.state.session
    this.update({ messages, running: true, ...(session?.activeRun ? { session: { ...session, activeRun: { ...session.activeRun, messageId: nextId } } } : {}) })
    void this.refreshSession(event.sessionId, this.generation)
  }
  private settleToolPermission(event: HarnessEvent) {
    const { id, status, approvalRequestId } = event.payload
    const runId = event.runId ?? event.payload.runId
    if (!['ok', 'failed', 'cancelled'].includes(String(status)) || typeof id !== 'string' || typeof approvalRequestId !== 'string' || typeof runId !== 'string') return
    if (event.payload.runId !== undefined && event.payload.runId !== runId) return
    const matches = (request: HarnessPermissionRequest | undefined) => Boolean(request && request.sessionId === event.sessionId && request.requestId === approvalRequestId && request.toolCallId === id && request.runId === runId)
    const clearCurrent = event.sessionId === this.activeSessionId && matches(this.state.permission)
    const clearPending = matches(this.state.pendingPermissions[event.sessionId])
    if (!clearCurrent && !clearPending) return
    this.permissionRevision++
    const pendingPermissions = { ...this.state.pendingPermissions }
    if (clearPending) delete pendingPermissions[event.sessionId]
    this.update({ pendingPermissions, ...(clearCurrent ? { permission: undefined } : {}) })
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
    if (event.type === 'queue-updated') {
      const queue = event.payload.queue as HarnessMessageQueueSnapshot | undefined
      if (queue?.sessionId === event.sessionId && Number.isSafeInteger(queue.revision) && Array.isArray(queue.items)) this.applyQueue(queue)
      return
    }
    if (!this.acceptRunEvent(event)) return
    if (event.type === 'tool-call') this.settleToolPermission(event)
    if (event.type === 'status' || event.type === 'run-start') this.applyStatusBadge(event.sessionId, event.type === 'run-start' ? 'running' : String(event.payload.state || ''), event.sessionId !== this.activeSessionId)
    if (event.type === 'status' || event.type === 'title-updated') void this.refreshList().catch(error => this.fail(error))
    if (event.type === 'permission-request' && typeof event.payload.requestId === 'string') {
      const request: HarnessPermissionRequest = { sessionId: event.sessionId, requestId: event.payload.requestId, title: String(event.payload.title || '请求权限'), detail: String(event.payload.detail || ''), ...(typeof event.payload.toolCallId === 'string' ? { toolCallId: event.payload.toolCallId } : {}), ...(typeof event.payload.runId === 'string' ? { runId: event.payload.runId } : event.runId ? { runId: event.runId } : {}) }
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
    if (event.type === 'message-boundary') { this.applyMessageBoundary(event); return }
    if (event.type === 'message-part') this.applyMessagePart(event)
    if (event.type === 'message-delta') {
      const delta = typeof event.payload.delta === 'string' ? event.payload.delta : ''
      if (!delta) return
      const messages = [...this.state.messages]
      const last = messages[messages.length - 1]
      const messageId = this.eventRuns.get(event.sessionId)?.messageId
      const streamId = `stream-${messageId ?? event.runId ?? Date.now()}`
      if (last?.role === 'assistant' && last.parts && (!event.runId || last.runId === event.runId)) return
      if (last?.role === 'assistant' && (messageId ? last.id === messageId || last.id === streamId : last.id.startsWith('stream-') && (!event.runId || last.id === streamId) || event.runId && last.runId === event.runId && !last.run)) messages[messages.length - 1] = { ...last, id: streamId, content: last.content + delta }
      else messages.push({ id: streamId, role: 'assistant', content: delta, ...(event.runId ? { runId: event.runId } : {}), createdAt: Date.now() })
      this.update({ messages, running: true })
    }
    if (event.type === 'permission-request' && typeof event.payload.requestId === 'string') {
      this.permissionRevision++
      this.update({ permission: { sessionId: event.sessionId, requestId: event.payload.requestId, title: String(event.payload.title || '请求权限'), detail: String(event.payload.detail || '') } })
    }
    if (event.type === 'run-start' || event.type === 'status' && event.payload.state === 'running') {
      this.snapshotVersion++
      const session = this.state.session
      const activeRun = session && event.runId ? session.activeRun?.id === event.runId ? session.activeRun : {
        id: event.runId,
        ...(typeof event.payload.messageId === 'string' ? { messageId: event.payload.messageId } : {}),
        startedAt: typeof event.payload.startedAt === 'number' ? event.payload.startedAt : event.occurredAt || Date.now(),
        activities: [], subtasks: [],
      } : undefined
      this.update({ running: true, error: undefined, ...(session && activeRun ? { session: { ...session, activeRun } } : {}) })
      void this.refreshSession(event.sessionId, generation)
    }
    if (event.type === 'error') this.update({ error: String(event.payload.message || '任务执行失败') })
    if (event.type === 'run-activity' || event.type === 'tool-call') void this.refreshSession(event.sessionId, generation, false)
    if (event.type === 'message-complete' || event.type === 'interaction-created' || event.type === 'interaction-resolved' || event.type === 'plan-updated' || event.type === 'status' && event.payload.state !== 'running') {
      if (event.type === 'status' && event.payload.state !== 'running') { this.permissionRevision++; this.update({ running: false, permission: undefined }) }
      void this.refreshSession(event.sessionId, generation)
    }
  }
  private applyQueue(queue: HarnessMessageQueueSnapshot) {
    if (this.disposed || (this.queues.get(queue.sessionId)?.revision ?? -1) >= queue.revision) return
    this.queues.set(queue.sessionId, queue)
    if (queue.sessionId === this.activeSessionId && !this.state.sessionLoading) this.update({ queue, queueError: undefined })
  }
  private captureRun(session: HarnessSession) {
    const run = session.activeRun
    if (!run) return
    const current = this.eventRuns.get(session.id)
    if (current?.id === run.id) { current.messageId ??= run.messageId; return }
    if (current?.retired.has(run.id) || current && current.startedAt > run.startedAt) return
    const retired = current?.retired ?? new Set<string>()
    if (current) retired.add(current.id)
    this.eventRuns.set(session.id, { id: run.id, messageId: run.messageId, startedAt: run.startedAt, sequence: -1, retired })
  }
  private reconcileSnapshotRun(session: HarnessSession) {
    const cursor = this.eventRuns.get(session.id)
    if (!cursor?.messageId) return true
    const run = session.activeRun
    if (run && run.id !== cursor.id) {
      if (cursor.retired.has(run.id) || run.startedAt < cursor.startedAt) return false
      this.captureRun(session)
      return true
    }
    if (cursor.closed) return !run
    if (run?.id === cursor.id && run.messageId === cursor.messageId) return true
    const previous = session.messages.findIndex(message => message.role === 'assistant' && message.runId === cursor.id && message.id === cursor.messageId)
    if (run?.id === cursor.id) {
      if (!run.messageId || previous < 0 || !session.messages.slice(previous + 1).some(message => message.role === 'user' && message.runId === cursor.id && message.delivery === 'guide')) return false
      cursor.messageId = run.messageId
      return true
    }
    if (previous < 0 || !session.messages.slice(previous).some(message => message.role === 'assistant' && message.runId === cursor.id && message.run?.status)) return false
    cursor.closed = true
    return true
  }
  private acceptRunEvent(event: HarnessEvent) {
    if (event.eventId && this.seenEventIds.has(event.eventId)) return false
    if (event.runId) {
      let current = this.eventRuns.get(event.sessionId)
      if (!current || current.id !== event.runId) {
        const startsRun = event.type === 'run-start' || event.type === 'status' && event.payload.state === 'running'
        const startedAt = typeof event.payload.startedAt === 'number' ? event.payload.startedAt : event.occurredAt || Date.now()
        if (current && (!startsRun || current.retired.has(event.runId) || startedAt < current.startedAt)) return false
        const retired = current?.retired ?? new Set<string>()
        if (current) retired.add(current.id)
        current = { id: event.runId, startedAt, sequence: -1, retired }
        this.eventRuns.set(event.sessionId, current)
      }
      if (current.closed) return false
      if (event.type === 'message-boundary') {
        const guide = event.payload.message as HarnessMessage | undefined
        const { previousAssistantMessageId, nextAssistantMessageId } = event.payload
        if (!guide || guide.role !== 'user' || typeof guide.id !== 'string' || typeof nextAssistantMessageId !== 'string' || !nextAssistantMessageId) return false
        if (current.messageId && previousAssistantMessageId && previousAssistantMessageId !== current.messageId && nextAssistantMessageId !== current.messageId) return false
      } else if (['message-part', 'message-delta', 'message-complete'].includes(event.type) && typeof event.payload.messageId === 'string' && current.messageId && event.payload.messageId !== current.messageId) return false
      if (typeof event.sequence === 'number') {
        if (event.sequence <= current.sequence) return false
        current.sequence = event.sequence
      }
      if (event.type === 'message-boundary') current.messageId = event.payload.nextAssistantMessageId as string
      else if (!current.messageId && typeof event.payload.messageId === 'string') current.messageId = event.payload.messageId
      if (event.type === 'status' && ['idle', 'completed', 'failed', 'stopped'].includes(String(event.payload.state))) current.closed = true
    }
    if (event.eventId) {
      this.seenEventIds.add(event.eventId)
      if (this.seenEventIds.size > 512) this.seenEventIds.delete(this.seenEventIds.values().next().value!)
    }
    return true
  }
  private applyStatusBadge(sessionId: string, state: string, isBackground: boolean) {
    this.runningRevisions.set(sessionId, ++this.runningRevision)
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
  dispose() { this.disposed = true; this.generation++; this.snapshotVersion++; this.unsubscribe?.(); this.unsubscribe = undefined; this.terminalListeners.clear(); this.workspaceFileListeners.clear(); this.beforeNavigation.clear(); this.deletedSessionListeners.clear(); this.listeners.clear() }
}
