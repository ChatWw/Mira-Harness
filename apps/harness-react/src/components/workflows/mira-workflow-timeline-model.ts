/* Adapted from ZCode workflow-timeline/{timeline-model,timeline-bands,timeline-geometry}.ts.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira names, bounded compiler graph and journal observations; see third-party-licenses/zcode/. */
import type { ActorRecord, NodeRecord, RunRecord, StoredEvent } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowReviewGraph } from '../../../../../src/config/miraFlowReview'
import { workflowNodeObservation, type MiraWorkflowNodeObservation } from './workflow-model'

export const MIRA_PHASE_WIDTH = 168
export const MIRA_PHASE_PITCH = 192
export type MiraTimelineStatus = MiraWorkflowNodeObservation['status'] | 'static' | 'unobserved' | 'entered'
export type MiraTimelineStep = MiraFlowReviewGraph['steps'][number]
export type MiraTimelineParticipant = MiraFlowReviewGraph['participants'][number]
export interface MiraTimelineOperation {
  step: MiraTimelineStep
  instances: { node: NodeRecord; observed: MiraWorkflowNodeObservation }[]
  status: MiraTimelineStatus
  label: string
}
export interface MiraTimelinePill {
  participant: MiraTimelineParticipant
  actor?: ActorRecord
  key: string
  name: string
  operations: MiraTimelineOperation[]
  status: MiraTimelineStatus
  label: string
}
export interface MiraTimelineStation {
  phase: MiraFlowReviewGraph['phases'][number]
  pills: MiraTimelinePill[]
  operations: MiraTimelineOperation[]
  status: MiraTimelineStatus
  label: string
  rounds: number
  track: number
}
export const miraTimelineLabels: Record<MiraTimelineStatus, string> = {
  static: '编译结构', unobserved: '未观察到运行', entered: '已进入', pending: '执行状态未记录',
  queued: '排队中', dispatched: '已派发', executing: '执行中', waiting: '等待中', repairing: '修正结果',
  completed: '已完成', failed: '失败', stopped: '已停止',
}
export const miraTimelineEdgeLabels: Record<string, string> = { branch: '条件分支', loop: '循环', fork: '并行分叉', join: '汇合', exit: '退出循环', jump: '跳转', throw: '异常', 'may-throw': '可能异常', next: '随后' }
const liveStates: MiraTimelineStatus[] = ['executing', 'waiting', 'repairing', 'dispatched', 'queued']
function collapseMiraTimelineStates(statuses: MiraTimelineStatus[], live: boolean): MiraTimelineStatus {
  if (!statuses.length) return live ? 'unobserved' : 'static'
  for (const state of liveStates) if (statuses.includes(state)) return state
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('stopped')) return 'stopped'
  if (statuses.includes('pending')) return 'pending'
  return 'completed'
}

/** Symmetric parallel membership and declaration-order track coloring, as in ZCode's bands. */
function miraTimelineTracks(graph: MiraFlowReviewGraph): number[] {
  const index = new Map(graph.phases.map((phase, i) => [phase.id, i]))
  const near = graph.phases.map(() => new Set<number>())
  graph.phases.forEach((phase, i) => phase.alongside?.forEach(id => {
    const other = index.get(id)
    if (other !== undefined && other !== i) { near[i]!.add(other); near[other]!.add(i) }
  }))
  const seen = new Set<number>(), spans: { from: number; to: number }[] = []
  near.forEach((neighbors, root) => {
    if (!neighbors.size || seen.has(root)) return
    const stack = [root], members: number[] = []
    seen.add(root)
    while (stack.length) {
      const current = stack.pop()!
      members.push(current)
      near[current]!.forEach(next => { if (!seen.has(next)) { seen.add(next); stack.push(next) } })
    }
    spans.push({ from: Math.min(...members), to: Math.max(...members) })
  })
  spans.sort((a, b) => a.from - b.from)
  const merged: typeof spans = []
  spans.forEach(span => {
    const last = merged[merged.length - 1]
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to)
    else merged.push({ ...span })
  })
  const tracks = graph.phases.map(() => 0)
  merged.forEach(span => {
    const rows: number[][] = []
    for (let i = span.from; i <= span.to; i++) {
      let track = rows.findIndex(members => !members.some(member => near[i]!.has(member)))
      if (track < 0) { track = rows.length; rows.push([]) }
      rows[track]!.push(i); tracks[i] = track
    }
  })
  return tracks
}

export function buildMiraWorkflowTimeline(graph: MiraFlowReviewGraph, run?: RunRecord, nodes: readonly NodeRecord[] = [], events: readonly StoredEvent[] = [], actors: readonly ActorRecord[] = [], eventsCurrent = true): MiraTimelineStation[] {
  const births = new Map<string, string>()
  for (const { event } of events) if ('instance' in event && 'phaseName' in event && event.phaseName !== undefined) births.set(`${event.instance.siteId}@${event.instance.ordinal}`, event.phaseName)
  const sourcePhases = new Map<string, Set<string>>()
  graph.steps.forEach(step => {
    const source = step.source ?? step.id
    if (!sourcePhases.has(source)) sourcePhases.set(source, new Set())
    sourcePhases.get(source)!.add(step.phase)
  })
  const tracks = miraTimelineTracks(graph)
  return graph.phases.map((phase, index) => {
    const operations = (participant?: MiraTimelineParticipant, actor?: ActorRecord): MiraTimelineOperation[] => graph.steps
      .filter(step => step.phase === phase.id && (!participant || participant.steps.includes(step.id)))
      .map(step => {
        const instances = run ? nodes.filter(node => {
          if (node.runId !== run.runId || node.siteId !== (step.source ?? step.id)) return false
          if (step.lane !== 'workspace' && step.lane !== 'unknown' && node.actorSiteId !== step.lane) return false
          if (actor && (node.actorSiteId !== actor.siteId || node.actorOrdinal !== actor.ordinal)) return false
          if (!actor && participant?.member && node.actorOrdinal !== participant.member.index + 1) return false
          const bornIn = births.get(`${node.siteId}@${node.ordinal}`)
          // Shared call sites need their actual birth stamp; guessing contaminates sibling phases.
          if (bornIn !== undefined) return phase.name === bornIn || phase.name.length > 128 && phase.name.slice(0, 128) === bornIn && graph.phases.filter(candidate => candidate.name.slice(0, 128) === bornIn).length === 1
          return (sourcePhases.get(step.source ?? step.id)?.size ?? 0) === 1
        }).map(node => ({ node, observed: workflowNodeObservation(run, node, events, eventsCurrent) })) : []
        const status = collapseMiraTimelineStates(instances.map(item => item.observed.status), Boolean(run))
        return { step, instances, status, label: miraTimelineLabels[status] }
      })
    const pills = graph.participants.filter(participant => participant.phase === phase.id).flatMap(participant => {
      const site = participant.actorSiteId ?? (participant.lane !== 'workspace' && participant.lane !== 'unknown' ? participant.lane : undefined)
      const matching = run && site ? actors.filter(actor => actor.runId === run.runId && actor.siteId === site && (!participant.member || actor.ordinal === participant.member.index + 1)) : []
      const slots: (ActorRecord | undefined)[] = matching.length ? matching : [undefined]
      return slots.map(actor => {
        const rows = operations(participant, actor)
        const status = collapseMiraTimelineStates(rows.flatMap(row => row.instances.map(item => item.observed.status)), Boolean(run))
        return { participant, actor, key: `${participant.id}:${actor?.ordinal ?? 'static'}`, name: actor?.name ?? participant.name, operations: rows, status, label: miraTimelineLabels[status] }
      })
    })
    const rows = operations()
    let status = collapseMiraTimelineStates(rows.flatMap(row => row.instances.map(item => item.observed.status)), Boolean(run))
    let rounds = 0
    for (const { event } of events) if (event.type === 'phase-entered' && event.name === phase.name) rounds = Math.max(rounds, event.ordinal)
    if (status === 'unobserved' && rounds > 0) status = 'entered'
    return { phase, pills, operations: rows, status, label: miraTimelineLabels[status], rounds, track: tracks[index]! }
  })
}

/** No declaration-order links: every rendered edge is backed by the compiled phase graph. */
export function miraWorkflowTimelineGeometry(graph: MiraFlowReviewGraph, stations: readonly MiraTimelineStation[]) {
  const index = new Map(stations.map((station, i) => [station.phase.id, i]))
  const maxTrack = Math.max(0, ...stations.map(station => station.track))
  const arcEdges = graph.phaseEdges.filter(edge => {
    const from = index.get(edge.from), to = index.get(edge.to)
    return from !== undefined && to !== undefined && (to <= from || to !== from + 1 && stations[from]!.track === stations[to]!.track)
  })
  const lanes: { start: number; end: number; lane: number }[] = []
  const laneByEdge = new Map<MiraFlowReviewGraph['phaseEdges'][number], number>()
  arcEdges.forEach(edge => {
    const from = index.get(edge.from)!, to = index.get(edge.to)!, start = Math.min(from, to), end = Math.max(from, to)
    let lane = 0
    while (lanes.some(item => item.lane === lane && start <= item.end && end >= item.start)) lane++
    lanes.push({ start, end, lane }); laneByEdge.set(edge, lane)
  })
  const airHeight = lanes.length ? 26 + Math.max(...lanes.map(item => item.lane)) * 14 : 0
  const mainY = airHeight + maxTrack * 24 + 12
  const y = (i: number) => mainY - stations[i]!.track * 24
  const x = (i: number) => i * MIRA_PHASE_PITCH + 17
  const paths = graph.phaseEdges.flatMap((edge, id) => {
    const from = index.get(edge.from), to = index.get(edge.to)
    if (from === undefined || to === undefined) return []
    const lane = laneByEdge.get(edge)
    let d: string
    if (lane !== undefined) {
      const top = Math.min(y(from), y(to)) - 26 - lane * 14
      if (from === to) d = `M ${x(from) + 5} ${y(from) - 8} V ${top + 8} Q ${x(from) + 5} ${top} ${x(from) + 13} ${top} H ${x(from) + 36} Q ${x(from) + 44} ${top} ${x(from) + 44} ${top + 8} V ${y(from)} H ${x(from) + 9}`
      else d = `M ${x(from)} ${y(from) - 8} V ${top + 8} Q ${x(from)} ${top} ${x(from) + (to > from ? 8 : -8)} ${top} H ${x(to) + (to > from ? -8 : 8)} Q ${x(to)} ${top} ${x(to)} ${top + 8} V ${y(to) - 8}`
    } else if (y(from) === y(to)) d = `M ${x(from) + 8} ${y(from)} H ${x(to) - 8}`
    else {
      const fork = x(from) + 34, join = x(to) - 34, middle = edge.kind === 'join' ? join : fork
      d = `M ${x(from) + 8} ${y(from)} H ${middle - 8} Q ${middle} ${y(from)} ${middle} ${y(from) + (y(to) > y(from) ? 8 : -8)} V ${y(to) + (y(to) > y(from) ? -8 : 8)} Q ${middle} ${y(to)} ${middle + 8} ${y(to)} H ${x(to) - 8}`
    }
    return [{ id, edge, from, to, d, back: to <= from || edge.kind === 'loop' }]
  })
  return { width: stations.length ? (stations.length - 1) * MIRA_PHASE_PITCH + MIRA_PHASE_WIDTH : 0, mainY, y, pillsTop: mainY + 36, paths }
}
