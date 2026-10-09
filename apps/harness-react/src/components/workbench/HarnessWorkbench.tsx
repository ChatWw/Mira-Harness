import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleAlert, Copy, FileText, FolderOpen, GitCompare, Globe2, ListTree, LoaderCircle, Menu, PanelRight, Plus, RotateCw, ShieldCheck, Square, TerminalSquare, X } from 'lucide-react'
import { type HarnessFileChange, type HarnessMessage, type HarnessRunActivity, type ToolCallRecord } from '../../../../../src/config/harness'
import type { HarnessBrowserBounds } from '../../../../../src/platform/firstPartyHarness'
import { getPilotTaskState, getPilotTaskTone, PilotController, projectPilotMessage, shouldRenderPilotStream, type PilotTaskTone } from '../../state/pilot-state'
import { SessionSidebar, useHarnessSessionShortcuts } from '../session/SessionSidebar'
import { MessageMarkdown } from '../conversation/markdown'
import { RunProgressCard } from '../conversation/run-progress'
import { EditIcon, FileChangesCard, UserMessageEditor } from '../conversation/message-parts'
import { HarnessComposer, type HarnessComposerHandle } from '../composer/HarnessComposer'
import { WorkspaceLauncher } from '../workspace/WorkspaceLauncher'
import { WorkspaceTabs } from '../workspace/WorkspaceTabs'
import { TerminalPanel } from '../workspace/TerminalPanel'
import { ProjectFileDrawer } from '../workspace/ProjectFileDrawer'
import { FilePreviewPanel } from '../workspace/FilePreviewPanel'
import { WorkspaceEditorButton } from '../workspace/WorkspaceEditorButton'
import { useWorkspaceEditors } from '../../hooks/useWorkspaceEditors'
import { TaskInteraction } from '../interactions/TaskInteraction'
import { cn } from '../../lib/utils'
import { parseDiff } from '../../lib/diff'
import { useWorkspaceWatch, workspaceWatchPaths } from '../../lib/workspace-watch'
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'
import { closeAllWorkspaceTabs, closeOtherWorkspaceTabs as removeOtherWorkspaceTabs, closeWorkspaceTab as removeWorkspaceTab, createWorkspaceFileTab, createWorkspaceSession, labelWorkspaceTab, openWorkspaceTab as addWorkspaceTab, readWorkspaceSessions, reorderWorkspaceTabs, restoreWorkspaceTab, workspaceTabLabel, type WorkspaceResourceId, type WorkspaceSessionState, type WorkspaceTabId } from '../../state/workspace-state'

const StreamMessageContext = createContext<HarnessMessage | undefined>(undefined)
const MessageLookupContext = createContext<Map<string, HarnessMessage>>(new Map())
const WorkbenchContext = createContext<{ controller: PilotController; openChangesTab: () => void; running: boolean }>({ controller: undefined as unknown as PilotController, openChangesTab: () => undefined, running: false })
const WORKSPACE_PREFERENCE_KEY = 'harness-react-workspace'

function UserMessage() {
  const id = useAuiState(state => state.message.id)
  const messageById = useContext(MessageLookupContext)
  const { controller, running } = useContext(WorkbenchContext)
  const original = messageById.get(id)
  const [editing, setEditing] = useState(false)
  if (editing) return <MessagePrimitive.Root className="message-row flex w-full flex-col items-end gap-1">
    <div className="w-full"><UserMessageEditor original={original} content={original?.content || ''} onCancel={() => setEditing(false)} onConfirm={async next => { setEditing(false); await controller.editAndRerun(id, next) }} /></div>
  </MessagePrimitive.Root>
  return <MessagePrimitive.Root className="message-row group/user-row mt-7 flex w-full flex-col items-end first:mt-0">
    <div className="flex max-w-full flex-col rounded-xl rounded-tr-xs border border-border bg-surface px-4 py-3 text-ui-base text-foreground @min-[624px]/conversation:max-w-xl"><MessagePrimitive.Content /></div>
    {!running && <button type="button" className="mt-1 mr-1 flex size-6 items-center justify-center rounded-md text-foreground-subtle opacity-0 transition-opacity hover:bg-hover hover:text-foreground group-hover/user-row:opacity-100 focus-visible:opacity-100" aria-label="编辑并重跑" title="编辑并重跑" onClick={() => setEditing(true)}><EditIcon /></button>}
  </MessagePrimitive.Root>
}

function AssistantMessage() {
  const id = useAuiState(state => state.message.id)
  const isOptimistic = useAuiState(state => state.message.metadata.isOptimistic)
  const messageById = useContext(MessageLookupContext)
  const stream = useContext(StreamMessageContext)
  const { controller, openChangesTab, running } = useContext(WorkbenchContext)
  const original = messageById.get(id)
  const streaming = shouldRenderPilotStream(id, isOptimistic === true, stream?.id)
  const content = streaming ? (stream?.content ?? '') : (original?.content ?? '')
  const changes: HarnessFileChange[] = original?.fileChanges || []
  return <MessagePrimitive.Root className="message-row group/assistant-row w-full min-w-0">
    <MessageMarkdown content={content} sources={original?.sources} streaming={streaming} />
    {changes.length > 0 && <FileChangesCard changes={changes} onOpen={openChangesTab} />}
    {original?.run && <RunProgressCard run={original.run} running={streaming} onStopSubtask={subtaskId => controller.stopSubtasks(subtaskId)} />}
    {!streaming && content && <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/assistant-row:opacity-100 group-focus-within:opacity-100">
      {original?.createdAt ? <span className="text-ui-sm text-foreground-subtlest">{formatClock(original.createdAt)}</span> : null}
      {formatUsage(original) && <span className="text-ui-sm text-foreground-subtlest">{formatUsage(original)}</span>}
      <button type="button" className="flex size-6 items-center justify-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground" aria-label="复制回复" title="复制" onClick={() => { void navigator.clipboard.writeText(content).catch(() => undefined) }}><Copy size={14} /></button>
      <button type="button" className="flex size-6 items-center justify-center rounded-md text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-40" disabled={running} aria-label="重新生成" title="重新生成" onClick={() => void controller.rerun()}><RotateCw size={14} /></button>
    </div>}
  </MessagePrimitive.Root>
}

function formatClock(createdAt: number) {
  try { return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

function formatUsage(message?: HarnessMessage) {
  const usage = message?.usage
  if (!usage?.totalTokens) return ''
  const cost = usage.cost?.priced ? ` · ${usage.cost.total.toFixed(4)} ${usage.cost.currency}` : ''
  return `token ${usage.totalTokens}${cost}`
}

export function HarnessWorkbench({ controller }: { controller: PilotController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const editorAccess = useWorkspaceEditors(controller)
  const [sessionSearchRequest, setSessionSearchRequest] = useState(0)
  const [draftProjectId, setDraftProjectId] = useState<string>()
  const [sessionsOpen, setSessionsOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 1180px)').matches)
  const [sessionsWidth, setSessionsWidth] = useState(264)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceMounted, setWorkspaceMounted] = useState(false)
  const [terminalStartedIds, setTerminalStartedIds] = useState<string[]>([])
  const [workspaceWidth, setWorkspaceWidth] = useState(420)
  const [workspaceSessions, setWorkspaceSessionsState] = useState<Record<string, WorkspaceSessionState>>({})
  const [workspacePreferencesLoaded, setWorkspacePreferencesLoaded] = useState(false)
  const [watchedTreeDirectories, setWatchedTreeDirectories] = useState<{ key: string; paths: string[] }>({ key: '', paths: [] })
  const workspacePreferences = useMemo(() => ({
    latest: {} as Record<string, WorkspaceSessionState>,
    saved: undefined as Record<string, WorkspaceSessionState> | undefined,
    ready: false, mounted: false,
    loading: undefined as Promise<void> | undefined,
    saving: undefined as Promise<void> | undefined,
  }), [controller])
  const composerRef = useRef<HarnessComposerHandle>(null)
  const [preparingWorkspace, setPreparingWorkspace] = useState(false)
  const [responding, setResponding] = useState(false)
  const [memoryResponding, setMemoryResponding] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [compactLayout, setCompactLayout] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1180px)').matches)
  const newConversation = () => { controller.newConversation(); setWorkspaceOpen(false); setPlanning(false) }
  useHarnessSessionShortcuts(newConversation, () => {
    updateWorkspace(current => ({ ...current, fileTreeOpen: false }))
    setSessionsOpen(true)
    if (compactLayout) setWorkspaceOpen(false)
    setSessionSearchRequest(value => value + 1)
  })
  useModalFocusTrap(compactLayout && sessionsOpen, 'pilot-sessions')
  useModalFocusTrap(compactLayout && workspaceOpen, 'pilot-workspace')
  useEffect(() => {
    workspacePreferences.mounted = true
    void loadWorkspacePreferences().catch(error => controller.reportError(error))
    return () => {
      workspacePreferences.mounted = false
      void persistWorkspace().catch(error => controller.reportError(error))
    }
  }, [controller, workspacePreferences])
  useEffect(() => {
    let current = true
    void controller.getPreference('harness-react-pane-widths').then(value => {
      if (!current || !value || typeof value !== 'object') return
      const sizes = value as { sessions?: unknown; workspace?: unknown }
      if (typeof sizes.sessions === 'number' && Number.isFinite(sizes.sessions)) setSessionsWidth(Math.min(420, Math.max(220, sizes.sessions)))
      if (typeof sizes.workspace === 'number' && Number.isFinite(sizes.workspace)) setWorkspaceWidth(Math.min(640, Math.max(360, sizes.workspace)))
    })
    return () => { current = false }
  }, [controller])
  useEffect(() => {
    if (workspacePreferencesLoaded && workspacePreferences.ready) void persistWorkspace().catch(error => controller.reportError(error))
  }, [controller, workspaceSessions, workspacePreferencesLoaded, workspacePreferences])
  useEffect(() => controller.registerBeforeNavigation(persistWorkspace), [controller, workspacePreferences])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1180px)')
    const update = () => setCompactLayout(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!compactLayout || (!sessionsOpen && !workspaceOpen)) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="menu"][data-state="open"]')) return
      setSessionsOpen(false)
      setWorkspaceOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [compactLayout, sessionsOpen, workspaceOpen])
  useEffect(() => {
    if (!compactLayout || !sessionsOpen) return
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="会话"]')
    document.querySelector<HTMLButtonElement>('#pilot-sessions .pilot-drawer__close')?.focus()
    return () => trigger?.focus()
  }, [compactLayout, sessionsOpen])
  useEffect(() => {
    if (!compactLayout || !workspaceOpen) return
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="工作区"]')
    document.querySelector<HTMLButtonElement>('#pilot-workspace button[aria-label="关闭工作区"]')?.focus()
    return () => trigger?.focus()
  }, [compactLayout, workspaceOpen])
  const runtime = useExternalStoreRuntime({
    messages: state.messages,
    convertMessage: projectPilotMessage,
    isRunning: state.running,
    isSendDisabled: !state.session || !state.selection || state.running || Boolean(state.permission) || state.session.pendingInteraction?.status === 'waiting',
    onNew: async message => { await controller.send(message.content.filter(part => part.type === 'text').map(part => part.text).join(''), planning) },
    onCancel: async () => controller.stop(),
  })
  const interaction = state.session?.pendingInteraction
  const lastMessage = state.messages[state.messages.length - 1]
  const streamMessage = lastMessage?.role === 'assistant' && lastMessage.id.startsWith('stream-') ? lastMessage : undefined
  const latestRun = [...state.messages].reverse().find(message => message.run)?.run
  const taskState = getPilotTaskState(state)
  const taskTone = getPilotTaskTone(taskState)
  const isExecuting = taskTone === 'running'
  const activities = state.session?.activeRun?.activities || [...state.messages].reverse().find(message => message.run)?.run?.activities || []
  const changes = state.messages.flatMap(message => (message.fileChanges || []).map(change => ({ ...change, key: `${message.id}:${change.toolCallId}` })))
  const project = state.projects.find(item => item.id === state.session?.projectId)
  const hasTaskProgress = state.messages.length > 0 || activities.length > 0 || Boolean(state.permission) || interaction?.status === 'waiting'
  const workspaceSessionId = state.session?.id
  const workspace = workspaceSessionId ? workspaceSessions[workspaceSessionId] || createWorkspaceSession() : createWorkspaceSession()
  const workspaceTab = workspace.activeTab
  const workspaceTabs = workspace.tabs
  const selectedChangeId = workspace.selectedChangeId
  const fileDirectory = project?.directory || state.session?.workingDirectory
  const workspaceWatchKey = JSON.stringify([workspaceSessionId, fileDirectory])
  const onWatchDirectoriesChange = useMemo(() => (paths: string[]) => setWatchedTreeDirectories(previous => previous.key === workspaceWatchKey && JSON.stringify(previous.paths) === JSON.stringify(paths) ? previous : { key: workspaceWatchKey, paths }), [workspaceWatchKey])
  const watchedPaths = workspaceWatchPaths(watchedTreeDirectories.key === workspaceWatchKey ? watchedTreeDirectories.paths : [], workspaceTabs.flatMap(tab => tab.path ? [tab.path] : []), sessionsOpen && workspace.fileTreeOpen, workspaceOpen)
  const workspaceWatch = useWorkspaceWatch(controller, workspaceSessionId, fileDirectory, watchedPaths)
  useEffect(() => {
    setTerminalStartedIds(previous => {
      const live = new Set(state.sessions.map(session => session.id))
      const next = previous.filter(id => live.has(id))
      return next.length === previous.length ? previous : next
    })
  }, [state.sessions])
  useEffect(() => {
    if (!workspaceOpen || !workspaceSessionId || workspaceTab !== 'terminal') return
    setTerminalStartedIds(previous => previous.includes(workspaceSessionId) ? previous : [...previous, workspaceSessionId])
  }, [workspaceOpen, workspaceSessionId, workspaceTab])

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
    if (!workspaceSessionId) return
    setWorkspaceSessions(previous => ({ ...previous, [workspaceSessionId]: update(previous[workspaceSessionId] || createWorkspaceSession()) }))
  }

  async function openWorkspaceTab(id: WorkspaceResourceId, label?: string) {
    if (preparingWorkspace || state.sessionLoading) return
    let sessionId = workspaceSessionId
    if (!sessionId) {
      setPreparingWorkspace(true)
      try { sessionId = await composerRef.current?.prepareSession() } finally { setPreparingWorkspace(false) }
    }
    if (!sessionId || controller.getSnapshot().session?.id !== sessionId) return
    if (id === 'files') {
      setWorkspaceSessions(previous => ({ ...previous, [sessionId]: { ...(previous[sessionId] || createWorkspaceSession()), fileTreeOpen: true } }))
      setSessionsOpen(true)
      if (compactLayout) setWorkspaceOpen(false)
      return
    }
    setWorkspaceSessions(previous => ({ ...previous, [sessionId]: addWorkspaceTab(previous[sessionId] || createWorkspaceSession(), { id, label: label || workspaceTabLabel(id) }) }))
    if (id === 'terminal') setTerminalStartedIds(previous => previous.includes(sessionId) ? previous : [...previous, sessionId])
    setWorkspaceMounted(true)
    setWorkspaceOpen(true)
    if (compactLayout) setSessionsOpen(false)
  }

  function openFilePreview(path: string) {
    if (!workspaceSessionId || state.sessionLoading) return
    const tab = createWorkspaceFileTab(path)
    updateWorkspace(current => ({ ...addWorkspaceTab(current, tab), selectedFilePath: path }))
    setWorkspaceMounted(true)
    setWorkspaceOpen(true)
    if (compactLayout) setSessionsOpen(false)
  }

  function addFileToConversation(path: string) {
    if (!workspaceSessionId) return
    composerRef.current?.addFileReference(workspaceSessionId, path)
    if (compactLayout) { setSessionsOpen(false); setWorkspaceOpen(false) }
  }

  function closeWorkspaceContents(update: (current: WorkspaceSessionState) => WorkspaceSessionState) {
    const next = update(workspace)
    updateWorkspace(update)
    if (!workspaceSessionId) return
    // 批量关闭也必须卸载终端来回收 PTY；相邻标签回退到终端时则启动其视图。
    setTerminalStartedIds(previous => !next.tabs.some(tab => tab.id === 'terminal')
      ? previous.filter(item => item !== workspaceSessionId)
      : next.activeTab === 'terminal' && !previous.includes(workspaceSessionId) ? [...previous, workspaceSessionId] : previous)
  }

  function closeWorkspaceTab(id: WorkspaceTabId) {
    closeWorkspaceContents(current => removeWorkspaceTab(current, id))
  }

  function reopenWorkspaceTab(id: WorkspaceTabId) {
    if (!workspaceSessionId || !workspace.recentClosedTabs.some(tab => tab.id === id)) return
    updateWorkspace(current => restoreWorkspaceTab(current, id))
    if (id === 'terminal') setTerminalStartedIds(previous => previous.includes(workspaceSessionId) ? previous : [...previous, workspaceSessionId])
    setWorkspaceMounted(true)
    setWorkspaceOpen(true)
    if (compactLayout) setSessionsOpen(false)
  }

  function setWorkspaceTabLabel(id: WorkspaceTabId, label: string) {
    updateWorkspace(current => labelWorkspaceTab(current, id, label))
  }

  async function respondPermission(allowed: boolean) {
    if (responding) return
    setResponding(true)
    await controller.permission(allowed)
    setResponding(false)
  }

  async function respondMemory(approved: boolean) {
    const confirmation = state.memoryConfirmation
    if (!confirmation || memoryResponding) return
    setMemoryResponding(true)
    await controller.respondMemory(confirmation.requestId, approved)
    setMemoryResponding(false)
  }

  function openSessions() {
    setSessionsOpen(value => {
      const next = !value
      if (next && compactLayout) setWorkspaceOpen(false)
      return next
    })
  }

  function openWorkspace() {
    if (!workspaceOpen && workspaceTab === 'terminal' && workspaceSessionId) setTerminalStartedIds(previous => previous.includes(workspaceSessionId) ? previous : [...previous, workspaceSessionId])
    setWorkspaceMounted(true)
    setWorkspaceOpen(value => {
      const next = !value
      if (next && compactLayout) setSessionsOpen(false)
      return next
    })
  }

  function resizeSessions(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sessionsOpen || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = sessionsWidth
    let finalWidth = startWidth
    const onMove = (move: PointerEvent) => {
      finalWidth = Math.min(420, Math.max(220, startWidth + (move.clientX - startX)))
      setSessionsWidth(finalWidth)
    }
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      void controller.setPreference('harness-react-pane-widths', { sessions: finalWidth, workspace: workspaceWidth })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, { once: true })
    window.addEventListener('pointercancel', onEnd, { once: true })
  }

  function resizeWorkspace(event: ReactPointerEvent<HTMLDivElement>) {
    if (!workspaceOpen || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = workspaceWidth
    let finalWidth = startWidth
    const onMove = (move: PointerEvent) => {
      finalWidth = Math.min(640, Math.max(360, startWidth + startX - move.clientX))
      setWorkspaceWidth(finalWidth)
    }
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      void controller.setPreference('harness-react-pane-widths', { sessions: sessionsWidth, workspace: finalWidth })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, { once: true })
    window.addEventListener('pointercancel', onEnd, { once: true })
  }

  const messageById = useMemo(() => new Map(state.messages.map(message => [message.id, message])), [state.messages])
  const workbenchValue = useMemo(() => ({ controller, openChangesTab: () => openWorkspaceTab('changes'), running: state.running }), [controller, state.running, workspaceSessionId, workspaceTabs.length])
  return (
    <WorkbenchContext.Provider value={workbenchValue}>
      <MessageLookupContext.Provider value={messageById}>
        <div className="pilot-workbench" data-task-state={taskTone}>
          {compactLayout && (sessionsOpen || workspaceOpen) && <button type="button" className="pilot-pane-backdrop" aria-label="关闭侧边面板" onClick={() => { setSessionsOpen(false); setWorkspaceOpen(false) }} />}
          {sessionsOpen && (
            <>
              {workspace.fileTreeOpen && workspaceSessionId ? <aside id="pilot-sessions" className="pilot-drawer" style={{ width: sessionsWidth }} aria-label="项目文件" role={compactLayout ? 'dialog' : undefined} aria-modal={compactLayout || undefined}><ProjectFileDrawer key={workspaceSessionId} controller={controller} sessionId={workspaceSessionId} directory={fileDirectory} selectedPath={workspace.selectedFilePath} expandedPaths={workspace.expandedFilePaths} onExpandedPathsChange={paths => updateWorkspace(current => ({ ...current, expandedFilePaths: paths }))} onOpenFile={openFilePreview} onAddFile={addFileToConversation} onBack={() => updateWorkspace(current => ({ ...current, fileTreeOpen: false }))} onOpenDirectory={() => void controller.openProjectDirectory()} openingDirectory={state.openingProjectDirectory} workspaceWatch={workspaceWatch} onWatchDirectoriesChange={onWatchDirectoriesChange} editors={editorAccess.editors} onOpenEditor={(path, editorId) => editorAccess.open(workspaceSessionId, path, editorId)} /></aside> : <SessionSidebar state={state} controller={controller} width={sessionsWidth} modal={compactLayout} searchRequest={sessionSearchRequest} onNewConversation={newConversation} onClose={() => setSessionsOpen(false)} />}
              <div
                className="pilot-sessions-resize"
                role="separator"
                tabIndex={0}
                aria-label="调整侧边栏宽度"
                aria-orientation="vertical"
                aria-valuemin={220}
                aria-valuemax={420}
                aria-valuenow={sessionsWidth}
                onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSessionsWidth(value => Math.min(420, Math.max(220, value + (event.key === 'ArrowLeft' ? -16 : 16)))) } }}
                onPointerDown={resizeSessions}
              />
            </>
          )}
          <main className="mira-thread-panel flex min-h-0 min-w-0 flex-1 flex-col bg-background" data-draft={!hasTaskProgress}>
            <header className="harness-thread-header relative flex h-12 w-full shrink-0 items-center justify-between gap-2 overflow-hidden p-2" data-draft={!hasTaskProgress}>
              <div className="harness-thread-header__leading flex min-w-0 flex-1 items-center gap-1.5">
                <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground-subtle hover:bg-hover hover:text-foreground" aria-label="会话" title="会话" aria-controls={sessionsOpen ? 'pilot-sessions' : undefined} aria-expanded={sessionsOpen} onClick={openSessions}>
                  <Menu size={17} />
                </button>
                {hasTaskProgress && <div className="flex min-w-0 items-center gap-2" title={project?.name || '个人工作区'}>
                  <FolderOpen size={16} className="shrink-0 text-foreground-subtle" />
                  <h1 className="truncate text-ui-lg font-semibold tracking-[-0.01em] text-foreground" title={state.session?.title}>{state.session?.title || '今天要研究、整理或完成什么？'}</h1>
                </div>}
              </div>
              <div className="harness-thread-header__actions flex shrink-0 items-center gap-1">
                {hasTaskProgress && <span className="pilot-inspector__state"><TaskStateBadge taskState={taskState} taskTone={taskTone} running={isExecuting} hasSession={Boolean(state.session)} /></span>}
                <WorkspaceEditorButton editors={editorAccess.editors} selectedEditor={editorAccess.selectedEditor} disabled={!workspaceSessionId || !fileDirectory || Boolean(state.sessionLoading)} loading={editorAccess.loading} error={editorAccess.error} onRetry={editorAccess.retry} onOpen={async (editorId, remember) => { if (workspaceSessionId) await editorAccess.open(workspaceSessionId, '', editorId, remember).catch(cause => controller.reportError(cause)) }} />
                <button type="button" className="mira-header-tool" aria-label="查看文件" title="查看文件" aria-expanded={workspace.fileTreeOpen && sessionsOpen} disabled={preparingWorkspace || state.sessionLoading} onClick={() => void openWorkspaceTab('files')}><ListTree size={16} /></button>
                <button type="button" className="mira-header-tool" aria-label="打开终端" title="打开终端" disabled={preparingWorkspace || state.sessionLoading} onClick={() => void openWorkspaceTab('terminal')}><TerminalSquare size={16} /></button>
                <button type="button" className="flex size-8 items-center justify-center rounded-lg text-foreground-subtle hover:bg-hover hover:text-foreground" aria-label="工作区" title="工作区" aria-controls="pilot-workspace" aria-expanded={workspaceOpen} onClick={openWorkspace}>
                  <PanelRight size={17} />
                </button>
              </div>
            </header>
            <div className="@container/conversation relative flex min-h-0 flex-1 flex-col">
              {hasTaskProgress && (
                <div className="pointer-events-none absolute right-4 top-0 z-20 pt-4">
                  <TaskSummary taskState={taskState} taskTone={taskTone} running={isExecuting} activities={activities} changes={changes.length} onOpenWorkspace={() => openWorkspaceTab('overview')} />
                </div>
              )}
              <AssistantRuntimeProvider runtime={runtime}>
                <StreamMessageContext.Provider value={streamMessage}>
                  <ThreadPrimitive.Root className="mira-conversation-root" data-draft={!hasTaskProgress}>
                    {state.sessionLoading && <div className="mira-session-loading" role="status"><LoaderCircle size={18} className="animate-spin" />正在加载任务…</div>}
                    {!hasTaskProgress && !state.sessionLoading && <div className="mira-task-start">
                      <h2>{getMiraGreeting()}</h2>
                    </div>}
                    <ThreadPrimitive.Viewport className="mira-message-viewport min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]" style={!hasTaskProgress ? { display: 'none' } : undefined}>
                      <div className="flex min-h-full flex-col">
                        <div className="relative w-full flex-1">
                          <div className="mira-message-column mx-auto flex w-full flex-col gap-5 px-5 pt-16" style={{ overflowAnchor: 'none' }}>
                            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
                            {changes.length > 0 && (
                              <button type="button" className="pilot-thread-link" onClick={() => openWorkspaceTab('changes')}>
                                <GitCompare size={14} />查看 {changes.length} 个文件变更 <ArrowRight size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex w-full justify-center">
                          <div className="mira-message-column relative mx-auto w-full px-5 pb-4">
                            {state.permission && (
                              <section className="pilot-action" aria-label="权限确认">
                                <ShieldCheck size={19} />
                                <div>
                                  <strong>{state.permission.title}</strong>
                                  <p>{state.permission.detail}</p>
                                  <div className="pilot-action__buttons">
                                    <button type="button" disabled={responding} onClick={() => void respondPermission(false)}>拒绝</button>
                                    <button type="button" disabled={responding} onClick={() => void respondPermission(true)}>允许</button>
                                  </div>
                                </div>
                              </section>
                            )}
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
                            {interaction?.status === 'waiting' && (
                              <TaskInteraction key={interaction.id} interaction={interaction} plan={state.session?.activePlan} selectionReady={Boolean(state.selection)} onConfirm={() => controller.confirmPlan()} onRevise={value => controller.continuePlan(interaction.kind === 'plan-review' ? interaction.planId : '', value)} onAnswer={value => controller.answerQuestion(value)} onCancel={interaction.kind === 'plan-review' ? () => controller.cancelPlan(interaction.planId) : undefined} />
                            )}
                          </div>
                        </div>
                      </div>
                    </ThreadPrimitive.Viewport>
                    <div className="mira-composer-region" data-draft={!hasTaskProgress}>
                      <ThreadPrimitive.ScrollToBottom className="mira-scroll-latest" aria-label="回到底部" title="回到底部"><ArrowDown size={16} /></ThreadPrimitive.ScrollToBottom>
                      <HarnessComposer ref={composerRef} state={state} controller={controller} planning={planning} setPlanning={setPlanning} draftProjectId={draftProjectId} onDraftProjectChange={setDraftProjectId} />
                      {!hasTaskProgress && <div className="mira-task-suggestions" aria-label="任务示例">
                        {[{ icon: BookOpen, label: '整理资料', prompt: '请整理当前项目资料，先阅读目录和文档，再总结主要内容。' }, { icon: CircleAlert, label: '排查问题', prompt: '帮我分析当前项目，检查运行与构建配置，列出需要处理的问题。' }, { icon: FileText, label: '起草文档', prompt: '帮我写一份项目介绍，先分析已有资料，再给出文档草案。' }].map(({ icon: Icon, label, prompt }) => <button type="button" key={label} onClick={() => window.dispatchEvent(new CustomEvent('mira:compose-draft', { detail: prompt }))}><Icon size={15} />{label}</button>)}
                      </div>}
                    </div>
                  </ThreadPrimitive.Root>
                </StreamMessageContext.Provider>
              </AssistantRuntimeProvider>
            </div>
          </main>
          {workspaceOpen && (
            <div
              className="pilot-workspace-resize"
              role="separator"
              tabIndex={0}
              aria-label="调整工作区宽度"
              aria-orientation="vertical"
              aria-valuemin={360}
              aria-valuemax={640}
              aria-valuenow={workspaceWidth}
              onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWorkspaceWidth(value => Math.min(640, Math.max(360, value + (event.key === 'ArrowLeft' ? 16 : -16)))) } }}
              onPointerDown={resizeWorkspace}
            />
          )}
          {workspaceMounted && (
            <aside id="pilot-workspace" className={`pilot-inspector${workspaceOpen ? '' : ' is-collapsed'}`} style={{ width: workspaceWidth }} role={compactLayout && workspaceOpen ? 'dialog' : undefined} aria-modal={compactLayout && workspaceOpen || undefined} aria-label="工作区" aria-hidden={!workspaceOpen}>
              <WorkspaceTabs tabs={workspaceTabs} active={workspaceTab} changes={changes.length} recentClosedTabs={workspace.recentClosedTabs} onOpen={openWorkspaceTab} onActivate={id => { updateWorkspace(current => ({ ...current, activeTab: id, selectedFilePath: current.tabs.find(tab => tab.id === id)?.path || current.selectedFilePath })); if (id === 'terminal' && workspaceSessionId) setTerminalStartedIds(previous => previous.includes(workspaceSessionId) ? previous : [...previous, workspaceSessionId]) }} onClose={closeWorkspaceTab} onCloseOthers={id => closeWorkspaceContents(current => removeOtherWorkspaceTabs(current, id))} onCloseAll={() => closeWorkspaceContents(closeAllWorkspaceTabs)} onReopen={reopenWorkspaceTab} onReorder={(dragged, target) => updateWorkspace(current => reorderWorkspaceTabs(current, dragged, target))} onDismiss={() => setWorkspaceOpen(false)} />
              <div className="pilot-inspector__body">
                {workspaceTabs.length === 0 && <WorkspaceLauncher busy={preparingWorkspace || state.sessionLoading} onOpen={id => void openWorkspaceTab(id)} />}
                {workspaceTabs.filter(tab => tab.id !== 'terminal').map(tab => (
                  <div key={`${workspaceSessionId || 'empty'}:${tab.id}`} className={`pilot-panel-view${workspaceTab === tab.id ? ' is-active' : ''}`} aria-hidden={workspaceTab !== tab.id}>
                    {tab.id === 'overview' && <OverviewPanel taskState={taskState} taskTone={taskTone} latestRun={latestRun} activities={activities} tools={state.session?.toolCalls || []} pending={Boolean(state.permission || state.memoryConfirmation || interaction?.status === 'waiting')} canRerun={Boolean(state.session && state.selection && !state.running)} onReview={() => { setWorkspaceOpen(false); document.querySelector('.pilot-action')?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }} onRerun={() => void controller.rerun()} onOpenTab={openWorkspaceTab} />}
                    {tab.path && workspaceSessionId && <FilePreviewPanel controller={controller} sessionId={workspaceSessionId} path={tab.path} directory={fileDirectory} active={workspaceOpen && workspaceTab === tab.id} onAddFile={addFileToConversation} workspaceWatch={workspaceWatch} selectedEditor={editorAccess.selectedEditor} onOpenEditor={(path, editorId) => editorAccess.open(workspaceSessionId, path, editorId)} />}
                    {tab.id === 'changes' && <ChangesPanel changes={changes} selectedChangeId={selectedChangeId} onSelect={id => { updateWorkspace(current => ({ ...current, selectedChangeId: id })); setWorkspaceTabLabel('changes', changes.find(change => change.key === id)?.path.split(/[\\/]/).pop() || '变更') }} />}
                    {tab.id === 'browser' && <BrowserPanel controller={controller} sessionId={state.session?.id} active={workspaceOpen && workspaceTab === 'browser'} initialUrl={workspace.browserUrl} onUrlChange={url => updateWorkspace(current => ({ ...current, browserUrl: url }))} />}
                  </div>
                ))}
                {terminalStartedIds.filter(id => workspaceSessions[id]?.tabs.some(tab => tab.id === 'terminal')).map(id => <div key={`terminal:${id}`} className={`pilot-panel-view${workspaceOpen && workspaceSessionId === id && workspaceTab === 'terminal' ? ' is-active' : ''}`} aria-hidden={!workspaceOpen || workspaceSessionId !== id || workspaceTab !== 'terminal'}><TerminalPanel controller={controller} sessionId={id} active={workspaceOpen && workspaceSessionId === id && workspaceTab === 'terminal'} /></div>)}
              </div>
            </aside>
          )}
        </div>
      </MessageLookupContext.Provider>
    </WorkbenchContext.Provider>
  )
}

export const PilotWorkbench = HarnessWorkbench

function TaskStateBadge({ taskState, taskTone, running, hasSession }: { taskState: string; taskTone: PilotTaskTone; running: boolean; hasSession: boolean }) {
  const label = running ? '执行中' : taskState === '等待下一步' ? (hasSession ? '就绪' : '尚未选择任务') : taskTone === 'completed' ? '已完成' : taskTone === 'stopped' ? '已停止' : taskTone === 'failed' ? '执行失败' : taskState
  const tone = taskTone === 'failed' ? 'text-red-400' : taskTone === 'running' || taskTone === 'waiting' || taskTone === 'partial' ? 'text-amber-400' : taskTone === 'completed' ? 'text-emerald-400' : 'text-foreground-subtle'
  return <div className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-ui-xs', tone)} aria-live="polite">{running && <LoaderCircle size={13} className="animate-spin" />}{showAlert(taskTone) && <CircleAlert size={13} />}{taskTone === 'completed' && <Check size={13} />}{taskTone === 'stopped' && <Square size={12} />}{label}</div>
}

function showAlert(taskTone: PilotTaskTone) { return taskTone === 'waiting' || taskTone === 'partial' || taskTone === 'failed' }

function getMiraGreeting() {
  const hour = new Date().getHours()
  return `${hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好'}，有什么想让 Mira 帮忙的吗？`
}

function TaskSummary({ taskState, taskTone, running, activities, changes, onOpenWorkspace }: { taskState: string; taskTone: PilotTaskTone; running: boolean; activities: HarnessRunActivity[]; changes: number; onOpenWorkspace: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const current = activities.find(activity => activity.status === 'running')
  const completed = activities.filter(activity => activity.status === 'completed').length
  const dotTone = taskTone === 'running' || taskTone === 'waiting' || taskTone === 'partial' ? 'bg-amber-400' : taskTone === 'completed' ? 'bg-emerald-400' : taskTone === 'failed' ? 'bg-red-400' : 'bg-foreground-subtlest'
  return <aside className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-popover-border bg-popover text-foreground shadow-md" aria-label="任务摘要">
    <button type="button" className="flex min-h-9 w-full items-center gap-2 px-3 text-left hover:bg-hover" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <span className={cn('size-2 shrink-0 rounded-full', dotTone)} />
      <span className="shrink-0 text-ui-sm text-foreground-subtle">{running ? '正在执行' : taskState}</span>
      <strong className="min-w-0 flex-1 truncate text-ui-sm font-medium">{current?.label || (activities.length ? `${completed}/${activities.length} 步 · ${changes} 个变更` : changes ? `${changes} 个文件有变更` : '任务上下文')}</strong><ChevronDown size={13} className={expanded ? 'rotate-180' : ''} />
    </button>
    {expanded && <div className="grid gap-2 px-3 pb-3 text-ui-sm text-foreground-subtle">
      <span className="min-w-0 break-all">{current?.detail || (running ? 'Mira 正在处理当前任务' : '打开工作区查看完整活动')}</span>
      <button type="button" className="inline-flex w-max items-center gap-1.5 text-brand hover:underline" onClick={onOpenWorkspace}>查看工作区 <PanelRight size={13} /></button>
    </div>}
  </aside>
}

function OverviewPanel({ taskState, taskTone, latestRun, activities, tools, pending, canRerun, onReview, onRerun, onOpenTab }: { taskState: string; taskTone: PilotTaskTone; latestRun?: HarnessRunSummaryLike; activities: HarnessRunActivity[]; tools: ToolCallRecord[]; pending: boolean; canRerun: boolean; onReview: () => void; onRerun: () => void; onOpenTab: (id: WorkspaceResourceId) => void }) {
  const shortcuts = [{ id: 'files', label: '文件', icon: FolderOpen }, { id: 'changes', label: '变更', icon: GitCompare }, { id: 'terminal', label: '终端', icon: TerminalSquare }, { id: 'browser', label: '浏览器', icon: Globe2 }] as const
  return <div className="pilot-panel-stack"><section className={`pilot-panel-hero pilot-panel-hero--${taskTone}`}><span className="pilot-panel-kicker">当前任务</span><strong>{taskState}</strong>{latestRun?.error && <p className="pilot-tool__error">{latestRun.error}</p>}{pending && <button type="button" className="pilot-inline-button" onClick={onReview}>返回对话处理确认 <ArrowLeft size={13} /></button>}{(taskTone === 'failed' || taskTone === 'partial') && <button type="button" className="pilot-inline-button" disabled={!canRerun} onClick={onRerun}>重新生成 <RotateCw size={13} /></button>}</section><div className="pilot-panel-shortcuts" role="group" aria-label="工作区工具">{shortcuts.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => onOpenTab(id)}><Icon size={16} /><span>{label}</span></button>)}</div><PanelSection title="执行活动"><div className="pilot-activity-list">{activities.length ? activities.map(activity => <div className="pilot-activity" key={activity.id}><span className={`pilot-status-dot pilot-status-dot--${activity.status}`} /><div><strong>{activity.label}</strong>{activity.detail && <small>{activity.detail}</small>}</div><small>{activity.status === 'completed' ? '已完成' : activity.status === 'running' ? '执行中' : activity.status === 'failed' ? '失败' : '待执行'}</small></div>) : <p>暂无活动</p>}</div></PanelSection><PanelSection title="工具记录">{tools.length ? tools.map(tool => <details className="pilot-tool" key={tool.id}><summary><span>{tool.tool}</span><small>{tool.status === 'ok' ? '已完成' : tool.status === 'running' ? '执行中' : tool.status === 'failed' ? '失败' : '待确认'}</small></summary>{tool.target && <p>{tool.target}</p>}{tool.error && <p className="pilot-tool__error">{tool.error}</p>}{tool.diff && <pre>{tool.diff}</pre>}</details>) : <p>暂无工具记录</p>}</PanelSection></div>
}

type HarnessRunSummaryLike = { error?: string }

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="pilot-panel-section"><h2>{title}</h2>{children}</section>
}


function ChangesPanel({ changes, selectedChangeId, onSelect }: { changes: Array<HarnessFileChange & { key: string }>; selectedChangeId?: string; onSelect: (id: string | undefined) => void }) {
  const totals = changes.reduce((count, change) => { const diff = parseDiff(change.diff || ''); return { added: count.added + diff.added, removed: count.removed + diff.removed } }, { added: 0, removed: 0 })
  return <div className="pilot-panel-stack"><PanelSection title={`本次任务变更 · ${changes.length} 个文件`}>{changes.length ? <><div className="pilot-diff-stats"><span>+{totals.added} 行</span><span>-{totals.removed} 行</span></div>{changes.map(change => { const diff = parseDiff(change.diff || ''); return <div key={change.key}><button type="button" className={`pilot-change ${selectedChangeId === change.key ? 'is-selected' : ''}`} title={`查看 ${change.path} 的变更`} onClick={() => onSelect(selectedChangeId === change.key ? undefined : change.key)}><FileText size={15} /><span>{change.path}</span><small>+{diff.added} -{diff.removed}</small></button>{selectedChangeId === change.key && <ChangePreview change={change} />}</div> })}</> : <EmptyPanel icon={<GitCompare size={20} />} text="暂无文件变更" />}</PanelSection></div>
}

function CapabilityPanel({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="pilot-capability"><div className="pilot-capability__icon">{icon}</div><strong>{title}</strong><p>{detail}</p><span className="pilot-capability__status">宿主适配待接入</span></div>
}

function BrowserPanel({ controller, sessionId, active, initialUrl, onUrlChange }: { controller: PilotController; sessionId?: string; active: boolean; initialUrl: string; onUrlChange: (url: string) => void }) {
  const [address, setAddress] = useState(initialUrl)
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const openedRef = useRef(false)
  const sessionEpochRef = useRef(0)
  const navigationRevisionRef = useRef(0)
  const liveRef = useRef({ sessionId, active, overlayOpen, onUrlChange })
  liveRef.current = { sessionId, active, overlayOpen, onUrlChange }
  const isCurrent = (epoch: number, id: string) => epoch === sessionEpochRef.current && liveRef.current.sessionId === id
  const bounds = (): HarnessBrowserBounds => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return { x: Math.max(0, Math.round(rect?.left || 0)), y: Math.max(0, Math.round(rect?.top || 0)), width: Math.max(16, Math.round(rect?.width || 0)), height: Math.max(16, Math.round(rect?.height || 0)) }
  }
  useEffect(() => {
    const epoch = ++sessionEpochRef.current
    openedRef.current = false
    setUrl(initialUrl)
    setAddress(initialUrl)
    setError('')
    setCanGoBack(false)
    setCanGoForward(false)
    setLoading(false)
    if (!sessionId) return
    const unsubscribe = controller.onBrowserEvent(event => {
      if (!isCurrent(epoch, sessionId) || event.sessionId !== sessionId) return
      if (event.url) { setUrl(event.url); setAddress(event.url); liveRef.current.onUrlChange(event.url) }
      setCanGoBack(event.canGoBack)
      setCanGoForward(event.canGoForward)
      setLoading(event.loading)
      setError(event.error || '')
    })
    return () => { sessionEpochRef.current++; navigationRevisionRef.current++; unsubscribe(); if (openedRef.current) void controller.closeBrowserFor(sessionId).catch(() => undefined) }
  }, [controller, sessionId])
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    const selector = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]'
    const update = () => setOverlayOpen([...root.querySelectorAll<HTMLElement>(selector)].some(element =>
      element.getAttribute('data-state') !== 'closed' && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0 && !element.contains(viewportRef.current)))
    update()
    const observer = new MutationObserver(records => {
      // Streaming text is unrelated to overlay visibility; only inspect changed overlay subtrees.
      if (records.some(record => record.type === 'attributes'
        ? record.target instanceof Element && (record.target.matches(selector) || Boolean(record.target.querySelector(selector)))
        : [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)))))) update()
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'data-state', 'aria-hidden', 'hidden', 'style'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!active || !sessionId || !initialUrl || openedRef.current) return
    openedRef.current = true
    const epoch = sessionEpochRef.current
    const revision = ++navigationRevisionRef.current
    setLoading(true)
    void controller.navigateBrowserFor(sessionId, initialUrl, bounds()).then(result => {
      if (!isCurrent(epoch, sessionId) || revision !== navigationRevisionRef.current) return
      setUrl(result)
      if (!liveRef.current.active || liveRef.current.overlayOpen) void controller.controlBrowserFor(sessionId, 'hide').catch(() => undefined)
    }).catch(cause => { if (isCurrent(epoch, sessionId) && revision === navigationRevisionRef.current) { setLoading(false); setError(cause instanceof Error ? cause.message : '浏览器恢复失败') } })
  }, [active, controller, initialUrl, sessionId])
  useEffect(() => {
    if (!sessionId || !url) return
    const epoch = sessionEpochRef.current
    const visible = active && !overlayOpen
    let current = true
    void controller.controlBrowserFor(sessionId, visible ? 'show' : 'hide').then(() => {
      if (current && isCurrent(epoch, sessionId) && visible && liveRef.current.active && !liveRef.current.overlayOpen) return controller.setBrowserBoundsFor(sessionId, bounds())
    }).catch(cause => { if (current && isCurrent(epoch, sessionId)) setError(cause instanceof Error ? cause.message : '浏览器视图调整失败') })
    return () => { current = false }
  }, [active, overlayOpen, controller, sessionId, url])
  useEffect(() => {
    if (!active || overlayOpen || !sessionId || !url || !viewportRef.current) return
    const epoch = sessionEpochRef.current
    let frame: number | undefined
    const update = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        if (!isCurrent(epoch, sessionId) || !liveRef.current.active || liveRef.current.overlayOpen) return
        void controller.setBrowserBoundsFor(sessionId, bounds()).catch(cause => { if (isCurrent(epoch, sessionId)) setError(cause instanceof Error ? cause.message : '浏览器视图调整失败') })
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(viewportRef.current)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update); if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [active, overlayOpen, controller, sessionId, url])
  async function navigate(event?: FormEvent) {
    event?.preventDefault()
    if (!sessionId || !address.trim()) return
    const value = /^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`
    const epoch = sessionEpochRef.current
    const requestSessionId = sessionId
    const revision = ++navigationRevisionRef.current
    openedRef.current = true
    try {
      setError(''); setLoading(true)
      const result = await controller.navigateBrowserFor(requestSessionId, value, bounds())
      if (!isCurrent(epoch, requestSessionId) || revision !== navigationRevisionRef.current) return
      setUrl(result)
      liveRef.current.onUrlChange(result)
      if (!liveRef.current.active || liveRef.current.overlayOpen) void controller.controlBrowserFor(requestSessionId, 'hide').catch(() => undefined)
    } catch (cause) {
      if (isCurrent(epoch, requestSessionId) && revision === navigationRevisionRef.current) { setLoading(false); setError(cause instanceof Error ? cause.message : '浏览器地址无效') }
    }
  }
  const control = (action: 'back' | 'forward' | 'reload') => {
    if (!sessionId) return
    const epoch = sessionEpochRef.current
    void controller.controlBrowserFor(sessionId, action).catch(cause => { if (isCurrent(epoch, sessionId)) setError(cause instanceof Error ? cause.message : '浏览器操作失败') })
  }
  return <div className="pilot-browser"><form className="pilot-browser__toolbar" onSubmit={event => void navigate(event)}><button type="button" onClick={() => control('back')} disabled={!canGoBack} aria-label="后退" title="后退"><ArrowLeft size={14} /></button><button type="button" onClick={() => control('forward')} disabled={!canGoForward} aria-label="前进" title="前进"><ArrowRight size={14} /></button><button type="button" onClick={() => control('reload')} disabled={!url} aria-label="刷新" title="刷新"><RotateCw size={14} /></button><input value={address} onChange={event => setAddress(event.target.value)} placeholder="输入网址 https://…" aria-label="浏览器地址" /><button type="submit" disabled={!sessionId || !address.trim() || loading}>{loading ? '打开中…' : '打开'}</button></form>{loading && <div className="pilot-browser__loading" aria-hidden="true" />}{error && <p className="pilot-file-error" role="alert">{error}</p>}<div ref={viewportRef} className="pilot-browser__view">{!url && <EmptyPanel icon={<Globe2 size={20} />} text={sessionId ? '输入网址开始浏览' : '尚未选择任务'} />}</div></div>
}

function EmptyPanel({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="pilot-empty-panel">{icon}<span>{text}</span></div>
}

function ChangePreview({ change }: { change: HarnessFileChange }) {
  const lines = parseDiff(change.diff || '').lines
  return <div className="pilot-diff" aria-label="文件变更预览"><strong>{change.tool === 'delete' ? '删除' : change.tool === 'write' ? '写入' : '编辑'} · {change.path}</strong>{change.diff ? <div className="pilot-diff__lines" role="region" aria-label={`${change.path} 的差异`}>{lines.map((line, index) => <div key={index} className={`pilot-diff__line pilot-diff__line--${line.kind}`}><span>{line.oldLine ?? ''}</span><span>{line.newLine ?? ''}</span><code>{line.text || ' '}</code></div>)}</div> : <p>此变更没有可显示的 diff。</p>}</div>
}
