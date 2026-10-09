import { isNavigationFailure, NavigationFailureType, type Router } from 'vue-router'

export const HARNESS_WORKBENCH_PATH = '/workspace/harness-react'

export class FirstPartyNavigationError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'NAVIGATION_FAILED', message: string) { super(message) }
}

export function parseFirstPartyNavigationPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0]
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)
    || /%2f|%5c|%25/i.test(pathname)) {
    throw new FirstPartyNavigationError('INVALID_REQUEST', '应用路径无效')
  }
  const parsed = new URL(path, 'https://mira.invalid')
  if (parsed.origin !== 'https://mira.invalid' || parsed.pathname !== pathname) {
    throw new FirstPartyNavigationError('INVALID_REQUEST', '应用路径无效')
  }
  return parsed
}

const harnessQueryKeys: Record<string, readonly string[]> = {
  '/workspace/chat': ['draft'],
  [HARNESS_WORKBENCH_PATH]: [],
  '/workspace/projects': [],
  '/workspace/automations': [],
  '/workspace/usage': [],
  '/workspace/history': ['q', 'project', 'model', 'status', 'range', 'archive', 'sort', 'page'],
  ...Object.fromEntries([
    '/settings', '/settings/general', '/settings/appearance', '/settings/personalization',
    '/settings/keyboard-shortcuts', '/settings/model-config', '/settings/mcp',
    '/settings/python-environment', '/settings/git', '/settings/file-search',
    '/settings/backup-preferences', '/settings/about',
  ].map(path => [path, ['from']])),
}

function parseReturnPath(path: string) {
  const parsed = parseFirstPartyNavigationPath(path)
  if (parsed.pathname === '/settings' || parsed.pathname.startsWith('/settings/')) {
    throw new FirstPartyNavigationError('INVALID_REQUEST', '设置返回路径不能指向设置页面')
  }
  return path
}

export function resolveSettingsReturnPath(from: unknown) {
  if (typeof from !== 'string' || !from.trim() || from.length > 2048) return HARNESS_WORKBENCH_PATH
  try { return parseReturnPath(from) }
  catch { return HARNESS_WORKBENCH_PATH }
}

export function resolveHarnessNavigationPath(path: string) {
  const parsed = parseFirstPartyNavigationPath(path)
  const allowedKeys = harnessQueryKeys[parsed.pathname]
  if (!allowedKeys || parsed.hash) throw new FirstPartyNavigationError('INVALID_REQUEST', 'Harness 不支持打开此页面')
  for (const [key, value] of parsed.searchParams) {
    if (!allowedKeys.includes(key) || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new FirstPartyNavigationError('INVALID_REQUEST', '页面导航参数无效')
    }
  }
  if (parsed.pathname === '/settings' || parsed.pathname.startsWith('/settings/')) {
    if (parsed.searchParams.getAll('from').length > 1) throw new FirstPartyNavigationError('INVALID_REQUEST', '设置返回路径无效')
    const from = parsed.searchParams.get('from') ?? HARNESS_WORKBENCH_PATH
    parsed.searchParams.set('from', parseReturnPath(from))
  }
  return parsed.pathname + parsed.search
}

export async function navigateHarnessHost(router: Pick<Router, 'push'>, path: string) {
  const target = resolveHarnessNavigationPath(path)
  const failure = await router.push(target)
  if (isNavigationFailure(failure) && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
    throw new FirstPartyNavigationError('NAVIGATION_FAILED', '页面未切换，请检查草稿保存状态后重试')
  }
}
