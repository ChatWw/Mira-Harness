import { computed, ref } from 'vue'
import { runtimeNavigation } from '@/config/runtime'
import type { MenuItem } from '@/types'
import { getMenuRouteCacheName } from './pageRegistry'

function flattenMenus(menus: MenuItem[]): MenuItem[] {
  return menus.flatMap(menu => [menu, ...(menu.children ? flattenMenus(menu.children) : [])])
}

const evictedCacheNames = ref(new Set<string>())

export const cachedRouteNames = computed(() => flattenMenus(runtimeNavigation.mainMenus)
  .filter(menu => menu.type !== 'dir' && menu.target && menu.keepAlive === true)
  .map(getMenuRouteCacheName)
  .filter(name => !evictedCacheNames.value.has(name))
)

export function activateRouteCache(cacheName: unknown) {
  if (typeof cacheName !== 'string' || !evictedCacheNames.value.has(cacheName)) return
  const next = new Set(evictedCacheNames.value)
  next.delete(cacheName)
  evictedCacheNames.value = next
}

export function evictRouteCache(cacheName: unknown) {
  if (typeof cacheName !== 'string' || evictedCacheNames.value.has(cacheName)) return
  evictedCacheNames.value = new Set([...evictedCacheNames.value, cacheName])
}
