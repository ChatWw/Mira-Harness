import type { MiraWorkflowMeta, MiraWorkflowPreview } from './miraWorkflows'

/** Bounded, compiler-derived presentation data. No executable crosses the UI bridge. */
export interface MiraFlowReviewGraph {
  phases: { id: string; name: string; alongside?: string[]; line?: number }[]
  participants: { id: string; phase: string; lane: string; name: string; steps: string[]; actorSiteId?: string; many?: true; member?: { index: number; of: number } }[]
  handoffs: { from: string; to: string; back?: true; types?: string[] }[]
  phaseEdges: { from: string; to: string; kind: string }[]
  steps: { id: string; label: string; lane: string; phase: string; source?: string; kind?: 'ask' | 'world-read'; line?: number; certainty?: 'always' | 'maybe'; repeat?: 'stack' | 'serial' }[]
  truncated: boolean
}

export interface MiraFlowReview {
  action: 'run' | 'save'
  name: string
  source: string
  sourceHash: string
  commands: string[]
  graph: MiraFlowReviewGraph
  args?: Record<string, unknown>
  maxConcurrency?: number
  model?: string
  scope?: 'global' | 'project'
  overwrite?: boolean
  meta?: MiraWorkflowMeta
  shadowing?: MiraWorkflowPreview['shadowing']
}
