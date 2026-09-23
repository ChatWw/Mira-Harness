import { ipcMain, shell } from 'electron'
import { type ModelProviderInput } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'

export interface ModelIpcDependencies {
  database: PlatformDatabase
}

export function registerModelIpcHandlers({ database }: ModelIpcDependencies) {
  ipcMain.handle('harness:list-model-providers', () => database.models.list())
  ipcMain.handle('harness:get-model-config-path', () => database.models.path())
  ipcMain.handle('harness:get-model-provider-api-key', (_event, id: string) => database.models.getSecret(id))
  ipcMain.handle('harness:open-model-config-file', () => shell.openPath(database.models.path()))
  ipcMain.handle('harness:list-model-provider-models', async (_event, provider: ModelProviderInput) => {
    const endpoint = provider.endpoint.trim().replace(/\/+$/, '')
    if (!endpoint) return { models: [], error: '未填写 Endpoint' }
    const url = /\/models$/i.test(endpoint) ? endpoint : `${endpoint}/models`
    const apiKey = provider.apiKey?.trim() || database.models.getSecret(provider.id || '')
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(url, { headers, signal: controller.signal })
      if (!response.ok) return { models: [], error: `请求失败（HTTP ${response.status}）${!apiKey && provider.authMode !== 'none' ? '，请确认已填写 API Key' : ''}` }
      const payload = await response.json() as { data?: Array<Record<string, unknown>>, models?: Array<Record<string, unknown>> }
      const ids = (payload.data || payload.models || []).map(item => {
        const value = item.id ?? item.model ?? item.name
        return typeof value === 'string' ? value.trim() : ''
      })
      const models = [...new Set(ids.filter(Boolean))]
      if (!models.length) return { models: [], error: '接口已响应，但未返回模型列表' }
      return { models }
    } catch (error) {
      return { models: [], error: error instanceof Error && error.name === 'AbortError' ? '查询超时（8 秒）' : `查询失败：${error instanceof Error ? error.message : String(error)}` }
    } finally {
      clearTimeout(timeout)
    }
  })
  ipcMain.handle('harness:save-model-provider', (_event, provider: ModelProviderInput) => database.models.save(provider))
  ipcMain.handle('harness:delete-model-provider', (_event, id: string) => database.models.delete(id))
  ipcMain.handle('harness:get-model-role-bindings', () => database.models.bindings())
  ipcMain.handle('harness:save-model-role-bindings', (_event, bindings) => database.models.saveBindings(bindings))
  ipcMain.handle('harness:test-model-provider', async (_event, provider: ModelProviderInput, modelId: string) => {
    try {
      const endpoint = provider.endpoint.trim().replace(/\/+$/, '')
      const url = /\/chat\/completions$/i.test(endpoint) ? endpoint : `${endpoint}/chat/completions`
      const apiKey = provider.apiKey || database.models.getSecret(provider.id || '')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: '请用一个词回复“已连接”。' }], stream: false }) })
      if (!response.ok) return { ok: false, text: `请求失败：${response.status} ${(await response.text()).slice(0, 240)}` }
      return { ok: true, text: '连接成功' }
    } catch (error) { return { ok: false, text: error instanceof Error ? error.message : String(error) }
    }
  })
}
