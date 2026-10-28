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
  it.each([false, true])('deletes a manual service with children=%s, its connections and role bindings', expanded => {
    const { database, store, directory } = createStore()
    const root = store.save({ providerKey: 'custom', slug: 'myProvider', builtin: true, serviceName: '我的服务商', name: '我的服务商', endpoint: 'https://example.com', apiKey: 'root-key', models: [model('root-model')], enabled: true })
    const child = expanded ? store.save({ providerKey: 'custom', slug: 'myProvider', asInstance: true, name: '项目实例', endpoint: root.endpoint, apiKey: 'child-key', models: [model('child-model')], enabled: true }) : root
    const other = store.save({ providerKey: 'custom', slug: 'other', builtin: true, serviceName: '其他服务商', name: '其他服务商', endpoint: root.endpoint, apiKey: 'other-key', models: [model('other-model')], enabled: true })
    store.saveBindings({ agentDefault: { providerId: root.id, modelId: 'root-model' }, novelAuthoring: { providerId: child.id, modelId: 'child-model' }, novelAutomation: { providerId: other.id, modelId: 'other-model' } })
    database.prepare('INSERT INTO model_role_bindings VALUES (?, ?, ?)').run('agentDefault', root.id, 'root-model')
    database.prepare('INSERT INTO model_role_bindings VALUES (?, ?, ?)').run('novelAuthoring', child.id, 'child-model')
    database.prepare('INSERT INTO model_role_bindings VALUES (?, ?, ?)').run('novelAutomation', other.id, 'other-model')
    store.deleteService('myProvider')
    const reopened = new ModelConfigStore(database, new MiraPaths(directory))
    expect(reopened.list()).toEqual([other])
    expect(reopened.services().map(item => item.id)).toEqual(['other'])
    expect(reopened.getSecret(root.id)).toBe('')
    expect(reopened.getSecret(child.id)).toBe('')
    expect(reopened.getSecret(other.id)).toBe('other-key')
    expect(reopened.bindings()).toEqual({ novelAutomation: { providerId: other.id, modelId: 'other-model' } })
    expect(database.prepare('SELECT provider_id FROM model_role_bindings').all()).toEqual([{ provider_id: other.id }])
    expect(JSON.parse(readFileSync(reopened.path(), 'utf8')).bindings).toEqual(reopened.bindings())
    database.close()
  })

  it('rejects deletion of built-in services before and after configuring them', () => {
    const { database, store } = createStore()
    expect(() => store.deleteService('deepseek')).toThrow('内置服务商不能删除')
    const root = store.save({ providerKey: 'deepseek', builtin: true, name: '深度求索', endpoint: 'https://api.deepseek.com', models: [], enabled: false })
    const child = store.save({ providerKey: 'deepseek', slug: 'deepseek', asInstance: true, name: '项目实例', endpoint: root.endpoint, models: [], enabled: false })
    expect(() => store.deleteService('deepseek')).toThrow('内置服务商不能删除')
    expect(new Set(store.list().map(item => item.id))).toEqual(new Set([root.id, child.id]))
    database.close()
  })

  it('retains instance identity when the default endpoint is edited or reused by a custom instance', () => {
    const { database, store, directory } = createStore()
    const builtin = store.save({ providerKey: 'deepseek', builtin: true, name: 'Default', endpoint: 'https://api.deepseek.com/v1', models: [], enabled: false })
    const custom = store.save({ providerKey: 'deepseek', builtin: false, name: '深度求索1', endpoint: 'https://api.deepseek.com/v1', models: [], enabled: false })
    store.save({ ...builtin, endpoint: 'https://proxy.example/v1' })
    const reopened = new ModelConfigStore(database, new MiraPaths(directory))
    expect(reopened.get(builtin.id)?.builtin).toBe(true)
    expect(reopened.get(custom.id)?.builtin).toBe(false)
    expect(() => reopened.delete(builtin.id)).toThrow('默认实例不能删除')
    expect(reopened.get(builtin.id)?.builtin).toBe(true)
    reopened.delete(custom.id)
    expect(reopened.list().map(item => item.id)).toEqual([builtin.id])
    expect(reopened.services().map(item => item.id)).toEqual(['deepseek'])
    database.close()
  })

  it('gives instances a shared Provider ID and independent connection IDs while retaining the original configuration', () => {
    const { database, store, directory } = createStore()
    const original = store.save({ providerKey: 'custom', slug: 'siliconflow', serviceName: '硅基流动', builtin: true, name: '硅基流动', endpoint: 'https://proxy.example/v1', apiKey: 'original-key', protocol: 'openai-responses', models: [model('original')], enabled: true })
    const added = store.save({ providerKey: 'custom', slug: 'siliconflow', asInstance: true, name: '项目1', endpoint: 'https://other.example', apiKey: 'instance-key', protocol: 'anthropic-messages', models: [model('other')], enabled: false })
    expect(added.id).not.toBe(original.id)
    expect(added.slug).toBe(original.slug)
    const reopened = new ModelConfigStore(database, new MiraPaths(directory))
    expect(reopened.get(original.id)).toEqual(original)
    expect(reopened.getSecret(original.id)).toBe('original-key')
    expect(reopened.getSecret(added.id)).toBe('instance-key')
    expect(reopened.services()).toEqual([expect.objectContaining({ id: 'siliconflow', name: '硅基流动', hasInstances: true })])
    reopened.save({ ...added, name: '改名', slug: 'other' })
    expect(reopened.get(added.id)?.slug).toBe('siliconflow')
    expect(() => reopened.delete(original.id)).toThrow('默认实例不能删除')
    expect(reopened.services()[0].name).toBe('硅基流动')
    expect(reopened.services()[0].hasInstances).toBe(true)
    expect(reopened.get(added.id)?.name).toBe('改名')
    database.close()
  })

  it('creates the default connection when adding the first instance to an untouched built-in provider', () => {
    const { database, store } = createStore()
    const added = store.save({ providerKey: 'deepseek', slug: 'deepseek', serviceName: '深度求索', asInstance: true, name: '123', endpoint: 'https://proxy.example/v1', models: [], enabled: false })
    const original = store.list().find(item => item.id !== added.id)!
    expect(original).toMatchObject({ name: '深度求索', slug: 'deepseek', endpoint: 'https://api.deepseek.com/v1', enabled: false, builtin: true })
    expect(store.services()[0].hasInstances).toBe(true)
    database.close()
  })

  it('rejects duplicate and reserved Provider IDs without adding a connection', () => {
    const { database, store } = createStore()
    const input = { providerKey: 'custom' as const, slug: 'siliconflow', serviceName: '硅基流动', name: '硅基流动', endpoint: 'https://proxy.example/v1', models: [], enabled: false }
    store.save(input)
    expect(() => store.save({ ...input, slug: 'SiliconFlow' })).toThrow('Provider ID 已存在')
    expect(() => store.save({ ...input, slug: 'deepseek' })).toThrow('Provider ID 已存在')
    expect(store.list()).toHaveLength(1)
    database.close()
  })

  it('recognizes the oldest legacy instance as the default without relying on its endpoint', () => {
    const { database, store } = createStore({ version: 2, providers: [
      { id: 'custom', providerKey: 'deepseek', name: '深度求索1', endpoint: 'https://api.deepseek.com', createdAt: 20 },
      { id: 'default', providerKey: 'deepseek', name: '深度求索 / DeepSeek', endpoint: 'https://api.deepseek.com/v1', createdAt: 10 },
    ] })
    expect(store.get('default')?.builtin).toBe(true)
    expect(store.get('custom')?.builtin).toBe(false)
    store.save({ ...store.get('default')!, endpoint: 'https://proxy.example/v1' })
    expect(store.get('custom')?.builtin).toBe(false)
    database.close()
  })
  it('persists protocol changes across reloads and preserves them on unrelated saves', () => {
    const { database, store, directory } = createStore()
    const saved = store.save({ name: 'Protocol', endpoint: 'https://example.com', protocol: 'anthropic-messages', models: [model('test')], enabled: true })
    expect(new ModelConfigStore(database, new MiraPaths(directory)).list()[0].protocol).toBe('anthropic-messages')
    const { protocol: _protocol, ...input } = saved
    expect(store.save(input).protocol).toBe('anthropic-messages')
    expect(store.save({ ...saved, protocol: 'openai-responses' }).protocol).toBe('openai-responses')
    database.close()
  })
  it('persists PDF/video independently of image support and never infers them for a legacy model', () => {
    const { database, store, directory } = createStore()
    const saved = store.save({ providerKey: 'custom', name: 'Media', endpoint: 'http://127.0.0.1:12345/v1', authMode: 'none', models: [{ ...model('native-media'), multimodal: false, pdfInput: true, videoInput: true }, model('legacy-model')], enabled: true })
    expect(saved.models[0]).toMatchObject({ multimodal: false, pdfInput: true, videoInput: true })
    expect(new ModelConfigStore(database, new MiraPaths(directory)).list()[0].models).toEqual(saved.models)
    expect(saved.models[1].pdfInput).toBeUndefined(); expect(saved.models[1].videoInput).toBeUndefined()
    database.close()
  })
  it('persists a custom provider slug and per-model maxTokens', () => {
    const { database, store, directory } = createStore()
    const saved = store.save({ providerKey: 'custom', slug: 'siliconflow', name: '硅基流动', endpoint: 'https://api.siliconflow.cn/v1', apiKey: 'k', authMode: 'api-key', models: [{ id: 'Qwen3-8B', enabled: true, reasoning: false, contextWindow: 32768, maxTokens: 4096 }], enabled: true })

    expect(saved.slug).toBe('siliconflow')
    expect(saved.models[0].maxTokens).toBe(4096)
    // 重启后仍可读，说明落盘而不是只在内存
    const reopened = new ModelConfigStore(database, new MiraPaths(directory)).list()[0]
    expect(reopened.slug).toBe('siliconflow')
    expect(reopened.models[0].maxTokens).toBe(4096)
    database.close()
  })

  it('strips non-alphanumeric characters from a slug and keeps it on later saves', () => {
    const { database, store } = createStore()
    const saved = store.save({ providerKey: 'custom', slug: 'sili-con_flow 01', name: 'X', endpoint: 'https://x.test/v1', models: [], enabled: false })
    expect(saved.slug).toBe('siliconflow01')
    const edited = store.save({ id: saved.id, providerKey: 'custom', name: 'X2', endpoint: 'https://x.test/v1', models: [], enabled: false })
    expect(edited.slug).toBe('siliconflow01')
    database.close()
  })

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

  it('retains explicit image capability overrides and leaves legacy capability unspecified after reopening', () => {
    const { database, store, directory } = createStore()
    const saved = store.save({ providerKey: 'custom', name: 'Vision', endpoint: 'http://127.0.0.1:12345/v1', authMode: 'none', models: [{ ...model('custom-vision'), multimodal: true }, { ...model('glm-4.6v'), multimodal: false }, model('legacy-model')], enabled: true })

    expect(saved.models.map(item => item.multimodal)).toEqual([true, false, undefined])
    const serialized = JSON.parse(readFileSync(store.path(), 'utf8'))
    expect(serialized.version).toBe(2)
    expect(serialized.providers[0].models[0].multimodal).toBe(true)
    expect(serialized.providers[0].models[1].multimodal).toBe(false)
    expect(serialized.providers[0].models[2]).not.toHaveProperty('multimodal')
    expect(new ModelConfigStore(database, new MiraPaths(directory)).get(saved.id)?.models).toEqual(saved.models)
    database.close()
  })
})
