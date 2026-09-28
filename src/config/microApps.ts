import type { MicroApp } from '@/types'

export const MIRA_NOVEL_STUDIO_CODE = 'mira-novel-studio' as const

export const LEGACY_MICRO_APP_CODE_ALIASES: Readonly<Record<string, string>> = {
  'ai-novel': MIRA_NOVEL_STUDIO_CODE,
}

export function canonicalMicroAppCode(code: string) {
  return LEGACY_MICRO_APP_CODE_ALIASES[code] || code
}

// 内置微应用编码：入口锁定，只允许停用/启用，不可删除。
export const BUILT_IN_MICRO_APP_CODES = ['mira-harness'] as const

export function isBuiltInMicroApp(code: string) {
  return (BUILT_IN_MICRO_APP_CODES as readonly string[]).includes(code)
}

// 内置微应用资源包：随安装包分发的静态目录，由 LocalMicroAppServer 解析。
export const BUILT_IN_MICRO_APP_PACKAGES = ['harness-react-app'] as const

export function isBuiltInMicroAppPackage(pkg: string) {
  return (BUILT_IN_MICRO_APP_PACKAGES as readonly string[]).includes(pkg)
}

// The local manifest is the single source of truth for embedded applications.
export const microApps: MicroApp[] = [{
  id: 'micro-mira-harness',
  name: 'Mira Harness',
  code: 'mira-harness',
  entry: { type: 'builtin', package: 'harness-react-app' },
  sort: 0,
  enabled: true,
  integrationMode: 'iframe',
  runtimeConfig: { kind: 'iframe', iframe: { profile: 'strict' } },
}]

export function withBuiltInMicroApps(apps: MicroApp[]): MicroApp[] {
  return [
    ...microApps.map(builtin => ({ ...builtin, enabled: apps.find(app => app.id === builtin.id && app.code === builtin.code)?.enabled ?? builtin.enabled })),
    ...apps.filter(app => !isBuiltInMicroApp(app.code) && !microApps.some(builtin => builtin.id === app.id)),
  ]
}

export function findMicroApp(code: string) {
  return microApps.find(app => app.code === code)
    || microApps.find(app => app.code === canonicalMicroAppCode(code))
}
