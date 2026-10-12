import type { HarnessSubtaskRole, ModelSelection } from './harness'

export type MiraAgentModelTarget = { kind: 'builtin'; name: HarnessSubtaskRole } | { kind: 'plugin'; pluginId: string; name: string }
export interface MiraAgentModelSetting {
  target: MiraAgentModelTarget
  modelSelection?: ModelSelection
  unavailableReason?: string
}
