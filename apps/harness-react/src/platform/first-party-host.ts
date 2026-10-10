import type { HarnessEvent, HarnessFileReference, HarnessHistoryPage, HarnessHistoryQuery, HarnessPermissionRequest, HarnessProject, HarnessSession, HarnessSessionOrderScope, HarnessSessionSummary, HarnessUserAnswer, HarnessWorkspaceFileEntry, HarnessWorkspaceFileSearchResult, HarnessWorkspaceGitSnapshot, HarnessWorkspaceImagePreview, ModelProviderSummary, ModelSelection, PermissionMode } from '../../../../src/config/harness'
import type { PilotBrowserEvent, PilotHost } from '../state/pilot-state'
import type { HarnessAttachmentSaveResult, HarnessBrowserBounds } from '../../../../src/platform/firstPartyHarness'
import type { SendShortcut } from '../../../../src/config/harness'
import type { HarnessSkillMarketCatalog, HarnessSkillMarketDetail, HarnessSkillMarketItem } from '../../../../src/config/harness'
import type { HarnessConversationSearchResult } from '../../../../src/config/harness'
import type { AutomationOverview, AutomationRun, AutomationRunStatus, AutomationTask, AutomationTaskInput, PermissionConfig } from '../../../../src/config/harness'
import type { HarnessGitContext, HarnessMessageQueueSnapshot, HarnessMessageSubmissionOptions, HarnessMessageSubmissionResult, HarnessMessageWithdrawal } from '../../../../src/config/harness'
import { readMiraAppNavigationCommand, readMiraAppNavigationSnapshot, readMiraAppNavigationState, type MiraAppNavigationCommand, type MiraAppNavigationSnapshot, type MiraAppNavigationState } from '../../../../src/platform/appNavigation'
import type { HarnessMessageAttachment } from '../../../../src/config/harness'
import type { HarnessArchivedSnapshot, HarnessArchivedDeletionResult } from '../../../../src/config/harness'

export class FirstPartyHarnessHost implements PilotHost {
  readonly supportsQueueSubmissionOptions = true
  private sequence = 0
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private listeners = new Set<(event: HarnessEvent) => void>()
  private browserListeners = new Set<(event: PilotBrowserEvent) => void>()
  private commandCenterListeners = new Set<(focusRequestId?: string) => void>()
  private navigationCommandListeners = new Set<(command: MiraAppNavigationCommand) => void>()
  private navigationRestoreListeners = new Set<(snapshot: MiraAppNavigationSnapshot | undefined) => void>()
  private navigationRestoreReceived = false
  private navigationRestoreSnapshot?: MiraAppNavigationSnapshot
  private prepareLeave?: () => Promise<void>
  private closed = false

  constructor(private port: MessagePort) {
    port.onmessage = message => {
      if (this.closed) return
      const data = message.data
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
      if (data?.type === 'mira:command-center-open' && !Array.isArray(data) && Object.keys(data).every(key => key === 'type' || key === 'focusRequestId') && (data.focusRequestId === undefined || typeof data.focusRequestId === 'string' && data.focusRequestId.length > 0 && data.focusRequestId.length <= 128)) { this.commandCenterListeners.forEach(listener => listener(data.focusRequestId)); return }
      if (data?.type === 'mira:prepare-leave' && typeof data.id === 'string') {
        const id = data.id
        void Promise.resolve().then(() => {
          if (!this.prepareLeave || this.closed) throw new Error('Harness 尚未准备好保存草稿')
          return this.prepareLeave()
        }).then(() => this.replyLeave(id, true), error => this.replyLeave(id, false, error))
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
  private replyLeave(id: string, ok: boolean, error?: unknown) {
    if (this.closed) return
    try { this.port.postMessage({ type: 'mira:leave-ready', id, ok, ...(!ok ? { error: error instanceof Error ? error.message : '草稿保存失败' } : {}) }) }
    catch { /* 宿主已离开，端口无法接收保存确认。 */ }
  }

  listSessions = () => this.call<HarnessSessionSummary[]>('sessions.list')
  getComposerPreferences = () => this.call<{ sendShortcut: SendShortcut; showContextUsage: boolean; followupMode?: 'queue' | 'guide' }>('composer.preferences')
  browseSkillMarket = (refresh = false) => this.call<HarnessSkillMarketCatalog>('marketplace.browse', { refresh })
  getSkillMarketDetail = (id: string) => this.call<HarnessSkillMarketDetail>('marketplace.detail', { id })
  installMarketSkill = (id: string) => this.call<HarnessSkillMarketItem>('marketplace.install', { id })
  listInstalledMarketSkills = () => this.call<HarnessSkillMarketItem[]>('marketplace.installed')
  queryHistory = (query: HarnessHistoryQuery) => this.call<HarnessHistoryPage>('sessions.history', query)
  getArchivedSnapshot = () => this.call<HarnessArchivedSnapshot>('sessions.archived-snapshot')
  deleteArchivedSessions = (snapshotId: string) => this.call<HarnessArchivedDeletionResult>('sessions.delete-archived', { snapshotId })
  restoreSession = (id: string) => this.call<void>('session.restore', { id })
  listProjects = () => this.call<HarnessProject[]>('projects.list')
  searchConversations = (query: string) => this.call<HarnessConversationSearchResult[]>('sessions.search', { query })
  renameProject = (id: string, name: string) => this.call<void>('projects.rename', { id, name })
  openProject = (projectId: string, target: 'file-manager' | 'terminal' = 'file-manager') => this.call<string>('projects.open', { projectId, target })
  selectProject = () => this.call<HarnessProject | null>('projects.select')
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
  getAutomationNextRuns = (expression: string) => this.call<number[]>('automations.next-runs', { expression })
  saveAutomationTask = (input: AutomationTaskInput) => this.call<AutomationTask>('automations.save', { input })
  setAutomationTaskEnabled = (id: string, enabled: boolean) => this.call<AutomationTask>('automations.set-enabled', { id, enabled })
  deleteAutomationTask = (id: string) => this.call<void>('automations.delete', { id })
  listAutomationRuns = (id: string, status?: AutomationRunStatus) => this.call<AutomationRun[]>('automations.runs', { id, status })
  runAutomationNow = (id: string) => this.call<AutomationRun>('automations.run-now', { id })
  retryAutomationRun = (id: string) => this.call<AutomationRun>('automations.retry', { id })
  abortAutomationRun = (id: string) => this.call<void>('automations.abort', { id })
  getHarnessPermissionConfig = () => this.call<PermissionConfig>('permissions.config')
  getSession = (id: string) => this.call<HarnessSession>('session.get', { id })
  createSession = (projectId?: string) => this.call<HarnessSession>('session.create', { projectId })
  prepareSession = (projectId?: string) => this.call<HarnessSession>('session.create', { projectId, prepared: true })
  importAttachments = (sessionId: string, files: Array<{ name: string; mediaType: string; data: string }>) => this.call<HarnessFileReference[]>('attachments.import', { sessionId, files })
  getAttachment = (sessionId: string, path: string) => this.call<HarnessMessageAttachment>('attachments.get', { sessionId, path })
  saveAttachment = (sessionId: string, path: string) => this.call<HarnessAttachmentSaveResult>('attachments.save', { sessionId, path })
  stageAttachment = (sessionId: string, path: string) => this.call<HarnessFileReference>('attachments.stage', { sessionId, path })
  selectAttachments = (sessionId: string) => this.call<HarnessFileReference[]>('attachments.select', { sessionId })
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
  listProjectFiles = (projectId: string, path: string) => this.call<{ path: string; entries: HarnessWorkspaceFileEntry[] }>('files.list', { projectId, path })
  searchProjectFiles = (projectId: string, query: string, refresh = false) => this.call<HarnessWorkspaceFileSearchResult>('files.search', { projectId, query, refresh })
  getProjectWorkspaceGit = (projectId: string) => this.call<HarnessWorkspaceGitSnapshot>('files.git-status', { projectId })
  getProjectWorkspaceIgnored = (projectId: string, paths: string[]) => this.call<string[]>('files.git-ignored', { projectId, paths })
  watchFiles = (sessionId: string, paths: string[]) => this.call<{ watchId: string }>('files.watch', { sessionId, paths })
  unwatchFiles = (sessionId: string, watchId: string) => this.call<void>('files.unwatch', { sessionId, watchId })
  listEditors = (refresh = false) => this.call<Array<{ id: string; name: string; icon?: string }>>('editors.list', { refresh })
  openFileInEditor = (sessionId: string, path: string, editorId: string) => this.call<void>('files.open-editor', { sessionId, path, editorId })
  readFile = (sessionId: string, path: string) => this.call<{ path: string; content: string }>('files.read', { sessionId, path })
  readImage = (sessionId: string, path: string) => this.call<HarnessWorkspaceImagePreview>('files.read-image', { sessionId, path })
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
  navigate = (path: string) => this.request<void>('navigation.open', { path })
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
  listMcp = () => this.call<Array<{ id: string; name: string; enabled: boolean }>>('mcp.list')
  selectFiles = (sessionId: string) => this.call<HarnessFileReference[]>('files.select', { sessionId })
  listGitBranches = (projectId: string) => this.call<unknown>('git.branches', { projectId })
  getGitContext = (projectId: string) => this.call<HarnessGitContext>('git.context', { projectId })
  checkoutGitBranch = (projectId: string, branch: string, snapshotToken: string) => this.call<HarnessGitContext>('git.checkout', { projectId, branch, snapshotToken })
  createGitBranch = (projectId: string, branch: string, snapshotToken: string) => this.call<HarnessGitContext>('git.create-branch', { projectId, branch, snapshotToken })
  respondMemory = (requestId: string, approved: boolean) => this.call<void>('memory.respond', { requestId, approved })
  saveMemory = (id: string, selection: ModelSelection) => this.call<void>('memory.save', { sessionId: id, selection })
  stopSubtasks = (id: string, subtaskId?: string) => this.call<void>('subtask.stop', { sessionId: id, subtaskId })
  rerun = (id: string, selection: ModelSelection) => this.call<void>('run.rerun', { sessionId: id, selection })
  editAndRerun = (id: string, messageId: string, content: string, selection: ModelSelection) => this.call<void>('run.edit-rerun', { sessionId: id, messageId, content, selection })
  cancelPlan = (id: string, planId: string) => this.call<void>('plan.cancel', { sessionId: id, planId })
  continuePlan = (id: string, planId: string, message: string, references: HarnessFileReference[], selection: ModelSelection) => this.call<void>('plan.continue', { sessionId: id, planId, message, references, selection })

  close() {
    this.closed = true
    this.prepareLeave = undefined
    this.port.close()
    this.pending.forEach(request => request.reject(new Error('Harness 连接已关闭')))
    this.pending.clear()
    this.listeners.clear()
    this.browserListeners.clear()
    this.commandCenterListeners.clear()
    this.navigationCommandListeners.clear()
    this.navigationRestoreListeners.clear()
    this.navigationRestoreReceived = false
    this.navigationRestoreSnapshot = undefined
  }
}
