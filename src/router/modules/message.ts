import type { RouteRecordRaw } from 'vue-router'

/**
 * 消息中心路由模块
 */
export const messageRoutes: RouteRecordRaw[] = [
  {
    path: '/message/list',
    name: 'MessageList',
    component: () => import('@/pages/message/MessageListPage.vue'),
    meta: {
      title: '站内消息',
      icon: 'Message',
      permission: 'message:list:view',
    },
  },
  {
    path: '/message/settings',
    name: 'MessageSettings',
    component: () => import('@/pages/message/MessageSettingsPage.vue'),
    meta: {
      title: '通知设置',
      icon: 'Bell',
      permission: 'message:settings:view',
    },
  },
]
