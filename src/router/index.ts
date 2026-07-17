import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import type { MenuItem } from '@/types'
import { createBusinessRoute } from './pageRegistry'

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

/**
 * 添加动态路由
 */
export async function addDynamicRoutes() {
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()

  const bootstrap = await userStore.loadBootstrap()
  const userPermissions = bootstrap.permissions
  const filteredMenus = filterMenus(bootstrap.menus, userPermissions)

  bootstrap.routes
    .filter(route => !route.permission || userPermissions.includes('*') || userPermissions.includes(route.permission))
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
  permissionStore.setMenuRoutes(filteredMenus)
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

  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - 中台基座`
  }

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
router.afterEach(() => {
  // 可以在这里添加页面加载完成后的逻辑
})

export default router
