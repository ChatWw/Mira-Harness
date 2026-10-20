/* Run cards belong to their launch turn, as in ZCode workflowTurnDigests.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import type { ToolCallRecord } from '../../../../../src/config/harness'
import type { RunRecord } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'
import type { TimelineRenderMessage } from '../conversation/conversation-model'
import { buildConversationRenderTurns } from '../../lib/conversation-timeline'

export function workflowTurnDigests(messages: TimelineRenderMessage[], tools: ToolCallRecord[], runs: RunRecord[]) {
  const turns = buildConversationRenderTurns(messages)
  const byTool = new Map<string, string>(), byMessage = new Map<string, string>(), byRun = new Map<string, string>()
  for (const turn of turns) for (const index of turn.messageIndexes) {
    const { original, rendererId } = messages[index]
    byMessage.set(original.id, turn.id); byMessage.set(rendererId, turn.id)
    if (original.id.startsWith('stream-')) byMessage.set(original.id.slice(7), turn.id)
    if (original.runId) byRun.set(original.runId, turn.id)
    for (const part of original.parts ?? []) if (part.type === 'tool') byTool.set(part.toolCallId, turn.id)
  }
  const toolIndex = new Map(tools.map(tool => [tool.id, tool]))
  const byTurn = new Map<string, RunRecord[]>(), unanchored: RunRecord[] = []
  for (const run of runs) {
    const tool = run.toolCallId ? toolIndex.get(run.toolCallId) : undefined
    const turnId = run.toolCallId ? byTool.get(run.toolCallId) ?? (tool?.messageId ? byMessage.get(tool.messageId) : undefined) ?? (tool?.runId ? byRun.get(tool.runId) : undefined) : undefined
    if (turnId) byTurn.set(turnId, [...(byTurn.get(turnId) ?? []), run])
    // Direct hub launches have no chat tool call. Keep their card before later dialogue,
    // never attach an unknown historical launch to the newest turn.
    else unanchored.push(run)
  }
  return { byTurn, unanchored }
}
