import { applications, microMenus, runtimeNavigation } from '@/config/runtime'
import { getApplicationEntryPath, isMenuVisible } from '@/config/navigation'
import { useHarnessStore } from '@/stores/harness'
import type { MenuItem } from '@/types'

export type CommandNavigationCategory = 'page' | 'application' | 'session'

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
  let sessionItems: CommandNavigationItem[] = []
  try {
    sessionItems = useHarnessStore().sessions.map(session => ({ id: `session-${session.id}`, title: session.title, icon: 'ChatDotRound', path: `/workspace/chat/${session.id}`, category: 'session' as const, parent: session.projectName || '最近对话' }))
  } catch { /* command palette can be queried before Pinia is mounted */ }
  return [...pageItems, ...applicationItems, ...sessionItems]
}

export function findCommandNavigation(id: string) {
  return getCommandNavigationItems().find(item => item.id === id)
}

export function findCommandNavigationByPath(path: string) {
  return getCommandNavigationItems().find(item => item.path === path)
}
