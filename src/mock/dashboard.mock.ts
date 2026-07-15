import type { MockMethod } from 'vite-plugin-mock'

export default [
  // 获取统计数据
  {
    url: '/api/dashboard/statistics',
    method: 'get',
    response: () => {
      return {
        code: 200,
        data: {
          userCount: 1245,
          orderCount: 3678,
          revenueToday: 125680,
          visitCount: 8926,
          userGrowth: 12.5,
          orderGrowth: -3.2,
          revenueGrowth: 8.7,
          visitGrowth: 15.3,
        },
        message: '获取成功',
      }
    },
  },

  // 获取趋势数据
  {
    url: '/api/dashboard/trends',
    method: 'get',
    response: ({ query }: any) => {
      const { period = 'week' } = query

      const generateTrends = (days: number) => {
        const trends = []
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          trends.push({
            date: date.toISOString().split('T')[0],
            users: Math.floor(Math.random() * 500) + 200,
            orders: Math.floor(Math.random() * 300) + 100,
            revenue: Math.floor(Math.random() * 50000) + 20000,
            visits: Math.floor(Math.random() * 1000) + 500,
          })
        }
        return trends
      }

      const days = period === 'day' ? 1 : period === 'week' ? 7 : 30

      return {
        code: 200,
        data: generateTrends(days),
        message: '获取成功',
      }
    },
  },

  // 获取最近操作日志
  {
    url: '/api/dashboard/recent-logs',
    method: 'get',
    response: ({ query }: any) => {
      const { limit = 10 } = query

      const logs = []
      const actions = ['登录系统', '新增用户', '修改配置', '删除数据', '导出报表']
      const users = ['管理员', '张三', '李四', '王五', '赵六']

      for (let i = 0; i < Number(limit); i++) {
        logs.push({
          id: String(i + 1),
          username: users[i % users.length],
          action: actions[i % actions.length],
          time: new Date(Date.now() - i * 600000).toISOString(),
        })
      }

      return {
        code: 200,
        data: logs,
        message: '获取成功',
      }
    },
  },

  // 获取待办事项
  {
    url: '/api/dashboard/todos',
    method: 'get',
    response: () => {
      return {
        code: 200,
        data: [
          { id: '1', title: '审批用户申请', priority: 'high', deadline: '2024-12-30' },
          { id: '2', title: '更新系统配置', priority: 'medium', deadline: '2024-12-31' },
          { id: '3', title: '备份数据库', priority: 'high', deadline: '2024-12-29' },
          { id: '4', title: '检查系统日志', priority: 'low', deadline: '2025-01-02' },
        ],
        message: '获取成功',
      }
    },
  },
] as MockMethod[]
