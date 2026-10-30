import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createNovelProject, EMPTY_NOVEL_MODEL_PROFILES, toNovelProjectSummary } from '../src/config/novel'
import { NovelStore } from '../electron/storage/novelStore'

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

  it('deletes only the requested project', () => {
    const { database, store } = createStore()
    const retained = store.createProject('保留作品')
    const removed = store.createProject('删除作品')

    store.deleteProject(removed.id)

    expect(store.listProjects().map(project => project.id)).toEqual([retained.id])
    expect(() => store.getProject(removed.id)).toThrow('未找到该小说项目')
    database.close()
  })

  it('filters empty shortcut values before storing workspace settings', () => {
    const { database, store } = createStore()
    expect(store.saveSettings({ shortcuts: ['  灵力 ', '', '   '], editorMode: 'rich' })).toEqual({ shortcuts: ['灵力'], editorMode: 'rich' })
    expect(store.getSettings()).toEqual({ shortcuts: ['灵力'], editorMode: 'rich' })
    database.prepare('INSERT OR REPLACE INTO novel_settings(key, value) VALUES (?, ?)').run('workspace', JSON.stringify({ shortcuts: [] }))
    expect(store.getSettings()).toEqual({ shortcuts: [], editorMode: 'markdown' })
    database.prepare('INSERT OR REPLACE INTO novel_settings(key, value) VALUES (?, ?)').run('workspace', JSON.stringify({ shortcuts: [], editorMode: 'invalid' }))
    expect(store.getSettings()).toEqual({ shortcuts: [], editorMode: 'markdown' })
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
