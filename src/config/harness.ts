export type PermissionMode = 'default' | 'auto-approve' | 'full'
export type HarnessSessionStatus = 'active' | 'completed' | 'failed'
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high'
export type SendShortcut = 'enter' | 'mod-enter'
export type AssistantTone = 'casual' | 'professional'

export const DEFAULT_ASSISTANT_TONE: AssistantTone = 'casual'

export function normalizeAssistantTone(value: unknown): AssistantTone {
  return value === 'professional' ? 'professional' : DEFAULT_ASSISTANT_TONE
}

export function shouldSendWithShortcut(shortcut: SendShortcut, event: Pick<KeyboardEvent, 'key' | 'keyCode' | 'isComposing' | 'metaKey' | 'ctrlKey' | 'shiftKey'>) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return false
  return shortcut === 'enter' ? !event.shiftKey : event.metaKey || event.ctrlKey
}

export const DEFAULT_CONTEXT_WINDOW = 256000
export const CONTEXT_COMPACTION_THRESHOLD = 0.8
export const OPEN_HARNESS_PROJECT_DIALOG_EVENT = 'mira:open-harness-project-dialog'

export function shouldAutoCompactContext(usedTokens: number, contextWindow: number) {
  return usedTokens >= contextWindow * CONTEXT_COMPACTION_THRESHOLD
}

export interface HarnessTokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
}

export interface HarnessContextUsage {
  usedTokens: number
  contextWindow: number
  source: 'reported' | 'estimated'
  updatedAt: number
}

export interface HarnessContextState {
  usage?: HarnessContextUsage
  summary?: string
  compactedThroughMessageId?: string
  compactedAt?: number
}

export interface HarnessRunActivity {
  id: string
  label: string
  detail?: string
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  completedAt?: number
}

export interface HarnessRunSummary {
  startedAt: number
  completedAt: number
  durationMs: number
  activities: HarnessRunActivity[]
  contextUsage?: HarnessContextUsage
}

export interface HarnessMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: HarnessMessageAttachment[]
  run?: HarnessRunSummary
  usage?: HarnessTokenUsage
  createdAt: number
  interrupted?: boolean
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
  pinned: boolean
  context?: HarnessContextState
}

export interface HarnessSessionSummary extends Pick<HarnessSession, 'id' | 'title' | 'projectId' | 'modelProviderId' | 'modelId' | 'permissionMode' | 'createdAt' | 'updatedAt' | 'status' | 'pinned'> {
  projectName?: string
  workingDirectory?: string
}

export interface HarnessProject {
  id: string
  name: string
  icon: string
  directory: string
  isGitRepository?: boolean
  gitBranch?: string
  createdAt: number
  updatedAt: number
  lastSessionAt?: number
  defaultModelProviderId?: string
  sessionCount: number
}

export interface HarnessGitBranch {
  name: string
  current: boolean
  uncommittedFileCount?: number
}

export interface HarnessGitConfig {
  branchPrefix: string
  pullRequestMergeMethod: 'merge' | 'squash'
  alwaysForcePush: boolean
  createDraftPullRequest: boolean
  reviewDelivery: 'inline' | 'separate'
  commitInstructions: string
  pullRequestInstructions: string
}

export const DEFAULT_HARNESS_GIT_CONFIG: HarnessGitConfig = {
  branchPrefix: 'mira/',
  pullRequestMergeMethod: 'merge',
  alwaysForcePush: false,
  createDraftPullRequest: true,
  reviewDelivery: 'inline',
  commitInstructions: '',
  pullRequestInstructions: '',
}

export interface HarnessProjectCreateInput {
  directory?: string
  name?: string
  icon?: string
}

export const DEFAULT_PROJECT_ICON = 'FolderOpened'

export function isProjectIcon(value?: string) {
  return typeof value === 'string' && (/^[A-Z][A-Za-z0-9]*$/.test(value) || /^(lucide|material-symbols|tabler):[a-z0-9-]+$/.test(value))
}

export interface HarnessEvent {
  sessionId: string
  type: 'run-start' | 'run-activity' | 'message-delta' | 'message-complete' | 'context-usage' | 'tool-call' | 'status' | 'error' | 'permission-request'
  payload: Record<string, unknown>
}

export interface ModelProviderInput {
  id?: string
  providerKey?: ModelProviderKey
  name: string
  endpoint: string
  apiKey?: string
  models: string[]
  reasoning?: boolean
  contextWindow?: number
  enabled: boolean
}

export interface ModelProviderSummary {
  id: string
  providerKey: ModelProviderKey
  name: string
  endpoint: string
  models: string[]
  reasoning: boolean
  contextWindow: number
  enabled: boolean
  hasApiKey: boolean
  createdAt: number
  updatedAt: number
}

export type ModelProviderKey = 'glm' | 'kimi' | 'minimax' | 'deepseek' | 'ollama' | 'custom'

export function inferModelReasoning(modelId: string) {
  const value = modelId.toLocaleLowerCase()
  return /(?:reasoner|(?:^|[-_/])r1(?:[-_/]|$)|qwq|thinking|(?:^|[-_/])o[134](?:[-_/]|$))/.test(value)
}

export interface ModelSelection {
  providerId: string
  modelId: string
  thinkingLevel?: ThinkingLevel
}

export interface ModelRoleBinding {
  agentDefault?: { providerId: string, modelId: string }
  novelAuthoring?: { providerId: string, modelId: string }
  novelAutomation?: { providerId: string, modelId: string }
}

export interface PermissionConfig {
  globalDefaultMode: PermissionMode
  autoApproveEnabled: boolean
  fullAccessEnabled: boolean
  dangerousCommands: string[]
  trashRetentionDays: number
  trashDirName: string
}

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  globalDefaultMode: 'default',
  autoApproveEnabled: true,
  fullAccessEnabled: true,
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
