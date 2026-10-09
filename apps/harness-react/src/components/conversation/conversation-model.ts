import type { HarnessActiveRun, HarnessMessage, HarnessRunSummary, ToolCallRecord } from '../../../../../src/config/harness'

export interface TimelineRenderMessage { rendererId: string; original: HarnessMessage }

/** Rendering identity survives the stream ID becoming a persisted message ID. */
export function projectTimelineRenderMessages(messages: HarnessMessage[], sessionId?: string, cache?: WeakMap<HarnessMessage, TimelineRenderMessage>): TimelineRenderMessage[] {
  const occurrences = new Map<string, number>()
  return messages.map(original => {
    const runId = original.role === 'assistant' ? original.runId || (original.id.startsWith('stream-') ? original.id.slice(7) : undefined) : undefined
    let rendererId = original.id
    if (runId) {
      const occurrence = occurrences.get(runId) || 0
      occurrences.set(runId, occurrence + 1)
      rendererId = `mira-assistant:${JSON.stringify([sessionId, runId, occurrence])}`
    }
    const cached = cache?.get(original)
    if (cached?.rendererId === rendererId) return cached
    const projected = { rendererId, original }
    cache?.set(original, projected)
    return projected
  })
}

/** 当前运行属于最后一轮；未开始输出时也提供真实进度的挂载位置。 */
export function projectTimelineMessages(messages: HarnessMessage[], activeRun?: HarnessActiveRun, now = Date.now()): HarnessMessage[] {
  if (!activeRun) return messages
  const run: HarnessRunSummary = { startedAt: activeRun.startedAt, completedAt: now, durationMs: Math.max(0, now - activeRun.startedAt), activities: activeRun.activities, subtasks: activeRun.subtasks }
  if (activeRun.messageId) {
    const streamId = `stream-${activeRun.messageId}`
    const index = messages.findIndex(message => message.role === 'assistant' && (message.id === activeRun.messageId || message.id === streamId))
    if (index >= 0) return messages.map((message, position) => position === index ? { ...message, id: streamId, runId: activeRun.id, run } : message)
    return [...messages, { id: streamId, role: 'assistant', content: '', runId: activeRun.id, createdAt: activeRun.startedAt, run }]
  }
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant' && last.id.startsWith('stream-')) return [...messages.slice(0, -1), { ...last, run }]
  // 恢复中的持久化消息可能还没有 stream id，不能把历史回复改成当前运行。
  if (last?.role === 'assistant' && last.createdAt >= activeRun.startedAt && !last.run?.status) return [...messages.slice(0, -1), { ...last, id: `stream-${activeRun.id}`, run }]
  return [...messages, { id: `stream-${activeRun.id}`, role: 'assistant', content: '', runId: activeRun.id, createdAt: activeRun.startedAt, run }]
}

/** 按运行边界关联已有记录，子任务记录仍由子任务摘要承载。 */
export function toolsForRun(tools: ToolCallRecord[], run?: HarnessRunSummary): ToolCallRecord[] {
  if (!run) return []
  return tools.filter(tool => !tool.subtaskId && tool.createdAt >= run.startedAt && tool.createdAt <= run.completedAt)
}

export function completedOperationCount(run: HarnessRunSummary) {
  return run.activities.filter(activity => activity.status === 'completed').length + (run.subtasks || []).filter(subtask => subtask.status === 'completed').length
}

export interface ConversationTurn { id: string; prompt: string; response: string; running: boolean }
export function buildConversationTurns(messages: HarnessMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      if (message.delivery !== 'guide' || !turns.length) turns.push({ id: message.id, prompt: message.content, response: '', running: false })
    }
    else if (turns.length) {
      const turn = turns[turns.length - 1]
      turn.response += (turn.response ? '\n' : '') + message.content
      turn.running ||= message.id.startsWith('stream-')
    }
  }
  return turns
}
