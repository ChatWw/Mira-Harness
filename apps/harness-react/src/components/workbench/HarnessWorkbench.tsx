import { SessionDeleteDialog } from '../session/SessionDeleteDialog'
import { createContext, createElement, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import { Group as MiraPanelGroup, Panel as MiraPanel, Separator as MiraPanelSeparator } from 'react-resizable-panels'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ArrowDown, ArrowLeft, ArrowRight, Blocks, BookOpen, CalendarClock, ChevronDown, CircleAlert, FileText, FolderOpen, Globe2, LoaderCircle, Menu, Moon, MoreHorizontal, PanelRightOpen, Plus, RotateCw, Search, Settings, ShieldCheck, Sun, TerminalSquare, X } from 'lucide-react'
import { type HarnessMessage, type HarnessSession, type HarnessSessionSummary, type HarnessSideConversationInput, type ToolCallRecord } from '../../../../../src/config/harness'
import { miraAppNavigationShortcut, type MiraAppNavigationSnapshot, type MiraAppNavigationTarget } from '../../../../../src/platform/appNavigation'
import { isMiraPrimaryModifier, miraPrimaryKeyShortcuts } from '../../../../../src/platform/workbenchShortcuts'
import { getPilotTaskState, getPilotTaskTone, PilotController } from '../../state/pilot-state'
import { MiraWorkbenchNavigation, type MiraNavigationAction } from '../../state/workbench-navigation'
import { MiraBrowserResidency, type MiraBrowserTabIdentity } from '../../state/mira-browser-residency'
import { SessionMenuItems, SessionSidebar, useHarnessSessionShortcuts } from '../session/SessionSidebar'
import { SidebarActionHint } from '../session/SidebarCollectionSection'
import { SIDEBAR_PREFERENCE_KEY, SidebarPreferenceStore } from '../session/sidebar-preferences'
import { moveSidebarTask, sidebarRootItems } from '../session/session-groups'
import { miraAdjacentTasks } from '../../lib/mira-task-navigation'
import { useMiraTaskNavigationShortcut } from '../../hooks/useMiraTaskNavigationShortcut'
import { useMiraSidebarMotion } from '../../hooks/useMiraSidebarMotion'
import { installDocumentMotion } from '../../../../../src/utils/documentMotion'
import { useMiraWorkbenchShortcuts } from '../../hooks/useMiraWorkbenchShortcuts'
import type { ComposerTaskDraft } from '../../lib/composer-drafts'
import { HarnessWorkspaceContext } from './HarnessWorkspaceContext'
import { MiraTaskTitleEditor } from './MiraTaskTitleEditor'
import { MiraWorkbenchHelp } from './MiraWorkbenchHelp'
import { MiraDraftWelcome } from './MiraDraftWelcome'
import { SkillMarketView } from '../extensions/SkillMarketView'
import { AutomationsView, type AutomationsNavigationHandle } from '../automations/AutomationsView'
import { MiraWorkflowRunPane } from '../workflows/MiraWorkflowRunPane'
import { MiraWorkflowDigest } from '../workflows/MiraWorkflowDigest'
import { useMiraWorkflowRuns } from '../workflows/useMiraWorkflowRuns'
import { createWorkspaceWorkflowTab } from '../../state/workspace-state'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import type { ActorRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import { HarnessCommandCenter, type HarnessSearchCommand } from '../search/HarnessCommandCenter'
import { PermissionResponseCard, type PermissionResponseCardProps } from '../conversation/AssistantMessageParts'
import { MiraConversationDetailMemory, MiraConversationDetails } from '../conversation/MiraConversationDetails'
import { ConversationTurnRail } from '../conversation/ConversationTurnRail'
import { MiraPendingGuides } from '../conversation/MiraPendingGuides'
import { MiraConversationViewport } from '../conversation/MiraConversationViewport'
import { MiraConversationTimeline } from '../conversation/MiraConversationTimeline'
import { MiraWorkingIndicator } from '../conversation/MiraWorkingIndicator'
import { MiraTaskFind } from '../conversation/MiraTaskFind'
import { MiraSelectionActions } from '../conversation/MiraSelectionActions'
import { MiraTaskChangesPanel as ChangesPanel } from '../workspace/MiraTaskChangesPanel'
import type { ConversationTimelineActions } from '../../lib/conversation-timeline'
import { conversationScrollKey } from '../../lib/conversation-scroll'
import type { ConversationScrollActions } from '../../hooks/useConversationScroll'
import { TaskSummary, type MiraTaskSummaryMode } from '../conversation/TaskSummary'
import { MiraGitReviewPanel } from '../git/MiraGitReviewPanel'
import { projectTimelineMessages, projectTimelineRenderMessages, type TimelineRenderMessage } from '../conversation/conversation-model'
import { HarnessComposer, type HarnessComposerHandle } from '../composer/HarnessComposer'
import { MiraBackgroundTasksTrigger } from '../composer/MiraBackgroundTasksTrigger'
import { WorkspaceLauncher } from '../workspace/WorkspaceLauncher'
import { WorkspaceTabs } from '../workspace/WorkspaceTabs'
import { MiraCommandPane } from '../workspace/MiraCommandPane'
import { MiraCommandOutputFile } from '../workspace/MiraCommandOutputFile'
import { miraRecordedCommand, miraSessionCommand } from '../../lib/mira-command-presentation'
import { createWorkspaceCommandTab, createWorkspaceCommandOutputTab } from '../../state/workspace-state'
import { OverviewPanel } from '../workspace/OverviewPanel'
import { MiraSubtaskPanel } from '../workspace/MiraSubtaskPanel'
import { selectMiraRunActivity, selectMiraSubtask } from '../../lib/subtask-activity'
import { TerminalPanel } from '../workspace/TerminalPanel'
import { MiraBottomTerminal } from '../workspace/MiraBottomTerminal'
import { MiraBrowserPanel, type MiraBrowserRequest } from '../workspace/MiraBrowserPanel'
import { ProjectFileDrawer } from '../workspace/ProjectFileDrawer'
import { FilePreviewPanel } from '../workspace/FilePreviewPanel'
import { readMiraPresentationReference, type MiraPresentationReference } from '../../../../../src/config/miraPresentation'
import type { MiraPresentationNavigation } from '../../lib/mira-presentation-reference'
import { WorkspaceEditorButton } from '../workspace/WorkspaceEditorButton'
import { useWorkspaceEditors } from '../../hooks/useWorkspaceEditors'
import { TaskInteraction } from '../interactions/TaskInteraction'
import { cn } from '../../lib/utils'
import { useWorkspaceWatch, workspaceWatchPaths } from '../../lib/workspace-watch'
import { useMiraPaneGeometry } from '../../hooks/useMiraPaneGeometry'
import { useMiraCommandShortcut } from '../../hooks/useMiraCommandShortcut'
import { miraSessionPlans } from '../../../../../src/config/miraSessionPlans'
import { MiraPlanDetail } from '../workspace/MiraPlanDetail'
import { MiraModelTracePane } from '../workspace/MiraModelTracePane'
import { createWorkspaceTraceTab } from '../../state/workspace-state'
import { closeAllWorkspaceTabs, closeOtherWorkspaceTabs as removeOtherWorkspaceTabs, closeWorkspaceTab as removeWorkspaceTab, createWorkspaceFileTab, createWorkspacePlanTab, createWorkspaceSideConversationTab, createWorkspaceTaskTab, createWorkspaceRunTab, createWorkspaceSubtaskTab, createWorkspaceTerminalTab, createWorkspaceBrowserTab, isWorkspaceBrowserTab, createWorkspaceSession, isWorkspaceTerminalTab, labelWorkspaceTab, openWorkspaceTab as addWorkspaceTab, readWorkspaceSessions, reorderWorkspaceTabs, restoreWorkspaceTab, workspaceTabLabel, withoutWorkspaceTaskOwners, type WorkspaceResourceId, type WorkspaceSessionState, type WorkspaceTabId } from '../../state/workspace-state'

import { MiraConversationContext, UserMessage, AssistantMessage } from '../conversation/MiraConversationMessages'
import { MiraSideConversation, type MiraTaskPaneHandle, type MiraSideQuoteRequest } from '../workspace/MiraSideConversation'
import { MiraTaskGrid } from '../workspace/MiraTaskGrid'
import { MIRA_PRIMARY_TASK_PANE, miraTaskPaneIds, readMiraTaskLayout, type MiraTaskSplitSide } from '../../state/mira-task-layout'
import { placeWorkspaceTask, replaceWorkspaceTask } from '../../state/workspace-state'
import type { MiraConversationSelection } from '../../lib/mira-conversation-selection'

const MIRA_TASK_REPLACEMENT_SAVE_ERROR = '切换任务前未能保存工作台，当前输入已保留；请重试。'
const WORKSPACE_PREFERENCE_KEY = 'harness-react-workspace'
const ViewportContentsContext = createContext<ReactNode>(null)
const MemoConversationViewport = memo(MiraConversationViewport)

function MiraViewportContents() { return useContext(ViewportContentsContext) }
const viewportContents = createElement(MiraViewportContents)

export function MiraWorkbenchViewport({ children, ...props }: ComponentProps<typeof MiraConversationViewport>) {
  // Messages and approvals update without re-rendering the owning scroll container.
  return <ViewportContentsContext.Provider value={children}><MemoConversationViewport {...props}>{viewportContents}</MemoConversationViewport></ViewportContentsContext.Provider>
}

export function HarnessWorkbench({ controller }: { controller: PilotController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const commandKey = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl '
  const terminalShortcut = commandKey === '⌘' ? '⌘J' : 'Ctrl+J'
  const workspaceShortcut = commandKey === '⌘' ? '⌘⌥B' : 'Ctrl+Alt+B'
  const conversationDetails = useMemo(() => new MiraConversationDetailMemory(), [controller])
  const [summaryMode, setSummaryMode] = useState<MiraTaskSummaryMode>('auto')
  const [goalDetails, setGoalDetails] = useState<{ owner?: string; revision: number }>({ revision: 0 })
  const [workflowActorLanding, setWorkflowActorLanding] = useState<{ sessionId: string; runId: string; siteId: string; ordinal: number; key: number }>()
  const workflowLandingKey = useRef(0)
  const goalDetailsRequest = goalDetails.owner === state.session?.id ? goalDetails.revision : 0
  const showGoal = () => { setGoalDetails(previous => ({ owner: state.session?.id, revision: previous.revision + 1 })); setSummaryMode('panel') }
  const sidebarPreferenceStore = useMemo(() => new SidebarPreferenceStore(() => controller.getPreference(SIDEBAR_PREFERENCE_KEY), value => controller.setPreference(SIDEBAR_PREFERENCE_KEY, value, true)), [controller])
  const sidebarPreferences = useSyncExternalStore(sidebarPreferenceStore.subscribe, sidebarPreferenceStore.getSnapshot)
  useEffect(() => {
    void sidebarPreferenceStore.load().catch(() => undefined)
    return controller.registerBeforeNavigation(() => sidebarPreferenceStore.save())
  }, [controller, sidebarPreferenceStore])
  const editorAccess = useWorkspaceEditors(controller)
  const [mainView, setMainView] = useState<'conversation' | 'extensions' | 'automations'>('conversation')
  const workflowRuns = useMiraWorkflowRuns(controller, state.session?.id, mainView === 'conversation' && !state.sessionLoading)
  const mainViewRef = useRef(mainView)
  mainViewRef.current = mainView
  const navigation = useMemo(() => new MiraWorkbenchNavigation(value => controller.publishNavigationState(value)), [controller])
  const navigationState = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot)
  const [navigationRestore, setNavigationRestore] = useState<{ snapshot?: MiraAppNavigationSnapshot }>()
  const navigationAction = useRef<MiraNavigationAction>(async () => false)
  navigationAction.current = executeNavigation
  const [automationsMounted, setAutomationsMounted] = useState(false)
  const automationsRef = useRef<AutomationsNavigationHandle | null>(null)
  const automationWaiters = useRef(new Set<(handle: AutomationsNavigationHandle | null) => void>())
  const bindAutomations = useMemo(() => (handle: AutomationsNavigationHandle | null) => {
    automationsRef.current = handle
    if (handle) { automationWaiters.current.forEach(resolve => resolve(handle)); automationWaiters.current.clear() }
  }, [controller])
  const [commandCenterOpen, setCommandCenterOpen] = useState(false)
  const [commandCenterFocusRequestNumber, setCommandCenterFocusRequestNumber] = useState(0)
  const [dismissedViewError, setDismissedViewError] = useState<string>()
  const [findRequest, setFindRequest] = useState(0)
  const [searchTarget, setSearchTarget] = useState<{ sessionId: string; messageId?: string }>()
  const viewRevision = useRef(0)
  const [draftProjectId, setDraftProjectId] = useState<string>()
  const [taskDraft, setTaskDraft] = useState<ComposerTaskDraft | null>()
  const [sessionsOpen, setSessionsOpen] = useState(true)
  const [sidebarFileTarget, setSidebarFileTarget] = useState<{ projectId?: string; sessionId?: string; directory: string; expandedPaths: string[]; selectedPath?: string }>()
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const workspaceManuallyOpened = useRef(false)
  const [workspaceMounted, setWorkspaceMounted] = useState(false)
  const workspaceToggleRef = useRef<HTMLButtonElement>(null)
  const workspaceDismissFocus = useRef(false)
  const [terminalViews, setTerminalViews] = useState<Array<{ sessionId: string; tabId: WorkspaceTabId; epoch: number; directory?: string }>>([])
  const [bottomTerminalOpen, setBottomTerminalOpen] = useState(false)
  const bottomTerminalToggleRef = useRef<HTMLButtonElement>(null)
  const bottomTerminalOpenRef = useRef(bottomTerminalOpen)
  bottomTerminalOpenRef.current = bottomTerminalOpen
  const retainedTerminalSessions = useMemo(() => state.sessions.map(session => session.id), [state.sessions])
  const [browserRequest, setBrowserRequest] = useState<MiraBrowserRequest>()
  const [presentationNavigation, setPresentationNavigation] = useState<MiraPresentationNavigation>()
  const [browserViews, setBrowserViews] = useState<Array<{ sessionId: string; tabId: WorkspaceTabId }>>([])
  const geometry = useMiraPaneGeometry({ host: controller, conversation: mainView === 'conversation', workspaceOpen, sessionsOpen, closeWorkspace: () => setWorkspaceOpen(false), closeSessions: () => setSessionsOpen(false) })
  useMiraSidebarMotion(sessionsOpen, geometry.shellRef, geometry.bodyRef)
  useEffect(() => installDocumentMotion(), [])
  const { sessionsWidth } = geometry
  const [workspaceSessions, setWorkspaceSessionsState] = useState<Record<string, WorkspaceSessionState>>({})
  const [workspacePreferencesLoaded, setWorkspacePreferencesLoaded] = useState(false)
  const [watchedTreeDirectories, setWatchedTreeDirectories] = useState<{ key: string; paths: string[] }>({ key: '', paths: [] })
  const workspacePreferences = useMemo(() => ({
    latest: {} as Record<string, WorkspaceSessionState>,
    saved: undefined as Record<string, WorkspaceSessionState> | undefined,
    ready: false, mounted: false,
    deleted: new Set<string>(),
    loading: undefined as Promise<void> | undefined,
    saving: undefined as Promise<void> | undefined,
  }), [controller])
  const [focusedPane, setFocusedPane] = useState<string>('main')
  const focusedPaneRef = useRef(focusedPane)
  focusedPaneRef.current = focusedPane
  const [taskPaneFocus, setTaskPaneFocus] = useState<{ id: string; revision: number; messageId?: string; filePath?: string; execution?: boolean }>()
  const taskPaneRequestRevision = useRef(0)
  const [sideQuotes, setSideQuotes] = useState<Record<string, MiraSideQuoteRequest[]>>({})
  const pendingSideConversation = useRef(new Map<string, Promise<HarnessSession>>())
  useEffect(() => setFocusedPane('main'), [state.session?.id])
  useEffect(() => { if (!workspaceOpen) setFocusedPane(current => current === 'workspace' ? selectedTask.current.pane : current) }, [workspaceOpen])
  useEffect(() => { if (!workspaceOpen) workspaceManuallyOpened.current = false }, [workspaceOpen])
  useEffect(() => {
    if (!workspaceOpen && workspaceDismissFocus.current) {
      workspaceDismissFocus.current = false
      workspaceToggleRef.current?.focus({ preventScroll: true })
    }
  }, [workspaceOpen])
  const composerRef = useRef<HarnessComposerHandle>(null)
  const messageViewportRef = useRef<HTMLDivElement>(null)
  const conversationScrollActions = useRef<ConversationScrollActions | null>(null)
  const conversationTimelineActions = useRef<ConversationTimelineActions | null>(null)
  const changesFindRef = useRef<HTMLDivElement | null>(null)
  const [activeTurnId, setActiveTurnId] = useState('')
  const [conversationAtBottom, setConversationAtBottom] = useState(true)
  const [deletingTask, setDeletingTask] = useState<HarnessSessionSummary>()
  const [taskRename, setTaskRename] = useState<{ sessionId: string; title: string }>()
  const [preparingWorkspace, setPreparingWorkspace] = useState(false)
  const [respondingRequestId, setRespondingRequestId] = useState<string>()
  const respondingRequest = useRef<string | undefined>(undefined)
  const [permissionError, setPermissionError] = useState<{ requestId: string; message: string }>()
  const [memoryResponding, setMemoryResponding] = useState(false)
  const [planning, setPlanning] = useState(false)
  const newConversation = (projectId?: string | null, groupId?: string, pluginId?: string) => navigation.visit(undefined, (target, current, draft) => executeNavigation(target, current, draft, projectId, true, groupId, undefined, pluginId)).catch(error => { controller.reportError(error); return false })
  const openDraft = (id: string) => navigation.visit(undefined, (target, current, draft) => executeNavigation(target, current, draft, undefined, false, undefined, id)).catch(error => { controller.reportError(error); return false })
  const commandCenterFocusRequest = useRef<string | undefined>(undefined)
  const openCommandCenter = () => { commandCenterFocusRequest.current = undefined; setCommandCenterFocusRequestNumber(value => value + 1); setCommandCenterOpen(true) }
  useMiraCommandShortcut(controller, mainView === 'conversation' && !commandCenterOpen && (focusedPane === 'main' || focusedPane === 'workspace'))
  useHarnessSessionShortcuts(() => { void newConversation() }, openCommandCenter, openSessions)
  const taskNavigationPending = useRef(false)
  const themePending = useRef(false)
  const projectSelectionPending = useRef(false)
  const theme = useSyncExternalStore(controller.subscribeTheme, controller.getTheme)
  useMiraWorkbenchShortcuts(command => {
    if (commandCenterOpen) return false
    if (command === 'theme' && controller.supportsThemeSwitch) {
      void toggleShellTheme().catch(error => controller.reportError(error)); return true
    }
    if (command === 'project' && controller.supportsProjectSelection) {
      void selectWorkspaceProject().catch(error => controller.reportError(error)); return true
    }
    return false
  })
  useMiraTaskNavigationShortcut(direction => {
    if (commandCenterOpen || mainView !== 'conversation') return false
    return selectAdjacentTask(direction)
  })
  useEffect(() => controller.onCommandCenterOpen(focusRequestId => { openCommandCenter(); commandCenterFocusRequest.current = focusRequestId }), [controller])
  useEffect(() => {
    navigation.connect()
    const removeCommand = controller.onNavigationCommand(command => { void navigation.go(command, (...args) => navigationAction.current(...args)).catch(error => controller.reportError(error)) })
    const removeRestore = controller.onNavigationRestore(snapshot => setNavigationRestore({ snapshot }))
    const removeDeleted = controller.onSessionDeleted(id => {
      navigation.removeSession(id)
      workspacePreferences.deleted.add(id)
      setWorkspaceSessions(previous => withoutWorkspaceTaskOwners(previous, new Set([id])))
      setBrowserViews(views => views.filter(item => item.sessionId !== id))
      setTerminalViews(views => views.filter(item => item.sessionId !== id))
    })
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = miraAppNavigationShortcut(event)
      if (!direction || document.querySelector?.('[role="dialog"][aria-modal="true"], [role="menu"][data-state="open"], dialog[open]')) return
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (target?.closest('[role="dialog"]:not(.mira-conversation-find)')) return
      const current = navigation.getSnapshot()
      if (current.busy || !(direction === 'back' ? current.canGoBack : current.canGoForward)) return
      event.preventDefault()
      void navigation.go({ type: 'mira:app-navigation-command', direction, expectedRevision: current.revision }, (...args) => navigationAction.current(...args)).catch(error => controller.reportError(error))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      removeCommand(); removeRestore(); removeDeleted(); window.removeEventListener('keydown', onKeyDown)
      navigation.disconnect(); viewRevision.current++
      automationWaiters.current.forEach(resolve => resolve(null)); automationWaiters.current.clear()
    }
  }, [controller, navigation, workspacePreferences])
  useEffect(() => {
    if (state.initialized === false || !navigationRestore || navigation.ready || navigation.busy) return
    const fallback = state.session?.id && state.session.draftState !== 'prepared' ? { kind: 'conversation' as const, sessionId: state.session.id } : undefined
    const snapshot = navigationRestore.snapshot ?? (!fallback ? { entries: [], cursor: -1, detached: true, draft: 'conversation' as const } : undefined)
    void navigation.initialize(snapshot, fallback, (...args) => navigationAction.current(...args)).catch(error => controller.reportError(error))
  }, [controller, navigation, navigationRestore, state.initialized, navigationState.revision])
  useEffect(() => {
    if (state.initialized === false || state.sessionLoading || mainView !== 'conversation') return
    if (state.session?.id && state.session.draftState !== 'prepared') navigation.record({ kind: 'conversation', sessionId: state.session.id })
    else navigation.detach('conversation')
  }, [navigation, navigationState.revision, state.initialized, state.sessionLoading, state.session?.id, state.session?.draftState, mainView])
  useEffect(() => {
    workspacePreferences.mounted = true
    void loadWorkspacePreferences().catch(error => controller.reportError(error))
    return () => {
      workspacePreferences.mounted = false
      void persistWorkspace().catch(error => controller.reportError(error))
    }
  }, [controller, workspacePreferences])
  useEffect(() => {
    if (workspacePreferencesLoaded && workspacePreferences.ready) void persistWorkspace().catch(error => controller.reportError(error))
  }, [controller, workspaceSessions, workspacePreferencesLoaded, workspacePreferences])
  useEffect(() => controller.registerBeforeNavigation(persistWorkspace), [controller, workspacePreferences])
  const timelineMessages = useMemo(() => projectTimelineMessages(state.messages, state.session?.activeRun), [state.messages, state.session?.activeRun])
  const rendererMessageCache = useMemo(() => new WeakMap<HarnessMessage, TimelineRenderMessage>(), [controller, state.session?.id])
  const rendererMessages = useMemo(() => projectTimelineRenderMessages(timelineMessages, state.session?.id, rendererMessageCache), [timelineMessages, state.session?.id, rendererMessageCache])
  const interaction = state.session?.pendingInteraction
  const lastMessage = timelineMessages[timelineMessages.length - 1]
  const streamMessage = lastMessage?.role === 'assistant' && lastMessage.id.startsWith('stream-') ? lastMessage : undefined
  const sessionPlans = useMemo(() => miraSessionPlans(state.session), [state.session?.toolCalls])
  const latestRunMessage = [...timelineMessages].reverse().find(message => message.role === 'assistant' && message.run)
  const latestRun = latestRunMessage?.run
  const latestRunId = state.session?.activeRun?.id ?? latestRunMessage?.runId
  const runningSubtaskRun = state.session?.activeRun
  const taskState = getPilotTaskState(state)
  const taskTone = getPilotTaskTone(taskState)
  const isExecuting = taskTone === 'running'
  const activities = state.session?.activeRun?.activities || [...state.messages].reverse().find(message => message.run)?.run?.activities || []
  const changes = state.messages.flatMap(message => (message.fileChanges || []).map(change => ({ ...change, key: `${message.id}:${change.toolCallId}` })))
  const changedFileCount = state.session?.changeSummary?.files.filter(file => !file.unchanged).length ?? new Set(changes.map(change => change.path)).size
  const project = state.projects.find(item => item.id === state.session?.projectId)
  const hasTaskProgress = Boolean(state.session?.goal) || goalDetailsRequest > 0 || workflowRuns.runs.length > 0 || Boolean(workflowRuns.error) || state.messages.length > 0 || activities.length > 0 || Boolean(state.permission) || interaction?.status === 'waiting'
  const workspaceSessionId = state.session?.id
  const workspaceOwnerId = workspaceSessionId || 'draft'
  const previousWorkspaceOwner = useRef(workspaceOwnerId)
  const promotingDraftWorkspace = previousWorkspaceOwner.current === 'draft' && workspaceOwnerId !== 'draft' && state.session?.draftState === 'prepared'
  // Keep the same leaves during the preparation render, before moving their preference owner.
  const taskWorkspace = workspaceSessions[workspaceOwnerId] || (promotingDraftWorkspace ? workspaceSessions.draft : undefined) || createWorkspaceSession()
  useEffect(() => {
    previousWorkspaceOwner.current = workspaceOwnerId
    if (!promotingDraftWorkspace) return
    setWorkspaceSessions(previous => {
      if (!previous.draft) return previous
      const { draft, ...remaining } = previous
      return { ...remaining, [workspaceOwnerId]: previous[workspaceOwnerId] || draft }
    })
  }, [workspaceOwnerId])
  const taskLayout = useMemo(() => readMiraTaskLayout(taskWorkspace.taskLayout, taskWorkspace.tabs.flatMap(tab => tab.taskSessionId ? [tab.taskSessionId] : [])), [taskWorkspace.taskLayout, taskWorkspace.tabs])
  const taskPaneIds = miraTaskPaneIds(taskLayout).filter(id => id !== MIRA_PRIMARY_TASK_PANE)
  const taskPaneTabs = taskWorkspace.tabs.filter(tab => tab.taskSessionId && taskPaneIds.includes(tab.taskSessionId))
  // Shell tools keep the last conversation selection when focus enters a resource panel.
  const selectedTask = useRef({ owner: workspaceOwnerId, pane: 'main' })
  if (selectedTask.current.owner !== workspaceOwnerId || selectedTask.current.pane !== 'main' && !taskPaneIds.includes(selectedTask.current.pane)) selectedTask.current = { owner: workspaceOwnerId, pane: 'main' }
  if (focusedPane === 'main' || taskPaneIds.includes(focusedPane)) selectedTask.current.pane = focusedPane
  const activeTaskPane = selectedTask.current.pane
  const focusedTaskId = activeTaskPane === 'main' ? workspaceSessionId : activeTaskPane
  const [paneHandles, setPaneHandles] = useState<Record<string, MiraTaskPaneHandle>>({})
  const bindTaskPane = useCallback((id: string, handle?: MiraTaskPaneHandle) => {
    setPaneHandles(previous => {
      if (previous[id] === handle) return previous
      const next = { ...previous }
      if (handle) next[id] = handle
      else delete next[id]
      return next
    })
  }, [])
  const resourceController = activeTaskPane === 'main' ? controller : paneHandles[activeTaskPane]?.controller ?? controller
  const resourceState = useSyncExternalStore(resourceController.subscribe, resourceController.getSnapshot)
  const resourceSessionId = focusedTaskId
  const resourceOwnerId = resourceSessionId || 'draft'
  const resourceReady = resourceState.session?.id === resourceSessionId && !resourceState.sessionLoading
  const resourceComposer = activeTaskPane === 'main' ? composerRef : paneHandles[activeTaskPane]?.composerRef
  const workspace = activeTaskPane === 'main' ? taskWorkspace : workspaceSessions[resourceOwnerId] || createWorkspaceSession()
  const workspaceTab = workspace.tabs.find(tab => tab.id === workspace.activeTab && !tab.taskSessionId)?.id ?? [...workspace.tabs].reverse().find(tab => !tab.taskSessionId)?.id ?? 'overview'
  const visibleSideTask = workspaceOpen && mainView === 'conversation' && !state.sessionLoading ? workspace.tabs.find(tab => tab.id === workspaceTab) : undefined
  const visibleSideTaskId = visibleSideTask?.taskSessionId ?? visibleSideTask?.childSessionId
  useEffect(() => { setTaskRename(undefined) }, [focusedTaskId])
  const renamingTask = taskRename?.sessionId === focusedTaskId && Boolean(taskRename)
  const searchSession = focusedTaskId === workspaceSessionId ? state.session : state.sessions.find(session => session.id === focusedTaskId)
  const resourceSession = resourceReady ? resourceState.session : undefined
  const resourceSelection = useRef(resourceSessionId)
  resourceSelection.current = resourceSessionId
  const resourceChanges = resourceState.messages.flatMap(message => (message.fileChanges || []).map(change => ({ ...change, key: `${message.id}:${change.toolCallId}` })))
  const resourcePlans = miraSessionPlans(resourceSession)
  const resourceProject = state.projects.find(item => item.id === searchSession?.projectId)
  const resourceDirectory = resourceProject?.directory || searchSession?.workingDirectory
  useEffect(() => {
    if (focusedPane !== 'main' && focusedPane !== 'workspace' && focusedPane !== 'bottom-terminal' && focusedPane !== visibleSideTaskId && !taskPaneIds.includes(focusedPane)) setFocusedPane('main')
  }, [focusedPane, visibleSideTaskId, taskLayout])
  useEffect(() => {
    const visible = mainView === 'conversation' && !state.sessionLoading
    controller.setVisibleSessionIds(visible ? [workspaceSessionId, visibleSideTaskId, ...taskPaneIds].filter((id): id is string => Boolean(id)) : [], taskPaneIds.length ? workspaceSessionId : undefined)
  }, [controller, mainView, state.sessionLoading, workspaceSessionId, visibleSideTaskId, taskLayout])
  useEffect(() => () => controller.setVisibleSessionIds([]), [controller])
  const browserSelection = useRef<MiraBrowserTabIdentity | undefined>(undefined)
  browserSelection.current = workspaceOpen && mainView === 'conversation' && resourceSessionId && isWorkspaceBrowserTab(workspaceTab) ? { sessionId: resourceSessionId, tabId: workspaceTab } : undefined
  const browserResidency = useMemo(() => new MiraBrowserResidency({
    protected: async tab => (await controller.browserProtectedFor(tab.sessionId, tab.tabId)).protected,
    close: closeResidentBrowser,
    onError: error => controller.reportError(error),
  }), [controller, workspacePreferences])
  useEffect(() => {
    if (!controller.supportsBrowserResidency) return
    browserResidency.connect()
    const remove = controller.onBrowserEvent(event => browserResidency.report({ sessionId: event.sessionId, tabId: event.browserId ?? 'browser' }, event.loading))
    return () => { remove(); browserResidency.dispose() }
  }, [controller, browserResidency])
  useEffect(() => {
    if (!workspacePreferencesLoaded || !controller.supportsBrowserResidency) return
    browserResidency.sync(Object.entries(workspaceSessions).flatMap(([sessionId, state]) => state.tabs.filter(tab => isWorkspaceBrowserTab(tab.id)).map(tab => ({ sessionId, tabId: tab.id }))), browserSelection.current)
  }, [browserResidency, workspacePreferencesLoaded, workspaceSessions, workspaceOpen, resourceSessionId, workspaceTab, mainView])
  const terminalOwnerRef = useRef({ sessionId: resourceSessionId, tabId: workspaceTab, active: workspaceOpen })
  terminalOwnerRef.current = { sessionId: resourceSessionId, tabId: workspaceTab, active: workspaceOpen }
  const workspaceTabs = useMemo(() => workspace.tabs.filter(tab => !tab.taskSessionId).map(tab => {
    const title = tab.taskSessionId && state.sessions.find(session => session.id === tab.taskSessionId)?.title
    return title && title !== tab.label ? { ...tab, label: title } : tab
  }), [workspace.tabs, state.sessions])
  const selectedChangeId = workspace.selectedChangeId
  const fileDirectory = project?.directory || state.session?.workingDirectory
  useEffect(() => {
    if (!resourceSessionId || state.sessionLoading) return
    setTerminalViews(previous => previous.some(item => item.sessionId === resourceSessionId && item.directory !== resourceDirectory)
      ? previous.map(item => item.sessionId === resourceSessionId ? { ...item, directory: resourceDirectory } : item)
      : previous)
  }, [resourceSessionId, resourceDirectory, state.sessionLoading])
  const conversationMemoryKey = conversationScrollKey(workspaceSessionId, fileDirectory)
  const sidebarFileProject = state.projects.find(item => item.id === sidebarFileTarget?.projectId && item.directory === sidebarFileTarget.directory)
  const sidebarFileSession = state.sessions.find(item => item.id === sidebarFileTarget?.sessionId && item.workingDirectory === sidebarFileTarget.directory)
  const sidebarFilesOpen = Boolean(sidebarFileProject || sidebarFileSession)
  const sidebarFilesCanUseTask = Boolean(!state.sessionLoading && mainView === 'conversation' && (sidebarFileProject && state.session?.projectId === sidebarFileProject.id || sidebarFileSession && state.session?.id === sidebarFileSession.id))
  useEffect(() => { if (sidebarFileTarget && !sidebarFilesOpen) setSidebarFileTarget(undefined) }, [sidebarFileTarget, sidebarFilesOpen])
  const workspaceWatchKey = JSON.stringify([resourceSessionId, resourceDirectory])
  const onWatchDirectoriesChange = useMemo(() => (paths: string[]) => setWatchedTreeDirectories(previous => previous.key === workspaceWatchKey && JSON.stringify(previous.paths) === JSON.stringify(paths) ? previous : { key: workspaceWatchKey, paths }), [workspaceWatchKey])
  const watchedPaths = workspaceWatchPaths(watchedTreeDirectories.key === workspaceWatchKey ? watchedTreeDirectories.paths : [], workspaceTabs.flatMap(tab => tab.path && !tab.projectId ? [tab.path] : []), sessionsOpen && (sidebarFilesOpen ? Boolean(sidebarFileSession && sidebarFilesCanUseTask) : workspace.fileTreeOpen), workspaceOpen)
  const workspaceWatch = useWorkspaceWatch(resourceController, resourceSessionId, resourceDirectory, watchedPaths)
  useEffect(() => {
    setTerminalViews(previous => {
      const live = new Set(state.sessions.map(session => session.id))
      const next = previous.filter(item => live.has(item.sessionId))
      return next.length === previous.length ? previous : next
    })
    setBrowserViews(previous => { const live = new Set(state.sessions.map(session => session.id)); const next = previous.filter(item => live.has(item.sessionId)); return next.length === previous.length ? previous : next })
  }, [state.sessions])
  useEffect(() => {
    if (!workspaceOpen || !resourceSessionId) return
    if (isWorkspaceTerminalTab(workspaceTab)) startTerminalView(resourceSessionId, workspaceTab)
    if (isWorkspaceBrowserTab(workspaceTab)) startBrowserView(resourceSessionId, workspaceTab)
  }, [workspaceOpen, resourceSessionId, workspaceTab])

  function setWorkspaceSessions(update: (previous: Record<string, WorkspaceSessionState>) => Record<string, WorkspaceSessionState>) {
    workspacePreferences.latest = update(workspacePreferences.latest)
    setWorkspaceSessionsState(workspacePreferences.latest)
  }

  function loadWorkspacePreferences(): Promise<void> {
    if (workspacePreferences.ready) return Promise.resolve()
    if (workspacePreferences.loading) return workspacePreferences.loading
    const loading = Promise.resolve().then(() => controller.getPreference(WORKSPACE_PREFERENCE_KEY)).then(value => {
      const restored = readWorkspaceSessions(value)
      workspacePreferences.saved = restored
      // A local session edit or intentional clear wins over a late saved snapshot.
      workspacePreferences.latest = Object.keys(workspacePreferences.latest).length ? { ...restored, ...workspacePreferences.latest } : restored
      if (workspacePreferences.deleted.size) {
        workspacePreferences.latest = withoutWorkspaceTaskOwners(workspacePreferences.latest, workspacePreferences.deleted)
      }
      workspacePreferences.ready = true
      if (workspacePreferences.mounted) {
        setWorkspaceSessionsState(workspacePreferences.latest)
        setWorkspacePreferencesLoaded(true)
      }
    }).finally(() => { if (workspacePreferences.loading === loading) workspacePreferences.loading = undefined })
    workspacePreferences.loading = loading
    return loading
  }

  async function persistWorkspace(): Promise<void> {
    await loadWorkspacePreferences()
    if (workspacePreferences.saving) {
      await workspacePreferences.saving
      if (workspacePreferences.latest !== workspacePreferences.saved) return persistWorkspace()
      return
    }
    const saving = (async () => {
      while (workspacePreferences.latest !== workspacePreferences.saved) {
        const snapshot = workspacePreferences.latest
        await controller.setPreference(WORKSPACE_PREFERENCE_KEY, snapshot, true)
        workspacePreferences.saved = snapshot
      }
    })()
    workspacePreferences.saving = saving
    try { await saving } finally { if (workspacePreferences.saving === saving) workspacePreferences.saving = undefined }
  }

  function updateWorkspace(update: (current: WorkspaceSessionState) => WorkspaceSessionState) {
    if (resourceController.getSnapshot().sessionLoading || (resourceController.getSnapshot().session?.id || 'draft') !== resourceOwnerId) return
    setWorkspaceSessions(previous => ({ ...previous, [resourceOwnerId]: update(previous[resourceOwnerId] || createWorkspaceSession()) }))
  }

  function updateTaskWorkspace(update: (current: WorkspaceSessionState) => WorkspaceSessionState) {
    if (controller.getSnapshot().sessionLoading || (controller.getSnapshot().session?.id || 'draft') !== workspaceOwnerId) return
    setWorkspaceSessions(previous => ({ ...previous, [workspaceOwnerId]: update(previous[workspaceOwnerId] || createWorkspaceSession()) }))
  }

  async function closeResidentBrowser(tab: MiraBrowserTabIdentity, current: () => boolean) {
    let closed = false
    const previous = workspacePreferences.saving
    const eligible = () => workspacePreferences.mounted && current() && !(browserSelection.current?.sessionId === tab.sessionId && browserSelection.current.tabId === tab.tabId)
    const saving = Promise.resolve().then(async () => {
      await previous
      if (!eligible()) return
      const before = workspacePreferences.latest, owner = before[tab.sessionId]
      if (!owner?.tabs.some(item => item.id === tab.tabId)) return
      const next = { ...before, [tab.sessionId]: removeWorkspaceTab(owner, tab.tabId as WorkspaceTabId) }
      await controller.setPreference(WORKSPACE_PREFERENCE_KEY, next, true)
      workspacePreferences.saved = next
      // Selection, page activity or media/download protection may change while storage awaits.
      let keep = !eligible(), protectionError: unknown
      if (!keep) {
        try { keep = (await controller.browserProtectedFor(tab.sessionId, tab.tabId)).protected || !eligible() }
        catch (error) { keep = true; protectionError = error }
      }
      if (keep) {
        const restored = workspacePreferences.latest
        await controller.setPreference(WORKSPACE_PREFERENCE_KEY, restored, true)
        workspacePreferences.saved = restored
        if (protectionError) throw protectionError
        return
      }
      setWorkspaceSessions(latest => {
        if (latest === before) return next
        const owner = latest[tab.sessionId]
        return owner ? { ...latest, [tab.sessionId]: removeWorkspaceTab(owner, tab.tabId as WorkspaceTabId) } : latest
      })
      setBrowserViews(views => views.filter(item => item.sessionId !== tab.sessionId || item.tabId !== tab.tabId))
      closed = true
    })
    workspacePreferences.saving = saving
    try { await saving; return closed }
    finally { if (workspacePreferences.saving === saving) workspacePreferences.saving = undefined }
  }
  function updateSidebarFiles(patch: { expandedPaths?: string[]; selectedPath?: string }) {
    setSidebarFileTarget(previous => previous && sidebarFileTarget && previous.projectId === sidebarFileTarget.projectId && previous.sessionId === sidebarFileTarget.sessionId && previous.directory === sidebarFileTarget.directory ? { ...previous, ...patch } : previous)
  }

  function openPlanDetail(id: string) {
    const snapshot = resourceController.getSnapshot()
    if (!workspacePreferences.mounted || !resourceSessionId || snapshot.sessionLoading || snapshot.session?.id !== resourceSessionId || mainViewRef.current !== 'conversation') return
    const plan = miraSessionPlans(snapshot.session).find(item => item.id === id)
    if (!plan) return
    updateWorkspace(current => addWorkspaceTab(current, createWorkspacePlanTab(plan.id, plan.title)))
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }

  function openRunProgress(runId: string) {
    const snapshot = resourceController.getSnapshot()
    if (!workspacePreferences.mounted || !resourceSessionId || snapshot.sessionLoading || snapshot.session?.id !== resourceSessionId || mainViewRef.current !== 'conversation' || !selectMiraRunActivity(snapshot.session, runId)) return
    updateWorkspace(current => addWorkspaceTab(current, createWorkspaceRunTab(runId)))
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }

  async function openModelTrace(sessionId: string) {
    if (!workspacePreferences.ready || navigation.busy || controller.getSnapshot().sessionLoading) return
    const owner = controller.getSnapshot().session?.id || 'draft'
    const revision = mainViewRef.current === 'conversation' ? viewRevision.current : await showView('conversation')
    if (!currentNavigation(revision) || !workspacePreferences.mounted || (controller.getSnapshot().session?.id || 'draft') !== owner) return
    const task = controller.getSnapshot().sessions.find(item => item.id === sessionId)
    if (!task && controller.getSnapshot().session?.id !== sessionId) throw new Error('任务已不存在，请刷新后重试')
    updateWorkspace(current => addWorkspaceTab(current, createWorkspaceTraceTab(sessionId, task?.title || controller.getSnapshot().session?.title || '')))
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }

  function openCommand(runId: string, toolId: string, fullOutput = false) {
    const snapshot = resourceController.getSnapshot()
    if (!workspacePreferences.mounted || !resourceSessionId || snapshot.sessionLoading || snapshot.session?.id !== resourceSessionId || mainViewRef.current !== 'conversation') return
    const tool = miraSessionCommand(snapshot.session, resourceSessionId, runId, toolId)
    if (!tool) return
    if (fullOutput && (tool.inherited || !tool.commandJob?.fullOutputAvailable)) return
    updateWorkspace(current => addWorkspaceTab(current, fullOutput ? createWorkspaceCommandOutputTab(runId, toolId) : createWorkspaceCommandTab(runId, toolId, miraRecordedCommand(tool) || '命令输出')))
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }


  function openSubtask(runId: string, subtaskId: string) {
    const snapshot = resourceController.getSnapshot()
    if (!workspacePreferences.mounted || !resourceSessionId || snapshot.sessionLoading || snapshot.session?.id !== resourceSessionId || mainViewRef.current !== 'conversation') return
    const selected = selectMiraSubtask(snapshot.session, runId, subtaskId)
    if (!selected) return
    updateWorkspace(current => addWorkspaceTab(current, createWorkspaceSubtaskTab(runId, subtaskId, selected.subtask.task)))
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }

  function openRunningSubtasks(runId: string, subtaskId?: string) {
    const snapshot = resourceController.getSnapshot(), run = snapshot.session?.activeRun
    if (!resourceSessionId || snapshot.sessionLoading || snapshot.session?.id !== resourceSessionId || run?.id !== runId || mainViewRef.current !== 'conversation') return
    const active = (run.subtasks ?? []).filter(task => task.status === 'queued' || task.status === 'running' || task.status === 'stopping')
    if (subtaskId) { if (active.some(task => task.id === subtaskId)) openSubtask(runId, subtaskId) }
    else if (active.length) openRunProgress(runId)
  }

  async function stopSubtask(runId: string, subtaskId: string) {
    const snapshot = resourceController.getSnapshot()
    if (!workspacePreferences.mounted || !resourceSessionId || snapshot.sessionLoading || snapshot.session?.id !== resourceSessionId || snapshot.session.activeRun?.id !== runId || mainViewRef.current !== 'conversation') return
    const selected = selectMiraSubtask(snapshot.session, runId, subtaskId)
    if (!selected || !['queued', 'running'].includes(selected.subtask.status)) return
    const requestRevision = viewRevision.current
    try { await resourceController.stopSubtasks(subtaskId) } catch (error) {
      const current = resourceController.getSnapshot()
      if (workspacePreferences.mounted && requestRevision === viewRevision.current && current.session?.id === resourceSessionId && current.session.activeRun?.id === runId && !current.sessionLoading && mainViewRef.current === 'conversation') throw error
    }
  }

  function openActivityFile(path: string) {
    const snapshot = controller.getSnapshot()
    if (snapshot.session?.id === workspaceSessionId && !snapshot.sessionLoading && mainViewRef.current === 'conversation') openFilePreview(path)
  }

  function openConversationLink(sessionId: string, url: string) {
    const ownerController = sessionId === workspaceSessionId ? controller : paneHandles[sessionId]?.controller
    const snapshot = ownerController?.getSnapshot()
    if (!workspacePreferences.mounted || mainViewRef.current !== 'conversation' || !sessionId || snapshot?.sessionLoading || snapshot?.session?.id !== sessionId) return
    const tab = createWorkspaceBrowserTab(url)
    setWorkspaceSessions(previous => ({ ...previous, [sessionId]: addWorkspaceTab(previous[sessionId] || createWorkspaceSession(), tab) }))
    startBrowserView(sessionId, tab.id)
    setBrowserRequest({ sessionId, browserId: tab.id, url })
    setFocusedPane(sessionId === workspaceSessionId ? 'main' : sessionId)
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }

  function openResourceAddress(sessionId: string, tabId: WorkspaceTabId, url: string) {
    const snapshot = resourceController.getSnapshot(), owner = terminalOwnerRef.current
    if (!workspacePreferences.mounted || snapshot.sessionLoading || snapshot.session?.id !== sessionId || owner.sessionId !== sessionId || owner.tabId !== tabId || !owner.active || mainViewRef.current !== 'conversation') return
    const tab = createWorkspaceBrowserTab(url)
    updateWorkspace(current => addWorkspaceTab(current, tab))
    startBrowserView(sessionId, tab.id)
    setBrowserRequest({ sessionId, browserId: tab.id, url })
  }

  function openBottomTerminalAddress(sessionId: string, url: string) {
    const snapshot = resourceController.getSnapshot()
    if (!workspacePreferences.mounted || !bottomTerminalOpenRef.current || snapshot.sessionLoading || snapshot.session?.id !== sessionId || mainViewRef.current !== 'conversation') return
    const tab = createWorkspaceBrowserTab(url)
    updateWorkspace(current => addWorkspaceTab(current, tab))
    startBrowserView(sessionId, tab.id)
    setBrowserRequest({ sessionId, browserId: tab.id, url })
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }

  async function openWorkspaceTab(id: WorkspaceResourceId, label?: string, isCurrent?: () => boolean) {
    if (id === 'side-chat') { await openSideConversation(); return }
    if (preparingWorkspace || resourceState.sessionLoading || isCurrent && !isCurrent()) return
    if (id === 'overview') { const runId = resourceSession?.activeRun?.id ?? [...resourceState.messages].reverse().find(message => message.runId)?.runId; if (runId) openRunProgress(runId); return }
    if (id === 'files') {
      const projectId = resourceState.session?.projectId || draftProjectId
      if (projectId) { await openProjectFiles(projectId); return }
      if (!resourceSessionId) { resourceController.reportError(new Error('请先在侧栏选择项目')); return }
      setSidebarFileTarget(undefined)
    }
    let sessionId = resourceSessionId
    if (!sessionId) {
      setPreparingWorkspace(true)
      try { sessionId = await resourceComposer?.current?.prepareSession(isCurrent) } finally { setPreparingWorkspace(false) }
    }
    if (isCurrent && !isCurrent() || resourceSessionId && resourceSelection.current !== resourceSessionId) return
    if (!sessionId || resourceController.getSnapshot().session?.id !== sessionId) {
      if (isCurrent) throw new Error(resourceController.getSnapshot().error || '工作区准备失败，请重试')
      return
    }
    if (id === 'files') {
      setWorkspaceSessions(previous => ({ ...previous, [sessionId]: { ...(previous[sessionId] || createWorkspaceSession()), fileTreeOpen: true } }))
      setSessionsOpen(true)
      return
    }
    const tab = id === 'terminal' ? createWorkspaceTerminalTab(resourceController.getSnapshot().session?.workingDirectory || resourceDirectory || '', (workspacePreferences.latest[sessionId] || createWorkspaceSession()).tabs) : id === 'browser' ? createWorkspaceBrowserTab() : { id, label: label || workspaceTabLabel(id) }
    setWorkspaceSessions(previous => ({ ...previous, [sessionId]: addWorkspaceTab(previous[sessionId] || createWorkspaceSession(), tab) }))
    if (isWorkspaceTerminalTab(tab.id)) startTerminalView(sessionId, tab.id)
    if (isWorkspaceBrowserTab(tab.id)) startBrowserView(sessionId, tab.id)
    setWorkspaceMounted(true)
    setWorkspaceOpen(true)
  }

  function canOpenTaskPane(id: string) {
    const snapshot = controller.getSnapshot()
    const focusedId = focusedPane === 'main' ? snapshot.session?.id : focusedPane
    return workspacePreferences.ready && !snapshot.sessionLoading && focusedId !== id && snapshot.sessions.some(session => session.id === id) && (Boolean(taskGroupOwner(id)) || taskWorkspace.tabs.some(tab => tab.taskSessionId === id) || id === snapshot.session?.id || taskPaneIds.length < 3)
  }

  function taskGroupOwner(id: string) {
    const currentOwner = controller.getSnapshot().session?.id || 'draft', groups = workspacePreferences.latest
    if (groups[currentOwner]?.tabs.some(tab => tab.taskSessionId === id) || currentOwner === id) return currentOwner
    if (groups[id]?.tabs.some(tab => tab.taskSessionId)) return id
    return Object.entries(groups).find(([owner, state]) => owner !== 'draft' && controller.getSnapshot().sessions.some(session => session.id === owner) && state.tabs.some(tab => tab.taskSessionId === id))?.[0]
  }

  async function openTaskPane(id: string, focusExisting = false, target?: { messageId?: string; filePath?: string; execution?: boolean }, placement?: { anchor: string; side: MiraTaskSplitSide }) {
    const groupOwner = taskGroupOwner(id)
    if (groupOwner && groupOwner !== (controller.getSnapshot().session?.id || 'draft')) {
      if (!await openTask(groupOwner)) return false
      return openTaskPane(id, true, target)
    }
    const owner = controller.getSnapshot().session?.id || 'draft', revision = viewRevision.current, requestRevision = ++taskPaneRequestRevision.current
    const existingTarget = () => id === owner || Boolean(workspacePreferences.latest[owner]?.tabs.some(tab => tab.taskSessionId === id))
    const current = () => workspacePreferences.mounted && revision === viewRevision.current && requestRevision === taskPaneRequestRevision.current && (controller.getSnapshot().session?.id || 'draft') === owner && (!focusExisting || existingTarget())
    if (!canOpenTaskPane(id) && !(focusExisting && workspacePreferences.ready && !controller.getSnapshot().sessionLoading && existingTarget())) return false
    await controller.flushBeforeNavigation()
    if (!current()) return false
    const sessionTarget = await controller.require('getSession')(id)
    if (sessionTarget.archivedAt || sessionTarget.draftState === 'prepared') throw new Error('任务已不可用，请重新选择')
    if (!current()) return false
    if (mainViewRef.current !== 'conversation' && !await showView('conversation')) return false
    if (id === controller.getSnapshot().session?.id) {
      setFocusedPane('main')
      void controller.markSessionRead(id)
      if (target?.messageId) setSearchTarget({ sessionId: id, messageId: target.messageId })
      if (target?.filePath) {
        const tab = createWorkspaceFileTab(target.filePath)
        updateTaskWorkspace(current => ({ ...addWorkspaceTab(current, tab), selectedFilePath: target.filePath }))
        setWorkspaceMounted(true); setWorkspaceOpen(true)
      }
      if (target?.execution) {
        const runId = sessionTarget.activeRun?.id ?? [...sessionTarget.messages].reverse().find(message => message.role === 'assistant' && message.run)?.runId
        if (runId && selectMiraRunActivity(sessionTarget, runId)) {
          updateTaskWorkspace(current => addWorkspaceTab(current, createWorkspaceRunTab(runId)))
          setWorkspaceMounted(true); setWorkspaceOpen(true)
        }
      }
      window.requestAnimationFrame(() => geometry.conversationRef.current?.querySelector<HTMLElement>('main.mira-thread-panel:not([hidden])')?.focus({ preventScroll: true }))
      return true
    }
    setWorkspaceSessions(previous => {
      const state = previous[owner] || createWorkspaceSession()
      const anchor = placement?.anchor ?? (state.tabs.some(tab => tab.taskSessionId === focusedPane) ? focusedPane : MIRA_PRIMARY_TASK_PANE)
      return { ...previous, [owner]: placeWorkspaceTask(state, createWorkspaceTaskTab(id, sessionTarget.title), anchor, placement?.side ?? 'right') }
    })
    setFocusedPane(id)
    void controller.markSessionRead(id)
    setTaskPaneFocus({ id, revision: requestRevision, ...target })
    return true
  }

  const taskPaneEntry = { open: openTaskPane, canOpen: canOpenTaskPane, canDrag: (id: string) => canOpenTaskPane(id) && !taskGroupOwner(id) }

  async function openSideConversation(reference?: MiraConversationSelection, input?: HarnessSideConversationInput) {
    const parent = resourceController.getSnapshot().session
    if (!parent || parent.draftState === 'prepared' || parent.parentSessionId || resourceState.sessionLoading) {
      const error = new Error('请先打开一个主任务')
      if (input) throw error
      resourceController.reportError(error); return
    }
    const parentId = parent.id, revision = viewRevision.current
    try {
      if (reference && reference.sessionId !== parentId) return
      const current = workspacePreferences.latest[parentId] ?? createWorkspaceSession()
      const selected = current.tabs.find(tab => tab.id === current.activeTab && tab.childSessionId) ?? [...current.tabs].reverse().find(tab => tab.childSessionId)
      let child: HarnessSession | undefined
      let unavailableTab: WorkspaceTabId | undefined
      if (reference && selected?.childSessionId) {
        try {
          child = await resourceController.require('getSession')(selected.childSessionId)
          if (child.parentSessionId !== parentId) throw new Error('侧边栏对话不属于当前主任务')
          if (child.archivedAt) { child = undefined; unavailableTab = selected.id }
        } catch (error) {
          if (error instanceof Error && error.message.includes('未找到会话')) { child = undefined; unavailableTab = selected.id }
          else throw error
        }
      }
      if (!child) {
        const pendingKey = input ? `${parentId}\u0000input\u0000${input.submissionId}` : parentId
        let pending = pendingSideConversation.current.get(pendingKey)
        if (!pending) {
          pending = input ? resourceController.createSideConversation(parentId, input) : resourceController.createSideConversation(parentId)
          pendingSideConversation.current.set(pendingKey, pending)
          void pending.finally(() => { if (pendingSideConversation.current.get(pendingKey) === pending) pendingSideConversation.current.delete(pendingKey) }).catch(() => undefined)
        }
        child = await pending
      }
      if (!workspacePreferences.mounted) return
      // A late creation stays attached to its original parent, without navigating the new main task.
      setWorkspaceSessions(previous => {
        const current = previous[parentId] ?? createWorkspaceSession()
        return { ...previous, [parentId]: addWorkspaceTab({ ...current, tabs: current.tabs.filter(tab => tab.id !== unavailableTab), recentClosedTabs: current.recentClosedTabs.filter(tab => tab.id !== unavailableTab) }, createWorkspaceSideConversationTab(child!.id)) }
      })
      if (reference) setSideQuotes(previous => ({ ...previous, [child!.id]: [...(previous[child!.id] ?? []), { id: crypto.randomUUID(), reference }] }))
      if (resourceSelection.current !== parentId || resourceController.getSnapshot().session?.id !== parentId || revision !== viewRevision.current || mainViewRef.current !== 'conversation') return
      setWorkspaceMounted(true); setWorkspaceOpen(true)
      if (input) {
        setFocusedPane(child.id)
        setTaskPaneFocus({ id: child.id, revision: ++viewRevision.current })
      }
    } catch (error) { if (input) throw error; if (resourceController.getSnapshot().session?.id === parentId) resourceController.reportError(error) }
  }
  async function openComposerSideConversation(input?: HarnessSideConversationInput) {
    await openSideConversation(undefined, input)
    return true
  }

  function openFilePreview(path: string, sessionId = resourceSessionId) {
    const ownerController = sessionId === workspaceSessionId ? controller : sessionId ? paneHandles[sessionId]?.controller : undefined
    const snapshot = ownerController?.getSnapshot()
    if (!sessionId || snapshot?.sessionLoading || snapshot?.session?.id !== sessionId) return
    const tab = createWorkspaceFileTab(path)
    setWorkspaceSessions(previous => ({ ...previous, [sessionId]: { ...addWorkspaceTab(previous[sessionId] || createWorkspaceSession(), tab), selectedFilePath: path } }))
    setWorkspaceMounted(true)
    setWorkspaceOpen(true)
  }

  function openSidebarFilePreview(path: string) {
    if (!sidebarFileProject || sidebarFilesCanUseTask) { openFilePreview(path); return }
    if (state.sessionLoading || mainView !== 'conversation') return
    const tab = createWorkspaceFileTab(path, sidebarFileProject.id)
    updateWorkspace(current => addWorkspaceTab(current, tab))
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }
  async function openSidebarHtml(path: string, isCurrent: () => boolean) {
    const projectId = sidebarFileProject?.id
    const fileSessionId = sidebarFilesOpen ? sidebarFileSession?.id : resourceSessionId
    if ((!projectId && !fileSessionId) || !isCurrent()) return
    if (mainViewRef.current !== 'conversation' && !currentNavigation(await showView('conversation'))) return
    if (!isCurrent()) return
    const revision = viewRevision.current, originalSessionId = resourceSessionId
    const current = () => isCurrent() && workspacePreferences.mounted && revision === viewRevision.current && mainViewRef.current === 'conversation' && (!originalSessionId || resourceSelection.current === originalSessionId)
    const url = await resourceController.getWorkspaceHtmlUrl(projectId ? { projectId } : { sessionId: fileSessionId! }, path)
    if (!current()) return
    let sessionId = originalSessionId
    if (!sessionId) {
      setPreparingWorkspace(true)
      try { sessionId = await resourceComposer?.current?.prepareSession(current) } finally { setPreparingWorkspace(false) }
    }
    if (!current()) return
    if (!sessionId || resourceController.getSnapshot().session?.id !== sessionId) throw new Error(resourceController.getSnapshot().error || '工作区准备失败，请重试')
    const tab = { ...createWorkspaceBrowserTab(url), htmlSource: { ...(projectId ? { projectId } : { sessionId: fileSessionId! }), path } }
    setWorkspaceSessions(previous => ({ ...previous, [sessionId]: addWorkspaceTab(previous[sessionId] || createWorkspaceSession(), tab) }))
    startBrowserView(sessionId, tab.id)
    setBrowserRequest({ sessionId, browserId: tab.id, url })
    setWorkspaceMounted(true); setWorkspaceOpen(true)
  }
  function openPresentationReference(reference: MiraPresentationReference) {
    const snapshot = controller.getSnapshot()
    if (!readMiraPresentationReference(reference) || snapshot.session?.id !== reference.sessionId || snapshot.sessionLoading || mainViewRef.current !== 'conversation') {
      controller.reportError('此引用属于其他任务，请先返回原任务。'); return
    }
    setPresentationNavigation({ requestId: crypto.randomUUID(), reference })
    openFilePreview(reference.sourcePath)
  }

  function addFileToConversation(path: string) {
    if (!resourceSessionId) return
    resourceComposer?.current?.addFileReference(resourceSessionId, path)
  }

  async function closeWorkspaceContents(update: (current: WorkspaceSessionState) => WorkspaceSessionState, reportFailure = true) {
    const ownerId = resourceSessionId, revision = viewRevision.current
    const before = workspacePreferences.latest[ownerId || 'draft'] ?? workspace
    const next = update(before)
    try { await resourceController.flushBeforeNavigation(reportFailure) } catch (error) { if (!reportFailure) throw error; return false }
    if (revision !== viewRevision.current || resourceSelection.current !== ownerId || resourceController.getSnapshot().session?.id !== ownerId || workspacePreferences.latest[ownerId || 'draft'] !== before) return false
    updateWorkspace(update)
    if (!next.tabs.some(tab => !tab.taskSessionId) && !workspaceManuallyOpened.current) dismissWorkspace()
    if (!resourceSessionId) return true
    // 批量关闭也必须卸载终端来回收 PTY；相邻标签回退到终端时则启动其视图。
    setTerminalViews(previous => previous.filter(item => item.sessionId !== resourceSessionId || next.tabs.some(tab => tab.id === item.tabId)))
    setBrowserViews(previous => previous.filter(item => item.sessionId !== resourceSessionId || next.tabs.some(tab => tab.id === item.tabId)))
    if (isWorkspaceTerminalTab(next.activeTab)) startTerminalView(resourceSessionId, next.activeTab)
    return true
  }

  async function closeWorkspaceTab(id: WorkspaceTabId, reportFailure = true) {
    if (taskWorkspace.tabs.some(tab => tab.id === id && tab.taskSessionId)) {
      const owner = workspaceOwnerId, revision = viewRevision.current
      try { await controller.flushBeforeNavigation(reportFailure) } catch (error) { if (!reportFailure) throw error; return false }
      if (revision !== viewRevision.current || (controller.getSnapshot().session?.id || 'draft') !== owner) return false
      updateTaskWorkspace(current => removeWorkspaceTab(current, id))
      return true
    }
    return closeWorkspaceContents(current => removeWorkspaceTab(current, id), reportFailure)
  }

  const closeContextAction = useRef(closeActiveResource)
  closeContextAction.current = closeActiveResource
  useEffect(() => controller.onCloseContext(() => closeContextAction.current()), [controller])
  async function closeActiveResource() {
    if (navigation.busy || state.sessionLoading || !workspacePreferences.ready) return true
    const revision = viewRevision.current, owner = resourceSessionId
    const tab = mainView === 'conversation' && workspaceOpen ? workspace.tabs.find(tab => tab.id === workspaceTab && !tab.taskSessionId) : undefined
    try {
      if (tab) {
        await closeWorkspaceTab(tab.id, false)
        return true // A superseded close must never fall through to closing the window.
      }
      const before = workspacePreferences.latest[resourceOwnerId]
      await controller.flushBeforeNavigation(false)
      return !workspacePreferences.mounted || navigation.busy || controller.getSnapshot().sessionLoading || revision !== viewRevision.current || resourceSelection.current !== owner || workspacePreferences.latest[resourceOwnerId] !== before
    } catch {
      if (!workspacePreferences.mounted || revision !== viewRevision.current || resourceSelection.current !== owner) return true
      const error = new Error('工作台保存失败，已保留当前标签和窗口，请重试。')
      controller.reportError(error)
      return true // The workbench owns this failure; show it once and keep the window.
    }
  }

  function closeResourceTabs(keep?: WorkspaceTabId) {
    return closeWorkspaceContents(current => {
      const resources = { ...current, tabs: current.tabs.filter(tab => !tab.taskSessionId) }
      const closed = keep ? removeOtherWorkspaceTabs(resources, keep) : closeAllWorkspaceTabs(resources)
      return { ...closed, taskLayout: current.taskLayout, tabs: [...closed.tabs, ...current.tabs.filter(tab => tab.taskSessionId)] }
    })
  }

  function reopenWorkspaceTab(id: WorkspaceTabId) {
    if (!workspace.recentClosedTabs.some(tab => tab.id === id)) return
    const restored = restoreWorkspaceTab(workspacePreferences.latest[resourceOwnerId] ?? workspace, id)
    updateWorkspace(() => restored)
    if (resourceSessionId && isWorkspaceTerminalTab(restored.activeTab)) startTerminalView(resourceSessionId, restored.activeTab)
    if (resourceSessionId && isWorkspaceBrowserTab(restored.activeTab)) startBrowserView(resourceSessionId, restored.activeTab)
    if (!restored.tabs.find(tab => tab.id === id)?.taskSessionId) { setWorkspaceMounted(true); setWorkspaceOpen(true) }
  }

  function setWorkspaceTabLabel(id: WorkspaceTabId, label: string) {
    updateWorkspace(current => labelWorkspaceTab(current, id, label))
  }

  function startTerminalView(sessionId: string, tabId: WorkspaceTabId) {
    const directory = resourceController.getSnapshot().session?.id === sessionId ? resourceController.getSnapshot().session?.workingDirectory : undefined
    setTerminalViews(previous => previous.some(item => item.sessionId === sessionId && item.tabId === tabId) ? previous : [...previous, { sessionId, tabId, epoch: 0, directory }])
  }

  function startBrowserView(sessionId: string, tabId: WorkspaceTabId) {
    setBrowserViews(previous => previous.some(item => item.sessionId === sessionId && item.tabId === tabId) ? previous : [...previous, { sessionId, tabId }])
  }

  function updateBrowserResource(sessionId: string, tabId: WorkspaceTabId, patch: { url?: string; label?: string; faviconUrl?: string | null }) {
    const tab = workspacePreferences.latest[sessionId]?.tabs.find(tab => tab.id === tabId)
    if (!workspacePreferences.mounted || !tab || Object.entries(patch).every(([key, value]) => tab[key as 'url' | 'label' | 'faviconUrl'] === value)) return
    let htmlSource = tab.htmlSource
    if (patch.url && htmlSource && tab.url) {
      try {
        const next = new URL(patch.url), previous = new URL(tab.url), relativePath = decodeURIComponent(next.pathname).slice(1)
        const path = relativePath.endsWith('/') || !relativePath ? relativePath + 'index.html' : relativePath
        htmlSource = next.hostname === previous.hostname && /\.(html|htm)$/i.test(path) ? { ...htmlSource, path } : undefined
      } catch { htmlSource = undefined }
    }
    setWorkspaceSessions(previous => {
      const current = previous[sessionId]
      return { ...previous, [sessionId]: { ...current, ...(tabId === 'browser' && patch.url ? { browserUrl: patch.url } : {}), tabs: current.tabs.map(tab => tab.id === tabId ? { ...tab, ...patch, ...(tab.htmlSource ? { htmlSource } : {}) } : tab) } }
    })
  }

  function restartTerminalView(tabId: WorkspaceTabId) {
    if (!resourceSessionId || !workspace.tabs.some(tab => tab.id === tabId && isWorkspaceTerminalTab(tab.id))) return
    updateWorkspace(current => ({ ...current, activeTab: tabId }))
    setTerminalViews(previous => previous.some(item => item.sessionId === resourceSessionId && item.tabId === tabId) ? previous.map(item => item.sessionId === resourceSessionId && item.tabId === tabId ? { ...item, epoch: item.epoch + 1 } : item) : [...previous, { sessionId: resourceSessionId, tabId, epoch: 0 }])
  }

  async function respondPermission(requestId: string, allowed: boolean) {
    const request = controller.getSnapshot().permission
    if (!request || request.requestId !== requestId || request.sessionId !== controller.getSnapshot().session?.id || respondingRequest.current === requestId) return
    respondingRequest.current = requestId
    setRespondingRequestId(requestId)
    setPermissionError(undefined)
    try {
      await controller.permission(allowed, requestId)
      const current = controller.getSnapshot()
      if (current.permission?.requestId === requestId) setPermissionError({ requestId, message: current.error || '权限确认未能提交，请重试。' })
    } catch (error) {
      if (controller.getSnapshot().permission?.requestId === requestId) setPermissionError({ requestId, message: error instanceof Error ? error.message : '权限确认未能提交，请重试。' })
    } finally {
      if (respondingRequest.current === requestId) respondingRequest.current = undefined
      setRespondingRequestId(current => current === requestId ? undefined : current)
    }
  }

  async function respondMemory(approved: boolean) {
    const confirmation = state.memoryConfirmation
    if (!confirmation || memoryResponding) return
    setMemoryResponding(true)
    await controller.respondMemory(confirmation.requestId, approved)
    setMemoryResponding(false)
  }

  function openSessions() {
    setSessionsOpen(value => !value)
  }

  function openWorkspace() {
    workspaceManuallyOpened.current = !workspaceOpen
    if (!workspaceOpen && isWorkspaceTerminalTab(workspaceTab) && resourceSessionId) startTerminalView(resourceSessionId, workspaceTab)
    setWorkspaceMounted(true)
    setWorkspaceOpen(value => !value)
  }

  function dismissWorkspace() {
    workspaceDismissFocus.current = true
    setWorkspaceOpen(false)
  }

  function closeBottomTerminal() {
    setBottomTerminalOpen(false)
    setFocusedPane(current => current === 'bottom-terminal' ? selectedTask.current.pane : current)
    if (document.activeElement?.closest('#mira-bottom-terminal') || focusedPane === 'bottom-terminal' && document.activeElement === document.body) bottomTerminalToggleRef.current?.focus()
  }

  async function openBottomTerminal(isCurrent: () => boolean = () => true) {
    if (preparingWorkspace || resourceState.sessionLoading || !isCurrent()) return false
    let sessionId = resourceSessionId
    if (!sessionId) {
      setPreparingWorkspace(true)
      try { sessionId = await resourceComposer?.current?.prepareSession(isCurrent) } finally { setPreparingWorkspace(false) }
    }
    const snapshot = resourceController.getSnapshot()
    if (!isCurrent() || resourceSessionId && resourceSelection.current !== resourceSessionId || !sessionId || snapshot.sessionLoading || snapshot.session?.id !== sessionId || mainViewRef.current !== 'conversation') return false
    setBottomTerminalOpen(true)
    return true
  }

  function toggleBottomTerminal() {
    if (bottomTerminalOpen) closeBottomTerminal()
    else { const revision = viewRevision.current; void openBottomTerminal(() => revision === viewRevision.current).catch(error => controller.reportError(error)) }
  }

  useEffect(() => {
    if (mainView !== 'conversation' || commandCenterOpen) return
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat || event.shiftKey || !isMiraPrimaryModifier(event)) return
      if (document.querySelector?.('[role="dialog"]:not([aria-modal="false"]), [role="menu"][data-state="open"]')) return
      const key = event.key.toLowerCase()
      // Option 和键盘布局可能改写字符；沿 ZCode 保留物理按键回退。
      if ((key === 'j' || event.code === 'KeyJ') && !event.altKey) { event.preventDefault(); event.stopPropagation(); toggleBottomTerminal() }
      else if ((key === 'b' || event.code === 'KeyB') && event.altKey) { event.preventDefault(); event.stopPropagation(); openWorkspace() }
    }
    // Capture before xterm consumes Ctrl+J as a shell linefeed.
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [mainView, commandCenterOpen, bottomTerminalOpen, preparingWorkspace, state.sessionLoading, workspaceSessionId, resourceSessionId, resourceController, workspaceOpen, workspaceTab])

  useEffect(() => {
    if (!searchTarget || mainView !== 'conversation' || state.sessionLoading || state.session?.id !== searchTarget.sessionId) return
    // Jump after the new session's virtual timeline has committed its message DOM.
    const frame = window.requestAnimationFrame(() => {
      if (searchTarget.messageId) conversationTimelineActions.current?.jumpToMessage(searchTarget.messageId, 'center')
      setSearchTarget(undefined)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [searchTarget, mainView, state.sessionLoading, state.session?.id, timelineMessages])

  async function executeNavigation(target: MiraAppNavigationTarget | undefined, isCurrent: () => boolean, draft?: 'conversation' | 'automations', projectId?: string | null, resetDraft = false, groupId?: string, draftId?: string, pluginId?: string) {
    const revision = ++viewRevision.current
    const current = () => isCurrent() && revision === viewRevision.current
    try {
      await controller.flushBeforeNavigation()
      if (!current()) return false
      const view = target?.kind ?? (draft === 'automations' ? 'automations' : 'conversation')
      if (target?.kind === 'conversation') {
        if (!await controller.open(target.sessionId, current)) {
          if (!current()) return false
          throw new Error(controller.getSnapshot().error || '任务打开失败，请重试')
        }
      } else if (view === 'automations') {
        setAutomationsMounted(true)
        const handle = automationsRef.current ?? await new Promise<AutomationsNavigationHandle | null>(resolve => automationWaiters.current.add(resolve))
        if (!handle || !current()) return false
        if (!await handle.navigate(target?.kind === 'automations' ? target : { kind: 'automations' }, current, draft === 'automations')) {
          if (!current()) return false
          throw new Error('自动化页面打开失败，请重试或确认任务仍存在')
        }
      } else if (!target) {
        if (draftId) {
          if (!await composerRef.current?.openDraft?.(draftId, current)) return false
        } else if (resetDraft) {
          if (composerRef.current?.startDraft) {
            if (!await composerRef.current.startDraft(groupId, projectId, current, pluginId)) return false
          } else { setDraftProjectId(projectId ?? undefined); setPlanning(false); controller.newConversation() }
        } else if (composerRef.current?.openDraft) {
          if (!await composerRef.current.openDraft(undefined, current)) return false
        } else controller.newConversation()
      }
      if (!current()) return false
      setSearchTarget(undefined); setCommandCenterOpen(false)
      setMainView(view); setWorkspaceOpen(false)
      updateWorkspace(current => ({ ...current, fileTreeOpen: false }))
      return true
    } catch (error) {
      if (!current()) return false
      controller.reportError(error)
      throw error
    }
  }
  async function acceptTaskDraft(sessionId: string, draft: ComposerTaskDraft) {
    await sidebarPreferenceStore.load()
    const preferences = sidebarPreferenceStore.getSnapshot().preferences
    const groupId = draft.groupId && preferences.groups.some(group => group.id === draft.groupId) ? draft.groupId : undefined
    const members = new Set(preferences.groups.flatMap(group => group.sessionIds))
    const rootIds = controller.getSnapshot().sessions.filter(session => !session.pinned && !members.has(session.id)).map(session => session.id)
    const near = sidebarRootItems(preferences.groups, rootIds.filter(id => id !== sessionId), preferences.groupedRootOrder)[0]
    const patch = moveSidebarTask(preferences, rootIds, sessionId, groupId ? { type: 'group', id: groupId, position: 'start' } : { type: 'root', near, position: 'before' })
    if (!patch) return
    // Admission is already committed: failed preference writes retain their local placement for retry.
    sidebarPreferenceStore.change(patch)
    await sidebarPreferenceStore.save()
  }
  async function showView(view: typeof mainView) {
    const session = controller.getSnapshot().session
    const id = session?.draftState === 'prepared' ? undefined : session?.id
    const target: MiraAppNavigationTarget | undefined = view === 'conversation' ? id ? { kind: view, sessionId: id } : undefined : { kind: view }
    return await navigation.visit(target, (...args) => navigationAction.current(...args)) ? viewRevision.current : undefined
  }
  function currentNavigation(revision: number | undefined) { return revision !== undefined && revision === viewRevision.current }
  const forkPending = useRef(false)
  async function forkConversation(messageId: string, requestId: string) {
    const source = controller.getSnapshot()
    if (forkPending.current || !source.session || source.running || source.sessionLoading || source.permission || source.queue?.items.length || source.session.pendingInteraction?.status === 'waiting') return false
    const sourceId = source.session.id, revision = viewRevision.current
    const current = () => revision === viewRevision.current && mainViewRef.current === 'conversation' && controller.getSnapshot().session?.id === sourceId
    forkPending.current = true
    try {
      await controller.flushBeforeNavigation()
      if (!current()) return false
      const created = await controller.forkConversation(sourceId, messageId, requestId)
      if (!current()) return false
      if (!await openTask(created.id)) throw new Error('分支已创建，打开失败；请从侧栏打开或重试')
      return true
    } finally { forkPending.current = false }
  }
  async function toggleShellTheme() {
    if (themePending.current) return false
    themePending.current = true
    try { await controller.toggleTheme(); return true }
    finally { themePending.current = false }
  }

  async function selectWorkspaceProject() {
    if (projectSelectionPending.current || navigation.busy || state.sessionLoading) return false
    projectSelectionPending.current = true
    const revision = viewRevision.current
    const current = () => workspacePreferences.mounted && revision === viewRevision.current
    try {
      await controller.flushBeforeNavigation()
      if (!current()) return false
      const project = await controller.selectProject()
      if (!project || !current()) return false
      if (!project.directoryExists) throw new Error('所选项目目录不可用，请重新选择')
      sidebarPreferenceStore.change({ projectSectionOpen: true })
      sidebarPreferenceStore.setProjectsExpanded([project.id], true)
      return await newConversation(project.id)
    } finally { projectSelectionPending.current = false }
  }

  function adjacentTask(direction: 'previous' | 'next') {
    const current = controller.getSnapshot()
    if (current.sessionLoading || !sidebarPreferenceStore.getSnapshot().ready || navigation.busy) return
    const active = current.sessions.find(task => task.id === focusedTaskId) ?? (current.session?.id === focusedTaskId ? current.session : undefined)
    const project = current.projects.find(project => project.id === draftProjectId)
    return miraAdjacentTasks(current.sessions, { workingDirectory: active?.workingDirectory ?? project?.directory, projectId: active?.projectId ?? draftProjectId }, current.session?.id === active?.id && current.session?.draftState === 'prepared' ? undefined : active?.id, sidebarPreferenceStore.getSnapshot().preferences)[direction]
  }

  async function openAdjacentTask(direction: 'previous' | 'next') {
    if (taskNavigationPending.current) return false
    const id = adjacentTask(direction)
    if (!id) return false
    taskNavigationPending.current = true
    try { return await openTask(id) }
    finally { taskNavigationPending.current = false }
  }

  function selectAdjacentTask(direction: 'previous' | 'next') {
    if (taskNavigationPending.current) return true
    if (!adjacentTask(direction)) return false
    void openAdjacentTask(direction).catch(error => controller.reportError(error))
    return true
  }

  async function openTask(id: string, messageId?: string, filePath?: string, execution = false) {
    const groupOwner = taskGroupOwner(id)
    if (groupOwner && groupOwner !== id && groupOwner !== (controller.getSnapshot().session?.id || 'draft')) {
      if (!await openTask(groupOwner)) return false
      return openTaskPane(id, true, { messageId, filePath, execution })
    }
    if (taskWorkspace.tabs.some(tab => tab.taskSessionId === id) || id === workspaceSessionId && mainView === 'conversation') {
      return openTaskPane(id, true, { messageId, filePath, execution })
    }
    // ZCode sidebar selection replaces the focused secondary beside an anonymous draft.
    // Explicit search/detail navigation and existing groups keep their original route.
    if (!groupOwner && !controller.getSnapshot().session && mainViewRef.current === 'conversation' && !messageId && !filePath && !execution && taskPaneIds.includes(focusedPane)) {
      const replacingId = focusedPane, before = workspacePreferences.latest.draft
      const revision = viewRevision.current, requestRevision = ++taskPaneRequestRevision.current
      const current = () => workspacePreferences.mounted && workspacePreferences.ready && revision === viewRevision.current && requestRevision === taskPaneRequestRevision.current && !controller.getSnapshot().session && !controller.getSnapshot().sessionLoading && mainViewRef.current === 'conversation' && focusedPaneRef.current === replacingId && workspacePreferences.latest.draft === before
      try { await controller.flushBeforeNavigation(false) }
      catch { if (current()) controller.reportError(new Error(MIRA_TASK_REPLACEMENT_SAVE_ERROR)); return false }
      if (!current()) return false
      const selected = await controller.require('getSession')(id)
      if (!current()) return false
      if (selected.archivedAt || selected.draftState === 'prepared') throw new Error('任务已不可用，请重新选择')
      updateTaskWorkspace(state => replaceWorkspaceTask(state, replacingId, createWorkspaceTaskTab(id, selected.title)))
      controller.clearError(MIRA_TASK_REPLACEMENT_SAVE_ERROR)
      setFocusedPane(id)
      void controller.markSessionRead(id)
      setTaskPaneFocus({ id, revision: requestRevision })
      return true
    }
    let failure: unknown
    const opened = await navigation.visit({ kind: 'conversation', sessionId: id }, async (target, current) => {
      try {
        if (!await executeNavigation(target, current)) return false
        if (!current()) return false
        if (messageId) setSearchTarget({ sessionId: id, messageId })
        if (execution) {
          const session = controller.getSnapshot().session
          if (!workspacePreferences.mounted || session?.id !== id) return false
          const runId = session.activeRun?.id ?? [...session.messages].reverse().find(message => message.role === 'assistant' && message.run)?.runId
          setWorkspaceSessions(previous => ({ ...previous, [id]: addWorkspaceTab(previous[id] || createWorkspaceSession(), createWorkspaceRunTab(runId)) }))
          setWorkspaceMounted(true); setWorkspaceOpen(true)
        }
        if (filePath) {
          const tab = createWorkspaceFileTab(filePath)
          setWorkspaceSessions(previous => ({ ...previous, [id]: { ...addWorkspaceTab(previous[id] || createWorkspaceSession(), tab), selectedFilePath: filePath } }))
          setWorkspaceMounted(true); setWorkspaceOpen(true)
        }
        return true
      } catch (error) { failure = error; throw error }
    })
    if (failure) throw failure
    return opened
  }
  async function openWorkflowRun(identity: MiraFlowRunIdentity, actor?: ActorRecord) {
    if (!await openTask(identity.sessionId)) throw new Error('工作流已启动，但会话切换未完成；请在运行记录中重新打开')
    const owner = controller.getSnapshot().session?.id
    if (!owner) throw new Error('工作流会话尚未就绪')
    await loadWorkspacePreferences()
    setWorkspaceSessions(previous => ({ ...previous, [owner]: addWorkspaceTab(previous[owner] || createWorkspaceSession(), createWorkspaceWorkflowTab(identity.sessionId, identity.runId)) }))
    setWorkflowActorLanding(actor ? { ...identity, siteId: actor.siteId, ordinal: actor.ordinal, key: ++workflowLandingKey.current } : undefined)
    setWorkspaceMounted(true); setWorkspaceOpen(true); setFocusedPane('workspace')
  }
  async function openProjectFiles(projectId: string) {
    const selected = controller.getSnapshot().projects.find(item => item.id === projectId)
    if (!selected?.directoryExists) throw new Error('所选项目目录不可用，请重新选择')
    setSidebarFileTarget(previous => previous?.projectId === projectId && previous.directory === selected.directory ? previous : { projectId, directory: selected.directory, expandedPaths: [] })
    setSessionsOpen(true)
  }
  async function openSessionFiles(sessionId: string) {
    const snapshot = controller.getSnapshot()
    const selected = snapshot.sessions.find(item => item.id === sessionId)
    if (!selected) throw new Error('任务已不在当前列表，请刷新后重试')
    if (selected.projectId && snapshot.projects.some(project => project.id === selected.projectId && project.directoryExists)) {
      await openProjectFiles(selected.projectId)
      return
    }
    if (!selected.workingDirectory) throw new Error('当前任务没有可用工作目录')
    setSidebarFileTarget(previous => previous?.sessionId === sessionId && previous.directory === selected.workingDirectory ? previous : { sessionId, directory: selected.workingDirectory!, expandedPaths: [] })
    setSessionsOpen(true)
  }
  async function openCommandWorkspace(id: WorkspaceResourceId) {
    if (id === 'files') { await openWorkspaceTab(id); return true }
    const revision = await showView('conversation')
    if (!currentNavigation(revision)) return false
    await openWorkspaceTab(id, undefined, () => currentNavigation(revision))
    return currentNavigation(revision)
  }
  const commands: HarnessSearchCommand[] = [
    { id: 'new', label: '新建任务', shortcut: commandKey === '⌘' ? '⌘N' : 'Ctrl+N', icon: <Plus size={16} />, action: newConversation },
    ...(controller.supportsProjectSelection ? [{ id: 'open-project', label: '打开项目', description: '选择本地文件夹，在该项目中开始新任务。', keywords: 'open workspace folder', shortcut: commandKey === '⌘' ? '⌘O' : 'Ctrl+O', icon: <FolderOpen size={16} />, action: selectWorkspaceProject }] : []),
    { id: 'previous-task', label: '上一个任务', description: '按当前工作目录的任务顺序切换，保留输入。', keywords: 'previous conversation task', shortcut: commandKey === '⌘' ? '⌘⇧[' : 'Ctrl+Shift+[', icon: <ArrowLeft size={16} />, action: () => openAdjacentTask('previous') },
    { id: 'next-task', label: '下一个任务', description: '按当前工作目录的任务顺序切换，保留输入。', keywords: 'next conversation task', shortcut: commandKey === '⌘' ? '⌘⇧]' : 'Ctrl+Shift+]', icon: <ArrowRight size={16} />, action: () => openAdjacentTask('next') },
    { id: 'automations', label: '自动化', icon: <CalendarClock size={16} />, action: async () => currentNavigation(await showView('automations')) },
    { id: 'extensions', label: '插件市场', icon: <Blocks size={16} />, action: async () => currentNavigation(await showView('extensions')) },
    { id: 'settings', label: '设置', icon: <Settings size={16} />, action: async () => { await controller.navigate('/settings/general'); if (controller.getSnapshot().error) throw new Error(controller.getSnapshot().error) } },
    ...(controller.supportsThemeSwitch ? [{ id: 'theme', label: theme === 'dark' ? '切换为浅色模式' : '切换为深色模式', keywords: 'theme dark light 主题', shortcut: commandKey === '⌘' ? '⌘⇧L' : 'Ctrl+Shift+L', icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />, action: toggleShellTheme }] : []),
    ...(hasTaskProgress ? [{ id: 'find', label: '查找当前任务', shortcut: navigator.platform.toLowerCase().includes('mac') ? '⌘F' : 'Ctrl+F', icon: <Search size={16} />, action: async () => { if (!currentNavigation(await showView('conversation'))) return false; setFocusedPane('main'); setFindRequest(value => value + 1); return true } }] : []),
    { id: 'files', label: '项目文件', icon: <FolderOpen size={16} />, action: () => openCommandWorkspace('files') },
    { id: 'terminal', label: '终端', shortcut: terminalShortcut, icon: <TerminalSquare size={16} />, action: async () => { const revision = await showView('conversation'); return currentNavigation(revision) && await openBottomTerminal(() => currentNavigation(revision)) } },
    { id: 'browser', label: '浏览器', icon: <Globe2 size={16} />, action: () => openCommandWorkspace('browser') },
  ]
  const latestAssistantId = lastMessage?.role === 'assistant' ? lastMessage.id : undefined
  const waiting = Boolean(state.permission || state.session?.pendingInteraction?.status === 'waiting')
  const canRerun = Boolean(state.session && state.selection && !state.running && !state.permission && !state.queue?.items.length && state.session.pendingInteraction?.status !== 'waiting')
  const toolsById = useMemo(() => new Map((state.session?.toolCalls || []).map(tool => [tool.id, tool])), [state.session?.toolCalls])
  const showConfirmation = (ownerId: string) => {
    const current = controller.getSnapshot()
    if (mainView !== 'conversation' || current.sessionLoading || current.session?.id !== ownerId || state.session?.id !== ownerId) return
    if (current.permission?.sessionId === ownerId && current.permission.requestId === state.permission?.requestId) {
      conversationTimelineActions.current?.jumpToInteraction({ kind: 'permission', id: current.permission.requestId })
    } else if (!current.permission && current.session.pendingInteraction?.status === 'waiting' && current.session.pendingInteraction.id === state.session.pendingInteraction?.id) {
      conversationTimelineActions.current?.jumpToInteraction({ kind: 'interaction', id: current.session.pendingInteraction.id })
    }
  }
  const permissionResponse: PermissionResponseCardProps | undefined = state.permission ? { request: state.permission, responding: respondingRequestId === state.permission.requestId, error: permissionError?.requestId === state.permission.requestId ? permissionError.message : undefined, placement: 'dock', onRespond: respondPermission } : undefined
  const workbenchValue = useMemo(() => ({ controller, sessionId: workspaceSessionId, session: state.session, active: mainView === 'conversation' && !state.sessionLoading, openChangesTab: () => openWorkspaceTab('changes'), openFile: (path: string) => openFilePreview(path, workspaceSessionId), openLink: (url: string) => { if (workspaceSessionId) openConversationLink(workspaceSessionId, url) }, openPresentation: openPresentationReference, openRunProgress, openCommand, openSubtask, stopSubtask, forkConversation: controller.supportsConversationFork && !state.queue?.items.length ? forkConversation : undefined, openForkSource: openTask, running: state.running, waiting, latestAssistantId, canRerun, tools: state.session?.toolCalls || [], toolsById }), [controller, mainView, state.sessionLoading, state.running, waiting, workspaceSessionId, workspaceTabs.length, latestAssistantId, canRerun, state.session, state.queue?.items.length, toolsById, resourceController, resourceSessionId, workspace, paneHandles])
  const currentSummary = state.sessions.find(session => session.id === focusedTaskId)
  const currentTaskGroupId = sidebarPreferences.preferences.groups.find(group => group.sessionIds.includes(currentSummary?.id || ''))?.id
  const menuAction = (action: () => Promise<unknown>) => { void action().catch(error => controller.reportError(error)) }
  const mainViewError = state.error && state.error !== dismissedViewError ? <div className="harness-composer__error mx-4 mt-2" role="alert"><CircleAlert size={15} /><span>{state.error}</span><button type="button" aria-label="关闭页面错误提示" onClick={() => setDismissedViewError(state.error)}><X size={14} /></button></div> : undefined
  return (
    <MiraConversationContext.Provider value={workbenchValue}>
      <MiraConversationDetails memory={conversationDetails} scope={conversationMemoryKey ?? ''} directory={fileDirectory}>
        <div ref={geometry.shellRef} className="pilot-workbench" data-task-state={taskTone} data-sessions-open={sessionsOpen} style={{ '--mira-sidebar-width': `${sessionsWidth}px` } as React.CSSProperties}>
            <div className="mira-sidebar-panel" aria-hidden={!sessionsOpen} inert={!sessionsOpen}>
              {sidebarFilesOpen || workspace.fileTreeOpen && resourceSessionId ? <aside id="pilot-sessions" className="pilot-drawer" style={{ width: sessionsWidth }} aria-label="项目文件">
                <ProjectFileDrawer
                  key={sidebarFilesOpen ? JSON.stringify([sidebarFileTarget?.projectId, sidebarFileTarget?.sessionId, sidebarFileTarget?.directory]) : resourceSessionId}
                  controller={resourceController} projectId={sidebarFileProject?.id} sessionId={sidebarFilesOpen ? sidebarFileSession?.id : resourceSessionId}
                  directory={sidebarFilesOpen ? sidebarFileTarget?.directory : resourceDirectory}
                  selectedPath={sidebarFilesOpen ? sidebarFileTarget?.selectedPath : workspace.selectedFilePath}
                  expandedPaths={sidebarFilesOpen ? sidebarFileTarget?.expandedPaths || [] : workspace.expandedFilePaths}
                  onExpandedPathsChange={paths => { if (sidebarFilesOpen) updateSidebarFiles({ expandedPaths: paths }); else updateWorkspace(current => ({ ...current, expandedFilePaths: paths })) }}
                  onOpenFile={!sidebarFilesOpen || sidebarFileProject || sidebarFilesCanUseTask ? path => { if (sidebarFilesOpen) updateSidebarFiles({ selectedPath: path }); openSidebarFilePreview(path) } : undefined}
                  onOpenBrowser={openSidebarHtml}
                  onAddFile={!sidebarFilesOpen || sidebarFilesCanUseTask ? addFileToConversation : undefined}
                  onBack={() => { setSidebarFileTarget(undefined); updateWorkspace(current => ({ ...current, fileTreeOpen: false })) }}
                  onOpenDirectory={() => { if (sidebarFileProject) menuAction(() => controller.openProject(sidebarFileProject.id)); else if (sidebarFileSession) menuAction(async () => { const error = await controller.openSessionProject(sidebarFileSession.id, 'file-manager'); if (error) throw new Error(error) }); else void controller.openProjectDirectory() }}
                  openingDirectory={sidebarFilesOpen ? undefined : state.openingProjectDirectory}
                  workspaceWatch={sidebarFileProject || sidebarFileSession && !sidebarFilesCanUseTask ? undefined : workspaceWatch} onWatchDirectoriesChange={sidebarFileSession && sidebarFilesCanUseTask || !sidebarFilesOpen ? onWatchDirectoriesChange : undefined}
                  editors={editorAccess.editors}
                  onOpenEditor={sidebarFileProject ? (path, editorId) => resourceController.openProjectFileInEditor(sidebarFileProject.id, path, editorId) : sidebarFileSession ? (path, editorId) => resourceController.openFileInEditorFor(sidebarFileSession.id, path, editorId) : resourceSessionId ? (path, editorId) => editorAccess.open(resourceSessionId, path, editorId) : undefined}
                />
              </aside> : <SessionSidebar state={state} activeSessionId={focusedTaskId ?? null} controller={controller} preferenceStore={sidebarPreferenceStore} width={sessionsWidth} onSearch={openCommandCenter} onNewConversation={() => { void newConversation() }} onNewPersonalConversation={() => { void newConversation(null) }} onNewProjectConversation={projectId => { void newConversation(projectId) }} draft={taskDraft && taskDraft.visible !== false ? { draftId: taskDraft.id, groupId: taskDraft.groupId, preparedSessionId: taskDraft.sessionId, selected: mainView === 'conversation' && focusedPane === 'main' && (taskDraft.sessionId ? state.session?.id === taskDraft.sessionId : !state.session), workspaceLabel: state.projects.find(project => project.id === draftProjectId)?.name } : undefined} onNewGroupConversation={groupId => newConversation(undefined, groupId)} onOpenDraft={id => { void openDraft(id) }} onCloseDraft={id => { void composerRef.current?.closeDraft(id).catch(error => controller.reportError(error)) }} onOpenProjectFiles={projectId => menuAction(() => openProjectFiles(projectId))} onOpenSessionFiles={id => openSessionFiles(id)} taskPaneEntry={taskPaneEntry} onOpenExecution={id => openTask(id, undefined, undefined, true)} onOpenModelTrace={openModelTrace} onOpenAutomations={() => menuAction(() => showView('automations'))} automationsActive={mainView === 'automations'} onOpenExtensions={() => menuAction(() => showView('extensions'))} extensionsActive={mainView === 'extensions'} onOpenSession={id => menuAction(() => openTask(id))} onClose={() => setSessionsOpen(false)} />}
            </div>
              {sessionsOpen && <div
                className="pilot-sessions-resize"
                role="separator"
                tabIndex={0}
                aria-label="调整侧边栏宽度"
                aria-orientation="vertical"
                aria-valuemin={280}
                aria-valuemax={420}
                aria-valuenow={sessionsWidth}
                onKeyDown={geometry.resizeSessionsWithKeyboard}
                onPointerDown={geometry.resizeSessions}
              />}
          {deletingTask && <SessionDeleteDialog session={deletingTask} controller={controller} onClose={() => setDeletingTask(undefined)} />}
          <MiraPanelGroup id="mira-workbench-body" elementRef={geometry.bodyRef} className="mira-workbench-body" onLayoutChanged={geometry.workspaceLayoutChanged}>
          <MiraPanel id="mira-conversation" elementRef={geometry.conversationRef} minSize="35%" className="mira-conversation-panel">
          {mainView === 'extensions' && <main className="mira-thread-panel flex min-h-0 min-w-0 flex-1 flex-col bg-background">{mainViewError}<SkillMarketView host={controller} onManageSkills={() => void controller.navigate('/settings/personalization')} onTryPlugin={async id => { if (!await newConversation(undefined, undefined, id)) throw new Error(controller.getSnapshot().error || '任务打开失败，原稿已保留，请重试') }} /></main>}
          {automationsMounted && <main className="mira-thread-panel flex min-h-0 min-w-0 flex-1 flex-col bg-background" hidden={mainView !== 'automations'} style={mainView !== 'automations' ? { display: 'none' } : undefined}>{mainViewError}<AutomationsView ref={bindAutomations} host={controller} projects={state.projects} sessions={state.sessions} providers={state.providers} active={mainView === 'automations'} navigationBusy={navigationState.busy} onNavigationChange={target => { if (mainViewRef.current === 'automations') navigation.record(target) }} onDraftNavigation={() => { if (mainViewRef.current === 'automations') navigation.detach('automations') }} onDeleteTask={id => navigation.removeAutomation(id)} onOpenSession={async id => { await openTask(id) }} onOpenWorkflowRun={openWorkflowRun} onManageModels={() => void controller.navigate('/settings/model-config')} /></main>}
          <div className="mira-thread-panel flex min-h-0 min-w-0 flex-1 flex-col" hidden={mainView !== 'conversation'} style={mainView !== 'conversation' ? { display: 'none' } : undefined}>
            <header className="harness-thread-header relative flex h-12 w-full shrink-0 items-center justify-between gap-2 overflow-hidden p-2" data-draft={!hasTaskProgress}>
              <div className="harness-thread-header__leading flex min-w-0 flex-1 items-center gap-1.5">
                <Tooltip.Provider delayDuration={350}><SidebarActionHint side="bottom" title={`${sessionsOpen ? '收起' : '展开'}会话侧栏`} shortcut={`${commandKey}B`}><button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground-subtle hover:bg-hover hover:text-foreground" aria-label="会话" aria-keyshortcuts={miraPrimaryKeyShortcuts('B')} aria-controls={sessionsOpen ? 'pilot-sessions' : undefined} aria-expanded={sessionsOpen} onClick={openSessions}>
                  <Menu size={17} />
                </button></SidebarActionHint></Tooltip.Provider>
                {(hasTaskProgress || activeTaskPane !== 'main' && Boolean(searchSession)) && <div className="flex min-w-0 items-center gap-1">
                  <HarnessWorkspaceContext controller={resourceController} project={resourceProject} sessionId={resourceSessionId} directory={resourceDirectory} onAction={menuAction} />
                  {renamingTask && taskRename ? <MiraTaskTitleEditor key={taskRename.sessionId} {...taskRename} controller={resourceController} onClose={() => setTaskRename(current => current === taskRename ? undefined : current)} /> : <h1 className="truncate text-ui-lg font-semibold tracking-[-0.01em] text-foreground" title={searchSession?.title}>{searchSession?.title || '新任务'}</h1>}
                  {currentSummary && !renamingTask && <DropdownMenu.Root><Tooltip.Provider delayDuration={350}><SidebarActionHint side="bottom" title="当前任务菜单"><DropdownMenu.Trigger asChild><button type="button" className="mira-header-tool" aria-label="当前任务菜单"><MoreHorizontal size={16} /></button></DropdownMenu.Trigger></SidebarActionHint></Tooltip.Provider><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" align="start" sideOffset={6}>{sidebarPreferences.error && <><DropdownMenu.Label className="mira-session-menu__label">{sidebarPreferences.error}</DropdownMenu.Label><DropdownMenu.Item className="mira-session-menu__item" onSelect={() => menuAction(() => sidebarPreferenceStore.retry())}><RotateCw size={14} />重试分组偏好</DropdownMenu.Item><DropdownMenu.Separator className="mira-session-menu__separator" /></>}<SessionMenuItems onDelete={() => setDeletingTask(currentSummary)} taskPaneEntry={taskPaneEntry} kind="dropdown" session={currentSummary} projects={state.projects} controller={resourceController} groups={sidebarPreferences.preferences.groups} groupsReady={sidebarPreferences.ready} currentGroupId={currentTaskGroupId} onMoveGroup={groupId => { if (resourceController.getSnapshot().session?.id !== currentSummary.id) return; if (sidebarPreferenceStore.moveSessionToGroup(currentSummary.id, groupId, currentTaskGroupId ?? null)) menuAction(() => sidebarPreferenceStore.save()) }} onRename={() => { const session = resourceController.getSnapshot().session; if (session?.id === currentSummary.id) setTaskRename({ sessionId: session.id, title: session.title }) }} onOpenExecution={resourceSession?.activeRun?.id || resourceState.messages.some(message => message.runId) ? async () => { const runId = resourceSession?.activeRun?.id ?? [...resourceState.messages].reverse().find(message => message.runId)?.runId; if (runId) openRunProgress(runId) } : undefined} onOpenModelTrace={() => openModelTrace(currentSummary.id)} run={menuAction} /></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
                </div>}
              </div>
              <div className="harness-thread-header__actions flex shrink-0 items-center gap-1">
                {(hasTaskProgress || activeTaskPane !== 'main' && Boolean(searchSession)) && <WorkspaceEditorButton editors={editorAccess.editors} selectedEditor={editorAccess.selectedEditor} disabled={!resourceSessionId || !resourceDirectory || Boolean(state.sessionLoading)} loading={editorAccess.loading} error={editorAccess.error} onRetry={editorAccess.retry} onOpen={async (editorId, remember) => { if (resourceSessionId) await editorAccess.open(resourceSessionId, '', editorId, remember).catch(cause => controller.reportError(cause)) }} />}
                <MiraWorkbenchHelp onShowAbout={() => controller.showAbout()} onOpenResources={() => controller.openResourceManager()} onNavigate={path => controller.navigate(path, true)} />
                <Tooltip.Provider delayDuration={350}><SidebarActionHint side="bottom" title={`${bottomTerminalOpen ? '收起' : '展开'}终端`} shortcut={terminalShortcut}><button ref={bottomTerminalToggleRef} type="button" className="mira-header-tool" aria-label="打开终端" aria-keyshortcuts={miraPrimaryKeyShortcuts('J')} aria-controls="mira-bottom-terminal" aria-expanded={bottomTerminalOpen} data-active={bottomTerminalOpen} disabled={preparingWorkspace || state.sessionLoading || Boolean(resourceSessionId) && !resourceReady} onClick={toggleBottomTerminal}><TerminalSquare size={16} /></button></SidebarActionHint></Tooltip.Provider>
                {!workspaceOpen && <Tooltip.Provider delayDuration={350}><SidebarActionHint hoverOnly side="bottom" title="切换面板" shortcut={workspaceShortcut}><button ref={workspaceToggleRef} type="button" className="flex size-8 items-center justify-center rounded-lg text-foreground-subtle hover:bg-hover hover:text-foreground" aria-label="切换面板" aria-keyshortcuts={miraPrimaryKeyShortcuts('Alt+B')} aria-controls="pilot-workspace" aria-expanded={false} onClick={openWorkspace}>
                  <PanelRightOpen size={17} />
                </button></SidebarActionHint></Tooltip.Provider>}
              </div>
            </header>
            <MiraBottomTerminal controller={controller} sessionId={resourceSessionId || ''} directory={resourceDirectory} retainedSessionIds={retainedTerminalSessions} open={bottomTerminalOpen && mainView === 'conversation' && Boolean(resourceSessionId) && !state.sessionLoading && resourceReady} active={mainView === 'conversation' && !state.sessionLoading && resourceReady && !commandCenterOpen} onClose={closeBottomTerminal} onFocus={() => setFocusedPane('bottom-terminal')} onOpenAddress={openBottomTerminalAddress}>
          <MiraTaskGrid layout={taskLayout} focusedPane={activeTaskPane === 'main' ? MIRA_PRIMARY_TASK_PANE : activeTaskPane} onFocusPane={id => setFocusedPane(id === MIRA_PRIMARY_TASK_PANE ? 'main' : id)} active={mainView === 'conversation' && !state.sessionLoading && !commandCenterOpen} canPlace={taskPaneEntry.canDrag} onPlace={(id, anchor, side) => openTaskPane(id, false, undefined, { anchor, side })} onResize={layout => updateTaskWorkspace(current => ({ ...current, taskLayout: layout }))}>
          <main key={MIRA_PRIMARY_TASK_PANE} data-mira-task-leaf={MIRA_PRIMARY_TASK_PANE} tabIndex={-1} className="mira-thread-panel mira-thread-terminal-frame flex min-h-0 min-w-0 flex-1 flex-col bg-background" data-draft={!hasTaskProgress} hidden={mainView !== 'conversation'} style={mainView !== 'conversation' ? { display: 'none' } : undefined}>

            <div className="mira-conversation-layout @container/conversation relative flex min-h-0 flex-1 flex-col" onPointerDownCapture={() => setFocusedPane('main')} onFocusCapture={() => setFocusedPane('main')}>
              <MiraTaskFind active={mainView === 'conversation' && !commandCenterOpen} keyboardActive={focusedPane === 'main'} sessionId={workspaceSessionId} loading={Boolean(state.sessionLoading)} requestId={findRequest} messages={rendererMessages} liveMessageId={state.session?.activeRun ? streamMessage?.id : undefined} changes={changes} viewportRef={messageViewportRef} timelineRef={conversationTimelineActions} changesRef={changesFindRef} onOpenChanges={async changeId => { try { await openWorkspaceTab('changes'); if (changeId) updateWorkspace(current => ({ ...current, selectedChangeId: changeId })) } catch (error) { controller.reportError(error) } }} />
              <MiraSelectionActions rootRef={messageViewportRef} sessionId={workspaceSessionId} enabled={mainView === 'conversation' && !commandCenterOpen && !state.sessionLoading} onAdd={reference => composerRef.current?.addConversationSelection(reference) ?? false} onSideConversation={controller.supportsSideConversations ? openSideConversation : undefined} />
              <div className="mira-conversation-root" data-draft={!hasTaskProgress}>
                {state.sessionLoading && <div className="mira-session-loading" role="status"><LoaderCircle size={18} className="animate-spin" />正在加载任务…</div>}
                {!hasTaskProgress && !state.sessionLoading && <MiraDraftWelcome active={mainView === 'conversation'} />}
                <div className="mira-conversation-reading-region">
                {hasTaskProgress && (
                <div className="mira-summary-positioner">
                  <TaskSummary commands={(state.session?.toolCalls ?? []).filter(tool => tool.tool === 'bash' && !tool.inherited && (tool.runId === latestRunId && !tool.subtaskId || tool.commandJob?.mode === 'background' && tool.commandJob.status === 'running'))} onOpenCommand={openCommand} plans={sessionPlans} onOpenPlan={openPlanDetail} workflows={workflowRuns} onOpenWorkflow={openWorkflowRun} key={JSON.stringify([workspaceSessionId, latestRunId])} mode={summaryMode} onModeChange={setSummaryMode} goal={state.session?.parentSessionId ? undefined : state.session?.goal} goalController={controller} goalSessionId={workspaceSessionId} goalDetailsRequest={goalDetailsRequest} goalPlanning={planning} taskState={taskState} taskTone={taskTone} running={isExecuting} activities={activities} plan={state.session?.activePlan} subtasks={state.session?.activeRun?.subtasks || latestRun?.subtasks || []} changes={changedFileCount} git={{ controller, project, active: mainView === 'conversation', blocked: Boolean(state.sessionLoading) || state.sessions.some(session => session.projectId === project?.id && state.runningSessionIds.includes(session.id)) || Boolean(state.queue?.items.length), onReview: () => { if (workspaceSessionId) { setWorkspaceSessions(previous => ({ ...previous, [workspaceSessionId]: addWorkspaceTab(previous[workspaceSessionId] ?? createWorkspaceSession(), { id: 'git', label: 'Git 更改', projectId: project?.id }) })); setWorkspaceMounted(true); setWorkspaceOpen(true) } } }} onOpenChanges={() => void openWorkspaceTab('changes')} onOpenProgress={latestRunId ? () => openRunProgress(latestRunId) : undefined} onOpenSubtask={latestRunId ? id => openSubtask(latestRunId, id) : undefined} onReviewPlan={() => { if (!conversationTimelineActions.current?.jumpToInteraction()) void openWorkspaceTab('overview') }} onStopSubtask={id => latestRunId ? stopSubtask(latestRunId, id) : Promise.resolve()} onError={error => controller.reportError(error)} />
                </div>
              )}

                <ConversationTurnRail key={workspaceSessionId || 'draft'} messages={timelineMessages} activeId={activeTurnId} onNavigate={id => conversationTimelineActions.current?.jumpToMessage(id)} />
                <MiraWorkbenchViewport key={conversationMemoryKey || 'draft'} memoryKey={conversationMemoryKey} viewportRef={messageViewportRef} actionsRef={conversationScrollActions} timelineRef={conversationTimelineActions} active={mainView === 'conversation'} ready={hasTaskProgress && !state.sessionLoading} hasContent={hasTaskProgress} onBottomChange={setConversationAtBottom}>
                  <div className="flex min-h-full flex-col">
                    <div className="relative w-full flex-1">
                      <div className="mira-message-column mx-auto flex w-full flex-col gap-5 px-5 pt-16" style={{ overflowAnchor: 'none' }}>
                        <MiraConversationTimeline goal={state.session?.goal} providers={state.providers} messages={rendererMessages} memoryKey={conversationMemoryKey} liveMessageId={state.session?.activeRun ? streamMessage?.id : undefined} viewportRef={messageViewportRef} scrollActionsRef={conversationScrollActions} actionsRef={conversationTimelineActions} components={{ UserMessage, AssistantMessage }} onActiveTurnChange={setActiveTurnId} />
                        <MiraWorkflowDigest host={controller} workflows={workflowRuns} active={mainView === 'conversation' && !state.sessionLoading} onOpen={openWorkflowRun} />
                        <MiraPendingGuides key={workspaceSessionId} items={state.queue?.items ?? []} promotingItemId={state.queue?.promotingItemId} disabled={Boolean(state.sessionLoading)} onWithdraw={async itemId => { await composerRef.current?.withdrawPendingGuide(itemId) }} />
                        <MiraWorkingIndicator running={isExecuting && !state.sessionLoading} />
                      </div>
                    </div>
                    <div className="flex w-full justify-center">
                      <div className="mira-message-column relative mx-auto w-full px-5 pb-4">
                        {state.memoryConfirmation && (
                          <section className="pilot-action" aria-label="记忆确认">
                            <ShieldCheck size={19} />
                            <div>
                              <strong>保存到长期记忆</strong>
                              <p>{state.memoryConfirmation.content}</p>
                              <div className="pilot-action__buttons">
                                <button type="button" disabled={memoryResponding} onClick={() => void respondMemory(false)}>不保存</button>
                                <button type="button" disabled={memoryResponding} onClick={() => void respondMemory(true)}>保存</button>
                              </div>
                            </div>
                          </section>
                        )}
                      </div>
                    </div>
                  </div>
                </MiraWorkbenchViewport>
                </div>
                <div className="mira-composer-region" data-draft={!hasTaskProgress} data-confirmation={Boolean(permissionResponse) || interaction?.status === 'waiting' || undefined}>
                  <button type="button" className="mira-scroll-latest" aria-label="回到底部" title="回到底部" disabled={conversationAtBottom || Boolean(state.sessionLoading)} onClick={() => conversationScrollActions.current?.resume()}><ArrowDown size={16} /></button>
                  <HarnessComposer ref={composerRef} keyboardActive={focusedPane === 'main'} active={mainView === 'conversation'} state={state} controller={controller} planning={planning} setPlanning={setPlanning} draftProjectId={draftProjectId} onDraftProjectChange={setDraftProjectId} onDraftChange={setTaskDraft} onDraftAccepted={acceptTaskDraft} onShowConfirmation={showConfirmation} onShowGoal={showGoal} onOpenPresentation={openPresentationReference} onOpenSideConversation={controller.supportsSideConversations ? openComposerSideConversation : undefined} leadingActions={<MiraBackgroundTasksTrigger subtasks={runningSubtaskRun?.subtasks ?? []} commands={state.session?.toolCalls} disabled={Boolean(state.sessionLoading)} onOpen={id => { if (runningSubtaskRun) openRunningSubtasks(runningSubtaskRun.id, id) }} onOpenCommand={openCommand} onOpenSummary={() => setSummaryMode('panel')} />} interactionSlot={permissionResponse ? <PermissionResponseCard key={permissionResponse.request.requestId} {...permissionResponse} /> : interaction?.status === 'waiting' ? <TaskInteraction key={interaction.id} interaction={interaction} plan={state.session?.activePlan} selectionReady={Boolean(state.selection)} onConfirm={() => controller.confirmPlan(interaction.id)} onRevise={value => controller.continuePlan(interaction.kind === 'plan-review' ? interaction.planId : '', value)} onAnswer={value => controller.answerQuestion(value, interaction.id)} onCancel={interaction.kind === 'plan-review' ? () => controller.cancelPlan(interaction.planId) : undefined} /> : undefined} />
                  {!hasTaskProgress && <div className="mira-task-suggestions" aria-label="任务示例">
                    {[{ icon: BookOpen, label: '整理资料', prompt: '请整理当前项目资料，先阅读目录和文档，再总结主要内容。' }, { icon: CircleAlert, label: '排查问题', prompt: '帮我分析当前项目，检查运行与构建配置，列出需要处理的问题。' }, { icon: FileText, label: '起草文档', prompt: '帮我写一份项目介绍，先分析已有资料，再给出文档草案。' }].map(({ icon: Icon, label, prompt }) => <button type="button" key={label} onClick={() => window.dispatchEvent(new CustomEvent('mira:compose-draft', { detail: prompt }))}><Icon size={15} />{label}</button>)}
                  </div>}
                </div>
              </div>
            </div>
          </main>
          {taskPaneTabs.map(tab => <MiraSideConversation key={tab.taskSessionId} data-mira-task-leaf={tab.taskSessionId} parentController={controller} parentId={workspaceOwnerId} childSessionId={tab.taskSessionId!} existingTask onOpenLink={openConversationLink} onHandleChange={bindTaskPane} primaryDirectory={fileDirectory} onClose={() => closeWorkspaceTab(tab.id, false)} onFocusRequestHandled={revision => setTaskPaneFocus(previous => previous?.id === tab.taskSessionId && previous?.revision === revision ? undefined : previous)} navigationTarget={taskPaneFocus?.id === tab.taskSessionId ? taskPaneFocus : undefined} focusRequest={taskPaneFocus && taskPaneFocus.id === tab.taskSessionId ? taskPaneFocus.revision : 0} active={mainView === 'conversation' && !state.sessionLoading && !commandCenterOpen} keyboardActive={focusedPane === tab.taskSessionId} requests={[]} onConsume={() => undefined} onFocus={() => setFocusedPane(tab.taskSessionId!)} onOpenFile={openActivityFile} />)}
          </MiraTaskGrid>
            </MiraBottomTerminal>
          </div>
          </MiraPanel>
          {workspaceOpen && <MiraPanelSeparator className="pilot-workspace-resize" aria-label="调整工作区宽度" onPointerDownCapture={geometry.beginWorkspaceResize} onKeyDownCapture={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) geometry.beginWorkspaceResize() }} />}
          <MiraPanel id="mira-inspector" panelRef={geometry.workspacePanelRef} elementRef={geometry.workspaceElementRef} defaultSize="0px" collapsedSize="0px" minSize="240px" maxSize="65%" collapsible={!workspaceOpen} disabled={!workspaceOpen} className={`mira-inspector-panel${workspaceOpen ? ' is-open' : ''}`}>
          {workspaceMounted && (
            <aside ref={geometry.workspaceContentRef} id="pilot-workspace" className="pilot-inspector" aria-label="工作区" aria-hidden={!workspaceOpen} inert={!workspaceOpen} onPointerDownCapture={() => setFocusedPane('workspace')} onFocusCapture={() => setFocusedPane('workspace')}>
              <WorkspaceTabs tabs={workspaceTabs} active={workspaceTab} changes={resourceSession?.changeSummary?.files.filter(file => !file.unchanged).length ?? new Set(resourceChanges.map(change => change.path)).size} recentClosedTabs={workspace.recentClosedTabs} onOpen={openWorkspaceTab} onActivate={id => { const tab = workspace.tabs.find(tab => tab.id === id); setFocusedPane(tab?.taskSessionId ?? tab?.childSessionId ?? 'workspace'); updateWorkspace(current => ({ ...current, activeTab: id, selectedFilePath: current.tabs.find(tab => tab.id === id)?.path || current.selectedFilePath })); if (isWorkspaceTerminalTab(id) && resourceSessionId) startTerminalView(resourceSessionId, id); if (isWorkspaceBrowserTab(id) && resourceSessionId) startBrowserView(resourceSessionId, id) }} onRestartTerminal={restartTerminalView} onClose={closeWorkspaceTab} onCloseOthers={id => closeResourceTabs(id)} onCloseAll={() => closeResourceTabs()} onReopen={reopenWorkspaceTab} onReorder={(dragged, target) => updateWorkspace(current => reorderWorkspaceTabs(current, dragged, target))} onDismiss={dismissWorkspace} />
              <div className="pilot-inspector__body">
                {workspaceTabs.length === 0 && <WorkspaceLauncher busy={preparingWorkspace || resourceState.sessionLoading} onOpen={id => void openWorkspaceTab(id)} />}
                {workspaceTabs.filter(tab => !isWorkspaceTerminalTab(tab.id) && !isWorkspaceBrowserTab(tab.id)).map(tab => (
                  <div key={`${resourceSessionId || 'empty'}:${tab.id}:${tab.runId || ''}`} className={`pilot-panel-view${workspaceTab === tab.id ? ' is-active' : ''}`} aria-hidden={workspaceTab !== tab.id}>
                    {tab.childSessionId && resourceSessionId && <MiraSideConversation onOpenLink={openConversationLink} parentController={controller} parentId={resourceSessionId} childSessionId={tab.childSessionId} focusRequest={taskPaneFocus?.id === tab.childSessionId ? taskPaneFocus.revision : 0} onFocusRequestHandled={revision => setTaskPaneFocus(previous => previous && previous.id === tab.childSessionId && previous.revision === revision ? undefined : previous)} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} keyboardActive={focusedPane === tab.childSessionId} requests={sideQuotes[tab.childSessionId] ?? []} onConsume={id => setSideQuotes(previous => ({ ...previous, [tab.childSessionId!]: (previous[tab.childSessionId!] ?? []).filter(request => request.id !== id) }))} onFocus={() => setFocusedPane(tab.childSessionId!)} onOpenFile={openActivityFile} />}
                    {tab.id === 'overview' && resourceSessionId && <OverviewPanel onOpenModelTrace={() => openModelTrace(resourceSessionId)} session={resourceState.session} sessionId={resourceSessionId} runId={tab.runId} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading} onOpenSubtask={openSubtask} onOpenFile={openActivityFile} onOpenCommand={openCommand} />}
                    {tab.runId && tab.subtaskId && resourceSessionId && <MiraSubtaskPanel session={resourceState.session} sessionId={resourceSessionId} runId={tab.runId} subtaskId={tab.subtaskId} directory={resourceDirectory} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading} onStopSubtask={id => stopSubtask(tab.runId!, id)} onOpenFile={openActivityFile} onOpenCommand={openCommand} />}
                    {tab.runId && tab.workflowSessionId && <MiraWorkflowRunPane host={controller} identity={{ sessionId: tab.workflowSessionId, runId: tab.runId }} providers={state.providers} actorLanding={workflowActorLanding?.sessionId === tab.workflowSessionId && workflowActorLanding.runId === tab.runId ? workflowActorLanding : undefined} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading} />}
                    {tab.path && (resourceSessionId || tab.projectId) && <FilePreviewPanel controller={resourceController} sessionId={resourceSessionId || ''} projectId={tab.projectId} path={tab.path} directory={tab.projectId ? state.projects.find(project => project.id === tab.projectId)?.directory : resourceDirectory} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} onAddFile={tab.projectId ? undefined : addFileToConversation} presentationNavigation={!tab.projectId && presentationNavigation && presentationNavigation.reference.sessionId === resourceSessionId && presentationNavigation.reference.sourcePath === tab.path ? presentationNavigation : undefined} onAddPresentation={tab.projectId ? undefined : reference => { const current = resourceController.getSnapshot(); if (!workspacePreferences.mounted || !workspaceOpen || workspaceTab !== tab.id || mainViewRef.current !== 'conversation' || current.sessionLoading || current.session?.id !== reference.sessionId || reference.sourcePath !== tab.path || commandCenterOpen) return false; return resourceComposer?.current?.addPresentationElement(reference) ?? false }} workspaceWatch={tab.projectId ? undefined : workspaceWatch} selectedEditor={tab.projectId ? undefined : editorAccess.selectedEditor} onOpenEditor={tab.projectId || !resourceSessionId ? undefined : (path, editorId) => editorAccess.open(resourceSessionId, path, editorId)} onOpenLink={tab.projectId || !resourceSessionId ? undefined : url => openResourceAddress(resourceSessionId, tab.id, url)} />}
                    {tab.commandToolId && tab.runId && resourceSessionId && (tab.fullCommandOutput ? <MiraCommandOutputFile controller={resourceController} sessionId={resourceSessionId} runId={tab.runId} toolId={tab.commandToolId} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} /> : <MiraCommandPane onAction={(...args) => resourceController.commandAction(...args)} onOpenFullOutput={(runId, toolId) => openCommand(runId, toolId, true)} session={resourceState.session} sessionId={resourceSessionId} runId={tab.runId} toolId={tab.commandToolId} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} />)}
                    {tab.traceSessionId && <MiraModelTracePane controller={resourceController} sessionId={tab.traceSessionId} title={resourceState.sessions.find(item => item.id === tab.traceSessionId)?.title} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} />}
                    {tab.planToolId && <MiraPlanDetail plan={resourcePlans.find(item => item.id === tab.planToolId)} />}
                    {tab.id === 'git' && <MiraGitReviewPanel controller={resourceController} project={resourceState.projects.find(item => item.id === tab.projectId)} active={workspaceOpen && workspaceTab === tab.id && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} />}
                    {tab.id === 'changes' && <ChangesPanel rootRef={changesFindRef} summary={resourceState.session?.changeSummary} changes={resourceChanges} selectedChangeId={selectedChangeId} onSelect={id => { updateWorkspace(current => ({ ...current, selectedChangeId: id })); setWorkspaceTabLabel('changes', resourceChanges.find(change => change.key === id)?.path.split(/[\\/]/).pop() || '变更') }} />}
                  </div>
                ))}
                {terminalViews.filter(item => workspaceSessions[item.sessionId]?.tabs.some(tab => tab.id === item.tabId)).map(item => <div key={JSON.stringify([item.sessionId, item.tabId])} data-terminal-tab-id={item.tabId} className={`pilot-panel-view${workspaceOpen && resourceSessionId === item.sessionId && workspaceTab === item.tabId ? ' is-active' : ''}`} aria-hidden={!workspaceOpen || resourceSessionId !== item.sessionId || workspaceTab !== item.tabId}><TerminalPanel key={item.epoch} controller={controller} sessionId={item.sessionId} directory={item.directory} active={workspaceOpen && resourceSessionId === item.sessionId && workspaceTab === item.tabId && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} onOpenAddress={url => openResourceAddress(item.sessionId, item.tabId, url)} /></div>)}
                {browserViews.filter(item => workspaceSessions[item.sessionId]?.tabs.some(tab => tab.id === item.tabId)).map(item => { const tab = workspaceSessions[item.sessionId].tabs.find(tab => tab.id === item.tabId)!; const selected = workspaceOpen && resourceSessionId === item.sessionId && workspaceTab === item.tabId; return <div key={JSON.stringify([item.sessionId, item.tabId])} data-browser-tab-id={item.tabId} className={`pilot-panel-view${selected ? ' is-active' : ''}`} aria-hidden={!selected}><MiraBrowserPanel controller={controller} sessionId={item.sessionId} browserId={item.tabId} active={selected && mainView === 'conversation' && !resourceState.sessionLoading && !commandCenterOpen} htmlSource={tab.htmlSource} initialUrl={tab.url || (item.tabId === 'browser' ? workspaceSessions[item.sessionId].browserUrl : '')} onSelectElement={reference => { if (!selected || mainView !== 'conversation' || resourceState.sessionLoading || commandCenterOpen || resourceState.session?.id !== reference.sessionId || reference.browserId !== item.tabId) return false; return resourceComposer?.current?.addBrowserElement(reference) ?? false }} request={browserRequest} onRequestHandled={request => setBrowserRequest(current => current === request ? undefined : current)} onUrlChange={url => updateBrowserResource(item.sessionId, item.tabId, { url })} onPageFavicon={faviconUrl => updateBrowserResource(item.sessionId, item.tabId, { faviconUrl })} onPageTitle={title => updateBrowserResource(item.sessionId, item.tabId, { label: title.trim().slice(0, 200) || workspaceTabLabel('browser') })} /></div> })}
              </div>
            </aside>
          )}
          </MiraPanel>
          </MiraPanelGroup>
          <HarnessCommandCenter open={commandCenterOpen} focusRequest={commandCenterFocusRequestNumber} onOpenChange={setCommandCenterOpen} onDismiss={() => { const id = commandCenterFocusRequest.current; commandCenterFocusRequest.current = undefined; return id ? controller.dismissCommandCenterFocus(id) : false }} controller={controller} session={searchSession} commands={commands} onOpenSession={result => openTask(result.id, result.messageId)} onOpenFile={(id, path) => openTask(id, undefined, path)} />
        </div>
      </MiraConversationDetails>
    </MiraConversationContext.Provider>
  )
}

export const PilotWorkbench = HarnessWorkbench

function CapabilityPanel({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="pilot-capability"><div className="pilot-capability__icon">{icon}</div><strong>{title}</strong><p>{detail}</p><span className="pilot-capability__status">宿主适配待接入</span></div>
}
