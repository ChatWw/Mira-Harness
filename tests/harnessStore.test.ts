import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HarnessStore } from '../electron/harnessStore'
import { PlatformDatabase } from '../electron/database'

function createStore() {
  const root = mkdtempSync(join(tmpdir(), 'mira-harness-store-'))
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'FolderOpened', directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);
    CREATE TABLE harness_sessions (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, model_provider_id TEXT, model_id TEXT, permission_mode TEXT NOT NULL, status TEXT NOT NULL, path TEXT NOT NULL, working_directory TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE harness_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return { root, database, store: new HarnessStore(database, root) }
}

describe('HarnessStore', () => {
  it('persists the selected project icon and deletes selected session files with their index rows', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目', 'Collection')
    const first = store.createSession(project.id)
    const second = store.createSession(project.id)

    expect(store.getProject(project.id).icon).toBe('Collection')
    expect(store.listSessions()).toHaveLength(2)
    expect(() => store.createProject(join(root, 'invalid-icon'), 'Invalid', 'NotAnIcon')).toThrow('项目图标无效')
    store.deleteSessions([first.id, second.id])
    expect(store.listSessions()).toEqual([])

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('adds the default icon when opening a legacy project database', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-harness-migration-'))
    const directory = join(root, 'legacy-project')
    mkdirSync(directory)
    const legacy = new Database(join(root, 'mira.sqlite'))
    legacy.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE menus (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE micro_apps (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE harness_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, directory TEXT NOT NULL UNIQUE, default_model_provider_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_session_at INTEGER);')
    legacy.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('seeded', '1')
    legacy.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('schemaVersion', '17')
    legacy.prepare('INSERT INTO harness_projects(id, name, directory, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('legacy', '旧项目', directory, Date.now(), Date.now())
    legacy.close()

    const database = new PlatformDatabase(root)
    expect(database.harness.getProject('legacy').icon).toBe('FolderOpened')
    rmSync(root, { recursive: true, force: true })
  })

  it('creates an unassigned session unless a project is explicitly selected', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    const project = store.createProject(directory, 'Demo 项目')

    const recent = store.createSession()
    const projectSession = store.createSession(project.id)

    expect(recent.projectId).toBeUndefined()
    expect(recent.workingDirectory).toBeUndefined()
    expect(projectSession.projectId).toBe(project.id)

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

  it('migrates legacy permission defaults and limits disabled permission modes', () => {
    const { root, database, store } = createStore()
    database.prepare('INSERT INTO harness_settings(key, value) VALUES (?, ?)').run('permission', JSON.stringify({ globalDefaultMode: 'full' }))

    expect(store.getPermissionConfig()).toMatchObject({ globalDefaultMode: 'default', autoApproveEnabled: true, fullAccessEnabled: true })
    expect(store.createSession().permissionMode).toBe('default')

    store.savePermissionConfig({ ...store.getPermissionConfig(), autoApproveEnabled: false, fullAccessEnabled: false })
    const session = store.createSession()
    expect(() => store.setPermission(session.id, 'auto-approve')).toThrow('自动审核权限未启用')
    expect(() => store.setPermission(session.id, 'full')).toThrow('完全访问权限未启用')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('removes legacy empty sessions and keeps sessions with user messages', () => {
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

  it('lists and snapshots only safe text files inside the selected project', () => {
    const { root, database, store } = createStore()
    const directory = join(root, 'demo-project')
    mkdirSync(directory)
    writeFileSync(join(directory, 'notes.txt'), '项目说明', 'utf8')
    writeFileSync(join(directory, 'binary.dat'), Buffer.from([0, 1, 2]))
    mkdirSync(join(directory, 'node_modules'))
    writeFileSync(join(directory, 'node_modules', 'ignored.txt'), '忽略', 'utf8')
    const project = store.createProject(directory, 'Demo 项目')
    const session = store.createSession(project.id)

    expect(store.listProjectFiles(project.id)).toEqual([{ path: 'notes.txt', name: 'notes.txt' }])
    expect(store.resolveMessageAttachments(session.id, [{ path: 'notes.txt', name: 'notes.txt' }])).toEqual([{ path: 'notes.txt', name: 'notes.txt', content: '项目说明' }])
    expect(() => store.resolveMessageAttachments(session.id, [{ path: '../outside.txt', name: 'outside.txt' }])).toThrow('路径不在项目目录内')
    expect(() => store.resolveMessageAttachments(session.id, [{ path: 'binary.dat', name: 'binary.dat' }])).toThrow('不支持引用二进制文件')

    database.close()
    rmSync(root, { recursive: true, force: true })
  })
})
