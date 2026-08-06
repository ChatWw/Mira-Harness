# Claude 分阶段实施提示词

> 本文档包含 6 个 Phase 的完整提示词，依次复制到 Claude 中执行。
> 每个 Phase 都是自包含的，包含完整上下文，无需额外沟通。

---

## Phase 1 — 基础设施（地基）

```
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

export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    // 延迟导入，避免循环依赖
    // 在 main.ts 中注册
    const value = binding.value
    // 这里先做基础实现，后续 permissionStore 完善后自动生效
    el.parentNode?.removeChild(el) // 临时移除，实际应该检查权限
  }
}
```

实际实现应该这样写：
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
```

---

## Phase 2 — 布局重构（骨架）

```
你是一个 Vue 3 + TypeScript 专家。请帮我对一个中后台项目的布局系统进行全面重构。

## 项目背景

技术栈：Vue 3.5 (Composition API) + TypeScript 5.7 + Vite 6.0 + Element Plus 2.14 + Pinia 3.0 + SCSS
路径别名：@ → src/

## 全局样式约束（必须遵守）

**所有样式必须使用 CSS 变量或 SCSS 变量，严禁写死颜色值。**

可用的 CSS 变量（在 :root 和 [data-theme='dark'] 中已定义，自动适配明暗模式）：
- `var(--cp-primary)` / `var(--cp-primary-hover)` / `var(--cp-primary-light)` / `var(--cp-primary-lighter)`
- `var(--cp-bg)` / `var(--cp-bg-elevated)` / `var(--cp-bg-overlay)` / `var(--cp-bg-hover)`
- `var(--cp-text)` / `var(--cp-text-secondary)` / `var(--cp-text-tertiary)` / `var(--cp-text-placeholder)`
- `var(--cp-border)` / `var(--cp-border-light)`
- `var(--cp-success)` / `var(--cp-warning)` / `var(--cp-danger)` / `var(--cp-info)`

可用的 SCSS 变量（已通过 vite additionalData 全局注入）：
- 间距：$spacing-xs(4px) / $spacing-sm(8px) / $spacing-md(16px) / $spacing-lg(24px) / $spacing-xl(32px) / $spacing-2xl(48px)
- 字号：$font-xs(12) / $font-sm(14) / $font-base(16) / $font-lg(18) / $font-xl(20) / $font-2xl(24)
- 圆角：$radius-sm(4) / $radius-md(8) / $radius-lg(12) / $radius-xl(16) / $radius-full(9999)
- 阴影：$shadow-sm / $shadow / $shadow-md / $shadow-lg / $shadow-xl / $dark-shadow-sm / $dark-shadow
- 动画：$transition-fast(150ms) / $transition-base(200ms) / $transition-slow(300ms)
- 断点：$breakpoint-xs(480) / $breakpoint-sm(640) / $breakpoint-md(768) / $breakpoint-lg(1024) / $breakpoint-xl(1280)
- z-index：$z-dropdown(1000) / $z-sticky(1020) / $z-fixed(1030) / $z-modal-backdrop(1040) / $z-modal(1050) / $z-popover(1060) / $z-tooltip(1070)

可用 SCSS mixins（已全局注入）：
- @include flex-center / @include flex-between / @include text-ellipsis / @include text-clamp(n)
- @include media-max($bp) / @include media-min($bp)
- 暗色模式：@include dark-mode { ... } 或直接用 CSS 变量

## 现有 Layout 结构

当前 `src/layouts/index.vue` 结构：
```
Layout
├── AppSidebar (条件渲染)
├── div.main-container
│   ├── AppHeader (条件渲染)
│   ├── AppMain (router-view + transition)
│   └── AppFooter (硬编码版权)
└── AppSettings (配置面板)
```

现有布局模式 3 种：sidebar-header / header-only / sidebar-only
现有配置项只有 5 项：mode / showLogo / fixedHeader / dynamicTitle / pageTransition

现有 LayoutConfig 类型（src/types/index.ts 中已扩展为完整版）：
```typescript
export interface LayoutConfig {
  mode: LayoutMode  // 'sidebar-header' | 'header-only' | 'sidebar-only' | 'mixed' | 'top-menu'
  sidebarWidth: number          // 200-280, 默认 240
  collapsedWidth: number       // 48-80, 默认 64
  uniqueOpened: boolean        // 默认 false
  fixedSidebar: boolean         // 默认 true
  showLogo: boolean            // 默认 true
  showFooter: boolean          // 默认 false
  fixedHeader: boolean         // 默认 true
  headerHeight: number         // 56 / 64 / 72
  showBreadcrumb: boolean      // 默认 true
  breadcrumbIcon: boolean      // 默认 true
  enableTabs: boolean          // 默认 true
  tabStyle: TabStyle           // 'card' | 'chrome' | 'plain'
  maxTabs: number              // 5-15, 默认 10
  tabPersist: boolean          // 默认 true
  contentMaxWidth: ContentWidth // 'full' | '1200' | '1400' | '1600'
  contentPadding: ContentPadding // 'compact' | 'normal' | 'comfortable'
  pageTransition: PageTransition
  animationSpeed: AnimationSpeed // 'fast' | 'normal' | 'slow'
  themeTransitionAnimation: boolean
  cornerRadius: CornerRadius   // 'sharp' | 'medium' | 'rounded'
  componentSize: ComponentSize // 'large' | 'default' | 'small'
  watermark: boolean
  watermarkText: string
  footerStyle: FooterStyle     // 'simple' | 'split' | 'multi'
  footerHeight: number         // 32 / 40 / 48
  footerCopyright: string
  footerYearMode: FooterYearMode // 'auto' | 'custom'
  footerYearStart: number | null
  footerYearEnd: number | null
  footerIcp: string
  footerIcpLink: string
  footerLinks: FooterLink[]
  dynamicTitle: string
}
```

## 任务清单

### 2.1 更新 layoutStore

修改 `src/stores/layout.ts`：
- DEFAULT_CONFIG 更新为完整的 LayoutConfig 默认值
- 添加所有新增配置项的 setter 方法
- persist 的 pick 改为 ['config']（保持不变）
- 添加 resetConfig 方法重置到默认值
- 添加 copyConfig 方法返回 JSON 字符串

默认值：
```typescript
const DEFAULT_CONFIG: LayoutConfig = {
  mode: 'sidebar-header',
  sidebarWidth: 240,
  collapsedWidth: 64,
  uniqueOpened: false,
  fixedSidebar: true,
  showLogo: true,
  showFooter: false,
  fixedHeader: true,
  headerHeight: 64,
  showBreadcrumb: true,
  breadcrumbIcon: true,
  enableTabs: true,
  tabStyle: 'card',
  maxTabs: 10,
  tabPersist: true,
  contentMaxWidth: 'full',
  contentPadding: 'normal',
  pageTransition: 'fade-slide',
  animationSpeed: 'normal',
  themeTransitionAnimation: true,
  cornerRadius: 'medium',
  componentSize: 'default',
  watermark: false,
  watermarkText: '',
  footerStyle: 'simple',
  footerHeight: 40,
  footerCopyright: '中台基座',
  footerYearMode: 'auto',
  footerYearStart: null,
  footerYearEnd: null,
  footerIcp: '',
  footerIcpLink: 'https://beian.miit.gov.cn/',
  footerLinks: [],
  dynamicTitle: '中台基座',
}
```

### 2.2 Layout 分层重构

重构 `src/layouts/index.vue`，实现 5 层结构：

```
Layout
├── AppSidebar              侧边栏（宽度/折叠宽度可配置）
├── MainWrapper             主容器
│   ├── AppHeader           顶栏（双区布局：左区折叠+面包屑，右区搜索+通知+全屏+主题+设置+用户下拉）
│   ├── TabsBar             多标签栏（可配置显隐/样式）
│   ├── PageContainer       页面容器（包裹 router-view）
│   └── AppFooter           底栏（默认隐藏，可配置）
└── AppSettings             配置面板
```

- 5 种布局模式：sidebar-header / header-only / sidebar-only / mixed / top-menu
- mixed 模式：窄轨 56px 固定 + 展开面板 200px（二级侧边栏）
- top-menu 模式：顶部水平菜单，无侧边栏
- 侧边栏宽度通过 CSS 变量 `--sidebar-width` 动态控制
- fixedHeader 时 AppHeader position: fixed
- AppFooter 默认隐藏

### 2.3 PageContainer 组件

创建 `src/components/PageContainer/index.vue`：

```vue
<template>
  <div class="page-container" :class="{ 'is-full': maxWidth === 'full' }">
    <div v-if="$slots.header || title" class="page-header">
      <div class="page-header__left">
        <slot name="header">
          <h2 class="page-title">{{ title }}</h2>
          <p v-if="description" class="page-description">{{ description }}</p>
        </slot>
      </div>
      <div v-if="$slots.actions" class="page-header__right">
        <slot name="actions" />
      </div>
    </div>
    <div class="page-content">
      <slot />
    </div>
  </div>
</template>
```

Props: title / description / maxWidth (从 layoutStore 读取或手动传)
内容区 padding 从 layoutStore 的 contentPadding 读取

### 2.4 AppHeader 重构

重构 `src/layouts/components/AppHeader.vue`：

双区布局：
- 左区：折叠按钮 + 面包屑导航
- 右区：全局搜索按钮 + 通知铃铛 + 全屏切换 + 主题切换 + 设置按钮 + 用户下拉

**面包屑组件**（`src/components/Breadcrumb/index.vue`）：
- 基于路由 matched 数组自动生成
- 最后一项不可点击
- 支持 icon + 文字（图标可通过 breadcrumbIcon 配置开关）
- 超过 4 级时中间用 ... 折叠

**全局搜索**（`src/components/SearchBar/index.vue`）：
- 触发：Ctrl+K 或点击顶栏搜索按钮
- 命令面板风格（居中弹出覆盖层）
- 搜索框 + 分类 Tab（全部/菜单/页面/操作）
- 结果列表：每项显示图标 + 标题 + 父级路径
- 键盘操作：↑↓ 导航、Enter 打开、Tab 切换分类、ESC 关闭
- 选中项主题色高亮
- 数据源：路由配置 + 菜单配置
- 最多展示 8 条

**通知铃铛**（`src/components/Notification/index.vue`）：
- 图标 + 未读数量 Badge（危险色）
- 下拉面板：
  - 顶部：标题 + "全部已读"按钮
  - Tab 切换：全部 / 通知 / 公告
  - 消息列表：最多 5 条，每条显示标题 + 内容摘要 + 时间 + 未读圆点(主色)
  - 底部："查看全部消息 →" 跳转 /message/list
- 数据暂时用 Mock（后续接 API）

**全屏切换**：
- 使用 Fullscreen API
- 图标切换：全屏/退出全屏

**用户下拉**：
- 头像 + 昵称 + 角色 + 在线状态标签
- 菜单项：个人中心(/profile/info) / 系统设置(/system/settings) / 消息通知(/message/list 带 Badge) / 主题设置(打开配置面板) / 布局配置(打开配置面板)
- 底部分隔线 + 退出登录（危险色高亮，保留确认对话框）
- 使用 el-dropdown 实现

### 2.5 TabsBar 组件

创建 `src/layouts/components/TabsBar.vue`：

- 位置：AppHeader 下方，PageContainer 上方
- 从 layoutStore.config.enableTabs 控制显隐
- 从 tabsStore 读取标签列表
- 3 种样式（从 layoutStore.config.tabStyle 读取）：
  - card：卡片式，标签间有间距，激活项带底部主色高亮条
  - chrome：浏览器标签式，标签相连带圆角，激活项背景区分
  - plain：简约式，无边框，仅文字+下划线高亮
- 首页标签固定不可关闭
- 标签显示页面标题 + hover 显示关闭按钮
- 标签拖拽排序（使用原生 drag API 或 SortableJS）
- 超出容器宽度时横向滚动
- 右键菜单（使用 el-dropdown 或自定义）：
  - 刷新当前（所有标签可用）
  - 关闭当前（首页不可用）
  - 关闭其他
  - 关闭左侧
  - 关闭右侧
  - 关闭全部
- 监听路由变化，自动 addTab
- 最大标签数从 layoutStore.config.maxTabs 读取，超出 LRU 淘汰

### 2.6 AppFooter 重构

重构 `src/layouts/components/AppFooter.vue`：

- 从 layoutStore.config.showFooter 控制显隐（默认隐藏）
- 3 种样式（footerStyle）：
  - simple：居中单行，仅版权信息
  - split：左侧版权+备案，右侧额外链接
  - multi：多列布局
- 版权文本：footerCopyright
- 版权年份：footerYearMode 为 auto 时取当前年，custom 时显示 footerYearStart-footerYearEnd
- 备案号：footerIcp，带链接（footerIcpLink，默认工信部）
- 额外链接：footerLinks 数组，每组 { text, url, target }
- 底栏高度：footerHeight（32/40/48px）

### 2.7 AppSidebar 增强

修改 `src/layouts/components/AppSidebar.vue`：
- 侧边栏宽度从 layoutStore.config.sidebarWidth 读取（通过 CSS 变量 --sidebar-width）
- 折叠宽度从 layoutStore.config.collapsedWidth 读取
- 唯一展开模式从 layoutStore.config.uniqueOpened 读取
- mixed 模式下：窄轨 56px 固定 + 展开面板 200px

### 2.8 AppSettings 配置面板重构

重构 `src/layouts/components/AppSettings.vue`：

7 大模块 28+ 项配置，每个 section 独立可折叠卡片：

1. **整体风格**：主题模式(单选 light/dark/auto) + 主题色(5预设色板+自定义颜色选择器) + 圆角风格(单选 8/12/16px) + 组件大小(单选 large/default/small)
2. **布局设置**：布局模式(5种卡片选择) + 侧边栏宽度(滑块 200-280) + 折叠宽度(滑块 48-80) + 唯一展开(开关) + 固定侧边栏(开关) + 显示Logo(开关) + 显示底栏(开关)
3. **顶栏设置**：固定顶栏(开关) + 顶栏高度(单选 56/64/72) + 显示面包屑(开关) + 面包屑图标(开关)
4. **多标签页**：启用(开关) + 样式(单选 card/chrome/plain) + 最大数量(数字 5-15) + 持久化(开关)
5. **动画效果**：页面切换动画(6种卡片选择) + 动画速度(单选 fast/normal/slow) + 白天/黑夜切换动画(开关)
6. **底栏设置**：显示底栏(与布局设置联动) + 版权文本(输入框) + 版权年份(单选 auto/custom+起止年) + 备案号(输入框) + 备案号链接(输入框) + 额外链接(动态列表 添加/删除) + 底栏样式(单选 simple/split/multi) + 底栏高度(单选 32/40/48)
7. **其他**：页面标题(输入框) + 水印(开关+文本) + 内容最大宽度(单选) + 内容内边距(单选)

底部操作区：复制配置 JSON / 恢复默认 / 清除缓存
面板宽度 380px，抽屉式从右侧滑出
配置变更实时预览（直接修改 store，无需确认按钮）

### 2.9 动态路由改造

修改 `src/router/index.ts`：

保留 /login、/register、/404 为静态路由。
将 / 下的 children 改为动态注册：

```typescript
// 静态路由（始终可用）
const staticRoutes = [
  { path: '/login', ... },
  { path: '/register', ... },
  { path: '/404', ... },
]

// 布局路由（动态注册 children）
const layoutRoute = {
  path: '/',
  redirect: '/dashboard',
  component: () => import('@/layouts/index.vue'),
  meta: { requiresAuth: true },
  children: []  // 动态填充
}
```

路由守卫改造：
```typescript
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()
  const requiresAuth = to.meta.requiresAuth !== false

  if (!requiresAuth) {
    // 已登录访问登录页，重定向到首页
    if (userStore.isLoggedIn && (to.path === '/login' || to.path === '/register')) {
      next('/dashboard')
    } else {
      next()
    }
    return
  }

  if (!userStore.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  // 已登录但路由未注册
  if (!permissionStore.isRoutesAdded) {
    try {
      // 1. 调用 API 获取用户信息 + 权限 + 菜单
      const { permissions, menus } = await userApi.getInfo()
      // 2. 存储权限
      permissionStore.setPermissions(permissions)
      permissionStore.setMenuRoutes(menus)
      // 3. 根据菜单生成路由并注册
      const dynamicRoutes = generateRoutes(menus)
      dynamicRoutes.forEach(route => {
        router.addRoute('Layout', route)  // 添加到布局路由的 children
      })
      // 4. 标记已注册
      permissionStore.setRoutesAdded(true)
      // 5. 重新导航
      next({ ...to, replace: true })
    } catch (error) {
      userStore.logout()
      next('/login')
    }
    return
  }

  next()
})
```

路由模块化创建 `src/router/modules/` 目录：
- dashboard.ts
- system.ts
- profile.ts
- message.ts
- components.ts

每个模块导出路由配置数组，包含 path/name/component/meta(title,icon,permission)。

generateRoutes 函数：从菜单数据生成路由配置。
菜单数据中的 component 字段是字符串路径（如 'dashboard/DashboardPage'），通过 `() => import(`@/pages/${component}.vue`)` 动态导入。

### 2.10 菜单配置增强

修改 `src/config/menu.ts`，增加权限标识和组件路径：

```typescript
export const MENU_LIST: MenuItem[] = [
  {
    id: 'dashboard',
    title: '工作台',
    icon: 'Odometer',
    path: '/dashboard',
    name: 'Dashboard',
    component: 'dashboard/DashboardPage',
    permission: 'dashboard:view',
  },
  {
    id: 'system',
    title: '系统管理',
    icon: 'Setting',
    permission: 'system:view',
    children: [
      { id: 'system-users', title: '用户管理', icon: 'User', path: '/system/users',
        name: 'SystemUsers', component: 'system/UserPage', permission: 'system:user:list' },
      { id: 'system-roles', title: '角色管理', icon: 'UserFilled', path: '/system/roles',
        name: 'SystemRoles', component: 'system/RolePage', permission: 'system:role:list' },
      { id: 'system-menus', title: '菜单管理', icon: 'Menu', path: '/system/menus',
        name: 'SystemMenus', component: 'system/MenuPage', permission: 'system:menu:list' },
      { id: 'system-logs', title: '操作日志', icon: 'Document', path: '/system/logs',
        name: 'SystemLogs', component: 'system/LogPage', permission: 'system:log:list' },
      { id: 'system-settings', title: '系统设置', icon: 'Tools', path: '/system/settings',
        name: 'SystemSettings', component: 'system/SettingsPage', permission: 'system:settings:list' },
      { id: 'system-depts', title: '部门管理', icon: 'OfficeBuilding', path: '/system/depts',
        name: 'SystemDepts', component: 'system/DeptPage', permission: 'system:dept:list' },
    ],
  },
  {
    id: 'profile',
    title: '个人中心',
    icon: 'UserFilled',
    permission: 'profile:view',
    children: [
      { id: 'profile-info', title: '个人资料', path: '/profile/info',
        name: 'ProfileInfo', component: 'profile/ProfileInfoPage', permission: 'profile:info' },
      { id: 'profile-security', title: '安全设置', path: '/profile/security',
        name: 'ProfileSecurity', component: 'profile/ProfileSecurityPage', permission: 'profile:security' },
    ],
  },
  {
    id: 'message',
    title: '消息中心',
    icon: 'Bell',
    permission: 'message:view',
    children: [
      { id: 'message-list', title: '站内消息', path: '/message/list',
        name: 'MessageList', component: 'message/MessageListPage', permission: 'message:list' },
      { id: 'message-settings', title: '通知设置', path: '/message/settings',
        name: 'MessageSettings', component: 'message/MessageSettingsPage', permission: 'message:settings' },
    ],
  },
  {
    id: 'components-demo',
    title: '组件演示',
    icon: 'Grid',
    permission: 'components:view',
    children: [
      { id: 'components-table', title: 'ProTable', path: '/components/table',
        name: 'ComponentsTable', component: 'components/TableDemoPage', permission: 'components:table' },
      { id: 'components-form', title: 'ProForm', path: '/components/form',
        name: 'ComponentsForm', component: 'components/FormDemoPage', permission: 'components:form' },
      { id: 'components-detail', title: 'DetailLayout', path: '/components/detail',
        name: 'ComponentsDetail', component: 'components/DetailDemoPage', permission: 'components:detail' },
    ],
  },
]
```

对于尚未创建的页面组件，先创建简单的占位页面（显示页面名称即可），后续 Phase 再填充。

## 不要修改的文件

- `src/pages/login/` 下所有文件
- `src/pages/register/` 下所有文件
- `src/stores/theme.ts`（主题系统保持原样）
- `src/config/theme.ts`
- `src/styles/variables.scss`
- `src/styles/mixins.scss`

## 验收标准

- [ ] npm run dev 正常启动
- [ ] 登录功能正常（登录后能看到侧边栏菜单）
- [ ] 5 种布局模式可切换
- [ ] 配置面板 7 大模块全部可操作
- [ ] 多标签页功能正常（新增/关闭/右键菜单）
- [ ] 面包屑正确显示
- [ ] 全局搜索 Ctrl+K 可弹出
- [ ] 通知铃铛可展开
- [ ] 用户下拉菜单可操作
- [ ] AppFooter 可通过配置显示/隐藏
- [ ] 动态路由正常工作
- [ ] 所有样式使用 CSS 变量，明暗模式切换正常
```

---

## Phase 3 — 核心业务组件（组件）

```
你是一个 Vue 3 + TypeScript 专家。请帮我实现两个核心业务组件：ProTable 和 ProForm。

## 项目背景

技术栈：Vue 3.5 (Composition API) + TypeScript 5.7 + Element Plus 2.14 + Pinia 3.0 + SCSS
路径别名：@ → src/
SCSS 变量和 mixins 已全局注入（$spacing-* / $font-* / $radius-* / $shadow-* / $transition-* / $breakpoint-* / @include flex-center 等）
CSS 变量已定义（var(--cp-primary) / var(--cp-bg) / var(--cp-text) / var(--cp-border) / var(--cp-success) / var(--cp-danger) 等）

## 全局样式约束

**所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值（hex/rgb/颜色名）。**
新增语义色必须在 `:root` 和 `[data-theme='dark']` 中同时定义。

## 任务 1：ProTable 组件

创建 `src/components/ProTable/` 目录：

### 文件结构
```
src/components/ProTable/
├── index.vue          主组件
├── types.ts           类型定义
└── components/
    ├── SearchForm.vue  搜索表单
    └── Pagination.vue  分页
```

### types.ts

```typescript
import type { VNode } from 'vue'

export interface ProTableColumn<T = any> {
  prop: keyof T & string
  label: string
  width?: string | number
  minWidth?: string | number
  fixed?: 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  sortable?: boolean | 'custom'
  formatter?: (row: T, column: any, cellValue: any) => string
  slot?: string
  render?: (row: T) => VNode
  dict?: Record<string, string>
  searchable?: boolean
  searchType?: 'input' | 'select' | 'date' | 'daterange' | 'tree'
  searchOptions?: { label: string; value: any }[]
}

export interface SearchField {
  prop: string
  label: string
  type: 'input' | 'select' | 'date' | 'daterange' | 'tree' | 'cascader'
  options?: { label: string; value: any }[]
  placeholder?: string
  defaultValue?: any
  clearable?: boolean
}

export interface ProTableSearchConfig {
  fields?: SearchField[]
  colSpan?: number
  showExpand?: boolean
  defaultExpanded?: boolean
  searchText?: string
  resetText?: string
}

export interface ActionButton {
  text: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'default'
  icon?: string
  click?: (row?: any) => void
  confirmText?: string
  show?: (row?: any) => boolean
  disabled?: (row?: any) => boolean
}

export interface ProTableProps<T = any> {
  data?: T[]
  request?: (params: any) => Promise<any>
  columns: ProTableColumn<T>[]
  search?: ProTableSearchConfig
  pagination?: boolean | { pageSize?: number; layout?: string }
  selection?: boolean | 'single' | 'multiple'
  toolbar?: {
    title?: string
    actions?: ActionButton[]
    showRefresh?: boolean
    showDensity?: boolean
    showColumnToggle?: boolean
  }
  actions?: (row: any) => ActionButton[]
  actionsWidth?: number | string
  actionsFixed?: 'left' | 'right'
  rowKey?: string | ((row: any) => string)
  emptyText?: string
  loading?: boolean
}
```

### index.vue 功能要求

1. **数据加载**：支持 request 函数（异步加载 + 分页）和 data 数组（静态数据）
2. **搜索表单**：从 search.fields 或 columns 中 searchable 字段自动生成，支持展开/折叠
3. **表格**：基于 el-table，支持列配置、固定列、排序、自定义插槽
4. **分页**：基于 el-pagination，支持 pageSize 选择和跳转
5. **选择**：支持单选/多选，选中行通过 v-model 或 emit 传出
6. **工具栏**：标题 + 刷新按钮 + 密度切换(紧凑40px/默认52px/宽松64px) + 列设置(下拉面板勾选显隐) + 自定义按钮
7. **操作列**：根据 actions 函数生成按钮，支持 confirmText 确认框，支持 show/disabled 条件
8. **插槽**：`#{prop}` 单元格自定义渲染（参数 { row, column, value }）、`#toolbar-left`、`#toolbar-right`、`#empty`、`#expand`
9. **密度切换**：通过修改 el-table 的 row-style 或 row-class-name 改变行高
10. **列设置**：使用 el-popover，checkbox 控制列显隐，支持拖拽排序
11. **loading**：支持外部传入和内部自动管理
12. **导出方法**：refresh() 重新加载数据、getSelectedRows() 获取选中行

### SearchForm.vue
- 基于 el-form，响应式布局（colSpan 控制每行字段数）
- 自动生成对应类型的输入控件
- 搜索/重置按钮
- 超过 2 行时折叠/展开

### Pagination.vue
- 基于 el-pagination
- total / page / pageSize
- layout: "total, sizes, prev, pager, next, jumper"

## 任务 2：ProForm 组件

创建 `src/components/ProForm/` 目录：

### 文件结构
```
src/components/ProForm/
├── index.vue          主组件
├── types.ts           类型定义
└── components/
    └── FieldRenderer.vue  单个字段渲染器
```

### types.ts

```typescript
import type { FormRules, FormItemRule } from 'element-plus'

export type FieldType =
  | 'input' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox'
  | 'switch' | 'date' | 'daterange' | 'datetime' | 'time'
  | 'tree-select' | 'cascader' | 'upload' | 'icon-picker' | 'slot'

export interface ProFormField {
  type: FieldType
  prop: string
  label: string
  placeholder?: string
  defaultValue?: any
  required?: boolean
  rules?: FormItemRule[]
  disabled?: boolean | ((model: any) => boolean)
  colSpan?: number
  show?: (model: any) => boolean
  options?: { label: string; value: any; disabled?: boolean }[] | ((model: any) => any[])
  dict?: string
  onChange?: (value: any, model: any) => void
  slot?: string
  props?: Record<string, any>
}

export interface ProFormStep {
  title: string
  description?: string
  fields: string[]
}

export interface ProFormProps<T = any> {
  schema: ProFormField[]
  model: T
  layout?: 'horizontal' | 'vertical' | 'inline'
  labelWidth?: string | number
  labelPosition?: 'left' | 'right' | 'top'
  colSpan?: number
  disabled?: boolean
  readonly?: boolean
  submitText?: string | false
  resetText?: string | false
  rules?: FormRules
  steps?: ProFormStep[]
}

export interface ProFormExpose {
  validate: () => Promise<boolean>
  resetFields: () => void
  scrollToField: (prop: string) => void
  getFormData: () => any
}
```

### index.vue 功能要求

1. **Schema 驱动**：根据 schema 数组自动渲染表单字段
2. **16 种字段类型**：input/textarea/number/select/radio/checkbox/switch/date/daterange/datetime/time/tree-select/cascader/upload/icon-picker/slot
3. **布局**：horizontal/vertical/inline 三种布局，colSpan 控制每行字段数
4. **显隐联动**：show(model) 函数控制字段显示/隐藏
5. **选项联动**：options 支持函数形式，参数为 model，可实现联动
6. **禁用联动**：disabled 支持函数形式
7. **表单校验**：required 自动生成必填规则，rules 传入自定义规则
8. **分步表单**：steps 配置时显示 el-steps，底部上一步/下一步/提交按钮，每步独立校验
9. **暴露方法**：validate() / resetFields() / scrollToField() / getFormData()
10. **插槽**：type='slot' 的字段通过 `#{prop}` 插槽自定义渲染
11. **事件**：@submit(表单数据) / @reset

### FieldRenderer.vue
- 接收 field 配置和 model
- 根据 type 渲染对应的 Element Plus 组件
- 处理 disabled 函数
- 处理 options 函数联动
- 处理 onChange 事件

## 任务 3：组合式函数

### `src/hooks/useTable.ts`

```typescript
export function useTable<T>(apiFn: (params: any) => Promise<any>) {
  const loading = ref(false)
  const dataList = ref<T[]>([])
  const total = ref(0)
  const queryParams = reactive({ page: 1, pageSize: 10 })

  async function loadData() {
    loading.value = true
    try {
      const result = await apiFn(queryParams)
      dataList.value = result.list
      total.value = result.total
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    queryParams.page = 1
    loadData()
  }

  function handleReset() {
    Object.keys(queryParams).forEach(key => {
      if (key !== 'page' && key !== 'pageSize') {
        queryParams[key] = undefined
      }
    })
    queryParams.page = 1
    loadData()
  }

  return { loading, dataList, total, queryParams, loadData, handleSearch, handleReset }
}
```

### `src/hooks/useDialog.ts`

```typescript
export function useDialog<T = any>() {
  const visible = ref(false)
  const title = ref('')
  const mode = ref<'create' | 'edit'>('create')
  const editData = ref<T | null>(null)

  function openCreate(titleText = '新增') {
    mode.value = 'create'
    title.value = titleText
    editData.value = null
    visible.value = true
  }

  function openEdit(data: T, titleText = '编辑') {
    mode.value = 'edit'
    title.value = titleText
    editData.value = data
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  return { visible, title, mode, editData, openCreate, openEdit, close }
}
```

## 不要修改的文件

- `src/pages/login/` 和 `src/pages/register/` 下所有文件
- `src/stores/theme.ts` 和 `src/config/theme.ts`
- `src/styles/variables.scss` 和 `src/styles/mixins.scss`

## 验收标准

- [ ] ProTable 组件完整可用：搜索/分页/选择/工具栏/操作列/插槽
- [ ] ProForm 组件完整可用：16 种字段类型/联动/校验/分步
- [ ] useTable 和 useDialog hooks 可用
- [ ] 所有样式使用 CSS 变量
- [ ] TypeScript 类型安全
- [ ] npm run dev 正常启动
```

---

## Phase 4 — 业务页面（血肉）

```
你是一个 Vue 3 + TypeScript 专家。请帮我实现中后台系统的业务页面。

## 项目背景

技术栈：Vue 3.5 + TypeScript 5.7 + Element Plus 2.14 + Pinia 3.0 + SCSS + axios + Mock
路径别名：@ → src/
已有组件：ProTable（@/components/ProTable）、ProForm（@/components/ProForm）、PageContainer（@/components/PageContainer）
已有 hooks：useTable（@/hooks/useTable）、useDialog（@/hooks/useDialog）、usePermission（@/hooks/usePermission）
已有 API：userApi（@/api/user）、systemApi（@/api/system）
已有 Mock：src/mock/user.mock.ts、src/mock/system.mock.ts
已有指令：v-permission
权限标识规范：模块:资源:操作（如 system:user:create）

## 全局样式约束

**所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值。**
可用 CSS 变量：--cp-primary / --cp-primary-hover / --cp-primary-light / --cp-bg / --cp-bg-elevated / --cp-bg-overlay / --cp-bg-hover / --cp-text / --cp-text-secondary / --cp-text-tertiary / --cp-border / --cp-border-light / --cp-success / --cp-warning / --cp-danger / --cp-info
可用 SCSS 变量：$spacing-xs/sm/md/lg/xl/2xl / $font-xs/sm/base/lg/xl/2xl / $radius-sm/md/lg/xl / $shadow-sm/md/lg/xl / $transition-fast/base/slow / $breakpoint-xs/sm/md/lg/xl

## 任务清单

### 4.1 用户管理（src/pages/system/UserPage.vue）

使用 ProTable + ProForm 实现：

**表格列**：
| 列 | 字段 | 宽度 | 渲染 |
|----|------|------|------|
| 头像 | avatar | 60px | el-avatar |
| 用户名 | username | 120px | — |
| 昵称 | nickname | 120px | — |
| 手机号 | phone | 140px | — |
| 邮箱 | email | 180px | — |
| 角色 | roleName | 100px | el-tag type=primary |
| 部门 | deptName | 120px | — |
| 状态 | status | 80px | el-tag (1=success启用 / 0=danger禁用) |
| 创建时间 | createdAt | 160px | — |
| 操作 | — | 200px, fixed right | 编辑/重置密码/删除 |

**搜索栏**：用户名(input) + 手机号(input) + 状态(select: 启用/禁用) + 部门(tree-select)

**工具栏**：新增(v-permission="system:user:create") + 批量删除(confirm) + 批量启用 + 批量禁用 + 导出

**操作列**：编辑(v-permission="system:user:update") + 重置密码(confirm, v-permission="system:user:reset") + 删除(confirm, v-permission="system:user:delete")

**新增/编辑弹窗**（ProForm）：
- 用户名(input, 必填, 编辑时禁用)
- 昵称(input, 必填)
- 手机号(input, 必填, 手机号校验)
- 邮箱(input, 邮箱校验)
- 密码(input password, 新增必填, 密码强度校验)
- 部门(tree-select)
- 角色(select multiple, 必填)
- 状态(switch, 默认启用)

用 PageContainer 包裹，页头标题"用户管理"。

### 4.2 角色管理（src/pages/system/RolePage.vue）

**ProTable 列表**：
| 列 | 字段 |
|----|------|
| 角色名称 | roleName |
| 角色标识 | roleKey |
| 排序 | sort |
| 状态 | status (el-tag) |
| 创建时间 | createdAt |
| 操作 | 编辑 / 权限分配 / 删除 |

**搜索栏**：角色名称(input) + 状态(select)

**操作列**：编辑(v-permission="system:role:update") + 权限分配(v-permission="system:role:permission") + 删除(confirm, v-permission="system:role:delete")

**权限分配弹窗**（el-drawer 抽屉式）：
- 左侧：菜单权限树（el-tree），树结构：目录 > 菜单 > 按钮
  - 勾选节点代表该角色可访问的菜单
  - 父子联动：勾选父节点自动勾选所有子节点
  - 半选状态：部分子节点选中时父节点显示半选
  - 数据从 Mock 获取菜单树
- 右侧：数据权限范围选择
  - 全部数据(radio)
  - 本部门数据(radio)
  - 本部门及以下部门数据(radio)
  - 自定义部门(tree-select 多选, 选择"自定义部门"时显示)
- 底部：保存 / 取消

### 4.3 菜单管理（src/pages/system/MenuPage.vue）

**树形表格**（el-table with tree props）：
| 列 | 字段 |
|----|------|
| 菜单名称 | title (带缩进层级) |
| 图标 | icon (Element Plus 图标预览) |
| 排序 | sort |
| 权限标识 | permission |
| 类型 | type (el-tag: 目录=info / 菜单=primary / 按钮=warning) |
| 状态 | status (el-tag) |
| 操作 | 新增子菜单 / 编辑 / 删除 |

**拖拽排序**：同级拖拽，跨级不允许

**新增/编辑弹窗**（ProForm，根据 type 动态显隐字段）：
- 类型(radio: 目录/菜单/按钮)
- 名称(input, 必填)
- 图标(icon-picker, 目录和菜单显示)
- 排序(number)
- 路由路径(input, 菜单显示)
- 组件路径(input, 菜单显示)
- 权限标识(input, 菜单和按钮显示)
- 上级菜单(tree-select, 可选顶级)
- 状态(switch)

### 4.4 操作日志（src/pages/system/LogPage.vue）

**ProTable 列表**：
| 列 | 字段 |
|----|------|
| 操作人 | username |
| 操作类型 | type (el-tag: 新增=success / 修改=primary / 删除=danger / 其他=info) |
| 模块 | module |
| IP | ip |
| 操作时间 | createdAt |
| 操作内容 | content (截断显示, hover 展开 el-tooltip) |
| 操作 | 查看详情 |

**搜索栏**：时间范围(el-date-picker daterange) + 操作人(input) + 操作类型(select) + 模块(select)

**详情抽屉**（el-drawer）：
- 基本信息：操作人、操作类型、模块、IP、User-Agent、操作时间
- 请求参数：JSON 格式化展示（用 <pre> + JSON.stringify(json, null, 2)）
- 响应结果：JSON 格式化展示
- 耗时

**导出**：CSV 导出（前端生成，Blob 下载）

### 4.5 系统设置（src/pages/system/SettingsPage.vue）

**Tab 式布局**（el-tabs），3 个 Tab：

Tab 1 — 系统参数：
- 系统名称(input)
- Logo 地址(el-upload)
- 版权信息(input)
- 备案号(input)
- 默认首页(select: 工作台/用户管理 等)

Tab 2 — 通用配置：
- 默认分页大小(select: 10/20/50/100)
- Token 过期时间(number, 单位小时, 默认 24)
- 验证码开关(switch)
- 记住我默认(switch)

Tab 3 — 安全策略：
- 密码最小长度(number, 默认 8)
- 密码复杂度(checkbox-group: 大写/小写/数字/特殊字符)
- 登录失败锁定次数(number, 默认 5)
- 锁定时长(number, 单位分钟, 默认 30)
- 账号有效期(number, 单位天, 0=永久)

底部统一保存按钮（Tab 切换不丢失数据，用 reactive 对象统一管理）

### 4.6 部门管理（src/pages/system/DeptPage.vue）

**左树右表布局**（el-row + el-col）：
- 左侧 30%：部门组织架构树（el-tree）
  - 节点：部门名称 + 人数
  - 右键菜单(el-dropdown)：新增子部门 / 编辑 / 删除
  - 拖拽排序
  - 搜索过滤(el-input)
- 右侧 70%：选中部门下的成员列表（ProTable）
  - 列：头像、用户名、昵称、角色、状态
  - 操作：移出部门(confirm) / 修改角色(弹窗)

**部门 CRUD 弹窗**（ProForm）：
- 上级部门(tree-select, 可选顶级)
- 部门名称(input, 必填)
- 负责人(select, 用户列表)
- 排序(number)
- 状态(switch)

## Mock 数据要求

确保 src/mock/system.mock.ts 中有完整的 Mock 数据支持以上所有页面的操作：
- 用户列表 20+ 条（含分页搜索）
- 角色列表 5+ 条
- 菜单树完整（目录/菜单/按钮三级）
- 操作日志 30+ 条（含各种类型）
- 系统设置默认值
- 部门树 3 层以上（含人员关联）

## 不要修改的文件

- `src/pages/login/` 和 `src/pages/register/` 下所有文件
- 主题系统相关文件

## 验收标准

- [ ] 6 个系统管理页面全部可用
- [ ] ProTable 的搜索/分页/排序/选择正常
- [ ] ProForm 的校验/联动正常
- [ ] 权限分配树正常（父子联动/半选）
- [ ] 菜单管理拖拽排序正常
- [ ] 操作日志详情抽屉正常
- [ ] 系统设置 Tab 切换不丢数据
- [ ] 部门管理左树右表联动正常
- [ ] v-permission 指令在按钮上正常工作
- [ ] 所有样式使用 CSS 变量，明暗模式正常
- [ ] npm run dev 正常启动
```

---

## Phase 5 — 新增页面（扩展）

```
你是一个 Vue 3 + TypeScript 专家。请帮我实现中后台系统的扩展页面。

## 项目背景

技术栈：Vue 3.5 + TypeScript 5.7 + Element Plus 2.14 + Pinia 3.0 + SCSS + axios + Mock
路径别名：@ → src/
已有组件：ProTable、ProForm、PageContainer
已有 hooks：useTable、useDialog、usePermission
已有 API：profileApi（@/api/profile）、messageApi（@/api/message）
已有 Mock：src/mock/profile.mock.ts、src/mock/message.mock.ts

## 全局样式约束

**所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值。**

## 任务清单

### 5.1 个人中心

#### 个人资料（src/pages/profile/ProfileInfoPage.vue）

布局：左侧 Tab 导航 + 右侧内容区（或使用 PageContainer 包裹）

内容：
- 头像区域：
  - el-upload 上传 + 裁剪预览
  - 支持点击上传和拖拽上传
  - 圆形头像预览（80x80）
- 可编辑字段：
  - 昵称(input, 必填)
  - 邮箱(input, 邮箱校验)
  - 手机号(input, 手机号校验)
  - 性别(radio: 男/女/保密)
  - 个人简介(textarea, 最多 200 字)
- 只读字段：
  - 用户名(显示, 不可编辑)
  - 角色(显示 el-tag)
  - 部门(显示)
- 底部保存按钮

用 ProForm 或直接用 el-form 实现。

#### 安全设置（src/pages/profile/ProfileSecurityPage.vue）

**修改密码**：
- 旧密码(password, 必填)
- 新密码(password, 必填, 密码强度校验)
  - 强度提示：弱/中/强，分别用 var(--cp-danger) / var(--cp-warning) / var(--cp-success) 颜色
  - 强度条：进度条动画
- 确认密码(password, 必填, 与新密码一致)
- 修改成功后清空表单 + ElMessage.success

**登录记录**：
- ProTable（静态，无搜索，无工具栏）
- 列：登录时间、IP、位置、设备、浏览器、状态(el-tag: 成功=success / 失败=danger)
- 最多展示 20 条
- 数据从 Mock 获取

### 5.2 消息中心

#### 站内消息（src/pages/message/MessageListPage.vue）

列表式消息卡片（不是标准表格，用自定义列表）：

布局：
```
[全部] [通知] [公告]    [全部已读] [批量删除]
────────────────────────────────────
● 消息标题                    时间
  消息内容摘要...
────────────────────────────────────
○ 消息标题                    时间
  消息内容摘要...
────────────────────────────────────
```

- Tab 筛选：全部 / 通知(notification) / 公告(announcement)
- 操作按钮：全部已读、批量删除（多选模式下）
- 每条消息卡片：
  - 左侧未读圆点（未读=主色 var(--cp-primary)，已读=无圆点或灰色 var(--cp-border)）
  - 标题 + 消息类型标签(el-tag: 通知=info / 公告=warning)
  - 内容摘要（2 行截断）
  - 右侧时间
  - 单条操作：标记已读 / 删除
- 点击消息：弹窗展示详情（el-dialog），同时标记为已读
- 底部 el-pagination 分页

#### 通知设置（src/pages/message/MessageSettingsPage.vue）

矩阵布局：
| 消息类型 | 站内通知 | 邮件通知 |
|---------|---------|---------|
| 系统通知 | switch | switch |
| 任务通知 | switch | switch |
| 审批通知 | switch | switch |
| 安全通知 | switch | switch |

用 el-table 或 el-form 实现，底部保存按钮。

### 5.3 组件演示

#### ProTable 演示（src/pages/components/TableDemoPage.vue）

用 PageContainer 包裹，包含多个演示区块：

1. 基础用法：静态数据 + 列配置
2. 搜索表单：input/select/date/daterange 各种控件
3. 分页：request 模式 + 分页
4. 选择：多选 + 批量操作
5. 操作列：按钮 + 确认框
6. 自定义渲染：slot 插槽
7. 工具栏：密度切换 + 列设置

每个演示区块用 el-card 包裹，标题 + 代码说明 + 实际组件。

#### ProForm 演示（src/pages/components/FormDemoPage.vue）

用 PageContainer 包裹：

1. 基础表单：各种字段类型展示
2. 表单校验：必填/格式/自定义规则
3. 联动：显隐联动 + 选项联动 + 禁用联动
4. 分步表单：3 步表单演示

#### DetailLayout 演示（src/pages/components/DetailDemoPage.vue）

用 PageContainer 包裹：

1. 描述列表：el-descriptions 展示键值对
2. 时间线：el-timeline 展示操作记录
3. 状态流转：el-steps 步骤条

## Mock 数据要求

确保 src/mock/profile.mock.ts 中有：
- 个人资料 Mock（GET /api/profile/info, PUT /api/profile/info）
- 修改密码 Mock（PUT /api/profile/password）
- 登录记录 Mock（GET /api/profile/login-logs，20 条）

确保 src/mock/message.mock.ts 中有：
- 消息列表 Mock（GET /api/message/list，支持分页 + type 筛选，30 条）
- 标记已读 Mock（PUT /api/message/:id/read）
- 全部已读 Mock（PUT /api/message/read-all）
- 删除消息 Mock（DELETE /api/message/:id）
- 通知设置 Mock（GET/PUT /api/message/settings）

## 不要修改的文件

- `src/pages/login/` 和 `src/pages/register/` 下所有文件
- 主题系统相关文件

## 验收标准

- [ ] 个人资料页可编辑保存
- [ ] 修改密码功能正常（强度提示 + 颜色用 CSS 变量）
- [ ] 登录记录列表正常
- [ ] 消息列表 Tab 切换/已读/删除正常
- [ ] 消息详情弹窗正常
- [ ] 通知设置矩阵正常
- [ ] 组件演示页内容丰富
- [ ] 所有样式使用 CSS 变量，明暗模式正常
- [ ] npm run dev 正常启动
```

---

## Phase 6 — 打磨（抛光）

```
你是一个 Vue 3 + TypeScript 专家。请帮我完成中后台项目的最终打磨工作。

## 项目背景

技术栈：Vue 3.5 + TypeScript 5.7 + Element Plus 2.14 + Pinia 3.0 + SCSS + axios + ECharts + Mock
路径别名：@ → src/

## 全局样式约束

**所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值。**

## 任务清单

### 6.1 安装 ECharts

```bash
npm install echarts
```

### 6.2 工作台 Dashboard 增强

重构 `src/pages/dashboard/DashboardPage.vue`：

用 PageContainer 包裹，布局自上而下：

**统计卡片行**（4 列 el-row）：
| 卡片 | 数据键 | 增强效果 |
|------|--------|---------|
| 访问量 | visits | 底部 mini sparkline 趋势线 + 环比百分比 |
| 用户数 | users | 底部 mini sparkline 趋势线 + 环比百分比 |
| 待处理 | pending | 底部进度条 + "查看详情"链接 |
| 健康度 | health | 环形进度图 + 状态文字 |

- 数据从 dashboardApi 获取（Mock），带 loading skeleton（3 行占位骨架）
- 卡片右上角小图标
- 环比正增长成功色(var(--cp-success))箭头↑，负增长危险色(var(--cp-danger))箭头↓
- 卡片样式：var(--cp-bg-elevated) 背景，var(--cp-border) 边框，$radius-lg 圆角，$shadow 阴影

**趋势图表区域**（el-row，7:5 比例）：
- 左侧（60%）：ECharts 折线图
  - 近 7 天访问量趋势
  - 双折线：今日 vs 昨日对比
  - 带标题"访问趋势"
  - 带 loading 状态
- 右侧（40%）：待办列表
  - 最多 5 条
  - 每条：标题 + 类型标签(el-tag) + 时间 + 状态
  - 操作：点击跳转、标记完成(el-checkbox)
  - 底部"查看全部"链接

**快捷入口行**：
- 默认 6 个：用户管理、角色管理、菜单管理、操作日志、系统设置、个人中心
- 每个入口：图标(el-icon) + 标题 + 描述
- 点击跳转对应页面
- 卡片样式：hover 时上浮 + var(--cp-bg-hover) 背景

### 6.3 图表主题工具函数

创建 `src/utils/chart-theme.ts`：

```typescript
export function getChartTheme(isDark: boolean) {
  const style = getComputedStyle(document.documentElement)
  const getColor = (name: string) => style.getPropertyValue(name).trim()

  return {
    textColor: getColor('--cp-text-secondary'),
    axisLineColor: getColor('--cp-border'),
    splitLineColor: getColor('--cp-border-light'),
    primaryColor: getColor('--cp-primary'),
    successColor: getColor('--cp-success'),
    warningColor: getColor('--cp-warning'),
    dangerColor: getColor('--cp-danger'),
    seriesColors: [
      getColor('--cp-primary'),
      getColor('--cp-success'),
      getColor('--cp-warning'),
      getColor('--cp-danger'),
      getColor('--cp-info'),
    ],
    tooltipBg: getColor('--cp-bg-overlay'),
    tooltipBorder: getColor('--cp-border'),
  }
}
```

在 Dashboard 中使用：
```typescript
import { useThemeStore } from '@/stores/theme'
import { getChartTheme } from '@/utils/chart-theme'

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.themeMode === 'dark')

// 图表初始化时
const chartTheme = getChartTheme(isDark.value)
// 监听主题变化，重新渲染图表
watch(isDark, () => {
  const newTheme = getChartTheme(isDark.value)
  chart.setOption(buildOption(newTheme))
})
```

### 6.4 视觉细节打磨

检查并修复以下视觉问题：

1. **卡片一致性**：所有卡片统一使用 $radius-lg 圆角、var(--cp-border) 边框、$shadow 阴影
2. **按钮一致性**：所有按钮高度 36px，$radius-md 圆角
3. **输入框一致性**：所有输入框高度 36px，$radius-md 圆角，focus 状态主色边框
4. **表格行高**：默认 52px，hover 行背景 var(--cp-bg-hover)
5. **间距统一**：页面内边距 $spacing-lg(24px)，卡片间距 $spacing-md(16px)，卡片内边距 $spacing-lg(24px)
6. **过渡动画**：所有交互元素添加 transition: all $transition-base

### 6.5 暗色模式全覆盖检查

遍历所有新增/修改的组件，确保：

1. 所有背景色用 var(--cp-bg) / var(--cp-bg-elevated) / var(--cp-bg-overlay) / var(--cp-bg-hover)
2. 所有文本色用 var(--cp-text) / var(--cp-text-secondary) / var(--cp-text-tertiary)
3. 所有边框色用 var(--cp-border) / var(--cp-border-light)
4. 没有任何 hex / rgb / 颜色名硬编码
5. ECharts 图表配色通过 getChartTheme() 从 CSS 变量获取
6. Element Plus 组件用 type 属性，不写死 style 颜色
7. 任何自定义遮罩/阴影的颜色也通过 CSS 变量或 SCSS 变量引用

如果发现遗漏，创建对应的 CSS 变量：
- 在 `src/styles/global.scss` 的 `:root` 中定义亮色值
- 在 `[data-theme='dark']` 中定义暗色值
- 命名规范：`--cp-{语义名}`

### 6.6 响应式适配

为 Layout 添加响应式断点处理：

- **< 768px（移动端）**：
  - 侧边栏变为抽屉模式（覆盖式），点击汉堡按钮打开
  - 顶栏隐藏面包屑
  - 多标签页隐藏
  - 统计卡片变为 1 列
  - 趋势图和待办变为 1 列
  - 快捷入口变为 2 列

- **768px ~ 1024px（平板）**：
  - 侧边栏默认折叠
  - 统计卡片 2 列
  - 趋势图和待办保持 2 列
  - 快捷入口 3 列

- **> 1024px（桌面）**：
  - 正常布局
  - 统计卡片 4 列
  - 快捷入口 6 列

使用 SCSS mixins：@include media-max($breakpoint-md) / @include media-min($breakpoint-lg)

### 6.7 性能优化

1. **路由懒加载**：确保所有页面组件都是 `() => import(...)` 形式
2. **组件按需引入**：Element Plus 组件按需引入（如果未配置）
3. **图片懒加载**：Dashboard 快捷入口图标等小资源用 SVG inline
4. **Mock 数据生成优化**：大量 Mock 数据用工厂函数生成，不用手写

## 不要修改的文件

- `src/pages/login/` 和 `src/pages/register/` 下所有文件
- `src/stores/theme.ts` 和 `src/config/theme.ts`
- `src/styles/variables.scss` 和 `src/styles/mixins.scss`

## 验收标准

- [ ] Dashboard 统计卡片数据动态化 + skeleton loading
- [ ] ECharts 折线图正常渲染
- [ ] 图表配色从 CSS 变量获取，明暗模式切换正常
- [ ] 快捷入口可点击跳转
- [ ] 待办列表交互正常
- [ ] 所有视觉细节统一（圆角/边框/阴影/间距）
- [ ] 暗色模式下所有页面视觉正常
- [ ] 移动端/平板/桌面三种断点下布局正常
- [ ] npm run dev 正常启动
- [ ] npm run build 构建成功
```
