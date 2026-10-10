import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime } from '../electron/services/harnessRuntime'

const resources: Array<{ root: string; database: PlatformDatabase }> = []
afterEach(() => { vi.restoreAllMocks(); for (const fixture of resources.splice(0)) { fixture.database.close(); rmSync(fixture.root, { recursive: true, force: true }) } })
const preference = 'first-party.mira-harness.harness-react-composer-drafts'
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mira-archive-delete-'))
  const database = new PlatformDatabase(root)
  resources.push({ root, database })
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as never)
  return { root, database, runtime }
}

describe('real archived selection writes', () => {
  it('includes >50, pinned and project tasks, freezes scope, and skips restored/missing/running/queued/unconfirmed targets', async () => {
    const { root, database, runtime } = setup()
    const directory = join(root, 'hidden-project'); mkdirSync(directory)
    const project = database.harness.createProject(directory)
    const sessions = Array.from({ length: 64 }, (_, index) => database.harness.createSession(index % 2 ? project.id : undefined))
    database.harness.setPinned(sessions[0].id, true)
    database.harness.archiveSessions(sessions.map(session => session.id))
    const targets = database.harness.archivedSessionIds()
    expect(targets).toHaveLength(64)
    expect(database.harness.queryHistory({ archiveView: 'archived', pageSize: 50 }).rows).toHaveLength(50)
    const [restored, missing, running, queued, unconfirmed] = sessions
    database.harness.restoreSessions([restored.id]); database.harness.deleteSession(missing.id)
    const coordinator = (runtime as unknown as { runCoordinator: { reserve(id: string): symbol; release(id: string, token: symbol): void } }).runCoordinator
    const token = coordinator.reserve(running.id)
    const queue = (runtime as unknown as { messageQueue: { hasPending(id: string): boolean } }).messageQueue
    const original = queue.hasPending.bind(queue)
    vi.spyOn(queue, 'hasPending').mockImplementation(id => id === queued.id || original(id))
    database.savePreference(preference, { drafts: { [unconfirmed.id]: 'keep me', [sessions[8].id]: 'delete me' }, fileDrafts: {}, config: {}, submissions: { [unconfirmed.id]: { id: 'pending' } }, unknownField: undefined })
    const later = database.harness.createSession(); database.harness.archiveSessions([later.id])
    const result = await runtime.deleteArchivedSessions(targets, () => undefined)
    expect(result.deletedIds).toHaveLength(59)
    expect(new Set(result.skippedIds)).toEqual(new Set([restored.id, missing.id, running.id, queued.id, unconfirmed.id]))
    expect(result.failedIds).toEqual([])
    expect(database.harness.getSession(later.id).archivedAt).toBeDefined()
    expect(database.harness.getSession(restored.id).archivedAt).toBeUndefined()
    expect(database.getSnapshot().preferences[preference]).toMatchObject({ drafts: { [unconfirmed.id]: 'keep me' }, submissions: { [unconfirmed.id]: { id: 'pending' } } })
    expect((database.getSnapshot().preferences[preference] as { drafts: Record<string, string> }).drafts).not.toHaveProperty(sessions[8].id)
    coordinator.release(running.id, token)
  })

  it('rechecks the archive condition at SQLite write and leaves a partial failure visible', async () => {
    const { database, runtime } = setup()
    const sessions = Array.from({ length: 3 }, () => database.harness.createSession())
    database.harness.archiveSessions(sessions.map(session => session.id))
    const originalMutable = runtime.assertSessionMutable.bind(runtime)
    vi.spyOn(runtime, 'assertSessionMutable').mockImplementation(id => {
      originalMutable(id)
      if (id === sessions[0].id) database.harness.restoreSessions([id])
    })
    const remove = database.harness.deleteArchivedSession.bind(database.harness)
    vi.spyOn(database.harness, 'deleteArchivedSession').mockImplementation(id => {
      if (id === sessions[1].id) throw new Error('disk failure')
      return remove(id)
    })
    const result = await runtime.deleteArchivedSessions(sessions.map(session => session.id), () => undefined)
    expect(result).toEqual({ deletedIds: [sessions[2].id], skippedIds: [sessions[0].id], failedIds: [sessions[1].id] })
    expect(database.harness.getSession(sessions[0].id).archivedAt).toBeUndefined()
    expect(database.harness.getSession(sessions[1].id).archivedAt).toBeDefined()
    expect(() => database.harness.getSession(sessions[2].id)).toThrow('未找到会话')
  })

  it('cleans frozen attachments and owner drafts only after a successful conditional write, stripping late old flushes', async () => {
    const { database, runtime } = setup()
    const deleted = database.harness.createSession(), other = database.harness.createSession()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+sMioAAAAASUVORK5CYII=', 'base64')
    const attach = (id: string) => database.harness.importMessageAttachments(id, [{ name: 'image.png', mediaType: 'image/png', data: png.toString('base64') }, { name: 'notes.md', mediaType: 'text/markdown', data: Buffer.from('冻结文本').toString('base64') }])
    const deletedFiles = attach(deleted.id), retainedFiles = attach(other.id)
    database.harness.archiveSessions([deleted.id])
    const stale = { drafts: { [deleted.id]: 'old', [other.id]: 'other' }, fileDrafts: { [deleted.id]: [{ path: 'old', name: 'old' }] }, recoveries: { [deleted.id]: [{ id: 'old' }], [other.id]: [] }, submissions: {}, config: {}, extension: { preserve: true } }
    // Unknown keys are retained by successful cleanup but unknown pending roots protect deletion.
    database.savePreference(preference, { ...stale, extension: undefined })
    expect((await runtime.deleteArchivedSessions([deleted.id], () => undefined)).deletedIds).toEqual([deleted.id])
    const sql = (database as unknown as { database: { prepare(sql: string): { all(): Array<{ session_id: string }> } } }).database
    expect(sql.prepare('SELECT session_id FROM harness_attachments').all()).toEqual([{ session_id: other.id }, { session_id: other.id }])
    for (const file of deletedFiles) expect(() => database.harness.getMessageAttachment(deleted.id, file.path)).toThrow()
    expect(database.harness.getMessageAttachment(other.id, retainedFiles[0].path).content).toBe(png.toString('base64'))
    expect(database.harness.getMessageAttachment(other.id, retainedFiles[1].path).content).toBe('冻结文本')
    database.savePreference(preference, stale)
    expect(database.getSnapshot().preferences[preference]).toEqual({ drafts: { [other.id]: 'other' }, fileDrafts: {}, recoveries: { [other.id]: [] }, submissions: {}, config: {}, extension: { preserve: true } })
  })

  it('protects damaged/unknown unconfirmed snapshots and stops the remaining batch after authorization revocation', async () => {
    const { database, runtime } = setup()
    const sessions = Array.from({ length: 52 }, () => database.harness.createSession())
    database.harness.archiveSessions(sessions.map(session => session.id))
    database.savePreference(preference, { newSubmissionSchema: {} })
    expect((await runtime.deleteArchivedSessions([sessions[0].id], () => undefined)).failedIds).toEqual([sessions[0].id])
    database.savePreference(preference, { drafts: {}, fileDrafts: {}, config: {} })
    let checks = 0
    const result = await runtime.deleteArchivedSessions(sessions.map(session => session.id), () => { if (++checks > 50) throw new Error('revoked') })
    expect(result.deletedIds).toHaveLength(50); expect(result.skippedIds).toEqual(sessions.slice(50).map(session => session.id)); expect(result.failedIds).toEqual([])
    expect(database.harness.archivedSessionIds()).toHaveLength(2)
  })

  it('removes only successfully deleted tasks from grouped root order and rejects a late stale order save', async () => {
    const { database, runtime } = setup()
    const deleted = database.harness.createSession(), restored = database.harness.createSession(), active = database.harness.createSession()
    database.harness.archiveSessions([deleted.id, restored.id]); database.harness.restoreSessions([restored.id])
    const key = 'first-party.mira-harness.session-drawer'
    const sidebar = {
      view: 'group', groups: [{ id: deleted.id, name: '保留同 ID 的组', sessionIds: [active.id] }],
      groupedRootOrder: [{ type: 'session', id: deleted.id }, { type: 'group', id: deleted.id }, { type: 'session', id: restored.id }],
      hiddenProjectIds: ['hidden-project'], ungroupedSessionOrder: [deleted.id, restored.id],
    }
    database.savePreference(key, sidebar)
    expect(await runtime.deleteArchivedSessions([deleted.id, restored.id], () => undefined)).toEqual({ deletedIds: [deleted.id], skippedIds: [restored.id], failedIds: [] })
    const expected = { ...sidebar, groupedRootOrder: sidebar.groupedRootOrder.slice(1) }
    expect(database.getSnapshot().preferences[key]).toEqual(expected)
    database.savePreference(key, sidebar)
    expect(database.getSnapshot().preferences[key]).toEqual(expected)
  })
})
