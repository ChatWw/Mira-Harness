import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import type { MenuItem } from '@/types'
import { createBusinessRoute } from './pageRegistry'
import { menuApi } from '@/api/system'

// 静态路由（无需权限）
const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/LoginPage.vue'),
    meta: { requiresAuth: false, title: '登录' },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/pages/register/RegisterPage.vue'),
    meta: { requiresAuth: false, title: '注册' },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/pages/exception/NotFoundPage.vue'),
    meta: { requiresAuth: false, title: '页面不存在' },
  },
]

// 布局容器路由
const layoutRoute: RouteRecordRaw = {
  path: '/',
  redirect: '/dashboard',
  component: () => import('@/layouts/index.vue'),
  meta: { requiresAuth: true },
  children: [
    {
      path: '/micro/:code/:pathMatch(.*)*',
      name: 'MicroAppHost',
      component: () => import('@/pages/system/MicroAppHostPage.vue'),
      meta: { title: '微应用', permission: 'microapp:view' },
    },
  ],
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...staticRoutes,
    { ...layoutRoute, name: 'Layout' },
  ],
})

export function updateDocumentTitle(menuTitle?: unknown) {
  const title = typeof menuTitle === 'string' ? menuTitle : ''
  document.title = useLayoutStore().config.dynamicTitle && title
    ? `${title} - ${APP_NAME}`
    : APP_NAME
}

/**
 * 过滤菜单（根据权限）
 */
function filterMenus(menus: MenuItem[], permissions: string[]): MenuItem[] {
  return menus
    .filter((item) => {
      // 如果没有 permission 字段，默认可访问
      if (!item.permission) {
        return true
      }
      // 检查用户是否有该权限
      return permissions.includes('*') || permissions.includes(item.permission)
    })
    .map((item) => {
      // 递归过滤子菜单
      if (item.children && item.children.length > 0) {
        return {
          ...item,
          children: filterMenus(item.children, permissions),
        }
      }
      return item
    })
}

function flattenRouteMenus(menus: MenuItem[]): MenuItem[] {
  return menus.flatMap(menu => [menu, ...(menu.children ? flattenRouteMenus(menu.children) : [])])
}

/**
 * 添加动态路由
 */
export async function addDynamicRoutes() {
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()

  if (!permissionStore.permissions.length) {
    await userStore.loadSession()
  }
  const userPermissions = permissionStore.permissions
  // 本地主应用页面始终从公共菜单注册；微应用只使用统一容器路由，不能影响公共页可访问性。
  const mainMenus = await menuApi.getMyMenus({ app_code: 'main' })
  const mainRouteMenus = filterMenus(mainMenus, userPermissions)
  const currentMenus = permissionStore.currentAppCode === 'main'
    ? mainRouteMenus
    : filterMenus(await menuApi.getMyMenus({ app_code: permissionStore.currentAppCode }), userPermissions)

  flattenRouteMenus(mainRouteMenus)
    .filter(menu => menu.path && menu.component)
    .map(createBusinessRoute)
    .filter((route): route is RouteRecordRaw => route !== null)
    .forEach(route => {
      router.addRoute('Layout', route)
      dynamicRouteNames.add(String(route.name))
    })

  // 添加 404 通配符（必须在最后）
  router.addRoute({
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  })

  // 保存到 permission store
  permissionStore.setMenuRoutes(currentMenus)
  permissionStore.setRoutesAdded(true)
}

/**
 * 重置路由
 */
export function resetRouter() {
  dynamicRouteNames.forEach(name => router.removeRoute(name))
  dynamicRouteNames.clear()
  routesAddedInSession = false
}

// 标记动态路由是否已在当前会话中添加
let routesAddedInSession = false
const dynamicRouteNames = new Set<string>()

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()
  const requiresAuth = to.meta.requiresAuth !== false

  updateDocumentTitle(to.meta.title)

  if (requiresAuth) {
    if (!userStore.isLoggedIn) {
      // 未登录则重定向到登录页
      next({ path: '/login', query: { redirect: to.fullPath } })
      return
    }

    // 已登录但未在当前会话中添加动态路由
    // 注意：即使 permissionStore.isRoutesAdded 为 true（从持久化恢复），
    // 也需要在当前会话中重新添加路由，因为 Vue Router 实例是新创建的
    if (!routesAddedInSession) {
      try {
        await addDynamicRoutes()
        routesAddedInSession = true
        permissionStore.setRoutesAdded(true)
        // 重新导航到目标路由
        next({ ...to, replace: true })
      } catch (error) {
        console.error('添加动态路由失败:', error)
        // 添加路由失败，退出登录
        userStore.logout()
        permissionStore.reset()
        next({ path: '/login', query: { redirect: to.fullPath } })
      }
      return
    }

    // 权限验证
    if (to.meta.permission && !permissionStore.hasPermission(to.meta.permission as string)) {
      // 无权限，跳转到 404
      next('/404')
      return
    }
  } else {
    // 不需要认证的页面
    if ((to.path === '/login' || to.path === '/register') && userStore.isLoggedIn) {
      // 已登录则重定向到工作台
      next('/dashboard')
      return
    }
  }

  next()
})

// 路由后置守卫
router.afterEach((to) => {
  const permissionStore = usePermissionStore()
  const microAppCode = typeof to.params.code === 'string' && to.path.startsWith('/micro/') ? to.params.code : 'main'
  if (permissionStore.currentAppCode === microAppCode) return

  // 支持地址栏直达和浏览器前进/后退：路由变化同样会同步应用上下文与侧边栏菜单。
  permissionStore.setCurrentAppCode(microAppCode)
  menuApi.getMyMenus({ app_code: microAppCode })
    .then(menus => permissionStore.setMenuRoutes(menus))
    .catch(error => console.error('同步应用菜单失败:', error))
})

export default router
