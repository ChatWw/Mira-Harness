# 中台基座项目说明

这是一个基于 Vue 3 + TypeScript + Vite + Element Plus 构建的前端中台基础框架。

---

## 项目概述

**项目名称**: 中台基座  
**版本**: 1.0.0  
**最后更新**: 2026-07-06

### 技术栈

- **框架**: Vue 3.5 (Composition API)
- **语言**: TypeScript 5.7
- **构建工具**: Vite 6.0
- **UI 组件库**: Element Plus 2.14
- **状态管理**: Pinia 3.0
- **路由**: Vue Router 4.6
- **样式系统**: SCSS + CSS Variables
- **图标**: Element Plus Icons + Lucide Vue Next

### 核心特性

- ✅ 完整的用户认证系统（登录/注册/权限守卫）
- ✅ 响应式后台管理布局
- ✅ 主题系统（light/dark 模式 + 5 种预设颜色）
- ✅ SCSS 样式系统（60+ 设计令牌，30+ mixin）
- ✅ 可折叠侧边栏菜单
- ✅ 精美的登录页动画效果
- ✅ 本地持久化存储

---

## 项目结构

```
core-platform/
├── src/
│   ├── app/              # 应用级组件
│   ├── components/       # 通用组件
│   │   ├── common/      # 公共组件（Captcha等）
│   │   └── login/       # 登录页动画组件
│   ├── config/          # 配置文件
│   │   ├── menu.ts      # 菜单配置
│   │   └── theme.ts     # 主题配置
│   ├── layouts/         # 布局组件
│   │   └── BasicLayout.vue
│   ├── pages/           # 页面组件
│   │   ├── dashboard/   # 工作台
│   │   ├── login/       # 登录页
│   │   ├── register/    # 注册页
│   │   ├── system/      # 系统管理（用户/角色/菜单）
│   │   └── exception/   # 异常页面
│   ├── router/          # 路由配置
│   ├── stores/          # 状态管理
│   │   ├── app.ts       # 应用状态
│   │   ├── user.ts      # 用户状态
│   │   └── theme.ts     # 主题状态
│   ├── styles/          # 全局样式（SCSS）
│   │   ├── index.scss   # 样式入口
│   │   ├── variables.scss    # 设计令牌
│   │   ├── mixins.scss       # Mixin 工具库
│   │   ├── global.scss       # 全局样式
│   │   └── element-override.scss  # Element Plus 定制
│   ├── types/           # TypeScript 类型定义
│   ├── utils/           # 工具函数
│   └── main.ts          # 应用入口
├── wiki/                # 项目文档中心
│   ├── guides/          # 开发指南
│   ├── references/      # 快速参考
│   └── reports/         # 项目报告
├── vite.config.ts       # Vite 配置
├── package.json         # 依赖配置
└── README.md            # 项目说明
```

---

## 样式系统（SCSS）

### 设计令牌（variables.scss）

项目采用完整的设计令牌系统，包含：

**颜色系统**：
- 主题色：`$primary`, `$primary-hover`, `$primary-light`（默认：青色 #06b6d4）
- 语义色：`$success`, `$warning`, `$danger`, `$info`
- 中性色：`$bg`, `$text`, `$border`（支持亮/暗模式）

**间距系统**：
- `$spacing-xs` (4px) ~ `$spacing-3xl` (64px)

**字体系统**：
- 字号：`$font-xs` (12px) ~ `$font-4xl` (36px)
- 字重：`$font-normal`, `$font-semibold`, `$font-bold`

**其他**：
- 圆角：`$radius-sm` ~ `$radius-full`
- 阴影：`$shadow-sm` ~ `$shadow-xl`
- 断点：`$breakpoint-xs` ~ `$breakpoint-2xl`

### Mixin 工具库（mixins.scss）

提供 30+ 实用 mixin：

**布局**：
- `@include flex-center` - 水平垂直居中
- `@include flex-between` - 两端对齐
- `@include absolute-center` - 绝对定位居中

**文本处理**：
- `@include text-ellipsis` - 单行截断
- `@include text-clamp($lines)` - 多行截断

**响应式**：
- `@include mobile { }` - 移动端样式（< 768px）
- `@include desktop { }` - 桌面端样式（>= 1024px）
- `@include media-min($breakpoint)` - 自定义断点

**视觉效果**：
- `@include glass-effect($opacity)` - 玻璃态效果
- `@include hover-lift` - 悬停上浮
- `@include gradient-bg($start, $end)` - 渐变背景

**主题**：
- `@include dark-mode { }` - 暗色模式样式

### 自动导入

所有变量和 mixin 通过 Vite 配置自动导入，组件中无需手动引入：

```vue
<style scoped lang="scss">
.card {
  padding: $spacing-lg;        // 直接使用变量
  background: $primary;
  @include flex-center;        // 直接使用 mixin
  
  @include mobile {            // 响应式
    padding: $spacing-md;
  }
  
  @include dark-mode {         // 暗色模式
    background: $dark-bg;
  }
}
</style>
```

---

## 主题系统

### 主题模式

支持 **light** 和 **dark** 两种模式，通过右上角主题切换按钮即可切换。

### 主题色

提供 5 种预设主题色：
- 青色 (#06b6d4) - 默认
- 靛蓝 (#4f46e5)
- 紫色 (#9333ea)
- 蓝色 (#0ea5e9)
- 绿色 (#10b981)

### 主题切换实现

通过修改 HTML 根元素的 `data-theme` 属性：
```typescript
document.documentElement.setAttribute('data-theme', 'dark')
```

SCSS 中使用 `@include dark-mode` 适配：
```scss
.component {
  background: $bg;
  
  @include dark-mode {
    background: $dark-bg;
  }
}
```

---

## 状态管理

### 核心 Store

**appStore** (`stores/app.ts`)：
- 侧边栏折叠状态
- 应用全局状态

**userStore** (`stores/user.ts`)：
- 用户信息
- Token 管理
- 登录/登出逻辑
- 权限信息

**themeStore** (`stores/theme.ts`)：
- 主题模式（light/dark）
- 主题色选择
- 主题持久化

### 使用示例

```typescript
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const isLoggedIn = computed(() => !!userStore.token)
```

---

## 路由系统

### 路由守卫

**全局前置守卫** (`router/index.ts`)：
- 检查 Token 验证登录状态
- 未登录用户重定向到登录页
- 已登录用户访问登录页重定向到工作台

### 路由配置

- **公开路由**：`/login`, `/register`
- **受保护路由**：`/dashboard`, `/system/*`
- **异常路由**：`/404`

### 路由懒加载

所有页面组件采用懒加载：
```typescript
component: () => import('@/pages/dashboard/DashboardPage.vue')
```

---

## 组件说明

### 登录页特性

**登录页动画**（`pages/login/LoginPage.vue`）：
- 👀 角色眼睛跟随鼠标移动
- 😉 随机眨眼动画
- 🫣 输入时角色互相对视
- 🙈 密码可见时角色回避
- 📱 响应式布局

**动画组件**：
- `AnimatedCharacters.vue` - 角色动画容器
- `EyeBall.vue` - 眼球组件
- `Pupil.vue` - 瞳孔组件

### 布局组件

**BasicLayout**（`layouts/BasicLayout.vue`）：
- 响应式侧边栏（支持折叠）
- 固定头部
- 主题切换按钮
- 用户信息下拉菜单

---

## 开发指南

### 样式开发

✅ **推荐写法**：
```vue
<style scoped lang="scss">
.card {
  padding: $spacing-lg;
  background: $bg;
  @include flex-between;
  
  @include mobile {
    padding: $spacing-md;
  }
}
</style>
```

❌ **不推荐写法**：
```vue
<style scoped>
.card {
  padding: 24px;
  background: #ffffff;
  display: flex;
  justify-content: space-between;
}
</style>
```

### 组件开发

1. 使用 `<script setup>` 语法
2. 明确 TypeScript 类型
3. Props 使用 `withDefaults` 提供默认值
4. 样式使用 SCSS 和设计令牌
5. 响应式使用 mixin 而非原始媒体查询

### 命名规范

- **组件**：PascalCase（`UserPage.vue`）
- **文件夹**：小写+连字符（`user-management/`）
- **变量/函数**：camelCase（`userName`, `getUserInfo`）
- **常量**：UPPER_SNAKE_CASE（`API_BASE_URL`）
- **SCSS 变量**：kebab-case（`$spacing-md`, `$primary-color`）

---

## Demo 账号

**登录账号**：admin  
**密码**：12345678

**30 天免登录功能**：
- ✅ 勾选"30天内免登录"：Token 30 天后过期
- ⏳ 不勾选：Token 7 天后过期  
- 🔐 Token 过期后自动退出登录，需重新登录
- 💾 过期时间存储在 localStorage 中

**实现机制**：
```typescript
// 登录时设置过期时间
if (payload.remember) {
  expireTime = Date.now() + 30 * 24 * 60 * 60 * 1000  // 30天
} else {
  expireTime = Date.now() + 7 * 24 * 60 * 60 * 1000   // 7天
}

// 每次路由守卫检查是否过期
const isTokenExpired = (): boolean => {
  const expireTime = localStorage.getItem(TOKEN_EXPIRE_KEY)
  return Date.now() > Number(expireTime)
}
```

> 注意：当前使用 demo 登录逻辑，实际使用需对接真实后端 API。

---

## 后续开发建议

### 1. SCSS 组件迁移

**当前进度**：
- ✅ SCSS 基础设施已完成
- ✅ LoginPage 已迁移
- ⏳ 12 个组件待迁移

**参考文档**：
- [SCSS 迁移指南](./wiki/guides/SCSS_MIGRATION_GUIDE.md)
- [快速参考卡片](./wiki/references/SCSS_QUICK_REFERENCE.md)
- [迁移示例](./wiki/guides/SCSS_MIGRATION_EXAMPLES.md)

### 2. 接入真实后端

修改 `stores/user.ts` 对接真实 API：
```typescript
async function login(payload: LoginPayload) {
  const response = await fetch('/api/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  // 处理响应...
}
```

### 3. 权限管理

基于 `userInfo.roles` 实现细粒度权限控制：
- 路由级权限（路由守卫）
- 按钮级权限（v-if 指令）
- 菜单权限（动态菜单）

### 4. API 封装

建议创建 `src/api/` 目录统一管理：
```typescript
// src/api/user.ts
export const userApi = {
  login: (data) => request.post('/auth/login', data),
  getUserInfo: () => request.get('/user/info'),
}
```

### 5. 错误处理

- 全局错误处理
- 请求拦截器
- Token 过期处理
- 网络错误提示

---

## 开发规范

### 代码规范

- ✅ 使用 TypeScript，明确类型
- ✅ 组件使用 `<script setup>` 语法
- ✅ 样式使用 SCSS，优先使用设计令牌
- ✅ 避免硬编码，使用变量和常量
- ✅ 路由懒加载所有页面组件
- ✅ Store 使用 Composition API 风格
- ✅ 提交前确保 `npm run build` 通过

### Git 规范

提交信息格式：
```
feat: 添加用户管理页面
fix: 修复登录页样式问题
style: 迁移组件到 SCSS
docs: 更新开发文档
refactor: 重构路由配置
```

---

## 文档资源

### Wiki 文档中心

项目文档统一存放在 `wiki/` 目录：

- **指南类** (`wiki/guides/`)：迁移指南、开发指南、最佳实践
- **参考类** (`wiki/references/`)：快速参考、API 文档、配置说明
- **报告类** (`wiki/reports/`)：项目报告、技术决策记录

查看 [wiki/README.md](./wiki/README.md) 了解完整文档索引。

### SCSS 相关文档

- [SCSS 迁移指南](./wiki/guides/SCSS_MIGRATION_GUIDE.md)
- [SCSS 快速参考](./wiki/references/SCSS_QUICK_REFERENCE.md)
- [迁移示例对比](./wiki/guides/SCSS_MIGRATION_EXAMPLES.md)

---

## 最佳实践

### 组件通信

- **父→子**：Props
- **子→父**：Emits
- **跨组件**：Pinia Store
- **事件总线**：不推荐（使用 Pinia 替代）

### 性能优化

- ✅ 路由懒加载
- ✅ 组件懒加载（v-if + 异步组件）
- ✅ 图片懒加载
- ✅ 避免深层嵌套
- ✅ 合理使用计算属性

### 安全建议

- ⚠️ 不要在前端存储敏感信息
- ⚠️ Token 存储使用 localStorage（可考虑 httpOnly cookie）
- ⚠️ API 请求添加 CSRF 防护
- ⚠️ 输入验证（前端 + 后端双重验证）

---

## 常见问题

### Q: 如何添加新页面？

1. 在 `src/pages/` 下创建页面组件
2. 在 `src/router/index.ts` 添加路由
3. 在 `src/config/menu.ts` 添加菜单项（如需要）

### Q: 如何切换主题？

使用 `themeStore`：
```typescript
const themeStore = useThemeStore()
themeStore.setMode('dark')        // 切换模式
themeStore.setPrimaryColor('#9333ea')  // 切换主题色
```

### Q: 如何使用 SCSS 变量？

在组件中直接使用，无需导入：
```vue
<style scoped lang="scss">
.button {
  padding: $spacing-md;  // 直接使用
  color: $primary;
}
</style>
```

### Q: 组件样式不生效？

1. 检查是否添加了 `lang="scss"`
2. 检查变量名是否正确
3. 检查是否需要使用 `:deep()` 穿透

---

## 技术债务

### 当前已知问题

- [ ] 12 个组件待迁移到 SCSS
- [ ] 缺少单元测试
- [ ] 缺少 E2E 测试
- [ ] 缺少 API Mock 数据
- [ ] 缺少国际化支持

### 优化建议

- [ ] 配置 Stylelint（SCSS 代码规范）
- [ ] 配置 ESLint + Prettier
- [ ] 集成 Vitest（单元测试）
- [ ] 集成 Playwright（E2E 测试）
- [ ] 配置 CI/CD 流程

---

## 更新日志

### v1.0.0 (2026-07-06)

**新增**：
- ✅ 完整的 SCSS 样式系统
- ✅ 60+ 设计令牌变量
- ✅ 30+ 实用 mixin 工具
- ✅ Wiki 文档中心
- ✅ 完善的开发文档

**优化**：
- ✅ 登录页迁移到 SCSS
- ✅ 移除旧的 CSS 文件
- ✅ 更新项目文档结构

**修复**：
- ✅ SCSS 编译错误修复
- ✅ 构建配置优化

---

## 联系与支持

- **项目仓库**：[查看 package.json]
- **问题反馈**：通过 Issues 提交
- **文档中心**：`wiki/` 目录

---

**当前版本**: 1.0.0  
**最后更新**: 2026-07-06  
**维护状态**: 🟢 活跃开发中
