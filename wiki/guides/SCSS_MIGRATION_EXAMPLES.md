# CSS 到 SCSS 迁移对比示例

> 实际案例展示如何从 CSS 迁移到 SCSS

---

## 示例 1：基础组件样式

### ❌ 迁移前（CSS）
```vue
<template>
  <div class="card">
    <h3 class="card-title">标题</h3>
    <p class="card-content">内容</p>
  </div>
</template>

<style scoped>
.card {
  padding: 24px;
  background: #ffffff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #18181b;
}

.card-content {
  font-size: 14px;
  color: #71717a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .card {
    padding: 16px;
  }
}
</style>
```

### ✅ 迁移后（SCSS）
```vue
<template>
  <div class="card">
    <h3 class="card-title">标题</h3>
    <p class="card-content">内容</p>
  </div>
</template>

<style scoped lang="scss">
.card {
  @include card($spacing-lg);
  
  &-title {
    font-size: $font-lg;
    font-weight: $font-semibold;
    margin-bottom: $spacing-md;
    color: $text;
  }
  
  &-content {
    font-size: $font-sm;
    color: $text-secondary;
    @include text-ellipsis;
  }
  
  @include mobile {
    padding: $spacing-md;
  }
}
</style>
```

**改进点**：
- ✅ 硬编码值 → 语义化变量
- ✅ 重复代码 → mixin 复用
- ✅ 扁平结构 → 嵌套结构（&-title）
- ✅ 媒体查询 → 响应式 mixin
- ✅ 代码减少 50%+

---

## 示例 2：按钮组件

### ❌ 迁移前（CSS）
```vue
<template>
  <button class="btn btn-primary">
    <span class="btn-text">提交</span>
  </button>
</template>

<style scoped>
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-primary {
  background: #4f46e5;
  color: white;
}

.btn-primary:hover {
  background: #4338ca;
}

.btn-primary:active {
  background: #3730a3;
}

.btn-text {
  margin-left: 8px;
}
</style>
```

### ✅ 迁移后（SCSS）
```vue
<template>
  <button class="btn btn-primary">
    <span class="btn-text">提交</span>
  </button>
</template>

<style scoped lang="scss">
.btn {
  @include flex-center;
  padding: $spacing-sm $spacing-lg;
  border: none;
  border-radius: $radius-md;
  font-size: $font-sm;
  font-weight: $font-medium;
  cursor: pointer;
  transition: all $transition-base;
  
  &-primary {
    background: $primary;
    color: white;
    
    &:hover {
      background: $primary-hover;
    }
    
    &:active {
      background: $primary-active;
    }
  }
  
  &-text {
    margin-left: $spacing-sm;
  }
}
</style>
```

**改进点**：
- ✅ Flex 布局代码 → `@include flex-center`
- ✅ 所有魔法数字 → 变量
- ✅ 嵌套选择器提高可读性
- ✅ 主题色统一管理

---

## 示例 3：表单组件

### ❌ 迁移前（CSS）
```vue
<template>
  <div class="form-group">
    <label class="form-label">用户名</label>
    <input class="form-input" type="text" placeholder="请输入">
    <span class="form-error">用户名不能为空</span>
  </div>
</template>

<style scoped>
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #18181b;
}

.form-input {
  width: 100%;
  padding: 8px 16px;
  background: #ffffff;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  font-size: 14px;
  color: #18181b;
  transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.form-input:hover {
  border-color: #4f46e5;
}

.form-input:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.form-input::placeholder {
  color: #d4d4d8;
}

.form-error {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #ef4444;
}
</style>
```

### ✅ 迁移后（SCSS）
```vue
<template>
  <div class="form-group">
    <label class="form-label">用户名</label>
    <input class="form-input" type="text" placeholder="请输入">
    <span class="form-error">用户名不能为空</span>
  </div>
</template>

<style scoped lang="scss">
.form {
  &-group {
    margin-bottom: 20px;
  }
  
  &-label {
    display: block;
    margin-bottom: $spacing-sm;
    font-size: $font-sm;
    font-weight: $font-medium;
    color: $text;
  }
  
  &-input {
    @include input-style;
    width: 100%;
  }
  
  &-error {
    display: block;
    margin-top: $spacing-sm;
    font-size: $font-xs;
    color: $danger;
  }
}
</style>
```

**改进点**：
- ✅ 输入框样式 → `@include input-style`（包含所有状态）
- ✅ BEM 命名 + SCSS 嵌套
- ✅ 所有颜色使用变量
- ✅ 代码减少 60%+

---

## 示例 4：响应式布局

### ❌ 迁移前（CSS）
```vue
<template>
  <div class="layout">
    <aside class="sidebar">侧边栏</aside>
    <main class="content">内容区</main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
  min-height: 100vh;
}

.sidebar {
  background: #ffffff;
  border-right: 1px solid #e4e4e7;
}

.content {
  padding: 24px;
}

@media (max-width: 767px) {
  .layout {
    grid-template-columns: 1fr;
    gap: 0;
  }
  
  .sidebar {
    display: none;
  }
  
  .content {
    padding: 16px;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .layout {
    grid-template-columns: 64px 1fr;
  }
  
  .sidebar {
    /* 折叠状态 */
  }
}
</style>
```

### ✅ 迁移后（SCSS）
```vue
<template>
  <div class="layout">
    <aside class="sidebar">侧边栏</aside>
    <main class="content">内容区</main>
  </div>
</template>

<style scoped lang="scss">
.layout {
  display: grid;
  grid-template-columns: $sidebar-width 1fr;
  gap: $spacing-lg;
  min-height: 100vh;
  
  @include mobile {
    grid-template-columns: 1fr;
    gap: 0;
  }
  
  @include tablet {
    grid-template-columns: $sidebar-collapsed-width 1fr;
  }
}

.sidebar {
  background: $sidebar-bg;
  border-right: 1px solid $border;
  
  @include mobile {
    display: none;
  }
}

.content {
  padding: $spacing-lg;
  
  @include mobile {
    padding: $spacing-md;
  }
}
</style>
```

**改进点**：
- ✅ 布局常量使用变量（$sidebar-width）
- ✅ 响应式 mixin 替代媒体查询
- ✅ 更清晰的断点语义
- ✅ 易于维护和调整

---

## 示例 5：暗色模式支持

### ❌ 迁移前（CSS）
```vue
<style scoped>
.header {
  background: #ffffff;
  color: #18181b;
  border-bottom: 1px solid #e4e4e7;
}

[data-theme='dark'] .header {
  background: #18181b;
  color: #fafafa;
  border-bottom: 1px solid #3f3f46;
}

.header-title {
  color: #18181b;
}

[data-theme='dark'] .header-title {
  color: #fafafa;
}
</style>
```

### ✅ 迁移后（SCSS）
```vue
<style scoped lang="scss">
.header {
  background: $bg;
  color: $text;
  border-bottom: 1px solid $border;
  
  @include dark-mode {
    background: $dark-bg;
    color: $dark-text;
    border-bottom: 1px solid $dark-border;
  }
  
  &-title {
    color: $text;
    
    @include dark-mode {
      color: $dark-text;
    }
  }
}
</style>
```

**改进点**：
- ✅ 暗色模式逻辑内聚在组件内
- ✅ 使用 mixin 避免重复选择器
- ✅ 主题色统一管理
- ✅ 更易维护

---

## 示例 6：Element Plus 组件定制

### ❌ 迁移前（CSS）
```vue
<template>
  <el-button type="primary">按钮</el-button>
</template>

<style scoped>
.el-button {
  border-radius: 8px;
}

/* 使用 ::v-deep 穿透 */
::v-deep .el-button__inner {
  font-weight: 500;
}

::v-deep .el-button--primary {
  background-color: #4f46e5;
}

::v-deep .el-button--primary:hover {
  background-color: #4338ca;
}
</style>
```

### ✅ 迁移后（SCSS）
```vue
<template>
  <el-button type="primary">按钮</el-button>
</template>

<style scoped lang="scss">
:deep(.el-button) {
  border-radius: $radius-md;
  
  &__inner {
    font-weight: $font-medium;
  }
  
  &--primary {
    background-color: $primary;
    
    &:hover {
      background-color: $primary-hover;
    }
  }
}
</style>
```

**改进点**：
- ✅ 使用现代 `:deep()` 语法
- ✅ SCSS 嵌套提高可读性
- ✅ 变量统一管理颜色
- ✅ 更符合 Vue 3 最佳实践

---

## 示例 7：复杂动画

### ❌ 迁移前（CSS）
```vue
<style scoped>
.card {
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

.fade-enter-active {
  animation: fadeIn 200ms ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
```

### ✅ 迁移后（SCSS）
```vue
<style scoped lang="scss">
.card {
  @include hover-lift;
}

.fade-enter-active {
  @include fade-in($transition-base);
}
</style>
```

**改进点**：
- ✅ 常用动画封装为 mixin
- ✅ 过渡时间使用变量
- ✅ 代码减少 80%+
- ✅ 复用性极高

---

## 示例 8：工具类生成

### ❌ 迁移前（CSS）
```css
.mt-sm { margin-top: 8px; }
.mt-md { margin-top: 16px; }
.mt-lg { margin-top: 24px; }

.mb-sm { margin-bottom: 8px; }
.mb-md { margin-bottom: 16px; }
.mb-lg { margin-bottom: 24px; }

.text-primary { color: #4f46e5; }
.text-secondary { color: #71717a; }
.text-tertiary { color: #a1a1aa; }
```

### ✅ 迁移后（SCSS）
```scss
// 自动生成间距工具类
@each $name, $value in (
  sm: $spacing-sm,
  md: $spacing-md,
  lg: $spacing-lg
) {
  .mt-#{$name} { margin-top: $value; }
  .mb-#{$name} { margin-bottom: $value; }
}

// 自动生成文本颜色类
@each $name, $value in (
  primary: $text,
  secondary: $text-secondary,
  tertiary: $text-tertiary
) {
  .text-#{$name} { color: $value; }
}
```

**改进点**：
- ✅ 循环生成减少重复
- ✅ 易于扩展新值
- ✅ 保持一致性
- ✅ 维护成本低

---

## 总结：迁移收益

| 维度 | 迁移前（CSS） | 迁移后（SCSS） | 改进 |
|------|--------------|---------------|------|
| **代码量** | 100% | 40-60% | ⬇️ 减少 40-60% |
| **可维护性** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⬆️ 显著提升 |
| **复用性** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⬆️ 30+ mixin 可复用 |
| **一致性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⬆️ 变量统一管理 |
| **开发效率** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⬆️ 自动导入无需引用 |
| **主题切换** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⬆️ 变量切换即可 |

---

## 下一步

查看完整文档：
- [SCSS_MIGRATION_GUIDE.md](./SCSS_MIGRATION_GUIDE.md) - 完整迁移指南
- [SCSS_QUICK_REFERENCE.md](./SCSS_QUICK_REFERENCE.md) - 快速参考卡片

开始迁移你的组件吧！🚀
