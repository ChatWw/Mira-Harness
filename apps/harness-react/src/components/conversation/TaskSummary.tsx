/* Session plan directory adapted from ZCode ConversationStatusPanel (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
 * Mira uses canonical submitted tool inputs and its existing approval path. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowUpRight, Check, ChevronDown, CircleAlert, GitCompare, ListChecks, LoaderCircle, Minimize2, MoreHorizontal, Square, TerminalSquare, Users, Workflow } from 'lucide-react'
import type { HarnessPlan, HarnessRunActivity, HarnessSubtask, ToolCallRecord } from '../../../../../src/config/harness'
import { miraRecordedCommand } from '../../lib/mira-command-presentation'
import { miraCommandJobLabels } from '../../../../../src/config/miraCommandJobs'
import type { PilotTaskTone } from '../../state/pilot-state'
import { MiraSummaryTodos } from './MiraSummaryTodos'
import { MiraGoalSummary } from './MiraGoalSummary'
import type { HarnessGoal } from '../../../../../src/config/miraGoals'
import type { PilotController } from '../../state/pilot-state'
import type { MiraWorkflowRunsState } from '../workflows/useMiraWorkflowRuns'
import { workflowStatus } from '../workflows/workflow-model'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import { miraPlanTitle, type MiraSessionPlan } from '../../../../../src/config/miraSessionPlans'

const subtaskLabels: Record<HarnessSubtask['status'], string> = { queued: '排队中', running: '执行中', stopping: '停止中', completed: '已完成', failed: '失败', stopped: '已停止', timed_out: '超时', turn_limit: '轮次已用完', interrupted: '已中断' }
const planLabels: Record<HarnessPlan['status'], string> = { planning: '正在规划', awaiting_input: '等待补充', awaiting_confirmation: '待确认', executing: '执行中', completed: '已完成', cancelled: '已取消' }

export type MiraTaskSummaryMode = 'auto' | 'mini' | 'panel'

export function TaskSummary({ taskState, taskTone, running, activities, plan, plans = [], onOpenPlan, commands = [], onOpenCommand, subtasks, changes, environment, goal, goalController, goalSessionId, goalDetailsRequest, goalPlanning, workflows, onOpenWorkflow, mode: controlledMode, onModeChange, onOpenChanges, onOpenProgress, onOpenSubtask, onReviewPlan, onStopSubtask, onError }: {
  taskState: string; taskTone: PilotTaskTone; running: boolean; activities: HarnessRunActivity[]; plan?: HarnessPlan; subtasks: HarnessSubtask[]; changes: number
  environment?: ReactNode
  plans?: MiraSessionPlan[]; onOpenPlan?: (id: string) => void
  commands?: ToolCallRecord[]; onOpenCommand?: (runId: string, toolId: string) => void
  goal?: HarnessGoal; goalController?: PilotController; goalSessionId?: string; goalDetailsRequest?: number; goalPlanning?: boolean
  workflows?: MiraWorkflowRunsState; onOpenWorkflow?: (identity: MiraFlowRunIdentity) => Promise<void>
  mode?: MiraTaskSummaryMode; onModeChange?: (mode: MiraTaskSummaryMode) => void
  onOpenChanges: () => void; onOpenProgress?: () => void; onOpenSubtask?: (id: string) => void; onReviewPlan: () => void; onStopSubtask: (id: string) => Promise<void>; onError: (error: unknown) => void
}) {
  const [localMode, setLocalMode] = useState<MiraTaskSummaryMode>('auto')
  const mode = controlledMode ?? localMode
  const [stopping, setStopping] = useState<string[]>([])
  const miniRef = useRef<HTMLButtonElement>(null)
  const collapseRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const modeTriggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuMounted, setMenuMounted] = useState(false)
  const pendingAutoMode = useRef(false)
  const bindModeMenu = useRef((element: HTMLDivElement | null) => {
    menuRef.current = element
    setMenuMounted(Boolean(element))
  }).current
  const agentsRef = useRef<HTMLDetailsElement>(null)
  const activeOwner = useRef(true)
  const pendingFocus = useRef<{ mode: MiraTaskSummaryMode; source: HTMLButtonElement } | null>(null)
  const autoSelected = useRef(false)
  useLayoutEffect(() => {
    const positioner = panelRef.current?.closest<HTMLElement>('.mira-summary-positioner')
    if (!positioner || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const panel = panelRef.current
      if (panel && panel.contains(document.activeElement) && getComputedStyle(panel).display === 'none') miniRef.current?.focus()
    })
    observer.observe(positioner)
    return () => observer.disconnect()
  }, [])
  const current = activities.find(activity => activity.status === 'running')
  const steps = activities.filter(activity => activity.kind === 'plan')
  const currentStep = steps.find(step => step.status === 'running') ?? steps.find(step => step.status === 'pending')
  const completedStep = [...steps].reverse().find(step => step.status === 'completed')
  const liveAgents = subtasks.filter(task => task.status === 'running' || task.status === 'queued' || task.status === 'stopping')
  const visibleCommands = commands.filter(tool => tool.tool === 'bash' && tool.runId && tool.commandJob?.mode === 'background')
  const liveCommands = visibleCommands.filter(tool => tool.commandJob ? tool.commandJob.status === 'running' : tool.status === 'running' || tool.status === 'waiting-confirm')
  const failedCommands = visibleCommands.filter(tool => !tool.inherited && tool.commandJob?.mode === 'background' && (tool.commandJob.status === 'failed' || tool.commandJob.status === 'interrupted'))
  const commandState = !running && taskTone !== 'waiting' ? failedCommands.length ? `${failedCommands.length} 条后台命令异常` : liveCommands.some(tool => tool.commandJob?.mode === 'background') ? `${liveCommands.length} 条命令运行中` : undefined : undefined
  const workflowRuns = workflows?.sessionId ? workflows.runs : []
  const liveWorkflows = workflowRuns.filter(run => run.status === 'running')
  const pendingWorkflows = workflowRuns.filter(run => run.status === 'pending')
  const workflowTitle = liveWorkflows.length ? `${liveWorkflows.length} 个工作流运行中` : pendingWorkflows.length ? `${pendingWorkflows.length} 个工作流等待运行` : workflowRuns.length ? `${workflowRuns.length} 个工作流已结束` : workflows?.error ? '工作流状态读取失败' : ''
  const title = currentStep?.label || (changes ? `${changes} 个文件有变更` : '') || completedStep?.label || (steps.length ? `待办 ${steps.filter(step => step.status === 'completed').length}/${steps.length}` : '') || (plan && miraPlanTitle(plan.understanding || plan.request)) || (plan ? '任务计划' : '') || (liveAgents.length ? `${liveAgents.length} 个智能体运行中` : '') || (liveWorkflows.length || pendingWorkflows.length ? workflowTitle : '') || (running ? 'Mira 正在工作' : '') || (!workflowTitle ? subtasks.length ? `${subtasks.length} 个智能体已结束` : activities.length ? taskState : environment ? '工作环境' : '' : '')
  const setMode = (next: MiraTaskSummaryMode, source?: HTMLButtonElement | null) => {
    pendingFocus.current = source && document.activeElement === source ? { mode: next, source } : null
    if (controlledMode === undefined) setLocalMode(next)
    onModeChange?.(next)
  }
  useLayoutEffect(() => {
    const request = pendingFocus.current
    if (!request || request.mode !== mode) return
    pendingFocus.current = null
    if (document.activeElement === request.source || document.activeElement === document.body) {
      (mode === 'mini' ? miniRef : collapseRef).current?.focus()
    }
  }, [mode])
  // Keep the Popper anchor visible until Radix finishes the menu's exit animation.
  useLayoutEffect(() => {
    if (menuMounted || !pendingAutoMode.current) return
    pendingAutoMode.current = false
    setMode('auto', modeTriggerRef.current)
  }, [menuMounted])
  useLayoutEffect(() => { if (!liveAgents.length && agentsRef.current) agentsRef.current.open = false }, [liveAgents.length])
  useLayoutEffect(() => { activeOwner.current = true; return () => { activeOwner.current = false } }, [])
  const restoreModeFocus = (event: Event) => {
    if (autoSelected.current) {
      const active = document.activeElement
      const ownsFocus = active === document.body || active === modeTriggerRef.current || menuRef.current?.contains(active)
      if (!ownsFocus) event.preventDefault()
      else if (panelRef.current && getComputedStyle(panelRef.current).display === 'none') { event.preventDefault(); miniRef.current?.focus() }
    }
    autoSelected.current = false
  }
  const primaryTitle = taskTone === 'waiting' ? taskState : currentStep?.label || (goal && goal.status !== 'complete' ? goal.objective : '') || title || plans[0]?.title || goal?.objective || (goalDetailsRequest ? '目标' : '')
  const summaryTitle = commandState || primaryTitle || (liveCommands.length ? `${liveCommands.length} 条命令进行中` : visibleCommands.length ? `${visibleCommands.length} 条命令已结束` : '') || workflowTitle
  const summaryState = commandState || (taskTone === 'waiting' || running ? taskState : liveCommands.length ? '命令运行中' : liveWorkflows.length ? '工作流运行中' : pendingWorkflows.length ? '工作流等待运行' : taskState)
  const summaryTone = commandState ? failedCommands.length ? 'partial' : 'running' : taskTone
  if (!summaryTitle) return null
  const stop = async (id: string) => {
    setStopping(previous => [...previous, id])
    try { await onStopSubtask(id) } catch (error) { if (activeOwner.current) onError(error) } finally { if (activeOwner.current) setStopping(previous => previous.filter(item => item !== id)) }
  }
  return <aside className="mira-task-summary" aria-label="任务摘要" data-mode={mode} data-task-tone={summaryTone}>
    <button ref={miniRef} type="button" className="mira-task-summary__mini" aria-label="展开任务摘要" title={summaryTitle} onClick={() => setMode('panel', miniRef.current)}>{summaryTitle === workflowTitle ? <Workflow size={15} data-mira-workflow-summary-icon aria-hidden="true" /> : <span className="mira-summary-dot" />}<strong>{summaryTitle}</strong>{(running || liveCommands.length > 0 || liveWorkflows.length > 0) && <LoaderCircle size={13} className="animate-spin" />}<ChevronDown size={13} /></button>
    <div ref={panelRef} className="mira-task-summary__panel">
      <div className="mira-task-summary__header"><span>{summaryState}</span><DropdownMenu.Root><DropdownMenu.Trigger asChild><button ref={modeTriggerRef} type="button" aria-label="摘要显示方式" title="摘要显示方式"><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content ref={bindModeMenu} className="mira-session-menu" align="end" sideOffset={5} onCloseAutoFocus={restoreModeFocus}><DropdownMenu.RadioGroup value={mode} onValueChange={() => { autoSelected.current = true; pendingAutoMode.current = true }}><DropdownMenu.RadioItem value="auto" className="mira-session-menu__item"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator>自动</DropdownMenu.RadioItem></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><button ref={collapseRef} type="button" aria-label="收起任务摘要" title="收起任务摘要" onClick={() => setMode('mini', collapseRef.current)}><Minimize2 size={15} /></button></div>
      <div className="mira-task-summary__body" tabIndex={0} role="region" aria-label="任务摘要内容">
        {goalController && Boolean(goal || goalDetailsRequest) && <MiraGoalSummary key={goal?.id ?? 'empty'} goal={goal} controller={goalController} sessionId={goalSessionId} detailsRequest={goalDetailsRequest} planning={goalPlanning} />}
        {Boolean(environment) && <details open><summary><strong>环境</strong></summary>{environment}</details>}
        {changes > 0 && <button type="button" className="mira-summary-resource" onClick={onOpenChanges}><GitCompare size={15} /><span>{changes} 个文件变更</span></button>}
        {plans.length > 0 && <details open aria-label="会话计划"><summary><ListChecks size={15} /><strong>会话计划</strong><small>{plans.length} 个方案</small></summary><div className="mira-summary-plans">{plans.map(item => <button type="button" key={item.id} disabled={!onOpenPlan} aria-label={`在右侧打开方案 ${item.title}`} data-plan-directory-id={item.id} onClick={() => onOpenPlan?.(item.id)}><ListChecks size={14} aria-hidden="true" /><span title={item.title}>{item.title}</span>{item.incomplete && <CircleAlert size={13} aria-label="内容不完整" />}<ArrowUpRight size={12} aria-hidden="true" /></button>)}</div></details>}
        {visibleCommands.length > 0 && <details aria-label="命令摘要"><summary><TerminalSquare size={15} /><strong>命令</strong><small>{liveCommands.length ? `${liveCommands.length} 条进行中` : `${visibleCommands.length} 条已结束`}</small></summary><div className="mira-summary-plans">{visibleCommands.map(tool => <button type="button" key={JSON.stringify([tool.runId, tool.id])} disabled={!onOpenCommand} aria-label={`在右侧查看命令 ${miraRecordedCommand(tool) || '命令输出'}`} data-command-summary-id={tool.id} onClick={() => onOpenCommand?.(tool.runId!, tool.id)}>{(tool.commandJob ? tool.commandJob.status === 'running' : tool.status === 'running') ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <TerminalSquare size={14} aria-hidden="true" />}<span title={miraRecordedCommand(tool)}>{miraRecordedCommand(tool) || '命令输出'}</span><small>{tool.commandJob ? `${tool.commandJob.mode === 'background' ? '后台 · ' : ''}${miraCommandJobLabels[tool.commandJob.status]}` : tool.status === 'failed' ? '失败' : tool.status === 'cancelled' ? '已取消' : tool.status === 'waiting-confirm' ? '待确认' : tool.status === 'running' ? '执行中' : '已完成'}</small><ArrowUpRight size={12} aria-hidden="true" /></button>)}</div></details>}
        {(plan || steps.length > 0) && <details open><summary><ListChecks size={15} /><strong>{plan ? '计划' : '待办'}</strong><small>{plan ? planLabels[plan.status] : `${steps.filter(step => step.status === 'completed').length}/${steps.length} 已完成`}</small></summary>{plan && <button type="button" className="mira-summary-plan" onClick={onReviewPlan}>{miraPlanTitle(plan.understanding || plan.request)}</button>}{steps.length ? <MiraSummaryTodos key={steps.map(step => JSON.stringify([step.id, step.label, step.status])).join('|')} items={steps} /> : <ol>{plan?.steps.map((step, index) => <li key={index}>{step.label}</li>)}</ol>}</details>}
        {subtasks.length > 0 && <details ref={agentsRef}><summary><Users size={15} /><strong>智能体</strong><small>{liveAgents.length ? `${liveAgents.length} 个运行中` : `${subtasks.length} 个已结束`}</small></summary><div className="mira-summary-agents">{subtasks.map(task => <div key={task.id}><span className="mira-summary-dot" data-status={task.status} /><span title={task.task}>{task.task}</span><small>{subtaskLabels[task.status]}</small>{onOpenSubtask && <button type="button" aria-label={`在右侧打开智能体 ${task.task}`} title="在右侧打开" onClick={() => onOpenSubtask(task.id)}><ArrowUpRight size={12} /></button>}{(task.status === 'running' || task.status === 'queued') && <button type="button" disabled={stopping.includes(task.id)} aria-label={`停止智能体 ${task.task}`} onClick={() => void stop(task.id)}>{stopping.includes(task.id) ? <LoaderCircle size={12} className="animate-spin" /> : <Square size={12} />}</button>}</div>)}</div></details>}
        {Boolean(workflowRuns.length || workflows?.error) && <details aria-label="工作流摘要"><summary><Workflow size={15} /><strong>工作流</strong><small>{liveWorkflows.length ? `${liveWorkflows.length} 个运行中` : pendingWorkflows.length ? `${pendingWorkflows.length} 个等待运行` : `${workflowRuns.length} 个已结束`}</small></summary><div className="mira-summary-workflows">{workflowRuns.map(run => <button key={run.runId} type="button" disabled={!onOpenWorkflow} aria-label={`在右侧打开工作流 ${run.name || run.runId}`} onClick={() => { if (workflows?.sessionId && onOpenWorkflow) void onOpenWorkflow({ sessionId: workflows.sessionId, runId: run.runId }).catch(error => { if (activeOwner.current) onError(error) }) }}><Workflow size={14} aria-hidden="true" /><span title={run.name || run.runId}>{run.name || '未命名工作流'}</span><small>{workflowStatus[run.status]}</small><ArrowUpRight size={12} aria-hidden="true" /></button>)}</div>{workflows?.error && <p className="mira-tool-error" role="alert">{workflows.error}<button type="button" aria-label="重试工作流摘要" onClick={workflows.refresh}>重试</button></p>}</details>}
        {(activities.length > 0 || subtasks.length > 0) && onOpenProgress && <button type="button" className="mira-summary-resource" onClick={onOpenProgress}>{taskTone === 'failed' || taskTone === 'partial' ? <CircleAlert size={15} /> : running ? <LoaderCircle size={15} className="animate-spin" /> : <ListChecks size={15} />}<span>{'查看调用轨迹'}</span></button>}
      </div>
    </div>
  </aside>
}
