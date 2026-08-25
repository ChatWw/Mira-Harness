<div align="center">

<img src="src/asset/mira-logo.png" width="96" alt="Mira Harness 图标" />

# Mira Harness

**本地优先的个人 AI 工作台 —— 与 Mira（米拉）一起创作、整理与自动化**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883.svg?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Electron](https://img.shields.io/badge/Electron-43-47848f.svg?logo=electron&logoColor=white)](https://www.electronjs.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev)
[![SQLite](https://img.shields.io/badge/SQLite-3-003b57.svg?logo=sqlite&logoColor=white)](https://www.sqlite.org)

> 将小说创作、Agent 工作台、模型调用与本地工具集中到一个桌面应用，
> 所有数据与模型密钥保存在本机，不依赖任何云端服务。

</div>

> 💡 **关于命名**：**Mira Harness** 是项目名（仓库、文档与工程产物）；界面中与你对话的 AI 助手叫 **Mira（米拉）**；安装后的应用名保持 **Mira**，用户数据目录不变。

## ✨ 特性

### 🤖 Agent 工作台（Harness）

打开应用即进入新对话，会话围绕**项目（源文件夹）**组织，Agent 可以直接读写项目文件：

- **运行步骤可追溯**：消息按"运行步骤"展开，每一步的工具调用、耗时与结果清晰可见
- **权限控制**：`默认` / `自动批准` / `完全` 三种会话权限模式，可全局配置默认值
- **模型管理**：GLM、Kimi、MiniMax、DeepSeek、Ollama 预设 + 自定义 OpenAI 兼容端点，按职责绑定模型，密钥只存本机
- **MCP 集成**：管理 MCP 服务器，扩展 Agent 工具能力
- **Git 集成**：分支前缀、PR 合并方式、强制推送、草稿 PR、评审送达等配置
- **文件工具**：读取 / 编辑 / 删除（进回收站可还原），内置 Python 环境执行脚本
- **上下文管理**：按上下文窗口自动压缩历史，实时显示 token 用量
- **自动化**：定时任务与自动触发（即将上线）

### 📖 AI 小说创作工作台

面向长篇小说的完整创作流程，设定、生成、编辑与整理全部在 Mira Harness 内完成：

- **完整创作链路**：作品设定 → 故事总纲 → 章节细纲 → 正文，模型按阶段生成与续写
- **作品设定**：故事背景、人物设定、角色关系、核心剧情、写作风格
- **创作辅助**：知识库、提示词模板（总纲 / 章节 / 正文 / 选中文本）、思维导图、快捷词条
- **双模型职责**：创作模型（总纲、章节、正文、自由助手）与自动处理模型（批量优化、拆书）
- **数据自持**：作品存于本机 SQLite，支持导入 / 导出完整项目 JSON

### 🛠️ 系统管理

菜单配置、微应用管理、备份与偏好、模型配置、MCP、Agent 权限、Git、Python 环境、外观、通用、快捷键、加载动效、图标库等设置页面，偏好持久化到本机 SQLite。

### 🧩 微应用与网页宿主

支持 Wujie 与 iframe 两种宿主，注册本地工具或内嵌网页；本地微应用由仅监听 `127.0.0.1` 的受控静态服务提供。

### 🔒 本地优先

无账号体系、无后端依赖。项目数据保存在本机 SQLite，模型密钥不离开设备，完整能力运行于 macOS 桌面端（Windows 打包脚本已就绪）。

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### Web 开发（界面预览）

```bash
npm run dev
```

默认地址为 [http://localhost:9000](http://localhost:9000)，用于预览 Web 界面。浏览器没有 Electron 主进程和 `window.platform` IPC，因此不能配置或调用模型、访问本地 Agent 工具，也不应作为 Harness 的运行入口。完整 Agent 工作台请使用桌面版。

### 桌面版

```bash
npm run desktop:dev       # Electron 开发
npm run desktop:build     # macOS（Apple Silicon DMG）
npm run desktop:build:win # Windows（NSIS 安装包，需在 Windows 机器上执行）
```

桌面版由 Electron 主进程承载 SQLite 与模型代理，前端通过受限的 `window.platform` IPC API 访问菜单、微应用与界面偏好。

### 其他命令

```bash
npm run build   # 类型检查（vue-tsc）+ 生产构建
npm test        # 单元测试（vitest）
npm run preview # 预览构建产物
```

## 🛠️ 技术栈

| 领域 | 技术 |
| --- | --- |
| 前端 | Vue 3 · TypeScript · Vite · Vue Router · Pinia |
| UI | Element Plus · SCSS · CSS Variables |
| 微应用 | Wujie Vue 3 · iframe |
| 桌面 | Electron · electron-vite · electron-builder |
| 数据 | better-sqlite3（本机 SQLite） |

## 📂 项目结构

<details>
<summary>查看目录结构</summary>

```text
src/
├── app/                  # 应用根组件
├── asset/                # 品牌与静态资源
├── components/           # 通用组件（AppIcon、PageContainer、ProTable、SearchBar 等）
├── config/               # 菜单、导航、iframe、微应用、Harness、小说、主题等配置
├── hooks/                # 组合式函数
├── layouts/              # 布局装配：顶栏、侧栏、标签栏、设置面板
├── pages/
│   ├── frontend/         # 工作台：Agent 对话、项目、历史、自动化、小说创作、微应用宿主
│   ├── backend/          # 系统管理：模型、MCP、权限、Git、Python、菜单、微应用、外观等
│   └── exception/        # 404 等异常页
├── router/               # 路由创建与页面白名单注册
├── stores/               # 应用、布局、主题、标签、命令面板状态
├── styles/               # 全局样式与 Element Plus 覆盖
└── main.ts               # 应用入口

electron/
├── main.ts               # 主进程：窗口、菜单、托盘、IPC 注册
├── database.ts           # 本机 SQLite 平台库
├── harnessRuntime.ts     # Agent 运行器与内置工具
├── harnessStore.ts       # Agent 会话与项目存储
├── novelStore.ts         # 小说作品库
├── modelConfigStore.ts   # 模型供应商与密钥（本机）
├── mcpManager.ts         # MCP 服务器生命周期
├── pythonEnv.ts          # 内置 Python 运行时
├── localMicroAppServer.ts# 本地微应用静态服务（仅 127.0.0.1）
└── preload.ts            # 受限的 window.platform IPC 桥

tests/                    # vitest 单元测试
wiki/                     # 项目文档
scripts/                  # 构建与工具脚本
```

</details>

## 🗺️ 路由规则

| 路径 | 说明 |
| --- | --- |
| `/` | 重定向到 `/workspace/chat`（新对话） |
| `/workspace/chat`、`/workspace/chat/:id` | Agent 工作台对话 |
| `/workspace/projects`、`/workspace/history`、`/workspace/automations` | 项目、最近对话、自动化 |
| `/settings/*` | 系统管理（模型、MCP、权限、Git、菜单、微应用、外观等） |
| `/micro/:code/:pathMatch(.*)*` | 微应用宿主页 |
| 其他路径 | 重定向到 `/404` |

## 🧩 平台能力（开发者视角）

- **导航与菜单**：[`src/config/navigation.ts`](./src/config/navigation.ts) 统一解析应用切换器、侧边栏、标签页、面包屑与全局搜索；网页版菜单定义在 [`src/config/menus.ts`](./src/config/menus.ts)，桌面版首次启动写入本机 SQLite，之后在"系统管理 → 菜单配置"中维护。
- **微应用**：在"系统管理 → 微应用管理"注册本地工具或内嵌网页。Wujie 子应用通过平台路径 `/micro/:code/*` 统一表示当前子页；iframe 可根据 `childPath` 单向生成目标 URL，跨域 iframe 内部跳转不保证反向同步平台地址。
- **iframe 策略**：由 [`src/config/iframe.ts`](./src/config/iframe.ts) 集中映射，支持 `strict`（严格隔离）、`compatible`（同源语义与站点兼容，默认）、`external`（新窗口打开）。
- **桌面 IPC**：前端通过受限的 `window.platform` API 访问菜单、微应用、模型、Harness 会话与偏好，模型密钥只经主进程读写。

## 📖 文档

- [Wiki 首页](./wiki/README.md)
- [Harness 开发计划](./wiki/design/HARNESS_ROADMAP.md) — 当前 Harness 的开发优先级、验收标准与技术决策

## 🤝 贡献

开发约定：

- 新增通用页面或网页时，在 `src/config/menus.ts` 中定义对应 `target`。
- 菜单对应的本地页面组件必须注册到 `src/router/pageRegistry.ts` 的页面白名单（`pageModules`）中，配置不会加载任意文件。
- 保持现有 SCSS 设计令牌与 CSS 变量用法，避免无关格式化或重构。
- 提交前至少执行：

  ```bash
  npm run build
  git diff --check
  ```

## 📄 许可证

[MIT](./LICENSE)
