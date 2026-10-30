import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { HarnessStore } from '../electron/storage/harnessStore'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraPaths } from '../electron/storage/miraPaths'
import { McpConfigStore } from '../electron/storage/mcpConfigStore'
import { shouldGenerateAutoTitle, type HarnessMessage } from '../src/config/harness'

describe('persistent Mira input history', () => {
  it('persists automation origin even after its automation is removed', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-session-automation-'))
    let database = new PlatformDatabase(root)
    try {
      const session = database.harness.createSession()
      database.harness.updateSession({ ...session, automationId: 'deleted-automation' })
      database.harness.addMessage(session.id, 'user', '自动化执行')
      database.close(); database = new PlatformDatabase(root)
      expect(database.harness.listSessions().find(item => item.id === session.id)?.automationId).toBe('deleted-automation')
      expect(database.harness.getSession(session.id).automationId).toBe('deleted-automation')
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('preserves current project configuration across repeated startup', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-project-config-startup-'))), directory = join(root, 'project')
    let database = new PlatformDatabase(root)
    try {
      mkdirSync(directory)
      database.harness.createProject(directory)
      const config = new McpConfigStore(root).forProject(directory).save({ name: 'Restart-safe tools', command: 'node', args: ['server.mjs'], enabled: true })
      const retained = new Map<string, string>([
        ['mcp.json', readFileSync(join(directory, '.mira', 'mcp.json'), 'utf8')],
        ['hooks.json', '{"hooks":[]}\n'], ['commands/research.md', 'Keep this project command\n'],
        ['agents/research.md', 'Keep this project agent\n'], ['trash/agents/deleted-agent.md', 'Recoverable agent\n'],
        ['trash/unknown/notes.md', 'Unrecognized user data\n'], ['extra-config.json', '{"custom":true}\n'],
      ])
      for (const [path, value] of retained) { mkdirSync(join(directory, '.mira', path, '..'), { recursive: true }); writeFileSync(join(directory, '.mira', path), value) }
      for (let restart = 0; restart < 3; restart++) {
        database.close(); database = new PlatformDatabase(root)
        for (const [path, value] of retained) expect(readFileSync(join(directory, '.mira', path), 'utf8')).toBe(value)
        expect(new McpConfigStore(root).forProject(directory).list()).toMatchObject([{ id: config.id, enabled: true }])
      }
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('shares by directory, retains thirty inputs and survives reopening without polluting settings snapshots', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-input-history-store-'))
    let database = new PlatformDatabase(new MiraPaths(root))
    try {
      for (let index = 0; index < 35; index++) database.promptHistory.append('/project-a', `  input-${index}  `)
      database.promptHistory.append('/project-a', 'input-34')
      database.promptHistory.append('/project-b', 'different workspace')
      database.promptHistory.append(undefined, 'personal workspace')
      expect(database.promptHistory.list('/project-a')).toEqual(Array.from({ length: 30 }, (_, index) => `input-${index + 5}`))
      expect(database.promptHistory.list('/project-b')).toEqual(['different workspace'])
      expect(database.promptHistory.list()).toEqual(['personal workspace'])
      expect(JSON.stringify(database.getSnapshot().preferences)).not.toContain('input-34')
      database.close(); database = new PlatformDatabase(new MiraPaths(root))
      expect(database.promptHistory.list('/project-a').at(-1)).toBe('input-34')
      expect(database.promptHistory.list()).toEqual(['personal workspace'])
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('retains nonconsecutive repeats and caps serialized size without truncating the newest input', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-input-history-limit-'))
    const database = new PlatformDatabase(new MiraPaths(root))
    try {
      for (const text of ['A', '', 'A ', 'B', 'A']) database.promptHistory.append(undefined, text)
      expect(database.promptHistory.list()).toEqual(['A', 'B', 'A'])
      for (let index = 0; index < 5; index++) database.promptHistory.append('/large', `${index}${'\\'.repeat(99_999)}`)
      const history = database.promptHistory.list('/large')
      expect(JSON.stringify(history).length).toBeLessThanOrEqual(262_144)
      expect(history.at(-1)).toBe(`4${'\\'.repeat(99_999)}`)
      database.promptHistory.append('/large', 'x'.repeat(100_001))
      database.promptHistory.append('/large', '\u0001'.repeat(99_999))
      expect(database.promptHistory.list('/large')).toEqual(history)
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })
})

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

function createStore() {
  const root = mkdtempSync(join(tmpdir(), 'mira-harness-store-'))
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'FolderOpened', directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);
    CREATE TABLE harness_sessions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, model_provider_id TEXT, model_id TEXT, permission_mode TEXT NOT NULL, status TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL, working_directory TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, draft_state TEXT, parent_session_id TEXT);
    CREATE TABLE harness_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return { root, database, store: new HarnessStore(database, new MiraPaths(root)) }
}

describe('HarnessStore', () => {
  it('forks the exact settled reply with independent attachments, preserved records and no duplicate usage', async () => {
    const { root, database, store } = createStore()
    try {
      const source = store.createSession()
      source.title = '原任务'; source.modelProviderId = 'provider'; source.modelId = 'model'; source.permissionMode = 'full'
      const reference = store.importMessageAttachments(source.id, [{ name: 'frozen.png', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=' }])[0]
      const image = store.resolveMessageAttachments(source.id, [reference])[0]
      source.messages = [
        { id: 'u1', role: 'user', content: '原问题', createdAt: 1, attachments: [image], submissionId: 'old-submission' },
        { id: 'a1', role: 'assistant', content: '分支点', createdAt: 2, runId: 'run1', parts: [{ id: 'part1', type: 'tool', toolCallId: 'read1' }, { id: 'result', type: 'text', text: '分支点', state: 'complete', startedAt: 2 }], run: { startedAt: 1, completedAt: 2, durationMs: 1, status: 'completed', activities: [] }, usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 5 } },
        { id: 'u2', role: 'user', content: '后续问题', createdAt: 3 },
        { id: 'a2', role: 'assistant', content: '后续回复', createdAt: 4, runId: 'run2' },
      ]
      source.toolCalls = [{ id: 'read1', tool: 'read', target: 'README.md', status: 'ok', createdAt: 1, runId: 'run1' }, { id: 'read2', tool: 'read', target: 'later.md', status: 'ok', createdAt: 3, runId: 'run2' }]
      source.context = { summary: '包含后续回复的摘要', compactedThroughMessageId: 'a2', compactedAt: 4 }
      store.updateSession(source)
      const original = store.getSession(source.id), usage = store.usageStats().total
      const request = '55cabc22-257e-41d4-8ec2-9fc83671dd12'
      const fork = store.forkConversation(source.id, 'a1', request)
      expect(fork).toMatchObject({ forkSource: { sessionId: source.id, messageId: 'a1', title: '原任务' }, permissionMode: 'full', modelId: 'model', titleSource: 'manual', status: 'completed' })
      expect(fork.messages.map(message => message.id)).toEqual(['u1', 'a1'])
      expect(fork.messages.every(message => message.inherited)).toBe(true)
      expect(fork.messages[0].submissionId).toBeUndefined()
      expect(fork.messages[1].parts).toEqual(original.messages[1].parts)
      expect(fork.toolCalls.map(tool => tool.id)).toEqual(['read1'])
      expect(fork.context).toBeUndefined(); expect(fork.activeRun).toBeUndefined(); expect(fork.pendingInteraction).toBeUndefined()
      expect(fork.parentSessionId).toBeUndefined()
      expect(store.getSession(source.id)).toEqual(original)
      expect(store.usageStats().total).toEqual(usage)
      expect(store.listSessions().map(session => session.id)).toContain(fork.id)
      expect(store.forkConversation(source.id, 'a1', request).id).toBe(fork.id)
      expect(() => store.forkConversation(source.id, 'a2', request)).toThrow('失效')
      expect(store.listSessions()).toHaveLength(2)
      const copied = fork.messages[0].attachments![0]
      expect(copied.path).not.toBe(reference.path)
      store.deleteSession(source.id)
      expect(store.getMessageAttachment(fork.id, copied.path).content).toBe(image.content)
      const followup = store.addMessage(fork.id, 'assistant', '分支独有回复')
      followup.messages.at(-1)!.usage = { input: 3, output: 4, cacheRead: 0, cacheWrite: 0, totalTokens: 7 }
      store.updateSession(followup)
      expect(store.usageStats().total.totalTokens).toBe(7)
      expect((await store.searchConversations('分支独有')).map(row => row.id)).toEqual([fork.id])
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('rejects unstable or invalid branch points without creating a task and preserves only applicable compaction', () => {
    const { root, database, store } = createStore()
    try {
      const source = store.createSession()
      source.messages = [{ id: 'user', role: 'user', content: '问题', createdAt: 1 }, { id: 'assistant', role: 'assistant', content: '完整回答', createdAt: 2 }]
      source.context = { summary: '此前摘要', compactedThroughMessageId: 'user', compactedAt: 1, usage: { usedTokens: 10, contextWindow: 100, source: 'reported', updatedAt: 3 } }
      store.updateSession(source)
      const request = '55cabc22-257e-41d4-8ec2-9fc83671dd12'
      expect(() => store.forkConversation(source.id, 'user', request)).toThrow('已完成')
      expect(() => store.forkConversation(source.id, 'missing', request)).toThrow('已完成')
      source.messages[1].interrupted = true; store.updateSession(source)
      expect(() => store.forkConversation(source.id, 'assistant', request)).toThrow('已完成')
      source.messages[1].interrupted = false
      source.activeRun = { id: 'active', startedAt: 3, activities: [], subtasks: [] }; store.updateSession(source)
      expect(() => store.forkConversation(source.id, 'assistant', request)).toThrow('结束')
      expect(store.listSessions()).toHaveLength(1)
      delete source.activeRun; store.updateSession(source)
      const fork = store.forkConversation(source.id, 'assistant', request)
      expect(fork.context).toEqual({ summary: '此前摘要', compactedThroughMessageId: 'user', compactedAt: 1 })
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('persists message and its frozen permission in the same session snapshot', () => {
    const { root, database, store } = createStore()
    try {
      const owner = store.createSession(undefined, 'default')
      const update = vi.spyOn(store, 'updateSession')
      store.addMessage(owner.id, 'user', '下一条使用完全访问', undefined, false, 'full')
      expect(update).not.toHaveBeenCalled()
      expect(store.getSession(owner.id)).toMatchObject({ permissionMode: 'full', messages: [{ role: 'user', content: '下一条使用完全访问' }] })
      expect(database.prepare('SELECT permission_mode FROM harness_sessions WHERE id = ?').get(owner.id)).toEqual({ permission_mode: 'full' })
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('creates a hidden independent side conversation from stable history without parent execution state', async () => {
    const { root, database, store } = createStore()
    try {
      const directory = join(root, 'side-project'); mkdirSync(directory)
      const project = store.createProject(directory)
      const parent = store.createSession(project.id)
      parent.modelProviderId = 'provider'; parent.modelId = 'model'; parent.modelThinkingLevel = 'low'
      parent.permissionMode = 'default'; parent.activeSkillIds = ['skill']; parent.activeMcpServerIds = ['mcp']
      parent.messages = [
        { id: 'u1', role: 'user', content: '已完成的问题', createdAt: 1 },
        { id: 'a1', role: 'assistant', content: '稳定的回答', createdAt: 2 },
        { id: 'u2', role: 'user', content: '正在执行的问题', createdAt: 3 },
        { id: 'a2', role: 'assistant', content: '尚未完成', runId: 'running', createdAt: 4 },
      ]
      parent.activeRun = { id: 'running', startedAt: 4, messageId: 'a2', activities: [], subtasks: [] }
      store.updateSession(parent)
      const before = store.getSession(parent.id), projectBefore = store.getProject(project.id)
      const side = store.createSideConversation(parent.id)
      expect(side).toMatchObject({ parentSessionId: parent.id, draftState: 'accepted', modelProviderId: 'provider', modelId: 'model', modelThinkingLevel: 'low', permissionMode: 'default', activeSkillIds: ['skill'], activeMcpServerIds: ['mcp'], toolCalls: [] })
      expect(side.activeRun).toBeUndefined(); expect(side.pendingInteraction).toBeUndefined()
      expect(side.messages.map(message => [message.content, message.internal])).toEqual([['已完成的问题', true], ['稳定的回答', true]])
      expect(side.messages.every(message => !parent.messages.some(original => original.id === message.id))).toBe(true)
      expect(store.getSession(parent.id)).toEqual(before)
      store.addMessage(side.id, 'user', '旁路独有问题')
      store.appendAssistantText(side.id, '旁路独有回答')
      expect(store.listSessions().map(item => item.id)).toEqual([parent.id])
      expect(store.listProjects()[0].sessionCount).toBe(1)
      expect(store.getProject(project.id)).toMatchObject({ updatedAt: projectBefore.updatedAt, lastSessionAt: projectBefore.lastSessionAt })
      expect(await store.searchConversations('旁路独有')).toEqual([])
      expect(store.queryHistory().total).toBe(1)
      expect(() => store.createSideConversation(side.id)).toThrow('主任务')
      store.deleteSession(parent.id)
      expect(() => store.getSession(side.id)).toThrow('未找到')
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('retains side owner drafts and staged images across startup and strips late deleted-owner writes', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-side-restart-'))
    let db: PlatformDatabase | undefined
    try {
      db = new PlatformDatabase(root)
      const parent = db.harness.createSession(); db.harness.acceptPreparedSession(parent.id)
      db.harness.addMessage(parent.id, 'user', '主问题')
      const side = db.harness.createSideConversation(parent.id)
      const image = db.harness.importMessageAttachments(side.id, [{ name: 'image.png', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=' }])[0]
      const key = `first-party.mira-harness.harness-react-composer-drafts.side.${side.id}`
      const draft = { drafts: { [side.id]: '侧边草稿' }, fileDrafts: { [side.id]: [image] }, submissions: { [side.id]: { id: 'pending', text: '待确认', references: [image], selection: { providerId: 'p', modelId: 'm' }, planning: false } } }
      db.savePreference(key, draft)
      expect(db.hasUnconfirmedHarnessSubmission(side.id)).toBe(true)
      db.close(); db = new PlatformDatabase(root)
      expect(db.harness.getSession(side.id).parentSessionId).toBe(parent.id)
      expect(db.harness.getMessageAttachment(side.id, image.path).content).toBeTruthy()
      db.removeHarnessDraftOwners([side.id]); db.savePreference(key, draft)
      expect(db.getSnapshot().preferences[key]).toMatchObject({ drafts: {}, fileDrafts: {}, submissions: {} })
    } finally { db?.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('replays side first-input creation durably without changing history or reviving a deleted child', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-side-input-restart-'))
    let db = new PlatformDatabase(root)
    try {
      const parent = db.harness.createSession(); db.harness.acceptPreparedSession(parent.id)
      db.harness.addMessage(parent.id, 'user', '主问题')
      const input = { submissionId: 'first-input', text: '解释这个概念', selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'low' as const }, permissionMode: 'default' as const }
      const child = db.harness.createSideConversation(parent.id, input)
      db.harness.addMessage(parent.id, 'assistant', '后来新增的上下文')
      db.close(); db = new PlatformDatabase(root)
      expect(db.harness.createSideConversation(parent.id, input)).toEqual(child)
      expect(db.harness.sideConversationIds(parent.id)).toEqual([child.id])
      expect(() => db.harness.createSideConversation(parent.id, { ...input, text: '另一个问题' })).toThrow('内容已变化')
      const other = db.harness.createSession(); db.harness.acceptPreparedSession(other.id)
      expect(db.harness.createSideConversation(other.id, input).id).not.toBe(child.id)
      db.harness.deleteSession(child.id)
      expect(() => db.harness.createSideConversation(parent.id, input)).toThrow('已不存在')
      expect(db.harness.sideConversationIds(parent.id)).toEqual([])
    } finally { db.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('hides prepared owners from task queries, counts and order until idempotent admission', async () => {
    const { root, database, store } = createStore()
    try {
      const directory = join(root, 'draft-project'); mkdirSync(directory)
      const project = store.createProject(directory, '草稿项目')
      const visible = store.createSession(project.id)
      const before = store.getProject(project.id)
      const prepared = store.createSession(project.id, 'default', true)
      store.renameSession(prepared.id, '未接纳草稿')
      expect(store.getSession(prepared.id).draftState).toBe('prepared')
      expect(store.listSessions().map(item => item.id)).toEqual([visible.id])
      expect(await store.searchConversations('未接纳草稿')).toEqual([])
      expect(store.queryHistory().total).toBe(1)
      expect(store.getProject(project.id)).toMatchObject({ sessionCount: 1, lastSessionAt: before.lastSessionAt, updatedAt: before.updatedAt })
      expect(store.listProjects()[0]?.sessionCount).toBe(1)
      expect(database.prepare('SELECT sort_order FROM harness_sessions WHERE id = ?').get(prepared.id)).toEqual({ sort_order: 0 })
      expect(() => store.reorderSessions({ type: 'project', projectId: project.id }, [visible.id])).not.toThrow()
      expect(() => store.reorderSessions({ type: 'project', projectId: project.id }, [visible.id, prepared.id])).toThrow('无效')
      store.acceptPreparedSession(prepared.id)
      const admitted = database.prepare('SELECT sort_order, updated_at FROM harness_sessions WHERE id = ?').get(prepared.id)
      store.acceptPreparedSession(prepared.id)
      expect(database.prepare('SELECT sort_order, updated_at FROM harness_sessions WHERE id = ?').get(prepared.id)).toEqual(admitted)
      expect(store.getSession(prepared.id).draftState).toBe('accepted')
      expect(store.listSessions().map(item => item.id)).toEqual([prepared.id, visible.id])
      expect(await store.searchConversations('未接纳草稿')).toMatchObject([{ id: prepared.id }])
      expect(store.queryHistory().total).toBe(2)
      expect(store.getProject(project.id).sessionCount).toBe(2)
      store.updateSession({ ...prepared, title: '后续配置' })
      expect(store.getSession(prepared.id).draftState).toBe('accepted')
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('rolls back lifecycle, order, project metadata and first-message persistence when admission fails', () => {
    const { root, database, store } = createStore()
    try {
      const directory = join(root, 'draft-project'); mkdirSync(directory)
      const project = store.createProject(directory)
      const prepared = store.createSession(project.id, 'default', true)
      expect(() => store.acceptPreparedSession(prepared.id, () => {
        store.addMessage(prepared.id, 'user', '未接纳内容')
        throw new Error('存储失败')
      })).toThrow('存储失败')
      expect(store.getSession(prepared.id)).toMatchObject({ draftState: 'prepared', messages: [] })
      expect(store.listSessions()).toEqual([])
      expect(store.getProject(project.id)).toMatchObject({ sessionCount: 0, lastSessionAt: undefined, updatedAt: project.updatedAt })
      expect(database.prepare('SELECT sort_order FROM harness_sessions WHERE id = ?').get(prepared.id)).toEqual({ sort_order: 0 })
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('keeps accepted empty tasks on restart and retains hidden owners named only by draft metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-prepared-restart-'))
    let database: PlatformDatabase | undefined
    try {
      database = new PlatformDatabase(root)
      const prepared = database.harness.createSession(undefined, 'default', true)
      const accepted = database.harness.createSession(undefined, 'default', true)
      database.harness.acceptPreparedSession(accepted.id)
      const unused = database.harness.createSession(undefined, 'default', true)
      database.savePreference('first-party.mira-harness.harness-react-composer-drafts', { drafts: {}, fileDrafts: {}, draft: { id: 'anonymous', groupId: 'group', sessionId: prepared.id } })
      expect(database.hasUnconfirmedHarnessSubmission(prepared.id)).toBe(false)
      database.close(); database = new PlatformDatabase(root)
      expect(database.harness.listSessions().map(item => item.id)).toEqual([accepted.id])
      expect(database.harness.getSession(accepted.id)).toMatchObject({ draftState: 'accepted', messages: [] })
      expect(database.harness.getSession(prepared.id).draftState).toBe('prepared')
      expect(() => database!.harness.getSession(unused.id)).toThrow('未找到会话')
      database.removeHarnessDraftOwners([prepared.id])
      expect(database.getSnapshot().preferences['first-party.mira-harness.harness-react-composer-drafts']).toEqual({ drafts: {}, fileDrafts: {} })
    } finally { database?.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('searches the real visible message table, not titles only, and excludes hidden and archived content', async () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession(), archived = store.createSession(), hidden = store.createSession()
      store.renameSession(session.id, '独立标题')
      const message = store.addMessage(session.id, 'assistant', `${'前文'.repeat(100)}真正内容 Keyword 100%`)
      store.addMessage(archived.id, 'user', '真正内容')
      store.archiveSessions([archived.id])
      store.updateSession({ ...hidden, messages: [{ id: 'internal', role: 'assistant', content: '真正内容', internal: true, createdAt: Date.now() }] })
      const rows = await store.searchConversations('真正内容')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: session.id, messageId: message.messages.at(-1)?.id, title: '独立标题' })
      expect(rows[0].snippet).toContain('真正内容')
      expect(rows[0].snippet.length).toBeLessThanOrEqual(182)
      expect(await store.searchConversations('keyword')).toHaveLength(1)
      expect(await store.searchConversations('100%')).toHaveLength(1)
      expect(await store.searchConversations('没有出现')).toEqual([])
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })
  it.each(['failed', 'stopped'] as const)('persists an empty %s reply with elapsed time', status => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      store.addMessage(session.id, 'user', '分析项目')
      const run = { status, startedAt: 1000, completedAt: 84000, durationMs: 83000, activities: [], ...(status === 'failed' ? { error: '连接超时' } : {}) }
      store.finalizeAssistantMessage(session.id, { content: '', run, interrupted: status === 'stopped' })
      const reply = store.getSession(session.id).messages.at(-1)!
      expect(reply.role).toBe('assistant')
      expect(reply.content).toBe('')
      expect(reply.run).toEqual(run)
      expect(Boolean(reply.interrupted)).toBe(status === 'stopped')
    } finally {
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('persists assistant web sources with the completed message', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()

    store.appendAssistantText(session.id, '带引用的回答[1]', undefined, undefined, false, [
      { index: 1, title: '示例来源', url: 'https://example.com', snippet: '摘要' },
    ])

    expect(store.getSession(session.id).messages.at(-1)?.sources).toEqual([
      { index: 1, title: '示例来源', url: 'https://example.com', snippet: '摘要' },
    ])
    store.finalizeAssistantMessage(session.id, { content: '重新编号后的回答[1]', sources: [{ index: 1, title: '示例来源', url: 'https://example.com' }] })
    expect(store.getSession(session.id).messages.at(-1)?.content).toBe('重新编号后的回答[1]')
    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists the selected project icon and deletes selected session files with their index rows', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目', 'Collection')
    const first = store.createSession(project.id)
    const second = store.createSession(project.id)

    expect(store.getProject(project.id).icon).toBe('Collection')
    store.renameProject(project.id, '已重命名项目', 'Files')
    expect(store.getProject(project.id).name).toBe('已重命名项目')
    expect(store.getProject(project.id).icon).toBe('Files')
    store.renameProject(project.id, '再次重命名项目')
    expect(store.getProject(project.id).icon).toBe('Files')
    expect(store.listSessions()).toHaveLength(2)
    expect(() => store.createProject(join(root, 'invalid-icon'), 'Invalid', 'invalid icon')).toThrow('项目图标无效')
    store.deleteSessions([first.id, second.id])
    expect(store.listSessions()).toEqual([])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists unread state and moves a session to an existing project', () => {
    const { root, database, store } = createStore()
    const directoryA = join(root, 'project-a')
    const directoryB = join(root, 'project-b')
    mkdirSync(directoryA)
    mkdirSync(directoryB)
    const projectA = store.createProject(directoryA, '项目 A')
    const projectB = store.createProject(directoryB, '项目 B')
    const session = store.createSession(projectA.id)

    store.setUnread(session.id, true)
    const moved = store.moveSession(session.id, projectB.id)

    expect(moved).toMatchObject({ projectId: projectB.id, workingDirectory: directoryB, unread: true })
    expect(store.getSession(session.id)).toMatchObject({ projectId: projectB.id, workingDirectory: directoryB, unread: true })
    expect(store.listSessions()).toContainEqual(expect.objectContaining({ id: session.id, projectId: projectB.id, unread: true }))

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('switches prepared drafts outside projects with their identity and attachments retained', () => {
    const { root, database, store } = createStore()
    try {
      const directory = join(root, 'draft-project'); mkdirSync(directory)
      const project = store.createProject(directory)
      const draft = store.createSession(project.id, 'default', true)
      const attachment = store.importMessageAttachments(draft.id, [{ name: 'draft.txt', mediaType: 'text/plain', data: Buffer.from('保留草稿附件').toString('base64') }])[0]
      draft.activeMcpServerIds = ['global-tools', 'project:old-tools']
      store.updateSession(draft)
      const detached = store.moveSession(draft.id)
      expect(detached).toMatchObject({ id: draft.id, draftState: 'prepared', activeMcpServerIds: ['global-tools'] })
      expect(detached.projectId).toBeUndefined()
      expect(detached.workingDirectory).toBe(store.createSession().workingDirectory)
      expect(store.getSession(draft.id)).toMatchObject({ workingDirectory: detached.workingDirectory, draftState: 'prepared' })
      expect(store.resolveMessageAttachments(draft.id, [attachment])[0]).toMatchObject({ name: 'draft.txt', content: '保留草稿附件' })
      expect(store.moveSession(draft.id, project.id)).toMatchObject({ id: draft.id, projectId: project.id, workingDirectory: directory })
      expect(store.resolveMessageAttachments(draft.id, [attachment])[0]).toMatchObject({ name: 'draft.txt', content: '保留草稿附件' })
      const established = store.createSession(project.id)
      expect(() => store.moveSession(established.id)).toThrow('未发送')
      expect(store.getSession(established.id).projectId).toBe(project.id)
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('persists independent project and in-column session ordering', () => {
    const { root, database, store } = createStore()
    const directoryA = join(root, 'ordered-project-a')
    const directoryB = join(root, 'ordered-project-b')
    mkdirSync(directoryA)
    mkdirSync(directoryB)
    const projectA = store.createProject(directoryA, '项目 A')
    const projectB = store.createProject(directoryB, '项目 B')

    expect(store.listProjects().map(project => project.id)).toEqual([projectB.id, projectA.id])
    store.reorderProjects([projectA.id, projectB.id])

    const first = store.createSession(projectB.id)
    const second = store.createSession(projectB.id)
    expect(store.listSessions().filter(session => session.projectId === projectB.id).map(session => session.id)).toEqual([second.id, first.id])

    store.reorderSessions({ type: 'project', projectId: projectB.id }, [first.id, second.id])
    expect(store.listSessions().filter(session => session.projectId === projectB.id).map(session => session.id)).toEqual([first.id, second.id])

    store.renameSession(second.id, '只改标题不提升')
    expect(store.listSessions().filter(session => session.projectId === projectB.id).map(session => session.id)).toEqual([first.id, second.id])

    store.addMessage(second.id, 'user', '继续对话后回到顶部')
    expect(store.listSessions().filter(session => session.projectId === projectB.id).map(session => session.id)).toEqual([second.id, first.id])
    expect(store.listProjects().map(project => project.id)).toEqual([projectA.id, projectB.id])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists recent and pinned ordering until a user message promotes the session', () => {
    const { root, database, store } = createStore()
    const first = store.createSession()
    const second = store.createSession()

    store.reorderSessions({ type: 'recent' }, [first.id, second.id])
    expect(store.listSessions().filter(session => !session.pinned && !session.projectId).map(session => session.id)).toEqual([first.id, second.id])
    store.addMessage(second.id, 'user', '继续最近对话')
    expect(store.listSessions().filter(session => !session.pinned && !session.projectId).map(session => session.id)).toEqual([second.id, first.id])

    store.setPinned(first.id, true)
    store.setPinned(second.id, true)
    store.reorderSessions({ type: 'pinned' }, [first.id, second.id])
    expect(store.listSessions().filter(session => session.pinned).map(session => session.id)).toEqual([first.id, second.id])
    store.addMessage(second.id, 'user', '继续置顶对话')
    expect(store.listSessions().filter(session => session.pinned).map(session => session.id)).toEqual([second.id, first.id])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects cross-column session ordering and promotes sessions entering a new column', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'ordered-project')
    mkdirSync(directory)
    const project = store.createProject(directory, '项目')
    const recent = store.createSession()
    const projectSession = store.createSession(project.id)

    expect(() => store.reorderSessions({ type: 'recent' }, [recent.id, projectSession.id])).toThrow('会话排序列表无效')
    store.setPinned(projectSession.id, true)
    expect(store.listSessions().filter(session => session.pinned).map(session => session.id)).toEqual([projectSession.id])
    store.setPinned(projectSession.id, false)
    expect(store.listSessions().filter(session => session.projectId === project.id && !session.pinned).map(session => session.id)).toEqual([projectSession.id])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('filters, paginates, archives, and restores history without reading off-page previews', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'history-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'History project')
    const alpha = store.createSession(project.id)
    const beta = store.createSession()
    const gamma = store.createSession(project.id)
    const base = Date.now() - 3 * 60 * 60 * 1000
    const prepare = (id: string, title: string, modelId: string, status: 'active' | 'completed' | 'failed', createdAt: number) => {
      const session = store.getSession(id)
      store.updateSession({ ...session, title, modelId, modelProviderId: 'provider-1', status })
      database.prepare('UPDATE harness_sessions SET created_at = ?, updated_at = ? WHERE id = ?').run(createdAt, createdAt, id)
    }
    prepare(alpha.id, 'Alpha plan', 'model-a', 'completed', base)
    prepare(beta.id, 'Beta notes', 'model-b', 'active', base + 60_000)
    prepare(gamma.id, 'Gamma plan', 'model-a', 'failed', base + 120_000)
    store.addMessage(alpha.id, 'user', 'Visible preview text')
    database.prepare('UPDATE harness_sessions SET updated_at = ? WHERE id = ?').run(base, alpha.id)

    const firstPage = store.queryHistory({ q: 'plan', page: 1, pageSize: 1 }, new Map([['provider-1', 'deepseek']]))
    expect(firstPage.total).toBe(2)
    expect(firstPage.rows).toHaveLength(1)
    expect(firstPage.rows[0]).toMatchObject({ title: 'Gamma plan', modelId: 'model-a', projectName: 'History project' })
    expect(firstPage.stats.topModel).toMatchObject({ id: 'model-a', count: 2 })
    expect(firstPage.facets.projects).toContainEqual(expect.objectContaining({ id: project.id }))

    const secondPage = store.queryHistory({ q: 'plan', page: 2, pageSize: 1 })
    expect(secondPage.rows).toEqual([expect.objectContaining({ id: alpha.id, preview: 'Visible preview text' })])
    expect(store.queryHistory({ q: 'plan', page: 99, pageSize: 1 })).toMatchObject({ page: 2, rows: [expect.objectContaining({ id: alpha.id })] })
    expect(store.queryHistory({ projectIds: ['__temporary__'] }).rows).toEqual([expect.objectContaining({ id: beta.id })])
    expect(store.queryHistory({ modelIds: ['model-b'], statuses: ['active'] }).rows).toEqual([expect.objectContaining({ id: beta.id })])

    store.archiveSessions([alpha.id, beta.id])
    expect(store.listSessions().map(session => session.id)).toEqual([gamma.id])
    expect(store.queryHistory().rows).toEqual([expect.objectContaining({ id: gamma.id })])
    expect(store.queryHistory({ archiveView: 'archived', sort: 'title-asc' }).rows.map(row => row.id)).toEqual([alpha.id, beta.id])
    store.restoreSessions([beta.id])
    expect(store.queryHistory({ archiveView: 'archived' }).rows).toEqual([expect.objectContaining({ id: alpha.id })])
    expect(store.queryHistory().rows.map(row => row.id)).toContain(beta.id)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('reports missing project directories without failing the project list', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'missing-project')
    mkdirSync(directory)
    const project = store.createProject(directory, '已移除目录')
    rmSync(directory, { recursive: true, force: true })

    expect(store.listProjects()).toEqual([expect.objectContaining({ id: project.id, directoryExists: false })])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('uses the shared Mira workspace for an unassigned session', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目')

    const recent = store.createSession()
    const projectSession = store.createSession(project.id)

    expect(recent.projectId).toBeUndefined()
    expect(recent.workingDirectory).toBe(join(root, '.mira', 'workspace'))
    expect(existsSync(recent.workingDirectory)).toBe(true)
    expect(projectSession.projectId).toBe(project.id)
    expect(projectSession.workingDirectory).toBe(directory)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('defaults delegation on and marks stale child tasks interrupted at startup recovery', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    expect(session.delegationEnabled).toBe(true)
    store.setActiveRun(session.id, {
      id: 'run-1', startedAt: 1, activities: [], subtasks: [{
        id: 'task-1', parentToolCallId: 'call-1', role: 'reviewer', task: '检查', status: 'running', createdAt: 1, startedAt: 1, activities: [],
      }],
    })
    store.recoverInterruptedSubtasks()
    expect(store.getSession(session.id).activeRun?.subtasks[0]).toMatchObject({ status: 'interrupted' })
    store.setDelegationEnabled(session.id, false)
    expect(store.getSession(session.id).delegationEnabled).toBe(false)
    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('recovers child public parts and tools only for their active run owner', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    store.setActiveRun(session.id, { id: 'run-current', startedAt: 1, activities: [], subtasks: [{
      id: 'child', parentToolCallId: 'delegate', role: 'reviewer', task: '检查', status: 'stopping', createdAt: 1,
      activities: [{ id: 'activity', label: 'read', kind: 'tool', status: 'running', startedAt: 1 }],
      parts: [{ id: 'done', type: 'text', text: 'Completed text', state: 'complete', startedAt: 1, completedAt: 2 }, { id: 'live', type: 'reasoning', text: 'Recorded public partial', state: 'streaming', startedAt: 3 }, { id: 'tool', type: 'tool', toolCallId: 'current-tool' }],
    }] })
    for (const [id, runId, subtaskId] of [['current-tool', 'run-current', 'child'], ['old-tool', 'run-old', 'child'], ['parent-tool', 'run-current', undefined]]) store.recordTool(session.id, { id: id!, tool: 'read', runId, subtaskId, status: 'running', createdAt: 1 })
    store.recoverInterruptedSubtasks()
    const value = store.getSession(session.id)
    expect(value.activeRun?.subtasks[0]).toMatchObject({ status: 'interrupted', activities: [{ status: 'failed' }], parts: [{ text: 'Completed text', state: 'complete' }, { text: 'Recorded public partial', state: 'interrupted' }, { toolCallId: 'current-tool' }] })
    expect(value.toolCalls.map(tool => [tool.id, tool.status])).toEqual([['current-tool', 'cancelled'], ['old-tool', 'running'], ['parent-tool', 'running']])
    expect(store.getSession(session.id)).toEqual(value)
    database.close(); rmSync(root, { recursive: true, force: true })
  })

  it('stores project sessions and trash outside the project directory', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'remove-me.txt'), '待删除', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)
    store.addMessage(session.id, 'user', '记录在外部')
    expect(existsSync(join(directory, '.mira'))).toBe(false)
    store.moveToTrash(session.id, 'remove-me.txt')
    expect(existsSync(join(directory, '.mira'))).toBe(false)
    expect(store.listTrash(project.id)).toHaveLength(1)
    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('attaches this run\'s file changes to its completed assistant reply', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const startedAt = Date.now()
    store.addMessage(session.id, 'user', '修改文件')
    store.recordTool(session.id, { id: 'previous-read', tool: 'read', target: 'README.md', status: 'ok', createdAt: startedAt - 1 })
    store.recordTool(session.id, { id: 'edit-file', tool: 'edit', target: 'src/main.ts', status: 'ok', diff: '-1 old\n+1 new', createdAt: startedAt + 1 })
    store.recordTool(session.id, { id: 'write-file', tool: 'write', target: 'src/new.ts', status: 'ok', diff: '+1 export {}', createdAt: startedAt + 2 })
    store.recordTool(session.id, { id: 'delete-file', tool: 'delete', target: 'src/old.ts', status: 'ok', diff: '- 删除 src/old.ts（可还原）', createdAt: startedAt + 3 })
    store.appendAssistantDelta(session.id, '已完成')
    store.finalizeAssistantMessage(session.id, { run: { startedAt, completedAt: startedAt + 10, durationMs: 10, activities: [] } })

    expect(store.getSession(session.id).messages.at(-1)?.fileChanges).toEqual([
      { toolCallId: 'edit-file', tool: 'edit', path: 'src/main.ts', diff: '-1 old\n+1 new' },
      { toolCallId: 'write-file', tool: 'write', path: 'src/new.ts', diff: '+1 export {}' },
      { toolCallId: 'delete-file', tool: 'delete', path: 'src/old.ts', diff: '- 删除 src/old.ts（可还原）' },
    ])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('lists trash across projects and restores only when original paths are free', () => {
    const { root, database, store } = createStore()
    const firstDirectory = join(root, 'first-project')
    const secondDirectory = join(root, 'second-project')
    mkdirSync(firstDirectory); mkdirSync(secondDirectory)
    writeFileSync(join(firstDirectory, 'first.txt'), 'first', 'utf8')
    writeFileSync(join(secondDirectory, 'second.txt'), 'second', 'utf8')
    const first = store.createProject(firstDirectory, '第一项目')
    const second = store.createProject(secondDirectory, '第二项目')
    const firstSession = store.createSession(first.id)
    const secondSession = store.createSession(second.id)
    store.moveToTrash(firstSession.id, 'first.txt')
    store.moveToTrash(secondSession.id, 'second.txt')

    expect(store.listTrash()).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: first.id, projectName: '第一项目', paths: ['first.txt'] }),
      expect.objectContaining({ projectId: second.id, projectName: '第二项目', paths: ['second.txt'] }),
    ]))
    expect(store.listTrash(first.id)).toEqual([expect.objectContaining({ projectId: first.id, paths: ['first.txt'] })])

    const entry = store.listTrash(first.id)[0]
    writeFileSync(join(firstDirectory, 'first.txt'), 'replacement', 'utf8')
    expect(() => store.restoreTrash(first.id, entry.token)).toThrow('目标路径已存在')
    expect(store.listTrash(first.id)).toHaveLength(1)
    rmSync(join(firstDirectory, 'first.txt'))
    store.restoreTrash(first.id, entry.token)
    expect(readFileSync(join(firstDirectory, 'first.txt'), 'utf8')).toBe('first')
    expect(store.listTrash(first.id)).toHaveLength(0)

    const secondEntry = store.listTrash(second.id)[0]
    rmSync(secondDirectory, { recursive: true, force: true })
    expect(() => store.restoreTrash(second.id, secondEntry.token)).toThrow('项目目录不存在')
    expect(store.listTrash(second.id)).toHaveLength(1)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('saves retention days and removes only expired trash entries', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'expired.txt'), 'expired', 'utf8')
    writeFileSync(join(directory, 'recent.txt'), 'recent', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)
    const expired = store.moveToTrash(session.id, 'expired.txt')
    const recent = store.moveToTrash(session.id, 'recent.txt')
    const current = store.getPermissionConfig()
    expect(store.savePermissionConfig({ ...current, trashRetentionDays: 1 }).trashRetentionDays).toBe(1)
    expect(store.savePermissionConfig({ ...current, trashRetentionDays: 31 }).trashRetentionDays).toBe(1)
    const orphan = join(root, '.mira', 'trash', 'removed-project', '1-legacy')
    mkdirSync(orphan, { recursive: true })
    expect(store.cleanupExpiredTrash(Date.now())).toBe(1)
    expect(store.listTrash(project.id)).toHaveLength(2)
    const future = Date.now() + 2 * 24 * 60 * 60 * 1000
    expect(store.cleanupExpiredTrash(future)).toBe(2)
    expect(store.listTrash(project.id)).toEqual([])
    expect(existsSync(join(directory, 'expired.txt'))).toBe(false)
    expect(existsSync(join(directory, 'recent.txt'))).toBe(false)
    expect(expired.token).not.toBe(recent.token)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists pinned sessions in the session index and file', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()

    store.setPinned(session.id, true)
    expect(store.getSession(session.id).pinned).toBe(true)
    expect(store.listSessions()).toEqual([expect.objectContaining({ id: session.id, pinned: true })])

    store.setPinned(session.id, false)
    expect(store.getSession(session.id).pinned).toBe(false)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('renames a session in the session file and index', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()

    store.renameSession(session.id, '  已重命名的聊天  ')
    expect(store.getSession(session.id).title).toBe('已重命名的聊天')
    expect(store.listSessions()).toEqual([expect.objectContaining({ id: session.id, title: '已重命名的聊天' })])
    expect(() => store.renameSession(session.id, '  ')).toThrow('聊天名称不能为空')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('keeps manual titles ahead of asynchronous automatic title results', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()

    expect(store.getSession(session.id)).toMatchObject({ titleSource: 'auto', titleRevision: 0 })
    const revision = store.reserveAutoTitle(session.id)
    expect(revision).toBe(1)
    expect(store.applyAutoTitle(session.id, '  “会话   摘要标题”  ', revision!)).toMatchObject({ title: '会话 摘要标题' })

    const nextRevision = store.reserveAutoTitle(session.id)
    store.renameSession(session.id, '人工标题')
    expect(store.isAutoTitleCurrent(session.id, nextRevision!)).toBe(false)
    expect(store.applyAutoTitle(session.id, '过期自动标题', nextRevision!)).toBeUndefined()
    expect(store.getSession(session.id)).toMatchObject({ title: '人工标题', titleSource: 'manual' })


    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('only generates automatic titles for long, meaningful first messages', () => {
    expect(shouldGenerateAutoTitle('测试')).toBe(false)
    expect(shouldGenerateAutoTitle('111')).toBe(false)
    expect(shouldGenerateAutoTitle('hahahahahaha')).toBe(false)
    expect(shouldGenerateAutoTitle('请帮我梳理这个桌面端应用的会话标题生成流程，并给出最小可行实现与验收测试建议。')).toBe(true)
  })

  it('includes the current Git branch only for projects on a branch', () => {
    const { root, database, store } = createStore()
    const gitDirectory = join(root, 'git-project')
    const plainDirectory = join(root, 'plain-project')
    mkdirSync(gitDirectory)
    mkdirSync(plainDirectory)
    execFileSync('git', ['init'], { cwd: gitDirectory })
    writeFileSync(join(gitDirectory, 'README.md'), '项目说明', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: gitDirectory })
    execFileSync('git', ['-c', 'user.name=Mira', '-c', 'user.email=mira@example.test', 'commit', '-m', '初始化'], { cwd: gitDirectory })
    const gitProject = store.createProject(gitDirectory, 'Git 项目')
    const plainProject = store.createProject(plainDirectory, '普通项目')

    const listed = store.listProjects()
    expect(listed.find(project => project.id === gitProject.id)?.gitBranch).toBeTruthy()
    expect(listed.find(project => project.id === plainProject.id)?.gitBranch).toBeUndefined()

    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: gitDirectory, encoding: 'utf8' }).trim()
    execFileSync('git', ['checkout', '--detach', revision], { cwd: gitDirectory })
    expect(store.listProjects().find(project => project.id === gitProject.id)?.gitBranch).toBeUndefined()

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('lists, switches, and creates local Git branches with the current working tree status', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'git-project')
    mkdirSync(directory)
    execFileSync('git', ['init'], { cwd: directory })
    writeFileSync(join(directory, 'README.md'), '初始化', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: directory })
    execFileSync('git', ['-c', 'user.name=Mira', '-c', 'user.email=mira@example.test', 'commit', '-m', '初始化'], { cwd: directory })
    execFileSync('git', ['branch', 'topic'], { cwd: directory })
    writeFileSync(join(directory, 'README.md'), '已修改', 'utf8')
    writeFileSync(join(directory, 'new-file.md'), '未追踪', 'utf8')
    const project = store.createProject(directory, 'Git 项目')

    const initial = store.listGitBranches(project.id)
    expect(initial.map(branch => branch.name)).toContain('topic')
    expect(initial.find(branch => branch.current)?.uncommittedFileCount).toBe(2)

    const switched = store.checkoutGitBranch(project.id, 'topic')
    expect(switched.find(branch => branch.current)?.name).toBe('topic')
    const created = store.createAndCheckoutGitBranch(project.id, 'mira/new-branch')
    expect(created.find(branch => branch.current)?.name).toBe('mira/new-branch')
    expect(() => store.createAndCheckoutGitBranch(project.id, 'mira/new-branch')).toThrow('分支已存在')
    expect(() => store.createAndCheckoutGitBranch(project.id, 'mira/')).toThrow('分支名不能以“/”结尾')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists validated Git settings with safe defaults', () => {
    const { root, database, store } = createStore()
    expect(store.getGitConfig()).toMatchObject({ branchPrefix: 'mira/', pullRequestMergeMethod: 'merge', alwaysForcePush: false, createDraftPullRequest: true, reviewDelivery: 'inline' })

    const saved = store.saveGitConfig({
      branchPrefix: 'feature/', pullRequestMergeMethod: 'squash', alwaysForcePush: true, createDraftPullRequest: false,
      reviewDelivery: 'separate', commitInstructions: '使用中文提交信息', pullRequestInstructions: '描述影响范围',
    })
    expect(saved).toMatchObject({ branchPrefix: 'feature/', pullRequestMergeMethod: 'squash', alwaysForcePush: true, createDraftPullRequest: false, reviewDelivery: 'separate' })
    expect(store.getGitConfig().commitInstructions).toBe('使用中文提交信息')
    expect(() => store.saveGitConfig({ ...saved, branchPrefix: 'invalid' })).toThrow('分支前缀无效')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('removes project history without deleting its source folder or files', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'chapter.md'), '保留的源文件', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    store.createSession(project.id)

    store.deleteProject(project.id, true)

    expect(store.listProjects()).toEqual([])
    expect(existsSync(directory)).toBe(true)
    expect(existsSync(join(directory, 'chapter.md'))).toBe(true)
    expect(existsSync(join(directory, '.mira'))).toBe(false)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists the global permission default and limits disabled permission modes', () => {
    const { root, database, store } = createStore()
    database.prepare('INSERT INTO harness_settings(key, value) VALUES (?, ?)').run('permission', JSON.stringify({ globalDefaultMode: 'full' }))

    expect(store.getPermissionConfig()).toMatchObject({ globalDefaultMode: 'full', autoApproveEnabled: true, fullAccessEnabled: true })
    expect(store.createSession().permissionMode).toBe('full')

    store.savePermissionConfig({ ...store.getPermissionConfig(), fullAccessEnabled: false })
    expect(store.getPermissionConfig().globalDefaultMode).toBe('auto-approve')
    expect(store.createSession().permissionMode).toBe('auto-approve')

    store.savePermissionConfig({ ...store.getPermissionConfig(), autoApproveEnabled: false })
    expect(store.getPermissionConfig().globalDefaultMode).toBe('default')
    const session = store.createSession()
    expect(() => store.setPermission(session.id, 'auto-approve')).toThrow('自动审核权限未启用')
    expect(() => store.setPermission(session.id, 'full')).toThrow('完全访问权限未启用')

    store.savePermissionConfig({ ...store.getPermissionConfig(), autoApproveEnabled: true, fullAccessEnabled: true })
    expect(store.getPermissionConfig().globalDefaultMode).toBe('default')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('removes empty sessions and keeps sessions with user messages', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目')
    store.createSession(project.id)
    const retained = store.createSession(project.id)
    store.addMessage(retained.id, 'user', '保留这条对话')

    expect(store.removeEmptySessions()).toBe(1)
    expect(store.listSessions().map(session => session.id)).toEqual([retained.id])
    expect(store.getProject(project.id).sessionCount).toBe(1)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it.each(['text', 'attachments', 'group', 'dissolved-group', 'grouped-root'])('keeps an unsent project session with persisted %s drafts after a database restart', kind => {
    const root = mkdtempSync(join(tmpdir(), 'mira-harness-draft-restart-'))
    let database: PlatformDatabase | undefined
    try {
      database = new PlatformDatabase(root)
      const directory = join(root, 'draft-project')
      mkdirSync(directory)
      const project = database.harness.createProject(directory, '草稿项目')
      const retained = database.harness.createSession(project.id)
      const blank = database.harness.createSession(project.id)
      const preferenceKey = 'first-party.mira-harness.harness-react-composer-drafts'
      const preference = {
        drafts: kind === 'text' ? { [retained.id]: '  重启后继续编辑  ' } : {},
        fileDrafts: kind === 'attachments' ? { [retained.id]: [{ path: '/tmp/selected.md', name: 'selected.md' }] } : {},
      }
      database.savePreference(preferenceKey, preference)
      if (kind === 'group' || kind === 'dissolved-group') database.savePreference('first-party.mira-harness.session-drawer', { groups: kind === 'group' ? [{ id: 'group', name: '研究', sessionIds: [retained.id] }] : [], ungroupedSessionOrder: kind === 'dissolved-group' ? [retained.id] : [] })
      if (kind === 'grouped-root') database.savePreference('first-party.mira-harness.session-drawer', { groups: [{ id: blank.id, name: '同名组身份', sessionIds: [] }], groupedRootOrder: [{ type: 'group', id: blank.id }, { type: 'session', id: retained.id }] })
      database.close(); database = undefined

      database = new PlatformDatabase(root)
      expect(database.harness.listSessions().map(session => session.id)).toEqual([retained.id])
      expect(database.harness.getSession(retained.id)).toMatchObject({ projectId: project.id, messages: [] })
      expect(existsSync(new MiraPaths(root).session(retained.id))).toBe(true)
      expect(existsSync(new MiraPaths(root).session(blank.id))).toBe(false)
      expect(database.getSnapshot().preferences[preferenceKey]).toEqual(preference)
    } finally {
      database?.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('cleans healthy empty sessions while retaining the owner of malformed composer drafts on restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-harness-empty-restart-'))
    let database: PlatformDatabase | undefined
    try {
      database = new PlatformDatabase(root)
      const blank = database.harness.createSession()
      const cleared = database.harness.createSession()
      const malformed = database.harness.createSession()
      database.savePreference('first-party.mira-harness.harness-react-composer-drafts', {
        drafts: { [cleared.id]: ' \n ', [malformed.id]: { text: 'not a draft' }, draft: '未绑定会话的输入', orphan: '已删除会话的输入' },
        fileDrafts: { [cleared.id]: [], [malformed.id]: [null, { path: '', name: 'empty.md' }, { path: 'note.md', name: ' ' }], orphan: [{ path: '/tmp/orphan.md', name: 'orphan.md' }] },
      })
      database.close(); database = undefined

      database = new PlatformDatabase(root)
      expect(database.harness.listSessions().map(session => session.id)).toEqual([malformed.id])
      for (const id of [blank.id, cleared.id]) expect(existsSync(new MiraPaths(root).session(id))).toBe(false)
      expect(existsSync(new MiraPaths(root).session(malformed.id))).toBe(true)
    } finally {
      database?.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('persists context summaries without removing visible conversation messages', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const user = store.addMessage(session.id, 'user', '保留的早期提问')
    const assistant = store.appendAssistantText(session.id, '保留的早期回复', undefined, { input: 40, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 60 })
    assistant.context = {
      summary: '此前对话摘要',
      compactedThroughMessageId: user.messages.at(-1)!.id,
      compactedAt: Date.now(),
      usage: { usedTokens: 128, contextWindow: 128000, source: 'reported', updatedAt: Date.now() },
    }
    store.updateSession(assistant)

    const restored = store.getSession(session.id)
    expect(restored.messages).toHaveLength(2)
    expect(restored.messages[0].content).toBe('保留的早期提问')
    expect(restored.context?.summary).toBe('此前对话摘要')
    expect(restored.messages[1].usage?.totalTokens).toBe(60)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('aggregates persisted usage by provider, project, and session without pricing unknown models', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'usage-project'); mkdirSync(directory)
    const project = store.createProject(directory, 'Usage project')
    const priced = store.createSession(project.id)
    const unpriced = store.createSession()
    store.updateSession({ ...store.getSession(priced.id), modelProviderId: 'provider-1', modelId: 'model-a' })
    store.updateSession({ ...store.getSession(unpriced.id), modelProviderId: 'provider-2', modelId: 'model-b' })
    store.addMessage(priced.id, 'user', '计算成本')
    store.appendAssistantText(priced.id, '已完成', undefined, { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150, cost: { currency: 'USD', input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3, priced: true } })
    store.addMessage(unpriced.id, 'user', '没有价格')
    store.appendAssistantText(unpriced.id, '已完成', undefined, { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30 })

    const stats = store.usageStats(new Map([['provider-1', 'Provider One'], ['provider-2', 'Provider Two']]))
    expect(stats.total).toMatchObject({ totalTokens: 180, costs: { USD: 0.3 }, pricedRuns: 1, unpricedRuns: 1 })
    expect(stats.providers).toContainEqual(expect.objectContaining({ label: 'Provider One / model-a', totalTokens: 150 }))
    expect(stats.projects).toContainEqual(expect.objectContaining({ id: project.id, totalTokens: 150 }))
    expect(stats.sessions).toContainEqual(expect.objectContaining({ id: unpriced.id, unpricedRuns: 1 }))
    expect(stats.appUsage?.summary.totalTokens).toBe(180)
    expect(stats.appUsage?.days.flatMap(day => day.models)).toContainEqual({ modelId: 'model-a', totalTokens: 150 })
    const changed = store.getSession(unpriced.id)
    const reply = changed.messages.find(message => message.role === 'assistant')!
    reply.model = { providerId: 'original-provider', providerName: 'Original', modelId: 'actual-model' }
    reply.runId = 'original-run'
    reply.run = { startedAt: reply.createdAt, completedAt: reply.createdAt + 60000, durationMs: 60000, status: 'completed', activities: [] }
    changed.messages.push({ ...reply, id: 'inherited-reply', inherited: true })
    store.updateSession(changed)
    const appUsage = store.usageStats().appUsage!
    expect(appUsage.summary).toMatchObject({ totalTokens: 180, longestSessionMs: 60000 })
    expect(appUsage.days.flatMap(day => day.models)).toContainEqual({ modelId: 'actual-model', totalTokens: 30 })


    database.close(); rmSync(root, { recursive: true, force: true })
  })

  it('persists live assistant deltas without rewriting historical structured rows', async () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      session.messages = [{ id: 'prompt', role: 'user', content: '流式问题', createdAt: 1 }]
      session.toolCalls = [{ id: 'read', tool: 'read', status: 'ok', createdAt: 1 }]
      session.activePlan = { id: 'plan', status: 'executing', request: '请求', understanding: '方案', steps: [{ label: '实现' }], risks: [], createdAt: 1, updatedAt: 1 }
      session.interactions = [{ id: 'review', kind: 'plan-review', planId: 'plan', status: 'approved', createdAt: 1 }]
      session.activeRun = { id: 'run', messageId: 'live', startedAt: 2, activities: [{ id: 'thinking', label: '思考', status: 'running', startedAt: 2 }], subtasks: [{ id: 'child', parentToolCallId: 'delegate', role: 'explorer', task: '核查', status: 'running', createdAt: 2, activities: [] }] }
      store.updateSession(session)
      const untouched = ['harness_tool_calls', 'harness_plans', 'harness_interactions', 'harness_runs', 'harness_run_activities', 'harness_subtasks']
      const before = untouched.map(table => database.prepare(`SELECT * FROM ${table} WHERE session_id = ?`).all(session.id))
      for (const table of untouched) for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        database.exec(`CREATE TRIGGER forbid_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'historical rows rewritten'); END`)
      }
      database.exec(`CREATE TRIGGER forbid_message_delete BEFORE DELETE ON harness_messages BEGIN SELECT RAISE(ABORT, 'historical messages deleted'); END;
        CREATE TRIGGER forbid_history_update BEFORE UPDATE ON harness_messages WHEN OLD.message_id <> 'live' BEGIN SELECT RAISE(ABORT, 'historical message updated'); END;`)
      const parts: NonNullable<HarnessMessage['parts']> = [{ id: 'text', type: 'text', text: '第一段', state: 'streaming', startedAt: 2 }]
      store.appendAssistantDelta(session.id, '第一段', { runId: 'run', messageId: 'live', parts })
      const liveRow = database.prepare('SELECT rowid, payload FROM harness_messages WHERE session_id = ? AND message_id = ?').get(session.id, 'live') as { rowid: number; payload: string }
      parts[0] = { id: 'text', type: 'text', text: '第一段，第二段', state: 'streaming', startedAt: 2 }
      const saved = store.appendAssistantDelta(session.id, '，第二段', { runId: 'run', messageId: 'live', parts })
      const changed = database.prepare('SELECT rowid, content, payload FROM harness_messages WHERE session_id = ? AND message_id = ?').get(session.id, 'live') as { rowid: number; content: string; payload: string }
      expect(changed.rowid).toBe(liveRow.rowid)
      expect(changed.content).toBe('第一段，第二段')
      expect(JSON.parse(changed.payload)).toEqual(saved.messages.at(-1))
      expect(untouched.map(table => database.prepare(`SELECT * FROM ${table} WHERE session_id = ?`).all(session.id))).toEqual(before)
      const state = database.prepare('SELECT payload FROM harness_session_state WHERE session_id = ?').get(session.id) as { payload: string }
      const metadata = database.prepare('SELECT path, updated_at FROM harness_sessions WHERE id = ?').get(session.id) as { path: string; updated_at: number }
      expect(JSON.parse(state.payload)).toEqual(saved)
      expect(JSON.parse(readFileSync(metadata.path, 'utf8'))).toEqual(saved)
      expect(metadata.updated_at).toBe(saved.updatedAt)
      expect((await store.searchConversations('第二段'))[0]).toMatchObject({ id: session.id, messageId: 'live' })
      expect(existsSync(`${metadata.path}.${process.pid}.tmp`)).toBe(false)
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it.each(['unordered', 'mismatched-run', 'mismatched-message', 'missing-run'] as const)('keeps full structured persistence for %s assistant writes', mode => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      session.messages = [{ id: 'prompt', role: 'user', content: '问题', createdAt: 1 }]
      if (mode !== 'missing-run') session.activeRun = { id: 'run', messageId: 'live', startedAt: 2, activities: [], subtasks: [] }
      store.updateSession(session)
      database.exec(`CREATE TEMP TABLE rewritten_messages (message_id TEXT);
        CREATE TEMP TRIGGER count_full_message_rewrite BEFORE DELETE ON harness_messages BEGIN INSERT INTO rewritten_messages VALUES (OLD.message_id); END;`)
      const ordered = mode === 'unordered' ? undefined : { runId: mode === 'mismatched-run' ? 'other-run' : 'run', messageId: mode === 'mismatched-message' ? 'other-message' : 'live', parts: [] }
      const saved = store.appendAssistantDelta(session.id, '保留旧入口行为', ordered)
      expect(database.prepare('SELECT message_id FROM rewritten_messages').all()).toEqual([{ message_id: 'prompt' }])
      const stored = database.prepare('SELECT payload FROM harness_session_state WHERE session_id = ?').get(session.id) as { payload: string }
      expect(JSON.parse(stored.payload)).toEqual(saved)
      expect(saved.messages.at(-1)?.content).toBe('保留旧入口行为')
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('rolls back a new assistant segment whose ID already belongs to historical content', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      session.messages = [{ id: 'old-assistant', role: 'assistant', content: '历史回复不可覆盖', createdAt: 1, runId: 'old-run' }, { id: 'new-prompt', role: 'user', content: '新问题', createdAt: 2 }]
      session.activeRun = { id: 'run', messageId: 'old-assistant', startedAt: 3, activities: [], subtasks: [] }
      store.updateSession(session)
      const beforeState = database.prepare('SELECT * FROM harness_session_state WHERE session_id = ?').get(session.id)
      const beforeMessages = database.prepare('SELECT rowid, * FROM harness_messages WHERE session_id = ? ORDER BY rowid').all(session.id)
      const metadata = database.prepare('SELECT * FROM harness_sessions WHERE id = ?').get(session.id) as { path: string }
      const backup = readFileSync(metadata.path, 'utf8')
      expect(() => store.appendAssistantDelta(session.id, '迟到的回复', { runId: 'run', messageId: 'old-assistant', parts: [] })).toThrow()
      expect(database.prepare('SELECT * FROM harness_session_state WHERE session_id = ?').get(session.id)).toEqual(beforeState)
      expect(database.prepare('SELECT rowid, * FROM harness_messages WHERE session_id = ? ORDER BY rowid').all(session.id)).toEqual(beforeMessages)
      expect(database.prepare('SELECT * FROM harness_sessions WHERE id = ?').get(session.id)).toEqual(metadata)
      expect(readFileSync(metadata.path, 'utf8')).toBe(backup)
      expect(existsSync(`${metadata.path}.${process.pid}.tmp`)).toBe(false)
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('repairs an absent structured plan row instead of silently taking the assistant-only path', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      session.messages = [{ id: 'prompt', role: 'user', content: '问题', createdAt: 1 }]
      session.activeRun = { id: 'run', messageId: 'live', startedAt: 2, activities: [], subtasks: [] }
      session.activePlan = { id: 'plan', status: 'executing', request: '请求', understanding: '理解', steps: [], risks: [], createdAt: 1, updatedAt: 1 }
      store.updateSession(session)
      database.prepare('DELETE FROM harness_plans WHERE session_id = ?').run(session.id)
      const saved = store.appendAssistantDelta(session.id, '继续回复', { runId: 'run', messageId: 'live', parts: [] })
      const storedPlan = database.prepare('SELECT payload FROM harness_plans WHERE session_id = ?').get(session.id) as { payload: string }
      expect(JSON.parse(storedPlan.payload)).toEqual(saved.activePlan)
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('rebuilds structured history if the current assistant row is missing', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      session.messages = [{ id: 'prompt', role: 'user', content: '问题', createdAt: 1 }, { id: 'live', role: 'assistant', content: '第一段', runId: 'run', createdAt: 2 }]
      session.activeRun = { id: 'run', messageId: 'live', startedAt: 2, activities: [], subtasks: [] }
      store.updateSession(session)
      database.prepare('DELETE FROM harness_messages WHERE session_id = ? AND message_id = ?').run(session.id, 'live')
      const saved = store.appendAssistantDelta(session.id, '第二段', { runId: 'run', messageId: 'live', parts: [] })
      const rows = database.prepare('SELECT payload FROM harness_messages WHERE session_id = ? ORDER BY created_at, rowid').all(session.id) as Array<{ payload: string }>
      expect(rows.map(row => JSON.parse(row.payload))).toEqual(saved.messages)
      expect(saved.messages.at(-1)?.content).toBe('第一段第二段')
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('falls back to full persistence if image freezing changes a historical snapshot during a live save', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      session.messages = [{ id: 'prompt', role: 'user', content: '旧图', createdAt: 1 }, { id: 'live', role: 'assistant', content: '第一段', runId: 'run', createdAt: 2 }]
      session.activeRun = { id: 'run', messageId: 'live', startedAt: 2, activities: [], subtasks: [] }
      store.updateSession(session)
      const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
      session.messages[0].attachments = [{ path: 'old.png', name: 'old.png', mediaType: 'image/png', content: image }]
      // Supply the pre-freeze snapshot directly to exercise saveSession's guard,
      // independently of getSession's earlier legacy-image migration.
      const snapshot = vi.spyOn(store, 'getSession').mockReturnValueOnce(session)
      let saved: ReturnType<HarnessStore['appendAssistantDelta']>
      try { saved = store.appendAssistantDelta(session.id, '第二段', { runId: 'run', messageId: 'live', parts: [] }) }
      finally { snapshot.mockRestore() }
      const user = database.prepare('SELECT payload FROM harness_messages WHERE session_id = ? AND message_id = ?').get(session.id, 'prompt') as { payload: string }
      const reference = saved!.messages[0].attachments![0]
      expect(reference).toMatchObject({ path: expect.stringMatching(/^mira-attachment:/), content: '', mediaType: 'image/png' })
      expect(JSON.parse(user.payload)).toEqual(saved!.messages[0])
      expect(store.hydrateMessageAttachments(session.id, saved!.messages[0]).attachments![0].content).toBe(image)
      expect(database.prepare('SELECT COUNT(*) AS count FROM harness_attachments WHERE session_id = ?').get(session.id)).toEqual({ count: 1 })
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('restores live text and frozen legacy images across reopening, then keeps fork and side streaming independent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-stream-restart-'))
    let platform = new PlatformDatabase(root)
    try {
      const store = platform.harness, session = store.createSession()
      session.messages = [{ id: 'image-prompt', role: 'user', content: '旧图问题', createdAt: 1 }]
      session.activeRun = { id: 'run', messageId: 'live', startedAt: 2, activities: [], subtasks: [] }
      store.updateSession(session)
      const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
      const raw = (platform as unknown as { database: Database.Database }).database
      const legacy = { ...session, messages: [{ ...session.messages[0], attachments: [{ path: 'legacy.png', name: 'legacy.png', mediaType: 'image/png', content: image }] }] }
      raw.prepare('UPDATE harness_session_state SET payload = ? WHERE session_id = ?').run(JSON.stringify(legacy), session.id)
      store.appendAssistantDelta(session.id, '', { runId: 'run', messageId: 'live', parts: [{ id: 'thinking', type: 'reasoning', text: '先分析', state: 'complete', startedAt: 2 }] })
      const saved = store.appendAssistantDelta(session.id, '可重启的回复', { runId: 'run', messageId: 'live', parts: [{ id: 'thinking', type: 'reasoning', text: '先分析', state: 'complete', startedAt: 2 }, { id: 'text', type: 'text', text: '可重启的回复', state: 'streaming', startedAt: 2 }] })
      const userRow = raw.prepare('SELECT payload FROM harness_messages WHERE session_id = ? AND message_id = ?').get(session.id, 'image-prompt') as { payload: string }
      expect(JSON.parse(userRow.payload)).toEqual(saved.messages[0])
      platform.close(); platform = new PlatformDatabase(root)
      const restored = platform.harness.getSession(session.id)
      expect(restored).toEqual(saved)
      expect(platform.harness.hydrateMessageAttachments(session.id, restored.messages[0]).attachments![0].content).toBe(image)
      expect((await platform.harness.searchConversations('可重启的回复'))[0]).toMatchObject({ id: session.id, messageId: 'live' })
      const parts = restored.messages.at(-1)!.parts!.map(part => part.type === 'tool' ? part : { ...part, state: 'complete' as const })
      platform.harness.finalizeAssistantMessage(session.id, { runId: 'run', messageId: 'live', parts, run: { startedAt: 2, completedAt: 3, durationMs: 1, status: 'completed', activities: [] } })
      platform.harness.setActiveRun(session.id, undefined)
      const parentBefore = platform.harness.getSession(session.id)
      const fork = platform.harness.forkConversation(session.id, 'live', '9857af13-1318-4c18-a1b8-0c77172f3141')
      platform.harness.addMessage(fork.id, 'user', '分支问题')
      platform.harness.setActiveRun(fork.id, { id: 'fork-run', messageId: 'fork-live', startedAt: 4, activities: [], subtasks: [] })
      platform.harness.appendAssistantDelta(fork.id, '分支独立流', { runId: 'fork-run', messageId: 'fork-live', parts: [] })
      const side = platform.harness.createSideConversation(session.id)
      platform.harness.addMessage(side.id, 'user', '旁路问题')
      platform.harness.setActiveRun(side.id, { id: 'side-run', messageId: 'side-live', startedAt: 4, activities: [], subtasks: [] })
      platform.harness.appendAssistantDelta(side.id, '旁路独立流', { runId: 'side-run', messageId: 'side-live', parts: [] })
      expect(platform.harness.getSession(session.id)).toEqual(parentBefore)
      expect((await platform.harness.searchConversations('分支独立流')).map(row => row.id)).toEqual([fork.id])
      expect(await platform.harness.searchConversations('旁路独立流')).toEqual([])
      expect(platform.harness.hydrateMessageAttachments(fork.id, platform.harness.getSession(fork.id).messages[0]).attachments![0].content).toBe(image)
    } finally { platform.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('persists assistant deltas atomically and finalizes the same message', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    store.addMessage(session.id, 'user', '请回答')
    store.appendAssistantDelta(session.id, '第一段')
    store.appendAssistantDelta(session.id, '，第二段')
    store.finalizeAssistantMessage(session.id, {
      interrupted: true,
      run: { startedAt: 1, completedAt: 2, durationMs: 1, activities: [] },
    })

    const restored = store.getSession(session.id)
    const assistant = restored.messages.at(-1)!
    const row = database.prepare('SELECT path FROM harness_sessions WHERE id = ?').get(session.id) as { path: string }
    expect(assistant.content).toBe('第一段，第二段')
    expect(assistant.interrupted).toBe(true)
    expect(assistant.run?.durationMs).toBe(1)
    expect(() => JSON.parse(readFileSync(row.path, 'utf8'))).not.toThrow()
    expect(existsSync(`${row.path}.${process.pid}.tmp`)).toBe(false)

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('edits a user message, truncates later history, and clears compacted context', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const first = store.addMessage(session.id, 'user', '旧问题', [{ path: 'notes.txt', content: '保留附件内容', size: 18 }])
    const firstId = first.messages.at(-1)!.id
    store.appendAssistantText(session.id, '旧回答')
    store.addMessage(session.id, 'user', '后续问题')
    const withContext = store.getSession(session.id)
    withContext.context = { summary: '旧摘要', compactedThroughMessageId: firstId, compactedAt: Date.now() }
    store.updateSession(withContext)

    const edited = store.editUserMessageAndTruncate(session.id, firstId, '新问题')
    expect(edited.messages).toEqual([expect.objectContaining({ id: firstId, role: 'user', content: '新问题' })])
    expect(edited.messages[0].attachments).toEqual([{ path: 'notes.txt', content: '保留附件内容', size: 18 }])
    expect(edited.context).toBeUndefined()
    expect(() => store.editUserMessageAndTruncate(session.id, firstId, '   ', undefined, [])).toThrow('消息不能为空')
    expect(store.editUserMessageAndTruncate(session.id, firstId, '', undefined).messages[0].attachments).toHaveLength(1)
    expect(store.editUserMessageAndTruncate(session.id, firstId, '纯文字', undefined, []).messages[0].attachments).toEqual([])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('resolves edited attachments from historical snapshots and rejects foreign or duplicate identities before truncation', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const original = store.addMessage(session.id, 'user', '原要求', [{ path: 'notes.txt', name: 'notes.txt', content: '原始快照' }])
    store.appendAssistantText(session.id, '后续回答')
    const message = original.messages[0]
    expect(store.resolveEditedMessageAttachments(session.id, message.id, [{ path: 'notes.txt', name: '伪造名称' }])).toEqual(message.attachments)
    expect(() => store.resolveEditedMessageAttachments(session.id, message.id, [{ path: 'notes.txt', name: 'one' }, { path: 'notes.txt', name: 'two' }])).toThrow('附件列表')
    expect(() => store.resolveEditedMessageAttachments(session.id, message.id, [{ path: 'mira-attachment:foreign', name: 'foreign' }])).toThrow()
    expect(store.getSession(session.id).messages).toHaveLength(2)
    database.close(); rmSync(root, { recursive: true, force: true })
  })

  it('enforces cumulative edited attachment bytes across retained and newly staged snapshots without truncation', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      const old = store.addMessage(session.id, 'user', '原要求', [{ path: 'old.txt', name: 'old.txt', content: 'x'.repeat(768 * 1024 + 1) }])
      store.appendAssistantText(session.id, '保留后续回答')
      const files = ['one.txt', 'two.txt'].map(name => ({ name, mediaType: 'text/plain', data: Buffer.from('y'.repeat(128 * 1024)).toString('base64') }))
      const references = store.importMessageAttachments(session.id, files)
      expect(() => store.resolveEditedMessageAttachments(session.id, old.messages[0].id, [{ path: 'old.txt', name: 'old.txt' }, ...references])).toThrow('总大小')
      expect(store.getSession(session.id).messages).toHaveLength(2)
      expect(store.getSession(session.id).messages[0].attachments?.[0].content).toHaveLength(768 * 1024 + 1)
    } finally { database.close(); rmSync(root, { recursive: true, force: true }) }
  })

  it('lists ordinary project files and snapshots text while referencing binary files by path', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'notes.txt'), '项目说明', 'utf8')
    writeFileSync(join(directory, 'binary.dat'), Buffer.from([0, 1, 2]))
    mkdirSync(join(directory, 'node_modules'))
    writeFileSync(join(directory, 'node_modules', 'ignored.txt'), '忽略', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)

    expect(store.listProjectFiles(project.id)).toEqual([{ path: 'binary.dat', name: 'binary.dat' }, { path: 'notes.txt', name: 'notes.txt' }])
    expect(store.resolveMessageAttachments(session.id, [{ path: 'notes.txt', name: 'notes.txt' }])).toEqual([{ path: 'notes.txt', name: 'notes.txt', content: '项目说明' }])
    expect(() => store.resolveMessageAttachments(session.id, [{ path: '../outside.txt', name: 'outside.txt' }])).toThrow('路径不在项目目录内')
    expect(store.resolveMessageAttachments(session.id, [{ path: 'binary.dat', name: 'binary.dat' }])[0]).toMatchObject({ localPath: realpathSync(join(directory, 'binary.dat')), size: 3 })

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('references personal-workspace relative text files without creating a project', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      mkdirSync(join(session.workingDirectory!, 'notes'), { recursive: true })
      writeFileSync(join(session.workingDirectory!, 'notes', 'mira.md'), '个人资料')
      expect(store.resolveMessageAttachments(session.id, [{ path: 'notes/mira.md', name: 'mira.md' }])).toEqual([
        { path: 'notes/mira.md', name: 'mira.md', content: '个人资料' },
      ])
      expect(store.getSession(session.id).projectId).toBeUndefined()
      expect(store.listProjects()).toEqual([])
    } finally {
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects personal absolute references, traversal and links escaping the workspace', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      writeFileSync(join(root, 'external.md'), '不可引用')
      symlinkSync(join(root, 'external.md'), join(session.workingDirectory!, 'escape.md'))
      expect(() => store.resolveMessageAttachments(session.id, [{ path: join(root, 'external.md'), name: 'external.md' }])).toThrow('个人工作区只能引用')
      expect(() => store.resolveMessageAttachments(session.id, [{ path: '../../external.md', name: 'external.md' }])).toThrow('路径不在项目目录内')
      expect(() => store.resolveMessageAttachments(session.id, [{ path: 'escape.md', name: 'escape.md' }])).toThrow('符号链接离开项目目录')
    } finally {
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each(['personal', 'project'] as const)('accepts internal file links for a %s session and rejects escaped links', scope => {
    const { root, database, store } = createStore()
    try {
      const projectDirectory = join(root, 'project')
      if (scope === 'project') mkdirSync(projectDirectory)
      const session = store.createSession(scope === 'project' ? store.createProject(projectDirectory).id : undefined)
      writeFileSync(join(session.workingDirectory!, 'note.md'), '工作区文本')
      writeFileSync(join(root, 'outside.md'), '外部文本')
      symlinkSync(join(session.workingDirectory!, 'note.md'), join(session.workingDirectory!, 'inside.md'))
      symlinkSync(join(root, 'outside.md'), join(session.workingDirectory!, 'outside.md'))
      expect(store.resolveMessageAttachments(session.id, [{ path: 'inside.md', name: 'inside.md' }])).toEqual([
        { path: 'inside.md', name: 'note.md', content: '工作区文本' },
      ])
      expect(() => store.resolveMessageAttachments(session.id, [{ path: 'outside.md', name: 'outside.md' }])).toThrow('符号链接离开项目目录')
    } finally {
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('references oversized local files before reading their contents', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const target = join(session.workingDirectory!, 'large.md')
    writeFileSync(target, Buffer.alloc(256 * 1024 + 1, 65))
    const reads = vi.spyOn(fs, 'readFileSync')
    try {
      expect(store.resolveMessageAttachments(session.id, [{ path: 'large.md', name: 'large.md' }])[0]).toMatchObject({ localPath: realpathSync(target), size: 256 * 1024 + 1 })
      expect(reads.mock.calls.some(([path]) => String(path) === realpathSync(target))).toBe(false)
    } finally {
      reads.mockRestore()
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uses a local path when the next text file would overflow the inline total', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const references = Array.from({ length: 5 }, (_, index) => ({ path: `note-${index}.md`, name: `note-${index}.md` }))
    for (const reference of references) writeFileSync(join(session.workingDirectory!, reference.path), Buffer.alloc(256 * 1024, 65))
    const reads = vi.spyOn(fs, 'readFileSync')
    try {
      expect(store.resolveMessageAttachments(session.id, references)[4]).toMatchObject({ localPath: realpathSync(join(session.workingDirectory!, 'note-4.md')) })
      expect(reads.mock.calls.some(([path]) => String(path) === realpathSync(join(session.workingDirectory!, 'note-3.md')))).toBe(true)
      expect(reads.mock.calls.some(([path]) => String(path) === realpathSync(join(session.workingDirectory!, 'note-4.md')))).toBe(false)
    } finally {
      reads.mockRestore()
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rechecks attachment size after reading content that grew after stat', async () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const target = join(session.workingDirectory!, 'growing.md')
    writeFileSync(target, 'initial')
    const actualRead = (await vi.importActual<typeof import('node:fs')>('node:fs')).readFileSync
    const resolved = realpathSync(target)
    const reads = vi.spyOn(fs, 'readFileSync').mockImplementation(((path: fs.PathOrFileDescriptor, ...args: unknown[]) =>
      String(path) === resolved ? Buffer.alloc(256 * 1024 + 1, 65) : Reflect.apply(actualRead, fs, [path, ...args])) as typeof fs.readFileSync)
    try {
      expect(store.resolveMessageAttachments(session.id, [{ path: 'growing.md', name: 'growing.md' }])[0]).toMatchObject({ localPath: resolved, size: 256 * 1024 + 1 })
    } finally {
      reads.mockRestore()
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps personal attachment count limits while allowing binary path references', () => {
    const { root, database, store } = createStore()
    try {
      const session = store.createSession()
      writeFileSync(join(session.workingDirectory!, 'binary.dat'), Buffer.from([0, 1, 2]))
      expect(store.resolveMessageAttachments(session.id, [{ path: 'binary.dat', name: 'binary.dat' }])[0]).toMatchObject({ localPath: realpathSync(join(session.workingDirectory!, 'binary.dat')), size: 3 })
      const references = Array.from({ length: 13 }, (_, index) => ({ path: `note-${index}.md`, name: `note-${index}.md` }))
      expect(() => store.resolveMessageAttachments(session.id, references)).toThrow('一次最多引用 12 个文件')
    } finally {
      database.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('persists selected MCP services in the session file', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()

    store.setActiveMcpServers(session.id, ['filesystem', 'github', 'filesystem', ''])

    expect(store.getSession(session.id).activeMcpServerIds).toEqual(['filesystem', 'github'])
    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('persists pending plan interactions and projects their sidebar state', () => {
    const { root, database, store } = createStore()
    const session = store.createSession()
    const startedAt = Date.now()
    store.setActivePlan(session.id, { id: 'plan-1', status: 'awaiting_input', request: '规划', understanding: '', steps: [], risks: [], createdAt: startedAt, updatedAt: startedAt })
    store.setPendingInteraction(session.id, { id: 'question-1', kind: 'question', status: 'waiting', questions: [{ id: 'scope', question: '选择范围', options: [{ label: '最小改动' }] }], createdAt: startedAt })

    expect(store.listSessions().find(item => item.id === session.id)?.planStatus).toBe('needs_input')
    store.resolvePendingInteraction(session.id, 'question-1', 'answered', [{ id: 'scope', selected: ['最小改动'] }])
    const restored = store.getSession(session.id)
    expect(restored.interactions?.[0]).toMatchObject({ id: 'question-1', kind: 'question', status: 'answered', answers: [{ id: 'scope', selected: ['最小改动'] }] })

    store.setActivePlan(session.id, { ...restored.activePlan!, status: 'awaiting_confirmation', understanding: '范围已确认', steps: [{ label: '修改' }], updatedAt: Date.now() })
    store.setPendingInteraction(session.id, { id: 'review-1', kind: 'plan-review', status: 'waiting', planId: 'plan-1', createdAt: Date.now() })
    expect(store.listSessions().find(item => item.id === session.id)?.planStatus).toBe('awaiting_confirmation')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('accepts selected external files while retaining attachment count limits', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    const externalDirectory = join(root, 'external')
    mkdirSync(directory)
    mkdirSync(externalDirectory)
    const projectFile = join(directory, 'notes.txt')
    const externalFile = join(externalDirectory, 'reference.txt')
    const binaryFile = join(externalDirectory, 'binary.dat')
    writeFileSync(projectFile, '项目说明', 'utf8')
    writeFileSync(externalFile, '外部参考', 'utf8')
    writeFileSync(binaryFile, Buffer.from([0, 1, 2]))
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)

    expect(store.selectFileReferences(project.id, [projectFile, externalFile])).toEqual([
      { path: 'notes.txt', name: 'notes.txt' },
      { path: externalFile, name: 'reference.txt' },
    ])
    expect(store.resolveMessageAttachments(session.id, [{ path: externalFile, name: 'reference.txt' }])).toEqual([
      { path: externalFile, name: 'reference.txt', content: '外部参考' },
    ])
    expect(store.selectFileReferences(project.id, [binaryFile])).toEqual([{ path: binaryFile, name: 'binary.dat' }])
    expect(() => store.resolveMessageAttachments(session.id, [{ path: externalFile, name: 'reference.txt' }, { path: externalFile, name: 'reference.txt' }])).toThrow('引用文件重复或无效')

    const oversizedFile = join(externalDirectory, 'oversized.txt')
    writeFileSync(oversizedFile, Buffer.alloc(256 * 1024 + 1, 65))
    expect(store.selectFileReferences(project.id, [oversizedFile])).toEqual([{ path: oversizedFile, name: 'oversized.txt' }])

    const totalFiles = Array.from({ length: 5 }, (_, index) => {
      const path = join(externalDirectory, `total-${index}.txt`)
      writeFileSync(path, Buffer.alloc(220 * 1024, 65))
      return path
    })
    expect(store.selectFileReferences(project.id, totalFiles)).toHaveLength(5)

    const countFiles = Array.from({ length: 13 }, (_, index) => {
      const path = join(externalDirectory, `count-${index}.txt`)
      writeFileSync(path, 'x', 'utf8')
      return path
    })
    expect(() => store.selectFileReferences(project.id, countFiles)).toThrow('一次最多引用 12 个文件')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })
})
