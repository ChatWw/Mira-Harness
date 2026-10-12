import type { AnalyzeResult } from '../../../packages/mira-flow-kit/src/analysis/mira-analyze'
import type { MiraFlowReviewGraph } from '../../../src/config/miraFlowReview'

/** Project all three analysis views together; never infer execution order from source order. */
export function projectMiraFlowReview(analysis: AnalyzeResult): MiraFlowReviewGraph {
  const causality = analysis.causality!, flow = analysis.flow!, handoff = analysis.handoff!
  let truncated = false
  const bound = <T>(items: T[], limit: number): T[] => {
    if (items.length > limit) truncated = true
    return items.slice(0, limit)
  }
  const label = (text: string) => {
    if (text.length > 512) { truncated = true; return text.slice(0, 511) + '…' }
    return text
  }
  const phaseSource: { id: string; name?: string; alongside?: string[]; loc?: { line: number } }[] = flow.phases ?? causality.phases ?? [{ id: 'unphased' }]
  const phases = bound(phaseSource, 64).map(phase => ({ id: phase.id, name: label(phase.name ?? '未分阶段'), ...(phase.alongside ? { alongside: [...phase.alongside] } : {}), ...(phase.loc ? { line: phase.loc.line } : {}) }))
  const phaseIds = new Set(phases.map(phase => phase.id))
  for (const phase of phases) if (phase.alongside) phase.alongside = phase.alongside.filter(id => phaseIds.has(id))
  const steps = bound(causality.steps, 256).filter(step => phaseIds.has(step.phase ?? 'unphased')).map(step => ({ id: step.id, label: label(step.label), phase: step.phase ?? 'unphased', lane: step.lane, kind: step.kind, line: step.loc.line, certainty: step.certainty, ...(step.source ? { source: step.source } : {}), ...(step.repeat ? { repeat: step.repeat } : {}) }))
  const stepIds = new Set(steps.map(step => step.id))
  const lanes = new Map(causality.lanes.map(lane => [lane.id, lane]))
  const participants = bound(handoff.participants, 128).filter(actor => phaseIds.has(actor.phase) && actor.steps.some(id => stepIds.has(id))).map(actor => {
    const lane = lanes.get(actor.lane)
    const name = lane?.name ?? (lane?.namePattern ? `${lane.namePattern.head ?? ''}…${lane.namePattern.tail ?? ''}` : actor.lane === 'workspace' ? '工作区' : '未解析智能体')
    return { ...actor, name: label(name), steps: actor.steps.filter(id => stepIds.has(id)), ...(lane && actor.lane !== 'workspace' && actor.lane !== 'unknown' ? { actorSiteId: lane.id } : {}) }
  })
  const participantIds = new Set(participants.map(actor => actor.id))
  const handoffs = bound(handoff.handoffs.filter(edge => participantIds.has(edge.from) && participantIds.has(edge.to)), 256).map(edge => ({ ...edge, ...(edge.types ? { types: bound(edge.types, 16).map(label) } : {}) }))
  const phaseEdges = bound((flow.phaseEdges ?? []).filter(edge => phaseIds.has(edge.from) && phaseIds.has(edge.to)), 256).map(edge => ({ from: edge.from, to: edge.to, kind: edge.kind }))
  return { phases, steps, participants, handoffs, phaseEdges, truncated }
}
