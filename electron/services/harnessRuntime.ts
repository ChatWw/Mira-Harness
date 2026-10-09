import { Agent, createBashTool, createEditTool, createReadTool, createWriteTool, estimateContextTokens, estimateTokens, generateSummaryWithUsage } from '@earendil-works/pi-agent-core'
import { boundHarnessText, createSandboxedEnv, publicHarnessText, publicHarnessToolInput, publicHarnessToolOutput, wrapHarnessTool } from './agentTools'
import { createWebCitationContext, createWebFetchTool, createWebSearchTool } from '../adapters/webTools'
import type { MemoryScope } from '../storage/fileMemoryStore'
import type { McpManager } from '../adapters/mcpManager'
import { Type, createModels } from '@earendil-works/pi-ai'
import { type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readdir } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DEFAULT_CONTEXT_WINDOW, isModelProviderAvailable, normalizeAssistantTone, normalizeAutoTitle, normalizePlanSteps, providerModel, resolveMiraIdentity, shouldAutoCompactContext, shouldGenerateAutoTitle, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessMessagePart, type HarnessRunActivity, type HarnessRunSummary, type HarnessSession, type HarnessSource, type HarnessSubtaskRole, type HarnessTokenUsage, type ModelSelection, type PermissionMode, type HarnessUserAnswer, type ToolCallRecord } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import { buildMiraSystemPrompt, type MiraEnvironmentContext } from '../prompts/mira-system-prompt'
import { PLANNING_MODE_SECTION, UNATTENDED_RUN_SECTION, WEB_CITATIONS_SECTION, executingPlanSection } from '../prompts/mira-sections'
import type { HarnessGitContext, HarnessPlan, HarnessMessageAttachment, HarnessMessageSubmissionOptions, HarnessMessageSubmissionReceipt, HarnessMessageSubmissionResult } from '../../src/config/harness'

/** 一次运行在基础提示词之后追加的条件章节：计划模式 / 已确认执行方案 / 无人值守。纯函数，便于单测。 */
export function runPromptSuffix(options: { planning?: boolean, activePlan?: HarnessPlan, origin: HarnessRunOrigin }) {
  const conditionalSections = options.planning
    ? PLANNING_MODE_SECTION
    : options.activePlan?.status === 'executing' ? executingPlanSection(options.activePlan) : ''
  return `\n\n${WEB_CITATIONS_SECTION}`
    + (conditionalSections ? `\n\n${conditionalSections}` : '')
    + (options.origin === 'automation' ? `\n\n${UNATTENDED_RUN_SECTION}` : '')
}
import { withUsageCost } from './usageCost'
import type { RuntimeLogRecord } from '../storage/runLogStore'
import { SUBTASK_ROLE_TOOLS, SubtaskRuntime } from './subtaskRuntime'
import { createHarnessEventPublisher } from './harnessEventPublisher'
import { HarnessPermissionPolicy, type ToolDescriptor } from './harnessPermissionPolicy'
import { HarnessPlanCoordinator } from './harnessPlanCoordinator'
import { HarnessSubtaskCoordinator } from './harnessSubtaskCoordinator'
import { HarnessMemoryCoordinator, parseMemoryExtraction } from './harnessMemoryCoordinator'
import { HarnessRunCoordinator, type HarnessRunCompleteEvent, type HarnessRunOrigin } from './harnessRunCoordinator'
import { createHarnessModelProvider } from './harnessModelProvider'
import { HarnessMessageQueue, type HarnessMessageQueueScope } from './harnessMessageQueue'
import { changeHarnessGitBranch, readHarnessGitContext } from './harnessWorkspaceGit'

export { parseMemoryExtraction }

// [AgentHarness 迁移标记] 当前使用 pi-agent-core 的低层 `Agent`（见下方 new Agent()）。
// 暂不迁移到 `AgentHarness`：0.84.1 中大多核心方法抛 HarnessNotImplemented，且所需
// `@earendil-works/pi-session-backend-sqlite-node` 未安装。

const ASSISTANT_PERSIST_INTERVAL_MS = 250
type RunOptions = {
  origin?: HarnessRunOrigin
  permissionMode?: PermissionMode
  planning?: boolean
  laneToken?: symbol
  scope?: HarnessMessageQueueScope
  input?: { text: string, attachments: HarnessMessageAttachment[], started?: () => void }
}

function normalizeHarnessSource(value: unknown): HarnessSource | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  if (!Number.isSafeInteger(source.index) || Number(source.index) < 1 || typeof source.url !== 'string') return undefined
  let url: URL
  try { url = new URL(source.url) } catch { return undefined }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim() : source.url
  const snippet = typeof source.snippet === 'string' && source.snippet.trim() ? source.snippet.trim() : undefined
  return { index: Number(source.index), title, url: source.url, ...(snippet ? { snippet } : {}) }
}

export function sourcesFromWebToolResult(toolName: string, result: unknown): HarnessSource[] {
  if (!result || typeof result !== 'object') return []
  const details = (result as { details?: unknown }).details
  if (!details || typeof details !== 'object') return []
  const candidates = toolName === 'web_search' && Array.isArray((details as { results?: unknown }).results)
    ? (details as { results: unknown[] }).results
    : toolName === 'web_fetch' ? [details, ...(Array.isArray((details as { links?: unknown }).links) ? (details as { links: unknown[] }).links : [])] : []
  return candidates.map(normalizeHarnessSource).filter((source): source is HarnessSource => Boolean(source))
}

function plainCitationText(value: string) {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`>#~]/g, '')
    .replace(/^\s*\d+[.)、]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function citationContext(content: string, offset: number) {
  const prefix = content.slice(0, offset)
  const boundary = prefix.lastIndexOf('\n\n')
  const blockStart = boundary < 0 ? 0 : boundary + 2
  const currentBlock = prefix.slice(blockStart)
  const boldTitle = currentBlock.match(/(?:\*\*|__)(.+?)(?:\*\*|__)/)?.[1]
  const snippet = plainCitationText(currentBlock).slice(0, 320)
  const previousBlocks = prefix.slice(0, Math.max(0, blockStart - 2)).split(/\n\s*\n/)
  const previousRaw = previousBlocks.at(-1) || ''
  const previous = plainCitationText(previousRaw)
  const title = boldTitle?.trim() || (/^(?:\s*#{1,6}\s+|\s*(?:\*\*|__)|\s*\d+[.)、]\s*)/.test(previousRaw) && previous.length <= 180 ? previous : undefined)
  return { title, snippet }
}

export function finalizeAssistantCitations(content: string, candidates: HarnessSource[], parts?: HarnessMessagePart[]) {
  const sources: HarnessSource[] = []
  const displayIndexes = new Map<number, number>()
  const edits: Array<{ start: number; end: number; text: string }> = []
  const rewritten = content.replace(/\[\[source:(\d+)]]/g, (marker, rawIndex: string, offset: number) => {
    const sourceIndex = Number(rawIndex)
    const candidate = candidates.find(source => source.index === sourceIndex)
    if (!candidate) return marker
    const existingIndex = displayIndexes.get(sourceIndex)
    if (existingIndex) { const text = `[${existingIndex}]`; edits.push({ start: offset, end: offset + marker.length, text }); return text }
    const context = citationContext(content, offset)
    const index = sources.length + 1
    displayIndexes.set(sourceIndex, index)
    sources.push({
      index,
      title: context.title || candidate.title,
      url: candidate.url,
      ...(context.snippet || candidate.snippet ? { snippet: context.snippet || candidate.snippet } : {}),
    })
    const text = `[${index}]`
    edits.push({ start: offset, end: offset + marker.length, text })
    return text
  })
  let offset = 0
  const rewrittenParts = parts?.map(part => {
    if (part.type !== 'text') return part
    const start = offset, end = start + part.text.length
    offset = end
    let cursor = start, text = ''
    for (const edit of edits) {
      if (edit.end <= start || edit.start >= end) continue
      text += content.slice(cursor, Math.max(cursor, edit.start))
      if (edit.start >= start) text += edit.text
      cursor = Math.min(end, edit.end)
    }
    return { ...part, text: text + content.slice(cursor, end) }
  })
  return { content: rewritten, sources, ...(rewrittenParts ? { parts: rewrittenParts } : {}) }
}

function messageContent(message: HarnessMessage) {
  if (!message.attachments?.length) return message.content
  const files = message.attachments.map(file => `\n\n[引用文件：${file.path}]\n\`\`\`\n${file.content}\n\`\`\``).join('')
  return `${message.content}${files}`
}

function assistantText(message: unknown) {
  if (!message || typeof message !== 'object' || (message as { role?: unknown }).role !== 'assistant') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type: 'text', text: string } => Boolean(block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string'))
    .map(block => block.text)
    .join('')
}

function firstTurnTitleInput(session: HarnessSession) {
  const users = session.messages.filter(message => message.role === 'user')
  const assistants = session.messages.filter(message => message.role === 'assistant')
  if (users.length !== 1 || assistants.length) return undefined
  return shouldGenerateAutoTitle(users[0].content) ? users[0].content : undefined
}

function tokenUsage(value: unknown): Omit<HarnessTokenUsage, 'cost'> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const number = (key: string) => Math.max(0, Number(source[key]) || 0)
  const input = number('input')
  const output = number('output')
  const cacheRead = number('cacheRead')
  const cacheWrite = number('cacheWrite')
  const totalTokens = Math.max(number('totalTokens'), input + output + cacheRead + cacheWrite)
  return totalTokens ? { input, output, cacheRead, cacheWrite, totalTokens } : undefined
}

function mergeUsage(items: Array<HarnessTokenUsage | undefined>): HarnessTokenUsage | undefined {
  const values = items.filter((value): value is HarnessTokenUsage => Boolean(value))
  if (!values.length) return undefined
  const total = values.reduce((sum, value) => ({
    input: sum.input + value.input,
    output: sum.output + value.output,
    cacheRead: sum.cacheRead + value.cacheRead,
    cacheWrite: sum.cacheWrite + value.cacheWrite,
    totalTokens: sum.totalTokens + value.totalTokens,
  }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 })
  const costs = values.map(value => value.cost)
  if (!costs.every(cost => cost?.priced && cost.currency === costs[0]?.currency)) return { ...total, cost: { currency: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, priced: false } }
  return {
    ...total,
    cost: costs.reduce((sum, cost) => ({ currency: cost!.currency, input: sum.input + cost!.input, output: sum.output + cost!.output, cacheRead: sum.cacheRead + cost!.cacheRead, cacheWrite: sum.cacheWrite + cost!.cacheWrite, total: sum.total + cost!.total, priced: true }), { currency: costs[0]!.currency, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, priced: true }),
  }
}

function agentUsage(usage: HarnessTokenUsage) {
  return {
    ...usage,
    cost: usage.cost ? { input: usage.cost.input, output: usage.cost.output, cacheRead: usage.cost.cacheRead, cacheWrite: usage.cost.cacheWrite, total: usage.cost.total } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function contextUsage(messages: unknown[], contextWindow: number): HarnessContextUsage {
  const estimate = estimateContextTokens(messages as any)
  return {
    usedTokens: estimate.tokens,
    contextWindow,
    source: estimate.lastUsageIndex === null ? 'estimated' : 'reported',
    updatedAt: Date.now(),
  }
}

function activityDetail(toolName: string, args: unknown) {
  const value = args && typeof args === 'object' ? args as Record<string, unknown> : {}
  const target = typeof value.path === 'string' ? value.path : typeof value.command === 'string' ? value.command : ''
  if (!target) return '已开始执行'
  const prefix = toolName === 'bash' ? '命令' : '目标'
  const safeTarget = sanitizeToolTarget(target)
  return `${prefix}：${safeTarget}`
}

const TOOL_LABELS: Record<string, string> = { read: '读取文件', edit: '编辑文件', list_files: '查看文件', write: '写入文件', delete_file: '删除文件', bash: '执行命令', web_fetch: '抓取网页', web_search: '网页搜索', search_memory: '查询记忆', remember_memory: '保存记忆', forget_memory: '删除记忆', ask_user: '需要你的输入', present_plan: '等待方案确认' }

function sanitizeToolTarget(target: string) {
  return target
    .replace(/\b(api[_-]?key|token|password|secret)\b\s*(?:=|:)\s*([^\s'"\r\n]+)/gi, '$1=***')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s'"\r\n]+/gi, '$1***')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

function toolActivityLabel(toolName: string, args: unknown) {
  const verb = TOOL_LABELS[toolName] || toolName
  const value = args && typeof args === 'object' ? args as Record<string, unknown> : {}
  const target = typeof value.path === 'string' ? value.path : typeof value.command === 'string' ? value.command : ''
  if (!target) return verb
  const safeTarget = sanitizeToolTarget(target)
  return safeTarget ? `${verb} ${safeTarget}` : verb
}

function argumentSummary(args: unknown) {
  const value = args && typeof args === 'object' ? args as Record<string, unknown> : {}
  return Object.entries(value)
    .map(([key, item]) => `${key}=${typeof item === 'string' ? item : JSON.stringify(item)}`)
    .join(', ')
    .replace(/\b(api[_-]?key|token|password|secret)\b\s*(?:=|:)\s*([^\s,'"\r\n]+)/gi, '$1=***')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,'"\r\n]+/gi, '$1***')
    .replace(/\s+/g, ' ')
    .slice(0, 240)
}

function permissionTitle(name: string, args: Record<string, unknown>) {
  if (name === 'delete_file') return '允许 Mira 删除这个文件？'
  if (name === 'edit') return '允许 Mira 编辑这个文件？'
  if (name === 'write') return '允许 Mira 写入这个文件？'
  const command = String(args.command ?? '').trim().toLocaleLowerCase()
  if (/^git\s+log\b/.test(command)) return '允许 Mira 查看 Git 提交记录？'
  if (/^git\s+status\b/.test(command)) return '允许 Mira 查看 Git 工作区状态？'
  if (/^git\s+diff\b/.test(command)) return '允许 Mira 查看 Git 变更内容？'
  if (/^git\s+(fetch|pull)\b/.test(command)) return '允许 Mira 从远程更新 Git 信息？'
  return '允许 Mira 执行这条命令？'
}

export class HarnessRuntime {
  private readonly emit: ReturnType<typeof createHarnessEventPublisher>
  private readonly permissionPolicy: HarnessPermissionPolicy
  private readonly planCoordinator: HarnessPlanCoordinator
  private readonly subtaskCoordinator: HarnessSubtaskCoordinator
  private readonly memoryCoordinator: HarnessMemoryCoordinator
  private readonly runCoordinator: HarnessRunCoordinator
  private readonly messageQueue: HarnessMessageQueue
  private readonly assistantSnapshotFlushers = new Map<string, () => void>()
  private readonly projectGitMutations = new Set<string>()
  private readonly projectGitRepositories = new Map<string, string>()
  constructor(private readonly database: PlatformDatabase, private readonly mcpManager: McpManager, backgroundEventPublisher?: (event: HarnessEvent) => void) {
    this.emit = createHarnessEventPublisher(backgroundEventPublisher)
    this.runCoordinator = new HarnessRunCoordinator(database, this.emit, id => this.assertGitAdmission(id))
    this.permissionPolicy = new HarnessPermissionPolicy(database, this.emit)
    this.subtaskCoordinator = new HarnessSubtaskCoordinator(database)
    this.memoryCoordinator = new HarnessMemoryCoordinator(database, this.emit, record => this.log(record))
    this.messageQueue = new HarnessMessageQueue({
      isRunning: sessionId => this.runCoordinator.isExecuting(sessionId),
      reserve: sessionId => this.runCoordinator.reserve(sessionId),
      release: (sessionId, token) => this.runCoordinator.release(sessionId, token),
      blocked: sessionId => this.database.harness.getSession(sessionId).pendingInteraction?.status === 'waiting' || this.permissionPolicy.listPending(sessionId).length > 0,
      currentRunId: sessionId => this.runCoordinator.currentRunId(sessionId),
      preemptAndWait: (sessionId, runId) => this.runCoordinator.preemptAndWait(sessionId, runId),
      guideFallback: (item, scope, runId) => {
        if (item.references.length) return 'attachments'
        if (item.planning) return 'planning'
        const current = this.database.harness.getSession(item.sessionId)
        this.assertQueuedScope(current, scope)
        if (current.pendingInteraction?.status === 'waiting' || this.permissionPolicy.listPending(item.sessionId).length) return 'confirmation'
        const selection = this.runCoordinator.guidanceSelection(item.sessionId, runId)
        if (!selection) return 'run-unavailable'
        if (selection.providerId !== item.selection.providerId || selection.modelId !== item.selection.modelId || (selection.thinkingLevel || 'medium') !== (item.selection.thinkingLevel || 'medium')) return 'model-mismatch'
      },
      execute: (item, attachments, token, sender, started, scope) => {
        const session = this.database.harness.getSession(item.sessionId)
        this.assertQueuedScope(session, scope)
        const mode = this.permissionCommand(item.text)
        if (mode) {
          this.database.harness.setPermission(item.sessionId, mode)
          started()
          this.emit(sender, { sessionId: item.sessionId, type: 'status', payload: { permissionMode: mode } })
          return Promise.resolve({})
        }
        return this.runPreparedMessage(sender, item.sessionId, item.text, attachments, item.selection, item.planning, { laneToken: token, permissionMode: item.permissionMode, scope }, started)
      },
      publish: (sender, queue) => this.emit(sender, { sessionId: queue.sessionId, type: 'queue-updated', payload: { queue } }),
      settled: sessionId => this.runCoordinator.flushComplete(sessionId),
    })
    this.planCoordinator = new HarnessPlanCoordinator(database, this.emit, {
      isRunning: sessionId => this.runCoordinator.isRunning(sessionId),
      requireProvider: selection => this.requireProvider(selection),
      runAgent: (...args) => this.runAgent(...args),
      runMessage: (...args) => this.runImmediateMessage(...args),
      abort: sessionId => this.abort(sessionId),
    })
  }

  private log(record: RuntimeLogRecord) {
    try { this.database.logs?.write(record) } catch (error) { console.warn('[Mira] 写入运行日志失败', error) }
  }

  onRunComplete(listener: (event: HarnessRunCompleteEvent) => void) { return this.runCoordinator.onComplete(listener) }

  getSession(sessionId: string) {
    const session = this.database.harness.getSession(sessionId)
    const flush = !session.archivedAt && this.assistantSnapshotFlushers.get(sessionId)
    if (!flush) return session
    flush()
    return this.database.harness.getSession(sessionId)
  }

  isProjectRunning(projectId: string) {
    return this.projectGitMutations.has(projectId) || this.runCoordinator.isProjectRunning(projectId) || this.messageQueue.pendingSessionIds().some(id => {
      try { return this.database.harness.getSession(id).projectId === projectId } catch { return false }
    })
  }

  assertProjectGitAvailable(projectId: string | undefined) {
    if (projectId && this.projectGitMutations.has(projectId)) throw new Error('项目正在切换分支，请稍后重试')
    if (projectId && this.projectGitRepositories.size) this.assertGitDirectoryAvailable(this.database.harness.getProjectDirectory(projectId))
  }

  private assertGitAdmission(sessionId: string) {
    const session = this.database.harness.getSession(sessionId)
    this.assertProjectGitAvailable(session.projectId)
    if (session.workingDirectory) this.assertGitDirectoryAvailable(session.workingDirectory)
  }

  private gitDirectoriesOverlap(left: string, right: string) {
    const inside = (root: string, path: string) => { const value = relative(root, path); return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value) }
    return inside(left, right) || inside(right, left)
  }

  private assertGitDirectoryAvailable(directory: string) {
    if (!this.projectGitRepositories.size) return
    let current: string
    try { current = realpathSync(directory) } catch { throw new Error('工作目录已变化，请重新打开文件工作区。') }
    if ([...this.projectGitRepositories.values()].some(root => this.gitDirectoriesOverlap(root, current))) throw new Error('项目正在切换分支，请稍后重试')
  }

  private isGitWorkspaceBusy(directory: string, ownMutation?: string) {
    try {
      if ([...this.projectGitMutations].some(id => id !== ownMutation && this.gitDirectoriesOverlap(directory, realpathSync(this.database.harness.getProjectDirectory(id))))) return true
      if ([...this.projectGitRepositories].some(([id, root]) => id !== ownMutation && this.gitDirectoriesOverlap(directory, root))) return true
      return [...new Set([...this.runCoordinator.activeSessionIds(), ...this.messageQueue.pendingSessionIds()])].some(id => {
        const session = this.database.harness.getSession(id)
        const workspace = session.projectId ? this.database.harness.getProjectDirectory(session.projectId) : session.workingDirectory
        return !!workspace && this.gitDirectoriesOverlap(directory, realpathSync(workspace))
      })
    } catch { return true }
  }

  async getGitContext(projectId: string, assertAuthorized = () => {}): Promise<HarnessGitContext> {
    const directory = this.database.harness.getProjectDirectory(projectId)
    const assertCurrent = () => {
      assertAuthorized()
      if (this.database.harness.getProjectDirectory(projectId) !== directory) throw new Error('Git 工作区或分支已变化，请刷新后重试')
    }
    let repositoryDirectory = directory
    const context = await readHarnessGitContext(directory, assertCurrent, value => { repositoryDirectory = value })
    assertCurrent()
    return { ...context, projectId, mutationBlocked: this.isProjectRunning(projectId) || this.isGitWorkspaceBusy(repositoryDirectory) }
  }

  checkoutGitBranch(projectId: string, branch: string, snapshotToken?: string, assertAuthorized = () => {}) {
    return this.changeGitBranch(projectId, branch, false, snapshotToken, assertAuthorized)
  }

  createGitBranch(projectId: string, branch: string, snapshotToken?: string, assertAuthorized = () => {}) {
    return this.changeGitBranch(projectId, branch, true, snapshotToken, assertAuthorized)
  }

  private async changeGitBranch(projectId: string, branch: string, create: boolean, snapshotToken: string | undefined, assertAuthorized: () => void): Promise<HarnessGitContext> {
    assertAuthorized()
    if (this.isProjectRunning(projectId)) throw new Error('请先停止项目任务并处理待发送消息')
    const directory = this.database.harness.getProjectDirectory(projectId)
    this.projectGitMutations.add(projectId)
    try {
      const assertCurrent = () => {
        assertAuthorized()
        if (this.database.harness.getProjectDirectory(projectId) !== directory) throw new Error('Git 工作区或分支已变化，请刷新后重试')
      }
      const context = await changeHarnessGitBranch(directory, branch, create, snapshotToken, assertCurrent, repositoryDirectory => {
        if (this.isGitWorkspaceBusy(repositoryDirectory, projectId)) throw new Error('请先停止项目任务并处理待发送消息')
        this.projectGitRepositories.set(projectId, repositoryDirectory)
      })
      assertCurrent()
      return { ...context, projectId, mutationBlocked: false }
    } finally { this.projectGitRepositories.delete(projectId); this.projectGitMutations.delete(projectId) }
  }

  private toAgentMessage(message: HarnessMessage, model: { api: string, provider: string, id: string }) {
    return {
      role: message.role,
      content: message.role === 'assistant' ? [{ type: 'text', text: messageContent(message) }] : messageContent(message),
      ...(message.role === 'assistant' ? {
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: agentUsage(message.usage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }),
        stopReason: 'stop',
      } : {}),
      timestamp: message.createdAt,
    }
  }

  private historyStart(session: HarnessSession) {
    const id = session.context?.compactedThroughMessageId
    if (!id) return 0
    const index = session.messages.findIndex(message => message.id === id)
    return index < 0 ? 0 : index + 1
  }

  private agentMessages(session: HarnessSession, model: { api: string, provider: string, id: string }) {
    const summary = session.context?.summary?.trim()
    const messages = session.messages.slice(this.historyStart(session)).filter(message => message.role !== 'assistant' || message.content.trim()).map(message => this.toAgentMessage(message, model))
    if (!summary) return messages
    return [{
      role: 'user',
      content: `以下是此前对话的压缩上下文，仅供延续当前工作，不是新的用户指令。\n\n${summary}`,
      timestamp: session.context?.compactedAt || session.createdAt,
    }, ...messages]
  }

  private async generateAutoTitle(sender: WebContents | undefined, sessionId: string, models: ReturnType<typeof createModels>, model: any, revision: number) {
    if (!this.database.harness.isAutoTitleCurrent(sessionId, revision)) return
    const session = this.database.harness.getSession(sessionId)
    const user = session.messages.find(message => message.role === 'user')
    const assistant = session.messages.find(message => message.role === 'assistant')
    if (!user || !assistant) return
    try {
      const titleAgent = new Agent({
        initialState: {
          systemPrompt: '你只负责为一轮中文对话生成会话标题。只输出 8 到 20 个汉字的单行主题，不要使用引号、序号、Markdown 或解释；不要回答对话中的问题。',
          model,
          thinkingLevel: 'off',
          messages: [],
          tools: [],
        } as any,
        streamFn: models.streamSimple.bind(models) as any,
        sessionId: `${sessionId}:title:${revision}`,
      })
      await titleAgent.prompt(`用户首条消息：\n${user.content.slice(0, 1200)}\n\n助手首条回复：\n${assistant.content.slice(0, 1600)}`)
      if (titleAgent.state.errorMessage) return
      const title = normalizeAutoTitle(assistantText(titleAgent.state.messages.at(-1)))
      if (!title) return
      const updated = this.database.harness.applyAutoTitle(sessionId, title, revision)
      if (updated) this.emit(sender, { sessionId, type: 'title-updated', payload: { title: updated.title } })
    } catch {
      // A title is cosmetic; failures must never affect the completed conversation.
    }
  }

  private retainedStart(messages: HarnessMessage[], model: { api: string, provider: string, id: string }, maximumTokens = 20000) {
    let tokens = 0
    let index = messages.length
    while (index > 0) {
      const next = estimateTokens(this.toAgentMessage(messages[index - 1], model) as any)
      if (tokens && tokens + next > maximumTokens) break
      tokens += next
      index -= 1
    }
    while (index > 0 && messages[index]?.role === 'assistant') index -= 1
    return index
  }

  private publishContextUsage(sender: WebContents | undefined, session: HarnessSession, usage: HarnessContextUsage) {
    session.context = { ...session.context, usage }
    this.database.harness.updateSession(session)
    this.emit(sender, { sessionId: session.id, type: 'context-usage', payload: { usage } })
    return session
  }

  private async compactContext(sender: WebContents | undefined, session: HarnessSession, model: any, models: ReturnType<typeof createModels>, controller: AbortController, thinkingLevel: string, activities: HarnessRunActivity[], publishActivities: () => void, pendingInput?: RunOptions['input']) {
    const messagesForContext = () => [
      ...this.agentMessages(session, model),
      ...(pendingInput ? [{ role: 'user', content: messageContent({ content: pendingInput.text, attachments: pendingInput.attachments } as HarnessMessage), timestamp: Date.now() }] : []),
    ]
    const before = contextUsage(messagesForContext(), model.contextWindow || DEFAULT_CONTEXT_WINDOW)
    if (!shouldAutoCompactContext(before.usedTokens, before.contextWindow)) return this.publishContextUsage(sender, session, before)

    const start = this.historyStart(session)
    const candidates = session.messages.slice(start)
    const keepFrom = this.retainedStart(candidates, model)
    if (keepFrom === 0) throw new Error('上下文过长，无法在保留最近对话的情况下自动压缩')
    const activity: HarnessRunActivity = { id: 'context-compaction', label: '正在压缩上下文', status: 'running', startedAt: Date.now() }
    activities.unshift(activity)
    publishActivities()
    const reserveTokens = Math.min(Math.max(8192, Math.ceil(before.contextWindow * 0.2)), Math.floor(before.contextWindow / 2))
    const result = await generateSummaryWithUsage(
      candidates.slice(0, keepFrom).map(message => this.toAgentMessage(message, model)) as any,
      models,
      model,
      reserveTokens,
      controller.signal,
      undefined,
      session.context?.summary,
      thinkingLevel as any,
    )
    if (!result.ok) throw new Error(`上下文压缩失败：${result.error.message}`)
    const compactedThrough = candidates[keepFrom - 1]
    session = this.database.harness.getSession(session.id)
    session.context = {
      ...session.context,
      summary: result.value.text,
      compactedThroughMessageId: compactedThrough.id,
      compactedAt: Date.now(),
    }
    activity.label = '已压缩上下文'
    activity.status = 'completed'
    activity.completedAt = Date.now()
    activity.detail = `已将较早对话压缩为摘要，保留最近 ${candidates.length - keepFrom} 条消息。`
    publishActivities()
    return this.publishContextUsage(sender, session, contextUsage(messagesForContext(), before.contextWindow))
  }

  private assertProjectPath(directory: string | undefined, value: string) {
    if (!directory) throw new Error('请先选择项目工作目录')
    const root = realpathSync(directory)
    const target = resolve(root, value)
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('工具只能访问项目目录内的文件')
    if (existsSync(target) && !realpathSync(target).startsWith(`${root}${sep}`) && realpathSync(target) !== root) throw new Error('路径不能通过符号链接离开项目目录')
    return target
  }

  /** 环境上下文仅作事实参考注入；分支等信息可能滞后。 */
  private environmentContext(session: HarnessSession, origin: HarnessRunOrigin, automationPermissionMode?: PermissionMode): MiraEnvironmentContext {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    let gitBranch: string | undefined
    if (session.projectId) {
      try { gitBranch = this.database.harness.getProject(session.projectId)?.gitBranch } catch { gitBranch = undefined }
    }
    return {
      currentDateTime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      workingDirectory: session.workingDirectory,
      gitBranch,
      permissionMode: origin === 'automation'
        ? automationPermissionMode || session.permissionMode
        : this.database.harness.getPermissionConfig().globalDefaultMode,
      origin,
    }
  }

  resolvePermission(requestId: string, allowed: boolean) {
    this.permissionPolicy.resolve(requestId, allowed)
  }

  listPendingPermissions(sessionId: string) {
    return this.permissionPolicy.listPending(sessionId)
  }

  respondMemoryConfirmation(requestId: string, approved: boolean) {
    this.memoryCoordinator.respondConfirmation(requestId, approved)
  }

  private async preflightToolCall(sender: WebContents | undefined, sessionId: string, descriptors: Map<string, ToolDescriptor>, name: string, args: unknown, automation = false, permissionMode?: PermissionMode, signal?: AbortSignal) {
    return this.permissionPolicy.preflight(sender, sessionId, descriptors, name, args, automation, permissionMode, signal)
  }

  /** Delegates use fixed role capabilities, never interactive approvals. */
  private preflightSubtaskToolCall(name: string, args: unknown) {
    return this.permissionPolicy.preflightSubtask(name, args)
  }

  private tools(sender: WebContents | undefined, sessionId: string, options: { role?: HarnessSubtaskRole, subtaskId?: string, planning?: boolean, runId?: string, toolScope?: () => number, onTool?: (id: string) => void, secrets?: string[] } = {}) {
    const descriptors = new Map<string, ToolDescriptor>()
    const recordedTools = new Map<string, { tool: string, target: string, startedAt: number }>()
    const executionRecord = new AsyncLocalStorage<string>()
    const publicIds = new Map<string, string>()
    const publicStates = new Map<string, Pick<ToolCallRecord, 'status' | 'approvalRequestId'>>()
    const secrets = options.secrets || []
    const updatePublic = (id: string, patch: Partial<ToolCallRecord>) => {
      const state = publicStates.get(id)
      if (state) {
        if (patch.status) state.status = patch.status
        if (patch.approvalRequestId) state.approvalRequestId = patch.approvalRequestId
      }
      const linked = { runId: options.runId, ...(state?.approvalRequestId ? { approvalRequestId: state.approvalRequestId } : {}), ...patch }
      this.database.harness.updateTool(sessionId, id, linked)
      this.emit(sender, { sessionId, type: 'tool-call', payload: { id, ...linked } })
    }
    const prepareTool = (providerCallId: string, name: string, args: unknown) => {
      const identity = `response-${options.toolScope?.() || 0}:${providerCallId}`
      const existing = publicIds.get(identity)
      const input = publicHarnessToolInput(name === 'remember_memory' && args && typeof args === 'object' ? { ...args, content: '[记忆原文不记录]', redactedContent: '[记忆原文不记录]' } : args, secrets)
      if (existing) { if (args !== undefined) updatePublic(existing, { input }); return existing }
      const id = `${options.runId}:${identity}`
      const tool = name === 'delete_file' ? 'delete' : name
      const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
      const target = publicHarnessText(String(values.path ?? values.command ?? values.url ?? values.query ?? ''), secrets).text
      const createdAt = Date.now()
      const record: ToolCallRecord = { id, tool, target, status: 'running', createdAt, runId: options.runId, providerCallId, input }
      publicIds.set(identity, id)
      publicStates.set(id, { status: record.status })
      recordedTools.set(id, { tool, target, startedAt: createdAt })
      this.database.harness.recordTool(sessionId, record)
      options.onTool?.(id)
      this.emit(sender, { sessionId, type: 'tool-call', payload: { ...record } })
      return id
    }
    const preflight = async (providerCallId: string, name: string, args: unknown, automation: boolean, mode: PermissionMode | undefined, signal: AbortSignal) => {
      const id = prepareTool(providerCallId, name, args)
      const result = await this.permissionPolicy.preflight(sender, sessionId, descriptors, name, args, automation, mode, signal, {
        toolCallId: id, runId: options.runId!, onRequest: requestId => updatePublic(id, { status: 'waiting-confirm', approvalRequestId: requestId }),
      })
      if (result?.block) updatePublic(id, { status: 'cancelled', error: result.reason, completedAt: Date.now() })
      return result
    }
    const settleTool = (providerCallId: string, name: string, args: unknown, result: unknown, isError: boolean, stopped: boolean) => {
      const id = prepareTool(providerCallId, name, args)
      const status = publicStates.get(id)?.status
      if (status === 'cancelled' || status === 'ok' || status === 'failed') return
      const output = publicHarnessToolOutput(result, secrets)
      updatePublic(id, { status: stopped ? 'cancelled' : isError ? 'failed' : 'ok', ...(output ? { output } : {}), ...(stopped || isError ? { error: stopped ? '运行已停止' : output?.text || '工具执行失败' } : {}), completedAt: Date.now() })
    }
    const cancelPending = (reason: string) => {
      for (const [id, state] of publicStates) if (state.status === 'running' || state.status === 'waiting-confirm') updatePublic(id, { status: 'cancelled', error: reason, completedAt: Date.now() })
    }
    const register = <T extends { name: string }>(tool: T, descriptor: ToolDescriptor) => {
      descriptors.set(tool.name, descriptor)
      return tool
    }
    const session = () => this.database.harness.getSession(sessionId)
    const record = (tool: string, target: string) => {
      const parentId = executionRecord.getStore()
      if (parentId) { updatePublic(parentId, { target: publicHarnessText(target, secrets).text }); return parentId }
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`; const createdAt = Date.now(); recordedTools.set(id, { tool, target, startedAt: createdAt }); this.database.harness.recordTool(sessionId, { id, tool, target, status: 'running', createdAt, ...(options.subtaskId ? { subtaskId: options.subtaskId } : {}) }); this.log({ event: 'tool', sessionId, tool, target, status: 'running', timestamp: createdAt }); this.emit(sender, { sessionId, type: 'tool-call', payload: { id, tool, target, status: 'running', ...(options.subtaskId ? { subtaskId: options.subtaskId } : {}) } }); return id
    }
    const finish = (id: string, status: 'ok' | 'failed', diff?: string) => {
      if (executionRecord.getStore() === id) { if (diff) updatePublic(id, { diff: publicHarnessText(diff, secrets).text }); return }
      const completedAt = Date.now()
      this.database.harness.updateTool(sessionId, id, { status, diff, completedAt })
      const started = recordedTools.get(id)
      this.log({ event: 'tool', sessionId, tool: started?.tool || 'tool', target: started?.target, status: status === 'ok' ? 'completed' : 'failed', timestamp: completedAt, durationMs: started ? completedAt - started.startedAt : undefined, ...(diff ? { result: diff } : {}) })
      recordedTools.delete(id)
      this.emit(sender, { sessionId, type: 'tool-call', payload: { id, status, diff } })
    }
    const workingDirectory = session().workingDirectory
    const env = workingDirectory ? createSandboxedEnv(realpathSync(workingDirectory)) : undefined
    const fallbackTool = (name: string, label: string, description: string, parameters: any) => ({
      name, label, description, parameters, executionMode: 'sequential',
      execute: async (_id: string) => { const id = record(name, ''); try { throw new Error('请先选择项目工作目录') } catch (error) { finish(id, 'failed'); throw error } },
    })
    const readTool = register(env
      ? wrapHarnessTool(createReadTool(), { env }, { record, finish, target: params => params.path ?? '' }, '读取项目内的文本文件（支持图片，可用 offset/limit 分页读取大文件）')
      : fallbackTool('read', '读取文件', '读取项目内的文本文件', Type.Object({ path: Type.String() })), { risk: 'read', title: () => '', detail: () => '' })
    const editTool = register(env
      ? wrapHarnessTool(createEditTool(), { env }, { record, finish, target: params => params.path ?? '' }, '精确编辑项目内文件：用 oldText 片段替换为 newText（oldText 必须是文件中的唯一片段），改动会返回 diff')
      : fallbackTool('edit', '编辑文件', '精确编辑项目内文本文件', Type.Object({ path: Type.String(), edits: Type.Array(Type.Object({ oldText: Type.String(), newText: Type.String() })) })), { risk: 'write', title: () => '允许 Mira 编辑这个文件？', detail: args => String(args.path ?? '') })
    const writeTool = register(env
      ? wrapHarnessTool(createWriteTool(), { env }, { record, finish, target: params => params.path ?? '' }, '写入项目内文本文件（不存在则创建，存在则覆盖，自动创建父目录）')
      : fallbackTool('write', '写入文件', '写入项目内文本文件', Type.Object({ path: Type.String(), content: Type.String() })), { risk: 'write', title: () => '允许 Mira 写入这个文件？', detail: args => String(args.path ?? '') })
    const bashTool = register(env
      ? wrapHarnessTool(createBashTool(), { env }, { record, finish, target: params => params.command ?? '' }, '在项目目录中执行命令（返回 stdout/stderr，输出过长会截断）')
      : fallbackTool('bash', '执行命令', '在项目目录中执行非危险命令', Type.Object({ command: Type.String() })), { risk: 'command', title: args => permissionTitle('bash', args), detail: args => String(args.command ?? '') })
    const wrapRecordTool = (tool: any, target: (params: any) => string) => ({
      ...tool,
      execute: async (id: string, params: any, signal?: AbortSignal, onUpdate?: any) => {
        const recordId = record(tool.name, target(params))
        try {
          const result = await tool.execute(id, params, signal, onUpdate)
          finish(recordId, 'ok')
          return result
        } catch (error) {
          finish(recordId, 'failed')
          throw error
        }
      },
    })
    const webCitations = createWebCitationContext()
    const webFetchTool = register(wrapRecordTool(createWebFetchTool(webCitations), params => params.url ?? ''), { risk: 'read', title: () => '', detail: () => '' })
    const webSearchTool = register(wrapRecordTool(createWebSearchTool(webCitations), params => params.query ?? ''), { risk: 'read', title: () => '', detail: () => '' })
    const mcpTools = this.mcpManager.getTools(session().activeMcpServerIds || []).map(tool => {
      const serverName = typeof tool.miraMcpServerName === 'string' ? tool.miraMcpServerName : 'MCP 服务'
      return register(wrapRecordTool(tool, params => `${serverName} / ${tool.name}${argumentSummary(params) ? `: ${argumentSummary(params)}` : ''}`), {
        risk: 'mcp',
        title: () => `允许 Mira 调用 MCP 工具“${tool.name}”？`,
        detail: args => `${serverName} / ${tool.name}${argumentSummary(args) ? `\n${argumentSummary(args)}` : ''}`,
      })
    })
    const listFilesTool = register({ name: 'list_files', label: '列出文件', description: '列出项目目录内文件', parameters: Type.Object({ path: Type.Optional(Type.String()) }), executionMode: 'sequential', execute: async (_id: string, params: { path?: string }) => { const target = params.path || '.'; const id = record('list_files', target); try { const dir = this.assertProjectPath(session().workingDirectory, target); const entries = await readdir(dir, { withFileTypes: true }); const text = entries.map(entry => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`).join('\n'); finish(id, 'ok'); return { content: [{ type: 'text', text }], details: { path: target } } } catch (error) { finish(id, 'failed'); throw error } } }, { risk: 'read', title: () => '', detail: () => '' })
    const deleteTool = register({ name: 'delete_file', label: '删除文件', description: '将项目内文件移动至 Mira 回收站', parameters: Type.Object({ path: Type.String() }), executionMode: 'sequential', execute: async (_id: string, params: { path: string }) => { const id = record('delete', params.path); try { const result = this.database.harness.moveToTrash(sessionId, params.path); finish(id, 'ok', `- 删除 ${result.path}（可还原）`); return { content: [{ type: 'text', text: `已删除 ${result.path}，可在回收站还原。` }], details: result } } catch (error) { finish(id, 'failed'); throw error } } }, { risk: 'write', title: () => '允许 Mira 删除这个文件？', detail: args => `${String(args.path ?? '')}\n文件会移入 Mira 回收站。` })
    const memoryTools = this.memoryCoordinator.createTools(sender, sessionId, { register, record, finish, session })
    const planTool = register({
      name: 'set_plan',
      label: '制定计划',
      description: '在开始一个多步骤任务前，提交一份简洁、可执行的计划步骤清单。步骤是待办清单，不是推理过程；每步一句短标签，必要时附一行说明。仅在多步骤任务时调用一次，建议不超过 6 步。',
      parameters: Type.Object({ steps: Type.Array(Type.Object({ label: Type.String(), detail: Type.Optional(Type.String()) })) }),
      executionMode: 'sequential',
      execute: async () => ({ content: [{ type: 'text', text: '计划已记录。' }] }),
    }, { risk: 'read', title: () => '', detail: () => '' })
    const planningTools = this.planCoordinator.createTools(sender, sessionId)
    const askUserTool = register(planningTools.askUserTool, { risk: 'read', title: () => '', detail: () => '' })
    const presentPlanTool = register(planningTools.presentPlanTool, { risk: 'read', title: () => '', detail: () => '' })
    const allTools = [
      readTool,
      editTool,
      listFilesTool,
      writeTool,
      deleteTool,
      bashTool,
      webFetchTool,
      webSearchTool,
      ...(options.planning ? [askUserTool, presentPlanTool] : [planTool]),
      ...memoryTools,
      ...mcpTools,
    ] as any[]
    const allowed = options.role ? new Set(SUBTASK_ROLE_TOOLS[options.role]) : undefined
    const lockable = new Set(['read', 'list_files', 'edit', 'write', 'delete_file', 'bash'])
    const write = new Set(['edit', 'write', 'delete_file', 'bash'])
    const tools = allTools
      .filter(tool => !allowed || allowed.has(tool.name))
      .filter(tool => !options.planning || ['read', 'list_files', 'web_fetch', 'web_search', 'ask_user', 'present_plan'].includes(tool.name))
      .map(tool => options.role || !lockable.has(tool.name) ? tool : {
        ...tool,
        execute: async (id: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) => {
          const release = await this.subtaskCoordinator.acquireProjectLock(session().projectId, write.has(tool.name) ? 'write' : 'read', signal)
          try { return await tool.execute(id, params, signal, onUpdate) } finally { release() }
        },
      })
    const publicTools = !options.runId ? tools : tools.map(tool => ({
      ...tool,
      execute: async (providerCallId: string, args: unknown, signal?: AbortSignal, onUpdate?: unknown) => {
        const id = prepareTool(providerCallId, tool.name, args)
        updatePublic(id, { status: signal?.aborted ? 'cancelled' : 'running' })
        return executionRecord.run(id, async () => {
          try {
            signal?.throwIfAborted()
            const result = await tool.execute(providerCallId, args, signal, onUpdate)
            const output = publicHarnessToolOutput(result, secrets)
            const status = signal?.aborted ? 'cancelled' : result?.isError ? 'failed' : 'ok'
            updatePublic(id, { status, ...(output ? { output } : {}), ...(status === 'failed' ? { error: output?.text || '工具执行失败' } : status === 'cancelled' ? { error: '运行已停止' } : {}), completedAt: Date.now() })
            return result
          } catch (error) {
            updatePublic(id, { status: signal?.aborted ? 'cancelled' : 'failed', error: publicHarnessText(error instanceof Error ? error.message : String(error), secrets).text, completedAt: Date.now() })
            throw error
          } finally { recordedTools.delete(id) }
        })
      },
    }))
    return { tools: publicTools as any, descriptors, prepareTool, preflight, settleTool, cancelPending }
  }

  async runMessage(sender: WebContents, sessionId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection, planning = false) {
    if (this.messageQueue.hasPending(sessionId)) throw new Error('请先处理待发送消息')
    return this.runImmediateMessage(sender, sessionId, message, references, selection, planning)
  }

  private permissionCommand(text: string) {
    if (!text.startsWith('/perm ')) return
    const mode = text.slice(6).trim() as PermissionMode
    if (!['default', 'auto-approve', 'full'].includes(mode)) throw new Error('权限档位应为 default、auto-approve 或 full')
    return mode
  }

  private assertQueuedScope(session: HarnessSession, scope: HarnessMessageQueueScope) {
    if (session.archivedAt) throw new Error('目标会话不可用')
    if (session.projectId !== scope.projectId || session.workingDirectory !== scope.workingDirectory) throw new Error('工作目录已变化，请撤回消息后重新发送')
  }

  private async runImmediateMessage(sender: WebContents, sessionId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection, planning = false) {
    this.assertGitAdmission(sessionId)
    const text = message.trim()
    if (!text) throw new Error('请输入消息')
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    const mode = this.permissionCommand(text)
    if (mode) {
      this.database.harness.setPermission(sessionId, mode)
      this.emit(sender, { sessionId, type: 'status', payload: { permissionMode: mode } })
      return
    }
    this.requireProvider(selection)
    return this.runPreparedMessage(sender, sessionId, text, this.database.harness.resolveMessageAttachments(sessionId, references), selection, planning)
  }

  submitMessage(sender: WebContents, sessionId: string, submissionId: string, message: string, references: HarnessFileReference[], selection: ModelSelection, planning: boolean): HarnessMessageSubmissionReceipt
  submitMessage(sender: WebContents, sessionId: string, submissionId: string, message: string, references: HarnessFileReference[], selection: ModelSelection, planning: boolean, options: HarnessMessageSubmissionOptions): HarnessMessageSubmissionResult | Promise<HarnessMessageSubmissionReceipt>
  submitMessage(sender: WebContents, sessionId: string, submissionId: string, message: string, references: HarnessFileReference[], selection: ModelSelection, planning: boolean, options?: HarnessMessageSubmissionOptions) {
    const text = message.trim()
    if (!text) throw new Error('请输入消息')
    const replay = options ? this.messageQueue.replayWithOptions(sessionId, submissionId, { text, references, selection, planning }, options) : this.messageQueue.replay(sessionId, submissionId, { text, references, selection, planning })
    if (replay) return replay
    const session = this.database.harness.getSession(sessionId)
    this.assertProjectGitAvailable(session.projectId)
    if (session.archivedAt) throw new Error('目标会话不可用')
    const mode = this.permissionCommand(text)
    if (!mode || options?.delivery === 'guide') this.requireProvider(selection)
    const attachments = mode ? [] : this.database.harness.resolveMessageAttachments(sessionId, references)
    const input = { sessionId, submissionId, text, references, selection, planning, permissionMode: session.permissionMode }
    const scope = { projectId: session.projectId, workingDirectory: session.workingDirectory }
    return options ? this.messageQueue.submit(sender, input, attachments, scope, options) : this.messageQueue.submit(sender, input, attachments, scope)
  }

  getMessageQueue(sessionId: string) {
    this.database.harness.getSession(sessionId)
    return this.messageQueue.get(sessionId)
  }

  withdrawMessage(sessionId: string, itemId: string) {
    this.database.harness.getSession(sessionId)
    return this.messageQueue.withdraw(sessionId, itemId)
  }

  resumeMessageQueue(sessionId: string) {
    this.database.harness.getSession(sessionId)
    return this.messageQueue.resume(sessionId)
  }

  reorderMessageQueue(sessionId: string, itemId: string, beforeItemId: string | null) {
    this.database.harness.getSession(sessionId)
    return this.messageQueue.reorder(sessionId, itemId, beforeItemId)
  }

  sendQueuedMessageNow(sessionId: string, itemId: string, expectedRunId?: string) {
    this.database.harness.getSession(sessionId)
    return this.messageQueue.sendNow(sessionId, itemId, expectedRunId)
  }

  assertSessionMutable(sessionId: string) {
    this.assertGitAdmission(sessionId)
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    if (this.messageQueue.hasPending(sessionId)) throw new Error('请先处理待发送消息')
  }

  private runPreparedMessage(sender: WebContents, sessionId: string, text: string, attachments: HarnessMessageAttachment[], selection: ModelSelection | undefined, planning: boolean, options: RunOptions = {}, started?: () => void) {
    const { provider, apiKey } = this.requireProvider(selection)
    const session = this.database.harness.getSession(sessionId)
    return this.runAgent(sender, sessionId, session, selection!, provider, apiKey, { ...options, input: { text, attachments, started }, ...(planning ? { planning: true } : {}) })
  }

  private requireProvider(selection?: ModelSelection) {
    if (!selection?.providerId || !selection.modelId) throw new Error('请先选择一个可用模型')
    const provider = this.database.models.get(selection.providerId)
    const configuredModel = provider && providerModel(provider, selection.modelId)
    if (!configuredModel) throw new Error('所选模型不属于当前供应商')
    const apiKey = this.database.models.getSecret(selection.providerId)
    if (!isModelProviderAvailable(provider) || !configuredModel.enabled || (provider.authMode === 'api-key' && !apiKey)) throw new Error('当前 Agent 模型不可用，请检查 Provider 配置')
    return { provider, model: configuredModel, apiKey }
  }

  listMemory(scope: MemoryScope, projectId?: string) { return this.memoryCoordinator.list(scope, projectId) }
  rememberMemory(content: string) { return this.memoryCoordinator.remember(content) }
  updateMemory(scope: MemoryScope, id: string, content: string, projectId?: string) { return this.memoryCoordinator.update(scope, id, content, projectId) }
  deleteMemory(scope: MemoryScope, id: string, projectId?: string) { return this.memoryCoordinator.delete(scope, id, projectId) }
  listPendingMemory() { return this.memoryCoordinator.listPending() }
  discardPendingMemory(candidateId: string) { this.memoryCoordinator.discardPending(candidateId) }
  retryMemory(candidateId: string) { return this.memoryCoordinator.retry(candidateId) }

  async saveProjectMemory(sender: WebContents, sessionId: string, selection?: ModelSelection) {
    return this.memoryCoordinator.saveProject(sender, sessionId, selection, {
      isRunning: id => this.runCoordinator.isRunning(id),
      requireProvider: value => this.requireProvider(value),
      toAgentMessage: (message, model) => this.toAgentMessage(message, model),
    })
  }

  async rerun(sender: WebContents, sessionId: string, selection?: ModelSelection) {
    this.assertGitAdmission(sessionId)
    if (this.messageQueue.hasPending(sessionId)) throw new Error('请先处理待发送消息')
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    return this.runAgent(sender, sessionId, this.database.harness.regenerate(sessionId), selection, provider, apiKey)
  }

  async editAndRerun(sender: WebContents, sessionId: string, messageId: string, content: string, selection?: ModelSelection) {
    this.assertGitAdmission(sessionId)
    if (this.messageQueue.hasPending(sessionId)) throw new Error('请先处理待发送消息')
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    return this.runAgent(sender, sessionId, this.database.harness.editUserMessageAndTruncate(sessionId, messageId, content), selection, provider, apiKey)
  }

  async runAutomation(sessionId: string, message: string, selection: ModelSelection, permissionMode: PermissionMode) {
    this.assertGitAdmission(sessionId)
    if (this.messageQueue.hasPending(sessionId) || this.database.harness.getSession(sessionId).pendingInteraction?.status === 'waiting') throw new Error('请先处理当前任务的确认或待发送消息')
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    const updated = this.database.harness.addMessage(sessionId, 'user', message.trim())
    return this.runAgent(undefined, sessionId, updated, selection, provider, apiKey, { origin: 'automation', permissionMode })
  }

  async confirmPlan(sender: WebContents, sessionId: string, planId: string, selection?: ModelSelection) {
    this.assertGitAdmission(sessionId)
    return this.planCoordinator.confirm(sender, sessionId, planId, selection)
  }

  async answerInteraction(sender: WebContents, sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection?: ModelSelection) {
    this.assertGitAdmission(sessionId)
    return this.planCoordinator.answer(sender, sessionId, interactionId, answers, selection)
  }

  async continuePlan(sender: WebContents, sessionId: string, planId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection) {
    this.assertGitAdmission(sessionId)
    return this.planCoordinator.continue(sender, sessionId, planId, message, references, selection)
  }

  cancelPlan(sender: WebContents, sessionId: string, planId: string) {
    return this.planCoordinator.cancel(sender, sessionId, planId)
  }

  private async runAgent(sender: WebContents | undefined, sessionId: string, session: HarnessSession, selection: ModelSelection, provider: any, apiKey: string, options: RunOptions = {}) {
    const runId = randomUUID()
    const controller = this.runCoordinator.begin(sessionId, runId, options.laneToken)
    let status: HarnessRunCompleteEvent['status'] = 'failed'
    let content: string | undefined
    let failed = false
    try {
      const result = await this.executeAgent(sender, sessionId, session, selection, provider, apiKey, options, runId, controller)
      status = result.interrupted ? 'aborted' : 'completed'
      content = result.content
      return result
    } catch (error) {
      failed = true
      throw error
    } finally {
      try {
        await this.runCoordinator.finish(sender, sessionId, runId)
      } catch (error) {
        status = 'failed'
        if (!failed) throw error
      } finally {
        let latest = session
        try { latest = this.database.harness.getSession(sessionId) } catch { /* Keep teardown failures from masking the original runtime error. */ }
        this.runCoordinator.publishComplete({ session: latest, origin: options.origin || 'manual', status, content })
        if (!options.laneToken) this.messageQueue.onRunSettled(sessionId, status)
      }
    }
  }

  private async executeAgent(sender: WebContents | undefined, sessionId: string, session: HarnessSession, selection: ModelSelection, provider: any, apiKey: string, options: RunOptions, runId: string, controller: AbortController) {
    const origin = options.origin || 'manual'
    const text = options.input?.text || [...session.messages].reverse().find(message => message.role === 'user')?.content
    if (!text) throw new Error('没有可运行的对话')
    let inputStarted = !options.input
    const appendInput = () => {
      if (!options.input) return
      session = this.database.harness.addMessage(sessionId, 'user', options.input.text, options.input.attachments)
      inputStarted = true
      options.input.started?.()
      if (options.planning && !session.activePlan) {
        const plan: HarnessPlan = { id: randomUUID(), status: 'planning', request: text, understanding: '', steps: [], risks: [], createdAt: Date.now(), updatedAt: Date.now() }
        session = this.database.harness.setActivePlan(sessionId, plan)
        this.emit(sender, { sessionId, type: 'plan-updated', payload: { plan } })
      }
    }
    const startedAt = Date.now()
    let assistantMessageId = randomUUID()
    const activities: HarnessRunActivity[] = [{ id: 'thinking-0', label: '正在思考', status: 'running', startedAt }]
    let output = '', pendingAssistantDelta = ''
    let completedOutput = '', responseTextOffset = 0
    let parts: HarnessMessagePart[] = []
    let partsDirty = false, partSerial = 0, responseIndex = 0
    const responseParts = new Map<string, Extract<HarnessMessagePart, { text: string }>>()
    const pendingReasoning = new Map<string, string>()
    let openPart: Extract<HarnessMessagePart, { text: string }> | undefined
    let assistantPersistTimer: ReturnType<typeof setTimeout> | undefined
    const flushAssistantDelta = () => {
      if (assistantPersistTimer) clearTimeout(assistantPersistTimer)
      assistantPersistTimer = undefined
      if (!pendingAssistantDelta && !partsDirty) return
      this.database.harness.appendAssistantDelta(sessionId, pendingAssistantDelta, { runId, messageId: assistantMessageId, parts })
      pendingAssistantDelta = ''
      partsDirty = false
    }
    const scheduleAssistantPersist = () => {
      if (!assistantPersistTimer) assistantPersistTimer = setTimeout(flushAssistantDelta, ASSISTANT_PERSIST_INTERVAL_MS)
    }
    const appendReasoning = (part: Extract<HarnessMessagePart, { text: string }>, delta: string, final = false) => {
      let pending = (pendingReasoning.get(part.id) || '') + delta
      if (apiKey) pending = pending.split(apiKey).join('[已隐藏]')
      if (final && pending && apiKey.startsWith(pending)) pending = '[已隐藏]'
      let suffixLength = 0
      if (!final && apiKey) for (let length = Math.min(apiKey.length - 1, pending.length); length > 0; length--) {
        if (pending.endsWith(apiKey.slice(0, length))) { suffixLength = length; break }
      }
      const safe = suffixLength ? pending.slice(0, -suffixLength) : pending
      pendingReasoning.set(part.id, suffixLength ? pending.slice(-suffixLength) : '')
      const offset = part.text.length
      const bounded = boundHarnessText(part.text + safe)
      part.text = bounded.text
      if (bounded.truncated) part.truncated = true
      const kept = part.text.slice(offset)
      partsDirty = true
      if (kept) this.emit(sender, { sessionId, type: 'message-part', payload: { messageId: assistantMessageId, partId: part.id, delta: kept, offset } })
    }
    const finishPart = (part: Extract<HarnessMessagePart, { text: string }> | undefined, state: 'complete' | 'interrupted' = 'complete') => {
      if (!part || part.state !== 'streaming') return
      if (part.type === 'reasoning') { appendReasoning(part, '', true); pendingReasoning.delete(part.id) }
      Object.assign(part, { state, completedAt: Date.now() })
      partsDirty = true
      this.emit(sender, { sessionId, type: 'message-part', payload: { messageId: assistantMessageId, part: { ...part } } })
      if (openPart === part) openPart = undefined
    }
    const ensurePart = (type: 'text' | 'reasoning', contentIndex?: number) => {
      const key = `${responseIndex}:${contentIndex ?? type}`
      const existing = responseParts.get(key)
      if (existing?.type === type && existing.state === 'streaming') { openPart = existing; return existing }
      finishPart(openPart)
      const part: Extract<HarnessMessagePart, { text: string }> = { id: `${runId}:part-${partSerial++}`, type, text: '', state: 'streaming', startedAt: Date.now() }
      parts.push(part)
      responseParts.set(key, part)
      openPart = part
      partsDirty = true
      this.emit(sender, { sessionId, type: 'message-part', payload: { messageId: assistantMessageId, part: { ...part } } })
      return part
    }
    const appendPart = (type: 'text' | 'reasoning', delta: string, contentIndex?: number) => {
      const part = ensurePart(type, contentIndex)
      if (type === 'reasoning') { appendReasoning(part, delta); scheduleAssistantPersist(); return }
      const offset = part.text.length
      const text = part.text + delta
      const kept = text.slice(part.text.length)
      part.text = text
      partsDirty = true
      if (kept) this.emit(sender, { sessionId, type: 'message-part', payload: { messageId: assistantMessageId, partId: part.id, delta: kept, offset } })
      scheduleAssistantPersist()
    }
    const appendToolPart = (toolCallId: string) => {
      finishPart(openPart)
      if (parts.some(part => part.type === 'tool' && part.toolCallId === toolCallId)) return
      const part: HarnessMessagePart = { id: `${runId}:part-${partSerial++}`, type: 'tool', toolCallId }
      parts.push(part)
      partsDirty = true
      // 工具/审批边界必须先落盘；刷新不能把工具前的正文挪到工具之后。
      flushAssistantDelta()
      this.emit(sender, { sessionId, type: 'message-part', payload: { messageId: assistantMessageId, part } })
    }
    let subtasks: SubtaskRuntime | undefined
    const publishActivities = () => {
      const currentSubtasks = subtasks?.list() || []
      this.database.harness.setActiveRun(sessionId, { id: runId, messageId: assistantMessageId, startedAt, activities, subtasks: currentSubtasks })
      this.emit(sender, { sessionId, type: 'run-activity', payload: { messageId: assistantMessageId, activities, subtasks: currentSubtasks } })
    }
    const finishActivity = (id: string, status: HarnessRunActivity['status'] = 'completed', detail?: string) => {
      const activity = activities.find(item => item.id === id)
      if (activity?.status === 'running') Object.assign(activity, { status, completedAt: Date.now(), ...(detail ? { detail } : {}) })
    }
    const startActivity = (id: string, label: string, detail?: string) => {
      const existing = activities.find(item => item.id === id)
      if (!existing) activities.push({ id, label, ...(detail ? { detail } : {}), status: 'running', startedAt: Date.now() })
      else if (existing.status !== 'running') { Object.assign(existing, { status: 'running', startedAt: Date.now() }); delete existing.completedAt }
    }
    const finishRunningActivities = (status: HarnessRunActivity['status']) => activities.filter(item => item.status === 'running').forEach(item => Object.assign(item, { status, completedAt: Date.now() }))
    let planCursor = 0
    const planSteps = () => activities.filter(item => item.kind === 'plan')
    const applyPlan = (steps: unknown) => {
      const normalized = normalizePlanSteps(steps)
      if (!normalized.length) return
      const now = Date.now()
      const planActivities = normalized.map((step, index) => ({
        id: `plan-${index}`,
        label: step.label,
        detail: step.detail,
        status: 'pending',
        kind: 'plan',
        startedAt: now,
      })) as HarnessRunActivity[]
      const others = activities.filter(item => item.kind !== 'plan')
      activities.splice(0, activities.length, ...planActivities, ...others)
      planCursor = 0
    }
    const advancePlan = (status: 'running' | 'completed' | 'failed') => {
      const current = planSteps()[planCursor]
      if (!current) return
      if (status === 'running' && current.status === 'pending') {
        current.status = 'running'
      } else if (status === 'completed' && (current.status === 'pending' || current.status === 'running')) {
        Object.assign(current, { status: 'completed', completedAt: Date.now() })
        planCursor++
      } else if (status === 'failed' && current.status === 'running') {
        Object.assign(current, { status: 'failed', completedAt: Date.now() })
        planCursor++
      }
    }
    const modelConfig = providerModel(provider, selection.modelId)!
    let autoTitleRevision: number | undefined
    let model: any
    let models!: ReturnType<typeof createModels>
    let agent!: Agent
    const guidanceMessages = new WeakMap<object, NonNullable<ReturnType<HarnessMessageQueue['stageGuide']>>>()
    let registeredTools: ReturnType<HarnessRuntime['tools']> | undefined
    try {
      if (!options.laneToken) appendInput()
      session = this.database.harness.updateSession({ ...session, modelProviderId: provider.id, modelId: selection.modelId, status: 'active' })
      const autoTitleInput = origin === 'manual' && !options.laneToken ? firstTurnTitleInput(session) : undefined
      autoTitleRevision = autoTitleInput && session.titleSource === 'auto' ? this.database.harness.reserveAutoTitle(sessionId) : undefined
      this.emit(sender, { sessionId, runId, type: 'status', payload: { state: 'running' } })
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'running', timestamp: startedAt })
      this.database.harness.setActiveRun(sessionId, { id: runId, messageId: assistantMessageId, startedAt, activities, subtasks: [] })
      this.emit(sender, { sessionId, type: 'run-start', payload: { messageId: assistantMessageId, startedAt, activities, subtasks: [] } })
      await this.memoryCoordinator.waitForPending(sessionId, controller.signal)
      controller.signal.throwIfAborted()
      session = this.database.harness.getSession(sessionId)
      if (options.scope) this.assertQueuedScope(session, options.scope)
      const configuredProvider = createHarnessModelProvider(provider, modelConfig, apiKey)
      model = configuredProvider.model
      models = configuredProvider.models
      session = await this.compactContext(sender, session, model, models, controller, modelConfig.reasoning ? selection.thinkingLevel || 'medium' : 'off', activities, publishActivities, options.laneToken ? options.input : undefined)
      controller.signal.throwIfAborted()
      if (options.scope) {
        session = this.database.harness.getSession(sessionId)
        this.assertQueuedScope(session, options.scope)
        appendInput()
        publishActivities()
        const autoTitleInput = origin === 'manual' ? firstTurnTitleInput(session) : undefined
        autoTitleRevision = autoTitleInput && session.titleSource === 'auto' ? this.database.harness.reserveAutoTitle(sessionId) : undefined
      }
      const memory = options.planning ? { globalMemory: '', projectMemory: '', loaded: false } : this.memoryCoordinator.loadForRun(sender, sessionId, session, text, activities)
      const { globalMemory, projectMemory } = memory
      if (memory.loaded) publishActivities()
      registeredTools = this.tools(sender, sessionId, { planning: options.planning, runId, toolScope: () => responseIndex, onTool: appendToolPart, secrets: [apiKey] })
      const preferences = this.database.getSnapshot().preferences
      const activeSkills = options.planning ? [] : this.database.skills.resolve(session.activeSkillIds || [])
      const thinkingLevel = modelConfig.reasoning ? selection.thinkingLevel || 'medium' : 'off'
      let taskTools: any[] = []
      if (!options.planning && origin === 'manual' && session.delegationEnabled !== false && session.workingDirectory) {
        const created = this.subtaskCoordinator.create({
          sender, sessionId, session, model, streamFn: models.streamSimple.bind(models) as any, thinkingLevel, pricing: modelConfig.pricing,
          publishActivities,
          toolsForTask: (role, taskId) => this.tools(sender, sessionId, { role, subtaskId: taskId }).tools,
          preflightToolCall: (name, args) => this.preflightSubtaskToolCall(name, args),
          getParentAgent: () => agent,
        })
        subtasks = created.runtime
        this.runCoordinator.attachSubtasks(sessionId, subtasks)
        taskTools = created.tools
      }
      agent = new Agent({
          initialState: {
          systemPrompt: buildMiraSystemPrompt({
            tone: normalizeAssistantTone(preferences.assistantTone),
            identity: resolveMiraIdentity({
              userName: preferences.miraUserName,
              assistantName: preferences.miraAssistantName,
            }),
            context: {
              model: { providerName: provider.name, modelName: selection.modelId },
              environment: this.environmentContext(session, origin, options.permissionMode),
              instructions: this.database.instructions.resolve(session.workingDirectory),
              activeSkills: activeSkills.map(skill => ({ name: skill.name, instructions: skill.instructions })),
              globalMemory,
              projectMemory,
            },
          }) + runPromptSuffix({ planning: options.planning, activePlan: session.activePlan, origin }),
          model,
          thinkingLevel,
          messages: this.agentMessages(session, model),
          tools: options.planning ? registeredTools.tools : [...registeredTools.tools, ...taskTools],
        } as any,
        streamFn: models.streamSimple.bind(models) as any,
        sessionId,
        beforeToolCall: ({ toolCall, args }) => registeredTools!.preflight(toolCall.id, toolCall.name, args, origin === 'automation', options.permissionMode, controller.signal),
        prepareNextTurnWithContext: () => {
          if (controller.signal.aborted || !this.runCoordinator.guidanceSelection(sessionId, runId)) return
          const guidance = this.messageQueue.stageGuide(sessionId, runId)
          if (!guidance) return
          controller.signal.throwIfAborted()
          this.assertQueuedScope(this.database.harness.getSession(sessionId), guidance.scope)
          const message = { role: 'user' as const, content: guidance.item.text, timestamp: Date.now() }
          guidanceMessages.set(message, guidance)
          agent.steer(message)
        },
      })
      this.runCoordinator.attachAgent(sessionId, agent, selection)
    } catch (error) {
      const aborted = controller.signal.aborted
      if (inputStarted) {
        finishRunningActivities('failed')
        publishActivities()
        const completedAt = Date.now()
        const run: HarnessRunSummary = { startedAt, completedAt, durationMs: completedAt - startedAt, activities, status: aborted ? 'stopped' : 'failed', ...(aborted ? {} : { error: error instanceof Error ? error.message : String(error) }) }
        this.database.harness.finalizeAssistantMessage(sessionId, { run, runId, messageId: assistantMessageId, parts, interrupted: aborted })
        this.database.harness.setStatus(sessionId, aborted ? 'active' : 'failed')
        this.emit(sender, { sessionId, type: 'message-complete', payload: { messageId: assistantMessageId, run } })
        if (!aborted) this.emit(sender, { sessionId, type: 'error', payload: { message: run.error } })
      }
      if (aborted) return { content: '', interrupted: true }
      throw error
    }
    let planningInteractionCanonical = false
    const sources: HarnessSource[] = []
    const parentUsages: HarnessTokenUsage[] = []
    let assistantFinalized = false
    const consumeGuidance = (engineMessage: object) => {
      const guidance = guidanceMessages.get(engineMessage)
      if (!guidance) return
      controller.signal.throwIfAborted()
      this.assertQueuedScope(this.database.harness.getSession(sessionId), guidance.scope)
      const previousAssistantMessageId = assistantMessageId
      const nextAssistantMessageId = randomUUID()
      const message: HarnessMessage = { id: guidance.item.id, role: 'user', content: guidance.item.text, runId, delivery: 'guide', submissionId: guidance.item.submissionId, createdAt: Date.now() }
      let previousAssistantMessage: HarnessMessage | undefined
      const consumed = this.messageQueue.consumeGuide(sessionId, guidance.item.id, runId, () => {
        for (const part of parts) if (part.type !== 'tool') finishPart(part)
        flushAssistantDelta()
        // Even a tool-only assistant turn owns an explicit segment before guidance.
        if (!parts.length && !output) this.database.harness.appendAssistantDelta(sessionId, '', { runId, messageId: assistantMessageId, parts })
        const citations = finalizeAssistantCitations(output, sources, parts)
        session = this.database.harness.appendGuidanceMessage(sessionId, message, { id: assistantMessageId, content: citations.content, parts: citations.parts || parts, sources: citations.sources }, nextAssistantMessageId)
        previousAssistantMessage = session.messages.find(item => item.id === previousAssistantMessageId)
        completedOutput += citations.content
        assistantMessageId = nextAssistantMessageId
        output = ''; pendingAssistantDelta = ''; parts = []; partsDirty = false; responseTextOffset = 0
        responseParts.clear(); pendingReasoning.clear(); openPart = undefined
      })
      if (!consumed) throw new Error('回复已停止')
      guidanceMessages.delete(engineMessage)
      this.emit(sender, { sessionId, type: 'message-boundary', payload: { message, previousAssistantMessageId, previousAssistantMessage, nextAssistantMessageId, queueItemId: guidance.item.id, submissionId: guidance.item.submissionId } })
      publishActivities()
    }
    const unsubscribe = agent.subscribe((event: any) => {
      if (event.type === 'agent_end') {
        this.runCoordinator.setGuidanceAccepting(sessionId, runId, false)
        agent.clearSteeringQueue()
      }
      if (event.type === 'message_end' && event.message?.role === 'user') consumeGuidance(event.message)
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        const usage = tokenUsage(event.message.usage)
        if (usage) parentUsages.push(usage)
      }
      if (event.type === 'message_start' && event.message?.role === 'assistant') { finishPart(openPart); responseIndex++; responseTextOffset = output.length }
      if (event.type === 'message_start' && !activities.some(item => item.status === 'running')) {
        startActivity(`thinking-${activities.length}`, '正在思考')
        publishActivities()
      }
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        const thinking = activities.find(item => item.status === 'running' && item.label === '正在思考')
        const startingAnswer = !activities.some(item => item.id === 'answering')
        if (thinking) finishActivity(thinking.id)
        startActivity('answering', '正在生成回复')
        if (thinking || startingAnswer) publishActivities()
        const delta = event.assistantMessageEvent.delta as string
        output += delta
        pendingAssistantDelta += delta
        appendPart('text', delta, event.assistantMessageEvent.contentIndex)
        scheduleAssistantPersist()
        this.emit(sender, { sessionId, type: 'message-delta', payload: { messageId: assistantMessageId, delta } })
      }
      if (event.type === 'message_update') {
        const update = event.assistantMessageEvent
        if (update?.type === 'text_start' || update?.type === 'thinking_start') ensurePart(update.type === 'text_start' ? 'text' : 'reasoning', update.contentIndex)
        if (update?.type === 'thinking_delta' && typeof update.delta === 'string') appendPart('reasoning', update.delta, update.contentIndex)
        if (update?.type === 'text_end' || update?.type === 'thinking_end') finishPart(responseParts.get(`${responseIndex}:${update.contentIndex ?? (update.type === 'text_end' ? 'text' : 'reasoning')}`))
        if (update?.type === 'toolcall_end' && update.toolCall?.id && update.toolCall?.name) registeredTools?.prepareTool(update.toolCall.id, update.toolCall.name, update.toolCall.arguments)
      }
      if (event.type === 'tool_execution_start') {
        finishActivity('answering')
        registeredTools?.prepareTool(event.toolCallId, event.toolName, event.args)
        activities.filter(item => item.status === 'running' && item.label === '正在思考').forEach(item => finishActivity(item.id))
        if (event.toolName === 'set_plan') {
          applyPlan(event.args?.steps)
          publishActivities()
        } else {
          advancePlan('running')
          startActivity(`tool-${event.toolCallId}`, toolActivityLabel(event.toolName, event.args), activityDetail(event.toolName, event.args))
          publishActivities()
        }
      }
      if (event.type === 'tool_execution_end') {
        registeredTools?.settleTool(event.toolCallId, event.toolName, event.args, event.result, Boolean(event.isError), controller.signal.aborted)
        if (event.toolName === 'set_plan') return
        if (!event.isError && (event.toolName === 'web_search' || event.toolName === 'web_fetch')) {
          for (const source of sourcesFromWebToolResult(event.toolName, event.result)) {
            if (!sources.some(item => item.index === source.index)) sources.push(source)
          }
        }
        advancePlan(event.isError ? 'failed' : 'completed')
        const suffix = event.isError ? '执行失败' : '执行完成'
        const activity = activities.find(item => item.id === `tool-${event.toolCallId}`)
        finishActivity(`tool-${event.toolCallId}`, event.isError ? 'failed' : 'completed', `${activity?.detail || '工具调用'}\n${suffix}`)
        publishActivities()
      }
    })
    const prompt = async (message: string) => {
      this.runCoordinator.setGuidanceAccepting(sessionId, runId, origin === 'manual' && !options.planning)
      try { await agent.prompt(message) }
      finally {
        this.runCoordinator.setGuidanceAccepting(sessionId, runId, false)
        agent.clearSteeringQueue()
      }
    }
    this.assistantSnapshotFlushers.set(sessionId, flushAssistantDelta)
    try {
      controller.signal.throwIfAborted()
      await prompt(text)
      if (options.planning && !controller.signal.aborted && !agent.state.errorMessage && this.database.harness.getSession(sessionId).pendingInteraction?.status !== 'waiting') {
        await prompt('系统提醒：当前仍处于计划模式。请调用 ask_user 提出必要澄清，或调用 present_plan 提交可确认的完整方案；不要只在普通回复中写问题或计划。')
        planningInteractionCanonical = this.database.harness.getSession(sessionId).pendingInteraction?.status === 'waiting'
        if (!controller.signal.aborted && this.database.harness.getSession(sessionId).pendingInteraction?.status !== 'waiting') {
          throw new Error('模型未提交可确认的计划或澄清问题，请重新描述任务后重试')
        }
      }
      if (controller.signal.aborted) throw new Error('回复已停止')
      // A parent is not allowed to leave child work behind. If it did not
      // converge itself, wait and give it one explicit convergence turn.
      if (subtasks?.active().length) {
        await subtasks.wait()
        await prompt('系统提醒：你创建的子任务已经结束。请调用 wait_for_tasks 读取报告，整合结果后再给出最终答复；不要再创建子任务。')
      }
      if (controller.signal.aborted) throw new Error('回复已停止')
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage)
      const finalMessage = agent.state.messages.at(-1)
      const finalText = assistantText(finalMessage)
      if (finalText && finalText.startsWith(output.slice(responseTextOffset)) && finalText !== output.slice(responseTextOffset)) {
        const delta = finalText.slice(output.length - responseTextOffset)
        if (delta) {
          pendingAssistantDelta += delta
          appendPart('text', delta)
          this.emit(sender, { sessionId, type: 'message-delta', payload: { messageId: assistantMessageId, delta } })
        }
        output += delta
      }
      if (planningInteractionCanonical) {
        output = this.database.harness.getSession(sessionId).pendingInteraction?.kind === 'question'
          ? '我需要先确认几个关键信息。'
          : '方案已整理，请确认是否开始执行。'
        finishPart(openPart)
        parts = parts.filter(part => part.type !== 'text')
        responseParts.clear()
        appendPart('text', output)
      }
      if (!output && options.planning && this.database.harness.getSession(sessionId).pendingInteraction?.status === 'waiting') {
        output = this.database.harness.getSession(sessionId).pendingInteraction?.kind === 'question' ? '我需要先确认几个关键信息。' : '方案已整理，请确认是否开始执行。'
        pendingAssistantDelta += output
        appendPart('text', output)
        this.emit(sender, { sessionId, type: 'message-delta', payload: { messageId: assistantMessageId, delta: output } })
      }
      if (!output) throw new Error('模型没有返回文本')
      for (const part of parts) if (part.type !== 'tool') finishPart(part)
      finishRunningActivities('completed')
      const completedAt = Date.now()
      const parentUsage = mergeUsage(parentUsages) || tokenUsage(finalMessage && typeof finalMessage === 'object' ? (finalMessage as { usage?: unknown }).usage : undefined)
      const pricedParentUsage = parentUsage ? withUsageCost(parentUsage, modelConfig.pricing) : undefined
      const childUsage = mergeUsage(subtasks?.list().map(task => task.usage) || [])
      const run: HarnessRunSummary = { status: 'completed', startedAt, completedAt, durationMs: completedAt - startedAt, activities, ...(subtasks?.list().length ? { subtasks: subtasks.list(), usage: { parent: pricedParentUsage, children: childUsage, total: mergeUsage([pricedParentUsage, childUsage]) } } : {}) }
      flushAssistantDelta()
      const usage = contextUsage(this.agentMessages(this.database.harness.getSession(sessionId), model), model.contextWindow)
      run.contextUsage = usage
      const citations = finalizeAssistantCitations(output, sources, parts)
      output = citations.content
      parts = citations.parts || parts
      session = this.database.harness.finalizeAssistantMessage(sessionId, { content: output, run, runId, messageId: assistantMessageId, parts, usage: pricedParentUsage, sources: citations.sources })
      assistantFinalized = true
      session = this.publishContextUsage(sender, session, usage)
      this.database.harness.setStatus(sessionId, 'completed')
      if (!options.planning && this.database.harness.getSession(sessionId).activePlan?.status === 'executing') {
        const completedPlan = { ...this.database.harness.getSession(sessionId).activePlan!, status: 'completed' as const, updatedAt: Date.now() }
        this.database.harness.setActivePlan(sessionId, completedPlan)
        this.emit(sender, { sessionId, type: 'plan-updated', payload: { plan: completedPlan } })
      }
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
      this.emit(sender, { sessionId, type: 'message-complete', payload: { messageId: assistantMessageId, content: output, run, parts } })
      if (autoTitleRevision !== undefined && this.database.harness.isAutoTitleCurrent(sessionId, autoTitleRevision)) {
        void this.generateAutoTitle(sender, sessionId, models, model, autoTitleRevision)
      }
      if (origin === 'manual' && !options.planning) {
        this.memoryCoordinator.scheduleAutoSave(sender, sessionId, models, model, modelConfig.reasoning ? selection.thinkingLevel || 'medium' : 'off', (message, targetModel) => this.toAgentMessage(message, targetModel))
      }
      return { content: completedOutput + output, run }
    } catch (error) {
      finishRunningActivities('failed')
      publishActivities()
      const aborted = controller.signal.aborted
      for (const part of parts) if (part.type !== 'tool') finishPart(part, 'interrupted')
      registeredTools?.cancelPending(aborted ? '运行已停止' : '运行失败，工具未完成')
      flushAssistantDelta()
      if (!assistantFinalized) {
        const completedAt = Date.now()
        const citations = finalizeAssistantCitations(output, sources, parts)
        output = citations.content
        parts = citations.parts || parts
        const run: HarnessRunSummary = { startedAt, completedAt, durationMs: completedAt - startedAt, activities, status: aborted ? 'stopped' : 'failed', ...(aborted ? {} : { error: error instanceof Error ? error.message : String(error) }), ...(subtasks?.list().length ? { subtasks: subtasks.list() } : {}) }
        this.database.harness.finalizeAssistantMessage(sessionId, { content: output, run, runId, messageId: assistantMessageId, parts, interrupted: aborted, sources: citations.sources })
        assistantFinalized = true
        this.emit(sender, { sessionId, type: 'message-complete', payload: { messageId: assistantMessageId, content: output, run, parts } })
      }
      this.database.harness.setStatus(sessionId, aborted ? 'active' : 'failed')
      const failureAt = Date.now()
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: aborted ? 'aborted' : 'failed', timestamp: failureAt, durationMs: failureAt - startedAt, ...(aborted ? {} : { error: error instanceof Error ? error.message : String(error) }) })
      if (!aborted) {
        this.emit(sender, { sessionId, type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } })
        throw error
      }
      return { content: completedOutput + output, interrupted: true }
    } finally {
      try { flushAssistantDelta() } finally {
        this.runCoordinator.setGuidanceAccepting(sessionId, runId, false)
        agent.clearSteeringQueue()
        if (this.assistantSnapshotFlushers.get(sessionId) === flushAssistantDelta) this.assistantSnapshotFlushers.delete(sessionId)
        unsubscribe()
      }
    }
  }

  abort(sessionId: string, expectedRunId?: string) {
    const current = this.runCoordinator.currentRunId(sessionId)
    if (expectedRunId !== undefined && current !== undefined && current !== expectedRunId) return false
    const stopped = this.runCoordinator.abort(sessionId, expectedRunId)
    const cancelled = this.messageQueue.cancelPromotion(sessionId, expectedRunId)
    if (stopped || cancelled) this.messageQueue.pause(sessionId, 'stopped')
    return stopped || cancelled
  }

  stopSubtasks(sessionId: string, ids?: string[]) { this.runCoordinator.stopSubtasks(sessionId, ids) }
}
