import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, ArrowRight, ArrowUpRight, MoreHorizontal, RotateCcw, Square, Trash2 } from 'lucide-react'
import type { AutomationRun, AutomationRunStatus, AutomationTask } from '../../../../../src/config/harness'
import { formatAutomationTime, runStatusLabel, sourceLabel } from '../../../../../src/config/automationPresentation'
import { AutomationHint } from './AutomationControls'

export const AUTOMATION_RUN_FILTERS: Array<[AutomationRunStatus | 'all', string]> = [['all', '全部'], ['running', '运行中'], ['completed', '完成'], ['failed', '失败'], ['skipped', '跳过'], ['interrupted', '中断']]
export function AutomationRunHistory({ tasks, runs, taskId, status, busyIds, navigationBusy = false, onTask, onStatus, onRetry, onStop, onOpenSession, onDeleteRun }: {
  tasks: AutomationTask[]; runs: Record<string, AutomationRun[]>; taskId: string; status: AutomationRunStatus | 'all'; busyIds: string[]; navigationBusy?: boolean
  onTask: (id: string) => void; onStatus: (status: AutomationRunStatus | 'all') => void; onRetry: (run: AutomationRun) => void; onStop: (taskId: string) => void; onOpenSession: (sessionId: string) => void; onDeleteRun?: (run: AutomationRun) => void
}) {
  const [page, setPage] = useState(1)
  const entries = tasks.flatMap(task => (runs[task.id] || []).map(run => ({ task, run }))).filter(entry => (!taskId || entry.task.id === taskId) && (status === 'all' || entry.run.status === status)).sort((a, b) => (b.run.scheduledAt || b.run.startedAt || 0) - (a.run.scheduledAt || a.run.startedAt || 0))
  const total = Math.max(1, Math.ceil(entries.length / 8)), current = Math.min(page, total)
  return <section className="mira-automation-history" aria-label="运行记录">
    {(!taskId || status !== 'all') && <div className="mira-automation-history-toolbar"><select value={taskId} aria-label="按任务筛选运行记录" disabled={navigationBusy} onChange={event => { onTask(event.target.value); setPage(1) }}><option value="">全部任务</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.name}</option>)}</select><div className="mira-automation-filters" role="group" aria-label="运行状态">{AUTOMATION_RUN_FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} disabled={navigationBusy} onClick={() => { onStatus(value); setPage(1) }}>{label}</button>)}</div></div>}
    {!entries.length ? <div className="mira-automation-empty mira-automation-history-empty">暂无运行历史</div> : <div className="mira-automation-run-table"><table><thead><tr><th>触发时间</th><th>触发方式</th><th>状态</th><th>耗时</th><th aria-label="操作" /></tr></thead><tbody>{entries.slice((current - 1) * 8, current * 8).map(({ task, run }) => {
      const seconds = run.startedAt && run.completedAt ? Math.max(0, Math.round((run.completedAt - run.startedAt) / 1000)) : undefined
      const badge = <span className="mira-automation-run-status" data-status={run.status} tabIndex={run.status === 'failed' ? 0 : undefined}><i />{runStatusLabel(run.status)}</span>
      return <tr key={run.id}><td>{formatAutomationTime(run.scheduledAt || run.startedAt || run.completedAt)}</td><td>{sourceLabel(run.source)}</td><td>{run.status === 'failed' ? <AutomationHint label={run.error || '未提供错误详情'}>{badge}</AutomationHint> : badge}</td><td>{seconds === undefined ? '—' : seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`}</td><td><DropdownMenu.Root><DropdownMenu.Trigger type="button" className="mira-automation-icon" aria-label={`运行记录操作 ${run.id}`}><MoreHorizontal size={16} /></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-automation-menu" align="end" sideOffset={4}>
        {run.sessionId && <DropdownMenu.Item aria-label={`打开 ${task.name} 的关联聊天`} disabled={navigationBusy || run.sessionAvailable === false} onSelect={() => onOpenSession(run.sessionId!)}><ArrowUpRight size={14} />{run.sessionAvailable === false ? '关联会话已删除' : '查看会话'}</DropdownMenu.Item>}
        {run.status === 'failed' && <DropdownMenu.Item aria-label={`重试 ${task.name}`} disabled={busyIds.includes(task.id) || Boolean(task.endedAt) || (runs[task.id] || []).some(item => item.status === 'running')} onSelect={() => onRetry(run)}><RotateCcw size={14} />重试</DropdownMenu.Item>}
        {run.status === 'running' && <DropdownMenu.Item aria-label={`停止 ${task.name}`} disabled={busyIds.includes(task.id)} onSelect={() => onStop(task.id)}><Square size={14} />停止运行</DropdownMenu.Item>}
        {onDeleteRun && <><DropdownMenu.Separator /><DropdownMenu.Item className="mira-automation-menu-danger" disabled={run.status === 'running' || busyIds.includes(task.id) || navigationBusy} onSelect={() => onDeleteRun(run)}><Trash2 size={14} />删除运行记录</DropdownMenu.Item></>}
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></td></tr>
    })}</tbody></table></div>}
    {total > 1 && <nav className="mira-automation-pagination" aria-label="运行历史分页"><button type="button" disabled={current <= 1 || navigationBusy} onClick={() => setPage(current - 1)}><ArrowLeft size={14} />上一页</button><span>{Array.from({ length: total }, (_, index) => index + 1).filter(value => value === 1 || value === total || Math.abs(current - value) <= 1).map(value => <button type="button" key={value} aria-current={value === current ? 'page' : undefined} onClick={() => setPage(value)} disabled={navigationBusy}>{value}</button>)}</span><button type="button" disabled={current >= total || navigationBusy} onClick={() => setPage(current + 1)}>下一页<ArrowRight size={14} /></button></nav>}
  </section>
}
