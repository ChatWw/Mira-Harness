export type PermissionMode = 'default' | 'auto-approve' | 'full'
export type HarnessSessionStatus = 'active' | 'completed' | 'failed'

export interface HarnessMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: HarnessMessageAttachment[]
  createdAt: number
}

export interface HarnessFileReference {
  path: string
  name: string
}

export interface HarnessMessageAttachment extends HarnessFileReference {
  content: string
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
  providerKey?: ModelProviderKey
  name: string
  endpoint: string
  apiKey?: string
  models: string[]
  enabled: boolean
}

export interface ModelProviderSummary {
  id: string
  providerKey: ModelProviderKey
  name: string
  endpoint: string
  models: string[]
  enabled: boolean
  hasApiKey: boolean
  createdAt: number
  updatedAt: number
}

export type ModelProviderKey = 'glm' | 'kimi' | 'minimax' | 'deepseek' | 'ollama' | 'custom'

export interface ModelSelection {
  providerId: string
  modelId: string
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
  { key: 'glm' as const, name: '智谱开放平台 / GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4.5', 'glm-4.5-air', 'glm-4.5-flash', 'glm-4-32b-0414-128k'] },
  { key: 'kimi' as const, name: 'Kimi 中国版', endpoint: 'https://api.moonshot.cn/v1', models: ['kimi-k3', 'kimi-k2.7', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5'] },
  { key: 'minimax' as const, name: 'MiniMax 中国版', endpoint: 'https://api.minimaxi.com/v1', models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] },
  { key: 'deepseek' as const, name: '深度求索 / DeepSeek', endpoint: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-reasoner', 'deepseek-chat'] },
  { key: 'ollama' as const, name: 'Ollama 本地', endpoint: 'http://127.0.0.1:11434/v1', models: ['qwen3', 'llama3.3', 'deepseek-r1', 'gemma3', 'mistral-small3.1'] },
  { key: 'custom' as const, name: '自定义 / Custom', endpoint: '', models: [''] },
]
