import type { ApplicationOption, MenuItem } from '@/types'
import { microApps } from './microApps'

export const mainMenus: MenuItem[] = [
  { id: 'dashboard', title: '概览', icon: 'Odometer', type: 'menu', path: '/dashboard', component: '/src/pages/dashboard/DashboardPage.vue', appCode: null, sort: 0, status: 1 },
]

export const microMenus: Record<string, MenuItem[]> = Object.fromEntries(
  microApps.filter(app => app.menus?.length).map(app => [app.code, app.menus!]),
)

export const applications: ApplicationOption[] = [
  { code: 'main', name: '概览', icon: 'HomeFilled', type: 'main' },
  ...microApps
    .filter(app => app.status === 'published' && app.embedAllowed)
    .sort((a, b) => a.sort - b.sort)
    .map(app => ({ code: app.code, name: app.name, icon: app.icon, type: 'microapp' as const })),
]
