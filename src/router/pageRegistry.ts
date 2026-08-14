import { defineAsyncComponent, defineComponent, h } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import type { MenuItem } from '@/types'

type PageLoader = () => Promise<{ default: Component }>

// 本地菜单只能从随安装包发布的页面白名单中选择，配置不会加载任意文件。
const pageModules: Record<string, PageLoader> = {
  aiNovel: () => import('@/pages/frontend/aiNovel/index.vue'),
}

export function getMenuRouteName(menu: MenuItem) {
  return menu.name || `Menu_${menu.id}`
}

export function getMenuRouteCacheName(menu: MenuItem) {
  return `MenuCache_${menu.id}`
}

function createMenuComponent(menu: MenuItem, loader: PageLoader) {
  const Page = defineAsyncComponent(loader)
  return defineComponent({
    name: getMenuRouteCacheName(menu),
    setup: () => () => h(Page),
  })
}

function createRouteMeta(menu: MenuItem) {
  return {
    title: menu.title,
    icon: menu.icon,
    menuId: menu.id,
    pageTitle: menu.title,
    pageDescription: menu.description,
    showPageHeader: menu.showPageHeader,
    keepAlive: menu.keepAlive === true,
    cacheName: getMenuRouteCacheName(menu),
  }
}

export function createBusinessRoute(menu: MenuItem): RouteRecordRaw | null {
  if (!menu.path || !menu.target) return null

  if (menu.target.type === 'iframe') {
    return {
      path: menu.path,
      name: getMenuRouteName(menu),
      component: createMenuComponent(menu, () => import('@/pages/frontend/embeddedWeb/index.vue')),
      meta: createRouteMeta(menu),
    }
  }

  if (menu.target.type !== 'component') return null
  const component = pageModules[menu.target.componentKey]
  if (!component) {
    console.warn(`菜单组件不在允许白名单中: ${menu.target.componentKey}`)
    return null
  }
  return {
    path: menu.path,
    name: getMenuRouteName(menu),
    component: createMenuComponent(menu, component),
    meta: createRouteMeta(menu),
  }
}
