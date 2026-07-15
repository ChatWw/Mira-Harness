import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo, LoginPayload } from '@/types'
import { usePermissionStore } from './permission'
import { userApi } from '@/api/user'

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
    try {
      // 调用登录 API（将 account 映射为 username）
      const result = await userApi.login({
        username: payload.account,
        password: payload.password,
      })

      if (result.token && result.userInfo) {
        token.value = result.token
        userInfo.value = result.userInfo

        // 计算过期时间
        let expireTime: number
        if (payload.remember) {
          // 30 天免登录
          expireTime = Date.now() + 30 * 24 * 60 * 60 * 1000
        } else {
          // 不勾选则 7 天过期
          expireTime = Date.now() + 7 * 24 * 60 * 60 * 1000
        }

        localStorage.setItem(TOKEN_KEY, result.token)
        localStorage.setItem(USER_INFO_KEY, JSON.stringify(result.userInfo))
        localStorage.setItem(TOKEN_EXPIRE_KEY, expireTime.toString())

        // 加载用户权限
        const permissionStore = usePermissionStore()
        if (result.permissions) {
          permissionStore.setPermissions(result.permissions)
        }

        return { success: true }
      } else {
        return { success: false, message: '登录失败，请稍后重试' }
      }
    } catch (error: any) {
      console.error('登录失败:', error)
      return {
        success: false,
        message: error.message || '网络错误，请稍后重试'
      }
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
