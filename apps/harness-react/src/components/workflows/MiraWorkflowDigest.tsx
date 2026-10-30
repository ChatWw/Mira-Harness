import { useState } from 'react'
import { Maximize2, Workflow, LoaderCircle, CheckCircle2 } from 'lucide-react'
import type { ActorRecord, ArtifactVersionRecord, RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import { workflowError, workflowStatus, type MiraWorkflowHost } from './workflow-model'
import { MiraWorkflowSavedRunActions } from './MiraWorkflowSavedRunActions'
import { MiraWorkflowArtifacts } from './MiraWorkflowArtifacts'
import { workflowArtifacts, workflowDuration, workflowTokens } from './workflow-presentation'
import { useMiraWorkflowSnapshot } from './useMiraWorkflowSnapshot'
import { MiraWorkflowRunControls } from './MiraWorkflowRunControls'
import { AutomationHint } from '../automations/AutomationControls'
import { MiraWorkflowTimeline, type MiraWorkflowTimelineSelection } from './MiraWorkflowTimeline'
import { buildMiraWorkflowTimeline } from './mira-workflow-timeline-model'
import type { MiraWorkflowRunsState } from './useMiraWorkflowRuns'

type OpenRun = (identity: MiraFlowRunIdentity, actor?: ActorRecord, selection?: MiraWorkflowTimelineSelection, artifact?: ArtifactVersionRecord) => Promise<void>
function WorkflowRunCard({ host, identity, summary, active, onOpen }: { host: MiraWorkflowHost; identity: MiraFlowRunIdentity; summary: RunRecord; active: boolean; onOpen: OpenRun }) {
  const [expanded, setExpanded] = useState(true), [actionError, setActionError] = useState('')
  const { snapshot, events, more, loading, error, refresh } = useMiraWorkflowSnapshot(host, identity, active)
  const run = snapshot?.run ?? summary
  const stations = snapshot?.graph ? buildMiraWorkflowTimeline(snapshot.graph, run, snapshot.nodes, events, snapshot.actors, !more) : []
  const live = stations.filter(station => ['executing', 'repairing', 'waiting', 'dispatched', 'queued'].includes(station.status))
  const completed = snapshot?.nodes.filter(node => node.status === 'completed').length ?? 0
  const workingAgents = snapshot?.actors.filter(actor => stations.some(station => station.pills.some(pill => pill.actor?.siteId === actor.siteId && pill.actor.ordinal === actor.ordinal && ['executing', 'repairing', 'waiting', 'dispatched', 'queued'].includes(pill.status)))).length ?? 0
  const totalAgents = Math.max(snapshot?.actors.length ?? 0, snapshot?.graph?.participants.filter(participant => !['workspace', 'unknown'].includes(participant.lane)).length ?? 0)
  const hasRail = stations.length > 0 && run.status !== 'completed'
  const artifacts = snapshot?.presentation?.artifacts ?? workflowArtifacts(snapshot?.nodes ?? [])
  const hitsControl = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button,a,input,select,textarea,summary,[role=dialog]'))
  const open = (actor?: ActorRecord, selection?: MiraWorkflowTimelineSelection, artifact?: ArtifactVersionRecord) => { setActionError(''); void (selection ? onOpen(identity, actor, selection) : actor ? onOpen(identity, actor) : onOpen(identity)).catch(cause => setActionError(workflowError(cause))) }
  return <section className="mira-workflow-card" aria-label={`${expanded ? '收起' : '展开'}工作流 ${run.name || '未命名'}`} data-workflow-card-id={run.runId} data-workflow-run-status={run.status} role={hasRail ? 'button' : undefined} tabIndex={hasRail ? 0 : undefined} aria-expanded={hasRail ? expanded : undefined} onClick={event => { if (hasRail && !hitsControl(event.target)) setExpanded(value => !value) }} onKeyDown={event => { if (hasRail && !hitsControl(event.target) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setExpanded(value => !value) } }}>
    <header className="mira-workflow-card__header"><Workflow size={16} aria-hidden="true" /><span className={`mira-workflow-card__kind${run.status === 'running' ? ' mira-process-sweep' : ''}`}>工作流{workflowStatus[run.status]}</span><span className="mira-workflow-card__name" title={run.name}>{run.name || '工作流'}</span>{hasRail && <small className="mira-workflow-card__detail">{snapshot?.graph?.phases.length} 个阶段 · {run.status === 'running' || run.status === 'pending' ? `${workingAgents} 个子代理工作中` : `${totalAgents} 个子代理`}</small>}{snapshot && <MiraWorkflowSavedRunActions host={host} snapshot={snapshot} onOpen={onOpen} />}<MiraWorkflowRunControls host={host} identity={identity} run={run} onChanged={refresh} compact /><AutomationHint label="在右侧打开"><button type="button" className="mira-automation-icon" aria-label={`查看工作流 ${run.name || run.runId}`} onClick={() => open()}><Maximize2 size={14} /></button></AutomationHint></header>
    <div className="mira-workflow-card__progress" role="status" aria-live="polite">{run.status === 'running' ? <LoaderCircle size={14} className="pilot-spin" aria-hidden="true" /> : run.status === 'completed' ? <CheckCircle2 size={14} aria-hidden="true" /> : null}<span>{run.status === 'running' ? more ? '正在同步执行进度…' : live.length ? live.map(station => `${station.phase.name} · ${station.label}`).join('；') : '工作流运行中，等待下一步执行记录…' : workflowStatus[run.status]}</span>{snapshot && <small>已完成 {completed} 个操作</small>}</div>
    {run.status === 'completed' && <><MiraWorkflowArtifacts host={host} identity={identity} artifacts={artifacts} active={active} onOpen={artifact => { void onOpen(identity, undefined, undefined, artifact).catch(cause => setActionError(workflowError(cause))) }} /><div className="mira-workflow-completion-figures">{[[workflowDuration(snapshot?.presentation), '时间'], [workflowTokens(run.spentTokens), 'tokens'], [snapshot ? String(totalAgents) : '—', '子代理'], [snapshot?.graph ? String(stations.length) : '—', '阶段']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></>}
    <>{loading && !snapshot && <p role="status" className="mira-workflow-muted">正在读取执行结构…</p>}{snapshot?.graph && run.status !== 'completed' && <MiraWorkflowTimeline graph={snapshot.graph} run={run} actors={snapshot.actors} nodes={snapshot.nodes} events={events} eventsCurrent={!more} compact={!expanded} onActor={open} onSelect={selection => open(selection.actor, selection)} />}{snapshot && !snapshot.graph && <p className="mira-workflow-muted">此历史运行未保存编译图，可打开详情查看实际记录。</p>}</>
    {(error || actionError) && <p className="mira-automation-error" role="alert">{error || actionError}{error && <button type="button" className="mira-automation-secondary" onClick={refresh}>重试</button>}</p>}
  </section>
}

export function MiraWorkflowDigest({ host, workflows, active, onOpen }: { host: MiraWorkflowHost; workflows: MiraWorkflowRunsState; active: boolean; onOpen: OpenRun }) {
  const { sessionId, runs, error, refresh } = workflows
  return <>{sessionId && runs.length > 0 && <div className="mira-workflow-digests">{runs.map(run => <WorkflowRunCard key={`${sessionId}:${run.runId}`} host={host} identity={{ sessionId, runId: run.runId }} summary={run} active={active} onOpen={onOpen} />)}</div>}{error && <p className="mira-automation-error" role="alert">{error}<button type="button" onClick={refresh}>重试</button></p>}</>
}
