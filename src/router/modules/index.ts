import type { RouteRecordRaw } from 'vue-router'
import { dashboardRoutes } from './dashboard'
import { systemRoutes } from './system'
import { profileRoutes } from './profile'
import { messageRoutes } from './message'
import { componentsRoutes } from './components'

/**
 * 所有动态路由模块
 * 按业务域组织，便于维护
 */
export const dynamicRoutes: RouteRecordRaw[] = [
  ...dashboardRoutes,
  ...systemRoutes,
  ...profileRoutes,
  ...messageRoutes,
  ...componentsRoutes,
]

/**
 * 路由模块映射表（用于按权限筛选）
 */
export const routeModules = {
  dashboard: dashboardRoutes,
  system: systemRoutes,
  profile: profileRoutes,
  message: messageRoutes,
  components: componentsRoutes,
}
