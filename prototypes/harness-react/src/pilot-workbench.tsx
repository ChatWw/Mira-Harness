import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { ArrowUp, Check, CircleAlert, FileText, FolderOpen, LoaderCircle, Menu, PanelRight, Plus, ShieldCheck, Square, X } from 'lucide-react'
import { isModelProviderAvailable, type HarnessFileChange, type HarnessMessage, type HarnessPendingInteraction, type HarnessUserAnswer, type ModelSelection } from '../../../src/config/harness'
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
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
      {state.error && <div className="pilot-error" role="alert"><CircleAlert size={16} />{state.error}</div>}
      {state.permission && <section className="pilot-action" aria-label="权限确认"><ShieldCheck size={19} /><div><strong>{state.permission.title}</strong><p>{state.permission.detail}</p><div className="pilot-action__buttons"><button type="button" disabled={responding} onClick={() => void respondPermission(false)}>拒绝</button><button type="button" disabled={responding} onClick={() => void respondPermission(true)}>允许</button></div></div></section>}
      {interaction?.status === 'waiting' && <Interaction key={interaction.id} interaction={interaction} plan={state.session?.activePlan} selectionReady={Boolean(state.selection)} onConfirm={() => controller.confirmPlan()} onAnswer={value => controller.answerQuestion(value)} />}
      <AssistantRuntimeProvider runtime={runtime}>
        <StreamMessageContext.Provider value={streamMessage}><ThreadPrimitive.Root className="pilot-thread">
          <ThreadPrimitive.Viewport className="pilot-thread__viewport"><div className="pilot-thread__messages">{!state.messages.length && <div className="pilot-empty"><strong>{state.session ? '从一个任务开始' : '先选择任务工作区'}</strong><p>{state.session ? '描述你要研究、整理或处理的内容。' : '新任务可以放在个人工作区，也可以关联已有项目。'}</p>{!state.session && <button type="button" onClick={() => { setSessionsOpen(true); setWorkspaceOpen(false); setNewTaskOpen(true) }}><Plus size={16} />创建任务</button>}</div>}<ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /></div></ThreadPrimitive.Viewport>
          <div className="pilot-composer"><div className="pilot-composer__settings"><label htmlFor="pilot-model">模型</label><select id="pilot-model" value={selectionValue} onChange={event => { const choice = choices.find(item => `${item.providerId}:${item.modelId}` === event.target.value); if (choice) controller.select({ providerId: choice.providerId, modelId: choice.modelId } satisfies ModelSelection) }}><option value="" disabled>{choices.length ? '选择模型' : '请先在设置中配置模型'}</option>{choices.map(choice => <option key={`${choice.providerId}:${choice.modelId}`} value={`${choice.providerId}:${choice.modelId}`}>{choice.label}</option>)}</select><div className="pilot-mode" role="group" aria-label="执行模式"><button type="button" className={!planning ? 'is-active' : ''} aria-pressed={!planning} onClick={() => setPlanning(false)}>直接执行</button><button type="button" className={planning ? 'is-active' : ''} aria-pressed={planning} onClick={() => setPlanning(true)}>先出计划</button></div></div><ComposerPrimitive.Root className="pilot-composer__form"><ComposerPrimitive.Input placeholder={state.session ? '描述你的任务…' : '先从左侧创建任务'} aria-label="任务内容" /><div className="pilot-composer__actions"><span>{state.running ? '任务执行中' : state.session ? 'Enter 发送，Shift+Enter 换行' : '先选择工作区'}</span>{state.running ? <button type="button" title="停止任务" aria-label="停止任务" onClick={() => void controller.stop()}><Square size={16} /></button> : <ComposerPrimitive.Send title="发送任务" aria-label="发送任务"><ArrowUp size={18} /></ComposerPrimitive.Send>}</div></ComposerPrimitive.Root></div>
        </ThreadPrimitive.Root></StreamMessageContext.Provider>
      </AssistantRuntimeProvider>
    </main>
    {workspaceOpen && <aside className="pilot-inspector pilot-drawer" aria-label="工作区">
      <div className="pilot-inspector__head">工作区</div>
      <button type="button" className="pilot-drawer__close" aria-label="关闭工作区" onClick={() => setWorkspaceOpen(false)}><X size={15} /></button>
      <section><h2>任务状态</h2><p>{taskState}</p>{latestRun?.error && <p className="pilot-tool__error">{latestRun.error}</p>}</section>
      <section><h2>执行活动</h2>{activities.length ? activities.map(activity => <div className="pilot-activity" key={activity.id}><strong>{activity.label}</strong><small>{activity.status === 'completed' ? '已完成' : activity.status === 'running' ? '执行中' : activity.status === 'failed' ? '失败' : '待执行'}</small></div>) : <p>暂无活动</p>}</section>
      <section><h2>文件变更</h2>{changes.length ? changes.map(change => <button type="button" className="pilot-change" key={change.key} title={`查看 ${change.path} 的变更`} onClick={() => setSelectedChangeId(selectedChangeId === change.key ? undefined : change.key)}><FileText size={15} /><span>{change.path}</span></button>) : <p>暂无文件变更</p>}{selectedChange && <ChangePreview change={selectedChange} />}</section>
      <section><h2>工具记录</h2>{state.session?.toolCalls.length ? state.session.toolCalls.map(tool => <details className="pilot-tool" key={tool.id}><summary><span>{tool.tool}</span><small>{tool.status === 'ok' ? '已完成' : tool.status === 'running' ? '执行中' : tool.status === 'failed' ? '失败' : '待确认'}</small></summary>{tool.target && <p>{tool.target}</p>}{tool.error && <p className="pilot-tool__error">{tool.error}</p>}{tool.diff && <pre>{tool.diff}</pre>}</details>) : <p>暂无工具记录</p>}</section>
      <section><h2>当前目录</h2><p className="pilot-path">{state.session?.workingDirectory || '未关联项目'}</p><button type="button" className="pilot-open-directory" disabled={!state.session?.workingDirectory || state.openingProjectDirectory} onClick={() => void controller.openProjectDirectory()}>{state.openingProjectDirectory ? <LoaderCircle size={14} className="pilot-spin" /> : <FolderOpen size={14} />}{state.openingProjectDirectory ? '正在打开…' : '在文件管理器中打开'}</button></section>
    </aside>}
  </div>
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
