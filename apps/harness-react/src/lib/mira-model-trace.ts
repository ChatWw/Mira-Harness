import type { MiraModelCall, MiraModelCallSource } from '../../../../src/config/miraModelTrace'

export const miraCallSource: Record<MiraModelCallSource, string> = { main: '主任务', title: '生成标题', summary: '上下文压缩', memory: '提炼记忆', subagent: '子智能体', workflow: '工作流', verification: '目标核验' }
export type MiraTraceRole = 'system' | 'user' | 'reasoning' | 'assistant' | 'tool-call' | 'tool-result' | 'options' | 'usage' | 'error'
export const miraTraceRole: Record<MiraTraceRole, string> = { system: '系统指令', user: '用户输入', reasoning: '思考', assistant: '模型回复', 'tool-call': '工具调用', 'tool-result': '工具结果', options: '请求参数与工具定义', usage: '用量', error: '错误' }
export const miraTraceMessageRoles: readonly MiraTraceRole[] = ['system', 'user', 'reasoning', 'assistant', 'tool-call', 'tool-result']
export interface MiraTraceSection { id: string; role: MiraTraceRole; title: string; text: string }
// Search behavior references ZCode ModelTrajectorySearch (Apache-2.0), Copyright 2026 Z.AI Co., Ltd.
// Mira uses its own section model and returns offsets in the displayed original text.
export function miraTraceTextMatches(source: string, query: string): Array<{ start: number; end: number }> {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const pattern = needle.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  const folded = source.toLocaleLowerCase()
  let boundaries: Array<{ start: number; end: number }> | undefined
  if (folded.length !== source.length) {
    boundaries = []
    let offset = 0
    for (const character of source) {
      for (let index = 0; index < character.toLocaleLowerCase().length; index++) boundaries.push({ start: offset, end: offset + character.length })
      offset += character.length
    }
  }
  const result: Array<{ start: number; end: number }> = []
  for (const match of folded.matchAll(new RegExp(pattern, 'gu'))) {
    const start = boundaries?.[match.index]?.start ?? match.index
    const end = boundaries?.[match.index + match[0].length - 1]?.end ?? match.index + match[0].length
    if (result[result.length - 1]?.start !== start) result.push({ start, end })
  }
  return result
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''

export function miraTraceSections(record: MiraModelCall, inputIndexes?: readonly number[]): MiraTraceSection[] {
  const result: MiraTraceSection[] = []
  const add = (key: string, role: MiraTraceRole, title: string, content: unknown) => result.push({ id: `${record.id}:${key}`, role, title, text: text(content) })
  const request = object(record.request)
  if (Array.isArray(request.messages)) (inputIndexes ?? request.messages.map((_, index) => index)).forEach(index => {
    const message: unknown = (request.messages as unknown[])[index]
    const value = object(message), role = value.role === 'developer' || value.role === 'system' ? 'system' : value.role === 'user' ? 'user' : value.role === 'tool' ? 'tool-result' : Array.isArray(value.tool_calls) && value.tool_calls.length ? 'tool-call' : 'assistant'
    add(`input:${index}`, role, `${miraTraceRole[role]} · 请求${typeof value.name === 'string' ? ` · ${value.name}` : ''}`, message)
  })
  if (request.tools) add('tools', 'options', '工具定义 · 请求', request.tools)
  const { messages: _messages, tools: _tools, ...options } = request
  if (Object.keys(options).length) add('options', 'options', '请求参数', options)
  const response = object(record.response)
  if (Array.isArray(response.content)) response.content.forEach((part: unknown, index) => {
    const value = object(part), tool = value.type === 'toolCall'
    add(`output:${index}`, tool ? 'tool-call' : value.type === 'thinking' ? 'reasoning' : 'assistant', tool ? `工具调用 · ${value.name || '工具'}` : value.type === 'thinking' ? '思考 · 响应' : '模型回复 · 响应', tool ? part : value.text ?? value.thinking ?? part)
  })
  const { content: _content, ...metadata } = response
  if (Object.keys(metadata).length) add('usage', 'usage', '响应元数据与用量', metadata)
  if (record.error) add('error', 'error', '调用错误', record.error)
  return result
}

export function miraTraceSummary(records: readonly MiraModelCall[]) {
  let tokens = 0
  const models = new Set<string>()
  for (const record of records) {
    const total = object(object(record.response).usage).totalTokens
    if (typeof total === 'number' && Number.isFinite(total) && total > 0) tokens += total
    if (record.modelId) models.add(record.modelId)
  }
  return { tokens, models: [...models] }
}

// Incremental input presentation references ZCode ModelTrajectoryTimeline (Apache-2.0).
// Mira verifies the retained prefix and isolates each known agent context; persisted IO stays complete.
export function miraTraceCalls(records: readonly MiraModelCall[], fullRequests = false) {
  const contexts = new Map<string, { messages: string[]; hasOutput: boolean }>()
  return records.map(record => {
    const raw = object(record.request).messages
    const messages: unknown[] = Array.isArray(raw) ? raw : []
    const key = record.source === 'main' ? `main:${record.sessionId}` : record.source === 'subagent' && record.agentSessionId ? `agent:${record.agentSessionId}` : undefined
    const prefix = key ? contexts.get(key) : undefined
    const serialized = key ? messages.map(message => text(message)) : []
    const continued = prefix && messages.length >= prefix.messages.length && prefix.messages.every((message, index) => message === serialized[index])
    const indexes = messages.flatMap((message, index) => continued && (index < prefix.messages.length || prefix.hasOutput && object(message).role === 'assistant') ? [] : [index])
    if (key && Array.isArray(raw)) contexts.set(key, { messages: serialized, hasOutput: Array.isArray(object(record.response).content) && (object(record.response).content as unknown[]).length > 0 })
    return { record, sections: miraTraceSections(record, fullRequests ? undefined : indexes), omittedInputs: fullRequests ? 0 : messages.length - indexes.length }
  })
}
