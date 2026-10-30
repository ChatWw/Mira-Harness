import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ModelConfigStore } from '../electron/storage/modelConfigStore'
import { MiraPaths } from '../electron/storage/miraPaths'
import { MODEL_PROVIDER_PRESETS, MODEL_PROVIDER_BUILTIN_INSTANCES } from '../src/config/harness'

const tempDirectories: string[] = []
const model = (id: string, reasoning = false) => ({ id, enabled: true, reasoning, contextWindow: 64000 })

function createStore(document?: unknown) {
  const directory = mkdtempSync(join(tmpdir(), 'mira-models-'))
  tempDirectories.push(directory)
  if (document) {
    const config = join(directory, '.mira', 'config')
    mkdirSync(config, { recursive: true })
    writeFileSync(join(config, 'models.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  }
  return { store: new ModelConfigStore(new MiraPaths(directory)), directory }
}

afterEach(() => {
  tempDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

describe('ModelConfigStore', () => {
  it('persists model display names and independent token limits without replacing custom values', () => {
    const { store, directory } = createStore()
    const configured = { ...model('custom-model'), name: '我的模型', contextWindow: 8192, maxInputTokens: 7000, maxTokens: 1234, multimodal: false }
    const saved = store.save({ providerKey: 'custom', name: 'Local', endpoint: 'http://localhost:1234/v1', enabled: true, models: [configured] })
    const { maxInputTokens: _retired, ...expected } = configured
    expect(new ModelConfigStore(directory).get(saved.id)?.models).toEqual([expected])
  })
  it('stores multiple labelled keys independently of the active credential and keeps them out of summaries', () => {
    const { store, directory } = createStore()
    const saved = store.save({ name: 'Example', endpoint: 'https://example.com/v1', apiKey: 'active-key', models: [model('test')], enabled: true })
    const keys = [
      { id: 'one', label: '个人', value: 'stored-key-one' },
      { id: 'two', label: '工作', value: 'stored-key-two' },
    ]
    const updated = store.save({ ...saved, apiKeys: keys })
    expect(store.getApiKeys(saved.id)).toEqual(keys)
    expect(store.getSecret(saved.id)).toBe('active-key')
    expect(updated).toEqual({ ...saved, updatedAt: expect.any(Number) })
    expect(JSON.stringify(store.list())).not.toContain('stored-key')
    store.save({ ...updated, endpoint: 'https://proxy.example/v1' })
    const reopened = new ModelConfigStore(directory)
    expect(reopened.getApiKeys(saved.id)).toEqual(keys)
    expect(() => reopened.save({ ...updated, apiKeys: [...keys, { id: 'three', label: '', value: 'stored-key-one' }] })).toThrow('不能添加重复')
    expect(reopened.getApiKeys(saved.id)).toEqual(keys)
    reopened.save({ ...updated, apiKeys: [{ ...keys[1], label: '工作备用', value: 'edited-key' }] })
    expect(reopened.getSecret(saved.id)).toBe('active-key')
    reopened.save({ ...updated, apiKeys: [] })
    expect(reopened.getSecret(saved.id)).toBe('active-key')
    expect(reopened.getApiKeys(saved.id)).toEqual([])
  })
  it('clears a key only on explicit deletion and retains models and instance identity', () => {
    const { store } = createStore()
    const saved = store.save({ name: 'Example', endpoint: 'https://example.com/v1', apiKey: 'old-key', models: [model('test')], enabled: true })
    store.save({ ...saved, apiKey: '' })
    expect(store.getSecret(saved.id)).toBe('old-key')
    const cleared = store.save({ ...saved, clearApiKey: true, enabled: false })
    expect(store.getSecret(saved.id)).toBe('')
    expect(store.getApiKeys(saved.id)).toEqual([{ id: `${saved.id}-default`, label: '', value: 'old-key' }])
    expect(cleared).toMatchObject({ id: saved.id, hasApiKey: false, enabled: false, models: saved.models })
    store.save({ ...cleared, apiKey: 'replacement' })
    expect(store.getSecret(saved.id)).toBe('replacement')
  })
  it('seeds both regions once, without enabling unconfigured providers', () => {
    const { store, directory } = createStore()
    store.ensureBuiltinInstances()
    const seeded = store.list()
    expect(seeded).toHaveLength(4)
    for (const preset of MODEL_PROVIDER_BUILTIN_INSTANCES) {
      const record = seeded.find(item => item.name === preset.name)!
      expect(record).toMatchObject({ providerKey: preset.providerKey, slug: preset.providerKey, endpoint: preset.endpoint, builtin: true, enabled: false, hasApiKey: false, models: [] })
      expect(() => store.delete(record.id)).toThrow('默认实例不能删除')
    }
    expect(store.services().map(item => [item.id, item.name, item.hasInstances])).toEqual([
      ['glm', '智谱', true], ['kimi', '月之暗面', true],
    ])
    const reopened = new ModelConfigStore(directory)
    reopened.ensureBuiltinInstances()
    expect(reopened.list()).toEqual(seeded)
  })

  it('keeps both instance identities when their endpoints are edited or reused', () => {
    const { store } = createStore()
    store.ensureBuiltinInstances()
    const domestic = store.list().find(item => item.name === '智谱开放平台')!
    const international = store.list().find(item => item.name === 'z.ai')!
    store.save({ ...domestic, endpoint: international.endpoint, apiKey: 'domestic-key' })
    store.save({ ...international, endpoint: 'https://proxy.example/v4', apiKey: 'international-key' })
    const before = store.list()
    store.ensureBuiltinInstances()
    store.ensureBuiltinInstances()
    expect(store.list()).toEqual(before)
    expect(store.getSecret(domestic.id)).toBe('domestic-key')
    expect(store.getSecret(international.id)).toBe('international-key')
  })

  it.each([false, true])('deletes a manual service with children=%s, its connections and role bindings', expanded => {
    const { store, directory } = createStore()
    const root = store.save({ providerKey: 'custom', slug: 'myProvider', builtin: true, serviceName: '我的服务商', name: '我的服务商', endpoint: 'https://example.com', apiKey: 'root-key', models: [model('root-model')], enabled: true })
    const child = expanded ? store.save({ providerKey: 'custom', slug: 'myProvider', asInstance: true, name: '项目实例', endpoint: root.endpoint, apiKey: 'child-key', models: [model('child-model')], enabled: true }) : root
    const other = store.save({ providerKey: 'custom', slug: 'other', builtin: true, serviceName: '其他服务商', name: '其他服务商', endpoint: root.endpoint, apiKey: 'other-key', models: [model('other-model')], enabled: true })
    store.saveBindings({ agentDefault: { providerId: root.id, modelId: 'root-model' }, novelAuthoring: { providerId: child.id, modelId: 'child-model' }, novelAutomation: { providerId: other.id, modelId: 'other-model' } })
    store.deleteService('myProvider')
    const reopened = new ModelConfigStore(new MiraPaths(directory))
    expect(reopened.list()).toEqual([other])
    expect(reopened.services().map(item => item.id)).toEqual(['other'])
    expect(reopened.getSecret(root.id)).toBe('')
    expect(reopened.getSecret(child.id)).toBe('')
    expect(reopened.getSecret(other.id)).toBe('other-key')
    expect(reopened.bindings()).toEqual({ novelAutomation: { providerId: other.id, modelId: 'other-model' } })
    expect(JSON.parse(readFileSync(reopened.path(), 'utf8')).bindings).toEqual(reopened.bindings())
  })

  it('rejects deletion of built-in services before and after configuring them', () => {
    const { store } = createStore()
    expect(() => store.deleteService('deepseek')).toThrow('内置服务商不能删除')
    const root = store.save({ providerKey: 'deepseek', builtin: true, name: '深度求索', endpoint: 'https://api.deepseek.com', models: [], enabled: false })
    const child = store.save({ providerKey: 'deepseek', slug: 'deepseek', asInstance: true, name: '项目实例', endpoint: root.endpoint, models: [], enabled: false })
    expect(() => store.deleteService('deepseek')).toThrow('内置服务商不能删除')
    expect(new Set(store.list().map(item => item.id))).toEqual(new Set([root.id, child.id]))
  })

  it('retains instance identity when the default endpoint is edited or reused by a custom instance', () => {
    const { store, directory } = createStore()
    const builtin = store.save({ providerKey: 'deepseek', builtin: true, name: 'Default', endpoint: 'https://api.deepseek.com/v1', models: [], enabled: false })
    const custom = store.save({ providerKey: 'deepseek', builtin: false, name: '深度求索1', endpoint: 'https://api.deepseek.com/v1', models: [], enabled: false })
    store.save({ ...builtin, endpoint: 'https://proxy.example/v1' })
    const reopened = new ModelConfigStore(new MiraPaths(directory))
    expect(reopened.get(builtin.id)?.builtin).toBe(true)
    expect(reopened.get(custom.id)?.builtin).toBe(false)
    expect(() => reopened.delete(builtin.id)).toThrow('默认实例不能删除')
    expect(reopened.get(builtin.id)?.builtin).toBe(true)
    reopened.delete(custom.id)
    expect(reopened.list().map(item => item.id)).toEqual([builtin.id])
    expect(reopened.services().map(item => item.id)).toEqual(['deepseek'])
  })

  it('gives instances a shared Provider ID and independent connection IDs while retaining the original configuration', () => {
    const { store, directory } = createStore()
    const original = store.save({ providerKey: 'custom', slug: 'siliconflow', serviceName: '硅基流动', builtin: true, name: '硅基流动', endpoint: 'https://proxy.example/v1', apiKey: 'original-key', protocol: 'openai-responses', models: [model('original')], enabled: true })
    const added = store.save({ providerKey: 'custom', slug: 'siliconflow', asInstance: true, name: '项目1', endpoint: 'https://other.example', apiKey: 'instance-key', protocol: 'anthropic-messages', models: [model('other')], enabled: false })
    expect(added.id).not.toBe(original.id)
    expect(added.slug).toBe(original.slug)
    const reopened = new ModelConfigStore(new MiraPaths(directory))
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
  })

  it('creates the default connection when adding the first instance to an untouched built-in provider', () => {
    const { store } = createStore()
    const added = store.save({ providerKey: 'deepseek', slug: 'deepseek', serviceName: '深度求索', asInstance: true, name: '123', endpoint: 'https://proxy.example/v1', models: [], enabled: false })
    const original = store.list().find(item => item.id !== added.id)!
    expect(original).toMatchObject({ name: '深度求索', slug: 'deepseek', endpoint: 'https://api.deepseek.com/v1', enabled: false, builtin: true })
    expect(store.services()[0].hasInstances).toBe(true)
  })

  it('rejects duplicate and reserved Provider IDs without adding a connection', () => {
    const { store } = createStore()
    const input = { providerKey: 'custom' as const, slug: 'siliconflow', serviceName: '硅基流动', name: '硅基流动', endpoint: 'https://proxy.example/v1', models: [], enabled: false }
    store.save(input)
    expect(() => store.save({ ...input, slug: 'SiliconFlow' })).toThrow('Provider ID 已存在')
    expect(() => store.save({ ...input, slug: 'deepseek' })).toThrow('Provider ID 已存在')
    expect(store.list()).toHaveLength(1)
  })
  it('persists protocol changes across reloads and preserves them on unrelated saves', () => {
    const { store, directory } = createStore()
    const saved = store.save({ name: 'Protocol', endpoint: 'https://example.com', protocol: 'anthropic-messages', models: [model('test')], enabled: true })
    expect(new ModelConfigStore(new MiraPaths(directory)).list()[0].protocol).toBe('anthropic-messages')
    const { protocol: _protocol, ...input } = saved
    expect(store.save(input).protocol).toBe('anthropic-messages')
    expect(store.save({ ...saved, protocol: 'openai-responses' }).protocol).toBe('openai-responses')
  })
  it('persists PDF/video independently of image support and never infers them for a legacy model', () => {
    const { store, directory } = createStore()
    const saved = store.save({ providerKey: 'custom', name: 'Media', endpoint: 'http://127.0.0.1:12345/v1', authMode: 'none', models: [{ ...model('native-media'), multimodal: false, pdfInput: true, videoInput: true }, model('legacy-model')], enabled: true })
    expect(saved.models[0]).toMatchObject({ multimodal: false, pdfInput: true, videoInput: true })
    expect(new ModelConfigStore(new MiraPaths(directory)).list()[0].models).toEqual(saved.models)
    expect(saved.models[1].pdfInput).toBeUndefined(); expect(saved.models[1].videoInput).toBeUndefined()
  })
  it('round trips model types and explicit tool/audio flags while leaving old records unspecified', () => {
    const { store, directory } = createStore()
    const types = ['chat', 'image', 'embedding', 'reranking'] as const
    const models = types.map((modelType, i) => ({ ...model(`type-${i}`), modelType, toolCall: i === 0, audioInput: i === 0, videoInput: i === 0 }))
    const saved = store.save({ providerKey: 'custom', name: 'Catalog', endpoint: 'http://localhost:1234/v1', models: [...models, model('legacy-model')], enabled: true })
    expect(new ModelConfigStore(directory).get(saved.id)?.models).toEqual([...models, model('legacy-model')])
  })
  it('persists a custom provider slug and per-model maxTokens', () => {
    const { store, directory } = createStore()
    const saved = store.save({ providerKey: 'custom', slug: 'siliconflow', name: '硅基流动', endpoint: 'https://api.siliconflow.cn/v1', apiKey: 'k', authMode: 'api-key', models: [{ id: 'Qwen3-8B', enabled: true, reasoning: false, contextWindow: 32768, maxTokens: 4096 }], enabled: true })

    expect(saved.slug).toBe('siliconflow')
    expect(saved.models[0].maxTokens).toBe(4096)
    // 重启后仍可读，说明落盘而不是只在内存
    const reopened = new ModelConfigStore(new MiraPaths(directory)).list()[0]
    expect(reopened.slug).toBe('siliconflow')
    expect(reopened.models[0].maxTokens).toBe(4096)
  })

  it('strips non-alphanumeric characters from a slug and keeps it on later saves', () => {
    const { store } = createStore()
    const saved = store.save({ providerKey: 'custom', slug: 'sili-con_flow 01', name: 'X', endpoint: 'https://x.test/v1', models: [], enabled: false })
    expect(saved.slug).toBe('siliconflow01')
    const edited = store.save({ id: saved.id, providerKey: 'custom', name: 'X2', endpoint: 'https://x.test/v1', models: [], enabled: false })
    expect(edited.slug).toBe('siliconflow01')
  })

  it('initializes models.json and stores multiple models per provider', () => {
    const { store, directory } = createStore()
    expect(store.list()).toEqual([])
    expect(JSON.parse(readFileSync(join(directory, '.mira', 'config', 'models.json'), 'utf8'))).toEqual({ version: 2, providers: [], bindings: {} })

    const saved = store.save({ providerKey: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'first-key', authMode: 'api-key', models: [model('deepseek-chat'), model('deepseek-reasoner', true)], enabled: true })

    expect(saved.models.map(item => item.id)).toEqual(['deepseek-chat', 'deepseek-reasoner'])
    expect(saved.models[1].reasoning).toBe(true)
    expect(store.getSecret(saved.id)).toBe('first-key')
  })

  it('edits and deletes providers while retaining an omitted secret', () => {
    const { store } = createStore()
    const first = store.save({ providerKey: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'first-key', models: [model('deepseek-chat')], enabled: true })
    const edited = store.save({ id: first.id, providerKey: 'deepseek', name: 'DeepSeek', endpoint: first.endpoint, models: [model('deepseek-reasoner', true)], enabled: true })

    expect(edited.id).toBe(first.id)
    expect(edited.models.map(item => item.id)).toEqual(['deepseek-reasoner'])
    expect(store.getSecret(first.id)).toBe('first-key')

    expect(store.bindings()).toEqual({})
    store.delete(first.id)
    expect(store.list()).toEqual([])
  })

  it('treats keyless Ollama as available authentication data', () => {
    const { store } = createStore()
    const ollama = store.save({ providerKey: 'ollama', name: 'Ollama', endpoint: 'http://127.0.0.1:11434/v1', authMode: 'none', models: [model('qwen3')], enabled: true })

    expect(ollama.authMode).toBe('none')
    expect(ollama.hasApiKey).toBe(false)
  })

  it('retains explicit image capability overrides and leaves legacy capability unspecified after reopening', () => {
    const { store, directory } = createStore()
    const saved = store.save({ providerKey: 'custom', name: 'Vision', endpoint: 'http://127.0.0.1:12345/v1', authMode: 'none', models: [{ ...model('custom-vision'), multimodal: true }, { ...model('glm-4.6v'), multimodal: false }, model('legacy-model')], enabled: true })

    expect(saved.models.map(item => item.multimodal)).toEqual([true, false, undefined])
    const serialized = JSON.parse(readFileSync(store.path(), 'utf8'))
    expect(serialized.version).toBe(2)
    expect(serialized.providers[0].models[0].multimodal).toBe(true)
    expect(serialized.providers[0].models[1].multimodal).toBe(false)
    expect(serialized.providers[0].models[2]).not.toHaveProperty('multimodal')
    expect(new ModelConfigStore(new MiraPaths(directory)).get(saved.id)?.models).toEqual(saved.models)
  })
})
