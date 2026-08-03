import type { ApplicationOption, MenuItem } from '@/types'

// 主应用菜单（appCode = 'main'）
export const mainMenus: MenuItem[] = [
  { id: 'dashboard', title: '概览', icon: 'Odometer', type: 'menu', path: '/dashboard', component: '/src/pages/dashboard/DashboardPage.vue', permission: 'dashboard:view', appCode: null, sort: 0, status: 1 },
  {
    id: 'system', title: '系统管理', icon: 'Setting', type: 'dir', permission: 'system:view', appCode: null, sort: 1, status: 1,
    children: [
      { id: 'system-users', title: '用户管理', icon: 'User', type: 'menu', path: '/system/users', component: '/src/pages/system/UserPage.vue', permission: 'system:user:view', appCode: null, sort: 0, status: 1 },
      { id: 'system-roles', title: '角色管理', icon: 'UserFilled', type: 'menu', path: '/system/roles', component: '/src/pages/system/RolePage.vue', permission: 'system:role:view', appCode: null, sort: 1, status: 1 },
      { id: 'system-menus', title: '菜单管理', icon: 'Menu', type: 'menu', path: '/system/menus', component: '/src/pages/system/MenuPage.vue', permission: 'system:menu:view', appCode: null, sort: 2, status: 1 },
      { id: 'system-microapps', title: '微应用管理', icon: 'Grid', type: 'menu', path: '/system/microapps', component: '/src/pages/system/MicroAppPage.vue', permission: 'system:microapp:view', appCode: null, sort: 3, status: 1 },
      { id: 'system-microapp-config', title: '微应用配置', icon: 'Setting', type: 'menu', path: '/system/microapps/:code/config', component: '/src/pages/system/MicroAppConfigPage.vue', permission: 'system:microapp:view', appCode: null, sort: 4, status: 1, visible: false },
      { id: 'system-dept', title: '部门管理', icon: 'OfficeBuilding', type: 'menu', path: '/system/dept', component: '/src/pages/system/DeptPage.vue', permission: 'system:dept:view', appCode: null, sort: 4, status: 1 },
      { id: 'system-log', title: '操作日志', icon: 'Document', type: 'menu', path: '/system/log', component: '/src/pages/system/LogPage.vue', permission: 'system:log:view', appCode: null, sort: 5, status: 1 },
      { id: 'system-settings', title: '系统设置', icon: 'Tools', type: 'menu', path: '/system/settings', component: '/src/pages/system/SettingsPage.vue', permission: 'system:settings:view', appCode: null, sort: 6, status: 1 },
    ],
  },
  {
    id: 'profile', title: '个人中心', icon: 'UserFilled', type: 'dir', permission: 'profile:view', appCode: null, sort: 2, status: 1,
    children: [
      { id: 'profile-info', title: '个人资料', icon: 'User', type: 'menu', path: '/profile/info', component: '/src/pages/profile/ProfileInfoPage.vue', permission: 'profile:info:view', appCode: null, sort: 0, status: 1 },
      { id: 'profile-security', title: '安全设置', icon: 'Lock', type: 'menu', path: '/profile/security', component: '/src/pages/profile/ProfileSecurityPage.vue', permission: 'profile:security:view', appCode: null, sort: 1, status: 1 },
    ],
  },
]

// 微应用菜单（按 appCode 索引）
export const microMenus: Record<string, MenuItem[]> = {
  'data-board': [
    { id: 'data-board-home', title: '数据总览', icon: 'DataAnalysis', type: 'microapp', path: '/micro/data-board', permission: 'data-board:view', appCode: 'data-board', sort: 0, status: 1 },
    { id: 'data-board-report', title: '趋势分析', icon: 'TrendCharts', type: 'microapp', path: '/micro/data-board/trends', permission: 'data-board:trend:view', appCode: 'data-board', sort: 1, status: 1 },
  ],
}

// 应用列表（用于顶栏应用切换器）
export const applications: ApplicationOption[] = [
  { code: 'main', name: '公共', icon: 'HomeFilled', type: 'main' },
  { code: 'data-board', name: '数据看板', icon: 'DataAnalysis', type: 'microapp' },
  { code: 'workflow', name: '流程审批', icon: 'Connection', type: 'microapp' },
]
