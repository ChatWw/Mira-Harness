import { Check, ChevronDown, CircleAlert, LoaderCircle, Square } from 'lucide-react'
import type { HarnessRunActivity, HarnessRunSummary, HarnessSubtask } from '../../../src/config/harness'

const ROLE_LABELS: Record<HarnessSubtask['role'], string> = { explorer: '探索', reviewer: '审查', tester: '测试', implementer: '实现' }
const SUBTASK_STATUS: Partial<Record<HarnessSubtask['status'], string>> = {
  queued: '排队中', running: '执行中', stopping: '正在停止', completed: '已完成', failed: '失败', stopped: '已停止', timed_out: '已超时', turn_limit: '已达轮次上限', interrupted: '已中断',
}

function formatDuration(ms: number) {
  if (!ms || ms < 1000) return `${Math.max(0, Math.round(ms / 100) / 10)}s`
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`
  return `${Math.floor(total / 60)}m${total % 60}s`
}

/**
 * 消息内运行轨迹：对齐主流 Agent UI 的密度——
 * 运行中是一条轻量的"当前活动"行，结束后折叠为一行摘要，点开才看到完整过程。
 */
export function RunProgressCard({ run, running, onStopSubtask }: { run: HarnessRunSummary; running: boolean; onStopSubtask?: (subtaskId: string) => Promise<void> }) {
  const planSteps = run.activities.filter(activity => activity.kind === 'plan')
  const toolActivities = run.activities.filter(activity => activity.kind !== 'plan')
  const subtasks = run.subtasks || []
  const failedCount = run.activities.filter(activity => activity.status === 'failed').length + subtasks.filter(subtask => subtask.status === 'failed').length
  const pendingCount = run.activities.filter(activity => activity.status === 'pending').length
  const completedCount = Math.max(0, run.activities.length + subtasks.length - pendingCount - failedCount)
  const totalOps = run.activities.length + subtasks.length
  const hasBody = planSteps.length > 0 || toolActivities.length > 0 || subtasks.length > 0
  const usage = run.usage?.total

  if (running) {
    const current = run.activities.find(activity => activity.status === 'running')
    return <div className="pilot-run pilot-run--active">
      <div className="pilot-run__live"><LoaderCircle size={13} className="pilot-spin" /><span>{current?.label || '正在处理…'}</span>{current?.detail && <small>{current.detail}</small>}</div>
      {hasBody && <details className="pilot-run__details"><summary>查看过程</summary><RunBody planSteps={planSteps} toolActivities={toolActivities} subtasks={subtasks} usage={usage} onStopSubtask={onStopSubtask} /></details>}
    </div>
  }
  const state = run.status === 'failed' ? 'failed' : run.status === 'stopped' ? 'stopped' : 'completed'
  return <details className={`pilot-run pilot-run--${state}`}>
    <summary>
      {state === 'completed' ? <Check size={13} /> : <CircleAlert size={13} />}
      <span>{state === 'failed' ? '运行失败' : state === 'stopped' ? '已停止' : '已完成'} {totalOps > 0 ? `${completedCount} 项操作` : ''}{run.durationMs > 0 ? ` · ${formatDuration(run.durationMs)}` : ''}</span>
      {failedCount > 0 && <em>{failedCount} 项异常</em>}
      <ChevronDown size={13} className="pilot-run__chevron" />
    </summary>
    {run.error && <p className="pilot-run__error" role="alert">{run.error}</p>}
    {hasBody && <RunBody planSteps={planSteps} toolActivities={toolActivities} subtasks={subtasks} usage={usage} onStopSubtask={onStopSubtask} />}
  </details>
}

function RunBody({ planSteps, toolActivities, subtasks, usage, onStopSubtask }: {
  planSteps: HarnessRunActivity[]
  toolActivities: HarnessRunActivity[]
  subtasks: HarnessSubtask[]
  usage?: { totalTokens: number; cost?: { priced: boolean; total: number; currency: string } }
  onStopSubtask?: (subtaskId: string) => Promise<void>
}) {
  return <div className="pilot-run__body">
    {planSteps.length > 0 && <ol className="pilot-run__plan">{planSteps.map(step => <li key={step.id} data-status={step.status}><span className={`pilot-status-dot pilot-status-dot--${step.status}`} />{step.label}</li>)}</ol>}
    <ActivityList activities={toolActivities} />
    {subtasks.length > 0 && <SubtaskList subtasks={subtasks} onStop={onStopSubtask} />}
    {usage?.totalTokens ? <p className="pilot-run__usage">token {usage.totalTokens}{usage.cost?.priced ? ` · ${usage.cost.total.toFixed(4)} ${usage.cost.currency}` : ''}</p> : null}
  </div>
}

function ActivityList({ activities }: { activities: HarnessRunActivity[] }) {
  if (!activities.length) return null
  return <div className="pilot-run__activities">{activities.map(activity => <div key={activity.id} className="pilot-run__activity" data-status={activity.status}>
    <span className={`pilot-status-dot pilot-status-dot--${activity.status}`} />
    <div>{activity.status === 'running' && <LoaderCircle size={11} className="pilot-spin" />}<strong>{activity.label}</strong>{activity.detail && <small>{activity.detail}</small>}</div>
    {activity.status !== 'running' && activity.completedAt && <small>{formatDuration(activity.completedAt - activity.startedAt)}</small>}
  </div>)}</div>
}

function SubtaskList({ subtasks, onStop }: { subtasks: HarnessSubtask[]; onStop?: (subtaskId: string) => Promise<void> }) {
  return <div className="pilot-run__subtasks">{subtasks.map(subtask => <details key={subtask.id} className="pilot-run__subtask">
    <summary>
      <span className={`pilot-status-dot pilot-status-dot--${subtask.status === 'completed' ? 'completed' : subtask.status === 'failed' ? 'failed' : subtask.status === 'running' || subtask.status === 'queued' ? 'running' : 'idle'}`} />
      <strong>{ROLE_LABELS[subtask.role]} · {SUBTASK_STATUS[subtask.status] || subtask.status}</strong>
      <small>{subtask.task}</small>
      {(subtask.status === 'running' || subtask.status === 'queued') && onStop && <button type="button" aria-label="停止子任务" title="停止子任务" onClick={event => { event.preventDefault(); event.stopPropagation(); void onStop(subtask.id) }}><Square size={12} /></button>}
    </summary>
    <div className="pilot-run__subtask-body">
      {subtask.files && subtask.files.length > 0 && <p className="pilot-path">文件范围：{subtask.files.map(file => file.path).join('、')}</p>}
      {subtask.report && <pre>{subtask.report}</pre>}
      {subtask.error && <p className="pilot-run__error">{subtask.error.message}</p>}
    </div>
  </details>)}</div>
}
