import type { RouteRecordRaw } from 'vue-router'
import type { MenuItem } from '@/types'

// 本地菜单只能从随安装包发布的页面白名单中选择，配置不会加载任意文件。
const pageModules = {
  dashboard: () => import('@/pages/dashboard/DashboardPage.vue'),
  'system-menu-config': () => import('@/pages/system/MenuConfigPage.vue'),
  'system-micro-apps': () => import('@/pages/system/MicroAppManagementPage.vue'),
  'system-backup-preferences': () => import('@/pages/system/BackupPreferencesPage.vue'),
}

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
  const component = pageModules[menu.target.componentKey as keyof typeof pageModules]
  if (!component) {
    console.warn(`菜单组件不在允许白名单中: ${menu.target.componentKey}`)
    return null
  }
  return {
    path: menu.path,
    name: menu.name || `Menu_${menu.id}`,
    component,
    meta: { title: menu.title, icon: menu.icon },
  }
}
