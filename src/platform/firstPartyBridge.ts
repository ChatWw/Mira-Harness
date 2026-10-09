import { PLATFORM_API_VERSION, type FirstPartyAppManifest } from '@/config/firstPartyApps'
import type { ModelSelection } from '@/config/harness'
import type { NovelProjectDocument } from '@/config/novel'
import type { PlatformApi, PlatformContext } from '@/types'
import { parseFirstPartyHarnessCall } from './firstPartyHarness'

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
  if (request.method.startsWith('harness.')) {
    requireCapability(manifest, 'harness:workbench')
    if (manifest.appId !== 'mira-harness') throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用不能使用 Harness 工作台')
    let call: ReturnType<typeof parseFirstPartyHarnessCall>
    try { call = parseFirstPartyHarnessCall(request.method.slice('harness.'.length), request.params) }
    catch (error) { throw new FirstPartyBridgeError('INVALID_REQUEST', error instanceof Error ? error.message : 'Harness 请求无效') }
    const { method, ...params } = call
    try {
      return await api.invokeFirstPartyHarness(grantId, method, params)
    } catch (error) {
      // 只映射已知文件失败，避免把主进程异常、堆栈或模型凭据透出到应用。
      if (method.startsWith('files.') && method !== 'files.select') {
        const message = error instanceof Error ? error.message : ''
        const failure = message.replace(/^Error invoking remote method 'platform:first-party-harness': Error: /, '')
        const fileErrors: Record<string, string> = {
          '文件或目录不存在': '文件或目录已不存在，请刷新文件列表后重试。',
          '目标不是目录': '该路径不是目录，请刷新文件列表后重试。',
          '目标不是文件': '该路径不是可预览的文件，请选择文本文件。',
          '文件过大，暂不支持预览': '文件超过预览大小限制，请使用外部应用打开。',
          '暂不支持预览二进制文件': '该文件不是可预览的文本文件，请使用外部应用打开。',
          '路径无效': '文件路径无效，请刷新文件列表后重试。',
          '路径不能离开工作目录': '无法读取工作目录以外的文件，请选择目录内的文件。',
          '没有权限读取文件或目录': '没有权限读取该文件或目录，请检查系统访问权限后重试。',
          '工作目录搜索未完成': '工作目录搜索未完成，请检查目录访问权限后重试。',
          '该会话没有可用工作目录': '该会话没有可用工作目录，请重新选择项目后重试。',
          '文件变化监听不可用，请使用手动刷新。': '文件变化监听不可用，请使用手动刷新。',
          '一次最多监听 256 个目录': '一次最多监听 256 个目录，请收起部分文件夹后重试。',
          '当前窗口的文件监听数量已达上限，请关闭部分文件工作区后重试。': '当前窗口的文件监听数量已达上限，请关闭部分文件工作区后重试。',
          '没有权限监听文件或目录，请检查系统访问权限后重试。': '没有权限监听文件或目录，请检查系统访问权限后重试。',
          '监听目录已不存在，请刷新文件列表后重试。': '监听目录已不存在，请刷新文件列表后重试。',
          '系统文件监听资源不足，请关闭部分目录后重试。': '系统文件监听资源不足，请关闭部分目录后重试。',
          '文件变化监听失败，请刷新后重试。': '文件变化监听失败，请刷新后重试。',
          '文件监听授权已失效': '文件监听授权已失效，请重新打开文件工作区。',
          '工作目录已变化，请重新打开文件工作区。': '工作目录已变化，请重新打开文件工作区。',
          '工作目录不是文件夹': '工作目录不是文件夹，请重新选择项目。',
          '只能打开工作目录中的文件或文件夹': '只能打开工作目录中的文件或文件夹。',
          '打开方式无效': '打开方式无效，请重新检测应用。',
          '打开方式无效或当前系统不支持': '打开方式无效或当前系统不支持，请选择其他应用。',
          '图片格式暂不支持预览': '该图片格式暂不支持预览，请使用外部应用打开。',
          '图片文件超过 4 MiB 预览限制': '图片超过 4 MiB 预览限制，请使用外部应用打开。',
          '文件在读取期间发生变化，请重试': '文件在读取期间发生变化，请重试。',
          '图片读取失败，请重试': '图片读取失败，请重试。',
          'Git 未安装或不可用': 'Git 未安装或不可用，请安装 Git 后重试。',
          'Git 输出超过 8 MiB 限制，请缩小工作目录': 'Git 输出超过 8 MiB 限制，请缩小工作目录后重试。',
          'Git 状态读取超时，请重试': 'Git 状态读取超时，请重试。',
          'Git 状态读取繁忙，请稍后重试': 'Git 状态读取繁忙，请稍后重试。',
          'Git 元数据不能使用符号链接': 'Git 元数据不能使用符号链接，请选择正常的 Git 工作目录。',
          'Git 状态读取失败，请重试': 'Git 状态读取失败，请重试。',
        }
        if (method === 'files.read-image' && failure === '目标不是文件') throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', '该路径不是可预览的图片文件，请刷新文件列表后重试。')
        if (Object.prototype.hasOwnProperty.call(fileErrors, failure)) throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', fileErrors[failure])
        if (method === 'files.open-editor') {
          const editorNames = ['Finder', 'QSpace', 'QSpace Pro', 'VS Code', 'VS Code Insiders', 'Cursor', 'Trae', 'Zed', 'Sublime Text', 'CodeBuddy', 'Qoder', 'IntelliJ IDEA', 'IntelliJ IDEA CE', 'WebStorm', 'PyCharm', 'GoLand', 'PhpStorm', 'Rider', 'TextEdit', '资源管理器', 'CLion', '记事本']
          if (editorNames.some(name => failure === `${name} 未安装或已卸载，请选择其他打开方式`
            || failure === `${name} 只支持打开文件，请从文件菜单选择打开方式`
            || failure === `无法用 ${name} 打开，请检查应用或选择其他打开方式`)) {
            throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', `${failure}。`)
          }
        }
        if (method === 'files.search') throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', fileErrors['工作目录搜索未完成'])
        if (method === 'files.watch' || method === 'files.unwatch') throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', '文件变化监听失败，请使用手动刷新或重试。')
        if (method === 'files.open-editor') throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', '编辑器打开失败，请检查应用或选择其他打开方式。')
        if (method === 'files.read-image') throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', '图片读取失败，请重试。')
        if (method === 'files.git-status' || method === 'files.git-ignored') throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', 'Git 状态读取失败，请检查 Git 是否安装或稍后刷新重试。')
      }
      if (method === 'editors.list') throw new FirstPartyBridgeError('WORKSPACE_FILE_FAILED', '无法检测已安装应用，请重试。')
      if (method === 'message.run' || method === 'plan.continue' || method === 'files.select') {
        const message = error instanceof Error ? error.message : ''
        if (message.includes('引用文件不存在：')) throw new FirstPartyBridgeError('FILE_REFERENCE_FAILED', '引用文件已不可读取，请重新选择文件后发送。')
        if (message.includes('引用文件过大：')) throw new FirstPartyBridgeError('FILE_REFERENCE_FAILED', '引用文件超过大小限制，请选择较小的文本文件。')
        if (message.includes('不支持引用二进制文件：')) throw new FirstPartyBridgeError('FILE_REFERENCE_FAILED', '无法引用二进制文件，请选择文本文件。')
      }
      throw error
    }
  }
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
      return api.listFirstPartyNovelProjects(grantId)
    case 'novel.get':
      requireCapability(manifest, 'storage:novel-projects')
      if (manifest.appId !== 'mira-novel-studio') throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用不能读取小说作品')
      return api.getFirstPartyNovelProject(grantId, nonEmptyString(record(request.params).id, '作品 ID'))
    case 'novel.save': {
      requireCapability(manifest, 'storage:novel-projects')
      if (manifest.appId !== 'mira-novel-studio') throw new FirstPartyBridgeError('CAPABILITY_DENIED', '应用不能保存小说作品')
      const project = record(record(request.params).project)
      if (project.version !== 1 || typeof project.title !== 'string') throw new FirstPartyBridgeError('INVALID_REQUEST', '小说作品格式无效')
      nonEmptyString(project.id, '作品 ID')
      return api.saveFirstPartyNovelProject(grantId, project as unknown as NovelProjectDocument)
    }
    case 'preferences.get': {
      const key = nonEmptyString(record(request.params).key, '偏好键名')
      const snapshot = await api.getSnapshot()
      const value = snapshot.preferences[`first-party.${manifest.appId}.${key}`]
      return value === undefined ? null : value
    }
    case 'preferences.set': {
      const params = record(request.params)
      const key = nonEmptyString(params.key, '偏好键名')
      if (!/^[\w.-]+$/.test(key)) throw new FirstPartyBridgeError('INVALID_REQUEST', '偏好键名无效')
      const value = params.value === undefined ? null : params.value
      let serialized: string
      try { serialized = JSON.stringify(value) } catch { throw new FirstPartyBridgeError('INVALID_REQUEST', '偏好值无法序列化') }
      if (serialized.length > 262_144) throw new FirstPartyBridgeError('INVALID_REQUEST', '偏好值过大')
      await api.savePreference(`first-party.${manifest.appId}.${key}`, JSON.parse(serialized))
      return null
    }
    default:
      throw new FirstPartyBridgeError('UNKNOWN_METHOD', '平台方法不存在')
  }
}
