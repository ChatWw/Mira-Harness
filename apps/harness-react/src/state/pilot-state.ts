import type { HarnessProjectUpdateInput } from '../../../../src/config/harness'
import type { MiraGitSnapshot, MiraGitAction, MiraGitGraph, MiraGitActionResult } from '../../../../src/config/miraGit'
import { isModelProviderAvailable, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessPermissionRequest, type HarnessProject, type HarnessSession, type HarnessSessionOrderScope, type HarnessSessionSummary, type HarnessUserAnswer, type HarnessWorkspaceFileEntry, type HarnessWorkspaceFileSearchResult, type HarnessWorkspaceGitSnapshot, type HarnessWorkspaceImagePreview, type ModelProviderSummary, type ModelSelection, type PermissionMode } from '../../../../src/config/harness'
import type { MiraMediaPreview } from '../../../../src/config/miraMedia'
import type { MiraHistoryEditBlocked, MiraHistoryEditWorkspace } from '../../../../src/config/miraFileRewind'
import type { MiraModelError } from '../../../../src/config/miraModelErrors'
import type { HarnessAttachmentSaveResult, HarnessBrowserBounds, HarnessBrowserPresentation } from '../../../../src/platform/firstPartyHarness'
import type { HarnessHistoryPage, HarnessHistoryQuery } from '../../../../src/config/harness'
import type { HarnessContextCompactionResult, SendShortcut } from '../../../../src/config/harness'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail, HarnessSkillMarketItem } from '../../../../src/config/harness'
import type { HarnessConversationSearchResult } from '../../../../src/config/harness'
import type { AutomationOverview, AutomationRun, AutomationRunStatus, AutomationTask, AutomationTaskInput, PermissionConfig } from '../../../../src/config/harness'
import type { HarnessGitContext, HarnessMessagePart, HarnessMessageQueueSnapshot, HarnessMessageSubmissionOptions, HarnessMessageSubmissionResult, HarnessMessageWithdrawal } from '../../../../src/config/harness'
import type { MiraHarnessControlAction, MiraHarnessControlsState } from '../../../../src/platform/harnessControls'
import type { MiraAppNavigationCommand, MiraAppNavigationSnapshot, MiraAppNavigationState } from '../../../../src/platform/appNavigation'
import type { HarnessMessageAttachment, ToolCallRecord } from '../../../../src/config/harness'
import type { HarnessArchivedSnapshot, HarnessArchivedDeletionResult } from '../../../../src/config/harness'
import type { HarnessSideConversationInput } from '../../../../src/config/harness'
import type { MiraBrowserPickResult } from '../../../../src/platform/miraBrowserPicker'
import { getMiraGoalStatusLabel, parseMiraGoalCommand, type HarnessGoal } from '../../../../src/config/miraGoals'

export interface PilotBrowserEvent { sessionId: string; browserId?: string; url: string; title?: string; ready?: boolean; canGoBack: boolean; canGoForward: boolean; loading: boolean; error?: string; errorCode?: number; faviconUrl?: string | null }
export interface PilotWorkspaceFileEvent { sessionId: string; watchId: string; directory: string; paths: string[]; error?: string }

export interface PilotHost {
  remoteControl?(action: import('../../../../src/config/miraRemote').MiraRemoteAction, id?: string): Promise<import('../../../../src/config/miraRemote').MiraRemoteStatus>
  requestWorkflow?<T>(request: import('../../../../src/config/miraFlowWorkbench').MiraFlowWorkbenchRequest): Promise<T>
  listSessions(): Promise<HarnessSessionSummary[]>
  listProjects(): Promise<HarnessProject[]>
  getSession(id: string): Promise<HarnessSession>
  createSession(projectId?: string): Promise<HarnessSession>
  createSideConversation?(parentId: string, input?: HarnessSideConversationInput): Promise<HarnessSession>
  forkConversation?(id: string, messageId: string, requestId: string): Promise<HarnessSession>
  compactConversation?(id: string, selection: ModelSelection): Promise<HarnessContextCompactionResult>
  pauseGoal?(sessionId: string, expectedRevision: number, expectedGoalId: string): Promise<HarnessGoal>
  resumeGoal?(sessionId: string, expectedRevision: number, expectedGoalId: string, selection: ModelSelection, permissionMode?: PermissionMode): Promise<HarnessGoal>
  updateGoalBudget?(sessionId: string, tokenBudget: number | null, expectedRevision: number, expectedGoalId: string): Promise<HarnessGoal>
  clearGoal?(sessionId: string, expectedRevision: number, expectedGoalId: string): Promise<void>
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
  listProjectFiles?(projectId: string, path: string, rootPath?: string): Promise<{ path: string; entries: HarnessWorkspaceFileEntry[] }>
  searchProjectFiles?(projectId: string, query: string, refresh?: boolean, rootPath?: string): Promise<HarnessWorkspaceFileSearchResult>
  getProjectWorkspaceGit?(projectId: string, rootPath?: string): Promise<HarnessWorkspaceGitSnapshot>
  getProjectWorkspaceIgnored?(projectId: string, paths: string[], rootPath?: string): Promise<string[]>
  watchProjectFiles?(projectId: string, rootPath: string, paths: string[]): Promise<{ watchId: string }>
  unwatchProjectFiles?(projectId: string, rootPath: string, watchId: string): Promise<void>
  watchFiles?(sessionId: string, paths: string[]): Promise<{ watchId: string }>
  unwatchFiles?(sessionId: string, watchId: string): Promise<void>
  listEditors?(refresh?: boolean): Promise<Array<{ id: string; name: string; icon?: string }>>
  getWorkspaceHtmlUrl?(scope: { projectId: string; rootPath?: string } | { sessionId: string }, path: string): Promise<string>
  revealWorkspaceFile?(scope: { projectId: string; rootPath?: string } | { sessionId: string }, path: string): Promise<void>
  openProjectFileInEditor?(projectId: string, path: string, editorId: string, rootPath?: string): Promise<void>
  openFileInEditor?(sessionId: string, path: string, editorId: string): Promise<void>
  readProjectFile?(projectId: string, path: string, rootPath?: string): Promise<{ path: string; content: string }>
  readProjectImage?(projectId: string, path: string, rootPath?: string): Promise<HarnessWorkspaceImagePreview>
  openProjectMedia?(projectId: string, path: string, rootPath?: string): Promise<MiraMediaPreview>
  readFile(id: string, path: string): Promise<{ path: string; content: string }>
  readImage?(id: string, path: string): Promise<HarnessWorkspaceImagePreview>
  openMedia?(id: string, path: string): Promise<MiraMediaPreview>
  closeMedia?(id: string): Promise<void>
  openTerminal(id: string): Promise<{ terminalId: string; sessionId: string; cwd: string; shell?: string }>
  writeTerminal(id: string, terminalId: string, data: string): Promise<void>
  pasteTerminal?(id: string, terminalId: string, bracketed: boolean): Promise<void>
  resizeTerminal(id: string, terminalId: string, columns: number, rows: number): Promise<void>
  closeTerminal(id: string, terminalId: string): Promise<void>
  navigateBrowser(id: string, url: string, bounds: HarnessBrowserBounds, browserId?: string, visible?: boolean): Promise<string>
  setBrowserBounds(id: string, bounds: HarnessBrowserBounds, browserId?: string): Promise<void>
  setBrowserViewport?(id: string, presentation: HarnessBrowserPresentation, browserId?: string): Promise<{ desktopZoomFactor: number }>
  pickBrowserElement?(id: string, action: 'start' | 'cancel', browserId: string): Promise<MiraBrowserPickResult>
  browserProtected?(id: string, browserId: string): Promise<{ protected: boolean }>
  controlBrowser(id: string, action: 'back' | 'forward' | 'reload' | 'devtools' | 'hide' | 'show' | 'close', browserId?: string): Promise<void>
  openBrowserExternal?(id: string, url: string, browserId?: string): Promise<void>
  onBrowserEvent(listener: (event: PilotBrowserEvent) => void): () => void
  navigate?(path: string): Promise<void>
  getComposerPreferences?(): Promise<{ sendShortcut: SendShortcut; showContextUsage: boolean; followupMode?: 'queue' | 'guide' }>
  browseSkillMarket?(refresh?: boolean): Promise<HarnessSkillMarketCatalog>
  getSkillMarketDetail?(id: string): Promise<HarnessSkillMarketDetail>
  installMarketSkill?(id: string): Promise<HarnessSkillMarketItem>
  listInstalledMarketSkills?(): Promise<HarnessSkillMarketItem[]>
  listPluginMarketplaces?(): Promise<import('../../../../src/config/miraPlugins').MiraPluginMarketplaceSource[]>
  addPluginMarketplace?(source: string): Promise<import('../../../../src/config/miraPlugins').MiraPluginMarketplaceSource[]>
  removePluginMarketplace?(id: string): Promise<import('../../../../src/config/miraPlugins').MiraPluginMarketplaceSource[]>
  browsePluginMarket?(refresh?: boolean): Promise<import('../../../../src/config/miraPlugins').MiraPluginMarketCatalog>
  getPluginMarketDetail?(id: string): Promise<import('../../../../src/config/miraPlugins').MiraPluginMarketDetail>
  installMarketPlugin?(id: string): Promise<import('../../../../src/config/miraPlugins').MiraPluginMarketItem>
  /** 宿主偏好读写（第一方命名空间）；开发态宿主可以缺省。 */
  getPreference?(key: string): Promise<unknown>
  listPromptHistory?(scope: { sessionId?: string; projectId?: string }): Promise<string[]>
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
  onHarnessControl?(listener: (action: MiraHarnessControlAction) => void): () => void
  publishHarnessControls?(state: MiraHarnessControlsState): void
  onFullViewToggle?(listener: () => void): () => void
  onCommandCenterOpen?(listener: (focusRequestId?: string) => void): () => void
  onCloseContext?(callback: () => Promise<boolean>): () => void
  dismissCommandCenterFocus?(focusRequestId: string): boolean
  onNavigationCommand?(listener: (command: MiraAppNavigationCommand) => void): () => void
  onNavigationRestore?(listener: (snapshot: MiraAppNavigationSnapshot | undefined) => void): () => void
  publishNavigationState?(state: MiraAppNavigationState): void
  updateProject?(id: string, input: HarnessProjectUpdateInput): Promise<HarnessProject>
  createProject?(input: HarnessProjectUpdateInput): Promise<HarnessProject>
  selectProjectDirectories?(): Promise<string[]>
  renameProject?(id: string, name: string): Promise<void>
  removeProject?(id: string): Promise<void>
  openProject?(id: string, target?: 'file-manager' | 'terminal'): Promise<string>
  selectProject?(): Promise<HarnessProject | null>
  getTheme?(): 'light' | 'dark'
  onThemeChange?(listener: () => void): () => void
  showAbout?(): Promise<void>
  openResourceManager?(): Promise<void>
  getAppearance?(): Promise<{ theme: string; zoomFactor: number }>
  setTheme?(theme: 'system' | 'light' | 'dark'): Promise<{ theme: string; zoomFactor: number }>
  zoom?(action: 'zoomIn' | 'zoomOut' | 'resetZoom'): Promise<{ theme: string; zoomFactor: number }>
  toggleTheme?(): Promise<'light' | 'dark'>
  listAutomationTasks?(): Promise<AutomationTask[]>
  getAutomationOverview?(): Promise<AutomationOverview>
  getAutomationNextRuns?(expression: string, rule?: import('../../../../src/config/automationRepeat').AutomationScheduleRule): Promise<number[]>
  saveAutomationTask?(input: AutomationTaskInput): Promise<AutomationTask>
  setAutomationTaskEnabled?(id: string, enabled: boolean): Promise<AutomationTask>
  deleteAutomationTask?(id: string): Promise<void>
  deleteAutomationRun?(id: string): Promise<void>
  listAutomationRuns?(id: string, status?: AutomationRunStatus): Promise<AutomationRun[]>
  runAutomationNow?(id: string): Promise<AutomationRun>
  retryAutomationRun?(id: string): Promise<AutomationRun>
  abortAutomationRun?(id: string): Promise<void>
  getHarnessPermissionConfig?(): Promise<PermissionConfig>
  restoreSession?(id: string): Promise<void>
  deleteSession?(id: string): Promise<void>
  moveSession?(id: string, projectId?: string): Promise<void>
  reorderSessions?(scope: HarnessSessionOrderScope, ids: string[]): Promise<void>
  reorderProjects?(ids: string[]): Promise<void>
  setSessionPermission?(id: string, mode: PermissionMode): Promise<void>
  setSessionSkills?(id: string, skillIds: string[]): Promise<void>
  setSessionMcpServers?(id: string, serverIds: string[]): Promise<void>
  setSessionDelegation?(id: string, enabled: boolean): Promise<void>
  listSkills?(): Promise<unknown[]>
  listPluginCatalog?(sessionId?: string): Promise<import('../../../../src/config/miraPlugins').MiraPluginItem[]>
  listPromptCommands?(scope: { projectId?: string; sessionId?: string }): Promise<import('../../../../src/config/miraPromptCommands').MiraPromptCommandItem[]>
  listUserAgents?(scope: { projectId?: string; sessionId?: string }): Promise<import('../../../../src/config/miraUserAgents').MiraUserAgentItem[]>
  listPlugins?(): Promise<import('../../../../src/config/miraPlugins').MiraPluginItem[]>
  importLocalPlugin?(): Promise<import('../../../../src/config/miraPlugins').MiraPluginItem[] | null>
  setPluginEnabled?(id: string, enabled: boolean): Promise<import('../../../../src/config/miraPlugins').MiraPluginItem[]>
  removePlugin?(id: string): Promise<import('../../../../src/config/miraPlugins').MiraPluginItem[]>
  listMcp?(sessionId?: string, projectId?: string): Promise<import('../../../../src/config/miraMcp').MiraMcpItem[]>
  reconnectMcp?(id: string): Promise<import('../../../../src/config/miraMcp').MiraMcpConnection>
  selectFiles?(id: string): Promise<HarnessFileReference[]>
  importAttachments?(id: string, files: Array<{ name: string; mediaType: string; data: string }>): Promise<HarnessFileReference[]>
  getAttachment?(id: string, path: string): Promise<HarnessMessageAttachment>
  saveAttachment?(id: string, path: string): Promise<HarnessAttachmentSaveResult>
  stageAttachment?(id: string, path: string): Promise<HarnessFileReference>
  selectAttachments?(id: string, files?: File[]): Promise<HarnessFileReference[]>
  resolveAttachmentPaths?(files: File[]): Promise<string[]>
  listGitBranches?(projectId: string): Promise<unknown>
  generateGitMessage?(projectId: string, token: string, includeUnstaged: boolean, selection: ModelSelection): Promise<string>
  getGitTools?(projectId: string): Promise<MiraGitSnapshot>
  getGitGraph?(projectId: string, skip: number): Promise<MiraGitGraph>
  gitAction?(projectId: string, action: MiraGitAction, token: string, message: string, includeUnstaged: boolean): Promise<MiraGitActionResult>
  getGitContext?(projectId: string): Promise<HarnessGitContext>
  checkoutGitBranch?(projectId: string, branch: string, snapshotToken: string): Promise<HarnessGitContext>
  createGitBranch?(projectId: string, branch: string, snapshotToken: string): Promise<HarnessGitContext>
  respondMemory?(requestId: string, approved: boolean): Promise<void>
  saveMemory?(id: string, selection: ModelSelection): Promise<void>
  stopSubtasks?(id: string, subtaskId?: string): Promise<void>
  backgroundCommand?(id: string, runId: string, toolId: string): Promise<void>
  stopCommand?(id: string, runId: string, toolId: string): Promise<void>
  readCommandOutput?(id: string, runId: string, toolId: string): Promise<string>
  readModelTrace?(id: string): Promise<import('../../../../src/config/miraModelTrace').MiraModelTrace>
  openModelTraceDirectory?(id: string): Promise<void>
  getTaskDiagnosticPaths?(id: string): Promise<import('../../../../src/config/miraModelTrace').MiraTaskDiagnosticPaths>
  rerun?(id: string, selection: ModelSelection): Promise<void>
  editAndRerun?(id: string, messageId: string, content: string, selection: ModelSelection, references?: HarnessFileReference[], workspace?: MiraHistoryEditWorkspace): Promise<void | MiraHistoryEditBlocked>
  previewFileRewind?(id: string, messageId: string): Promise<import('../../../../src/config/miraFileRewind').MiraFileRewindPreview>
  applyFileRewind?(id: string, messageId: string, snapshotToken: string): Promise<import('../../../../src/config/miraFileRewind').MiraFileRewindResult>
  recoverFileRewind?(id: string, recoveryId: string): Promise<import('../../../../src/config/miraFileRewind').MiraFileRewindResult>
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
  modelError?: MiraModelError
  /** 跨会话徽标缓存：运行中 / 未读 / 挂起审批。 */
  runningSessionIds: string[]
  unreadSessionIds: string[]
  pendingPermissions: Record<string, HarnessPermissionRequest>
  /** 当前会话待确认的记忆保存（敏感信息需用户确认）。 */
  memoryConfirmation?: { requestId: string; candidateId?: string; content: string }
  queue?: HarnessMessageQueueSnapshot
  queueError?: string
  promptHistoryRevision?: number
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
  const latestRunMessage = [...state.messages].reverse().find(message => message.run)
  const latestRun = latestRunMessage?.run
  const failedTool = state.session?.toolCalls.some(tool => tool.status === 'failed' && (latestRunMessage?.runId && tool.runId ? tool.runId === latestRunMessage.runId : !latestRun || tool.createdAt >= latestRun.startedAt))
  const failedActivity = latestRun?.activities.some(activity => activity.status === 'failed')
  if (state.permission || state.session?.pendingInteraction?.status === 'waiting') return '等待确认'
  const goal = state.session?.goal
  if (goal?.status === 'paused') return goal.activeRun ? '目标正在暂停' : '目标已暂停'
  if (goal?.status === 'budget_limited') return getMiraGoalStatusLabel(goal)
  if (state.running && goal?.status === 'active' && goal.verification?.status === 'running') return '正在核验目标'
  if (state.running) return '正在执行'
  if (state.session?.status === 'failed' || latestRun?.status === 'failed') return '执行失败'
  if (latestRun?.status === 'stopped') return '已停止，可继续发送'
  if (latestRun?.status !== 'completed' && (failedActivity || failedTool)) return '部分操作未完成'
  if (goal?.status === 'active') return '目标等待执行'
  if (state.session?.status === 'completed') return '最近任务已完成'
  return state.session ? '等待下一步' : '尚未开始'
}

export type PilotTaskTone = 'idle' | 'running' | 'waiting' | 'completed' | 'partial' | 'failed' | 'stopped'

export function getPilotTaskTone(taskState: string): PilotTaskTone {
  if (taskState === '正在执行' || taskState === '正在核验目标' || taskState === '目标正在暂停') return 'running'
  if (taskState === '等待确认') return 'waiting'
  if (taskState === '最近任务已完成') return 'completed'
  if (taskState === '部分操作未完成') return 'partial'
  if (taskState === '执行失败') return 'failed'
  if (taskState === '已停止，可继续发送' || taskState === '目标已暂停' || taskState === '预算已用尽' || taskState === '已暂停，待恢复') return 'stopped'
  return 'idle'
}

export function shouldRenderPilotStream(messageId: string, isOptimistic: boolean, streamId?: string) {
  return Boolean(streamId && (streamId === messageId || isOptimistic))
}

export class PilotController {
  requestWorkflow<T>(request: import('../../../../src/config/miraFlowWorkbench').MiraFlowWorkbenchRequest): Promise<T> {
    if (this.disposed || !this.host.requestWorkflow) return Promise.reject(new Error('工作流服务不可用'))
    return this.host.requestWorkflow<T>(request)
  }
  onWorkflowEvent(listener: (event: HarnessEvent) => void) {
    return this.host.onEvent(event => { if (!this.disposed && event.type === 'workflow-event') listener(event) })
  }
  private state: PilotState = { initialized: false, sessions: [], projects: [], providers: [], messages: [], running: false, sessionLoading: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  private listeners = new Set<() => void>()
  private deletedSessionListeners = new Set<(id: string) => void>()
  private terminalListeners = new Set<(event: HarnessEvent) => void>()
  private workspaceFileListeners = new Set<(event: PilotWorkspaceFileEvent) => void>()
  private beforeNavigation = new Set<(reportFailure?: boolean) => Promise<void> | void>()
  private pendingEditSettlements = new Set<(accepted: boolean) => void>()
  private preferenceWrites = new Map<string, Promise<void>>()
  private unsubscribe?: () => void
  private unsubscribeDeleted?: () => void
  private generation = 0
  private snapshotVersion = 0
  private retiredGoalIds = new Set<string>()
  private permissionRevision = 0
  private pendingToolApprovals = new Map<string, HarnessPermissionRequest>()
  private runningRevision = 0
  private runningRevisions = new Map<string, number>()
  private unreadRevision = 0
  private unreadRevisions = new Map<string, number>()
  private activeSessionId?: string
  private visibleSessionIds?: Set<string>
  private splitPrimarySessionId?: string
  private loadingSessionId?: string
  private disposed = false
  private archivedDeletion?: { snapshotId: string; promise: Promise<HarnessArchivedDeletionResult & { refreshError?: string }> }
  private defaultSelection?: ModelSelection
  private sessionSelections = new Map<string, ModelSelection>()
  private queues = new Map<string, HarnessMessageQueueSnapshot>()
  private eventRuns = new Map<string, { id: string; messageId?: string; startedAt: number; sequence: number; retired: Set<string>; closed?: boolean }>()
  private workflowEventRuns = new Map<string, { sessionId: string; sequence: number; settled?: boolean }>()
  private seenEventIds = new Set<string>()
  private livePartKeys = new Set<string>()
  private gitContextRevisions = new Map<string, number>()
  private gitMutationRevisions = new Map<string, number>()

  constructor(private host: PilotHost, private sideSession?: { sessionId: string; parentId?: string }) {}
  get composerDraftScope() { return this.host }
  private createBoundController(binding: { sessionId: string; parentId?: string }) {
    const pane = new PilotController(this.host, binding)
    // The workbench owns read state; mounting a retained, hidden pane is not reading it.
    pane.visibleSessionIds = new Set()
    pane.unsubscribeDeleted = this.onSessionDeleted(id => pane.removeDeletedSessions([id]))
    return pane
  }
  createSideController(sessionId: string, parentId: string) { return this.createBoundController({ sessionId, parentId }) }
  createTaskPaneController(sessionId: string) { return this.createBoundController({ sessionId }) }
  createSideConversation(parentId: string, input?: HarnessSideConversationInput) {
    const create = this.require('createSideConversation')
    return input === undefined ? create(parentId) : create(parentId, input)
  }
  get supportsSideConversations() { return Boolean(this.host.createSideConversation) }
  get supportsThemeSwitch() { return Boolean(this.host.toggleTheme) }
  get supportsProjectSelection() { return Boolean(this.host.selectProject) }
  get supportsProjectEditing() { return Boolean(this.host.updateProject && this.host.selectProjectDirectories) }
  get supportsProjectRemoval() { return Boolean(this.host.removeProject) }
  getTheme = () => this.host.getTheme?.() ?? 'light'
  subscribeTheme = (listener: () => void) => this.host.onThemeChange?.(listener) ?? (() => undefined)
  showAbout = () => this.require('showAbout')()
  openResourceManager = () => this.require('openResourceManager')()
  getAppearance = () => this.require('getAppearance')()
  setTheme = (theme: 'system' | 'light' | 'dark') => this.require('setTheme')(theme)
  zoom = (action: 'zoomIn' | 'zoomOut' | 'resetZoom') => this.require('zoom')(action)
  toggleTheme = () => this.require('toggleTheme')()
  get supportsConversationFork() { return !this.sideSession && Boolean(this.host.forkConversation) }
  get supportsContextCompaction() { return Boolean(this.host.compactConversation) }
  get supportsGoals() { return !this.sideSession?.parentId && !this.state.session?.parentSessionId && Boolean(this.host.pauseGoal && this.host.resumeGoal && this.host.updateGoalBudget && this.host.clearGoal) }
  private requireGoalOwner(sessionId: string, expectedRevision: number, expectedGoalId: string) {
    const goal = this.state.session?.goal
    if (this.disposed || !this.supportsGoals || this.state.sessionLoading || sessionId !== this.activeSessionId || !goal || goal.id !== expectedGoalId || goal.revision !== expectedRevision) throw new Error('目标已变化，请重新打开目标详情')
    return goal
  }
  private applyGoal(sessionId: string, goal: HarnessGoal) {
    const session = this.state.session
    if (this.disposed || this.state.sessionLoading || session?.id !== sessionId || this.retiredGoalIds.has(goal.id)) return
    const previous = session.goal
    if (previous && (previous.id === goal.id ? previous.revision >= goal.revision : previous.updatedAt > goal.updatedAt)) return
    if (previous && previous.id !== goal.id) this.retiredGoalIds.add(previous.id)
    this.snapshotVersion++
    this.update({ session: { ...session, goal } })
  }
  async pauseGoal(sessionId: string, expectedRevision: number, expectedGoalId: string) {
    this.requireGoalOwner(sessionId, expectedRevision, expectedGoalId)
    const generation = this.generation
    const goal = await this.require('pauseGoal')(sessionId, expectedRevision, expectedGoalId)
    if (generation === this.generation && this.state.session?.goal?.id === expectedGoalId && goal.id === expectedGoalId) this.applyGoal(sessionId, goal)
    return goal
  }
  async resumeGoal(sessionId: string, expectedRevision: number, expectedGoalId: string, selection: ModelSelection, permissionMode?: PermissionMode) {
    this.requireGoalOwner(sessionId, expectedRevision, expectedGoalId)
    const generation = this.generation
    const goal = await this.require('resumeGoal')(sessionId, expectedRevision, expectedGoalId, { ...selection }, permissionMode)
    if (generation === this.generation && this.state.session?.goal?.id === expectedGoalId && goal.id === expectedGoalId) this.applyGoal(sessionId, goal)
    return goal
  }
  async updateGoalBudget(sessionId: string, tokenBudget: number | null, expectedRevision: number, expectedGoalId: string) {
    this.requireGoalOwner(sessionId, expectedRevision, expectedGoalId)
    const generation = this.generation
    const goal = await this.require('updateGoalBudget')(sessionId, tokenBudget, expectedRevision, expectedGoalId)
    if (generation === this.generation && this.state.session?.goal?.id === expectedGoalId && goal.id === expectedGoalId) this.applyGoal(sessionId, goal)
    return goal
  }
  async clearGoal(sessionId: string, expectedRevision: number, expectedGoalId: string) {
    this.requireGoalOwner(sessionId, expectedRevision, expectedGoalId)
    const generation = this.generation
    await this.require('clearGoal')(sessionId, expectedRevision, expectedGoalId)
    if (generation === this.generation && this.state.session?.id === sessionId && this.state.session.goal?.id === expectedGoalId && this.state.session.goal.revision === expectedRevision) {
      this.snapshotVersion++
      this.retiredGoalIds.add(expectedGoalId)
      this.update({ session: { ...this.state.session, goal: undefined } })
    }
  }
  async compactConversation(id: string) {
    if (this.disposed || this.state.sessionLoading || id !== this.activeSessionId || !this.state.selection) throw new Error('请先打开已有对话并选择模型')
    if (this.state.session?.activeRun?.kind === 'context-compaction' || this.state.queue?.items.some(item => item.operation === 'context-compaction')) throw new Error('上下文压缩已在运行或排队')
    const generation = this.generation
    const result = await this.require('compactConversation')(id, { ...this.state.selection })
    if (!this.disposed && generation === this.generation && id === this.activeSessionId) {
      if (result.status === 'queued') {
        if (result.queue.sessionId !== id) throw new Error('压缩确认与原任务不匹配，请重试')
        this.applyQueue(result.queue)
      }
      else await this.refreshSession(id, generation)
    }
    return result
  }
  async forkConversation(id: string, messageId: string, requestId: string) {
    const session = await this.require('forkConversation')(id, messageId, requestId)
    if (this.disposed) throw new Error('Harness 连接已关闭')
    try { await this.refreshList() }
    catch { throw new Error('分支已创建，任务列表刷新失败；重试会恢复同一分支') }
    return session
  }
  get supportsBrowserResidency() { return Boolean(this.host.browserProtected) }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<PilotState>) {
    if (this.disposed) return
    if ('error' in patch && !('modelError' in patch) && (!patch.error || patch.error !== this.state.error)) patch.modelError = undefined
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
    const unreadRevision = this.unreadRevision
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
      this.applySessionList(sessions, runningRevision, unreadRevision)
      this.update({ projects, providers, selection: this.defaultSelection })
      if (this.sideSession) { await this.open(this.sideSession.sessionId); return }
      if (generation !== this.generation || storedSession === null) return
      const restore = typeof storedSession === 'string' ? sessions.find(session => session.id === storedSession) : undefined
      if (restore || sessions[0]) await this.open((restore || sessions[0])!.id)
    } catch (error) { this.fail(error) }
    finally { this.update({ initialized: true }) }
  }
  async open(id: string, isCurrent?: () => boolean) {
    if (this.sideSession && id !== this.sideSession.sessionId) return false
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
      if (this.sideSession && (this.sideSession.parentId !== undefined && session.parentSessionId !== this.sideSession.parentId || session.archivedAt || session.draftState === 'prepared')) throw new Error(this.sideSession.parentId ? '侧边栏对话已不可用，请新建对话' : '任务已不可用，请重新选择')
      if (generation !== this.generation || this.disposed) return false
      if (isCurrent && !isCurrent()) { this.update({ sessionLoading: false }); return false }
      const lastUsedSelection = this.availableSelection({ providerId: session.modelProviderId, modelId: session.modelId, thinkingLevel: session.modelThinkingLevel })
      const defaultSelection = this.availableSelection(this.defaultSelection)
      const legacySelection = !this.sideSession && session.modelThinkingLevel === undefined && lastUsedSelection && defaultSelection?.providerId === lastUsedSelection.providerId && defaultSelection.modelId === lastUsedSelection.modelId ? defaultSelection : lastUsedSelection
      // 未发送配置恢复当前 owner 偏好；新旁路只继承主任务已生效的配置。
      const selection = this.availableSelection(savedSelection) ?? legacySelection ?? (session.modelProviderId || session.modelId ? undefined : defaultSelection)
      if (selection) this.sessionSelections.set(id, selection)
      const permissions = { ...this.state.pendingPermissions }
      if (permissionRevision === this.permissionRevision) {
        for (const [key, request] of this.pendingToolApprovals) if (request.sessionId === id) this.pendingToolApprovals.delete(key)
        pendingPermissions.forEach(request => this.pendingToolApprovals.set(request.requestId, request))
        if (pendingPermissions[0]) permissions[id] = pendingPermissions[0]
        else delete permissions[id]
      }
      if (isCurrent) this.livePartKeys.clear()
      this.activeSessionId = id
      this.captureRun(session)
      if (queueResult && 'queue' in queueResult) this.applyQueue(queueResult.queue)
      const messages = session.messages.filter(message => !message.internal).map(projectPartContent)
      const lastMessage = messages[messages.length - 1]
      const modelError = !session.activeRun && session.status === 'failed' && lastMessage?.run?.status === 'failed' ? lastMessage.run.modelError : undefined
      this.update({ session, sessionLoading: false, selection, messages, running: Boolean(session.activeRun), openingProjectDirectory: false, memoryConfirmation: undefined, queue: this.queues.get(id), queueError: queueResult && 'error' in queueResult ? queueResult.error : undefined, permission: permissionRevision === this.permissionRevision ? pendingPermissions[0] : this.state.permission, pendingPermissions: permissions, ...(modelError ? { error: modelError.message, modelError } : {}) })
      if (selection) this.writePreference(`session-model-selection.${id}`, selection)
      this.writeMainPreference('active-session', session.draftState === 'prepared' ? null : id)
      if (this.isSessionVisible(id)) void this.markSessionRead(id)
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
    this.writeMainPreference('active-session', null)
  }
  /** Visible task panes share read state without changing the primary runtime owner. */
  setVisibleSessionIds(ids: string[], splitPrimaryId?: string) {
    const previous = this.visibleSessionIds
    this.visibleSessionIds = new Set(ids)
    this.splitPrimarySessionId = splitPrimaryId
    for (const id of this.visibleSessionIds) if (!previous?.has(id)) void this.markSessionRead(id)
  }
  private isSessionVisible(id: string) { return this.visibleSessionIds ? this.visibleSessionIds.has(id) : id === this.activeSessionId }
  /** 用户实际打开或再次选择会话时清除徽标并通知宿主。 */
  async markSessionRead(id: string) {
    if (!this.state.unreadSessionIds.includes(id) && !this.state.sessions.find(item => item.id === id)?.unread) return
    this.unreadRevisions.set(id, ++this.unreadRevision)
    const unreadIds = this.state.unreadSessionIds.filter(item => item !== id)
    this.update({ unreadSessionIds: unreadIds, sessions: this.state.sessions.map(item => item.id === id ? { ...item, unread: false } : item) })
    if (this.host.setSessionUnread) { try { await this.host.setSessionUnread(id, false) } catch { /* 徽标清除失败不影响会话使用 */ } }
  }
  async create(projectId?: string, isCurrent?: () => boolean) {
    if (this.sideSession || this.state.sessionLoading || isCurrent && !isCurrent()) return false
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
    if (this.sideSession || this.disposed || this.state.session || this.state.sessionLoading || isCurrent && !isCurrent()) return false
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
    this.writeMainPreference('model-selection', selection)
  }
  private writeMainPreference(key: string, value: unknown) { if (!this.sideSession) this.writePreference(key, value) }
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
    let goalCommand: ReturnType<typeof parseMiraGoalCommand>
    try { goalCommand = !references.length && !options?.hasStructuredContext ? parseMiraGoalCommand(text) : undefined }
    catch (error) { this.fail(error); return false }
    if (goalCommand && (planning || session.parentSessionId || goalCommand.action !== 'set')) {
      this.fail(new Error(planning ? '目标模式不能在计划模式中启动，请先关闭计划模式' : session.parentSessionId ? '侧边栏对话不支持目标模式' : '请使用目标详情中的管理操作'))
      return false
    }
    if (planning && session.goal?.status === 'active') { this.fail(new Error('请先暂停当前目标，再开启计划模式')); return false }
    if (goalCommand && this.state.running && options?.delivery && options.delivery !== 'queue') options = { ...options, delivery: 'queue' }
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
          if (generation === this.generation && this.state.session?.id === session.id) this.update({ error: receipt.reason === 'image-model-unsupported' ? '所选模型不支持图片输入，请在模型设置中启用图片能力或切换支持图片的模型' : receipt.reason === 'media-model-unsupported' ? '所选模型不支持附件中的 PDF 或视频，请在模型设置中确认对应能力或切换模型。' : receipt.reason === 'permission-mode-disabled' ? '所选权限已在设置中禁用，请切换权限后重新发送。' : receipt.reason === 'skill-unavailable' ? '引用的技能已停用或不可用，请移除引用后重新选择。' : '当前任务已变化，请重新发送。' })
          return 'retry-required'
        }
        if (session.draftState === 'prepared') {
          if (generation === this.generation && this.state.session?.id === session.id) {
            this.update({ session: { ...this.state.session, draftState: 'accepted' } })
            this.writeMainPreference('active-session', session.id)
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
    if (!id || this.disposed || this.state.sessionLoading) return
    const runId = this.state.session?.activeRun?.id
    if (!runId) return
    const generation = this.generation
    try { await this.host.abortRun(id, runId) }
    catch (error) { if (!this.disposed && generation === this.generation && this.state.session?.id === id && this.state.session.activeRun?.id === runId) this.fail(error) }
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
  get supportsPluginMarket() { return Boolean(this.host.browsePluginMarket && this.host.getPluginMarketDetail && this.host.installMarketPlugin) }
  listPluginMarketplaces() { return this.require('listPluginMarketplaces')() }
  addPluginMarketplace(source: string) { return this.require('addPluginMarketplace')(source) }
  removePluginMarketplace(id: string) { return this.require('removePluginMarketplace')(id) }
  browsePluginMarket(refresh = false) { return this.require('browsePluginMarket')(refresh) }
  getPluginMarketDetail(id: string) { return this.require('getPluginMarketDetail')(id) }
  installMarketPlugin(id: string) { return this.require('installMarketPlugin')(id) }
  registerBeforeNavigation(callback: (reportFailure?: boolean) => Promise<void> | void) {
    this.beforeNavigation.add(callback)
    return () => { this.beforeNavigation.delete(callback) }
  }
  async flushBeforeNavigation(reportFailure = true) {
    try {
      if (this.disposed) throw new Error('Harness 连接已关闭，无法确认工作台保存')
      for (const callback of this.beforeNavigation) await callback(reportFailure)
      if (this.disposed) throw new Error('Harness 连接已关闭，无法确认工作台保存')
    } catch (error) { if (reportFailure) this.fail(error); throw error }
  }
  navigate(path: string, propagateFailure = false) {
    const action = async () => {
      await this.flushBeforeNavigation(!propagateFailure)
      await this.require('navigate')(path)
    }
    return propagateFailure ? action() : this.run(action)
  }
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
  clearError(expected: string) { if (this.state.error === expected) this.update({ error: undefined }) }
  async permission(allowed: boolean, requestId?: string) {
    const request = this.state.permission
    if (requestId && (!request || request.requestId !== requestId)) throw new Error('权限请求已更新，请查看当前确认')
    if (!request) return
    if (this.disposed || this.state.sessionLoading || request.sessionId !== this.activeSessionId) throw new Error('当前任务已更新，请重新查看权限确认')
    const generation = this.generation
    // Transport failures belong to the request card. A late failure must not
    // replace the next task's error or its pending approval.
    await this.host.respondPermission(request.requestId, allowed)
    if (!this.disposed && generation === this.generation && this.activeSessionId === request.sessionId) this.forgetPermission(request.requestId, request.sessionId)
  }
  async confirmPlan(interactionId?: string) {
    const { session, selection } = this.state
    if (this.disposed || session?.pendingInteraction?.kind !== 'plan-review' || session.pendingInteraction.status !== 'waiting' || !selection || interactionId && interactionId !== session.pendingInteraction.id) throw new Error('方案或模型已更新，请重新查看当前方案')
    const generation = this.generation
    await this.host.confirmPlan(session.id, session.pendingInteraction.planId, selection)
    await this.refreshSession(session.id, generation)
  }
  require<T extends keyof PilotHost>(method: T): NonNullable<PilotHost[T]> {
    const handler = this.host[method]
    if (typeof handler !== 'function') throw new Error('当前宿主不支持该操作')
    return handler as NonNullable<PilotHost[T]>
  }
  /** 会话管理操作统一走这里：宿主失败落到 state.error，成功后刷新列表。 */
  private run(action: () => Promise<void>) { return action().catch(error => this.fail(error)) }
  async renameSession(id: string, title: string): Promise<boolean> {
    const generation = this.generation
    try {
      await this.require('renameSession')(id, title)
      this.update({ ...(generation === this.generation ? { error: undefined } : {}), sessions: this.state.sessions.map(session => session.id === id ? { ...session, title } : session), ...(this.state.session?.id === id ? { session: { ...this.state.session, title } } : {}) })
    } catch (error) { if (generation === this.generation) this.fail(error); return false }
    // 已保存的标题不因列表刷新失败而重复提交；刷新错误仍通过现有页面提示呈现。
    try { await this.refreshList(); if (id === this.activeSessionId) await this.refreshSession(id, this.generation, false) } catch (error) { if (generation === this.generation) this.fail(error) }
    return true
  }
  async setSessionPinned(id: string, pinned: boolean) { await this.require('setSessionPinned')(id, pinned); await this.refreshList() }
  setSessionUnread(id: string, unread: boolean) {
    this.unreadRevisions.set(id, ++this.unreadRevision)
    const unreadIds = unread ? [...new Set([...this.state.unreadSessionIds, id])] : this.state.unreadSessionIds.filter(item => item !== id)
    this.update({ unreadSessionIds: unreadIds, sessions: this.state.sessions.map(item => item.id === id ? { ...item, unread } : item) })
    return this.run(async () => { await this.require('setSessionUnread')(id, unread); await this.refreshList() })
  }
  async archiveSession(id: string): Promise<void> {
    const generation = this.generation
    await this.saveBeforeSessionRemoval(id)
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
        this.writeMainPreference('active-session', null)
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
  async refreshRemoteCatalog() {
    const [projects, providers] = await Promise.all([this.host.listProjects(), this.host.listProviders()])
    if (!this.disposed) this.update({ projects, providers, selection: this.availableSelection(this.state.selection, providers) })
    await this.refreshList()
  }
  async refreshCurrent() {
    const id = this.activeSessionId; const generation = this.generation
    if (!id) return
    await this.refreshSession(id, generation, true, true)
    if (generation !== this.generation || id !== this.activeSessionId) return
    const revision = this.permissionRevision
    const [pending, queue] = await Promise.all([this.host.listPendingPermissions(id), this.host.getMessageQueue?.(id)])
    if (generation !== this.generation || id !== this.activeSessionId) return
    if (queue) this.applyQueue(queue)
    if (revision !== this.permissionRevision) return
    for (const [key, request] of this.pendingToolApprovals) if (request.sessionId === id) this.pendingToolApprovals.delete(key)
    pending.forEach(request => this.pendingToolApprovals.set(request.requestId, request))
    const permissions = { ...this.state.pendingPermissions }; if (pending[0]) permissions[id] = pending[0]; else delete permissions[id]
    this.update({ permission: pending[0], pendingPermissions: permissions })
  }
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
  onHarnessControl(listener: (action: MiraHarnessControlAction) => void) { return this.host.onHarnessControl?.(listener) || (() => undefined) }
  publishHarnessControls(state: MiraHarnessControlsState) { this.host.publishHarnessControls?.(state) }
  onFullViewToggle(listener: () => void) { return this.host.onFullViewToggle?.(listener) || (() => undefined) }
  onCommandCenterOpen(listener: (focusRequestId?: string) => void) { return this.host.onCommandCenterOpen?.(listener) || (() => undefined) }
  onCloseContext(callback: () => Promise<boolean>) { return this.host.onCloseContext?.(callback) || (() => undefined) }
  dismissCommandCenterFocus(focusRequestId: string) { return this.host.dismissCommandCenterFocus?.(focusRequestId) ?? false }
  onNavigationCommand(listener: (command: MiraAppNavigationCommand) => void) { return this.host.onNavigationCommand?.(listener) || (() => undefined) }
  onNavigationRestore(listener: (snapshot: MiraAppNavigationSnapshot | undefined) => void) {
    if (this.host.onNavigationRestore) return this.host.onNavigationRestore(listener)
    listener(undefined)
    return () => undefined
  }
  publishNavigationState(state: MiraAppNavigationState) { this.host.publishNavigationState?.(state) }
  onSessionDeleted(listener: (id: string) => void) { this.deletedSessionListeners.add(listener); return () => { this.deletedSessionListeners.delete(listener) } }
  get supportsProjectCreation() { return Boolean(this.host.createProject && this.host.selectProjectDirectories) }
  selectProjectDirectories = () => this.require('selectProjectDirectories')()
  async saveProject(input: HarnessProjectUpdateInput, id?: string) {
    const project = id ? await this.require('updateProject')(id, input) : await this.require('createProject')(input)
    if (this.disposed) return project
    const projects = await this.host.listProjects()
    if (!this.disposed) this.update({ projects })
    return project
  }
  async renameProject(id: string, name: string) {
    await this.require('renameProject')(id, name)
    const projects = await this.host.listProjects()
    if (this.disposed) return
    this.update({ projects })
    await this.refreshList()
    if (this.state.session?.projectId === id) await this.refreshSession(this.state.session.id, this.generation, false)
  }
  /** 宿主移除项目时会一并删除它的任务，这里同步清掉本地会话状态。 */
  async removeProject(id: string) {
    await this.require('removeProject')(id)
    if (this.disposed) return
    this.removeDeletedSessions(this.state.sessions.filter(session => session.projectId === id).map(session => session.id))
    const projects = await this.host.listProjects()
    if (this.disposed) return
    this.update({ projects })
    await this.refreshList()
  }
  async openProject(id: string, target: 'file-manager' | 'terminal' = 'file-manager') { const error = await this.require('openProject')(id, target); if (error) throw new Error(error) }
  async selectProject() {
    const project = await this.require('selectProject')()
    if (!project || this.disposed) return project
    const projects = await this.host.listProjects()
    if (this.disposed) return project
    this.update({ projects })
    await this.refreshList()
    return project
  }
  async createConversation(projectId?: string) {
    if (projectId && !this.state.projects.some(project => project.id === projectId && project.directoryExists)) throw new Error('所选项目目录不可用，请重新选择')
    const session = await this.host.createSession(projectId)
    if (this.disposed) throw new Error('Harness 连接已关闭')
    await this.refreshList()
    return session
  }
  listAutomationTasks() { return this.require('listAutomationTasks')() }
  getAutomationOverview() { return this.require('getAutomationOverview')() }
  getAutomationNextRuns(expression: string, rule?: import('../../../../src/config/automationRepeat').AutomationScheduleRule) { return this.require('getAutomationNextRuns')(expression, rule) }
  saveAutomationTask(input: AutomationTaskInput) { return this.require('saveAutomationTask')(input) }
  setAutomationTaskEnabled(id: string, enabled: boolean) { return this.require('setAutomationTaskEnabled')(id, enabled) }
  deleteAutomationTask(id: string) { return this.require('deleteAutomationTask')(id) }
  deleteAutomationRun(id: string) { return this.require('deleteAutomationRun')(id) }
  listAutomationRuns(id: string, status?: AutomationRunStatus) { return this.require('listAutomationRuns')(id, status) }
  runAutomationNow(id: string) { return this.require('runAutomationNow')(id) }
  retryAutomationRun(id: string) { return this.require('retryAutomationRun')(id) }
  abortAutomationRun(id: string) { return this.require('abortAutomationRun')(id) }
  getHarnessPermissionConfig() { return this.require('getHarnessPermissionConfig')() }
  get supportsPermissionConfig() { return Boolean(this.host.getHarnessPermissionConfig) }
  async restoreSession(id: string) {
    await this.require('restoreSession')(id)
    await this.refreshList()
    if (this.activeSessionId === id) await this.refreshSession(id, this.generation, false)
  }
  async deleteSession(id: string) {
    const requestGeneration = this.generation
    await this.saveBeforeSessionRemoval(id)
    await this.require('deleteSession')(id)
    if (this.disposed) return
    const selectReplacement = this.splitPrimarySessionId !== id && requestGeneration === this.generation
    const wasActive = this.removeDeletedSessions([id])
    const generation = this.generation
    await this.refreshList()
    if (wasActive && selectReplacement && generation === this.generation && !this.disposed) {
      if (this.state.sessions[0]) await this.open(this.state.sessions[0].id)
    }
  }
  private async saveBeforeSessionRemoval(id: string) {
    if (this.activeSessionId !== id && !this.isSessionVisible(id)) return
    try { await this.flushBeforeNavigation(false) }
    catch (error) {
      const detail = error instanceof Error && error.message !== '平台调用失败' ? ` ${error.message}` : ''
      throw new Error(`操作前未能保存工作台，任务和当前输入已保留；请重试。${detail}`)
    }
  }
  private removeDeletedSessions(ids: readonly string[]) {
    const deleted = new Set(ids)
    const wasActive = Boolean(this.activeSessionId && deleted.has(this.activeSessionId))
    if (wasActive) {
      if (!this.loadingSessionId || deleted.has(this.loadingSessionId)) this.newConversation()
      else {
        // Removal of the old owner must not cancel a newer guarded load.
        this.activeSessionId = undefined
        this.snapshotVersion++; this.permissionRevision++; this.livePartKeys.clear()
        this.update({ session: undefined, messages: [], running: false, openingProjectDirectory: false, permission: undefined, memoryConfirmation: undefined, queue: undefined, queueError: undefined })
        this.writeMainPreference('active-session', null)
      }
    }
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
  async moveSession(id: string, projectId?: string) {
    const generation = this.generation
    try {
      await this.require('moveSession')(id, projectId)
      await this.refreshList()
      if (generation === this.generation && id === this.activeSessionId) await this.refreshSession(id, generation, false)
    } catch (error) { if (generation === this.generation && !this.disposed) this.fail(error) }
  }
  async reorderSessions(scope: HarnessSessionOrderScope, ids: string[]) {
    const previous = this.state.sessions
    const positions = new Map(ids.map((id, index) => [id, index]))
    const ordered = [...previous].sort((left, right) => (positions.get(left.id) ?? ids.length) - (positions.get(right.id) ?? ids.length))
    this.update({ sessions: ordered })
    try { await this.require('reorderSessions')(scope, ids); await this.refreshList(); return true }
    catch (error) { if (this.state.sessions === ordered) this.update({ sessions: previous }); this.fail(error); return false }
  }
  reorderProjects(ids: string[]) {
    const previous = this.state.projects
    const positions = new Map(ids.map((id, index) => [id, index]))
    const ordered = [...previous].sort((left, right) => (positions.get(left.id) ?? ids.length) - (positions.get(right.id) ?? ids.length))
    this.update({ projects: ordered })
    return this.run(async () => {
      try { await this.require('reorderProjects')(ids); this.update({ projects: await this.host.listProjects() }) }
      catch (error) { if (this.state.projects === ordered) this.update({ projects: previous }); throw error }
    })
  }
  setSessionPermission(id: string, mode: PermissionMode) { return this.run(async () => { await this.require('setSessionPermission')(id, mode); await this.refreshList(); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  remoteControl = (action: import('../../../../src/config/miraRemote').MiraRemoteAction, id?: string) => this.require('remoteControl')(action, id)
  setSessionSkills(id: string, skillIds: string[]) { return this.run(async () => { await this.require('setSessionSkills')(id, skillIds); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  setSessionMcpServers(id: string, serverIds: string[]) { return this.run(async () => { await this.require('setSessionMcpServers')(id, serverIds); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  setSessionDelegation(id: string, enabled: boolean) { return this.run(async () => { await this.require('setSessionDelegation')(id, enabled); if (id === this.activeSessionId) await this.refreshSession(id, this.generation) }) }
  listSkills() { return this.require('listSkills')() }
  get supportsPromptHistory() { return Boolean(this.host.listPromptHistory) }
  listPromptHistory(scope: { sessionId?: string; projectId?: string }) { return this.require('listPromptHistory')(scope) }
  get supportsPlugins() { return Boolean(this.host.listPluginCatalog) }
  listPluginCatalog(sessionId?: string) { return this.require('listPluginCatalog')(sessionId) }
  get supportsPromptCommands() { return Boolean(this.host.listPromptCommands) }
  listPromptCommands(scope: { projectId?: string; sessionId?: string }) { return this.require('listPromptCommands')(scope) }
  get supportsUserAgents() { return Boolean(this.host.listUserAgents) }
  listUserAgents(scope: { projectId?: string; sessionId?: string }) { return this.require('listUserAgents')(scope) }
  listPlugins() { return this.require('listPlugins')() }
  importLocalPlugin() { return this.require('importLocalPlugin')() }
  setPluginEnabled(id: string, enabled: boolean) { return this.require('setPluginEnabled')(id, enabled) }
  removePlugin(id: string) { return this.require('removePlugin')(id) }
  listMcp(sessionId?: string, projectId?: string) { return projectId !== undefined ? this.require('listMcp')(sessionId, projectId) : this.require('listMcp')(sessionId ?? this.state.session?.id) }
  get supportsMcpReconnect() { return Boolean(this.host.reconnectMcp) }
  reconnectMcp(id: string) { return this.require('reconnectMcp')(id) }
  selectFiles() {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.require('selectFiles')(id)
  }
  get supportsAttachments() { return Boolean(this.host.importAttachments && this.host.getAttachment && this.host.selectAttachments) }
  get supportsLocalAttachmentPaths() { return Boolean(this.host.resolveAttachmentPaths) }
  get supportsFileRewindPreview() { return Boolean(this.host.previewFileRewind) }
  previewFileRewind(sessionId: string, messageId: string) { return this.require('previewFileRewind')(sessionId, messageId) }
  get supportsFileRewindApply() { return Boolean(this.host.applyFileRewind && this.host.recoverFileRewind) }
  async applyFileRewind(sessionId: string, messageId: string, snapshotToken: string) {
    const generation = this.generation
    const result = await this.require('applyFileRewind')(sessionId, messageId, snapshotToken)
    if (!this.disposed) try { await this.refreshList(); if (generation === this.generation && sessionId === this.activeSessionId) await this.refreshSession(sessionId, generation, false) }
    catch { this.reportError('文件恢复结果已保存，列表刷新失败，请重新打开任务。') }
    return result
  }
  async recoverFileRewind(sessionId: string, recoveryId: string) {
    const generation = this.generation
    const result = await this.require('recoverFileRewind')(sessionId, recoveryId)
    if (!this.disposed) try { await this.refreshList(); if (generation === this.generation && sessionId === this.activeSessionId) await this.refreshSession(sessionId, generation, false) }
    catch { this.reportError('文件恢复结果已保存，列表刷新失败，请重新打开任务。') }
    return result
  }
  importAttachments(id: string, files: Array<{ name: string; mediaType: string; data: string }>) { return this.require('importAttachments')(id, files) }
  getAttachment(id: string, path: string) { return this.require('getAttachment')(id, path) }
  get supportsAttachmentSave() { return Boolean(this.host.saveAttachment) }
  saveAttachment(id: string, path: string) { return this.require('saveAttachment')(id, path) }
  stageAttachment(id: string, path: string) { return this.require('stageAttachment')(id, path) }
  selectAttachments(id: string, files?: File[]) { return this.require('selectAttachments')(id, files) }
  resolveAttachmentPaths(files: File[]) { return this.require('resolveAttachmentPaths')(files) }
  listGitBranches(projectId: string) { return this.require('listGitBranches')(projectId) }
  generateGitMessage(projectId: string, token: string, includeUnstaged: boolean) {
    if (!this.state.selection) throw new Error('请先选择生成提交消息的模型')
    return this.require('generateGitMessage')(projectId, token, includeUnstaged, this.state.selection)
  }
  get supportsGitTools() { return Boolean(this.host.getGitTools && this.host.gitAction && this.host.getGitGraph) }
  getGitTools(projectId: string) { return this.require('getGitTools')(projectId) }
  getGitGraph(projectId: string, skip = 0) { return this.require('getGitGraph')(projectId, skip) }
  gitAction(projectId: string, action: MiraGitAction, token: string, message: string, includeUnstaged: boolean) { return this.require('gitAction')(projectId, action, token, message, includeUnstaged) }
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
  commandAction(sessionId: string, runId: string, toolId: string, action: 'background' | 'stop') {
    return this.require(action === 'background' ? 'backgroundCommand' : 'stopCommand')(sessionId, runId, toolId)
  }
  async rerun(): Promise<void> {
    await this.restartMessage((session, selection) => this.require('rerun')(session.id, selection))
  }
  editAndRerun(messageId: string, content: string, references?: HarnessFileReference[], workspace?: MiraHistoryEditWorkspace, onBlocked?: (result: MiraHistoryEditBlocked) => void): Promise<boolean> {
    if (!this.canRestartMessage()) return Promise.resolve(false)
    const session = this.state.session
    const generation = this.generation
    return new Promise(resolve => {
      let settled = false
      const settle = (accepted: boolean) => { if (settled) return; settled = true; unsubscribe(); this.pendingEditSettlements.delete(settle); resolve(accepted) }
      // IPC 会等待整轮生成；只有新运行中的权威消息确实保存了编辑内容，才提前关闭编辑器。
      const unsubscribe = this.subscribe(() => {
        const current = this.state.session
        if (this.generation !== generation || current?.id !== session?.id) { settle(false); return }
        if (current?.activeRun && current.activeRun.id !== session?.activeRun?.id && current.messages.some(message => message.id === messageId && message.role === 'user' && message.content === content.trim() && (references === undefined || JSON.stringify(message.attachments?.map(file => file.path) ?? []) === JSON.stringify(references.map(file => file.path))))) settle(true)
      })
      this.pendingEditSettlements.add(settle)
      void this.restartMessage((session, selection) => workspace === undefined ? this.require('editAndRerun')(session.id, messageId, content, selection, references) : this.require('editAndRerun')(session.id, messageId, content, selection, references, workspace), result => { if (generation === this.generation && this.state.session?.id === session?.id) onBlocked?.(result) }).then(settle, error => { if (generation === this.generation) this.fail(error); settle(false) })
    })
  }
  private canRestartMessage() {
    if (this.disposed || this.state.sessionLoading || this.state.running || this.state.permission || this.state.queue?.items.length || this.state.session?.pendingInteraction?.status === 'waiting') return false
    if (!this.state.session || !this.state.selection) { this.fail(new Error('尚未选择任务或模型')); return false }
    return true
  }
  private async restartMessage(action: (session: HarnessSession, selection: ModelSelection) => Promise<void | MiraHistoryEditBlocked>, onBlocked?: (result: MiraHistoryEditBlocked) => void): Promise<boolean> {
    if (!this.canRestartMessage()) return false
    const session = this.state.session!, selection = this.state.selection!
    const generation = this.generation
    this.update({ running: true, error: undefined })
    let accepted = true
    try { const result = await action(session, selection); if (result?.disposition === 'blocked') { accepted = false; onBlocked?.(result) } }
    catch (error) { accepted = false; if (generation === this.generation) this.fail(error) }
    await this.refreshSession(session.id, generation)
    return accepted
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
  async answerQuestion(answers: HarnessUserAnswer[], interactionId?: string) {
    const { session, selection } = this.state
    if (this.disposed || session?.pendingInteraction?.kind !== 'question' || session.pendingInteraction.status !== 'waiting' || !selection || interactionId && interactionId !== session.pendingInteraction.id) throw new Error('问题或模型已更新，请重新查看当前问题')
    const generation = this.generation
    await this.host.answerInteraction(session.id, session.pendingInteraction.id, answers, selection)
    await this.refreshSession(session.id, generation)
  }
  listFiles(path = '') {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.listFiles(id, path)
  }
  listFilesFor(sessionId: string, path = '') { return this.host.listFiles(sessionId, path) }
  listProjectFiles(projectId: string, path = '', rootPath?: string) { return this.host.listProjectFiles?.(projectId, path, rootPath) ?? Promise.reject(new Error('当前宿主不支持项目文件浏览')) }
  searchProjectFiles(projectId: string, query: string, refresh = false, rootPath?: string) { return this.host.searchProjectFiles?.(projectId, query, refresh, rootPath) ?? Promise.reject(new Error('当前宿主不支持项目文件搜索')) }
  get supportsProjectWorkspaceGit() { return Boolean(this.host.getProjectWorkspaceGit && this.host.getProjectWorkspaceIgnored) }
  getProjectWorkspaceGit(projectId: string, rootPath?: string) { return this.host.getProjectWorkspaceGit?.(projectId, rootPath) ?? Promise.reject(new Error('当前宿主不支持项目 Git 状态')) }
  getProjectWorkspaceIgnored(projectId: string, paths: string[], rootPath?: string) { return this.host.getProjectWorkspaceIgnored?.(projectId, paths, rootPath) ?? Promise.reject(new Error('当前宿主不支持项目 Git 忽略状态')) }
  get supportsWorkspaceGit() { return Boolean(this.host.getWorkspaceGit && this.host.getWorkspaceIgnored) }
  getWorkspaceGitFor(sessionId: string) { return this.host.getWorkspaceGit?.(sessionId) ?? Promise.resolve({ available: false, entries: [] } as HarnessWorkspaceGitSnapshot) }
  getWorkspaceIgnoredFor(sessionId: string, paths: string[]) { return this.host.getWorkspaceIgnored?.(sessionId, paths) ?? Promise.resolve([]) }
  searchFilesFor(sessionId: string, query: string, refresh = false): Promise<HarnessWorkspaceFileSearchResult> {
    return this.host.searchFiles ? this.host.searchFiles(sessionId, query, refresh) : Promise.reject(new Error('当前宿主不支持工作目录搜索'))
  }
  get supportsProjectWorkspaceWatch() { return Boolean(this.host.watchProjectFiles && this.host.unwatchProjectFiles) }
  watchProjectFiles(projectId: string, rootPath: string, paths: string[]) { return this.require('watchProjectFiles')(projectId, rootPath, paths) }
  unwatchProjectFiles(projectId: string, rootPath: string, watchId: string) { return this.require('unwatchProjectFiles')(projectId, rootPath, watchId) }
  get supportsWorkspaceWatch() { return Boolean(this.host.watchFiles && this.host.unwatchFiles) }
  watchFilesFor(sessionId: string, paths: string[]) {
    return this.host.watchFiles ? this.host.watchFiles(sessionId, paths) : Promise.reject(new Error('当前宿主不支持文件自动刷新'))
  }
  unwatchFilesFor(sessionId: string, watchId: string) { return this.host.unwatchFiles?.(sessionId, watchId) ?? Promise.resolve() }
  getWorkspaceHtmlUrl(scope: { projectId: string; rootPath?: string } | { sessionId: string }, path: string) { return this.require('getWorkspaceHtmlUrl')(scope, path) }
  revealWorkspaceFile(scope: { projectId: string; rootPath?: string } | { sessionId: string }, path: string) { return this.require('revealWorkspaceFile')(scope, path) }
  listEditors(refresh = false) { return this.host.listEditors?.(refresh) ?? Promise.resolve([]) }
  openProjectFileInEditor(projectId: string, path: string, editorId: string, rootPath?: string) { return this.require('openProjectFileInEditor')(projectId, path, editorId, rootPath) }
  openFileInEditorFor(sessionId: string, path: string, editorId: string) { return this.host.openFileInEditor ? this.host.openFileInEditor(sessionId, path, editorId) : Promise.reject(new Error('当前宿主不支持外部编辑器')) }
  onWorkspaceFilesChanged = (listener: (event: PilotWorkspaceFileEvent) => void) => { this.workspaceFileListeners.add(listener); return () => { this.workspaceFileListeners.delete(listener) } }
  readFile(path: string) {
    const id = this.state.session?.id
    if (!id) return Promise.reject(new Error('尚未选择任务'))
    return this.host.readFile(id, path)
  }
  readProjectFile(projectId: string, path: string, rootPath?: string) { return this.require('readProjectFile')(projectId, path, rootPath) }
  readProjectImage(projectId: string, path: string, rootPath?: string) { return this.require('readProjectImage')(projectId, path, rootPath) }
  openProjectMedia(projectId: string, path: string, rootPath?: string) { return this.require('openProjectMedia')(projectId, path, rootPath) }
  readFileFor(sessionId: string, path: string) { return this.host.readFile(sessionId, path) }
  readCommandOutputFor(sessionId: string, runId: string, toolId: string) { return this.require('readCommandOutput')(sessionId, runId, toolId) }
  readModelTraceFor(sessionId: string) { return this.require('readModelTrace')(sessionId) }
  openModelTraceDirectoryFor(sessionId: string) { return this.require('openModelTraceDirectory')(sessionId) }
  getTaskDiagnosticPathsFor(sessionId: string) { return this.require('getTaskDiagnosticPaths')(sessionId) }
  openMediaFor(sessionId: string, path: string) { return this.host.openMedia ? this.host.openMedia(sessionId, path) : Promise.reject(new Error('当前宿主不支持媒体预览')) }
  closeMedia(id: string) { return this.host.closeMedia?.(id) ?? Promise.resolve() }
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
  get canPasteTerminal() { return Boolean(this.host.pasteTerminal) }
  pasteTerminalFor(sessionId: string, terminalId: string, bracketed: boolean) { return this.host.pasteTerminal ? this.host.pasteTerminal(sessionId, terminalId, bracketed) : Promise.reject(new Error('当前宿主不支持终端粘贴')) }
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
  navigateBrowserFor(id: string, url: string, bounds: HarnessBrowserBounds, browserId?: string, visible?: boolean) { return browserId ? this.host.navigateBrowser(id, url, bounds, browserId, visible) : this.host.navigateBrowser(id, url, bounds) }
  setBrowserBounds(bounds: HarnessBrowserBounds) {
    const id = this.state.session?.id
    return id ? this.setBrowserBoundsFor(id, bounds) : Promise.resolve()
  }
  setBrowserBoundsFor(id: string, bounds: HarnessBrowserBounds, browserId?: string) { return browserId ? this.host.setBrowserBounds(id, bounds, browserId) : this.host.setBrowserBounds(id, bounds) }
  setBrowserViewportFor(id: string, presentation: HarnessBrowserPresentation, browserId?: string) { return this.require('setBrowserViewport')(id, presentation, browserId) }
  pickBrowserElementFor(id: string, action: 'start' | 'cancel', browserId: string) { return this.require('pickBrowserElement')(id, action, browserId) }
  browserProtectedFor(id: string, browserId: string) { return this.require('browserProtected')(id, browserId) }
  controlBrowser(action: 'back' | 'forward' | 'reload' | 'devtools' | 'hide' | 'show' | 'close') {
    const id = this.state.session?.id
    return id ? this.controlBrowserFor(id, action) : Promise.resolve()
  }
  controlBrowserFor(id: string, action: 'back' | 'forward' | 'reload' | 'devtools' | 'hide' | 'show' | 'close', browserId?: string) { return browserId ? this.host.controlBrowser(id, action, browserId) : this.host.controlBrowser(id, action) }
  openBrowserExternalFor(id: string, url: string, browserId?: string) { return this.require('openBrowserExternal')(id, url, browserId) }
  closeBrowserFor(id: string, browserId?: string) { return this.controlBrowserFor(id, 'close', browserId) }
  onBrowserOpen = (listener: (event: HarnessEvent) => void) => this.host.onEvent(event => { if (!this.disposed && event.type === 'browser-open') listener(event) })
  onBrowserEvent = (listener: (event: PilotBrowserEvent) => void) => this.host.onBrowserEvent(listener)
  onTerminalEvent = (listener: (event: HarnessEvent) => void) => { this.terminalListeners.add(listener); return () => { this.terminalListeners.delete(listener) } }
  private refreshList = async () => {
    const runningRevision = this.runningRevision
    const unreadRevision = this.unreadRevision
    const sessions = await this.host.listSessions()
    this.applySessionList(sessions, runningRevision, unreadRevision)
  }
  private applySessionList(sessions: HarnessSessionSummary[], revision: number, unreadRevision: number) {
    sessions = sessions.map(session => (this.unreadRevisions.get(session.id) ?? 0) > unreadRevision ? { ...session, unread: Boolean(this.state.sessions.find(item => item.id === session.id)?.unread) } : session)
    const runningIds = new Set(this.state.runningSessionIds)
    for (const session of sessions) {
      if (session.isRunning === undefined || (this.runningRevisions.get(session.id) ?? 0) > revision) continue
      if (session.isRunning) runningIds.add(session.id)
      else runningIds.delete(session.id)
    }
    this.update({ sessions, runningSessionIds: [...runningIds] })
    // The Vue shell also persists completion badges; reconcile them with actual pane visibility.
    if (this.visibleSessionIds) for (const id of this.visibleSessionIds) void this.markSessionRead(id)
  }
  private async refreshSession(id: string, generation: number, replaceMessages = true, confirmedRunChange = false) {
    if (generation !== this.generation || id !== this.activeSessionId || this.disposed) return
    const version = ++this.snapshotVersion
    try {
      const session = await this.host.getSession(id)
      if (generation !== this.generation || version !== this.snapshotVersion || this.disposed) return
      const previousGoal = this.state.session?.id === id ? this.state.session.goal : undefined
      if (session.goal && this.retiredGoalIds.has(session.goal.id)) session.goal = this.state.session?.goal
      if (previousGoal && session.goal?.id === previousGoal.id && session.goal.revision < previousGoal.revision) session.goal = previousGoal
      if (previousGoal && !session.goal) this.retiredGoalIds.add(previousGoal.id)
      if (!confirmedRunChange && !this.reconcileSnapshotRun(session)) return
      const eventRun = this.eventRuns.get(id)
      // 宿主明确拒绝旧运行身份后，读取最新权威运行；普通流式快照仍保持原游标保护。
      if (!confirmedRunChange && eventRun && !eventRun.closed && this.state.running && session.activeRun?.id !== eventRun.id) return
      if (!confirmedRunChange && eventRun?.messageId && session.activeRun?.id === eventRun.id && session.activeRun.messageId !== eventRun.messageId) return
      if (eventRun?.closed && session.activeRun?.id === eventRun.id) return
      if (confirmedRunChange && eventRun && session.activeRun?.id !== eventRun.id) eventRun.closed = true
      if (confirmedRunChange && eventRun && session.activeRun?.id === eventRun.id) eventRun.messageId = session.activeRun.messageId
      this.captureRun(session)
      const previousTools = this.state.session?.id === id ? this.state.session.toolCalls : []
      const previousCommands = new Map<string, ToolCallRecord | null>()
      for (const tool of previousTools) if (!tool.inherited && tool.tool === 'bash' && tool.runId) {
        const key = JSON.stringify([tool.runId, tool.id])
        previousCommands.set(key, previousCommands.has(key) ? null : tool)
      }
      session.toolCalls = session.toolCalls.map(tool => {
        const previous = !tool.inherited && tool.tool === 'bash' && tool.runId ? previousCommands.get(JSON.stringify([tool.runId, tool.id])) : undefined
        return previous?.commandJob && tool.commandJob && previous.commandJob.revision > tool.commandJob.revision ? { ...tool, commandJob: previous.commandJob } : tool
      })
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
  private applyToolRecord(event: HarnessEvent) {
    const session = this.state.session
    const patch = event.payload as Partial<ToolCallRecord>
    if (!session || session.id !== event.sessionId || typeof patch.id !== 'string' || !patch.id) return true
    const runId = event.runId ?? patch.runId
    if (event.runId && patch.runId && patch.runId !== event.runId) return false
    const index = session.toolCalls.findIndex(tool => tool.id === patch.id)
    const previous = session.toolCalls[index]
    if (previous?.runId && runId && previous.runId !== runId) return false
    // Older hosts can send only a patch; keep their authoritative snapshot fallback.
    if (!previous && (typeof patch.tool !== 'string' || !Number.isFinite(patch.createdAt) || !['running', 'waiting-confirm', 'ok', 'failed', 'cancelled'].includes(String(patch.status)))) return true
    if (previous && ['ok', 'failed', 'cancelled'].includes(previous.status) && ['running', 'waiting-confirm'].includes(String(patch.status))) return false
    const tool = { ...previous, ...patch, ...(runId ? { runId } : {}) } as ToolCallRecord
    const toolCalls = [...session.toolCalls]
    if (previous) toolCalls[index] = tool
    else toolCalls.push(tool)
    this.update({ session: { ...session, toolCalls } })
    return true
  }
  private settleToolPermission(event: HarnessEvent) {
    const { id, status, approvalRequestId } = event.payload
    const runId = event.runId ?? event.payload.runId
    if (!['ok', 'failed', 'cancelled'].includes(String(status)) || typeof id !== 'string' || typeof approvalRequestId !== 'string' || typeof runId !== 'string') return
    if (event.payload.runId !== undefined && event.payload.runId !== runId) return
    const matches = (request: HarnessPermissionRequest | undefined) => Boolean(request && request.sessionId === event.sessionId && request.requestId === approvalRequestId && request.toolCallId === id && request.runId === runId)
    if (!matches(this.pendingToolApprovals.get(approvalRequestId)) && !matches(this.state.permission) && !matches(this.state.pendingPermissions[event.sessionId])) return
    this.forgetPermission(approvalRequestId, event.sessionId)
  }
  private forgetPermission(requestId: string, sessionId: string) {
    this.pendingToolApprovals.delete(requestId)
    const next = [...this.pendingToolApprovals.values()].find(request => request.sessionId === sessionId)
    this.permissionRevision++
    const pendingPermissions = { ...this.state.pendingPermissions }
    if (next) pendingPermissions[sessionId] = next
    else delete pendingPermissions[sessionId]
    this.update({ pendingPermissions, ...(this.activeSessionId === sessionId && (!this.state.permission || this.state.permission.requestId === requestId) ? { permission: next } : {}) })
  }
  private handleEvent = (event: HarnessEvent) => {
    if (event.type === 'session-activity-changed') {
      // A released workflow changes aggregate session activity, not the main reply cursor.
      // Invalidate in-flight lists captured while that workflow still owned the session.
      this.runningRevisions.set(event.sessionId, ++this.runningRevision)
      void this.refreshList().catch(error => this.fail(error))
      return
    }
    if (event.type === 'command-job') {
      if (event.sessionId !== this.activeSessionId || !this.state.session) return
      const { id, runId, commandJob } = event.payload
      const tools = this.state.session.toolCalls.filter(tool => tool.id === id && tool.runId === runId && tool.tool === 'bash' && !tool.inherited)
      if (tools.length !== 1 || runId !== event.runId || !commandJob || typeof commandJob !== 'object') return
      const job = commandJob as NonNullable<ToolCallRecord['commandJob']>
      if (!Number.isSafeInteger(job.revision) || !['foreground', 'background'].includes(job.mode) || !['running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(job.status) || tools[0].commandJob && (job.revision <= tools[0].commandJob.revision || tools[0].commandJob.status !== 'running')) return
      this.update({ session: { ...this.state.session, toolCalls: this.state.session.toolCalls.map(tool => tool === tools[0] ? { ...tool, commandJob: job } : tool) } })
      return
    }
    if (event.type === 'goal-updated') {
      if (event.sessionId !== this.activeSessionId) return
      const goal = event.payload.goal as HarnessGoal | null | undefined
      if (goal) this.applyGoal(event.sessionId, goal)
      else if (goal === null) void this.refreshSession(event.sessionId, this.generation)
      return
    }
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
    if (event.type === 'task-changes') {
      void this.refreshList().catch(error => this.fail(error))
      if (event.sessionId === this.activeSessionId) void this.refreshSession(event.sessionId, this.generation, false)
      return
    }
    if (!this.acceptRunEvent(event)) return
    if (event.type === 'tool-call' && event.sessionId === this.activeSessionId && !this.applyToolRecord(event)) return
    if (event.type === 'tool-call') this.settleToolPermission(event)
    if (event.type === 'status' && ['idle', 'completed', 'failed', 'stopped'].includes(String(event.payload.state))) {
      for (const request of [...this.pendingToolApprovals.values()]) if (request.sessionId === event.sessionId && (!request.runId || request.runId === event.runId)) this.forgetPermission(request.requestId, event.sessionId)
    }
    if (event.type === 'status' || event.type === 'run-start') this.applyStatusBadge(event.sessionId, event.type === 'run-start' ? 'running' : String(event.payload.state || ''), event.sessionId !== this.activeSessionId, event.runId)
    if (event.type === 'title-updated' && typeof event.payload.title === 'string' && event.payload.title) {
      const title = event.payload.title
      this.update({
        sessions: this.state.sessions.map(session => session.id === event.sessionId ? { ...session, title } : session),
        ...(this.state.session?.id === event.sessionId ? { session: { ...this.state.session, title } } : {}),
      })
    }
    if (event.type === 'status' || event.type === 'title-updated') void this.refreshList().catch(error => this.fail(error))
    if (event.type === 'permission-request' && typeof event.payload.requestId === 'string') {
      const request: HarnessPermissionRequest = { sessionId: event.sessionId, requestId: event.payload.requestId, title: String(event.payload.title || '请求权限'), detail: String(event.payload.detail || ''), ...(typeof event.payload.toolCallId === 'string' ? { toolCallId: event.payload.toolCallId } : {}), ...(typeof event.payload.runId === 'string' ? { runId: event.payload.runId } : event.runId ? { runId: event.runId } : {}), ...(event.payload.workflowReview ? { workflowReview: event.payload.workflowReview as HarnessPermissionRequest['workflowReview'] } : {}) }
      if (!this.workflowEventRuns.has(request.runId || '')) for (const [key, previous] of this.pendingToolApprovals) {
        if (previous.sessionId === request.sessionId && !this.workflowEventRuns.has(previous.runId || '')) this.pendingToolApprovals.delete(key)
      }
      this.pendingToolApprovals.set(request.requestId, request)
      const first = this.workflowEventRuns.has(request.runId || '') ? [...this.pendingToolApprovals.values()].find(item => item.sessionId === event.sessionId)! : request
      this.permissionRevision++
      if (event.sessionId === this.activeSessionId) this.update({ permission: first, pendingPermissions: { ...this.state.pendingPermissions, [event.sessionId]: first } })
      else this.update({ pendingPermissions: { ...this.state.pendingPermissions, [event.sessionId]: first } })
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
      const model = event.payload.model as HarnessMessage['model']
      const activeRun = session && event.runId ? session.activeRun?.id === event.runId ? { ...session.activeRun, ...(model ? { model } : {}) } : {
        id: event.runId,
        ...(model ? { model } : {}),
        ...(event.payload.kind === 'context-compaction' ? { kind: 'context-compaction' as const } : {}),
        ...(typeof event.payload.messageId === 'string' ? { messageId: event.payload.messageId } : {}),
        startedAt: typeof event.payload.startedAt === 'number' ? event.payload.startedAt : event.occurredAt || Date.now(),
        activities: [], subtasks: [],
      } : undefined
      this.update({ running: true, error: undefined, ...(session && activeRun ? { session: { ...session, activeRun } } : {}) })
      void this.refreshSession(event.sessionId, generation)
    }
    if (event.type === 'error') {
      const diagnostic = event.payload.modelError as MiraModelError | undefined
      const modelError = diagnostic?.code === 'MODEL_REQUEST_FAILED' && typeof diagnostic.message === 'string' && typeof diagnostic.detail === 'string' ? diagnostic : undefined
      this.update({ error: String(event.payload.message || '任务执行失败'), modelError })
    }
    if (event.type === 'run-activity' || event.type === 'tool-call') void this.refreshSession(event.sessionId, generation, false)
    if (event.type === 'message-complete' || event.type === 'interaction-created' || event.type === 'interaction-resolved' || event.type === 'plan-updated' || event.type === 'status' && event.payload.state !== 'running') {
      if (event.type === 'status' && event.payload.state !== 'running') {
        const clearsPermission = !this.state.permission?.runId || this.state.permission.runId === event.runId
        if (clearsPermission) this.permissionRevision++
        this.update({ running: false, ...(clearsPermission ? { permission: undefined } : {}) })
      }
      void this.refreshSession(event.sessionId, generation)
    }
  }
  private applyQueue(queue: HarnessMessageQueueSnapshot) {
    if (this.disposed || (this.queues.get(queue.sessionId)?.revision ?? -1) >= queue.revision) return
    this.queues.set(queue.sessionId, queue)
    this.update({ promptHistoryRevision: (this.state.promptHistoryRevision ?? 0) + 1, ...(queue.sessionId === this.activeSessionId && !this.state.sessionLoading ? { queue, queueError: undefined } : {}) })
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
    const workflowType = event.type === 'workflow-event' && event.payload.event && typeof event.payload.event === 'object' ? (event.payload.event as { type?: unknown }).type : undefined
    // Background workflows share the task, but never own its ordinary message cursor.
    if (event.type === 'workflow-event') {
      if (!event.runId || event.payload.runId !== event.runId || typeof workflowType !== 'string') return false
      if (!this.workflowEventRuns.has(event.runId)) this.workflowEventRuns.set(event.runId, { sessionId: event.sessionId, sequence: -1 })
      if (this.workflowEventRuns.size > 256) this.workflowEventRuns.delete(this.workflowEventRuns.keys().next().value!)
    }
    const workflow = event.runId ? this.workflowEventRuns.get(event.runId) : undefined
    const pending = this.state.pendingPermissions[event.sessionId]
    const settlesPending = event.type === 'tool-call' && pending && pending.runId === event.runId && pending.toolCallId === event.payload.id && pending.requestId === event.payload.approvalRequestId && ['ok', 'failed', 'cancelled'].includes(String(event.payload.status))
    if (workflow && workflow.sessionId === event.sessionId) {
      if (!['workflow-event', 'tool-call', 'permission-request', 'error'].includes(event.type)) return false
      if (workflow.settled && (event.type === 'permission-request' || event.type === 'tool-call' && !['ok', 'failed', 'cancelled'].includes(String(event.payload.status)))) return false
      if (typeof event.sequence === 'number') {
        if (event.sequence <= workflow.sequence) return false
        workflow.sequence = event.sequence
      }
      if (workflowType === 'run-settled') workflow.settled = true
      if (workflowType === 'run-started') workflow.settled = false
    } else if (event.runId && !settlesPending) {
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
  private applyStatusBadge(sessionId: string, state: string, isBackground: boolean, runId?: string) {
    this.runningRevisions.set(sessionId, ++this.runningRevision)
    const running = state === 'running' || state === 'rendering'
    const terminal = state === 'completed' || state === 'failed' || state === 'stopped'
    const runningIds = new Set(this.state.runningSessionIds)
    const unreadIds = new Set(this.state.unreadSessionIds)
    if (running) runningIds.add(sessionId)
    else runningIds.delete(sessionId)
    const visible = this.isSessionVisible(sessionId)
    if (terminal && !visible) unreadIds.add(sessionId)
    if (visible) {
      void this.markSessionRead(sessionId)
      unreadIds.delete(sessionId)
    }
    const pendingPermissions = { ...this.state.pendingPermissions }
    if (!running && isBackground && (!pendingPermissions[sessionId]?.runId || pendingPermissions[sessionId]?.runId === runId)) delete pendingPermissions[sessionId]
    this.update({ runningSessionIds: [...runningIds], unreadSessionIds: [...unreadIds], pendingPermissions })
  }
  private fail(error: unknown) { this.update({ error: error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : '操作失败' }) }
  dispose() { this.disposed = true; this.generation++; this.snapshotVersion++; this.pendingEditSettlements.forEach(settle => settle(false)); this.pendingEditSettlements.clear(); this.unsubscribeDeleted?.(); this.unsubscribeDeleted = undefined; this.unsubscribe?.(); this.unsubscribe = undefined; this.terminalListeners.clear(); this.workspaceFileListeners.clear(); this.beforeNavigation.clear(); this.deletedSessionListeners.clear(); this.listeners.clear() }
}
