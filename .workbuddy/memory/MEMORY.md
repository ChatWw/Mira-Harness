# 项目长期事实

## 项目定位
- **中台基座**（core-platform），本质是一个**微应用聚合工具集 / 应用门户**
- 后续其他项目会以**微应用**方式嵌入进来，工作台是统一入口
- 注意：顶部标签虽显示"知识图谱平台"，但那只是其中一个微应用，基座本身不绑定任何垂直业务

## 已去除的功能
- 用户管理、角色管理、菜单管理相关逻辑已全部砍掉
- 系统不做多用户权限管理体系
- 一打开就是这个工作台页面

## 工作台设计约定
- 原"概览"页改名为**「工作台」**
- 框架不变：侧边栏 + 顶栏 + 主内容区
- 搜索框保留为主角（带 ⌘K，Command Palette 语义：搜应用/页面/命令）
- 主体内容围绕"已接入的微应用"组织，不塞通用后台模块
- 顶部不设问候语，不出现用户名（与去用户化自洽）
- 顶部布局已定：第一行「时间日期（左）+ 应用状态摘要（右）」，第二行搜索框
- 状态摘要内容：X 个应用在线 · X 个待更新 · 今日访问 X 次

## 技术栈
- uni-app Vue3 + 微信云开发（微信小程序）
- 同时承载 Mira 桌面端（Electron + Vue3 + Element Plus + SCSS），见 `src/` 目录

## Mira 桌面端 · 设计系统
- 主色：`#06b6d4`（cyan，沿用 `--cp-primary`，见 `src/styles/variables.scss`）
- 中性色：slate-zinc；背景 `#ffffff` / `#fafafa`；边框 `#e4e4e7`
- 圆角阶梯：4 / 8 / 12 / 16；阴影：sm / md / lg 三档
- 侧栏宽度：240px（`--sidebar-w` 等变量未定义，全局用 240px）
- 字体：`-apple-system` 优先（macOS Electron）；中文 fallback PingFang SC / 微软雅黑
- 头部组件：<GlobalHeader>（mac 红绿灯与导航合一行） + <AppSidebar> + <TabsBar>(可选) + <AppMain> + <AppFooter>

## Mira 路由（重点路径）
- `/workspace/history` → 渲染 `查看全部对话`，由 `src/pages/frontend/harness/history/index.vue` 实现
- `/workspace/chat` 和 `/workspace/chat/:id` → Chat 主交互
- `/workspace/projects` → 项目列表
- `src/pages/frontend/harness/...` 是工作台相关页面群

## 重要页面决策
- 历史会话页（本次重写）：
  - 4 张统计卡（总数 / 今日新建 / 进行中 / 最常使用模型）
  - 工具栏：搜索 + 4 筛选 + 排序 + 密度切换
  - 已应用筛选 chip 条
  - 日期分组 (今天 / 昨天 / 本周 / 更早)
  - 批量操作栏
  - 完整 PRD 与设计稿在 `wiki/conversations-history-redesign/`

