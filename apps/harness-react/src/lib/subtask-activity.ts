import type { HarnessRunActivity, HarnessRunUsage, HarnessSession, HarnessSubtask, ToolCallRecord } from '../../../../src/config/harness'

export type MiraRunActivity = {
  runId: string
  startedAt: number
  completedAt?: number
  durationMs?: number
  status: 'running' | 'completed' | 'failed' | 'stopped'
  activities: HarnessRunActivity[]
  subtasks: HarnessSubtask[]
  usage?: HarnessRunUsage
  error?: string
  tools: ToolCallRecord[]
}

export function selectMiraRunActivity(session: HarnessSession | undefined, runId: string): MiraRunActivity | undefined {
  if (!session) return undefined
  const tools = session.toolCalls.filter(tool => !tool.subtaskId && tool.runId === runId)
  if (session.activeRun?.id === runId) {
    const active = session.activeRun
    return { runId, startedAt: active.startedAt, status: 'running', activities: active.activities, subtasks: active.subtasks, tools }
  }
  for (let index = session.messages.length - 1; index >= 0; index--) {
    const message = session.messages[index]
    if (message.role !== 'assistant' || message.runId !== runId || !message.run) continue
    return { ...message.run, runId, status: message.run.status || 'completed', subtasks: message.run.subtasks || [], tools }
  }
  return undefined
}

export function selectMiraSubtask(session: HarnessSession | undefined, runId: string, subtaskId: string): { run: MiraRunActivity; subtask: HarnessSubtask; tools: ToolCallRecord[] } | undefined {
  const run = selectMiraRunActivity(session, runId)
  if (!session || !run) return undefined
  const matches = run.subtasks.filter(task => task.id === subtaskId)
  if (matches.length !== 1) return undefined
  // A legacy child tool has no run ID. Repeated snapshots of one run are one
  // owner, but another run (or an unidentified legacy run) makes it ambiguous.
  const owners = new Set<string | undefined>()
  if (session.activeRun?.subtasks.some(task => task.id === subtaskId)) owners.add(session.activeRun.id)
  for (const message of session.messages) {
    if (message.role === 'assistant' && message.run?.subtasks?.some(task => task.id === subtaskId)) owners.add(message.runId)
  }
  const uniqueOwner = owners.size === 1 && owners.has(runId)
  const tools = session.toolCalls.filter(tool => tool.subtaskId === subtaskId && (tool.runId !== undefined ? tool.runId === runId : uniqueOwner))
  return { run, subtask: matches[0], tools }
}

export function findMiraDelegateSubtask(session: HarnessSession | undefined, runId: string, toolId: string): HarnessSubtask | undefined {
  const run = selectMiraRunActivity(session, runId)
  if (!run) return undefined
  const delegates = run.tools.filter(tool => tool.tool === 'delegate_task')
  if (delegates.filter(tool => tool.id === toolId).length !== 1) return undefined
  const matches = run.subtasks.filter(task => {
    const exact = delegates.filter(tool => tool.id === task.parentToolCallId)
    if (exact.length) return exact.length === 1 && exact[0].id === toolId
    const legacy = delegates.filter(tool => tool.providerCallId === task.parentToolCallId)
    return legacy.length === 1 && legacy[0].id === toolId
  })
  return matches.length === 1 ? matches[0] : undefined
}
