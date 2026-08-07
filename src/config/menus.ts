import type { ApplicationOption, MenuItem } from '@/types'
import { microApps } from './microApps'

export const BUILT_IN_PAGE_OPTIONS = [
  { value: 'dashboard', label: '概览' },
  { value: 'system-menu-config', label: '菜单配置' },
  { value: 'system-micro-apps', label: '微应用管理' },
  { value: 'system-backup-preferences', label: '备份与偏好' },
  { value: 'system-loading-effect', label: 'Loading 效果' },
  { value: 'system-icon-selector', label: '图标' },
] as const

export const DASHBOARD_MENU: MenuItem = {
  id: 'dashboard',
  title: '概览',
  icon: 'Odometer',
  type: 'menu',
  path: '/dashboard',
  target: { type: 'component', componentKey: 'dashboard' },
  keepAlive: true,
  appCode: null,
  sort: 0,
  status: 1,
}

export const SYSTEM_MANAGEMENT_MENU: MenuItem = {
  id: 'system-management',
  title: '系统管理',
  icon: 'Setting',
  type: 'dir',
  appCode: null,
  sort: 999,
  status: 1,
  children: [
    {
      id: 'system-menu-config',
      title: '菜单配置',
      icon: 'Menu',
      type: 'menu',
      path: '/system/menus',
      target: { type: 'component', componentKey: 'system-menu-config' },
      keepAlive: true,
      appCode: null,
      sort: 0,
      status: 1,
    },
    {
      id: 'system-micro-apps',
      title: '微应用管理',
      icon: 'lucide:app-window-mac',
      type: 'menu',
      path: '/system/micro-apps',
      target: { type: 'component', componentKey: 'system-micro-apps' },
      keepAlive: true,
      appCode: null,
      sort: 1,
      status: 1,
    },
    {
      id: 'system-backup-preferences',
      title: '备份与偏好',
      icon: 'Files',
      type: 'menu',
      path: '/system/backup-preferences',
      target: { type: 'component', componentKey: 'system-backup-preferences' },
      keepAlive: true,
      appCode: null,
      sort: 2,
      status: 1,
    },
  ],
}

export const FUNCTIONAL_COMPONENTS_MENU: MenuItem = {
  id: 'functional-components',
  title: '功能组件',
  icon: 'Grid',
  type: 'dir',
  appCode: null,
  sort: 998,
  status: 1,
  children: [
    {
      id: 'system-loading-effect',
      title: 'Loading 效果',
      icon: 'Loading',
      type: 'menu',
      path: '/system/components/loading',
      target: { type: 'component', componentKey: 'system-loading-effect' },
      keepAlive: true,
      appCode: null,
      sort: 0,
      status: 1,
    },
    {
      id: 'system-icon-selector',
      title: '图标',
      icon: 'Pointer',
      type: 'menu',
      path: '/system/components/icon-selector',
      target: { type: 'component', componentKey: 'system-icon-selector' },
      keepAlive: true,
      appCode: null,
      sort: 1,
      status: 1,
    },
  ],
}

function flattenMenuItems(items: MenuItem[]): MenuItem[] {
  return items.flatMap(item => [item, ...(item.children ? flattenMenuItems(item.children) : [])])
}

export const PROTECTED_MAIN_MENU_IDS = [
  DASHBOARD_MENU.id,
  ...flattenMenuItems([FUNCTIONAL_COMPONENTS_MENU]).map(menu => menu.id),
  ...flattenMenuItems([SYSTEM_MANAGEMENT_MENU]).map(menu => menu.id),
]

export const RESERVED_MENU_PATHS = new Map<string, string>(
  [
    ['/', '__platform'],
    ['/404', '__platform'],
    ['/micro', '__platform'],
    ['/system/management', '__platform'],
    ...[DASHBOARD_MENU, ...flattenMenuItems(FUNCTIONAL_COMPONENTS_MENU.children || []), ...flattenMenuItems(SYSTEM_MANAGEMENT_MENU.children || [])]
      .filter((menu): menu is MenuItem & { path: string } => Boolean(menu.path))
      .map(menu => [menu.path, menu.id] as [string, string]),
  ],
)

export const mainMenus: MenuItem[] = [
  DASHBOARD_MENU,
  {
    id: 'links',
    title: '示例',
    icon: 'Link',
    type: 'dir',
    appCode: null,
    sort: 1,
    status: 1,
    visible: true,
    path: '/links',
    children: [
      {
        id: 'links_iframe',
        title: '内嵌',
        icon: 'Monitor',
        type: 'dir',
        appCode: null,
        sort: 0,
        status: 1,
        visible: true,
        path: '/links/iframe',
        children: [
          {
            id: 'links_iframe_antdv',
            title: 'AntD',
            icon: 'Link',
            type: 'menu',
            path: '/links/iframe/antdv',
            target: {
              type: 'iframe',
              url: 'https://www.antdv.com/components/overview',
              iframePolicy: {
                profile: 'compatible',
                referrerPolicy: 'strict-origin-when-cross-origin',
                timeout: 5,
              },
            },
            appCode: null,
            sort: 0,
            status: 1,
            visible: true,
          },
        ],
      },
      {
        id: 'links_window',
        title: '外链',
        icon: 'TopRight',
        type: 'dir',
        appCode: null,
        sort: 1,
        status: 1,
        visible: true,
        path: '/links/window',
        children: [
          {
            id: 'links_window_elementPlus',
            title: 'elementPlus',
            icon: 'ElementPlus',
            type: 'menu',
            path: '/links/window/elementPlus',
            target: {
              type: 'iframe',
              url: 'https://element-plus.org/zh-CN/',
              iframePolicy: {
                profile: 'external',
                referrerPolicy: 'strict-origin-when-cross-origin',
                timeout: 5,
              },
            },
            appCode: null,
            sort: 0,
            status: 1,
            visible: true,
          },
        ],
      },
    ],
  },
  FUNCTIONAL_COMPONENTS_MENU,
  SYSTEM_MANAGEMENT_MENU,
]

export const microMenus: Record<string, MenuItem[]> = Object.fromEntries(
  microApps.filter(app => app.menus?.length).map(app => [app.code, app.menus!]),
)

export const applications: ApplicationOption[] = [
  { code: 'main', name: '通用', icon: 'HomeFilled', type: 'main' },
  ...microApps
    .filter(app => app.enabled)
    .sort((a, b) => a.sort - b.sort)
    .map(app => ({ code: app.code, name: app.name, icon: app.icon, type: 'microapp' as const })),
]
