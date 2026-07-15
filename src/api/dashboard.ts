import request from './request'

// 工作台相关接口
export const dashboardApi = {
  // 获取统计数据
  getStatistics() {
    return request.get('/dashboard/statistics')
  },
  // 获取趋势数据
  getTrends(params?: { period?: 'day' | 'week' | 'month' }) {
    return request.get('/dashboard/trends', { params })
  },
  // 获取最近操作日志
  getRecentLogs(params?: { limit?: number }) {
    return request.get('/dashboard/recent-logs', { params })
  },
  // 获取待办事项
  getTodos() {
    return request.get('/dashboard/todos')
  },
}
