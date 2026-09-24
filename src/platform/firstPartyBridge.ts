import { PLATFORM_API_VERSION, type FirstPartyAppManifest } from '@/config/firstPartyApps'
import type { ModelSelection } from '@/config/harness'
import type { NovelProjectDocument } from '@/config/novel'
import type { PlatformApi, PlatformContext } from '@/types'

export interface FirstPartyRequest {
  type: 'mira:request'
  id: string
  method: string
  params?: unknown
}

export class FirstPartyBridgeError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FirstPartyBridgeError('INVALID_REQUEST', '请求参数格式无效')
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, field: string, maxLength = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new FirstPartyBridgeError('INVALID_REQUEST', `${field}无效`)
  return value
}

function requireCapability(manifest: FirstPartyAppManifest, capability: FirstPartyAppManifest['capabilities'][number]) {
  if (!manifest.capabilities.includes(capability)) throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用没有所需能力')
}

export function isFirstPartyRequest(value: unknown): value is FirstPartyRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return request.type === 'mira:request' && typeof request.id === 'string' && request.id.length > 0 && request.id.length <= 128
    && typeof request.method === 'string' && request.method.length > 0 && request.method.length <= 128
}

export async function handleFirstPartyRequest(options: {
  manifest: FirstPartyAppManifest
  grantId: string
  api: PlatformApi
  context: PlatformContext
  route: string
  navigate: (path: string) => void
}, request: FirstPartyRequest): Promise<unknown> {
  const { manifest, grantId, api, context, route, navigate } = options
  if (!manifest.enabled) throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用已停用')
  switch (request.method) {
    case 'context.get':
      return { ...context, appId: manifest.appId, apiVersion: { ...PLATFORM_API_VERSION }, capabilities: [...manifest.capabilities], route }
    case 'navigation.open': {
      const path = nonEmptyString(record(request.params).path, '应用路径', 2048)
      const pathname = path.split(/[?#]/, 1)[0]
      const parsed = new URL(path, 'https://mira.invalid')
      if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /%2f|%5c|%25/i.test(path)
        || parsed.origin !== 'https://mira.invalid' || parsed.pathname !== pathname) {
        throw new FirstPartyBridgeError('INVALID_REQUEST', '应用路径无效')
      }
      navigate(path)
      return null
    }
    case 'models.generateText': {
      requireCapability(manifest, 'models:text.generate')
      const params = record(request.params)
      const role = params.role
      if (role !== 'authoring' && role !== 'automation') throw new FirstPartyBridgeError('INVALID_REQUEST', '模型职责无效')
      const prompt = nonEmptyString(params.prompt, '模型请求内容', 100_000)
      const rawSelection = record(params.selection)
      const selection: ModelSelection = {
        providerId: nonEmptyString(rawSelection.providerId, '供应商 ID'),
        modelId: nonEmptyString(rawSelection.modelId, '模型 ID'),
      }
      try {
        return await api.generateFirstPartyText(grantId, role, prompt, selection)
      } catch (error) {
        throw new FirstPartyBridgeError('MODEL_REQUEST_FAILED', error instanceof Error ? error.message : '模型请求失败')
      }
    }
    case 'novel.list':
      requireCapability(manifest, 'storage:novel-projects')
      if (manifest.appId !== 'mira-novel-studio') throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用不能读取小说作品')
      return api.listNovelProjects()
    case 'novel.get':
      requireCapability(manifest, 'storage:novel-projects')
      if (manifest.appId !== 'mira-novel-studio') throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用不能读取小说作品')
      return api.getNovelProject(nonEmptyString(record(request.params).id, '作品 ID'))
    case 'novel.save': {
      requireCapability(manifest, 'storage:novel-projects')
      if (manifest.appId !== 'mira-novel-studio') throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用不能保存小说作品')
      const project = record(record(request.params).project)
      if (project.version !== 1 || typeof project.title !== 'string') throw new FirstPartyBridgeError('INVALID_REQUEST', '小说作品格式无效')
      nonEmptyString(project.id, '作品 ID')
      return api.saveNovelProject(project as unknown as NovelProjectDocument)
    }
    default:
      throw new FirstPartyBridgeError('UNKNOWN_METHOD', '平台方法不存在')
  }
}
