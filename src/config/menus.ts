import type { ApplicationOption, MenuItem } from '@/types'
import { microApps } from './microApps'

export const BUILT_IN_PAGE_OPTIONS = [
  { value: 'aiNovel', label: 'AI 小说创作' },
] as const

export const AI_NOVEL_MENU: MenuItem = {
  id: 'ai-novel',
  title: 'AI 小说创作',
  icon: 'lucide:book-open',
  type: 'menu',
  path: '/novel',
  target: { type: 'component', componentKey: 'aiNovel' },
  keepAlive: true,
  appCode: null,
  sort: 1,
  status: 1,
  visible: true,
  description: '在 Mira 中完成设定、大纲、章节与正文创作',
  showPageHeader: false,
}

export const PROTECTED_MAIN_MENU_IDS = [AI_NOVEL_MENU.id]

export const RESERVED_MENU_PATHS = new Map<string, string>(
  [
    ['/', '__platform'],
    ['/404', '__platform'],
    ['/micro', '__platform'],
    ['/system/management', '__platform'],
    ['/system/menus', '__platform'],
    ['/system/micro-apps', '__platform'],
    ['/system/backup-preferences', '__platform'],
    ...[AI_NOVEL_MENU]
      .filter((menu): menu is MenuItem & { path: string } => Boolean(menu.path))
      .map(menu => [menu.path, menu.id] as [string, string]),
  ],
)

// 设置页由静态路由承载，不能被可配置菜单覆盖。
export const RESERVED_MENU_PATH_PREFIXES = ['/settings', '/workspace']

export const mainMenus: MenuItem[] = [
  AI_NOVEL_MENU,
  {
    id: 'links',
    title: '示例',
    icon: 'Link',
    type: 'dir',
    appCode: null,
    sort: 2,
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
