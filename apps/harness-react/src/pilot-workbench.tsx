import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { Activity, ArrowLeft, ArrowRight, Check, CircleAlert, FileCode2, FileText, FolderOpen, GitCompare, Globe2, LoaderCircle, Menu, PanelRight, Plus, RotateCw, Search, ShieldCheck, Square, TerminalSquare, X } from 'lucide-react'
import { type HarnessFileChange, type HarnessMessage, type HarnessPendingInteraction, type HarnessRunActivity, type HarnessUserAnswer, type HarnessWorkspaceFileEntry, type ToolCallRecord } from '../../../src/config/harness'
import type { HarnessBrowserBounds } from '../../../src/platform/firstPartyHarness'
import { getPilotTaskState, getPilotTaskTone, PilotController, projectPilotMessage, shouldRenderPilotStream, type PilotTaskTone } from './pilot-state'
import { SessionDrawer } from './session-drawer'
import { MarkdownContent } from './markdown'
import { RunProgressCard } from './run-progress'
import { AssistantToolbar, EditIcon, FileChangesCard, UserMessageEditor } from './message-parts'
import { HarnessComposer } from './composer'

type WorkspaceTabId = 'overview' | 'files' | 'changes' | 'terminal' | 'browser'
type WorkspaceTab = { id: WorkspaceTabId; label: string }
const workspaceTabDefaults: WorkspaceTab[] = [{ id: 'overview', label: '任务活动' }]

const StreamMessageContext = createContext<HarnessMessage | undefined>(undefined)
const MessageLookupContext = createContext<Map<string, HarnessMessage>>(new Map())
const WorkbenchContext = createContext<{ controller: PilotController; openChangesTab: () => void; running: boolean }>({ controller: undefined as unknown as PilotController, openChangesTab: () => undefined, running: false })

function UserMessage() {
  const id = useAuiState(state => state.message.id)
  const messageById = useContext(MessageLookupContext)
  const { controller, running } = useContext(WorkbenchContext)
  const original = messageById.get(id)
  const [editing, setEditing] = useState(false)
  if (editing) return <MessagePrimitive.Root className="pilot-message pilot-message--user">
    <UserMessageEditor original={original} content={original?.content || ''} onCancel={() => setEditing(false)} onConfirm={async next => { setEditing(false); await controller.editAndRerun(id, next) }} />
  </MessagePrimitive.Root>
  return <MessagePrimitive.Root className="pilot-message pilot-message--user">
    <span className="pilot-message__role">你</span>
    <MessagePrimitive.Content />
    {!running && <span className="pilot-message__toolbar pilot-message__toolbar--inline">
      <button type="button" aria-label="编辑并重跑" title="编辑并重跑" onClick={() => setEditing(true)}><EditIcon /></button>
    </span>}
  </MessagePrimitive.Root>
}

function AssistantMessage() {
  const id = useAuiState(state => state.message.id)
  const isOptimistic = useAuiState(state => state.message.metadata.isOptimistic)
  const messageById = useContext(MessageLookupContext)
  const stream = useContext(StreamMessageContext)
  const { controller, openChangesTab } = useContext(WorkbenchContext)
  const original = messageById.get(id)
  const streaming = shouldRenderPilotStream(id, isOptimistic === true, stream?.id)
  const content = streaming ? (stream?.content ?? '') : (original?.content ?? '')
  const changes: HarnessFileChange[] = original?.fileChanges || []
  return <MessagePrimitive.Root className="pilot-message pilot-message--assistant">
    <span className="pilot-message__role">Mira</span>
    <MarkdownContent content={content} sources={original?.sources} />
    {changes.length > 0 && <FileChangesCard changes={changes} onOpen={openChangesTab} />}
    {original?.run && <RunProgressCard run={original.run} running={streaming} onStopSubtask={subtaskId => controller.stopSubtasks(subtaskId)} />}
    {!streaming && content && <AssistantToolbar message={original} onRerun={() => controller.rerun()} />}
  </MessagePrimitive.Root>
}

export function PilotWorkbench({ controller }: { controller: PilotController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceWidth, setWorkspaceWidth] = useState(42)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTabId>('overview')
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(workspaceTabDefaults)
  const [responding, setResponding] = useState(false)
  const [memoryResponding, setMemoryResponding] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [selectedChangeId, setSelectedChangeId] = useState<string>()
  useEffect(() => { if (sessionsOpen && !state.session) setNewTaskOpen(true) }, [sessionsOpen, state.session])
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
  useEffect(() => {
    setWorkspaceOpen(false)
    setSessionsOpen(false)
    setWorkspaceTabs(workspaceTabDefaults)
    setWorkspaceTab('overview')
    setSelectedChangeId(undefined)
  }, [state.session?.id])

  function openWorkspaceTab(id: WorkspaceTabId, label?: string) {
    setWorkspaceTabs(previous => previous.some(tab => tab.id === id)
      ? previous
      : [...previous, { id, label: label || workspaceTabLabel(id) }])
    setWorkspaceTab(id)
    setWorkspaceOpen(true)
    setSessionsOpen(false)
  }

  function closeWorkspaceTab(id: WorkspaceTabId) {
    if (id === 'overview') return
    const next = workspaceTabs.filter(tab => tab.id !== id)
    setWorkspaceTabs(next)
    if (workspaceTab === id) setWorkspaceTab(next[next.length - 1]?.id || 'overview')
  }

  function setWorkspaceTabLabel(id: WorkspaceTabId, label: string) {
    setWorkspaceTabs(previous => previous.map(tab => tab.id === id ? { ...tab, label } : tab))
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

  function resizeWorkspace(event: ReactPointerEvent<HTMLDivElement>) {
    if (!workspaceOpen || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = workspaceWidth
    const containerWidth = event.currentTarget.parentElement?.clientWidth || window.innerWidth
    const onMove = (move: PointerEvent) => {
      const delta = ((startX - move.clientX) / Math.max(containerWidth, 1)) * 100
      setWorkspaceWidth(Math.min(54, Math.max(32, startWidth + delta)))
    }
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd, { once: true })
    window.addEventListener('pointercancel', onEnd, { once: true })
  }

  const messageById = useMemo(() => new Map(state.messages.map(message => [message.id, message])), [state.messages])
  const workbenchValue = useMemo(() => ({ controller, openChangesTab: () => openWorkspaceTab('changes'), running: state.running }), [controller, state.running, workspaceTabs.length])
  return <WorkbenchContext.Provider value={workbenchValue}>
    <MessageLookupContext.Provider value={messageById}>
    <div className={`pilot-workbench${sessionsOpen ? ' pilot-workbench--sessions' : ''}${workspaceOpen ? ' pilot-workbench--workspace' : ''}`} style={{ '--pilot-workspace-width': `${workspaceWidth}%` } as CSSProperties} data-task-state={taskTone}>
    {sessionsOpen && <SessionDrawer state={state} controller={controller} newTaskOpen={newTaskOpen} onToggleNewTask={() => setNewTaskOpen(!newTaskOpen)} onClose={() => setSessionsOpen(false)} />}
    <main className="pilot-main">
      <header className="pilot-heading"><div className="pilot-heading__leading"><button type="button" className="pilot-heading__icon" aria-label="会话" aria-controls={sessionsOpen ? 'pilot-sessions' : undefined} aria-expanded={sessionsOpen} onClick={() => setSessionsOpen(!sessionsOpen)}><Menu size={17} /></button><div><small>{project?.name || '个人工作区'} / Harness</small><h1>{state.session?.title || '今天要研究、整理或完成什么？'}</h1><span className="pilot-heading__path" title={state.session?.workingDirectory}>{state.session?.workingDirectory || '新任务将在选定工作区中运行'}</span></div></div><div className="pilot-heading__actions"><TaskStateBadge taskState={taskState} taskTone={taskTone} running={isExecuting} hasSession={Boolean(state.session)} /><button type="button" className="pilot-heading__icon" aria-label="工作区" aria-controls="pilot-workspace" aria-expanded={workspaceOpen} onClick={() => { setWorkspaceOpen(!workspaceOpen); if (!workspaceOpen) setSessionsOpen(false) }}><PanelRight size={17} /></button></div></header>
      <div className={`pilot-thread-stage${hasTaskProgress ? ' pilot-thread-stage--summary' : ''}`}>
        {hasTaskProgress && <TaskSummary taskState={taskState} taskTone={taskTone} running={isExecuting} activities={activities} changes={changes.length} onOpenWorkspace={() => openWorkspaceTab('overview')} />}
      {state.error && <div className="pilot-error" role="alert"><CircleAlert size={16} />{state.error}</div>}
      {state.permission && <section className="pilot-action" aria-label="权限确认"><ShieldCheck size={19} /><div><strong>{state.permission.title}</strong><p>{state.permission.detail}</p><div className="pilot-action__buttons"><button type="button" disabled={responding} onClick={() => void respondPermission(false)}>拒绝</button><button type="button" disabled={responding} onClick={() => void respondPermission(true)}>允许</button></div></div></section>}
      {state.memoryConfirmation && <section className="pilot-action" aria-label="记忆确认"><ShieldCheck size={19} /><div><strong>保存到长期记忆</strong><p>{state.memoryConfirmation.content}</p><div className="pilot-action__buttons"><button type="button" disabled={memoryResponding} onClick={() => void respondMemory(false)}>不保存</button><button type="button" disabled={memoryResponding} onClick={() => void respondMemory(true)}>保存</button></div></div></section>}
      {interaction?.status === 'waiting' && <Interaction key={interaction.id} interaction={interaction} plan={state.session?.activePlan} selectionReady={Boolean(state.selection)} onConfirm={() => controller.confirmPlan()} onAnswer={value => controller.answerQuestion(value)} onCancel={interaction.kind === 'plan-review' ? () => controller.cancelPlan(interaction.planId) : undefined} />}
      <AssistantRuntimeProvider runtime={runtime}>
        <StreamMessageContext.Provider value={streamMessage}><ThreadPrimitive.Root className="pilot-thread">
          <ThreadPrimitive.Viewport className="pilot-thread__viewport"><div className="pilot-thread__messages">{!state.messages.length && <div className="pilot-empty"><strong>{state.session ? '从一个任务开始' : '先选择任务工作区'}</strong><p>{state.session ? '描述你要研究、整理或处理的内容，也可以从下方示例开始。' : '新任务可以放在个人工作区，也可以关联已有项目。'}</p>{!state.session && <button type="button" onClick={() => { setSessionsOpen(true); setWorkspaceOpen(false); setNewTaskOpen(true) }}><Plus size={16} />创建任务</button>}</div>}<ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />{changes.length > 0 && <button type="button" className="pilot-thread-link" onClick={() => openWorkspaceTab('changes')}><GitCompare size={15} />查看 {changes.length} 个文件变更 <ArrowRight size={14} /></button>}</div></ThreadPrimitive.Viewport>
          <HarnessComposer state={state} controller={controller} planning={planning} setPlanning={setPlanning} />
        </ThreadPrimitive.Root></StreamMessageContext.Provider>
      </AssistantRuntimeProvider>
      </div>
    </main>
    {workspaceOpen && <div className="pilot-workspace-resize" role="separator" tabIndex={0} aria-label="调整工作区宽度" aria-orientation="vertical" aria-valuemin={32} aria-valuemax={54} aria-valuenow={workspaceWidth} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWorkspaceWidth(value => Math.min(54, Math.max(32, value + (event.key === 'ArrowLeft' ? 2 : -2)))) } }} onPointerDown={resizeWorkspace} />}
    <aside id="pilot-workspace" className={`pilot-inspector pilot-drawer${workspaceOpen ? '' : ' is-collapsed'}`} aria-label="工作区" aria-hidden={!workspaceOpen}>
      <div className="pilot-inspector__head"><div><strong>工作区</strong><small>{project?.name || '个人工作区'} · {taskState}</small></div><button type="button" title="关闭工作区" aria-label="关闭工作区" onClick={() => setWorkspaceOpen(false)}><X size={16} /></button></div>
      <WorkspaceTabs tabs={workspaceTabs} active={workspaceTab} changes={changes.length} onOpen={openWorkspaceTab} onActivate={setWorkspaceTab} onClose={closeWorkspaceTab} />
      <div className="pilot-inspector__body">
        {workspaceTabs.map(tab => <div key={tab.id} className={`pilot-panel-view${workspaceTab === tab.id ? ' is-active' : ''}`} aria-hidden={workspaceTab !== tab.id}>
          {tab.id === 'overview' && <OverviewPanel taskState={taskState} taskTone={taskTone} latestRun={latestRun} activities={activities} tools={state.session?.toolCalls || []} />}
          {tab.id === 'files' && <FilesPanel key={state.session?.id || 'empty'} controller={controller} directory={state.session?.workingDirectory || project?.directory} onOpenDirectory={() => void controller.openProjectDirectory()} onSelectFile={path => setWorkspaceTabLabel('files', path.split(/[\\/]/).pop() || '文件')} opening={state.openingProjectDirectory} />}
          {tab.id === 'changes' && <ChangesPanel changes={changes} selectedChangeId={selectedChangeId} onSelect={id => { setSelectedChangeId(id); setWorkspaceTabLabel('changes', changes.find(change => change.key === id)?.path.split(/[\\/]/).pop() || '变更') }} />}
          {tab.id === 'terminal' && <TerminalPanel controller={controller} sessionId={state.session?.id} />}
          {tab.id === 'browser' && <BrowserPanel controller={controller} sessionId={state.session?.id} active={workspaceOpen && workspaceTab === 'browser'} />}
        </div>)}
      </div>
    </aside>
    </div>
    </MessageLookupContext.Provider>
  </WorkbenchContext.Provider>
}

function workspaceTabLabel(id: WorkspaceTabId) {
  return { overview: '任务活动', files: '文件', changes: '变更', terminal: '终端', browser: '浏览器' }[id]
}

function WorkspaceTabs({ tabs, active, changes, onOpen, onActivate, onClose }: { tabs: WorkspaceTab[]; active: WorkspaceTabId; changes: number; onOpen: (id: WorkspaceTabId) => void; onActivate: (id: WorkspaceTabId) => void; onClose: (id: WorkspaceTabId) => void }) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  const choices: Array<{ id: WorkspaceTabId; icon: typeof Activity }> = [
    { id: 'files', icon: FileCode2 }, { id: 'changes', icon: GitCompare },
    { id: 'terminal', icon: TerminalSquare }, { id: 'browser', icon: Globe2 },
  ]
  const icons = { overview: Activity, files: FileCode2, changes: GitCompare, terminal: TerminalSquare, browser: Globe2 }
  return <nav className="pilot-side-tabs" aria-label="已打开的工作内容">
    <div className="pilot-side-tabs__list">{tabs.map(tab => {
      const Icon = icons[tab.id]
      return <div key={tab.id} className={`pilot-side-tab${active === tab.id ? ' is-active' : ''}`}>
        <button type="button" className="pilot-side-tab__select" aria-current={active === tab.id ? 'page' : undefined} title={tab.label} onClick={() => onActivate(tab.id)}><Icon size={14} /><span>{tab.label}</span>{tab.id === 'changes' && changes > 0 && <em>{changes}</em>}</button>
        {tab.id !== 'overview' && <button type="button" className="pilot-side-tab__close" title={`关闭${tab.label}`} aria-label={`关闭${tab.label}`} onClick={() => onClose(tab.id)}><X size={12} /></button>}
      </div>
    })}</div>
    <details ref={menuRef} className="pilot-side-tabs__menu"><summary title="打开工作内容" aria-label="打开工作内容"><Plus size={16} /></summary><div className="pilot-side-tabs__options">{choices.map(({ id, icon: Icon }) => <button key={id} type="button" onClick={() => { onOpen(id); if (menuRef.current) menuRef.current.open = false }}><Icon size={15} />{workspaceTabLabel(id)}</button>)}</div></details>
  </nav>
}

function TaskStateBadge({ taskState, taskTone, running, hasSession }: { taskState: string; taskTone: PilotTaskTone; running: boolean; hasSession: boolean }) {
  const label = running ? '执行中' : taskState === '等待下一步' ? (hasSession ? '就绪' : '尚未选择任务') : taskState
  const showAlert = taskTone === 'waiting' || taskTone === 'partial' || taskTone === 'failed'
  return <div className={`pilot-heading__state pilot-heading__state--${taskTone}`} aria-live="polite">{running && <LoaderCircle size={15} className="pilot-spin" />}{showAlert && <CircleAlert size={15} />}{taskTone === 'completed' && <Check size={15} />}{taskTone === 'stopped' && <Square size={13} />}{label}</div>
}

function TaskSummary({ taskState, taskTone, running, activities, changes, onOpenWorkspace }: { taskState: string; taskTone: PilotTaskTone; running: boolean; activities: HarnessRunActivity[]; changes: number; onOpenWorkspace: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const current = activities.find(activity => activity.status === 'running')
  return <aside className={`pilot-summary pilot-summary--${taskTone}${expanded ? ' is-expanded' : ''}`} aria-label="任务摘要"><button type="button" className="pilot-summary__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span className="pilot-summary__signal"><span className={`pilot-summary__dot pilot-summary__dot--${taskTone}`} />{running ? '正在执行' : taskState}</span><strong>{current?.label || (changes ? `${changes} 个文件有变更` : '任务上下文')}</strong></button>{expanded && <div className="pilot-summary__details"><span>{current?.detail || (running ? 'Mira 正在处理当前任务' : '打开工作区查看完整活动')}</span><button type="button" onClick={onOpenWorkspace}>查看工作区 <PanelRight size={14} /></button></div>}</aside>
}

function OverviewPanel({ taskState, taskTone, latestRun, activities, tools }: { taskState: string; taskTone: PilotTaskTone; latestRun?: HarnessRunSummaryLike; activities: HarnessRunActivity[]; tools: ToolCallRecord[] }) {
  return <div className="pilot-panel-stack"><section className={`pilot-panel-hero pilot-panel-hero--${taskTone}`}><span className="pilot-panel-kicker">当前任务</span><strong>{taskState}</strong>{latestRun?.error && <p className="pilot-tool__error">{latestRun.error}</p>}</section><PanelSection title="执行活动"><div className="pilot-activity-list">{activities.length ? activities.map(activity => <div className="pilot-activity" key={activity.id}><span className={`pilot-status-dot pilot-status-dot--${activity.status}`} /><div><strong>{activity.label}</strong>{activity.detail && <small>{activity.detail}</small>}</div><small>{activity.status === 'completed' ? '已完成' : activity.status === 'running' ? '执行中' : activity.status === 'failed' ? '失败' : '待执行'}</small></div>) : <p>暂无活动</p>}</div></PanelSection><PanelSection title="工具记录">{tools.length ? tools.map(tool => <details className="pilot-tool" key={tool.id}><summary><span>{tool.tool}</span><small>{tool.status === 'ok' ? '已完成' : tool.status === 'running' ? '执行中' : tool.status === 'failed' ? '失败' : '待确认'}</small></summary>{tool.target && <p>{tool.target}</p>}{tool.error && <p className="pilot-tool__error">{tool.error}</p>}{tool.diff && <pre>{tool.diff}</pre>}</details>) : <p>暂无工具记录</p>}</PanelSection></div>
}

type HarnessRunSummaryLike = { error?: string }

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="pilot-panel-section"><h2>{title}</h2>{children}</section>
}

function FilesPanel({ controller, directory, onOpenDirectory, onSelectFile, opening }: { controller: PilotController; directory?: string; onOpenDirectory: () => void; onSelectFile: (path: string) => void; opening?: boolean }) {
  const root = directory?.split(/[\\/]/).filter(Boolean).pop() || '未关联项目'
  const [entries, setEntries] = useState<Record<string, HarnessWorkspaceFileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<{ path: string; content: string }>()
  const [error, setError] = useState('')
  const requestId = useRef(0)
  useEffect(() => {
    if (!directory) return
    let current = true
    setLoading(new Set(['']))
    void controller.listFiles('').then(result => {
      if (current) setEntries({ '': result.entries })
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : '文件列表加载失败')
    }).finally(() => {
      if (current) setLoading(new Set())
    })
    return () => { current = false; requestId.current++ }
  }, [controller, directory])
  async function toggleFolder(path: string) {
    if (expanded.has(path)) {
      setExpanded(previous => { const next = new Set(previous); next.delete(path); return next })
      return
    }
    setExpanded(previous => new Set(previous).add(path))
    if (entries[path] || loading.has(path)) return
    setLoading(previous => new Set(previous).add(path))
    try {
      const result = await controller.listFiles(path)
      setEntries(previous => ({ ...previous, [path]: result.entries }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件列表加载失败')
    } finally {
      setLoading(previous => { const next = new Set(previous); next.delete(path); return next })
    }
  }
  async function openFile(path: string) {
    const current = ++requestId.current
    setSelected(undefined)
    setError('')
    try {
      const result = await controller.readFile(path)
      if (current === requestId.current) { setSelected(result); onSelectFile(path) }
    } catch (cause) {
      if (current === requestId.current) setError(cause instanceof Error ? cause.message : '文件预览失败')
    }
  }
  function renderEntries(parent: string, depth: number): ReactNode {
    return entries[parent]?.map(entry => <div key={entry.path}><button type="button" className={selected?.path === entry.path ? 'pilot-tree-row is-selected' : 'pilot-tree-row'} style={{ paddingLeft: 12 + depth * 16 }} onClick={() => entry.type === 'directory' ? void toggleFolder(entry.path) : void openFile(entry.path)}>{entry.type === 'directory' ? <FolderOpen size={14} /> : <FileText size={14} />}<span>{entry.name}</span></button>{entry.type === 'directory' && expanded.has(entry.path) && <>{loading.has(entry.path) && <p className="pilot-tree-loading">正在加载…</p>}{renderEntries(entry.path, depth + 1)}</>}</div>)
  }
  return <div className="pilot-files"><div className="pilot-panel-toolbar"><div><strong>{root}</strong><span>{directory || '创建任务后，项目文件会显示在这里'}</span></div><button type="button" className="pilot-inline-button" disabled={!directory || opening} onClick={onOpenDirectory}>{opening ? <LoaderCircle size={14} className="pilot-spin" /> : <FolderOpen size={14} />} 打开目录</button></div>{directory ? <><div className="pilot-files__content"><div className="pilot-file-tree"><div className="pilot-tree-root"><FolderOpen size={15} /><span>{root}</span></div>{loading.has('') && <p className="pilot-tree-loading">正在加载…</p>}{renderEntries('', 0)}{entries['']?.length === 0 && <p className="pilot-tree-loading">目录为空</p>}</div><div className="pilot-file-preview">{selected ? <><strong>{selected.path}</strong><pre>{selected.content}</pre></> : <div className="pilot-file-preview__empty">选择文件查看内容</div>}</div></div>{error && <p className="pilot-file-error" role="alert">{error}</p>}</> : <EmptyPanel icon={<Search size={20} />} text="尚未选择工作目录" />}</div>
}

function ChangesPanel({ changes, selectedChangeId, onSelect }: { changes: Array<HarnessFileChange & { key: string }>; selectedChangeId?: string; onSelect: (id: string | undefined) => void }) {
  return <div className="pilot-panel-stack"><PanelSection title="本次任务变更">{changes.length ? changes.map(change => <div key={change.key}><button type="button" className={`pilot-change ${selectedChangeId === change.key ? 'is-selected' : ''}`} title={`查看 ${change.path} 的变更`} onClick={() => onSelect(selectedChangeId === change.key ? undefined : change.key)}><FileText size={15} /><span>{change.path}</span><small>{change.tool === 'delete' ? '删除' : change.tool === 'write' ? '写入' : '编辑'}</small></button>{selectedChangeId === change.key && <ChangePreview change={change} />}</div>) : <EmptyPanel icon={<GitCompare size={20} />} text="暂无文件变更" />}</PanelSection></div>
}

function CapabilityPanel({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="pilot-capability"><div className="pilot-capability__icon">{icon}</div><strong>{title}</strong><p>{detail}</p><span className="pilot-capability__status">宿主适配待接入</span></div>
}

function TerminalPanel({ controller, sessionId }: { controller: PilotController; sessionId?: string }) {
  const [terminalId, setTerminalId] = useState('')
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const terminalIdRef = useRef('')
  useEffect(() => {
    if (!sessionId) return
    let active = true
    const unsubscribe = controller.onTerminalEvent(event => {
      if (event.sessionId !== sessionId || event.payload.terminalId !== terminalIdRef.current) return
      if (event.type === 'terminal-output') {
        const data = typeof event.payload.data === 'string' ? event.payload.data : ''
        setOutput(previous => (previous + data).slice(-200_000))
      } else setError(`终端已退出（代码 ${String(event.payload.exitCode ?? '?')}）`)
    })
    void controller.openTerminal().then(result => {
      if (!active) return void controller.closeTerminalFor(sessionId, result.terminalId)
      terminalIdRef.current = result.terminalId
      setTerminalId(result.terminalId)
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '终端启动失败') })
    return () => {
      active = false
      unsubscribe()
      const current = terminalIdRef.current
      terminalIdRef.current = ''
      if (current) void controller.closeTerminalFor(sessionId, current)
    }
  }, [controller, sessionId])
  async function submit() {
    if (!terminalId || !input) return
    const text = input
    setInput('')
    try { await controller.writeTerminal(terminalId, `${text}\n`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '终端输入失败') }
  }
  return <div className="pilot-terminal"><div className="pilot-terminal__head"><span>{terminalId ? '已连接' : '正在连接…'}</span><small>{sessionId ? '会话工作目录' : '尚未选择任务'}</small></div><pre className="pilot-terminal__output">{output || (error ? '' : '等待终端输出…')}</pre>{error && <p className="pilot-file-error" role="alert">{error}</p>}<form className="pilot-terminal__input" onSubmit={event => { event.preventDefault(); void submit() }}><span>›</span><input value={input} disabled={!terminalId} onChange={event => setInput(event.target.value)} placeholder="输入命令，按 Enter 执行" aria-label="终端输入" /></form></div>
}

function BrowserPanel({ controller, sessionId, active }: { controller: PilotController; sessionId?: string; active: boolean }) {
  const [address, setAddress] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const openedRef = useRef(false)
  const bounds = (): HarnessBrowserBounds => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return { x: Math.max(0, Math.round(rect?.left || 0)), y: Math.max(0, Math.round(rect?.top || 0)), width: Math.max(16, Math.round(rect?.width || 0)), height: Math.max(16, Math.round(rect?.height || 0)) }
  }
  useEffect(() => {
    openedRef.current = false
    setUrl('')
    setAddress('')
    setError('')
    if (!sessionId) return
    const unsubscribe = controller.onBrowserEvent(event => {
      if (event.sessionId !== sessionId) return
      if (event.url) { setUrl(event.url); setAddress(event.url) }
      setCanGoBack(event.canGoBack)
      setCanGoForward(event.canGoForward)
      setLoading(event.loading)
      setError(event.error || '')
    })
    return () => { unsubscribe(); if (openedRef.current) void controller.closeBrowserFor(sessionId) }
  }, [controller, sessionId])
  useEffect(() => {
    if (!active || !url || !viewportRef.current) return
    void controller.controlBrowser('show').then(() => controller.setBrowserBounds(bounds())).catch(cause => setError(cause instanceof Error ? cause.message : '浏览器视图调整失败'))
    const update = () => { void controller.setBrowserBounds(bounds()).catch(cause => setError(cause instanceof Error ? cause.message : '浏览器视图调整失败')) }
    const observer = new ResizeObserver(update)
    observer.observe(viewportRef.current)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [active, controller, url])
  useEffect(() => {
    if (!active && url) void controller.controlBrowser('hide').catch(cause => setError(cause instanceof Error ? cause.message : '浏览器视图隐藏失败'))
  }, [active, controller, url])
  async function navigate(event?: FormEvent) {
    event?.preventDefault()
    if (!sessionId || !address.trim()) return
    const value = /^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`
    try { setError(''); setLoading(true); setUrl(await controller.navigateBrowser(value, bounds())); openedRef.current = true }
    catch (cause) { setLoading(false); setError(cause instanceof Error ? cause.message : '浏览器地址无效') }
  }
  const control = (action: 'back' | 'forward' | 'reload') => { void controller.controlBrowser(action).catch(cause => setError(cause instanceof Error ? cause.message : '浏览器操作失败')) }
  return <div className="pilot-browser"><form className="pilot-browser__toolbar" onSubmit={event => void navigate(event)}><button type="button" onClick={() => control('back')} disabled={!canGoBack} aria-label="后退" title="后退"><ArrowLeft size={14} /></button><button type="button" onClick={() => control('forward')} disabled={!canGoForward} aria-label="前进" title="前进"><ArrowRight size={14} /></button><button type="button" onClick={() => control('reload')} disabled={!url} aria-label="刷新" title="刷新"><RotateCw size={14} /></button><input value={address} onChange={event => setAddress(event.target.value)} placeholder="输入网址 https://…" aria-label="浏览器地址" /><button type="submit" disabled={!sessionId || !address.trim() || loading}>打开</button></form>{error && <p className="pilot-file-error" role="alert">{error}</p>}<div ref={viewportRef} className="pilot-browser__view">{!url && <EmptyPanel icon={<Globe2 size={20} />} text={sessionId ? '输入网址开始浏览' : '尚未选择任务'} />}</div></div>
}

function EmptyPanel({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="pilot-empty-panel">{icon}<span>{text}</span></div>
}

function ChangePreview({ change }: { change: HarnessFileChange }) {
  return <div className="pilot-diff" aria-label="文件变更预览"><strong>{change.tool === 'delete' ? '删除' : change.tool === 'write' ? '写入' : '编辑'} · {change.path}</strong><pre>{change.diff || '此变更没有可显示的 diff。'}</pre></div>
}

function Interaction({ interaction, plan, selectionReady, onConfirm, onAnswer, onCancel }: { interaction: HarnessPendingInteraction; plan?: import('../../../src/config/harness').HarnessPlan; selectionReady: boolean; onConfirm: () => Promise<void>; onAnswer: (answers: HarnessUserAnswer[]) => Promise<void>; onCancel?: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false)
  if (interaction.kind === 'plan-review') return <section className="pilot-action"><ShieldCheck size={19} /><div><strong>方案已生成 · {plan?.steps.length ?? 0} 步</strong>{plan ? <><p>{plan.understanding}</p><ol className="pilot-plan-steps">{plan.steps.map((step, index) => <li key={index}><strong>{step.label}</strong>{step.detail && <span>{step.detail}</span>}</li>)}</ol>{plan.risks.length > 0 && <p>风险：{plan.risks.join('；')}</p>}</> : <p>计划内容未加载，暂不能确认。</p>}<div className="pilot-action__buttons"><button type="button" disabled={!selectionReady || submitting} onClick={() => { setSubmitting(true); void onCancel?.().finally(() => setSubmitting(false)) }}>取消方案</button><button type="button" disabled={!plan || !selectionReady || submitting} onClick={() => { setSubmitting(true); void onConfirm().finally(() => setSubmitting(false)) }}>确认并执行</button></div></div></section>
  return <ClarificationWizard interaction={interaction} selectionReady={selectionReady} onAnswer={onAnswer} />
}

function ClarificationWizard({ interaction, selectionReady, onAnswer }: { interaction: Extract<HarnessPendingInteraction, { kind: 'question' }>; selectionReady: boolean; onAnswer: (answers: HarnessUserAnswer[]) => Promise<void> }) {
  const questions = interaction.questions
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, HarnessUserAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const question = questions[step]
  if (!question) return null
  const current = answers[question.id] || { id: question.id, selected: [] }
  const update = (next: HarnessUserAnswer) => setAnswers(previous => ({ ...previous, [question.id]: next }))
  const answered = (item: HarnessUserAnswer) => Boolean(item.selected.length || item.custom?.trim())
  const complete = questions.every(item => answered(answers[item.id] || { id: item.id, selected: [] }))
  const isLast = step === questions.length - 1
  function advance(next: HarnessUserAnswer | undefined) {
    if (next) update(next)
    if (!isLast) setStep(value => Math.min(value + 1, questions.length - 1))
  }
  return <section className="pilot-action" aria-label="澄清问题"><div className="pilot-wizard">
    <header className="pilot-wizard__head"><strong>{question.header || '需要补充信息'}</strong><small>第 {step + 1} / {questions.length} 题</small></header>
    {questions.length > 1 && <div className="pilot-wizard__progress" aria-hidden="true">{questions.map((item, index) => <span key={item.id} className={index === step ? 'is-current' : answered(answers[item.id] || { id: item.id, selected: [] }) ? 'is-done' : ''} />)}</div>}
    <fieldset className="pilot-question"><legend>{question.question}</legend>{question.context && <p>{question.context}</p>}{question.options?.map(option => <label key={option.label}><input type={question.multiSelect ? 'checkbox' : 'radio'} name={question.id} checked={current.selected.includes(option.label)} onChange={() => update({ ...current, selected: question.multiSelect ? current.selected.includes(option.label) ? current.selected.filter(item => item !== option.label) : [...current.selected, option.label] : [option.label] })} /><span>{option.label}{option.description && <small>{option.description}</small>}</span></label>)}{question.allowCustom !== false && <textarea aria-label={`${question.question}的自定义回答`} placeholder="补充回答（可与选项同时填写）" value={current.custom || ''} onChange={event => update({ ...current, custom: event.target.value })} />}</fieldset>
    <div className="pilot-wizard__nav">
      <button type="button" disabled={step === 0} onClick={() => setStep(value => Math.max(0, value - 1))}>上一题</button>
      {!isLast && <button type="button" onClick={() => advance(undefined)}>下一题</button>}
      {!answered(current) && question.allowCustom !== false && <button type="button" onClick={() => advance({ id: question.id, selected: [] })}>跳过本题</button>}
      {isLast && <button type="button" className="pilot-wizard__submit" disabled={!complete || !selectionReady || submitting} onClick={() => { setSubmitting(true); void onAnswer(questions.map(item => answers[item.id] || { id: item.id, selected: [] })).finally(() => setSubmitting(false)) }}>{submitting ? '提交中…' : complete ? '提交回答' : '还有问题未回答'}</button>}
    </div>
  </div></section>
}
