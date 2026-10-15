import type { Agent } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import type { WebContents } from 'electron'
import { isAbsolute } from 'node:path'
import { realpathSync } from 'node:fs'
import { normalizeAssistantTone, type HarnessSession, type HarnessSubtaskRole, type ModelSelection } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import { buildMiraSystemPrompt } from '../prompts/mira-system-prompt'
import { ProjectTaskLock } from './projectTaskLock'
import { SubtaskRuntime, subtaskMayMutate } from './subtaskRuntime'
import type { SubtaskToolRegistry, SubtaskToolScope } from './subtaskRuntime'
import { withUsageCost } from './usageCost'
import type { MiraAgentModelTarget } from '../../src/config/miraAgentModels'
import { matchesMiraAgentToolRule } from '../../src/config/miraAgentToolRules'

type CreateSubtasksOptions = {
  sender: WebContents | undefined
  sessionId: string
  session: HarnessSession
  model: any
  streamFn: any
  thinkingLevel: string
  pricing: any
  secrets?: string[]
  /** Selected, connected parent-startup service identities, including services with zero tools. */
  parentMcpSnapshot?: readonly { id: string; name: string }[]
  publishActivities: () => void
  toolsForTask: (role: HarnessSubtaskRole, taskId: string, scope: SubtaskToolScope, secrets?: string[]) => any[] | SubtaskToolRegistry
  resolveModel?: (selection: ModelSelection) => { model: any; streamFn: any; thinkingLevel: string; pricing?: any; secrets?: string[]; assertAvailable?: () => void }
  preflightToolCall: (name: string, args: unknown) => Promise<any>
  resolveParentToolCallId?: (providerCallId: string, args: unknown) => string
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
    const parentMcpSnapshot = options.parentMcpSnapshot?.map(server => ({ id: server.id, name: server.name }))
    const runtime = new SubtaskRuntime(async (role, signal) => this.acquireProjectLock(session.projectId, subtaskMayMutate(role) ? 'write' : 'read', signal))
    const waitingReports = new Set<Set<string> | undefined>()
    const preferences = this.database.getSnapshot().preferences
    const pluginAgents = this.database.plugins.catalog(session.pluginCatalog || []).filter(plugin => plugin.enabled && !plugin.error && !plugin.conflicts.length)
      .flatMap(plugin => (plugin.agents || []).filter(agent => !agent.unavailableReason).map(agent => ({ name: agent.name, description: agent.description, tools: agent.tools, disallowedTools: agent.disallowedTools, mcpServers: agent.mcpServers })))
    const userAgents = this.database.userAgents.list(session.workingDirectory).filter(agent => agent.enabled && !agent.shadowed && !agent.unavailableReason)
      .map(agent => ({ name: agent.name, description: agent.description, tools: agent.tools, disallowedTools: agent.disallowedTools, mcpServers: agent.mcpServers }))
    const childPrompt = (role: HarnessSubtaskRole, injectAgentsMd = true) => [
      `你是 Mira 的 ${role} 子任务 Agent。只能完成收到的一项任务，不能联系用户、不能委派、不能假称执行过未调用的工具。`,
      role === 'implementer' ? '可修改本任务指定的文件；相对路径以工作目录解析，外部资源遵循任务权限审批。只改本任务需要的内容。' : role === 'tester' ? '可执行测试命令；不要以直接编辑文件的方式修改工作区。' : '你没有被授予任意写入权限；不得声称修改了文件。',
      '最终回复是父 Agent 唯一得到的完整报告。简洁说明结论、真实改动/检查、关键文件路径，以及未完成项。不要输出思维过程。',
      buildMiraSystemPrompt({ tone: normalizeAssistantTone(preferences.assistantTone), context: { instructions: injectAgentsMd ? this.database.instructions.resolve(session.workingDirectory) : undefined } }),
    ].join('\n\n')

    const tools = [
      {
        name: 'delegate_task', label: '委派子任务', description: '把可独立完成的工作委派给 explorer、reviewer、tester 或 implementer。用户输入中的 @explorer、@reviewer、@tester、@implementer 表示希望对应角色协作；结合任务按需委派，不把引用当作权限授权。子任务不共享本次对话，只获得任务说明与可选项目内文件。先判断关键路径：下一步就要依赖结果的工作留在主线自己做；多个改动类子任务分配互不重叠的文件范围。'
          + (pluginAgents.length ? ` 可选 agent 为已安装插件的完整名称，@plugin:agent 只是协作请求。role 仍是工具权限上限，profile.tools 与 role 取交集，disallowedTools 只缩减；省略 agent 使用内置角色。可用插件 Agent：${JSON.stringify(pluginAgents)}` : '')
          + (userAgents.length ? ` 可选自定义 agent 使用完整裸名，@name 只表达协作请求，不授权工具。项目优先于全局，profile 工具不得超过 role 权限；其专属模型只影响子任务。可用自定义 Agent：${JSON.stringify(userAgents)}` : ''),
        parameters: Type.Object({ role: Type.Union([Type.Literal('explorer'), Type.Literal('reviewer'), Type.Literal('tester'), Type.Literal('implementer')]), agent: Type.Optional(Type.String({ maxLength: 256 })), task: Type.String(), files: Type.Optional(Type.Array(Type.String())) }), executionMode: 'sequential',
        execute: async (toolCallId: string, params: { role: HarnessSubtaskRole, agent?: string, task: string, files?: string[] }) => {
          const profile = params.agent === undefined ? undefined : params.agent.includes(':')
            ? this.database.plugins.resolveAgent(session.pluginCatalog || [], params.agent)
            : this.database.userAgents.resolve(params.agent, session.workingDirectory)
          if (params.agent !== undefined && !profile) throw new Error('自定义 Agent 不存在，请重新选择；省略 agent 才使用内置角色')
          const scopedMcpIds = profile?.mcpServers?.length ? new Set(profile.mcpServers.map(name => {
            const matches = parentMcpSnapshot?.filter(server => server.name === name) || []
            const ids = [...new Set(matches.map(server => server.id))]
            if (!ids.length) throw new Error(`Agent 所需 MCP 服务未在父任务启动时选择并连接：${name}`)
            if (ids.length > 1) throw new Error(`Agent 所需 MCP 服务名称不唯一：${name}；请调整服务名称后重新发送`)
            return ids[0]!
          })) : undefined
          const directory = profile && session.workingDirectory ? realpathSync(session.workingDirectory) : undefined
          const modelTarget: MiraAgentModelTarget | undefined = profile
            ? 'scope' in profile ? undefined : { kind: 'plugin', pluginId: profile.pluginId, name: profile.name }
            : { kind: 'builtin', name: params.role }
          const selectedModel = profile && 'scope' in profile ? profile.modelSelection : modelTarget ? this.database.agentModels.get(modelTarget) : undefined
          if (selectedModel && !options.resolveModel) throw new Error('智能体专属模型解析不可用')
          const childModel = selectedModel ? options.resolveModel!(selectedModel) : options
          const secrets = [...new Set([...(options.secrets || []), ...(childModel.secrets || [])])]
          const assertProfile = () => {
            if (modelTarget && JSON.stringify(this.database.agentModels.get(modelTarget)) !== JSON.stringify(selectedModel)) throw new Error('智能体专属模型配置已变化，请重新委派')
            if (profile) {
              const current = this.database.harness.getSession(sessionId)
              if (current.projectId !== session.projectId || !current.workingDirectory || realpathSync(current.workingDirectory) !== directory) throw new Error('Agent 工作目录已变化，请重新委派')
              if ('scope' in profile) this.database.userAgents.assert(profile, current.workingDirectory)
              else this.database.plugins.assertAgent(current.pluginCatalog || [], profile)
            }
            if (selectedModel && 'assertAvailable' in childModel) childModel.assertAvailable?.()
          }
          assertProfile()
          const requested = [...new Set((params.files || []).filter(path => typeof path === 'string' && path.trim()))]
          if (requested.length > 12) throw new Error('一次最多附带 12 个项目内文件')
          const references = requested.map(path => {
            if (isAbsolute(path)) throw new Error('子任务只能附带项目内相对路径文件')
            return { path, name: path.split('/').at(-1) || path }
          })
          const attachments = this.database.harness.resolveMessageAttachments(sessionId, references)
          let childRegistry: SubtaskToolRegistry | undefined
          let childScope: SubtaskToolScope | undefined
          const child = runtime.create({
            parentToolCallId: options.resolveParentToolCallId?.(toolCallId, params) ?? toolCallId, role: params.role, task: params.task.trim(),
            ...(profile ? { agentName: profile.name, ...('scope' in profile ? { agentScope: profile.scope } : { agentPluginId: profile.pluginId }) } : {}),
            ...(selectedModel ? { agentModelSelection: selectedModel } : {}),
            prompt: `${params.task.trim()}${attachments.length ? `\n\n已附带文件：\n${attachments.map(file => `[${file.path}]\n${file.content}`).join('\n\n')}` : ''}`,
            files: references, systemPrompt: childPrompt(params.role, !(profile && 'scope' in profile && profile.injectAgentsMd === false))
              + (profile ? `\n\n<${'scope' in profile ? 'mira_user_agent' : 'installed_plugin_agent'} name="${profile.name}">\n${profile.body}\n</${'scope' in profile ? 'mira_user_agent' : 'installed_plugin_agent'}>` : ''),
            model: childModel.model, streamFn: childModel.streamFn, thinkingLevel: childModel.thinkingLevel, secrets,
            beforeStart: assertProfile,
            toolsForTask: (taskId, scope) => {
              childScope = scope
              const registered = options.toolsForTask(params.role, taskId, scope, secrets)
              childRegistry = Array.isArray(registered) ? undefined : registered
              const tools = (Array.isArray(registered) ? registered : registered.tools)
                .filter(tool => !scopedMcpIds || typeof tool.miraMcpServerId !== 'string' || scopedMcpIds.has(tool.miraMcpServerId))
                .filter(tool => (!profile?.tools || profile.tools.some(rule => matchesMiraAgentToolRule(rule, tool))) && !profile?.disallowedTools?.some(rule => matchesMiraAgentToolRule(rule, tool)))
                .map(tool => ({ ...tool, execute: (...args: Parameters<typeof tool.execute>) => { assertProfile(); return tool.execute(...args) } }))
              return Array.isArray(registered) ? tools : { ...registered, tools }
            },
            beforeToolCall: async ({ toolCall, args }) => {
              assertProfile()
              const decision = await options.preflightToolCall(toolCall.name, args)
              if (decision?.block) return decision
              const tool = childRegistry?.tools.find(tool => tool.name === toolCall.name)
              if (tool && (typeof (tool as any).miraMcpServerId === 'string' || ['read', 'list_files', 'write', 'edit'].includes(toolCall.name))) {
                if (!childRegistry?.preflight || !childScope) return { block: true, reason: '子智能体工具审批不可用，请重新委派' }
                const result = await childRegistry.preflight(toolCall.id, toolCall.name, args, false, session.permissionMode, childScope.signal, tool)
                assertProfile()
                return result
              }
              assertProfile()
              return decision
            },
            onChanged: options.publishActivities,
            onFinished: childTask => {
              if (childTask.usage) childTask.usage = withUsageCost(childTask.usage, childModel.pricing)
              options.publishActivities()
              // wait_for_tasks already delivers these reports in the current turn.
              if ([...waitingReports].some(ids => !ids || ids.has(childTask.id))) return
              options.getParentAgent()?.followUp({ role: 'user', content: `子任务 ${childTask.id} 已结束，状态：${childTask.status}。如需报告，请调用 wait_for_tasks。`, timestamp: Date.now() } as any)
            },
          })
          return { content: [{ type: 'text', text: `已创建子任务 ${child.id}（${child.agentName || child.role}）。` }], details: { id: child.id, status: child.status } }
        },
      },
      {
        name: 'list_tasks', label: '列出子任务', description: '查看当前父任务的子任务状态，不返回报告正文。', parameters: Type.Object({}), executionMode: 'sequential',
        execute: async () => ({ content: [{ type: 'text', text: runtime.list().map(task => `${task.id} | ${task.agentName || task.role} | ${task.status}`).join('\n') || '没有子任务。' }] }),
      },
      {
        name: 'wait_for_tasks', label: '等待子任务', description: '等待全部或指定子任务完成并读取受限最终报告。', parameters: Type.Object({ ids: Type.Optional(Type.Array(Type.String())) }), executionMode: 'sequential',
        execute: async (_id: string, params: { ids?: string[] }) => {
          const ids = params.ids?.length ? new Set(params.ids) : undefined
          waitingReports.add(ids)
          let completed
          try { completed = await runtime.wait(params.ids) }
          finally { waitingReports.delete(ids) }
          const text = completed.map(task => `## ${task.id} · ${task.agentName || task.role} · ${task.status}\n${task.report || task.error?.message || '无报告'}`).join('\n\n') || '没有匹配的子任务。'
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
