import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiraFlowEngine, type MiraFlowDriver, type NodeRecord, type RunRecord } from '../packages/mira-flow-kit/src/mira-index'
import { MiraFlowJournal } from '../electron/storage/miraFlowJournal'

const databases: Database.Database[] = []
const directories: string[] = []
afterEach(() => {
  vi.useRealTimers()
  databases.splice(0).forEach(database => { if (database.open) database.close() })
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})
function open(path = ':memory:') {
  const database = new Database(path); databases.push(database)
  database.pragma('foreign_keys = ON')
  const journal = new MiraFlowJournal(database); journal.initialize()
  return { database, journal }
}
const run = (runId = 'r'): RunRecord => ({ runId, parentSessionId: 'parent', cwd: '/project', scriptText: 'return args', scriptHash: 'source-hash', args: { name: 'Mira' }, caps: { maxConcurrency: 2 }, spentTokens: 0, status: 'running' })
const node = (siteId = 'ask#1', actorSeq = 1): NodeRecord => ({ runId: 'r', siteId, ordinal: 1, kind: 'ask', actorSiteId: 'actor#1', actorOrdinal: 1, actorSeq, inputHash: 'hash', status: 'running' })

describe('Mira real SQLite flow journal', () => {
  it('initializes only its own tables without altering Harness data or recovering a live run', () => {
    const { database, journal } = open()
    database.exec("CREATE TABLE harness_sentinel(value TEXT); INSERT INTO harness_sentinel VALUES ('keep')")
    journal.createRun(run()); journal.initialize()
    expect(journal.getRun('r')?.status).toBe('running')
    expect(database.prepare('SELECT value FROM harness_sentinel').get()).toEqual({ value: 'keep' })
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'mira_flow_%' ORDER BY name").all()).toEqual(['mira_flow_actors', 'mira_flow_events', 'mira_flow_nodes', 'mira_flow_review_graphs', 'mira_flow_runs'].map(name => ({ name })))
  })
  it('freezes the source-bound compiler graph across resume, reopen and independent reads', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-flow-graph-')); directories.push(directory)
    const path = join(directory, 'state.sqlite'), first = open(path)
    const graph = { phases: [{ id: 'phase', name: '批准的阶段' }], participants: [], handoffs: [], phaseEdges: [], steps: [], truncated: false }
    first.journal.createRun(run())
    expect(first.journal.getReviewGraph('r', 'source-hash')).toBeUndefined()
    expect(() => first.journal.putReviewGraph('missing', 'source-hash', graph)).toThrow('unknown run')
    expect(() => first.journal.putReviewGraph('r', 'other-source', graph)).toThrow('身份不一致')
    first.journal.putReviewGraph('r', 'source-hash', graph)
    graph.phases[0]!.name = '后续修改'
    first.journal.putReviewGraph('r', 'source-hash', graph)
    first.journal.updateRunStatus('r', 'stopped', { stopReason: 'user' })
    first.journal.updateRunStatus('r', 'running')
    first.database.close()
    const second = open(path), saved = second.journal.getReviewGraph('r', 'source-hash')!
    expect(saved.phases[0]!.name).toBe('批准的阶段')
    saved.phases[0]!.name = '读者修改'
    expect(second.journal.getReviewGraph('r', 'source-hash')?.phases[0]?.name).toBe('批准的阶段')
    expect(second.journal.getReviewGraph('r', 'other-source')).toBeUndefined()
    expect(second.journal.getRun('r')).toEqual(run())
    second.database.prepare('DELETE FROM mira_flow_runs WHERE run_id = ?').run('r')
    expect(second.database.prepare('SELECT COUNT(*) AS count FROM mira_flow_review_graphs').get()).toEqual({ count: 0 })
  })
  it('persists source, actors, nodes, settlement and event timestamps after closing and reopening SQLite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-flow-journal-')); directories.push(directory)
    const path = join(directory, 'state.sqlite'), first = open(path)
    const record = { ...run(), name: 'Actual flow', toolCallId: 'tool', resumedFrom: 'previous' }
    first.journal.createRun(record)
    first.journal.putActor({ runId: 'r', siteId: 'actor#1', ordinal: 1, persona: { system: 'Task' }, sessionId: 'child', resolvedModel: 'p/m' })
    first.journal.putNode({ ...node(), status: 'completed', result: { answer: 1 }, messageBoundary: 2 })
    first.journal.updateRunStatus('r', 'completed', { result: { artifact: 'real' } })
    vi.useFakeTimers(); vi.setSystemTime(12345)
    const event = first.journal.appendEvent('r', { type: 'run-settled', status: 'completed' })
    first.database.close(); const second = open(path)
    expect(second.journal.getRun('r')).toEqual({ ...record, status: 'completed', result: { artifact: 'real' } })
    expect(second.journal.getActor('r', 'actor#1', 1)).toMatchObject({ sessionId: 'child', resolvedModel: 'p/m' })
    expect(second.journal.getNode('r', 'ask#1', 1)).toMatchObject({ result: { answer: 1 }, messageBoundary: 2 })
    expect(second.journal.listEvents('r')).toEqual([event]); expect(event.timeCreated).toBe(12345)
    expect(second.journal.appendEvent('r', { type: 'log', message: 'next' }).sequence).toBe(event.sequence + 1)
  })
  it('updates terminal status and result together, clears obsolete failure, preserves omitted results and clears resume envelopes', () => {
    const { journal } = open(); journal.createRun(run())
    journal.updateRunStatus('r', 'stopped', { stopReason: 'interrupted', failure: { code: 'Interrupted', message: 'Closed' } })
    journal.updateRunStatus('r', 'completed', { result: null })
    expect(journal.getRun('r')).toEqual({ ...run(), status: 'completed', result: null })
    journal.updateRunStatus('r', 'completed'); expect(journal.getRun('r')?.result).toBeNull()
    journal.updateRunStatus('r', 'errored', { failure: { code: 'DriverError', message: 'Actual failure' } })
    expect(journal.getRun('r')).toMatchObject({ status: 'errored', failure: { code: 'DriverError' } })
    journal.updateRunStatus('r', 'running', { result: 'ignored', failure: { code: 'Interrupted', message: 'ignored' } })
    expect(journal.getRun('r')).toEqual(run())
  })
  it('keeps supersession reason and successor in the same settlement and usage/caps preserve all other fields', () => {
    const { journal } = open(); journal.createRun(run())
    journal.updateRunStatus('r', 'stopped', { stopReason: 'superseded', supersededBy: 'new-run', failure: { code: 'Interrupted', message: 'reason' } })
    const before = journal.getRun('r')!
    journal.updateRunUsage('r', 27); journal.updateRunCaps('r', { maxConcurrency: 4 })
    expect(journal.getRun('r')).toEqual({ ...before, spentTokens: 27, caps: { maxConcurrency: 4 } })
  })
  it('enforces composite node identity and unique ask actor sequence without overwriting the prior record on conflict', () => {
    const { journal } = open(); journal.createRun(run()); journal.createRun(run('other'))
    journal.putActor({ runId: 'r', siteId: 'actor#1', ordinal: 1, name: 'original' })
    journal.putActor({ runId: 'r', siteId: 'actor#1', ordinal: 1, name: 'updated' })
    journal.putNode(node())
    expect(() => journal.putNode(node('ask#2'))).toThrow()
    expect(() => journal.putNode({ ...node('ask#3', 3), actorSeq: undefined })).toThrow()
    expect(journal.getNode('r', 'ask#1', 1)).toEqual(node())
    expect(journal.getNode('r', 'ask#2', 1)).toBeUndefined()
    journal.putNode({ ...node(), status: 'completed', result: { answer: 'ok' } })
    journal.putNode({ ...node('ask#2', 2), ordinal: 2 })
    journal.putNode({ ...node(), runId: 'other' })
    expect(journal.listNodes('r')).toHaveLength(2); expect(journal.listActors('r')[0]!.name).toBe('updated')
  })
  it('rejects every unknown run write and duplicate creation without creating orphan rows', () => {
    const { journal } = open()
    for (const write of [() => journal.updateRunStatus('missing', 'completed'), () => journal.updateRunUsage('missing', 1), () => journal.updateRunCaps('missing', { maxConcurrency: 1 }), () => journal.putActor({ runId: 'missing', siteId: 'a', ordinal: 1 }), () => journal.putNode({ ...node(), runId: 'missing' }), () => journal.appendEvent('missing', { type: 'log', message: 'orphan' })]) expect(write).toThrow('unknown run')
    expect(journal.getRun('missing')).toBeUndefined(); expect(journal.listActors('missing')).toEqual([]); expect(journal.listNodes('missing')).toEqual([]); expect(journal.listEvents('missing')).toEqual([])
    journal.createRun(run()); expect(() => journal.createRun({ ...run(), scriptText: 'overwrite' })).toThrow('already exists'); expect(journal.getRun('r')).toEqual(run())
  })
  it('paginates strictly after the stored sequence in SQL with independent runs and writer instances', () => {
    const { journal, database } = open(), second = new MiraFlowJournal(database)
    journal.createRun(run()); journal.createRun(run('other'))
    expect(journal.appendEvent('r', { type: 'log', message: 'one' }).sequence).toBe(0)
    expect(second.appendEvent('r', { type: 'log', message: 'two' }).sequence).toBe(1)
    expect(journal.appendEvent('other', { type: 'log', message: 'other' }).sequence).toBe(0)
    expect(journal.appendEvent('r', { type: 'log', message: 'three' }).sequence).toBe(2)
    expect(journal.listEvents('r', { afterSequence: 0, limit: 1 }).map(item => item.sequence)).toEqual([1])
    expect(journal.listEvents('r', { afterSequence: 1 }).map(item => item.sequence)).toEqual([2])
    expect(journal.listEvents('r', { limit: 0 })).toEqual([]); expect(journal.listEvents('r', { afterSequence: 999 })).toEqual([])
  })
  it('detaches JSON input and output references and preserves world/artifact node fields', () => {
    const { journal } = open(), record = run(); journal.createRun(record); record.args!.name = 'changed'
    const read = journal.getRun('r')!; read.caps.maxConcurrency = 90
    expect(journal.getRun('r')?.args).toEqual({ name: 'Mira' }); expect(journal.getRun('r')?.caps.maxConcurrency).toBe(2)
    const world: NodeRecord = { runId: 'r', siteId: 'world-read#1', ordinal: 1, kind: 'world-read', inputHash: 'input', status: 'completed', input: { op: 'read', args: ['file'] }, result: 'text' }
    journal.putNode(world); journal.putNode({ ...world, siteId: 'artifact#1', kind: 'artifact', artifactId: 'report', result: { uri: 'store://artifact' } })
    expect(journal.getNode('r', 'world-read#1', 1)).toEqual(world); expect(journal.listNodes('r').find(item => item.kind === 'artifact')?.artifactId).toBe('report')
  })
  it('recovers only unfinished runs transactionally, preserving completed nodes and in-flight replay markers', () => {
    const { journal } = open(); journal.createRun(run()); journal.createRun({ ...run('pending'), status: 'pending' }); journal.createRun({ ...run('done'), status: 'completed', result: 'keep' }); journal.createRun({ ...run('error'), status: 'errored', failure: { code: 'DriverError', message: 'keep' } })
    journal.putNode(node()); journal.putNode({ ...node('ask#2', 2), status: 'completed', result: 'keep' })
    expect(journal.recoverInterruptedRuns()).toBe(2)
    expect(journal.getRun('r')).toMatchObject({ status: 'stopped', stopReason: 'interrupted', failure: { code: 'Interrupted' } })
    expect(journal.getRun('pending')?.status).toBe('stopped'); expect(journal.getRun('done')?.result).toBe('keep'); expect(journal.getRun('error')?.failure?.message).toBe('keep')
    expect(journal.getNode('r', 'ask#1', 1)).toEqual(node()); expect(journal.getNode('r', 'ask#2', 1)?.result).toBe('keep')
    expect(journal.listEvents('r').at(-1)?.event).toMatchObject({ type: 'run-settled', status: 'stopped', stopReason: 'interrupted' })
    expect(journal.recoverInterruptedRuns()).toBe(0); expect(journal.listEvents('r')).toHaveLength(1)
  })
  it('rolls back recovery status changes if the journal event cannot be persisted', () => {
    const { journal, database } = open(); journal.createRun(run()); journal.createRun(run('other'))
    database.exec("CREATE TRIGGER reject_flow_recovery BEFORE INSERT ON mira_flow_events WHEN NEW.run_id = 'other' BEGIN SELECT RAISE(ABORT, 'event persistence failed'); END")
    expect(() => journal.recoverInterruptedRuns()).toThrow('event persistence failed')
    expect(journal.getRun('r')).toEqual(run()); expect(journal.getRun('other')).toEqual(run('other'))
    expect(journal.listEvents('r')).toEqual([])
    database.exec('DROP TRIGGER reject_flow_recovery')
    expect(journal.recoverInterruptedRuns()).toBe(2)
  })
  it('preserves stopped partial work across reopen and redispatches only the real unfinished ask on engine resume', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-flow-resume-')); directories.push(directory)
    const path = join(directory, 'state.sqlite'), first = open(path)
    const specs = new Map([['ask#1', { typed: false }], ['ask#2', { typed: false }]])
    const startFirst = vi.fn(), startResumed = vi.fn()
    let initial!: MiraFlowEngine, resumed!: MiraFlowEngine
    const makeDriver = (journal: MiraFlowJournal, completed: (siteId: string, text: string) => void, start: typeof startFirst): MiraFlowDriver => ({
      journal, emit: () => {}, createActorSession: async () => ({ id: 'same-actor-session' }),
      startAsk: (_session, instance, message) => { start(message.instructions); completed(instance.siteId, message.instructions) },
      respondToSubmit: () => {}, cancelAsk: () => {}, executeWorldRead: async () => null,
    })
    const config = { runId: 'r', caps: { maxConcurrency: 2 }, askSpecs: specs, validate: () => [], scriptText: 'actual source', scriptHash: 'same-hash' }
    initial = new MiraFlowEngine({ ...config, driver: makeDriver(first.journal, (siteId, text) => { if (siteId === 'ask#1') initial.askTurnEnded({ siteId, ordinal: 1 }, text) }, startFirst) })
    const actor = initial.createActor('actor#1', 'Mira actor')
    expect(await initial.ask('ask#1', actor, 'completed partial')).toBe('completed partial')
    void initial.ask('ask#2', actor, 'unfinished remainder')
    await vi.waitFor(() => expect(startFirst).toHaveBeenCalledTimes(2))
    first.journal.updateRunUsage('r', 17); first.database.close()
    const second = open(path)
    expect(second.journal.recoverInterruptedRuns()).toBe(1)
    expect(second.journal.getNode('r', 'ask#1', 1)?.result).toBe('completed partial')
    expect(second.journal.getNode('r', 'ask#2', 1)?.status).toBe('running')
    second.database.close(); const third = open(path)
    expect(third.journal.recoverInterruptedRuns()).toBe(0)
    expect(third.journal.getRun('r')).toMatchObject({ status: 'stopped', stopReason: 'interrupted', spentTokens: 17 })
    resumed = new MiraFlowEngine({ ...config, driver: makeDriver(third.journal, (siteId, text) => resumed.askTurnEnded({ siteId, ordinal: 1 }, text), startResumed) })
    const resumedActor = resumed.createActor('actor#1', 'Mira actor')
    expect(await resumed.ask('ask#1', resumedActor, 'completed partial')).toBe('completed partial')
    expect(await resumed.ask('ask#2', resumedActor, 'unfinished remainder')).toBe('unfinished remainder')
    expect(startResumed.mock.calls).toEqual([['unfinished remainder']])
    resumed.complete({ actual: 'joined result' })
    expect(await resumed.settled).toMatchObject({ status: 'completed', artifact: { actual: 'joined result' } })
    expect(third.journal.getRun('r')).toMatchObject({ status: 'completed', spentTokens: 17, result: { actual: 'joined result' } })
    expect(third.journal.getRun('r')?.failure).toBeUndefined()
  })
})
