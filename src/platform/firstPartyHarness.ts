import { isPermissionMode, type AutomationRunStatus, type AutomationTaskInput, type AutomationTarget, type AutomationTrigger, type HarnessFileReference, type HarnessMessageSubmissionOptions, type HarnessSessionOrderScope, type HarnessUserAnswer, type ModelSelection, type PermissionMode } from '../config/harness'

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
  if (input.delivery !== undefined && input.delivery !== 'immediate' && input.delivery !== 'guide') throw new Error('消息投递方式无效')
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
    ...(input.delivery === undefined ? {} : { delivery: input.delivery }),
    ...(input.pausedQueueDecision === undefined ? {} : { pausedQueueDecision: input.pausedQueueDecision }),
    ...(revision === undefined ? {} : { expectedQueueRevision: Number(revision) }),
    ...(ids === undefined ? {} : { expectedQueueItemIds: ids }),
    ...(expectedRunId === undefined ? {} : { expectedRunId }),
  }
}

function selection(value: unknown): ModelSelection {
  const input = fields(value)
  const thinkingLevel = input.thinkingLevel
  if (thinkingLevel !== undefined && thinkingLevel !== 'off' && thinkingLevel !== 'low' && thinkingLevel !== 'medium' && thinkingLevel !== 'high') throw new Error('推理强度无效')
  // Runtime 使用用户选择的推理档位；桥不能把它剥离后静默恢复为默认中档。
  return { providerId: string(input.providerId, '供应商 ID'), modelId: string(input.modelId, '模型 ID'), ...(thinkingLevel === undefined ? {} : { thinkingLevel }) }
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

function workspaceScope(params: Record<string, unknown>): { projectId: string } | { sessionId: string } {
  const project = Object.prototype.hasOwnProperty.call(params, 'projectId')
  const session = Object.prototype.hasOwnProperty.call(params, 'sessionId')
  if (project === session) throw new Error('文件范围必须指定一个项目或会话')
  return project ? { projectId: string(params.projectId, '项目 ID') } : { sessionId: string(params.sessionId, '会话 ID') }
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
    return { path: fileReferencePath(reference.path), name: string(reference.name, '引用文件名', 512) }
  })
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

function browserBounds(value: unknown): HarnessBrowserBounds {
  const bounds = fields(value)
  const dimension = (field: keyof HarnessBrowserBounds, min: number) => {
    const result = bounds[field]
    if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > 10_000) throw new Error('浏览器视图位置无效')
    return Math.round(result)
  }
  return { x: dimension('x', 0), y: dimension('y', 0), width: dimension('width', 16), height: dimension('height', 16) }
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
  if (rawTrigger.type === 'cron') trigger = { type: 'cron', expression: string(rawTrigger.expression, 'Cron 表达式', 256), ...(rawTrigger.humanLabel === undefined ? {} : { humanLabel: string(rawTrigger.humanLabel, '计划说明', 120) }) }
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
  if (method === 'sessions.list' || method === 'projects.list' || method === 'projects.select' || method === 'providers.list' || method === 'skills.list' || method === 'mcp.list' || method === 'composer.preferences' || method === 'marketplace.installed' || method === 'automations.list' || method === 'automations.overview' || method === 'permissions.config') return { method } as const
  if (method === 'marketplace.browse') {
    const params = raw === undefined ? {} : fields(raw)
    return { method, refresh: params.refresh === undefined ? false : boolean(params.refresh, '刷新状态') } as const
  }
  if (method === 'editors.list') {
    const params = raw === undefined ? {} : fields(raw)
    return { method, refresh: params.refresh === undefined ? false : boolean(params.refresh, '刷新状态') } as const
  }
  const params = fields(raw)
  switch (method) {
    case 'automations.next-runs': return { method, expression: string(params.expression, 'Cron 表达式', 256) } as const
    case 'automations.save': return { method, input: automationTask(params.input) } as const
    case 'automations.set-enabled': return { method, id: string(params.id, '自动化 ID'), enabled: boolean(params.enabled, '启用状态') } as const
    case 'automations.delete':
    case 'automations.run-now':
    case 'automations.abort': return { method, id: string(params.id, '自动化 ID') } as const
    case 'automations.retry': return { method, id: string(params.id, '运行 ID') } as const
    case 'automations.runs': {
      const status = params.status
      if (status !== undefined && !['running', 'completed', 'failed', 'skipped', 'interrupted'].includes(String(status))) throw new Error('自动化运行状态无效')
      return { method, id: string(params.id, '自动化 ID'), status: status as AutomationRunStatus | undefined } as const
    }
    case 'marketplace.detail':
    case 'marketplace.install': return { method, id: string(params.id, '市场条目 ID') } as const
    case 'files.select': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'files.open-editor': {
      const editorId = string(params.editorId, '打开方式', 128)
      if (!/^mira-[a-z-]+$/.test(editorId)) throw new Error('打开方式无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), path: workspacePath(params.path, true), editorId } as const
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
      return { method, sessionId: string(params.sessionId, '会话 ID'), paths } as const
    }
    case 'files.unwatch': return { method, sessionId: string(params.sessionId, '会话 ID'), watchId: string(params.watchId, '监听 ID') } as const
    case 'files.read-image': {
      const path = workspacePath(params.path)
      if (/^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('路径无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), path } as const
    }
    case 'files.list': return { method, ...workspaceScope(params), path: workspacePath(params.path, true) } as const
    case 'files.read':
      return { method, sessionId: string(params.sessionId, '会话 ID'), path: workspacePath(params.path) } as const
    case 'browser.navigate': return { method, sessionId: string(params.sessionId, '会话 ID'), url: browserUrl(params.url), bounds: browserBounds(params.bounds) } as const
    case 'browser.bounds': return { method, sessionId: string(params.sessionId, '会话 ID'), bounds: browserBounds(params.bounds) } as const
    case 'browser.control': {
      if (!['back', 'forward', 'reload', 'hide', 'show', 'close'].includes(String(params.action))) throw new Error('浏览器操作无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), action: params.action as 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close' } as const
    }
    case 'terminal.open': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    // PTY 数据流必须保留 Enter/Tab/空格和 Ctrl+Space 的 NUL，不能按普通文案裁剪或拒绝。
    case 'terminal.write': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), data: terminalData(params.data) } as const
    case 'terminal.resize': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), columns: terminalDimension(params.columns, '终端列数'), rows: terminalDimension(params.rows, '终端行数') } as const
    case 'terminal.close': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID') } as const
    case 'session.get': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.create': return { method, projectId: params.projectId === undefined ? undefined : string(params.projectId, '项目 ID') } as const
    case 'session.rename': return { method, id: string(params.id, '会话 ID'), title: string(params.title, '会话标题', 120) } as const
    case 'session.set-pinned': return { method, id: string(params.id, '会话 ID'), pinned: boolean(params.pinned, '置顶状态') } as const
    case 'session.set-unread': return { method, id: string(params.id, '会话 ID'), unread: boolean(params.unread, '未读状态') } as const
    case 'session.archive': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.restore': return { method, id: string(params.id, '会话 ID') } as const
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
    case 'session.move': return { method, id: string(params.id, '会话 ID'), projectId: string(params.projectId, '项目 ID') } as const
    case 'session.reorder': return { method, scope: orderScope(params.scope), ids: idList(params.ids, '会话 ID 列表') } as const
    case 'session.set-permission': return { method, id: string(params.id, '会话 ID'), mode: permissionMode(params.mode) } as const
    case 'session.set-skills': return { method, id: string(params.id, '会话 ID'), skillIds: idList(params.skillIds, 'Skill 列表') } as const
    case 'session.set-mcp-servers': return { method, id: string(params.id, '会话 ID'), serverIds: idList(params.serverIds, 'MCP 服务列表') } as const
    case 'session.set-delegation': return { method, id: string(params.id, '会话 ID'), enabled: boolean(params.enabled, '委派开关') } as const
    case 'projects.reorder': return { method, ids: idList(params.ids, '项目 ID 列表') } as const
    case 'projects.rename': return { method, id: string(params.id, '项目 ID'), name: string(params.name, '项目名称', 120) } as const
    case 'projects.open': return { method, projectId: string(params.projectId, '项目 ID'), target: params.target === undefined ? 'file-manager' as const : openTarget(params.target) } as const
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
    case 'memory.save': return { method, sessionId: string(params.sessionId, '会话 ID'), selection: selection(params.selection) } as const
    case 'subtask.stop': return { method, sessionId: string(params.sessionId, '会话 ID'), subtaskId: optionalString(params.subtaskId, '子任务 ID') } as const
    case 'run.abort': return { method, sessionId: string(params.sessionId, '会话 ID'), ...(params.expectedRunId === undefined ? {} : { expectedRunId: string(params.expectedRunId, '运行 ID') }) } as const
    case 'run.rerun': return { method, sessionId: string(params.sessionId, '会话 ID'), selection: selection(params.selection) } as const
    case 'run.edit-rerun': return { method, sessionId: string(params.sessionId, '会话 ID'), messageId: string(params.messageId, '消息 ID'), content: string(params.content, '消息内容', 100_000), selection: selection(params.selection) } as const
    case 'project.open': return { method, sessionId: string(params.sessionId, '会话 ID'), target: params.target === undefined ? 'file-manager' as const : openTarget(params.target) } as const
    case 'queue.list':
    case 'queue.resume': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'queue.withdraw': return { method, sessionId: string(params.sessionId, '会话 ID'), itemId: string(params.itemId, '排队消息 ID') } as const
    case 'queue.reorder': return { method, sessionId: string(params.sessionId, '会话 ID'), itemId: string(params.itemId, '排队消息 ID'), beforeItemId: params.beforeItemId === null ? null : string(params.beforeItemId, '排序锚点 ID') } as const
    case 'queue.send-now': return { method, sessionId: string(params.sessionId, '会话 ID'), itemId: string(params.itemId, '排队消息 ID'), ...(params.expectedRunId === undefined ? {} : { expectedRunId: string(params.expectedRunId, '运行 ID') }) } as const
    case 'message.submit': {
      return { method, sessionId: string(params.sessionId, '会话 ID'), submissionId: string(params.submissionId, '提交 ID'), text: string(params.text, '任务内容', 100_000), references: fileReferences(params.references), selection: selection(params.selection), planning: boolean(params.planning, '执行模式'), ...(params.options === undefined ? {} : { options: messageSubmissionOptions(params.options) }) } as const
    }
    case 'message.run': {
      if (typeof params.planning !== 'boolean') throw new Error('执行模式无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), text: string(params.text, '任务内容', 100_000), references: fileReferences(params.references), selection: selection(params.selection), planning: params.planning } as const
    }
    case 'plan.confirm': return { method, sessionId: string(params.sessionId, '会话 ID'), planId: string(params.planId, '计划 ID'), selection: selection(params.selection) } as const
    case 'plan.cancel': return { method, sessionId: string(params.sessionId, '会话 ID'), planId: string(params.planId, '计划 ID') } as const
    case 'plan.continue': {
      return { method, sessionId: string(params.sessionId, '会话 ID'), planId: string(params.planId, '计划 ID'), message: string(params.message, '任务内容', 100_000), references: fileReferences(params.references), selection: selection(params.selection) } as const
    }
    case 'interaction.answer': {
      if (!Array.isArray(params.answers) || params.answers.length > 8) throw new Error('澄清回答无效')
      const answers: HarnessUserAnswer[] = params.answers.map(value => {
        const answer = fields(value)
        if (!Array.isArray(answer.selected) || answer.selected.length > 16) throw new Error('澄清选项无效')
        return {
          id: string(answer.id, '问题 ID'),
          selected: answer.selected.map(item => string(item, '澄清选项', 1000)),
          ...(answer.custom === undefined ? {} : { custom: string(answer.custom, '自定义回答', 20_000) }),
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
