import { LoaderCircle, Square } from 'lucide-react'
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

/** 消息内运行进度卡：状态头 + 可折叠过程区（计划步骤/活动/子任务）+ 用量。 */
export function RunProgressCard({ run, running, onStopSubtask }: { run: HarnessRunSummary; running: boolean; onStopSubtask?: (subtaskId: string) => Promise<void> }) {
  const planSteps = run.activities.filter(activity => activity.kind === 'plan')
  const toolActivities = run.activities.filter(activity => activity.kind !== 'plan')
  const failedCount = run.activities.filter(activity => activity.status === 'failed').length + (run.subtasks || []).filter(subtask => subtask.status === 'failed').length
  const completedCount = run.activities.length + (run.subtasks || []).length - (run.activities.filter(activity => activity.status === 'pending').length + failedCount)
  return <div className="pilot-run" data-state={running ? 'running' : run.status || ''}>
    <div className="pilot-run__head">
      {running ? <LoaderCircle size={14} className="pilot-spin" /> : null}
      <strong>{running ? '正在回复' : run.status === 'failed' ? '回复失败' : run.status === 'stopped' ? '已停止' : '已完成'}</strong>
      {!running && run.durationMs > 0 && <small>用时 {formatDuration(run.durationMs)}</small>}
    </div>
    {running && <p className="pilot-run__current">{run.activities.find(activity => activity.status === 'running')?.label || 'Mira 正在处理当前任务'}</p>}
    {run.error && <p className="pilot-run__error" role="alert">{run.error}</p>}
    {(run.activities.length > 0 || (run.subtasks || []).length > 0) && <details className="pilot-run__details">
      <summary>{running ? '执行过程' : `已完成 ${completedCount} 项操作${failedCount ? ` · ${failedCount} 项异常` : ''}`}</summary>
      <div className="pilot-run__body">
        {planSteps.length > 0 && <PlanSteps steps={planSteps} />}
        <ActivityList activities={toolActivities} />
        {(run.subtasks || []).length > 0 && <SubtaskList subtasks={run.subtasks || []} onStop={onStopSubtask} />}
      </div>
    </details>}
    {run.usage?.total?.totalTokens ? <p className="pilot-run__usage">token {run.usage.total.totalTokens}{run.usage.total.cost?.priced ? ` · ${run.usage.total.cost.total.toFixed(4)} ${run.usage.total.cost.currency}` : ''}</p> : null}
  </div>
}

function PlanSteps({ steps }: { steps: HarnessRunActivity[] }) {
  return <ol className="pilot-run__plan">{steps.map(step => <li key={step.id} data-status={step.status}><span className={`pilot-status-dot pilot-status-dot--${step.status}`} />{step.label}</li>)}</ol>
}

function ActivityList({ activities }: { activities: HarnessRunActivity[] }) {
  if (!activities.length) return null
  return <div className="pilot-run__activities">{activities.map(activity => <div key={activity.id} className="pilot-run__activity" data-status={activity.status}>
    <span className={`pilot-status-dot pilot-status-dot--${activity.status}`} />
    <div>{activity.status === 'running' ? <LoaderCircle size={11} className="pilot-spin" /> : null}<strong>{activity.label}</strong>{activity.detail && <small>{activity.detail}</small>}</div>
    {!running(activity) && activity.completedAt && <small>{formatDuration(activity.completedAt - activity.startedAt)}</small>}
  </div>)}</div>
}

function running(activity: HarnessRunActivity) { return activity.status === 'running' }

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
