import router, { syncBusinessRoutes } from '@/router'
import { applyPlatformSnapshot } from '@/config/runtime'
import { resolveNavigation } from '@/config/navigation'
import { getPlatformApi } from '@/platform'
import type { PlatformApi, PlatformSnapshot } from '@/types'

export function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function requirePlatformApi(): PlatformApi {
  const api = getPlatformApi()
  if (!api) throw new Error('配置管理仅在桌面端中可用')
  return api
}

export function applyManagementSnapshot(snapshot: PlatformSnapshot) {
  applyPlatformSnapshot(snapshot)
  syncBusinessRoutes()
  const currentPath = router.currentRoute.value.path
  const isSettingsRoute = currentPath === '/settings' || currentPath.startsWith('/settings/')
  const navigation = resolveNavigation(currentPath)
  if (!isSettingsRoute && currentPath !== '/404' && !navigation.menu && !navigation.app) void router.replace('/workspace/chat')
}
