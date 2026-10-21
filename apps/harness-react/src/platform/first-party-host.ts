import type { HarnessProjectUpdateInput } from '../../../../src/config/harness'
import type { MiraGitSnapshot, MiraGitAction, MiraGitGraph, MiraGitActionResult } from '../../../../src/config/miraGit'
import type { HarnessEvent, HarnessFileReference, HarnessHistoryPage, HarnessHistoryQuery, HarnessPermissionRequest, HarnessProject, HarnessSession, HarnessSessionOrderScope, HarnessSessionSummary, HarnessUserAnswer, HarnessWorkspaceFileEntry, HarnessWorkspaceFileSearchResult, HarnessWorkspaceGitSnapshot, HarnessWorkspaceImagePreview, ModelProviderSummary, ModelSelection, PermissionMode } from '../../../../src/config/harness'
import type { MiraMediaPreview } from '../../../../src/config/miraMedia'
import type { MiraHistoryEditBlocked, MiraHistoryEditWorkspace } from '../../../../src/config/miraFileRewind'
import type { PilotBrowserEvent, PilotHost } from '../state/pilot-state'
import type { MiraPluginItem, MiraPluginMarketCatalog, MiraPluginMarketDetail, MiraPluginMarketItem } from '../../../../src/config/miraPlugins'
import type { HarnessAttachmentSaveResult, HarnessBrowserBounds, HarnessBrowserPresentation } from '../../../../src/platform/firstPartyHarness'
import type { HarnessContextCompactionResult, SendShortcut } from '../../../../src/config/harness'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail, HarnessSkillMarketItem } from '../../../../src/config/harness'
import type { HarnessConversationSearchResult } from '../../../../src/config/harness'
import type { AutomationOverview, AutomationRun, AutomationRunStatus, AutomationTask, AutomationTaskInput, PermissionConfig } from '../../../../src/config/harness'
import type { HarnessGitContext, HarnessMessageQueueSnapshot, HarnessMessageSubmissionOptions, HarnessMessageSubmissionResult, HarnessMessageWithdrawal } from '../../../../src/config/harness'
import { readMiraHarnessControlCommand, type MiraHarnessControlAction, type MiraHarnessControlsState } from '../../../../src/platform/harnessControls'
import { readMiraAppNavigationCommand, readMiraAppNavigationSnapshot, readMiraAppNavigationState, type MiraAppNavigationCommand, type MiraAppNavigationSnapshot, type MiraAppNavigationState } from '../../../../src/platform/appNavigation'
import type { HarnessMessageAttachment } from '../../../../src/config/harness'
import type { HarnessArchivedSnapshot, HarnessArchivedDeletionResult } from '../../../../src/config/harness'
import type { MiraBrowserPickResult } from '../../../../src/platform/miraBrowserPicker'
import type { HarnessGoal } from '../../../../src/config/miraGoals'
import type { MiraFlowWorkbenchRequest } from '../../../../src/config/miraFlowWorkbench'
import type { HarnessSideConversationInput } from '../../../../src/config/harness'

export class FirstPartyHarnessHost implements PilotHost {
  readonly supportsPluginMarket = true
  readonly supportsQueueSubmissionOptions = true
  private sequence = 0
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private listeners = new Set<(event: HarnessEvent) => void>()
  private browserListeners = new Set<(event: PilotBrowserEvent) => void>()
  private controlListeners = new Set<(action: MiraHarnessControlAction) => void>()
  private fullViewListeners = new Set<() => void>()
  private commandCenterListeners = new Set<(focusRequestId?: string) => void>()
  private navigationCommandListeners = new Set<(command: MiraAppNavigationCommand) => void>()
  private navigationRestoreListeners = new Set<(snapshot: MiraAppNavigationSnapshot | undefined) => void>()
  private theme: 'light' | 'dark' = 'light'
  private themeListeners = new Set<() => void>()
  private navigationRestoreReceived = false
  private navigationRestoreSnapshot?: MiraAppNavigationSnapshot
  private prepareLeave?: () => Promise<void>
  private closeContext?: () => Promise<boolean>
  private closed = false

  constructor(private port: MessagePort) {
    port.onmessage = message => {
      if (this.closed) return
      const data = message.data
      if (data?.type === 'mira:context') {
        const theme = data.context?.theme
        if ((theme === 'light' || theme === 'dark') && this.theme !== theme) {
          this.theme = theme; this.themeListeners.forEach(listener => listener())
        }
        return
      }
      if (data?.type === 'mira:app-navigation-command') {
        const command = readMiraAppNavigationCommand(data)
        if (command) this.navigationCommandListeners.forEach(listener => listener(command))
        return
      }
      if (data?.type === 'mira:app-navigation-restore') {
        if (this.navigationRestoreReceived || Array.isArray(data) || !Object.prototype.hasOwnProperty.call(data, 'snapshot') || Object.keys(data).some(key => key !== 'type' && key !== 'snapshot')) return
        const snapshot = readMiraAppNavigationSnapshot(data.snapshot)
        if (data.snapshot !== undefined && !snapshot) return
        this.navigationRestoreReceived = true
        this.navigationRestoreSnapshot = snapshot
        this.navigationRestoreListeners.forEach(listener => listener(snapshot))
        return
      }
      const control = readMiraHarnessControlCommand(data)
      if (control) { this.controlListeners.forEach(listener => listener(control.action)); return }
      if (data?.type === 'mira:full-view-toggle' && Object.keys(data).length === 1) { this.fullViewListeners.forEach(listener => listener()); return }
      if (data?.type === 'mira:command-center-open' && !Array.isArray(data) && Object.keys(data).every(key => key === 'type' || key === 'focusRequestId') && (data.focusRequestId === undefined || typeof data.focusRequestId === 'string' && data.focusRequestId.length > 0 && data.focusRequestId.length <= 128)) { this.commandCenterListeners.forEach(listener => listener(data.focusRequestId)); return }
      if (data?.type === 'mira:prepare-leave' && typeof data.id === 'string') {
        const id = data.id
        void Promise.resolve().then(() => {
          if (!this.prepareLeave || this.closed) throw new Error('Harness 尚未准备好保存草稿')
          return this.prepareLeave()
        }).then(() => this.replyLeave(id, true), error => this.replyLeave(id, false, error))
        return
      }
      if (data?.type === 'mira:close-context' && !Array.isArray(data) && Object.keys(data).length === 2 && typeof data.id === 'string' && data.id.length > 0 && data.id.length <= 128) {
        const id = data.id
        void Promise.resolve().then(() => {
          if (!this.closeContext || this.closed) throw new Error('Harness 尚未准备好关闭，请重试')
          return this.closeContext()
        }).then(consumed => this.replyClose(id, true, consumed), error => this.replyClose(id, false, undefined, error))
        return
      }
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

  onPrepareLeave(callback: () => Promise<void>) { this.prepareLeave = callback }
  remoteControl = (action: import('../../../../src/config/miraRemote').MiraRemoteAction, id?: string) => this.call<import('../../../../src/config/miraRemote').MiraRemoteStatus>('remote.control', { action, id })
  onCloseContext(callback: () => Promise<boolean>) {
    if (!this.closed) this.closeContext = callback
    return () => { if (this.closeContext === callback) this.closeContext = undefined }
  }
  private replyClose(id: string, ok: boolean, consumed?: boolean, error?: unknown) {
    if (this.closed) return
    try { this.port.postMessage({ type: 'mira:close-ready', id, ok, ...(ok ? { consumed } : { error: error instanceof Error ? error.message : '关闭失败，已保留当前窗口' }) }) }
    catch { /* The authorized host has already disconnected. */ }
  }
  private replyLeave(id: string, ok: boolean, error?: unknown) {
    if (this.closed) return
    try { this.port.postMessage({ type: 'mira:leave-ready', id, ok, ...(!ok ? { error: error instanceof Error ? error.message : '草稿保存失败' } : {}) }) }
    catch { /* 宿主已离开，端口无法接收保存确认。 */ }
  }

  createSideConversation = (parentId: string, input?: HarnessSideConversationInput) => this.call<HarnessSession>('session.create-side', { parentId, ...(input ? { input } : {}) })
  requestWorkflow = <T,>(request: MiraFlowWorkbenchRequest) => this.call<T>('workflows.request', { request })
  pauseGoal = (sessionId: string, expectedRevision: number, expectedGoalId: string) => this.call<HarnessGoal>('goal.pause', { sessionId, expectedRevision, expectedGoalId })
  resumeGoal = (sessionId: string, expectedRevision: number, expectedGoalId: string, selection: ModelSelection, permissionMode?: PermissionMode) => this.call<HarnessGoal>('goal.resume', { sessionId, expectedRevision, expectedGoalId, selection, ...(permissionMode ? { permissionMode } : {}) })
  updateGoalBudget = (sessionId: string, tokenBudget: number | null, expectedRevision: number, expectedGoalId: string) => this.call<HarnessGoal>('goal.budget', { sessionId, tokenBudget, expectedRevision, expectedGoalId })
  clearGoal = (sessionId: string, expectedRevision: number, expectedGoalId: string) => this.call<void>('goal.clear', { sessionId, expectedRevision, expectedGoalId })
  forkConversation = (id: string, messageId: string, requestId: string) => this.call<HarnessSession>('session.fork', { id, messageId, requestId })
  compactConversation = (sessionId: string, selection: ModelSelection) => this.call<HarnessContextCompactionResult>('context.compact', { sessionId, selection, submissionId: crypto.randomUUID() })
  listSessions = () => this.call<HarnessSessionSummary[]>('sessions.list')
  getComposerPreferences = () => this.call<{ sendShortcut: SendShortcut; showContextUsage: boolean; followupMode?: 'queue' | 'guide' }>('composer.preferences')
  browseSkillMarket = (refresh = false) => this.call<HarnessSkillMarketCatalog>('marketplace.browse', { refresh })
  getSkillMarketDetail = (id: string) => this.call<HarnessSkillMarketDetail>('marketplace.detail', { id })
  installMarketSkill = (id: string) => this.call<HarnessSkillMarketItem>('marketplace.install', { id })
  listInstalledMarketSkills = () => this.call<HarnessSkillMarketItem[]>('marketplace.installed')
  listPluginMarketplaces = () => this.call<import('../../../../src/config/miraPlugins').MiraPluginMarketplaceSource[]>('plugin-marketplace.sources')
  addPluginMarketplace = (source: string) => this.call<import('../../../../src/config/miraPlugins').MiraPluginMarketplaceSource[]>('plugin-marketplace.add-source', { source })
  removePluginMarketplace = (id: string) => this.call<import('../../../../src/config/miraPlugins').MiraPluginMarketplaceSource[]>('plugin-marketplace.remove-source', { id })
  browsePluginMarket = (refresh = false) => this.call<MiraPluginMarketCatalog>('plugin-marketplace.browse', { refresh })
  getPluginMarketDetail = (id: string) => this.call<MiraPluginMarketDetail>('plugin-marketplace.detail', { id })
  installMarketPlugin = (id: string) => this.call<MiraPluginMarketItem>('plugin-marketplace.install', { id })
  queryHistory = (query: HarnessHistoryQuery) => this.call<HarnessHistoryPage>('sessions.history', query)
  getArchivedSnapshot = () => this.call<HarnessArchivedSnapshot>('sessions.archived-snapshot')
  deleteArchivedSessions = (snapshotId: string) => this.call<HarnessArchivedDeletionResult>('sessions.delete-archived', { snapshotId })
  restoreSession = (id: string) => this.call<void>('session.restore', { id })
  listProjects = () => this.call<HarnessProject[]>('projects.list')
  searchConversations = (query: string) => this.call<HarnessConversationSearchResult[]>('sessions.search', { query })
  renameProject = (id: string, name: string) => this.call<void>('projects.rename', { id, name })
  removeProject = (id: string) => this.call<void>('projects.remove', { id })
  openProject = (projectId: string, target: 'file-manager' | 'terminal' = 'file-manager') => this.call<string>('projects.open', { projectId, target })
  selectProject = () => this.call<HarnessProject | null>('projects.select')
  getTheme = () => this.theme
  onThemeChange = (listener: () => void) => { this.themeListeners.add(listener); return () => { this.themeListeners.delete(listener) } }
  showAbout = () => this.request<void>('about.show')
  updateProject = (id: string, input: HarnessProjectUpdateInput) => this.call<HarnessProject>('projects.update', { id, input })
  createProject = (input: HarnessProjectUpdateInput) => this.call<HarnessProject>('projects.create', { input })
  selectProjectDirectories = () => this.call<string[]>('projects.select-directories')
  openResourceManager = () => this.request<void>('resources.open')
  getAppearance = () => this.request<{ theme: string; zoomFactor: number }>('appearance.get')
  setTheme = (theme: 'system' | 'light' | 'dark') => this.request<{ theme: string; zoomFactor: number }>('appearance.set-theme', { theme })
  zoom = (action: 'zoomIn' | 'zoomOut' | 'resetZoom') => this.request<{ theme: string; zoomFactor: number }>('appearance.zoom', { action })
  toggleTheme = () => this.request<'light' | 'dark'>('appearance.toggle-theme', undefined)
  onHarnessControl = (listener: (action: MiraHarnessControlAction) => void) => { this.controlListeners.add(listener); return () => { this.controlListeners.delete(listener) } }
  publishHarnessControls = (state: MiraHarnessControlsState) => { if (!this.closed) this.port.postMessage(state) }
  onFullViewToggle = (listener: () => void) => { this.fullViewListeners.add(listener); return () => { this.fullViewListeners.delete(listener) } }
  onCommandCenterOpen = (listener: (focusRequestId?: string) => void) => { this.commandCenterListeners.add(listener); return () => { this.commandCenterListeners.delete(listener) } }
  dismissCommandCenterFocus = (focusRequestId: string) => {
    if (this.closed || !focusRequestId || focusRequestId.length > 128) return false
    try { this.port.postMessage({ type: 'mira:command-center-dismiss', focusRequestId }); return true } catch { return false }
  }
  onNavigationCommand = (listener: (command: MiraAppNavigationCommand) => void) => {
    if (!this.closed) this.navigationCommandListeners.add(listener)
    return () => { this.navigationCommandListeners.delete(listener) }
  }
  onNavigationRestore = (listener: (snapshot: MiraAppNavigationSnapshot | undefined) => void) => {
    if (!this.closed) {
      this.navigationRestoreListeners.add(listener)
      if (this.navigationRestoreReceived) listener(this.navigationRestoreSnapshot)
    }
    return () => { this.navigationRestoreListeners.delete(listener) }
  }
  publishNavigationState = (state: MiraAppNavigationState) => {
    const message = readMiraAppNavigationState(state)
    if (this.closed || !message) return
    try { this.port.postMessage(message) } catch { /* 宿主已离开，导航状态不再发送。 */ }
  }
  listAutomationTasks = () => this.call<AutomationTask[]>('automations.list')
  getAutomationOverview = () => this.call<AutomationOverview>('automations.overview')
  getAutomationNextRuns = (expression: string, rule?: import('../../../../src/config/automationRepeat').AutomationScheduleRule) => this.call<number[]>('automations.next-runs', { expression, rule })
  saveAutomationTask = (input: AutomationTaskInput) => this.call<AutomationTask>('automations.save', { input })
  setAutomationTaskEnabled = (id: string, enabled: boolean) => this.call<AutomationTask>('automations.set-enabled', { id, enabled })
  deleteAutomationTask = (id: string) => this.call<void>('automations.delete', { id })
  deleteAutomationRun = (id: string) => this.call<void>('automations.delete-run', { id })
  listAutomationRuns = (id: string, status?: AutomationRunStatus) => this.call<AutomationRun[]>('automations.runs', { id, status })
  runAutomationNow = (id: string) => this.call<AutomationRun>('automations.run-now', { id })
  retryAutomationRun = (id: string) => this.call<AutomationRun>('automations.retry', { id })
  abortAutomationRun = (id: string) => this.call<void>('automations.abort', { id })
  getHarnessPermissionConfig = () => this.call<PermissionConfig>('permissions.config')
  getSession = (id: string) => this.call<HarnessSession>('session.get', { id })
  readModelTrace = (id: string) => this.call<import('../../../../src/config/miraModelTrace').MiraModelTrace>('session.trace', { id })
  openModelTraceDirectory = (id: string) => this.call<void>('session.trace.open', { id })
  getTaskDiagnosticPaths = (id: string) => this.call<import('../../../../src/config/miraModelTrace').MiraTaskDiagnosticPaths>('session.paths', { id })
  previewFileRewind = (sessionId: string, messageId: string) => this.call<import('../../../../src/config/miraFileRewind').MiraFileRewindPreview>('files.rewind-preview', { sessionId, messageId })
  applyFileRewind = (sessionId: string, messageId: string, snapshotToken: string) => this.call<import('../../../../src/config/miraFileRewind').MiraFileRewindResult>('files.rewind-apply', { sessionId, messageId, snapshotToken })
  recoverFileRewind = (sessionId: string, recoveryId: string) => this.call<import('../../../../src/config/miraFileRewind').MiraFileRewindResult>('files.rewind-recover', { sessionId, recoveryId })
  createSession = (projectId?: string) => this.call<HarnessSession>('session.create', { projectId })
  prepareSession = (projectId?: string) => this.call<HarnessSession>('session.create', { projectId, prepared: true })
  importAttachments = (sessionId: string, files: Array<{ name: string; mediaType: string; data: string }>) => this.call<HarnessFileReference[]>('attachments.import', { sessionId, files })
  getAttachment = (sessionId: string, path: string) => this.call<HarnessMessageAttachment>('attachments.get', { sessionId, path })
  saveAttachment = (sessionId: string, path: string) => this.call<HarnessAttachmentSaveResult>('attachments.save', { sessionId, path })
  stageAttachment = (sessionId: string, path: string) => this.call<HarnessFileReference>('attachments.stage', { sessionId, path })
  selectAttachments = (sessionId: string, files?: File[]) => this.call<HarnessFileReference[]>('attachments.select', { sessionId, ...(files ? { files } : {}) })
  resolveAttachmentPaths = (files: File[]) => this.call<string[]>('attachments.paths', { files })
  listProviders = () => this.call<ModelProviderSummary[]>('providers.list')
  runMessage = (sessionId: string, text: string, selection: ModelSelection, planning: boolean, references: HarnessFileReference[] = []) => this.call<void>('message.run', { sessionId, text, references, selection, planning })
  submitMessage = (sessionId: string, text: string, selection: ModelSelection, planning: boolean, references: HarnessFileReference[], submissionId: string, options?: HarnessMessageSubmissionOptions) => this.call<HarnessMessageSubmissionResult>('message.submit', { sessionId, submissionId, text, references, selection, planning, ...(options === undefined ? {} : { options }) })
  getMessageQueue = (sessionId: string) => this.call<HarnessMessageQueueSnapshot>('queue.list', { sessionId })
  withdrawMessage = (sessionId: string, itemId: string) => this.call<HarnessMessageWithdrawal>('queue.withdraw', { sessionId, itemId })
  resumeMessageQueue = (sessionId: string) => this.call<HarnessMessageQueueSnapshot>('queue.resume', { sessionId })
  reorderMessageQueue = (sessionId: string, itemId: string, beforeItemId: string | null) => this.call<HarnessMessageQueueSnapshot>('queue.reorder', { sessionId, itemId, beforeItemId })
  sendQueuedMessageNow = (sessionId: string, itemId: string, expectedRunId?: string) => this.call<HarnessMessageQueueSnapshot>('queue.send-now', { sessionId, itemId, ...(expectedRunId === undefined ? {} : { expectedRunId }) })
  respondPermission = (requestId: string, allowed: boolean) => this.call<void>('permission.respond', { requestId, allowed })
  listPendingPermissions = (sessionId: string) => this.call<HarnessPermissionRequest[]>('permissions.pending', { sessionId })
  openSessionProject = (sessionId: string, target: 'file-manager' | 'terminal' = 'file-manager') => this.call<string>('project.open', { sessionId, target })
  abortRun = (sessionId: string, expectedRunId?: string) => this.call<void>('run.abort', { sessionId, ...(expectedRunId === undefined ? {} : { expectedRunId }) })
  confirmPlan = (sessionId: string, planId: string, selection: ModelSelection) => this.call<unknown>('plan.confirm', { sessionId, planId, selection })
  answerInteraction = (sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection: ModelSelection) => this.call<unknown>('interaction.answer', { sessionId, interactionId, answers, selection })
  listFiles = (sessionId: string, path: string) => this.call<{ path: string; entries: HarnessWorkspaceFileEntry[] }>('files.list', { sessionId, path })
  searchFiles = (sessionId: string, query: string, refresh = false) => this.call<HarnessWorkspaceFileSearchResult>('files.search', { sessionId, query, refresh })
  getWorkspaceGit = (sessionId: string) => this.call<HarnessWorkspaceGitSnapshot>('files.git-status', { sessionId })
  getWorkspaceIgnored = (sessionId: string, paths: string[]) => this.call<string[]>('files.git-ignored', { sessionId, paths })
  listProjectFiles = (projectId: string, path: string, rootPath?: string) => this.call<{ path: string; entries: HarnessWorkspaceFileEntry[] }>('files.list', { projectId, ...(rootPath ? { rootPath } : {}), path })
  searchProjectFiles = (projectId: string, query: string, refresh = false, rootPath?: string) => this.call<HarnessWorkspaceFileSearchResult>('files.search', { projectId, ...(rootPath ? { rootPath } : {}), query, refresh })
  getProjectWorkspaceGit = (projectId: string, rootPath?: string) => this.call<HarnessWorkspaceGitSnapshot>('files.git-status', { projectId, ...(rootPath ? { rootPath } : {}) })
  getProjectWorkspaceIgnored = (projectId: string, paths: string[], rootPath?: string) => this.call<string[]>('files.git-ignored', { projectId, ...(rootPath ? { rootPath } : {}), paths })
  watchProjectFiles = (projectId: string, rootPath: string, paths: string[]) => this.call<{ watchId: string }>('files.watch', { projectId, rootPath, paths })
  unwatchProjectFiles = (projectId: string, rootPath: string, watchId: string) => this.call<void>('files.unwatch', { projectId, rootPath, watchId })
  watchFiles = (sessionId: string, paths: string[]) => this.call<{ watchId: string }>('files.watch', { sessionId, paths })
  unwatchFiles = (sessionId: string, watchId: string) => this.call<void>('files.unwatch', { sessionId, watchId })
  listEditors = (refresh = false) => this.call<Array<{ id: string; name: string; icon?: string }>>('editors.list', { refresh })
  getWorkspaceHtmlUrl = (scope: { projectId: string; rootPath?: string } | { sessionId: string }, path: string) => this.call<string>('files.browser-url', { ...scope, path })
  revealWorkspaceFile = (scope: { projectId: string; rootPath?: string } | { sessionId: string }, path: string) => this.call<void>('files.reveal', { ...scope, path })
  openProjectFileInEditor = (projectId: string, path: string, editorId: string, rootPath?: string) => this.call<void>('files.open-editor', { projectId, ...(rootPath ? { rootPath } : {}), path, editorId })
  openFileInEditor = (sessionId: string, path: string, editorId: string) => this.call<void>('files.open-editor', { sessionId, path, editorId })
  readFile = (sessionId: string, path: string) => this.call<{ path: string; content: string }>('files.read', { sessionId, path })
  readImage = (sessionId: string, path: string) => this.call<HarnessWorkspaceImagePreview>('files.read-image', { sessionId, path })
  openMedia = (sessionId: string, path: string) => this.call<MiraMediaPreview>('files.media-open', { sessionId, path })
  readProjectFile = (projectId: string, path: string, rootPath?: string) => this.call<{ path: string; content: string }>('files.read', { projectId, ...(rootPath ? { rootPath } : {}), path })
  readProjectImage = (projectId: string, path: string, rootPath?: string) => this.call<HarnessWorkspaceImagePreview>('files.read-image', { projectId, ...(rootPath ? { rootPath } : {}), path })
  openProjectMedia = (projectId: string, path: string, rootPath?: string) => this.call<MiraMediaPreview>('files.media-open', { projectId, ...(rootPath ? { rootPath } : {}), path })
  closeMedia = (id: string) => this.call<void>('files.media-close', { id })
  openTerminal = (sessionId: string) => this.call<{ terminalId: string; sessionId: string; cwd: string; shell?: string }>('terminal.open', { sessionId })
  writeTerminal = (sessionId: string, terminalId: string, data: string) => this.call<void>('terminal.write', { sessionId, terminalId, data })
  pasteTerminal = (sessionId: string, terminalId: string, bracketed: boolean) => this.call<void>('terminal.paste', { sessionId, terminalId, bracketed })
  resizeTerminal = (sessionId: string, terminalId: string, columns: number, rows: number) => this.call<void>('terminal.resize', { sessionId, terminalId, columns, rows })
  closeTerminal = (sessionId: string, terminalId: string) => this.call<void>('terminal.close', { sessionId, terminalId })
  navigateBrowser = (sessionId: string, url: string, bounds: HarnessBrowserBounds, browserId?: string, visible?: boolean) => this.call<string>('browser.navigate', { sessionId, url, bounds, ...(browserId ? { browserId } : {}), ...(visible === undefined ? {} : { visible }) })
  setBrowserBounds = (sessionId: string, bounds: HarnessBrowserBounds, browserId?: string) => this.call<void>('browser.bounds', { sessionId, bounds, ...(browserId ? { browserId } : {}) })
  setBrowserViewport = (sessionId: string, presentation: HarnessBrowserPresentation, browserId?: string) => this.call<{ desktopZoomFactor: number }>('browser.viewport', { sessionId, ...presentation, ...(browserId ? { browserId } : {}) })
  pickBrowserElement = (sessionId: string, action: 'start' | 'cancel', browserId: string) => this.call<MiraBrowserPickResult>('browser.pick', { sessionId, action, browserId })
  browserProtected = (sessionId: string, browserId: string) => this.call<{ protected: boolean }>('browser.protection', { sessionId, browserId })
  controlBrowser = (sessionId: string, action: 'back' | 'forward' | 'reload' | 'devtools' | 'hide' | 'show' | 'close', browserId?: string) => this.call<void>('browser.control', { sessionId, action, ...(browserId ? { browserId } : {}) })
  openBrowserExternal = (sessionId: string, url: string, browserId?: string) => this.call<void>('browser.external', { sessionId, url, ...(browserId ? { browserId } : {}) })
  onEvent = (listener: (event: HarnessEvent) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  onBrowserEvent = (listener: (event: PilotBrowserEvent) => void) => { this.browserListeners.add(listener); return () => { this.browserListeners.delete(listener) } }
  getPreference = (key: string) => this.request<unknown>('preferences.get', { key })
  listPromptHistory = (scope: { sessionId?: string; projectId?: string }) => this.call<string[]>('input-history.list', scope)
  setPreference = (key: string, value: unknown) => this.request<void>('preferences.set', { key, value })
  navigate = (path: string) => this.request<void>('navigation.open', { path })
  renameSession = (id: string, title: string) => this.call<void>('session.rename', { id, title })
  setSessionPinned = (id: string, pinned: boolean) => this.call<void>('session.set-pinned', { id, pinned })
  setSessionUnread = (id: string, unread: boolean) => this.call<void>('session.set-unread', { id, unread })
  archiveSession = (id: string) => this.call<void>('session.archive', { id })
  deleteSession = (id: string) => this.call<void>('session.delete', { id })
  moveSession = (id: string, projectId?: string) => this.call<void>('session.move', { id, projectId })
  reorderSessions = (scope: HarnessSessionOrderScope, ids: string[]) => this.call<void>('session.reorder', { scope, ids })
  reorderProjects = (ids: string[]) => this.call<void>('projects.reorder', { ids })
  setSessionPermission = (id: string, mode: PermissionMode) => this.call<void>('session.set-permission', { id, mode })
  setSessionSkills = (id: string, skillIds: string[]) => this.call<void>('session.set-skills', { id, skillIds })
  setSessionMcpServers = (id: string, serverIds: string[]) => this.call<void>('session.set-mcp-servers', { id, serverIds })
  setSessionDelegation = (id: string, enabled: boolean) => this.call<void>('session.set-delegation', { id, enabled })
  listPlugins = () => this.call<MiraPluginItem[]>('plugins.list')
  listPluginCatalog = (sessionId?: string) => this.call<MiraPluginItem[]>('plugins.catalog', { sessionId })
  listPromptCommands = (scope: { projectId?: string; sessionId?: string }) => this.call<import('../../../../src/config/miraPromptCommands').MiraPromptCommandItem[]>('commands.list', scope)
  listUserAgents = (scope: { projectId?: string; sessionId?: string }) => this.call<import('../../../../src/config/miraUserAgents').MiraUserAgentItem[]>('agents.list', scope)
  importLocalPlugin = () => this.call<MiraPluginItem[] | null>('plugins.import')
  setPluginEnabled = (id: string, enabled: boolean) => this.call<MiraPluginItem[]>('plugins.set-enabled', { id, enabled })
  removePlugin = (id: string) => this.call<MiraPluginItem[]>('plugins.remove', { id })
  listSkills = () => this.call<unknown[]>('skills.list')
  listMcp = (sessionId?: string, projectId?: string) => this.call<import('../../../../src/config/miraMcp').MiraMcpItem[]>('mcp.list', sessionId ? { sessionId } : projectId ? { projectId } : undefined)
  reconnectMcp = (id: string) => this.call<import('../../../../src/config/miraMcp').MiraMcpConnection>('mcp.reconnect', { id })
  selectFiles = (sessionId: string) => this.call<HarnessFileReference[]>('files.select', { sessionId })
  listGitBranches = (projectId: string) => this.call<unknown>('git.branches', { projectId })
  generateGitMessage = (projectId: string, token: string, includeUnstaged: boolean, selection: ModelSelection) => this.call<string>('git.generate-message', { projectId, token, includeUnstaged, selection })
  getGitTools = (projectId: string) => this.call<MiraGitSnapshot>('git.tools', { projectId })
  getGitGraph = (projectId: string, skip: number) => this.call<MiraGitGraph>('git.graph', { projectId, skip })
  gitAction = (projectId: string, action: MiraGitAction, token: string, message: string, includeUnstaged: boolean) => this.call<MiraGitActionResult>('git.action', { projectId, action, token, message, includeUnstaged })
  getGitContext = (projectId: string) => this.call<HarnessGitContext>('git.context', { projectId })
  checkoutGitBranch = (projectId: string, branch: string, snapshotToken: string) => this.call<HarnessGitContext>('git.checkout', { projectId, branch, snapshotToken })
  createGitBranch = (projectId: string, branch: string, snapshotToken: string) => this.call<HarnessGitContext>('git.create-branch', { projectId, branch, snapshotToken })
  respondMemory = (requestId: string, approved: boolean) => this.call<void>('memory.respond', { requestId, approved })
  saveMemory = (id: string, selection: ModelSelection) => this.call<void>('memory.save', { sessionId: id, selection })
  stopSubtasks = (id: string, subtaskId?: string) => this.call<void>('subtask.stop', { sessionId: id, subtaskId })
  backgroundCommand = (id: string, runId: string, toolId: string) => this.call<void>('command.background', { sessionId: id, runId, toolId })
  stopCommand = (id: string, runId: string, toolId: string) => this.call<void>('command.stop', { sessionId: id, runId, toolId })
  readCommandOutput = (id: string, runId: string, toolId: string) => this.call<string>('command.output', { sessionId: id, runId, toolId })
  rerun = (id: string, selection: ModelSelection) => this.call<void>('run.rerun', { sessionId: id, selection })
  editAndRerun = (id: string, messageId: string, content: string, selection: ModelSelection, references?: HarnessFileReference[], workspace?: MiraHistoryEditWorkspace) => this.call<void | MiraHistoryEditBlocked>('run.edit-rerun', { sessionId: id, messageId, content, selection, ...(references === undefined ? {} : { references }), ...(workspace === undefined ? {} : { workspace }) })
  cancelPlan = (id: string, planId: string) => this.call<void>('plan.cancel', { sessionId: id, planId })
  continuePlan = (id: string, planId: string, message: string, references: HarnessFileReference[], selection: ModelSelection) => this.call<void>('plan.continue', { sessionId: id, planId, message, references, selection })

  close() {
    this.closed = true
    this.prepareLeave = undefined
    this.closeContext = undefined
    this.port.close()
    this.pending.forEach(request => request.reject(new Error('Harness 连接已关闭')))
    this.pending.clear()
    this.listeners.clear()
    this.browserListeners.clear()
    this.controlListeners.clear()
    this.fullViewListeners.clear()
    this.commandCenterListeners.clear()
    this.navigationCommandListeners.clear()
    this.navigationRestoreListeners.clear()
    this.themeListeners.clear()
    this.navigationRestoreReceived = false
    this.navigationRestoreSnapshot = undefined
  }
}
