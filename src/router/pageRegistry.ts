import type { RouteRecordRaw } from 'vue-router'
import type { MenuItem } from '@/types'

// Vite 在构建时枚举可加载页面；接口只能引用这份白名单中的 component 路径。
// 这样路径与菜单数据可配置，同时不会把任意字符串交给动态 import 执行。
const pageModules = import.meta.glob('/src/pages/**/*.vue')

export function createBusinessRoute(menu: MenuItem): RouteRecordRaw | null {
  if (!menu.path || !menu.component) return null
  const component = pageModules[menu.component]
  if (!component) {
    console.warn(`菜单组件不存在或不在允许目录内: ${menu.component}`)
    return null
  }
  return {
    path: menu.path,
    name: menu.name || `Menu_${menu.id}`,
    component,
    meta: { title: menu.title, icon: menu.icon, permission: menu.permission },
  }
}
