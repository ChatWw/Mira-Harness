import { describe, expect, it } from 'vitest'
import { createHarnessModelProvider } from '../electron/services/harnessModelProvider'
import type { ModelProviderSummary, ProviderModelConfig } from '../src/config/harness'

const configuredModel: ProviderModelConfig = { id: 'local-model', enabled: true, reasoning: false, contextWindow: 8192 }
const provider = { id: 'local', providerKey: 'ollama', name: 'Local', endpoint: 'http://127.0.0.1:12345/v1', models: [configuredModel], enabled: true, hasApiKey: false, createdAt: 0, updatedAt: 0 } as ModelProviderSummary

describe('createHarnessModelProvider', () => {
  it('uses a non-secret SDK placeholder for a keyless endpoint', async () => {
    const { model, models } = createHarnessModelProvider({ ...provider, authMode: 'none' }, configuredModel, '')
    const auth = await models.getProvider('mira-openai')!.auth.apiKey!.resolve({} as any)

    expect(model.id).toBe('local-model')
    expect(auth).toEqual({ auth: { apiKey: 'unused' } })
  })

  it('preserves the configured key for authenticated endpoints', async () => {
    const { models } = createHarnessModelProvider({ ...provider, authMode: 'api-key' }, configuredModel, 'configured-key')
    const auth = await models.getProvider('mira-openai')!.auth.apiKey!.resolve({} as any)

    expect(auth).toEqual({ auth: { apiKey: 'configured-key' } })
  })
})
