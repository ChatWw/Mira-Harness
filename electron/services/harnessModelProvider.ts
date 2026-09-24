import { createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { DEFAULT_CONTEXT_WINDOW, type ModelProviderSummary, type ProviderModelConfig } from '../../src/config/harness'

export function createHarnessModelProvider(provider: ModelProviderSummary, configuredModel: ProviderModelConfig, apiKey: string) {
  const model = {
    id: configuredModel.id, name: configuredModel.id, api: 'openai-completions', provider: 'mira-openai', baseUrl: provider.endpoint,
    reasoning: configuredModel.reasoning, compat: configuredModel.reasoning ? { supportsReasoningEffort: true } : undefined,
    input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: configuredModel.contextWindow || DEFAULT_CONTEXT_WINDOW, maxTokens: 8192,
  } as any
  const models = createModels()
  models.setProvider(createProvider({
    id: 'mira-openai', name: provider.name, baseUrl: provider.endpoint,
    // The OpenAI-compatible SDK needs a non-empty client key even for keyless local servers.
    auth: { apiKey: { name: provider.name, resolve: async () => ({ auth: { apiKey: provider.authMode === 'none' ? 'unused' : apiKey } }) } },
    models: [model], api: openAICompletionsApi(),
  }) as any)
  return { model, models }
}
