import { Agent, createBashTool, createEditTool, createReadTool, createWriteTool, estimateContextTokens, estimateTokens, generateSummaryWithUsage } from '@earendil-works/pi-agent-core'
import { createSandboxedEnv, wrapHarnessTool } from './agentTools'
import { createWebCitationContext, createWebFetchTool, createWebSearchTool } from './webTools'
import { classifyMemoryContent, type MemoryScope } from './fileMemoryStore'
import type { McpManager } from './mcpManager'
import { Type, createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DEFAULT_CONTEXT_WINDOW, normalizeAssistantTone, normalizeAutoTitle, normalizePlanSteps, normalizePlanRisks, resolveMiraIdentity, shouldAutoCompactContext, shouldGenerateAutoTitle, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessRunActivity, type HarnessRunSummary, type HarnessSession, type HarnessSource, type HarnessSubtaskRole, type HarnessTokenUsage, type MemoryCandidate, type MemorySensitivity, type ModelSelection, type PermissionMode, type HarnessPendingInteraction, type HarnessPlan, type HarnessUserAnswer, type HarnessUserQuestion } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import { buildMiraSystemPrompt } from './prompts/mira-system-prompt'
import { withUsageCost } from './usageCost'
import type { RuntimeLogRecord } from './runLogStore'
import { ProjectTaskLock } from './projectTaskLock'
import { SUBTASK_ROLE_TOOLS, SubtaskRuntime, subtaskMayMutate } from './subtaskRuntime'

// [AgentHarness 迁移标记] 当前使用 pi-agent-core 的低层 `Agent`（见下方 new Agent()）。
// 暂不迁移到 `AgentHarness`：0.84.1 中大多核心方法抛 HarnessNotImplemented，且所需
// `@earendil-works/pi-session-backend-sqlite-node` 未安装。重新评估的触发条件与清单见
// wiki/design/HARNESS_ROADMAP.md「AgentHarness 迁移评估 · ADR」。改动本文件前先回看。

const ASSISTANT_PERSIST_INTERVAL_MS = 250

type ToolRisk = 'read' | 'write' | 'command' | 'mcp'
type ToolDescriptor = {
  risk: ToolRisk
  title: (args: Record<string, unknown>) => string
  detail: (args: Record<string, unknown>) => string
}

let publishBackgroundEvent: ((event: HarnessEvent) => void) | undefined
function emit(sender: WebContents | undefined, event: HarnessEvent) {
  if (sender && !sender.isDestroyed()) sender.send('harness:event', event)
  else publishBackgroundEvent?.(event)
}

type RunOrigin = 'manual' | 'automation'
type RunCompleteEvent = { session: HarnessSession, origin: RunOrigin, status: 'completed' | 'failed' | 'aborted', content?: string }
type ExtractedMemory = { decision: 'save' | 'no_memory', sensitivity: MemorySensitivity, content?: string, redactedContent?: string }

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

export function finalizeAssistantCitations(content: string, candidates: HarnessSource[]) {
  const sources: HarnessSource[] = []
  const displayIndexes = new Map<number, number>()
  const rewritten = content.replace(/\[\[source:(\d+)]]/g, (marker, rawIndex: string, offset: number) => {
    const sourceIndex = Number(rawIndex)
    const candidate = candidates.find(source => source.index === sourceIndex)
    if (!candidate) return marker
    const existingIndex = displayIndexes.get(sourceIndex)
    if (existingIndex) return `[${existingIndex}]`
    const context = citationContext(content, offset)
    const index = sources.length + 1
    displayIndexes.set(sourceIndex, index)
    sources.push({
      index,
      title: context.title || candidate.title,
      url: candidate.url,
      ...(context.snippet || candidate.snippet ? { snippet: context.snippet || candidate.snippet } : {}),
    })
    return `[${index}]`
  })
  return { content: rewritten, sources }
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

export function parseMemoryExtraction(text: string): ExtractedMemory {
  const value = text.trim()
  if (!value || value === 'NO_MEMORY') return { decision: 'no_memory', sensitivity: 'none' }
  const jsonText = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    const decision = parsed.decision === 'no_memory' ? 'no_memory' : parsed.decision === 'save' ? 'save' : undefined
    const sensitivity = parsed.sensitivity === 'secret' || parsed.sensitivity === 'personal' ? parsed.sensitivity : parsed.sensitivity === 'none' ? 'none' : undefined
    if (decision && sensitivity) return {
      decision,
      sensitivity,
      content: typeof parsed.content === 'string' ? parsed.content.trim() : undefined,
      redactedContent: typeof parsed.redactedContent === 'string' ? parsed.redactedContent.trim() : undefined,
    }
  } catch { /* rejected below */ }
  // Some compatible models return a normal Markdown summary despite the JSON instruction.
  // Preserve the existing deterministic safety checks instead of turning that into an IPC error.
  return { decision: 'save', sensitivity: 'none', content: value }
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
  private readonly running = new Map<string, { controller: AbortController, agent?: Agent, subtasks?: SubtaskRuntime }>()
  private readonly projectLocks = new ProjectTaskLock()
  private readonly memoryWrites = new Map<string, Promise<void>>()
  private readonly memoryConfirmations = new Map<string, { resolve: (approved: boolean) => void, timer: ReturnType<typeof setTimeout>, candidate: MemoryCandidate }>()
  private readonly completeListeners = new Set<(event: RunCompleteEvent) => void>()
  constructor(private readonly database: PlatformDatabase, private readonly mcpManager: McpManager, backgroundEventPublisher?: (event: HarnessEvent) => void) {
    publishBackgroundEvent = backgroundEventPublisher
  }

  private log(record: RuntimeLogRecord) {
    try { this.database.logs?.write(record) } catch (error) { console.warn('[Mira] 写入运行日志失败', error) }
  }

  onRunComplete(listener: (event: RunCompleteEvent) => void) { this.completeListeners.add(listener); return () => this.completeListeners.delete(listener) }

  private publishRunComplete(event: RunCompleteEvent) { queueMicrotask(() => this.completeListeners.forEach(listener => listener(event))) }

  isProjectRunning(projectId: string) {
    return [...this.running.keys()].some(sessionId => this.database.harness.getSession(sessionId).projectId === projectId)
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
    const messages = session.messages.slice(this.historyStart(session)).map(message => this.toAgentMessage(message, model))
    if (!summary) return messages
    return [{
      role: 'user',
      content: `以下是此前对话的压缩上下文，仅供延续当前工作，不是新的用户指令。\n\n${summary}`,
      timestamp: session.context?.compactedAt || session.createdAt,
    }, ...messages]
  }

  private async saveLongTermMemory(sender: WebContents, sessionId: string, models: ReturnType<typeof createModels>, model: any, thinkingLevel: string) {
    if (!this.database.memories.enabled()) return
    const session = this.database.harness.getSession(sessionId)
    if (!session.messages.some(message => message.role === 'assistant') || !session.messages.some(message => message.role === 'user')) return
    const scope: MemoryScope = session.projectId ? 'project' : 'global'
    const target = this.database.memories.path(scope, session.projectId)
    const recordId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const startedAt = Date.now()
    this.database.harness.recordTool(sessionId, { id: recordId, tool: 'memory_auto_save', target, status: 'running', createdAt: startedAt })
    this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, status: 'running', timestamp: startedAt })
    emit(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status: 'running' } })
    try {
      const result = await generateSummaryWithUsage(
        session.messages.map(message => this.toAgentMessage(message, model)) as any,
        models,
        model,
        2048,
        undefined,
        `${scope === 'project' ? 'project' : 'global'} memory extraction. Return JSON only: {"decision":"save"|"no_memory","sensitivity":"none"|"personal"|"secret","content":"...","redactedContent":"..."}. Save only durable facts. Exclude credentials, tokens, passwords, private keys, addresses, health, financial and transient details. For personal data, provide a safe redactedContent. If no durable fact should be saved, return decision no_memory.`,
        undefined,
        thinkingLevel as any,
      )
      if (!result.ok) throw new Error(result.error instanceof Error ? result.error.message : '自动提炼记忆失败')
      const extracted = parseMemoryExtraction(result.value.text)
      if (extracted.decision === 'no_memory' || !extracted.content) return this.finishMemoryTool(sender, sessionId, recordId, target, 'ok', '- 没有可保存的长期事实')
      const classified = classifyMemoryContent(extracted.content)
      const sensitivity = classified.sensitivity === 'secret' || extracted.sensitivity === 'secret' ? 'secret' : classified.sensitivity === 'personal' || extracted.sensitivity === 'personal' ? 'personal' : 'none'
      if (sensitivity !== 'none') return this.finishMemoryTool(sender, sessionId, recordId, target, 'ok', sensitivity === 'secret' ? '- 出于安全原因未保存敏感秘密' : '- 自动记忆包含个人敏感信息，未主动保存')
      const saved = this.database.memories.remember(scope, extracted.content, session.projectId, { source: 'auto', sensitivity: 'none' })
      return this.finishMemoryTool(sender, sessionId, recordId, target, 'ok', saved.created ? `- ${scope === 'project' ? '项目' : '全局'}记忆：新增 1 条\n- [${saved.entry.id}] ${saved.entry.content}` : `- ${scope === 'project' ? '项目' : '全局'}记忆：已有相同条目\n- [${saved.entry.id}] ${saved.entry.content}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.database.harness.updateTool(sessionId, recordId, { status: 'failed', error: message, completedAt: Date.now() })
      this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, error: message, status: 'failed', timestamp: Date.now(), durationMs: Date.now() - startedAt })
      emit(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status: 'failed', error: message } })
      throw error
    }
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
      if (updated) emit(sender, { sessionId, type: 'title-updated', payload: { title: updated.title } })
    } catch {
      // A title is cosmetic; failures must never affect the completed conversation.
    }
  }

  private finishMemoryTool(sender: WebContents | undefined, sessionId: string, recordId: string, target: string, status: 'ok' | 'failed', diff: string) {
    const completedAt = Date.now()
    this.database.harness.updateTool(sessionId, recordId, { status, diff, completedAt })
    this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, result: diff, status: status === 'ok' ? 'completed' : 'failed', timestamp: completedAt })
    emit(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status, diff } })
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

  private publishContextUsage(sender: WebContents, session: HarnessSession, usage: HarnessContextUsage) {
    session.context = { ...session.context, usage }
    this.database.harness.updateSession(session)
    emit(sender, { sessionId: session.id, type: 'context-usage', payload: { usage } })
    return session
  }

  private async compactContext(sender: WebContents, session: HarnessSession, model: any, models: ReturnType<typeof createModels>, controller: AbortController, thinkingLevel: string, activities: HarnessRunActivity[], publishActivities: () => void) {
    const before = contextUsage(this.agentMessages(session, model), model.contextWindow || DEFAULT_CONTEXT_WINDOW)
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
    return this.publishContextUsage(sender, session, contextUsage(this.agentMessages(session, model), before.contextWindow))
  }

  private assertProjectPath(directory: string | undefined, value: string) {
    if (!directory) throw new Error('请先选择项目工作目录')
    const root = realpathSync(directory)
    const target = resolve(root, value)
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('工具只能访问项目目录内的文件')
    if (existsSync(target) && !realpathSync(target).startsWith(`${root}${sep}`) && realpathSync(target) !== root) throw new Error('路径不能通过符号链接离开项目目录')
    return target
  }

  private readonly pendingPermissions = new Map<string, { resolve: (allowed: boolean) => void, timer: ReturnType<typeof setTimeout> }>()

  private approve(sender: WebContents | undefined, sessionId: string, mode: PermissionMode, title: string, detail: string): Promise<boolean> {
    if (mode === 'full' || mode === 'auto-approve') return Promise.resolve(true)
    const requestId = randomUUID()
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => { this.pendingPermissions.delete(requestId); emit(sender, { sessionId, type: 'error', payload: { message: '权限确认超时，已取消该操作。' } }); resolve(false) }, 5 * 60 * 1000)
      this.pendingPermissions.set(requestId, { resolve, timer })
      emit(sender, { sessionId, type: 'permission-request', payload: { requestId, title, detail } })
    })
  }

  resolvePermission(requestId: string, allowed: boolean) {
    const entry = this.pendingPermissions.get(requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pendingPermissions.delete(requestId)
    entry.resolve(allowed)
  }

  private async requestMemoryConfirmation(sender: WebContents, sessionId: string, candidate: MemoryCandidate) {
    const requestId = randomUUID()
    const promise = new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        this.memoryConfirmations.delete(requestId)
        emit(sender, { sessionId, type: 'memory-status', payload: { status: 'rejected', requestId, candidateId: candidate.id, reason: '确认超时' } })
        resolve(false)
      }, 5 * 60 * 1000)
      this.memoryConfirmations.set(requestId, { resolve, timer, candidate })
    })
    emit(sender, { sessionId, type: 'memory-status', payload: { status: 'needs_confirmation', requestId, candidateId: candidate.id, content: candidate.redactedContent } })
    return { requestId, approved: await promise }
  }

  respondMemoryConfirmation(requestId: string, approved: boolean) {
    const entry = this.memoryConfirmations.get(requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    this.memoryConfirmations.delete(requestId)
    entry.resolve(Boolean(approved))
  }

  private async preflightToolCall(sender: WebContents | undefined, sessionId: string, descriptors: Map<string, ToolDescriptor>, name: string, args: unknown, automation = false, permissionMode?: PermissionMode) {
    const descriptor = descriptors.get(name)
    if (!descriptor || descriptor.risk === 'read') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    if (name === 'bash') {
      const command = String(values.command ?? '')
      const normalized = ` ${command.toLowerCase().replace(/\s+/g, ' ')} `
      const blocked = this.database.harness.getPermissionConfig().dangerousCommands.some(item => normalized.includes(item)) || /\brm\b.*(-[a-z]*r[a-z]*|--recursive)/.test(normalized)
      if (blocked) return { block: true, reason: '危险命令已被永久拦截' }
    }
    const mode = permissionMode || this.database.harness.getSession(sessionId).permissionMode
    if (automation && mode === 'default') return { block: true, reason: '自动化任务的默认权限仅允许只读工具' }
    const allowed = await this.approve(sender, sessionId, mode, descriptor.title(values), descriptor.detail(values))
    return allowed ? undefined : { block: true, reason: '用户拒绝了操作' }
  }

  /** Delegates use fixed role capabilities, never interactive approvals. */
  private preflightSubtaskToolCall(name: string, args: unknown) {
    if (name !== 'bash') return undefined
    const values = args && typeof args === 'object' ? args as Record<string, unknown> : {}
    const normalized = ` ${String(values.command ?? '').toLowerCase().replace(/\s+/g, ' ')} `
    const blocked = this.database.harness.getPermissionConfig().dangerousCommands.some(item => normalized.includes(item)) || /\brm\b.*(-[a-z]*r[a-z]*|--recursive)/.test(normalized)
    return blocked ? { block: true, reason: '危险命令已被永久拦截' } : undefined
  }

  private tools(sender: WebContents | undefined, sessionId: string, options: { role?: HarnessSubtaskRole, subtaskId?: string, planning?: boolean } = {}) {
    const descriptors = new Map<string, ToolDescriptor>()
    const recordedTools = new Map<string, { tool: string, target: string, startedAt: number }>()
    const register = <T extends { name: string }>(tool: T, descriptor: ToolDescriptor) => {
      descriptors.set(tool.name, descriptor)
      return tool
    }
    const session = () => this.database.harness.getSession(sessionId)
    const record = (tool: string, target: string) => { const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`; const createdAt = Date.now(); recordedTools.set(id, { tool, target, startedAt: createdAt }); this.database.harness.recordTool(sessionId, { id, tool, target, status: 'running', createdAt, ...(options.subtaskId ? { subtaskId: options.subtaskId } : {}) }); this.log({ event: 'tool', sessionId, tool, target, status: 'running', timestamp: createdAt }); emit(sender, { sessionId, type: 'tool-call', payload: { id, tool, target, status: 'running', ...(options.subtaskId ? { subtaskId: options.subtaskId } : {}) } }); return id }
    const finish = (id: string, status: 'ok' | 'failed', diff?: string) => {
      const completedAt = Date.now()
      this.database.harness.updateTool(sessionId, id, { status, diff, completedAt })
      const started = recordedTools.get(id)
      this.log({ event: 'tool', sessionId, tool: started?.tool || 'tool', target: started?.target, status: status === 'ok' ? 'completed' : 'failed', timestamp: completedAt, durationMs: started ? completedAt - started.startedAt : undefined, ...(diff ? { result: diff } : {}) })
      recordedTools.delete(id)
      emit(sender, { sessionId, type: 'tool-call', payload: { id, status, diff } })
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
    const memoryScope = (value: string): MemoryScope => {
      if (value !== 'global' && value !== 'project') throw new Error('记忆范围必须是 global 或 project')
      if (value === 'project' && !session().projectId) throw new Error('当前是临时会话，不能写入项目记忆；请先关联项目或改为全局记忆')
      return value
    }
    const memoryScopeLabel = (scope: MemoryScope) => scope === 'global' ? '全局记忆' : '项目记忆'
    const memoryTools = this.database.memories.enabled() ? [
      register({
        name: 'search_memory', label: '查询记忆', description: '从全局或当前项目的长期记忆中查询事实。用户询问此前偏好、背景或已保存记忆时使用。',
        parameters: Type.Object({ query: Type.String(), scope: Type.Union([Type.Literal('global'), Type.Literal('project')]) }), executionMode: 'sequential',
        execute: async (_id: string, params: { query: string, scope: string }) => {
          const scope = memoryScope(params.scope); const target = this.database.memories.path(scope, session().projectId); const id = record('search_memory', target)
          try {
            const entries = this.database.memories.search(scope, params.query, session().projectId)
            const text = entries.length ? entries.map(entry => `- [${entry.id}] ${entry.content}`).join('\n') : '没有找到相关记忆。'
            finish(id, 'ok', `- ${memoryScopeLabel(scope)}：加载 ${entries.length} 条\n- ${target}`)
            return { content: [{ type: 'text', text }], details: { scope, count: entries.length, path: target } }
          } catch (error) { finish(id, 'failed'); throw error }
        },
      }, { risk: 'read', title: () => '', detail: () => '' }),
      register({
        name: 'remember_memory', label: '保存记忆', description: '仅在用户明确要求记住某项长期事实时保存到指定范围。内容必须是稳定、可复用的事实或偏好。',
        parameters: Type.Object({ content: Type.String(), redactedContent: Type.Optional(Type.String()), scope: Type.Union([Type.Literal('global'), Type.Literal('project')]) }), executionMode: 'sequential',
        execute: async (_id: string, params: { content: string, redactedContent?: string, scope: string }) => {
          const scope = memoryScope(params.scope); const target = this.database.memories.path(scope, session().projectId); const id = record('remember_memory', target)
          try {
            const classified = classifyMemoryContent(params.content)
            if (classified.sensitivity === 'secret') {
              const diff = '- 出于安全原因，未保存高风险秘密'
              finish(id, 'ok', diff)
              emit(sender, { sessionId, type: 'memory-status', payload: { status: 'blocked_secret', candidateId: id } })
              return { content: [{ type: 'text', text: '出于安全原因，不能将这类敏感信息保存到长期记忆。' }], details: { scope, path: target, status: 'blocked_secret' } }
            }
            if (classified.sensitivity === 'personal') {
              const redactedContent = typeof params.redactedContent === 'string' && params.redactedContent.trim() ? params.redactedContent.trim() : classified.redactedContent
              if (!redactedContent) {
                const diff = '- 个人敏感信息未提供安全脱敏内容，未保存'
                finish(id, 'ok', diff)
                emit(sender, { sessionId, type: 'memory-status', payload: { status: 'blocked_secret', candidateId: id } })
                return { content: [{ type: 'text', text: '这类个人敏感信息没有可用的安全脱敏版本，未保存。' }], details: { scope, path: target, status: 'blocked_secret' } }
              }
              const candidate: MemoryCandidate = { id, sessionId, scope, projectId: session().projectId, source: 'explicit', decision: 'save', sensitivity: 'personal', redactedContent, status: 'candidate', createdAt: Date.now(), updatedAt: Date.now() }
              this.database.memories.savePending({ ...candidate, status: 'needs_confirmation' })
              this.database.harness.updateTool(sessionId, id, { status: 'waiting-confirm' })
              emit(sender, { sessionId, type: 'tool-call', payload: { id, tool: 'remember_memory', target, status: 'waiting-confirm' } })
              const confirmation = await this.requestMemoryConfirmation(sender, sessionId, candidate)
              if (!confirmation.approved) {
                this.database.memories.removePending(candidate.id)
                finish(id, 'ok', '- 用户拒绝保存脱敏记忆')
                return { content: [{ type: 'text', text: '已取消保存这条敏感个人信息。' }], details: { scope, path: target, status: 'rejected' } }
              }
              const result = this.database.memories.remember(scope, redactedContent, session().projectId, { source: 'explicit', sensitivity: 'personal', allowPersonal: true, sourceSessionId: sessionId })
              this.database.memories.removePending(candidate.id)
              const diff = result.created ? `- ${memoryScopeLabel(scope)}：新增 1 条\n- [${result.entry.id}] ${result.entry.content}` : `- ${memoryScopeLabel(scope)}：已有相同记忆\n- [${result.entry.id}] ${result.entry.content}`
              finish(id, 'ok', diff)
              emit(sender, { sessionId, type: 'memory-status', payload: { status: result.created ? 'saved' : 'duplicate', candidateId: id, entryId: result.entry.id, content: result.entry.content } })
              return { content: [{ type: 'text', text: result.created ? `已保存记忆 [${result.entry.id}]。` : `该记忆已存在 [${result.entry.id}]。` }], details: { scope, id: result.entry.id, path: target, created: result.created } }
            }
            const result = this.database.memories.remember(scope, params.content, session().projectId, { source: 'explicit', sensitivity: 'none', sourceSessionId: sessionId })
            const diff = result.created ? `- ${memoryScopeLabel(scope)}：新增 1 条\n- [${result.entry.id}] ${result.entry.content}` : `- ${memoryScopeLabel(scope)}：新增 0 条，已有相同记忆\n- [${result.entry.id}] ${result.entry.content}`
            finish(id, 'ok', diff)
            emit(sender, { sessionId, type: 'memory-status', payload: { status: result.created ? 'saved' : 'duplicate', candidateId: id, entryId: result.entry.id, content: result.entry.content } })
            return { content: [{ type: 'text', text: result.created ? `已保存记忆 [${result.entry.id}]。` : `该记忆已存在 [${result.entry.id}]。` }], details: { scope, id: result.entry.id, path: target, created: result.created } }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const classified = classifyMemoryContent(params.content)
            if (classified.sensitivity !== 'secret') this.database.memories.savePending({ id, sessionId, scope: params.scope as MemoryScope, projectId: session().projectId, source: 'explicit', decision: 'save', sensitivity: classified.sensitivity, content: classified.sensitivity === 'none' ? params.content.trim() : undefined, redactedContent: params.redactedContent?.trim() || classified.redactedContent, status: 'failed', error: message, createdAt: Date.now(), updatedAt: Date.now() })
            finish(id, 'failed'); emit(sender, { sessionId, type: 'memory-status', payload: { status: 'failed', candidateId: id, error: message } }); throw error
          }
        },
      }, { risk: 'read', title: () => '', detail: () => '' }),
      register({
        name: 'forget_memory', label: '删除记忆', description: '仅在用户明确要求删除长期记忆时，按查询到的记忆 ID 删除指定范围中的一条记忆。',
        parameters: Type.Object({ id: Type.String(), scope: Type.Union([Type.Literal('global'), Type.Literal('project')]) }), executionMode: 'sequential',
        execute: async (_id: string, params: { id: string, scope: string }) => {
          const scope = memoryScope(params.scope); const target = this.database.memories.path(scope, session().projectId); const recordId = record('forget_memory', target)
          try {
            this.database.memories.forget(scope, params.id, session().projectId)
            finish(recordId, 'ok', `- ${memoryScopeLabel(scope)}：删除 1 条\n- 删除记忆 [${params.id}]`)
            return { content: [{ type: 'text', text: `已删除记忆 [${params.id}]。` }], details: { scope, id: params.id, path: target } }
          } catch (error) { finish(recordId, 'failed'); throw error }
        },
      }, { risk: 'read', title: () => '', detail: () => '' }),
    ] : []
    const planTool = register({
      name: 'set_plan',
      label: '制定计划',
      description: '在开始一个多步骤任务前，提交一份简洁、可执行的计划步骤清单。步骤是待办清单，不是推理过程；每步一句短标签，必要时附一行说明。仅在多步骤任务时调用一次，建议不超过 6 步。',
      parameters: Type.Object({ steps: Type.Array(Type.Object({ label: Type.String(), detail: Type.Optional(Type.String()) })) }),
      executionMode: 'sequential',
      execute: async () => ({ content: [{ type: 'text', text: '计划已记录。' }] }),
    }, { risk: 'read', title: () => '', detail: () => '' })
    const askUserTool = register({
      name: 'ask_user', label: '询问用户', description: '在继续规划前向用户提出关键澄清问题。可以一次提出最多 5 个问题，用户会逐个作答（也可跳过）。单选题请给出不超过 3 个候选，多选题不超过 5 个；自由输入由界面提供，无需兜底选项。调用后会等待用户作答；不要把同样的问题重复写进普通回复。',
      // Provider tool-call serializers vary: some omit optional fields, while others
      // flatten a single question to a string. Normalize the model payload here so a
      // malformed presentation cannot strand the user without a question card.
      parameters: Type.Object({ questions: Type.Optional(Type.Any()) }),
      executionMode: 'sequential',
      execute: async (_id: string, params: any) => {
        const seen = new Set<string>()
        const rawQuestions = Array.isArray(params?.questions) ? params.questions : params?.questions === undefined ? [] : [params.questions]
        const questions = rawQuestions.flatMap((raw: unknown, index: number): HarnessUserQuestion[] => {
          const value = typeof raw === 'string' ? { question: raw } : raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
          const suppliedId = typeof value.id === 'string' ? value.id.trim().slice(0, 80) : ''
          const id = suppliedId || `question-${index + 1}`
          const question = [value.question, value.text, value.prompt, value.content].find(item => typeof item === 'string' && item.trim()) as string | undefined
          if (!id || !question || seen.has(id)) return []
          seen.add(id)
          const options = Array.isArray(value.options) ? value.options.flatMap((option: unknown) => {
            if (typeof option === 'string' && option.trim()) return [{ label: option.trim().slice(0, 160) }]
            if (!option || typeof option !== 'object') return []
            const item = option as Record<string, unknown>
            return typeof item.label === 'string' && item.label.trim() ? [{ label: item.label.trim().slice(0, 160), ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim().slice(0, 500) } : {}) }] : []
          }).slice(0, value.multiSelect === true ? 5 : 3) : undefined
          return [{ id, question: question.trim().slice(0, 1000), ...(typeof value.header === 'string' && value.header.trim() ? { header: value.header.trim().slice(0, 80) } : {}), ...(typeof value.context === 'string' && value.context.trim() ? { context: value.context.trim().slice(0, 1000) } : {}), ...(options?.length ? { options } : {}), ...(value.multiSelect === true ? { multiSelect: true } : {}), ...(value.allowCustom !== false ? { allowCustom: true } : {}) }]
        }).slice(0, 5)
        if (!questions.length) questions.push({ id: 'question-1', question: '为了继续制定方案，请补充这次最希望解决的问题、预期效果或优先级。' })
        const plan = session().activePlan
        if (!plan) throw new Error('当前没有计划')
        const interaction: HarnessPendingInteraction = { id: randomUUID(), kind: 'question', status: 'waiting', questions, createdAt: Date.now() }
        this.database.harness.updatePlan(sessionId, { status: 'awaiting_input' })
        this.database.harness.setPendingInteraction(sessionId, interaction)
        emit(sender, { sessionId, type: 'interaction-created', payload: { interaction } })
        // A question is a durable pause point, not a suspended in-memory tool call.
        // This lets the sidebar and conversation recover cleanly after an app restart.
        return { content: [{ type: 'text', text: '问题已展示，等待用户回答。' }], details: { interactionId: interaction.id }, terminate: true }
      },
    }, { risk: 'read', title: () => '', detail: () => '' })
    const presentPlanTool = register({
      name: 'present_plan', label: '展示方案', description: '信息已经齐全时提交完整方案供用户审阅。不要包含待回答问题；用户批准前不得执行修改。',
      parameters: Type.Object({ understanding: Type.String(), steps: Type.Array(Type.Object({ label: Type.String(), detail: Type.Optional(Type.String()) })), risks: Type.Optional(Type.Array(Type.String())) }),
      executionMode: 'sequential',
      execute: async (_id: string, params: any) => {
        const understanding = String(params.understanding || '').trim()
        const steps = normalizePlanSteps(params.steps); const risks = normalizePlanRisks(params.risks)
        if (!understanding || !steps.length) throw new Error('完整方案必须包含当前理解和至少一个步骤')
        const existing = session().activePlan
        if (!existing) throw new Error('当前没有计划')
        const plan: HarnessPlan = { ...existing, understanding, steps, risks, status: 'awaiting_confirmation', updatedAt: Date.now() }
        this.database.harness.setActivePlan(sessionId, plan)
        const interaction: HarnessPendingInteraction = { id: randomUUID(), kind: 'plan-review', status: 'waiting', planId: plan.id, createdAt: Date.now() }
        this.database.harness.setPendingInteraction(sessionId, interaction)
        emit(sender, { sessionId, type: 'plan-updated', payload: { plan } })
        emit(sender, { sessionId, type: 'interaction-created', payload: { interaction } })
        // The review card is the terminal surface for this planning turn.
        // Pi honors terminate and does not ask the model for a redundant prose reply.
        return { content: [{ type: 'text', text: '方案已展示，等待用户确认。' }], details: { planId: plan.id, interactionId: interaction.id }, terminate: true }
      },
    }, { risk: 'read', title: () => '', detail: () => '' })
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
          const release = await this.projectLocks.acquire(session().projectId, write.has(tool.name) ? 'write' : 'read', signal)
          try { return await tool.execute(id, params, signal, onUpdate) } finally { release() }
        },
      })
    return { tools: tools as any, descriptors }
  }

  async runMessage(sender: WebContents, sessionId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection, planning = false) {
    const text = message.trim()
    if (!text) throw new Error('请输入消息')
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    if (text.startsWith('/perm ')) {
      const mode = text.slice(6).trim() as PermissionMode
      if (!['default', 'auto-approve', 'full'].includes(mode)) throw new Error('权限档位应为 default、auto-approve 或 full')
      this.database.harness.setPermission(sessionId, mode)
      emit(sender, { sessionId, type: 'status', payload: { permissionMode: mode } })
      return
    }
    const { provider, apiKey } = this.requireProvider(selection)
    const attachments = this.database.harness.resolveMessageAttachments(sessionId, references)
    let session = this.database.harness.addMessage(sessionId, 'user', text, attachments)
    if (planning && !session.activePlan) {
      const plan: HarnessPlan = { id: randomUUID(), status: 'planning', request: text, understanding: '', steps: [], risks: [], createdAt: Date.now(), updatedAt: Date.now() }
      session = this.database.harness.setActivePlan(sessionId, plan)
      emit(sender, { sessionId, type: 'plan-updated', payload: { plan } })
    }
    return this.runAgent(sender, sessionId, session, selection, provider, apiKey, planning ? { planning: true } : {})
  }

  private requireProvider(selection?: ModelSelection) {
    if (!selection?.providerId || !selection.modelId) throw new Error('请先选择一个可用模型')
    const provider = this.database.models.get(selection.providerId)
    if (!provider?.models.includes(selection.modelId)) throw new Error('所选模型不属于当前供应商')
    const apiKey = this.database.models.getSecret(selection.providerId)
    if (!provider?.enabled || !apiKey) throw new Error('当前 Agent 模型不可用，请检查 Provider 配置')
    return { provider, apiKey }
  }

  listMemory(scope: MemoryScope, projectId?: string) { return this.database.memories.list(scope, projectId) }
  rememberMemory(content: string) {
    if (!this.database.memories.enabled()) throw new Error('请先启用记忆后再保存')
    return this.database.memories.remember('global', content, undefined, { source: 'manual' })
  }
  updateMemory(scope: MemoryScope, id: string, content: string, projectId?: string) { return this.database.memories.update(scope, id, content, projectId) }
  deleteMemory(scope: MemoryScope, id: string, projectId?: string) { return this.database.memories.delete(scope, id, projectId) }
  listPendingMemory() { return this.database.memories.listPending() }
  discardPendingMemory(candidateId: string) { this.database.memories.removePending(candidateId) }

  async retryMemory(candidateId: string) {
    const candidate = this.database.memories.listPending().find(item => item.id === candidateId)
    if (!candidate) throw new Error('未找到待重试的记忆候选')
    const content = candidate.redactedContent || candidate.content
    if (!content) throw new Error('该记忆需要重新提炼原会话，请在原会话中重新发起记忆请求')
    const classified = classifyMemoryContent(content)
    if (classified.sensitivity === 'secret') throw new Error('记忆内容包含高风险秘密，未写入')
    const result = this.database.memories.remember(candidate.scope, content, candidate.projectId, { source: candidate.source, sourceSessionId: candidate.sessionId, sensitivity: classified.sensitivity, allowPersonal: classified.sensitivity === 'personal' })
    this.database.memories.removePending(candidateId)
    emit(undefined, { sessionId: candidate.sessionId || '', type: 'memory-status', payload: { status: result.created ? 'saved' : 'duplicate', candidateId, entryId: result.entry.id, content: result.entry.content } })
  }

  async saveProjectMemory(sender: WebContents, sessionId: string, selection?: ModelSelection) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    if (!this.database.memories.enabled()) throw new Error('请先在个性化设置中启用记忆')
    const session = this.database.harness.getSession(sessionId)
    if (!session.projectId) throw new Error('请先选择项目后再保存项目记忆')
    if (!session.messages.some(message => message.role === 'user') || !session.messages.some(message => message.role === 'assistant')) throw new Error('当前对话还没有可保存的内容')
    const { provider, apiKey } = this.requireProvider(selection)
    const model = {
      id: selection!.modelId, name: selection!.modelId, api: 'openai-completions', provider: 'mira-openai', baseUrl: provider.endpoint,
      reasoning: provider.reasoning, compat: provider.reasoning ? { supportsReasoningEffort: true } : undefined,
      input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: provider.contextWindow || DEFAULT_CONTEXT_WINDOW, maxTokens: 8192,
    } as any
    const models = createModels()
    models.setProvider(createProvider({
      id: 'mira-openai', name: provider.name, baseUrl: provider.endpoint,
      auth: { apiKey: { name: provider.name, resolve: async () => ({ auth: { apiKey } }) } },
      models: [model], api: openAICompletionsApi(),
    }) as any)
    const task = this.saveLongTermMemory(sender, sessionId, models, model, provider.reasoning ? selection!.thinkingLevel || 'medium' : 'off')
    this.memoryWrites.set(sessionId, task)
    await task.finally(() => { if (this.memoryWrites.get(sessionId) === task) this.memoryWrites.delete(sessionId) })
  }

  async rerun(sender: WebContents, sessionId: string, selection?: ModelSelection) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    return this.runAgent(sender, sessionId, this.database.harness.regenerate(sessionId), selection, provider, apiKey)
  }

  async editAndRerun(sender: WebContents, sessionId: string, messageId: string, content: string, selection?: ModelSelection) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    return this.runAgent(sender, sessionId, this.database.harness.editUserMessageAndTruncate(sessionId, messageId, content), selection, provider, apiKey)
  }

  async runAutomation(sessionId: string, message: string, selection: ModelSelection, permissionMode: PermissionMode) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    const updated = this.database.harness.addMessage(sessionId, 'user', message.trim())
    return this.runAgent(undefined, sessionId, updated, selection, provider, apiKey, { origin: 'automation', permissionMode })
  }

  async confirmPlan(sender: WebContents, sessionId: string, planId: string, selection?: ModelSelection) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    const session = this.database.harness.getSession(sessionId)
    const interaction = session.pendingInteraction
    if (!session.activePlan || session.activePlan.id !== planId || session.activePlan.status !== 'awaiting_confirmation' || interaction?.kind !== 'plan-review' || interaction.status !== 'waiting' || interaction.planId !== planId) throw new Error('计划当前不可执行')
    const { provider, apiKey } = this.requireProvider(selection)
    this.database.harness.resolvePendingInteraction(sessionId, interaction.id, 'approved')
    const confirmed = this.database.harness.confirmPlan(sessionId, planId)
    emit(sender, { sessionId, type: 'plan-confirmed', payload: { plan: confirmed.activePlan } })
    emit(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId: interaction.id, status: 'approved' } })
    return this.runAgent(sender, sessionId, confirmed, selection!, provider, apiKey)
  }

  async answerInteraction(sender: WebContents, sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection?: ModelSelection) {
    const session = this.database.harness.getSession(sessionId)
    const interaction = session.pendingInteraction
    if (!session.activePlan || interaction?.id !== interactionId || interaction.kind !== 'question' || interaction.status !== 'waiting') throw new Error('问题当前不可回答')
    const expected = new Set(interaction.questions.map(question => question.id))
    if (!Array.isArray(answers) || answers.length !== expected.size || answers.some(answer => !expected.has(answer.id))) throw new Error('回答不完整或不匹配')
    if (this.running.has(sessionId)) throw new Error('当前问题正在保存，请稍后重试')
    this.database.harness.resolvePendingInteraction(sessionId, interactionId, 'answered', answers)
    this.database.harness.updatePlan(sessionId, { status: 'planning' })
    emit(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId, status: 'answered', answers } })
    const { provider, apiKey } = this.requireProvider(selection)
    const questionById = new Map(interaction.questions.map(question => [question.id, question] as const))
    const text = `用户对澄清问题的回答：\n${answers.map(answer => {
      const question = questionById.get(answer.id)
      const label = question?.question || answer.id
      const value = answer.custom || answer.selected.join('、') || '（用户跳过）'
      return `- ${label}：${value}`
    }).join('\n')}`
    const resumed = this.database.harness.addMessage(sessionId, 'user', text, undefined, true)
    return this.runAgent(sender, sessionId, resumed, selection!, provider, apiKey, { planning: true })
  }

  async continuePlan(sender: WebContents, sessionId: string, planId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection) {
    const session = this.database.harness.getSession(sessionId)
    if (!session.activePlan || session.activePlan.id !== planId) throw new Error('计划不存在')
    if (session.pendingInteraction?.kind === 'plan-review' && session.pendingInteraction.status === 'waiting') {
      this.database.harness.resolvePendingInteraction(sessionId, session.pendingInteraction.id, 'discussing')
      emit(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId: session.pendingInteraction.id, status: 'discussing' } })
    }
    this.database.harness.updatePlan(sessionId, { status: 'planning' })
    return this.runMessage(sender, sessionId, message, references, selection, true)
  }

  cancelPlan(sender: WebContents, sessionId: string, planId: string) {
    const session = this.database.harness.getSession(sessionId)
    if (session.pendingInteraction?.status === 'waiting') {
      this.database.harness.resolvePendingInteraction(sessionId, session.pendingInteraction.id, 'cancelled')
      emit(sender, { sessionId, type: 'interaction-resolved', payload: { interactionId: session.pendingInteraction.id, status: 'cancelled' } })
    }
    const plan = this.database.harness.cancelPlan(sessionId, planId).activePlan
    emit(sender, { sessionId, type: 'plan-cancelled', payload: { plan } })
    this.abort(sessionId)
    return plan
  }

  private async runAgent(sender: WebContents | undefined, sessionId: string, session: HarnessSession, selection: ModelSelection, provider: any, apiKey: string, options: { origin?: RunOrigin, permissionMode?: PermissionMode, planning?: boolean } = {}) {
    const origin = options.origin || 'manual'
    await this.memoryWrites.get(sessionId)
    const text = [...session.messages].reverse().find(message => message.role === 'user')?.content
    if (!text) throw new Error('没有可运行的对话')
    const controller = new AbortController()
    this.running.set(sessionId, { controller })
    session = this.database.harness.updateSession({ ...session, modelProviderId: provider.id, modelId: selection.modelId, status: 'active' })
    const autoTitleInput = origin === 'manual' ? firstTurnTitleInput(session) : undefined
    const autoTitleRevision = autoTitleInput && session.titleSource === 'auto' ? this.database.harness.reserveAutoTitle(sessionId) : undefined
    emit(sender, { sessionId, type: 'status', payload: { state: 'running' } })
    const startedAt = Date.now()
    this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'running', timestamp: startedAt })
    const activities: HarnessRunActivity[] = [{ id: 'thinking-0', label: '正在思考', status: 'running', startedAt }]
    const runId = randomUUID()
    let subtasks: SubtaskRuntime | undefined
    const publishActivities = () => {
      const currentSubtasks = subtasks?.list() || []
      this.database.harness.setActiveRun(sessionId, { id: runId, startedAt, activities, subtasks: currentSubtasks })
      emit(sender, { sessionId, type: 'run-activity', payload: { activities, subtasks: currentSubtasks } })
    }
    const finishActivity = (id: string, status: HarnessRunActivity['status'] = 'completed', detail?: string) => {
      const activity = activities.find(item => item.id === id)
      if (activity?.status === 'running') Object.assign(activity, { status, completedAt: Date.now(), ...(detail ? { detail } : {}) })
    }
    const startActivity = (id: string, label: string, detail?: string) => {
      if (!activities.some(item => item.id === id)) activities.push({ id, label, ...(detail ? { detail } : {}), status: 'running', startedAt: Date.now() })
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
    publishActivities()
    emit(sender, { sessionId, type: 'run-start', payload: { startedAt, activities, subtasks: [] } })

    let model: any
    let models!: ReturnType<typeof createModels>
    let agent!: Agent
    try {
      model = {
        id: selection.modelId, name: selection.modelId, api: 'openai-completions', provider: 'mira-openai', baseUrl: provider.endpoint,
        reasoning: provider.reasoning, compat: provider.reasoning ? { supportsReasoningEffort: true } : undefined,
        input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: provider.contextWindow || DEFAULT_CONTEXT_WINDOW, maxTokens: 8192,
      } as any
      models = createModels()
      models.setProvider(createProvider({
        id: 'mira-openai', name: provider.name, baseUrl: provider.endpoint,
        auth: { apiKey: { name: provider.name, resolve: async () => ({ auth: { apiKey } }) } },
        models: [model], api: openAICompletionsApi(),
      }) as any)
      session = await this.compactContext(sender, session, model, models, controller, provider.reasoning ? selection.thinkingLevel || 'medium' : 'off', activities, publishActivities)
      const memoryEnabled = !options.planning && this.database.memories.enabled()
      const loadMemory = (scope: MemoryScope) => {
        const target = this.database.memories.path(scope, session.projectId)
        const entries = this.database.memories.search(scope, text, session.projectId)
        const detail = `${scope === 'global' ? '全局' : '项目'}记忆：加载 ${entries.length} 条\n${target}`
        const recordId = `${Date.now()}-${Math.random().toString(16).slice(2)}`; const startedAt = Date.now()
        this.database.harness.recordTool(sessionId, { id: recordId, tool: 'memory_load', target, status: 'running', createdAt: startedAt })
        this.log({ event: 'tool', sessionId, tool: 'memory_load', target, status: 'running', timestamp: startedAt })
        emit(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_load', target, status: 'running' } })
        const completedAt = Date.now(); const diff = `- ${detail.replace('\n', '\n- ')}`
        this.database.harness.updateTool(sessionId, recordId, { status: 'ok', diff, completedAt })
        this.log({ event: 'tool', sessionId, tool: 'memory_load', target, result: diff, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
        emit(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_load', target, status: 'ok', diff } })
        activities.push({ id: `memory-load-${scope}`, label: `加载${scope === 'global' ? '全局' : '项目'}记忆`, detail, status: 'completed', startedAt: Date.now(), completedAt: Date.now() })
        return entries.map(entry => `- [${entry.id}] ${entry.content}`).join('\n')
      }
      const globalMemory = memoryEnabled ? loadMemory('global') : ''
      const projectMemory = memoryEnabled && session.projectId ? loadMemory('project') : ''
      if (memoryEnabled) publishActivities()
      const registeredTools = this.tools(sender, sessionId, options.planning ? { planning: true } : {})
      const preferences = this.database.getSnapshot().preferences
      const activeSkills = options.planning ? [] : this.database.skills.resolve(session.activeSkillIds || [])
      const thinkingLevel = provider.reasoning ? selection.thinkingLevel || 'medium' : 'off'
      const childPrompt = (role: HarnessSubtaskRole) => [
        `你是 Mira 的 ${role} 子任务 Agent。只能完成收到的一项任务，不能联系用户、不能委派、不能假称执行过未调用的工具。`,
        role === 'implementer' ? '可在指定项目内修改文件；只改本任务需要的内容。' : role === 'tester' ? '可执行测试命令；不要以直接编辑文件的方式修改工作区。' : '你没有被授予任意写入权限；不得声称修改了文件。',
        '最终回复是父 Agent 唯一得到的完整报告。简洁说明结论、真实改动/检查、关键文件路径，以及未完成项。不要输出思维过程。',
        buildMiraSystemPrompt({ tone: normalizeAssistantTone(preferences.assistantTone), context: { instructions: this.database.instructions.resolve(session.workingDirectory) } }),
      ].join('\n\n')
      if (!options.planning && origin === 'manual' && session.delegationEnabled !== false && session.workingDirectory) {
        subtasks = new SubtaskRuntime(async (role, signal) => this.projectLocks.acquire(session.projectId, subtaskMayMutate(role) ? 'write' : 'read', signal))
        this.running.get(sessionId)!.subtasks = subtasks
      }
      const taskTools = subtasks ? [
        {
          name: 'delegate_task', label: '委派子任务', description: '把可独立完成的工作委派给 explorer、reviewer、tester 或 implementer。子任务不共享本次对话，只获得任务说明与可选项目内文件。',
          parameters: Type.Object({ role: Type.Union([Type.Literal('explorer'), Type.Literal('reviewer'), Type.Literal('tester'), Type.Literal('implementer')]), task: Type.String(), files: Type.Optional(Type.Array(Type.String())) }), executionMode: 'sequential',
          execute: async (toolCallId: string, params: { role: HarnessSubtaskRole, task: string, files?: string[] }) => {
            const requested = [...new Set((params.files || []).filter(path => typeof path === 'string' && path.trim()))]
            if (requested.length > 12) throw new Error('一次最多附带 12 个项目内文件')
            const references = requested.map(path => {
              if (isAbsolute(path)) throw new Error('子任务只能附带项目内相对路径文件')
              return { path, name: path.split('/').at(-1) || path }
            })
            const attachments = this.database.harness.resolveMessageAttachments(sessionId, references)
            const child = subtasks!.create({
              parentToolCallId: toolCallId, role: params.role, task: params.task.trim(),
              prompt: `${params.task.trim()}${attachments.length ? `\n\n已附带文件：\n${attachments.map(file => `[${file.path}]\n${file.content}`).join('\n\n')}` : ''}`,
              files: references, systemPrompt: childPrompt(params.role), model, streamFn: models.streamSimple.bind(models) as any, thinkingLevel,
              toolsForTask: taskId => this.tools(sender, sessionId, { role: params.role, subtaskId: taskId }).tools,
              beforeToolCall: async ({ toolCall, args }) => this.preflightSubtaskToolCall(toolCall.name, args),
              onChanged: () => publishActivities(),
              onFinished: childTask => {
                if (childTask.usage) childTask.usage = withUsageCost(childTask.usage, provider.pricing)
                publishActivities()
                agent.followUp({ role: 'user', content: `子任务 ${childTask.id} 已结束，状态：${childTask.status}。如需报告，请调用 wait_for_tasks。`, timestamp: Date.now() } as any)
              },
            })
            return { content: [{ type: 'text', text: `已创建子任务 ${child.id}（${child.role}）。` }], details: { id: child.id, status: child.status } }
          },
        },
        {
          name: 'list_tasks', label: '列出子任务', description: '查看当前父任务的子任务状态，不返回报告正文。', parameters: Type.Object({}), executionMode: 'sequential',
          execute: async () => ({ content: [{ type: 'text', text: subtasks!.list().map(task => `${task.id} | ${task.role} | ${task.status}`).join('\n') || '没有子任务。' }] }),
        },
        {
          name: 'wait_for_tasks', label: '等待子任务', description: '等待全部或指定子任务完成并读取受限最终报告。', parameters: Type.Object({ ids: Type.Optional(Type.Array(Type.String())) }), executionMode: 'sequential',
          execute: async (_id: string, params: { ids?: string[] }) => {
            const completed = await subtasks!.wait(params.ids)
            const text = completed.map(task => `## ${task.id} · ${task.role} · ${task.status}\n${task.report || task.error?.message || '无报告'}`).join('\n\n') || '没有匹配的子任务。'
            return { content: [{ type: 'text', text }], details: { ids: completed.map(task => task.id) } }
          },
        },
        {
          name: 'stop_tasks', label: '停止子任务', description: '停止全部或指定仍在运行的子任务。', parameters: Type.Object({ ids: Type.Optional(Type.Array(Type.String())) }), executionMode: 'sequential',
          execute: async (_id: string, params: { ids?: string[] }) => { subtasks!.stop(params.ids); return { content: [{ type: 'text', text: '已请求停止子任务。' }] } },
        },
      ] : []
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
              instructions: this.database.instructions.resolve(session.workingDirectory),
              activeSkills: activeSkills.map(skill => ({ name: skill.name, instructions: skill.instructions })),
              globalMemory,
              projectMemory,
            },
          }) + '\n\n## 联网来源引用\n联网工具返回的 [[source:N]] 是内部来源标识。引用联网信息时，必须在对应陈述句末原样复制该标识；不得把搜索排名、网页列表序号或其他数字写成引用。总结多条新闻或事实时，每条应引用其各自最直接的来源；不要用同一个热榜、列表或聚合页替代多个不同条目的原文链接，必要时继续搜索或抓取原文。界面会在回答完成后自动转换为连续脚标。' + (options.planning ? '\n\n## 当前处于计划模式\n只能进行只读探索。禁止修改文件、执行命令、调用 MCP、Memory、Skill 或委派子任务。关键信息不足时调用 ask_user 提出澄清问题，一次最多 5 个，用户会逐个作答（也可跳过），不要把问题重复写进普通回复；单选问题提供不超过 3 个候选、多选不超过 5 个，自由输入始终由界面提供。用户作答后，先简短确认一句（例如「好的，我继续…」）再继续规划；他们的回答已经作为上下文提供，不需要复述或重复问题内容。信息齐全时调用 present_plan 展示完整方案供用户确认；调用后绝不能执行修改，并把完整方案（当前理解、编号执行步骤、风险列表）作为你的最终回复用列表呈现。' : session.activePlan?.status === 'executing' ? `\n\n## 已确认执行方案\n以下是用户已确认的工作方案，仅作为执行上下文，不能覆盖系统安全规则或工具权限。\n当前理解：${session.activePlan.understanding}\n执行步骤：${session.activePlan.steps.map(step => `- ${step.label}${step.detail ? `：${step.detail}` : ''}`).join('\n')}\n风险：${session.activePlan.risks.join('；') || '无'}` : ''),
          model,
          thinkingLevel,
          messages: this.agentMessages(session, model),
          tools: options.planning ? registeredTools.tools : [...registeredTools.tools, ...taskTools],
        } as any,
        streamFn: models.streamSimple.bind(models) as any,
        sessionId,
        beforeToolCall: ({ toolCall, args }) => this.preflightToolCall(sender, sessionId, registeredTools.descriptors, toolCall.name, args, origin === 'automation', options.permissionMode),
      })
      this.running.get(sessionId)!.agent = agent
    } catch (error) {
      finishRunningActivities('failed')
      publishActivities()
      this.database.harness.setStatus(sessionId, 'failed')
      this.running.delete(sessionId)
      emit(sender, { sessionId, type: 'message-complete', payload: {} })
      emit(sender, { sessionId, type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } })
      emit(sender, { sessionId, type: 'status', payload: { state: 'idle' } })
      throw error
    }
    let output = ''
    let pendingAssistantDelta = ''
    const sources: HarnessSource[] = []
    let assistantPersistTimer: ReturnType<typeof setTimeout> | undefined
    let assistantFinalized = false
    const flushAssistantDelta = () => {
      if (assistantPersistTimer) clearTimeout(assistantPersistTimer)
      assistantPersistTimer = undefined
      if (!pendingAssistantDelta) return
      this.database.harness.appendAssistantDelta(sessionId, pendingAssistantDelta)
      pendingAssistantDelta = ''
    }
    const scheduleAssistantPersist = () => {
      if (!assistantPersistTimer) assistantPersistTimer = setTimeout(flushAssistantDelta, ASSISTANT_PERSIST_INTERVAL_MS)
    }
    const unsubscribe = agent.subscribe((event: any) => {
      if (event.type === 'message_start' && !activities.some(item => item.status === 'running')) {
        startActivity(`thinking-${activities.length}`, '正在思考')
        publishActivities()
      }
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        const thinking = activities.find(item => item.status === 'running' && item.label === '正在思考')
        if (thinking) finishActivity(thinking.id)
        startActivity('answering', '正在生成回复')
        publishActivities()
        const delta = event.assistantMessageEvent.delta as string
        output += delta
        pendingAssistantDelta += delta
        scheduleAssistantPersist()
        emit(sender, { sessionId, type: 'message-delta', payload: { delta } })
      }
      if (event.type === 'tool_execution_start') {
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
    try {
      await agent.prompt(text)
      // A parent is not allowed to leave child work behind. If it did not
      // converge itself, wait and give it one explicit convergence turn.
      if (subtasks?.active().length) {
        await subtasks.wait()
        await agent.prompt('系统提醒：你创建的子任务已经结束。请调用 wait_for_tasks 读取报告，整合结果后再给出最终答复；不要再创建子任务。')
      }
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage)
      const finalMessage = agent.state.messages.at(-1)
      const finalText = assistantText(finalMessage)
      if (finalText && finalText.startsWith(output) && finalText !== output) {
        const delta = finalText.slice(output.length)
        if (delta) {
          pendingAssistantDelta += delta
          emit(sender, { sessionId, type: 'message-delta', payload: { delta } })
        }
        output = finalText
      }
      if (!output && options.planning && this.database.harness.getSession(sessionId).pendingInteraction?.status === 'waiting') {
        output = this.database.harness.getSession(sessionId).pendingInteraction?.kind === 'question' ? '我需要先确认几个关键信息。' : '方案已整理，请确认是否开始执行。'
        pendingAssistantDelta += output
        emit(sender, { sessionId, type: 'message-delta', payload: { delta: output } })
      }
      if (!output) throw new Error('模型没有返回文本')
      finishRunningActivities('completed')
      const completedAt = Date.now()
      const parentUsage = tokenUsage(finalMessage && typeof finalMessage === 'object' ? (finalMessage as { usage?: unknown }).usage : undefined)
      const pricedParentUsage = parentUsage ? withUsageCost(parentUsage, provider.pricing) : undefined
      const childUsage = mergeUsage(subtasks?.list().map(task => task.usage) || [])
      const run: HarnessRunSummary = { startedAt, completedAt, durationMs: completedAt - startedAt, activities, ...(subtasks?.list().length ? { subtasks: subtasks.list(), usage: { parent: pricedParentUsage, children: childUsage, total: mergeUsage([pricedParentUsage, childUsage]) } } : {}) }
      flushAssistantDelta()
      const usage = contextUsage(this.agentMessages(this.database.harness.getSession(sessionId), model), model.contextWindow)
      run.contextUsage = usage
      const citations = finalizeAssistantCitations(output, sources)
      output = citations.content
      session = this.database.harness.finalizeAssistantMessage(sessionId, { content: output, run, usage: pricedParentUsage, sources: citations.sources })
      assistantFinalized = true
      session = this.publishContextUsage(sender, session, usage)
      this.database.harness.setStatus(sessionId, 'completed')
      if (!options.planning && this.database.harness.getSession(sessionId).activePlan?.status === 'executing') {
        const completedPlan = { ...this.database.harness.getSession(sessionId).activePlan!, status: 'completed' as const, updatedAt: Date.now() }
        this.database.harness.setActivePlan(sessionId, completedPlan)
        emit(sender, { sessionId, type: 'plan-updated', payload: { plan: completedPlan } })
      }
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
      emit(sender, { sessionId, type: 'message-complete', payload: { content: output, run } })
      if (autoTitleRevision !== undefined && this.database.harness.isAutoTitleCurrent(sessionId, autoTitleRevision)) {
        void this.generateAutoTitle(sender, sessionId, models, model, autoTitleRevision)
      }
      const memoryWrite = origin === 'manual' && !options.planning
        ? this.saveLongTermMemory(sender, sessionId, models, model, provider.reasoning ? selection.thinkingLevel || 'medium' : 'off').catch(() => undefined)
        : Promise.resolve()
      this.memoryWrites.set(sessionId, memoryWrite)
      void memoryWrite.finally(() => {
        if (this.memoryWrites.get(sessionId) === memoryWrite) this.memoryWrites.delete(sessionId)
      })
      this.publishRunComplete({ session, origin, status: 'completed', content: output })
      return { content: output, run }
    } catch (error) {
      finishRunningActivities('failed')
      publishActivities()
      const aborted = controller.signal.aborted
      flushAssistantDelta()
      if (output && !assistantFinalized) {
        const completedAt = Date.now()
        const citations = finalizeAssistantCitations(output, sources)
        output = citations.content
        this.database.harness.finalizeAssistantMessage(sessionId, { content: output, run: { startedAt, completedAt, durationMs: completedAt - startedAt, activities, ...(subtasks?.list().length ? { subtasks: subtasks.list() } : {}) }, interrupted: aborted, sources: citations.sources })
        assistantFinalized = true
        emit(sender, { sessionId, type: 'message-complete', payload: { content: output } })
      } else if (!output) {
        emit(sender, { sessionId, type: 'message-complete', payload: {} })
      }
      this.database.harness.setStatus(sessionId, aborted ? 'active' : 'failed')
      const failureAt = Date.now()
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: aborted ? 'aborted' : 'failed', timestamp: failureAt, durationMs: failureAt - startedAt, ...(aborted ? {} : { error: error instanceof Error ? error.message : String(error) }) })
      if (!aborted) this.publishRunComplete({ session, origin, status: 'failed', content: output || undefined })
      if (!aborted) {
        emit(sender, { sessionId, type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } })
        throw error
      }
      this.publishRunComplete({ session, origin, status: 'aborted', content: output || undefined })
      return { content: output, interrupted: true }
    } finally {
      flushAssistantDelta()
      unsubscribe()
      if (subtasks?.active().length) await subtasks.close(controller.signal.aborted ? 'stopped' : 'interrupted')
      this.database.harness.setActiveRun(sessionId, undefined)
      this.running.delete(sessionId)
      emit(sender, { sessionId, type: 'status', payload: { state: 'idle' } })
    }
  }

  abort(sessionId: string) {
    const entry = this.running.get(sessionId)
    if (!entry) return
    entry.controller.abort()
    entry.agent?.abort()
    entry.subtasks?.stop()
  }

  stopSubtasks(sessionId: string, ids?: string[]) { this.running.get(sessionId)?.subtasks?.stop(ids) }
}
