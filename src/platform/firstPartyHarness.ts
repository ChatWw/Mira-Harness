import { validateAutomationScheduleRule } from '../config/automationRepeat'
import { HARNESS_ATTACHMENT_MEDIA_TYPES, isPermissionMode, type AutomationRunStatus, type AutomationTaskInput, type AutomationTarget, type AutomationTrigger, type HarnessAttachmentImportFile, type HarnessFileReference, type HarnessAttachmentMediaType, type HarnessMessageSubmissionOptions, type HarnessSessionOrderScope, type HarnessUserAnswer, type ModelSelection, type PermissionMode } from '../config/harness'
import { isMiraBrowserDimension } from '../config/miraBrowserViewport'
import { isMiraPluginId } from '../config/miraPlugins'
import { MIRA_SUBTASK_AGENTS } from '../config/miraAgents'
import type { MiraAgentModelTarget } from '../config/miraAgentModels'
import { validateMiraGoalBudget } from '../config/miraGoals'
import { parseMiraFlowWorkbenchRequest } from '../config/miraFlowWorkbench'
import type { MiraHistoryEditWorkspace } from '../config/miraFileRewind'

function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Harness 请求参数无效')
  return value as Record<string, unknown>
}

function string(value: unknown, name: string, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new Error(`${name}无效`)
  return value
}

function terminalData(value: unknown) {
  if (typeof value !== 'string' || !value.length || value.length > 100_000) throw new Error('终端输入无效')
  return value
}

function optionalString(value: unknown, name: string, max = 128) {
  return value === undefined ? undefined : string(value, name, max)
}

function boolean(value: unknown, name: string) {
  if (typeof value !== 'boolean') throw new Error(`${name}无效`)
  return value
}

function idList(value: unknown, name: string, max = 64) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${name}无效`)
  return value.map(item => string(item, name, 128))
}

function messageSubmissionOptions(value: unknown): HarnessMessageSubmissionOptions {
  const input = fields(value)
  if (input.pluginIds !== undefined && (!Array.isArray(input.pluginIds) || input.pluginIds.length > 8 || input.pluginIds.some(id => typeof id !== 'string' || !isMiraPluginId(id)))) throw new Error('插件 ID无效')
  if (input.delivery !== undefined && input.delivery !== 'immediate' && input.delivery !== 'guide' && input.delivery !== 'queue') throw new Error('消息投递方式无效')
  if (input.pausedQueueDecision !== undefined && input.pausedQueueDecision !== 'retain' && input.pausedQueueDecision !== 'discard') throw new Error('暂停队列选择无效')
  const expectedRunId = input.expectedRunId === null ? null : optionalString(input.expectedRunId, '运行 ID')
  if ((input.delivery || input.pausedQueueDecision) && expectedRunId === undefined) throw new Error('运行 ID无效')
  if (input.delivery === 'guide' && (expectedRunId === null || input.pausedQueueDecision !== undefined)) throw new Error('指导投递参数无效')
  const revision = input.expectedQueueRevision
  if (revision !== undefined && (!Number.isSafeInteger(revision) || Number(revision) < 0)) throw new Error('队列版本无效')
  const ids = input.expectedQueueItemIds === undefined ? undefined : idList(input.expectedQueueItemIds, '队列消息 ID', 32)
  if (ids && new Set(ids).size !== ids.length) throw new Error('队列消息 ID无效')
  if (input.pausedQueueDecision && (revision === undefined || ids === undefined)) throw new Error('暂停队列确认无效')
  if (!input.pausedQueueDecision && (revision !== undefined || ids !== undefined)) throw new Error('暂停队列确认无效')
  return {
    ...(input.hasStructuredContext === undefined ? {} : { hasStructuredContext: boolean(input.hasStructuredContext, '结构化上下文') }),
    ...(input.permissionMode === undefined ? {} : { permissionMode: permissionMode(input.permissionMode) }),
    ...(input.skillIds === undefined ? {} : { skillIds: [...new Set(idList(input.skillIds, '技能 ID', 64))] }),
    ...(input.pluginIds === undefined ? {} : { pluginIds: [...new Set(input.pluginIds as string[])] }),
    ...(input.delivery === undefined ? {} : { delivery: input.delivery }),
    ...(input.pausedQueueDecision === undefined ? {} : { pausedQueueDecision: input.pausedQueueDecision }),
    ...(revision === undefined ? {} : { expectedQueueRevision: Number(revision) }),
    ...(ids === undefined ? {} : { expectedQueueItemIds: ids }),
    ...(expectedRunId === undefined ? {} : { expectedRunId }),
  }
}

function selection(value: unknown, modelIdMax = 128): ModelSelection {
  const input = fields(value)
  const thinkingLevel = input.thinkingLevel
  if (thinkingLevel !== undefined && thinkingLevel !== 'off' && thinkingLevel !== 'low' && thinkingLevel !== 'medium' && thinkingLevel !== 'high') throw new Error('推理强度无效')
  // Runtime 使用用户选择的推理档位；桥不能把它剥离后静默恢复为默认中档。
  return { providerId: string(input.providerId, '供应商 ID'), modelId: string(input.modelId, '模型 ID', modelIdMax), ...(thinkingLevel === undefined ? {} : { thinkingLevel }) }
}

function workspacePath(value: unknown, allowEmpty = false) {
  if (allowEmpty && value === '') return ''
  const path = string(value, '路径', 2048)
  if (path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(segment => segment === '..')) {
    throw new Error('路径无效')
  }
  return path
}

function workspaceSearchQuery(value: unknown) {
  if (typeof value !== 'string' || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('搜索关键词无效')
  return value
}

function workspaceScope(params: Record<string, unknown>): { projectId: string; rootPath?: string } | { sessionId: string } {
  const project = Object.prototype.hasOwnProperty.call(params, 'projectId')
  const session = Object.prototype.hasOwnProperty.call(params, 'sessionId')
  if (project === session) throw new Error('文件范围必须指定一个项目或会话')
  if (!project && params.rootPath !== undefined) throw new Error('任务文件范围不允许覆盖工作目录')
  return project ? { projectId: string(params.projectId, '项目 ID'), ...(params.rootPath === undefined ? {} : { rootPath: string(params.rootPath, '源文件夹', 4096) }) } : { sessionId: string(params.sessionId, '会话 ID') }
}

function fileReferencePath(value: unknown) {
  const path = string(value, '引用文件路径', 2048)
  const absolute = path.startsWith('/') || /^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(path)
  if (!absolute && (path.startsWith('\\') || /^[a-z]:/i.test(path) || path.split(/[\\/]/).some(segment => segment === '..'))) throw new Error('引用文件路径无效')
  return path
}

function fileReferences(value: unknown): HarnessFileReference[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('引用文件无效')
  if (value.length > 12) throw new Error('一次最多引用 12 个文件')
  return value.map(item => {
    const reference = fields(item)
    // 系统选择器允许项目外文本文件；不能套用仅供工作区浏览的相对路径限制。
    const mediaType = reference.mediaType
    if (mediaType !== undefined && !HARNESS_ATTACHMENT_MEDIA_TYPES.includes(mediaType as HarnessAttachmentMediaType)) throw new Error('附件媒体类型无效')
    const size = reference.size
    if (size !== undefined && (!Number.isSafeInteger(size) || Number(size) < 0 || mediaType !== undefined && Number(size) > 20 * 1024 * 1024)) throw new Error('附件大小无效')
    return { path: fileReferencePath(reference.path), name: string(reference.name, '引用文件名', 512), ...(mediaType === undefined ? {} : { mediaType: mediaType as HarnessAttachmentMediaType }), ...(size === undefined ? {} : { size: Number(size) }) }
  })
}

function attachmentImports(value: unknown): HarnessAttachmentImportFile[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error('一次最多引用 12 个文件')
  let encodedBytes = 0
  return value.map(item => {
    const file = fields(item)
    const data = file.data
    if (typeof data !== 'string' || data.length > Math.ceil(20 * 1024 * 1024 / 3) * 4) throw new Error('单个图片、PDF 或视频附件不得超过 20 MiB；文本附件不得超过 256 KiB')
    encodedBytes += data.length
    if (encodedBytes > Math.ceil(41 * 1024 * 1024 / 3) * 4 + 12 * 4) throw new Error('图片、PDF 和视频附件总大小不得超过 40 MiB；文本附件总大小不得超过 1 MiB')
    return { name: string(file.name, '附件文件名', 512), mediaType: string(file.mediaType, '附件媒体类型', 128), data }
  })
}

function messageText(value: unknown, references: HarnessFileReference[]) {
  if (typeof value !== 'string' || value.length > 100_000 || value.includes('\0') || (!value.trim() && !references.length)) throw new Error('任务内容无效')
  return value
}

function orderScope(value: unknown): HarnessSessionOrderScope {
  const input = fields(value)
  if (input.type === 'pinned' || input.type === 'recent') return { type: input.type }
  if (input.type === 'project') return { type: 'project', projectId: string(input.projectId, '项目 ID') }
  throw new Error('排序范围无效')
}

function browserUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error('浏览器地址无效')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('浏览器地址无效') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('浏览器只允许 http(s) 地址')
  return parsed.href
}

export interface HarnessBrowserBounds { x: number; y: number; width: number; height: number }
export interface HarnessBrowserPresentation { bounds: HarnessBrowserBounds; clip: HarnessBrowserBounds; viewport: { width: number; height: number } | null; scale: number; exclusions?: HarnessBrowserBounds[] }
function browserResource(params: Record<string, unknown>) {
  if (params.browserId === undefined) return {}
  if (typeof params.browserId !== 'string' || !/^browser(?::[\w-]{1,128})?$/.test(params.browserId)) throw new Error('浏览器资源 ID 无效')
  return { browserId: params.browserId }
}
export type HarnessAttachmentSaveResult = { status: 'saved' } | { status: 'canceled' }

function browserBounds(value: unknown, positionMin = 0): HarnessBrowserBounds {
  const bounds = fields(value)
  const dimension = (field: keyof HarnessBrowserBounds, min: number) => {
    const result = bounds[field]
    if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > 10_000) throw new Error('浏览器视图位置无效')
    return Math.round(result)
  }
  return { x: dimension('x', positionMin), y: dimension('y', positionMin), width: dimension('width', 16), height: dimension('height', 16) }
}

function terminalDimension(value: unknown, name: string) {
  if (!Number.isInteger(value) || (value as number) < 2 || (value as number) > 500) throw new Error(`${name}无效`)
  return value as number
}

function permissionMode(value: unknown): PermissionMode {
  if (!isPermissionMode(value)) throw new Error('权限档位无效')
  return value
}

function timestamp(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${name}无效`)
  return Number(value)
}

function automationTask(value: unknown): AutomationTaskInput {
  const input = fields(value), rawTrigger = fields(input.trigger), rawTarget = fields(input.target)
  let trigger: AutomationTrigger
  if (rawTrigger.type === 'cron') trigger = { type: 'cron', expression: string(rawTrigger.expression, 'Cron 表达式', 256), ...(rawTrigger.humanLabel === undefined ? {} : { humanLabel: string(rawTrigger.humanLabel, '计划说明', 120) }), ...(rawTrigger.scheduleRule === undefined ? {} : { scheduleRule: validateAutomationScheduleRule(rawTrigger.scheduleRule) }) }
  else if (rawTrigger.type === 'once') trigger = { type: 'once', scheduledAt: timestamp(rawTrigger.scheduledAt, '执行时间') }
  else if (rawTrigger.type === 'session-completed') trigger = { type: 'session-completed' }
  else throw new Error('自动化触发类型无效')
  let target: AutomationTarget
  if (rawTarget.type === 'new-session') target = { type: 'new-session' }
  else if (rawTarget.type === 'existing-session') target = { type: 'existing-session', sessionId: string(rawTarget.sessionId, '会话 ID') }
  else throw new Error('自动化目标无效')
  return { ...(input.id === undefined ? {} : { id: string(input.id, '自动化 ID') }), name: string(input.name, '自动化名称', 120), projectId: string(input.projectId, '项目 ID'), prompt: string(input.prompt, '任务内容', 100_000), model: selection(input.model), permissionMode: permissionMode(input.permissionMode), enabled: boolean(input.enabled, '启用状态'), trigger, target,
    ...(input.templateId === undefined ? {} : { templateId: string(input.templateId, '模板 ID') }),
    ...(input.validFrom === undefined ? {} : { validFrom: timestamp(input.validFrom, '生效时间') }),
    ...(input.validUntil === undefined ? {} : { validUntil: timestamp(input.validUntil, '失效时间') }) }
}

export function parseFirstPartyHarnessCall(method: string, raw: unknown) {
  if (method === 'agent-models.list') return { method } as const
  if (method === 'agent-models.set') {
    const params = fields(raw), input = fields(params.target)
    if (Object.keys(input).some(key => !['kind', 'name', ...(input.kind === 'plugin' ? ['pluginId'] : [])].includes(key))) throw new Error('智能体模型目标无效')
    let target: MiraAgentModelTarget
    if (input.kind === 'builtin' && typeof input.name === 'string' && Object.prototype.hasOwnProperty.call(MIRA_SUBTASK_AGENTS, input.name)) target = { kind: 'builtin', name: input.name as keyof typeof MIRA_SUBTASK_AGENTS }
    else if (input.kind === 'plugin' && typeof input.pluginId === 'string' && isMiraPluginId(input.pluginId)) target = { kind: 'plugin', pluginId: input.pluginId, name: string(input.name, '插件智能体名称', 256) }
    else throw new Error('智能体模型目标无效')
    const rawModel = params.modelSelection === undefined ? undefined : fields(params.modelSelection)
    if (rawModel && Object.keys(rawModel).some(key => !['providerId', 'modelId', 'thinkingLevel'].includes(key))) throw new Error('智能体模型选择无效')
    return { method, target, modelSelection: rawModel ? selection(rawModel, 256) : undefined } as const
  }
  if (method === 'input-history.list') {
    const params = raw === undefined ? {} : fields(raw)
    const sessionId = optionalString(params.sessionId, '会话 ID'), projectId = optionalString(params.projectId, '项目 ID')
    if (sessionId && projectId) throw new Error('输入历史范围无效')
    return { method, sessionId, projectId } as const
  }
  if (method === 'plugin-marketplace.sources') return { method } as const
  if (method === 'plugin-marketplace.add-source') return { method, source: string(fields(raw).source, '市场来源', 2048) } as const
  if (method === 'plugin-marketplace.remove-source') return { method, id: string(fields(raw).id, '市场 ID', 120) } as const
  if (method === 'plugins.list' || method === 'plugins.import') return { method } as const
  if (method === 'agents.list') {
    const params = raw === undefined ? {} : fields(raw)
    const projectId = optionalString(params.projectId, '项目 ID'), sessionId = optionalString(params.sessionId, '会话 ID')
    if (projectId && sessionId) throw new Error('智能体范围只能指定一个项目或会话')
    return { method, projectId, sessionId } as const
  }
  if (method === 'agents.read' || method === 'agents.save' || method === 'agents.delete' || method === 'agents.setEnabled') {
    const params = fields(raw), scope = params.scope
    if (scope !== 'global' && scope !== 'project') throw new Error('智能体范围无效')
    const name = string(params.name, '智能体名称', 50), projectId = optionalString(params.projectId, '项目 ID')
    if (scope === 'project' && !projectId) throw new Error('请先选择项目')
    if (method === 'agents.read') return { method, scope, name, projectId } as const
    const expectedRevision = optionalString(params.expectedRevision, '智能体版本', 64)
    if (expectedRevision !== undefined && !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('智能体版本无效')
    if (method === 'agents.delete' || method === 'agents.setEnabled') {
      if (!expectedRevision) throw new Error('修改或删除智能体需要版本')
      return method === 'agents.delete' ? { method, scope, name, projectId, expectedRevision } as const
        : { method, scope, name, projectId, expectedRevision, enabled: boolean(params.enabled, '启用状态') } as const
    }
    return { method, scope, name, projectId, expectedRevision, source: string(params.source, '智能体内容', 100_000) } as const
  }
  if (method === 'commands.list') {
    const params = raw === undefined ? {} : fields(raw)
    const projectId = optionalString(params.projectId, '项目 ID'), sessionId = optionalString(params.sessionId, '会话 ID')
    if (projectId && sessionId) throw new Error('命令范围只能指定一个项目或会话')
    return { method, projectId, sessionId } as const
  }
  if (method === 'commands.read' || method === 'commands.save' || method === 'commands.delete') {
    const params = fields(raw), scope = params.scope
    if (scope !== 'global' && scope !== 'project') throw new Error('命令范围无效')
    const name = string(params.name, '命令名称', 256), projectId = optionalString(params.projectId, '项目 ID')
    if (scope === 'project' && !projectId) throw new Error('请先选择项目')
    if (method === 'commands.read') return { method, scope, name, projectId } as const
    const expectedRevision = optionalString(params.expectedRevision, '命令版本', 64)
    if (expectedRevision !== undefined && !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('命令版本无效')
    if (method === 'commands.delete') {
      if (!expectedRevision) throw new Error('删除命令需要版本')
      return { method, scope, name, projectId, expectedRevision } as const
    }
    return { method, scope, name, projectId, expectedRevision, source: string(params.source, '命令内容', 100_000) } as const
  }
  if (method === 'plugins.catalog') return { method, sessionId: optionalString(raw === undefined ? undefined : fields(raw).sessionId, '会话 ID') } as const
  if (method === 'plugins.remove' || method === 'plugins.set-enabled') {
    const params = fields(raw), id = string(params.id, '插件 ID', 256)
    if (!isMiraPluginId(id)) throw new Error('插件 ID无效')
    return method === 'plugins.remove' ? { method, id } as const : { method, id, enabled: boolean(params.enabled, '启用状态') } as const
  }
  if (method === 'mcp.list') {
    const params = raw === undefined ? {} : fields(raw)
    const sessionId = optionalString(params.sessionId, '会话 ID'), projectId = optionalString(params.projectId, '项目 ID')
    if (sessionId && projectId) throw new Error('MCP 范围只能指定一个项目或会话')
    return { method, ...(sessionId ? { sessionId } : {}), ...(projectId ? { projectId } : {}) } as const
  }
  if (method === 'sessions.list' || method === 'sessions.archived-snapshot' || method === 'projects.list' || method === 'projects.select' || method === 'projects.select-directories' || method === 'providers.list' || method === 'skills.list' || method === 'composer.preferences' || method === 'marketplace.installed' || method === 'automations.list' || method === 'automations.overview' || method === 'permissions.config') return { method } as const
  if (method === 'marketplace.browse' || method === 'plugin-marketplace.browse') {
    const params = raw === undefined ? {} : fields(raw)
    return { method, refresh: params.refresh === undefined ? false : boolean(params.refresh, '刷新状态') } as const
  }
  if (method === 'editors.list') {
    const params = raw === undefined ? {} : fields(raw)
    return { method, refresh: params.refresh === undefined ? false : boolean(params.refresh, '刷新状态') } as const
  }
  const params = fields(raw)
  switch (method) {
    case 'workflows.request': {
      if (Object.keys(params).some(key => key !== 'request')) throw new Error('工作流请求无效')
      return { method, request: parseMiraFlowWorkbenchRequest(params.request) } as const
    }
    case 'goal.pause':
    case 'goal.clear':
    case 'goal.resume':
    case 'goal.budget': {
      if (!Number.isSafeInteger(params.expectedRevision) || Number(params.expectedRevision) < 1) throw new Error('目标版本无效')
      const common = { sessionId: string(params.sessionId, '会话 ID'), expectedRevision: Number(params.expectedRevision), expectedGoalId: string(params.expectedGoalId, '目标 ID') }
      if (method === 'goal.resume') return { method, ...common, selection: selection(params.selection), ...(params.permissionMode === undefined ? {} : { permissionMode: permissionMode(params.permissionMode) }) } as const
      if (method === 'goal.budget') return { method, ...common, tokenBudget: validateMiraGoalBudget(params.tokenBudget) } as const
      return { method, ...common } as const
    }
    case 'automations.next-runs': return { method, expression: string(params.expression, 'Cron 表达式', 256), ...(params.rule === undefined ? {} : { rule: validateAutomationScheduleRule(params.rule) }) } as const
    case 'automations.save': return { method, input: automationTask(params.input) } as const
    case 'automations.set-enabled': return { method, id: string(params.id, '自动化 ID'), enabled: boolean(params.enabled, '启用状态') } as const
    case 'automations.delete':
    case 'automations.run-now':
    case 'automations.abort': return { method, id: string(params.id, '自动化 ID') } as const
    case 'automations.delete-run':
    case 'automations.retry': return { method, id: string(params.id, '运行 ID') } as const
    case 'automations.runs': {
      const status = params.status
      if (status !== undefined && !['running', 'completed', 'failed', 'skipped', 'interrupted'].includes(String(status))) throw new Error('自动化运行状态无效')
      return { method, id: string(params.id, '自动化 ID'), status: status as AutomationRunStatus | undefined } as const
    }
    case 'marketplace.detail':
    case 'plugin-marketplace.detail':
    case 'plugin-marketplace.install':
    case 'marketplace.install': return { method, id: string(params.id, '市场条目 ID') } as const
    case 'files.select': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'attachments.select': {
      const paths = params.paths
      if (paths !== undefined && (!Array.isArray(paths) || !paths.length || paths.length > 12)) throw new Error('引用文件路径无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), ...(paths === undefined ? {} : { paths: (paths as unknown[]).map(fileReferencePath) }) } as const
    }
    case 'attachments.import': return { method, sessionId: string(params.sessionId, '会话 ID'), files: attachmentImports(params.files) } as const
    case 'attachments.get': return { method, sessionId: string(params.sessionId, '会话 ID'), path: fileReferencePath(params.path) } as const
    case 'attachments.save': return { method, sessionId: string(params.sessionId, '会话 ID'), path: fileReferencePath(params.path) } as const
    case 'attachments.stage': return { method, sessionId: string(params.sessionId, '会话 ID'), path: workspacePath(params.path) } as const
    case 'files.open-editor': {
      const editorId = string(params.editorId, '打开方式', 128)
      if (!/^mira-[a-z-]+$/.test(editorId)) throw new Error('打开方式无效')
      return { method, ...workspaceScope(params), path: workspacePath(params.path, true), editorId } as const
    }
    case 'files.search':
      return { method, ...workspaceScope(params), query: workspaceSearchQuery(params.query), refresh: params.refresh === undefined ? false : boolean(params.refresh, '刷新状态') } as const
    case 'files.git-status': return { method, ...workspaceScope(params) } as const
    case 'files.git-ignored': {
      if (!Array.isArray(params.paths) || params.paths.length > 512) throw new Error('一次最多查询 512 个文件的 Git 忽略状态')
      const paths = [...new Set(params.paths.map(path => {
        const value = workspacePath(path)
        if (/^[a-z][a-z\d+.-]*:/i.test(value)) throw new Error('路径无效')
        return value
      }))]
      return { method, ...workspaceScope(params), paths } as const
    }
    case 'files.watch': {
      if (!Array.isArray(params.paths) || !params.paths.length || params.paths.length > 256) throw new Error('一次最多监听 256 个目录')
      const paths = [...new Set(params.paths.map(path => workspacePath(path, true)))]
      if (!paths.includes('') && paths.length === 256) throw new Error('一次最多监听 256 个目录')
      return { method, ...workspaceScope(params), paths } as const
    }
    case 'files.unwatch': return { method, ...workspaceScope(params), watchId: string(params.watchId, '监听 ID') } as const
    case 'files.media-close': {
      const id = string(params.id, '媒体 ID', 64)
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('媒体 ID 无效')
      return { method, id } as const
    }
    case 'files.browser-url':
    case 'files.reveal':
    case 'files.media-open':
    case 'files.read-image': {
      const path = workspacePath(params.path, method === 'files.reveal')
      if (/^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('路径无效')
      return { method, ...workspaceScope(params), path } as const
    }
    case 'files.list': return { method, ...workspaceScope(params), path: workspacePath(params.path, true) } as const
    case 'files.read': {
      const path = workspacePath(params.path)
      if (/^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('路径无效')
      return { method, ...workspaceScope(params), path } as const
    }
    case 'browser.navigate': return { method, sessionId: string(params.sessionId, '会话 ID'), ...browserResource(params), url: browserUrl(params.url), bounds: browserBounds(params.bounds), ...(params.visible === undefined ? {} : { visible: boolean(params.visible, '浏览器可见状态') }) } as const
    case 'browser.bounds': return { method, sessionId: string(params.sessionId, '会话 ID'), ...browserResource(params), bounds: browserBounds(params.bounds) } as const
    case 'browser.protection': {
      if (params.guestId !== undefined && (!Number.isSafeInteger(params.guestId) || Number(params.guestId) < 1)) throw new Error('浏览器目标无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), ...browserResource(params), ...(params.guestId === undefined ? {} : { guestId: params.guestId as number }) } as const
    }
    case 'browser.pick': {
      if (params.action !== 'start' && params.action !== 'cancel') throw new Error('元素选择操作无效')
      if (params.guestId !== undefined && (!Number.isSafeInteger(params.guestId) || Number(params.guestId) <= 0)) throw new Error('浏览器目标无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), ...browserResource(params), action: params.action, ...(params.guestId === undefined ? {} : { guestId: params.guestId as number }) } as const
    }
    case 'browser.viewport': {
      const viewport = params.viewport === null ? null : fields(params.viewport)
      if (viewport && (!isMiraBrowserDimension('width', viewport.width) || !isMiraBrowserDimension('height', viewport.height))) throw new Error('浏览器尺寸无效')
      if (typeof params.scale !== 'number' || !Number.isFinite(params.scale) || params.scale <= 0 || params.scale > 2) throw new Error('浏览器缩放无效')
      if (params.guestId !== undefined && (!Number.isSafeInteger(params.guestId) || Number(params.guestId) <= 0)) throw new Error('浏览器目标无效')
      if (params.exclusions !== undefined && (!Array.isArray(params.exclusions) || params.exclusions.length > 16)) throw new Error('浏览器遮挡区域无效')
      const exclusions = (params.exclusions as unknown[] | undefined)?.map(value => browserBounds(value, -10_000))
      return { method, sessionId: string(params.sessionId, '会话 ID'), ...browserResource(params), ...(exclusions ? { exclusions } : {}), bounds: browserBounds(params.bounds, -10_000), clip: browserBounds(params.clip), viewport: viewport ? { width: viewport.width as number, height: viewport.height as number } : null, scale: params.scale, ...(params.guestId === undefined ? {} : { guestId: params.guestId as number }) } as const
    }
    case 'browser.control': {
      if (!['back', 'forward', 'reload', 'devtools', 'hide', 'show', 'close'].includes(String(params.action))) throw new Error('浏览器操作无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), ...browserResource(params), action: params.action as 'back' | 'forward' | 'reload' | 'devtools' | 'hide' | 'show' | 'close' } as const
    }
    case 'browser.external': return { method, sessionId: string(params.sessionId, '会话 ID'), ...browserResource(params), url: browserUrl(params.url) } as const
    case 'terminal.open': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    // PTY 数据流必须保留 Enter/Tab/空格和 Ctrl+Space 的 NUL，不能按普通文案裁剪或拒绝。
    case 'terminal.write': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), data: terminalData(params.data) } as const
    case 'terminal.paste': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), bracketed: boolean(params.bracketed, '括号粘贴状态') } as const
    case 'terminal.resize': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), columns: terminalDimension(params.columns, '终端列数'), rows: terminalDimension(params.rows, '终端行数') } as const
    case 'terminal.close': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID') } as const
    case 'session.create-side': {
      const input = params.input === undefined ? undefined : fields(params.input)
      return { method, parentId: string(params.parentId, '主任务 ID'), ...(input === undefined ? {} : { input: {
        submissionId: string(input.submissionId, '提交 ID'), text: messageText(input.text, []), selection: selection(input.selection, 256),
        ...(input.permissionMode === undefined ? {} : { permissionMode: permissionMode(input.permissionMode) }),
      } }) } as const
    }
    case 'session.fork': {
      const requestId = string(params.requestId, '分支请求 ID', 36)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('分支请求 ID 无效')
      return { method, id: string(params.id, '会话 ID'), messageId: string(params.messageId, '回复 ID'), requestId } as const
    }
    case 'session.get': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.trace':
    case 'session.trace.open':
    case 'session.paths': return { method, id: string(params.id, '会话 ID', 128) } as const
    case 'files.rewind-preview': return { method, sessionId: string(params.sessionId, '会话 ID'), messageId: string(params.messageId, '消息 ID') } as const
    case 'files.rewind-apply': {
      const snapshotToken = string(params.snapshotToken, '快照标识', 64)
      if (!/^[a-f0-9]{64}$/.test(snapshotToken)) throw new Error('快照标识无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), messageId: string(params.messageId, '消息 ID'), snapshotToken } as const
    }
    case 'files.rewind-recover': return { method, sessionId: string(params.sessionId, '会话 ID'), recoveryId: string(params.recoveryId, '恢复 ID') } as const
    case 'session.create': return { method, projectId: params.projectId === undefined ? undefined : string(params.projectId, '项目 ID'), ...(params.prepared === undefined ? {} : { prepared: boolean(params.prepared, '草稿准备状态') }) } as const
    case 'session.rename': return { method, id: string(params.id, '会话 ID'), title: string(params.title, '会话标题', 120) } as const
    case 'session.set-pinned': return { method, id: string(params.id, '会话 ID'), pinned: boolean(params.pinned, '置顶状态') } as const
    case 'session.set-unread': return { method, id: string(params.id, '会话 ID'), unread: boolean(params.unread, '未读状态') } as const
    case 'session.archive': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.restore': return { method, id: string(params.id, '会话 ID') } as const
    case 'sessions.delete-archived': return { method, snapshotId: string(params.snapshotId, '归档快照', 128) } as const
    case 'sessions.search': return { method, query: string(workspaceSearchQuery(params.query).trim(), '搜索关键词', 256) } as const
    case 'sessions.history': {
      const query = params.query === undefined ? params : fields(params.query)
      const archiveView = query.archiveView ?? 'visible'
      const sort = query.sort ?? 'updated-desc'
      if (archiveView !== 'visible' && archiveView !== 'archived') throw new Error('归档视图无效')
      if (sort !== 'updated-desc' && sort !== 'created-desc') throw new Error('任务排序无效')
      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 50
      if (!Number.isInteger(page) || Number(page) < 1 || Number(page) > 1_000_000) throw new Error('历史页码无效')
      if (!Number.isInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 100) throw new Error('历史页大小无效')
      return { method, query: { archiveView, sort, page: Number(page), pageSize: Number(pageSize), q: query.q === undefined ? undefined : workspaceSearchQuery(query.q) } } as const
    }
    case 'session.delete': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.move': return { method, id: string(params.id, '会话 ID'), projectId: optionalString(params.projectId, '项目 ID') } as const
    case 'session.reorder': return { method, scope: orderScope(params.scope), ids: idList(params.ids, '会话 ID 列表') } as const
    case 'session.set-permission': return { method, id: string(params.id, '会话 ID'), mode: permissionMode(params.mode) } as const
    case 'session.set-skills': return { method, id: string(params.id, '会话 ID'), skillIds: idList(params.skillIds, 'Skill 列表') } as const
    case 'session.set-mcp-servers': return { method, id: string(params.id, '会话 ID'), serverIds: idList(params.serverIds, 'MCP 服务列表') } as const
    case 'mcp.reconnect': return { method, id: string(params.id, 'MCP 服务 ID') } as const
    case 'session.set-delegation': return { method, id: string(params.id, '会话 ID'), enabled: boolean(params.enabled, '委派开关') } as const
    case 'projects.reorder': return { method, ids: idList(params.ids, '项目 ID 列表') } as const
    case 'projects.update':
    case 'projects.create': {
      const input = fields(params.input)
      if (!Array.isArray(input.roots) || !input.roots.length || input.roots.length > 64) throw new Error('源文件夹无效')
      const draft = { name: string(input.name, '项目名称', 120), roots: input.roots.map(root => string(root, '源文件夹', 4096)), primaryRoot: string(input.primaryRoot, '主要目录', 4096) }
      return method === 'projects.update' ? { method, id: string(params.id, '项目 ID'), input: draft } as const : { method, input: draft } as const
    }
    case 'projects.rename': return { method, id: string(params.id, '项目 ID'), name: string(params.name, '项目名称', 120) } as const
    case 'projects.remove': return { method, id: string(params.id, '项目 ID') } as const
    case 'projects.open': return { method, projectId: string(params.projectId, '项目 ID'), target: params.target === undefined ? 'file-manager' as const : openTarget(params.target) } as const
    case 'git.generate-message': {
      const token = string(params.token, 'Git 快照', 64)
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Git 快照无效')
      return { method, projectId: string(params.projectId, '项目 ID'), token, selection: selection(params.selection), includeUnstaged: boolean(params.includeUnstaged, '未暂存更改开关') } as const
    }
    case 'git.tools': return { method, projectId: string(params.projectId, '项目 ID') } as const
    case 'git.graph': {
      const skip = params.skip ?? 0
      if (!Number.isSafeInteger(skip) || Number(skip) < 0 || Number(skip) > 100000) throw new Error('Git 分页无效')
      return { method, projectId: string(params.projectId, '项目 ID'), skip: Number(skip) } as const
    }
    case 'git.action': {
      const action = params.action
      if (action !== 'commit' && action !== 'commit-and-push' && action !== 'push') throw new Error('Git 操作无效')
      const token = string(params.token, 'Git 快照', 64)
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Git 快照无效')
      const message = params.message
      if (typeof message !== 'string' || message.length > 10000 || message.includes('\\0')) throw new Error('提交消息无效')
      return { method, projectId: string(params.projectId, '项目 ID'), action, token, message, includeUnstaged: boolean(params.includeUnstaged, '未暂存更改开关') } as const
    }
    case 'git.context':
    case 'git.branches': return { method, projectId: string(params.projectId, '项目 ID') } as const
    case 'git.checkout':
    case 'git.create-branch': {
      const snapshotToken = string(params.snapshotToken, 'Git 快照', 64)
      if (!/^[a-f0-9]{64}$/.test(snapshotToken)) throw new Error('Git 快照无效')
      return { method, projectId: string(params.projectId, '项目 ID'), branch: string(params.branch, '分支名', 256), snapshotToken } as const
    }
    case 'permissions.pending': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'permission.respond': {
      if (typeof params.allowed !== 'boolean') throw new Error('权限响应无效')
      return { method, requestId: string(params.requestId, '权限请求 ID'), allowed: params.allowed } as const
    }
    case 'memory.respond': {
      if (typeof params.approved !== 'boolean') throw new Error('记忆确认响应无效')
      return { method, requestId: string(params.requestId, '记忆请求 ID'), approved: params.approved } as const
    }
    case 'context.compact':
      return { method, sessionId: string(params.sessionId, '会话 ID'), selection: selection(params.selection), ...(params.submissionId === undefined ? {} : { submissionId: string(params.submissionId, '提交 ID') }) } as const
    case 'memory.save': return { method, sessionId: string(params.sessionId, '会话 ID'), selection: selection(params.selection) } as const
    case 'subtask.stop': return { method, sessionId: string(params.sessionId, '会话 ID'), subtaskId: optionalString(params.subtaskId, '子任务 ID') } as const
    case 'command.background':
    case 'command.output':
    case 'command.stop': return { method, sessionId: string(params.sessionId, '会话 ID'), runId: string(params.runId, '运行 ID'), toolId: string(params.toolId, '命令执行 ID', 2048) } as const
    case 'run.abort': return { method, sessionId: string(params.sessionId, '会话 ID'), ...(params.expectedRunId === undefined ? {} : { expectedRunId: string(params.expectedRunId, '运行 ID') }) } as const
    case 'run.rerun': return { method, sessionId: string(params.sessionId, '会话 ID'), selection: selection(params.selection) } as const
    case 'run.edit-rerun': {
      const references = params.references === undefined ? undefined : fileReferences(params.references)
      let workspace: MiraHistoryEditWorkspace | undefined
      if (params.workspace !== undefined) {
        const input = fields(params.workspace)
        if (input.mode === 'preserve') workspace = { mode: 'preserve' }
        else if (input.mode === 'rewind' && typeof input.snapshotToken === 'string' && /^[a-f0-9]{64}$/.test(input.snapshotToken)) workspace = { mode: 'rewind', snapshotToken: input.snapshotToken }
        else throw new Error('历史编辑的文件恢复选择无效')
      }
      return { method, sessionId: string(params.sessionId, '会话 ID'), messageId: string(params.messageId, '消息 ID'), content: messageText(params.content, references ?? []), selection: selection(params.selection), ...(references === undefined ? {} : { references }), ...(workspace === undefined ? {} : { workspace }) } as const
    }
    case 'project.open': return { method, sessionId: string(params.sessionId, '会话 ID'), target: params.target === undefined ? 'file-manager' as const : openTarget(params.target) } as const
    case 'queue.list':
    case 'queue.resume': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'queue.withdraw': return { method, sessionId: string(params.sessionId, '会话 ID'), itemId: string(params.itemId, '排队消息 ID') } as const
    case 'queue.reorder': return { method, sessionId: string(params.sessionId, '会话 ID'), itemId: string(params.itemId, '排队消息 ID'), beforeItemId: params.beforeItemId === null ? null : string(params.beforeItemId, '排序锚点 ID') } as const
    case 'queue.send-now': return { method, sessionId: string(params.sessionId, '会话 ID'), itemId: string(params.itemId, '排队消息 ID'), ...(params.expectedRunId === undefined ? {} : { expectedRunId: string(params.expectedRunId, '运行 ID') }) } as const
    case 'message.submit': {
      const references = fileReferences(params.references)
      return { method, sessionId: string(params.sessionId, '会话 ID'), submissionId: string(params.submissionId, '提交 ID'), text: messageText(params.text, references), references, selection: selection(params.selection), planning: boolean(params.planning, '执行模式'), ...(params.options === undefined ? {} : { options: messageSubmissionOptions(params.options) }) } as const
    }
    case 'message.run': {
      if (typeof params.planning !== 'boolean') throw new Error('执行模式无效')
      const references = fileReferences(params.references)
      return { method, sessionId: string(params.sessionId, '会话 ID'), text: messageText(params.text, references), references, selection: selection(params.selection), planning: params.planning } as const
    }
    case 'plan.confirm': return { method, sessionId: string(params.sessionId, '会话 ID'), planId: string(params.planId, '计划 ID'), selection: selection(params.selection) } as const
    case 'plan.cancel': return { method, sessionId: string(params.sessionId, '会话 ID'), planId: string(params.planId, '计划 ID') } as const
    case 'plan.continue': {
      const references = fileReferences(params.references)
      return { method, sessionId: string(params.sessionId, '会话 ID'), planId: string(params.planId, '计划 ID'), message: messageText(params.message, references), references, selection: selection(params.selection) } as const
    }
    case 'interaction.answer': {
      if (!Array.isArray(params.answers) || params.answers.length > 8) throw new Error('澄清回答无效')
      const answers: HarnessUserAnswer[] = params.answers.map(value => {
        const answer = fields(value)
        if (!Array.isArray(answer.selected) || answer.selected.length > 16) throw new Error('澄清选项无效')
        if (answer.custom !== undefined && (typeof answer.custom !== 'string' || answer.custom.length > 20_000 || answer.custom.includes('\0'))) throw new Error('自定义回答无效')
        return {
          id: string(answer.id, '问题 ID'),
          selected: answer.selected.map(item => string(item, '澄清选项', 1000)),
          ...(answer.custom === undefined ? {} : { custom: answer.custom as string }),
        }
      })
      return { method, sessionId: string(params.sessionId, '会话 ID'), interactionId: string(params.interactionId, '交互 ID'), answers, selection: selection(params.selection) } as const
    }
    default: throw new Error('Harness 方法不存在')
  }
}

function openTarget(value: unknown): 'file-manager' | 'terminal' {
  if (value === 'file-manager' || value === 'terminal') return value
  throw new Error('打开方式无效')
}
