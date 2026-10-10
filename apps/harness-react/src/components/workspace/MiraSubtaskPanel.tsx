// Child conversation structure adapted from ZCode SubagentSessionSidePane/SessionPane (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Public messages and ownership use Mira's runtime contract.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown, ChevronDown, FileText, LoaderCircle, Square, Users } from 'lucide-react'
import type { HarnessMessage, HarnessRunActivity, HarnessSession, HarnessSubtask, ToolCallRecord } from '../../../../../src/config/harness'
import { selectMiraSubtask } from '../../lib/subtask-activity'
import { isWorkspaceRelativePath } from '../../state/workspace-state'
import { useConversationScroll, type ConversationScrollActions } from '../../hooks/useConversationScroll'
import { AssistantMessageParts } from '../conversation/AssistantMessageParts'
import { MiraConversationDetailMemory, MiraConversationDetails, useMiraConversationDetail } from '../conversation/MiraConversationDetails'
import { MessageMarkdown } from '../conversation/markdown'
import { ToolRecord } from '../conversation/run-progress'
import '../../styles/mira-subtasks.css'

export const miraSubtaskRoleLabels: Record<HarnessSubtask['role'], string> = { explorer: '探索', reviewer: '审查', tester: '测试', implementer: '实现' }
export const miraSubtaskStatusLabels: Record<HarnessSubtask['status'], string> = { queued: '排队中', running: '执行中', stopping: '正在停止', completed: '已完成', failed: '失败', stopped: '已停止', timed_out: '已超时', turn_limit: '已达轮次上限', interrupted: '已中断' }
const childDetailMemory = new MiraConversationDetailMemory()

export function MiraActivityList({ activities }: { activities: HarnessRunActivity[] }) {
  const labels: Record<HarnessRunActivity['status'], string> = { pending: '待执行', running: '执行中', completed: '已完成', failed: '失败' }
  return activities.length ? <ol className="mira-run-activities">{activities.map((activity, index) => <li key={JSON.stringify([activity.id, index])} data-activity-id={activity.id} data-status={activity.status}>
    <span className="mira-subtask-status-dot" aria-hidden="true" />
    <div><strong>{activity.label}</strong>{activity.detail && <p>{activity.detail}</p>}<small>{new Date(activity.startedAt).toLocaleTimeString()}{activity.completedAt !== undefined ? ` — ${new Date(activity.completedAt).toLocaleTimeString()}` : ''}</small></div>
    <small>{labels[activity.status]}</small>
  </li>)}</ol> : <p className="mira-subtask-empty">暂无执行活动。</p>
}

export function MiraActivityTimes({ createdAt, startedAt, completedAt }: { createdAt?: number; startedAt?: number; completedAt?: number }) {
  const entries = [['创建时间', createdAt], ['开始时间', startedAt], ['结束时间', completedAt]] as const
  return <dl className="mira-subtask-metadata">{entries.map(([label, timestamp]) => timestamp !== undefined && <div key={label}><dt>{label}</dt><dd><time dateTime={new Date(timestamp).toISOString()}>{new Date(timestamp).toLocaleString()}</time></dd></div>)}{startedAt !== undefined && completedAt !== undefined && <div><dt>用时</dt><dd>{Math.max(0, completedAt - startedAt) / 1000} 秒</dd></div>}</dl>
}

function MiraSubtaskConversation({ subtask, tools, owner, runId, active, stopping, error, canStop, onStop, onOpenFile }: {
  subtask: HarnessSubtask; tools: ToolCallRecord[]; owner: string; runId: string; active: boolean
  stopping: boolean; error?: string; canStop: boolean; onStop: () => void; onOpenFile: (path: string) => void
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollActions = useRef<ConversationScrollActions | null>(null)
  const summaryRef = useRef<HTMLDetailsElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [summaryHeight, setSummaryHeight] = useState(34)
  const [summaryOpen, setSummaryOpen] = useMiraConversationDetail('child-summary')
  const scroll = useConversationScroll({ memoryKey: JSON.stringify(['mira-child', owner]), active, ready: true, viewportRef, actionsRef: scrollActions, onBottomChange: setAtBottom })
  useLayoutEffect(() => {
    const summary = summaryRef.current
    if (!summary || !active) return
    const update = () => { const height = Math.ceil(summary.getBoundingClientRect().height); if (height > 0) setSummaryHeight(previous => previous === height ? previous : height) }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(summary)
    return () => observer.disconnect()
  }, [active])
  const parts = subtask.parts ?? []
  const toolsById = useMemo(() => new Map(tools.map(tool => [tool.id, tool])), [tools])
  const running = subtask.status === 'running' || subtask.status === 'queued' || subtask.status === 'stopping'
  const interrupted = ['failed', 'stopped', 'timed_out', 'turn_limit', 'interrupted'].includes(subtask.status)
  const message: HarnessMessage = { id: owner, runId, role: 'assistant', content: '', parts, createdAt: subtask.startedAt ?? subtask.createdAt }
  const currentActivity = subtask.activities.find(activity => activity.status === 'running')
  const lastActivity = subtask.activities[subtask.activities.length - 1]
  const summaryLabel = currentActivity?.label || lastActivity?.label || miraSubtaskStatusLabels[subtask.status]
  const hasText = parts.some(part => part.type === 'text' && part.text.trim())
  return <article className="mira-subtask-panel mira-subtask-conversation" data-subtask-panel-id={subtask.id} data-subtask-run-id={runId}>
    <header className="mira-subtask-heading"><Users size={16} aria-hidden="true" /><h2 title={subtask.task}>{miraSubtaskRoleLabels[subtask.role]}智能体</h2><span className="mira-subtask-status" data-status={subtask.status}>{miraSubtaskStatusLabels[subtask.status]}</span>{canStop && <button type="button" className="mira-subtask-stop" disabled={stopping} aria-label={`停止智能体 ${subtask.task}`} onClick={onStop}>{stopping ? <LoaderCircle size={13} className="animate-spin" /> : <Square size={12} />}停止</button>}</header>
    {error && <p role="alert" className="mira-subtask-error mira-subtask-stop-error">{error}</p>}
    <div className="mira-subtask-conversation-body" style={{ '--mira-child-summary-height': `${summaryHeight}px` } as CSSProperties}>
      <div className="mira-subtask-summary-layer">
        <details ref={summaryRef} className="mira-subtask-summary" open={summaryOpen} onToggle={event => setSummaryOpen(event.currentTarget.open)}>
          <summary aria-label={summaryOpen ? '收起智能体摘要' : '展开智能体摘要'}><span className="mira-subtask-status-dot" data-status={subtask.status} /><strong>{summaryLabel}</strong>{running && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}<ChevronDown size={13} aria-hidden="true" /></summary>
          {summaryOpen && <div className="mira-subtask-summary-content">
            <MiraActivityTimes createdAt={subtask.createdAt} startedAt={subtask.startedAt} completedAt={subtask.completedAt} />
            {!!subtask.files?.length && <div className="mira-subtask-files" aria-label="智能体文件范围">{subtask.files.map((file, index) => isWorkspaceRelativePath(file.path) ? <button type="button" key={JSON.stringify([file.path, index])} disabled={!active} title={file.path} onClick={() => onOpenFile(file.path)}><FileText size={13} aria-hidden="true" />{file.path}</button> : <span key={index}>{file.path}</span>)}</div>}
            <MiraActivityList activities={subtask.activities} />
            {subtask.usage && <dl className="mira-subtask-metadata"><div><dt>总 token</dt><dd>{subtask.usage.totalTokens}</dd></div><div><dt>输入 / 输出</dt><dd>{subtask.usage.input} / {subtask.usage.output}</dd></div>{subtask.usage.cost?.priced && <div><dt>费用</dt><dd>{subtask.usage.cost.total.toFixed(4)} {subtask.usage.cost.currency}</dd></div>}</dl>}
          </div>}
        </details>
      </div>
      <div ref={scroll.ref} className="mira-subtask-viewport" tabIndex={0} role="region" aria-label={`${miraSubtaskRoleLabels[subtask.role]}智能体对话`} data-subtask-scroll-owner={owner}>
        <div className="mira-subtask-messages">
          <div className="mira-subtask-request" data-mira-turn-id={`${owner}:request`}><p>{subtask.task}</p></div>
          <div className="mira-subtask-reply" data-mira-turn-id={`${owner}:reply`}>
            <AssistantMessageParts message={message} toolsById={toolsById} streaming={running} onOpenFile={active ? onOpenFile : undefined} />
            {!hasText && subtask.report && <MessageMarkdown content={subtask.report} />}
            {parts.length === 0 && !subtask.report && <p className="mira-subtask-empty" role="status">{running ? '正在等待智能体回复…' : '本次子任务未记录对话正文。'}</p>}
            {subtask.error && <p className="mira-subtask-error" role="alert">{subtask.error.message}<small>{subtask.error.code}</small></p>}
            {interrupted && <p className="mira-reply-interrupted">{miraSubtaskStatusLabels[subtask.status]}</p>}
          </div>
        </div>
      </div>
      {!atBottom && <button type="button" className="mira-subtask-scroll-latest" aria-label="回到智能体对话底部" onClick={() => scrollActions.current?.resume()}><ArrowDown size={16} aria-hidden="true" /></button>}
    </div>
  </article>
}

export function MiraSubtaskPanel({ session, sessionId, runId, subtaskId, directory, active, onStopSubtask, onOpenFile }: {
  session?: HarnessSession; sessionId: string; runId: string; subtaskId: string; active: boolean
  directory?: string
  onStopSubtask: (subtaskId: string) => Promise<void>; onOpenFile: (path: string) => void
}) {
  const selected = session?.id === sessionId ? selectMiraSubtask(session, runId, subtaskId) : undefined
  const owner = JSON.stringify([sessionId, runId, subtaskId])
  const live = useRef({ owner, active, mounted: false })
  live.current.owner = owner
  live.current.active = active
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string>()
  const pendingStop = useRef<object | undefined>(undefined)
  useEffect(() => { live.current.mounted = true; return () => { live.current.mounted = false } }, [])
  useEffect(() => { pendingStop.current = undefined; setStopping(false); setError(undefined) }, [owner])
  if (!selected) return <div className="mira-subtask-panel" role="status"><h2>智能体记录不可用</h2><p className="mira-subtask-empty">这项子任务已不在所选运行中。</p></div>
  const { subtask, tools } = selected
  const canStop = active && session?.activeRun?.id === runId && (subtask.status === 'queued' || subtask.status === 'running')
  const stop = async () => {
    if (!canStop || stopping || pendingStop.current) return
    const requestOwner = owner
    const request = {}
    pendingStop.current = request
    setStopping(true); setError(undefined)
    try { await onStopSubtask(subtask.id) } catch (failure) {
      if (live.current.mounted && live.current.active && live.current.owner === requestOwner && pendingStop.current === request) setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (pendingStop.current === request) {
        pendingStop.current = undefined
        if (live.current.mounted && live.current.owner === requestOwner) setStopping(false)
      }
    }
  }
  if (subtask.parts !== undefined) return <MiraConversationDetails memory={childDetailMemory} scope={owner} directory={directory}><MiraSubtaskConversation key={owner} subtask={subtask} tools={tools} owner={owner} runId={runId} active={active} stopping={stopping} error={error} canStop={canStop} onStop={() => void stop()} onOpenFile={onOpenFile} /></MiraConversationDetails>
  return <article className="mira-subtask-panel" data-subtask-panel-id={subtask.id} data-subtask-run-id={runId}>
    <header className="mira-subtask-heading"><Users size={17} aria-hidden="true" /><h2>{miraSubtaskRoleLabels[subtask.role]}智能体</h2><span className="mira-subtask-status" data-status={subtask.status}>{miraSubtaskStatusLabels[subtask.status]}</span>{canStop && <button type="button" className="mira-subtask-stop" disabled={stopping} aria-label={`停止智能体 ${subtask.task}`} onClick={() => void stop()}>{stopping ? <LoaderCircle size={13} className="animate-spin" /> : <Square size={12} />}停止</button>}</header>
    <p className="mira-subtask-task">{subtask.task}</p>
    <MiraActivityTimes createdAt={subtask.createdAt} startedAt={subtask.startedAt} completedAt={subtask.completedAt} />
    {error && <p role="alert" className="mira-subtask-error">{error}</p>}
    {!!subtask.files?.length && <section className="mira-subtask-section"><h3>文件范围</h3><div className="mira-subtask-files">{subtask.files.map((file, index) => isWorkspaceRelativePath(file.path) ? <button type="button" key={JSON.stringify([file.path, index])} disabled={!active} title={file.path} onClick={() => onOpenFile(file.path)}><FileText size={13} aria-hidden="true" />{file.path}</button> : <span key={index}>{file.path}</span>)}</div></section>}
    <section className="mira-subtask-section"><h3>执行活动</h3><MiraActivityList activities={subtask.activities} /></section>
    {!!tools.length && <section className="mira-subtask-section"><h3>工具记录</h3><div className="mira-tool-records">{tools.map(tool => <ToolRecord key={tool.id} tool={tool} onOpenFile={active ? onOpenFile : undefined} />)}</div></section>}
    {subtask.error && <section className="mira-subtask-section"><h3>执行错误</h3><p className="mira-subtask-error">{subtask.error.message}</p><small className="mira-subtask-empty">{subtask.error.code}</small></section>}
    <section className="mira-subtask-section"><h3>最终报告</h3>{subtask.report ? <MessageMarkdown content={subtask.report} /> : <p className="mira-subtask-empty">{subtask.status === 'queued' || subtask.status === 'running' || subtask.status === 'stopping' ? '子任务结束后，最终报告会显示在这里。' : '本次子任务未记录最终报告。'}</p>}</section>
    {subtask.usage && <section className="mira-subtask-section"><h3>用量</h3><dl className="mira-subtask-metadata"><div><dt>总 token</dt><dd>{subtask.usage.totalTokens}</dd></div><div><dt>输入 / 输出</dt><dd>{subtask.usage.input} / {subtask.usage.output}</dd></div>{subtask.usage.cost?.priced && <div><dt>费用</dt><dd>{subtask.usage.cost.total.toFixed(4)} {subtask.usage.cost.currency}</dd></div>}</dl></section>}
  </article>
}
