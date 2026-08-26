import { Agent, createBashTool, createEditTool, createReadTool, createWriteTool, estimateContextTokens, estimateTokens, generateSummaryWithUsage } from '@earendil-works/pi-agent-core'
import { createSandboxedEnv, wrapHarnessTool } from './agentTools'
import { createWebFetchTool, createWebSearchTool } from './webTools'
import type { MemoryScope } from './fileMemoryStore'
import type { McpManager } from './mcpManager'
import { Type, createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { DEFAULT_CONTEXT_WINDOW, normalizeAssistantTone, normalizePlanSteps, resolveMiraIdentity, shouldAutoCompactContext, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessRunActivity, type HarnessRunSummary, type HarnessSession, type HarnessTokenUsage, type ModelSelection, type PermissionMode } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import { buildMiraSystemPrompt } from './prompts/mira-system-prompt'
import { withUsageCost } from './usageCost'
import type { RuntimeLogRecord } from './runLogStore'

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

const TOOL_LABELS: Record<string, string> = { read: '读取文件', edit: '编辑文件', list_files: '查看文件', write: '写入文件', delete_file: '删除文件', bash: '执行命令', web_fetch: '抓取网页', web_search: '网页搜索', search_memory: '查询记忆', remember_memory: '保存记忆', forget_memory: '删除记忆' }

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
  private readonly running = new Map<string, { controller: AbortController, agent?: Agent }>()
  private readonly runningProjects = new Map<string, string>()
  private readonly memoryWrites = new Map<string, Promise<void>>()
  private readonly completeListeners = new Set<(event: RunCompleteEvent) => void>()
  constructor(private readonly database: PlatformDatabase, private readonly mcpManager: McpManager, backgroundEventPublisher?: (event: HarnessEvent) => void) {
    publishBackgroundEvent = backgroundEventPublisher
  }

  private log(record: RuntimeLogRecord) {
    try { this.database.logs?.write(record) } catch (error) { console.warn('[Mira] 写入运行日志失败', error) }
  }

  onRunComplete(listener: (event: RunCompleteEvent) => void) { this.completeListeners.add(listener); return () => this.completeListeners.delete(listener) }

  private publishRunComplete(event: RunCompleteEvent) { queueMicrotask(() => this.completeListeners.forEach(listener => listener(event))) }

  private lockProject(session: HarnessSession, sessionId: string) {
    if (!session.projectId) return
    const current = this.runningProjects.get(session.projectId)
    if (current && current !== sessionId) throw new Error('该项目已有 Agent 正在运行')
    this.runningProjects.set(session.projectId, sessionId)
  }

  private unlockProject(session: HarnessSession, sessionId: string) {
    if (session.projectId && this.runningProjects.get(session.projectId) === sessionId) this.runningProjects.delete(session.projectId)
  }

  isProjectRunning(projectId: string) { return this.runningProjects.has(projectId) }

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
    const result = await generateSummaryWithUsage(
      session.messages.map(message => this.toAgentMessage(message, model)) as any,
      models,
      model,
      2048,
      undefined,
      scope === 'project'
        ? 'Generate one concise project memory for future conversations in this project. Include only durable project-specific facts, conventions, decisions, and reusable work habits. Exclude private data, credentials, tokens, addresses, medical information, financial information, and transient discussion. Do not include a next-steps section. If no durable fact should be saved, return exactly NO_MEMORY.'
        : 'Generate one concise global memory for future conversations. Include only durable user preferences, long-term personal context, and reusable work habits that remain useful across projects. Exclude project-specific rules, directory details, one-off task details, private data, credentials, tokens, addresses, medical information, financial information, and transient discussion. Do not include a next-steps section. If no durable fact should be saved, return exactly NO_MEMORY.',
      undefined,
      thinkingLevel as any,
    )
    if (!result.ok) throw new Error('自动提炼记忆失败')
    const content = result.value.text.trim()
    if (!content || content === 'NO_MEMORY') {
      const diff = `- ${scope === 'project' ? '项目' : '全局'}记忆：没有可保存的长期事实\n- ${target}`
      const completedAt = Date.now(); this.database.harness.updateTool(sessionId, recordId, { status: 'ok', diff, completedAt })
      this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, result: diff, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
      emit(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status: 'ok', diff } })
      return
    }
    const saved = this.database.memories.remember(scope, content, session.projectId)
    const diff = saved.created
      ? `- ${scope === 'project' ? '项目' : '全局'}记忆：新增 1 条\n- [${saved.entry.id}] ${saved.entry.content}`
      : `- ${scope === 'project' ? '项目' : '全局'}记忆：已有相同条目\n- [${saved.entry.id}] ${saved.entry.content}`
    const completedAt = Date.now(); this.database.harness.updateTool(sessionId, recordId, { status: 'ok', diff, completedAt })
    this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, result: diff, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
    emit(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status: 'ok', diff } })
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

  private tools(sender: WebContents, sessionId: string) {
    const descriptors = new Map<string, ToolDescriptor>()
    const recordedTools = new Map<string, { tool: string, target: string, startedAt: number }>()
    const register = <T extends { name: string }>(tool: T, descriptor: ToolDescriptor) => {
      descriptors.set(tool.name, descriptor)
      return tool
    }
    const session = () => this.database.harness.getSession(sessionId)
    const record = (tool: string, target: string) => { const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`; const createdAt = Date.now(); recordedTools.set(id, { tool, target, startedAt: createdAt }); this.database.harness.recordTool(sessionId, { id, tool, target, status: 'running', createdAt }); this.log({ event: 'tool', sessionId, tool, target, status: 'running', timestamp: createdAt }); emit(sender, { sessionId, type: 'tool-call', payload: { id, tool, target, status: 'running' } }); return id }
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
    const webFetchTool = register(wrapRecordTool(createWebFetchTool(), params => params.url ?? ''), { risk: 'read', title: () => '', detail: () => '' })
    const webSearchTool = register(wrapRecordTool(createWebSearchTool(), params => params.query ?? ''), { risk: 'read', title: () => '', detail: () => '' })
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
        parameters: Type.Object({ content: Type.String(), scope: Type.Union([Type.Literal('global'), Type.Literal('project')]) }), executionMode: 'sequential',
        execute: async (_id: string, params: { content: string, scope: string }) => {
          const scope = memoryScope(params.scope); const target = this.database.memories.path(scope, session().projectId); const id = record('remember_memory', target)
          try {
            const result = this.database.memories.remember(scope, params.content, session().projectId)
            const diff = result.created ? `- ${memoryScopeLabel(scope)}：新增 1 条\n- [${result.entry.id}] ${result.entry.content}` : `- ${memoryScopeLabel(scope)}：新增 0 条，已有相同记忆\n- [${result.entry.id}] ${result.entry.content}`
            finish(id, 'ok', diff)
            return { content: [{ type: 'text', text: result.created ? `已保存记忆 [${result.entry.id}]。` : `该记忆已存在 [${result.entry.id}]。` }], details: { scope, id: result.entry.id, path: target, created: result.created } }
          } catch (error) { finish(id, 'failed'); throw error }
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
    return { tools: [
      readTool,
      editTool,
      listFilesTool,
      writeTool,
      deleteTool,
      bashTool,
      webFetchTool,
      webSearchTool,
      planTool,
      ...memoryTools,
      ...mcpTools,
    ] as any, descriptors }
  }

  async runMessage(sender: WebContents, sessionId: string, message: string, references: HarnessFileReference[] = [], selection?: ModelSelection) {
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
    const initial = this.database.harness.getSession(sessionId)
    this.lockProject(initial, sessionId)
    try {
      const attachments = this.database.harness.resolveMessageAttachments(sessionId, references)
      const session = this.database.harness.addMessage(sessionId, 'user', text, attachments)
      return this.runAgent(sender, sessionId, session, selection, provider, apiKey)
    } catch (error) { this.unlockProject(initial, sessionId); throw error }
  }

  private requireProvider(selection?: ModelSelection) {
    if (!selection?.providerId || !selection.modelId) throw new Error('请先选择一个可用模型')
    const provider = this.database.models.get(selection.providerId)
    if (!provider?.models.includes(selection.modelId)) throw new Error('所选模型不属于当前供应商')
    const apiKey = this.database.models.getSecret(selection.providerId)
    if (!provider?.enabled || !apiKey) throw new Error('当前 Agent 模型不可用，请检查 Provider 配置')
    return { provider, apiKey }
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
    const initial = this.database.harness.getSession(sessionId)
    this.lockProject(initial, sessionId)
    try { return this.runAgent(sender, sessionId, this.database.harness.regenerate(sessionId), selection, provider, apiKey) }
    catch (error) { this.unlockProject(initial, sessionId); throw error }
  }

  async editAndRerun(sender: WebContents, sessionId: string, messageId: string, content: string, selection?: ModelSelection) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    const initial = this.database.harness.getSession(sessionId)
    this.lockProject(initial, sessionId)
    try { return this.runAgent(sender, sessionId, this.database.harness.editUserMessageAndTruncate(sessionId, messageId, content), selection, provider, apiKey) }
    catch (error) { this.unlockProject(initial, sessionId); throw error }
  }

  async runAutomation(sessionId: string, message: string, selection: ModelSelection, permissionMode: PermissionMode) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    const { provider, apiKey } = this.requireProvider(selection)
    const session = this.database.harness.getSession(sessionId)
    this.lockProject(session, sessionId)
    try {
      const updated = this.database.harness.addMessage(sessionId, 'user', message.trim())
      return this.runAgent(undefined, sessionId, updated, selection, provider, apiKey, { origin: 'automation', permissionMode })
    } catch (error) { this.unlockProject(session, sessionId); throw error }
  }

  private async runAgent(sender: WebContents | undefined, sessionId: string, session: HarnessSession, selection: ModelSelection, provider: any, apiKey: string, options: { origin?: RunOrigin, permissionMode?: PermissionMode } = {}) {
    const origin = options.origin || 'manual'
    await this.memoryWrites.get(sessionId)
    const text = [...session.messages].reverse().find(message => message.role === 'user')?.content
    if (!text) throw new Error('没有可运行的对话')
    const controller = new AbortController()
    this.running.set(sessionId, { controller })
    session = this.database.harness.updateSession({ ...session, modelProviderId: provider.id, modelId: selection.modelId, status: 'active' })
    emit(sender, { sessionId, type: 'status', payload: { state: 'running' } })
    const startedAt = Date.now()
    this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'running', timestamp: startedAt })
    const activities: HarnessRunActivity[] = [{ id: 'thinking-0', label: '正在思考', status: 'running', startedAt }]
    const publishActivities = () => emit(sender, { sessionId, type: 'run-activity', payload: { activities } })
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
    emit(sender, { sessionId, type: 'run-start', payload: { startedAt, activities } })

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
      const memoryEnabled = this.database.memories.enabled()
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
      const registeredTools = this.tools(sender, sessionId)
      const preferences = this.database.getSnapshot().preferences
      const activeSkills = this.database.skills.resolve(session.activeSkillIds || [])
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
          }),
          model,
          thinkingLevel: provider.reasoning ? selection.thinkingLevel || 'medium' : 'off',
          messages: this.agentMessages(session, model),
          tools: registeredTools.tools,
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
      this.unlockProject(session, sessionId)
      emit(sender, { sessionId, type: 'message-complete', payload: {} })
      emit(sender, { sessionId, type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } })
      emit(sender, { sessionId, type: 'status', payload: { state: 'idle' } })
      throw error
    }
    let output = ''
    let pendingAssistantDelta = ''
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
        advancePlan(event.isError ? 'failed' : 'completed')
        const suffix = event.isError ? '执行失败' : '执行完成'
        const activity = activities.find(item => item.id === `tool-${event.toolCallId}`)
        finishActivity(`tool-${event.toolCallId}`, event.isError ? 'failed' : 'completed', `${activity?.detail || '工具调用'}\n${suffix}`)
        publishActivities()
      }
    })
    try {
      await agent.prompt(text)
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
      if (!output) throw new Error('模型没有返回文本')
      finishRunningActivities('completed')
      const completedAt = Date.now()
      const run: HarnessRunSummary = { startedAt, completedAt, durationMs: completedAt - startedAt, activities }
      flushAssistantDelta()
      const usage = contextUsage(this.agentMessages(this.database.harness.getSession(sessionId), model), model.contextWindow)
      run.contextUsage = usage
      const finalUsage = tokenUsage(finalMessage && typeof finalMessage === 'object' ? (finalMessage as { usage?: unknown }).usage : undefined)
      session = this.database.harness.finalizeAssistantMessage(sessionId, { run, usage: finalUsage ? withUsageCost(finalUsage, provider.pricing) : undefined })
      assistantFinalized = true
      session = this.publishContextUsage(sender, session, usage)
      this.database.harness.setStatus(sessionId, 'completed')
      this.log({ event: 'run', sessionId, projectId: session.projectId, providerId: provider.id, modelId: selection.modelId, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
      emit(sender, { sessionId, type: 'message-complete', payload: { content: output, run } })
      const memoryWrite = origin === 'manual' ? this.saveLongTermMemory(sender, sessionId, models, model, provider.reasoning ? selection.thinkingLevel || 'medium' : 'off')
        : Promise.resolve()
        .catch(error => {
          const target = session.projectId ? this.database.memories.path('project', session.projectId) : this.database.memories.path('global')
          const record = this.database.harness.getSession(sessionId).toolCalls.find(item => item.tool === 'memory_auto_save' && item.status === 'running')
          if (record) {
            const message = error instanceof Error ? error.message : String(error)
            const completedAt = Date.now(); this.database.harness.updateTool(sessionId, record.id, { status: 'failed', error: message, completedAt })
            this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, error: message, status: 'failed', timestamp: completedAt, durationMs: completedAt - record.createdAt })
            emit(sender, { sessionId, type: 'tool-call', payload: { id: record.id, tool: 'memory_auto_save', target, status: 'failed', error: message } })
          }
        })
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
        this.database.harness.finalizeAssistantMessage(sessionId, { run: { startedAt, completedAt, durationMs: completedAt - startedAt, activities }, interrupted: aborted })
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
      this.running.delete(sessionId)
      this.unlockProject(session, sessionId)
      emit(sender, { sessionId, type: 'status', payload: { state: 'idle' } })
    }
  }

  abort(sessionId: string) {
    const entry = this.running.get(sessionId)
    if (!entry) return
    entry.controller.abort()
    entry.agent?.abort()
  }
}
