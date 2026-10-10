import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { HarnessSubtaskCoordinator } from '../electron/services/harnessSubtaskCoordinator'
import type { HarnessEvent, HarnessSubtask } from '../src/config/harness'

const resources: Array<{ home: string, database: PlatformDatabase }> = []
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); for (const item of resources.splice(0)) { item.database.close(); rmSync(item.home, { recursive: true, force: true }) } })
const secret = 'platform-private-key'
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
const model: any = { id: 'controlled', api: 'openai-completions', provider: 'fixture', name: 'Controlled', baseUrl: 'http://127.0.0.1:1', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }
const read = (path: string) => ({ type: 'toolCall', id: 'reused-provider', name: 'read', arguments: { path } })
const text = (text: string) => ({ type: 'text', text })
function response(content: any[], deltas: boolean | 'tool-only' = true) {
  const stream = createAssistantMessageEventStream()
  const message: any = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [], usage, stopReason: content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop', timestamp: Date.now() }
  stream.push({ type: 'start', partial: message })
  content.forEach((block, contentIndex) => {
    if (deltas === true && (block.type === 'text' || block.type === 'thinking')) {
      const thinking = block.type === 'thinking', key = thinking ? 'thinking' : 'text'
      const partial = { type: block.type, [key]: '', ...(thinking ? { thinkingSignature: 'private-provider-signature' } : {}) }
      message.content.push(partial)
      stream.push({ type: thinking ? 'thinking_start' : 'text_start', contentIndex, partial: message } as any)
      for (const delta of block.chunks || [block[key]]) { partial[key] += delta; stream.push({ type: thinking ? 'thinking_delta' : 'text_delta', contentIndex, delta, partial: message } as any) }
      stream.push({ type: thinking ? 'thinking_end' : 'text_end', contentIndex, content: partial[key], partial: message } as any)
    } else {
      message.content.push(block)
      if (deltas && block.type === 'toolCall') stream.push({ type: 'toolcall_end', contentIndex, toolCall: block, partial: message } as any)
    }
  })
  stream.push({ type: 'done', reason: message.stopReason, message }); stream.end()
  return stream
}
function setup(streamFn: any, preflight?: (name: string, args: any) => Promise<any>) {
  const home = mkdtempSync(join(tmpdir(), 'mira-child-conversation-')), database = new PlatformDatabase(home)
  resources.push({ home, database })
  const directory = join(home, 'project'); mkdirSync(directory)
  writeFileSync(join(directory, 'a.txt'), 'Actual A local read\n')
  writeFileSync(join(directory, 'b.txt'), 'Actual B local read\n')
  writeFileSync(join(directory, 'secret.txt'), `Actual file ${secret}\n`)
  const project = database.harness.createProject(directory, 'Controlled actual tools')
  const session = database.harness.createSession(project.id), runId = 'parent-run'
  database.harness.addMessage(session.id, 'user', 'Parent public request')
  database.harness.setActiveRun(session.id, { id: runId, startedAt: 1, activities: [], subtasks: [] })
  const events: HarnessEvent[] = [], runtime = new HarnessRuntime(database, { getTools: () => [] } as any, event => events.push(structuredClone(event)))
  const publish = vi.fn(() => {
    const state = database.harness.getSession(session.id)
    if (state.activeRun?.id !== runId) return
    const subtasks = created.runtime.list()
    database.harness.setActiveRun(session.id, { ...state.activeRun, subtasks })
    events.push(structuredClone({ sessionId: session.id, runId, type: 'run-activity', payload: { subtasks } }))
  })
  const created = new HarnessSubtaskCoordinator(database).create({ sender: undefined, sessionId: session.id, session: database.harness.getSession(session.id), model, streamFn, thinkingLevel: 'high', pricing: undefined, secrets: [secret], publishActivities: publish,
    toolsForTask: (role, subtaskId, scope) => (runtime as any).tools(undefined, session.id, { role, subtaskId, runId, toolScope: scope.responseIndex, toolCallIndex: scope.callIndex, onTool: scope.onTool, secrets: [secret] }),
    preflightToolCall: preflight || ((name, args) => (runtime as any).preflightSubtaskToolCall(name, args)), getParentAgent: () => undefined,
  })
  const child = async (task: string, files?: string[], role: 'reviewer' | 'tester' = 'reviewer') => {
    const result: any = await created.tools.find(tool => tool.name === 'delegate_task')!.execute('parent-delegate', { role, task, files })
    return created.runtime.list().find(task => task.id === result.details.id)!
  }
  return { home, directory, database, runtime, sessionId: session.id, runId, events, publish, child, children: created.runtime, session: () => database.harness.getSession(session.id) }
}

describe('real child Agent public conversation', () => {
  it('projects real thinking/text/tools in order with canonical identities for repeated calls, children and responses', async () => {
    const turns = new Map<string, number>(), actualResults: any[] = []
    const fixture = setup((_model: any, context: any) => {
      const key = context.messages[0].content[0].text.startsWith('A') ? 'A' : 'B', ordinal = turns.get(key) || 0
      turns.set(key, ordinal + 1)
      actualResults.push({ key, ordinal, outputs: context.messages.filter((message: any) => message.role === 'toolResult').map((message: any) => message.content.map((block: any) => block.text).join('')) })
      if (ordinal === 0) return response([{ type: 'thinking', thinking: `Reason ${secret}`, chunks: ['Reason platform-', 'private-', 'key'] }, text('Before '), read(key === 'A' ? 'a.txt' : 'b.txt'), text('Between '), read('secret.txt')])
      if (ordinal === 1) return response([text('Next '), read(key === 'A' ? 'a.txt' : 'b.txt')], false)
      return response([text(`Final ${key}`)], false)
    })
    const a = await fixture.child('A public task', ['secret.txt']), b = await fixture.child('B public task')
    await fixture.children.wait()
    expect([a.status, b.status]).toEqual(['completed', 'completed'])
    for (const child of [a, b]) {
      expect(child.parts?.map(part => part.type)).toEqual(['reasoning', 'text', 'tool', 'text', 'tool', 'text', 'tool', 'text'])
      const parts = child.parts!.filter(part => part.type !== 'tool')
      expect(parts.map(part => part.text)).toEqual(['Reason [已隐藏]', 'Before ', 'Between ', 'Next ', child === a ? 'Final A' : 'Final B'])
      expect(parts.every(part => part.state === 'complete')).toBe(true)
      const records = fixture.session().toolCalls.filter(tool => tool.subtaskId === child.id)
      expect(records).toHaveLength(3)
      expect(records.every(tool => tool.runId === fixture.runId && tool.providerCallId === 'reused-provider' && tool.status === 'ok' && tool.input && tool.output)).toBe(true)
      expect(records.map(tool => tool.id)).toEqual([`${fixture.runId}:child-${child.id}:response-1:call-0:reused-provider`, `${fixture.runId}:child-${child.id}:response-1:call-1:reused-provider`, `${fixture.runId}:child-${child.id}:response-2:call-0:reused-provider`])
      expect(child.parts!.filter(part => part.type === 'tool').map(part => part.toolCallId)).toEqual(records.map(tool => tool.id))
      expect(records[0].output?.text).toBe(readFileSync(join(fixture.directory, child === a ? 'a.txt' : 'b.txt'), 'utf8'))
      expect(records[1].output?.text).toBe('Actual file [已隐藏]\n')
      expect(child.report).toBe(child === a ? 'Final A' : 'Final B')
      expect(child.usage).toMatchObject({ input: 3, output: 3, totalTokens: 6 })
    }
    expect(new Set(fixture.session().toolCalls.map(tool => tool.id)).size).toBe(6)
    for (const key of ['A', 'B']) expect(actualResults.find(call => call.key === key && call.ordinal === 1).outputs).toEqual([readFileSync(join(fixture.directory, key === 'A' ? 'a.txt' : 'b.txt'), 'utf8'), readFileSync(join(fixture.directory, 'secret.txt'), 'utf8')])
    const publicData = JSON.stringify([fixture.session(), fixture.events])
    expect(publicData).not.toContain(secret); expect(publicData).not.toContain('private-provider-signature'); expect(publicData).not.toContain('已附带文件')
    const reopened = new PlatformDatabase(fixture.home)
    try { expect(reopened.harness.getSession(fixture.sessionId)).toEqual(fixture.session()) } finally { reopened.close() }
  })

  it('settles rejected preflight calls without execution and keeps delta-free final text', async () => {
    let ordinal = 0
    const fixture = setup(() => ordinal++ === 0 ? response([text('Before rejection'), read('a.txt')], false) : response([text('Final without deltas')], false), async () => ({ block: true, reason: `Denied ${secret}` }))
    const child = await fixture.child('Denied task'); await fixture.children.wait()
    expect(child.parts?.map(part => part.type)).toEqual(['text', 'tool', 'text'])
    expect(fixture.session().toolCalls).toEqual([expect.objectContaining({ status: 'failed', subtaskId: child.id, runId: fixture.runId, input: { text: expect.stringContaining('a.txt'), truncated: false }, output: { text: 'Denied [已隐藏]', truncated: false } })])
    expect(child.report).toBe('Final without deltas')
  })

  it('keeps content order when tool events arrive before delta-free surrounding text', async () => {
    let ordinal = 0, actualResults: string[] = []
    const fixture = setup((_model: any, context: any) => {
      if (ordinal++ === 0) return response([{ type: 'thinking', thinking: `Reason ${secret}` }, text('Before '), read('a.txt'), text('Between '), read('b.txt'), text('After ')], 'tool-only')
      actualResults = context.messages.filter((message: any) => message.role === 'toolResult').map((message: any) => message.content.map((block: any) => block.text).join(''))
      return response([text('Final')], false)
    })
    const child = await fixture.child('Mixed streaming task'); await fixture.children.wait()
    expect(child.status).toBe('completed')
    const ordered = ['Reason [已隐藏]', 'Before ', 'tool', 'Between ', 'tool', 'After ']
    const content = (task: HarnessSubtask) => task.parts?.map(part => part.type === 'tool' ? 'tool' : part.text)
    expect(content(child)).toEqual([...ordered, 'Final'])
    expect(actualResults).toEqual([readFileSync(join(fixture.directory, 'a.txt'), 'utf8'), readFileSync(join(fixture.directory, 'b.txt'), 'utf8')])
    const records = fixture.session().toolCalls.filter(tool => tool.subtaskId === child.id)
    expect(records.map(tool => tool.id)).toEqual([`${fixture.runId}:child-${child.id}:response-1:call-0:reused-provider`, `${fixture.runId}:child-${child.id}:response-1:call-1:reused-provider`])
    const reconciled = fixture.events.filter(event => event.type === 'run-activity').flatMap(event => event.payload.subtasks || []).filter(task => task.id === child.id && task.parts?.some(part => part.type === 'text' && part.text === 'After '))
    expect(reconciled.length).toBeGreaterThan(0)
    for (const task of reconciled) expect(content(task)?.slice(0, ordered.length)).toEqual(ordered)
    const reopened = new PlatformDatabase(fixture.home)
    try { expect(content(reopened.harness.getSession(fixture.sessionId).activeRun!.subtasks[0])).toEqual([...ordered, 'Final']) } finally { reopened.close() }
  })

  it('coalesces live deltas, withholds split secrets and preserves interrupted parts after stop and reload', async () => {
    let release!: () => void, signal!: AbortSignal
    const gate = new Promise<void>(done => { release = done })
    const stream = createAssistantMessageEventStream()
    const message: any = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [{ type: 'text', text: '' }], usage, stopReason: 'stop', timestamp: Date.now() }
    const fixture = setup((_model: any, _context: any, options: any) => {
      signal = options.signal
      stream.push({ type: 'start', partial: message })
      for (const delta of [...Array(120).fill('word '), 'platform-', 'private-']) { message.content[0].text += delta; stream.push({ type: 'text_delta', contentIndex: 0, delta, partial: message }) }
      void gate.then(() => { stream.push({ type: 'text_delta', contentIndex: 0, delta: 'key LATE', partial: message }); stream.push({ type: 'error', reason: 'aborted', error: { ...message, stopReason: 'aborted' } }); stream.end() })
      return stream
    })
    const writes = vi.spyOn(fixture.database.harness, 'setActiveRun')
    const child = await fixture.child('Live task')
    await vi.waitFor(() => expect(child.parts?.[0]).toMatchObject({ text: 'word '.repeat(120) }))
    const before = writes.mock.calls.length
    await new Promise(done => setTimeout(done, 300))
    expect(writes.mock.calls.length - before).toBeLessThanOrEqual(1)
    expect(writes.mock.calls.length).toBeLessThan(8)
    expect(JSON.stringify(fixture.events)).not.toContain('platform-private-')
    expect(fixture.session().activeRun?.subtasks[0].parts?.[0]).toMatchObject({ state: 'streaming', text: 'word '.repeat(120) })
    fixture.children.stop([child.id]); expect(signal.aborted).toBe(true)
    release(); await fixture.children.wait()
    expect(child.status).toBe('stopped')
    expect(child.parts?.[0]).toMatchObject({ state: 'interrupted', text: `${'word '.repeat(120)}[已隐藏]` })
    expect(child.report).toBeUndefined()
    expect(JSON.stringify([fixture.events, fixture.session()])).not.toContain('LATE')
    expect(fixture.session().activeRun?.subtasks[0]).toEqual(child)
  })

  it('freezes a cancelled tool at its last safe progress and ignores late success and callbacks', async () => {
    let ordinal = 0
    const fixture = setup(() => ordinal++ === 0 ? response([{ type: 'toolCall', id: 'slow-local', name: 'bash', arguments: { command: "printf 'recorded platform-'; sleep 2; printf 'private-key LATE'" } }], false) : response([text('After local command')], false))
    const child = await fixture.child('Cancel local command', undefined, 'tester')
    try { await vi.waitFor(() => expect(fixture.session().toolCalls.find(tool => tool.subtaskId === child.id)).toMatchObject({ status: 'running', output: { text: 'recorded ' } }), { timeout: 1500 }) }
    finally { fixture.children.stop([child.id]); await fixture.children.wait() }
    expect(fixture.session().toolCalls.find(tool => tool.subtaskId === child.id)?.status).toBe('cancelled')
    await fixture.children.wait()
    expect(child.status).toBe('stopped')
    expect(fixture.session().toolCalls.find(tool => tool.subtaskId === child.id)).toMatchObject({ status: 'cancelled', output: { text: 'recorded ' } })
    expect(JSON.stringify(fixture.events.filter(event => event.payload.output))).not.toContain('LATE')
    expect(JSON.stringify(fixture.events.filter(event => event.payload.output))).not.toContain('platform-')
  })
})
