import type { RouteRecordRaw } from 'vue-router'

/**
 * 系统管理路由模块
 */
export const systemRoutes: RouteRecordRaw[] = [
  {
    path: '/system/users',
    name: 'SystemUsers',
    component: () => import('@/pages/system/UserPage.vue'),
    meta: {
      title: '用户管理',
      icon: 'User',
      permission: 'system:user:view',
    },
  },
  {
    path: '/system/roles',
    name: 'SystemRoles',
    component: () => import('@/pages/system/RolePage.vue'),
    meta: {
      title: '角色管理',
      icon: 'UserFilled',
      permission: 'system:role:view',
    },
  },
  {
    path: '/system/menus',
    name: 'SystemMenus',
    component: () => import('@/pages/system/MenuPage.vue'),
    meta: {
      title: '菜单管理',
      icon: 'Menu',
      permission: 'system:menu:view',
    },
  },
  {
    path: '/system/dept',
    name: 'SystemDept',
    component: () => import('@/pages/system/DeptPage.vue'),
    meta: {
      title: '部门管理',
      icon: 'OfficeBuilding',
      permission: 'system:dept:view',
    },
  },
  {
    path: '/system/log',
    name: 'SystemLog',
    component: () => import('@/pages/system/LogPage.vue'),
    meta: {
      title: '操作日志',
      icon: 'Document',
      permission: 'system:log:view',
    },
  },
  {
    path: '/system/settings',
    name: 'SystemSettings',
    component: () => import('@/pages/system/SettingsPage.vue'),
    meta: {
      title: '系统设置',
      icon: 'Tools',
      permission: 'system:settings:view',
    },
  },
]
