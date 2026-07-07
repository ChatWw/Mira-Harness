import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/LoginPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/pages/register/RegisterPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    redirect: '/dashboard',
    component: () => import('@/layouts/index.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/pages/dashboard/DashboardPage.vue'),
        meta: { title: '工作台' },
      },
      {
        path: '/system/users',
        name: 'SystemUsers',
        component: () => import('@/pages/system/UserPage.vue'),
        meta: { title: '用户管理' },
      },
      {
        path: '/system/roles',
        name: 'SystemRoles',
        component: () => import('@/pages/system/RolePage.vue'),
        meta: { title: '角色管理' },
      },
      {
        path: '/system/menus',
        name: 'SystemMenus',
        component: () => import('@/pages/system/MenuPage.vue'),
        meta: { title: '菜单管理' },
      },
      {
        path: '/test/theme',
        name: 'ThemeTest',
        component: () => import('@/pages/test/ThemeTestPage.vue'),
        meta: { title: '主题测试' },
      },
    ],
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/pages/exception/NotFoundPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  const requiresAuth = to.meta.requiresAuth !== false

  if (requiresAuth && !userStore.isLoggedIn) {
    // 未登录则重定向到登录页
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else if ((to.path === '/login' || to.path === '/register') && userStore.isLoggedIn) {
    // 已登录则重定向到工作台
    next('/dashboard')
  } else {
    next()
  }
})

export default router
