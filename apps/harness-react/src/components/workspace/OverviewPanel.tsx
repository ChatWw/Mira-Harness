import { ArrowUpRight, Activity, LoaderCircle, Users } from 'lucide-react'
import type { HarnessSession } from '../../../../../src/config/harness'
import { selectMiraRunActivity } from '../../lib/subtask-activity'
import { ToolRecord } from '../conversation/run-progress'
import { MiraActivityList, MiraActivityTimes, miraSubtaskRoleLabels, miraSubtaskStatusLabels } from './MiraSubtaskPanel'
import '../../styles/mira-subtasks.css'

export function OverviewPanel({ session, sessionId, runId, active, onOpenSubtask, onOpenFile }: {
  session?: HarnessSession; sessionId: string; runId?: string; active: boolean
  onOpenSubtask: (runId: string, subtaskId: string) => void; onOpenFile: (path: string) => void
}) {
  const run = session?.id === sessionId && runId ? selectMiraRunActivity(session, runId) : undefined
  if (!run) return <div className="mira-subtask-panel" role="status"><h2>任务活动</h2><p className="mira-subtask-empty">{runId ? '这轮运行的记录已不可用。' : '从任务摘要或回复中的“查看本轮执行过程”打开对应运行。'}</p></div>
  const statusLabel = { running: '执行中', completed: '已完成', failed: '失败', stopped: '已停止' }[run.status]
  return <article className="mira-subtask-panel" data-run-activity-id={run.runId}>
    <header className="mira-subtask-heading">{run.status === 'running' ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Activity size={17} aria-hidden="true" />}<h2>本轮执行过程</h2><span className="mira-subtask-status" data-status={run.status}>{statusLabel}</span></header>
    <MiraActivityTimes startedAt={run.startedAt} completedAt={run.completedAt} />
    {run.error && <p className="mira-subtask-error">{run.error}</p>}
    <section className="mira-subtask-section"><h3>执行活动</h3><MiraActivityList activities={run.activities} /></section>
    {!!run.tools.length && <section className="mira-subtask-section"><h3>工具记录</h3><div className="mira-tool-records">{run.tools.map(tool => <ToolRecord key={tool.id} tool={tool} onOpenFile={active ? onOpenFile : undefined} />)}</div></section>}
    {!!run.subtasks.length && <section className="mira-subtask-section"><h3>智能体</h3><div className="mira-run-subtasks">{run.subtasks.map(subtask => <button type="button" key={subtask.id} disabled={!active} data-subtask-id={subtask.id} aria-label={`在右侧打开智能体 ${subtask.task}`} title={subtask.task} onClick={() => onOpenSubtask(run.runId, subtask.id)}><Users size={14} aria-hidden="true" /><span><strong>{subtask.task}</strong><small>{miraSubtaskRoleLabels[subtask.role]} · {miraSubtaskStatusLabels[subtask.status]}</small></span><ArrowUpRight size={14} aria-hidden="true" /></button>)}</div></section>}
    {run.usage?.total && <section className="mira-subtask-section"><h3>总用量</h3><dl className="mira-subtask-metadata"><div><dt>总 token</dt><dd>{run.usage.total.totalTokens}</dd></div>{run.usage.total.cost?.priced && <div><dt>费用</dt><dd>{run.usage.total.cost.total.toFixed(4)} {run.usage.total.cost.currency}</dd></div>}</dl></section>}
  </article>
}
