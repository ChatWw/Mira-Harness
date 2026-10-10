import { ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useConversationScroll, type ConversationScrollActions } from '../../hooks/useConversationScroll'
import type { ConversationTimelineActions } from '../../lib/conversation-timeline'

export function MiraConversationViewport({ memoryKey, viewportRef, actionsRef, timelineRef, active, ready, hasContent, messageWindow, onBottomChange, children }: {
  memoryKey: string | null
  viewportRef: RefObject<HTMLDivElement | null>
  actionsRef: RefObject<ConversationScrollActions | null>
  timelineRef: RefObject<ConversationTimelineActions | null>
  active: boolean
  ready: boolean
  hasContent: boolean
  messageWindow: string
  onBottomChange: (atBottom: boolean) => void
  children: ReactNode
}) {
  // The external-store adapter commits in an effect; do not restore using the previous task's DOM.
  const initialized = useRef(false)
  const renderedWindow = useAuiState(state => JSON.stringify([state.thread.messages.length, state.thread.messages[0]?.id, state.thread.messages[state.thread.messages.length - 1]?.id]))
  const contentReady = ready && (initialized.current || renderedWindow === messageWindow)
  useLayoutEffect(() => { if (contentReady) initialized.current = true }, [contentReady])
  const scroll = useConversationScroll({ memoryKey, active, ready: contentReady, viewportRef, actionsRef, timelineRef, onBottomChange })
  return <ThreadPrimitive.Viewport ref={scroll.ref} autoScroll={scroll.autoScroll} scrollToBottomOnInitialize={false} scrollToBottomOnThreadSwitch={false} scrollToBottomOnRunStart={false} className="mira-message-viewport min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]" style={!hasContent ? { display: 'none' } : !contentReady ? { visibility: 'hidden' } : undefined}>
    {children}
  </ThreadPrimitive.Viewport>
}
