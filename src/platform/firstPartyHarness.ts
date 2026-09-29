import { isPermissionMode, type HarnessFileReference, type HarnessSessionOrderScope, type HarnessUserAnswer, type ModelSelection, type PermissionMode } from '@/config/harness'

function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Harness 请求参数无效')
  return value as Record<string, unknown>
}

function string(value: unknown, name: string, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}无效`)
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

function selection(value: unknown): ModelSelection {
  const input = fields(value)
  return { providerId: string(input.providerId, '供应商 ID'), modelId: string(input.modelId, '模型 ID') }
}

function workspacePath(value: unknown, allowEmpty = false) {
  if (allowEmpty && value === '') return ''
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || value.includes('\\') || value.startsWith('/') || value.split('/').some(segment => segment === '..')) {
    throw new Error('路径无效')
  }
  return value
}

function fileReferences(value: unknown): HarnessFileReference[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 32) throw new Error('引用文件无效')
  return value.map(item => {
    const reference = fields(item)
    return { path: workspacePath(reference.path), name: string(reference.name, '引用文件名', 512) }
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

export function parseFirstPartyHarnessCall(method: string, raw: unknown) {
  if (method === 'sessions.list' || method === 'projects.list' || method === 'providers.list' || method === 'skills.list') return { method } as const
  const params = fields(raw)
  switch (method) {
    case 'files.list':
    case 'files.read':
      return { method, sessionId: string(params.sessionId, '会话 ID'), path: workspacePath(params.path, method === 'files.list') } as const
    case 'browser.navigate': return { method, sessionId: string(params.sessionId, '会话 ID'), url: browserUrl(params.url), bounds: browserBounds(params.bounds) } as const
    case 'browser.bounds': return { method, sessionId: string(params.sessionId, '会话 ID'), bounds: browserBounds(params.bounds) } as const
    case 'browser.control': {
      if (!['back', 'forward', 'reload', 'hide', 'show', 'close'].includes(String(params.action))) throw new Error('浏览器操作无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), action: params.action as 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close' } as const
    }
    case 'terminal.open': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'terminal.write': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), data: string(params.data, '终端输入', 100_000) } as const
    case 'terminal.resize': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), columns: terminalDimension(params.columns, '终端列数'), rows: terminalDimension(params.rows, '终端行数') } as const
    case 'terminal.close': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID') } as const
    case 'session.get': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.create': return { method, projectId: params.projectId === undefined ? undefined : string(params.projectId, '项目 ID') } as const
    case 'session.rename': return { method, id: string(params.id, '会话 ID'), title: string(params.title, '会话标题', 120) } as const
    case 'session.set-pinned': return { method, id: string(params.id, '会话 ID'), pinned: boolean(params.pinned, '置顶状态') } as const
    case 'session.set-unread': return { method, id: string(params.id, '会话 ID'), unread: boolean(params.unread, '未读状态') } as const
    case 'session.archive': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.delete': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.move': return { method, id: string(params.id, '会话 ID'), projectId: string(params.projectId, '项目 ID') } as const
    case 'session.reorder': return { method, scope: orderScope(params.scope), ids: idList(params.ids, '会话 ID 列表') } as const
    case 'session.set-permission': return { method, id: string(params.id, '会话 ID'), mode: permissionMode(params.mode) } as const
    case 'session.set-skills': return { method, id: string(params.id, '会话 ID'), skillIds: idList(params.skillIds, 'Skill 列表') } as const
    case 'session.set-mcp-servers': return { method, id: string(params.id, '会话 ID'), serverIds: idList(params.serverIds, 'MCP 服务列表') } as const
    case 'session.set-delegation': return { method, id: string(params.id, '会话 ID'), enabled: boolean(params.enabled, '委派开关') } as const
    case 'projects.reorder': return { method, ids: idList(params.ids, '项目 ID 列表') } as const
    case 'git.branches': return { method, projectId: string(params.projectId, '项目 ID') } as const
    case 'git.checkout': return { method, projectId: string(params.projectId, '项目 ID'), branch: string(params.branch, '分支名', 256) } as const
    case 'git.create-branch': return { method, projectId: string(params.projectId, '项目 ID'), branch: string(params.branch, '分支名', 256) } as const
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
    case 'run.abort': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'run.rerun': return { method, sessionId: string(params.sessionId, '会话 ID'), selection: selection(params.selection) } as const
    case 'run.edit-rerun': return { method, sessionId: string(params.sessionId, '会话 ID'), messageId: string(params.messageId, '消息 ID'), content: string(params.content, '消息内容', 100_000), selection: selection(params.selection) } as const
    case 'project.open': return { method, sessionId: string(params.sessionId, '会话 ID'), target: params.target === undefined ? 'file-manager' as const : openTarget(params.target) } as const
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
