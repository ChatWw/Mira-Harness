/* Mira adaptation of ZCode WorkflowTimeline/WorkflowTimelineStation/WorkflowAgentPill.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Same phase-station/rail/pill composition, Mira journal identity and theme tokens.
 * See third-party-licenses/zcode/LICENSE and NOTICE.md. */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, ArrowUpRight, Bot, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleHelp, CircleX, LoaderCircle, PauseCircle, Repeat2, Terminal, X } from 'lucide-react'
import type { ActorRecord, NodeRecord, RunRecord, StoredEvent } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowReviewGraph } from '../../../../../src/config/miraFlowReview'
import { buildMiraWorkflowTimeline, MIRA_PHASE_PITCH, MIRA_PHASE_WIDTH, miraTimelineEdgeLabels, miraTimelineLabels, miraWorkflowTimelineGeometry, type MiraTimelineOperation, type MiraTimelinePill, type MiraTimelineStatus } from './mira-workflow-timeline-model'
import { workflowToolLabel, workflowValue } from './workflow-model'
import './workflow-timeline.css'

export interface MiraWorkflowTimelineSelection { kind: 'phase' | 'participant'; id: string; phaseId: string; actor?: ActorRecord }
export interface MiraWorkflowTimelineProps {
  graph: MiraFlowReviewGraph
  variant?: 'card' | 'pane'
  run?: RunRecord
  actors?: readonly ActorRecord[]
  nodes?: readonly NodeRecord[]
  events?: readonly StoredEvent[]
  eventsCurrent?: boolean
  onSelect?: (selection: MiraWorkflowTimelineSelection) => void
  onActor?: (actor: ActorRecord) => void
}
function MiraTimelineStatusMark({ status, label }: { status: MiraTimelineStatus; label?: string }) {
  const Icon = status === 'completed' ? CheckCircle2 : status === 'failed' ? CircleX : status === 'stopped' ? PauseCircle : ['executing', 'repairing'].includes(status) ? LoaderCircle : undefined
  return <span className="mira-flow-line__mark" role="img" aria-label={label ?? miraTimelineLabels[status]} data-line-state={status}>{Icon && <Icon size={14} aria-hidden="true" />}</span>
}
function MiraTimelineOperations({ operations, live }: { operations: MiraTimelineOperation[]; live: boolean }) {
  return <ol className="mira-flow-line__operations">{operations.map(operation => <li key={operation.step.id}>
    <div className="mira-flow-line__operation"><strong>{operation.step.label}</strong>{operation.step.line && <span>第 {operation.step.line} 行</span>}{live && <span data-line-state={operation.status}>{operation.label}</span>}</div>
    {(operation.step.certainty === 'maybe' || operation.step.repeat) && <p>{operation.step.certainty === 'maybe' ? '条件满足时执行' : ''}{operation.step.repeat ? `${operation.step.certainty === 'maybe' ? ' · ' : ''}${operation.step.repeat === 'stack' ? '可产生多个并行实例' : '可循环执行'}` : ''}</p>}
    {operation.instances.map(({ node, observed }) => <details key={`${node.siteId}@${node.ordinal}`}>
      <summary>第 {node.ordinal} 次 · {observed.label}</summary>
      {observed.instructions && <p>{observed.instructions}</p>}
      {node.input && <pre tabIndex={0} aria-label="实际工作区操作参数">{workflowValue(node.input)}</pre>}
      {observed.progress && <p>已完成 {observed.progress.turn} 轮 · {observed.progress.toolCalls} 次工具调用{observed.progress.lastTool ? ` · 最近观察：${workflowToolLabel(observed.progress.lastTool.name)}${observed.progress.lastTool.target ? ` · ${observed.progress.lastTool.target}` : ''}` : ''}</p>}
      {node.result !== undefined && <pre tabIndex={0} aria-label="实际操作结果">{workflowValue(node.result)}</pre>}
      {node.error && <p data-line-state={observed.status}>{node.error.message}</p>}
    </details>)}
  </li>)}</ol>
}

export function MiraWorkflowTimeline({ graph, variant = 'card', run, actors = [], nodes = [], events = [], eventsCurrent = true, onSelect, onActor }: MiraWorkflowTimelineProps) {
  const id = useId(), scroller = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(true)
  const [selection, setSelection] = useState<{ phaseId: string; pillKey?: string }>()
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(new Set())
  const stations = useMemo(() => buildMiraWorkflowTimeline(graph, run, nodes, events, actors, eventsCurrent), [graph, run, nodes, events, actors, eventsCurrent])
  const geometry = useMemo(() => miraWorkflowTimelineGeometry(graph, stations), [graph, stations])
  const selectedStation = stations.find(station => station.phase.id === selection?.phaseId)
  const selectedPill = selectedStation?.pills.find(pill => pill.key === selection?.pillKey)
  const runningKey = stations.filter(station => ['executing', 'waiting', 'repairing', 'dispatched', 'queued'].includes(station.status)).map(station => station.phase.id).join('\u0000')
  const [openPhases, setOpenPhases] = useState<ReadonlySet<string>>(() => new Set(runningKey ? runningKey.split('\u0000') : []))
  useEffect(() => { if (runningKey) setOpenPhases(current => new Set([...current, ...runningKey.split('\u0000')])) }, [runningKey])
  const select = (phaseId: string, pill?: MiraTimelinePill) => {
    setSelection(current => current?.phaseId === phaseId && current?.pillKey === pill?.key ? undefined : { phaseId, ...(pill ? { pillKey: pill.key } : {}) })
    onSelect?.({ kind: pill ? 'participant' : 'phase', id: pill?.participant.id ?? phaseId, phaseId, ...(pill?.actor ? { actor: pill.actor } : {}) })
  }
  const onRailKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' || !(event.target as HTMLElement).closest('.mira-flow-line__station-button')) return
    const element = scroller.current
    if (!element || element.scrollWidth <= element.clientWidth) return
    event.preventDefault()
    element.scrollLeft += event.key === 'ArrowLeft' ? -MIRA_PHASE_PITCH : MIRA_PHASE_PITCH
  }
  const displayCount = (station: typeof stations[number]) => showAll.has(station.phase.id) ? station.pills.length : Math.min(station.pills.length, 5)
  const height = geometry.pillsTop + Math.max(0, ...stations.map(station => (displayCount(station) + (station.pills.length > 5 && !showAll.has(station.phase.id) ? 1 : 0)) * 38)) + 8
  const selectedId = `${id}-operations`
  const phaseName = (phaseId: string) => graph.phases.find(phase => phase.id === phaseId)?.name ?? phaseId
  const participantName = (participantId: string) => graph.participants.find(participant => participant.id === participantId)?.name ?? participantId
  const renderPill = (pill: MiraTimelinePill, phaseId: string) => {
    const Icon = pill.participant.lane === 'workspace' ? Terminal : pill.participant.lane === 'unknown' ? CircleHelp : Bot
    return <button key={pill.key} type="button" className="mira-flow-line__pill" data-line-state={pill.status} data-line-participant={pill.participant.id} aria-label={`查看${pill.name}的操作 · ${pill.label}`} aria-expanded={selectedPill === pill} aria-controls={selectedId} title={`${pill.name} · ${pill.label}`} onClick={() => select(phaseId, pill)}>
      <Icon size={16} className="mira-flow-line__glyph" aria-hidden="true" /><span>{pill.name}{pill.participant.member ? ` · ${pill.participant.member.index + 1}/${pill.participant.member.of}` : !pill.actor && pill.participant.many ? ' · 多实例' : ''}</span><span className="mira-flow-line__tail"><MiraTimelineStatusMark status={pill.status} /><ArrowUpRight size={14} className="mira-flow-line__open" aria-hidden="true" /></span>
    </button>
  }
  return <div className={`mira-flow-line mira-flow-line--${variant}`}>
    <div className="mira-flow-line__header"><strong>执行结构</strong><span>{run ? '实际运行记录' : '编译分析'}</span><button type="button" aria-expanded={expanded} aria-controls={`${id}-timeline`} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}{expanded ? '收起' : '展开'}</button></div>
    {expanded && <div id={`${id}-timeline`}>
      {stations.length ? variant === 'pane' ? <ol className="mira-flow-line__spine" aria-label="工作流阶段时间线">{stations.map((station, index) => {
        const open = openPhases.has(station.phase.id), next = stations[index + 1]
        const edge = next ? graph.phaseEdges.find(candidate => candidate.from === station.phase.id && candidate.to === next.phase.id) : undefined
        return <li key={station.phase.id} className="mira-flow-line__spine-section" data-line-track={station.track} data-line-next={edge?.kind} style={{ paddingLeft: 24 + station.track * 12 }}>
          <span className="mira-flow-line__lamp" data-line-state={station.status} aria-hidden="true" style={{ left: 3 + station.track * 12, top: 11 }} />
          {edge && <svg className="mira-flow-line__spine-rail" style={{ width: 24 + Math.max(station.track, next!.track) * 12 }} viewBox={`0 0 ${24 + Math.max(station.track, next!.track) * 12} 100`} preserveAspectRatio="none" aria-hidden="true"><path d={station.track === next!.track ? `M ${8 + station.track * 12} 0 V 100` : `M ${8 + station.track * 12} 0 V 82 Q ${8 + station.track * 12} 90 ${8 + next!.track * 12} 90 V 100`} fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" /></svg>}
          <button type="button" className="mira-flow-line__phase-toggle" aria-expanded={open} aria-controls={`${id}-phase-${index}`} onClick={() => { setOpenPhases(current => { const value = new Set(current); if (value.has(station.phase.id)) value.delete(station.phase.id); else value.add(station.phase.id); return value }); onSelect?.({ kind: 'phase', id: station.phase.id, phaseId: station.phase.id }) }}>
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}<strong>{station.phase.name}</strong>{station.rounds > 1 && <small><Repeat2 size={11} aria-hidden="true" />{station.rounds}</small>}
          </button>
          <span className="mira-flow-line__phase-state">{station.label}</span>
          {!open && station.pills.length > 0 && <div className="mira-flow-line__roster" aria-label="阶段参与者">{station.pills.slice(0, 3).map(pill => <span key={pill.key} title={pill.name}>{pill.participant.lane === 'workspace' ? <Terminal size={12} aria-hidden="true" /> : <Bot size={12} aria-hidden="true" />}{pill.name}</span>)}{station.pills.length > 3 && <span>+{station.pills.length - 3}</span>}</div>}
          {open && <div id={`${id}-phase-${index}`} className="mira-flow-line__spine-pills">{station.pills.slice(0, displayCount(station)).map(pill => renderPill(pill, station.phase.id))}{station.pills.length > 5 && <button type="button" className="mira-flow-line__more" aria-expanded={showAll.has(station.phase.id)} onClick={() => setShowAll(current => { const value = new Set(current); if (value.has(station.phase.id)) value.delete(station.phase.id); else value.add(station.phase.id); return value })}>{showAll.has(station.phase.id) ? '收起参与者' : `还有 ${station.pills.length - 5} 个参与者`}</button>}{station.pills.length === 0 && <button type="button" className="mira-flow-line__more" onClick={() => select(station.phase.id)}>查看阶段操作</button>}</div>}
        </li>
      })}</ol> : <div className="mira-flow-line__scroller" ref={scroller} onKeyDown={onRailKey} aria-label="工作流阶段时间线">
        <div className="mira-flow-line__canvas" style={{ width: geometry.width, height }}>
          <svg className="mira-flow-line__tracks" width={geometry.width} height={geometry.pillsTop} aria-hidden="true">
            <defs><marker id={`${id}-arrow`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 6 3 L 0 6" fill="none" stroke="currentColor" /></marker></defs>
            {geometry.paths.map(path => <path key={path.id} d={path.d} fill="none" stroke="currentColor" strokeWidth="1" markerEnd={`url(#${id}-arrow)`} data-line-edge={path.edge.kind} data-line-from={path.edge.from} data-line-to={path.edge.to} data-line-back={path.back || undefined}><title>{phaseName(path.edge.from)} → {phaseName(path.edge.to)} · {miraTimelineEdgeLabels[path.edge.kind] ?? path.edge.kind}</title></path>)}
            {stations.filter(station => station.track > 0).map(station => { const index = stations.indexOf(station); return <path key={station.phase.id} d={`M ${index * MIRA_PHASE_PITCH + 17} ${geometry.y(index) + 8} V ${geometry.mainY + 12}`} stroke="currentColor" strokeDasharray="2 3" /> })}
          </svg>
          {stations.map((station, index) => <div key={station.phase.id}>
            <span className="mira-flow-line__lamp" data-line-state={station.status} title={station.label} style={{ left: index * MIRA_PHASE_PITCH + 12, top: geometry.y(index) - 5 }} aria-hidden="true" />
            <button type="button" className="mira-flow-line__station-button" style={{ left: index * MIRA_PHASE_PITCH + 12, top: geometry.mainY + 12, width: MIRA_PHASE_WIDTH - 12 }} aria-label={`查看阶段 ${station.phase.name} 的操作 · ${station.label}`} aria-expanded={selectedStation === station && !selectedPill} aria-controls={selectedId} onClick={() => select(station.phase.id)} data-line-state={station.status}>
              <span>{station.phase.name}</span>{station.rounds > 1 && <small><Repeat2 size={11} aria-hidden="true" />{station.rounds}</small>}
            </button>
            <div className="mira-flow-line__pills" style={{ left: index * MIRA_PHASE_PITCH, top: geometry.pillsTop, width: MIRA_PHASE_WIDTH }}>
              {station.pills.slice(0, displayCount(station)).map(pill => renderPill(pill, station.phase.id))}
              {station.pills.length > 5 && <button type="button" className="mira-flow-line__more" aria-expanded={showAll.has(station.phase.id)} onClick={() => setShowAll(current => { const next = new Set(current); if (next.has(station.phase.id)) next.delete(station.phase.id); else next.add(station.phase.id); return next })}>{showAll.has(station.phase.id) ? '收起参与者' : `还有 ${station.pills.length - 5} 个参与者`}</button>}
            </div>
          </div>)}
        </div>
      </div> : <p className="mira-flow-line__note">没有可呈现的编译阶段，请查看完整源码。</p>}
      <details className="mira-flow-line__relations"><summary>交接与执行关系{graph.handoffs.length + graph.phaseEdges.length > 0 ? ` · ${graph.handoffs.length + graph.phaseEdges.length}` : ''}</summary>
        {graph.phaseEdges.map((edge, index) => <p key={`phase-${index}`}><span>{phaseName(edge.from)}</span><ArrowRight size={12} aria-hidden="true" /><span>{phaseName(edge.to)}</span><small>{miraTimelineEdgeLabels[edge.kind] ?? edge.kind}</small></p>)}
        {graph.handoffs.map((edge, index) => <p key={`handoff-${index}`}><span>{participantName(edge.from)}</span><ArrowRight size={12} aria-hidden="true" /><span>{participantName(edge.to)}</span><small>{edge.back ? '循环交接' : '交接'}{edge.types?.length ? ` · ${edge.types.join('、')}` : ''}</small></p>)}
        {graph.phases.filter(phase => phase.alongside?.length).map(phase => <p key={phase.id}>{phase.name} · 可与 {phase.alongside!.map(phaseName).join('、')} 并行</p>)}
        {!graph.handoffs.length && !graph.phaseEdges.length && <p>编译分析未给出阶段或参与者之间的连接。</p>}
      </details>
      {selectedStation && <div id={selectedId} className="mira-flow-line__selection" role="region" aria-label={`${selectedPill?.name ?? selectedStation.phase.name}的操作`}>
        <div className="mira-flow-line__selection-head"><strong>{selectedPill?.name ?? selectedStation.phase.name}</strong><span>{selectedPill?.label ?? selectedStation.label}</span>{selectedPill?.actor && onActor && <button type="button" onClick={() => onActor(selectedPill.actor!)}><ArrowUpRight size={13} aria-hidden="true" />查看智能体记录</button>}<button type="button" aria-label="收起操作详情" onClick={() => setSelection(undefined)}><X size={14} aria-hidden="true" /></button></div>
        <MiraTimelineOperations operations={selectedPill?.operations ?? selectedStation.operations} live={Boolean(run)} />
        {(selectedPill?.operations ?? selectedStation.operations).length === 0 && <p className="mira-flow-line__note">该阶段没有编译操作；阶段标记本身不是一次任务。</p>}
        {selectedPill && graph.handoffs.filter(edge => edge.from === selectedPill.participant.id || edge.to === selectedPill.participant.id).map((edge, index) => <p className="mira-flow-line__handoff" key={index}>{participantName(edge.from)}<ArrowRight size={12} aria-hidden="true" />{participantName(edge.to)} · {edge.back ? '循环交接' : '交接'}{edge.types?.length ? ` · ${edge.types.join('、')}` : ''}</p>)}
      </div>}
      {!eventsCurrent && run && <p className="mira-flow-line__note" role="status">正在同步最新执行状态；未同步的事件不会作为当前运行状态。</p>}
      {graph.truncated && <p className="mira-flow-line__note" role="note">编译结构超出显示范围，只呈现部分阶段和操作；完整结构请查看源码。</p>}
    </div>}
  </div>
}
