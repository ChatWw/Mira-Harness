import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { runtimeNavigation } from '@/config/runtime'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import type { MenuItem } from '@/types'
import { createBusinessRoute } from './pageRegistry'

const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/settings/:section?',
    name: 'Settings',
    component: () => import('@/pages/settings/SettingsPage.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/pages/exception/NotFoundPage.vue'),
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
      component: () => import('@/pages/system/MicroAppHostPage.vue'),
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
