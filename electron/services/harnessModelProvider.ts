import { createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { DEFAULT_CONTEXT_WINDOW, type ModelProviderSummary, type ProviderModelConfig } from '../../src/config/harness'
import { lookupModelKnowledge } from '../../src/config/modelKnowledge'
import { miraCompatibleMediaApi } from '../adapters/miraModelMedia'
import { miraTracedModelApi, type MiraModelTraceContext } from '../adapters/miraModelTrace'

export function supportsHarnessImages(configuredModel: ProviderModelConfig) {
  return configuredModel.multimodal ?? lookupModelKnowledge(configuredModel.id)?.multimodal ?? false
}

export function createHarnessModelProvider(provider: ModelProviderSummary, configuredModel: ProviderModelConfig, apiKey: string, trace?: MiraModelTraceContext) {
  const model = {
    id: configuredModel.id, name: configuredModel.id, api: 'openai-completions', provider: 'mira-openai', baseUrl: provider.endpoint,
    reasoning: configuredModel.reasoning, compat: configuredModel.reasoning ? { supportsReasoningEffort: true } : undefined,
    input: supportsHarnessImages(configuredModel) ? ['text', 'image'] : ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: configuredModel.contextWindow || DEFAULT_CONTEXT_WINDOW, maxTokens: 8192,
  } as any
  const models = createModels()
  const api = openAICompletionsApi()
  models.setProvider(createProvider({
    id: 'mira-openai', name: provider.name, baseUrl: provider.endpoint,
    // The OpenAI-compatible SDK needs a non-empty client key even for keyless local servers.
    auth: { apiKey: { name: provider.name, resolve: async () => ({ auth: { apiKey: provider.authMode === 'none' ? 'unused' : apiKey } }) } },
    models: [model], api: miraCompatibleMediaApi(trace ? miraTracedModelApi(api, provider, [apiKey], trace) : api, configuredModel),
  }) as any)
  return { model, models }
}
