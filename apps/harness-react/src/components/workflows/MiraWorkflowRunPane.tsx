/* Run side pane and journal digest adapted from ZCode WorkflowRunSidePane/workflowRunPanel.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle, CircleX, Workflow, LoaderCircle, Play, RefreshCw, Square } from 'lucide-react'
import type { ModelProviderSummary } from '../../../../../src/config/harness'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import type { ActorRecord, ArtifactVersionRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import { MiraWorkflowSavedRunActions } from './MiraWorkflowSavedRunActions'
import { MiraWorkflowArtifacts } from './MiraWorkflowArtifacts'
import { workflowArtifacts } from './workflow-presentation'
import type { WorkspaceWorkflowDetail } from '../../state/workspace-state'
import { buildMiraWorkflowTimeline } from './mira-workflow-timeline-model'
import { MiraWorkflowRunControls } from './MiraWorkflowRunControls'
import { MiraWorkflowTimeline, MiraTimelineOperations, type MiraWorkflowTimelineSelection } from './MiraWorkflowTimeline'
import { useMiraWorkflowSnapshot } from './useMiraWorkflowSnapshot'
import { workflowActorModelLabel, workflowActorObservation, workflowError, workflowEventLine, workflowModels, workflowNodeLabel, workflowNodeObservation, workflowStatus, workflowStopReason, workflowToolLabel, workflowValue, type MiraWorkflowHost, type MiraWorkflowNodeObservation } from './workflow-model'

function ProgressIcon({ status }: { status: MiraWorkflowNodeObservation['status'] }) {
  return status === 'completed' ? <CheckCircle2 size={14} aria-hidden="true" /> : status === 'failed' ? <CircleX size={14} aria-hidden="true" /> : status === 'stopped' ? <Square size={14} aria-hidden="true" /> : ['executing', 'dispatched', 'queued', 'repairing'].includes(status) ? <LoaderCircle size={14} aria-hidden="true" className="pilot-spin" /> : <Circle size={14} aria-hidden="true" />
}

export function MiraWorkflowRunPane({ host, identity, providers, active = true, detail, onOpen, onOpenArtifact, onOpenRun }: { host: MiraWorkflowHost; identity: MiraFlowRunIdentity; providers: ModelProviderSummary[]; active?: boolean; detail?: Extract<WorkspaceWorkflowDetail, { kind: 'operations' }>; onOpen?: (actor?: ActorRecord, selection?: MiraWorkflowTimelineSelection) => void; onOpenArtifact?: (artifact: ArtifactVersionRecord) => void; onOpenRun?: (identity: MiraFlowRunIdentity) => void | Promise<void> }) {
  const { snapshot, events, loading, error: snapshotError, more, refresh } = useMiraWorkflowSnapshot(host, identity, active)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const models = workflowModels(providers)
  const operation = useRef(false), generation = useRef(0)
  useEffect(() => {
    ++generation.current; setError('')
    return () => { ++generation.current }
  }, [identity.sessionId, identity.runId, active])
  const run = snapshot?.run
  async function control(action: 'runs.resume') {
    if (operation.current) return
    operation.current = true; setBusy(true); setError('')
    const version = generation.current
    try {
      if (action === 'runs.resume') {
        const selection = snapshot?.selection
        if (!selection) throw new Error('此历史运行没有可恢复的原模型记录')
        await host.requestWorkflow({ action, ...identity, selection })
      }
      if (version === generation.current) refresh()
    } catch (cause) { if (version === generation.current) setError(workflowError(cause)) }
    finally { operation.current = false; setBusy(false) }
  }
  const phases = events.filter(item => item.event.type === 'phase-entered')
  const artifacts = snapshot?.presentation?.artifacts ?? workflowArtifacts(snapshot?.nodes ?? [])
  const resumable = run?.status === 'stopped' && run.stopReason !== 'superseded' && !run.resumedFrom && Boolean(run.scriptHash && run.scriptText && run.cwd)
  if (detail) {
    const station = snapshot?.graph && buildMiraWorkflowTimeline(snapshot.graph, run, snapshot.nodes, events, snapshot.actors, !more).find(item => item.phase.id === detail.phaseId)
    const pill = detail.participantId ? station?.pills.find(item => item.participant.id === detail.participantId) : undefined
    const operations = detail.participantId ? pill?.operations : station?.operations
    return <section className="mira-workflow-run" aria-label="工作流操作详情">
      <header className="mira-workflow-run__header"><Workflow size={16} /><div><h2>{pill?.name || station?.phase.name || '工作区操作'}</h2></div></header>
      {snapshotError && <p role="alert">{snapshotError}<button type="button" onClick={refresh}>重试</button></p>}
      {loading && !snapshot && <p role="status">正在读取操作记录…</p>}
      {snapshot && <div className="mira-flow-line"><MiraTimelineOperations operations={operations ?? []} live={Boolean(run)} />{!operations?.length && <p className="mira-flow-line__note">此节点没有已记录的操作。</p>}</div>}
    </section>
  }
  return <section className="mira-workflow-run" aria-label="工作流运行详情" data-workflow-run-id={identity.runId}>
    <header className="mira-workflow-run__header"><Workflow size={16} /><div><h2>{run?.name || '工作流'}</h2></div><span />{snapshot && <MiraWorkflowSavedRunActions host={host} snapshot={snapshot} onOpen={onOpenRun} />}{run && <MiraWorkflowRunControls host={host} identity={identity} run={run} onChanged={refresh} />}<button type="button" className="mira-automation-icon" title="刷新工作流运行" aria-label="刷新工作流运行" disabled={loading} onClick={refresh}><RefreshCw size={15} /></button></header>
    {loading && !run && <p role="status">正在读取运行记录…</p>}{(error || snapshotError) && <div className="mira-automation-error" role="alert">{error || snapshotError}<button type="button" onClick={() => { setError(''); refresh() }}>重试</button></div>}
    {run && snapshot && <><div className="mira-workflow-run__status" data-status={run.status}><strong><i className="mira-workflow-status-dot" data-status={run.status} />{workflowStatus[run.status]}</strong>{snapshot.presentation?.savedDefinition && <small className="mira-workflow-saved-label">已保存</small>}<span>{snapshot.actors.length} 个子代理 · {snapshot.nodes.filter(node => node.status === 'completed').length} / {snapshot.nodes.length} 步 · {run.spentTokens.toLocaleString()} tokens · {artifacts.length} 个产物</span></div>
      <div className="mira-workflow-run__body">{resumable && <div className="mira-workflow-run__controls">
        <><span className="mira-workflow-muted">原模型：{snapshot.selection ? models.find(item => item.selection.providerId === snapshot.selection!.providerId && item.selection.modelId === snapshot.selection!.modelId)?.label || snapshot.selection.modelId : '没有可恢复的模型记录'}</span><button type="button" className="mira-automation-primary" disabled={busy || !snapshot.selection} onClick={() => void control('runs.resume')}><Play size={13} />原样续跑</button></>
      </div>}
      {run.failure && <p className="mira-automation-error" role="alert">{workflowValue(run.failure)}</p>}{run.stopReason && <p className="mira-workflow-muted">停止原因：{workflowStopReason(run.stopReason)}</p>}
      <div className="mira-workflow-run__provenance"><small>{run.toolCallId ? '由对话启动' : '由工作流列表启动'}{snapshot.presentation?.startedAt ? ` · ${new Date(snapshot.presentation.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</small>{snapshot.presentation?.description && <p>{snapshot.presentation.description}</p>}{Object.keys(run.args ?? {}).length > 0 && <dl>{Object.entries(run.args ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{workflowValue(value)}</dd></div>)}</dl>}</div>
      {['completed', 'errored', 'stopped'].includes(run.status) && <div className="mira-workflow-run__result"><small>结果</small>{run.result !== undefined ? <pre>{workflowValue(run.result)}</pre> : <p>{run.status === 'completed' ? artifacts.length ? '脚本未返回结果。已发布的产物见下方。' : '脚本执行完成，未返回结果或发布产物。' : run.failure?.message || workflowStatus[run.status]}</p>}</div>}
      {snapshot.graph ? <MiraWorkflowTimeline graph={snapshot.graph} variant="pane" run={run} actors={snapshot.actors} nodes={snapshot.nodes} events={events} eventsCurrent={!more} onActor={actor => onOpen?.(actor)} onSelect={selection => onOpen?.(selection.actor, selection)} /> : <p className="mira-workflow-muted">此历史运行未保存编译图；以下为真实执行记录。</p>}
      <details className="mira-workflow-run__diagnostics"><summary>执行记录与诊断</summary><section><h3>执行阶段</h3>{phases.length ? <ol className="mira-workflow-phases">{phases.map((item, index) => <li key={item.sequence} data-active={index === phases.length - 1 && run.status === 'running'}><Circle size={14} aria-hidden="true" /><span>{workflowEventLine(item).replace('阶段 · ', '')}</span><small>已进入{item.timeCreated ? ` · ${new Date(item.timeCreated).toLocaleTimeString()}` : ''}</small></li>)}</ol> : <p className="mira-workflow-muted">此工作流没有已记录的阶段标记</p>}</section>
      <section><h3>智能体与节点</h3>
        {snapshot.actors.map(actor => {
          const observed = workflowActorObservation(run, actor, snapshot.nodes, events, !more)
          return <div className="mira-workflow-actor" key={`${actor.siteId}:${actor.ordinal}`} data-actor-status={observed.status} data-actor-instance={`${actor.siteId}@${actor.ordinal}`}>
          <strong title={`${actor.siteId}@${actor.ordinal}`}>{actor.name || `智能体 ${actor.ordinal + 1}`}</strong>
          {actor.sessionId && <button type="button" className="mira-automation-secondary mira-workflow-actor__open" aria-label={`查看智能体对话 ${actor.name || actor.siteId} ${actor.ordinal}`} onClick={() => onOpen?.(actor)}>查看对话</button>}
          <div className="mira-workflow-progress" data-progress-status={observed.status}><ProgressIcon status={observed.status} /><span>{observed.label}</span><small>{observed.completed} / {observed.tasks} 个已记录任务完成</small></div>
          <small className="mira-workflow-actor__model" title={workflowActorModelLabel(actor.resolvedModel, providers)}>{workflowActorModelLabel(actor.resolvedModel, providers)}</small>
          {observed.instructions ? <p className="mira-workflow-task-summary">{observed.instructions}</p> : <small>当前任务指令未在已读取事件中记录</small>}
          {observed.progress && <div className="mira-workflow-task-progress"><span>已完成 {observed.progress.turn} 轮 · {observed.progress.toolCalls} 次工具调用</span>{observed.progress.lastTool && <span>最近观察工具：{workflowToolLabel(observed.progress.lastTool.name)}{observed.progress.lastTool.target ? ` · ${observed.progress.lastTool.target}` : ''}</span>}</div>}
          <details><summary>执行详情</summary><dl><dt>智能体实例</dt><dd>{actor.siteId}@{actor.ordinal}</dd>{actor.resolvedModel && <><dt>模型记录</dt><dd>{actor.resolvedModel}</dd></>}{actor.sessionId && <><dt>执行会话</dt><dd>{actor.sessionId}</dd></>}</dl></details>
        </div>})}
        <ol className="mira-workflow-nodes">{snapshot.nodes.map(node => {
          const observed = workflowNodeObservation(run, node, events, !more)
          return <li key={`${node.siteId}:${node.ordinal}`} data-status={observed.status} data-node-instance={`${node.siteId}@${node.ordinal}`}>
          <span title={`${node.kind} · ${node.siteId}@${node.ordinal}`}><ProgressIcon status={observed.status} /><span>{workflowNodeLabel(node.kind)}</span></span>
          <small>{observed.label}</small>
          {node.kind === 'ask' && observed.instructions && <p className="mira-workflow-task-summary">{observed.instructions}</p>}
          {node.kind === 'ask' && observed.progress && <p className="mira-workflow-muted">已完成 {observed.progress.turn} 轮 · {observed.progress.toolCalls} 次工具调用</p>}
          <details><summary>执行内容</summary><dl><dt>节点实例</dt><dd>{node.siteId}@{node.ordinal}</dd><dt>动作类型</dt><dd>{workflowNodeLabel(node.kind)}</dd></dl>{node.input && <pre>{workflowValue(node.input)}</pre>}{node.result !== undefined && <div className="mira-workflow-task-result"><strong>任务结果</strong><pre>{workflowValue(node.result)}</pre></div>}{node.kind === 'ask' && node.stats && <p className="mira-workflow-muted">已记录用量：{node.stats.tokens.toLocaleString()} tokens · {node.stats.toolCalls} 次工具调用</p>}</details>
          {node.error && <pre className={observed.status === 'stopped' ? 'mira-workflow-muted' : 'mira-automation-error'}>{workflowValue(node.error)}</pre>}
        </li>})}</ol>{!snapshot.nodes.length && <p className="mira-workflow-muted">尚无执行节点</p>}
      </section>
      </details>
      <details className="mira-workflow-run__source"><summary>运行来源与代码</summary><dl><dt>运行实例</dt><dd>{identity.runId}</dd><dt>所属会话</dt><dd>{identity.sessionId}</dd></dl><p className="mira-workflow-muted">{run.cwd}</p><pre>{workflowValue(run.args ?? {})}</pre><pre>{workflowValue(run.scriptText)}</pre></details>
      <details className="mira-workflow-run__journal"><summary>事件日志 · {events.length}{events.length === 500 ? '（当前读取窗口，最多 500 条）' : ''}</summary>{(more || events[0]?.sequence > 0) && <p className="mira-workflow-muted">当前只显示已读取的事件窗口，任务指令或进度可能不完整。</p>}<ol className="mira-workflow-events">{events.map(item => <li key={item.sequence}><small>#{item.sequence}{item.timeCreated ? ` · ${new Date(item.timeCreated).toLocaleTimeString()}` : ''}</small><span>{workflowEventLine(item)}</span></li>)}</ol>{more && <button type="button" className="mira-automation-secondary" disabled={loading} onClick={refresh}>加载后续事件</button>}</details>
      </div>
      <MiraWorkflowArtifacts host={host} identity={identity} artifacts={artifacts} active={active} onOpen={onOpenArtifact} section />
    </>}
  </section>
}
