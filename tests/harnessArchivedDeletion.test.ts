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
  it.each(['main', 'side'] as const)('accepts current %s draft fields while protecting unconfirmed submissions', async location => {
    const { database, runtime } = setup()
    const parent = database.harness.createSession(), side = database.harness.createSideConversation(parent.id)
    const key = location === 'main' ? preference : `${preference}.side.${side.id}`
    const draft = { drafts: { [side.id]: '未发送文本' }, fileDrafts: {}, documents: { [side.id]: { version: 1, parts: [{ type: 'text', text: '未发送文本' }] } }, permissions: { [side.id]: 'default' }, config: {}, submissions: {} }
    database.savePreference(key, draft)
    expect(database.hasUnconfirmedHarnessSubmission(side.id)).toBe(false)
    expect(() => runtime.assertSessionMutable(parent.id)).not.toThrow()
    database.savePreference(key, { ...draft, submissions: { [side.id]: { id: 'pending' } } })
    expect(() => runtime.assertSessionMutable(parent.id)).toThrow('待发送')
    database.savePreference(key, draft)
    runtime.assertSessionMutable(parent.id); database.harness.archiveSessions([parent.id])
    expect(await runtime.deleteArchivedSessions([parent.id], () => undefined)).toEqual({ deletedIds: [parent.id], skippedIds: [], failedIds: [] })
    expect(database.getSnapshot().preferences[key]).toMatchObject({ drafts: {}, documents: {}, permissions: {} })
    database.savePreference(key, draft)
    expect(database.getSnapshot().preferences[key]).toMatchObject({ drafts: {}, documents: {}, permissions: {} })
  })

  it('keeps malformed and unknown submission snapshots blocked', () => {
    const { database } = setup()
    for (const value of [{ documents: {}, permissions: {}, submissions: [] }, { documents: {}, permissions: {}, submissions: null }, { unknown: {}, submissions: {} }]) {
      database.savePreference(preference, value)
      expect(() => database.hasUnconfirmedHarnessSubmission('session')).toThrow('无法确认待发送草稿状态')
    }
  })

  it('cascades an archived parent deletion to its side history, frozen attachments and owner drafts', async () => {
    const { database, runtime } = setup()
    const parent = database.harness.createSession(), other = database.harness.createSession()
    const child = database.harness.createSideConversation(parent.id)
    const otherChild = database.harness.createSideConversation(other.id)
    const key = `${preference}.side.${child.id}`
    const draft = { drafts: { [child.id]: '侧边草稿' }, fileDrafts: {}, config: {}, submissions: {} }
    database.savePreference(key, draft)
    database.savePreference(`${preference}.side.${otherChild.id}`, { ...draft, drafts: { [otherChild.id]: '保留' } })
    const [attachment] = database.harness.importMessageAttachments(child.id, [{ name: 'notes.md', mediaType: 'text/markdown', data: Buffer.from('独立附件').toString('base64') }])
    database.harness.saveSession({ ...child, messages: [{ id: 'child-message', role: 'user', content: '侧边历史', attachments: [attachment], createdAt: Date.now() }] })
    database.harness.archiveSessions([parent.id])
    expect(await runtime.deleteArchivedSessions([parent.id], () => undefined)).toEqual({ deletedIds: [parent.id], skippedIds: [], failedIds: [] })
    expect(() => database.harness.getSession(child.id)).toThrow('未找到会话')
    expect(database.harness.sideConversationIds(parent.id)).toEqual([])
    expect(database.harness.getSession(otherChild.id).parentSessionId).toBe(other.id)
    expect(database.getSnapshot().preferences[key]).toMatchObject({ drafts: {} })
    expect(database.getSnapshot().preferences[`${preference}.side.${otherChild.id}`]).toMatchObject({ drafts: { [otherChild.id]: '保留' } })
    database.savePreference(key, draft)
    expect(database.getSnapshot().preferences[key]).toMatchObject({ drafts: {} })
  })
  it('blocks destructive parent lifecycle while a side run or unconfirmed side submission owns work', () => {
    const { database, runtime } = setup()
    const parent = database.harness.createSession()
    const side = database.harness.createSideConversation(parent.id)
    const coordinator = (runtime as unknown as { runCoordinator: { reserve(id: string): symbol; release(id: string, token: symbol): void } }).runCoordinator
    const token = coordinator.reserve(side.id)
    expect(() => runtime.assertSessionMutable(parent.id)).toThrow('正在运行')
    coordinator.release(side.id, token)
    database.savePreference(`${preference}.side.${side.id}`, { drafts: {}, fileDrafts: {}, submissions: { [side.id]: { id: 'pending' } } })
    expect(() => runtime.assertSessionMutable(parent.id)).toThrow('待发送')
    database.savePreference(`${preference}.side.${side.id}`, { drafts: {}, fileDrafts: {}, submissions: {} })
    expect(() => runtime.assertSessionMutable(parent.id)).not.toThrow()
  })
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
      collapsedProjectIds: ['unrelated-project'], ungroupedSessionOrder: [deleted.id, restored.id],
    }
    database.savePreference(key, sidebar)
    expect(await runtime.deleteArchivedSessions([deleted.id, restored.id], () => undefined)).toEqual({ deletedIds: [deleted.id], skippedIds: [restored.id], failedIds: [] })
    const expected = { ...sidebar, groupedRootOrder: sidebar.groupedRootOrder.slice(1) }
    expect(database.getSnapshot().preferences[key]).toEqual(expected)
    database.savePreference(key, sidebar)
    expect(database.getSnapshot().preferences[key]).toEqual(expected)
  })
})
