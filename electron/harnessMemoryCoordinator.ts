import { generateSummaryWithUsage } from '@earendil-works/pi-agent-core'
import { Type, createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { DEFAULT_CONTEXT_WINDOW, type HarnessEvent, type HarnessMessage, type HarnessRunActivity, type HarnessSession, type MemoryCandidate, type MemorySensitivity, type ModelSelection } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import { classifyMemoryContent, type MemoryScope } from './fileMemoryStore'
import type { ToolDescriptor } from './harnessPermissionPolicy'
import type { RuntimeLogRecord } from './runLogStore'

type ExtractedMemory = { decision: 'save' | 'no_memory', sensitivity: MemorySensitivity, content?: string, redactedContent?: string }
type PublishEvent = (sender: WebContents | undefined, event: HarnessEvent) => unknown
type ProviderSelection = { provider: any, apiKey: string }
type ToolRegistration = {
  register: <T extends { name: string }>(tool: T, descriptor: ToolDescriptor) => T
  record: (tool: string, target: string) => string
  finish: (id: string, status: 'ok' | 'failed', diff?: string) => void
  session: () => HarnessSession
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
  return { decision: 'save', sensitivity: 'none', content: value }
}

export class HarnessMemoryCoordinator {
  private readonly writes = new Map<string, Promise<void>>()
  private readonly confirmations = new Map<string, { resolve: (approved: boolean) => void, timer: ReturnType<typeof setTimeout>, candidate: MemoryCandidate }>()

  constructor(private readonly database: PlatformDatabase, private readonly publish: PublishEvent, private readonly log: (record: RuntimeLogRecord) => void) {}

  waitForPending(sessionId: string) { return this.writes.get(sessionId) }

  respondConfirmation(requestId: string, approved: boolean) {
    const entry = this.confirmations.get(requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    this.confirmations.delete(requestId)
    entry.resolve(Boolean(approved))
  }

  list(scope: MemoryScope, projectId?: string) { return this.database.memories.list(scope, projectId) }

  remember(content: string) {
    if (!this.database.memories.enabled()) throw new Error('请先启用记忆后再保存')
    return this.database.memories.remember('global', content, undefined, { source: 'manual' })
  }

  update(scope: MemoryScope, id: string, content: string, projectId?: string) { return this.database.memories.update(scope, id, content, projectId) }
  delete(scope: MemoryScope, id: string, projectId?: string) { return this.database.memories.delete(scope, id, projectId) }
  listPending() { return this.database.memories.listPending() }
  discardPending(candidateId: string) { this.database.memories.removePending(candidateId) }

  async retry(candidateId: string) {
    const candidate = this.database.memories.listPending().find(item => item.id === candidateId)
    if (!candidate) throw new Error('未找到待重试的记忆候选')
    const content = candidate.redactedContent || candidate.content
    if (!content) throw new Error('该记忆需要重新提炼原会话，请在原会话中重新发起记忆请求')
    const classified = classifyMemoryContent(content)
    if (classified.sensitivity === 'secret') throw new Error('记忆内容包含高风险秘密，未写入')
    const result = this.database.memories.remember(candidate.scope, content, candidate.projectId, { source: candidate.source, sourceSessionId: candidate.sessionId, sensitivity: classified.sensitivity, allowPersonal: classified.sensitivity === 'personal' })
    this.database.memories.removePending(candidateId)
    this.publish(undefined, { sessionId: candidate.sessionId || '', type: 'memory-status', payload: { status: result.created ? 'saved' : 'duplicate', candidateId, entryId: result.entry.id, content: result.entry.content } })
  }

  async saveProject(sender: WebContents, sessionId: string, selection: ModelSelection | undefined, options: {
    isRunning: (sessionId: string) => boolean
    requireProvider: (selection?: ModelSelection) => ProviderSelection
    toAgentMessage: (message: HarnessMessage, model: { api: string, provider: string, id: string }) => unknown
  }) {
    if (options.isRunning(sessionId)) throw new Error('该会话正在运行')
    if (!this.database.memories.enabled()) throw new Error('请先在个性化设置中启用记忆')
    const session = this.database.harness.getSession(sessionId)
    if (!session.projectId) throw new Error('请先选择项目后再保存项目记忆')
    if (!session.messages.some(message => message.role === 'user') || !session.messages.some(message => message.role === 'assistant')) throw new Error('当前对话还没有可保存的内容')
    const { provider, apiKey } = options.requireProvider(selection)
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
    const task = this.saveLongTerm(sender, sessionId, models, model, provider.reasoning ? selection!.thinkingLevel || 'medium' : 'off', options.toAgentMessage)
    this.track(sessionId, task)
    await task
  }

  scheduleAutoSave(sender: WebContents | undefined, sessionId: string, models: ReturnType<typeof createModels>, model: any, thinkingLevel: string, toAgentMessage: (message: HarnessMessage, model: { api: string, provider: string, id: string }) => unknown) {
    const task = this.saveLongTerm(sender, sessionId, models, model, thinkingLevel, toAgentMessage).catch(() => undefined)
    this.track(sessionId, task)
  }

  loadForRun(sender: WebContents | undefined, sessionId: string, session: HarnessSession, query: string, activities: HarnessRunActivity[]) {
    if (!this.database.memories.enabled()) return { globalMemory: '', projectMemory: '', loaded: false }
    const load = (scope: MemoryScope) => {
      const target = this.database.memories.path(scope, session.projectId)
      const entries = this.database.memories.search(scope, query, session.projectId)
      const detail = `${scope === 'global' ? '全局' : '项目'}记忆：加载 ${entries.length} 条\n${target}`
      const recordId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const startedAt = Date.now()
      this.database.harness.recordTool(sessionId, { id: recordId, tool: 'memory_load', target, status: 'running', createdAt: startedAt })
      this.log({ event: 'tool', sessionId, tool: 'memory_load', target, status: 'running', timestamp: startedAt })
      this.publish(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_load', target, status: 'running' } })
      const completedAt = Date.now()
      const diff = `- ${detail.replace('\n', '\n- ')}`
      this.database.harness.updateTool(sessionId, recordId, { status: 'ok', diff, completedAt })
      this.log({ event: 'tool', sessionId, tool: 'memory_load', target, result: diff, status: 'completed', timestamp: completedAt, durationMs: completedAt - startedAt })
      this.publish(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_load', target, status: 'ok', diff } })
      activities.push({ id: `memory-load-${scope}`, label: `加载${scope === 'global' ? '全局' : '项目'}记忆`, detail, status: 'completed', startedAt: Date.now(), completedAt: Date.now() })
      return entries.map(entry => `- [${entry.id}] ${entry.content}`).join('\n')
    }
    return {
      globalMemory: load('global'),
      projectMemory: session.projectId ? load('project') : '',
      loaded: true,
    }
  }

  createTools(sender: WebContents | undefined, sessionId: string, registration: ToolRegistration) {
    if (!this.database.memories.enabled()) return []
    const { register, record, finish, session } = registration
    const memoryScope = (value: string): MemoryScope => {
      if (value !== 'global' && value !== 'project') throw new Error('记忆范围必须是 global 或 project')
      if (value === 'project' && !session().projectId) throw new Error('当前是临时会话，不能写入项目记忆；请先关联项目或改为全局记忆')
      return value
    }
    const label = (scope: MemoryScope) => scope === 'global' ? '全局记忆' : '项目记忆'
    const readDescriptor: ToolDescriptor = { risk: 'read', title: () => '', detail: () => '' }
    return [
      register({
        name: 'search_memory', label: '查询记忆', description: '从全局或当前项目的长期记忆中查询事实。用户询问此前偏好、背景或已保存记忆时使用。',
        parameters: Type.Object({ query: Type.String(), scope: Type.Union([Type.Literal('global'), Type.Literal('project')]) }), executionMode: 'sequential',
        execute: async (_id: string, params: { query: string, scope: string }) => {
          const scope = memoryScope(params.scope); const target = this.database.memories.path(scope, session().projectId); const id = record('search_memory', target)
          try {
            const entries = this.database.memories.search(scope, params.query, session().projectId)
            const text = entries.length ? entries.map(entry => `- [${entry.id}] ${entry.content}`).join('\n') : '没有找到相关记忆。'
            finish(id, 'ok', `- ${label(scope)}：加载 ${entries.length} 条\n- ${target}`)
            return { content: [{ type: 'text', text }], details: { scope, count: entries.length, path: target } }
          } catch (error) { finish(id, 'failed'); throw error }
        },
      }, readDescriptor),
      register({
        name: 'remember_memory', label: '保存记忆', description: '仅在用户明确要求记住某项长期事实时保存到指定范围。内容必须是稳定、可复用的事实或偏好。',
        parameters: Type.Object({ content: Type.String(), redactedContent: Type.Optional(Type.String()), scope: Type.Union([Type.Literal('global'), Type.Literal('project')]) }), executionMode: 'sequential',
        execute: async (_id: string, params: { content: string, redactedContent?: string, scope: string }) => {
          const scope = memoryScope(params.scope); const target = this.database.memories.path(scope, session().projectId); const id = record('remember_memory', target)
          try {
            const classified = classifyMemoryContent(params.content)
            if (classified.sensitivity === 'secret') {
              finish(id, 'ok', '- 出于安全原因，未保存高风险秘密')
              this.publish(sender, { sessionId, type: 'memory-status', payload: { status: 'blocked_secret', candidateId: id } })
              return { content: [{ type: 'text', text: '出于安全原因，不能将这类敏感信息保存到长期记忆。' }], details: { scope, path: target, status: 'blocked_secret' } }
            }
            if (classified.sensitivity === 'personal') {
              const redactedContent = typeof params.redactedContent === 'string' && params.redactedContent.trim() ? params.redactedContent.trim() : classified.redactedContent
              if (!redactedContent) {
                finish(id, 'ok', '- 个人敏感信息未提供安全脱敏内容，未保存')
                this.publish(sender, { sessionId, type: 'memory-status', payload: { status: 'blocked_secret', candidateId: id } })
                return { content: [{ type: 'text', text: '这类个人敏感信息没有可用的安全脱敏版本，未保存。' }], details: { scope, path: target, status: 'blocked_secret' } }
              }
              const candidate: MemoryCandidate = { id, sessionId, scope, projectId: session().projectId, source: 'explicit', decision: 'save', sensitivity: 'personal', redactedContent, status: 'candidate', createdAt: Date.now(), updatedAt: Date.now() }
              this.database.memories.savePending({ ...candidate, status: 'needs_confirmation' })
              this.database.harness.updateTool(sessionId, id, { status: 'waiting-confirm' })
              this.publish(sender, { sessionId, type: 'tool-call', payload: { id, tool: 'remember_memory', target, status: 'waiting-confirm' } })
              const confirmation = await this.requestConfirmation(sender, sessionId, candidate)
              if (!confirmation.approved) {
                this.database.memories.removePending(candidate.id)
                finish(id, 'ok', '- 用户拒绝保存脱敏记忆')
                return { content: [{ type: 'text', text: '已取消保存这条敏感个人信息。' }], details: { scope, path: target, status: 'rejected' } }
              }
              const result = this.database.memories.remember(scope, redactedContent, session().projectId, { source: 'explicit', sensitivity: 'personal', allowPersonal: true, sourceSessionId: sessionId })
              this.database.memories.removePending(candidate.id)
              const diff = result.created ? `- ${label(scope)}：新增 1 条\n- [${result.entry.id}] ${result.entry.content}` : `- ${label(scope)}：已有相同记忆\n- [${result.entry.id}] ${result.entry.content}`
              finish(id, 'ok', diff)
              this.publish(sender, { sessionId, type: 'memory-status', payload: { status: result.created ? 'saved' : 'duplicate', candidateId: id, entryId: result.entry.id, content: result.entry.content } })
              return { content: [{ type: 'text', text: result.created ? `已保存记忆 [${result.entry.id}]。` : `该记忆已存在 [${result.entry.id}]。` }], details: { scope, id: result.entry.id, path: target, created: result.created } }
            }
            const result = this.database.memories.remember(scope, params.content, session().projectId, { source: 'explicit', sensitivity: 'none', sourceSessionId: sessionId })
            const diff = result.created ? `- ${label(scope)}：新增 1 条\n- [${result.entry.id}] ${result.entry.content}` : `- ${label(scope)}：新增 0 条，已有相同记忆\n- [${result.entry.id}] ${result.entry.content}`
            finish(id, 'ok', diff)
            this.publish(sender, { sessionId, type: 'memory-status', payload: { status: result.created ? 'saved' : 'duplicate', candidateId: id, entryId: result.entry.id, content: result.entry.content } })
            return { content: [{ type: 'text', text: result.created ? `已保存记忆 [${result.entry.id}]。` : `该记忆已存在 [${result.entry.id}]。` }], details: { scope, id: result.entry.id, path: target, created: result.created } }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const classified = classifyMemoryContent(params.content)
            if (classified.sensitivity !== 'secret') this.database.memories.savePending({ id, sessionId, scope: params.scope as MemoryScope, projectId: session().projectId, source: 'explicit', decision: 'save', sensitivity: classified.sensitivity, content: classified.sensitivity === 'none' ? params.content.trim() : undefined, redactedContent: params.redactedContent?.trim() || classified.redactedContent, status: 'failed', error: message, createdAt: Date.now(), updatedAt: Date.now() })
            finish(id, 'failed')
            this.publish(sender, { sessionId, type: 'memory-status', payload: { status: 'failed', candidateId: id, error: message } })
            throw error
          }
        },
      }, readDescriptor),
      register({
        name: 'forget_memory', label: '删除记忆', description: '仅在用户明确要求删除长期记忆时，按查询到的记忆 ID 删除指定范围中的一条记忆。',
        parameters: Type.Object({ id: Type.String(), scope: Type.Union([Type.Literal('global'), Type.Literal('project')]) }), executionMode: 'sequential',
        execute: async (_id: string, params: { id: string, scope: string }) => {
          const scope = memoryScope(params.scope); const target = this.database.memories.path(scope, session().projectId); const recordId = record('forget_memory', target)
          try {
            this.database.memories.forget(scope, params.id, session().projectId)
            finish(recordId, 'ok', `- ${label(scope)}：删除 1 条\n- 删除记忆 [${params.id}]`)
            return { content: [{ type: 'text', text: `已删除记忆 [${params.id}]。` }], details: { scope, id: params.id, path: target } }
          } catch (error) { finish(recordId, 'failed'); throw error }
        },
      }, readDescriptor),
    ]
  }

  private track(sessionId: string, task: Promise<void>) {
    this.writes.set(sessionId, task)
    void task.finally(() => { if (this.writes.get(sessionId) === task) this.writes.delete(sessionId) })
  }

  private async requestConfirmation(sender: WebContents | undefined, sessionId: string, candidate: MemoryCandidate) {
    const requestId = randomUUID()
    const promise = new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        this.confirmations.delete(requestId)
        this.publish(sender, { sessionId, type: 'memory-status', payload: { status: 'rejected', requestId, candidateId: candidate.id, reason: '确认超时' } })
        resolve(false)
      }, 5 * 60 * 1000)
      this.confirmations.set(requestId, { resolve, timer, candidate })
    })
    this.publish(sender, { sessionId, type: 'memory-status', payload: { status: 'needs_confirmation', requestId, candidateId: candidate.id, content: candidate.redactedContent } })
    return { requestId, approved: await promise }
  }

  private async saveLongTerm(sender: WebContents | undefined, sessionId: string, models: ReturnType<typeof createModels>, model: any, thinkingLevel: string, toAgentMessage: (message: HarnessMessage, model: { api: string, provider: string, id: string }) => unknown) {
    if (!this.database.memories.enabled()) return
    const session = this.database.harness.getSession(sessionId)
    if (!session.messages.some(message => message.role === 'assistant') || !session.messages.some(message => message.role === 'user')) return
    const scope: MemoryScope = session.projectId ? 'project' : 'global'
    const target = this.database.memories.path(scope, session.projectId)
    const recordId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const startedAt = Date.now()
    this.database.harness.recordTool(sessionId, { id: recordId, tool: 'memory_auto_save', target, status: 'running', createdAt: startedAt })
    this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, status: 'running', timestamp: startedAt })
    this.publish(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status: 'running' } })
    try {
      const result = await generateSummaryWithUsage(
        session.messages.map(message => toAgentMessage(message, model)) as any,
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
      if (extracted.decision === 'no_memory' || !extracted.content) return this.finishAutoSave(sender, sessionId, recordId, target, 'ok', '- 没有可保存的长期事实')
      const classified = classifyMemoryContent(extracted.content)
      const sensitivity = classified.sensitivity === 'secret' || extracted.sensitivity === 'secret' ? 'secret' : classified.sensitivity === 'personal' || extracted.sensitivity === 'personal' ? 'personal' : 'none'
      if (sensitivity !== 'none') return this.finishAutoSave(sender, sessionId, recordId, target, 'ok', sensitivity === 'secret' ? '- 出于安全原因未保存敏感秘密' : '- 自动记忆包含个人敏感信息，未主动保存')
      const saved = this.database.memories.remember(scope, extracted.content, session.projectId, { source: 'auto', sensitivity: 'none' })
      return this.finishAutoSave(sender, sessionId, recordId, target, 'ok', saved.created ? `- ${scope === 'project' ? '项目' : '全局'}记忆：新增 1 条\n- [${saved.entry.id}] ${saved.entry.content}` : `- ${scope === 'project' ? '项目' : '全局'}记忆：已有相同条目\n- [${saved.entry.id}] ${saved.entry.content}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.database.harness.updateTool(sessionId, recordId, { status: 'failed', error: message, completedAt: Date.now() })
      this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, error: message, status: 'failed', timestamp: Date.now(), durationMs: Date.now() - startedAt })
      this.publish(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status: 'failed', error: message } })
      throw error
    }
  }

  private finishAutoSave(sender: WebContents | undefined, sessionId: string, recordId: string, target: string, status: 'ok' | 'failed', diff: string) {
    const completedAt = Date.now()
    this.database.harness.updateTool(sessionId, recordId, { status, diff, completedAt })
    this.log({ event: 'tool', sessionId, tool: 'memory_auto_save', target, result: diff, status: status === 'ok' ? 'completed' : 'failed', timestamp: completedAt })
    this.publish(sender, { sessionId, type: 'tool-call', payload: { id: recordId, tool: 'memory_auto_save', target, status, diff } })
  }
}
