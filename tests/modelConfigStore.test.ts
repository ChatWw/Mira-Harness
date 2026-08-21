import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { ModelConfigStore } from '../electron/modelConfigStore'
import { MiraPaths } from '../electron/miraPaths'

const tempDirectories: string[] = []

function createStore() {
  const database = new Database(':memory:')
  database.exec('CREATE TABLE model_role_bindings (role TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL)')
  const directory = mkdtempSync(join(tmpdir(), 'mira-models-'))
  tempDirectories.push(directory)
  return { database, store: new ModelConfigStore(database, new MiraPaths(directory)), directory }
}

afterEach(() => {
  tempDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

describe('ModelConfigStore', () => {
  it('initializes models.json and stores one model per record', () => {
    const { database, store, directory } = createStore()
    expect(store.list()).toEqual([])
    expect(JSON.parse(readFileSync(join(directory, '.mira', 'config', 'models.json'), 'utf8'))).toEqual({ version: 1, providers: [], bindings: {} })

    const first = store.save({ name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'first-key', models: ['deepseek-chat'], contextWindow: 64000, enabled: true })
    const second = store.save({ name: 'Ollama', endpoint: 'http://127.0.0.1:11434/v1', apiKey: 'local-key', models: ['qwen3'], enabled: true })

    expect(store.list().map(item => item.models[0])).toEqual(['qwen3', 'deepseek-chat'])
    expect(store.getSecret(first.id)).toBe('first-key')
    expect(store.getSecret(second.id)).toBe('local-key')
    expect(store.get(first.id)?.contextWindow).toBe(64000)
    expect(store.get(second.id)?.contextWindow).toBe(256000)
    database.close()
  })

  it('edits and deletes records without importing legacy providers', () => {
    const { database, store } = createStore()
    const first = store.save({ name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'first-key', models: ['deepseek-chat'], enabled: true })
    const edited = store.save({ id: first.id, name: 'DeepSeek', endpoint: first.endpoint, models: ['deepseek-reasoner'], enabled: true })

    expect(edited.id).toBe(first.id)
    expect(edited.models).toEqual(['deepseek-reasoner'])
    expect(store.getSecret(first.id)).toBe('first-key')

    database.prepare('INSERT INTO model_role_bindings(role, provider_id, model_id) VALUES (?, ?, ?)').run('agentDefault', 'legacy-id', 'legacy-model')
    expect(store.bindings()).toEqual({})
    store.delete(first.id)
    expect(store.list()).toEqual([])
    database.close()
  })
})
