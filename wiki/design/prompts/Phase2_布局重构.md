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
