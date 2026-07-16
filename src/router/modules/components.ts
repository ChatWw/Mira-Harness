import type { RouteRecordRaw } from 'vue-router'

/**
 * 组件演示路由模块
 */
export const componentsRoutes: RouteRecordRaw[] = [
  {
    path: '/components/table',
    name: 'ComponentsTable',
    component: () => import('@/pages/components/ProTableDemo.vue'),
    meta: {
      title: 'ProTable',
      icon: 'Document',
      permission: 'components:table:view',
    },
  },
  {
    path: '/components/form',
    name: 'ComponentsForm',
    component: () => import('@/pages/components/ProFormDemo.vue'),
    meta: {
      title: 'ProForm',
      icon: 'Edit',
      permission: 'components:form:view',
    },
  },
  {
    path: '/components/detail',
    name: 'ComponentsDetail',
    component: () => import('@/pages/components/DetailLayoutDemo.vue'),
    meta: {
      title: 'DetailLayout',
      icon: 'Reading',
      permission: 'components:detail:view',
    },
  },
]
