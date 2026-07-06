# SCSS 快速参考卡片 🚀

> 日常开发中最常用的变量和 mixin

## 📦 变量速查

### 颜色
```scss
$primary          // #4f46e5 主题色
$primary-hover    // #4338ca 悬停态
$primary-light    // rgba(79, 70, 229, 0.1) 浅色背景

$success, $warning, $danger, $info  // 语义色

$bg              // 背景色
$text            // 主文本色
$text-secondary  // 次要文本色
$border          // 边框色
```

### 间距
```scss
$spacing-xs   // 4px
$spacing-sm   // 8px
$spacing-md   // 16px
$spacing-lg   // 24px
$spacing-xl   // 32px
$spacing-2xl  // 48px
```

### 字体
```scss
$font-xs   // 12px
$font-sm   // 14px
$font-base // 16px
$font-lg   // 18px

$font-normal    // 400
$font-semibold  // 600
$font-bold      // 700
```

### 圆角
```scss
$radius-sm   // 4px
$radius-md   // 8px
$radius-lg   // 12px
$radius-full // 9999px (完全圆角)
```

### 阴影
```scss
$shadow-sm  // 轻微阴影
$shadow     // 标准阴影
$shadow-md  // 中等阴影
$shadow-lg  // 较大阴影
```

### 断点
```scss
$breakpoint-md  // 768px
$breakpoint-lg  // 1024px
$breakpoint-xl  // 1280px
```

---

## 🔧 常用 Mixin

### 布局
```scss
@include flex-center;          // 水平垂直居中
@include flex-between;         // 两端对齐
@include flex-align-center;    // 垂直居中
@include absolute-center;      // 绝对定位居中
```

### 文本
```scss
@include text-ellipsis;        // 单行省略号
@include text-clamp(2);        // 多行截断（参数为行数）
```

### 响应式
```scss
@include mobile {              // < 768px
  // 移动端样式
}

@include desktop {             // >= 1024px
  // 桌面端样式
}

@include media-min(1280px) {   // 自定义最小宽度
  // 样式
}
```

### 视觉效果
```scss
@include glass-effect(0.1);              // 玻璃态效果
@include gradient-bg($start, $end);      // 渐变背景
@include hover-lift;                      // 悬停上浮
@include card($spacing-lg);              // 卡片样式
```

### 主题
```scss
@include dark-mode {
  // 暗色模式样式
}
```

---

## 💡 实战示例

### 按钮组件
```scss
.custom-button {
  padding: $spacing-sm $spacing-lg;
  background: $primary;
  color: white;
  border-radius: $radius-md;
  font-weight: $font-semibold;
  transition: all $transition-fast;
  
  &:hover {
    background: $primary-hover;
    @include hover-lift;
  }
}
```

### 卡片组件
```scss
.card {
  @include card($spacing-lg);
  
  &-title {
    font-size: $font-lg;
    font-weight: $font-semibold;
    margin-bottom: $spacing-md;
  }
  
  &-content {
    color: $text-secondary;
    @include text-clamp(3);
  }
}
```

### 响应式布局
```scss
.container {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: $spacing-lg;
  
  @include mobile {
    grid-template-columns: 1fr;
  }
}
```

### 列表项悬停
```scss
.list-item {
  padding: $spacing-md;
  border-radius: $radius-md;
  transition: background $transition-fast;
  
  &:hover {
    background: $bg-hover;
    cursor: pointer;
  }
  
  @include dark-mode {
    &:hover {
      background: $dark-bg-hover;
    }
  }
}
```

---

## ⚡ 开发技巧

### 1. 嵌套选择器
```scss
.header {
  background: $bg;
  
  &-title {           // .header-title
    font-size: $font-lg;
  }
  
  &:hover {           // .header:hover
    background: $bg-hover;
  }
}
```

### 2. 父选择器引用
```scss
.button {
  color: $text;
  
  .dark-theme & {    // .dark-theme .button
    color: $dark-text;
  }
}
```

### 3. 循环生成样式
```scss
@each $size in (sm, md, lg) {
  .gap-#{$size} {
    gap: var($spacing-#{$size});
  }
}
```

### 4. 条件判断
```scss
@mixin button-size($size) {
  @if $size == 'small' {
    padding: $spacing-xs $spacing-sm;
  } @else if $size == 'large' {
    padding: $spacing-md $spacing-xl;
  }
}
```

---

## 🎨 Element Plus 定制

### 覆盖组件样式
```scss
// 方法 1：使用 :deep()
:deep(.el-button) {
  border-radius: $radius-lg;
}

// 方法 2：全局覆盖（在 element-override.scss 中）
.el-button {
  font-weight: $font-medium;
}
```

### 主题色变量
```scss
// Element Plus 使用的 CSS 变量
--el-color-primary         // 主题色
--el-text-color-primary    // 主文本色
--el-border-color          // 边框色
--el-border-radius-base    // 圆角
```

---

## 🔍 调试技巧

### 1. 查看编译后的值
```scss
.debug {
  // 临时添加以查看变量值
  --debug-primary: #{$primary};
  content: 'spacing-md: #{$spacing-md}';
}
```

### 2. 使用浏览器开发工具
- 检查元素 → 查看计算后的样式
- 使用 `@debug` 输出到控制台（开发环境）

```scss
@debug "Primary color: #{$primary}";
```

---

## 📋 迁移检查清单

迁移现有组件时：

- [ ] 添加 `lang="scss"` 到 `<style>` 标签
- [ ] 替换硬编码颜色为变量（如 `#4f46e5` → `$primary`）
- [ ] 替换硬编码间距为变量（如 `16px` → `$spacing-md`）
- [ ] 使用 flex mixin 替代重复的 flex 代码
- [ ] 使用响应式 mixin 替代媒体查询
- [ ] 添加暗色模式支持（如有需要）
- [ ] 测试样式在不同屏幕尺寸下正常显示

---

## 🚨 常见陷阱

### ❌ 错误：手动导入变量
```scss
<style scoped lang="scss">
@import '@/styles/variables.scss';  // ❌ 不需要！已自动导入
</style>
```

### ✅ 正确：直接使用
```scss
<style scoped lang="scss">
.button {
  color: $primary;  // ✅ 直接使用
}
</style>
```

### ❌ 错误：在 CSS 变量中直接使用 SCSS 变量
```scss
:root {
  --custom-color: $primary;  // ❌ 不会生效
}
```

### ✅ 正确：使用插值
```scss
:root {
  --custom-color: #{$primary};  // ✅ 正确
}
```

---

## 📚 更多资源

- [完整迁移指南](./SCSS_MIGRATION_GUIDE.md)
- [Sass 官方文档](https://sass-lang.com/documentation)
- [Element Plus 定制主题](https://element-plus.org/zh-CN/guide/theming.html)
- [Vite CSS 预处理器](https://cn.vitejs.dev/guide/features.html#css-pre-processors)

---

**提示**：所有变量和 mixin 已通过 Vite 配置自动导入，无需在组件中手动引入！
