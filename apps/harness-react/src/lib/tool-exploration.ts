// Adapted from ZCode conversationAssistantWorkItems.ts (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira groups only its explicit public tool records.
import type { HarnessMessage, HarnessMessagePart, ToolCallRecord } from '../../../../src/config/harness'
import { miraCommandExplorationKind, miraCompleteCommand, type MiraExplorationKind } from './mira-command-presentation'

const EXPLORATION_TOOLS = new Map<string, MiraExplorationKind>([['read', 'read'], ['load_plugin_skill', 'read'], ['read_plugin_resource', 'read'], ['list_plugin_skills', 'list'], ['list_files', 'list'], ['web_search', 'search'], ['web_fetch', 'search']])

function explorationKind(tool: ToolCallRecord) { return EXPLORATION_TOOLS.get(tool.tool) ?? miraCommandExplorationKind(tool) }
export function isMiraExplorationTool(tool: ToolCallRecord) { return Boolean(explorationKind(tool)) }
export function miraExplorationLabel(tool: ToolCallRecord) {
  const kind = explorationKind(tool)
  return kind === 'read' ? '读取' : kind === 'list' ? '查询目录' : kind === 'search' ? '搜索' : undefined
}

type MiraToolPart = Extract<HarnessMessagePart, { type: 'tool' }>
type MiraToolGroup = { kind: 'exploration' | 'commands'; firstId: string; entries: { part: MiraToolPart; tool: ToolCallRecord }[]; live: boolean }
export type MiraAssistantWorkItem =
  | { kind: 'part'; part: HarnessMessagePart; tool?: ToolCallRecord }
  | (MiraToolGroup & { kind: 'exploration' })
  | (MiraToolGroup & { kind: 'commands' })

function groupKind(part: HarnessMessagePart, tool: ToolCallRecord | undefined, permissionPartId?: string): 'exploration' | 'commands' | undefined {
  if (part.type !== 'tool' || !tool || tool.status === 'waiting-confirm' || part.id === permissionPartId) return undefined
  return isMiraExplorationTool(tool) ? 'exploration' : miraCompleteCommand(tool) ? 'commands' : undefined
}

export function miraAssistantWorkItems(message: HarnessMessage, toolsById: ReadonlyMap<string, ToolCallRecord>, streaming = false, permissionPartId?: string): MiraAssistantWorkItem[] {
  const parts = message.parts ?? []
  const items: MiraAssistantWorkItem[] = []
  for (const part of parts) {
    const candidate = part.type === 'tool' ? toolsById.get(part.toolCallId) : undefined
    const tool = candidate && (!message.runId || !candidate.runId || candidate.runId === message.runId) ? candidate : undefined
    const previous = items[items.length - 1]
    const previousTool = previous?.kind === 'part' ? previous.tool : previous?.entries[0]?.tool
    const kind = groupKind(part, tool, permissionPartId)
    const previousKind = previous?.kind === 'part' ? groupKind(previous.part, previous.tool, permissionPartId) : previous?.kind
    if (part.type === 'tool' && tool && kind && kind === previousKind && previousTool?.runId === tool.runId && previousTool?.subtaskId === tool.subtaskId) {
      if (previous.kind !== 'part') previous.entries.push({ part, tool })
      else items[items.length - 1] = { kind, firstId: previous.part.id, entries: [{ part: previous.part as MiraToolPart, tool: previous.tool! }, { part, tool }], live: false }
    } else items.push({ kind: 'part', part, tool })
  }
  // A completed last child does not end an assistant stage that is still streaming.
  const tail = items[items.length - 1]
  if (tail && tail.kind !== 'part') tail.live = streaming
  return items
}

export function miraExplorationSummary(tools: readonly ToolCallRecord[]) {
  const counts = { read: 0, list: 0, search: 0 }
  for (const tool of tools) {
    const kind = explorationKind(tool)
    if (kind) counts[kind]++
  }
  return [counts.search && `${counts.search} 次搜索`, counts.list && `${counts.list} 次目录查询`, counts.read && `${counts.read} 次读取`].filter(Boolean).join('、')
}
