import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { MiraPaths } from '../electron/storage/miraPaths'
import { ModelConfigStore } from '../electron/storage/modelConfigStore'
import { MiraPluginStore } from '../electron/storage/miraPluginStore'
import { MiraAgentModelStore } from '../electron/storage/miraAgentModelStore'
import type { MiraAgentModelTarget } from '../src/config/miraAgentModels'

const resources: Array<{ directory: string; database: Database.Database }> = []
afterEach(() => resources.splice(0).forEach(({ directory, database }) => { database.close(); rmSync(directory, { recursive: true, force: true }) }))
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mira-agent-models-')), database = new Database(join(directory, 'state.sqlite'))
  resources.push({ directory, database }); database.exec('CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  const paths = new MiraPaths(directory).ensure(), models = new ModelConfigStore(paths), plugins = new MiraPluginStore(paths)
  const provider = models.save({ providerKey: 'custom', name: 'Actual provider', endpoint: 'https://models.example/v1', apiKey: 'private-model-key', enabled: true, models: [{ id: 'plain-model', enabled: true, reasoning: false, contextWindow: 64000 }, { id: 'reason-model', enabled: true, reasoning: true, contextWindow: 64000 }] })
  const pluginRoot = join(directory, 'plugin'), profilePath = join(pluginRoot, 'agents/auditor.md')
  mkdirSync(join(pluginRoot, '.mira-plugin'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'))
  writeFileSync(join(pluginRoot, '.mira-plugin/plugin.json'), JSON.stringify({ name: 'mira-review' }))
  const profile = '---\nname: auditor\ndescription: Review behavior\ntools: [Read]\n---\nPrivate profile instructions.'
  writeFileSync(profilePath, profile); plugins.register(pluginRoot)
  const target: MiraAgentModelTarget = { kind: 'plugin', pluginId: 'mira-review@local', name: 'mira-review:auditor' }
  return { directory, database, paths, models, plugins, provider, pluginRoot, profilePath, profile, target, store: new MiraAgentModelStore(database, models, plugins) }
}
const builtin: MiraAgentModelTarget = { kind: 'builtin', name: 'reviewer' }

describe('Mira built-in and plugin Agent model overrides', () => {
  it('lists real identities without host paths, credentials or profile instructions', () => {
    const view = fixture(), list = view.store.list()
    expect(list).toHaveLength(5)
    expect(list.map(item => item.target)).toEqual([{ kind: 'builtin', name: 'explorer' }, builtin, { kind: 'builtin', name: 'tester' }, { kind: 'builtin', name: 'implementer' }, view.target])
    expect(JSON.stringify(list)).not.toContain(view.directory)
    expect(JSON.stringify(list)).not.toContain('Private profile instructions')
    expect(JSON.stringify(list)).not.toContain('private-model-key')
  })
  it('persists independent targets in actual SQLite and restores inheritance without changing profiles', () => {
    const view = fixture(), selection = { providerId: view.provider.id, modelId: 'reason-model', thinkingLevel: 'high' as const }
    view.store.set(builtin, selection); view.store.set(view.target, { ...selection, thinkingLevel: 'low' })
    const reopened = new Database(join(view.directory, 'state.sqlite'))
    try {
      const store = new MiraAgentModelStore(reopened, view.models, view.plugins)
      expect(store.get(builtin)).toEqual(selection)
      expect(store.get(view.target)?.thinkingLevel).toBe('low')
      expect(store.set(builtin)).toEqual({ target: builtin })
      expect(store.get(view.target)?.thinkingLevel).toBe('low')
      expect(store.get(builtin)).toBeUndefined()
      store.set(view.target)
      expect(reopened.prepare('SELECT COUNT(*) count FROM preferences').get()).toEqual({ count: 0 })
    } finally { reopened.close() }
    expect(readFileSync(view.profilePath, 'utf8')).toBe(view.profile)
  })
  it('clones input and output model selections instead of exposing persisted mutable state', () => {
    const view = fixture(), selection = { providerId: view.provider.id, modelId: 'reason-model', thinkingLevel: 'medium' as const }
    view.store.set(builtin, selection); selection.modelId = 'changed-input'
    const first = view.store.get(builtin)!; first.modelId = 'changed-output'
    const list = view.store.list(); list[1].modelSelection!.modelId = 'changed-list'
    expect(view.store.get(builtin)?.modelId).toBe('reason-model')
  })
  it('rejects nonreasoning effort while accepting off and inherited effort', () => {
    const view = fixture()
    expect(() => view.store.set(builtin, { providerId: view.provider.id, modelId: 'plain-model', thinkingLevel: 'high' })).toThrow('推理')
    expect(view.store.set(builtin, { providerId: view.provider.id, modelId: 'plain-model', thinkingLevel: 'off' }).modelSelection?.thinkingLevel).toBe('off')
    expect(view.store.set(builtin, { providerId: view.provider.id, modelId: 'plain-model' }).modelSelection?.thinkingLevel).toBeUndefined()
  })
  it.each([
    { providerId: 'missing', modelId: 'plain-model' },
    { providerId: 'actual-placeholder', modelId: 'missing' },
    { providerId: 'actual-placeholder', modelId: 'plain-model', thinkingLevel: 'ultra' },
    { providerId: 'actual-placeholder', modelId: 'plain-model', apiKey: 'secret' },
    { providerId: '', modelId: 'plain-model' },
  ])('rejects invalid or missing model selections before changing settings', input => {
    const view = fixture(), selection = { ...input, providerId: input.providerId === 'actual-placeholder' ? view.provider.id : input.providerId }
    expect(() => view.store.set(builtin, selection as any)).toThrow()
    expect(view.store.get(builtin)).toBeUndefined()
  })
  it('keeps disabled or deleted model selections visible and returns them instead of silently inheriting', () => {
    const view = fixture(), selection = { providerId: view.provider.id, modelId: 'reason-model', thinkingLevel: 'high' as const }
    view.store.set(builtin, selection)
    view.models.save({ id: view.provider.id, providerKey: 'custom', name: view.provider.name, endpoint: view.provider.endpoint, models: view.provider.models.map(model => ({ ...model, enabled: model.id !== 'reason-model' })), enabled: true })
    expect(view.store.get(builtin)).toEqual(selection)
    expect(view.store.list().find(item => item.target.kind === 'builtin' && item.target.name === 'reviewer')?.unavailableReason).toContain('不可用')
    expect(() => view.store.set(view.target, selection)).toThrow('不可用')
    view.models.delete(view.provider.id)
    expect(view.store.get(builtin)).toEqual(selection)
    expect(view.store.list()[1].unavailableReason).toContain('已移除')
    expect(view.store.set(builtin)).toEqual({ target: builtin })
  })
  it('requires an enabled, authenticated provider before accepting an override', () => {
    const view = fixture(), selection = { providerId: view.provider.id, modelId: 'plain-model' }
    view.models.save({ id: view.provider.id, providerKey: 'custom', name: view.provider.name, endpoint: view.provider.endpoint, models: view.provider.models, enabled: false })
    expect(() => view.store.set(builtin, selection)).toThrow('不可用')
    const noKey = view.models.save({ providerKey: 'custom', name: 'No key', endpoint: 'https://models.example/v1', models: view.provider.models, enabled: true })
    expect(() => view.store.set(builtin, { providerId: noKey.id, modelId: 'plain-model' })).toThrow('不可用')
  })
  it('reports disabled, conflicting and unsupported plugin profiles while allowing inheritance cleanup', () => {
    const view = fixture(), selection = { providerId: view.provider.id, modelId: 'plain-model' }
    view.store.set(view.target, selection); view.plugins.setEnabled(view.target.kind === 'plugin' ? view.target.pluginId : '', false)
    expect(view.store.list().at(-1)?.unavailableReason).toContain('停用')
    expect(view.store.get(view.target)).toEqual(selection)
    expect(() => view.store.set(view.target, selection)).toThrow('停用')
    expect(view.store.set(view.target).unavailableReason).toContain('停用')
    view.plugins.setEnabled('mira-review@local', true)
    view.plugins.register(view.pluginRoot, 'other')
    expect(view.store.list().filter(item => item.target.kind === 'plugin').every(item => item.unavailableReason?.includes('冲突'))).toBe(true)
    expect(() => view.store.set(view.target, selection)).toThrow('冲突')
    view.plugins.remove('mira-review@other')
    writeFileSync(view.profilePath, '---\nname: auditor\ndescription: Review\npermissionMode: auto\n---\nBody')
    expect(view.store.list().at(-1)?.unavailableReason).toContain('permissionMode')
    expect(() => view.store.set(view.target, selection)).toThrow('permissionMode')
  })
  it('retains saved targets for installed unreadable packages and can remove their overrides', () => {
    const view = fixture(), selection = { providerId: view.provider.id, modelId: 'plain-model' }
    view.store.set(view.target, selection); rmSync(view.profilePath)
    expect(() => view.store.get(view.target)).toThrow('已移除')
    writeFileSync(view.profilePath, view.profile)
    rmSync(join(view.pluginRoot, '.mira-plugin/plugin.json'))
    expect(view.store.list().at(-1)).toMatchObject({ target: view.target, modelSelection: selection, unavailableReason: expect.stringContaining('无效') })
    expect(view.store.set(view.target).modelSelection).toBeUndefined()
  })
  it.each([
    { kind: 'builtin', name: 'constructor' },
    { kind: 'builtin', name: 'custom-agent' },
    { kind: 'plugin', pluginId: '/tmp/root', name: 'mira-review:auditor' },
    { kind: 'plugin', pluginId: 'mira-review@local', name: 'auditor' },
    { kind: 'plugin', pluginId: 'mira-review@local', name: 'mira-review:missing' },
    { kind: 'plugin', pluginId: 'missing@local', name: 'missing:auditor' },
  ])('rejects unknown or renderer-fabricated target identities', target => {
    const view = fixture()
    expect(() => view.store.get(target as any)).toThrow()
    expect(() => view.store.set(target as any)).toThrow()
    expect(view.store.list()).toHaveLength(5)
  })
})
