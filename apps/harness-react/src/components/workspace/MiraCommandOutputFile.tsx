import type { PilotController } from '../../state/pilot-state'
import { FilePreviewPanel } from './FilePreviewPanel'

/** An opaque resource identity, never a project path or renderer-chosen file. */
export function MiraCommandOutputFile({ controller, sessionId, runId, toolId, active }: {
  controller: PilotController; sessionId: string; runId: string; toolId: string; active: boolean
}) {
  return <FilePreviewPanel controller={controller} sessionId={sessionId}
    path={`command-output:${JSON.stringify([runId, toolId])}.log`}
    commandOutput={{ runId, toolId }} active={active} />
}
