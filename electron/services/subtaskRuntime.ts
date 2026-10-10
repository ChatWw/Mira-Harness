import { Agent, type AgentTool, type BeforeToolCallContext, type BeforeToolCallResult } from '@earendil-works/pi-agent-core'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'
import { randomUUID } from 'node:crypto'
import type { HarnessMessagePart, HarnessRunActivity, HarnessSubtask, HarnessSubtaskRole, HarnessSubtaskStatus, HarnessTokenUsage } from '../../src/config/harness'
import { publicHarnessText, redactHarnessText } from './agentTools'

export const MAX_SUBTASKS_PER_RUN = 5
export const MAX_SUBTASK_DURATION_MS = 15 * 60 * 1000
export const MAX_SUBTASK_TURNS = 32
export const MAX_SUBTASK_REPORT_CHARS = 12_000
const SUBTASK_STREAM_PERSIST_MS = 250

export type SubtaskToolScope = { responseIndex: () => number, callIndex: () => number, onTool: (id: string) => void }
export type SubtaskToolRegistry = {
  tools: AgentTool[]
  prepareTool: (providerId: string, name: string, args: unknown) => string
  settleTool: (providerId: string, name: string, args: unknown, result: unknown, isError: boolean, stopped: boolean) => void
  cancelPending: (reason: string) => void
}

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
  secrets?: string[]
  tools?: AgentTool[]
  toolsForTask?: (taskId: string, scope: SubtaskToolScope) => AgentTool[] | SubtaskToolRegistry
  beforeToolCall?: (context: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined>
  onChanged: (task: HarnessSubtask) => void
  onFinished: (task: HarnessSubtask) => void
  onToolStart?: (taskId: string, name: string, args: unknown) => void
  onToolEnd?: (taskId: string, name: string, args: unknown, isError: boolean) => void
}

type Entry = { task: HarnessSubtask, controller: AbortController, agent?: Agent, opts: SubtaskRuntimeOptions, release?: () => void, cancelTools?: () => void }

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
    const task: HarnessSubtask = { id, parentToolCallId: opts.parentToolCallId, role: opts.role, task: publicHarnessText(opts.task, opts.secrets).text.trim(), files: opts.files, status: 'queued', createdAt: Date.now(), activities: [], parts: [] }
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
        entry.controller.abort(); entry.agent?.abort(); entry.cancelTools?.()
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
    let unsubscribe: (() => void) | undefined
    let activitySerial = 0
    let responseIndex = 0, callIndex = 0, nextCallIndex = 0, partSerial = 0
    let registry: SubtaskToolRegistry | undefined
    let persistTimer: ReturnType<typeof setTimeout> | undefined
    type TextPart = Extract<HarnessMessagePart, { text: string }>
    type Call = { providerCallId: string, name: string, args: unknown, index: number }
    const calls = new Map<number, Call>(), pendingCalls: Call[] = []
    const textParts = new Map<string, { part: TextPart, raw: string }>()
    const partPositions = new Map<HarnessMessagePart, { response: number, content: number }>()
    const usages = new Map<number, HarnessTokenUsage>()
    let openPart: TextPart | undefined
    let currentTool: Call & { activity: HarnessRunActivity } | undefined
    const changed = (streaming = false) => {
      if (streaming) { if (!persistTimer) persistTimer = setTimeout(() => { persistTimer = undefined; opts.onChanged(task) }, SUBTASK_STREAM_PERSIST_MS); return }
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = undefined
      opts.onChanged(task)
    }
    const safeText = (value: string, final = false) => {
      const secrets = (opts.secrets || []).filter(Boolean)
      let text = value
      for (const secret of secrets) text = text.split(secret).join('[已隐藏]')
      let suffix = 0
      for (const secret of secrets) for (let size = Math.min(secret.length - 1, text.length); size > suffix; size--) {
        if (text.endsWith(secret.slice(0, size))) { suffix = size; break }
      }
      return redactHarnessText(suffix ? text.slice(0, -suffix) + (final ? '[已隐藏]' : '') : text, secrets)
    }
    const finishPart = (part = openPart, state: 'complete' | 'interrupted' = 'complete') => {
      if (!part || part.state !== 'streaming') return
      const value = [...textParts.values()].find(value => value.part === part)!
      const safe = safeText(value.raw, true)
      const projected = part.type === 'reasoning' ? publicHarnessText(safe, opts.secrets) : { text: safe, truncated: false }
      part.text = projected.text
      if (projected.truncated) part.truncated = true
      part.state = state; part.completedAt = Date.now()
      if (openPart === part) openPart = undefined
    }
    const insertPart = (part: HarnessMessagePart, contentIndex: number) => {
      partPositions.set(part, { response: responseIndex, content: contentIndex })
      const index = task.parts!.findIndex(existing => {
        const position = partPositions.get(existing)!
        return position.response > responseIndex || position.response === responseIndex && position.content > contentIndex
      })
      task.parts!.splice(index < 0 ? task.parts!.length : index, 0, part)
    }
    const appendText = (type: 'text' | 'reasoning', contentIndex: number, text: string, complete = false) => {
      const key = `${responseIndex}:${contentIndex}`
      let value = textParts.get(key)
      if (!value) {
        finishPart()
        const part: TextPart = { id: `${task.id}:part-${partSerial++}`, type, text: '', state: 'streaming', startedAt: Date.now() }
        value = { part, raw: '' }; textParts.set(key, value); insertPart(part, contentIndex); openPart = part
      }
      value.raw = complete ? text : value.raw + text
      const safe = safeText(value.raw, complete || value.part.state !== 'streaming')
      const projected = type === 'reasoning' ? publicHarnessText(safe, opts.secrets) : { text: safe, truncated: false }
      value.part.text = projected.text
      if (projected.truncated) value.part.truncated = true
      if (complete) finishPart(value.part)
    }
    const appendTool = (id: string) => {
      finishPart()
      if (!task.parts!.some(part => part.type === 'tool' && part.toolCallId === id)) {
        const contentIndex = [...calls].find(([, call]) => call.index === callIndex)?.[0] ?? Number.MAX_SAFE_INTEGER
        insertPart({ id: `${task.id}:part-${partSerial++}`, type: 'tool', toolCallId: id }, contentIndex)
      }
      changed()
    }
    const declareTool = (contentIndex: number, providerCallId: string, name: string, args: unknown) => {
      let call = calls.get(contentIndex)
      if (!call) { call = { providerCallId, name, args, index: nextCallIndex++ }; calls.set(contentIndex, call); pendingCalls.push(call) }
      callIndex = call.index
      registry?.prepareTool(providerCallId, name, args)
      return call
    }
    const reconcile = (message: any) => {
      if (message?.role !== 'assistant') return
      const tokens = usage(message.usage)
      if (tokens) usages.set(responseIndex, tokens)
      const content = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
      if (!Array.isArray(content)) return
      content.forEach((block, index) => {
        if (block?.type === 'text' && typeof block.text === 'string') appendText('text', index, block.text, true)
        if (block?.type === 'thinking' && typeof block.thinking === 'string') appendText('reasoning', index, block.thinking, true)
        if (block?.type === 'toolCall' && block.id && block.name) declareTool(index, block.id, block.name, block.arguments)
      })
      finishPart(); changed()
    }
    try {
      entry.release = await this.acquireRunLock(task.role, controller.signal)
      if (controller.signal.aborted) throw new Error('任务已停止')
      task.status = 'running'; task.startedAt = Date.now()
      opts.onChanged(task)
      timer = setTimeout(() => { timedOut = true; controller.abort(); entry.agent?.abort() }, MAX_SUBTASK_DURATION_MS)
      const registered = opts.toolsForTask?.(task.id, { responseIndex: () => responseIndex, callIndex: () => callIndex, onTool: appendTool }) || opts.tools || []
      if (!Array.isArray(registered)) registry = registered
      entry.cancelTools = () => registry?.cancelPending('子任务已停止')
      const agent = new Agent({
        initialState: { systemPrompt: opts.systemPrompt, model: opts.model, thinkingLevel: opts.thinkingLevel as any, messages: [], tools: Array.isArray(registered) ? registered : registered.tools } as any,
        streamFn: opts.streamFn,
        toolExecution: 'sequential',
        beforeToolCall: opts.beforeToolCall,
        shouldStopAfterTurn: () => {
          if (turns >= MAX_SUBTASK_TURNS) { capped = true; return true }
          return false
        },
      })
      entry.agent = agent
      unsubscribe = agent.subscribe((event: any) => {
        if (controller.signal.aborted || task.status !== 'running') return
        if (event.type === 'message_start' && event.message?.role === 'assistant') {
          finishPart(); responseIndex++; turns++; callIndex = 0; nextCallIndex = 0; calls.clear(); pendingCalls.length = 0
        }
        if (event.type === 'message_update') {
          const update = event.assistantMessageEvent, index = update?.contentIndex ?? 0
          if (update?.type === 'text_delta' || update?.type === 'thinking_delta') { appendText(update.type === 'text_delta' ? 'text' : 'reasoning', index, update.delta); changed(true) }
          if (update?.type === 'text_end' || update?.type === 'thinking_end') {
            if (typeof update.content === 'string') appendText(update.type === 'text_end' ? 'text' : 'reasoning', index, update.content, true)
            else finishPart(textParts.get(`${responseIndex}:${index}`)?.part)
            changed()
          }
          if (update?.type === 'toolcall_end' && update.toolCall?.id && update.toolCall?.name) declareTool(index, update.toolCall.id, update.toolCall.name, update.toolCall.arguments)
        }
        if (event.type === 'message_end') reconcile(event.message)
        if (event.type === 'tool_execution_start') {
          const declared = pendingCalls[0]
          const call = declared?.providerCallId === event.toolCallId && declared.name === event.toolName ? pendingCalls.shift()! : { providerCallId: event.toolCallId, name: event.toolName, args: event.args, index: nextCallIndex++ }
          callIndex = call.index
          registry?.prepareTool(call.providerCallId, call.name, event.args)
          const activity: HarnessRunActivity = { id: `${task.id}:activity-${activitySerial++}`, kind: 'tool', label: event.toolName, status: 'running', startedAt: Date.now() }
          currentTool = { ...call, args: event.args, activity }
          task.activities.push(activity)
          opts.onToolStart?.(task.id, event.toolName, event.args)
          opts.onChanged(task)
        }
        if (event.type === 'tool_execution_end') {
          if (!currentTool || currentTool.providerCallId !== event.toolCallId || currentTool.activity.label !== event.toolName) return
          const { activity, args, index } = currentTool
          callIndex = index
          registry?.settleTool(event.toolCallId, event.toolName, args, event.result, Boolean(event.isError), false)
          currentTool = undefined
          activity.status = event.isError ? 'failed' : 'completed'; activity.completedAt = Date.now()
          opts.onToolEnd?.(task.id, event.toolName, args, Boolean(event.isError))
          opts.onChanged(task)
        }
      })
      await agent.prompt(opts.prompt || opts.task)
      const message = agent.state.messages.at(-1)
      if (!controller.signal.aborted) reconcile(message)
      task.report = controller.signal.aborted ? undefined : publicHarnessText(boundedSubtaskReport(safeText(assistantText(message), true)), opts.secrets).text
      if (usages.size) task.usage = [...usages.values()].reduce((total, item) => ({ input: total.input + item.input, output: total.output + item.output, cacheRead: total.cacheRead + item.cacheRead, cacheWrite: total.cacheWrite + item.cacheWrite, totalTokens: total.totalTokens + item.totalTokens }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 })
      if (controller.signal.aborted) task.status = timedOut ? 'timed_out' : 'stopped'
      else if (capped) task.status = 'turn_limit'
      else if (agent.state.errorMessage) { task.status = 'failed'; task.error = { code: 'SUBTASK_AGENT_ERROR', message: publicHarnessText(agent.state.errorMessage, opts.secrets).text } }
      else if (!task.report) { task.status = 'failed'; task.error = { code: 'SUBTASK_NO_REPORT', message: '子任务结束时没有生成报告' } }
      else task.status = 'completed'
    } catch (error) {
      task.status = timedOut ? 'timed_out' : controller.signal.aborted ? 'stopped' : 'failed'
      if (task.status === 'failed') task.error = { code: 'SUBTASK_ERROR', message: publicHarnessText(error instanceof Error ? error.message : String(error), opts.secrets).text }
    } finally {
      unsubscribe?.()
      if (timer) clearTimeout(timer)
      entry.release?.()
      task.completedAt = Date.now()
      if (currentTool) { currentTool.activity.status = 'failed'; currentTool.activity.completedAt = task.completedAt }
      for (const value of textParts.values()) finishPart(value.part, task.status === 'completed' ? 'complete' : 'interrupted')
      registry?.cancelPending(task.status === 'completed' ? '子任务已结束' : '子任务已停止或中断')
      changed()
      opts.onFinished(task)
    }
  }
}
