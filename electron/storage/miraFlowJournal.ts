/* SQLite journal semantics adapted from ZCode's dwf-journal.ts and journal-memory.ts.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira adaptation: BetterSQLite connection, isolated Mira tables and explicit recovery. */
import type Database from 'better-sqlite3'
import type { ActorRecord, Caps, JournalStorePort, ListEventsOptions, NodeRecord, RunEvent, RunRecord, RunSettlementRecord, RunStatus, StoredEvent } from '../../packages/mira-flow-kit/src/mira-index'
import type { MiraFlowReviewGraph } from '../../src/config/miraFlowReview'

type PayloadRow = { payload: string }

export class MiraFlowJournal implements JournalStorePort {
  constructor(private readonly database: Database.Database) {}

  initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS mira_flow_runs (
        run_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('pending','running','completed','errored','stopped')),
        payload TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mira_flow_actors (
        run_id TEXT NOT NULL REFERENCES mira_flow_runs(run_id) ON DELETE CASCADE,
        site_id TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal > 0), payload TEXT NOT NULL,
        PRIMARY KEY(run_id, site_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS mira_flow_nodes (
        run_id TEXT NOT NULL REFERENCES mira_flow_runs(run_id) ON DELETE CASCADE,
        site_id TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal > 0), kind TEXT NOT NULL,
        actor_site_id TEXT, actor_ordinal INTEGER, actor_seq INTEGER, payload TEXT NOT NULL,
        PRIMARY KEY(run_id, site_id, ordinal), UNIQUE(run_id, actor_site_id, actor_ordinal, actor_seq),
        CHECK(kind != 'ask' OR (actor_site_id IS NOT NULL AND actor_ordinal IS NOT NULL AND actor_ordinal > 0 AND actor_seq IS NOT NULL AND actor_seq >= 0))
      );
      CREATE TABLE IF NOT EXISTS mira_flow_events (
        run_id TEXT NOT NULL REFERENCES mira_flow_runs(run_id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK(sequence >= 0), payload TEXT NOT NULL, time_created INTEGER NOT NULL,
        PRIMARY KEY(run_id, sequence)
      );
      CREATE TABLE IF NOT EXISTS mira_flow_review_graphs (
        run_id TEXT PRIMARY KEY REFERENCES mira_flow_runs(run_id) ON DELETE CASCADE,
        source_hash TEXT NOT NULL, payload TEXT NOT NULL
      );
    `)
  }

  createRun(record: RunRecord): void {
    if (this.getRun(record.runId)) throw new Error(`Mira flow journal: run already exists: ${record.runId}`)
    const now = Date.now()
    this.database.prepare('INSERT INTO mira_flow_runs(run_id, status, payload, time_created, time_updated) VALUES (?, ?, ?, ?, ?)').run(record.runId, record.status, JSON.stringify(record), now, now)
  }

  getRun(runId: string): RunRecord | undefined {
    const row = this.database.prepare('SELECT payload FROM mira_flow_runs WHERE run_id = ?').get(runId) as PayloadRow | undefined
    return row ? JSON.parse(row.payload) : undefined
  }

  /** Freeze the approved compiler graph separately from high-frequency run summaries. */
  putReviewGraph(runId: string, sourceHash: string, graph: MiraFlowReviewGraph): void {
    this.database.transaction(() => {
      if (this.requireRun(runId).scriptHash !== sourceHash) throw new Error('工作流图与源文件身份不一致')
      const existing = this.database.prepare('SELECT source_hash FROM mira_flow_review_graphs WHERE run_id = ?').get(runId) as { source_hash: string } | undefined
      if (existing && existing.source_hash !== sourceHash) throw new Error('工作流图与源文件身份不一致')
      this.database.prepare('INSERT INTO mira_flow_review_graphs(run_id, source_hash, payload) VALUES (?, ?, ?) ON CONFLICT(run_id) DO NOTHING').run(runId, sourceHash, JSON.stringify(graph))
    })()
  }

  getReviewGraph(runId: string, sourceHash: string): MiraFlowReviewGraph | undefined {
    if (this.requireRun(runId).scriptHash !== sourceHash) return
    const row = this.database.prepare('SELECT payload FROM mira_flow_review_graphs WHERE run_id = ? AND source_hash = ?').get(runId, sourceHash) as PayloadRow | undefined
    return row ? JSON.parse(row.payload) : undefined
  }

  listRuns(parentSessionId?: string): RunRecord[] {
    const rows = parentSessionId === undefined
      ? this.database.prepare('SELECT payload FROM mira_flow_runs ORDER BY time_updated DESC, rowid DESC').all()
      : this.database.prepare("SELECT payload FROM mira_flow_runs WHERE json_extract(payload, '$.parentSessionId') = ? ORDER BY time_updated DESC, rowid DESC").all(parentSessionId)
    return (rows as PayloadRow[]).map(row => JSON.parse(row.payload))
  }

  private requireRun(runId: string): RunRecord {
    const run = this.getRun(runId)
    if (!run) throw new Error(`Mira flow journal: unknown run ${runId}`)
    return run
  }

  private assertRun(runId: string): void {
    if (!this.database.prepare('SELECT 1 FROM mira_flow_runs WHERE run_id = ?').get(runId)) throw new Error(`Mira flow journal: unknown run ${runId}`)
  }

  updateRunStatus(runId: string, status: RunStatus, settlement?: RunSettlementRecord): void {
    this.database.transaction(() => {
      const run = this.requireRun(runId)
      run.status = status
      delete run.failure; delete run.stopReason; delete run.supersededBy
      if (status === 'pending' || status === 'running') delete run.result
      else {
        if (settlement?.failure !== undefined) run.failure = settlement.failure
        if (settlement?.stopReason !== undefined) run.stopReason = settlement.stopReason
        if (settlement?.supersededBy !== undefined) run.supersededBy = settlement.supersededBy
        // An absent terminal result preserves an existing artifact; null is an artifact.
        if (settlement?.result !== undefined) run.result = settlement.result
      }
      this.database.prepare('UPDATE mira_flow_runs SET status = ?, payload = ?, time_updated = ? WHERE run_id = ?').run(status, JSON.stringify(run), Date.now(), runId)
    })()
  }

  updateRunUsage(runId: string, spentTokens: number): void {
    const result = this.database.prepare("UPDATE mira_flow_runs SET payload = json_set(payload, '$.spentTokens', ?), time_updated = ? WHERE run_id = ?").run(spentTokens, Date.now(), runId)
    if (!result.changes) throw new Error(`Mira flow journal: unknown run ${runId}`)
  }

  updateRunCaps(runId: string, caps: Caps): void {
    const result = this.database.prepare("UPDATE mira_flow_runs SET payload = json_set(payload, '$.caps', json(?)), time_updated = ? WHERE run_id = ?").run(JSON.stringify(caps), Date.now(), runId)
    if (!result.changes) throw new Error(`Mira flow journal: unknown run ${runId}`)
  }

  putActor(record: ActorRecord): void {
    this.assertRun(record.runId)
    this.database.prepare('INSERT INTO mira_flow_actors(run_id, site_id, ordinal, payload) VALUES (?, ?, ?, ?) ON CONFLICT(run_id, site_id, ordinal) DO UPDATE SET payload = excluded.payload').run(record.runId, record.siteId, record.ordinal, JSON.stringify(record))
  }

  getActor(runId: string, siteId: string, ordinal: number): ActorRecord | undefined {
    const row = this.database.prepare('SELECT payload FROM mira_flow_actors WHERE run_id = ? AND site_id = ? AND ordinal = ?').get(runId, siteId, ordinal) as PayloadRow | undefined
    return row ? JSON.parse(row.payload) : undefined
  }

  listActors(runId: string): ActorRecord[] {
    return (this.database.prepare('SELECT payload FROM mira_flow_actors WHERE run_id = ? ORDER BY rowid').all(runId) as PayloadRow[]).map(row => JSON.parse(row.payload))
  }

  putNode(record: NodeRecord): void {
    this.assertRun(record.runId)
    this.database.prepare(`INSERT INTO mira_flow_nodes(run_id, site_id, ordinal, kind, actor_site_id, actor_ordinal, actor_seq, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, site_id, ordinal) DO UPDATE SET kind = excluded.kind, actor_site_id = excluded.actor_site_id, actor_ordinal = excluded.actor_ordinal, actor_seq = excluded.actor_seq, payload = excluded.payload`).run(record.runId, record.siteId, record.ordinal, record.kind, record.actorSiteId ?? null, record.actorOrdinal ?? null, record.actorSeq ?? null, JSON.stringify(record))
  }

  getNode(runId: string, siteId: string, ordinal: number): NodeRecord | undefined {
    const row = this.database.prepare('SELECT payload FROM mira_flow_nodes WHERE run_id = ? AND site_id = ? AND ordinal = ?').get(runId, siteId, ordinal) as PayloadRow | undefined
    return row ? JSON.parse(row.payload) : undefined
  }

  listNodes(runId: string): NodeRecord[] {
    return (this.database.prepare('SELECT payload FROM mira_flow_nodes WHERE run_id = ? ORDER BY rowid').all(runId) as PayloadRow[]).map(row => JSON.parse(row.payload))
  }

  appendEvent(runId: string, event: RunEvent): StoredEvent {
    return this.database.transaction(() => {
      this.assertRun(runId)
      const { sequence } = this.database.prepare('SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM mira_flow_events WHERE run_id = ?').get(runId) as { sequence: number }
      const payload = JSON.stringify(event), timeCreated = Date.now()
      this.database.prepare('INSERT INTO mira_flow_events(run_id, sequence, payload, time_created) VALUES (?, ?, ?, ?)').run(runId, sequence, payload, timeCreated)
      return { sequence, event: JSON.parse(payload), timeCreated }
    }).immediate()
  }

  listEvents(runId: string, opts?: ListEventsOptions): StoredEvent[] {
    const rows = this.database.prepare('SELECT sequence, payload, time_created FROM mira_flow_events WHERE run_id = ? AND sequence > ? ORDER BY sequence LIMIT ?').all(runId, opts?.afterSequence ?? -1, opts?.limit === undefined ? -1 : Math.max(0, opts.limit)) as Array<PayloadRow & { sequence: number; time_created: number }>
    return rows.map(row => ({ sequence: row.sequence, event: JSON.parse(row.payload), timeCreated: row.time_created }))
  }

  runTimes(runId: string): { startedAt?: number; endedAt?: number } {
    const row = this.database.prepare("SELECT MIN(time_created) AS startedAt, MAX(CASE WHEN json_extract(payload, '$.type') = 'run-settled' THEN time_created END) AS endedAt FROM mira_flow_events WHERE run_id = ?").get(runId) as { startedAt: number | null; endedAt: number | null }
    return { ...(row.startedAt === null ? {} : { startedAt: row.startedAt }), ...(row.endedAt === null ? {} : { endedAt: row.endedAt }) }
  }

  /** Called once by the owning host at startup, never by initialize or another live reader. */
  recoverInterruptedRuns(): number {
    return this.database.transaction(() => {
      const rows = this.database.prepare("SELECT run_id FROM mira_flow_runs WHERE status IN ('pending', 'running')").all() as Array<{ run_id: string }>
      for (const { run_id: runId } of rows) {
        const failure = { code: 'Interrupted' as const, message: `Mira flow ${runId} was interrupted when its owning process stopped` }
        this.updateRunStatus(runId, 'stopped', { stopReason: 'interrupted', failure })
        this.appendEvent(runId, { type: 'run-settled', status: 'stopped', stopReason: 'interrupted', error: failure })
        // Keep running nodes: the scheduler re-dispatches them on resume. Marking
        // them failed would instead replay a cached rejection and lose pending work.
      }
      return rows.length
    }).immediate()
  }
}
