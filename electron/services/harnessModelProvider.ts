import { modelProtocol } from '../../src/config/modelProtocol'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
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
  const protocol = modelProtocol(provider.protocol)
  // Anthropic SDK adds /v1/messages itself; accept either form shown by the settings preview.
  const baseUrl = protocol === 'anthropic-messages' ? provider.endpoint.replace(/\/(?:v1\/messages|v1)\/?$/, '') : provider.endpoint
  const model = {
    id: configuredModel.id, name: configuredModel.id, api: protocol, provider: 'mira-openai', baseUrl,
    reasoning: configuredModel.reasoning, compat: configuredModel.reasoning ? { supportsReasoningEffort: true } : undefined,
    input: supportsHarnessImages(configuredModel) ? ['text', 'image'] : ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: configuredModel.contextWindow || DEFAULT_CONTEXT_WINDOW,
    // 未显式配置时沿用旧默认值；配置后按模型实际上限发送。
    maxTokens: configuredModel.maxTokens && configuredModel.maxTokens > 0 ? configuredModel.maxTokens : 8192,
  } as any
  const models = createModels()
  const api = protocol === 'anthropic-messages' ? anthropicMessagesApi() : protocol === 'openai-responses' ? openAIResponsesApi() : openAICompletionsApi()
  models.setProvider(createProvider({
    id: 'mira-openai', name: provider.name, baseUrl,
    // The OpenAI-compatible SDK needs a non-empty client key even for keyless local servers.
    auth: { apiKey: { name: provider.name, resolve: async () => ({ auth: { apiKey: provider.authMode === 'none' ? 'unused' : apiKey } }) } },
    models: [model], api: miraCompatibleMediaApi(trace ? miraTracedModelApi(api, provider, [apiKey], trace) : api, configuredModel),
  }) as any)
  return { model, models }
}
