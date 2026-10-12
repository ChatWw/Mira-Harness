export const MIRA_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'] as const
export type MiraHookEvent = typeof MIRA_HOOK_EVENTS[number]
export type MiraHookType = 'command' | 'process'
export type MiraHookScope = 'global' | 'project' | 'plugin'
export type MiraHookEditableScope = Exclude<MiraHookScope, 'plugin'>
export const MIRA_HOOK_DEFAULT_TIMEOUT = 60
export const MIRA_HOOK_EVENT_LABELS: Record<MiraHookEvent, string> = {
  SessionStart: '会话开始', UserPromptSubmit: '提交消息', PreToolUse: '工具调用前', PermissionRequest: '权限请求',
  PostToolUse: '工具调用后', PostToolUseFailure: '工具调用失败', Stop: '回复结束',
}

export interface MiraHookConfig {
  name: string
  event: MiraHookEvent
  type: MiraHookType
  command: string
  args?: string[]
  async?: boolean
  shell?: true | string
  statusMessage?: string
  /** Seconds, 1–600; omitted means 60. */
  timeout?: number
  custom?: Record<string, unknown>
  matcher?: string
  enabled?: boolean
}
export interface MiraHookItem extends MiraHookConfig {
  id: string
  scope: MiraHookScope
  revision: string
  createdAt: number
  updatedAt: number
  enabled: boolean
  args: string[]
  async: boolean
  timeout: number
  trusted: boolean
  sourceRoot: string
  sourcePath: string
  pluginId?: string
  pluginName?: string
  pluginDataPath?: string
  unavailableReason?: string
}
export interface MiraHookWrite extends MiraHookConfig { scope: MiraHookEditableScope; id?: string; expectedRevision?: string }
export interface MiraHookDelete { scope: MiraHookEditableScope; id: string; expectedRevision: string }
export interface MiraPluginHookTrust { scope: 'plugin'; pluginId: string; id: string; expectedRevision: string }
export type MiraHookTrust = MiraHookDelete | MiraPluginHookTrust
export interface MiraHookEnabled extends MiraHookDelete { enabled: boolean }
