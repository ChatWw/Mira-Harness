你是一个 Vue 3 + TypeScript 专家。请帮我完成一个中后台脚手架项目的基础设施搭建。

## 项目背景

项目路径：当前工作目录
技术栈：Vue 3.5 (Composition API) + TypeScript 5.7 + Vite 6.0 + Element Plus 2.14 + Pinia 3.0 + pinia-plugin-persistedstate + SCSS
路径别名：@ → src/，@styles → src/styles/
SCSS 全局注入：vite.config.ts 已配置 additionalData 自动注入 variables.scss 和 mixins.scss

## 任务清单

### 1.1 清理技术债务

1. **user.ts base64 头像问题**
   - 文件 `src/stores/user.ts` 中有一个 ~800KB 的 base64 头像字符串内嵌在代码里
   - 将其替换为 Element Plus 的 el-avatar + icon（不需要真实图片），或者用一个很小的 SVG data URI
   - 保持 UserInfo 接口不变，只是 avatar 字段值改为空字符串或一个简洁的默认值

2. **dist/ 加入 .gitignore**
   - 检查根目录是否有 .gitignore，没有则创建
   - 添加 dist/、node_modules/、*.local、.env.local 等

3. **App.vue 清理**
   - 文件 `src/app/App.vue` 中有空的 onMounted 钩子和无用的 useRouter import
   - 清理这些无用代码

4. **端口统一**
   - vite.config.ts 中 server.port 是 9000，保持不变

### 1.2 安装依赖

```bash
npm install axios
npm install -D vite-plugin-mock @types/node
```

### 1.3 环境变量配置

创建以下文件：

`.env`:
```
VITE_API_BASE_URL=/api
```

`.env.development`:
```
VITE_API_BASE_URL=/api
VITE_USE_MOCK=true
```

`.env.production`:
```
VITE_API_BASE_URL=/api
VITE_USE_MOCK=false
```

### 1.4 API 层搭建

创建 `src/api/` 目录：

**`src/api/types.ts`**:
```typescript
export interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

export interface PageResult<T = any> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface PageParams {
  page: number
  pageSize: number
  [key: string]: any
}

export interface LoginResult {
  token: string
  userInfo: UserInfo
  permissions: string[]
  menus: MenuItem[]
}
```

**`src/api/request.ts`**:
- axios 实例，baseURL = import.meta.env.VITE_API_BASE_URL || '/api'
- timeout: 15000
- 请求拦截器：从 localStorage 读取 'mira-token'，附加到 Authorization header
- 响应拦截器：
  - code === 200 返回 data
  - code === 401 清除 token，ElMessage.error 提示，跳转 /login
  - 其他错误 ElMessage.error 提示
  - 网络错误也 ElMessage.error
  - CanceledError 直接 reject 不提示
- 导出 request 实例

**`src/api/user.ts`**:
```typescript
import request from './request'
import type { PageParams, PageResult } from './types'
import type { UserInfo } from '@/types'

export const userApi = {
  login(data: { username: string; password: string }) {
    return request.post('/auth/login', data)
  },
  getInfo() {
    return request.get('/auth/info')
  },
  logout() {
    return request.post('/auth/logout')
  },
  getList(params: PageParams) {
    return request.get<PageResult<UserInfo>>('/user/list', { params })
  },
  create(data: Partial<UserInfo>) {
    return request.post('/user', data)
  },
  update(id: string, data: Partial<UserInfo>) {
    return request.put(`/user/${id}`, data)
  },
  delete(id: string) {
    return request.delete(`/user/${id}`)
  },
  resetPassword(id: string) {
    return request.put(`/user/${id}/reset-password`)
  },
}
```

同样创建 `src/api/system.ts`、`src/api/profile.ts`、`src/api/message.ts`、`src/api/dashboard.ts`，每个文件先写好接口方法签名（方法体调用 request），暂时返回空数据即可。

### 1.5 Mock 服务搭建

修改 `vite.config.ts`，添加 viteMockServe 插件：
```typescript
import { viteMockServe } from 'vite-plugin-mock'

// plugins 数组中添加：
viteMockServe({
  mockPath: 'src/mock',
  enable: process.env.NODE_ENV === 'development',
})
```

创建 `src/mock/` 目录：

**`src/mock/user.mock.ts`** — 至少包含：
- POST /api/auth/login：校验用户名密码，返回 token + userInfo + permissions + menus
- GET /api/auth/info：返回当前用户信息 + 权限码 + 菜单数据
- POST /api/auth/logout：返回成功
- GET /api/user/list：支持分页 + 搜索过滤（username 模糊查询）
- POST /api/user：新增
- PUT /api/user/:id：更新
- DELETE /api/user/:id：删除
- PUT /api/user/:id/reset-password：重置密码

Mock 数据要求：
- 生成 20+ 条用户数据
- permissions 返回 ['*']（超级管理员全部权限）
- menus 返回菜单树结构，包含：工作台、系统管理（用户管理、角色管理、菜单管理、操作日志、系统设置、部门管理）、个人中心、消息中心

**`src/mock/system.mock.ts`** — 角色、菜单、部门、日志、设置的基础 CRUD Mock

**`src/mock/dashboard.mock.ts`** — 工作台统计数据 + 趋势数据

每个 mock 文件用 `export default [...] as MockMethod[]` 格式。

### 1.6 新增目录

创建以下空目录（放 .gitkeep）：
- `src/directives/`
- `src/hooks/`

### 1.7 权限指令和 hooks

**`src/directives/permission.ts`**:
```typescript
import type { Directive } from 'vue'
import { usePermissionStore } from '@/stores/permission'

export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const permissionStore = usePermissionStore()
    const required = binding.value

    const has = Array.isArray(required)
      ? required.some(p => permissionStore.hasPermission(p))
      : permissionStore.hasPermission(required)

    if (!has) {
      el.parentNode?.removeChild(el)
    }
  }
}
```

**`src/hooks/usePermission.ts`**:
```typescript
import { usePermissionStore } from '@/stores/permission'

export function usePermission() {
  const permissionStore = usePermissionStore()

  function hasPermission(code: string | string[]): boolean {
    if (Array.isArray(code)) {
      return code.some(c => permissionStore.hasPermission(c))
    }
    return permissionStore.hasPermission(code)
  }

  function hasAllPermissions(codes: string[]): boolean {
    return codes.every(c => permissionStore.hasPermission(c))
  }

  return { hasPermission, hasAllPermissions }
}
```

### 1.8 新增 Store

**`src/stores/permission.ts`**:
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

export const usePermissionStore = defineStore('permission', () => {
  const permissions = ref<string[]>([])
  const menuRoutes = ref<any[]>([])  // 菜单数据
  const isRoutesAdded = ref(false)    // 动态路由是否已注册

  function hasPermission(code: string): boolean {
    if (permissions.value.includes('*')) return true
    return permissions.value.includes(code)
  }

  function setPermissions(codes: string[]) {
    permissions.value = codes
  }

  function setMenuRoutes(menus: any[]) {
    menuRoutes.value = menus
  }

  function setRoutesAdded(val: boolean) {
    isRoutesAdded.value = val
  }

  function reset() {
    permissions.value = []
    menuRoutes.value = []
    isRoutesAdded.value = false
  }

  return {
    permissions, menuRoutes, isRoutesAdded,
    hasPermission, setPermissions, setMenuRoutes, setRoutesAdded, reset
  }
})
```

**`src/stores/tabs.ts`**:
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TabItem {
  path: string
  title: string
  name: string
  icon?: string
  closable: boolean
  lastAccess: number
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([])
  const activeTab = ref<string>('')

  function addTab(tab: TabItem) {
    const existing = tabs.value.find(t => t.path === tab.path)
    if (existing) {
      existing.lastAccess = Date.now()
      activeTab.value = tab.path
      return
    }
    tabs.value.push(tab)
    activeTab.value = tab.path
  }

  function closeTab(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    if (index === -1) return
    tabs.value.splice(index, 1)
    if (activeTab.value === path) {
      const next = tabs.value[index] || tabs.value[index - 1]
      activeTab.value = next ? next.path : '/dashboard'
    }
  }

  function closeOthers(path: string) {
    tabs.value = tabs.value.filter(t => !t.closable || t.path === path)
    activeTab.value = path
  }

  function closeLeft(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    tabs.value = tabs.value.filter((t, i) => i >= index || !t.closable)
  }

  function closeRight(path: string) {
    const index = tabs.value.findIndex(t => t.path === path)
    tabs.value = tabs.value.filter((t, i) => i <= index || !t.closable)
  }

  function closeAll() {
    tabs.value = tabs.value.filter(t => !t.closable)
    activeTab.value = '/dashboard'
  }

  return { tabs, activeTab, addTab, closeTab, closeOthers, closeLeft, closeRight, closeAll }
}, {
  persist: {
    key: 'cp-tabs',
    storage: sessionStorage,
  }
})
```

### 1.9 main.ts 注册

在 `src/main.ts` 中：
- 导入 permission 指令并注册为 `v-permission`
- 其他内容保持不变

### 1.10 类型扩展

在 `src/types/index.ts` 中扩展（不要删除已有内容）：
```typescript
// 菜单项增加权限标识和组件路径
export interface MenuItem {
  id: string
  title: string
  icon?: string
  path?: string
  children?: MenuItem[]
  permission?: string
  component?: string  // 组件路径，用于动态路由
  name?: string       // 路由 name
}

// 布局模式增加新选项
export type LayoutMode = 'sidebar-header' | 'header-only' | 'sidebar-only' | 'mixed' | 'top-menu'

// 新增类型
export type ContentWidth = 'full' | '1200' | '1400' | '1600'
export type ContentPadding = 'compact' | 'normal' | 'comfortable'
export type CornerRadius = 'sharp' | 'medium' | 'rounded'
export type ComponentSize = 'large' | 'default' | 'small'
export type AnimationSpeed = 'fast' | 'normal' | 'slow'
export type FooterStyle = 'simple' | 'split' | 'multi'
export type FooterYearMode = 'auto' | 'custom'
export type TabStyle = 'card' | 'chrome' | 'plain'

export interface FooterLink {
  text: string
  url: string
  target?: '_blank' | '_self'
}

// UserInfo 增加更多字段
export interface UserInfo {
  id: string
  name: string
  email: string
  avatar?: string
  roles?: string[]
  username?: string
  nickname?: string
  phone?: string
  deptId?: string
  deptName?: string
  status?: number
  createdAt?: string
}
```

## 重要约束

1. **所有样式必须使用 CSS 变量**：`var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值（hex/rgb/颜色名）
2. **不要修改登录页和注册页**：`src/pages/login/` 和 `src/pages/register/` 下的所有文件保持原样
3. **保持现有功能可用**：修改后 `npm run dev` 必须能正常启动，登录功能正常
4. **TypeScript 严格模式**：所有新代码必须类型安全，不能有 any 滥用

## 验收标准

- [ ] user.ts 不再包含 base64 大字符串
- [ ] dist/ 在 .gitignore 中
- [ ] App.vue 无死代码
- [ ] .env 系列文件创建完成
- [ ] src/api/ 目录完整（request.ts + types.ts + user.ts + system.ts + profile.ts + message.ts + dashboard.ts）
- [ ] src/mock/ 目录完整（user.mock.ts + system.mock.ts + dashboard.mock.ts）
- [ ] vite.config.ts 集成 viteMockServe
- [ ] src/directives/permission.ts 创建
- [ ] src/hooks/usePermission.ts 创建
- [ ] src/stores/permission.ts 和 src/stores/tabs.ts 创建
- [ ] main.ts 注册了 v-permission 指令
- [ ] src/types/index.ts 扩展完成
- [ ] npm run dev 能正常启动，登录功能正常
