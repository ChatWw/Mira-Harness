import { createHash } from 'node:crypto'
import { Agent, type AgentMessage, type AgentTool, type AfterToolCallContext, type AfterToolCallResult, type BeforeToolCallContext, type BeforeToolCallResult, type StreamFn, type ThinkingLevel } from '@earendil-works/pi-agent-core'
import { Type, type Model } from '@earendil-works/pi-ai'
import { MiraFlowError, refToString, type ActorRef, type ActorSessionSeed, type AskMessage, type InstanceRef, type JournalStorePort, type MiraFlowDriver, type MiraFlowReportSink, type PersonaSpec, type RunEvent, type SessionRef, type SubmitVerdict } from '../../../packages/mira-flow-kit/src/engine/mira-types'

export type MiraFlowActorContext = { messages: AgentMessage[]; resolvedModel?: string }
export interface MiraFlowActorContextStorage {
  /** Atomically initialize/seed; existing target content wins. Never silently ignore an invalid seed. */
  loadOrCreate(sessionId: string, seed?: ActorSessionSeed): Promise<MiraFlowActorContext>
  save(sessionId: string, context: MiraFlowActorContext): Promise<void>
}
export type MiraFlowActorIdentity = { actor: ActorRef; persona: PersonaSpec; sessionId: string; resumed?: boolean }
export type MiraFlowActorModel = { model: Model<any>; streamFn: StreamFn; resolvedModel: string; thinkingLevel?: ThinkingLevel }
export type MiraFlowActorTools = {
  tools: AgentTool[]
  beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>
  beforePrompt?: (prompt: string, signal: AbortSignal) => Promise<string[] | undefined>
  afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>
  afterTurn?: (responseText: string, context: { stopHookActive: boolean; toolCallCount: number }, signal: AbortSignal) => Promise<{ contexts: string[]; continue: boolean } | undefined>
  isMutatingTool?: (name: string, args: unknown) => boolean
  dispose?: () => void | Promise<void>
}
export type MiraFlowActorDriverOptions = {
  runId: string
  journal: JournalStorePort
  emit: (event: RunEvent) => void
  contextStorage: MiraFlowActorContextStorage
  resolveActor: (identity: MiraFlowActorIdentity, pinnedModel?: string) => Promise<MiraFlowActorModel>
  toolsForActor?: (identity: MiraFlowActorIdentity) => Promise<MiraFlowActorTools>
  systemPromptForActor?: (identity: MiraFlowActorIdentity) => string
  acquireLock?: (identity: MiraFlowActorIdentity, signal: AbortSignal) => Promise<() => void>
  executeWorldRead: MiraFlowDriver['executeWorldRead']
  executeArtifactPublish?: MiraFlowDriver['executeArtifactPublish']
  signal?: AbortSignal
  disposeResources?: () => void | Promise<void>
}
type Ask = {
  instance: InstanceRef; message: AskMessage; controller: AbortController
  accepted: boolean; ended: boolean; nudge: boolean; turns: number; requests: number; tools: number; worldTools: number
  pending?: { resolve: (verdict: SubmitVerdict) => void; reject: (error: Error) => void }
  hookError?: MiraFlowError
}
type ActorSession = {
  identity: MiraFlowActorIdentity; agent: Agent; model: MiraFlowActorModel; tools: MiraFlowActorTools
  tail: Promise<void>; active?: Ask; cleanup?: Promise<void>
}

export function miraFlowActorSessionId(runId: string, actor: ActorRef): string {
  return `mira-flow-actor-${createHash('sha256').update(JSON.stringify([runId, actor.siteId, actor.ordinal])).digest('hex')}`
}

/** One persistent Agent per actor; no settings/provider/network access lives in this driver. */
export class MiraFlowActorDriver implements MiraFlowDriver {
  readonly journal: JournalStorePort
  readonly emit: (event: RunEvent) => void
  readonly executeWorldRead: MiraFlowDriver['executeWorldRead']
  readonly executeArtifactPublish?: MiraFlowDriver['executeArtifactPublish']
  private readonly sessions = new Map<string, ActorSession>()
  private readonly creating = new Map<string, Promise<SessionRef>>()
  private readonly asks = new Map<string, { session: ActorSession; ask: Ask }>()
  private readonly work = new Set<Promise<unknown>>()
  private readonly cleanupErrors: unknown[] = []
  private closed = false
  private resourceCleanup?: Promise<void>
  private readonly onAbort = () => this.dispose()

  constructor(private readonly options: MiraFlowActorDriverOptions, private readonly sink: MiraFlowReportSink) {
    this.journal = options.journal; this.emit = options.emit
    this.executeWorldRead = options.executeWorldRead; this.executeArtifactPublish = options.executeArtifactPublish
    options.signal?.addEventListener('abort', this.onAbort, { once: true })
    if (options.signal?.aborted) this.dispose()
  }

  createActorSession(actor: ActorRef, persona: PersonaSpec, seed?: ActorSessionSeed): Promise<SessionRef> {
    if (this.closed) return Promise.reject(new MiraFlowError('Cancelled', 'Mira flow driver is disposed'))
    const id = miraFlowActorSessionId(this.options.runId, actor)
    if (this.sessions.has(id)) return Promise.resolve({ id })
    const existing = this.creating.get(id)
    if (existing) return existing
    const pending = this.createSession({ actor: { ...actor }, persona: { ...persona }, sessionId: id }, seed)
    this.creating.set(id, pending)
    // Creation failures are already returned to the engine; cancellation during
    // initialization must not turn a normally stopped run into a cleanup error.
    this.track(pending.finally(() => this.creating.delete(id)), false)
    return pending
  }

  private async createSession(identity: MiraFlowActorIdentity, seed?: ActorSessionSeed): Promise<SessionRef> {
    const context = await this.options.contextStorage.loadOrCreate(identity.sessionId, seed)
    identity.resumed = context.messages.length > 0
    const model = await this.options.resolveActor(identity, context.resolvedModel)
    if (context.resolvedModel && context.resolvedModel !== model.resolvedModel) throw new MiraFlowError('DriverError', 'Actor model pin changed while restoring its transcript')
    if (this.closed) throw new MiraFlowError('Cancelled', 'Mira flow driver is disposed')
    const systemPrompt = this.options.systemPromptForActor?.(identity) ?? identity.persona.system ?? ''
    const tools = await this.options.toolsForActor?.(identity) ?? { tools: [] }
    if (this.closed) { await this.disposeTools(tools); throw new MiraFlowError('Cancelled', 'Mira flow driver is disposed') }
    if (tools.tools.some(tool => tool.name === 'submit_result')) {
      await this.disposeTools(tools)
      throw new MiraFlowError('DriverError', 'submit_result is reserved by the Mira flow driver')
    }
    const agent = new Agent({
      initialState: { model: model.model, systemPrompt, messages: structuredClone(context.messages), tools: tools.tools, thinkingLevel: model.thinkingLevel ?? 'off' },
      sessionId: identity.sessionId, streamFn: (selected, request, options) => {
        if (session.active && !session.active.controller.signal.aborted) {
          session.active.requests++
          this.sink.askExecuting(session.active.instance)
        }
        return model.streamFn(selected, request, options)
      },
      toolExecution: 'sequential',
      beforeToolCall: async (request, signal) => {
        const ask = session.active
        if (!ask || ask.controller.signal.aborted || ask.accepted || ask.hookError) return { block: true, reason: ask?.hookError?.message ?? 'This Mira ask has ended', terminate: true }
        if (request.toolCall.name === 'submit_result') return undefined
        let result: BeforeToolCallResult | undefined
        try { result = await tools.beforeToolCall?.(request, signal) }
        catch (error) { ask.hookError = asFlowError(error); throw error }
        if (ask.controller.signal.aborted) return { block: true, reason: 'This Mira ask was cancelled', terminate: true }
        if (!result?.block && !ask.controller.signal.aborted && tools.isMutatingTool?.(request.toolCall.name, request.args)) this.sink.askMutating(ask.instance)
        return result
      },
      afterToolCall: async (request, signal) => {
        if (request.toolCall.name === 'submit_result' || !session.active || session.active.controller.signal.aborted || session.active.accepted) return undefined
        try { return await tools.afterToolCall?.(request, signal) }
        catch (error) { session.active.hookError = asFlowError(error); throw error }
      },
      shouldStopAfterTurn: () => Boolean(session.active?.accepted || session.active?.hookError || session.active?.controller.signal.aborted),
    })
    const session: ActorSession = { identity, model, tools, tail: Promise.resolve(), agent }
    try {
      await this.options.contextStorage.save(identity.sessionId, { messages: session.agent.state.messages, resolvedModel: model.resolvedModel })
      const actorRecord = this.journal.getActor(this.options.runId, identity.actor.siteId, identity.actor.ordinal)
      if (actorRecord) this.journal.putActor({ ...actorRecord, resolvedModel: model.resolvedModel })
    } catch (error) { await this.disposeTools(tools); throw error }
    this.sessions.set(identity.sessionId, session)
    if (this.closed) { this.track(this.cleanupSession(session)); throw new MiraFlowError('Cancelled', 'Mira flow driver is disposed') }
    return { id: identity.sessionId }
  }

  startAsk(ref: SessionRef, instance: InstanceRef, message: AskMessage): void {
    const session = this.sessions.get(ref.id), key = refToString(instance)
    if (this.closed) return
    if (!session || this.asks.has(key)) { this.sink.askFailed(instance, new MiraFlowError('DriverError', 'Unknown actor session or duplicate ask instance')); return }
    const ask: Ask = { instance: { ...instance }, message: { ...message }, controller: new AbortController(), accepted: false, ended: false, nudge: false, turns: 0, requests: 0, tools: 0, worldTools: 0 }
    this.asks.set(key, { session, ask })
    // Engine acceptance may enqueue the next ask while the first submit tool still unwinds.
    // FIFO includes prompt completion, durable transcript and lock release, not just engine settlement.
    session.tail = session.tail.then(() => this.runAsk(session, ask)).catch(error => {
      if (!ask.controller.signal.aborted && !this.closed && !ask.accepted && !ask.ended) this.sink.askFailed(instance, asFlowError(error))
      else if (!ask.controller.signal.aborted) this.cleanupErrors.push(error)
    }).finally(() => { this.asks.delete(key) })
    this.track(session.tail)
  }

  respondToSubmit(instance: InstanceRef, verdict: SubmitVerdict): void {
    const ask = this.asks.get(refToString(instance))?.ask
    if (!ask || ask.controller.signal.aborted) return
    if (verdict.kind === 'nudge') { ask.nudge = true; return }
    if (!ask.pending) return
    if (verdict.kind === 'accept') ask.accepted = true
    const pending = ask.pending; ask.pending = undefined; pending.resolve(verdict)
  }

  cancelAsk(instance: InstanceRef): void {
    const entry = this.asks.get(refToString(instance))
    if (!entry) return
    entry.ask.controller.abort()
    entry.ask.pending?.reject(new MiraFlowError('Cancelled', 'Mira ask was cancelled'))
    entry.ask.pending = undefined
    if (entry.session.active === entry.ask) entry.session.agent.abort()
  }

  private submitTool(session: ActorSession): AgentTool {
    return { name: 'submit_result', label: 'Submit workflow result', description: 'Submit the typed result for this ask. Repair any validation errors and submit again.',
      parameters: Type.Object({ result: Type.Unknown() }, { additionalProperties: false }),
      execute: async (_id, params) => {
        const ask = session.active
        if (!ask || !ask.message.typed || ask.controller.signal.aborted) throw new Error('No active typed ask; answer with a final message')
        const verdict = await new Promise<SubmitVerdict>((resolve, reject) => {
          ask.pending = { resolve, reject }
          try { this.sink.askSubmitAttempted(ask.instance, (params as { result: unknown }).result) }
          catch (error) { ask.pending = undefined; reject(error) }
        })
        if (verdict.kind !== 'accept') throw new Error(`Result rejected: ${JSON.stringify(verdict.kind === 'reject' ? verdict.violations : [])}`)
        return { content: [{ type: 'text', text: 'Result accepted' }], details: { accepted: true }, terminate: true }
      },
    }
  }

  private async runAsk(session: ActorSession, ask: Ask): Promise<void> {
    if (ask.controller.signal.aborted || this.closed) return
    session.active = ask
    let release: (() => void) | undefined, finalText = '', tokens = 0, lastTool: string | undefined
    const unsubscribe = session.agent.subscribe(event => {
      if (event.type === 'tool_execution_start') {
        ask.tools++; if (event.toolName !== 'submit_result') ask.worldTools++
        lastTool = session.tools.tools.find(tool => tool.name === event.toolName)?.label ?? event.toolName
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const assistant = event.message
        tokens += assistant.usage.totalTokens
        finalText = assistant.content.filter(part => part.type === 'text').map(part => part.text).join('')
      }
    })
    try {
      if (this.options.acquireLock) {
        this.sink.askWaiting(ask.instance, { cause: 'slot' })
        release = await this.options.acquireLock(session.identity, ask.controller.signal)
      }
      if (ask.controller.signal.aborted || this.closed) return
      session.agent.state.tools = [...session.tools.tools, ...(ask.message.typed ? [this.submitTool(session)] : [])]
      let input = ask.message.typed ? `${ask.message.instructions}\n\nReturn the result using submit_result({ result: ... }); final text cannot submit a typed result.\nResult schema: ${JSON.stringify(ask.message.schema)}` : ask.message.instructions
      let stopContinuations = 0, hookContinuation = false
      do {
        ask.nudge = false; hookContinuation = false; ask.requests = 0; tokens = 0; finalText = ''
        const contexts = await session.tools.beforePrompt?.(input, ask.controller.signal)
        if (ask.controller.signal.aborted || this.closed) return
        await session.agent.prompt(input + (contexts?.length ? `\n\nHook 上下文：\n${contexts.join('\n\n')}` : ''))
        await this.persist(session)
        if (ask.controller.signal.aborted) return
        if (ask.hookError) throw ask.hookError
        const failure = session.agent.state.errorMessage
        if (failure) throw new MiraFlowError('DriverError', failure)
        ask.turns++
        this.sink.askProgress(ask.instance, { turn: ask.turns, toolCalls: ask.tools, ...(lastTool ? { lastTool: { name: lastTool.slice(0, 64) } } : {}) })
        this.sink.askStats(ask.instance, { tokens, turns: ask.requests, toolCalls: ask.tools, worldToolCalls: ask.worldTools })
        if (ask.controller.signal.aborted) return
        if (!ask.message.typed && !ask.accepted && !this.closed) {
          const stop = await session.tools.afterTurn?.(finalText, { stopHookActive: stopContinuations > 0, toolCallCount: ask.worldTools }, ask.controller.signal)
          if (ask.controller.signal.aborted || this.closed) return
          if (stop?.continue && stop.contexts.length && stopContinuations < 3) {
            stopContinuations++; hookContinuation = true
            input = `Hook 要求继续当前任务：\n${stop.contexts.join('\n\n')}`
            continue
          }
        }
        if (!ask.accepted && !this.closed) {
          ask.ended = !ask.message.typed
          this.sink.askTurnEnded(ask.instance, finalText)
        }
        if (!ask.nudge && !ask.controller.signal.aborted) this.writeBoundary(session, ask)
        input = 'You have not submitted a valid typed result. Call submit_result with the result now.'
      } while ((ask.nudge || hookContinuation) && !ask.controller.signal.aborted && !this.closed)
    } finally {
      unsubscribe()
      // Agent aborts still contain useful partial transcript; keep it for explicit resume.
      try { if (ask.controller.signal.aborted) await this.persist(session) }
      finally {
        session.active = undefined
        try { release?.() } catch (error) { this.cleanupErrors.push(error); throw error }
      }
    }
  }

  private async persist(session: ActorSession): Promise<void> {
    try { await this.options.contextStorage.save(session.identity.sessionId, { messages: structuredClone(session.agent.state.messages), resolvedModel: session.model.resolvedModel }) }
    catch (error) { this.cleanupErrors.push(error); throw error }
  }

  private writeBoundary(session: ActorSession, ask: Ask): void {
    const node = this.journal.getNode(this.options.runId, ask.instance.siteId, ask.instance.ordinal)
    if (node) this.journal.putNode({ ...node, messageBoundary: session.agent.state.messages.length })
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true; this.options.signal?.removeEventListener('abort', this.onAbort)
    // Accepted submit must finish its tool result and save; aborting here corrupts its transcript.
    for (const { ask } of this.asks.values()) if (!ask.accepted && !ask.ended) this.cancelAsk(ask.instance)
    for (const session of this.sessions.values()) this.track(this.cleanupSession(session))
    this.resourceCleanup = (async () => {
      // Creating actors can finish late and enqueue their own cleanup; drain until stable.
      while (this.work.size) await Promise.allSettled([...this.work])
      await this.options.disposeResources?.()
    })()
    void this.resourceCleanup.catch(error => { this.cleanupErrors.push(error) })
  }

  private cleanupSession(session: ActorSession): Promise<void> {
    return session.cleanup ??= session.tail.then(async () => { try { await this.disposeTools(session.tools) } finally { this.sessions.delete(session.identity.sessionId) } })
  }

  private async disposeTools(tools: MiraFlowActorTools): Promise<void> {
    try { await tools.dispose?.() } catch (error) { this.cleanupErrors.push(error); throw error }
  }

  private track(promise: Promise<unknown>, captureError = true): void {
    this.work.add(promise)
    void promise.then(() => this.work.delete(promise), error => { this.work.delete(promise); if (captureError) this.cleanupErrors.push(error) })
  }

  /** Await before closing host storage or publishing a final run snapshot. */
  async waitForIdle(): Promise<void> {
    while (this.work.size) await Promise.allSettled([...this.work])
    if (this.resourceCleanup) await Promise.allSettled([this.resourceCleanup])
    if (this.cleanupErrors.length) throw this.cleanupErrors[0]
  }
}

function asFlowError(error: unknown): MiraFlowError {
  return error instanceof MiraFlowError ? error : new MiraFlowError('DriverError', error instanceof Error ? error.message : String(error), { cause: error })
}

export function createMiraFlowActorDriver(options: MiraFlowActorDriverOptions): (sink: MiraFlowReportSink) => MiraFlowActorDriver {
  return sink => new MiraFlowActorDriver(options, sink)
}
