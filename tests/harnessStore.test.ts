import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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
})
