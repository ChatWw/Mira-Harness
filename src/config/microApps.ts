import type { MicroApp } from '@/types'

// 内置微应用编码：入口锁定，只允许停用/启用，不可删除。
export const BUILT_IN_MICRO_APP_CODES = [] as const

export function isBuiltInMicroApp(code: string) {
  return (BUILT_IN_MICRO_APP_CODES as readonly string[]).includes(code)
}

// 内置微应用资源包：随安装包分发的静态目录，由 LocalMicroAppServer 解析。
export const BUILT_IN_MICRO_APP_PACKAGES = [] as const

export function isBuiltInMicroAppPackage(pkg: string) {
  return (BUILT_IN_MICRO_APP_PACKAGES as readonly string[]).includes(pkg)
}

// The local manifest is the single source of truth for embedded applications.
export const microApps: MicroApp[] = []

export function findMicroApp(code: string) {
  return microApps.find(app => app.code === code)
}
