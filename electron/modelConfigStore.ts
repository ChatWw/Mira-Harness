import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { safeStorage } from 'electron'
import { MODEL_PROVIDER_PRESETS, type ModelProviderInput, type ModelProviderKey, type ModelProviderSummary, type ModelRoleBinding } from '../src/config/harness'

type ProviderRow = { id: string, provider_key: string | null, name: string, endpoint: string, api_key: Buffer | null, models: string, enabled: number, created_at: number, updated_at: number }

function inferProviderKey(name: string, endpoint: string): ModelProviderKey {
  const text = `${name} ${endpoint}`.toLocaleLowerCase()
  if (text.includes('glm') || text.includes('zhipu') || text.includes('bigmodel')) return 'glm'
  if (text.includes('kimi') || text.includes('moonshot')) return 'kimi'
  if (text.includes('minimax')) return 'minimax'
  if (text.includes('deepseek')) return 'deepseek'
  if (text.includes('ollama') || text.includes('11434')) return 'ollama'
  return 'custom'
}

function providerKey(value: string | null, name: string, endpoint: string): ModelProviderKey {
  return MODEL_PROVIDER_PRESETS.some(item => item.key === value) ? value as ModelProviderKey : inferProviderKey(name, endpoint)
}

function encrypt(value: string) {
  if (!value) return null
  return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value) : Buffer.from(value, 'utf8')
}

function decrypt(value: Buffer | null) {
  if (!value) return ''
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(value) : value.toString('utf8') } catch { return '' }
}

function asSummary(row: ProviderRow): ModelProviderSummary {
  return {
    id: row.id, providerKey: providerKey(row.provider_key, row.name, row.endpoint), name: row.name, endpoint: row.endpoint, models: JSON.parse(row.models), enabled: row.enabled === 1,
    hasApiKey: Boolean(row.api_key?.length), createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export class ModelConfigStore {
  constructor(private readonly database: Database.Database) {}

  list(): ModelProviderSummary[] {
    return this.database.prepare('SELECT * FROM model_providers ORDER BY updated_at DESC').all().map((row: ProviderRow) => asSummary(row))
  }

  migrateProviderKeys() {
    const rows = this.database.prepare('SELECT id, provider_key, name, endpoint FROM model_providers').all() as Array<Pick<ProviderRow, 'id' | 'provider_key' | 'name' | 'endpoint'>>
    const update = this.database.prepare('UPDATE model_providers SET provider_key = ? WHERE id = ?')
    rows.forEach(row => { if (!MODEL_PROVIDER_PRESETS.some(item => item.key === row.provider_key)) update.run(inferProviderKey(row.name, row.endpoint), row.id) })
  }

  getSecret(id: string) {
    const row = this.database.prepare('SELECT api_key FROM model_providers WHERE id = ?').get(id) as { api_key: Buffer | null } | undefined
    return decrypt(row?.api_key || null)
  }

  get(id: string) {
    const row = this.database.prepare('SELECT * FROM model_providers WHERE id = ?').get(id) as ProviderRow | undefined
    return row ? asSummary(row) : undefined
  }

  save(input: ModelProviderInput) {
    const id = input.id || randomUUID()
    const current = input.id ? this.database.prepare('SELECT api_key FROM model_providers WHERE id = ?').get(id) as { api_key: Buffer | null } | undefined : undefined
    const now = Date.now()
    const models = input.models.map(item => item.trim()).filter(Boolean)
    if (!input.name.trim() || !input.endpoint.trim() || !models.length) throw new Error('请填写 Provider 名称、地址和至少一个模型')
    // An empty key in an edit form means "keep the existing key"; an empty
    // key for a new provider remains unset.
    const apiKey = input.apiKey === undefined || (Boolean(input.id) && !input.apiKey.trim())
      ? current?.api_key || null
      : encrypt(input.apiKey.trim())
    const key = input.providerKey || inferProviderKey(input.name, input.endpoint)
    this.database.prepare(`INSERT INTO model_providers(id, provider_key, name, endpoint, api_key, models, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider_key = excluded.provider_key, name = excluded.name, endpoint = excluded.endpoint, api_key = excluded.api_key,
      models = excluded.models, enabled = excluded.enabled, updated_at = excluded.updated_at`)
      .run(id, key, input.name.trim(), input.endpoint.trim().replace(/\/+$/, ''), apiKey, JSON.stringify(models), input.enabled ? 1 : 0, now, now)
    return this.get(id)!
  }

  delete(id: string) {
    this.database.prepare('DELETE FROM model_role_bindings WHERE provider_id = ?').run(id)
    this.database.prepare('DELETE FROM model_providers WHERE id = ?').run(id)
  }

  bindings(): ModelRoleBinding {
    const rows = this.database.prepare('SELECT role, provider_id, model_id FROM model_role_bindings').all() as Array<{ role: keyof ModelRoleBinding, provider_id: string, model_id: string }>
    return Object.fromEntries(rows.map(row => [row.role, { providerId: row.provider_id, modelId: row.model_id }])) as ModelRoleBinding
  }

  saveBindings(bindings: ModelRoleBinding) {
    const write = this.database.transaction(() => {
      this.database.prepare('DELETE FROM model_role_bindings').run()
      const insert = this.database.prepare('INSERT INTO model_role_bindings(role, provider_id, model_id) VALUES (?, ?, ?)')
      Object.entries(bindings).forEach(([role, value]) => { if (value?.providerId && value.modelId) insert.run(role, value.providerId, value.modelId) })
    })
    write()
    return this.bindings()
  }
}
