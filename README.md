# 中台基座

一个基于 Vue 3 + TypeScript + Vite 构建的前端中台基础框架，提供完整的后台管理系统基础能力。

## 项目简介

中台基座是一个开箱即用的中后台前端解决方案，集成了用户认证、权限管理、主题切换、布局配置、页面动画等核心功能，并保留了精美的登录页动画效果。

## ✨ 最新特性（v1.1.0）

- 🎨 **模块化布局系统** - 3 种布局模式随心切换（侧边栏+顶栏 / 仅顶栏 / 仅侧边栏）
- ⚙️ **全局配置面板** - 一站式配置布局、主题、Logo、固定顶栏、动态标题、页面动画
- 🎬 **页面切换动画** - 6 种精美动画效果（淡入淡出、滑动淡入、上滑进入、右侧滑入、缩放、无动画）
- 👁️ **可视化预览** - 动画效果卡片式选择器，循环预览动画
- 💾 **自动持久化** - 使用 pinia-plugin-persistedstate 自动保存配置
- 🌈 **圆形扩散动画** - 主题切换时的精美过渡效果
- 👤 **用户头像** - 退出登录确认对话框

## 技术栈

- **框架**: Vue 3.5 + Composition API
- **语言**: TypeScript 5.7
- **构建工具**: Vite 6.0
- **UI 组件库**: Element Plus 2.14
- **图标**: Element Plus Icons + Lucide Vue Next
- **路由**: Vue Router 4.6
- **状态管理**: Pinia 3.0 + pinia-plugin-persistedstate
- **样式**: SCSS + CSS Variables (支持暗色模式)

## 功能特性

### 核心功能
- ✅ 用户登录/注册
- ✅ 表单验证（Element Plus Rules）
- ✅ 图形验证码
- ✅ 用户协议
- ✅ 路由权限守卫
- ✅ 模块化布局系统（3 种布局模式）
- ✅ 全局配置面板（布局、主题、Logo、固定顶栏、动态标题、页面动画）
- ✅ 侧边栏菜单（支持折叠）
- ✅ 用户信息展示 + 头像
- ✅ 退出登录确认对话框
- ✅ 主题系统（light/dark 模式 + 圆形扩散动画）
- ✅ 主题色切换（5 种预设颜色）
- ✅ 页面切换动画（6 种动画效果 + 可视化预览）
- ✅ 自动持久化存储（pinia-plugin-persistedstate）

### 布局系统
- 🎨 **3 种布局模式**：
  - 侧边栏+顶栏模式（默认）- 完整的后台管理布局
  - 仅顶栏模式 - 无侧边栏，适合简单页面
  - 仅侧边栏模式 - 无顶栏，类似全屏管理
- 📐 **模块化设计**：AppSidebar、AppHeader、AppMain、AppFooter、AppSettings
- ⚙️ **全局配置面板**：实时切换布局、主题、动画等
- 📌 **固定顶栏可选**：支持滚动时固定头部
- 💾 **配置持久化**：所有配置自动保存，刷新后保留

### 页面切换动画
- 🎬 **6 种动画效果**：
  - 淡入淡出 - 简单的透明度变化
  - 滑动淡入 - 左右滑动 + 淡入（默认）
  - 上滑进入 - 从下方滑入
  - 右侧滑入 - 从右侧全屏滑入
  - 缩放 - 缩放 + 淡入淡出
  - 无动画 - 瞬间切换
- 👁️ **可视化预览**：卡片式选择器，循环播放动画预览
- ⚡ **纯 CSS3 实现**：性能优异，GPU 加速
- 🔄 **实时切换**：点击卡片立即生效，无需刷新

### 登录页特性
- 👀 角色眼睛跟随鼠标移动
- 😉 随机眨眼动画
- 🫣 开始输入时角色互相对视
- 🙈 密码可见时角色转头回避，紫色角色偶尔偷瞄
- 📱 响应式布局，移动端自动隐藏左侧面板
- 🎨 主题色联动，支持 light/dark 模式
- 📝 使用 Element Plus 表单组件
- ✨ 账号支持用户名或手机号登录

### 主题系统
- 🌓 **明暗模式**：light/dark 两种模式
- 🎨 **5 种预设主题色**：青色、靛蓝、紫色、蓝色、绿色
- 🎭 **圆形扩散动画**：主题切换时的精美过渡效果（0.6s）
- 💾 **持久化存储**：主题设置自动保存
- 🔄 **全局联动**：Element Plus 组件自动跟随主题色变化

### 注册页特性
- 📋 完整的表单验证（用户名、手机号、邮箱、密码）
- 🔐 密码强度校验（8-20位，必须包含字母和数字）
- 🖼️ 图形验证码（自动生成，点击刷新）
- 📜 用户协议（Markdown 渲染，弹窗展示）
- ✅ 必须同意协议才能注册

### 页面模块
- **登录页**: 账号密码登录（支持用户名/手机号）
- **注册页**: 完整注册流程
- **工作台**: 数据概览、快捷入口、待办事项
- **系统管理**:
  - 用户管理
  - 角色管理
  - 菜单管理
- **异常页面**: 404 页面

## 目录结构

```
src/
├── app/                    # 应用级组件
│   └── App.vue            # 根组件
├── assets/                # 静态资源
├── components/            # 通用组件
│   ├── common/           # 公共组件
│   └── login/            # 登录页动画组件
│       ├── AnimatedCharacters.vue
│       ├── EyeBall.vue
│       └── Pupil.vue
├── config/               # 配置文件
│   ├── menu.ts          # 菜单配置
│   └── theme.ts         # 主题配置
├── layouts/             # 布局组件
│   ├── index.vue               # 主布局入口
│   └── components/             # 布局子组件
│       ├── AppSidebar.vue      # 侧边栏
│       ├── AppHeader.vue       # 顶栏
│       ├── AppMain.vue         # 主内容区
│       ├── AppFooter.vue       # 底栏
│       └── AppSettings.vue     # 全局配置面板
├── pages/               # 页面组件
│   ├── login/          # 登录页
│   ├── dashboard/      # 工作台
│   ├── system/         # 系统管理
│   └── exception/      # 异常页面
├── router/             # 路由配置
│   └── index.ts
├── stores/             # 状态管理
│   ├── app.ts         # 应用状态
│   ├── user.ts        # 用户状态
│   ├── theme.ts       # 主题状态
│   └── layout.ts      # 布局配置状态
├── styles/                   # 全局样式
│   ├── index.scss           # SCSS 样式入口
│   ├── variables.scss       # 设计令牌（颜色、字体、间距等）
│   ├── mixins.scss          # 可复用 mixin（布局、响应式、动画等）
│   ├── global.scss          # 全局样式（重置、工具类）
│   └── element-override.scss # Element Plus 主题定制
├── types/             # TypeScript 类型定义
│   └── index.ts
├── utils/             # 工具函数
└── main.ts           # 应用入口
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
npm run dev
```

访问地址：**http://localhost:9001/**

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## Demo 登录账号

**账号**: admin  
**密码**: 12345678

**30 天免登录功能**：
- ✅ 勾选"30天内免登录"：Token 30 天后过期
- ⏳ 不勾选：Token 7 天后过期
- 🔐 过期后自动退出登录，需重新登录

> 注意：当前使用的是 demo 登录逻辑，登录成功后会在 localStorage 中保存 token 和过期时间。实际使用时需要对接真实的后端 API。

## 注册账号

访问 **/register** 路由即可进入注册页面，注册要求：

- **用户名**：4-20个字符，只能包含字母、数字、下划线（必填）
- **手机号**：中国大陆手机号格式（与邮箱至少填一个）
- **邮箱**：标准邮箱格式（与手机号至少填一个）
- **密码**：8-20位，可包含字母、数字、特殊字符（必填）
- **确认密码**：需与密码一致（必填）
- **图形验证码**：点击图片可刷新（必填）
- **用户协议**：必须勾选同意（必填）

注册成功后会自动跳转到登录页。

## 主题系统

### 主题模式

支持 **light** 和 **dark** 两种主题模式，通过右上角的主题切换按钮即可切换。主题设置会自动保存到 localStorage，刷新后保持。

### 主题切换动画

切换主题时会播放**圆形扩散动画**：
- 以点击位置为中心
- 圆形扩散效果（clip-path）
- 平滑过渡到新主题
- 动画时长 0.6s

### 主题色

提供 5 种预设主题色：
- 青色 (#06b6d4) - 默认
- 靛蓝 (#4f46e5)
- 紫色 (#9333ea)
- 蓝色 (#0ea5e9)
- 绿色 (#10b981)

主题色会应用到：
- 登录页左侧背景渐变
- 登录页按钮、输入框 focus 状态
- 后台布局的主色调
- Element Plus 组件主色

### 自定义主题

主题系统基于 **SCSS 变量 + CSS Variables** 实现，提供强大的样式复用能力。

#### SCSS 样式系统

项目已完成 CSS 到 SCSS 的迁移，提供：
- 📦 **完整的设计令牌系统**：颜色、字体、间距、圆角、阴影等
- 🔧 **30+ 实用 mixin**：布局、文本处理、响应式、动画等
- 🎨 **Element Plus 主题定制**：统一组件样式
- 🌓 **暗色模式支持**：优雅的主题切换
- ⚡ **自动导入**：所有组件可直接使用变量和 mixin，无需手动引入

#### 快速开始

在组件中使用 SCSS：

```vue
<style scoped lang="scss">
.button {
  // 使用变量
  padding: $spacing-md $spacing-lg;
  background: $primary;
  border-radius: $radius-md;
  
  // 使用 mixin
  @include flex-center;
  @include hover-lift;
  
  // 响应式
  @include mobile {
    padding: $spacing-sm;
  }
  
  // 暗色模式
  @include dark-mode {
    background: $dark-bg;
  }
}
</style>
```

#### 文档

- 📘 [完整迁移指南](./wiki/guides/SCSS_MIGRATION_GUIDE.md) - 详细的迁移步骤和配置说明
- 📗 [快速参考卡片](./wiki/references/SCSS_QUICK_REFERENCE.md) - 常用变量和 mixin 速查表
- 📙 [迁移示例对比](./wiki/guides/SCSS_MIGRATION_EXAMPLES.md) - 8 个实际案例展示迁移前后的差异

#### 核心变量

```scss
// 主题色
$primary: #4f46e5;
$primary-hover: #4338ca;

// 间距
$spacing-sm: 8px;
$spacing-md: 16px;
$spacing-lg: 24px;

// 字体
$font-sm: 14px;
$font-base: 16px;
$font-semibold: 600;

// 响应式断点
$breakpoint-md: 768px;
$breakpoint-lg: 1024px;
```

详细变量列表请查看 `src/styles/variables.scss`。

## 后续开发建议

### 1. 布局和动画

项目已完成布局系统重构和页面动画功能：
- ✅ 模块化布局组件（AppSidebar、AppHeader、AppMain、AppFooter、AppSettings）
- ✅ 3 种布局模式切换
- ✅ 全局配置面板（6 大配置项）
- ✅ 6 种页面切换动画 + 可视化预览
- ✅ 自动持久化存储（pinia-plugin-persistedstate）

### 2. SCSS 组件迁移

项目已完成 CSS 到 SCSS 基础设施搭建，当前进度：
- ✅ 基础设施：SCSS 配置、变量、mixin 已完成
- ✅ 所有 18 个组件已完成 SCSS 迁移（2026-07-07）
- ✅ 使用 SCSS 变量和 mixin 替换硬编码值
- ✅ 使用 CSS 变量（var(--cp-*)）支持动态主题切换

**参考文档**：
- [SCSS 迁移指南](./wiki/guides/SCSS_MIGRATION_GUIDE.md)
- [快速参考卡片](./wiki/references/SCSS_QUICK_REFERENCE.md)
- [迁移示例](./wiki/guides/SCSS_MIGRATION_EXAMPLES.md)

### 3. 接入真实后端

修改 `src/stores/user.ts` 中的 `login` 方法，对接真实的登录 API：

```typescript
async function login(payload: LoginPayload) {
  const response = await fetch('/api/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  
  if (data.success) {
    token.value = data.token
    userInfo.value = data.user
    // 保存到 localStorage
  }
}
```

### 4. 扩展页面

在 `src/pages/` 下创建新页面，然后在 `src/router/index.ts` 中添加路由配置。

### 5. 权限管理

可以基于 `userInfo.roles` 实现更细粒度的权限控制：

```typescript
// router/index.ts
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  const requiredRoles = to.meta.roles as string[]
  
  if (requiredRoles && !hasPermission(userStore.userInfo?.roles, requiredRoles)) {
    next('/403')
  } else {
    next()
  }
})
```

### 6. 接口封装

建议创建 `src/api/` 目录，统一管理所有 API 请求：

```typescript
// src/api/user.ts
export const userApi = {
  login: (data: LoginPayload) => request.post('/auth/login', data),
  getUserInfo: () => request.get('/user/info'),
  logout: () => request.post('/auth/logout'),
}
```

### 7. 错误处理

添加全局错误处理和请求拦截器，统一处理 token 过期、网络错误等情况。

### 8. 国际化

如需支持多语言，可以集成 `vue-i18n`。

## 开发规范

- 使用 TypeScript 编写代码，尽量明确类型
- 组件使用 `<script setup>` 语法
- 样式使用 SCSS，优先使用设计令牌（变量）和 mixin
- 为 `<style>` 标签添加 `lang="scss"` 属性
- 避免硬编码样式值，使用 `$primary`、`$spacing-md` 等变量
- 使用响应式 mixin（`@include mobile`）而非原始媒体查询
- 路由懒加载所有页面组件
- Store 使用 Composition API 风格
- 提交前确保 `npm run build` 通过

### 样式编写示例

```vue
<style scoped lang="scss">
// ✅ 推荐：使用变量和 mixin
.card {
  padding: $spacing-lg;
  background: $bg;
  border-radius: $radius-md;
  @include flex-between;
  
  @include mobile {
    padding: $spacing-md;
  }
}

// ❌ 不推荐：硬编码值
.card {
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
  
  @media (max-width: 767px) {
    padding: 16px;
  }
}
</style>
```

## 更新日志

### v1.1.0 (2026-07-09)

**新增**：
- ✅ 重构 layouts 为模块化组件架构
- ✅ 新增全局配置面板（6 大配置项）
- ✅ 新增页面切换动画功能（6 种动画 + 可视化预览）
- ✅ 集成 pinia-plugin-persistedstate 自动持久化
- ✅ 新增 layoutStore 管理布局配置
- ✅ 支持 3 种布局模式切换
- ✅ 支持动态标题配置

**组件**：
- 创建 layouts/index.vue 主布局入口
- 创建 AppSidebar、AppHeader、AppMain、AppFooter、AppSettings 子组件
- 删除旧的 BasicLayout.vue

**文档**：
- [布局重构报告](./wiki/reports/LAYOUTS_REFACTOR_REPORT.md)
- [页面动画功能报告](./wiki/reports/PAGE_TRANSITION_FEATURE.md)

### v1.0.2 (2026-07-08)

**新增**：
- ✅ 主题切换圆形扩散动画
- ✅ 退出登录确认对话框
- ✅ 用户头像显示

**优化**：
- 优化主题切换体验
- 优化用户菜单交互

### v1.0.1 (2026-07-07)

**完成**：
- ✅ 完成所有 18 个组件的 SCSS 迁移
- ✅ 替换所有硬编码值为 SCSS 变量
- ✅ 使用 CSS 变量支持动态主题切换
- ✅ 优化组件样式，移除内联样式

### v1.0.0 (2026-07-06)

**新增**：
- ✅ 完整的 SCSS 样式系统
- ✅ 60+ 设计令牌变量
- ✅ 30+ 实用 mixin 工具
- ✅ Wiki 文档中心

## 许可证

MIT

---

**当前版本**: 1.1.0  
**最后更新**: 2026-07-09
