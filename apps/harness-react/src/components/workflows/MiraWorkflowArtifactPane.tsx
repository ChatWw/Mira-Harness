import { MiraWorkflowArtifactPreview } from './MiraWorkflowArtifactPreview'
import { useMiraWorkflowSnapshot } from './useMiraWorkflowSnapshot'
import { workflowArtifacts } from './workflow-presentation'
import type { MiraWorkflowHost } from './workflow-model'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'

export function MiraWorkflowArtifactPane({ host, identity, artifactId, version, active }: { host: MiraWorkflowHost; identity: MiraFlowRunIdentity; artifactId: string; version: number; active: boolean }) {
  const { snapshot, error, loading, refresh } = useMiraWorkflowSnapshot(host, identity, active)
  const artifact = snapshot && workflowArtifacts(snapshot.nodes.filter(node => (node.result as { version?: number } | undefined)?.version === version)).find(item => item.id === artifactId)
  return <section className="mira-workflow-artifact-pane" aria-label="工作流产物详情">
    {loading && !snapshot && <p role="status">正在读取产物…</p>}
    {error && <p role="alert">{error}<button type="button" onClick={refresh}>重试</button></p>}
    {artifact && <MiraWorkflowArtifactPreview host={host} identity={identity} artifact={artifact} active={active} mode="detail" />}
    {snapshot && !artifact && <p role="status">此发布版本不可用，请从运行详情重新打开。</p>}
  </section>
}
