import { Agent } from '@earendil-works/pi-agent-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectTaskLock } from '../electron/services/projectTaskLock'
import { MAX_SUBTASK_DURATION_MS, MAX_SUBTASK_REPORT_CHARS, SUBTASK_ROLE_TOOLS, SubtaskRuntime, boundedSubtaskReport, subtaskMayMutate } from '../electron/services/subtaskRuntime'
import type { SubtaskRuntimeOptions } from '../electron/services/subtaskRuntime'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

function activityFixture() {
  const listeners = new WeakMap<Agent, (event: any) => void>()
  const captured: Array<(event: any) => void> = []
  const unsubscribe = vi.fn()
  vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(function (this: Agent, listener) {
    const notify = (event: any) => { void listener(event, new AbortController().signal) }
    listeners.set(this, notify); captured.push(notify)
    return () => { listeners.delete(this); unsubscribe() }
  })
  const runtime = new SubtaskRuntime(async () => () => {})
  const changed = vi.fn(), finished = vi.fn(), started = vi.fn(), ended = vi.fn()
  const create = (overrides: Partial<SubtaskRuntimeOptions> = {}) => runtime.create({ parentToolCallId: 'public-parent', role: 'reviewer', task: '检查', systemPrompt: '', model: {} as any, streamFn: vi.fn() as any, thinkingLevel: 'off', onChanged: changed, onFinished: finished, onToolStart: started, onToolEnd: ended, ...overrides })
  const emit = (agent: Agent, event: any) => listeners.get(agent)!(event)
  const report = (agent: Agent) => agent.state.messages.push({ role: 'assistant', content: [{ type: 'text', text: '检查完成' }], timestamp: Date.now() } as any)
  return { runtime, create, emit, report, captured, unsubscribe, changed, finished, started, ended }
}

describe('subtask runtime policy', () => {
  it('cancels a child waiting for the project lock without restarting it after release', async () => {
    const lock = new ProjectTaskLock(), release = await lock.acquire('project', 'write')
    const runtime = new SubtaskRuntime((_role, signal) => lock.acquire('project', 'read', signal))
    const finished = vi.fn(), states: string[] = [], changed = vi.fn(record => states.push(record.status))
    const prompt = vi.spyOn(Agent.prototype, 'prompt').mockResolvedValue(undefined)
    const task = runtime.create({ parentToolCallId: 'parent', role: 'reviewer', task: '等待项目锁', systemPrompt: '', model: {} as any, streamFn: vi.fn() as any, thinkingLevel: 'off', onChanged: changed, onFinished: finished })
    expect(task.status).toBe('queued')
    try {
      runtime.stop([task.id])
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(task.status).toBe('stopped')
      expect(finished).toHaveBeenCalledOnce()
      release()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(prompt).not.toHaveBeenCalled()
      expect(task.startedAt).toBeUndefined()
      expect(task.status).toBe('stopped')
      expect(finished).toHaveBeenCalledOnce()
      expect(states).not.toContain('running')
    } finally { release(); await runtime.close() }
  })

  it('removes a cancelled waiting writer so newer readers can proceed without waiting for the current reader', async () => {
    const lock = new ProjectTaskLock(), release = await lock.acquire('project', 'read')
    const abort = new AbortController()
    const writer = lock.acquire('project', 'write', abort.signal)
    const rejected = expect(writer).rejects.toThrow('任务已停止')
    let readerRelease: (() => void) | undefined
    const reader = lock.acquire('project', 'read').then(value => { readerRelease = value })
    try {
      abort.abort(); await rejected
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(readerRelease).toBeTypeOf('function')
    } finally { release(); await reader; readerRelease?.() }
  })

  it('keeps every role inside its fixed tool allowlist', () => {
    expect(SUBTASK_ROLE_TOOLS.explorer).toEqual(['list_files', 'read', 'web_fetch', 'web_search'])
    expect(SUBTASK_ROLE_TOOLS.reviewer).toEqual(['list_files', 'read'])
    expect(SUBTASK_ROLE_TOOLS.tester).toEqual(['list_files', 'read', 'bash'])
    expect(SUBTASK_ROLE_TOOLS.implementer).toEqual(['list_files', 'read', 'edit', 'write', 'delete_file', 'bash'])
    expect(Object.values(SUBTASK_ROLE_TOOLS).flat()).not.toContain('delegate_task')
    expect(Object.values(SUBTASK_ROLE_TOOLS).flat()).not.toContain('mcp_query')
    expect(subtaskMayMutate('explorer')).toBe(false)
    expect(subtaskMayMutate('reviewer')).toBe(false)
    expect(subtaskMayMutate('tester')).toBe(true)
    expect(subtaskMayMutate('implementer')).toBe(true)
  })

  it('bounds a long final report without losing its ending', () => {
    const value = `head-${'x'.repeat(MAX_SUBTASK_REPORT_CHARS * 2)}-tail`
    const report = boundedSubtaskReport(value)
    expect(report.length).toBeLessThanOrEqual(MAX_SUBTASK_REPORT_CHARS)
    expect(report).toContain('[子任务报告已截断]')
    expect(report.startsWith('head-')).toBe(true)
    expect(report.endsWith('-tail')).toBe(true)
  })

  it('allows concurrent readers but keeps a waiting writer ahead of newer readers', async () => {
    const lock = new ProjectTaskLock()
    const order: string[] = []
    const readOne = await lock.acquire('project', 'read')
    const readTwo = await lock.acquire('project', 'read')
    const writer = lock.acquire('project', 'write').then(release => { order.push('writer'); return release })
    const laterReader = lock.acquire('project', 'read').then(release => { order.push('reader'); return release })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(order).toEqual([])
    readOne(); readTwo()
    const releaseWriter = await writer
    expect(order).toEqual(['writer'])
    releaseWriter()
    const releaseReader = await laterReader
    expect(order).toEqual(['writer', 'reader'])
    releaseReader()
  })
})

describe('subtask activity invocation identity', () => {
  it('keeps repeated provider calls across responses and child agents independent', async () => {
    const fixture = activityFixture()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: Agent) {
      fixture.emit(this, { type: 'message_start', message: { role: 'assistant' } })
      fixture.emit(this, { type: 'tool_execution_start', toolCallId: 'same-provider', toolName: 'read', args: { path: 'first.txt' } })
      fixture.emit(this, { type: 'tool_execution_end', toolCallId: 'same-provider', toolName: 'read', args: { path: 'first.txt' }, isError: false })
      fixture.emit(this, { type: 'message_start', message: { role: 'assistant' } })
      fixture.emit(this, { type: 'tool_execution_start', toolCallId: 'same-provider', toolName: 'read', args: { path: 'second.txt' } })
      fixture.emit(this, { type: 'tool_execution_end', toolCallId: 'same-provider', toolName: 'read', args: { path: 'second.txt' }, isError: true })
      fixture.report(this)
    })
    const first = fixture.create(), second = fixture.create({ parentToolCallId: 'other-public-parent' })
    await fixture.runtime.wait()
    expect([first.status, second.status]).toEqual(['completed', 'completed'])
    for (const task of [first, second]) {
      expect(task.activities.map(activity => activity.status)).toEqual(['completed', 'failed'])
      expect(task.activities.every(activity => activity.completedAt !== undefined)).toBe(true)
      expect(task.activities.map(activity => activity.label)).toEqual(['read', 'read'])
    }
    expect(new Set([...first.activities, ...second.activities].map(activity => activity.id)).size).toBe(4)
    expect(first.activities[0].id).not.toBe('tool-same-provider')
    expect(fixture.started.mock.calls.map(call => call.slice(1))).toEqual([
      ['read', { path: 'first.txt' }], ['read', { path: 'second.txt' }],
      ['read', { path: 'first.txt' }], ['read', { path: 'second.txt' }],
    ])
    expect(fixture.ended).toHaveBeenCalledTimes(4)
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('settles the current record and ignores unmatched or duplicate end events', async () => {
    const fixture = activityFixture()
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: Agent) {
      fixture.emit(this, { type: 'tool_execution_start', toolCallId: 'first', toolName: 'read', args: {} })
      fixture.emit(this, { type: 'tool_execution_end', toolCallId: 'first', toolName: 'read', args: {}, isError: false })
      fixture.emit(this, { type: 'tool_execution_start', toolCallId: 'second', toolName: 'read', args: {} })
      fixture.emit(this, { type: 'tool_execution_end', toolCallId: 'first', toolName: 'read', args: {}, isError: true })
      fixture.emit(this, { type: 'tool_execution_end', toolCallId: 'second', toolName: 'write', args: {}, isError: true })
      fixture.emit(this, { type: 'tool_execution_end', toolCallId: 'second', toolName: 'read', args: {}, isError: false })
      fixture.emit(this, { type: 'tool_execution_end', toolCallId: 'second', toolName: 'read', args: {}, isError: true })
      fixture.report(this)
    })
    const task = fixture.create()
    await fixture.runtime.wait()
    expect(task.activities.map(activity => activity.status)).toEqual(['completed', 'completed'])
    expect(fixture.ended).toHaveBeenCalledTimes(2)
  })

  it('does not revive cancelled work from a late success or a retained event listener', async () => {
    const fixture = activityFixture()
    let release!: () => void, agent!: Agent
    const pending = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: Agent) {
      agent = this
      fixture.emit(this, { type: 'tool_execution_start', toolCallId: 'call', toolName: 'read', args: {} })
      await pending
      fixture.report(this)
    })
    const task = fixture.create()
    await vi.waitFor(() => expect(task.activities).toHaveLength(1))
    fixture.runtime.stop([task.id])
    fixture.emit(agent, { type: 'tool_execution_end', toolCallId: 'call', toolName: 'read', args: {}, isError: false })
    release(); await fixture.runtime.wait()
    expect(task.status).toBe('stopped')
    expect(task.activities[0]).toMatchObject({ status: 'stopped', completedAt: task.completedAt })
    const snapshot = structuredClone(task), calls = fixture.changed.mock.calls.length
    fixture.captured[0]({ type: 'tool_execution_start', toolCallId: 'call', toolName: 'read', args: {} })
    fixture.captured[0]({ type: 'tool_execution_end', toolCallId: 'call', toolName: 'read', args: {}, isError: false })
    expect(task).toEqual(snapshot)
    expect(fixture.changed).toHaveBeenCalledTimes(calls)
    expect(fixture.ended).not.toHaveBeenCalled()
    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
    expect(fixture.finished).toHaveBeenCalledOnce()
  })

  it.each(['timeout', 'error'] as const)('keeps an unfinished tool failed after a child %s', async reason => {
    vi.useFakeTimers()
    const fixture = activityFixture()
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: Agent) {
      fixture.emit(this, { type: 'tool_execution_start', toolCallId: 'call', toolName: 'read', args: {} })
      await pending
      if (reason === 'error') throw new Error('Child runtime failed')
      fixture.report(this)
    })
    const task = fixture.create()
    await vi.advanceTimersByTimeAsync(0)
    expect(task.activities).toHaveLength(1)
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(MAX_SUBTASK_DURATION_MS)
    release(); await vi.advanceTimersByTimeAsync(0)
    expect(task.status).toBe(reason === 'timeout' ? 'timed_out' : 'failed')
    expect(task.activities[0]).toMatchObject({ status: 'failed', completedAt: task.completedAt })
    expect(fixture.finished).toHaveBeenCalledOnce()
    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
  })
})
