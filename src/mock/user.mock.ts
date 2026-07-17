import type { MockMethod } from 'vite-plugin-mock'

// 生成 mock 用户数据
const generateUsers = (count: number) => {
  const users = []
  const roles = ['admin', 'user', 'editor', 'viewer']
  const depts = ['技术部', '产品部', '运营部', '市场部', '财务部']

  for (let i = 1; i <= count; i++) {
    users.push({
      id: String(i),
      username: `user${i}`,
      name: `用户${i}`,
      nickname: `昵称${i}`,
      email: `user${i}@example.com`,
      phone: `138${String(i).padStart(8, '0')}`,
      avatar: '',
      roles: [roles[i % roles.length]],
      deptId: String((i % depts.length) + 1),
      deptName: depts[i % depts.length],
      status: i % 10 === 0 ? 0 : 1, // 每 10 个有一个禁用
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    })
  }
  return users
}

const mockUsers = generateUsers(25)

export default [
  // 登录
  {
    url: '/api/auth/login',
    method: 'post',
    response: ({ body }: any) => {
      const { username, password } = body

      if (username === 'admin' && password === '12345678') {
        return {
          code: 200,
          data: {
            token: 'mock-token-' + Date.now(),
            userInfo: {
              id: '1',
              username: 'admin',
              name: '超级管理员',
              nickname: 'Admin',
              email: 'admin@example.com',
              phone: '13800138000',
              avatar: '',
              roles: ['admin'],
              deptId: '1',
              deptName: '技术部',
              status: 1,
            },
            permissions: ['*'], // 超级管理员拥有所有权限
          },
          message: '登录成功',
        }
      }

      return {
        code: 401,
        data: null,
        message: '用户名或密码错误',
      }
    },
  },

  // 获取用户信息
  {
    url: '/api/auth/info',
    method: 'get',
    response: () => {
      return {
        code: 200,
        data: {
          userInfo: {
            id: '1',
            username: 'admin',
            name: '超级管理员',
            nickname: 'Admin',
            email: 'admin@example.com',
            phone: '13800138000',
            avatar: '',
            roles: ['admin'],
            deptId: '1',
            deptName: '技术部',
            status: 1,
          },
          permissions: ['*'],
        },
        message: '获取成功',
      }
    },
  },

  // 退出登录
  {
    url: '/api/auth/logout',
    method: 'post',
    response: () => {
      return {
        code: 200,
        data: null,
        message: '退出成功',
      }
    },
  },

  // 获取用户列表
  {
    url: '/api/user/list',
    method: 'get',
    response: ({ query }: any) => {
      const { page = 1, pageSize = 10, username } = query

      let filteredUsers = mockUsers

      // 用户名模糊查询
      if (username) {
        filteredUsers = mockUsers.filter(u =>
          u.username.includes(username) || u.name.includes(username)
        )
      }

      const start = (Number(page) - 1) * Number(pageSize)
      const end = start + Number(pageSize)

      return {
        code: 200,
        data: {
          list: filteredUsers.slice(start, end),
          total: filteredUsers.length,
          page: Number(page),
          pageSize: Number(pageSize),
        },
        message: '获取成功',
      }
    },
  },

  // 新增用户
  {
    url: '/api/user',
    method: 'post',
    response: ({ body }: any) => {
      const newUser = {
        id: String(mockUsers.length + 1),
        ...body,
        createdAt: new Date().toISOString(),
      }
      mockUsers.push(newUser)

      return {
        code: 200,
        data: newUser,
        message: '新增成功',
      }
    },
  },

  // 更新用户
  {
    url: '/api/user/:id',
    method: 'put',
    response: ({ body, query }: any) => {
      const { id } = query
      const index = mockUsers.findIndex(u => u.id === id)

      if (index !== -1) {
        mockUsers[index] = { ...mockUsers[index], ...body }
        return {
          code: 200,
          data: mockUsers[index],
          message: '更新成功',
        }
      }

      return {
        code: 404,
        data: null,
        message: '用户不存在',
      }
    },
  },

  // 删除用户
  {
    url: '/api/user/:id',
    method: 'delete',
    response: ({ query }: any) => {
      const { id } = query
      const index = mockUsers.findIndex(u => u.id === id)

      if (index !== -1) {
        mockUsers.splice(index, 1)
        return {
          code: 200,
          data: null,
          message: '删除成功',
        }
      }

      return {
        code: 404,
        data: null,
        message: '用户不存在',
      }
    },
  },

  // 重置密码
  {
    url: '/api/user/:id/reset-password',
    method: 'put',
    response: ({ query }: any) => {
      const { id } = query
      const user = mockUsers.find(u => u.id === id)

      if (user) {
        return {
          code: 200,
          data: null,
          message: '密码已重置为 123456',
        }
      }

      return {
        code: 404,
        data: null,
        message: '用户不存在',
      }
    },
  },
] as MockMethod[]
