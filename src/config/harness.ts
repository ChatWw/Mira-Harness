export type PermissionMode = 'default' | 'auto-approve' | 'full'
export type HarnessSessionStatus = 'active' | 'completed' | 'failed'
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high'
export type SendShortcut = 'enter' | 'mod-enter'
export type AssistantTone = 'casual' | 'professional'

export interface MiraIdentity {
  userName: string
  assistantName: string
}

export const DEFAULT_ASSISTANT_TONE: AssistantTone = 'casual'
export const DEFAULT_MIRA_USER_NAME = '你'
export const DEFAULT_MIRA_NAME = 'Mira'

export function normalizeAssistantTone(value: unknown): AssistantTone {
  return value === 'professional' ? 'professional' : DEFAULT_ASSISTANT_TONE
}

export function normalizeMiraIdentityName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveMiraIdentity(identity?: Partial<MiraIdentity>): MiraIdentity {
  return {
    userName: normalizeMiraIdentityName(identity?.userName) || DEFAULT_MIRA_USER_NAME,
    assistantName: normalizeMiraIdentityName(identity?.assistantName) || DEFAULT_MIRA_NAME,
  }
}

export function shouldSendWithShortcut(shortcut: SendShortcut, event: Pick<KeyboardEvent, 'key' | 'keyCode' | 'isComposing' | 'metaKey' | 'ctrlKey' | 'shiftKey'>) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return false
  return shortcut === 'enter' ? !event.shiftKey : event.metaKey || event.ctrlKey
}

export const DEFAULT_CONTEXT_WINDOW = 256000
export const CONTEXT_COMPACTION_THRESHOLD = 0.8
export const OPEN_HARNESS_PROJECT_DIALOG_EVENT = 'mira:open-harness-project-dialog'

export interface HarnessProjectDialogRequest {
  project?: HarnessProject
  removeProjectId?: string
  onCreated?: (projectId: string) => void
  onUpdated?: () => void
  onRemoved?: () => void
}

export function shouldAutoCompactContext(usedTokens: number, contextWindow: number) {
  return usedTokens >= contextWindow * CONTEXT_COMPACTION_THRESHOLD
}

export interface HarnessTokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost?: HarnessUsageCost
}

export interface HarnessUsageCost {
  currency: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  priced: boolean
}

/** Prices are expressed in the configured currency per one million tokens. */
export interface ModelPricing {
  currency: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export const DEFAULT_MODEL_PRICING: ModelPricing = {
  currency: 'USD', input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
}

export interface ModelListResult {
  models: string[]
  error?: string
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

export interface HarnessFileChange {
  toolCallId: string
  tool: 'edit' | 'write' | 'delete'
  path: string
  diff?: string
}

export interface HarnessMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: HarnessMessageAttachment[]
  run?: HarnessRunSummary
  usage?: HarnessTokenUsage
  fileChanges?: HarnessFileChange[]
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
  archivedAt?: number
  context?: HarnessContextState
  activeSkillIds?: string[]
}

export interface HarnessSkill {
  id: string
  name: string
  description: string
  instructions: string
  path: string
  enabled: boolean
  valid: boolean
  error?: string
}

export interface HarnessSkillSettings {
  directories: string[]
}

export interface HarnessSessionSummary extends Pick<HarnessSession, 'id' | 'title' | 'projectId' | 'modelProviderId' | 'modelId' | 'permissionMode' | 'createdAt' | 'updatedAt' | 'status' | 'pinned'> {
  projectName?: string
  workingDirectory?: string
}

export type HarnessHistoryRange = 'all' | 'today' | 'week' | 'month'
export type HarnessHistorySort = 'updated-desc' | 'created-desc' | 'title-asc'
export type HarnessHistoryArchiveView = 'visible' | 'archived'

export interface HarnessHistoryQuery {
  q?: string
  projectIds?: string[]
  modelIds?: string[]
  statuses?: HarnessSessionStatus[]
  range?: HarnessHistoryRange
  sort?: HarnessHistorySort
  archiveView?: HarnessHistoryArchiveView
  page?: number
  pageSize?: number
}

export interface HarnessHistoryRow extends HarnessSessionSummary {
  archivedAt?: number
  projectIcon?: string
  providerKey?: ModelProviderKey
  preview?: string
}

export interface HarnessHistoryStats {
  total: number
  todayNew: number
  todayNewDelta: number
  activeCount: number
  activeStaleCount: number
  topModel?: { id: string, providerKey?: ModelProviderKey, count: number, ratio: number }
}

export interface HarnessHistoryFacets {
  projects: Array<{ id: string, name: string, icon: string }>
  models: Array<{ id: string, providerKey?: ModelProviderKey }>
}

export interface HarnessHistoryPage {
  rows: HarnessHistoryRow[]
  total: number
  page: number
  pageSize: number
  stats: HarnessHistoryStats
  facets: HarnessHistoryFacets
}

export interface HarnessProject {
  id: string
  name: string
  icon: string
  directory: string
  directoryExists: boolean
  isGitRepository?: boolean
  gitBranch?: string
  createdAt: number
  updatedAt: number
  lastSessionAt?: number
  defaultModelProviderId?: string
  sessionCount: number
}

export interface HarnessTrashEntry {
  token: string
  projectId: string
  projectName: string
  deletedAt: number
  paths: string[]
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
  pricing?: ModelPricing | null
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
  pricing?: ModelPricing
  enabled: boolean
  hasApiKey: boolean
  createdAt: number
  updatedAt: number
}

export interface HarnessUsageBucket {
  id: string
  label: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  costs: Record<string, number>
  pricedRuns: number
  unpricedRuns: number
}

export interface HarnessUsageStats {
  total: Omit<HarnessUsageBucket, 'id' | 'label'>
  providers: HarnessUsageBucket[]
  projects: HarnessUsageBucket[]
  sessions: HarnessUsageBucket[]
}

export type ModelProviderKey = 'glm' | 'kimi' | 'minimax' | 'deepseek' | 'qwen' | 'ollama' | 'custom'

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
  trashDirName: 'trash',
}

export const MODEL_PROVIDER_PRESETS = [
  { key: 'glm' as const, name: '智谱开放平台 / GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-4.7', 'glm-4.6'] },
  { key: 'kimi' as const, name: 'Kimi 中国版', endpoint: 'https://api.moonshot.cn/v1', models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6', 'kimi-k2.5'] },
  { key: 'minimax' as const, name: 'MiniMax 中国版', endpoint: 'https://api.minimaxi.com/v1', models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] },
  { key: 'deepseek' as const, name: '深度求索 / DeepSeek', endpoint: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'] },
  { key: 'qwen' as const, name: '阿里千问 / Qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.7-flash'] },
  { key: 'ollama' as const, name: 'Ollama 本地', endpoint: 'http://127.0.0.1:11434/v1', models: ['qwen3', 'llama3.3', 'deepseek-r1', 'gemma3', 'mistral-small3.1'] },
  { key: 'custom' as const, name: '自定义 / Custom', endpoint: '', models: [''] },
]
