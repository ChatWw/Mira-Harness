import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage, AgentTool, StreamFn } from '@earendil-works/pi-agent-core'
import { createAssistantMessageEventStream, Type, type AssistantMessage, type Context, type Model } from '@earendil-works/pi-ai'
import { InMemoryJournalStore, MiraFlowEngine, validate, type ActorSessionSeed, type AskSpec, type InstanceRef, type JsonSchema, type MiraFlowReportSink, type SubmitVerdict } from '../packages/mira-flow-kit/src/mira-index'
import { MiraFlowActorDriver, miraFlowActorSessionId, type MiraFlowActorContext, type MiraFlowActorDriverOptions, type MiraFlowActorTools } from '../electron/services/flows/miraFlowActorDriver'

type Step = { text?: string; calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>; wait?: Promise<void>; error?: string }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
const model: Model<'openai-completions'> = { id: 'fixture', name: 'Fixture', api: 'openai-completions', provider: 'fixture', baseUrl: 'http://127.0.0.1:1', reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
const actor = { siteId: 'actor#1', ordinal: 1 }
const instance = (ordinal = 1): InstanceRef => ({ siteId: 'ask#1', ordinal })
const submit = (result: unknown, id = 'submit') => ({ id, name: 'submit_result', arguments: { result } })
const drivers: MiraFlowActorDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) { driver.dispose(); await driver.waitForIdle().catch(() => {}) } })

function setup(steps: Step[] = [{ text: 'answer' }], extra: Partial<MiraFlowActorDriverOptions> = {}) {
  const contexts: Context[] = [], states = new Map<string, MiraFlowActorContext>(), order: string[] = []
  const streamFn: StreamFn = (_model, context, options) => {
    const step = steps[contexts.length] ?? { text: 'fallback' }
    contexts.push({ systemPrompt: context.systemPrompt, messages: structuredClone(context.messages), tools: context.tools?.map(tool => ({ name: tool.name, description: tool.description, parameters: structuredClone(tool.parameters) })) })
    const stream = createAssistantMessageEventStream()
    const message: AssistantMessage = { role: 'assistant', content: [{ type: 'text', text: step.text ?? '' }, ...(step.calls ?? []).map(call => ({ type: 'toolCall' as const, ...call }))],
      api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(), stopReason: step.calls?.length ? 'toolUse' : 'stop',
      usage: { input: 8, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
    void (async () => {
      await Promise.resolve()
      stream.push({ type: 'start', partial: message })
      if (step.wait) await Promise.race([step.wait, new Promise<void>(resolve => { if (options?.signal?.aborted) resolve(); else options?.signal?.addEventListener('abort', () => resolve(), { once: true }) })])
      if (options?.signal?.aborted || step.error) {
        message.stopReason = options?.signal?.aborted ? 'aborted' : 'error'; message.errorMessage = step.error ?? 'aborted'
        stream.push({ type: 'error', reason: message.stopReason, error: message }); return
      }
      for (const [index, call] of (step.calls ?? []).entries()) stream.push({ type: 'toolcall_end', contentIndex: index + 1, toolCall: { type: 'toolCall', ...call }, partial: message })
      stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'toolUse', message })
    })()
    return stream
  }
  const sink: MiraFlowReportSink = {
    askSubmitAttempted: vi.fn(), askTurnEnded: vi.fn(), askProgress: vi.fn(() => { order.push('progress') }), askStats: vi.fn(() => { order.push('stats') }),
    askFailed: vi.fn(), stopRun: vi.fn(), runStalled: vi.fn(), askWaiting: vi.fn(), askExecuting: vi.fn(), askMutating: vi.fn(), concurrencyChanged: vi.fn(),
  }
  const options: MiraFlowActorDriverOptions = {
    runId: 'actual-run', journal: new InMemoryJournalStore(), emit: vi.fn(), executeWorldRead: vi.fn(async () => 'world'),
    resolveActor: vi.fn(async () => ({ model, streamFn, resolvedModel: 'openai/gpt-4o-mini' })),
    contextStorage: {
      loadOrCreate: vi.fn(async (id: string, seed?: ActorSessionSeed) => {
        if (!states.has(id)) {
          const previous = seed ? states.get(seed.sourceSessionId) : undefined
          if (seed && (!previous || previous.messages.length < seed.messageCount)) throw new Error('Invalid transcript seed')
          states.set(id, { messages: structuredClone(previous?.messages.slice(0, seed?.messageCount) ?? []), ...(seed?.resolvedModel ? { resolvedModel: seed.resolvedModel } : {}) })
        }
        return structuredClone(states.get(id)!)
      }),
      save: vi.fn(async (id, context) => { states.set(id, structuredClone(context)) }),
    }, ...extra,
  }
  const driver = new MiraFlowActorDriver(options, sink); drivers.push(driver)
  return { driver, sink, contexts, states, options, order }
}

describe('Mira persistent real Pi Agent actor driver', () => {
  it('identifies restored actor transcripts so SessionStart can use the resume matcher', async () => {
    const toolsForActor = vi.fn<NonNullable<MiraFlowActorDriverOptions['toolsForActor']>>(async () => ({ tools: [] }))
    const view = setup([{ text: 'answer' }], { toolsForActor })
    await view.driver.createActorSession(actor, {})
    expect(toolsForActor.mock.calls[0]?.[0]).toMatchObject({ resumed: false })
    const restored = { ...actor, ordinal: 2 }
    view.states.set(miraFlowActorSessionId(view.options.runId, restored), {
      messages: [{ role: 'user', content: 'previous ask', timestamp: 1 }],
    })
    await view.driver.createActorSession(restored, {})
    expect(toolsForActor.mock.calls[1]?.[0]).toMatchObject({ resumed: true })
  })

  it('keeps the same actor context and queues asks FIFO while distinct actors remain independent', async () => {
    const gate = deferred(), view = setup([{ text: 'first-result', wait: gate.promise }, { text: 'independent-result' }, { text: 'second-result' }])
    const first = await view.driver.createActorSession(actor, { system: 'writer-persona' }), other = await view.driver.createActorSession({ ...actor, ordinal: 2 }, { system: 'other-persona' })
    view.driver.startAsk(first, instance(), { instructions: 'FIRST', typed: false })
    view.driver.startAsk(first, instance(2), { instructions: 'SECOND', typed: false })
    view.driver.startAsk(other, instance(3), { instructions: 'OTHER', typed: false })
    await vi.waitFor(() => expect(view.contexts).toHaveLength(2))
    expect(view.contexts[1]?.systemPrompt).toBe('other-persona'); expect(JSON.stringify(view.contexts[1])).not.toContain('FIRST')
    expect(view.sink.askTurnEnded).toHaveBeenCalledWith(instance(3), 'independent-result')
    gate.resolve(); await view.driver.waitForIdle()
    expect(view.contexts[2]?.systemPrompt).toBe('writer-persona'); expect(JSON.stringify(view.contexts[2])).toContain('first-result')
    expect(JSON.stringify(view.contexts[2])).not.toContain('OTHER')
    expect(view.states.get(first.id)?.messages).toHaveLength(4)
    expect(view.order).toEqual(['progress', 'stats', 'progress', 'stats', 'progress', 'stats'])
  })

  it('rejects and repairs typed results through the real engine, never parsing JSON-looking final text', async () => {
    const view = setup([{ text: '{"count":999}' }, { calls: [submit({ count: 'wrong' }, 'invalid')] }, { calls: [submit({ count: 2 }, 'valid')] }])
    let engine!: MiraFlowEngine
    const verdicts: SubmitVerdict[] = []
    const respond = view.driver.respondToSubmit.bind(view.driver)
    vi.spyOn(view.driver, 'respondToSubmit').mockImplementation((ref, verdict) => { verdicts.push(verdict); respond(ref, verdict) })
    const schema: JsonSchema = { type: 'object', properties: { count: { type: 'number' } }, required: ['count'], additionalProperties: false }
    view.sink.askSubmitAttempted = vi.fn((ref, value) => engine.askSubmitAttempted(ref, value))
    view.sink.askTurnEnded = vi.fn((ref, text) => engine.askTurnEnded(ref, text))
    view.sink.askStats = vi.fn((ref, stats) => engine.askStats(ref, stats))
    view.sink.askProgress = vi.fn((ref, progress) => engine.askProgress(ref, progress))
    engine = new MiraFlowEngine({ runId: 'actual-run', driver: view.driver, caps: { maxConcurrency: 2 }, askSpecs: new Map<string, AskSpec>([['ask#1', { typed: true, schema }]]), validate: (shape, result) => validate(shape as JsonSchema, result) })
    const handle = engine.createActor('actor#1', 'actual-actor')
    const result = await engine.ask('ask#1', handle, 'Count')
    expect(result).toEqual({ count: 2 }); engine.complete(result)
    await view.driver.waitForIdle()
    expect(verdicts.map(verdict => verdict.kind)).toEqual(['nudge', 'reject', 'accept'])
    expect(view.sink.askTurnEnded).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(view.contexts[2])).toContain('Result rejected')
    const id = miraFlowActorSessionId('actual-run', actor), messages = view.states.get(id)?.messages
    expect(messages?.at(-1)).toMatchObject({ role: 'toolResult', isError: false })
    expect(view.options.journal.getNode('actual-run', 'ask#1', 1)).toMatchObject({ status: 'completed', result: { count: 2 }, messageBoundary: messages?.length })
    expect(view.options.journal.getRun('actual-run')?.spentTokens).toBe(30)
    expect(view.options.journal.getActor('actual-run', 'actor#1', 1)).toMatchObject({ name: 'actual-actor', sessionId: id, resolvedModel: 'openai/gpt-4o-mini' })
    expect(view.sink.askStats).toHaveBeenNthCalledWith(1, instance(), { tokens: 10, turns: 1, toolCalls: 0, worldToolCalls: 0 })
    expect(view.sink.askStats).toHaveBeenNthCalledWith(2, instance(), { tokens: 20, turns: 2, toolCalls: 2, worldToolCalls: 0 })
  })

  it('allows a synchronous verdict, retains its successful tool result during dispose, and prevents post-accept host tools', async () => {
    const cleanup = vi.fn(), write = vi.fn(), release = vi.fn()
    const tool: AgentTool = { name: 'write', label: 'Write', description: 'Write fixture', parameters: Type.Object({}), execute: async () => { write(); return { content: [{ type: 'text', text: 'written' }], details: {} } } }
    const view = setup([{ calls: [submit(4), { id: 'late-write', name: 'write', arguments: {} }] }], { toolsForActor: async () => ({ tools: [tool], dispose: cleanup }), acquireLock: async () => release })
    const session = await view.driver.createActorSession(actor, {})
    view.sink.askSubmitAttempted = vi.fn(ref => { view.driver.respondToSubmit(ref, { kind: 'accept' }); view.driver.dispose() })
    view.driver.startAsk(session, instance(), { instructions: 'Typed task', typed: true, schema: { type: 'number' } })
    await view.driver.waitForIdle()
    expect(write).not.toHaveBeenCalled(); expect(cleanup).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1)
    expect(view.states.get(session.id)?.messages.some(message => message.role === 'toolResult' && message.toolName === 'submit_result' && !message.isError)).toBe(true)
    expect(view.sink.askTurnEnded).not.toHaveBeenCalled(); expect(view.contexts).toHaveLength(1)
    view.driver.dispose(); expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('does not register submit_result for untyped asks and uses final text', async () => {
    const view = setup([{ calls: [submit({ forged: true })] }, { text: 'ordinary answer' }])
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Untyped task', typed: false })
    await view.driver.waitForIdle()
    expect(view.contexts[0]?.tools?.map(tool => tool.name)).not.toContain('submit_result')
    expect(view.sink.askSubmitAttempted).not.toHaveBeenCalled()
    expect(view.sink.askTurnEnded).toHaveBeenCalledWith(instance(), 'ordinary answer')
    expect(JSON.stringify(view.contexts[1])).toContain('not found')
  })

  it('cancels a parked submit and queued asks without hanging or reporting stale outcomes', async () => {
    const cleanup = vi.fn(), release = vi.fn(), view = setup([{ calls: [submit(1)] }], { toolsForActor: async () => ({ tools: [], dispose: cleanup }), acquireLock: async () => release })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Parked', typed: true })
    view.driver.startAsk(session, instance(2), { instructions: 'Never started', typed: false })
    await vi.waitFor(() => expect(view.sink.askSubmitAttempted).toHaveBeenCalledOnce())
    view.driver.dispose(); await view.driver.waitForIdle()
    expect(view.contexts).toHaveLength(1); expect(view.sink.askTurnEnded).not.toHaveBeenCalled(); expect(view.sink.askFailed).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1); expect(cleanup).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(view.states.get(session.id))).not.toContain('Never started')
  })

  it('aborts a real stream and persists partial transcript while releasing its host lock', async () => {
    const gate = deferred(), release = vi.fn(), controller = new AbortController(), view = setup([{ text: 'partial-response', wait: gate.promise }], { signal: controller.signal, acquireLock: async () => release })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Abort me', typed: false })
    await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    controller.abort(); await view.driver.waitForIdle()
    expect(release).toHaveBeenCalledOnce(); expect(view.sink.askTurnEnded).not.toHaveBeenCalled(); expect(view.sink.askFailed).not.toHaveBeenCalled()
    expect(JSON.stringify(view.states.get(session.id))).toContain('Abort me')
  })

  it('cancels host lock admission before the first model request', async () => {
    const view = setup(undefined, { acquireLock: async (_identity, signal) => new Promise<() => void>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('cancelled admission')), { once: true }) }) })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Wait for lock', typed: false })
    await vi.waitFor(() => expect(view.sink.askWaiting).toHaveBeenCalledOnce())
    view.driver.cancelAsk(instance()); await view.driver.waitForIdle()
    expect(view.contexts).toHaveLength(0); expect(view.sink.askFailed).not.toHaveBeenCalled()
  })

  it('uses host tools/preflight and reports mutation before execution, preserving rejected tool errors', async () => {
    const order: string[] = [], preflight = vi.fn(async () => { order.push('preflight'); return undefined })
    const tool: AgentTool = { name: 'write', label: 'Write', description: 'fixture', parameters: Type.Object({}), execute: async () => { order.push('write'); return { content: [{ type: 'text', text: 'actual-tool-result' }], details: {} } } }
    const view = setup([{ calls: [{ id: 'write-fixture', name: 'write', arguments: {} }] }, { text: 'done' }], { toolsForActor: async () => ({ tools: [tool], beforeToolCall: preflight, isMutatingTool: name => name === 'write' }) })
    view.sink.askMutating = vi.fn(() => { order.push('mutating') })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Use tools', typed: false }); await view.driver.waitForIdle()
    expect(order).toEqual(['preflight', 'mutating', 'write']); expect(JSON.stringify(view.contexts[1])).toContain('actual-tool-result')
    expect(view.sink.askStats).toHaveBeenCalledWith(instance(), { tokens: 20, turns: 2, toolCalls: 1, worldToolCalls: 1 })
    expect(await view.driver.executeWorldRead('read', ['file'])).toBe('world')
  })

  it('hydrates exact seeded prefix and model pin before returning a deterministic new actor session', async () => {
    const view = setup(), source = 'source-session'
    const messages: AgentMessage[] = [{ role: 'user', content: 'seed-prefix', timestamp: 1 }, { role: 'user', content: 'excluded-tail', timestamp: 2 }]
    view.states.set(source, { messages, resolvedModel: 'openai/gpt-4o-mini' })
    const seed: ActorSessionSeed = { sourceSessionId: source, messageCount: 1, resolvedModel: 'openai/gpt-4o-mini' }
    const session = await view.driver.createActorSession(actor, {}, seed)
    expect(view.options.resolveActor).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.id }), seed.resolvedModel)
    expect(view.states.get(session.id)?.messages).toEqual(messages.slice(0, 1))
    view.driver.startAsk(session, instance(), { instructions: 'Continue', typed: false }); await view.driver.waitForIdle()
    expect(JSON.stringify(view.contexts[0])).toContain('seed-prefix'); expect(JSON.stringify(view.contexts[0])).not.toContain('excluded-tail')
    expect(await view.driver.createActorSession(actor, {}, seed)).toEqual(session)
    expect(view.options.resolveActor).toHaveBeenCalledTimes(1)
    expect(miraFlowActorSessionId('other-run', actor)).not.toBe(session.id)
  })

  it('fails loudly for missing seeds and prevents restoring a different model pin', async () => {
    const missing = setup()
    await expect(missing.driver.createActorSession(actor, {}, { sourceSessionId: 'missing', messageCount: 1 })).rejects.toThrow('Invalid transcript seed')
    const changed = setup(undefined, { resolveActor: async () => ({ model, streamFn: () => { throw new Error('must not stream') }, resolvedModel: 'wrong-pin' }) })
    changed.states.set(miraFlowActorSessionId('actual-run', actor), { messages: [], resolvedModel: 'expected-pin' })
    await expect(changed.driver.createActorSession(actor, {})).rejects.toThrow('model pin changed')
    expect(changed.contexts).toHaveLength(0)
  })

  it('reports real model stream errors as DriverError instead of successful empty final text', async () => {
    const view = setup([{ error: 'provider-fixture-error' }]), session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Failure', typed: false }); await view.driver.waitForIdle()
    expect(view.sink.askFailed).toHaveBeenCalledWith(instance(), expect.objectContaining({ code: 'DriverError', message: 'provider-fixture-error' }))
    expect(view.sink.askTurnEnded).not.toHaveBeenCalled()
  })

  it('surfaces post-accept transcript storage failures and still releases the lock', async () => {
    const release = vi.fn(), view = setup([{ calls: [submit(1)] }], { acquireLock: async () => release })
    const session = await view.driver.createActorSession(actor, {})
    view.options.contextStorage.save = vi.fn(async () => { throw new Error('transcript disk failed') })
    view.sink.askSubmitAttempted = vi.fn(ref => { view.driver.respondToSubmit(ref, { kind: 'accept' }); view.driver.dispose() })
    view.driver.startAsk(session, instance(), { instructions: 'Accepted', typed: true })
    await expect(view.driver.waitForIdle()).rejects.toThrow('transcript disk failed')
    expect(release).toHaveBeenCalledOnce(); expect(view.sink.askTurnEnded).not.toHaveBeenCalled()
  })

  it('waits for accepted submit persistence before starting another ask enqueued by the engine verdict', async () => {
    const gate = deferred(), view = setup([{ calls: [submit(1)] }, { text: 'second-answer' }])
    const session = await view.driver.createActorSession(actor, {})
    const save = view.options.contextStorage.save
    view.options.contextStorage.save = vi.fn(async (id: string, context: MiraFlowActorContext) => {
      if (context.messages.some(message => message.role === 'toolResult')) await gate.promise
      await save(id, context)
    })
    view.sink.askSubmitAttempted = vi.fn(ref => {
      view.driver.respondToSubmit(ref, { kind: 'accept' })
      view.driver.startAsk(session, instance(2), { instructions: 'Second ask', typed: false })
    })
    view.driver.startAsk(session, instance(), { instructions: 'First ask', typed: true })
    await vi.waitFor(() => expect(view.options.contextStorage.save).toHaveBeenCalledOnce())
    expect(view.contexts).toHaveLength(1)
    gate.resolve(); await view.driver.waitForIdle()
    expect(view.contexts).toHaveLength(2)
    expect(view.contexts[1]?.messages.at(-2)).toMatchObject({ role: 'toolResult', isError: false })
    expect(view.sink.askTurnEnded).toHaveBeenCalledWith(instance(2), 'second-answer')
  })

  it('treats cancellation during actor initialization as normal disposal, with no stream or cleanup failure', async () => {
    const gate = deferred(), view = setup(), resolve = view.options.resolveActor
    view.options.resolveActor = vi.fn<MiraFlowActorDriverOptions['resolveActor']>(async (identity, pin) => { await gate.promise; return resolve(identity, pin) })
    const creating = view.driver.createActorSession(actor, {})
    const cancelled = expect(creating).rejects.toMatchObject({ code: 'Cancelled' })
    await vi.waitFor(() => expect(view.options.resolveActor).toHaveBeenCalledOnce())
    view.driver.dispose(); gate.resolve()
    await cancelled; await expect(view.driver.waitForIdle()).resolves.toBeUndefined()
    expect(view.contexts).toHaveLength(0)
  })

  it('does not execute a host tool after cancellation while preflight is pending', async () => {
    const gate = deferred(), write = vi.fn(), before = vi.fn(async () => { await gate.promise; return undefined })
    const tool: AgentTool = { name: 'write', label: 'Write', description: 'fixture', parameters: Type.Object({}), execute: async () => { write(); return { content: [{ type: 'text', text: 'written' }], details: {} } } }
    const view = setup([{ calls: [{ id: 'waiting-write', name: 'write', arguments: {} }] }], { toolsForActor: async () => ({ tools: [tool], beforeToolCall: before, isMutatingTool: () => true }) })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Wait preflight', typed: false })
    await vi.waitFor(() => expect(before).toHaveBeenCalledOnce())
    view.driver.cancelAsk(instance()); gate.resolve(); await view.driver.waitForIdle()
    expect(write).not.toHaveBeenCalled(); expect(view.sink.askMutating).not.toHaveBeenCalled(); expect(view.sink.askTurnEnded).not.toHaveBeenCalled()
  })

  it('injects beforePrompt contexts on each typed/nudge prompt but never runs Stop or external post-hook for accepted submit', async () => {
    const beforePrompt = vi.fn(async (prompt: string) => [`HOOK-CONTEXT-${prompt.includes('not submitted') ? 'NUDGE' : 'INITIAL'}`])
    const afterToolCall = vi.fn(), afterTurn = vi.fn()
    const view = setup([{ text: 'not a typed result' }, { calls: [submit(42)] }], { toolsForActor: async () => ({ tools: [], beforePrompt, afterToolCall, afterTurn }) })
    const session = await view.driver.createActorSession(actor, {})
    view.sink.askTurnEnded = vi.fn(ref => view.driver.respondToSubmit(ref, { kind: 'nudge' }))
    view.sink.askSubmitAttempted = vi.fn(ref => view.driver.respondToSubmit(ref, { kind: 'accept' }))
    view.driver.startAsk(session, instance(), { instructions: 'Typed', typed: true })
    await view.driver.waitForIdle()
    expect(beforePrompt).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(view.contexts[0])).toContain('HOOK-CONTEXT-INITIAL')
    expect(JSON.stringify(view.contexts[1])).toContain('HOOK-CONTEXT-NUDGE')
    expect(afterToolCall).not.toHaveBeenCalled(); expect(afterTurn).not.toHaveBeenCalled()
    expect(view.sink.askSubmitAttempted).toHaveBeenCalledWith(instance(), 42)
  })

  it('passes a real host tool result through Pi afterToolCall override before the next model request', async () => {
    const tool: AgentTool = { name: 'read', label: 'Read', description: 'fixture', parameters: Type.Object({}), execute: async () => ({ content: [{ type: 'text', text: 'REAL-BYTES' }], details: { actual: true } }) }
    const afterToolCall = vi.fn<NonNullable<MiraFlowActorTools['afterToolCall']>>(async ({ result }) => ({ content: [...result.content, { type: 'text', text: 'POST-HOOK-CONTEXT' }] }))
    const view = setup([{ calls: [{ id: 'actual-read', name: 'read', arguments: {} }] }, { text: 'final' }], { toolsForActor: async () => ({ tools: [tool], afterToolCall }) })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Read', typed: false }); await view.driver.waitForIdle()
    expect(afterToolCall).toHaveBeenCalledOnce()
    expect(afterToolCall.mock.calls[0]?.[0]).toMatchObject({ toolCall: { id: 'actual-read', name: 'read' }, result: { details: { actual: true } }, isError: false })
    expect(JSON.stringify(view.contexts[1])).toContain('REAL-BYTES'); expect(JSON.stringify(view.contexts[1])).toContain('POST-HOOK-CONTEXT')
  })

  it('aborts only the cancelled ask prompt hook while sibling and subsequent asks still run', async () => {
    let cancelledSignal: AbortSignal | undefined
    const beforePrompt = vi.fn(async (prompt: string, signal: AbortSignal) => {
      if (prompt !== 'CANCEL') return []
      cancelledSignal = signal
      return new Promise<string[]>(resolve => signal.addEventListener('abort', () => resolve([]), { once: true }))
    })
    const view = setup([{ text: 'sibling-result' }, { text: 'next-result' }], { toolsForActor: async () => ({ tools: [], beforePrompt }) })
    const session = await view.driver.createActorSession(actor, {})
    const sibling = await view.driver.createActorSession({ ...actor, ordinal: 2 }, {})
    view.driver.startAsk(session, instance(), { instructions: 'CANCEL', typed: false })
    await vi.waitFor(() => expect(cancelledSignal).toBeDefined())
    view.driver.startAsk(sibling, instance(2), { instructions: 'SIBLING', typed: false })
    await vi.waitFor(() => expect(view.sink.askTurnEnded).toHaveBeenCalledWith(instance(2), 'sibling-result'))
    view.driver.cancelAsk(instance())
    view.driver.startAsk(session, instance(3), { instructions: 'NEXT', typed: false })
    await view.driver.waitForIdle()
    expect(cancelledSignal?.aborted).toBe(true)
    expect(view.contexts).toHaveLength(2)
    expect(view.sink.askTurnEnded).toHaveBeenCalledWith(instance(3), 'next-result')
    expect(view.sink.askTurnEnded).not.toHaveBeenCalledWith(instance(), expect.anything())
    expect(view.sink.askFailed).not.toHaveBeenCalled()
  })

  it('bounds ordinary Stop continuation to three prompts and settles only the final text once', async () => {
    const afterTurn = vi.fn<NonNullable<MiraFlowActorTools['afterTurn']>>(async () => ({ contexts: ['RECHECK'], continue: true })), beforePrompt = vi.fn(async () => ['PROMPT-HOOK'])
    const view = setup([{ text: 'first' }, { text: 'second' }, { text: 'third' }, { text: 'fourth' }], { toolsForActor: async () => ({ tools: [], beforePrompt, afterTurn }) })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Initial', typed: false }); await view.driver.waitForIdle()
    expect(view.contexts).toHaveLength(4); expect(beforePrompt).toHaveBeenCalledTimes(4)
    expect(afterTurn.mock.calls.map(call => call[1])).toEqual([{ stopHookActive: false, toolCallCount: 0 }, { stopHookActive: true, toolCallCount: 0 }, { stopHookActive: true, toolCallCount: 0 }, { stopHookActive: true, toolCallCount: 0 }])
    expect(JSON.stringify(view.contexts[1])).toContain('Hook 要求继续当前任务：'); expect(JSON.stringify(view.contexts[1])).toContain('RECHECK')
    expect(view.sink.askTurnEnded).toHaveBeenCalledTimes(1); expect(view.sink.askTurnEnded).toHaveBeenCalledWith(instance(), 'fourth')
    expect(view.sink.askStats).toHaveBeenCalledTimes(4)
  })

  it.each(['beforePrompt', 'afterTurn', 'afterToolCall'] as const)('makes %s failure fail the real ask, without successful settlement', async hook => {
    const failing = vi.fn(async () => { throw new Error(`${hook}-FAILED`) })
    const tool: AgentTool = { name: 'read', label: 'Read', description: 'fixture', parameters: Type.Object({}), execute: async () => ({ content: [{ type: 'text', text: 'REAL' }], details: {} }) }
    const view = setup(hook === 'afterToolCall' ? [{ calls: [{ id: 'read-hook', name: 'read', arguments: {} }] }, { text: 'must not settle' }] : [{ text: 'must not settle' }], { toolsForActor: async () => ({ tools: [tool], [hook]: failing }) })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Hook failure', typed: false }); await view.driver.waitForIdle()
    expect(view.sink.askFailed).toHaveBeenCalledWith(instance(), expect.objectContaining({ code: 'DriverError', message: `${hook}-FAILED` }))
    expect(view.sink.askTurnEnded).not.toHaveBeenCalled()
    if (hook === 'afterToolCall') expect(view.contexts).toHaveLength(1)
  })

  it('waits for late tools to be released after cancelled actor initialization before disposing run resources once', async () => {
    const gate = deferred(), order: string[] = [], toolsDispose = vi.fn(async () => { order.push('tools') }), disposeResources = vi.fn(async () => { order.push('resources') })
    const toolsForActor = vi.fn(async () => { await gate.promise; return { tools: [], dispose: toolsDispose } })
    const view = setup(undefined, { toolsForActor, disposeResources })
    const creating = view.driver.createActorSession(actor, {}), cancelled = expect(creating).rejects.toMatchObject({ code: 'Cancelled' })
    await vi.waitFor(() => expect(toolsForActor).toHaveBeenCalledOnce())
    view.driver.dispose(); view.driver.dispose(); expect(disposeResources).not.toHaveBeenCalled()
    gate.resolve(); await cancelled; await view.driver.waitForIdle()
    expect(order).toEqual(['tools', 'resources']); expect(toolsDispose).toHaveBeenCalledOnce(); expect(disposeResources).toHaveBeenCalledOnce()
    expect(view.contexts).toHaveLength(0)
  })

  it('drains active prompt and per-session cleanup before async shared resources, with waitForIdle waiting for them', async () => {
    const gate = deferred(), cleanupGate = deferred(), order: string[] = []
    const view = setup([{ text: 'response', wait: gate.promise }], { toolsForActor: async () => ({ tools: [], dispose: async () => { order.push('tools') } }), disposeResources: async () => { order.push('resources-start'); await cleanupGate.promise; order.push('resources-end') } })
    const session = await view.driver.createActorSession(actor, {})
    view.driver.startAsk(session, instance(), { instructions: 'Active', typed: false }); await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    view.driver.dispose(); let settled = false
    const waiting = view.driver.waitForIdle().then(() => { settled = true })
    await vi.waitFor(() => expect(order).toEqual(['tools', 'resources-start']))
    expect(settled).toBe(false); cleanupGate.resolve(); await waiting
    expect(order).toEqual(['tools', 'resources-start', 'resources-end'])
  })

  it.each(['late-tools', 'resources'] as const)('surfaces %s cleanup failure through waitForIdle without swallowing it', async phase => {
    const gate = deferred(), failing = vi.fn(async () => { throw new Error('cleanup FAILED') })
    const view = setup(undefined, { toolsForActor: async () => { await gate.promise; return { tools: [], ...(phase === 'late-tools' ? { dispose: failing } : {}) } }, ...(phase === 'resources' ? { disposeResources: failing } : {}) })
    const creating = view.driver.createActorSession(actor, {}), rejected = expect(creating).rejects.toThrow(phase === 'late-tools' ? 'cleanup FAILED' : 'disposed')
    await Promise.resolve(); await Promise.resolve(); view.driver.dispose(); gate.resolve(); await rejected
    await expect(view.driver.waitForIdle()).rejects.toThrow('cleanup FAILED')
    expect(failing).toHaveBeenCalledOnce()
  })

  it('uses a host actor-specific system prompt and reports human tool labels without changing executed identifiers', async () => {
    const tool: AgentTool = { name: 'mcp_internal_name', label: '资料索引查询', description: 'fixture', parameters: Type.Object({}), execute: async () => ({ content: [{ type: 'text', text: 'index' }], details: {} }) }
    const systemPromptForActor = vi.fn<NonNullable<MiraFlowActorDriverOptions['systemPromptForActor']>>(identity => `Actor ${identity.persona.name}: /actual/project`)
    const view = setup([{ calls: [{ id: 'index', name: 'mcp_internal_name', arguments: {} }] }, { text: 'final' }], { systemPromptForActor, toolsForActor: async () => ({ tools: [tool] }) })
    const session = await view.driver.createActorSession(actor, { name: '资料助手', system: 'persona fallback' })
    view.driver.startAsk(session, instance(), { instructions: 'Read', typed: false }); await view.driver.waitForIdle()
    expect(view.contexts[0]?.systemPrompt).toBe('Actor 资料助手: /actual/project')
    expect(view.contexts[0]?.tools?.map(item => item.name)).toEqual(['mcp_internal_name'])
    expect(view.sink.askProgress).toHaveBeenCalledWith(instance(), expect.objectContaining({ lastTool: { name: '资料索引查询' } }))
  })

  it('does not accept a later typed submit in the same tool batch after a post-hook failure', async () => {
    const tool: AgentTool = { name: 'read', label: 'Read', description: 'fixture', parameters: Type.Object({}), execute: async () => ({ content: [{ type: 'text', text: 'real' }], details: {} }) }
    const view = setup([{ calls: [{ id: 'read', name: 'read', arguments: {} }, submit(42)] }], { toolsForActor: async () => ({ tools: [tool], afterToolCall: async () => { throw new Error('POST-HOOK-BLOCK') } }) })
    const session = await view.driver.createActorSession(actor, {})
    view.sink.askSubmitAttempted = vi.fn(ref => view.driver.respondToSubmit(ref, { kind: 'accept' }))
    view.driver.startAsk(session, instance(), { instructions: 'Typed', typed: true }); await view.driver.waitForIdle()
    expect(view.sink.askSubmitAttempted).not.toHaveBeenCalled(); expect(view.sink.askTurnEnded).not.toHaveBeenCalled()
    expect(view.sink.askFailed).toHaveBeenCalledWith(instance(), expect.objectContaining({ message: 'POST-HOOK-BLOCK' }))
  })
})
