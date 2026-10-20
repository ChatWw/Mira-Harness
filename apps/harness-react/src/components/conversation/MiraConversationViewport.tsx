import { type ReactNode, type RefObject } from 'react'
import { useConversationScroll, type ConversationScrollActions } from '../../hooks/useConversationScroll'
import type { ConversationTimelineActions } from '../../lib/conversation-timeline'

export function MiraConversationViewport({ memoryKey, viewportRef, actionsRef, timelineRef, active, ready, hasContent, onBottomChange, children }: {
  memoryKey: string | null
  viewportRef: RefObject<HTMLDivElement | null>
  actionsRef: RefObject<ConversationScrollActions | null>
  timelineRef: RefObject<ConversationTimelineActions | null>
  active: boolean
  ready: boolean
  hasContent: boolean
  onBottomChange: (atBottom: boolean) => void
  children: ReactNode
}) {
  const scroll = useConversationScroll({ memoryKey, active, ready, viewportRef, actionsRef, timelineRef, onBottomChange })
  return <div ref={scroll.ref} tabIndex={0} role="region" aria-label="对话内容" className="mira-message-viewport min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]" style={!hasContent ? { display: 'none' } : !ready ? { visibility: 'hidden' } : undefined}>
    {children}
  </div>
}
