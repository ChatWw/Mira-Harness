import type { ApplicationOption, MenuItem } from '@/types'
import { microApps } from './microApps'

export const BUILT_IN_PAGE_OPTIONS = [
  { value: 'dashboard', label: '概览' },
  { value: 'system-menu-config', label: '菜单配置' },
  { value: 'system-micro-apps', label: '微应用管理' },
  { value: 'system-backup-preferences', label: '备份与偏好' },
] as const

export const DASHBOARD_MENU: MenuItem = {
  id: 'dashboard',
  title: '概览',
  icon: 'Odometer',
  type: 'menu',
  path: '/dashboard',
  target: { type: 'component', componentKey: 'dashboard' },
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
  sort: 99,
  status: 1,
  children: [
    {
      id: 'system-menu-config',
      title: '菜单配置',
      icon: 'Menu',
      type: 'menu',
      path: '/system/menus',
      target: { type: 'component', componentKey: 'system-menu-config' },
      appCode: null,
      sort: 0,
      status: 1,
    },
    {
      id: 'system-micro-apps',
      title: '微应用管理',
      icon: 'Grid',
      type: 'menu',
      path: '/system/micro-apps',
      target: { type: 'component', componentKey: 'system-micro-apps' },
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
      appCode: null,
      sort: 2,
      status: 1,
    },
  ],
}

export const PROTECTED_MAIN_MENU_IDS = [
  DASHBOARD_MENU.id,
  SYSTEM_MANAGEMENT_MENU.id,
  ...(SYSTEM_MANAGEMENT_MENU.children || []).map(menu => menu.id),
]

export const RESERVED_MENU_PATHS = new Map<string, string>(
  [
    ['/', '__platform'],
    ['/404', '__platform'],
    ['/micro', '__platform'],
    ['/system/management', '__platform'],
    ...[DASHBOARD_MENU, ...(SYSTEM_MANAGEMENT_MENU.children || [])]
      .filter((menu): menu is MenuItem & { path: string } => Boolean(menu.path))
      .map(menu => [menu.path, menu.id] as [string, string]),
  ],
)

export const mainMenus: MenuItem[] = [
  DASHBOARD_MENU,
  {
    id: 'external-links',
    title: '外链',
    icon: 'Link',
    type: 'dir',
    appCode: null,
    sort: 1,
    status: 1,
    children: [
      {
        id: 'external-links-iframe',
        title: 'Iframe',
        icon: 'Monitor',
        type: 'dir',
        appCode: null,
        sort: 0,
        status: 1,
        children: [
          {
            id: 'external-link-antdv',
            title: 'AntDV',
            icon: 'Link',
            type: 'menu',
            path: '/links/antdv',
            target: {
              type: 'iframe',
              url: 'https://www.antdv.com/components/overview',
              iframePolicy: { profile: 'compatible' },
            },
            appCode: null,
            sort: 0,
            status: 1,
          },
        ],
      },
      {
        id: 'external-links-window',
        title: '窗口',
        icon: 'TopRight',
        type: 'dir',
        appCode: null,
        sort: 1,
        status: 1,
        children: [
          {
            id: 'external-link-element-plus',
            title: 'ElementPlus',
            icon: 'ElementPlus',
            type: 'menu',
            path: '/links/element-plus',
            target: {
              type: 'iframe',
              url: 'https://element-plus.org/zh-CN/',
              iframePolicy: { profile: 'external' },
            },
            appCode: null,
            sort: 0,
            status: 1,
          },
        ],
      },
    ],
  },
  SYSTEM_MANAGEMENT_MENU,
]

export const microMenus: Record<string, MenuItem[]> = Object.fromEntries(
  microApps.filter(app => app.menus?.length).map(app => [app.code, app.menus!]),
)

export const applications: ApplicationOption[] = [
  { code: 'main', name: '通用', icon: 'HomeFilled', type: 'main' },
  ...microApps
    .filter(app => app.status === 'published' && app.embedAllowed)
    .sort((a, b) => a.sort - b.sort)
    .map(app => ({ code: app.code, name: app.name, icon: app.icon, type: 'microapp' as const })),
]
