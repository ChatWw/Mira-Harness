import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { createAssistantMessageEventStream, type AssistantMessage, type Context, type Model } from '@earendil-works/pi-ai'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import { createMiraFlowActorDriver } from '../electron/services/flows/miraFlowActorDriver'
import { createMiraFlowWorld } from '../electron/services/flows/miraFlowWorld'
import { MiraFlowActorStore } from '../electron/storage/miraFlowActorStore'
import { MiraFlowJournal } from '../electron/storage/miraFlowJournal'
import { MiraFlowCompiler } from '../electron/services/flows/miraFlowCompiler'
import { MiraFlowRunService, type MiraFlowLaunch, type MiraFlowRunHost } from '../electron/services/flows/miraFlowRunService'
import { InMemoryJournalStore, type AskMessage, type InstanceRef, type MiraFlowReportSink } from '../packages/mira-flow-kit/src/mira-index'
import type { runMiraFlowScript } from '../packages/mira-flow-runtime/src/mira-index'

const require = createRequire(import.meta.url), temporary: string[] = []
const directory = () => { const path = realpathSync(mkdtempSync(join(tmpdir(), 'mira-flow-service-'))); temporary.push(path); return path }
let output: string, runtime: typeof runMiraFlowScript
beforeAll(() => {
  output = directory()
  execFileSync(process.execPath, ['--input-type=module', '-e', 'import {buildMiraFlow} from "./scripts/build-mira-flow.mjs"; await buildMiraFlow(process.argv[1]);', output], { cwd: resolve('.'), stdio: 'pipe' })
  runtime = require(join(output, 'mira-flow-runtime.cjs')).runMiraFlowScript
}, 20_000)
afterAll(() => temporary.forEach(path => rmSync(path, { recursive: true, force: true })))

function fixture(handle?: (sink: MiraFlowReportSink, instance: InstanceRef, message: AskMessage) => void) {
  const journal = new InMemoryJournalStore(), calls: string[] = []
  const emit = vi.fn(), idle = vi.fn(async () => undefined), disposed = vi.fn()
  const createCompiler = vi.fn(() => new MiraFlowCompiler(join(output, 'mira-flow-compile.worker.cjs')))
  const host: MiraFlowRunHost = { journal, run: runtime, createCompiler, timeoutMs: 5_000, emit,
    makeDriver(context) {
      // Prototype methods must survive host composition.
      return sink => new class {
        journal = context.journal
        emit = context.emit
        async createActorSession() { return { id: `${context.runId}:writer` } }
        startAsk(_session: unknown, instance: InstanceRef, message: AskMessage) { calls.push(message.instructions); queueMicrotask(() => handle ? handle(sink, instance, message) : sink.askTurnEnded(instance, message.instructions)) }
        respondToSubmit() {}
        cancelAsk() {}
        async executeWorldRead() { throw new Error('not used in fixture') }
        waitForIdle = idle
        dispose = disposed
      }()
    },
  }
  const service = new MiraFlowRunService(host)
  const input: MiraFlowLaunch = { parentSessionId: 'parent', cwd: directory(), source: 'const a=agent("writer"); return await a.ask(String(args.prefix));', args: { prefix: 'original' }, maxConcurrency: 2 }
  return { service, journal, input, calls, emit, idle, createCompiler, disposed, host }
}

describe('host-owned workflow launches using the real compiler and child', () => {
  it('persists the approved graph before executing actors and snapshots it without recompiling', async () => {
    const f = fixture()
    let approved: Parameters<NonNullable<MiraFlowRunHost['reviewGraphs']>['putReviewGraph']>[2] | undefined
    const stored = new Map<string, { sourceHash: string; graph: typeof approved }>()
    const getReviewGraph = vi.fn((runId: string, sourceHash: string) => stored.get(runId)?.sourceHash === sourceHash ? structuredClone(stored.get(runId)!.graph) : undefined)
    f.host.reviewGraphs = { getReviewGraph, putReviewGraph: (runId, sourceHash, graph) => {
      expect(f.journal.getRun(runId)?.scriptHash).toBe(sourceHash)
      expect(f.calls).toEqual([])
      stored.set(runId, { sourceHash, graph: structuredClone(graph) })
    } }
    const execution = await f.service.start(f.input, async review => { approved = structuredClone(review.reviewGraph); return true })
    await execution.settled
    expect(() => f.service.snapshot(execution.runId, 'foreign')).toThrow('不属于')
    expect(getReviewGraph).not.toHaveBeenCalled()
    expect(f.service.snapshot(execution.runId, 'parent').graph).toEqual(approved)
    expect(f.service.snapshot(execution.runId, 'parent').graph).toEqual(approved)
    expect(f.createCompiler).toHaveBeenCalledTimes(1)
    await f.service.dispose()
  })
  it('releases the driver without executing the script if source graph persistence fails', async () => {
    const f = fixture()
    f.host.reviewGraphs = { getReviewGraph: () => undefined, putReviewGraph() { throw new Error('graph storage failed') } }
    const execution = await f.service.start(f.input)
    await expect(execution.settled).rejects.toThrow('graph storage failed')
    expect(f.calls).toEqual([])
    expect(f.journal.getRun(execution.runId)).toMatchObject({ status: 'stopped', stopReason: 'interrupted' })
    expect(f.emit.mock.calls.filter(([, event]) => event.type === 'run-settled')).toEqual([
      [execution.runId, expect.objectContaining({ type: 'run-settled', status: 'stopped', stopReason: 'interrupted' })],
    ])
    expect(f.disposed).toHaveBeenCalled(); expect(f.idle).toHaveBeenCalled()
    await f.service.dispose()
  })
  it('notifies observers only after the interrupted graph failure is durable and preserves the original error when an observer throws', async () => {
    const f = fixture(), warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const observations: { status: string | undefined; lastEvent: unknown; event: unknown }[] = []
    f.host.reviewGraphs = { getReviewGraph: () => undefined, putReviewGraph() { throw new Error('graph storage failed') } }
    f.emit.mockImplementation((runId, event) => {
      if (event.type !== 'run-settled') return
      observations.push({ status: f.journal.getRun(runId)?.status, lastEvent: f.journal.listEvents(runId).at(-1)?.event, event })
      throw new Error('observer failed')
    })
    try {
      const run = await f.service.start(f.input)
      await expect(run.settled).rejects.toThrow('graph storage failed')
      expect(f.emit.mock.calls.filter(([, event]) => event.type === 'run-settled')).toHaveLength(1)
      expect(observations).toEqual([{ status: 'stopped', lastEvent: observations[0]!.event, event: expect.objectContaining({ type: 'run-settled', status: 'stopped', stopReason: 'interrupted' }) }])
      expect(f.calls).toEqual([])
    } finally { await f.service.dispose(); warn.mockRestore() }
  })
  it('isolates a failing UI observer from the real execution and still releases the driver', async () => {
    const f = fixture(), warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    f.emit.mockImplementation(() => { throw new Error('host-observer-failed') })
    try {
      const run = await f.service.start(f.input)
      expect(await run.settled).toEqual({ status: 'completed', artifact: 'original' })
      expect(f.journal.getRun(run.runId)?.status).toBe('completed')
      expect(f.disposed).toHaveBeenCalled(); expect(f.idle).toHaveBeenCalled()
    } finally { await f.service.dispose(); warn.mockRestore() }
  })
  it('closes a driver and records an interrupted run when host execution rejects after engine construction', async () => {
    const f = fixture()
    f.host.run = options => runtime({ ...options, control: { bind() { throw new Error('injected-host-control-error') } } })
    const run = await f.service.start(f.input)
    await expect(run.settled).rejects.toThrow('injected-host-control-error')
    expect(f.journal.getRun(run.runId)).toMatchObject({ status: 'stopped', stopReason: 'interrupted' })
    expect(f.disposed).toHaveBeenCalled(); expect(f.idle).toHaveBeenCalled()
    await f.service.dispose()
  })
  it('runs real Pi actors through a bundled child, repairs typed submissions and durably reuses the conversation', async () => {
    const path = join(directory(), 'actors.sqlite'), workspace = directory()
    let database = new Database(path)
    let service: MiraFlowRunService | undefined
    try {
      database.pragma('foreign_keys = ON')
      const journal = new MiraFlowJournal(database); journal.initialize()
      const contexts = new MiraFlowActorStore(database); contexts.initialize()
      writeFileSync(join(workspace, 'notes.txt'), 'FIRST from a real file', 'utf8')
      const artifactRoot = join(workspace, '.mira', 'artifacts')
      const model: Model<'openai-completions'> = { id: 'fixture', name: 'Fixture', api: 'openai-completions', provider: 'fixture', baseUrl: 'http://127.0.0.1:1', reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
      const requests: Context[] = []
      const results = [{ count: 'invalid' }, { count: 1 }, { count: 2 }]
      const streamFn: StreamFn = (_selected, context) => {
        const index = requests.length, result = results[index]
        if (!result) throw new Error('Unexpected additional model request')
        // Pi supplies tool implementations too; retain the serializable provider request.
        requests.push(JSON.parse(JSON.stringify(context)) as Context)
        const stream = createAssistantMessageEventStream()
        const call = { type: 'toolCall' as const, id: `submit-${index}`, name: 'submit_result', arguments: { result } }
        const message: AssistantMessage = { role: 'assistant', content: [call], api: model.api, provider: model.provider, model: model.id,
          timestamp: index, stopReason: 'toolUse', usage: { input: 8, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
        queueMicrotask(() => { stream.push({ type: 'start', partial: message }); stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: call, partial: message }); stream.push({ type: 'done', reason: 'toolUse', message }) })
        return stream
      }
      service = new MiraFlowRunService({ journal, run: runtime, createCompiler: () => new MiraFlowCompiler(join(output, 'mira-flow-compile.worker.cjs')), emit() {}, timeoutMs: 5_000,
        makeDriver: context => {
          const world = createMiraFlowWorld({ workspacePath: context.cwd, signal: context.signal, artifactRoot })
          return createMiraFlowActorDriver({ ...context, contextStorage: contexts, resolveActor: async (_identity, pin) => {
            expect(pin === undefined || pin === 'fixture/fixture').toBe(true)
            return { model, streamFn, resolvedModel: 'fixture/fixture' }
          }, executeWorldRead: async (...args) => (await world).executeWorldRead(...args), executeArtifactPublish: async request => (await world).executeArtifactPublish(request) })
        },
      })
      const source = 'const text=await files.read("notes.txt"); const a=agent("writer"); const first=await a.ask<{count:number}>(text); phase("finish"); const second=await a.ask<{count:number}>("SECOND "+first.count); report(second); await artifact.markdown("result", "count:"+second.count); return second;'
      const execution = await service.start({ parentSessionId: 'parent', cwd: workspace, source, maxConcurrency: 2 })
      const settlement = await execution.settled
      expect(settlement, JSON.stringify(settlement)).toEqual({ status: 'completed', artifact: { count: 2 } })
      expect(requests).toHaveLength(3)
      expect(JSON.stringify(requests[2]!.messages)).toContain('FIRST')
      expect(JSON.stringify(requests[2]!.messages)).toContain('submit-1')
      const snapshot = service.snapshot(execution.runId, 'parent')
      expect(snapshot.events.some(item => item.event.type === 'node-repairing')).toBe(true)
      expect(snapshot.events.some(item => item.event.type === 'artifact-published')).toBe(true)
      const artifactDirectories = readdirSync(artifactRoot)
      expect(artifactDirectories).toHaveLength(1)
      const artifactDirectory = join(artifactRoot, artifactDirectories[0]!)
      const artifactFiles = readdirSync(artifactDirectory)
      expect(artifactFiles.some(file => readFileSync(join(artifactDirectory, file), 'utf8') === 'count:2')).toBe(true)
      expect(snapshot.run.spentTokens).toBe(30)
      const nodes = snapshot.nodes.filter(node => node.kind === 'ask')
      expect(nodes).toHaveLength(2)
      expect(nodes.every(node => (node.messageBoundary ?? 0) > 0)).toBe(true)
      expect(nodes[1]!.messageBoundary).toBeGreaterThan(nodes[0]!.messageBoundary!)
      const actor = snapshot.actors[0]!, stored = await contexts.loadOrCreate(actor.sessionId!)
      expect(stored.resolvedModel).toBe('fixture/fixture')
      expect(stored.messages.some(message => message.role === 'toolResult')).toBe(true)
      await service.dispose(); database.close()
      database = new Database(path)
      const reopened = new MiraFlowJournal(database); reopened.initialize()
      const reopenedContexts = new MiraFlowActorStore(database); reopenedContexts.initialize()
      expect(reopened.getRun(execution.runId)).toEqual(snapshot.run)
      expect(reopened.listNodes(execution.runId)).toEqual(snapshot.nodes)
      expect(await reopenedContexts.loadOrCreate(actor.sessionId!)).toEqual(stored)
    } finally { await service?.dispose(); if (database.open) database.close() }
  })

  it('executes the exact reviewed source and frozen parameters without another compile', async () => {
    const f = fixture()
    f.input.toolCallId = 'creator-tool'; f.input.launch = { inputId: 'creator-input', subagentModel: 'original/model', phaseNames: ['original'] }
    const launch = await f.service.start(f.input, async review => {
      expect(review.source).toBe(f.input.source); expect(review.sourceHash).toMatch(/^[a-f0-9]{64}$/)
      expect(review.reviewGraph.participants[0]?.name).toBe('writer')
      review.reviewGraph.participants[0]!.name = 'changed presentation'
      f.input.launch!.subagentModel = 'changed/model'; f.input.launch!.phaseNames!.push('injected')
      f.input.args!.prefix = 'mutated'; f.input.source = 'return "injected";'; f.input.maxConcurrency = 9
      return true
    })
    expect(await launch.settled).toEqual({ status: 'completed', artifact: 'original' })
    expect(f.journal.getRun(launch.runId)).toMatchObject({ args: { prefix: 'original' }, caps: { maxConcurrency: 2 }, parentSessionId: 'parent' })
    expect(f.journal.getRun(launch.runId)?.toolCallId).toBe('creator-tool')
    expect(f.journal.listEvents(launch.runId).find(item => item.event.type === 'run-launched')?.event).toMatchObject({ inputId: 'creator-input', subagentModel: 'original/model', phaseNames: ['original'] })
    expect(f.createCompiler).toHaveBeenCalledTimes(1); expect(f.idle).toHaveBeenCalledOnce()
    await f.service.dispose()
  })
  it('refuses declined/invalid launches before creating a run or executing any actor', async () => {
    const f = fixture(), create = vi.spyOn(f.journal, 'createRun')
    await expect(f.service.start(f.input, async () => false)).rejects.toThrow('未获批准')
    await expect(f.service.start({ ...f.input, source: 'return process.env;' })).rejects.toThrow()
    for (const args of [{ value: NaN }, { value: undefined }, { value: new Date() }]) await expect(f.service.start({ ...f.input, args })).rejects.toThrow('JSON')
    expect(create).not.toHaveBeenCalled(); expect(f.calls).toEqual([])
    await f.service.dispose()
  })
  it('resumes a stopped run with the original args and cached prefix, while rejecting concurrent and foreign ownership', async () => {
    let held!: () => void
    const pending = new Promise<void>(resolve => { held = resolve })
    let block = true
    const f = fixture((sink, instance, message) => {
      if (message.instructions === 'one') sink.askTurnEnded(instance, 'one-result')
      else if (block) held()
      else sink.askTurnEnded(instance, message.instructions)
    })
    f.input.source = 'const a=agent("writer"); const first=await a.ask("one"); return await a.ask(String(args.prefix)+first);'
    const first = await f.service.start(f.input); await pending
    expect(() => f.service.snapshot(first.runId, 'foreign')).toThrow('不属于')
    await expect(f.service.resume(first.runId, 'parent', f.input.cwd)).rejects.toThrow('已经运行中')
    f.service.setConcurrency(first.runId, 'parent', 1)
    expect(f.journal.getRun(first.runId)!.caps.maxConcurrency).toBe(1)
    expect(f.service.stop(first.runId, 'parent')).toBe(true)
    expect(await first.settled).toMatchObject({ status: 'stopped', reason: 'user' })
    f.input.args!.prefix = 'changed'; block = false
    const resumed = await f.service.resume(first.runId, 'parent', f.input.cwd)
    expect(resumed.runId).toBe(first.runId)
    expect(await resumed.settled).toEqual({ status: 'completed', artifact: 'originalone-result' })
    expect(f.calls.filter(value => value === 'one')).toHaveLength(1)
    const snapshot = f.service.snapshot(first.runId, 'parent', 0, 2)
    expect(snapshot.events).toHaveLength(2); expect(snapshot.events.every(event => event.sequence > 0)).toBe(true)
    await expect(f.service.resume(first.runId, 'parent', f.input.cwd)).rejects.toThrow('不能原样续跑')
    await f.service.dispose()
  })
  it('checks the persisted source hash and original canonical directory before resume', async () => {
    const f = fixture(() => undefined), launch = await f.service.start(f.input)
    f.service.stop(launch.runId, 'parent'); await launch.settled
    await expect(f.service.resume(launch.runId, 'parent', directory())).rejects.toThrow('身份不一致')
    const run = f.journal.getRun(launch.runId)!
    // Corrupt the exact persisted fixture source; the owner must reject it.
    Object.assign(run, { scriptText: 'return "changed";' })
    f.journal.getRun = vi.fn(() => run)
    await expect(f.service.resume(launch.runId, 'parent', f.input.cwd)).rejects.toThrow('身份不一致')
    await f.service.dispose()
  })
  it('closes the host with interrupted settlements and blocks subsequent launches', async () => {
    const f = fixture(() => undefined), launch = await f.service.start(f.input)
    await f.service.dispose()
    expect(await launch.settled).toMatchObject({ status: 'stopped', reason: 'interrupted' })
    await expect(f.service.start(f.input)).rejects.toThrow('已关闭')
  })
  it('waits for actor persistence even when shutdown is triggered by the synchronous first run event', async () => {
    const f = fixture(() => undefined)
    let closing: Promise<void> | undefined, flushed = false
    f.idle.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 15)); flushed = true })
    f.emit.mockImplementation(() => { closing ??= f.service.dispose() })
    const launch = await f.service.start(f.input)
    await closing; expect(flushed).toBe(true)
    expect(await launch.settled).toMatchObject({ status: 'stopped', reason: 'interrupted' })
  })
})
