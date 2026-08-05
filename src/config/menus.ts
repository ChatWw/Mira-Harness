import type { ApplicationOption, MenuItem } from '@/types'
import { microApps } from './microApps'

export const mainMenus: MenuItem[] = [
  { id: 'dashboard', title: '概览', icon: 'Odometer', type: 'menu', path: '/dashboard', target: { type: 'component', component: '/src/pages/dashboard/DashboardPage.vue' }, appCode: null, sort: 0, status: 1 },
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
