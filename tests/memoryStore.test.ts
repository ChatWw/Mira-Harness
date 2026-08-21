import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { MemoryStore } from '../electron/memoryStore'

function createStore() {
  const database = new Database(':memory:')
  database.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, scope TEXT NOT NULL, project_id TEXT, kind TEXT NOT NULL, content TEXT NOT NULL, keywords TEXT NOT NULL, source_session_id TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_used_at INTEGER); CREATE TABLE memory_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
  return { database, store: new MemoryStore(database) }
}

describe('MemoryStore', () => {
  it('defaults to disabled and retrieves only global generated memories', () => {
    const { database, store } = createStore()
    expect(store.enabled()).toBe(false)
    expect(store.toolAssistedEnabled()).toBe(false)
    store.setEnabled(true)
    store.saveGenerated('用户偏好使用中文回复')
    database.prepare("INSERT INTO memories(id, scope, project_id, kind, content, keywords, enabled, created_at, updated_at) VALUES ('project', 'project', 'p', 'task-summary', '项目内容', '[\"项目\"]', 1, 1, 1)").run()
    expect(store.context('回复')).toContain('中文')
    expect(store.context('项目')).not.toContain('项目内容')
    database.close()
  })

  it('rejects sensitive generated content and resets global memories', () => {
    const { database, store } = createStore()
    store.setEnabled(true)
    expect(store.saveGenerated('apiKey=secret-value')).toBeUndefined()
    store.saveGenerated('使用简洁回复')
    expect(store.context('回复')).toContain('简洁')
    expect(store.reset()).toBe(1)
    expect(store.context('回复')).toBe('')
    database.close()
  })

  it('persists the tool-assisted generation setting independently', () => {
    const { database, store } = createStore()
    expect(store.setToolAssistedEnabled(true)).toBe(true)
    expect(store.toolAssistedEnabled()).toBe(true)
    database.close()
  })
})
