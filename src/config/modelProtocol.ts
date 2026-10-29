export const MODEL_PROTOCOLS = {
  'openai-completions': { label: 'OpenAI Completions', path: '/chat/completions' },
  'openai-responses': { label: 'OpenAI Responses', path: '/responses' },
  'anthropic-messages': { label: 'Anthropic Messages', path: '/v1/messages' },
} as const

export type ModelProtocol = keyof typeof MODEL_PROTOCOLS

export function modelProtocol(value?: string): ModelProtocol {
  return value && Object.prototype.hasOwnProperty.call(MODEL_PROTOCOLS, value) ? value as ModelProtocol : 'openai-completions'
}

export function modelApiBaseUrl(endpoint: string) {
  const base = endpoint.trim().replace(/\/+$/, '')
  // 月之暗面公布的是主机地址，OpenAI 兼容接口位于 /v1。
  return /^https:\/\/api\.moonshot\.(cn|ai)$/i.test(base) ? `${base}/v1` : base
}

export function modelRequestUrl(endpoint: string, protocol?: ModelProtocol) {
  const base = modelApiBaseUrl(endpoint)
  const path = MODEL_PROTOCOLS[modelProtocol(protocol)].path
  if (base.endsWith(path)) return base
  return `${base}${path === '/v1/messages' && base.endsWith('/v1') ? '/messages' : path}`
}
