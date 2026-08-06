import { applications, microMenus, runtimeNavigation } from '@/config/runtime'
import { getApplicationEntryPath, isMenuVisible } from '@/config/navigation'
import type { MenuItem } from '@/types'

export type CommandNavigationCategory = 'page' | 'application'

export interface CommandNavigationItem {
  id: string
  title: string
  icon?: string
  path: string
  category: CommandNavigationCategory
  parent?: string
}

function flattenMenus(items: MenuItem[], category: CommandNavigationCategory, parent?: string): CommandNavigationItem[] {
  return items.flatMap((item) => {
    if (!isMenuVisible(item)) return []

    const current = item.path
      ? [{ id: item.id, title: item.title, icon: item.icon, path: item.path, category, parent }]
      : []
    const children = item.children ? flattenMenus(item.children, category, item.title) : []
    return [...current, ...children]
  })
}

export function getCommandNavigationItems(): CommandNavigationItem[] {
  const pageItems = [
    ...flattenMenus(runtimeNavigation.mainMenus, 'page'),
    ...Object.entries(microMenus.value).flatMap(([appCode, menus]) =>
      flattenMenus(menus, 'page', applications.value.find(app => app.code === appCode)?.name)
    ),
  ]
  const applicationItems = applications.value
    .filter(app => app.type === 'microapp')
    .map<CommandNavigationItem>(app => ({
      id: `application-${app.code}`, title: app.name, icon: app.icon,
      path: getApplicationEntryPath(app.code), category: 'application', parent: '应用',
    }))
  return [...pageItems, ...applicationItems]
}

export function findCommandNavigation(id: string) {
  return getCommandNavigationItems().find(item => item.id === id)
}

export function findCommandNavigationByPath(path: string) {
  return getCommandNavigationItems().find(item => item.path === path)
}
