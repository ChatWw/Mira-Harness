import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { createRemoteHarness } from '../electron/services/miraRemoteHarness'
import type { HarnessRuntime } from '../electron/services/harnessRuntime'
import type { HarnessSession } from '../src/config/harness'

let root: string
let database: PlatformDatabase
let remote: ReturnType<typeof createRemoteHarness>
let projectId: string
const running = new Set<string>()
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mira-mobile-draft-'))
  database = new PlatformDatabase(root)
  const directory = join(root, 'project'); mkdirSync(directory)
  projectId = database.harness.createProject(directory).id
  remote = createRemoteHarness(database, {
    listSessions: () => database.harness.listSessions().map(session => ({ ...session, isRunning: running.has(session.id) })),
    getSession: (id: string) => database.harness.getSession(id),
  } as unknown as HarnessRuntime, () => ({} as never))
})
afterEach(() => { database.close(); rmSync(root, { recursive: true, force: true }); running.clear() })
const create = (project = projectId, connection = 'phone') => remote.invoke('session.create', { projectId: project }, connection) as Promise<HarnessSession>

it('reuses the same unsent conversation on repeated new requests, including concurrent devices', async () => {
  const first = await create()
  const repeated = await Promise.all(Array.from({ length: 5 }, (_, i) => create(projectId, i % 2 ? 'tablet' : 'phone')))
  expect(repeated.map(session => session.id)).toEqual(Array(5).fill(first.id))
  expect(database.harness.listSessions()).toHaveLength(1)
})

it('creates a new conversation after the first message and then reuses that new empty conversation', async () => {
  const first = await create()
  database.harness.addMessage(first.id, 'user', '第一条消息')
  const second = await create()
  expect(second.id).not.toBe(first.id)
  expect((await create()).id).toBe(second.id)
  expect(database.harness.getSession(first.id).messages[0].content).toBe('第一条消息')
  expect(database.harness.listSessions()).toHaveLength(2)
})

it('keeps each project independent and finds its unsent conversation after the service is recreated', async () => {
  const directory = join(root, 'other-project'); mkdirSync(directory)
  const otherProject = database.harness.createProject(directory).id
  const first = await create(), second = await create(otherProject)
  expect(first.id).not.toBe(second.id)
  remote.reset()
  remote = createRemoteHarness(database, {
    listSessions: () => database.harness.listSessions(),
    getSession: (id: string) => database.harness.getSession(id),
  } as unknown as HarnessRuntime, () => ({} as never))
  expect((await create()).id).toBe(first.id)
  expect((await create(otherProject)).id).toBe(second.id)
})

it.each(['renamed', 'running', 'archived', 'pinned', 'automated'] as const)('does not reuse an empty but %s conversation', async kind => {
  const first = await create()
  if (kind === 'renamed') database.harness.updateSession({ ...first, title: '我的草稿', titleSource: 'manual' })
  if (kind === 'running') running.add(first.id)
  if (kind === 'archived') database.harness.updateSession({ ...first, archivedAt: Date.now() })
  if (kind === 'pinned') database.harness.updateSession({ ...first, pinned: true })
  if (kind === 'automated') database.harness.updateSession({ ...first, automationId: 'automation' })
  expect((await create()).id).not.toBe(first.id)
})

it('reuses an existing empty new conversation without deleting older duplicate entries', async () => {
  const older = database.harness.createSession(projectId)
  const latest = database.harness.createSession(projectId)
  const result = await create()
  expect([older.id, latest.id]).toContain(result.id)
  expect(database.harness.listSessions()).toHaveLength(2)
})
