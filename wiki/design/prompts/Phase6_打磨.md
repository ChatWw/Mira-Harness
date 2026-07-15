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
