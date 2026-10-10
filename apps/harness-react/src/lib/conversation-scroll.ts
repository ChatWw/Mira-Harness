// Adapted from ZCode chatSessionScrollMemory.ts (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira uses its own session/workspace scope.
export interface ConversationScrollPosition {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  following: boolean
  anchor?: { turnId: string; offset: number }
}

export function conversationScrollKey(sessionId?: string, directory?: string): string | null {
  return sessionId ? JSON.stringify([directory || '', sessionId]) : null
}

export function createConversationScrollMemory(limit = 200) {
  const positions = new Map<string, ConversationScrollPosition>()
  return {
    read(key: string | null) {
      if (!key) return undefined
      const position = positions.get(key)
      if (position) { positions.delete(key); positions.set(key, position) }
      return position
    },
    save(key: string | null, position: ConversationScrollPosition) {
      if (!key) return
      positions.delete(key)
      positions.set(key, { ...position })
      while (positions.size > limit) positions.delete(positions.keys().next().value!)
    },
  }
}

export const conversationScrollMemory = createConversationScrollMemory()

export function conversationRestoreTop(position: ConversationScrollPosition, metrics: Pick<HTMLElement, 'scrollHeight' | 'clientHeight'>) {
  const maximum = Math.max(0, metrics.scrollHeight - metrics.clientHeight)
  return position.following ? maximum : Math.min(maximum, Math.max(0, position.scrollTop))
}
