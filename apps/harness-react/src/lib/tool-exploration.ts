// Adapted from ZCode conversationAssistantWorkItems.ts (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira groups only its explicit public tool records.
import type { HarnessMessage, HarnessMessagePart, ToolCallRecord } from '../../../../src/config/harness'

const EXPLORATION_TOOLS = new Set(['read', 'list_files', 'web_search', 'web_fetch'])

export function isMiraExplorationTool(tool: ToolCallRecord) { return EXPLORATION_TOOLS.has(tool.tool) }

type MiraToolPart = Extract<HarnessMessagePart, { type: 'tool' }>
export type MiraAssistantWorkItem =
  | { kind: 'part'; part: HarnessMessagePart; tool?: ToolCallRecord }
  | { kind: 'exploration'; firstId: string; entries: { part: MiraToolPart; tool: ToolCallRecord }[]; live: boolean }

export function miraAssistantWorkItems(message: HarnessMessage, toolsById: ReadonlyMap<string, ToolCallRecord>, streaming = false, permissionPartId?: string): MiraAssistantWorkItem[] {
  const parts = message.parts ?? []
  const items: MiraAssistantWorkItem[] = []
  for (const part of parts) {
    const candidate = part.type === 'tool' ? toolsById.get(part.toolCallId) : undefined
    const tool = candidate && (!message.runId || !candidate.runId || candidate.runId === message.runId) ? candidate : undefined
    const previous = items[items.length - 1]
    const previousTool = previous?.kind === 'part' ? previous.tool : previous?.entries[0]?.tool
    const previousPartId = previous?.kind === 'part' ? previous.part.id : undefined
    const groupable = part.type === 'tool' && tool && isMiraExplorationTool(tool) && tool.status !== 'waiting-confirm' && part.id !== permissionPartId
    const previousGroupable = previous?.kind === 'exploration' || (previous?.kind === 'part' && previous.part.type === 'tool' && previousTool && isMiraExplorationTool(previousTool) && previousTool.status !== 'waiting-confirm' && previousPartId !== permissionPartId)
    if (groupable && previousGroupable && previousTool?.runId === tool.runId) {
      if (previous.kind === 'exploration') previous.entries.push({ part, tool })
      else items[items.length - 1] = { kind: 'exploration', firstId: previous.part.id, entries: [{ part: previous.part as MiraToolPart, tool: previous.tool! }, { part, tool }], live: false }
    } else items.push({ kind: 'part', part, tool })
  }
  // A completed last child does not end an assistant stage that is still streaming.
  const tail = items[items.length - 1]
  if (tail?.kind === 'exploration') tail.live = streaming
  return items
}

export function miraExplorationSummary(tools: readonly ToolCallRecord[]) {
  const counts = { read: 0, list: 0, search: 0 }
  for (const tool of tools) {
    if (tool.tool === 'read') counts.read++
    else if (tool.tool === 'list_files') counts.list++
    else counts.search++
  }
  return [counts.search && `${counts.search} 次搜索`, counts.list && `${counts.list} 次目录查询`, counts.read && `${counts.read} 次读取`].filter(Boolean).join('、')
}
