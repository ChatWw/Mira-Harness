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
function miraTimelineLayout(graph: MiraFlowReviewGraph) {
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
  const bands = merged.map(span => {
    const rows: number[][] = []
    for (let i = span.from; i <= span.to; i++) {
      let track = rows.findIndex(members => !members.some(member => near[i]!.has(member)))
      if (track < 0) { track = rows.length; rows.push([]) }
      rows[track]!.push(i); tracks[i] = track
    }
    return { ...span, tracks: rows }
  }).filter(band => band.tracks.length > 1)
  return { tracks, bands }
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
  const { tracks } = miraTimelineLayout(graph)
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

/** ZCode projection: dedupe phase pairs, absorb band edges, then allocate only remaining arcs. */
export function miraWorkflowTimelineGeometry(graph: MiraFlowReviewGraph, stations: readonly MiraTimelineStation[]) {
  const index = new Map(stations.map((station, i) => [station.phase.id, i]))
  const seen = new Set<string>()
  const edges = graph.phaseEdges.flatMap(edge => {
    const from = index.get(edge.from), to = index.get(edge.to), key = `${from}>${to}`
    if (from === undefined || to === undefined || from === to || seen.has(key)) return []
    seen.add(key)
    return [{ from, to, edge }]
  })
  const { bands: folded } = miraTimelineLayout(graph)
  const bandOf = (i: number) => folded.find(band => band.from <= i && i <= band.to)
  const bands = folded.map(band => ({ ...band,
    pred: band.from > 0 && !bandOf(band.from - 1) && edges.some(edge => edge.from === band.from - 1 && bandOf(edge.to) === band) ? band.from - 1 : undefined,
    join: band.to + 1 < stations.length && !bandOf(band.to + 1) && edges.some(edge => edge.to === band.to + 1 && bandOf(edge.from) === band) ? band.to + 1 : undefined,
  }))
  type Connection = { from: number; to: number; edge: MiraFlowReviewGraph['phaseEdges'][number]; kind: 'rail' | 'arc'; lane?: number; inTrack?: boolean }
  const rails: Connection[] = [], arcs: Connection[] = []
  function rail(from: number, to: number, kind = 'next') {
    rails.push({ from, to, kind: 'rail', edge: { from: stations[from]!.phase.id, to: stations[to]!.phase.id, kind } })
  }
  for (const band of bands) band.tracks.forEach((members, track) => {
    for (let k = 1; k < members.length; k++) rail(members[k - 1]!, members[k]!)
    if (band.pred !== undefined) rail(band.pred, members[0]!, track ? 'fork' : 'next')
    if (band.join !== undefined) rail(members[members.length - 1]!, band.join, track ? 'join' : 'next')
  })
  for (const connection of edges) {
    const { from, to } = connection, source = bandOf(from), target = bandOf(to)
    if (!source && !target) {
      if (to === from + 1) rails.push({ ...connection, kind: 'rail' })
      else arcs.push({ ...connection, kind: 'arc' })
      continue
    }
    if (source && source === target) {
      if (stations[from]!.track !== stations[to]!.track) {
        if (to < from) arcs.push({ ...connection, from: source.to, to: source.from, kind: 'arc' })
      } else {
        const members = source.tracks[stations[from]!.track]!
        if (members[members.indexOf(from) + 1] !== to) arcs.push({ ...connection, kind: 'arc', inTrack: true })
      }
      continue
    }
    if ((source && !target && to === source.to + 1) || (!source && target && from === target.from - 1)) continue
    const projected = { ...connection, from: source?.to ?? from, to: target?.from ?? to }
    if (source && target && source.to + 1 === target.from) rails.push({ ...projected, kind: 'rail' })
    else arcs.push({ ...projected, kind: 'arc' })
  }
  const unique = (connections: Connection[]) => {
    const pairs = new Set<string>()
    return connections.filter(({ from, to }) => {
      const key = `${from}>${to}`
      if (from === to || pairs.has(key)) return false
      pairs.add(key); return true
    })
  }
  const lanes: { start: number; end: number; lane: number }[] = []
  const placed = unique(arcs).sort((a, b) => Math.abs(a.from - a.to) - Math.abs(b.from - b.to)).map(connection => {
    const start = Math.min(connection.from, connection.to), end = Math.max(connection.from, connection.to)
    let lane = 0
    while (lanes.some(item => item.lane === lane && start <= item.end && end >= item.start)) lane++
    lanes.push({ start, end, lane })
    return { ...connection, lane }
  })
  // Separate arc terminals at a shared lamp, as in ZCode's 10px terminal spacing.
  const terminals = new Map<number, { arc: number; end: 'start' | 'end'; side: number; lane: number }[]>()
  placed.forEach((arc, i) => {
    for (const end of ['start', 'end'] as const) {
      const station = end === 'start' ? arc.from : arc.to
      if (bandOf(station) && !arc.inTrack) continue
      const list = terminals.get(station) ?? []
      list.push({ arc: i, end, side: (end === 'start' ? arc.to > arc.from : arc.from > arc.to) ? 1 : -1, lane: arc.lane })
      terminals.set(station, list)
    }
  })
  const offsets = placed.map(() => ({ start: 0, end: 0 }))
  for (const list of terminals.values()) {
    list.sort((a, b) => a.side - b.side || (a.side < 0 ? a.lane - b.lane : b.lane - a.lane))
    list.forEach((terminal, i) => { offsets[terminal.arc]![terminal.end] = (i - (list.length - 1) / 2) * 10 })
  }
  const maxTrack = Math.max(0, ...stations.map(station => station.track))
  const airHeight = lanes.length ? 26 + Math.max(...lanes.map(item => item.lane)) * 14 : 0
  const mainY = airHeight + maxTrack * 24 + 12
  const y = (i: number) => mainY - stations[i]!.track * 24
  const x = (i: number) => i * MIRA_PHASE_PITCH + 17
  const forkX = (band: typeof bands[number]) => band.from === 0 ? 4 : band.from * MIRA_PHASE_PITCH - 16
  const mergeX = (band: typeof bands[number]) => band.join === undefined ? band.to * MIRA_PHASE_PITCH + MIRA_PHASE_WIDTH + 6 : band.join * MIRA_PHASE_PITCH - 10
  const forkPath = (band: typeof bands[number], head: number) => {
    const xf = forkX(band) - 8 * (stations[head]!.track - 1), yt = y(head)
    return `M ${xf} ${mainY} Q ${xf + 8} ${mainY} ${xf + 8} ${mainY - 8} V ${yt + 8} Q ${xf + 8} ${yt} ${xf + 16} ${yt} H ${x(head) - 8}`
  }
  const mergePath = (band: typeof bands[number], tail: number) => {
    const xm = mergeX(band) - 8 * (band.tracks.length - 1 - stations[tail]!.track), yt = y(tail)
    return `M ${x(tail) + 8} ${yt} H ${xm - 8} Q ${xm} ${yt} ${xm} ${yt + 8} V ${mainY - 8} Q ${xm} ${mainY} ${xm + 8} ${mainY}`
  }
  const uniqueRails = unique(rails)
  const paths = [...uniqueRails, ...placed].map((connection, id) => {
    const { from, to, edge, lane } = connection
    const source = bands.find(band => band.from <= from && from <= band.to), target = bands.find(band => band.from <= to && to <= band.to)
    let d: string
    if (lane !== undefined) {
      const inTrack = connection.inTrack
      const offset = offsets[id - uniqueRails.length]!
      const start = source && !inTrack ? mergeX(source) : x(from) + offset.start, end = target && !inTrack ? forkX(target) : x(to) + offset.end
      const fromY = source && !inTrack ? mainY : y(from), toY = target && !inTrack ? mainY : y(to)
      const top = mainY - maxTrack * 24 - 26 - lane * 14, direction = end > start ? 1 : -1
      d = `M ${start} ${fromY - 8} V ${top + 8} Q ${start} ${top} ${start + direction * 8} ${top} H ${end - direction * 8} Q ${end} ${top} ${end} ${top + 8} V ${toY - 8}`
    } else if (edge.kind === 'fork' && target) d = forkPath(target, to)
    else if (edge.kind === 'join' && source) d = mergePath(source, from)
    else if (source && target && source !== target) d = `M ${mergeX(source)} ${mainY} H ${forkX(target)}`
    else d = `M ${x(from) + (bands.length ? 8 : MIRA_PHASE_WIDTH - 17)} ${y(from)} H ${x(to) - 8}`
    return { ...connection, id, d, edge: { ...edge, from: stations[from]!.phase.id, to: stations[to]!.phase.id }, back: to < from }
  })
  // Bands without an outside predecessor/join still need a shared fork and merge, not pairwise edges.
  const supports = bands.flatMap(band => band.tracks.flatMap((members, track) => {
    const head = members[0]!, tail = members[members.length - 1]!
    return [
      ...(band.pred === undefined ? [track ? forkPath(band, head) : `M ${forkX(band)} ${mainY} H ${x(head) - 8}`] : []),
      ...(band.join === undefined ? [track ? mergePath(band, tail) : `M ${x(tail) + 8} ${mainY} H ${mergeX(band) + 6}`] : []),
    ]
  }))
  const tailWidth = bands.some(band => band.to === stations.length - 1 && band.join === undefined) ? 12 : 0
  return { width: stations.length ? (stations.length - 1) * MIRA_PHASE_PITCH + MIRA_PHASE_WIDTH + tailWidth : 0, mainY, y, captionY: mainY + (bands.length ? 24 : 0), pillsTop: mainY + (bands.length ? 48 : 24), paths, supports }
}
