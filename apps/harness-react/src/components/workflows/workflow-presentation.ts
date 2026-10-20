import type { ArtifactVersionRecord, NodeRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowRunPresentation } from '../../../../../src/config/miraFlowWorkbench'

export function workflowArtifacts(nodes: readonly NodeRecord[]): ArtifactVersionRecord[] {
  const latest = new Map<string, ArtifactVersionRecord>()
  for (const node of nodes) {
    if (node.kind !== 'artifact' || node.status !== 'completed' || !node.result || typeof node.result !== 'object') continue
    const artifact = node.result as ArtifactVersionRecord
    if (artifact.id && artifact.version > (latest.get(artifact.id)?.version ?? 0)) latest.set(artifact.id, artifact)
  }
  return [...latest.values()].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
}
export function workflowDuration(presentation?: MiraFlowRunPresentation): string {
  if (presentation?.startedAt === undefined || presentation.endedAt === undefined) return '—'
  const seconds = Math.max(0, Math.round((presentation.endedAt - presentation.startedAt) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}
export function workflowTokens(value: number): string {
  return value < 1_000 ? value.toLocaleString() : value < 1_000_000 ? `${(value / 1_000).toFixed(1)}k` : `${(value / 1_000_000).toFixed(2)}M`
}
export function workflowArtifactKind(artifact: ArtifactVersionRecord): string {
  if (artifact.kind === 'markdown' || artifact.contentType === 'text/markdown') return '文档'
  return artifact.kind === 'file' ? '文件' : '看板'
}
