import type { RouteRecordRaw } from 'vue-router'

/**
 * 个人中心路由模块
 */
export const profileRoutes: RouteRecordRaw[] = [
  {
    path: '/profile/info',
    name: 'ProfileInfo',
    component: () => import('@/pages/profile/ProfileInfoPage.vue'),
    meta: {
      title: '个人资料',
      icon: 'User',
      permission: 'profile:info:view',
    },
  },
  {
    path: '/profile/security',
    name: 'ProfileSecurity',
    component: () => import('@/pages/profile/ProfileSecurityPage.vue'),
    meta: {
      title: '安全设置',
      icon: 'Lock',
      permission: 'profile:security:view',
    },
  },
]
