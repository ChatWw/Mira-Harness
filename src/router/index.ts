import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { runtimeNavigation } from '@/config/runtime'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import type { MenuItem } from '@/types'
import { createBusinessRoute } from './pageRegistry'

const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/pages/backend/settings/index.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/settings/general',
    name: 'SettingsGeneral',
    component: () => import('@/pages/backend/general/index.vue'),
    meta: { title: '常规' },
  },
  {
    path: '/settings/appearance',
    name: 'SettingsAppearance',
    component: () => import('@/pages/backend/appearance/index.vue'),
    meta: { title: '外观' },
  },
  {
    path: '/settings/keyboard-shortcuts',
    name: 'SettingsShortcuts',
    component: () => import('@/pages/backend/keyboardShortcuts/index.vue'),
    meta: { title: '键盘快捷键' },
  },
  {
    path: '/settings/about',
    name: 'SettingsAbout',
    component: () => import('@/pages/backend/about/index.vue'),
    meta: { title: '关于' },
  },
  {
    path: '/settings/loading-effects',
    name: 'SettingsLoadingEffects',
    component: () => import('@/pages/backend/loadingEffect/index.vue'),
    meta: { title: '加载效果' },
  },
  {
    path: '/settings/icon-library',
    name: 'SettingsIconLibrary',
    component: () => import('@/pages/backend/iconLibrary/index.vue'),
    meta: { title: '图标库' },
  },
  {
    path: '/settings/menu-management',
    name: 'SettingsMenuManagement',
    component: () => import('@/pages/backend/menuManagement/index.vue'),
    meta: { title: '菜单管理' },
  },
  {
    path: '/settings/micro-apps',
    name: 'SettingsMicroApps',
    component: () => import('@/pages/backend/microAppManagement/index.vue'),
    meta: { title: '微应用管理' },
  },
  {
    path: '/settings/backup-preferences',
    name: 'SettingsBackupPreferences',
    component: () => import('@/pages/backend/backupPreferences/index.vue'),
    meta: { title: '备份与偏好' },
  },
  {
    path: '/settings/ai-novel',
    name: 'SettingsAiNovel',
    component: () => import('@/pages/backend/aiNovel/index.vue'),
    meta: { title: 'AI 小说' },
  },
  {
    path: '/system/components/loading',
    redirect: '/settings/loading-effects',
  },
  {
    path: '/system/components/icon-selector',
    redirect: '/settings/icon-library',
  },
  {
    path: '/system/menus',
    redirect: '/settings/menu-management',
  },
  {
    path: '/system/micro-apps',
    redirect: '/settings/micro-apps',
  },
  {
    path: '/system/backup-preferences',
    redirect: '/settings/backup-preferences',
  },
  {
    // 未知设置项回退到默认设置页，兼容旧链接
    path: '/settings/:pathMatch(.*)*',
    redirect: to => ({ path: '/settings/general', query: to.query }),
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/pages/exception/index.vue'),
    meta: { title: '页面不存在' },
  },
]

const layoutRoute: RouteRecordRaw = {
  path: '/',
  redirect: '/dashboard',
  component: () => import('@/layouts/index.vue'),
  children: [
    {
      path: '/micro/:code/:pathMatch(.*)*',
      name: 'MicroAppHost',
      component: () => import('@/pages/frontend/microAppHost/index.vue'),
      meta: { title: '微应用' },
    },
  ],
}

const router = createRouter({
  history: window.location.protocol === 'file:'
    ? createWebHashHistory()
    : createWebHistory(),
  routes: [...staticRoutes, { ...layoutRoute, name: 'Layout' }],
})

export function updateDocumentTitle(menuTitle?: unknown) {
  const title = typeof menuTitle === 'string' ? menuTitle : ''
  document.title = useLayoutStore().config.dynamicTitle && title
    ? `${title} - ${APP_NAME}`
    : APP_NAME
}

function flattenMenus(menus: MenuItem[]): MenuItem[] {
  return menus.flatMap(menu => [menu, ...(menu.children ? flattenMenus(menu.children) : [])])
}

let removeBusinessRoutes: Array<() => void> = []

export function syncBusinessRoutes() {
  removeBusinessRoutes.forEach(removeRoute => removeRoute())
  removeBusinessRoutes = []
  flattenMenus(runtimeNavigation.mainMenus)
    .filter(menu => menu.type === 'menu' && menu.path && menu.target)
    .map(createBusinessRoute)
    .filter((route): route is RouteRecordRaw => route !== null)
    .forEach(route => removeBusinessRoutes.push(router.addRoute('Layout', route)))
}

syncBusinessRoutes()

router.addRoute({ path: '/:pathMatch(.*)*', redirect: '/404' })

export default router
