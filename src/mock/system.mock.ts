import type { MockMethod } from 'vite-plugin-mock'

// 生成 mock 角色数据
const mockRoles = [
  { id: '1', name: '超级管理员', code: 'admin', description: '拥有所有权限', status: 1, createdAt: '2024-01-01' },
  { id: '2', name: '管理员', code: 'manager', description: '管理系统用户和设置', status: 1, createdAt: '2024-01-02' },
  { id: '3', name: '编辑', code: 'editor', description: '可以编辑内容', status: 1, createdAt: '2024-01-03' },
  { id: '4', name: '普通用户', code: 'user', description: '基础用户权限', status: 1, createdAt: '2024-01-04' },
  { id: '5', name: '访客', code: 'viewer', description: '只读权限', status: 1, createdAt: '2024-01-05' },
]

// 生成 mock 部门数据
const mockDepts = [
  { id: '1', name: '技术部', parentId: null, leader: '张三', phone: '13800138001', status: 1 },
  { id: '2', name: '前端组', parentId: '1', leader: '李四', phone: '13800138002', status: 1 },
  { id: '3', name: '后端组', parentId: '1', leader: '王五', phone: '13800138003', status: 1 },
  { id: '4', name: '产品部', parentId: null, leader: '赵六', phone: '13800138004', status: 1 },
  { id: '5', name: '运营部', parentId: null, leader: '钱七', phone: '13800138005', status: 1 },
]

// 生成 mock 操作日志数据
const generateLogs = (count: number) => {
  const logs = []
  const actions = ['登录', '新增用户', '修改用户', '删除用户', '修改设置', '查看日志']
  const users = ['管理员', '张三', '李四', '王五']

  for (let i = 1; i <= count; i++) {
    logs.push({
      id: String(i),
      username: users[i % users.length],
      action: actions[i % actions.length],
      ip: `192.168.1.${(i % 254) + 1}`,
      result: i % 15 === 0 ? '失败' : '成功',
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    })
  }
  return logs
}

const mockLogs = generateLogs(50)

// 系统设置
const mockSettings = {
  siteName: '中台基座',
  siteUrl: 'https://example.com',
  logo: '',
  icp: '京ICP备12345678号',
  copyright: '© 2024 中台基座. All rights reserved.',
  enableRegister: true,
  enableEmailVerify: false,
}

export default [
  // 角色管理
  {
    url: '/api/role/list',
    method: 'get',
    response: ({ query }: any) => {
      const { page = 1, pageSize = 10 } = query
      const start = (Number(page) - 1) * Number(pageSize)
      const end = start + Number(pageSize)

      return {
        code: 200,
        data: {
          list: mockRoles.slice(start, end),
          total: mockRoles.length,
          page: Number(page),
          pageSize: Number(pageSize),
        },
        message: '获取成功',
      }
    },
  },

  {
    url: '/api/role',
    method: 'post',
    response: ({ body }: any) => {
      const newRole = { id: String(mockRoles.length + 1), ...body, createdAt: new Date().toISOString() }
      mockRoles.push(newRole)
      return { code: 200, data: newRole, message: '新增成功' }
    },
  },

  {
    url: '/api/role/:id',
    method: 'put',
    response: ({ body, query }: any) => {
      const { id } = query
      const index = mockRoles.findIndex(r => r.id === id)
      if (index !== -1) {
        mockRoles[index] = { ...mockRoles[index], ...body }
        return { code: 200, data: mockRoles[index], message: '更新成功' }
      }
      return { code: 404, data: null, message: '角色不存在' }
    },
  },

  {
    url: '/api/role/:id',
    method: 'delete',
    response: ({ query }: any) => {
      const { id } = query
      const index = mockRoles.findIndex(r => r.id === id)
      if (index !== -1) {
        mockRoles.splice(index, 1)
        return { code: 200, data: null, message: '删除成功' }
      }
      return { code: 404, data: null, message: '角色不存在' }
    },
  },

  // 菜单管理
  {
    url: '/api/menu/list',
    method: 'get',
    response: () => {
      return { code: 200, data: [], message: '获取成功' }
    },
  },

  {
    url: '/api/menu',
    method: 'post',
    response: () => {
      return { code: 200, data: null, message: '新增成功' }
    },
  },

  {
    url: '/api/menu/:id',
    method: 'put',
    response: () => {
      return { code: 200, data: null, message: '更新成功' }
    },
  },

  {
    url: '/api/menu/:id',
    method: 'delete',
    response: () => {
      return { code: 200, data: null, message: '删除成功' }
    },
  },

  // 部门管理
  {
    url: '/api/dept/list',
    method: 'get',
    response: () => {
      return { code: 200, data: mockDepts, message: '获取成功' }
    },
  },

  {
    url: '/api/dept',
    method: 'post',
    response: ({ body }: any) => {
      const newDept = { id: String(mockDepts.length + 1), ...body }
      mockDepts.push(newDept)
      return { code: 200, data: newDept, message: '新增成功' }
    },
  },

  {
    url: '/api/dept/:id',
    method: 'put',
    response: ({ body, query }: any) => {
      const { id } = query
      const index = mockDepts.findIndex(d => d.id === id)
      if (index !== -1) {
        mockDepts[index] = { ...mockDepts[index], ...body }
        return { code: 200, data: mockDepts[index], message: '更新成功' }
      }
      return { code: 404, data: null, message: '部门不存在' }
    },
  },

  {
    url: '/api/dept/:id',
    method: 'delete',
    response: ({ query }: any) => {
      const { id } = query
      const index = mockDepts.findIndex(d => d.id === id)
      if (index !== -1) {
        mockDepts.splice(index, 1)
        return { code: 200, data: null, message: '删除成功' }
      }
      return { code: 404, data: null, message: '部门不存在' }
    },
  },

  // 操作日志
  {
    url: '/api/log/list',
    method: 'get',
    response: ({ query }: any) => {
      const { page = 1, pageSize = 10 } = query
      const start = (Number(page) - 1) * Number(pageSize)
      const end = start + Number(pageSize)

      return {
        code: 200,
        data: {
          list: mockLogs.slice(start, end),
          total: mockLogs.length,
          page: Number(page),
          pageSize: Number(pageSize),
        },
        message: '获取成功',
      }
    },
  },

  {
    url: '/api/log/:id',
    method: 'delete',
    response: () => {
      return { code: 200, data: null, message: '删除成功' }
    },
  },

  {
    url: '/api/log/clear',
    method: 'delete',
    response: () => {
      return { code: 200, data: null, message: '清空成功' }
    },
  },

  // 系统设置
  {
    url: '/api/setting',
    method: 'get',
    response: () => {
      return { code: 200, data: mockSettings, message: '获取成功' }
    },
  },

  {
    url: '/api/setting',
    method: 'put',
    response: ({ body }: any) => {
      Object.assign(mockSettings, body)
      return { code: 200, data: mockSettings, message: '更新成功' }
    },
  },
] as MockMethod[]
