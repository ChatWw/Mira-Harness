import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowUpRight, Check, ChevronDown, CircleAlert, GitCompare, ListChecks, LoaderCircle, Minimize2, MoreHorizontal, Square, Users } from 'lucide-react'
import type { HarnessPlan, HarnessRunActivity, HarnessSubtask } from '../../../../../src/config/harness'
import type { PilotTaskTone } from '../../state/pilot-state'

const subtaskLabels: Record<HarnessSubtask['status'], string> = { queued: '排队中', running: '执行中', stopping: '停止中', completed: '已完成', failed: '失败', stopped: '已停止', timed_out: '超时', turn_limit: '轮次已用完', interrupted: '已中断' }
const planLabels: Record<HarnessPlan['status'], string> = { planning: '正在规划', awaiting_input: '等待补充', awaiting_confirmation: '待确认', executing: '执行中', completed: '已完成', cancelled: '已取消' }

export type MiraTaskSummaryMode = 'auto' | 'mini' | 'panel'

export function TaskSummary({ taskState, taskTone, running, activities, plan, subtasks, changes, environment, mode: controlledMode, onModeChange, onOpenChanges, onOpenProgress, onOpenSubtask, onReviewPlan, onStopSubtask, onError }: {
  taskState: string; taskTone: PilotTaskTone; running: boolean; activities: HarnessRunActivity[]; plan?: HarnessPlan; subtasks: HarnessSubtask[]; changes: number
  environment?: ReactNode
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
  const menuRef = useRef<HTMLDivElement>(null)
  const agentsRef = useRef<HTMLDetailsElement>(null)
  const activeOwner = useRef(true)
  const pendingFocus = useRef<{ mode: MiraTaskSummaryMode; source: HTMLButtonElement } | null>(null)
  const autoSelected = useRef(false)
  const current = activities.find(activity => activity.status === 'running')
  const steps = activities.filter(activity => activity.kind === 'plan')
  const currentStep = steps.find(step => step.status === 'running') ?? steps.find(step => step.status === 'pending')
  const completedStep = [...steps].reverse().find(step => step.status === 'completed')
  const liveAgents = subtasks.filter(task => task.status === 'running' || task.status === 'queued' || task.status === 'stopping')
  const title = currentStep?.label || (changes ? `${changes} 个文件有变更` : '') || completedStep?.label || (steps.length ? `待办 ${steps.filter(step => step.status === 'completed').length}/${steps.length}` : '') || plan?.understanding || plan?.request || (plan ? '任务计划' : '') || (liveAgents.length ? `${liveAgents.length} 个智能体运行中` : '') || current?.label || (subtasks.length ? `${subtasks.length} 个智能体已结束` : activities.length ? taskState : environment ? '工作环境' : '')
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
  if (!title) return null
  const stop = async (id: string) => {
    setStopping(previous => [...previous, id])
    try { await onStopSubtask(id) } catch (error) { if (activeOwner.current) onError(error) } finally { if (activeOwner.current) setStopping(previous => previous.filter(item => item !== id)) }
  }
  return <aside className="mira-task-summary" aria-label="任务摘要" data-mode={mode} data-task-tone={taskTone}>
    <button ref={miniRef} type="button" className="mira-task-summary__mini" aria-label="展开任务摘要" title={title} onClick={() => setMode('panel', miniRef.current)}><span className="mira-summary-dot" /><strong>{title}</strong>{running && <LoaderCircle size={13} className="animate-spin" />}<ChevronDown size={13} /></button>
    <div ref={panelRef} className="mira-task-summary__panel">
      <div className="mira-task-summary__header"><span>{taskState}</span><DropdownMenu.Root><DropdownMenu.Trigger asChild><button ref={modeTriggerRef} type="button" aria-label="摘要显示方式" title="摘要显示方式"><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content ref={menuRef} className="mira-session-menu" align="end" sideOffset={5} onCloseAutoFocus={restoreModeFocus}><DropdownMenu.RadioGroup value={mode} onValueChange={() => { autoSelected.current = true; setMode('auto') }}><DropdownMenu.RadioItem value="auto" className="mira-session-menu__item"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator>自动</DropdownMenu.RadioItem></DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><button ref={collapseRef} type="button" aria-label="收起任务摘要" title="收起任务摘要" onClick={() => setMode('mini', collapseRef.current)}><Minimize2 size={15} /></button></div>
      <div className="mira-task-summary__body">
        {environment && <details open><summary><strong>环境</strong></summary>{environment}</details>}
        {changes > 0 && <button type="button" className="mira-summary-resource" onClick={onOpenChanges}><GitCompare size={15} /><span>{changes} 个文件变更</span></button>}
        {(plan || steps.length > 0) && <details open><summary><ListChecks size={15} /><strong>{plan ? '计划' : '待办'}</strong><small>{plan ? planLabels[plan.status] : `${steps.filter(step => step.status === 'completed').length}/${steps.length} 已完成`}</small></summary>{plan && <button type="button" className="mira-summary-plan" onClick={onReviewPlan}>{plan.understanding || plan.request}</button>}{steps.length ? <ol>{steps.map(step => <li key={step.id} data-status={step.status}>{step.status === 'completed' ? <Check size={12} /> : step.status === 'running' ? <LoaderCircle size={12} className="animate-spin" /> : step.status === 'failed' ? <CircleAlert size={12} /> : <span className="mira-summary-dot" />}{step.label}</li>)}</ol> : <ol>{plan?.steps.map((step, index) => <li key={index}>{step.label}</li>)}</ol>}</details>}
        {subtasks.length > 0 && <details ref={agentsRef}><summary><Users size={15} /><strong>智能体</strong><small>{liveAgents.length ? `${liveAgents.length} 个运行中` : `${subtasks.length} 个已结束`}</small></summary><div className="mira-summary-agents">{subtasks.map(task => <div key={task.id}><span className="mira-summary-dot" data-status={task.status} /><span title={task.task}>{task.task}</span><small>{subtaskLabels[task.status]}</small>{onOpenSubtask && <button type="button" aria-label={`在右侧打开智能体 ${task.task}`} title="在右侧打开" onClick={() => onOpenSubtask(task.id)}><ArrowUpRight size={12} /></button>}{(task.status === 'running' || task.status === 'queued') && <button type="button" disabled={stopping.includes(task.id)} aria-label={`停止智能体 ${task.task}`} onClick={() => void stop(task.id)}>{stopping.includes(task.id) ? <LoaderCircle size={12} className="animate-spin" /> : <Square size={12} />}</button>}</div>)}</div></details>}
        {(activities.length > 0 || subtasks.length > 0) && onOpenProgress && <button type="button" className="mira-summary-resource" onClick={onOpenProgress}>{taskTone === 'failed' || taskTone === 'partial' ? <CircleAlert size={15} /> : running ? <LoaderCircle size={15} className="animate-spin" /> : <ListChecks size={15} />}<span>{current?.label || '查看本轮执行过程'}</span></button>}
      </div>
    </div>
  </aside>
}
