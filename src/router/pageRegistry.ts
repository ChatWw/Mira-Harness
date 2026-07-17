import type { RouteRecordRaw } from 'vue-router'
import type { RouteDefinition } from '@/types'

// 这里只登记打包时可知的本地主应用页面，不定义业务路径和权限。
// 业务路由由 /auth/bootstrap 的 routes 字段下发。
const pageRegistry: Record<string, RouteRecordRaw['component']> = {
  dashboard: () => import('@/pages/dashboard/DashboardPage.vue'),
  'system-users': () => import('@/pages/system/UserPage.vue'),
  'system-roles': () => import('@/pages/system/RolePage.vue'),
  'system-menus': () => import('@/pages/system/MenuPage.vue'),
  'system-microapps': () => import('@/pages/system/MicroAppPage.vue'),
  'system-microapp-config': () => import('@/pages/system/MicroAppConfigPage.vue'),
  'system-dept': () => import('@/pages/system/DeptPage.vue'),
  'system-log': () => import('@/pages/system/LogPage.vue'),
  'system-settings': () => import('@/pages/system/SettingsPage.vue'),
  'profile-info': () => import('@/pages/profile/ProfileInfoPage.vue'),
  'profile-security': () => import('@/pages/profile/ProfileSecurityPage.vue'),
  'message-list': () => import('@/pages/message/MessageListPage.vue'),
  'message-settings': () => import('@/pages/message/MessageSettingsPage.vue'),
  'components-table': () => import('@/pages/components/ProTableDemo.vue'),
  'components-form': () => import('@/pages/components/ProFormDemo.vue'),
  'components-detail': () => import('@/pages/components/DetailLayoutDemo.vue'),
}

export function createBusinessRoute(definition: RouteDefinition): RouteRecordRaw | null {
  const component = pageRegistry[definition.pageKey]
  if (!component) {
    console.warn(`未注册的本地页面标识: ${definition.pageKey}`)
    return null
  }
  return {
    path: definition.path,
    name: definition.name,
    component,
    meta: { title: definition.title, permission: definition.permission },
  }
}
