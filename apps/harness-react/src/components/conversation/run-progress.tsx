import { useState } from 'react'
import { Check, ChevronDown, CircleAlert, LoaderCircle, Square } from 'lucide-react'
import type { HarnessRunActivity, HarnessRunSummary, HarnessSubtask, ToolCallRecord } from '../../../../../src/config/harness'
import { cn } from '../../lib/utils'
import { completedOperationCount } from './conversation-model'

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
export function RunProgressCard({ run, running, waiting = false, tools = [], summaryOnly = false, onStopSubtask }: { run: HarnessRunSummary; running: boolean; waiting?: boolean; tools?: ToolCallRecord[]; summaryOnly?: boolean; onStopSubtask?: (subtaskId: string) => Promise<void> }) {
  const planSteps = run.activities.filter(activity => activity.kind === 'plan')
  const toolActivities = summaryOnly ? [] : run.activities.filter(activity => activity.kind !== 'plan')
  const visibleTools = summaryOnly ? [] : tools
  const subtasks = run.subtasks || []
  const failedCount = run.activities.filter(activity => activity.status === 'failed').length + subtasks.filter(subtask => ['failed', 'timed_out', 'turn_limit', 'interrupted'].includes(subtask.status)).length
  const completedCount = completedOperationCount(run)
  const totalOps = run.activities.length + subtasks.length
  const usage = run.usage?.total
  const hasBody = planSteps.length > 0 || toolActivities.length > 0 || subtasks.length > 0 || visibleTools.length > 0 || Boolean(usage?.totalTokens)

  if (running) {
    const current = run.activities.find(activity => activity.status === 'running')
    return <div className="mt-2 rounded-xl bg-background-alt px-3 py-2.5 text-ui-sm text-foreground-subtle">
      <div className="flex items-center gap-2 text-foreground">
        {waiting ? <CircleAlert size={13} /> : <LoaderCircle size={13} className="animate-spin text-brand" />}
        <span>{waiting ? '等待确认后继续' : (!summaryOnly && current?.label) || '正在处理…'}</span>
        {!summaryOnly && !waiting && current?.detail && <small className="min-w-0 truncate text-foreground-subtle">{current.detail}</small>}
      </div>
      {visibleTools.length > 0 && <div className="mira-tool-records" aria-label="正在执行的工具">{visibleTools.map(tool => <ToolRecord key={tool.id} tool={tool} />)}</div>}
      {hasBody && <details className="mt-1.5">
        <summary className="cursor-pointer list-none select-none text-ui-xs hover:text-foreground">查看过程</summary>
        <RunBody planSteps={planSteps} toolActivities={toolActivities} subtasks={subtasks} tools={[]} usage={usage} onStopSubtask={onStopSubtask} />
      </details>}
    </div>
  }
  const state = run.status === 'failed' ? 'failed' : run.status === 'stopped' ? 'stopped' : totalOps > completedCount ? 'partial' : 'completed'
  return <details className="mt-2 text-ui-sm text-foreground-subtle">
    <summary className="inline-flex cursor-pointer list-none select-none items-center gap-1.5 hover:text-foreground">
      {state === 'completed' ? <Check size={13} className="text-emerald-400" /> : <CircleAlert size={13} className={state === 'failed' ? 'text-red-400' : 'text-foreground-subtlest'} />}
      <span>{state === 'failed' ? '运行失败' : state === 'stopped' ? '已停止' : state === 'partial' ? '部分操作未完成' : '已完成'}{totalOps > 0 ? ` ${completedCount}/${totalOps} 项操作` : ''}{run.durationMs > 0 ? ` · ${formatDuration(run.durationMs)}` : ''}</span>
      {failedCount > 0 && <em className="text-xs not-italic text-red-400">{failedCount} 项异常</em>}
      <ChevronDown size={13} className="transition-transform [[open]>&]:rotate-180" />
    </summary>
    {run.error && <p className="mt-1.5 text-red-400" role="alert">{run.error}</p>}
    {hasBody && <RunBody planSteps={planSteps} toolActivities={toolActivities} subtasks={subtasks} tools={visibleTools} usage={usage} onStopSubtask={onStopSubtask} />}
  </details>
}

function RunBody({ planSteps, toolActivities, subtasks, tools, usage, onStopSubtask }: {
  planSteps: HarnessRunActivity[]
  toolActivities: HarnessRunActivity[]
  subtasks: HarnessSubtask[]
  tools: ToolCallRecord[]
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
    {tools.length > 0 && <div className="mira-tool-records" aria-label="本轮工具调用">{tools.map(tool => <ToolRecord key={tool.id} tool={tool} />)}</div>}
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

export function ToolRecord({ tool }: { tool: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false)
  const label = tool.status === 'running' ? '执行中' : tool.status === 'ok' ? '已完成' : tool.status === 'failed' ? '失败' : tool.status === 'cancelled' ? '已取消' : '等待确认'
  return <details className="mira-tool-record" data-tool-call-id={tool.id} data-tool-status={tool.status} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{tool.status === 'running' ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : tool.status === 'ok' ? <Check size={13} aria-hidden="true" /> : tool.status === 'cancelled' ? <Square size={12} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}<strong>{tool.tool}</strong><span title={tool.target}>{tool.target}</span><small>{label}</small><ChevronDown size={13} aria-hidden="true" /></summary>
    {expanded && <div>
      {tool.target && <p className="mira-tool-target">{tool.target}</p>}
      {tool.input && <section className="mira-tool-payload" aria-label="工具输入" data-tool-payload="input"><strong>输入</strong><pre>{tool.input.text}</pre>{tool.input.truncated && <p className="mira-payload-truncated" role="note">输入超过记录上限，仅显示已记录部分。</p>}</section>}
      {tool.output && <section className="mira-tool-payload" aria-label="工具输出" data-tool-payload="output"><strong>输出</strong><pre>{tool.output.text}</pre>{tool.output.truncated && <p className="mira-payload-truncated" role="note">输出超过记录上限，仅显示已记录部分。</p>}</section>}
      {tool.error && <p role="alert" className="mira-tool-error">{tool.error}</p>}
      {tool.diff && <section className="mira-tool-payload" aria-label="工具变更"><strong>变更</strong><pre>{tool.diff}</pre></section>}
      {!tool.output && !tool.diff && !tool.error && <p>{tool.status === 'running' ? '工具正在执行。' : tool.status === 'waiting-confirm' ? '等待权限确认。' : tool.status === 'cancelled' ? '工具调用已取消，未记录执行结果。' : tool.status === 'failed' ? '工具执行失败，当前记录未提供错误详情。' : '工具执行已完成，当前记录未提供输出详情。'}</p>}
    </div>}
  </details>
}
