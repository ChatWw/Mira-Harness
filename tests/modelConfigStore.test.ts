import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}))

import { ModelConfigStore } from '../electron/modelConfigStore'

function createStore() {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE model_providers (id TEXT PRIMARY KEY, provider_key TEXT, name TEXT NOT NULL, endpoint TEXT NOT NULL, api_key BLOB, models TEXT NOT NULL, enabled INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE model_role_bindings (role TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL);
  `)
  return { database, store: new ModelConfigStore(database) }
}

describe('ModelConfigStore', () => {
  it('creates a separate provider after an existing provider was edited', () => {
    const { database, store } = createStore()
    const first = store.save({ name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'first-key', models: ['deepseek-chat'], enabled: true })

    store.save({ id: first.id, name: 'DeepSeek 编辑后', endpoint: first.endpoint, models: first.models, enabled: true })
    const second = store.save({ name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus'], enabled: true })

    expect(second.id).not.toBe(first.id)
    expect(store.list()).toHaveLength(2)
    expect(store.getSecret(first.id)).toBe('first-key')
    database.close()
  })
})
