import { BUILT_IN_PAGE_OPTIONS, RESERVED_MENU_PATHS } from './menus'
import type { MenuItem, MicroApp, PlatformSnapshot } from '@/types'

const BUILT_IN_PAGE_KEYS = new Set(BUILT_IN_PAGE_OPTIONS.map(option => option.value))

export function flattenMenus(items: MenuItem[]): MenuItem[] {
  return items.flatMap(item => [item, ...(item.children ? flattenMenus(item.children) : [])])
}

export function assertHttpUrl(value: string, field: string) {
  if (value.startsWith('/')) return
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`${field} 必须是有效 URL`) }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${field} 只允许 http、https 或应用内相对路径`)
}

export function validateMenus(menus: MenuItem[], appCode: string | null = null) {
  if (!Array.isArray(menus)) throw new Error('菜单配置格式无效')
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const menu of flattenMenus(menus)) {
    if (!menu.id?.trim() || ids.has(menu.id)) throw new Error('菜单 ID 必须填写且保持唯一')
    ids.add(menu.id)
    if (!menu.title?.trim()) throw new Error('菜单名称不能为空')
    if (menu.path) {
      if (!menu.path.startsWith('/') || paths.has(menu.path)) throw new Error('菜单路径必须唯一且以 / 开头')
      const reservedOwner = RESERVED_MENU_PATHS.get(menu.path)
      if (!appCode && reservedOwner && reservedOwner !== menu.id) throw new Error('不能使用平台保留路径')
      if (appCode && !menu.path.startsWith(`/micro/${appCode}`)) throw new Error('微应用菜单路径必须属于该应用')
      paths.add(menu.path)
    }
    if (menu.type === 'dir' && menu.target) throw new Error('目录菜单不能配置页面目标')
    if (menu.type !== 'dir' && (!menu.path || !menu.target)) throw new Error('页面菜单必须配置路径和页面目标')
    if (menu.target?.type === 'iframe') assertHttpUrl(menu.target.url, 'iframe 地址')
    if (menu.target?.type === 'component' && !BUILT_IN_PAGE_KEYS.has(menu.target.componentKey as typeof BUILT_IN_PAGE_OPTIONS[number]['value'])) {
      throw new Error('本地页面必须来自内置页面清单')
    }
    if (appCode && menu.target && menu.target.type !== 'microapp') throw new Error('微应用页面菜单必须使用微应用目标')
  }
}

export function validateMicroApps(apps: MicroApp[]) {
  if (!Array.isArray(apps)) throw new Error('微应用配置格式无效')
  const ids = new Set<string>()
  const codes = new Set<string>()
  for (const app of apps) {
    if (!app.id?.trim() || ids.has(app.id)) throw new Error('微应用 ID 必须填写且保持唯一')
    if (!app.name?.trim()) throw new Error('微应用名称不能为空')
    if (!/^[a-z0-9-]+$/.test(app.code) || codes.has(app.code)) throw new Error('应用编码只能包含小写字母、数字和连字符，并且不能重复')
    if (app.id !== `micro-${app.code}`) throw new Error('应用 ID 必须由 micro- 前缀和应用编码组成')
    ids.add(app.id)
    codes.add(app.code)
    if (app.integrationMode === 'wujie') {
      if (app.entry.type !== 'local-directory' || !app.entry.directory.trim()) throw new Error('微应用必须选择本地构建目录')
      if (app.runtimeConfig.kind !== 'wujie') throw new Error('微应用运行配置无效')
    } else {
      if (app.entry.type !== 'url') throw new Error('内嵌框架必须填写入口地址')
      assertHttpUrl(app.entry.url, '内嵌框架入口地址')
      if (app.runtimeConfig.kind !== 'iframe') throw new Error('内嵌框架运行配置无效')
    }
    validateMenus(app.menus || [], app.code)
  }
}

export function validateSnapshot(snapshot: PlatformSnapshot) {
  if (!snapshot || !Array.isArray(snapshot.mainMenus) || !Array.isArray(snapshot.microApps)) throw new Error('配置快照格式无效')
  validateMenus(snapshot.mainMenus)
  validateMicroApps(snapshot.microApps)
}
