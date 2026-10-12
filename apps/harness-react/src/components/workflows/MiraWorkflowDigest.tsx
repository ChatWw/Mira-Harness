/* Conversation digest adapted from ZCode workflow timeline summary.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, GitBranch } from 'lucide-react'
import type { ActorRecord, RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import { workflowError, workflowStatus, type MiraWorkflowHost } from './workflow-model'
import { useMiraWorkflowSnapshot } from './useMiraWorkflowSnapshot'
import { MiraWorkflowTimeline } from './MiraWorkflowTimeline'

type OpenRun = (identity: MiraFlowRunIdentity, actor?: ActorRecord) => Promise<void>
function WorkflowRunCard({ host, identity, summary, active, onOpen }: { host: MiraWorkflowHost; identity: MiraFlowRunIdentity; summary: RunRecord; active: boolean; onOpen: OpenRun }) {
  const [expanded, setExpanded] = useState(true), [actionError, setActionError] = useState('')
  const { snapshot, events, more, loading, error, refresh } = useMiraWorkflowSnapshot(host, identity, active && expanded)
  const run = snapshot?.run ?? summary
  const open = (actor?: ActorRecord) => { setActionError(''); void (actor ? onOpen(identity, actor) : onOpen(identity)).catch(cause => setActionError(workflowError(cause))) }
  return <section className="mira-workflow-card" aria-label={`工作流 ${run.name || '未命名'}`} data-workflow-card-id={run.runId}>
    <header className="mira-workflow-card__header"><GitBranch size={17} aria-hidden="true" /><button type="button" className="mira-workflow-card__toggle" aria-label={`${expanded ? '收起' : '展开'}工作流 ${run.name || '未命名'}`} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><strong>{run.name || '工作流'}</strong><small>{workflowStatus[run.status]} · {run.spentTokens.toLocaleString()} tokens</small></button><button type="button" className="mira-automation-icon" aria-label={`查看工作流 ${run.name || run.runId}`} onClick={() => open()}><ArrowUpRight size={15} /></button></header>
    {expanded && <>{loading && !snapshot && <p role="status" className="mira-workflow-muted">正在读取执行结构…</p>}{snapshot?.graph && <MiraWorkflowTimeline graph={snapshot.graph} run={run} actors={snapshot.actors} nodes={snapshot.nodes} events={events} eventsCurrent={!more} onActor={open} />}{snapshot && !snapshot.graph && <p className="mira-workflow-muted">此历史运行未保存编译图，可打开详情查看实际记录。</p>}</>}
    {(error || actionError) && <p className="mira-automation-error" role="alert">{error || actionError}{error && <button type="button" className="mira-automation-secondary" onClick={refresh}>重试</button>}</p>}
  </section>
}

export function MiraWorkflowDigest({ host, sessionId, active, onOpen, onPresence }: { host: MiraWorkflowHost; sessionId?: string; active: boolean; onOpen: OpenRun; onPresence: (sessionId: string | undefined, count: number) => void }) {
  const [runs, setRuns] = useState<RunRecord[]>([]), [error, setError] = useState('')
  const presence = useRef(onPresence)
  presence.current = onPresence
  useEffect(() => {
    setRuns([]); setError(''); presence.current(sessionId, 0)
    if (!active || !sessionId) return
    let alive = true, loading = false, dirty = false
    async function load() {
      if (loading) { dirty = true; return }
      loading = true
      try {
        const next = await host.requestWorkflow<RunRecord[]>({ action: 'runs.list', sessionId })
        if (alive) { setRuns(next); setError(''); presence.current(sessionId, next.length) }
      } catch (cause) { if (alive) setError(workflowError(cause)) }
      finally { loading = false; if (alive && dirty) { dirty = false; void load() } }
    }
    void load()
    const remove = host.onWorkflowEvent(event => { if (event.sessionId === sessionId && event.type === 'workflow-event') void load() })
    return () => { alive = false; remove() }
  }, [host, sessionId, active])
  return <>{sessionId && runs.map(run => <WorkflowRunCard key={`${sessionId}:${run.runId}`} host={host} identity={{ sessionId, runId: run.runId }} summary={run} active={active} onOpen={onOpen} />)}{error && <p className="mira-automation-error" role="alert">{error}</p>}</>
}
