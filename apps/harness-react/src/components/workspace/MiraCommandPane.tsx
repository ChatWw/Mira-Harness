import { isMiraPrimaryModifier, miraShortcutLabel } from '../../../../../src/platform/workbenchShortcuts'
/* Output pane adapted from ZCode BackgroundBashOutputSidePane (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
 * Mira displays canonical foreground and independent command-job snapshots. */
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, FileText, LoaderCircle, Square, TerminalSquare } from 'lucide-react'
import type { HarnessSession } from '../../../../../src/config/harness'
import { miraCommandJobLabels } from '../../../../../src/config/miraCommandJobs'
import { miraRecordedCommand, miraSessionCommand } from '../../lib/mira-command-presentation'
import { MiraCommandOutput } from '../conversation/MiraToolCommand'

export function MiraCommandPane({ session, sessionId, runId, toolId, active, onAction, onOpenFullOutput }: {
  session?: HarnessSession; sessionId: string; runId: string; toolId: string; active: boolean
  onAction?: (sessionId: string, runId: string, toolId: string, action: 'background' | 'stop') => Promise<void>
  onOpenFullOutput?: (runId: string, toolId: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(Date.now)
  const owner = JSON.stringify([sessionId, runId, toolId])
  const currentOwner = useRef(owner)
  currentOwner.current = owner
  useEffect(() => { currentOwner.current = owner; setPending(false); setError(undefined); return () => { currentOwner.current = '' } }, [owner])
  const tool = miraSessionCommand(session, sessionId, runId, toolId)
  const job = tool?.inherited ? undefined : tool?.commandJob
  const running = job ? job.status === 'running' : tool?.status === 'running'
  useEffect(() => { if (!active || !running || !job) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [active, running, job?.startedAt])
  const action = async (next: 'background' | 'stop') => {
    if (!onAction || !active || pending || !job || !running) return
    setPending(true); setError(undefined)
    try { await onAction(sessionId, runId, toolId, next) }
    catch (error) { if (currentOwner.current === owner) setError(error instanceof Error ? error.message : '命令操作失败，请重试') }
    finally { if (currentOwner.current === owner) setPending(false) }
  }
  if (!tool) return <section className="mira-command-pane" role="status"><h2>命令输出</h2><p>这次命令的记录已不可用。</p></section>
  const output = job?.output?.text ?? (job?.mode === 'background' ? undefined : tool.output?.text)
  const failure = job ? job.error : tool.error
  const result = failure ? output && !failure.startsWith(output) ? `${output}\n\n${failure}` : failure : output
  const status = job ? `${job.mode === 'background' ? '后台 · ' : ''}${miraCommandJobLabels[job.status]}` : { running: '执行中', 'waiting-confirm': '等待确认', ok: '已完成', failed: '执行失败', cancelled: '已取消' }[tool.status]
  return <section className="mira-command-pane" data-command-tool-id={tool.id} data-command-run-id={runId} data-status={job?.status ?? tool.status} onKeyDown={event => { if (!event.defaultPrevented && !event.repeat && !event.nativeEvent.isComposing && event.keyCode !== 229 && isMiraPrimaryModifier(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b' && job?.mode === 'foreground' && job.backgroundAllowed !== false && running && active && onAction) { event.preventDefault(); event.stopPropagation(); void action('background') } }}>
    <header>{running ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <TerminalSquare size={16} aria-hidden="true" />}<h2>命令输出</h2><span role="status">{status}</span>{job && <small className="mira-command-elapsed">{Math.max(0, Math.floor(((job.completedAt ?? now) - job.startedAt) / 1000))}秒</small>}</header>
    {(job && running && onAction || !tool.inherited && job?.fullOutputAvailable && onOpenFullOutput) && <div className="mira-command-actions">{job && running && onAction && <>{job.mode === 'foreground' && job.backgroundAllowed !== false && <button type="button" disabled={!active || pending} title={`转到后台（${miraShortcutLabel('B')}）`} onClick={() => void action('background')}><ArrowUpRight size={13} aria-hidden="true" />转到后台</button>}<button type="button" disabled={!active || pending} aria-label="停止这条命令" onClick={() => void action('stop')}>{pending ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}停止命令</button></>}{!tool.inherited && job?.fullOutputAvailable && onOpenFullOutput && <button type="button" className="mira-command-file-action" disabled={!active} title="完整输出.log" onClick={() => onOpenFullOutput(runId, toolId)}><FileText size={13} aria-hidden="true" />查看完整输出</button>}</div>}
    {error && <p className="mira-tool-error" role="alert">{error}</p>}
    <pre className="mira-command-pane__command" aria-label="执行命令">{miraRecordedCommand(tool) || '未记录命令内容'}</pre>
    <MiraCommandOutput key={owner} text={result ?? (running ? '等待命令输出…' : tool.status === 'waiting-confirm' ? '等待权限确认，命令尚未执行。' : '没有记录输出。')} running={running} fullHeight active={active} />
    {(job?.output ?? tool.output)?.truncated && <p className="mira-payload-truncated" role="note">输出已被截断，仅显示已记录部分。</p>}
  </section>
}
