# 中台基座 v2.0 产品设计文档

> 版本: 2.0.0-draft  
> 日期: 2026-07-15  
> 状态: 设计评审中

---

## 一、产品定位

**通用中后台脚手架** — 开箱即用的前端解决方案，可复用于多个后台项目。

核心原则：
- **配置即开发** — 路由、菜单、表格、表单通过配置驱动
- **Mock 即生产** — API 层按真实后端标准设计，Mock 数据零成本切换真实接口
- **克制设计** — Linear/Vercel 风格，克制颜色、充足留白、精准微交互
- **保留底子** — 布局系统、主题系统、SCSS 设计令牌全部保留并增强
- **主题变量驱动** — **所有样式必须使用现有的 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死任何颜色值（hex / rgb / 颜色名）。新增语义色必须以 CSS 变量形式在 `:root` 和 `[data-theme='dark']` 中同时定义，确保明暗模式自动适配。**

---

## 二、技术栈

| 类别 | 选型 | 说明 |
|------|------|------|
| 框架 | Vue 3.5 (Composition API) | 保留 |
| 语言 | TypeScript 5.7 | 保留 |
| 构建 | Vite 6.0 | 保留 |
| UI 库 | Element Plus 2.14 | 保留 |
| 状态 | Pinia 3.0 + persistedstate | 保留，新增 2 个 store |
| 路由 | Vue Router 4.6 | 保留，改为动态路由 |
| HTTP | axios | **新增** |
| 图表 | ECharts | **新增** |
| 样式 | SCSS + CSS Variables | 保留 |
| i18n | 预留架构，暂不集成 | 文本集中管理，后续可接 vue-i18n |

---

## 三、功能矩阵

### 3.1 保留（不做改动或微调）

| 功能 | 说明 |
|------|------|
| 登录页 | 完整保留，不做任何修改（角色动画、表单、视觉全部保持原样）|
| 注册页 | 完整保留，不做任何修改 |
| 3 种布局模式 | sidebar-header / header-only / sidebar-only |
| 主题系统 | light/dark + 5 预设色 + 圆形扩散动画 |
| 6 种页面切换动画 | 保留 |
| 全局配置面板 | 保留 |
| SCSS 设计令牌 | 60+ 变量 + 30+ mixin 保留 |
| 路由守卫 | 保留 token 校验逻辑 |
| 30 天免登录 | 保留 |
| 404 页面 | 保留 |

### 3.2 增强（保留核心 + 新增能力）

| 功能 | 现状 | 增强 |
|------|------|------|
| 顶栏 | 折叠 + 主题 + 用户菜单 | 新增面包屑、全局搜索(Ctrl+K)、通知铃铛、全屏、用户下拉 |
| 工作台 | 4 静态卡片 + mock 待办 | 新增趋势图表(ECharts)、数据动态化、骨架屏 |
| 用户管理 | 静态表格 | ProTable：搜索筛选 + 分页 + CRUD 弹窗 + 批量操作 |
| 角色管理 | 静态展示 | 列表 + 权限分配树 + 数据权限范围 |
| 菜单管理 | 静态展示 | 树形表格 + 拖拽排序 + CRUD（目录/菜单/按钮类型） |
| 权限系统 | 路由级守卫 | 增强为：动态路由 + 按钮级权限(v-permission) + 动态菜单 |

### 3.3 新增

| 功能 | 说明 |
|------|------|
| 多标签页导航 | 标签栏 + 右键菜单 + 拖拽排序 + sessionStorage 持久化 |
| 操作日志 | 审计追踪 + 筛选 + 详情抽屉 + 导出 |
| 系统设置 | Tab 式：系统参数 / 通用配置 / 安全策略 |
| 部门管理 | 组织架构树 + 部门 CRUD + 数据权限 |
| 个人中心 | 个人资料编辑 + 修改密码 + 登录记录 |
| 消息中心 | 站内消息(已读/未读) + 通知设置 |
| 组件演示 | ProTable / ProForm / DetailLayout 示例页 |
| API 层 | axios 封装 + 拦截器 + 统一错误处理 |
| Mock 服务 | dev 环境拦截请求，返回 Mock 数据 |
| 组合式函数 | useTable / usePagination / useDialog 等 |

---

## 四、信息架构

```
认证层（公开路由）
├── /login          登录页（原样保留，不做修改）
└── /register       注册页（原样保留，不做修改）

主布局（受保护路由，动态注册）
├── /dashboard              工作台
│   ├── 统计卡片（动态数据 + 骨架屏）
│   ├── 趋势图表（ECharts 折线图）[新]
│   ├── 快捷入口
│   └── 待办列表
│
├── /system                 系统管理
│   ├── /system/users       用户管理（ProTable + CRUD）
│   ├── /system/roles       角色管理（权限分配）
│   ├── /system/menus       菜单管理（树形 + 拖拽）
│   ├── /system/logs        操作日志 [新]
│   ├── /system/settings    系统设置 [新]
│   └── /system/depts       部门管理 [新]
│
├── /profile                个人中心 [新]
│   ├── /profile/info       个人资料
│   └── /profile/security   安全设置
│
├── /message                消息中心 [新]
│   ├── /message/list       站内消息
│   └── /message/settings   通知设置
│
├── /components             组件演示 [新]
│   ├── /components/table   ProTable 演示
│   ├── /components/form    ProForm 演示
│   └── /components/detail  DetailLayout 演示
│
└── /404                    异常页面
```

---

## 五、模块设计详解

### 5.1 多标签页导航

**位置**：顶栏下方，主内容区上方

**标签样式**（配置项，3 种可选）：
| 样式 | 说明 | 默认 |
|------|------|------|
| `card` | 卡片式，标签间有间距，激活项带底部高亮条 | ✅ |
| `chrome` | 浏览器标签式，标签相连带圆角，激活项背景区分 | |
| `plain` | 简约式，无边框，仅文字+下划线高亮 | |

**功能**：
- 首页标签固定（不可关闭）
- 点击侧边栏菜单新增标签
- 标签显示页面标题 + hover 显示关闭按钮
- 当前激活标签高亮
- 标签拖拽排序
- 最大 10 个标签，超出 LRU 淘汰最久未访问的
- sessionStorage 持久化（刷新不丢失，关闭浏览器清除）
- 标签超出容器宽度时：鼠标滚动/横向滚动条

**右键菜单**：
| 菜单项 | 说明 | 首页标签 |
|--------|------|---------|
| 刷新当前 | 重新加载当前标签页内容 | ✅ 可用 |
| 关闭当前 | 关闭当前标签 | ❌ 不可用 |
| 关闭其他 | 关闭除当前和首页外的所有标签 | ✅ 可用 |
| 关闭左侧 | 关闭当前标签左侧所有标签 | ✅ 可用 |
| 关闭右侧 | 关闭当前标签右侧所有标签 | ✅ 可用 |
| 关闭全部 | 关闭除首页外的所有标签 | ✅ 可用 |

**状态管理**：新增 `tabsStore`

```typescript
interface TabItem {
  path: string
  title: string
  name: string        // 路由 name
  icon?: string       // 菜单图标
  closable: boolean   // 首页 false，其余 true
  lastAccess: number  // LRU 时间戳
}
```

### 5.2 顶栏增强

**布局**（左到右）：
```
[折叠按钮] [面包屑导航]          [全局搜索] [通知铃铛] [全屏] [主题切换] [设置] [用户下拉]
```

**面包屑**：
- 基于路由 `matched` 数组自动生成
- 最后一项不可点击（纯文本）
- 支持 icon + 文字（图标可在配置面板开关）
- 超过 4 级时中间用 `...` 折叠，hover 展开

**全局搜索（Ctrl+K）**：

命令面板风格（参考 Linear / Raycast），居中弹出覆盖层：

```
┌─────────────────────────────────────────────┐
│  🔍 搜索页面、菜单、功能...              ESC │
├─────────────────────────────────────────────┤
│  [全部]  菜单  页面  操作                    │  ← Tab 切换分类
├─────────────────────────────────────────────┤
│  ●  用户管理      系统管理 / 用户管理   Enter │  ← 选中项主题色高亮
│  ●  角色管理      系统管理 / 角色管理         │
│  ●  Dashboard     工作台                     │
│  ●  系统设置      系统管理 / 系统设置         │
│  ●  操作日志      系统管理 / 操作日志         │
├─────────────────────────────────────────────┤
│  ↑↓ 导航   Enter 打开   Tab 切换分类          │  ← 快捷键提示
└─────────────────────────────────────────────┘
```

- **数据源**：路由配置 + 菜单配置 + 预定义操作（如"退出登录""切换主题"）
- **搜索**：模糊匹配标题、路径、权限标识
- **分类筛选**：全部 / 菜单 / 页面 / 操作（Tab 键切换）
- **每项展示**：左侧分类色标 + 标题 + 父级路径 + 右侧快捷键提示
- **键盘操作**：↑↓ 导航、Enter 打开、Tab 切换分类、ESC 关闭
- **选中项**：主题色高亮背景
- **最多展示**：8 条结果

**通知铃铛**：

- 未读数量 Badge（危险色圆点或数字）
- 点击展开下拉面板：
  ```
  ┌──────────────────────────┐
  │  通知中心          全部已读 │
  ├──────────────────────────┤
  │  [全部] [通知] [公告]     │  ← Tab 切换
  ├──────────────────────────┤
  │  ● 系统升级通知    2分钟前 │  ● 未读主色圆点
  │    v2.0 将于本周五上线...  │
  ├──────────────────────────┤
  │  ○ 审批待处理     1小时前  │  ○ 已读无点
  │    您有 3 条待审批...      │
  ├──────────────────────────┤
  │  查看全部消息 →            │
  └──────────────────────────┘
  ```
- **分类**：默认显示全部，可切换"通知"/"公告"两个 Tab
- **数据结构**：

```typescript
interface NotificationItem {
  id: string
  type: 'notification' | 'announcement'  // 通知 / 公告
  title: string
  content: string
  isRead: boolean
  createdAt: string
  link?: string                           // 点击跳转地址
}

interface NotificationTab {
  key: 'all' | 'notification' | 'announcement'
  label: string
  unreadCount: number
}
```

- 下拉面板最多展示 5 条最近消息
- 底部"查看全部消息"跳转消息中心

**用户下拉菜单**：

```
┌──────────────────────────────┐
│  [头像] Admin                 │
│         超级管理员  [在线]    │  ← 用户信息区
├──────────────────────────────┤
│  👤 个人中心    个人资料、安全  │  ← 主题色高亮
│  ⚙  系统设置    配置参数、安全  │
│  🔔 消息通知             3    │  ← 危险色 Badge
│  🎨 主题设置    Ctrl+Shift+T  │
│  📐 布局配置                  │
├──────────────────────────────┤  ← 分隔线
│  ⏻  退出登录                  │  ← 危险色高亮
└──────────────────────────────┘
```

- 顶部：头像 + 昵称 + 角色 + 在线状态标签
- 中部菜单项：
  - **个人中心** → `/profile/info`
  - **系统设置** → `/system/settings`
  - **消息通知** → `/message/list`（带未读 Badge）
  - **主题设置** → 打开配置面板
  - **布局配置** → 打开配置面板
- 底部：分隔线 + **退出登录**（危险色高亮，保留确认对话框）
- 每项支持 hover 高亮 + 右侧辅助文字（描述或快捷键）
- 键盘可操作（上下选择 + Enter 确认）

### 5.3 工作台 Dashboard

**布局**（自上而下）：
```
┌─────────────────────────────────────────────────┐
│  [访问量]  [用户数]  [待处理]  [健康度]           │  统计卡片行（4 列）
├─────────────────────────────────────────────────┤
│  ┌─────────────────────┐ ┌──────────────────┐   │
│  │   7天访问趋势         │ │  待办事项         │   │  图表 + 待办（7:5）
│  │   (ECharts 折线图)   │ │                  │   │
│  └─────────────────────┘ └──────────────────┘   │
├─────────────────────────────────────────────────┤
│  [快捷入口 1] [快捷入口 2] [快捷入口 3] ...     │  快捷入口行
└─────────────────────────────────────────────────┘
```

**统计卡片**（4 张）：
| 卡片 | 数据 | 增强效果 |
|------|------|---------|
| 访问量 | 总访问次数 | 底部 mini sparkline 趋势线 + 环比百分比 |
| 用户数 | 活跃用户数 | 底部 mini sparkline 趋势线 + 环比百分比 |
| 待处理 | 待处理任务数 | 底部进度条 + "查看详情"链接 |
| 健康度 | 系统健康度 | 环形进度图 + 状态文字 |

- 数据从 API 获取（Mock），带 loading skeleton（3 行占位骨架）
- 卡片右上角可放小图标
- 环比正增长成功色箭头↑，负增长危险色箭头↓

**趋势图表**：
- ECharts 折线图，展示近 7 天访问量趋势
- 双折线：今日 vs 昨日对比
- 暗色模式自动适配图表配色（通过 `getChartTheme(isDark)` 工具函数读取 CSS 变量）
- 带 loading 状态

**快捷入口**：
- 默认 6 个：用户管理、角色管理、菜单管理、操作日志、系统设置、个人中心
- 每个入口：图标 + 标题 + 描述
- 点击跳转对应页面

**待办列表**：
- 最多展示 5 条
- 每条：标题 + 类型标签 + 时间 + 状态
- 操作：点击跳转、标记完成
- 底部"查看全部"链接

### 5.4 系统管理

#### 5.4.1 用户管理

**ProTable 配置**：

| 列 | 字段 | 宽度 | 特殊渲染 |
|----|------|------|---------|
| 头像 | avatar | 60px | el-avatar |
| 用户名 | username | 120px | — |
| 昵称 | nickname | 120px | — |
| 手机号 | phone | 140px | — |
| 邮箱 | email | 180px | — |
| 角色 | roleName | 100px | el-tag |
| 部门 | deptName | 120px | — |
| 状态 | status | 80px | el-tag (启用/禁用) |
| 创建时间 | createdAt | 160px | — |
| 操作 | — | 200px, fixed right | — |

**搜索栏**：用户名(input) + 手机号(input) + 状态(select) + 部门(tree-select)

**操作列**：编辑 / 重置密码(confirm) / 删除(confirm)

**工具栏**：新增 / 批量删除(confirm) / 批量启用 / 批量禁用 / 导出

**新增/编辑弹窗**（ProForm）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 用户名 | input | ✅ | 编辑时禁用 |
| 昵称 | input | ✅ | — |
| 手机号 | input | ✅ | 手机号格式校验 |
| 邮箱 | input | ❌ | 邮箱格式校验 |
| 密码 | input(password) | 新增必填 | 密码强度校验 |
| 部门 | tree-select | ❌ | — |
| 角色 | select | ✅ | 多选 |
| 状态 | switch | — | 默认启用 |

#### 5.4.2 角色管理

**ProTable 列表**：

| 列 | 说明 |
|----|------|
| 角色名称 | 如"超级管理员""普通用户" |
| 角色标识 | 如 admin / user |
| 排序 | 数字 |
| 状态 | 启用/禁用 |
| 创建时间 | — |
| 操作 | 编辑 / 权限分配 / 删除 |

**权限分配弹窗**（抽屉式）：
- 左侧：菜单权限树（el-tree），勾选节点代表该角色可访问的菜单
  - 树结构：目录 > 菜单 > 按钮
  - 父子联动：勾选父节点自动勾选所有子节点
  - 半选状态：部分子节点被选中时父节点显示半选
- 右侧：数据权限范围选择
  - 全部数据
  - 本部门数据
  - 本部门及以下部门数据
  - 自定义部门（tree-select 多选）
- 底部：保存 / 取消

#### 5.4.3 菜单管理

**树形表格**（el-table tree）：

| 列 | 说明 |
|----|------|
| 菜单名称 | 带缩进层级 |
| 图标 | Element Plus 图标预览 |
| 排序 | 数字 |
| 权限标识 | 如 system:user:list |
| 类型 | el-tag (目录=info / 菜单=primary / 按钮=warning) |
| 状态 | 启用/禁用 |
| 操作 | 新增子菜单 / 编辑 / 删除 |

**拖拽排序**：同级拖拽，跨级不允许

**新增/编辑弹窗**（ProForm，根据类型动态显隐）：

| 字段 | 目录 | 菜单 | 按钮 |
|------|------|------|------|
| 类型 | ✅ | ✅ | ✅ |
| 名称 | ✅ | ✅ | ✅ |
| 图标 | ✅ | ✅ | — |
| 排序 | ✅ | ✅ | ✅ |
| 路由路径 | — | ✅ | — |
| 组件路径 | — | ✅ | — |
| 权限标识 | — | ✅ | ✅ |
| 上级菜单 | ✅ | ✅ | ✅ |
| 状态 | ✅ | ✅ | ✅ |

#### 5.4.4 操作日志 [新]

**ProTable 配置**：

| 列 | 说明 |
|----|------|
| 操作人 | 用户名 |
| 操作类型 | el-tag (新增=success / 修改=primary / 删除=danger / 其他=info) |
| 模块 | 如"用户管理""角色管理" |
| IP | — |
| 操作时间 | — |
| 操作内容 | 截断显示，hover 展开 |
| 操作 | 查看详情 |

**搜索栏**：时间范围(daterange) + 操作人(input) + 操作类型(select) + 模块(select)

**详情抽屉**：
- 基本信息：操作人、操作类型、模块、IP、User-Agent、操作时间
- 请求参数：JSON 格式化展示（代码高亮）
- 响应结果：JSON 格式化展示
- 耗时

**导出**：CSV 导出（前端生成）

#### 5.4.5 系统设置 [新]

**Tab 式布局**，3 个 Tab：

**Tab 1 — 系统参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| 系统名称 | input | 显示在侧边栏 Logo 旁 |
| Logo 地址 | upload | 侧边栏 Logo |
| 版权信息 | input | 底栏版权文本 |
| 备案号 | input | 底栏备案号 |
| 默认首页 | select | 登录后跳转的页面 |

**Tab 2 — 通用配置**：

| 参数 | 类型 | 说明 |
|------|------|------|
| 默认分页大小 | select | 10 / 20 / 50 / 100 |
| Token 过期时间 | number | 小时，默认 24 |
| 验证码开关 | switch | 登录页验证码 |
| 记住我默认 | switch | 30 天免登录默认勾选 |

**Tab 3 — 安全策略**：

| 参数 | 类型 | 说明 |
|------|------|------|
| 密码最小长度 | number | 默认 8 |
| 密码复杂度 | checkbox | 大写/小写/数字/特殊字符 |
| 登录失败锁定 | number | 次数，默认 5 |
| 锁定时长 | number | 分钟，默认 30 |
| 账号有效期 | number | 天，0=永久 |

底部统一保存按钮（Tab 切换不丢失数据）

#### 5.4.6 部门管理 [新]

**树形布局**（左树右表）：
- 左侧（30%）：部门组织架构树
  - 节点：部门名称 + 人数
  - 右键菜单：新增子部门 / 编辑 / 删除
  - 拖拽排序
  - 支持搜索过滤
- 右侧（70%）：选中部门下的成员列表（ProTable）
  - 列：头像、用户名、昵称、角色、状态
  - 操作：移出部门、修改角色

**部门 CRUD 弹窗**（ProForm）：

| 字段 | 类型 | 说明 |
|------|------|------|
| 上级部门 | tree-select | 可选"顶级" |
| 部门名称 | input | — |
| 负责人 | select | 用户列表 |
| 排序 | number | — |
| 状态 | switch | — |

### 5.5 个人中心 [新]

**布局**：左侧 Tab 导航 + 右侧内容区

#### 个人资料

```
┌──────────────────────────────────────────┐
│  [头像]                          [保存]   │
│  ┌──────┐                                │
│  │ 头像  │  昵称:  Admin                  │
│  │ 预览  │  用户名: admin (只读)           │
│  └──────┘  角色: 超级管理员 (只读)         │
│            部门: 技术部 (只读)             │
│  邮箱:   [________________]               │
│  手机号: [________________]               │
│  性别:   ○男 ○女 ○保密                   │
│  个人简介: [textarea]                     │
└──────────────────────────────────────────┘
```

- 头像上传：el-upload + 裁剪预览，支持点击上传和拖拽上传
- 可编辑字段：头像、昵称、邮箱、手机号、性别、个人简介
- 只读字段：用户名、角色、部门
- 底部保存按钮

#### 安全设置

**修改密码**：
| 字段 | 类型 | 说明 |
|------|------|------|
| 旧密码 | password | 必填 |
| 新密码 | password | 必填，密码强度校验（复用系统设置中的安全策略） |
| 确认密码 | password | 必填，与新密码一致 |

- 密码强度实时提示（弱/中/强，分别用 `var(--cp-danger)` / `var(--cp-warning)` / `var(--cp-success)` ）

**登录记录**：
- ProTable（静态，无搜索，无工具栏）
- 列：登录时间、IP、位置、设备、浏览器、状态(成功/失败 el-tag)
- 最多展示 20 条

### 5.6 消息中心 [新]

**布局**：左侧 Tab 导航 + 右侧列表

#### 站内消息

**ProTable 变体**（列表式消息卡片）：

```
┌──────────────────────────────────────────┐
│  [全部] [通知] [公告]    [全部已读] [删除] │  ← Tab + 操作
├──────────────────────────────────────────┤
│  ● 系统升级通知                    2分钟前 │  ● 主色圆点=未读
│    v2.0 将于本周五 22:00 上线，预计耗时...  │
├──────────────────────────────────────────┤
│  ○ 审批待处理                     1小时前  │  ○ 无点=已读
│    您有 3 条待审批任务...                   │
├──────────────────────────────────────────┤
│  ● 新用户注册                    3小时前   │
│    新用户 zhangsan 已完成注册...            │
└──────────────────────────────────────────┘
```

- **筛选 Tab**：全部 / 通知(notification) / 公告(announcement)
- **操作**：全部已读、批量删除
- **单条操作**：标记已读、删除
- **点击消息**：弹窗展示详情，同时标记为已读
- **消息类型标签**：通知(info) / 公告(warning)
- 分页：底部 el-pagination

#### 通知设置

| 消息类型 | 站内通知 | 邮件通知 |
|---------|---------|---------|
| 系统通知 | switch | switch |
| 任务通知 | switch | switch |
| 审批通知 | switch | switch |
| 安全通知 | switch | switch |

底部保存按钮

### 5.7 组件演示 [新]

#### ProTable 演示
- 基础用法：列配置、数据绑定
- 搜索表单：各种输入控件
- 分页：前端分页演示
- 选择：单选/多选
- 操作列：按钮、确认框
- 导出：CSV 导出

#### ProForm 演示
- 基础表单：输入、选择、日期等
- 表单校验：必填、格式、自定义规则
- 联动：省市区级联、类型切换
- 分步表单：多步骤表单

#### DetailLayout 演示
- 描述列表：键值对展示
- 时间线：操作记录
- 状态流转：步骤条

### 5.8 Layout 架构重构

**现状问题**：现有布局扁平（sidebar | header + main + footer），Header 空洞，内容区裸跑 router-view，无 PageContainer 包裹，Footer 硬编码。像原型展示而非产品级框架。

**重构目标**：建立分层架构，每层独立可配置，内容区有 PageContainer 包裹提供一致的页面结构。

**重构后层级**：
```
Layout
├── AppSidebar              侧边栏（可配置宽度、折叠宽度、唯一展开、Logo 显隐）
├── MainWrapper             主容器
│   ├── AppHeader           顶栏（双区布局）
│   │   ├── 左区            折叠按钮 + 面包屑
│   │   └── 右区            全局搜索 + 通知 + 全屏 + 主题 + 设置 + 用户下拉
│   ├── TabsBar             多标签栏（可配置显隐、样式、最大数量）
│   ├── PageContainer       页面容器 [新]
│   │   ├── PageHeader      页头（标题 + 描述 + 操作按钮区）
│   │   └── slot            页面内容插槽（max-width 可配置）
│   └── AppFooter           底栏（可配置显隐，默认隐藏）
└── AppSettings             配置面板（抽屉式）
```

**新增布局模式**：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| sidebar-header | 左侧边栏 + 顶栏（现有） | 标准后台 |
| header-only | 仅顶栏（现有） | 简单管理页 |
| sidebar-only | 仅侧边栏（现有） | 数据密集型 |
| **mixed** [新] | 双栏侧边：图标导航轨 + 展开面板 | 超多菜单项 |
| **top-menu** [新] | 顶部水平菜单，无侧边栏 | 单层菜单、门户首页 |

**PageContainer 组件**：

```vue
<page-container>
  <template #header>
    <h2>页面标题</h2>
    <p>页面描述</p>
  </template>
  <template #actions>
    <el-button type="primary">新增</el-button>
  </template>
  <!-- 默认插槽：页面内容 -->
  <div class="content">...</div>
</page-container>
```

- 页头区域：标题 + 描述 + 右侧操作按钮区
- 内容区域：max-width 可配置（full / 1200 / 1400 / 1600）
- 内边距可配置：compact(12px) / normal(20px) / comfortable(28px)
- 卡片背景层次：page-bg (var(--cp-bg)) > card-bg (var(--cp-bg-elevated))

**AppFooter 重构**：
- 从"一行硬编码版权文字"改为完全可配置的底栏组件
- 默认隐藏（配置面板 → 布局设置 → 显示底栏 开关控制）
- 3 种底栏样式：
  - `simple` — 居中单行，仅显示版权信息
  - `split` — 左侧版权+备案，右侧额外链接
  - `multi` — 多列布局，左侧版权，中间链接组，右侧补充信息
- 版权文本可自定义（默认 `中台基座`）
- 版权年份：auto 自动取当前年，或自定义起止年（如 `2024-2026`）
- 备案号：选填，带跳转链接（默认指向工信部）
- 额外链接：动态列表，可添加多组 {文本, 链接}，如 GitHub、文档站、关于
- 底栏高度可配置：32 / 40 / 48px

**侧边栏增强**：
- 侧边栏宽度可配置：200~280px（默认 240px）
- 折叠宽度可配置：48~80px（默认 64px）
- 唯一展开模式：同时只展开一个子菜单（可配置开关）
- 混合模式（mixed）下：窄轨 56px 固定 + 展开面板 200px

### 5.9 配置面板升级

**现状问题**：只有 5 项配置（布局模式、主题色、Logo、固定顶栏、标题、动画），功能太少，UI 粗糙。

**升级后 7 大模块 28+ 项配置**：

#### 1. 整体风格
| 配置项 | 类型 | 选项 |
|--------|------|------|
| 主题模式 | 单选 | light / dark / auto（跟随系统） |
| 主题色 | 色板 + 自定义 | 5 预设色 + 颜色选择器 |
| 圆角风格 | 单选 | sharp(8px) / medium(12px) / rounded(16px) |
| 组件大小 | 单选 | large / default / small（Element Plus 全局 size） |

#### 2. 布局设置
| 配置项 | 类型 | 选项 |
|--------|------|------|
| 布局模式 | 卡片选择 | sidebar-header / header-only / sidebar-only / mixed / top-menu |
| 侧边栏宽度 | 滑块 | 200~280px（默认 240px） |
| 折叠宽度 | 滑块 | 48~80px（默认 64px） |
| 侧边栏唯一展开 | 开关 | 默认关闭 |
| 固定侧边栏 | 开关 | 默认开启 |
| 显示 Logo | 开关 | 默认开启 |
| 显示底栏 | 开关 | 默认关闭 |

#### 3. 顶栏设置
| 配置项 | 类型 | 选项 |
|--------|------|------|
| 固定顶栏 | 开关 | 默认开启 |
| 顶栏高度 | 单选 | 56 / 64 / 72px |
| 显示面包屑 | 开关 | 默认开启 |
| 面包屑显示图标 | 开关 | 默认开启 |

#### 4. 多标签页 [新]
| 配置项 | 类型 | 选项 |
|--------|------|------|
| 启用标签页 | 开关 | 默认开启 |
| 标签页样式 | 单选 | card / chrome / plain |
| 最大数量 | 数字输入 | 5~15（默认 10） |
| 标签持久化 | 开关 | 默认开启 |

#### 5. 动画效果
| 配置项 | 类型 | 选项 |
|--------|------|------|
| 页面切换动画 | 卡片选择 | fade / fade-slide / slide-up / slide-right / zoom / none |
| 动画速度 | 单选 | fast(0.2s) / normal(0.3s) / slow(0.5s) |
| 白天/黑夜切换动画 | 开关 | 默认开启（圆形扩散） |

#### 6. 底栏设置
| 配置项 | 类型 | 选项 |
|--------|------|------|
| 显示底栏 | 开关 | 默认关闭（与布局设置中"显示底栏"联动）|
| 版权文本 | 输入框 | 自定义版权信息，如 `中台基座`，默认 `中台基座` |
| 版权年份 | 单选 | auto（自动当前年）/ 自定义起止年（如 2024-2026）|
| 备案号 | 输入框 | 选填，带链接，如 `粤ICP备XXXXXXXX号` |
| 备案号链接 | 输入框 | 备案号跳转地址，默认工信部链接 |
| 额外链接 | 动态列表 | 可添加多组 {文本, 链接}，如 GitHub、文档、关于 |
| 底栏样式 | 单选 | simple（居中单行）/ split（左侧版权+右侧链接）/ multi（多列布局）|
| 底栏高度 | 单选 | 32 / 40 / 48px |

#### 7. 其他
| 配置项 | 类型 | 选项 |
|--------|------|------|
| 页面标题 | 输入框 | 动态修改 document.title |
| 水印 | 开关 + 文本 | 默认关闭 |
| 内容最大宽度 | 单选 | full / 1200 / 1400 / 1600px |
| 内容内边距 | 单选 | compact(12px) / normal(20px) / comfortable(28px) |

**面板 UI 升级**：
- 每个 section 独立卡片，可折叠展开
- 配置变更实时预览（无需点确认）
- 底部操作区：复制配置 JSON / 恢复默认 / 清除缓存
- 面板宽度从 400px 调整为 380px，更紧凑
- 全部配置项使用 CSS 变量，明暗模式自动适配

**LayoutConfig 类型扩展**：

```typescript
export type LayoutMode = 'sidebar-header' | 'header-only' | 'sidebar-only' | 'mixed' | 'top-menu'
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

export interface LayoutConfig {
  // 布局
  mode: LayoutMode
  sidebarWidth: number
  collapsedWidth: number
  uniqueOpened: boolean
  fixedSidebar: boolean
  showLogo: boolean
  showFooter: boolean
  // 顶栏
  fixedHeader: boolean
  headerHeight: number
  showBreadcrumb: boolean
  breadcrumbIcon: boolean
  // 多标签页
  enableTabs: boolean
  tabStyle: TabStyle
  maxTabs: number
  tabPersist: boolean
  // 内容区
  contentMaxWidth: ContentWidth
  contentPadding: ContentPadding
  // 动画
  pageTransition: PageTransition
  animationSpeed: AnimationSpeed
  themeTransitionAnimation: boolean
  // 整体风格
  cornerRadius: CornerRadius
  componentSize: ComponentSize
  watermark: boolean
  watermarkText: string
  // 底栏
  footerStyle: FooterStyle
  footerHeight: number
  footerCopyright: string
  footerYearMode: FooterYearMode
  footerYearStart: number | null
  footerYearEnd: number | null
  footerIcp: string
  footerIcpLink: string
  footerLinks: FooterLink[]
  // 页面标题
  dynamicTitle: string
}
```

---

## 六、技术架构

### 6.1 目录结构（变化部分）

```
src/
├── api/                      [新增]
│   ├── request.ts            axios 实例 + 拦截器
│   ├── types.ts              通用响应类型
│   ├── user.ts               用户相关 API
│   ├── system.ts             系统管理 API
│   ├── profile.ts            个人中心 API
│   └── message.ts           消息中心 API
├── mock/                     [新增]
│   ├── index.ts              Mock 入口（dev 环境）
│   ├── user.mock.ts          用户 mock 数据
│   ├── system.mock.ts        系统管理 mock 数据
│   ├── profile.mock.ts       个人中心 mock 数据
│   └── message.mock.ts      消息 mock 数据
├── components/
│   ├── common/               保留
│   ├── login/                保留
│   ├── ProTable/             [新增] 高级表格
│   │   ├── index.vue
│   │   ├── types.ts
│   │   └── components/
│   │       ├── SearchForm.vue
│   │       └── Pagination.vue
│   ├── ProForm/              [新增] 高级表单
│   │   ├── index.vue
│   │   ├── types.ts
│   │   └── components/
│   ├── PageContainer/        [新增] 页面容器
│   ├── Breadcrumb/           [新增] 面包屑
│   ├── TabsBar/             [新增] 多标签栏
│   ├── SearchBar/           [新增] 全局搜索
│   └── Notification/         [新增] 通知组件
├── directives/               [新增]
│   └── permission.ts         v-permission 指令
├── hooks/                    [新增]
│   ├── useTable.ts           表格逻辑（加载/分页/搜索）
│   ├── useDialog.ts          弹窗逻辑（打开/关闭/确认）
│   └── usePermission.ts      权限检查
├── config/
│   ├── menu.ts               保留，增强为带权限标识
│   ├── theme.ts              保留
│   └── agreement.ts          保留
├── stores/
│   ├── app.ts                保留
│   ├── user.ts               保留，清理 base64 头像
│   ├── theme.ts              保留
│   ├── layout.ts             保留
│   ├── tabs.ts               [新增] 多标签页状态
│   └── permission.ts         [新增] 权限状态
├── router/
│   ├── index.ts              改造：动态路由注册
│   └── modules/              [新增] 路由模块化定义
│       ├── dashboard.ts
│       ├── system.ts
│       ├── profile.ts
│       ├── message.ts
│       └── components.ts
├── types/
│   ├── index.ts              保留，扩展
│   ├── api.ts                [新增] API 类型
│   └── system.ts             [新增] 系统管理类型
├── ... (其余目录保留)
└── main.ts                   保留
```

### 6.2 API 层设计

**目录结构**：

```
src/api/
├── request.ts          axios 实例 + 拦截器
├── types.ts            通用响应类型
├── user.ts             认证 + 用户管理 API
├── system.ts           系统管理 API（角色/菜单/部门/日志/设置）
├── profile.ts          个人中心 API
├── message.ts          消息中心 API
└── dashboard.ts        工作台 API
```

**request.ts**：

```typescript
import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'

const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('mira-token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const { code, data, message } = response.data
    if (code === 200) return data
    if (code === 401) {
      // token 过期：清除登录状态，跳转登录页
      localStorage.removeItem('mira-token')
      ElMessage.error('登录已过期，请重新登录')
      window.location.href = '/login'
      return Promise.reject(new Error('Unauthorized'))
    }
    ElMessage.error(message || '请求失败')
    return Promise.reject(new Error(message || 'Error'))
  },
  (error) => {
    if (error.name === 'CanceledError') return Promise.reject(error)
    const msg = error.response?.data?.message || '网络错误'
    ElMessage.error(msg)
    return Promise.reject(error)
  }
)

export default request
```

**types.ts**：

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
```

**API 模块示例**：

```typescript
// src/api/user.ts
import request from './request'
import type { PageParams, PageResult } from './types'
import type { UserInfo } from '@/types'

export const userApi = {
  login(data: { username: string; password: string }) {
    return request.post<LoginResult>('/auth/login', data)
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

### 6.2.1 Mock 服务架构

**方案**：使用 vite-plugin-mock 拦截 dev 环境请求，Mock 数据和真实 API 接口零成本切换。

**目录结构**：

```
src/mock/
├── index.ts              Mock 注册入口
├── types.ts              Mock 工具类型
├── user.mock.ts          认证 + 用户管理
├── system.mock.ts        系统管理（角色/菜单/部门/日志/设置）
├── profile.mock.ts       个人中心
├── message.mock.ts       消息中心
└── dashboard.mock.ts     工作台
```

**Mock 注册**：

```typescript
// src/mock/index.ts
import type { MockMethod } from 'vite-plugin-mock'
import userMocks from './user.mock'
import systemMocks from './system.mock'
import profileMocks from './profile.mock'
import messageMocks from './message.mock'
import dashboardMocks from './dashboard.mock'

export const mockModules: MockMethod[] = [
  ...userMocks,
  ...systemMocks,
  ...profileMocks,
  ...messageMocks,
  ...dashboardMocks,
]
```

**Mock 模块示例**：

```typescript
// src/mock/user.mock.ts
import type { MockMethod } from 'vite-plugin-mock'

const users = [
  { id: '1', username: 'admin', nickname: 'Admin', phone: '13800000001',
    email: 'admin@cp.com', role: 'admin', dept: 'tech', status: 1,
    createdAt: '2026-07-01 10:00:00' },
  // ... 更多 mock 数据
]

export default [
  {
    url: '/api/user/list',
    method: 'get',
    response: ({ query }) => {
      const { page = 1, pageSize = 10, username } = query
      let list = [...users]
      if (username) list = list.filter(u => u.username.includes(username))
      const start = (page - 1) * pageSize
      return {
        code: 200,
        data: { list: list.slice(start, start + +pageSize), total: list.length,
                page: +page, pageSize: +pageSize },
        message: 'success'
      }
    }
  },
  {
    url: '/api/user',
    method: 'post',
    response: ({ body }) => {
      users.push({ ...body, id: String(Date.now()), createdAt: new Date().toISOString() })
      return { code: 200, data: null, message: '创建成功' }
    }
  },
  // ... update, delete, resetPassword
] as MockMethod[]
```

**Vite 配置**：

```typescript
// vite.config.ts
import { viteMockServe } from 'vite-plugin-mock'

export default defineConfig({
  plugins: [
    // ... 现有插件
    viteMockServe({
      mockPath: 'src/mock',
      enable: process.env.NODE_ENV === 'development',
    })
  ]
})
```

**切换到真实后端**：将 `VITE_API_BASE_URL` 环境变量设置为真实后端地址，关闭 viteMockServe，API 代码零改动。

### 6.3 动态路由设计

**流程**：
```
登录成功
  → 调用 API 获取用户权限（现阶段从 config/mock 获取）
  → permissionStore 存储权限码 + 菜单数据
  → 根据菜单数据动态注册路由（router.addRoute）
  → 动态生成侧边栏菜单
```

**路由模块化**：

```typescript
// src/router/modules/system.ts
export default {
  path: '/system',
  name: 'System',
  component: () => import('@/layouts/index.vue'),
  meta: { title: '系统管理', icon: 'Setting', requiresAuth: true },
  children: [
    {
      path: 'users',
      name: 'SystemUsers',
      component: () => import('@/pages/system/UserPage.vue'),
      meta: { title: '用户管理', permission: 'system:user:list' }
    },
    // ...
  ]
}
```

**Mock 菜单数据**（config 中定义）：

```typescript
// src/config/menu.ts
export const MENU_LIST: MenuItem[] = [
  {
    id: 'dashboard',
    title: '工作台',
    icon: 'Odometer',
    path: '/dashboard',
    permission: 'dashboard:view'
  },
  {
    id: 'system',
    title: '系统管理',
    icon: 'Setting',
    permission: 'system:view',
    children: [
      {
        id: 'system-users',
        title: '用户管理',
        icon: 'User',
        path: '/system/users',
        permission: 'system:user:list'
      },
      // ...
    ]
  }
]
```

### 6.4 权限系统

**三层权限体系**：

```
登录成功
  → 调用 API 获取用户信息 + 权限码 + 菜单数据
  ↓
┌─────────────────────────────────────────────┐
│  1. 路由级 — 动态注册路由                     │
│     根据 menu 数据动态 addRoute              │
│     无权限的路由不注册 → 直接 404            │
├─────────────────────────────────────────────┤
│  2. 菜单级 — 侧边栏过滤                       │
│     根据 permission code 过滤菜单树          │
│     无权限的菜单项不显示                      │
├─────────────────────────────────────────────┤
│  3. 按钮级 — v-permission 指令               │
│     根据权限码控制按钮/元素显隐              │
│     无权限的元素直接从 DOM 移除              │
└─────────────────────────────────────────────┘
```

**权限标识规范**：`模块:资源:操作`

| 标识 | 说明 |
|------|------|
| `system:user:list` | 用户管理-查看列表 |
| `system:user:create` | 用户管理-新增 |
| `system:user:update` | 用户管理-编辑 |
| `system:user:delete` | 用户管理-删除 |
| `system:user:reset` | 用户管理-重置密码 |
| `system:role:*` | 角色管理-全部操作（通配符） |
| `*` | 超级管理员，拥有全部权限 |

**permissionStore**：

```typescript
export const usePermissionStore = defineStore('permission', () => {
  const permissions = ref<string[]>([])
  const menuRoutes = ref<MenuItem[]>([])
  const dynamicRoutes = ref<RouteRecordRaw[]>([])

  // 检查权限
  function hasPermission(code: string): boolean {
    if (permissions.value.includes('*')) return true
    return permissions.value.includes(code)
  }

  // 批量设置权限
  function setPermissions(codes: string[]) {
    permissions.value = codes
  }

  // 设置菜单 + 生成动态路由
  function setMenuRoutes(menus: MenuItem[]) {
    menuRoutes.value = filterMenusByPermission(menus)
    dynamicRoutes.value = generateRoutes(menus)
  }

  // 过滤菜单树（递归）
  function filterMenusByPermission(menus: MenuItem[]): MenuItem[] {
    return menus.filter(menu => {
      if (menu.children?.length) {
        menu.children = filterMenusByPermission(menu.children)
      }
      return hasPermission(menu.permission)
    })
  }

  // 从菜单数据生成路由
  function generateRoutes(menus: MenuItem[]): RouteRecordRaw[] {
    return menus
      .filter(menu => menu.component)
      .map(menu => ({
        path: menu.path,
        name: menu.name,
        component: () => import(`@/pages/${menu.component}.vue`),
        meta: { title: menu.title, icon: menu.icon, permission: menu.permission }
      }))
  }

  return { permissions, menuRoutes, dynamicRoutes,
           hasPermission, setPermissions, setMenuRoutes }
})
```

**v-permission 指令**：

```typescript
// src/directives/permission.ts
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

```vue
<!-- 单权限 -->
<el-button v-permission="'system:user:create'" type="primary">新增</el-button>

<!-- 多权限（任一满足即可） -->
<el-button v-permission="['system:user:export', 'system:user:admin']">导出</el-button>
```

**usePermission 组合式函数**：

```typescript
// src/hooks/usePermission.ts
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

**动态路由注册流程**：

```
1. 用户登录 → 拿到 token
2. 路由守卫 beforeEach:
   a. 有 token 且未加载权限 → 调用 /auth/info 获取 permissions + menus
   b. permissionStore.setPermissions(codes)
   c. permissionStore.setMenuRoutes(menus) → 生成 dynamicRoutes
   d. dynamicRoutes.forEach(route => router.addRoute(route))
   e. 记录 isRoutesAdded = true
   f. 重新导航到目标路由（replace）
3. 有 token 且已加载 → 直接放行
4. 无 token → 跳转 /login
5. 登出 → 清除 token + permissions + dynamicRoutes → 跳转 /login
```

### 6.5 状态管理

**新增 Store**：

```typescript
// src/stores/tabs.ts
export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([])
  const activeTab = ref<string>('')

  function addTab(tab: TabItem) { /* ... */ }
  function closeTab(path: string) { /* ... */ }
  function closeOthers(path: string) { /* ... */ }
  function closeAll() { /* ... */ }

  return { tabs, activeTab, addTab, closeTab, closeOthers, closeAll }
}, {
  persist: {
    key: 'cp-tabs',
    storage: sessionStorage
  }
})
```

```typescript
// src/stores/permission.ts
export const usePermissionStore = defineStore('permission', () => {
  const permissions = ref<string[]>([])
  const menuRoutes = ref<MenuItem[]>([])

  function hasPermission(code: string): boolean {
    return permissions.value.includes(code) || permissions.value.includes('*')
  }

  function setPermissions(codes: string[]) {
    permissions.value = codes
  }

  function setMenuRoutes(menus: MenuItem[]) {
    menuRoutes.value = menus
  }

  return { permissions, menuRoutes, hasPermission, setPermissions, setMenuRoutes }
})
```

### 6.6 组合式函数

```typescript
// src/hooks/useTable.ts
export function useTable<T>(apiFn: (params: any) => Promise<PageResult<T>>) {
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

---

## 七、视觉设计方向

### 7.1 设计语言

参考 Linear / Vercel 的设计风格：

- **克制** — 不用过于鲜艳的颜色，主色用于关键交互
- **留白** — 充足的间距让内容呼吸
- **层次** — 通过背景色差异（bg / bg-elevated / bg-overlay）建立层次
- **微交互** — 按钮悬停、卡片上浮、过渡动画要精准
- **一致性** — 所有卡片圆角统一(12px)、所有按钮高度统一(36px)

### 7.2 色彩

**核心规则：所有颜色必须通过主题变量引用，严禁写死颜色值。**

保留现有主题系统，不做破坏性变更：
- 主题色维持 5 个预设色（靛蓝 / 紫色 / 蓝色 / 青色 / 绿色），默认青色 `#06b6d4`，通过 `var(--cp-primary)` 引用
- 中性色阶维持现有 zinc 色系，通过 `var(--cp-bg)` / `var(--cp-text)` 等引用
- 暗色模式通过 `[data-theme='dark']` 切换 CSS 变量值，组件代码无需感知
- **新增语义色时**，必须在 `:root` 和 `[data-theme='dark']` 中同时定义对应的 CSS 变量
- **严禁**在组件 `<style>` 中写 `color: #4f46e5` 或 `background: rgba(0,0,0,0.1)` 这类硬编码值

### 7.3 字体

```scss
$font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
              'Helvetica Neue', Arial, sans-serif;

// 等宽字体（代码/数字）
$font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
```

### 7.4 间距

保持现有 4px 基准的间距系统，页面级间距调整：
- 页面内边距：24px → 20px（更紧凑）
- 卡片间距：20px → 16px
- 卡片内边距：保持 24px

### 7.5 组件视觉

- 卡片：圆角 12px，细微边框(1px solid var(--cp-border))，极轻阴影
- 按钮：高度 36px，圆角 8px
- 输入框：高度 36px，圆角 8px，focus 状态主色边框
- 表格：行高 52px，斑马纹可选，hover 行高亮

### 7.6 样式规范（强制）

> **此规范适用于所有新增/修改的组件和页面，无例外。**

#### 7.6.1 禁止事项

| 禁止 | 正确做法 |
|------|---------|
| `color: #18181b` | `color: var(--cp-text)` |
| `background: #ffffff` | `background: var(--cp-bg)` |
| `border: 1px solid #e4e4e7` | `border: 1px solid var(--cp-border)` |
| `background: rgba(6, 182, 212, 0.1)` | `background: var(--cp-primary-light)` |
| `box-shadow: 0 1px 3px rgb(0 0 0 / 0.1)` | `box-shadow: $shadow`（SCSS 变量），或新增 `--cp-shadow` CSS 变量 |
| `color: red` / `color: blue` 等颜色名 | `color: var(--cp-danger)` / `color: var(--cp-info)` |

#### 7.6.2 可用 CSS 变量清单（运行时动态，支持明暗切换）

| 变量名 | 用途 | 亮色模式值 | 暗色模式值 |
|--------|------|-----------|-----------|
| `--cp-primary` | 主题色 | `#06b6d4` | 同亮色（由 themeStore 动态设置） |
| `--cp-primary-hover` | 主题色 hover | `#0891b2` | 同上 |
| `--cp-primary-light` | 主题色 10% 透明 | `rgba(6,182,212,0.1)` | 同上 |
| `--cp-primary-lighter` | 主题色 5% 透明 | `rgba(6,182,212,0.05)` | 同上 |
| `--cp-bg` | 页面背景 | `#ffffff` | `#18181b` |
| `--cp-bg-elevated` | 卡片/面板背景 | `#fafafa` | `#27272a` |
| `--cp-bg-overlay` | 浮层背景 | `#ffffff` | `#3f3f46` |
| `--cp-bg-hover` | hover 背景 | `#f4f4f5` | `#3f3f46` |
| `--cp-text` | 主文本 | `#18181b` | `#fafafa` |
| `--cp-text-secondary` | 次要文本 | `#71717a` | `#a1a1aa` |
| `--cp-text-tertiary` | 辅助文本 | `#a1a1aa` | `#71717a` |
| `--cp-text-placeholder` | 占位文本 | `#d4d4d8` | `#52525b` |
| `--cp-border` | 边框 | `#e4e4e7` | `#3f3f46` |
| `--cp-border-light` | 浅边框 | `#f4f4f5` | `#27272a` |
| `--cp-success` | 成功色 | `#10b981` | 同亮色 |
| `--cp-warning` | 警告色 | `#f59e0b` | 同亮色 |
| `--cp-danger` | 危险色 | `#ef4444` | 同亮色 |
| `--cp-info` | 信息色 | `#3b82f6` | 同亮色 |
| `--cp-stat-icon-success-bg` | 统计图标-成功背景 | `#ecfdf5` | `rgba(16,185,129,0.15)` |
| `--cp-stat-icon-success-color` | 统计图标-成功色 | `#10b981` | `#34d399` |
| `--cp-stat-icon-info-bg` | 统计图标-信息背景 | `#eff6ff` | `rgba(59,130,246,0.15)` |
| `--cp-stat-icon-info-color` | 统计图标-信息色 | `#3b82f6` | `#60a5fa` |
| `--cp-stat-icon-warning-bg` | 统计图标-警告背景 | `#fef3c7` | `rgba(245,158,11,0.15)` |
| `--cp-stat-icon-warning-color` | 统计图标-警告色 | `#f59e0b` | `#fbbf24` |
| `--cp-stat-icon-purple-bg` | 统计图标-紫色背景 | `#f3e8ff` | `rgba(147,51,234,0.15)` |
| `--cp-stat-icon-purple-color` | 统计图标-紫色色 | `#9333ea` | `#a78bfa` |

#### 7.6.3 可用 SCSS 变量（编译时固定，间距/字号/圆角/阴影等）

```scss
// 间距：$spacing-xs(4) / $spacing-sm(8) / $spacing-md(16) / $spacing-lg(24) / $spacing-xl(32) / $spacing-2xl(48)
// 字号：$font-xs(12) / $font-sm(14) / $font-base(16) / $font-lg(18) / $font-xl(20) / $font-2xl(24) / $font-3xl(30) / $font-4xl(36)
// 圆角：$radius-sm(4) / $radius-md(8) / $radius-lg(12) / $radius-xl(16) / $radius-full(9999)
// 阴影：$shadow-sm / $shadow / $shadow-md / $shadow-lg / $shadow-xl
// 暗色阴影：$dark-shadow-sm / $dark-shadow / $dark-shadow-md
// 动画：$transition-fast(150ms) / $transition-base(200ms) / $transition-slow(300ms)
// 断点：$breakpoint-xs(480) / $breakpoint-sm(640) / $breakpoint-md(768) / $breakpoint-lg(1024) / $breakpoint-xl(1280) / $breakpoint-2xl(1536)
// z-index：$z-dropdown(1000) / $z-sticky(1020) / $z-fixed(1030) / $z-modal-backdrop(1040) / $z-modal(1050) / $z-popover(1060) / $z-tooltip(1070)
```

#### 7.6.4 新增语义色规范

如果现有 CSS 变量不够用，需要新增语义色时，必须遵循以下流程：

1. 在 `src/styles/global.scss` 的 `:root` 中定义亮色模式值
2. 在 `[data-theme='dark']` 中定义暗色模式值
3. 命名规范：`--cp-{语义名}`，如 `--cp-sidebar-active-bg`
4. 如果该变量依赖主题色，在 `src/config/theme.ts` 的 `applyTheme()` 中动态设置

```scss
// 示例：新增侧边栏激活态背景
:root {
  --cp-sidebar-active-bg: var(--cp-primary-light);
}
[data-theme='dark'] {
  --cp-sidebar-active-bg: var(--cp-primary-light);
  // 如果暗色下需要不同值，在这里覆盖
}
```

#### 7.6.5 ECharts 图表配色

ECharts 图表也必须适配明暗模式：
- 通过 `themeStore` 的 `isDark` 计算属性判断当前主题
- 图表 option 中的颜色使用从 CSS 变量获取的值，而非硬编码
- 提供统一的 `getChartTheme(isDark: boolean)` 工具函数返回配色对象

```typescript
// src/utils/chart-theme.ts
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
    // 图表特有色（从 CSS 变量获取，不硬编码）
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

#### 7.6.6 Element Plus 组件颜色

Element Plus 组件的颜色通过 `--el-color-primary` 系列 CSS 变量控制，已在 `theme.ts` 中动态设置。新增组件时：
- 直接使用 Element Plus 默认的 `type` 属性（`primary` / `success` / `warning` / `danger` / `info`）
- 不要在组件上通过 `style` 属性写死颜色
- 如果需要自定义 Element Plus 组件样式，通过覆盖 `--el-*` CSS 变量实现，而非写死值

---

## 八、ProTable 组件设计

### 8.1 核心理念

配置驱动的高级表格组件，封装搜索表单 + 表格 + 分页 + 工具栏 + 操作列，一行配置替代手写大量 el-table + el-pagination + el-form 样板代码。

### 8.2 Props 定义

```typescript
interface ProTableProps<T> {
  // 数据源（二选一）
  data?: T[]                                         // 静态数据
  request?: (params: any) => Promise<PageResult<T>>  // API 请求函数
  // 列配置
  columns: ProTableColumn<T>[]
  // 搜索配置（可选）
  search?: ProTableSearchConfig
  // 分页
  pagination?: boolean | { pageSize?: number; layout?: string }
  // 选择
  selection?: boolean | 'single' | 'multiple'
  // 工具栏
  toolbar?: {
    title?: string
    actions?: ActionButton[]
    showRefresh?: boolean       // 刷新按钮，默认 true
    showDensity?: boolean       // 密度切换（紧凑/默认/宽松），默认 true
    showColumnToggle?: boolean  // 列显隐切换，默认 true
  }
  // 操作列
  actions?: (row: T) => ActionButton[]
  actionsWidth?: number | string
  actionsFixed?: 'left' | 'right'
  // 其他
  rowKey?: string | ((row: T) => string)
  emptyText?: string
  loading?: boolean
}

interface ProTableColumn<T> {
  prop: keyof T
  label: string
  width?: string | number
  minWidth?: string | number
  fixed?: 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  sortable?: boolean | 'custom'
  formatter?: (row: T, column: any, cellValue: any) => string
  // 自定义渲染
  slot?: string                    // 插槽名，优先级最高
  render?: (row: T) => VNode       // 渲染函数
  // 格式化
  dict?: Record<string, string>    // 字典映射，如 { 0: '禁用', 1: '启用' }
  // 搜索联动（当该列也出现在搜索表单时）
  searchable?: boolean
  searchType?: 'input' | 'select' | 'date' | 'daterange' | 'tree'
  searchOptions?: { label: string; value: any }[]
}

interface ProTableSearchConfig {
  // 搜索字段（也可从 columns 中 searchable 字段自动提取）
  fields?: SearchField[]
  // 布局
  colSpan?: number         // 每行字段数，默认 3（响应式：xs=1, sm=2, md=3）
  // 行为
  showExpand?: boolean     // 超过 2 行时折叠/展开，默认 true
  defaultExpanded?: boolean // 默认展开，默认 false
  // 按钮
  searchText?: string      // 默认"搜索"
  resetText?: string       // 默认"重置"
}

interface SearchField {
  prop: string
  label: string
  type: 'input' | 'select' | 'date' | 'daterange' | 'tree' | 'cascader'
  options?: { label: string; value: any }[]
  placeholder?: string
  defaultValue?: any
  clearable?: boolean
}

interface ActionButton {
  text: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'default'
  icon?: string
  click?: (row?: any) => void
  confirmText?: string    // 带确认框
  show?: (row?: any) => boolean  // 条件显示
  disabled?: (row?: any) => boolean
}
```

### 8.3 插槽规范

| 插槽名 | 说明 | 参数 |
|--------|------|------|
| `#-{prop}` | 单元格自定义渲染 | `{ row, column, value }` |
| `#toolbar-left` | 工具栏左侧扩展 | — |
| `#toolbar-right` | 工具栏右侧扩展 | — |
| `#empty` | 空数据自定义 | — |
| `#expand` | 展开行内容 | `{ row }` |

### 8.4 工具栏规范

```
[标题]                              [刷新] [密度] [列设置] [自定义按钮...]
```

- **刷新** — 重新请求数据，按钮旋转动画
- **密度** — 下拉选择 紧凑/默认/宽松，调整行高（40/52/64px）
- **列设置** — 下拉面板，勾选控制列显隐，拖拽排序
- **自定义按钮** — toolbar.actions 配置，如"导出""批量删除"

### 8.5 使用示例

```vue
<pro-table
  :columns="columns"
  :request="userApi.getList"
  :search="{ colSpan: 3, showExpand: true }"
  :pagination="{ pageSize: 10 }"
  selection="multiple"
  :actions="rowActions"
  actions-fixed="right"
>
  <!-- 状态列自定义渲染 -->
  <template #status="{ row }">
    <el-tag :type="row.status ? 'success' : 'danger'">
      {{ row.status ? '启用' : '禁用' }}
    </el-tag>
  </template>

  <!-- 工具栏扩展 -->
  <template #toolbar-right>
    <el-button v-permission="'system:user:export'" @click="handleExport">
      导出
    </el-button>
  </template>
</pro-table>
```

---

## 九、ProForm 组件设计

### 9.1 核心理念

Schema 驱动的高级表单组件，通过 JSON 配置生成表单，内置校验、联动、布局、分步。替代手写大量 el-form + el-form-item 样板代码。

### 9.2 Props 定义

```typescript
interface ProFormProps<T = any> {
  // Schema 配置
  schema: ProFormField[]
  // 数据模型
  model: T
  // 布局
  layout?: 'horizontal' | 'vertical' | 'inline'   // 默认 horizontal
  labelWidth?: string | number                      // 默认 100px
  labelPosition?: 'left' | 'right' | 'top'         // 默认 right
  colSpan?: number                                  // 每行字段数，默认 1
  // 行为
  disabled?: boolean
  readonly?: boolean
  // 按钮
  submitText?: string | false                      // false 隐藏，默认"提交"
  resetText?: string | false                       // false 隐藏，默认"重置"
  // 校验
  rules?: FormRules
  // 分步
  steps?: ProFormStep[]
}

interface ProFormField {
  type: FieldType
  prop: string                    // 字段名
  label: string
  // 通用属性
  placeholder?: string
  defaultValue?: any
  required?: boolean
  rules?: FormItemRule[]
  disabled?: boolean | ((model: any) => boolean)
  // 布局
  colSpan?: number                // 占几列，默认 1
  // 显隐联动
  show?: (model: any) => boolean
  // 字典/选项
  options?: { label: string; value: any; disabled?: boolean }[]
  dict?: string                  // 字典 key，从全局字典获取
  // 事件
  onChange?: (value: any, model: any) => void
  // 自定义
  slot?: string                  // 插槽名
  // 类型专属属性
  props?: Record<string, any>    // 透传给底层组件
}

type FieldType =
  | 'input'           // 文本输入
  | 'textarea'        // 多行文本
  | 'number'          // 数字
  | 'select'          // 下拉
  | 'radio'           // 单选
  | 'checkbox'        // 多选
  | 'switch'          // 开关
  | 'date'            // 日期
  | 'daterange'       // 日期范围
  | 'datetime'        // 日期时间
  | 'time'            // 时间
  | 'tree-select'     // 树选择
  | 'cascader'        // 级联
  | 'upload'          // 文件上传
  | 'icon-picker'     // 图标选择
  | 'slot'            // 自定义插槽
```

### 9.3 联动规则

```typescript
// 显隐联动 — 根据其他字段值控制当前字段显示
{
  prop: 'parentId',
  type: 'tree-select',
  label: '上级菜单',
  show: (model) => model.type !== 'button',  // 按钮类型不显示上级
}

// 选项联动 — 根据其他字段值改变当前选项
{
  prop: 'city',
  type: 'select',
  label: '城市',
  options: (model) => cityMap[model.province] || [],  // 省份改变时城市列表联动
}

// 禁用联动
{
  prop: 'username',
  type: 'input',
  label: '用户名',
  disabled: (model) => model.id !== undefined,  // 编辑时不可改用户名
}
```

### 9.4 分步表单

```typescript
interface ProFormStep {
  title: string
  description?: string
  fields: string[]   // 该步骤显示的字段 prop 列表
}
```

- 顶部 el-steps 步骤条
- 底部"上一步""下一步""提交"按钮
- 每步独立校验，全部通过才能提交

### 9.5 暴露方法

```typescript
interface ProFormExpose {
  validate: () => Promise<boolean>     // 触发校验
  resetFields: () => void              // 重置
  scrollToField: (prop: string) => void // 滚动到字段
  getFormData: () => any               // 获取表单数据
}
```

### 9.6 使用示例

```vue
<pro-form
  ref="formRef"
  v-model="formData"
  :schema="formSchema"
  :rules="rules"
  label-width="100px"
  :col-span="2"
  @submit="handleSubmit"
  @reset="handleReset"
>
  <!-- 自定义字段 -->
  <template #avatar="{ model }">
    <el-upload v-model="model.avatar" :show-file-list="false">
      <el-avatar :src="model.avatar" />
    </el-upload>
  </template>
</pro-form>
```

---

## 十、实施阶段建议

### Phase 1 — 基础设施（地基）
- 清理 user.ts base64 问题
- dist/ 加入 .gitignore
- 搭建 API 层（axios + 拦截器 + 类型）
- 搭建 Mock 服务
- 新增 directives / hooks 目录
- 配置 .env 环境变量

### Phase 2 — 布局重构（骨架）
- Layout 分层重构：Sidebar → MainWrapper → (Header → TabsBar → PageContainer → Footer)
- PageContainer 组件（页头 + 内容区 + max-width + 内边距配置）
- 新增布局模式：mixed / top-menu
- 侧边栏增强（宽度可配置、唯一展开、mixed 双栏模式）
- AppFooter 重构（可配置显隐，默认隐藏）
- 多标签页 TabsBar
- 顶栏增强（面包屑、通知、全屏、用户下拉）
- 全局搜索（Ctrl+K）
- 配置面板升级（7 大模块 28+ 项配置，含底栏设置）
- 动态路由改造

### Phase 3 — 核心业务组件（组件）
- ProTable 组件
- ProForm 组件
- 组合式函数（useTable / useDialog）

### Phase 4 — 业务页面（血肉）
- 用户管理 CRUD
- 角色管理 + 权限分配
- 菜单管理 + 拖拽
- 操作日志
- 系统设置
- 部门管理

### Phase 5 — 新增页面（扩展）
- 个人中心
- 消息中心
- 组件演示页

### Phase 6 — 打磨（抛光）
- 工作台 Dashboard 增强（ECharts，配色走 CSS 变量）
- 视觉细节打磨
- 暗色模式全覆盖检查（所有新增组件验证明暗切换）
- 响应式适配

---

## 十一、已知技术债务处理

| 问题 | 处理方案 | 阶段 |
|------|---------|------|
| user.ts 797KB base64 | 提取为图片文件或用 el-avatar icon | Phase 1 |
| dist/ 提交到 Git | 加入 .gitignore | Phase 1 |
| 硬编码 demo 登录 | 抽离到 API 层 + Mock | Phase 1 |
| refreshTokenExpire 死代码 | 接入路由守卫调用 | Phase 2 |
| vite 端口不一致 | 统一为 9000 | Phase 1 |
| App.vue 空钩子 | 清理 | Phase 1 |
| 无 ESLint/Prettier | 配置 | Phase 1 |
| 无环境变量 | .env 文件 | Phase 1 |

---

## 十二、i18n 预留

暂不集成 vue-i18n，但代码结构上预留：
- 所有 UI 文案集中在组件的 `const text = { ... }` 中定义
- 路由标题、菜单标题保持配置化
- 后续集成时只需添加 vue-i18n + 将文本替换为 `t('key')` 调用

---

## 附录：技术选型记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 图表库 | ECharts | 功能最全，适合复杂可视化，社区活跃 |
| 路由策略 | 动态路由 | 从 config mock 数据生成，后期转 API 调用 |
| HTTP 库 | axios | 拦截器/取消/超时内置，生态成熟 |
| i18n | 预留不集成 | 减少复杂度，文本集中管理预留切换 |
