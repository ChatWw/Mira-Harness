import { useState } from 'react'
import { Check, Play } from 'lucide-react'
import type { MiraFlowRunIdentity, MiraFlowRunSnapshot } from '../../../../../src/config/miraFlowWorkbench'
import type { MiraWorkflowHost } from './workflow-model'
import { workflowError } from './workflow-model'

export function MiraWorkflowSavedRunActions({ host, snapshot, onOpen }: { host: MiraWorkflowHost; snapshot: MiraFlowRunSnapshot; onOpen?: (identity: MiraFlowRunIdentity) => void | Promise<void> }) {
  const saved = snapshot.presentation?.savedDefinition
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!saved) return null
  async function rerun() {
    if (busy || !saved?.projectId || !snapshot.selection) return
    setBusy(true); setError('')
    try {
      const identity = await host.requestWorkflow<MiraFlowRunIdentity>({ action: 'runs.start', projectId: saved.projectId, name: saved.name, scope: saved.scope, revision: saved.revision, args: snapshot.run.args, selection: snapshot.selection })
      await onOpen?.(identity)
    } catch (cause) { setError(workflowError(cause)) }
    finally { setBusy(false) }
  }
  return <div className="mira-workflow-saved-actions"><span><Check size={12} />已保存</span>{snapshot.run.status === 'completed' && <small className="mira-workflow-completed-label"><i className="mira-workflow-status-dot" data-status="completed" />已完成</small>}{!['pending', 'running'].includes(snapshot.run.status) && <button type="button" className="mira-automation-secondary" disabled={busy || !saved.projectId || !snapshot.selection} onClick={() => void rerun()}><Play size={13} />{busy ? '正在启动…' : '再次运行'}</button>}{error && <p className="mira-automation-error" role="alert">{error}</p>}</div>
}
