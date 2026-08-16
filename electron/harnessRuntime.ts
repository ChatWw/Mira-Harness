import { Agent } from '@earendil-works/pi-agent-core'
import { Type, createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { dialog, BrowserWindow, type WebContents } from 'electron'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { HarnessEvent, HarnessFileReference, HarnessMessage, ModelSelection, PermissionMode } from '../src/config/harness'
import type { PlatformDatabase } from './database'

function emit(sender: WebContents, event: HarnessEvent) { if (!sender.isDestroyed()) sender.send('harness:event', event) }

function messageContent(message: HarnessMessage) {
  if (!message.attachments?.length) return message.content
  const files = message.attachments.map(file => `\n\n[引用文件：${file.path}]\n\`\`\`\n${file.content}\n\`\`\``).join('')
  return `${message.content}${files}`
}

export class HarnessRuntime {
  private readonly running = new Map<string, AbortController>()
  constructor(private readonly database: PlatformDatabase) {}

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
    const session = this.database.harness.addMessage(sessionId, 'user', text, attachments)

    const controller = new AbortController()
    this.running.set(sessionId, controller)
    this.database.harness.updateSession({ ...session, modelProviderId: provider.id, modelId: selection.modelId, status: 'active' })
    emit(sender, { sessionId, type: 'status', payload: { state: 'running' } })

    const model = {
      id: selection.modelId, name: selection.modelId, api: 'openai-completions', provider: 'mira-openai', baseUrl: provider.endpoint,
      reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192,
    } as any
    const models = createModels()
    models.setProvider(createProvider({
      id: 'mira-openai', name: provider.name, baseUrl: provider.endpoint,
      auth: { apiKey: { name: provider.name, resolve: async () => ({ auth: { apiKey } }) } },
      models: [model], api: openAICompletionsApi(),
    }) as any)
    const agent = new Agent({
      initialState: {
        systemPrompt: 'You are Mira, a careful desktop work assistant. Answer in the user\'s language. Tools are unavailable until a project is selected.',
        model,
        messages: session.messages.map(item => ({ role: item.role, content: messageContent(item), timestamp: item.createdAt })),
        tools: this.tools(sender, sessionId),
      } as any,
      streamFn: models.streamSimple.bind(models) as any,
      sessionId,
    })
    let output = ''
    const unsubscribe = agent.subscribe((event: any) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        const delta = event.assistantMessageEvent.delta as string
        output += delta
        emit(sender, { sessionId, type: 'message-delta', payload: { delta } })
      }
    })
    try {
      await agent.prompt(text)
      if (output) this.database.harness.appendAssistantText(sessionId, output)
      this.database.harness.setStatus(sessionId, 'completed')
      emit(sender, { sessionId, type: 'message-complete', payload: { content: output } })
    } catch (error) {
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
