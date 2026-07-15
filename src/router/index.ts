import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import { MENU_LIST } from '@/config/menu'
import type { MenuItem } from '@/types'

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
  children: [],
}

const router = createRouter({
  history: createWebHistory(),
  routes: [...staticRoutes],
})

/**
 * 根据菜单数据生成路由
 */
function generateRoutes(menus: MenuItem[]): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = []

  function traverse(items: MenuItem[]) {
    items.forEach((item) => {
      // 如果有 path 和 component，生成路由
      if (item.path && item.component) {
        const route: RouteRecordRaw = {
          path: item.path,
          name: item.name || item.id,
          component: () => import(`../pages${item.component}`),
          meta: {
            title: item.title,
            icon: item.icon,
            permission: item.permission,
          },
        }
        routes.push(route)
      }

      // 递归处理子菜单
      if (item.children && item.children.length > 0) {
        traverse(item.children)
      }
    })
  }

  traverse(menus)
  return routes
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
      return permissions.includes(item.permission)
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

  // 获取用户权限
  const permissions = userStore.userInfo?.roles || []

  // 在实际项目中，这里应该从后端获取用户权限标识
  // 这里为了演示，我们给所有登录用户赋予所有权限
  const userPermissions = permissions.includes('admin')
    ? MENU_LIST.flatMap((menu) => getAllPermissions(menu))
    : getAllPermissions(MENU_LIST[0]) // 非管理员只给工作台权限

  // 过滤菜单
  const filteredMenus = filterMenus(MENU_LIST, userPermissions)

  // 生成路由
  const dynamicRoutes = generateRoutes(filteredMenus)

  // 添加路由到 layout 下
  dynamicRoutes.forEach((route) => {
    router.addRoute('Layout', route)
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
 * 递归获取所有权限标识
 */
function getAllPermissions(menu: MenuItem): string[] {
  const permissions: string[] = []

  if (menu.permission) {
    permissions.push(menu.permission)
  }

  if (menu.children && menu.children.length > 0) {
    menu.children.forEach((child) => {
      permissions.push(...getAllPermissions(child))
    })
  }

  return permissions
}

/**
 * 重置路由
 */
export function resetRouter() {
  // 移除所有动态路由
  const routes = router.getRoutes()
  routes.forEach((route) => {
    if (route.name && route.name !== 'Login' && route.name !== 'Register' && route.name !== 'NotFound') {
      router.removeRoute(route.name)
    }
  })
}

// 路由守卫
let isRouteAdded = false

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
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

    // 已登录但未添加动态路由
    if (!isRouteAdded) {
      try {
        await addDynamicRoutes()
        isRouteAdded = true
        // 重新导航到目标路由
        next({ ...to, replace: true })
      } catch (error) {
        console.error('添加动态路由失败:', error)
        // 添加路由失败，退出登录
        userStore.logout()
        next({ path: '/login', query: { redirect: to.fullPath } })
      }
      return
    }

    // 权限验证
    const permissionStore = usePermissionStore()
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

// 添加 Layout 路由名称
router.addRoute({ ...layoutRoute, name: 'Layout' })

export default router
