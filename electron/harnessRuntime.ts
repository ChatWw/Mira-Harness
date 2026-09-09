import { Agent, createBashTool, createEditTool, createReadTool, createWriteTool, estimateContextTokens, estimateTokens, generateSummaryWithUsage } from '@earendil-works/pi-agent-core'
import { createSandboxedEnv, wrapHarnessTool } from './agentTools'
import { createWebCitationContext, createWebFetchTool, createWebSearchTool } from './webTools'
import type { MemoryScope } from './fileMemoryStore'
import type { McpManager } from './mcpManager'
import { Type, createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { DEFAULT_CONTEXT_WINDOW, normalizeAssistantTone, normalizeAutoTitle, normalizePlanSteps, resolveMiraIdentity, shouldAutoCompactContext, shouldGenerateAutoTitle, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessRunActivity, type HarnessRunSummary, type HarnessSession, type HarnessSource, type HarnessSubtaskRole, type HarnessTokenUsage, type ModelSelection, type PermissionMode, type HarnessUserAnswer } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import { buildMiraSystemPrompt } from './prompts/mira-system-prompt'
import { withUsageCost } from './usageCost'
import type { RuntimeLogRecord } from './runLogStore'
import { SUBTASK_ROLE_TOOLS, SubtaskRuntime } from './subtaskRuntime'
import { createHarnessEventPublisher } from './harnessEventPublisher'
import { HarnessPermissionPolicy, type ToolDescriptor } from './harnessPermissionPolicy'
import { HarnessPlanCoordinator } from './harnessPlanCoordinator'
import { HarnessSubtaskCoordinator } from './harnessSubtaskCoordinator'
import { HarnessMemoryCoordinator, parseMemoryExtraction } from './harnessMemoryCoordinator'
import { HarnessRunCoordinator, type HarnessRunCompleteEvent, type HarnessRunOrigin } from './harnessRunCoordinator'

export { parseMemoryExtraction }

// [AgentHarness 迁移标记] 当前使用 pi-agent-core 的低层 `Agent`（见下方 new Agent()）。
// 暂不迁移到 `AgentHarness`：0.84.1 中大多核心方法抛 HarnessNotImplemented，且所需
// `@earendil-works/pi-session-backend-sqlite-node` 未安装。重新评估的触发条件与清单见
// wiki/design/HARNESS_ROADMAP.md「AgentHarness 迁移评估 · ADR」。改动本文件前先回看。

const ASSISTANT_PERSIST_INTERVAL_MS = 250

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
  constructor(private readonly database: PlatformDatabase, private readonly mcpManager: McpManager, backgroundEventPublisher?: (event: HarnessEvent) => void) {
    this.emit = createHarnessEventPublisher(backgroundEventPublisher)
    this.runCoordinator = new HarnessRunCoordinator(database, this.emit)
    this.permissionPolicy = new HarnessPermissionPolicy(database, this.emit)
    this.subtaskCoordinator = new HarnessSubtaskCoordinator(database)
    this.memoryCoordinator = new HarnessMemoryCoordinator(database, this.emit, record => this.log(record))
    this.planCoordinator = new HarnessPlanCoordinator(database, this.emit, {
      isRunning: sessionId => this.runCoordinator.isRunning(sessionId),
      requireProvider: selection => this.requireProvider(selection),
      runAgent: (...args) => this.runAgent(...args),
      runMessage: (...args) => this.runMessage(...args),
      abort: sessionId => this.abort(sessionId),
    })
  }

  private log(record: RuntimeLogRecord) {
    try { this.database.logs?.write(record) } catch (error) { console.warn('[Mira] 写入运行日志失败', error) }
  }

  onRunComplete(listener: (event: HarnessRunCompleteEvent) => void) { return this.runCoordinator.onComplete(listener) }

  isProjectRunning(projectId: string) {
    return this.runCoordinator.isProjectRunning(projectId)
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

  private publishContextUsage(sender: WebContents, session: HarnessSession, usage: HarnessContextUsage) {
    session.context = { ...session.context, usage }
    this.database.harness.updateSession(session)
    this.emit(sender, { sessionId: session.id, type: 'context-usage', payload: { usage } })
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

  resolvePermission(requestId: string, allowed: boolean) {
    this.permissionPolicy.resolve(requestId, allowed)
  }

  respondMemoryConfirmation(requestId: string, approved: boolean) {
    this.memoryCoordinator.respondConfirmation(requestId, approved)
  }

  private async preflightToolCall(sender: WebContents | undefined, sessionId: string, descriptors: Map<string, ToolDescriptor>, name: string, args: unknown, automation = false, permissionMode?: PermissionMode) {
    return this.permissionPolicy.preflight(sender, sessionId, descriptors, name, args, automation, permissionMode)
  }

  /** Delegates use fixed role capabilities, never interactive approvals. */
  private preflightSubtaskToolCall(name: string, args: unknown) {
    return this.permissionPolicy.preflightSubtask(name, args)
  }

  private tools(sender: WebContents | undefined, sessionId: string, options: { role?: HarnessSubtaskRole, subtaskId?: string, planning?: boolean } = {}) {
    const descriptors = new Map<string, ToolDescriptor>()
    const recordedTools = new Map<string, { tool: string, target: string, startedAt: number }>()
    const register = <T extends { name: string }>(tool: T, descriptor: ToolDescriptor) => {
      descriptors.set(tool.name, descriptor)
      return tool
    }
    const session = () => this.database.harness.getSession(sessionId)
    const record = (tool: string, target: string) => { const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`; const createdAt = Date.now(); recordedTools.set(id, { tool, target, startedAt: createdAt }); this.database.harness.recordTool(sessionId, { id, tool, target, status: 'running', createdAt, ...(options.subtaskId ? { subtaskId: options.subtaskId } : {}) }); this.log({ event: 'tool', sessionId, tool, target, status: 'running', timestamp: createdAt }); this.emit(sender, { sessionId, type: 'tool-call', payload: { id, tool, target, status: 'running', ...(options.subtaskId ? { subtaskId: options.subtaskId } : {}) } }); return id }
    const finish = (id: string, status: 'ok' | 'failed', diff?: string) => {
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
    return { tools: tools as any, descriptors }
  }

  async runMessage(sender: WebContents, sessionId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection, planning = false) {
    const text = message.trim()
    if (!text) throw new Error('请输入消息')
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    if (text.startsWith('/perm ')) {
      const mode = text.slice(6).trim() as PermissionMode
      if (!['default', 'auto-approve', 'full'].includes(mode)) throw new Error('权限档位应为 default、auto-approve 或 full')
      this.database.harness.setPermission(sessionId, mode)
      this.emit(sender, { sessionId, type: 'status', payload: { permissionMode: mode } })
      return
    }
    const { provider, apiKey } = this.requireProvider(selection)
    const attachments = this.database.harness.resolveMessageAttachments(sessionId, references)
    let session = this.database.harness.addMessage(sessionId, 'user', text, attachments)
    if (planning && !session.activePlan) {
      const plan: HarnessPlan = { id: randomUUID(), status: 'planning', request: text, understanding: '', steps: [], risks: [], createdAt: Date.now(), updatedAt: Date.now() }
      session = this.database.harness.setActivePlan(sessionId, plan)
      this.emit(sender, { sessionId, type: 'plan-updated', payload: { plan } })
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
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    return this.runAgent(sender, sessionId, this.database.harness.regenerate(sessionId), selection, provider, apiKey)
  }

  async editAndRerun(sender: WebContents, sessionId: string, messageId: string, content: string, selection?: ModelSelection) {
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    return this.runAgent(sender, sessionId, this.database.harness.editUserMessageAndTruncate(sessionId, messageId, content), selection, provider, apiKey)
  }

  async runAutomation(sessionId: string, message: string, selection: ModelSelection, permissionMode: PermissionMode) {
    if (this.runCoordinator.isRunning(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    const updated = this.database.harness.addMessage(sessionId, 'user', message.trim())
    return this.runAgent(undefined, sessionId, updated, selection, provider, apiKey, { origin: 'automation', permissionMode })
  }

  async confirmPlan(sender: WebContents, sessionId: string, planId: string, selection?: ModelSelection) {
    return this.planCoordinator.confirm(sender, sessionId, planId, selection)
  }

  async answerInteraction(sender: WebContents, sessionId: string, interactionId: string, answers: HarnessUserAnswer[], selection?: ModelSelection) {
    return this.planCoordinator.answer(sender, sessionId, interactionId, answers, selection)
  }

  async continuePlan(sender: WebContents, sessionId: string, planId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection) {
    return this.planCoordinator.continue(sender, sessionId, planId, message, references, selection)
  }

  cancelPlan(sender: WebContents, sessionId: string, planId: string) {
    return this.planCoordinator.cancel(sender, sessionId, planId)
  }

  private async runAgent(sender: WebContents | undefined, sessionId: string, session: HarnessSession, selection: ModelSelection, provider: any, apiKey: string, options: { origin?: HarnessRunOrigin, permissionMode?: PermissionMode, planning?: boolean } = {}) {
    const origin = options.origin || 'manual'
    await this.memoryCoordinator.waitForPending(sessionId)
    const text = [...session.messages].reverse().find(message => message.role === 'user')?.content
    if (!text) throw new Error('没有可运行的对话')
    const controller = this.runCoordinator.begin(sessionId)
    const runId = randomUUID()
    session = this.database.harness.updateSession({ ...session, modelProviderId: provider.id, modelId: selection.modelId, status: 'active' })
    const autoTitleInput = origin === 'manual' ? firstTurnTitleInput(session) : undefined
    const autoTitleRevision = autoTitleInput && session.titleSource === 'auto' ? this.database.harness.reserveAutoTitle(sessionId) : undefined
    this.emit(sender, { sessionId, runId, type: 'status', payload: { state: 'running' } })
    const startedAt = Date.now()
    this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'running', timestamp: startedAt })
    const activities: HarnessRunActivity[] = [{ id: 'thinking-0', label: '正在思考', status: 'running', startedAt }]
    let subtasks: SubtaskRuntime | undefined
    const publishActivities = () => {
      const currentSubtasks = subtasks?.list() || []
      this.database.harness.setActiveRun(sessionId, { id: runId, startedAt, activities, subtasks: currentSubtasks })
      this.emit(sender, { sessionId, type: 'run-activity', payload: { activities, subtasks: currentSubtasks } })
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
    this.database.harness.setActiveRun(sessionId, { id: runId, startedAt, activities, subtasks: [] })
    this.emit(sender, { sessionId, type: 'run-start', payload: { startedAt, activities, subtasks: [] } })

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
      const memory = options.planning ? { globalMemory: '', projectMemory: '', loaded: false } : this.memoryCoordinator.loadForRun(sender, sessionId, session, text, activities)
      const { globalMemory, projectMemory } = memory
      if (memory.loaded) publishActivities()
      const registeredTools = this.tools(sender, sessionId, options.planning ? { planning: true } : {})
      const preferences = this.database.getSnapshot().preferences
      const activeSkills = options.planning ? [] : this.database.skills.resolve(session.activeSkillIds || [])
      const thinkingLevel = provider.reasoning ? selection.thinkingLevel || 'medium' : 'off'
      let taskTools: any[] = []
      if (!options.planning && origin === 'manual' && session.delegationEnabled !== false && session.workingDirectory) {
        const created = this.subtaskCoordinator.create({
          sender, sessionId, session, model, streamFn: models.streamSimple.bind(models) as any, thinkingLevel, pricing: provider.pricing,
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
      this.runCoordinator.attachAgent(sessionId, agent)
    } catch (error) {
      finishRunningActivities('failed')
      publishActivities()
      this.database.harness.setStatus(sessionId, 'failed')
      this.emit(sender, { sessionId, type: 'message-complete', payload: {} })
      this.emit(sender, { sessionId, type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } })
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
        this.emit(sender, { sessionId, type: 'message-delta', payload: { delta } })
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
          this.emit(sender, { sessionId, type: 'message-delta', payload: { delta } })
        }
        output = finalText
      }
      if (!output && options.planning && this.database.harness.getSession(sessionId).pendingInteraction?.status === 'waiting') {
        output = this.database.harness.getSession(sessionId).pendingInteraction?.kind === 'question' ? '我需要先确认几个关键信息。' : '方案已整理，请确认是否开始执行。'
        pendingAssistantDelta += output
        this.emit(sender, { sessionId, type: 'message-delta', payload: { delta: output } })
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
        this.emit(sender, { sessionId, type: 'plan-updated', payload: { plan: completedPlan } })
      }
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
      this.emit(sender, { sessionId, type: 'message-complete', payload: { content: output, run } })
      if (autoTitleRevision !== undefined && this.database.harness.isAutoTitleCurrent(sessionId, autoTitleRevision)) {
        void this.generateAutoTitle(sender, sessionId, models, model, autoTitleRevision)
      }
      if (origin === 'manual' && !options.planning) {
        this.memoryCoordinator.scheduleAutoSave(sender, sessionId, models, model, provider.reasoning ? selection.thinkingLevel || 'medium' : 'off', (message, targetModel) => this.toAgentMessage(message, targetModel))
      }
      this.runCoordinator.publishComplete({ session, origin, status: 'completed', content: output })
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
        this.emit(sender, { sessionId, type: 'message-complete', payload: { content: output } })
      } else if (!output) {
        this.emit(sender, { sessionId, type: 'message-complete', payload: {} })
      }
      this.database.harness.setStatus(sessionId, aborted ? 'active' : 'failed')
      const failureAt = Date.now()
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: aborted ? 'aborted' : 'failed', timestamp: failureAt, durationMs: failureAt - startedAt, ...(aborted ? {} : { error: error instanceof Error ? error.message : String(error) }) })
      if (!aborted) this.runCoordinator.publishComplete({ session, origin, status: 'failed', content: output || undefined })
      if (!aborted) {
        this.emit(sender, { sessionId, type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } })
        throw error
      }
      this.runCoordinator.publishComplete({ session, origin, status: 'aborted', content: output || undefined })
      return { content: output, interrupted: true }
    } finally {
      flushAssistantDelta()
      unsubscribe()
      await this.runCoordinator.finish(sender, sessionId)
    }
  }

  abort(sessionId: string) {
    this.runCoordinator.abort(sessionId)
  }

  stopSubtasks(sessionId: string, ids?: string[]) { this.runCoordinator.stopSubtasks(sessionId, ids) }
}
