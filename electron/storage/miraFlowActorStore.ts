import type Database from 'better-sqlite3'
import type { ActorSessionSeed } from '../../packages/mira-flow-kit/src/mira-index'
import type { MiraFlowActorContext, MiraFlowActorContextStorage } from '../services/flows/miraFlowActorDriver'
import type { MiraFlowActorConversationPage, MiraFlowConversationMessage, MiraFlowConversationPart } from '../../src/config/miraFlowConversation'

export const miraFlowConversationLimits = { pageBytes: 256 * 1024, messageBytes: 32 * 1024, messages: 100 }
const privateField = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|client[_-]?secret|credentials?|headers)$/i
const scrubText = (value: string) => value.replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [已隐藏]')
  .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[已隐藏]')
  .replace(/("(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|client[_-]?secret)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi, '$1"[已隐藏]"')
function textWithin(value: string, bytes: number) {
  const text = scrubText(value)
  if (Buffer.byteLength(JSON.stringify(text)) <= bytes) return { text, truncated: false }
  let low = 0, high = text.length
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (Buffer.byteLength(JSON.stringify(text.slice(0, mid))) <= bytes) low = mid; else high = mid - 1 }
  const end = low && /[\uD800-\uDBFF]/.test(text[low - 1]!) ? low - 1 : low
  return { text: text.slice(0, end), truncated: true }
}
function projectMessage(value: unknown, index: number): MiraFlowConversationMessage {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const role = raw.role === 'user' || raw.role === 'assistant' || raw.role === 'toolResult' ? raw.role : 'other'
  const message: MiraFlowConversationMessage = { index, role, parts: [], ...(typeof raw.timestamp === 'number' && Math.abs(raw.timestamp) <= 8.64e15 ? { timestamp: raw.timestamp } : {}) }
  const content = typeof raw.content === 'string' ? [{ type: 'text', text: raw.content }] : Array.isArray(raw.content) ? raw.content : []
  for (const value of content.slice(0, 32)) {
    if (!value || typeof value !== 'object') continue
    const source = value as Record<string, unknown>
    let part: MiraFlowConversationPart
    if (source.type === 'text') part = { kind: role === 'toolResult' ? 'tool-result' : 'text', text: typeof source.text === 'string' ? source.text : '' }
    else if (source.type === 'thinking') part = { kind: 'thinking', text: typeof source.thinking === 'string' ? source.thinking : '' }
    else if (source.type === 'toolCall') part = { kind: 'tool-call', text: JSON.stringify(source.arguments ?? {}, (key, value) => privateField.test(key) ? '[已隐藏]' : value, 2) ?? '' }
    else if (source.type === 'image') part = { kind: 'image', text: '图片内容未在只读对话中加载' }
    else part = { kind: 'unsupported', text: '此内容类型暂不支持查看' }
    const toolName = role === 'toolResult' ? raw.toolName : source.name, toolCallId = role === 'toolResult' ? raw.toolCallId : source.id
    if (part.kind === 'tool-call' || part.kind === 'tool-result') {
      if (typeof toolName === 'string') part.toolName = scrubText(toolName).slice(0, 128)
      if (typeof toolCallId === 'string') part.toolCallId = scrubText(toolCallId).slice(0, 128)
      if (role === 'toolResult') part.isError = raw.isError === true
    }
    const remaining = miraFlowConversationLimits.messageBytes - Buffer.byteLength(JSON.stringify(message)) - 1024
    if (remaining <= 0) { message.truncated = true; break }
    const bounded = textWithin(part.text, remaining)
    part.text = bounded.text
    if (bounded.truncated) { part.truncated = true; message.truncated = true }
    message.parts.push(part)
  }
  if (content.length > 32) message.truncated = true
  return message
}

/** Durable workflow actor transcripts; separate from the visible parent conversation. */
export class MiraFlowActorStore implements MiraFlowActorContextStorage {
  constructor(private readonly database: Database.Database) {}

  initialize(): void {
    this.database.exec(`CREATE TABLE IF NOT EXISTS mira_flow_actor_contexts (
      session_id TEXT PRIMARY KEY, payload TEXT NOT NULL, time_updated INTEGER NOT NULL
    )`)
  }

  async loadOrCreate(sessionId: string, seed?: ActorSessionSeed): Promise<MiraFlowActorContext> {
    if (!sessionId.trim()) throw new Error('工作流智能体需要会话身份')
    return this.database.transaction(() => {
      const existing = this.read(sessionId)
      if (existing) return existing
      let context: MiraFlowActorContext = { messages: [] }
      if (seed) {
        const source = this.read(seed.sourceSessionId)
        if (!source || !Number.isSafeInteger(seed.messageCount) || seed.messageCount < 0 || seed.messageCount > source.messages.length) throw new Error('工作流上下文种子不存在或消息边界无效')
        if (seed.resolvedModel && seed.resolvedModel !== source.resolvedModel) throw new Error('工作流上下文种子的模型身份不一致')
        context = { messages: source.messages.slice(0, seed.messageCount), ...(source.resolvedModel ? { resolvedModel: source.resolvedModel } : {}) }
      }
      this.database.prepare('INSERT INTO mira_flow_actor_contexts(session_id, payload, time_updated) VALUES (?, ?, ?)').run(sessionId, JSON.stringify(context), Date.now())
      return context
    })()
  }

  async save(sessionId: string, context: MiraFlowActorContext): Promise<void> {
    if (!Array.isArray(context.messages) || context.resolvedModel !== undefined && !context.resolvedModel.trim()) throw new Error('无效的工作流智能体上下文')
    const payload = JSON.stringify(context)
    this.database.transaction(() => {
      const current = this.read(sessionId)
      if (!current) throw new Error('工作流智能体会话不存在')
      if (current.resolvedModel && current.resolvedModel !== context.resolvedModel) throw new Error('不能切换已建立上下文的工作流智能体模型')
      this.database.prepare('UPDATE mira_flow_actor_contexts SET payload = ?, time_updated = ? WHERE session_id = ?').run(payload, Date.now(), sessionId)
    })()
  }

  /** Pure read: does not create contexts, and projects only message content, never model/provider metadata. */
  readConversation(sessionId: string, offset = 0, limit = 50): Omit<MiraFlowActorConversationPage, 'state' | 'actorName' | 'runStatus'> | undefined {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > miraFlowConversationLimits.messages) throw new Error('工作流请求无效')
    const row = this.database.prepare('SELECT payload, time_updated FROM mira_flow_actor_contexts WHERE session_id = ?').get(sessionId) as { payload: string; time_updated: number } | undefined
    if (!row) return
    const context: MiraFlowActorContext = JSON.parse(row.payload)
    if (offset > context.messages.length) throw new Error('工作流对话已变化，请刷新后重试')
    const messages: MiraFlowConversationMessage[] = []
    let bytes = 1024
    for (let index = offset; index < Math.min(context.messages.length, offset + limit); index++) {
      const message = projectMessage(context.messages[index], index), size = Buffer.byteLength(JSON.stringify(message))
      if (bytes + size > miraFlowConversationLimits.pageBytes) break
      messages.push(message); bytes += size
    }
    const nextOffset = offset + messages.length
    return { messages, offset, nextOffset, total: context.messages.length, hasMore: nextOffset < context.messages.length, updatedAt: row.time_updated, limits: { ...miraFlowConversationLimits } }
  }

  private read(sessionId: string): MiraFlowActorContext | undefined {
    const row = this.database.prepare('SELECT payload FROM mira_flow_actor_contexts WHERE session_id = ?').get(sessionId) as { payload: string } | undefined
    return row ? JSON.parse(row.payload) : undefined
  }
}
