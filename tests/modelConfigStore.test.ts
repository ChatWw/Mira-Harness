import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { ModelConfigStore } from '../electron/storage/modelConfigStore'
import { MiraPaths } from '../electron/storage/miraPaths'

const tempDirectories: string[] = []
const model = (id: string, reasoning = false) => ({ id, enabled: true, reasoning, contextWindow: 64000 })

function createDatabase() {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE model_role_bindings (role TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL);
    CREATE TABLE harness_sessions (id TEXT PRIMARY KEY, model_provider_id TEXT);
    CREATE TABLE harness_projects (id TEXT PRIMARY KEY, default_model_provider_id TEXT);
    CREATE TABLE automation_tasks (id TEXT PRIMARY KEY, provider_id TEXT);
  `)
  return database
}

function createStore(document?: unknown) {
  const database = createDatabase()
  const directory = mkdtempSync(join(tmpdir(), 'mira-models-'))
  tempDirectories.push(directory)
  if (document) {
    const config = join(directory, '.mira', 'config')
    mkdirSync(config, { recursive: true })
    writeFileSync(join(config, 'models.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  }
  return { database, store: new ModelConfigStore(database, new MiraPaths(directory)), directory }
}

afterEach(() => {
  tempDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

describe('ModelConfigStore', () => {
  it('initializes models.json and stores multiple models per provider', () => {
    const { database, store, directory } = createStore()
    expect(store.list()).toEqual([])
    expect(JSON.parse(readFileSync(join(directory, '.mira', 'config', 'models.json'), 'utf8'))).toEqual({ version: 2, providers: [], bindings: {} })

    const saved = store.save({ providerKey: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'first-key', authMode: 'api-key', models: [model('deepseek-chat'), model('deepseek-reasoner', true)], enabled: true })

    expect(saved.models.map(item => item.id)).toEqual(['deepseek-chat', 'deepseek-reasoner'])
    expect(saved.models[1].reasoning).toBe(true)
    expect(store.getSecret(saved.id)).toBe('first-key')
    database.close()
  })

  it('edits and deletes providers while retaining an omitted secret', () => {
    const { database, store } = createStore()
    const first = store.save({ providerKey: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'first-key', models: [model('deepseek-chat')], enabled: true })
    const edited = store.save({ id: first.id, providerKey: 'deepseek', name: 'DeepSeek', endpoint: first.endpoint, models: [model('deepseek-reasoner', true)], enabled: true })

    expect(edited.id).toBe(first.id)
    expect(edited.models.map(item => item.id)).toEqual(['deepseek-reasoner'])
    expect(store.getSecret(first.id)).toBe('first-key')

    database.prepare('INSERT INTO model_role_bindings(role, provider_id, model_id) VALUES (?, ?, ?)').run('agentDefault', 'legacy-id', 'legacy-model')
    expect(store.bindings()).toEqual({})
    store.delete(first.id)
    expect(store.list()).toEqual([])
    database.close()
  })

  it('migrates and merges compatible v1 records without dropping custom providers', () => {
    const document = {
      version: 1,
      providers: [
        { id: 'deepseek-a', providerKey: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/', apiKey: 'same-key', model: 'deepseek-chat', reasoning: false, contextWindow: 64000, enabled: true, createdAt: 10, updatedAt: 20 },
        { id: 'deepseek-b', providerKey: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'same-key', model: 'deepseek-reasoner', reasoning: true, contextWindow: 128000, enabled: true, createdAt: 11, updatedAt: 21 },
        { id: 'deepseek-other', providerKey: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'other-key', model: 'deepseek-chat', enabled: true, createdAt: 12, updatedAt: 22 },
        { id: 'custom-a', providerKey: 'custom', name: 'Internal', endpoint: 'https://models.example/v1', apiKey: 'custom-key', model: 'private-model', enabled: true, createdAt: 13, updatedAt: 23 },
      ],
      bindings: { agentDefault: { providerId: 'deepseek-b', modelId: 'deepseek-reasoner' } },
    }
    const { database, store, directory } = createStore(document)
    const providers = store.list()

    expect(providers).toHaveLength(3)
    expect(providers.find(item => item.id === 'deepseek-a')?.models.map(item => item.id)).toEqual(['deepseek-chat', 'deepseek-reasoner'])
    expect(store.get('deepseek-b')?.id).toBe('deepseek-a')
    expect(store.getSecret('deepseek-b')).toBe('same-key')
    expect(store.bindings().agentDefault).toEqual({ providerId: 'deepseek-a', modelId: 'deepseek-reasoner' })
    expect(providers.some(item => item.providerKey === 'custom' && item.models[0].id === 'private-model')).toBe(true)
    expect(existsSync(join(directory, '.mira', 'config', 'models.json.v1.bak'))).toBe(true)
    expect(JSON.parse(readFileSync(store.path(), 'utf8')).version).toBe(2)

    database.prepare('INSERT INTO harness_sessions(id, model_provider_id) VALUES (?, ?)').run('session-a', 'deepseek-b')
    database.prepare('INSERT INTO harness_projects(id, default_model_provider_id) VALUES (?, ?)').run('project-a', 'deepseek-b')
    database.prepare('INSERT INTO automation_tasks(id, provider_id) VALUES (?, ?)').run('task-a', 'deepseek-b')
    store.migrateLegacyProviderReferences()
    expect((database.prepare('SELECT model_provider_id FROM harness_sessions WHERE id = ?').get('session-a') as { model_provider_id: string }).model_provider_id).toBe('deepseek-a')
    expect((database.prepare('SELECT default_model_provider_id FROM harness_projects WHERE id = ?').get('project-a') as { default_model_provider_id: string }).default_model_provider_id).toBe('deepseek-a')
    expect((database.prepare('SELECT provider_id FROM automation_tasks WHERE id = ?').get('task-a') as { provider_id: string }).provider_id).toBe('deepseek-a')

    const reopened = new ModelConfigStore(database, new MiraPaths(directory))
    expect(reopened.list()).toEqual(providers)
    database.close()
  })

  it('treats keyless Ollama as available authentication data', () => {
    const { database, store } = createStore()
    const ollama = store.save({ providerKey: 'ollama', name: 'Ollama', endpoint: 'http://127.0.0.1:11434/v1', authMode: 'none', models: [model('qwen3')], enabled: true })

    expect(ollama.authMode).toBe('none')
    expect(ollama.hasApiKey).toBe(false)
    database.close()
  })
})
