import { Agent, type AgentTool, type BeforeToolCallContext, type BeforeToolCallResult } from '@earendil-works/pi-agent-core'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'
import { randomUUID } from 'node:crypto'
import type { HarnessRunActivity, HarnessSubtask, HarnessSubtaskRole, HarnessSubtaskStatus, HarnessTokenUsage } from '../src/config/harness'

export const MAX_SUBTASKS_PER_RUN = 5
export const MAX_SUBTASK_DURATION_MS = 15 * 60 * 1000
export const MAX_SUBTASK_TURNS = 32
export const MAX_SUBTASK_REPORT_CHARS = 12_000

export const SUBTASK_ROLE_TOOLS: Record<HarnessSubtaskRole, readonly string[]> = {
  explorer: ['list_files', 'read', 'web_fetch', 'web_search'],
  reviewer: ['list_files', 'read'],
  tester: ['list_files', 'read', 'bash'],
  implementer: ['list_files', 'read', 'edit', 'write', 'delete_file', 'bash'],
}

export function subtaskMayMutate(role: HarnessSubtaskRole) {
  return role === 'tester' || role === 'implementer'
}

export function boundedSubtaskReport(value: string) {
  const text = value.trim()
  if (text.length <= MAX_SUBTASK_REPORT_CHARS) return text
  const marker = '\n\n[子任务报告已截断]\n\n'
  const remaining = MAX_SUBTASK_REPORT_CHARS - marker.length
  return `${text.slice(0, Math.ceil(remaining / 2))}${marker}${text.slice(-Math.floor(remaining / 2))}`
}

function assistantText(message: unknown) {
  if (!message || typeof message !== 'object' || (message as { role?: unknown }).role !== 'assistant') return ''
  const content = (message as { content?: unknown }).content
  return Array.isArray(content) ? content
    .filter((part): part is { type: string, text: string } => Boolean(part && typeof part === 'object' && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string'))
    .map(part => part.text).join('') : typeof content === 'string' ? content : ''
}

function usage(value: unknown): HarnessTokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const amount = (key: string) => Math.max(0, Number(source[key]) || 0)
  const input = amount('input'); const output = amount('output'); const cacheRead = amount('cacheRead'); const cacheWrite = amount('cacheWrite')
  const totalTokens = Math.max(amount('totalTokens'), input + output + cacheRead + cacheWrite)
  return totalTokens ? { input, output, cacheRead, cacheWrite, totalTokens } : undefined
}

export type SubtaskRuntimeOptions = {
  parentToolCallId: string
  role: HarnessSubtaskRole
  task: string
  /** Prompt may include ephemeral attachment contents; only task is persisted. */
  prompt?: string
  files?: Array<{ path: string, name: string }>
  systemPrompt: string
  model: Model<any>
  streamFn: StreamFn
  thinkingLevel: string
  tools?: AgentTool[]
  toolsForTask?: (taskId: string) => AgentTool[]
  beforeToolCall?: (context: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined>
  onChanged: (task: HarnessSubtask) => void
  onFinished: (task: HarnessSubtask) => void
  onToolStart?: (taskId: string, name: string, args: unknown) => void
  onToolEnd?: (taskId: string, name: string, args: unknown, isError: boolean) => void
}

type Entry = { task: HarnessSubtask, controller: AbortController, agent?: Agent, opts: SubtaskRuntimeOptions, release?: () => void }

/** Owns child Agent lifecycles for exactly one parent turn. */
export class SubtaskRuntime {
  private readonly entries = new Map<string, Entry>()
  private readonly queue: string[] = []
  private running = 0
  private closed = false

  constructor(private readonly acquireRunLock: (role: HarnessSubtaskRole, signal: AbortSignal) => Promise<() => void>) {}

  list() { return [...this.entries.values()].map(entry => entry.task) }
  active() { return this.list().filter(task => task.status === 'queued' || task.status === 'running' || task.status === 'stopping') }

  create(opts: SubtaskRuntimeOptions) {
    if (this.closed) throw new Error('父任务已结束，不能创建子任务')
    if (this.entries.size >= MAX_SUBTASKS_PER_RUN) throw new Error(`每个父任务最多委派 ${MAX_SUBTASKS_PER_RUN} 个子任务`)
    const id = randomUUID()
    const task: HarnessSubtask = { id, parentToolCallId: opts.parentToolCallId, role: opts.role, task: opts.task.trim(), files: opts.files, status: 'queued', createdAt: Date.now(), activities: [] }
    if (!task.task) throw new Error('子任务说明不能为空')
    this.entries.set(id, { task, controller: new AbortController(), opts })
    opts.onChanged(task)
    this.queue.push(id)
    void this.drain()
    return task
  }

  stop(ids?: string[]) {
    const target = ids?.length ? new Set(ids) : undefined
    for (const entry of this.entries.values()) {
      if (target && !target.has(entry.task.id)) continue
      if (!['queued', 'running', 'stopping'].includes(entry.task.status)) continue
      if (entry.task.status === 'queued') {
        entry.task.status = 'stopped'; entry.task.completedAt = Date.now()
        this.queue.splice(this.queue.indexOf(entry.task.id), 1)
        entry.opts.onChanged(entry.task); entry.opts.onFinished(entry.task)
      } else {
        entry.task.status = 'stopping'; entry.opts.onChanged(entry.task)
        entry.controller.abort(); entry.agent?.abort()
      }
    }
  }

  async wait(ids?: string[]) {
    const wanted = ids?.length ? new Set(ids) : undefined
    while (this.list().some(task => (!wanted || wanted.has(task.id)) && ['queued', 'running', 'stopping'].includes(task.status))) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    return this.list().filter(task => !wanted || wanted.has(task.id))
  }

  async close(status: Extract<HarnessSubtaskStatus, 'stopped' | 'interrupted'> = 'stopped') {
    this.closed = true
    this.stop()
    await this.wait()
    for (const task of this.list()) {
      if (task.status === 'queued' || task.status === 'running' || task.status === 'stopping') {
        task.status = status; task.completedAt = Date.now()
      }
    }
  }

  private async drain() {
    while (!this.closed && this.running < MAX_SUBTASKS_PER_RUN && this.queue.length) {
      const id = this.queue.shift()!
      const entry = this.entries.get(id)
      if (!entry || entry.task.status !== 'queued') continue
      this.running++
      void this.run(entry).finally(() => { this.running--; void this.drain() })
    }
  }

  private async run(entry: Entry) {
    const { task, controller, opts } = entry
    let timer: ReturnType<typeof setTimeout> | undefined
    let turns = 0
    let timedOut = false
    let capped = false
    try {
      entry.release = await this.acquireRunLock(task.role, controller.signal)
      if (controller.signal.aborted) throw new Error('任务已停止')
      task.status = 'running'; task.startedAt = Date.now()
      opts.onChanged(task)
      timer = setTimeout(() => { timedOut = true; controller.abort(); entry.agent?.abort() }, MAX_SUBTASK_DURATION_MS)
      const agent = new Agent({
        initialState: { systemPrompt: opts.systemPrompt, model: opts.model, thinkingLevel: opts.thinkingLevel as any, messages: [], tools: opts.toolsForTask?.(task.id) || opts.tools || [] } as any,
        streamFn: opts.streamFn,
        toolExecution: 'sequential',
        beforeToolCall: opts.beforeToolCall,
        shouldStopAfterTurn: () => {
          if (turns >= MAX_SUBTASK_TURNS) { capped = true; return true }
          return false
        },
      })
      entry.agent = agent
      agent.subscribe((event: any) => {
        if (event.type === 'message_start') turns++
        if (event.type === 'tool_execution_start') {
          task.activities.push({ id: `tool-${event.toolCallId}`, kind: 'tool', label: event.toolName, status: 'running', startedAt: Date.now() })
          opts.onToolStart?.(task.id, event.toolName, event.args)
          opts.onChanged(task)
        }
        if (event.type === 'tool_execution_end') {
          const activity = task.activities.find(value => value.id === `tool-${event.toolCallId}`)
          if (activity) { activity.status = event.isError ? 'failed' : 'completed'; activity.completedAt = Date.now() }
          opts.onToolEnd?.(task.id, event.toolName, event.args, Boolean(event.isError))
          opts.onChanged(task)
        }
      })
      await agent.prompt(opts.prompt || opts.task)
      const message = agent.state.messages.at(-1)
      task.report = boundedSubtaskReport(assistantText(message))
      task.usage = usage((message as { usage?: unknown } | undefined)?.usage)
      if (controller.signal.aborted) task.status = timedOut ? 'timed_out' : 'stopped'
      else if (capped) task.status = 'turn_limit'
      else if (agent.state.errorMessage) { task.status = 'failed'; task.error = { code: 'SUBTASK_AGENT_ERROR', message: agent.state.errorMessage } }
      else if (!task.report) { task.status = 'failed'; task.error = { code: 'SUBTASK_NO_REPORT', message: '子任务结束时没有生成报告' } }
      else task.status = 'completed'
    } catch (error) {
      task.status = timedOut ? 'timed_out' : controller.signal.aborted ? 'stopped' : 'failed'
      if (task.status === 'failed') task.error = { code: 'SUBTASK_ERROR', message: error instanceof Error ? error.message : String(error) }
    } finally {
      if (timer) clearTimeout(timer)
      entry.release?.()
      task.completedAt = Date.now()
      opts.onChanged(task)
      opts.onFinished(task)
    }
  }
}
