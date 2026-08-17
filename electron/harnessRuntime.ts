import { Agent, estimateContextTokens, estimateTokens, generateSummaryWithUsage } from '@earendil-works/pi-agent-core'
import { Type, createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { dialog, BrowserWindow, type WebContents } from 'electron'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DEFAULT_CONTEXT_WINDOW, shouldAutoCompactContext, type HarnessContextUsage, type HarnessEvent, type HarnessFileReference, type HarnessMessage, type HarnessRunActivity, type HarnessRunSummary, type HarnessSession, type HarnessTokenUsage, type ModelSelection, type PermissionMode } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import { MIRA_SYSTEM_PROMPT } from './prompts/mira-system-prompt'

function emit(sender: WebContents, event: HarnessEvent) { if (!sender.isDestroyed()) sender.send('harness:event', event) }

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

function tokenUsage(value: unknown): HarnessTokenUsage | undefined {
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
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
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
  const safeTarget = target
    .replace(/\b(api[_-]?key|token|password|secret)\b\s*(?:=|:)\s*([^\s'"\r\n]+)/gi, '$1=***')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s'"\r\n]+/gi, '$1***')
    .replace(/\s+/g, ' ')
    .slice(0, 240)
  return `${prefix}：${safeTarget}`
}

export class HarnessRuntime {
  private readonly running = new Map<string, AbortController>()
  constructor(private readonly database: PlatformDatabase) {}

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

  private async approve(sender: WebContents, mode: PermissionMode, title: string, detail: string) {
    if (mode === 'full' || mode === 'auto-approve') return true
    const owner = BrowserWindow.fromWebContents(sender)
    const result = owner ? await dialog.showMessageBox(owner, { type: 'warning', message: title, detail, buttons: ['取消', '允许'], defaultId: 0, cancelId: 0 }) : await dialog.showMessageBox({ type: 'warning', message: title, detail, buttons: ['取消', '允许'], defaultId: 0, cancelId: 0 })
    return result.response === 1
  }

  private tools(sender: WebContents, sessionId: string) {
    const session = () => this.database.harness.getSession(sessionId)
    const record = (tool: string, target: string) => { const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`; this.database.harness.recordTool(sessionId, { id, tool, target, status: 'running', createdAt: Date.now() }); emit(sender, { sessionId, type: 'tool-call', payload: { id, tool, target, status: 'running' } }); return id }
    const finish = (id: string, status: 'ok' | 'failed', diff?: string) => this.database.harness.updateTool(sessionId, id, { status, diff, completedAt: Date.now() })
    return [
      { name: 'read_file', label: '读取文件', description: '读取项目内的文本文件', parameters: Type.Object({ path: Type.String() }), executionMode: 'sequential', execute: async (_id: string, params: { path: string }) => { const id = record('read_file', params.path); try { const file = this.assertProjectPath(session().workingDirectory, params.path); const content = await readFile(file, 'utf8'); finish(id, 'ok'); return { content: [{ type: 'text', text: content }], details: { path: params.path } } } catch (error) { finish(id, 'failed'); throw error } } },
      { name: 'list_files', label: '列出文件', description: '列出项目目录内文件', parameters: Type.Object({ path: Type.Optional(Type.String()) }), executionMode: 'sequential', execute: async (_id: string, params: { path?: string }) => { const target = params.path || '.'; const id = record('list_files', target); try { const dir = this.assertProjectPath(session().workingDirectory, target); const entries = await readdir(dir, { withFileTypes: true }); const text = entries.map(entry => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`).join('\n'); finish(id, 'ok'); return { content: [{ type: 'text', text }], details: { path: target } } } catch (error) { finish(id, 'failed'); throw error } } },
      { name: 'write_file', label: '写入文件', description: '写入项目内文本文件', parameters: Type.Object({ path: Type.String(), content: Type.String() }), executionMode: 'sequential', execute: async (_id: string, params: { path: string, content: string }) => { const id = record('write_file', params.path); try { const allowed = await this.approve(sender, session().permissionMode, '允许 Agent 写入文件？', params.path); if (!allowed) throw new Error('用户拒绝写入文件'); const file = this.assertProjectPath(session().workingDirectory, params.path); await writeFile(file, params.content, 'utf8'); finish(id, 'ok', `~ 修改 ${params.path}`); return { content: [{ type: 'text', text: '文件已写入' }], details: { path: params.path } } } catch (error) { finish(id, 'failed'); throw error } } },
      { name: 'delete_file', label: '删除文件', description: '将项目内文件移动至 Mira 回收站', parameters: Type.Object({ path: Type.String() }), executionMode: 'sequential', execute: async (_id: string, params: { path: string }) => { const id = record('delete', params.path); try { const allowed = await this.approve(sender, session().permissionMode, '允许 Agent 删除文件？', `${params.path}\n文件会移入 Mira 回收站。`); if (!allowed) throw new Error('用户拒绝删除文件'); const result = this.database.harness.moveToTrash(sessionId, params.path); finish(id, 'ok', `- 删除 ${result.path}（可还原）`); return { content: [{ type: 'text', text: `已删除 ${result.path}，可在回收站还原。` }], details: result } } catch (error) { finish(id, 'failed'); throw error } } },
      { name: 'bash', label: '执行命令', description: '在项目目录中执行非危险命令', parameters: Type.Object({ command: Type.String() }), executionMode: 'sequential', execute: async (_id: string, params: { command: string }) => { const id = record('bash', params.command); try { const normalized = ` ${params.command.toLowerCase().replace(/\s+/g, ' ')} `; const blocked = this.database.harness.getPermissionConfig().dangerousCommands.some(item => normalized.includes(item)) || /\brm\b.*(-[a-z]*r[a-z]*|--recursive)/.test(normalized); if (blocked) throw new Error('危险命令已被永久拦截'); const allowed = await this.approve(sender, session().permissionMode, '允许 Agent 执行命令？', params.command); if (!allowed) throw new Error('用户拒绝执行命令'); const cwd = this.assertProjectPath(session().workingDirectory, '.'); const result = await promisify(execFile)(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', process.platform === 'win32' ? ['/d', '/s', '/c', params.command] : ['-lc', params.command], { cwd, timeout: 120000, maxBuffer: 1024 * 1024 }); finish(id, 'ok'); return { content: [{ type: 'text', text: `${result.stdout}${result.stderr}`.slice(0, 100000) || '命令执行完成' }], details: { command: params.command } } } catch (error) { finish(id, 'failed'); throw error } } },
    ] as any
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
    if (!selection?.providerId || !selection.modelId) throw new Error('请先选择一个可用模型')
    const provider = this.database.models.get(selection.providerId)
    if (!provider?.models.includes(selection.modelId)) throw new Error('所选模型不属于当前供应商')
    const apiKey = this.database.models.getSecret(selection.providerId)
    if (!provider?.enabled || !apiKey) throw new Error('当前 Agent 模型不可用，请检查 Provider 配置')
    const attachments = this.database.harness.resolveMessageAttachments(sessionId, references)
    let session = this.database.harness.addMessage(sessionId, 'user', text, attachments)

    const controller = new AbortController()
    this.running.set(sessionId, controller)
    session = this.database.harness.updateSession({ ...session, modelProviderId: provider.id, modelId: selection.modelId, status: 'active' })
    emit(sender, { sessionId, type: 'status', payload: { state: 'running' } })
    const startedAt = Date.now()
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
    emit(sender, { sessionId, type: 'run-start', payload: { startedAt, activities } })

    const model = {
      id: selection.modelId, name: selection.modelId, api: 'openai-completions', provider: 'mira-openai', baseUrl: provider.endpoint,
      reasoning: provider.reasoning, compat: provider.reasoning ? { supportsReasoningEffort: true } : undefined,
      input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: provider.contextWindow || DEFAULT_CONTEXT_WINDOW, maxTokens: 8192,
    } as any
    const models = createModels()
    models.setProvider(createProvider({
      id: 'mira-openai', name: provider.name, baseUrl: provider.endpoint,
      auth: { apiKey: { name: provider.name, resolve: async () => ({ auth: { apiKey } }) } },
      models: [model], api: openAICompletionsApi(),
    }) as any)
    session = await this.compactContext(sender, session, model, models, controller, provider.reasoning ? selection.thinkingLevel || 'medium' : 'off', activities, publishActivities)
    const agent = new Agent({
      initialState: {
        systemPrompt: MIRA_SYSTEM_PROMPT,
        model,
        thinkingLevel: provider.reasoning ? selection.thinkingLevel || 'medium' : 'off',
        messages: this.agentMessages(session, model),
        tools: this.tools(sender, sessionId),
      } as any,
      streamFn: models.streamSimple.bind(models) as any,
      sessionId,
    })
    let output = ''
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
        emit(sender, { sessionId, type: 'message-delta', payload: { delta } })
      }
      if (event.type === 'tool_execution_start') {
        activities.filter(item => item.status === 'running' && item.label === '正在思考').forEach(item => finishActivity(item.id))
        const labels: Record<string, string> = { read_file: '读取文件', list_files: '查看文件', write_file: '写入文件', delete_file: '删除文件', bash: '执行命令' }
        startActivity(`tool-${event.toolCallId}`, labels[event.toolName] || `执行工具：${event.toolName}`, activityDetail(event.toolName, event.args))
        publishActivities()
      }
      if (event.type === 'tool_execution_end') {
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
      if (finalText && finalText !== output) {
        const delta = finalText.startsWith(output) ? finalText.slice(output.length) : finalText
        if (delta) emit(sender, { sessionId, type: 'message-delta', payload: { delta } })
        output = finalText
      }
      if (!output) throw new Error('模型没有返回文本')
      finishRunningActivities('completed')
      const completedAt = Date.now()
      const run: HarnessRunSummary = { startedAt, completedAt, durationMs: completedAt - startedAt, activities }
      session = this.database.harness.appendAssistantText(sessionId, output, run, tokenUsage(finalMessage && typeof finalMessage === 'object' ? (finalMessage as { usage?: unknown }).usage : undefined))
      const usage = contextUsage(this.agentMessages(session, model), model.contextWindow)
      run.contextUsage = usage
      if (session.messages.at(-1)?.run) session.messages.at(-1)!.run!.contextUsage = usage
      session = this.publishContextUsage(sender, session, usage)
      this.database.harness.setStatus(sessionId, 'completed')
      emit(sender, { sessionId, type: 'message-complete', payload: { content: output, run } })
    } catch (error) {
      finishRunningActivities('failed')
      publishActivities()
      this.database.harness.setStatus(sessionId, 'failed')
      emit(sender, { sessionId, type: 'error', payload: { message: error instanceof Error ? error.message : String(error) } })
      throw error
    } finally {
      unsubscribe()
      this.running.delete(sessionId)
      emit(sender, { sessionId, type: 'status', payload: { state: 'idle' } })
    }
  }

  abort(sessionId: string) { this.running.get(sessionId)?.abort() }
}
