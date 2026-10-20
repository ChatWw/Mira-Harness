import { ArrowUpRight, FileText, Workflow } from 'lucide-react'
import type { ToolCallRecord } from '../../../../../src/config/harness'
import type { MiraFlowRunIdentity } from '../../../../../src/config/miraFlowWorkbench'
import type { ArtifactVersionRecord, RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'

export function MiraWorkflowToolSummary({ tool, run, onOpen }: { tool: ToolCallRecord; run?: RunRecord & { presentation?: { artifacts: ArtifactVersionRecord[] } }; onOpen?: (identity: MiraFlowRunIdentity, artifact?: ArtifactVersionRecord) => void }) {
  const label = tool.status === 'failed' ? '工作流启动失败' : tool.status === 'cancelled' ? '工作流已取消' : run?.status === 'completed' ? '工作流已完成' : run?.status === 'errored' ? '工作流执行失败' : tool.status === 'ok' ? '工作流已启动' : '正在启动工作流'
  return <div className="mira-workflow-tool-summary" data-tool-call-id={tool.id}><Workflow size={15} aria-hidden="true" /><button type="button" disabled={!onOpen || !run?.parentSessionId} onClick={() => { if (run?.parentSessionId) onOpen?.({ sessionId: run.parentSessionId, runId: run.runId }) }}><span>{label}</span>{run?.name && <><i>·</i><span>{run.name}</span></>}{onOpen && run && <ArrowUpRight size={13} />}</button>{run?.presentation?.artifacts.map(artifact => <button type="button" key={artifact.id} disabled={!onOpen || !run.parentSessionId} onClick={() => { if (run.parentSessionId) onOpen?.({ sessionId: run.parentSessionId, runId: run.runId }, artifact) }}><i>·</i><FileText size={13} /><span>{artifact.title || artifact.id}</span></button>)}{tool.error && <span role="alert">{tool.error}</span>}</div>
}
