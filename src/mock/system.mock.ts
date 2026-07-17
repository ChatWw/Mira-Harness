import type { MockMethod } from 'vite-plugin-mock'

const mainMenus = [
  { id: 'dashboard', title: '工作台', icon: 'Odometer', path: '/dashboard', name: 'Dashboard', pageKey: 'dashboard', permission: 'dashboard:view', type: 'menu', appCode: null, sort: 0, status: 1 },
  { id: 'system', title: '系统管理', icon: 'Setting', permission: 'system:view', type: 'dir', appCode: null, sort: 1, status: 1, children: [
    { id: 'system-users', title: '用户管理', icon: 'User', path: '/system/users', name: 'SystemUsers', pageKey: 'system-users', permission: 'system:user:view', type: 'menu', appCode: null, sort: 0, status: 1 },
    { id: 'system-roles', title: '角色管理', icon: 'UserFilled', path: '/system/roles', name: 'SystemRoles', pageKey: 'system-roles', permission: 'system:role:view', type: 'menu', appCode: null, sort: 1, status: 1 },
    { id: 'system-menus', title: '菜单管理', icon: 'Menu', path: '/system/menus', name: 'SystemMenus', pageKey: 'system-menus', permission: 'system:menu:view', type: 'menu', appCode: null, sort: 2, status: 1 },
    { id: 'system-microapps', title: '微应用管理', icon: 'Grid', path: '/system/microapps', name: 'SystemMicroApps', pageKey: 'system-microapps', permission: 'system:microapp:view', type: 'menu', appCode: null, sort: 3, status: 1 },
    { id: 'system-dept', title: '部门管理', icon: 'OfficeBuilding', path: '/system/dept', name: 'SystemDept', pageKey: 'system-dept', permission: 'system:dept:view', type: 'menu', appCode: null, sort: 4, status: 1 },
    { id: 'system-log', title: '操作日志', icon: 'Document', path: '/system/log', name: 'SystemLog', pageKey: 'system-log', permission: 'system:log:view', type: 'menu', appCode: null, sort: 5, status: 1 },
    { id: 'system-settings', title: '系统设置', icon: 'Tools', path: '/system/settings', name: 'SystemSettings', pageKey: 'system-settings', permission: 'system:settings:view', type: 'menu', appCode: null, sort: 6, status: 1 },
  ] },
  { id: 'profile', title: '个人中心', icon: 'UserFilled', permission: 'profile:view', type: 'dir', appCode: null, sort: 2, status: 1, children: [
    { id: 'profile-info', title: '个人资料', icon: 'User', path: '/profile/info', name: 'ProfileInfo', pageKey: 'profile-info', permission: 'profile:info:view', type: 'menu', appCode: null, sort: 0, status: 1 },
    { id: 'profile-security', title: '安全设置', icon: 'Lock', path: '/profile/security', name: 'ProfileSecurity', pageKey: 'profile-security', permission: 'profile:security:view', type: 'menu', appCode: null, sort: 1, status: 1 },
  ] },
]

const microApps = [
  { id: 'micro-1', name: '数据看板', code: 'data-board', url: '/micro/board', icon: 'DataAnalysis', sort: 0, status: 'published', version: 'v1.2.0', description: '业务数据可视化看板', runtimeConfig: { alive: true, sync: true, fiber: false, degrade: false, prefix: {}, props: { theme: 'light' }, preload: false, exec: false } },
  { id: 'micro-2', name: '流程审批', code: 'workflow', url: '/micro/wf', icon: 'Connection', sort: 1, status: 'published', version: 'v2.0.1', description: '流程审批子应用', runtimeConfig: { alive: false, sync: true, fiber: false, degrade: false, prefix: {}, props: {}, preload: false, exec: false } },
  { id: 'micro-3', name: '报表中心', code: 'report-ctr', url: 'https://report.example.com', icon: 'Document', sort: 2, status: 'developing', version: 'v0.9.0', description: '报表分析子应用', runtimeConfig: { alive: true, sync: false, fiber: false, degrade: true, prefix: {}, props: {}, preload: false, exec: false } },
]

const microMenus: Record<string, any[]> = {
  'data-board': [
    { id: 'data-board-home', title: '数据总览', icon: 'DataAnalysis', path: '/micro/data-board', permission: 'data-board:view', type: 'microapp', appCode: 'data-board', sort: 0, status: 1 },
    { id: 'data-board-report', title: '趋势分析', icon: 'TrendCharts', path: '/micro/data-board/trends', permission: 'data-board:trend:view', type: 'microapp', appCode: 'data-board', sort: 1, status: 1 },
  ],
}

let menuSequence = 100

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }

function findMenu(items: any[], id: string): any | undefined {
  for (const item of items) {
    if (item.id === id) return item
    const nested = item.children && findMenu(item.children, id)
    if (nested) return nested
  }
}

function removeMenu(items: any[], id: string): boolean {
  const index = items.findIndex(item => item.id === id)
  if (index >= 0) { items.splice(index, 1); return true }
  return items.some(item => item.children && removeMenu(item.children, id))
}

function bootstrapMenus() {
  const menus: any[] = clone(mainMenus)
  const children = microApps
    .filter(app => app.status === 'published')
    .map(app => ({ id: `micro-entry-${app.code}`, title: app.name, icon: app.icon, path: `/micro/${app.code}`, permission: 'microapp:view', type: 'microapp', appCode: app.code, sort: app.sort, status: 1 }))
  if (children.length) menus.push({ id: 'micro-apps', title: '业务应用', icon: 'Grid', permission: 'microapp:view', type: 'dir', appCode: null, sort: 3, status: 1, children })
  return menus
}

function bootstrapRoutes() {
  const routes: any[] = []
  const collect = (items: any[]) => items.forEach(item => {
    if (item.path && item.pageKey) {
      routes.push({ path: item.path, name: item.name || `Page_${item.pageKey}`, title: item.title, permission: item.permission, pageKey: item.pageKey })
    }
    if (item.children) collect(item.children)
  })
  collect(mainMenus)
  // 不出现在菜单中的详情页也由接口声明，前端不会私自定义业务路径。
  routes.push({ path: '/system/microapps/:code/config', name: 'SystemMicroAppConfig', title: '微应用配置', permission: 'system:microapp:view', pageKey: 'system-microapp-config' })
  return routes
}

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
    response: ({ query }: any) => {
      const appCode = query.app_code === 'main' ? null : query.app_code
      if (!appCode) return { code: 200, data: clone(mainMenus), message: '获取成功' }
      return { code: 200, data: clone(microMenus[appCode] || []), message: '获取成功' }
    },
  },

  {
    url: '/api/menu',
    method: 'post',
    response: ({ body }: any) => {
      const menu = { id: `menu-${menuSequence++}`, children: [], ...body, appCode: body.appCode ?? null }
      const root = body.appCode ? (microMenus[body.appCode] ||= []) : mainMenus
      const target = body.parentId ? findMenu(root, body.parentId)?.children : root
      if (!target) return { code: 400, data: null, message: '父级菜单不存在' }
      target.push(menu)
      return { code: 200, data: menu, message: '新增成功' }
    },
  },

  {
    url: '/api/menu/:id',
    method: 'put',
    response: ({ body, query }: any) => {
      const menu = findMenu(mainMenus, query.id) || Object.values(microMenus).map(items => findMenu(items, query.id)).find(Boolean)
      if (!menu) return { code: 404, data: null, message: '菜单不存在' }
      Object.assign(menu, body)
      return { code: 200, data: menu, message: '更新成功' }
    },
  },

  {
    url: '/api/menu/:id',
    method: 'delete',
    response: ({ query }: any) => {
      return (removeMenu(mainMenus, query.id) || Object.values(microMenus).some(items => removeMenu(items, query.id)))
        ? { code: 200, data: null, message: '删除成功' }
        : { code: 404, data: null, message: '菜单不存在' }
    },
  },

  // 登录后的启动数据：菜单与已上架微应用摘要均由接口返回
  {
    url: '/api/auth/bootstrap',
    method: 'get',
    response: () => ({
      code: 200,
      data: {
        permissions: ['*'],
        menus: bootstrapMenus(),
        routes: bootstrapRoutes(),
        microApps: microApps.filter(app => app.status === 'published').map(({ id, name, code, icon, status }) => ({ id, name, code, icon, status })),
      },
      message: '获取成功',
    }),
  },

  // 微应用管理与运行时配置
  {
    url: '/api/micro-apps', method: 'get',
    response: ({ query }: any) => {
      const { page = 1, pageSize = 10, name, code, status, mode } = query
      let list = microApps.filter(app => (!name || app.name.includes(name)) && (!code || app.code.includes(code)) && (!status || app.status === status))
      if (mode) list = list.filter(app => (mode === 'alive' && app.runtimeConfig.alive) || (mode === 'sync' && app.runtimeConfig.sync) || (mode === 'fiber' && app.runtimeConfig.fiber) || (mode === 'degrade' && app.runtimeConfig.degrade))
      const start = (Number(page) - 1) * Number(pageSize)
      return { code: 200, data: { list: clone(list.slice(start, start + Number(pageSize))), total: list.length, page: Number(page), pageSize: Number(pageSize) }, message: '获取成功' }
    },
  },
  {
    url: '/api/micro-apps/all', method: 'get',
    response: () => ({ code: 200, data: clone(microApps), message: '获取成功' }),
  },
  {
    url: '/api/micro-apps', method: 'post',
    response: ({ body }: any) => {
      if (microApps.some(app => app.code === body.code)) return { code: 400, data: null, message: '应用编码已存在' }
      const app = { id: `micro-${microApps.length + 1}`, version: 'v0.1.0', status: 'developing', sort: 0, icon: 'Grid', runtimeConfig: { alive: false, sync: false, fiber: false, degrade: false, prefix: {}, props: {}, preload: false, exec: false }, ...body }
      microApps.push(app)
      return { code: 200, data: clone(app), message: '新增成功' }
    },
  },
  {
    url: '/api/micro-apps/:code', method: 'get',
    response: ({ query }: any) => {
      const app = microApps.find(item => item.code === query.code)
      return app ? { code: 200, data: clone(app), message: '获取成功' } : { code: 404, data: null, message: '微应用不存在' }
    },
  },
  {
    url: '/api/micro-apps/:code', method: 'put',
    response: ({ body, query }: any) => {
      const app = microApps.find(item => item.code === query.code)
      if (!app) return { code: 404, data: null, message: '微应用不存在' }
      Object.assign(app, body, { code: app.code })
      return { code: 200, data: clone(app), message: '更新成功' }
    },
  },
  {
    url: '/api/micro-apps/:code/runtime', method: 'get',
    response: ({ query }: any) => {
      const app = microApps.find(item => item.code === query.code)
      return app ? { code: 200, data: clone(app.runtimeConfig), message: '获取成功' } : { code: 404, data: null, message: '微应用不存在' }
    },
  },
  {
    url: '/api/micro-apps/:code/runtime', method: 'put',
    response: ({ body, query }: any) => {
      const app = microApps.find(item => item.code === query.code)
      if (!app) return { code: 404, data: null, message: '微应用不存在' }
      app.runtimeConfig = body
      return { code: 200, data: clone(app.runtimeConfig), message: '保存成功' }
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
