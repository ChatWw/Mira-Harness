import type { RouteRecordRaw } from 'vue-router'
import type { MenuItem } from '@/types'

// Vite 在构建时枚举可加载页面；本地菜单只能引用这份白名单中的 component 路径。
const pageModules = import.meta.glob('/src/pages/**/*.vue')

export function createBusinessRoute(menu: MenuItem): RouteRecordRaw | null {
  if (!menu.path || !menu.target) return null

  if (menu.target.type === 'iframe') {
    return {
      path: menu.path,
      name: menu.name || `Menu_${menu.id}`,
      component: () => import('@/pages/system/EmbeddedWebPage.vue'),
      meta: { title: menu.title, icon: menu.icon, menuId: menu.id },
    }
  }

  if (menu.target.type !== 'component') return null
  const component = pageModules[menu.target.component]
  if (!component) {
    console.warn(`菜单组件不存在或不在允许目录内: ${menu.target.component}`)
    return null
  }
  return {
    path: menu.path,
    name: menu.name || `Menu_${menu.id}`,
    component,
    meta: { title: menu.title, icon: menu.icon },
  }
}
