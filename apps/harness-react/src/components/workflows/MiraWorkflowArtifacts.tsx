/* Artifact row and gallery adapted from ZCode WorkflowArtifactRow/Tile and WorkflowRunArtifactsSection.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import { ArrowUpRight, ChevronDown, FileText } from 'lucide-react'
import type { ArtifactVersionRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import type { MiraWorkflowHost } from './workflow-model'
import { MiraWorkflowArtifactPreview } from './MiraWorkflowArtifactPreview'
import { workflowArtifactKind } from './workflow-presentation'

export function MiraWorkflowArtifactChip({ artifact, onOpen }: { artifact: ArtifactVersionRecord; onOpen?: (artifact: ArtifactVersionRecord) => void }) {
  return <button type="button" className="mira-workflow-artifact-chip" disabled={!onOpen} onClick={() => onOpen?.(artifact)} title={artifact.title || artifact.id}><FileText size={13} aria-hidden="true" /><span>{artifact.title || artifact.id}</span></button>
}
export function MiraWorkflowArtifacts({ host, identity, artifacts, active, onOpen, section = false }: { host: MiraWorkflowHost; identity: MiraFlowRunIdentity; artifacts: ArtifactVersionRecord[]; active: boolean; onOpen?: (artifact: ArtifactVersionRecord) => void; section?: boolean }) {
  if (!artifacts.length) return null
  const primary = artifacts.find(artifact => artifact.primary) ?? (artifacts.length === 1 ? artifacts[0] : undefined)
  const content = <div className={`mira-workflow-artifact-list${primary ? ' mira-workflow-artifact-list--primary' : ''}`}>{(primary ? [primary] : artifacts).map(artifact => <div className="mira-workflow-artifact-row" key={artifact.id}>
    <MiraWorkflowArtifactPreview host={host} identity={identity} artifact={artifact} active={active} mode="thumbnail" />
    <button type="button" className="mira-workflow-artifact-row__open" disabled={!onOpen} onClick={() => onOpen?.(artifact)} title={artifact.sourcePath || artifact.title || artifact.id}>
      <strong><FileText size={15} aria-hidden="true" /><span>{artifact.title || artifact.id}</span><ArrowUpRight size={14} className="mira-workflow-artifact-row__arrow" aria-hidden="true" /></strong>
      {artifact.description && <p>{artifact.description}</p>}{artifact.kind !== 'file' && artifact.kind !== 'markdown' && <p>预置看板数据，没有发布的文件内容</p>}
      <small>{workflowArtifactKind(artifact)}{artifact.bytes !== undefined ? ` · ${(artifact.bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB` : ''}{artifact.version > 1 ? ` · 第 ${artifact.version} 版` : ''}</small>
    </button>
  </div>)}{primary && artifacts.filter(artifact => artifact !== primary).map(artifact => <MiraWorkflowArtifactChip key={artifact.id} artifact={artifact} onOpen={onOpen} />)}</div>
  return section ? <details className="mira-workflow-run__artifacts" open><summary>产物 <small>{artifacts.length}</small><ChevronDown size={14} /></summary>{content}</details> : content
}
