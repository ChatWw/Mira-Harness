export type MiraHarnessControlAction = 'toggle-sidebar' | 'new-task'
export interface MiraHarnessControlsState { type: 'mira:harness-controls-state'; sidebarOpen: boolean }
export interface MiraHarnessControlCommand { type: 'mira:harness-control'; action: MiraHarnessControlAction }

export function readMiraHarnessControlsState(value: unknown): MiraHarnessControlsState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const data = value as Record<string, unknown>
  if (Object.keys(data).length === 2 && data.type === 'mira:harness-controls-state' && typeof data.sidebarOpen === 'boolean') return data as unknown as MiraHarnessControlsState
}
export function readMiraHarnessControlCommand(value: unknown): MiraHarnessControlCommand | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const data = value as Record<string, unknown>
  if (Object.keys(data).length === 2 && data.type === 'mira:harness-control' && (data.action === 'toggle-sidebar' || data.action === 'new-task')) return data as unknown as MiraHarnessControlCommand
}
