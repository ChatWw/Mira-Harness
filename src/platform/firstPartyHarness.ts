import type { HarnessUserAnswer, ModelSelection } from '@/config/harness'

function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Harness 请求参数无效')
  return value as Record<string, unknown>
}

function string(value: unknown, name: string, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}无效`)
  return value
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

function browserUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error('浏览器地址无效')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('浏览器地址无效') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('浏览器只允许 http(s) 地址')
  return parsed.href
}

function terminalDimension(value: unknown, name: string) {
  if (!Number.isInteger(value) || (value as number) < 2 || (value as number) > 500) throw new Error(`${name}无效`)
  return value as number
}

export function parseFirstPartyHarnessCall(method: string, raw: unknown) {
  if (method === 'sessions.list' || method === 'projects.list' || method === 'providers.list') return { method } as const
  const params = fields(raw)
  switch (method) {
    case 'files.list':
    case 'files.read':
      return { method, sessionId: string(params.sessionId, '会话 ID'), path: workspacePath(params.path, method === 'files.list') } as const
    case 'browser.navigate': return { method, sessionId: string(params.sessionId, '会话 ID'), url: browserUrl(params.url) } as const
    case 'terminal.open': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'terminal.write': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), data: string(params.data, '终端输入', 100_000) } as const
    case 'terminal.resize': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID'), columns: terminalDimension(params.columns, '终端列数'), rows: terminalDimension(params.rows, '终端行数') } as const
    case 'terminal.close': return { method, sessionId: string(params.sessionId, '会话 ID'), terminalId: string(params.terminalId, '终端 ID') } as const
    case 'session.get': return { method, id: string(params.id, '会话 ID') } as const
    case 'session.create': return { method, projectId: params.projectId === undefined ? undefined : string(params.projectId, '项目 ID') } as const
    case 'permissions.pending': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'permission.respond': {
      if (typeof params.allowed !== 'boolean') throw new Error('权限响应无效')
      return { method, requestId: string(params.requestId, '权限请求 ID'), allowed: params.allowed } as const
    }
    case 'run.abort': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'project.open': return { method, sessionId: string(params.sessionId, '会话 ID') } as const
    case 'message.run': {
      if (typeof params.planning !== 'boolean') throw new Error('执行模式无效')
      return { method, sessionId: string(params.sessionId, '会话 ID'), text: string(params.text, '任务内容', 100_000), selection: selection(params.selection), planning: params.planning } as const
    }
    case 'plan.confirm': return { method, sessionId: string(params.sessionId, '会话 ID'), planId: string(params.planId, '计划 ID'), selection: selection(params.selection) } as const
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
