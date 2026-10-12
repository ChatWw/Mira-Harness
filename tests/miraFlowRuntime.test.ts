import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { compileMiraFlow } from '../electron/services/flows/miraFlowCompile'
import { MiraFlowCompiler } from '../electron/services/flows/miraFlowCompiler'
import { MiraFlowJournal } from '../electron/storage/miraFlowJournal'
import {
  InMemoryJournalStore, validate,
  type MiraFlowDriver, type MiraFlowReportSink, type AskMessage,
  type SessionRef, type InstanceRef, type SubmitVerdict, type JsonSchema, type JournalStorePort,
} from '../packages/mira-flow-kit/src/mira-index'
import type { runMiraFlowScript } from '../packages/mira-flow-runtime/src/mira-index'

const require = createRequire(import.meta.url)
const validateResult = (schema: unknown, value: unknown) => validate(schema as JsonSchema, value)
let output: string
let run: typeof runMiraFlowScript
const temporary: string[] = []
const directory = () => { const path = mkdtempSync(join(tmpdir(), 'mira-flow-runtime-')); temporary.push(path); return path }

beforeAll(() => {
  output = directory()
  // Real minified+keepNames artifacts, including bundled TypeScript. No live app is replaced.
  execFileSync(process.execPath, ['--input-type=module', '-e',
    'import {buildMiraFlow} from "./scripts/build-mira-flow.mjs"; await buildMiraFlow(process.argv[1]);', output],
  { cwd: resolve('.'), stdio: 'pipe' })
  run = require(join(output, 'mira-flow-runtime.cjs')).runMiraFlowScript
}, 20_000)
afterAll(() => { for (const path of temporary) rmSync(path, { recursive: true, force: true }) })

function fixture(handle?: (sink: MiraFlowReportSink, instance: InstanceRef, message: AskMessage) => void, journal: JournalStorePort = new InMemoryJournalStore()) {
  const calls: { session: SessionRef; instance: InstanceRef; message: AskMessage }[] = []
  const verdicts: SubmitVerdict[] = []
  const cancellations: InstanceRef[] = []
  let actors = 0, disposed = 0
  const makeDriver = (sink: MiraFlowReportSink): MiraFlowDriver => ({
    journal, emit() {},
    async createActorSession() { actors += 1; return { id: `actor-session-${actors}` } },
    startAsk(session, instance, message) {
      calls.push({ session, instance, message })
      queueMicrotask(() => handle ? handle(sink, instance, message) : sink.askTurnEnded(instance, message.instructions))
    },
    respondToSubmit(_instance, verdict) { verdicts.push(verdict) },
    cancelAsk(instance) { cancellations.push(instance) },
    async executeWorldRead() { throw new Error('No world adapter in runtime fixture') },
    dispose() { disposed += 1 },
  })
  return { journal, makeDriver, calls, verdicts, cancellations, actors: () => actors, disposed: () => disposed }
}

async function execute(source: string, driver: ReturnType<typeof fixture>, extra: Record<string, unknown> = {}) {
  const compiled = compileMiraFlow(source)
  expect(compiled.ok).toBe(true)
  return run({
    scriptText: source, lowered: compiled.executable!.code,
    scriptHash: compiled.sourceHash, runId: 'fixture-run', cwd: directory(),
    makeDriver: driver.makeDriver, caps: { maxConcurrency: 2 },
    askSpecs: new Map(compiled.executable!.askSpecs), validate: validateResult, timeoutMs: 5_000, ...extra,
  })
}

describe('real bundled Mira workflow child process', () => {
  it('persists real child execution to SQLite and recovers identical results after closing and reopening', async () => {
    const path = join(directory(), 'workflow.sqlite')
    let database = new Database(path)
    try {
      database.pragma('foreign_keys = ON')
      let journal = new MiraFlowJournal(database)
      journal.initialize()
      const driver = fixture(undefined, journal)
      const source = 'const actor = agent("writer"); const first = await actor.ask("first"); report({ first }); phase("finish"); return await actor.ask(first + "-again");'
      const result = await execute(source, driver)
      expect(result).toEqual({ status: 'completed', artifact: 'first-again' })
      const run = journal.getRun('fixture-run'), nodes = journal.listNodes('fixture-run'), events = journal.listEvents('fixture-run')
      expect(run?.scriptText).toBe(source)
      expect(run?.scriptHash).toBe(compileMiraFlow(source).sourceHash)
      expect(nodes.filter(node => node.kind === 'ask')).toHaveLength(2)
      expect(events.length).toBeGreaterThan(2)
      expect(events.map(item => item.sequence)).toEqual(events.map((_item, index) => index))
      database.close()
      database = new Database(path)
      journal = new MiraFlowJournal(database)
      journal.initialize()
      expect(journal.recoverInterruptedRuns()).toBe(0)
      expect(journal.getRun('fixture-run')).toEqual(run)
      expect(journal.listNodes('fixture-run')).toEqual(nodes)
      expect(journal.listEvents('fixture-run')).toEqual(events)
      expect(journal.listEvents('fixture-run', { afterSequence: 0, limit: 2 })).toEqual(events.slice(1, 3))
    } finally { database.close() }
  })

  it('executes branches, joins and repeated asks with actor context identity and node ordinals', async () => {
    const driver = fixture()
    const result = await execute(`const reviewer = agent("reviewer");
const first = await reviewer.ask("first");
const other = agent("other");
const joined = await Promise.all([reviewer.ask(first + "-next"), other.ask("parallel")]);
const repeated: string[] = [];
for (let index = 0; index < 2; index++) repeated.push(await reviewer.ask("repeat-" + index));
phase("done"); report(joined);
return { joined, repeated };`, driver)
    expect(result).toEqual({ status: 'completed', artifact: { joined: ['first-next', 'parallel'], repeated: ['repeat-0', 'repeat-1'] } })
    expect(driver.actors()).toBe(2)
    const same = driver.calls.filter(call => call.message.instructions !== 'parallel')
    expect(new Set(same.map(call => call.session.id)).size).toBe(1)
    expect(same.slice(-2).map(call => call.instance.ordinal)).toEqual([1, 2])
    expect(driver.journal.listNodes('fixture-run').filter(node => node.kind === 'ask')).toHaveLength(5)
    if (result.status !== 'completed') throw new Error('Expected completed workflow fixture')
    expect(driver.journal.getRun('fixture-run')?.result).toEqual(result.artifact)
    expect(driver.disposed()).toBe(1)
  })

  it('validates typed submit and repairs it through the real engine instead of parsing final prose', async () => {
    const driver = fixture((sink, instance) => {
      sink.askSubmitAttempted(instance, { count: 'wrong' })
      sink.askSubmitAttempted(instance, { count: 2 })
    })
    const result = await execute('interface Result { count: number }; return await agent("typed").ask<Result>("Count");', driver)
    expect(result).toEqual({ status: 'completed', artifact: { count: 2 } })
    expect(driver.verdicts.map(item => item.kind)).toEqual(['reject', 'accept'])
  })

  it('maps script exceptions to errored while disposing once', async () => {
    const driver = fixture()
    const result = await execute('throw new Error("script-broken");', driver)
    expect(result.status).toBe('errored')
    expect(driver.journal.getRun('fixture-run')?.failure?.message).toContain('script-broken')
    expect(driver.disposed()).toBe(1)
  })

  it('kills non-yielding script on wall time and records interrupted rather than successful completion', async () => {
    const driver = fixture()
    const result = await execute('while (true) {}', driver, { timeoutMs: 100 })
    expect(result.status).toBe('stopped')
    expect(driver.journal.getRun('fixture-run')?.stopReason).toBe('interrupted')
    expect(driver.disposed()).toBe(1)
  })

  it('cancels both an in-flight ask and the script process, retaining prior records', async () => {
    const abort = new AbortController()
    const driver = fixture(() => abort.abort('user'))
    const result = await execute('return await agent("waiting").ask("Wait");', driver, { signal: abort.signal })
    expect(result.status).toBe('stopped')
    expect(driver.journal.getRun('fixture-run')?.stopReason).toBe('user')
    expect(driver.cancellations).toHaveLength(1)
    expect(driver.disposed()).toBe(1)
    expect(driver.journal.listNodes('fixture-run')).toHaveLength(1)
  })

  it('settles a pre-cancelled run without creating a child entry or dispatching work', async () => {
    const abort = new AbortController(), cwd = directory(), driver = fixture()
    abort.abort('model')
    const result = await execute('return 1;', driver, { signal: abort.signal, cwd })
    expect(result.status).toBe('stopped')
    expect(driver.journal.getRun('fixture-run')?.stopReason).toBe('model')
    expect(existsSync(join(cwd, '.mira'))).toBe(false)
    expect(driver.calls).toHaveLength(0)
    expect(driver.disposed()).toBe(1)
  })

  it('has no ambient Node or browser globals in its actual VM context', async () => {
    const driver = fixture()
    // Trusted host-level probe of the VM, bypassing compiler only in this test.
    const result = await run({
      lowered: 'return [typeof process, typeof require, typeof Buffer, typeof fetch];',
      runId: 'probe', cwd: directory(), makeDriver: driver.makeDriver,
      caps: { maxConcurrency: 1 }, askSpecs: new Map(), validate: validateResult, timeoutMs: 5_000,
    })
    expect(result).toEqual({ status: 'completed', artifact: ['undefined', 'undefined', 'undefined', 'undefined'] })
  })
})

describe('bundled compilation worker', () => {
  it('compiles off the host thread with exact source identity', async () => {
    const compiler = new MiraFlowCompiler(join(output, 'mira-flow-compile.worker.cjs'))
    const source = 'return await agent("worker").ask("Check");'
    expect(await compiler.compile(source)).toEqual(compileMiraFlow(source))
    compiler.dispose()
  })

  it('cancels superseded work and retains the new request', async () => {
    const compiler = new MiraFlowCompiler(join(output, 'mira-flow-compile.worker.cjs'))
    const old = compiler.compile('return 1;').catch(error => error.message)
    const current = compiler.compile('return 2;')
    expect(await old).toBe('工作流编译已取消')
    expect((await current).ok).toBe(true)
    compiler.dispose()
  })

  it('aborts a real pending worker, and accepts a later compilation', async () => {
    const compiler = new MiraFlowCompiler(join(output, 'mira-flow-compile.worker.cjs'))
    const abort = new AbortController()
    const result = compiler.compile('return 1;', abort.signal).catch(error => error.message)
    abort.abort()
    expect(await result).toBe('工作流编译已取消')
    expect((await compiler.compile('return 3;')).ok).toBe(true)
    compiler.dispose()
  })
})
