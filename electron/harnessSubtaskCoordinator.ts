import type { Agent } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import type { WebContents } from 'electron'
import { isAbsolute } from 'node:path'
import { normalizeAssistantTone, type HarnessSession, type HarnessSubtaskRole } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import { buildMiraSystemPrompt } from './prompts/mira-system-prompt'
import { ProjectTaskLock } from './projectTaskLock'
import { SubtaskRuntime, subtaskMayMutate } from './subtaskRuntime'
import { withUsageCost } from './usageCost'

type CreateSubtasksOptions = {
  sender: WebContents | undefined
  sessionId: string
  session: HarnessSession
  model: any
  streamFn: any
  thinkingLevel: string
  pricing: any
  publishActivities: () => void
  toolsForTask: (role: HarnessSubtaskRole, taskId: string) => any[]
  preflightToolCall: (name: string, args: unknown) => Promise<any>
  getParentAgent: () => Agent | undefined
}

export class HarnessSubtaskCoordinator {
  private readonly projectLocks = new ProjectTaskLock()

  constructor(private readonly database: PlatformDatabase) {}

  acquireProjectLock(projectId: string | undefined, mode: 'read' | 'write', signal?: AbortSignal) {
    return this.projectLocks.acquire(projectId, mode, signal)
  }

  create(options: CreateSubtasksOptions) {
    const { session, sessionId } = options
    const runtime = new SubtaskRuntime(async (role, signal) => this.acquireProjectLock(session.projectId, subtaskMayMutate(role) ? 'write' : 'read', signal))
    const preferences = this.database.getSnapshot().preferences
    const childPrompt = (role: HarnessSubtaskRole) => [
      `你是 Mira 的 ${role} 子任务 Agent。只能完成收到的一项任务，不能联系用户、不能委派、不能假称执行过未调用的工具。`,
      role === 'implementer' ? '可在指定项目内修改文件；只改本任务需要的内容。' : role === 'tester' ? '可执行测试命令；不要以直接编辑文件的方式修改工作区。' : '你没有被授予任意写入权限；不得声称修改了文件。',
      '最终回复是父 Agent 唯一得到的完整报告。简洁说明结论、真实改动/检查、关键文件路径，以及未完成项。不要输出思维过程。',
      buildMiraSystemPrompt({ tone: normalizeAssistantTone(preferences.assistantTone), context: { instructions: this.database.instructions.resolve(session.workingDirectory) } }),
    ].join('\n\n')

    const tools = [
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
          const child = runtime.create({
            parentToolCallId: toolCallId, role: params.role, task: params.task.trim(),
            prompt: `${params.task.trim()}${attachments.length ? `\n\n已附带文件：\n${attachments.map(file => `[${file.path}]\n${file.content}`).join('\n\n')}` : ''}`,
            files: references, systemPrompt: childPrompt(params.role), model: options.model, streamFn: options.streamFn, thinkingLevel: options.thinkingLevel,
            toolsForTask: taskId => options.toolsForTask(params.role, taskId),
            beforeToolCall: async ({ toolCall, args }) => options.preflightToolCall(toolCall.name, args),
            onChanged: options.publishActivities,
            onFinished: childTask => {
              if (childTask.usage) childTask.usage = withUsageCost(childTask.usage, options.pricing)
              options.publishActivities()
              options.getParentAgent()?.followUp({ role: 'user', content: `子任务 ${childTask.id} 已结束，状态：${childTask.status}。如需报告，请调用 wait_for_tasks。`, timestamp: Date.now() } as any)
            },
          })
          return { content: [{ type: 'text', text: `已创建子任务 ${child.id}（${child.role}）。` }], details: { id: child.id, status: child.status } }
        },
      },
      {
        name: 'list_tasks', label: '列出子任务', description: '查看当前父任务的子任务状态，不返回报告正文。', parameters: Type.Object({}), executionMode: 'sequential',
        execute: async () => ({ content: [{ type: 'text', text: runtime.list().map(task => `${task.id} | ${task.role} | ${task.status}`).join('\n') || '没有子任务。' }] }),
      },
      {
        name: 'wait_for_tasks', label: '等待子任务', description: '等待全部或指定子任务完成并读取受限最终报告。', parameters: Type.Object({ ids: Type.Optional(Type.Array(Type.String())) }), executionMode: 'sequential',
        execute: async (_id: string, params: { ids?: string[] }) => {
          const completed = await runtime.wait(params.ids)
          const text = completed.map(task => `## ${task.id} · ${task.role} · ${task.status}\n${task.report || task.error?.message || '无报告'}`).join('\n\n') || '没有匹配的子任务。'
          return { content: [{ type: 'text', text }], details: { ids: completed.map(task => task.id) } }
        },
      },
      {
        name: 'stop_tasks', label: '停止子任务', description: '停止全部或指定仍在运行的子任务。', parameters: Type.Object({ ids: Type.Optional(Type.Array(Type.String())) }), executionMode: 'sequential',
        execute: async (_id: string, params: { ids?: string[] }) => { runtime.stop(params.ids); return { content: [{ type: 'text', text: '已请求停止子任务。' }] } },
      },
    ]

    return { runtime, tools }
  }
}
