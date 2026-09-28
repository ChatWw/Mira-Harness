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

export function parseFirstPartyHarnessCall(method: string, raw: unknown) {
  if (method === 'sessions.list' || method === 'projects.list' || method === 'providers.list') return { method } as const
  const params = fields(raw)
  switch (method) {
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
