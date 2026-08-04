import { applications, mainMenus, microMenus } from '@/config/menus'
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
    if (item.visible === false) return []

    const current = item.path
      ? [{ id: item.id, title: item.title, icon: item.icon, path: item.path, category, parent }]
      : []
    const children = item.children ? flattenMenus(item.children, category, item.title) : []
    return [...current, ...children]
  })
}

const pageItems = [
  ...flattenMenus(mainMenus, 'page'),
  ...Object.entries(microMenus).flatMap(([appCode, menus]) =>
    flattenMenus(menus, 'page', applications.find(app => app.code === appCode)?.name)
  ),
]

const applicationItems = applications
  .filter(app => app.type === 'microapp')
  .map<CommandNavigationItem>(app => ({
    id: `application-${app.code}`,
    title: app.name,
    icon: app.icon,
    path: `/micro/${app.code}`,
    category: 'application',
    parent: '应用',
  }))

export const commandNavigationItems = [...pageItems, ...applicationItems]

export function findCommandNavigation(id: string) {
  return commandNavigationItems.find(item => item.id === id)
}

export function findCommandNavigationByPath(path: string) {
  return commandNavigationItems.find(item => item.path === path)
}

export const commonCommandIds = [
  'data-board-home',
  'application-data-board',
  'application-workflow',
]
