import { ArrowUpRight, Clock3, RotateCcw, Square } from 'lucide-react'
import type { AutomationRun, AutomationRunStatus, AutomationTask } from '../../../../../src/config/harness'
import { formatAutomationTime, permissionLabel, runStatusLabel, sourceLabel } from '../../../../../src/pages/frontend/harness/automations/automationPresentation'

export const AUTOMATION_RUN_FILTERS: Array<[AutomationRunStatus | 'all', string]> = [['all', '全部'], ['running', '运行中'], ['completed', '完成'], ['failed', '失败'], ['skipped', '跳过'], ['interrupted', '中断']]
export function AutomationRunHistory({ tasks, runs, taskId, status, busyIds, onTask, onStatus, onRetry, onStop, onOpenSession }: {
  tasks: AutomationTask[]; runs: Record<string, AutomationRun[]>; taskId: string; status: AutomationRunStatus | 'all'; busyIds: string[]
  onTask: (id: string) => void; onStatus: (status: AutomationRunStatus | 'all') => void; onRetry: (run: AutomationRun) => void; onStop: (taskId: string) => void; onOpenSession: (sessionId: string) => void
}) {
  const entries = tasks.flatMap(task => (runs[task.id] || []).map(run => ({ task, run }))).filter(entry => (!taskId || entry.task.id === taskId) && (status === 'all' || entry.run.status === status)).sort((a, b) => (b.run.startedAt || b.run.completedAt || b.run.scheduledAt || 0) - (a.run.startedAt || a.run.completedAt || a.run.scheduledAt || 0))
  return <section className="mira-automation-history" aria-label="运行记录">
    <div className="mira-automation-history-toolbar"><select value={taskId} aria-label="按任务筛选运行记录" onChange={event => onTask(event.target.value)}><option value="">全部任务</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.name}</option>)}</select><div className="mira-automation-filters" role="group" aria-label="运行状态">{AUTOMATION_RUN_FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => onStatus(value)}>{label}</button>)}</div></div>
    {!entries.length ? <div className="mira-automation-empty"><Clock3 size={24} /><p>暂无符合条件的运行记录</p></div> : <div className="mira-automation-run-list">{entries.map(({ task, run }) => <article className="mira-automation-run" key={run.id} data-status={run.status}>
      <header><span className="mira-automation-status" data-status={run.status}>{runStatusLabel(run.status)}</span><strong>{task.name}</strong><time>{formatAutomationTime(run.startedAt || run.completedAt || run.scheduledAt)}</time></header>
      <p>{run.error || run.resultSummary || (run.status === 'running' ? '正在执行任务' : run.status === 'skipped' ? '本次运行已跳过' : run.status === 'interrupted' ? '本次运行已停止' : '任务已完成')}</p>
      <details><summary>查看运行详情</summary><dl><dt>来源</dt><dd>{sourceLabel(run.source)}</dd><dt>模型</dt><dd>{run.snapshot.model.modelId}</dd><dt>权限</dt><dd>{permissionLabel(run.snapshot.permissionMode)}</dd><dt>任务指令</dt><dd className="mira-automation-run-prompt">{run.snapshot.prompt}</dd>{run.error && <><dt>错误</dt><dd className="mira-automation-run-prompt">{run.error}</dd></>}</dl></details>
      <footer><span>{sourceLabel(run.source)} · {permissionLabel(run.snapshot.permissionMode)}</span><div>{run.status === 'failed' && <button type="button" aria-label={`重试 ${task.name}`} disabled={busyIds.includes(task.id) || Boolean(task.endedAt) || (runs[task.id] || []).some(item => item.status === 'running')} onClick={() => onRetry(run)}><RotateCcw size={14} />重试</button>}{run.status === 'running' && <button type="button" aria-label={`停止 ${task.name}`} disabled={busyIds.includes(task.id)} onClick={() => onStop(task.id)}><Square size={13} />停止</button>}{run.sessionId && run.sessionAvailable !== false ? <button type="button" aria-label={`打开 ${task.name} 的关联聊天`} onClick={() => onOpenSession(run.sessionId!)}><ArrowUpRight size={14} />打开聊天</button> : run.sessionId ? <span>关联聊天已删除</span> : null}</div></footer>
    </article>)}</div>}
  </section>
}
