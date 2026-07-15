import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
})

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('core-platform-token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    const { code, data, message } = response.data

    if (code === 200) {
      return data
    } else if (code === 401) {
      // 未授权，清除 token 并跳转登录
      localStorage.removeItem('core-platform-token')
      localStorage.removeItem('core-platform-user')
      localStorage.removeItem('core-platform-token-expire')
      ElMessage.error(message || '登录已过期，请重新登录')
      router.push('/login')
      return Promise.reject(new Error(message || '未授权'))
    } else {
      ElMessage.error(message || '请求失败')
      return Promise.reject(new Error(message || '请求失败'))
    }
  },
  (error: AxiosError) => {
    // 处理 CanceledError
    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }

    // 网络错误
    if (!error.response) {
      ElMessage.error('网络连接失败，请检查网络')
    } else {
      const message = (error.response.data as any)?.message || error.message
      ElMessage.error(message || '请求失败')
    }

    return Promise.reject(error)
  }
)

export default request
