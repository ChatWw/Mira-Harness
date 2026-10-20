// Adapted from ZCode conversationTurnRenderUnits, conversationTimelineLiveTail
// and timelineRowHeightCache (Apache-2.0). Copyright 2026 Z.AI Co., Ltd.
import type { TimelineRenderMessage } from '../components/conversation/conversation-model'
import type { ConversationScrollPosition } from './conversation-scroll'

export interface ConversationRenderTurn { id: string; messageIndexes: number[]; running: boolean }
export interface ConversationConfirmationTarget { kind: 'permission' | 'interaction'; id: string; messageId?: string }
export interface ConversationTimelineActions {
  restore: (position: ConversationScrollPosition, viewport: HTMLElement) => boolean | undefined
  jumpToMessage: (messageId: string, align?: ScrollLogicalPosition, onMounted?: () => void, findTargetKey?: string) => void | (() => void)
  jumpToInteraction: (target?: ConversationConfirmationTarget) => boolean
}

/** Guides and assistant segments belong to the original task turn, in canonical order. */
export function buildConversationRenderTurns(messages: TimelineRenderMessage[], liveMessageId?: string): ConversationRenderTurn[] {
  const turns: ConversationRenderTurn[] = []
  messages.forEach(({ rendererId, original }, index) => {
    if (!turns.length || original.role === 'user' && original.delivery !== 'guide') turns.push({ id: rendererId, messageIndexes: [], running: false })
    const turn = turns[turns.length - 1]
    turn.messageIndexes.push(index)
    turn.running ||= Boolean(liveMessageId && (original.id === liveMessageId || rendererId === liveMessageId))
  })
  return turns
}

/** Search uses persisted IDs; the renderer keeps an assistant's identity through stream completion. */
export function indexConversationTurnMessages(turns: ConversationRenderTurn[], messages: TimelineRenderMessage[]) {
  const index = new Map<string, number>()
  turns.forEach((turn, turnIndex) => turn.messageIndexes.forEach(messageIndex => {
    const { original, rendererId } = messages[messageIndex]
    index.set(original.id, turnIndex)
    index.set(rendererId, turnIndex)
    if (original.id.startsWith('stream-')) index.set(original.id.slice(7), turnIndex)
  }))
  return index
}

export function createConversationHeightCache(limit = 4000) {
  const heights = new Map<string, number>()
  return {
    read: (key: string) => heights.get(key),
    estimate: (key: string) => heights.get(key) ?? 72,
    save(key: string, height: number) {
      if (!Number.isFinite(height) || height <= 0) return
      heights.delete(key)
      heights.set(key, height)
      while (heights.size > limit) heights.delete(heights.keys().next().value!)
    },
  }
}

/** Floating status comes from the same final render turn as the visible timeline. */
export function conversationFloatingStatus(messages: TimelineRenderMessage[], liveMessageId: string | undefined, running: boolean, startedAt?: number) {
  const turns = buildConversationRenderTurns(messages, liveMessageId)
  const turn = turns[turns.length - 1]
  const last = turn && [...turn.messageIndexes].reverse().map(index => messages[index].original).find(message => message.role === 'assistant' && !message.internal)
  const parts = last?.parts
  let boundary = parts?.length || 0
  while (boundary > 0 && parts![boundary - 1].type === 'text') boundary--
  const reply = parts?.slice(boundary).filter(part => part.type === 'text')
  const answer = !running && last && !last.interrupted && last.run?.status !== 'failed' && last.run?.status !== 'stopped'
    && (!reply || reply.every(part => part.type === 'text' && part.state === 'complete'))
    ? reply?.length ? reply.map(part => part.type === 'text' ? part.text : '').join('\n') : !parts?.length ? last.content : '' : ''
  return { turnKey: turn?.id || '', running, startedAt: startedAt ?? last?.run?.startedAt, answer }
}
