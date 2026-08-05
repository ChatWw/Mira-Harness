import type { Router } from 'vue-router'
import type { MenuItem, MicroApp } from '@/types'
import { resolveHttpUrl, resolveIframePolicy } from './iframe'
import { applications, findRuntimeMicroApp, microMenus, runtimeNavigation } from './runtime'

export interface ResolvedNavigation {
  area: 'main' | 'microapp'
  appCode: string
  app?: MicroApp
  menu?: MenuItem
  menus: MenuItem[]
  title: string
  icon?: string
  path: string
}

export function isMenuVisible(menu: MenuItem) {
  return menu.visible !== false && menu.status !== 0
}

export function getVisibleMenus(menus: MenuItem[]): MenuItem[] {
  return menus
    .filter(isMenuVisible)
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map(menu => menu.children
      ? { ...menu, children: getVisibleMenus(menu.children) }
      : menu
    )
    .filter(menu => menu.path || !menu.children || menu.children.length > 0)
}

function flattenMenus(menus: MenuItem[]): MenuItem[] {
  return menus.flatMap(menu => [menu, ...(menu.children ? flattenMenus(menu.children) : [])])
}

export function findMenuByPath(menus: MenuItem[], path: string): MenuItem | undefined {
  for (const menu of menus) {
    if (menu.path === path) return menu
    const child = menu.children && findMenuByPath(menu.children, path)
    if (child) return child
  }
}

export function findMenuPath(menus: MenuItem[], path: string): MenuItem[] | undefined {
  for (const menu of menus) {
    if (menu.path === path) return [menu]
    const childPath = menu.children && findMenuPath(menu.children, path)
    if (childPath) return [menu, ...childPath]
  }
}

export function getAppCodeFromPath(path: string) {
  return path.match(/^\/micro\/([^/]+)/)?.[1] || 'main'
}

export function getMenusForApp(appCode: string) {
  return appCode === 'main' ? runtimeNavigation.mainMenus : microMenus.value[appCode] || []
}

export function getVisibleMenusForPath(path: string) {
  return getVisibleMenus(getMenusForApp(getAppCodeFromPath(path)))
}

export function resolveNavigation(path: string): ResolvedNavigation {
  const appCode = getAppCodeFromPath(path)
  const menus = getMenusForApp(appCode)
  const menu = findMenuByPath(menus, path)

  if (appCode === 'main') {
    return {
      area: 'main',
      appCode,
      menu,
      menus,
      title: menu?.title || '通用',
      icon: menu?.icon || applications.value.find(app => app.code === 'main')?.icon,
      path,
    }
  }

  const app = findRuntimeMicroApp(appCode)
  return {
    area: 'microapp',
    appCode,
    app,
    menu,
    menus,
    title: menu?.title || app?.name || '微应用',
    icon: menu?.icon || app?.icon,
    path,
  }
}

export function getApplicationEntryPath(code: string) {
  const menus = code === 'main' ? runtimeNavigation.mainMenus : microMenus.value[code] || []
  return flattenMenus(getVisibleMenus(menus)).find(menu => menu.path)?.path
    || (code === 'main' ? '/dashboard' : `/micro/${code}`)
}

export function getMicroAppChildPath(app: MicroApp, platformPath: string) {
  const menu = findMenuByPath(app.menus || [], platformPath)
  if (menu?.target?.type === 'microapp') return menu.target.childPath

  const prefix = `/micro/${app.code}`
  return platformPath.startsWith(prefix) ? platformPath.slice(prefix.length) : ''
}

export function resolveMicroAppEntryUrl(app: MicroApp, platformPath: string) {
  const entryUrl = resolveHttpUrl(app.url)
  const childPath = getMicroAppChildPath(app, platformPath)
  return childPath ? resolveHttpUrl(childPath, entryUrl) : entryUrl
}

export function resolvePlatformPathForChild(app: MicroApp, childPath: string) {
  const menu = flattenMenus(app.menus || []).find(item =>
    item.target?.type === 'microapp' && item.target.childPath === childPath
  )
  if (menu?.path) return menu.path

  if (!childPath) return `/micro/${app.code}`
  if (childPath.startsWith('#') || childPath.startsWith('?')) return `/micro/${app.code}${childPath}`
  return `/micro/${app.code}/${childPath.replace(/^\/+/, '')}`
}

export function getExternalUrlForPath(path: string) {
  const navigation = resolveNavigation(path)
  if (navigation.menu?.target?.type === 'iframe') {
    const policy = resolveIframePolicy(navigation.menu.target.iframePolicy)
    return policy.profile === 'external' ? resolveHttpUrl(navigation.menu.target.url) : undefined
  }

  if (navigation.app?.integrationMode === 'iframe') {
    const policy = resolveIframePolicy(navigation.app.runtimeConfig.iframe)
    return policy.profile === 'external'
      ? resolveMicroAppEntryUrl(navigation.app, path)
      : undefined
  }
}

export async function navigateToPath(router: Router, path: string) {
  const externalUrl = getExternalUrlForPath(path)
  if (externalUrl) {
    window.open(externalUrl, '_blank', 'noopener,noreferrer')
    return 'external' as const
  }

  await router.push(path)
  return 'internal' as const
}
