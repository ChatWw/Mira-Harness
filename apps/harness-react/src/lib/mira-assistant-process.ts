// Adapted from ZCode conversationTurnRenderUnits (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira keeps its canonical message/part identities.
import type { HarnessMessage, ToolCallRecord } from '../../../../src/config/harness'
import { miraCommandExecutionStatus } from './mira-command-presentation'

export const MIRA_REVEAL_PROCESS = 'mira:reveal-assistant-process'

/** Only the uninterrupted text suffix is a reply; prior text remains in the work log. */
export function miraAssistantProcess(message: HarnessMessage, tools: ReadonlyMap<string, ToolCallRecord>) {
  const parts = message.parts ?? []
  let boundary = parts.length
  while (boundary > 0 && parts[boundary - 1].type === 'text') boundary--
  const work = parts.slice(0, boundary)
  const reply = parts.slice(boundary)
  const records = work.flatMap(part => {
    if (part.type !== 'tool') return []
    const tool = tools.get(part.toolCallId)
    return tool && (!message.runId || !tool.runId || message.runId === tool.runId) ? [tool] : []
  })
  const waiting = records.some(tool => tool.status === 'waiting-confirm')
  return { work, reply, waiting, needsAttention: waiting || records.some(tool => miraCommandExecutionStatus(tool) === 'failed') }
}
