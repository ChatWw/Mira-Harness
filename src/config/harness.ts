export type PermissionMode = 'default' | 'auto-approve' | 'full'
export type HarnessSessionStatus = 'active' | 'completed' | 'failed'

export interface HarnessMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface ToolCallRecord {
  id: string
  tool: string
  target?: string
  status: 'running' | 'ok' | 'failed' | 'waiting-confirm'
  diff?: string
  error?: string
  createdAt: number
  completedAt?: number
}

export interface HarnessSession {
  version: 1
  id: string
  title: string
  projectId?: string
  workingDirectory?: string
  modelProviderId?: string
  modelId?: string
  permissionMode: PermissionMode
  messages: HarnessMessage[]
  toolCalls: ToolCallRecord[]
  createdAt: number
  updatedAt: number
  status: HarnessSessionStatus
}

export interface HarnessSessionSummary extends Pick<HarnessSession, 'id' | 'title' | 'projectId' | 'modelProviderId' | 'modelId' | 'permissionMode' | 'createdAt' | 'updatedAt' | 'status'> {
  projectName?: string
  workingDirectory?: string
}

export interface HarnessProject {
  id: string
  name: string
  icon: string
  directory: string
  createdAt: number
  updatedAt: number
  lastSessionAt?: number
  defaultModelProviderId?: string
  sessionCount: number
}

export interface HarnessProjectCreateInput {
  directory?: string
  name?: string
  icon?: string
}

export const PROJECT_ICON_OPTIONS = ['FolderOpened', 'Collection', 'Files', 'Monitor', 'Document', 'Box'] as const
export const DEFAULT_PROJECT_ICON = PROJECT_ICON_OPTIONS[0]

export interface HarnessEvent {
  sessionId: string
  type: 'message-delta' | 'message-complete' | 'tool-call' | 'status' | 'error'
  payload: Record<string, unknown>
}

export interface ModelProviderInput {
  id?: string
  name: string
  endpoint: string
  apiKey?: string
  models: string[]
  enabled: boolean
}

export interface ModelProviderSummary {
  id: string
  name: string
  endpoint: string
  models: string[]
  enabled: boolean
  hasApiKey: boolean
  createdAt: number
  updatedAt: number
}

export interface ModelRoleBinding {
  agentDefault?: { providerId: string, modelId: string }
  novelAuthoring?: { providerId: string, modelId: string }
  novelAutomation?: { providerId: string, modelId: string }
}

export interface PermissionConfig {
  globalDefaultMode: PermissionMode
  dangerousCommands: string[]
  trashRetentionDays: number
  trashDirName: string
}

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  globalDefaultMode: 'auto-approve',
  dangerousCommands: ['rm -rf /', 'rm -rf ~', 'sudo', 'mkfs', ' dd ', 'shutdown', 'reboot'],
  trashRetentionDays: 7,
  trashDirName: '.mira/trash',
}

export const MODEL_PROVIDER_PRESETS = [
  { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', models: ['deepseek-chat'] },
  { name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus'] },
  { name: '月之暗面', endpoint: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k'] },
]
