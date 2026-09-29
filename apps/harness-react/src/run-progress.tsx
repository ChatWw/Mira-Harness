import { Check, ChevronDown, CircleAlert, LoaderCircle, Square } from 'lucide-react'
import type { HarnessRunActivity, HarnessRunSummary, HarnessSubtask } from '../../../src/config/harness'
import { cn } from './lib/utils'

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

function statusDotClass(status: string) {
  if (status === 'running') return 'bg-amber-400'
  if (status === 'completed' || status === 'ok') return 'bg-emerald-400'
  if (status === 'failed') return 'bg-red-400'
  return 'bg-foreground-subtlest'
}

/**
 * 消息内运行轨迹（ZCode 密度）：运行中是一条轻量 live 行，结束折叠为一行摘要，
 * 点开才展开计划步骤 / 活动列表 / 子任务 / 用量。
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
    return <div className="mt-2 rounded-xl bg-background-alt px-3 py-2.5 text-ui-sm text-foreground-subtle">
      <div className="flex items-center gap-2 text-foreground">
        <LoaderCircle size={13} className="animate-spin text-brand" />
        <span>{current?.label || '正在处理…'}</span>
        {current?.detail && <small className="min-w-0 truncate text-foreground-subtle">{current.detail}</small>}
      </div>
      {hasBody && <details className="mt-1.5">
        <summary className="cursor-pointer list-none select-none text-ui-xs hover:text-foreground">查看过程</summary>
        <RunBody planSteps={planSteps} toolActivities={toolActivities} subtasks={subtasks} usage={usage} onStopSubtask={onStopSubtask} />
      </details>}
    </div>
  }
  const state = run.status === 'failed' ? 'failed' : run.status === 'stopped' ? 'stopped' : 'completed'
  return <details className="mt-2 text-ui-sm text-foreground-subtle">
    <summary className="inline-flex cursor-pointer list-none select-none items-center gap-1.5 hover:text-foreground">
      {state === 'completed' ? <Check size={13} className="text-emerald-400" /> : <CircleAlert size={13} className={state === 'failed' ? 'text-red-400' : 'text-foreground-subtlest'} />}
      <span>{state === 'failed' ? '运行失败' : state === 'stopped' ? '已停止' : '已完成'}{totalOps > 0 ? ` ${completedCount} 项操作` : ''}{run.durationMs > 0 ? ` · ${formatDuration(run.durationMs)}` : ''}</span>
      {failedCount > 0 && <em className="text-xs not-italic text-red-400">{failedCount} 项异常</em>}
      <ChevronDown size={13} className="transition-transform [[open]>&]:rotate-180" />
    </summary>
    {run.error && <p className="mt-1.5 text-red-400" role="alert">{run.error}</p>}
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
  return <div className="mt-2 grid gap-2.5 rounded-xl bg-background-alt px-3 py-2.5">
    {planSteps.length > 0 && <ol className="grid list-decimal gap-1 pl-4">{planSteps.map(step => <li key={step.id} className={cn('flex items-center gap-1.5', step.status === 'completed' && 'text-foreground-subtle')}><span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(step.status))} />{step.label}</li>)}</ol>}
    {toolActivities.length > 0 && <div className="grid gap-1.5">{toolActivities.map(activity => <div key={activity.id} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-1.5">
      <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', statusDotClass(activity.status))} />
      <div className="flex min-w-0 items-baseline gap-1.5">
        {activity.status === 'running' && <LoaderCircle size={11} className="shrink-0 animate-spin text-brand" />}
        <strong className="truncate font-medium text-foreground">{activity.label}</strong>
        {activity.detail && <small className="truncate text-foreground-subtle">{activity.detail}</small>}
      </div>
      {activity.status !== 'running' && activity.completedAt && <small className="text-foreground-subtlest">{formatDuration(activity.completedAt - activity.startedAt)}</small>}
    </div>)}</div>}
    {subtasks.length > 0 && <div className="grid gap-1.5">{subtasks.map(subtask => <details key={subtask.id}>
      <summary className="flex cursor-pointer list-none select-none items-center gap-1.5">
        <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(subtask.status === 'completed' ? 'completed' : subtask.status === 'failed' ? 'failed' : subtask.status === 'running' || subtask.status === 'queued' ? 'running' : 'idle'))} />
        <strong className="font-medium text-foreground">{ROLE_LABELS[subtask.role]} · {SUBTASK_STATUS[subtask.status] || subtask.status}</strong>
        <small className="min-w-0 truncate text-foreground-subtle">{subtask.task}</small>
        {(subtask.status === 'running' || subtask.status === 'queued') && onStopSubtask && <button type="button" aria-label="停止子任务" title="停止子任务" className="ml-auto flex size-5 items-center justify-center rounded border border-border bg-card text-foreground-subtle hover:border-red-400 hover:text-red-400" onClick={event => { event.preventDefault(); event.stopPropagation(); void onStopSubtask(subtask.id) }}><Square size={11} /></button>}
      </summary>
      <div className="ml-3.5 mt-1.5 grid gap-1.5">
        {subtask.files && subtask.files.length > 0 && <p className="break-all text-ui-xs">文件范围：{subtask.files.map(file => file.path).join('、')}</p>}
        {subtask.report && <pre className="max-h-40 overflow-auto rounded-md border border-border bg-card p-2 text-ui-xs whitespace-pre-wrap break-all">{subtask.report}</pre>}
        {subtask.error && <p className="text-red-400">{subtask.error.message}</p>}
      </div>
    </details>)}</div>}
    {usage?.totalTokens ? <p className="text-ui-xs text-foreground-subtlest">token {usage.totalTokens}{usage.cost?.priced ? ` · ${usage.cost.total.toFixed(4)} ${usage.cost.currency}` : ''}</p> : null}
  </div>
}
