import type { ModelPricing } from './harness'

/**
 * Built-in knowledge base of known models: context window, reasoning
 * capability, multimodal support, and an estimated usage price (per 1M tokens).
 *
 * Sources: each provider's official docs / pricing pages. Fields that are not
 * published for a model are omitted so the UI can leave them blank rather than
 * guessing. Models not listed here are simply "unknown" and are left unfilled.
 */
export interface ModelKnowledge {
  contextWindow?: number
  reasoning?: boolean
  multimodal?: boolean
  pricing?: ModelPricing
}

const ENTRIES: Array<{ id: string; knowledge: ModelKnowledge }> = [
  // === 智谱 / GLM ===
  // 上下文/推理/多模态来自官方模型概览表；bigmodel.cn 定价页为客户端渲染，无法可靠抓取，
  // 单价暂留空（由用户按官方账单填充，或后续补充）。
  { id: 'glm-5.3', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: false } },
  { id: 'glm-5.2', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: false } },
  { id: 'glm-5.1', knowledge: { contextWindow: 200000, reasoning: true, multimodal: false } },
  { id: 'glm-5', knowledge: { contextWindow: 200000, reasoning: true, multimodal: false } },
  { id: 'glm-4.7', knowledge: { contextWindow: 200000, reasoning: true, multimodal: false } },
  { id: 'glm-4.6', knowledge: { contextWindow: 200000, reasoning: true, multimodal: false } },
  { id: 'glm-4.5-air', knowledge: { contextWindow: 131072, reasoning: true, multimodal: false } },
  { id: 'glm-4.5-flash', knowledge: { contextWindow: 131072, reasoning: true, multimodal: false } },
  { id: 'glm-4-long', knowledge: { contextWindow: 1000000, reasoning: false, multimodal: false } },
  { id: 'glm-5v-turbo', knowledge: { contextWindow: 200000, reasoning: true, multimodal: true } },
  { id: 'glm-4.6v', knowledge: { contextWindow: 128000, reasoning: true, multimodal: true } },
  { id: 'glm-4.6v-flash', knowledge: { contextWindow: 128000, reasoning: true, multimodal: true } },
  { id: 'glm-4v-flash', knowledge: { contextWindow: 16000, reasoning: false, multimodal: true } },
  // === Moonshot / Kimi ===
  { id: 'kimi-k3', knowledge: { contextWindow: 1048576, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 20, output: 100, cacheRead: 2, cacheWrite: 20 } } },
  { id: 'kimi-k2.7-code', knowledge: { contextWindow: 262144, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 6.5, output: 27, cacheRead: 1.3, cacheWrite: 6.5 } } },
  { id: 'kimi-k2.7-code-highspeed', knowledge: { contextWindow: 262144, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 13, output: 54, cacheRead: 2.6, cacheWrite: 13 } } },
  { id: 'kimi-k2.6', knowledge: { contextWindow: 262144, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 6.5, output: 27, cacheRead: 1.1, cacheWrite: 6.5 } } },
  { id: 'kimi-k2.5', knowledge: { contextWindow: 262144, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 4, output: 21, cacheRead: 0.7, cacheWrite: 4 } } },
  { id: 'moonshot-v1-8k', knowledge: { contextWindow: 8192, reasoning: false, multimodal: false, pricing: { currency: 'CNY', input: 2, output: 10, cacheRead: 0, cacheWrite: 2 } } },
  { id: 'moonshot-v1-32k', knowledge: { contextWindow: 32768, reasoning: false, multimodal: false, pricing: { currency: 'CNY', input: 5, output: 20, cacheRead: 0, cacheWrite: 5 } } },
  { id: 'moonshot-v1-128k', knowledge: { contextWindow: 131072, reasoning: false, multimodal: false, pricing: { currency: 'CNY', input: 10, output: 30, cacheRead: 0, cacheWrite: 10 } } },
  { id: 'moonshot-v1-8k-vision-preview', knowledge: { contextWindow: 8192, reasoning: false, multimodal: true, pricing: { currency: 'CNY', input: 2, output: 10, cacheRead: 0, cacheWrite: 2 } } },
  { id: 'moonshot-v1-32k-vision-preview', knowledge: { contextWindow: 32768, reasoning: false, multimodal: true, pricing: { currency: 'CNY', input: 5, output: 20, cacheRead: 0, cacheWrite: 5 } } },
  { id: 'moonshot-v1-128k-vision-preview', knowledge: { contextWindow: 131072, reasoning: false, multimodal: true, pricing: { currency: 'CNY', input: 10, output: 30, cacheRead: 0, cacheWrite: 10 } } },
  // === MiniMax ===
  { id: 'MiniMax-M3', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 2.1, output: 8.4, cacheRead: 0.42, cacheWrite: 0 } } },
  { id: 'MiniMax-M2.7', knowledge: { contextWindow: 204800, reasoning: true, multimodal: false, pricing: { currency: 'CNY', input: 2.1, output: 8.4, cacheRead: 0.42, cacheWrite: 2.625 } } },
  { id: 'MiniMax-M2.7-highspeed', knowledge: { contextWindow: 204800, reasoning: true, multimodal: false, pricing: { currency: 'CNY', input: 4.2, output: 16.8, cacheRead: 0.42, cacheWrite: 2.625 } } },
  // === DeepSeek ===
  { id: 'deepseek-v4-flash', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: false, pricing: { currency: 'CNY', input: 3, output: 9, cacheRead: 0.1, cacheWrite: 3 } } },
  { id: 'deepseek-v4-pro', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: false, pricing: { currency: 'CNY', input: 9, output: 27, cacheRead: 0.3, cacheWrite: 9 } } },
  { id: 'deepseek-v4-flash-vision-exp', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 3, output: 9, cacheRead: 0.1, cacheWrite: 3 } } },
  // === 阿里千问 / Qwen（阿里云百炼，OpenAI 兼容）===
  { id: 'qwen3.8-max', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: true, pricing: { currency: 'CNY', input: 12, output: 36, cacheRead: 0, cacheWrite: 0 } } },
  { id: 'qwen3.7-plus', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: false, pricing: { currency: 'CNY', input: 2, output: 8, cacheRead: 0, cacheWrite: 0 } } },
  { id: 'qwen3.7-flash', knowledge: { contextWindow: 1000000, reasoning: true, multimodal: false, pricing: { currency: 'CNY', input: 0.2, output: 0.8, cacheRead: 0, cacheWrite: 0 } } },
]

const NORMALIZED = new Map<string, ModelKnowledge>()
for (const { id, knowledge } of ENTRIES) NORMALIZED.set(normalizeModelId(id), knowledge)

function normalizeModelId(id: string) {
  return id.trim().toLowerCase()
}

export function lookupModelKnowledge(id: string): ModelKnowledge | undefined {
  const value = NORMALIZED.get(normalizeModelId(id))
  return value ? { ...value, pricing: value.pricing ? { ...value.pricing } : undefined } : undefined
}
