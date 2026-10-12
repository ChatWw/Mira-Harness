import { createHash } from 'node:crypto'
import { projectMiraFlowReview } from './miraFlowReviewGraph'
import type { MiraFlowReviewGraph } from '../../../src/config/miraFlowReview'
import {
  analyzeMiraFlowProgram, buildAskSpecs, collectSites, collectWorldRunCommands,
  createMiraFlowProgram, deriveActorSubmitProfiles, encodeAnalysisCore,
  lowerMiraFlow, synthesizeAskSchemas,
  type CompileDiagnostic, type AnalysisCoreJson, type SiteGraph,
  type AskSpec, type ActorSubmitProfile,
} from '../../../packages/mira-flow-kit/src/mira-index.js'

export type MiraFlowCompilation = {
  sourceHash: string
  diagnostics: CompileDiagnostic[]
  ok: boolean
  executable?: {
    code: string
    core: AnalysisCoreJson
    graph: SiteGraph
    reviewGraph: MiraFlowReviewGraph
    askSpecs: [string, AskSpec][]
    actorProfiles: [string, ActorSubmitProfile][]
    commands: string[]
  }
}

// The host accepts source only. Lowered code never comes from the renderer.
export function compileMiraFlow(source: string): MiraFlowCompilation {
  if (Buffer.byteLength(source, 'utf8') > 256 * 1024) throw new Error('工作流脚本超过 256 KiB')
  const sourceHash = createHash('sha256').update(source).digest('hex')
  const program = createMiraFlowProgram(source)
  const analysis = analyzeMiraFlowProgram(program)
  if (!analysis.ok || !analysis.core || !analysis.graph) {
    return { sourceHash, ok: false, diagnostics: analysis.diagnostics }
  }
  const sites = collectSites(program)
  const schemas = synthesizeAskSchemas(program, sites)
  if (schemas.diagnostics.length) return { sourceHash, ok: false, diagnostics: schemas.diagnostics }
  const askSpecs = buildAskSpecs(sites, schemas.schemas)
  return {
    sourceHash, ok: true, diagnostics: [],
    executable: {
      code: lowerMiraFlow(program, sites).code,
      core: encodeAnalysisCore(analysis.core), graph: analysis.graph,
      reviewGraph: projectMiraFlowReview(analysis),
      askSpecs: [...askSpecs],
      actorProfiles: [...deriveActorSubmitProfiles(analysis.graph, askSpecs)],
      commands: collectWorldRunCommands(program, sites).commands,
    },
  }
}
