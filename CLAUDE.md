# Mira 项目说明

这是一个基于 Vue 3 + TypeScript + Vite + Element Plus 构建的前端中台基础框架。

---

## 项目概述

**项目名称**: Mira
**版本**: 1.1.0  
**最后更新**: 2026-07-09

### 技术栈

- **框架**: Vue 3.5 (Composition API)
- **语言**: TypeScript 5.7
- **构建工具**: Vite 6.0
- **UI 组件库**: Element Plus 2.14
- **状态管理**: Pinia 3.0 + pinia-plugin-persistedstate
- **路由**: Vue Router 4.6
- **样式系统**: SCSS + CSS Variables
- **图标**: Element Plus Icons + Lucide Vue Next

### 核心特性

- ✅ 完整的用户认证系统（登录/注册/权限守卫）
- ✅ 模块化布局系统（可切换 3 种布局模式）
- ✅ 全局配置面板（布局、主题、Logo、固定顶栏、动态标题、页面动画）
- ✅ 主题系统（light/dark 模式 + 5 种预设颜色 + 圆形扩散动画）
- ✅ 页面切换动画（6 种动画效果 + 可视化预览）
- ✅ SCSS 样式系统（60+ 设计令牌，30+ mixin）
- ✅ 可折叠侧边栏菜单
- ✅ 用户头像 + 退出登录确认对话框
- ✅ 精美的登录页动画效果
- ✅ 自动持久化存储（pinia-plugin-persistedstate）

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
│   │   ├── index.vue           # 主布局入口
│   │   └── components/         # 布局子组件
│   │       ├── AppSidebar.vue  # 侧边栏
│   │       ├── AppHeader.vue   # 顶栏
│   │       ├── AppMain.vue     # 主内容区
│   │       ├── AppFooter.vue   # 底栏
│   │       └── AppSettings.vue # 全局配置面板
│   ├── pages/           # 页面组件
│   │   ├── dashboard/   # 工作台
│   │   ├── login/       # 登录页
│   │   ├── register/    # 注册页
│   │   ├── system/      # 系统管理（用户/角色/菜单）
│   │   ├── test/        # 测试页面（ThemeTestPage）
│   │   └── exception/   # 异常页面
│   ├── router/          # 路由配置
│   ├── stores/          # 状态管理
│   │   ├── app.ts       # 应用状态（侧边栏折叠）
│   │   ├── user.ts      # 用户状态
│   │   ├── theme.ts     # 主题状态
│   │   └── layout.ts    # 布局配置状态（NEW）
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

## 布局系统

### 布局模式

支持 **3 种布局模式**，可在全局配置面板中实时切换：

1. **侧边栏+顶栏模式**（默认）- 完整的后台管理布局
2. **仅顶栏模式** - 无侧边栏，适合简单页面
3. **仅侧边栏模式** - 无顶栏，类似全屏管理

### 布局组件

布局系统采用模块化设计，由 5 个子组件组成：

- **AppSidebar** - 侧边栏（Logo、菜单、折叠按钮）
- **AppHeader** - 顶栏（折叠按钮、主题切换、全局配置入口、用户菜单）
- **AppMain** - 主内容区（路由视图 + 页面切换动画）
- **AppFooter** - 底栏（版权信息）
- **AppSettings** - 全局配置面板（Drawer 形式）

### 全局配置面板

点击顶栏右侧的设置图标 ⚙️ 打开配置面板，提供以下配置项：

1. **布局模式** - 3 种布局模式切换（可视化预览）
2. **主题颜色** - 5 种预设主题色（色块选择）
3. **显示配置**:
   - Logo 显示开关
   - 固定顶栏开关
4. **页面标题** - 自定义浏览器标签页标题
5. **页面切换动画** - 6 种动画效果（可视化卡片预览）

所有配置自动保存到 localStorage，刷新页面后保留。

---

## 页面切换动画

### 动画效果

支持 **6 种页面切换动画**，在全局配置面板中选择：

1. **淡入淡出** - 简单的透明度变化（0.3s）
2. **滑动淡入** - 左右滑动 + 淡入（默认，0.3s）
3. **上滑进入** - 从下方滑入，向上滑出（0.4s）
4. **右侧滑入** - 从右侧全屏滑入（0.4s）
5. **缩放** - 缩放 + 淡入淡出（0.3s）
6. **无动画** - 瞬间切换，无过渡

### 可视化预览

配置面板中的动画选择器采用卡片式设计：
- 每个卡片内置循环播放的动画预览（2秒周期）
- 鼠标悬停时卡片高亮上浮
- 点击卡片立即切换动画效果
- 当前选中的卡片有明显的高亮边框

### 技术实现

- 纯 CSS3 transition，无 JavaScript 动画
- 使用 `transform` 属性实现 GPU 加速
- 动态绑定 `<transition>` name 属性
- 使用 `mode="out-in"` 避免新旧页面闪烁

---

## 主题系统

### 主题模式

支持 **light** 和 **dark** 两种模式，通过右上角主题切换按钮即可切换。

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

### 主题切换实现

通过修改 HTML 根元素的 `data-theme` 属性和 CSS 变量实现动态主题切换：

```typescript
document.documentElement.setAttribute('data-theme', 'dark')
document.documentElement.style.setProperty('--cp-primary', '#9333ea')
```

**SCSS 变量 vs CSS 变量**：
- **SCSS 变量**（`$primary`）：编译时固定，用于不需要动态变化的值（如间距、字号）
- **CSS 变量**（`var(--cp-primary)`）：运行时动态，用于需要主题切换的颜色

SCSS 中使用 `@include dark-mode` 适配暗色模式：
```scss
.component {
  background: $bg;
  color: var(--cp-primary);  // 使用 CSS 变量实现动态主题色
  
  @include dark-mode {
    background: $dark-bg;
  }
}
```

**可用的 CSS 变量**：
- `--cp-primary` - 主题色
- `--cp-primary-hover` - hover 状态
- `--cp-primary-light` - 浅色（10% 透明度）
- `--el-color-primary` - Element Plus 主题色

> 📘 详细说明见 [THEME_COLOR_SWITCH_FIX.md](./wiki/reports/THEME_COLOR_SWITCH_FIX.md)

### 主题测试页面

访问 `/test/theme` 可以测试主题切换功能，验证：
- Element Plus 组件是否跟随主题色变化
- 自定义样式是否正确使用 CSS 变量
- 浏览器 DevTools 排查方法

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
- 退出登录确认对话框

**themeStore** (`stores/theme.ts`)：
- 主题模式（light/dark）
- 主题色选择
- 主题切换动画
- 主题持久化

**layoutStore** (`stores/layout.ts`)：
- 布局模式（3种）
- Logo 显示开关
- 固定顶栏开关
- 动态标题
- 页面切换动画
- 配置面板显示状态
- 自动持久化（pinia-plugin-persistedstate）

### 使用示例

```typescript
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const isLoggedIn = computed(() => !!userStore.token)
```

### 持久化存储

使用 **pinia-plugin-persistedstate** 实现自动持久化：
- `layoutStore.config` - 布局配置（localStorage: `cp-layout-config`）
- `themeStore` - 主题配置（手动持久化）
- `userStore` - 用户信息和 Token（手动持久化）

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

**模块化布局系统**（`layouts/index.vue` + 子组件）：
- **AppSidebar** - 侧边栏（Logo、菜单、折叠按钮）
- **AppHeader** - 顶栏（折叠按钮、主题切换、全局配置入口、用户头像菜单）
- **AppMain** - 主内容区（路由视图 + 页面切换动画）
- **AppFooter** - 底栏（版权信息）
- **AppSettings** - 全局配置面板（布局、主题、动画等）

**特性**：
- 支持 3 种布局模式切换
- 响应式设计（移动端自动适配）
- 固定顶栏可选
- 用户头像 + 退出登录确认对话框
- 全局配置面板（Drawer 形式）

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
- ✅ 所有 18 个组件已完成 SCSS 迁移（2026-07-07）
- ✅ 使用 SCSS 变量和 mixin 替换硬编码值
- ✅ 使用 CSS 变量（var(--cp-*)）支持动态主题切换

**迁移完成的组件列表**：
- ✅ Pupil.vue - 添加 lang="scss"，使用 $radius-full 和 $transition-fast
- ✅ Captcha.vue - 使用 var(--cp-border)、$radius-sm、$transition-base
- ✅ AnimatedCharacters.vue - 使用 var(--cp-primary) 和间距变量
- ✅ NotFoundPage.vue - 替换硬编码字号和颜色为 SCSS 变量
- ✅ MenuPage.vue - 使用 $font-2xl 和 var(--cp-text)
- ✅ UserPage.vue - 优化布局，移除内联样式
- ✅ RolePage.vue - 使用 SCSS 字体和颜色变量
- ✅ RegisterPage.vue - 全面使用 SCSS 变量和动态主题色

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

- [x] ~~12 个组件待迁移到 SCSS~~ (已完成 2026-07-07)
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

### v1.1.0 (2026-07-09)

**新增**：
- ✅ 重构 layouts 为模块化组件架构
- ✅ 新增全局配置面板（6 大配置项）
- ✅ 新增页面切换动画功能（6 种动画 + 可视化预览）
- ✅ 集成 pinia-plugin-persistedstate 自动持久化
- ✅ 新增 layoutStore 管理布局配置
- ✅ 支持 3 种布局模式切换
- ✅ 支持动态标题配置
- ✅ 支持 Logo 显示开关
- ✅ 支持固定顶栏开关

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
- ✅ 构建验证通过

**迁移组件列表**：
- Pupil.vue、Captcha.vue、AnimatedCharacters.vue
- NotFoundPage.vue、MenuPage.vue、UserPage.vue
- RolePage.vue、RegisterPage.vue
- 以及其他已正确使用 SCSS 的组件

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

**当前版本**: 1.1.0  
**最后更新**: 2026-07-09  
**维护状态**: 🟢 活跃开发中
