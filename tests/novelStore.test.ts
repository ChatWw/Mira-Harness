import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNovelProject, EMPTY_NOVEL_MODEL_PROFILES, toNovelProjectSummary } from '../src/config/novel'
import { PlatformDatabase } from '../electron/database'
import { NovelStore } from '../electron/novelStore'
import { DASHBOARD_MENU } from '../src/config/menus'

function createStore() {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE novel_projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE novel_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return { database, store: new NovelStore(database) }
}

describe('NovelStore', () => {
  it('persists a project document and returns an updated summary', () => {
    const { database, store } = createStore()
    const project = store.createProject('长夜回声')
    project.chapters.push({ id: 'chapter-1', title: '第一章', outline: '相遇', content: '雾来了。' })
    const saved = store.saveProject(project)

    expect(store.getProject(saved.id).chapters).toHaveLength(1)
    expect(store.listProjects()).toEqual([toNovelProjectSummary(saved)])
    database.close()
  })

  it('imports into a new project instead of overwriting the source project', () => {
    const { database, store } = createStore()
    const source = store.createProject('原作')
    const imported = store.importProject(store.exportProject(source.id))

    expect(imported.id).not.toBe(source.id)
    expect(imported.title).toBe('原作（导入）')
    expect(store.listProjects()).toHaveLength(2)
    database.close()
  })

  it('filters empty shortcut values before storing workspace settings', () => {
    const { database, store } = createStore()
    expect(store.saveSettings({ shortcuts: ['  灵力 ', '', '   '] })).toEqual({ shortcuts: ['灵力'] })
    expect(store.getSettings()).toEqual({ shortcuts: ['灵力'] })
    database.close()
  })
})

describe('novel domain defaults', () => {
  it('creates a versioned project with separate model responsibilities', () => {
    const project = createNovelProject('测试作品')
    expect(project.version).toBe(1)
    expect(project.mindMap.title).toBe('测试作品')
    expect(EMPTY_NOVEL_MODEL_PROFILES).toEqual({
      authoring: { endpoint: '', apiKey: '', modelId: '' },
      automation: { endpoint: '', apiKey: '', modelId: '' },
    })
  })
})

describe('platform database migration', () => {
  it('replaces the legacy novel micro-app with the protected native page', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mira-novel-migration-'))
    const legacy = new Database(join(directory, 'mira.sqlite'))
    legacy.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE menus (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE micro_apps (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
    legacy.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('seeded', '1')
    legacy.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('schemaVersion', '15')
    legacy.prepare('INSERT INTO menus(id, payload) VALUES (?, ?)').run('dashboard', JSON.stringify(DASHBOARD_MENU))
    legacy.prepare('INSERT INTO micro_apps(id, code, payload) VALUES (?, ?, ?)').run('micro-ai-novel', 'ai-novel', JSON.stringify({ id: 'micro-ai-novel', code: 'ai-novel' }))
    legacy.close()

    const database = new PlatformDatabase(directory)
    expect(database.getSnapshot().microApps).toEqual([])
    expect(database.getSnapshot().mainMenus.map(menu => menu.id)).toEqual(['dashboard', 'ai-novel'])
    expect(database.novels.listProjects()).toEqual([])
    rmSync(directory, { recursive: true, force: true })
  })
})
