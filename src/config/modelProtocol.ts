export const MODEL_PROTOCOLS = {
  'openai-completions': { label: 'OpenAI Completions', path: '/chat/completions' },
  'openai-responses': { label: 'OpenAI Responses', path: '/responses' },
  'anthropic-messages': { label: 'Anthropic Messages', path: '/v1/messages' },
} as const

export type ModelProtocol = keyof typeof MODEL_PROTOCOLS

type ProviderIdentity = { providerKey?: string; slug?: string }
// Paths are API bases, before the protocol's resource path. Sources: docs/BUILTIN_MODEL_PROTOCOLS.md.
const BUILTIN_PROTOCOL_BASES: Record<string, Partial<Record<ModelProtocol, string>>> = {
  deepseek: { 'openai-completions': '', 'openai-responses': '', 'anthropic-messages': '/anthropic' },
  glm: { 'openai-completions': '/api/paas/v4', 'openai-responses': '/api/v1', 'anthropic-messages': '/api/anthropic' },
  kimi: { 'openai-completions': '/v1', 'openai-responses': '/v1', 'anthropic-messages': '/anthropic' },
  minimax: { 'openai-completions': '/v1', 'openai-responses': '/v1', 'anthropic-messages': '/anthropic' },
  qwen: { 'openai-completions': '/compatible-mode/v1', 'openai-responses': '/compatible-mode/v1', 'anthropic-messages': '/apps/anthropic' },
  bailian: { 'openai-completions': '/compatible-mode/v1', 'openai-responses': '/compatible-mode/v1', 'anthropic-messages': '/apps/anthropic' },
  siliconcloud: { 'openai-completions': '/v1', 'anthropic-messages': '/v1' },
  baichuan: { 'openai-completions': '/v1', 'openai-responses': '/v1' },
  volcengine: { 'openai-completions': '/api/v3', 'openai-responses': '/api/v3', 'anthropic-messages': '/api/compatible' },
  modelscope: { 'openai-completions': '/v1', 'openai-responses': '/v1', 'anthropic-messages': '/v1' },
  tokenhub: { 'openai-completions': '/v1', 'openai-responses': '/v1', 'anthropic-messages': '/v1' },
  qianfan: { 'openai-completions': '/v2', 'openai-responses': '/v2', 'anthropic-messages': '/anthropic' },
  xiaomimimo: { 'openai-completions': '/v1', 'openai-responses': '/v1', 'anthropic-messages': '/anthropic' },
  ollama: { 'openai-completions': '/v1', 'openai-responses': '/v1', 'anthropic-messages': '/v1' },
}

export function builtinProtocolProvider(provider?: ProviderIdentity) {
  // A slug identifies the service, including records created by older desktop hosts.
  const key = provider?.slug || provider?.providerKey || ''
  return Object.prototype.hasOwnProperty.call(BUILTIN_PROTOCOL_BASES, key) ? key : undefined
}

export function supportsModelProtocol(provider: ProviderIdentity | undefined, protocol: ModelProtocol) {
  const key = builtinProtocolProvider(provider)
  return !key || BUILTIN_PROTOCOL_BASES[key][protocol] !== undefined
}

export function modelEndpointForProtocol(endpoint: string, protocol: ModelProtocol, provider?: ProviderIdentity) {
  const key = builtinProtocolProvider(provider)
  if (!key) return endpoint
  const bases = BUILTIN_PROTOCOL_BASES[key]
  const target = bases[protocol]
  if (target === undefined) return endpoint
  const base = endpoint.trim().replace(/\/+$/, '')
  let url: URL
  try { url = new URL(base) } catch { return endpoint }
  // Leave manually configured query strings and unknown proxy paths alone.
  if (url.search || url.hash) return endpoint
  const resource = /\/(?:chat\/completions|responses|messages)$/
  const apiBase = base.replace(/\/(anthropic|compatible)\/v1\/messages$/, '/$1').replace(resource, '')
  const path = new URL(apiBase).pathname.replace(/\/+$/, '')
  const source = [...new Set([...Object.values(bases), ...(key === 'deepseek' ? ['/v1'] : [])])]
    .filter(Boolean).sort((a, b) => b.length - a.length).find(suffix => path.endsWith(suffix))
  if (key === 'deepseek' && protocol === 'openai-completions' && path.endsWith('/v1')) return apiBase
  if (source) return `${apiBase.slice(0, -source.length)}${target}`
  return !path ? `${apiBase}${target}` : endpoint
}

export function modelUsesBearerAuth(provider?: ProviderIdentity, protocol?: ModelProtocol) {
  return protocol !== 'anthropic-messages' || builtinProtocolProvider(provider) === 'siliconcloud'
}

export function modelProtocol(value?: string): ModelProtocol {
  return value && Object.prototype.hasOwnProperty.call(MODEL_PROTOCOLS, value) ? value as ModelProtocol : 'openai-completions'
}

export function modelApiBaseUrl(endpoint: string, protocol?: ModelProtocol, provider?: ProviderIdentity) {
  const base = modelEndpointForProtocol(endpoint, modelProtocol(protocol), provider).trim().replace(/\/+$/, '')
  // 月之暗面公布的是主机地址，OpenAI 兼容接口位于 /v1。
  return protocol !== 'anthropic-messages' && /^https:\/\/api\.moonshot\.(cn|ai)$/i.test(base) ? `${base}/v1` : base
}

export function modelRequestUrl(endpoint: string, protocol?: ModelProtocol, provider?: ProviderIdentity) {
  if (!supportsModelProtocol(provider, modelProtocol(protocol))) throw new Error('该内置服务商不支持所选请求协议')
  const base = modelApiBaseUrl(endpoint, protocol, provider)
  const path = MODEL_PROTOCOLS[modelProtocol(protocol)].path
  if (base.endsWith(path)) return base
  return `${base}${path === '/v1/messages' && base.endsWith('/v1') ? '/messages' : path}`
}
