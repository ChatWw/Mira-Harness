# CSS 到 SCSS 迁移完整指南

## 📌 项目概述
本项目已成功从纯 CSS 迁移到 SCSS，实现了更好的样式复用、变量管理和主题定制能力。

---

## ✅ 已完成的工作

### 1. 依赖安装
```bash
npm install -D sass
```

**说明**：Vite 原生支持 SCSS，只需安装 `sass` 包即可。

---

### 2. Vite 配置更新

**文件**：`vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 9000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@styles': resolve(__dirname, 'src/styles'),  // 新增样式路径别名
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 关键配置：自动导入全局变量和 mixins
        // 每个 .vue 和 .scss 文件都可以直接使用，无需手动 @import
        additionalData: \`@use "@/styles/variables.scss" as *; @use "@/styles/mixins.scss" as *;\`,
        api: 'modern-compiler',  // 使用现代编译器 API
      },
    },
  },
})
```

**关键点**：
- `additionalData`：自动在每个 SCSS 文件前注入变量和 mixins
- `api: 'modern-compiler'`：使用 Sass 的现代编译器，性能更好
- `@styles` 别名：方便引用样式文件

---

### 3. SCSS 文件结构

#### 📁 `src/styles/` 目录结构
```
src/styles/
├── variables.scss       # 全局设计令牌（颜色、字体、间距等）
├── mixins.scss         # 可复用的 mixin（flex、响应式、动画等）
├── global.scss         # 全局样式（重置、工具类、滚动条）
├── element-override.scss  # Element Plus 组件样式覆盖
└── index.scss          # 主入口文件
```

---

#### 📄 `variables.scss` - 设计令牌

包含完整的设计系统变量：

**颜色系统**
```scss
// 主题色
$primary: #4f46e5;
$primary-hover: #4338ca;
$primary-light: rgba(79, 70, 229, 0.1);

// 语义色
$success: #10b981;
$warning: #f59e0b;
$danger: #ef4444;
$info: #3b82f6;

// 中性色 - 亮色模式
$bg: #ffffff;
$text: #18181b;
$border: #e4e4e7;

// 暗色模式
$dark-bg: #18181b;
$dark-text: #fafafa;
```

**字体系统**
```scss
$font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...;
$font-xs: 12px;
$font-sm: 14px;
$font-base: 16px;
$font-semibold: 600;
```

**间距系统**
```scss
$spacing-xs: 4px;
$spacing-sm: 8px;
$spacing-md: 16px;
$spacing-lg: 24px;
```

**响应式断点**
```scss
$breakpoint-md: 768px;
$breakpoint-lg: 1024px;
```

---

#### 📄 `mixins.scss` - 可复用工具

包含 30+ 实用 mixin：

**布局相关**
```scss
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

**文本处理**
```scss
@mixin text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@mixin text-clamp($lines: 2) {
  display: -webkit-box;
  -webkit-line-clamp: $lines;
  overflow: hidden;
}
```

**响应式设计**
```scss
@mixin mobile {
  @media (max-width: 767px) {
    @content;
  }
}

@mixin desktop {
  @media (min-width: 1024px) {
    @content;
  }
}
```

**视觉效果**
```scss
@mixin glass-effect($opacity: 0.1) {
  background: rgba(255, 255, 255, $opacity);
  backdrop-filter: blur(8px);
}

@mixin gradient-bg($start, $end, $angle: 135deg) {
  background: linear-gradient($angle, $start, $end);
}
```

**暗色模式**
```scss
@mixin dark-mode {
  [data-theme='dark'] & {
    @content;
  }
}
```

---

#### 📄 `element-override.scss` - Element Plus 定制

通过 CSS 变量覆盖 Element Plus 主题：

```scss
:root {
  --el-color-primary: #{$primary};
  --el-text-color-primary: #{$text};
  --el-border-color: #{$border};
  --el-border-radius-base: #{$radius-sm};
  --el-font-family: #{$font-family};
}

[data-theme='dark'] {
  --el-bg-color: #{$dark-bg};
  --el-text-color-primary: #{$dark-text};
}
```

**注意**：`#{$variable}` 语法用于将 SCSS 变量插值到 CSS 变量中。

---

#### 📄 `index.scss` - 主入口

```scss
@use './variables.scss' as *;
@use './mixins.scss' as *;
@use './global.scss';
@use './element-override.scss';
```

**注意**：使用 `@use` 而非 `@import`（已废弃）。

---

### 4. 入口文件更新

**文件**：`src/main.ts`

```typescript
// 将 CSS 引入改为 SCSS
import './styles/index.scss'  // ← 原来是 index.css
```

---

## 🔄 组件迁移示例：LoginPage.vue

### 迁移前（CSS）
```vue
<style scoped>
.page {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.left {
  padding: 48px;
  background: linear-gradient(135deg, var(--cp-primary), var(--cp-primary));
}

@media (max-width: 1023px) {
  .page {
    grid-template-columns: 1fr;
  }
}
</style>
```

### 迁移后（SCSS）
```vue
<style scoped lang="scss">
// 注意添加 lang="scss"

.page {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.left {
  padding: $spacing-2xl;  // 使用变量
  @include gradient-bg($login-left-bg-start, $login-left-bg-end);  // 使用 mixin
}

.brand-icon {
  @include flex-center;  // 使用 mixin
  @include glass-effect(0.1);  // 玻璃态效果
}

// 响应式设计
@include mobile {
  .page {
    grid-template-columns: 1fr;
  }
  
  .left {
    display: none;
  }
}

// 暗色模式
@include dark-mode {
  .right {
    background: $dark-bg;
  }
}
</style>
```

**关键变化**：
1. 添加 `lang="scss"` 属性
2. 硬编码值 → SCSS 变量（`48px` → `$spacing-2xl`）
3. 重复代码 → mixin（`display: flex; align-items: center` → `@include flex-center`）
4. 媒体查询 → 响应式 mixin（`@media (max-width: ...)` → `@include mobile`）
5. 暗色模式选择器封装为 mixin

---

## 📋 渐进式迁移策略

### 阶段 1：保持兼容（✅ 已完成）
- CSS 和 SCSS 可以共存
- 新文件使用 SCSS
- 旧文件保持 CSS

### 阶段 2：逐个迁移组件
**步骤**：
1. 为 `<style>` 标签添加 `lang="scss"`
2. 替换硬编码颜色为变量
   ```scss
   // 迁移前
   color: #4f46e5;
   
   // 迁移后
   color: $primary;
   ```

3. 使用 mixin 替换重复代码
   ```scss
   // 迁移前
   display: flex;
   align-items: center;
   justify-content: center;
   
   // 迁移后
   @include flex-center;
   ```

4. 使用响应式 mixin
   ```scss
   // 迁移前
   @media (max-width: 1023px) { ... }
   
   // 迁移后
   @include mobile { ... }
   ```

### 阶段 3：清理旧 CSS 文件
迁移完成后可删除：
- `src/styles/variables.css`
- `src/styles/element.css`
- `src/styles/index.css`

---

## ⚠️ 注意事项

### 1. `::v-deep` 语法变化

**Vue 2 / 旧版 Vue 3**：
```scss
::v-deep .el-input {
  background: red;
}
```

**现代 Vue 3（推荐）**：
```scss
:deep(.el-input) {
  background: red;
}
```

### 2. scoped 样式与 SCSS

**正确用法**：
```vue
<style scoped lang="scss">
// ✅ 直接使用变量和 mixin（已通过 vite.config.ts 自动导入）
.button {
  color: $primary;
  @include flex-center;
}

// ✅ 使用 :deep() 修改子组件样式
:deep(.el-input__inner) {
  background: $bg;
}
</style>
```

**错误用法**：
```vue
<style scoped lang="scss">
// ❌ 不需要手动导入（会导致重复定义）
@import '@/styles/variables.scss';
</style>
```

### 3. CSS 变量 vs SCSS 变量

**CSS 变量（运行时动态）**：
```scss
:root {
  --theme-color: #4f46e5;
}

.button {
  color: var(--theme-color);  // 可在浏览器中动态修改
}
```

**SCSS 变量（编译时静态）**：
```scss
$theme-color: #4f46e5;

.button {
  color: $theme-color;  // 编译后变成 color: #4f46e5;
}
```

**混合使用**（Element Plus 主题定制）：
```scss
:root {
  --el-color-primary: #{$primary};  // SCSS 变量 → CSS 变量
}
```

### 4. 模块系统

**现代 SCSS（推荐）**：
```scss
@use './variables.scss' as *;
@use './mixins.scss' as *;
```

**旧版 SCSS（已废弃）**：
```scss
@import './variables.scss';  // ⚠️ 不推荐
```

---

## 🎯 验证方式

### 1. 构建验证
```bash
npm run build
```
应该看到：
```
✓ built in 2.23s
```

### 2. 开发环境验证
```bash
npm run dev
```
访问 `http://localhost:9000`（或分配的其他端口）

### 3. 检查项
- ✅ 登录页样式正常
- ✅ Element Plus 组件主题色正确
- ✅ 响应式布局工作正常
- ✅ 暗色模式切换正常（如果有）
- ✅ 浏览器控制台无错误

---

## 🚀 进阶使用

### 1. 创建组件特定的 SCSS 模块

```scss
// src/pages/login/login.module.scss
@use '@/styles/variables.scss' as *;

.special-button {
  background: $primary;
  &:hover {
    background: $primary-hover;
  }
}
```

```vue
<script setup lang="ts">
import styles from './login.module.scss'
</script>

<template>
  <button :class="styles['special-button']">登录</button>
</template>
```

### 2. 主题切换实现

```typescript
// src/composables/useTheme.ts
export function useTheme() {
  const setTheme = (theme: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', theme)
  }
  
  return { setTheme }
}
```

```vue
<script setup lang="ts">
const { setTheme } = useTheme()
</script>

<style scoped lang="scss">
.header {
  background: $bg;
  
  @include dark-mode {
    background: $dark-bg;
  }
}
</style>
```

### 3. 动态生成样式类

```scss
// 生成间距工具类
@each $size, $value in (sm: $spacing-sm, md: $spacing-md, lg: $spacing-lg) {
  .mt-#{$size} {
    margin-top: $value;
  }
}

// 编译结果：
// .mt-sm { margin-top: 8px; }
// .mt-md { margin-top: 16px; }
// .mt-lg { margin-top: 24px; }
```

---

## 🐛 常见问题

### Q1: 编译错误 "Undefined variable"
**原因**：文件中使用了变量但未导入

**解决方案**：
```scss
// 在文件顶部添加
@use '@/styles/variables.scss' as *;
```

### Q2: Vite 配置的 `additionalData` 不生效
**原因**：只对 `.scss` 文件生效，不包括 `<style>` 标签

**解决方案**：确保组件中使用 `lang="scss"`

### Q3: Element Plus 主题色未生效
**原因**：引入顺序问题

**解决方案**：确保在 `main.ts` 中的顺序：
```typescript
import 'element-plus/dist/index.css'  // 先引入 Element Plus
import './styles/index.scss'          // 再引入自定义样式
```

### Q4: 生产环境样式丢失
**原因**：可能是 CSS 压缩问题

**解决方案**：检查 `vite.config.ts` 中的 `build.cssMinify` 选项

---

## 📊 迁移收益

### 1. 代码复用
- 30+ mixin 可在所有组件中复用
- 变量统一管理，修改一处全局生效

### 2. 可维护性
- 设计令牌集中管理
- 主题切换只需修改变量
- 响应式断点统一

### 3. 开发效率
- 自动导入变量和 mixin，无需手动引入
- TypeScript 类型提示（VS Code）
- 嵌套语法减少重复选择器

### 4. 文件大小
- SCSS 编译后自动优化
- 移除未使用的样式（配合 PurgeCSS）

---

## 📝 后续优化建议

1. **配置 CSS Modules**：更好的样式隔离
2. **集成 Stylelint**：SCSS 代码规范检查
3. **配置 PurgeCSS**：移除未使用的样式
4. **迁移所有组件**：完全使用 SCSS
5. **建立设计规范文档**：让团队了解设计令牌使用

---

## ✅ 总结

项目已成功迁移到 SCSS，核心配置和文件结构已完成：

- ✅ Vite 配置支持 SCSS 全局变量
- ✅ 完整的设计令牌系统（variables.scss）
- ✅ 30+ 实用 mixin（mixins.scss）
- ✅ Element Plus 主题定制（element-override.scss）
- ✅ 登录页迁移示例（LoginPage.vue）
- ✅ 构建和开发环境验证通过

**下一步**：按照渐进式迁移策略，逐步将其他组件迁移到 SCSS。
