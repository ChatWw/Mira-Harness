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

最近更新：2026-10-09。Electron 能力、Vue 双层 Shell/设置与 React 正式入口已接入；文件工作区、搜索/保存/监听/外部编辑器、位图/SVG、Git 装饰/删除/筛选，以及搜索忽略规则和 Vue 文件搜索设置已实现。当前入口为 [搜索忽略规则与 Vue 设置](docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-09-搜索忽略规则与-vue-设置)；最终数字、构建/审计、独立 Chrome headless 和限定评审统一见 [本批证据页](docs/assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)，不沿用旧 Git/filter verdict。原生设置/搜索/浏览、旧错误态、图片/Git 同态 ZCode 待验收；整体 active，性能/发布/P0–P3 未放行，未提交、未推送。模块规划见 [实施 PRD](docs/MIRA_IMPLEMENTATION_PRD.md)。

2026-10-09 续作：搜索 ignore 已接入，不重复实施；真实隔离 Electron 的 preload/IPC bridge 与 CDP DOM 只读 probe 已通过。当前锁屏阻止前景原生鼠标、键盘和截图验收，下一入口为解锁后重启隔离 Electron，仅补本批配置/搜索/浏览的有限原生交互，不自动扩展为完整 native 或同态 ZCode 放行。Git metadata watcher 仅为随后候选，既有文件 watch 不等于 metadata watcher；旧错误态、图片/Git 对照及媒体 lease/Range、高亮 Worker/profile 分别推进，依据见 [下一能力审查](docs/assets/mira-zcode-alignment-2026-10-08/NEXT_CAPABILITY_AUDIT_2026-10-09.md)。旧 Chrome headless 的 HTTP fixture 不包含 preload/IPC；它与新增真实 Electron probe 分别保留证据范围，7 张旧图未重拍。

## ✨ 特性

产品后续方向见 [Mira 产品定位、架构拆分与应用分发方案](docs/MIRA_PLATFORM_PLAN.md)（讨论整理稿，包含仓库拆分、React 评估、子应用安装与分阶段验收）。

### 🤖 Agent 工作台（Harness）

打开应用即进入新对话，会话围绕**项目（源文件夹）**组织，Agent 可以直接读写项目文件：

- **运行步骤可追溯**：消息按"运行步骤"展开，每一步的工具调用、耗时与结果清晰可见
- **权限控制**：`默认` / `自动批准` / `完全` 三种会话权限模式，可全局配置默认值
- **模型管理**：GLM、Kimi、MiniMax、DeepSeek、Ollama 预设 + 自定义 OpenAI 兼容端点，按职责绑定模型，密钥只存本机
- **MCP 集成**：管理 MCP 服务器，扩展 Agent 工具能力
- **Git 集成**：分支前缀、PR 合并方式、强制推送、草稿 PR、评审送达等配置
- **文件工具**：读取 / 编辑 / 删除（进回收站可还原），内置 Python 环境执行脚本
- **只读文件工作区**：左侧项目树与右侧独立文件页签，支持全目录搜索、键盘导航、Markdown/源码切换、自动换行、复制路径/内容和加入对话；加入文件仅更新附件，不自动发送
- **文件更新与外部打开**：受控目录监听驱动树/搜索/预览刷新，标题栏、树菜单和预览提供已安装应用打开方式；不提供通用内置文件写回
- **图片只读预览**：位图通过授权目录内的有界图片读取显示，支持透明棋盘和 `@Nx` 尺寸；SVG 可在预览与源码间切换，解码失败可重试。位图不提供文本复制、自动换行或加入对话；SVG 源码仍可按文本附件边界加入
- **Git 文件树状态**：名称/直接 `M/A/D/R/U`、目录单后代点与精确 ignored；已加载父目录补删除文件行，只看变更保留树层级并支持搜索组合。D 只选中，复制/非位图引用保留；刷新保留筛选和成功快照，失败可重试。不提供 Git 写操作或 metadata watcher，外部 `git add/commit` 不保证自动刷新
- **搜索忽略规则**：成熟 `.gitignore` 语法解析，首次非空搜索安全初始化 `.miraignore`；Vue `/settings/file-search` 管理现有项目/个人工作区，支持草稿同步、恢复默认、保存与未保存离开确认。仅影响实际搜索，不覆盖 `@`/Command Center，也不限制浏览、预览或 Agent 访问
- **上下文管理**：按上下文窗口自动压缩历史，实时显示 token 用量
- **自动化**：定时任务、单次任务、会话完成触发、运行记录、启停、立即运行与重试

文件工作区的同名独立页签、返回任务保留预览、跨会话附件/预览隔离、目录与菜单键盘、文件错误恢复、同会话移动项目后切 root 已有历史原生证据。文件树为 28px 行高/12px 缩进，预览工具栏为 40px；文本附件保持单文件 256KiB、累计 1MiB、最多 12 项，超限保留原附件。图片预览继承会话/root 身份隔离、监听刷新、隐藏时延迟读取与恢复；位图预览上限 4MiB，8px 透明棋盘不改变文本附件边界。搜索覆盖完整授权目录，打开文件保留 query、打开目录清 query 并 reveal；状态读取/保存/离开风险已有历史回归，图片原批证据与当前 Git 证据各自保留范围。

8001 行 fixture 的历史分块完整高亮抽样约 2205.5ms，期间未记录到 long task、挂载 46 行，滚动挂载 56 行且未记录到 long task；异步完成耗时不与旧同步阻塞直接比较，也不放行首次 grammar/病态单行/流式/布局或整体性能。当前 Git 已接入，下一次先完成监听/编辑器错误态、图片与 Git 原生验证，再继续 metadata watcher、音视频/Office、性能 profile、可靠冷暖/进程冷启动及安装包验收。默认并发高亮超时历史保留，不把受限并发通过写成默认全量绿；此前 `9→0` 仍未归因，force reload/进程终止不保证异步保存。完整发布边界见本轮对齐记录。

搜索规则参与扫描前剪枝与 root/规则版本/hash 缓存失效，编辑/删除/重建规则在下次查询读取，warm 结果也复核 root。模板来自根 `.gitignore` seed + 默认段；落盘后不自动同步，同步/恢复只改草稿，保存才写入，分区标记缺失/重复报错并留草稿。空规则允许搜索默认排除目录；根 `.miraignore` 不作候选，保留 dotfile，不额外排除 `.env`/二进制/隐藏候选。设置仅接受 DB 现有工作区，无任意路径输入；有界 UTF-8、revision/授权复核、hard-link no-replace 初始化与原子替换的准确边界见证据页，不承诺跨进程绝对 CAS。上游同版导航隐藏该设置，Mira 有意开放 Vue 入口，不称上游隐藏页原生逐像素验收完成。

本批最终检查、headless 和限定评审统一引用 [搜索忽略规则证据页](docs/assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)，不在 README 重复易漂移数字。Git 删除/筛选见 [历史 filter 证据](docs/assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)，旧 overlay 见 [历史证据](docs/assets/mira-zcode-alignment-2026-10-08/GIT_OVERLAY_EVIDENCE.md)，图片见 [图片证据页](docs/assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md)，监听/编辑器见 [原批证据](docs/assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md)；旧数字和限定 verdict 保留原批次，构建证据不替代桌面、安装包、Windows 或性能验收。

2026-10-09 13:26 +08:00 更新：第二人服务复核发现的异步提交授权 P2 已关闭；随后真实 Electron 发现 Vue Proxy target 跨 `contextBridge` 导致 `An object could not be cloned.` 的第二个 P2，也已用 `shallowRef` 与普通 `{ kind, id }` 请求快照修复，覆盖初读、重读、草稿转换和保存，回归与独立源码复核通过。最新全量/类型、React 与 Electron 重新构建和产物审计通过，JS/CSS 字节不变，准确结果统一见证据页。13:14:15 的 [bridge/DOM probe](docs/assets/mira-zcode-alignment-2026-10-08/search-ignore-native/bridge-transport-results.json) 经过真实 preload/IPC，确认模板、textarea 和无 alert；三产物 SHA 与最新构建一致，但 probe 未重跑，也不是实体鼠标/键盘/截图验收。前景为 `com.apple.loginwindow` 时守卫中止，当前原生脚本明确 `blockedBy=macOS-loginwindow`、0 actions/0 captures，未解锁或使用 `DOM.click`，不算功能失败。旧 headless 图未重拍，最终 syscall 的跨进程非 CAS 边界仍保留。

历史文件标签收尾在隔离 1440×900 Electron 中通过六文件排序、中键关闭、最近关闭恢复、设置深色往返与菜单焦点；原生截图及独立 reviewer 的 ship 只覆盖关闭按钮布局与 DESIGN 过期两项，详见 [文件标签历史](docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-文件标签收尾)，不覆盖当前监听/编辑器或整体发布。

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
| 前端 | Vue 3 Shell/设置 · React 19 Harness · TypeScript · Vite |
| UI | Element Plus（Shell）· assistant-ui / Radix / Tailwind（Harness）· CSS Variables |
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
- [Harness 实施 PRD](./docs/MIRA_IMPLEMENTATION_PRD.md) — 当前模块规划、阶段关口与验收边界
- [ZCode UI 对齐记录](./docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md) — 本轮功能、截图和桌面操作矩阵

## 🤝 贡献

开发约定：

- 新增通用页面或网页时，在 `src/config/menus.ts` 中定义对应 `target`。
- 菜单对应的本地页面组件必须注册到 `src/router/pageRegistry.ts` 的页面白名单（`pageModules`）中，配置不会加载任意文件。
- Vue Shell 沿用既有样式；React Harness 遵守 [DESIGN.md](./DESIGN.md) 与 `apps/harness-react/src/styles/mira-foundations.css` 的 Mira 语义变量，避免无关格式化或重构。
- 提交前至少执行：

  ```bash
  npm run build
  git diff --check
  ```

## 📄 许可证

[MIT](./LICENSE) 覆盖 Mira 原创代码；ZCode 等第三方改编部分保留各自许可，详见 [third-party-licenses](./third-party-licenses/README.md)。
