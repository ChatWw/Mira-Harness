import type { RunRecord } from '../../packages/mira-flow-kit/src/engine/mira-types'

/** Read-only content projection: no Pi/provider runtime metadata crosses this contract. */
export interface MiraFlowConversationPart {
  kind: 'text' | 'thinking' | 'tool-call' | 'tool-result' | 'image' | 'unsupported'
  text: string
  toolName?: string
  toolCallId?: string
  isError?: boolean
  truncated?: boolean
}
export interface MiraFlowConversationMessage { index: number; role: 'user' | 'assistant' | 'toolResult' | 'other'; timestamp?: number; parts: MiraFlowConversationPart[]; truncated?: boolean }
export interface MiraFlowActorConversationPage {
  state: 'not-started' | 'available'
  actorName?: string
  runStatus: RunRecord['status']
  messages: MiraFlowConversationMessage[]
  offset: number
  nextOffset: number
  total: number
  hasMore: boolean
  updatedAt?: number
  limits: { pageBytes: number; messageBytes: number; messages: number }
}
