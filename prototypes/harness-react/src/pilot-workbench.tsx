import { createContext, createElement, useContext, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { Activity, ArrowUp, Check, CircleAlert, FileCode2, FileText, FolderOpen, GitCompare, Globe2, LoaderCircle, Menu, PanelRight, Plus, Search, ShieldCheck, Square, TerminalSquare, X } from 'lucide-react'
import { isModelProviderAvailable, type HarnessFileChange, type HarnessMessage, type HarnessPendingInteraction, type HarnessRunActivity, type HarnessUserAnswer, type HarnessWorkspaceFileEntry, type ModelSelection, type ToolCallRecord } from '../../../src/config/harness'
import { getPilotTaskState, PilotController, projectPilotMessage, shouldRenderPilotStream } from './pilot-state'

function UserMessage() { return <MessagePrimitive.Root className="pilot-message pilot-message--user"><span className="pilot-message__role">你</span><MessagePrimitive.Content /></MessagePrimitive.Root> }
const StreamMessageContext = createContext<HarnessMessage | undefined>(undefined)
function AssistantMessage() {
  const id = useAuiState(state => state.message.id)
  const isOptimistic = useAuiState(state => state.message.metadata.isOptimistic)
  const stream = useContext(StreamMessageContext)
  return <MessagePrimitive.Root className="pilot-message pilot-message--assistant"><span className="pilot-message__role">Mira</span>{shouldRenderPilotStream(id, isOptimistic === true, stream?.id) ? <p>{stream?.content}</p> : <MessagePrimitive.Content />}</MessagePrimitive.Root>
}

export function PilotWorkbench({ controller }: { controller: PilotController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  // The task workspace is part of the Harness reading flow, not a secondary
  // destination. Open it when a task becomes active, while keeping the empty
  // state focused on task creation.
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceTab, setWorkspaceTab] = useState<'overview' | 'files' | 'changes' | 'terminal' | 'browser'>('overview')
  const [newTarget, setNewTarget] = useState('')
  const [creating, setCreating] = useState(false)
  const [responding, setResponding] = useState(false)
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
  const choices = state.providers.flatMap(provider => isModelProviderAvailable(provider)
    ? provider.models.filter(model => model.enabled).map(model => ({ providerId: provider.id, modelId: model.id, label: `${provider.name} / ${model.id}` })) : [])
  const selectionValue = state.selection ? `${state.selection.providerId}:${state.selection.modelId}` : ''
  const interaction = state.session?.pendingInteraction
  const lastMessage = state.messages[state.messages.length - 1]
  const streamMessage = lastMessage?.role === 'assistant' && lastMessage.id.startsWith('stream-') ? lastMessage : undefined
  const latestRun = [...state.messages].reverse().find(message => message.run)?.run
  const taskState = getPilotTaskState(state)
  const activities = state.session?.activeRun?.activities || [...state.messages].reverse().find(message => message.run)?.run?.activities || []
  const changes = state.messages.flatMap(message => (message.fileChanges || []).map(change => ({ ...change, key: `${message.id}:${change.toolCallId}` })))
  const selectedChange = changes.find(change => change.key === selectedChangeId)
  const project = state.projects.find(item => item.id === state.session?.projectId)
  const newProject = state.projects.find(item => newTarget === `project:${item.id}`)
  useEffect(() => {
    if (state.session?.id) setWorkspaceOpen(true)
  }, [state.session?.id])

  async function createTask() {
    if (!newTarget || creating) return
    setCreating(true)
    const created = await controller.create(newTarget === 'personal' ? undefined : newTarget.slice('project:'.length))
    setCreating(false)
    if (created) { setNewTaskOpen(false); setNewTarget('') }
  }

  async function respondPermission(allowed: boolean) {
    if (responding) return
    setResponding(true)
    await controller.permission(allowed)
    setResponding(false)
  }

  return <div className={`pilot-workbench${sessionsOpen ? ' pilot-workbench--sessions' : ''}${workspaceOpen ? ' pilot-workbench--workspace' : ''}`}>
    {sessionsOpen && <aside className="pilot-nav pilot-drawer" aria-label="会话">
      <div className="pilot-nav__head"><strong>会话</strong><button type="button" title="新任务" aria-label="新任务" aria-expanded={newTaskOpen} onClick={() => setNewTaskOpen(!newTaskOpen)}><Plus size={17} /></button></div>
      <button type="button" className="pilot-drawer__close" aria-label="关闭会话" onClick={() => setSessionsOpen(false)}><X size={15} /></button>
      {newTaskOpen && <div className="pilot-new-task"><label htmlFor="pilot-task-target">任务工作区</label><select id="pilot-task-target" value={newTarget} onChange={event => setNewTarget(event.target.value)}><option value="">选择工作区</option><option value="personal">个人工作区</option>{state.projects.map(item => <option key={item.id} value={`project:${item.id}`} disabled={!item.directoryExists}>{item.name}{item.directoryExists ? '' : '（目录不可用）'}</option>)}</select>{newProject && <p title={newProject.directory}>{newProject.directory}</p>}{newTarget === 'personal' && <p>创建后请核对实际工作目录再发送任务。</p>}<button type="button" disabled={!newTarget || creating} onClick={() => void createTask()}>{creating ? '创建中…' : '创建任务'}</button></div>}
      <div className="pilot-nav__list">{state.sessions.map(session => <button key={session.id} type="button" className={session.id === state.session?.id ? 'is-active' : ''} onClick={() => void controller.open(session.id)}><span>{session.title || '新任务'}</span><small>{session.projectName || '个人工作区'} · {session.status === 'failed' ? '失败' : session.status === 'completed' ? '已完成' : '进行中'}</small></button>)}</div>
    </aside>}
    <main className="pilot-main">
      <header className="pilot-heading"><div className="pilot-heading__leading"><button type="button" className="pilot-heading__icon" aria-label="打开会话" aria-pressed={sessionsOpen} onClick={() => { setSessionsOpen(!sessionsOpen); if (!sessionsOpen) setWorkspaceOpen(false) }}><Menu size={17} /></button><div><small>{project?.name || '个人工作区'} / Harness</small><h1>{state.session?.title || '今天要研究、整理或完成什么？'}</h1><span className="pilot-heading__path" title={state.session?.workingDirectory}>{state.session?.workingDirectory || '新任务将在选定工作区中运行'}</span></div></div><div className="pilot-heading__actions"><div className="pilot-heading__state">{state.running ? <><LoaderCircle size={15} className="pilot-spin" />执行中</> : taskState === '执行失败' || taskState === '部分操作未完成' ? <><CircleAlert size={15} />{taskState}</> : state.session ? <><Check size={15} />就绪</> : '尚未选择任务'}</div><button type="button" className="pilot-heading__icon" aria-label="打开工作区" aria-pressed={workspaceOpen} onClick={() => { setWorkspaceOpen(!workspaceOpen); if (!workspaceOpen) setSessionsOpen(false) }}><PanelRight size={17} /></button></div></header>
      <div className={`pilot-thread-stage${state.session ? ' pilot-thread-stage--summary' : ''}`}>
        {state.session && <TaskSummary taskState={taskState} running={state.running} activities={activities} changes={changes.length} onOpenWorkspace={() => { setWorkspaceOpen(true); setSessionsOpen(false); setWorkspaceTab('overview') }} />}
      {state.error && <div className="pilot-error" role="alert"><CircleAlert size={16} />{state.error}</div>}
      {state.permission && <section className="pilot-action" aria-label="权限确认"><ShieldCheck size={19} /><div><strong>{state.permission.title}</strong><p>{state.permission.detail}</p><div className="pilot-action__buttons"><button type="button" disabled={responding} onClick={() => void respondPermission(false)}>拒绝</button><button type="button" disabled={responding} onClick={() => void respondPermission(true)}>允许</button></div></div></section>}
      {interaction?.status === 'waiting' && <Interaction key={interaction.id} interaction={interaction} plan={state.session?.activePlan} selectionReady={Boolean(state.selection)} onConfirm={() => controller.confirmPlan()} onAnswer={value => controller.answerQuestion(value)} />}
      <AssistantRuntimeProvider runtime={runtime}>
        <StreamMessageContext.Provider value={streamMessage}><ThreadPrimitive.Root className="pilot-thread">
          <ThreadPrimitive.Viewport className="pilot-thread__viewport"><div className="pilot-thread__messages">{!state.messages.length && <div className="pilot-empty"><strong>{state.session ? '从一个任务开始' : '先选择任务工作区'}</strong><p>{state.session ? '描述你要研究、整理或处理的内容。' : '新任务可以放在个人工作区，也可以关联已有项目。'}</p>{!state.session && <button type="button" onClick={() => { setSessionsOpen(true); setWorkspaceOpen(false); setNewTaskOpen(true) }}><Plus size={16} />创建任务</button>}</div>}<ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /></div></ThreadPrimitive.Viewport>
          <div className="pilot-composer"><div className="pilot-composer__settings"><label htmlFor="pilot-model">模型</label><select id="pilot-model" value={selectionValue} onChange={event => { const choice = choices.find(item => `${item.providerId}:${item.modelId}` === event.target.value); if (choice) controller.select({ providerId: choice.providerId, modelId: choice.modelId } satisfies ModelSelection) }}><option value="" disabled>{choices.length ? '选择模型' : '请先在设置中配置模型'}</option>{choices.map(choice => <option key={`${choice.providerId}:${choice.modelId}`} value={`${choice.providerId}:${choice.modelId}`}>{choice.label}</option>)}</select><div className="pilot-mode" role="group" aria-label="执行模式"><button type="button" className={!planning ? 'is-active' : ''} aria-pressed={!planning} onClick={() => setPlanning(false)}>直接执行</button><button type="button" className={planning ? 'is-active' : ''} aria-pressed={planning} onClick={() => setPlanning(true)}>先出计划</button></div></div><ComposerPrimitive.Root className="pilot-composer__form"><ComposerPrimitive.Input placeholder={state.session ? '描述你的任务…' : '先从左侧创建任务'} aria-label="任务内容" /><div className="pilot-composer__actions"><span>{state.running ? '任务执行中' : state.session ? 'Enter 发送，Shift+Enter 换行' : '先选择工作区'}</span>{state.running ? <button type="button" title="停止任务" aria-label="停止任务" onClick={() => void controller.stop()}><Square size={16} /></button> : <ComposerPrimitive.Send title="发送任务" aria-label="发送任务"><ArrowUp size={18} /></ComposerPrimitive.Send>}</div></ComposerPrimitive.Root></div>
        </ThreadPrimitive.Root></StreamMessageContext.Provider>
      </AssistantRuntimeProvider>
      </div>
    </main>
    {workspaceOpen && <aside className="pilot-inspector pilot-drawer" aria-label="工作区">
      <div className="pilot-inspector__head"><div><strong>工作区</strong><small>{project?.name || '个人工作区'}</small></div><button type="button" className="pilot-drawer__close" aria-label="关闭工作区" onClick={() => setWorkspaceOpen(false)}><X size={15} /></button></div>
      <nav className="pilot-side-tabs" aria-label="工作区面板">
        {([['overview', Activity, '概览'], ['files', FileCode2, '文件'], ['changes', GitCompare, '变更'], ['terminal', TerminalSquare, '终端'], ['browser', Globe2, '浏览器']] as const).map(([id, Icon, label]) => <button key={id} type="button" className={workspaceTab === id ? 'is-active' : ''} aria-pressed={workspaceTab === id} onClick={() => setWorkspaceTab(id)}><Icon size={15} /><span>{label}</span>{id === 'changes' && changes.length > 0 && <em>{changes.length}</em>}</button>)}
      </nav>
      <div className="pilot-inspector__body">
        {workspaceTab === 'overview' && <OverviewPanel taskState={taskState} latestRun={latestRun} activities={activities} tools={state.session?.toolCalls || []} />}
        {workspaceTab === 'files' && <FilesPanel key={state.session?.id || 'empty'} controller={controller} directory={state.session?.workingDirectory || project?.directory} onOpenDirectory={() => void controller.openProjectDirectory()} opening={state.openingProjectDirectory} />}
        {workspaceTab === 'changes' && <ChangesPanel changes={changes} selectedChangeId={selectedChangeId} onSelect={setSelectedChangeId} />}
        {workspaceTab === 'terminal' && <TerminalPanel controller={controller} sessionId={state.session?.id} />}
        {workspaceTab === 'browser' && <BrowserPanel controller={controller} sessionId={state.session?.id} />}
      </div>
    </aside>}
  </div>
}

function TaskSummary({ taskState, running, activities, changes, onOpenWorkspace }: { taskState: string; running: boolean; activities: HarnessRunActivity[]; changes: number; onOpenWorkspace: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const current = activities.find(activity => activity.status === 'running')
  return <aside className={`pilot-summary${expanded ? ' is-expanded' : ''}`} aria-label="任务摘要"><button type="button" className="pilot-summary__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span className="pilot-summary__signal"><span className={running ? 'is-running' : 'is-idle'} />{running ? '正在执行' : taskState}</span><strong>{current?.label || (changes ? `${changes} 个文件有变更` : '任务上下文')}</strong></button>{expanded && <div className="pilot-summary__details"><span>{current?.detail || (running ? 'Mira 正在处理当前任务' : '打开工作区查看完整活动')}</span><button type="button" onClick={onOpenWorkspace}>查看工作区 <PanelRight size={14} /></button></div>}</aside>
}

function OverviewPanel({ taskState, latestRun, activities, tools }: { taskState: string; latestRun?: HarnessRunSummaryLike; activities: HarnessRunActivity[]; tools: ToolCallRecord[] }) {
  return <div className="pilot-panel-stack"><section className="pilot-panel-hero"><span className="pilot-panel-kicker">当前任务</span><strong>{taskState}</strong>{latestRun?.error && <p className="pilot-tool__error">{latestRun.error}</p>}</section><PanelSection title="执行活动"><div className="pilot-activity-list">{activities.length ? activities.map(activity => <div className="pilot-activity" key={activity.id}><span className={`pilot-status-dot pilot-status-dot--${activity.status}`} /><div><strong>{activity.label}</strong>{activity.detail && <small>{activity.detail}</small>}</div><small>{activity.status === 'completed' ? '已完成' : activity.status === 'running' ? '执行中' : activity.status === 'failed' ? '失败' : '待执行'}</small></div>) : <p>暂无活动</p>}</div></PanelSection><PanelSection title="工具记录">{tools.length ? tools.map(tool => <details className="pilot-tool" key={tool.id}><summary><span>{tool.tool}</span><small>{tool.status === 'ok' ? '已完成' : tool.status === 'running' ? '执行中' : tool.status === 'failed' ? '失败' : '待确认'}</small></summary>{tool.target && <p>{tool.target}</p>}{tool.error && <p className="pilot-tool__error">{tool.error}</p>}{tool.diff && <pre>{tool.diff}</pre>}</details>) : <p>暂无工具记录</p>}</PanelSection></div>
}

type HarnessRunSummaryLike = { error?: string }

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="pilot-panel-section"><h2>{title}</h2>{children}</section>
}

function FilesPanel({ controller, directory, onOpenDirectory, opening }: { controller: PilotController; directory?: string; onOpenDirectory: () => void; opening?: boolean }) {
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
      if (current === requestId.current) setSelected(result)
    } catch (cause) {
      if (current === requestId.current) setError(cause instanceof Error ? cause.message : '文件预览失败')
    }
  }
  function renderEntries(parent: string, depth: number): ReactNode {
    return entries[parent]?.map(entry => <div key={entry.path}><button type="button" className={selected?.path === entry.path ? 'pilot-tree-row is-selected' : 'pilot-tree-row'} style={{ paddingLeft: 12 + depth * 16 }} onClick={() => entry.type === 'directory' ? void toggleFolder(entry.path) : void openFile(entry.path)}>{entry.type === 'directory' ? <FolderOpen size={14} /> : <FileText size={14} />}<span>{entry.name}</span></button>{entry.type === 'directory' && expanded.has(entry.path) && <>{loading.has(entry.path) && <p className="pilot-tree-loading">正在加载…</p>}{renderEntries(entry.path, depth + 1)}</>}</div>)
  }
  return <div className="pilot-panel-stack"><div className="pilot-panel-toolbar"><div><strong>{root}</strong><span>{directory || '创建任务后，项目文件会显示在这里'}</span></div><button type="button" className="pilot-inline-button" disabled={!directory || opening} onClick={onOpenDirectory}>{opening ? <LoaderCircle size={14} className="pilot-spin" /> : <FolderOpen size={14} />} 打开目录</button></div>{directory ? <><div className="pilot-file-tree"><div className="pilot-tree-root"><FolderOpen size={15} /><span>{root}</span></div>{loading.has('') && <p className="pilot-tree-loading">正在加载…</p>}{renderEntries('', 0)}{entries['']?.length === 0 && <p className="pilot-tree-loading">目录为空</p>}</div>{error && <p className="pilot-file-error" role="alert">{error}</p>}{selected && <div className="pilot-file-preview"><strong>{selected.path}</strong><pre>{selected.content}</pre></div>}</> : <EmptyPanel icon={<Search size={20} />} text="尚未选择工作目录" />}</div>
}

function ChangesPanel({ changes, selectedChangeId, onSelect }: { changes: Array<HarnessFileChange & { key: string }>; selectedChangeId?: string; onSelect: (id: string | undefined) => void }) {
  return <div className="pilot-panel-stack"><PanelSection title="本次任务变更">{changes.length ? changes.map(change => <div key={change.key}><button type="button" className={`pilot-change ${selectedChangeId === change.key ? 'is-selected' : ''}`} title={`查看 ${change.path} 的变更`} onClick={() => onSelect(selectedChangeId === change.key ? undefined : change.key)}><FileText size={15} /><span>{change.path}</span><small>{change.tool === 'delete' ? '删除' : change.tool === 'write' ? '写入' : '编辑'}</small></button>{selectedChangeId === change.key && <ChangePreview change={change} />}</div>) : <EmptyPanel icon={<GitCompare size={20} />} text="暂无文件变更" />}</PanelSection></div>
}

function CapabilityPanel({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="pilot-capability"><div className="pilot-capability__icon">{icon}</div><strong>{title}</strong><p>{detail}</p><span className="pilot-capability__status">宿主适配待接入</span></div>
}

type EmbeddedWebview = HTMLElement & { goBack(): void; goForward(): void; reload(): void; openDevTools(): void }

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

function BrowserPanel({ controller, sessionId }: { controller: PilotController; sessionId?: string }) {
  const [address, setAddress] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const webviewRef = useRef<EmbeddedWebview | null>(null)
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    const handleNavigate = (event: Event & { url?: string; preventDefault: () => void }) => {
      const next = event.url || ''
      if (!/^https?:\/\//i.test(next)) event.preventDefault()
      else setAddress(next)
    }
    const handleDidNavigate = (event: Event & { url?: string }) => { if (event.url) setAddress(event.url) }
    webview.addEventListener('will-navigate', handleNavigate as EventListener)
    webview.addEventListener('did-navigate', handleDidNavigate as EventListener)
    return () => { webview.removeEventListener('will-navigate', handleNavigate as EventListener); webview.removeEventListener('did-navigate', handleDidNavigate as EventListener) }
  }, [url])
  async function navigate(event?: FormEvent) {
    event?.preventDefault()
    if (!sessionId || !address.trim()) return
    const value = /^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`
    try { setError(''); setUrl(await controller.navigateBrowser(value)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '浏览器地址无效') }
  }
  return <div className="pilot-browser"><form className="pilot-browser__toolbar" onSubmit={event => void navigate(event)}><button type="button" onClick={() => webviewRef.current?.goBack()} disabled={!url} aria-label="后退">‹</button><button type="button" onClick={() => webviewRef.current?.goForward()} disabled={!url} aria-label="前进">›</button><button type="button" onClick={() => webviewRef.current?.reload()} disabled={!url} aria-label="刷新">↻</button><input value={address} onChange={event => setAddress(event.target.value)} placeholder="输入网址 https://…" aria-label="浏览器地址" /><button type="submit" disabled={!sessionId || !address.trim()}>打开</button></form>{error && <p className="pilot-file-error" role="alert">{error}</p>}{url ? createElement('webview', { ref: (node: EmbeddedWebview | null) => { webviewRef.current = node }, src: url, partition: 'persist:mira-harness-browser', allowpopups: false, className: 'pilot-browser__view' }) : <EmptyPanel icon={<Globe2 size={20} />} text={sessionId ? '输入网址开始浏览' : '尚未选择任务'} />}</div>
}

function EmptyPanel({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="pilot-empty-panel">{icon}<span>{text}</span></div>
}

function ChangePreview({ change }: { change: HarnessFileChange }) {
  return <div className="pilot-diff" aria-label="文件变更预览"><strong>{change.tool === 'delete' ? '删除' : change.tool === 'write' ? '写入' : '编辑'} · {change.path}</strong><pre>{change.diff || '此变更没有可显示的 diff。'}</pre></div>
}

function Interaction({ interaction, plan, selectionReady, onConfirm, onAnswer }: { interaction: HarnessPendingInteraction; plan?: import('../../../src/config/harness').HarnessPlan; selectionReady: boolean; onConfirm: () => Promise<void>; onAnswer: (answers: HarnessUserAnswer[]) => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, HarnessUserAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  if (interaction.kind === 'plan-review') return <section className="pilot-action"><ShieldCheck size={19} /><div><strong>计划等待确认</strong>{plan ? <><p>{plan.understanding}</p><ol className="pilot-plan-steps">{plan.steps.map((step, index) => <li key={index}><strong>{step.label}</strong>{step.detail && <span>{step.detail}</span>}</li>)}</ol>{plan.risks.length > 0 && <p>风险：{plan.risks.join('；')}</p>}</> : <p>计划内容未加载，暂不能确认。</p>}<div className="pilot-action__buttons"><button type="button" disabled={!plan || !selectionReady || submitting} onClick={() => { setSubmitting(true); void onConfirm().finally(() => setSubmitting(false)) }}>确认并执行</button></div></div></section>
  const complete = interaction.questions.every(question => Boolean(answers[question.id]?.selected.length || answers[question.id]?.custom?.trim()))
  return <section className="pilot-action"><ShieldCheck size={19} /><div><strong>需要补充信息</strong>{interaction.questions.map(question => {
    const current = answers[question.id] || { id: question.id, selected: [] }
    const update = (next: HarnessUserAnswer) => setAnswers(previous => ({ ...previous, [question.id]: next }))
    return <fieldset className="pilot-question" key={question.id}><legend>{question.question}</legend>{question.context && <p>{question.context}</p>}{question.options?.map(option => <label key={option.label}><input type={question.multiSelect ? 'checkbox' : 'radio'} name={question.id} checked={current.selected.includes(option.label)} onChange={() => update({ ...current, selected: question.multiSelect ? current.selected.includes(option.label) ? current.selected.filter(item => item !== option.label) : [...current.selected, option.label] : [option.label] })} /><span>{option.label}{option.description && <small>{option.description}</small>}</span></label>)}{question.allowCustom !== false && <textarea aria-label={`${question.question}的自定义回答`} placeholder="补充回答" value={current.custom || ''} onChange={event => update({ ...current, custom: event.target.value })} />}</fieldset>
  })}<div className="pilot-action__buttons"><button type="button" disabled={!complete || !selectionReady || submitting} onClick={() => { setSubmitting(true); void onAnswer(interaction.questions.map(question => answers[question.id] || { id: question.id, selected: [] })).finally(() => setSubmitting(false)) }}>提交回答</button></div></div></section>
}
