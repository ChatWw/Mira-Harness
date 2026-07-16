import type { RouteRecordRaw } from 'vue-router'

/**
 * 工作台路由模块
 */
export const dashboardRoutes: RouteRecordRaw[] = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/pages/dashboard/DashboardPage.vue'),
    meta: {
      title: '工作台',
      icon: 'Odometer',
      permission: 'dashboard:view',
    },
  },
]
