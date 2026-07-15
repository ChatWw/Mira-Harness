import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo, LoginPayload } from '@/types'
import { usePermissionStore } from './permission'

const TOKEN_KEY = 'core-platform-token'
const USER_INFO_KEY = 'core-platform-user'
const TOKEN_EXPIRE_KEY = 'core-platform-token-expire'

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')

  const getUserInfoFromStorage = (): UserInfo | null => {
    const stored = localStorage.getItem(USER_INFO_KEY)
    return stored ? JSON.parse(stored) : null
  }

  const userInfo = ref<UserInfo | null>(getUserInfoFromStorage())

  // 检查 token 是否过期
  const isTokenExpired = (): boolean => {
    const expireTime = localStorage.getItem(TOKEN_EXPIRE_KEY)
    if (!expireTime) return true
    return Date.now() > Number(expireTime)
  }

  // 检查是否登录且 token 未过期
  const isLoggedIn = computed(() => {
    if (!token.value) return false
    if (isTokenExpired()) {
      // Token 已过期，清除登录状态
      logout()
      return false
    }
    return true
  })

  async function login(payload: LoginPayload) {
    // Demo 登录逻辑
    if (payload.account === 'admin' && payload.password === '12345678') {
      const mockToken = 'demo-token-' + Date.now()
      const mockUser: UserInfo = {
        id: '1',
        name: '超级管理员',
        email: 'admin@example.com',
        avatar: '',
      }

      token.value = mockToken
      userInfo.value = mockUser

      // 计算过期时间
      let expireTime: number
      if (payload.remember) {
        // 30 天免登录：30 * 24 * 60 * 60 * 1000 = 2592000000 毫秒
        expireTime = Date.now() + 30 * 24 * 60 * 60 * 1000
      } else {
        // 不勾选则 7 天过期
        expireTime = Date.now() + 7 * 24 * 60 * 60 * 1000
      }

      localStorage.setItem(TOKEN_KEY, mockToken)
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(mockUser))
      localStorage.setItem(TOKEN_EXPIRE_KEY, expireTime.toString())

      return { success: true }
    } else {
      return { success: false, message: '账号或密码错误' }
    }
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_INFO_KEY)
    localStorage.removeItem(TOKEN_EXPIRE_KEY)

    // 重置权限状态
    const permissionStore = usePermissionStore()
    permissionStore.reset()
  }

  // 刷新 token 过期时间（用户活动时调用）
  function refreshTokenExpire() {
    const expireTime = localStorage.getItem(TOKEN_EXPIRE_KEY)
    if (expireTime && token.value) {
      // 只在 token 还有效时才刷新
      if (!isTokenExpired()) {
        // 延长到当前时间 + 30 天
        const newExpireTime = Date.now() + 30 * 24 * 60 * 60 * 1000
        localStorage.setItem(TOKEN_EXPIRE_KEY, newExpireTime.toString())
      }
    }
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    isTokenExpired,
    login,
    logout,
    refreshTokenExpire,
  }
})
