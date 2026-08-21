import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { MemoryStore } from '../electron/memoryStore'

function createStore() {
  const database = new Database(':memory:')
  database.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, scope TEXT NOT NULL, project_id TEXT, kind TEXT NOT NULL, content TEXT NOT NULL, keywords TEXT NOT NULL, source_session_id TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_used_at INTEGER); CREATE TABLE memory_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
  return { database, store: new MemoryStore(database) }
}

describe('MemoryStore', () => {
  it('keeps global and project memories isolated while retrieving relevant context', () => {
    const { database, store } = createStore()
    store.save({ scope: 'global', kind: 'user-preference', content: '用户偏好使用中文回复', keywords: ['中文'] })
    store.save({ scope: 'project', projectId: 'project-a', kind: 'project-fact', content: '项目使用 TypeScript', keywords: ['typescript'] })
    store.save({ scope: 'project', projectId: 'project-b', kind: 'project-fact', content: '另一个项目使用 Python', keywords: ['python'] })
    const context = store.context('project-a', '请检查 TypeScript 代码')
    expect(context.global).toContain('中文')
    expect(context.project).toContain('TypeScript')
    expect(context.project).not.toContain('Python')
    database.close()
  })

  it('rejects sensitive content and immediately respects disabled memories', () => {
    const { database, store } = createStore()
    expect(() => store.save({ scope: 'global', kind: 'user-preference', content: 'apiKey=secret-value' })).toThrow('敏感信息')
    const memory = store.save({ scope: 'global', kind: 'user-preference', content: '使用简洁回复' })
    store.save({ ...memory, enabled: false })
    expect(store.context(undefined, '回复').global).toBe('')
    database.close()
  })
})
