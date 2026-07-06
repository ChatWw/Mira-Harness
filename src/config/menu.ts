import type { MenuItem } from '@/types'

export const MENU_LIST: MenuItem[] = [
  {
    id: 'dashboard',
    title: '工作台',
    icon: 'Odometer',
    path: '/dashboard',
  },
  {
    id: 'system',
    title: '系统管理',
    icon: 'Setting',
    children: [
      {
        id: 'system-users',
        title: '用户管理',
        icon: 'User',
        path: '/system/users',
      },
      {
        id: 'system-roles',
        title: '角色管理',
        icon: 'UserFilled',
        path: '/system/roles',
      },
      {
        id: 'system-menus',
        title: '菜单管理',
        icon: 'Menu',
        path: '/system/menus',
      },
    ],
  },
]
