# Mira 续作交接（2026-09-24）

> **继续本项目时先读本文。本文是当前实现状态和下一步工作的唯一续作入口。最近更新：2026-09-28。**
> 产品边界和长期规划看 [`MIRA_PLATFORM_PLAN.md`](./MIRA_PLATFORM_PLAN.md)；模块关口和发布验收看 [`MIRA_IMPLEMENTATION_PRD.md`](./MIRA_IMPLEMENTATION_PRD.md)；源码审计和开源 UI 对比看 [`MIRA_PHASE0_AUDIT.md`](./MIRA_PHASE0_AUDIT.md)。

## 1. 当前基线

- 仓库：`ChatWw/Mira-Harness`，当前本机目录：`/Volumes/VrenDisk/project/Mira/Mira-Harness`
- 同级目录：`../Mira-Novel-Studio`、`../Mira-Vision` 已创建但均为空，尚无独立 Git 仓库或应用工程；空目录不会随本仓库的 Git 同步。
- 分支：`codex/mira-harness-first-slice`
- 阶段 0 授权边界基线提交：`323b90d`；当前实现以本分支最新提交为准
- 远端：`origin/codex/mira-harness-first-slice`
- 开工时工作区：先运行 `git status --short --branch` 核对，不预设干净或与远端同步
- 当前范围：桌面 Electron；Vue + Wujie Shell；Mira-Harness 默认应用；Novel Studio 受控接入骨架；Vision 仅规划预留

不要从 `main`、`desktop-dev` 或旧聊天记录重新开始，也不要把 React/Wujie 演示原型当作生产 Harness。

## 2. 已经完成的内容

### 2.1 规划和范围

- 已明确本仓库最终只承载 Electron 平台、Vue Shell、Mira-Harness、统一设置和第一方应用接入配置。
- `Mira-Novel-Studio` 目前只有同级空目录，后续独立 Git 仓库维护；本仓库保留接入配置，迁出前不删除旧 `/novel`。
- `Mira-Vision` 目前只有同级空目录，不开发业务工程，不创建应用中心条目或构建工程；宿主侧仍只规划禁用的接入配置。
- 设置方向已收敛为基础能力、平台能力、模型与应用绑定、应用中心、应用专属、关于；只保留白天/黑夜主题，删除布局样式、主题色、自由微应用录入、菜单管理和多页签等无效能力的后续计划。
- 2026-09-24 已确定 Harness 主应用 UI 使用 React；保留 Electron 侧运行时和数据语义，开源 React 组件仅作为具体控件的候选，不直接 Fork 完整 Agent 产品。当前生产页仍是 Vue，React/Wujie 演示原型尚未接入真实任务。

### 2.2 代码切片

- Electron 主进程已按职责拆分为 `bootstrap/`、`ipc/`、`preload/`、`security/`、`services/`、`storage/`、`adapters/`；`electron/main.ts` 现在主要负责装配。
- 已增加第一方应用 manifest、校验和受控配置；`firstPartyAppManifests` 当前为空，因此真实外部应用尚未启用。
- 已增加 `FirstPartyFrame.vue` 和 `firstPartyBridge.ts` 的隔离 iframe + `MessageChannel` 草稿。
- 已增加模型能力的主进程 IPC 校验、Novel Studio 专属能力检查和本地 API token/grant 基础设施。
- 已完成第一方 grant/session：授权句柄由主进程生成，绑定 `webContents`、应用能力快照和应用 ID；模型 IPC 不再接受 renderer 自报的 `appId`。
- 第一方 `novel.list/get/save` 已改为独立的 grant 绑定 IPC；旧 `/novel` 使用的历史 IPC 保持不变。
- 已完成 iframe 会话生命周期控制：每次 load 建立新 grant，旧端口/授权在重载、URL/应用身份变化和卸载时关闭/撤销；异步加载竞态不会重新激活旧会话。
- 已增加 `MIRA_TEST_HOME` 开发态隔离数据目录，避免用真实 `~/.mira` 做实验。
- 已保留旧 IPC、Harness、旧 `/novel` 和现有数据路径，未做不可逆迁移。

### 2.3 已有验证基线

交接前的历史记录包括：`239/239` 单测通过、`vue-tsc --noEmit`、`electron-vite build`，以及隔离数据目录下开发态 Electron 可打开 Harness、旧 `/novel` 和作品列表。

这些记录不是本轮重新运行的结果，也不代表打包版、真实旧作品、真实模型或 macOS/Windows 双端均已验收。换电脑后要重新运行并分别记录证据，不能把单测或构建写成原生桌面通过。

## 3. 当前没有完成的事项

1. **没有真实 Novel Studio 包。** 没有独立仓库、静态发布包、可信来源、安装回退或版本兼容流程；`firstPartyAppManifests` 仍为空。
2. **旧作品、模型和打包版未完成验收。** 不得直接操作真实 `~/.mira`；不得因为拆目录删除旧小说 UI、SQLite 表或用户数据。
3. **授权边界尚未接入真实子应用。** 当前 grant/session 已有主进程和 frame 测试，但没有真实外部包来验证连接协议、应用 SDK 和卸载恢复。
4. **React 方向已确定，实现尚未完成。** 当前 React/Wujie 页面是演示原型，只能证明挂载可行；不能替换生产 Harness，也不能把全量 preload 暴露给子应用。

## 3.1 2026-09-24 阶段 1A 第一批进展

### 已完成

- 主布局已移除多页签渲染，并删除对应组件与 store。
- 设置侧栏已收敛为基础能力、平台能力、应用三组；加载效果、图标库、菜单管理和自由微应用管理不再作为设置入口。
- 旧系统设置地址仍保留兼容重定向，统一回到 `/settings/general`。
- 外观页只保留浅色/深色；历史 `system` 主题和非默认主题色在启动时归一化，不删除旧偏好字段。
- 新增设置收敛与旧主题偏好归一化回归测试。

### 验证

- `npm test`：60 个测试文件、252 个测试通过。
- `npx vue-tsc --noEmit`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- `npx electron-vite build`：通过；开发态 Electron 视觉/真实鼠标交互、打包版、真实模型和真实旧数据：待验收。

### 剩余与下一步

- 本批已完成 Electron 构建与 diff 复核；后续续作仍须先核对实际工作区状态。
- 下一批从 Harness 核心任务体验开始：空态、执行态、等待确认态、失败恢复和成果入口。
- 下一次开工先读 `docs/MIRA_IMPLEMENTATION_PRD.md` 的「2026-09-24 阶段 1A 第一批记录」和 D 模块 P0/P1，再检查 `src/pages/frontend/harness/`、Harness 事件 reducer/store 及对应测试。

## 3.2 2026-09-24 阶段 1A 第二批进展

### 已完成

- 新增 [`MIRA_HARNESS_UI_SLICE_2026-09-24.md`](./MIRA_HARNESS_UI_SLICE_2026-09-24.md)，定义工作面板状态契约。
- 工作面板统一展示运行中、整理回复、失败、停止、完成和空闲六种状态；失败错误摘要和停止后的内容保留语义明确。
- 当前运行状态与最近完成消息按优先级合并，避免主进程结束事件的 `idle` 覆盖失败/停止结果。
- 保留现有审批、计划确认、工具详情、文件变更和重试入口；本批没有改执行器、IPC、Novel Studio 或 Vision。
- 新增 `harnessPanelPresentation` 状态映射测试。

### 验证

- 针对性 Vitest：15 项通过。
- 全量 Vitest：61 个测试文件、259 个测试通过。
- `npx vue-tsc --noEmit`：通过。
- `npm run build`：通过。
- `npx electron-vite build`：通过。
- `git diff --check`：通过。
- 开发态 Electron 视觉/真实鼠标、真实模型和打包版：待验收；静态测试和构建不替代这些验收。

### 剩余与下一步

- 自动化测试和两种构建已完成；下一步做真实任务联调。
- 下一次直接从 `src/pages/frontend/harness/index.vue`、`HarnessMessageItem.vue`、审批/计划组件和输入区开始，验证完整任务状态闭环。
- React 正式迁移和 Novel Studio 接入继续保持冻结。

## 3.3 2026-09-24 阶段 1A 第三批进展

### 已完成

- Harness 页面增加提交期间的防重入状态，覆盖首次发送、重新生成和编辑重跑；输入区、消息按钮及错误卡同步反映忙碌状态。
- 重试请求失败后重读持久化会话，恢复仍在持久化层的回复；主进程已截断的原回复不在本批恢复范围内。发送失败恢复草稿和附件。
- 计划确认/继续调用失败会清除 `running`，避免输入区永久锁住；计划确认、澄清问答和取消操作避免重复提交。
- 新增 `tests/harnessSubmissionLifecycle.test.ts`，以真实 store 和模拟 IPC 验证请求生命周期。

### 验证

- 新增针对性测试：6 项通过；全量 Vitest：62 个测试文件、265 个测试通过。
- `npx vue-tsc --noEmit`、`npm run build`、`npx electron-vite build`、`git diff --check`：通过。
- 开发服务器 `http://127.0.0.1:9002/` 返回 200；这只证明页面服务可访问。
- Electron 视觉与真实鼠标、真实模型工具链、文件成果打开、停止后继续、打包版：待验收。

### 剩余与下一步

- 本批是任务请求生命周期的代码收口，不是 D 模块 P1 或真实任务闭环全部完成。
- 下一次使用 `MIRA_TEST_HOME` 隔离目录启动开发态 Electron，从本节和 PRD 的第三批记录开始，逐项验证发送、工具、权限/计划确认、成果、失败/停止恢复；未配置测试模型时如实保留真实模型待验收。
- React 正式迁移、Novel Studio 和 Vision 接入继续冻结。

## 3.4 2026-09-24 阶段 1A 开发态 Electron 首轮验收

### 已完成

- 使用 `/tmp/mira-electron-acceptance.I17u8Y` 作为 `MIRA_TEST_HOME` 启动 Electron，确认进程使用隔离的 `.mira` 目录。
- Harness 空态窗口正常加载；浅色/深色主题、设置收敛入口、模型选择器空态、项目选择器空态均已检查。
- DevTools `Input.dispatchMouseEvent` 可触发项目选择器和快捷任务卡；快捷卡会填充输入框，无模型时发送按钮保持禁用。

### 验证

- 开发态 Electron 页面标题：`新对话 - Mira Harness`；页面地址：`http://127.0.0.1:9002/workspace/chat?draft=...`。
- 已检查截图：隔离目录下的 Harness 浅色和深色首屏均渲染完整，无空白窗口或明显布局重叠。
- 物理鼠标未验收；DevTools 输入事件属于模拟交互，不能替代操作系统级鼠标验收。
- 无测试模型配置，本次未执行真实模型、工具、权限、计划或文件成果任务。

### 剩余与下一步

- 有可用测试模型后继续完整任务闭环；否则安排具备物理鼠标能力的桌面验收。
- 打包安装版、跨应用切换、真实旧数据和 Novel Studio 仍未进入本批。

## 3.5 2026-09-24 阶段 1A mock 任务联调

### 已完成

- 在 `/tmp/mira-harness-taskchain.Fwmpyg` 隔离目录配置本地 OpenAI 兼容 SSE mock，没有触碰真实 `~/.mira` 或密钥。
- 首次发送创建会话并显示失败：免密 Provider 被底层客户端报 `No API key for provider: mira-openai`；修复 Harness 与记忆保存共用的模型注册，免密模式只使用固定 SDK 占位 key。
- 重启开发态 Electron 后在原失败会话重试，页面显示 mock 回复，持久化消息状态为 `completed`，工作面板显示“最近任务已完成”；页面重载后回复和完成标记仍可见，完成态截图已检查。
- 新增免密与有密钥模式的 Provider 注册回归测试。

### 验证

- 针对性 Vitest 27 项；全量 `npm test` 为 63 个文件、267 项通过；`npx vue-tsc --noEmit`、`npm run build`、`npx electron-vite build`、`git diff --check` 通过。
- 本次只证明开发态 Electron 中的发送、失败重试、mock SSE 回复、完成展示及会话持久化。DevTools 点击/输入是模拟操作，物理鼠标未验收。
- 真实模型、工具、权限/计划确认、文件成果、停止恢复、打包版、Windows、真实旧数据和跨应用切换仍待验收。

### 下一步

- 从本节和 PRD 的 mock 联调记录继续；优先准备隔离测试模型和无敏感数据的项目，逐项验证工具、确认、成果及停止恢复。
- 没有真实模型时不把 mock 成功写成完整任务闭环，另行安排物理鼠标及打包版验收。

## 3.6 2026-09-24 阶段 1A 脚本化任务链联调

### 已完成

- 使用 `/tmp/mira-harness-stage1a.Q4MlXY` 中的隔离项目和临时 OpenAI 兼容脚本，在开发态 Electron 中执行 `list_files`，会话保存成功的工具记录。
- 写入审批分别测试拒绝与允许：拒绝时文件不存在；允许后写入 `stage1a-proof.txt`，消息显示“本次修改”，对比抽屉显示新增一行并已截图检查。
- 计划提交后进入等待确认，点击执行后交互获批、计划完成；慢速流式回复在首段停止并保留内容，再从“继续回复”入口发送新消息，原停止记录和新完成消息均保留。
- 页面重载后文件变更入口、停止记录及继续结果仍可见。本批未发现需要修复的业务源码问题。

### 验证

- 针对性 Vitest 5 个文件、73 项通过；`git diff --check` 通过。上一批的全量测试、类型检查和构建结果未在本批重复运行。
- 仅验证开发态 Electron、DevTools 模拟输入和脚本化模型输出；不等同于真实模型决策、物理鼠标或打包版验收。临时 mock 脚本与隔离数据只在本机 `/tmp`，不随 Git 同步。
- 真实模型、计划步骤实际执行、打包版、Windows、真实旧数据和跨应用切换仍待验收。

### 下一步

- 准备一个可用的隔离测试模型和无敏感数据项目，复跑真实模型工具、审批、计划步骤与成果；分别记录成功、失败和恢复。
- 独立安排物理鼠标与打包版验收；没有真实模型前不宣布 D 模块 P1 或阶段 1A 全部完成。

## 3.7 2026-09-24 React Harness 与两层 layout 决策

### 已完成

- 用户确定目标架构：Electron 承载底层能力与 Harness 执行/数据，Vue + Wujie 承载 Mira 外层窗口与统一设置，React 实现默认 Harness 主应用 UI。
- 用户提供的空白 layout 图已澄清为整体窗口的两层结构：底层包含窗口控件、全局搜索等公共入口；中间纯白区域完整交给当前应用。应用是否使用侧栏、内部如何布局，由各应用自行决定。见 [`MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md`](./MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md)。
- 平台方案与 PRD 已将 React 从评估候选改为目标路线；旧三栏不是新 React 工作台的约束。历史开源初筛仍可用于选组件，但不再做 Vue/React 二选一。

### 剩余与验证

- 本批仅核对源码、参考图和文档并记录设计决策；没有修改业务 UI、Electron 接口或应用数据，也未运行自动化测试或桌面验收。
- React Harness 内部布局和关键状态尚待用户评审。React/Wujie 演示原型没有真实 Harness 能力；本节是当时的设计记录，Shell 导航归属以第 3.8 节的最新实现为准。第一方桥仍只覆盖有限能力，不得视为已迁移完成。
- 旧 Vue Harness 保持生产可用；真实模型、物理鼠标、打包版和跨应用恢复等历史待验收项不因本次设计决策自动通过。

### 下一步

- 从两层 layout brief 出发，先提交 React Harness 工作台的可评审设计稿，覆盖空态、执行、计划/审批、文件成果、失败恢复；得到确认后再做业务 UI 代码。
- 随后只做一条受控接入链：真实会话读取、任务提交和事件、审批、停止、成果及切换后恢复。先验证 Wujie 与受控授权通道能否共同满足身份和生命周期要求，不开放完整 `window.platform`。
- 会话导航已移入迁移期的 Vue Harness 应用容器；接入 React 并验收后再评估旧 Vue UI 的下线。Novel Studio 和 Vision 不参加这一批。

## 3.8 2026-09-24 Vue 两层 Shell 首轮实现记录

### 已完成

- Vue Shell 已按参考 layout 落地为“公共顶栏 + 应用显示画布”两层结构：公共层承载窗口拖拽/控件位置、Mira 标识、应用切换、全局搜索和设置；应用画布完整交给当前应用。
- 壳层旧 `AppSidebar` 已移除。旧 Vue Harness 的会话、项目、历史、用量和自动化入口暂时由 `LegacyHarnessLayout` 承载，作为迁移期回退，不代表 Shell 规定 Harness 内部必须有侧栏。
- 主应用入口固定为 `/workspace/chat`，应用切换到旧 `/novel`、设置进入/返回和 Wujie 全幅应用承载已接通。
- 修复新画布尺寸下旧 Harness 空态绝对定位导致的内容重叠；空态与消息区使用稳定网格区域，输入区不再被覆盖。

### 验证

- `npx vue-tsc --noEmit`：通过。
- `npx electron-vite build`：通过。
- 隔离 `MIRA_TEST_HOME` 的开发态 Electron：1440×900 与 1024×680 均通过画布填充和空态间距检查；全局搜索、应用切换、设置返回均通过；浅色/深色截图已检查。

### 剩余

- React Harness 仍未接入生产任务链；当前 React 页面仍是演示原型，旧 Vue Harness 保留作为回退。
- 真实 Novel Studio 包、Vision 工程、应用下载器、真实模型、物理鼠标、Windows 和打包安装版仍待验收。
- 本批未修改用户数据、旧小说数据或 Electron 运行时协议。

### 下一步

- 下一次直接从 `docs/MIRA_IMPLEMENTATION_PRD.md` 的 C 模块「阶段 1A 第四批记录」和 D 模块 P0/P1 开始，评审并实现 React Harness 应用内工作台，再通过受控桥接接入真实会话/任务事件；Shell 公共层不再继续扩展 Harness 专属导航。

## 3.9 2026-09-28 开源 React UI 选型记录

### 已完成

- 复核 GitHub 当前仓库元数据、许可证、包声明与 `assistant-ui` 自定义运行时文档；对照 Mira 的会话、执行、审批、成果和 Wujie 边界。
- 选 `assistant-ui` 的 React 线程/输入原语和 `ExternalStoreRuntime` 作为**首个接入试验**，不引入其后端；AionUi、Goose、Harnss 仅作交互参照。具体比较、复用边界和失败条件见 [`MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md`](./MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md) 第 9 节。

### 验证与剩余

- 本批只有源码/文档级选型，未安装或运行候选，未修改 UI/运行时代码；没有自动化或 Electron 验收可宣称。
- `assistant-ui` 在 Wujie 内的流式消息、中文输入法、焦点、订阅清理和复杂节点投影仍待隔离试验。旧 Vue Harness 保持生产回退；真实模型、物理鼠标、Windows、打包版和真实 Novel Studio 包仍待验收。

### 下一步

- 从设计文档第 9 节的放行试验开始：锁定候选版本并核对许可，建立受控宿主适配，验证一条隔离任务链；只有关键语义和恢复通过后才扩大 React UI 迁移。

## 4. 继续开发的准确开始方式

### 4.1 同步代码

已存在本地仓库时，按顺序执行：

```bash
cd /Volumes/VrenDisk/project/Mira/Mira-Harness
git status --short --branch
git fetch origin codex/mira-harness-first-slice
git switch codex/mira-harness-first-slice
git merge --ff-only origin/codex/mira-harness-first-slice
```

在另一台电脑上使用其实际克隆路径；克隆本仓库不会带出同级的两个空目录。如果工作区有本地改动，先停下来逐项检查并保留；不要使用 `git reset --hard`、`git checkout --`、强制覆盖或在不清楚状态时直接 `git pull`。

尚未克隆时，先克隆仓库，再用：

```bash
git switch --track -c codex/mira-harness-first-slice origin/codex/mira-harness-first-slice
```

### 4.2 开工顺序

1. 读 `AGENTS.md` 和本文第 3、5、6 节。
2. 先读本文第 3.8 节和 [`MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md`](./MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md)，再读 PRD 的 C/D 模块 P0/P1；第 3.6 节是已有任务链证据，不再是当前唯一下一刀。
3. 核对已落地的 Vue Shell `src/layouts/`、迁移期 Harness 页面/状态与 `apps/harness-react/`，评审 React 应用内设计稿。不要把演示原型直接替换生产页面。
4. 设计确认后，先验证 Wujie + 受控授权桥的最小真实任务链，再做 React UI 接入；使用隔离数据目录，并将自动化、开发态 Electron、物理鼠标、真实模型和打包版分开记录。
5. 第一方 Novel Studio 的授权边界和 SDK 契约保留在第 5 节及 [`MIRA_FIRST_PARTY_SDK_CONTRACT.md`](./MIRA_FIRST_PARTY_SDK_CONTRACT.md)，此批不接入真实外部包。

## 5. 本次已完成：宿主绑定应用身份和生命周期

### 5.1 已达成目标

让每个第一方 iframe 获得由宿主创建、与 `appId`、能力清单和生命周期绑定的授权会话。子应用不能通过请求参数自报另一个 `appId`，不能读取模型 API key，不能访问其他应用能力；frame 卸载、跳转或端口关闭后，旧授权必须失效。

### 5.2 当前实现

- 宿主在创建受控 frame 时向主进程申请可撤销 grant，绑定 `appId`、允许能力和当前 `webContents`；能力在主进程保存快照。
- `MessagePort` 的连接消息携带不透明 grant 句柄；renderer 的模型 IPC 只提交 grant，不再提交可伪造的 `appId`；主进程只允许宿主主 frame 创建、撤销和使用授权。
- `platform:generate-first-party-text` 只接受授权会话，并再次校验当前 manifest、能力、参数和调用来源。
- `FirstPartyFrame.vue` 在 URL/manifest/frame 变化、重复 `load`、卸载和错误时关闭旧端口并撤销 grant；route/context 只发送给当前有效端口。
- `FirstPartyConnectionSession` 用 generation 防止异步 grant 在页面已切换后重新激活。
- 保留现有旧 IPC 和内置 `/novel` 行为；本批不开放真实外部应用，不引入安装器。

### 5.3 已覆盖的用例

- 合法 grant 使用允许能力成功。
- 伪造/未知 grant、错误 `webContents`、缺少能力、撤销后调用均失败。
- 一个应用的 grant 不能被另一个 renderer 使用。
- frame 重载或跳转后旧 port/grant 失效，新页面必须重新完成受控连接。
- 异步 grant 返回晚于页面切换时不会激活旧页面。
- iframe 卸载时端口关闭且授权撤销。

### 5.4 本批验证结果

- 相关单测覆盖 grant 归属、伪造/拒绝、撤销、生命周期和第一方作品存储场景。
- 本次已运行：全量 Vitest `248` 项通过；`vue-tsc --noEmit` 通过；`npm run build` 通过；`npx electron-vite build` 通过；`git diff --check` 通过。
- 本次未重新运行：打包安装版、macOS/Windows 原生交互、真实模型、真实旧作品；这些仍标为待验收。
- 授权边界代码已在 `323b90d` 提交并推送；后续以实际分支和远端 `HEAD` 为准。

## 6. 现在明确不要做的事

- 不要马上创建或接入真实 `mira-novel-studio` 仓库。
- 不要删除旧 `/novel`、`src/pages/frontend/aiNovel/`、小说 IPC、SQLite 表或迁移逻辑。
- 不要做 SQLite 重写、真实用户数据迁移或不可恢复的双写。
- React UI 路线已定，但不要把演示原型直接替换生产页，也不要把开源 Agent 产品整体 Fork 进来；旧 Vue 页面在真实流程和桌面验收前保留回退。
- 不要实现 Vision 业务、应用市场、远程下载器或安装脚本。
- 不要用 `~/.mira` 做测试；使用 `MIRA_TEST_HOME` 或等价的临时测试目录。

## 7. 验收记录规则

每次阶段性功能完成、用户要求临时记录、交接或提交，都要在本文或对应阶段文档中留下日期化记录，至少包含：

- 已完成：本批功能、文档、决策和提交范围。
- 剩余：未完成事项、风险和明确的待验收项目。
- 验证：实际运行的测试、类型检查、构建和桌面验收；未运行的不能写成通过。
- 下一步：下一次直接阅读的文档章节、代码入口和开工目标。

本节的验收分类用于区分证据边界：

| 类别 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| 单元测试 | 函数、IPC 注册、授权拒绝等静态行为 | 原生窗口、真实模型、真实用户数据 |
| `vue-tsc` / 构建 | 类型和产物可生成 | 产物在 macOS/Windows 正常运行 |
| 开发态 Electron | 指定平台的窗口、导航和隔离目录场景 | 打包安装、签名、升级和另一平台 |
| 打包 Electron | 指定包可启动 | 真实模型、完整旧数据和所有桌面操作 |
| 真实模型/旧作品 | 端到端业务结果 | 其他平台或未运行的场景 |

未运行的项写“待验收”，不要写“通过”。

## 8. 一句话指令

继续开发时可直接对 Codex 说：

> 继续 `codex/mira-harness-first-slice`。先读 `AGENTS.md`、本文第 13 节、`docs/MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md` 第 14 节和 PRD 的 D 模块 P0/P1，核对工作区并保留未提交改动。开发态脚本流程及流式长会话已验证；下一步核对实体键盘/中文输入法和真实模型任务，再评审生产授权与 React 资源打包。不要直接替换旧 Vue 生产页。Novel Studio、Vision 和应用下载器不参加本批。

## 9. 2026-09-28 React Harness 接入试验交接

**已完成**：`@assistant-ui/react@0.15.22` 锁定；开发态 `/workspace/harness-pilot` 由 `src/pages/frontend/harness/pilot/index.vue` 承载 React/Wujie，有限宿主方法来自 Electron `PlatformApi`；`apps/harness-react/src/pilot-state.ts` 管理会话、事件和卸载，`pilot-workbench.tsx` 使用 assistant-ui 原语。Electron Vite 同源代理开发资源至 9001，原演示与 `/workspace/chat` 保持不变。本批没有提交或推送。

**验证**：全量 Vitest 64 文件 271 项、`npx tsc -p apps/harness-react/tsconfig.json`、`npx vue-tsc --noEmit`、`npm run build`、`npx electron-vite build` 和 `git diff --check` 通过；Electron 开发服务启动，pilot 与原演示的 HTML/JS 经同源代理 HTTP 200。测试只证明代码路径和资源可达，未证明真实模型、权限与文件写入、macOS/Windows 窗口交互或打包版。

**当时剩余（恢复和 diff 已在第 10 节解决）**：隔离 Electron 桌面任务链、审批拒绝、停止/失败恢复和计划/澄清仍待验收。开发态 Wujie props 不是生产安全授权边界。

**下一次开工入口**：运行 `npm run harness:dev`，在桌面开发版打开 `/workspace/harness-pilot`；从 `pilot-state.ts` 的事件和快照一致性及 `pilot-workbench.tsx` 的 Harness 专属 UI 继续。真实验收通过后，再设计生产第一方授权和逐步替换 `/workspace/chat` 的迁移关口。

## 10. 2026-09-28 React pilot 任务链与恢复交接

**已完成**：`HarnessPermissionPolicy` 增加按会话查询仍在等待的请求，经 Runtime/IPC/preload 只读暴露给 pilot；React 打开会话时恢复审批，活动/工具记录与持久化文件 diff 在工作区可见。修复 `assistant-ui` 对用户消息错误传递 `status` 导致的发送后卸载；增加消息投影回归测试。生产 `/workspace/chat`、旧数据和原演示未替换。

**验证**：全量 Vitest 65 文件 276 项、React/Vue 类型检查、Web/Electron 构建和 `git diff --check` 通过。隔离 Electron + 本地脚本模型完成 React 发送、流式回复、审批出现、切离返回恢复、允许写入、文件落盘、工具 `write/ok`、完成态和 diff 预览。浅色 1440×900、1024×680 与 Shell 同步深色页面截图已检查；没有使用真实模型或真实用户目录。开发者工具点击/输入不是物理鼠标验收。

**剩余**：pilot 的拒绝审批、停止/失败恢复、计划和多选澄清仍需真实桌面链路验证；当前成果仅预览已记录 diff，没有任意文件打开能力。生产第一方授权、真实模型、物理鼠标、打包安装版、Windows 和真实旧数据均待验收；不得据此删除旧 Vue Harness。

**下一次开工入口**：先读 `apps/harness-react/src/pilot-state.ts`、`pilot-workbench.tsx` 与 `tests/harnessReactPilot.test.ts`，在隔离 `MIRA_TEST_HOME` 下用本地脚本模型补拒绝/停止/计划/澄清四类状态；之后再设计生产级第一方 grant 和旧页迁移门槛。不要把 `/tmp` 中的测试模型或文件加入仓库。

## 11. 2026-09-28 React pilot 流程入口补齐

**已完成**：新任务必须明确选择个人工作区或现有项目；项目目录不可用时禁止创建，发送不再隐式创建个人会话。页面在发送前展示会话实际工作目录；切换会话恢复其模型选择，旧模型不可用时不沿用别的会话模型。输入区增加直接执行/先出计划；计划确认前显示步骤与风险，澄清支持单选、多选及自定义答案。拒绝审批、停止、失败工具与最近运行结果的状态呈现已补齐；生产 `/workspace/chat` 未改。

**验证**：全量 Vitest 65 文件 281 项、React/Vue 类型检查、Web/Electron 构建通过；定向控制器测试覆盖项目归属、拒绝后重新打开、计划标志、停止后再次发送和多选答案传递。以上是自动化和构建证据，本批尚未重新运行隔离 Electron 的拒绝/停止/计划/澄清桌面链路，也未确认拒绝后的文件实际不存在。

**剩余/下一步**：用新的隔离 `MIRA_TEST_HOME` 和本地脚本模型，在 `/workspace/harness-pilot` 逐项检查“选择项目目录 → 拒绝写入 → 文件不存在 → 重新进入保留失败记录”、停止后继续、计划确认和多选澄清。再检查浅/深色及 1024×680 布局，评审生产第一方授权桥和 React 资源打包；这些通过前不切换默认 Harness UI。真实模型、物理鼠标、打包版、Windows 与旧数据仍待验收。

## 12. 2026-09-28 React pilot 隔离桌面流程复核

**已完成**：在隔离 `MIRA_TEST_HOME=/tmp/mira-pilot-verify-CDOHSj` 的开发态 Electron 中，用本地脚本模型从 React pilot 操作并验证项目目录选择、拒绝写入且目标文件不存在、停止后继续、模型 500 失败后继续、多选澄清、计划确认，以及审批切离旧工作台再返回后允许写入。持久化会话和测试项目文件复核了这些结果；批准的文件仅落在 `pilot-project` 中。修复 pilot 顶部状态与工作区状态可能不一致的问题：完成会话中有失败操作时显示“部分操作未完成”，失败运行不显示“就绪”。补了卸载/重挂载恢复待确认计划的控制器回归测试。

**本轮验证**：1440×900、1024×680 的浅色/深色开发态 Electron 截图均已检查，无横向溢出或输入区遮挡；全量 Vitest 65 文件 283 项、React/Vue 类型检查、Web/Electron 构建及 `git diff --check` 通过。此前的页面输入与点击由开发者工具驱动，截图和文件结果不等于物理鼠标、真实模型或打包版验收。测试脚本、截图和临时数据留在 `/tmp`，不进入仓库。

**剩余**：开发态 Wujie props 仍非生产第一方授权；React 资源尚未作为生产包内应用交付。中文输入法、焦点/滚动、真实模型、实体鼠标、打包 macOS、Windows 和旧用户数据仍无本批验收证据；文件成果目前只预览记录的 diff，不能任意打开文件。旧 `/workspace/chat` 保留，不删除旧 Vue Harness。

**下次从这里开始**：先读本节和设计文档第 13 节，核对当前工作区；接着评审 React 生产级身份/能力授权与资源打包边界，在隔离目录补中文输入法、焦点和长会话滚动的桌面验收。通过后再讨论默认入口切换和回退步骤，不能把开发态 pilot 直接当生产应用。

## 13. 2026-09-28 流式回复与长会话验收

**发现与修复**：隔离 Electron 的宿主在 5 秒内发出 29 条 `message-delta`，React 控制器及 `assistant-ui` 运行时均持有持续增长的正文，但运行中的消息内容原语只显示占位，停止后才出现完整文本。pilot 现在仅对当前流式消息显示控制器文本；历史与终态消息仍由 `assistant-ui` 渲染，终态以 Electron 持久化快照替换，不维护第二份结果。

**验证**：开发态 Electron 中完整重载页面后，流式消息 DOM 从 24 字增长到 173 字；上滚到长会话顶部后继续接收增量，`scrollTop` 保持 0；停止后消息数不增加、正文保留。CDP 中文组合输入时按 Enter 未提前提交，组合结束后通过发送按钮可以提交；补齐键码与文本参数后，CDP 普通 Enter 也正常新增用户消息。上述模拟不等于实体输入法与物理键盘验收。全量 Vitest 65 文件 284 项、React/Vue 类型检查、Web/Electron 构建及 `git diff --check` 通过；仍使用 `/tmp` 的脚本模型和隔离数据。

**剩余/下一步**：首次 CDP Enter 未发送是注入参数不足；正确参数下已发送。CDP Shift+Enter 未提交但也未生成换行，尚不能区分原生按键默认行为与注入差异；需用实体键盘和中文输入法复核发送、换行、组合提交及焦点。真实模型、生产授权、包内 React 资源、打包 macOS、Windows 与旧用户数据也仍待验收。旧 `/workspace/chat` 不切换；先按本节复核输入，再处理生产边界。

## 14. 2026-09-28 React pilot 打开会话工作目录

**已完成**：React 工作区增加“在文件管理器中打开”。子应用只传当前持久化会话 ID，经 Vue 开发态宿主桥调用既有 `openHarnessSessionProject(id, 'file-manager')`；目录仍由 Electron 主进程从会话/项目记录解析，不接受前端传入任意路径。无工作目录时按钮禁用，打开中禁止重复触发，系统打开失败会显示错误；切换会话后，旧操作的异步结果不会覆盖新会话状态。

**验证**：控制器新增成功、失败、无会话、重复点击和切换会话回归；全量 Vitest 65 文件 287 项、React/Vue 类型检查、Web/Electron 构建通过。当前运行着开发态 Electron 和 React 资源服务，但本批没有取得该按钮的实体点击与 Finder 打开证据。未检测到运行中的 Ollama/LM Studio，也未安装 `ollama`；不能把脚本模型流程算作真实模型验收。

**剩余/下次从这里开始**：先在隔离数据的开发态 Electron 中实际点击按钮，确认打开的是会话绑定目录且错误可见；再用实体键盘/中文输入法复核 Enter、Shift+Enter、组合输入与焦点，并取得真实模型完整任务证据。之后仍须审查生产第一方授权、React 包内资源、打包 macOS、Windows 和旧数据回退，才能讨论默认页面切换。生产 `/workspace/chat` 保持旧 Vue 页面。

## 15. 2026-09-28 隔离桌面目录入口复核

**已完成**：在当前开发态 Electron 的 `/workspace/harness-pilot` 中，使用已绑定隔离会话，通过开发者协议触发 React 工作区按钮的 DOM `click()`；Finder 窗口目标核对为 `/private/tmp/mira-pilot-verify-CDOHSj/pilot-project/`。目标目录中的 `approved-proof.txt` 仍为此前批准任务产生的隔离文件。主进程仍按会话 ID 解析目录，未使用 React 提供的路径。

**验证边界**：随后复核 CDP 鼠标坐标输入：Wujie 按钮收到点击，宿主记录到当前会话 ID，Electron 调用返回空错误字符串，Finder 再次打开同一隔离目录。首次坐标注入未得到 Finder 窗口，复核时已成功；临时观测钩子通过页面重载清除。开发态 CDP 指针与 Finder 结果仍不能替代实体鼠标验收。对 `https://api.deepseek.com/v1/models` 的只读探测返回 HTTP 401，8080 端口为其他项目的 Atlas 前端，不是模型服务；当前仍无可用真实模型证据。未修改仓库密钥或用户真实数据。

**剩余/下次从这里开始**：需要在 Mira 隔离配置中提供有效的本地或远程模型入口，再跑真实发送、流式回复、工具审批、停止/继续、计划、澄清和成果任务。之后补实体鼠标/中文输入法、生产授权、包内资源及打包版验收；生产 `/workspace/chat` 继续保留。

## 16. 2026-09-28 Shift+Enter 注入复核

在隔离开发态 Electron 的 React 输入区，CDP 先输入 `A`，再发送带 Shift 修饰的 Enter `keyDown`、`char` 与 `keyUp`。输入事件记录出现 `insertLineBreak`，草稿变为 `A\n`，用户消息数保持不变；随后已清空草稿。第 13 节中“CDP Shift+Enter 未生成换行”是缺少字符事件的注入限制，并非已证实的 React 输入缺陷。此结论仅覆盖 CDP，实体键盘、中文输入法组合结束与焦点仍待验收。真实模型凭据探测 401 的状态不变。

## 17. 2026-09-28 真实模型任务闭环

**已完成**：使用隔离 `/tmp/mira-pilot-verify-CDOHSj` 配置中的真实 DeepSeek 提供商和 `deepseek-flash`，从 React pilot 完成以下桌面任务：

- 发送短消息：收到真实模型流式回复；重载并重新进入会话后，模型选择、完成态和回复从 Electron 持久化记录恢复。
- 文件写入：模型先尝试绝对路径并被项目沙箱拒绝；经第二次审批改用项目内相对路径成功执行 `write`、`read`、`list_files`。`real-model-proof.txt` 实际落在隔离项目目录，40 字节；审批前文件不存在。
- 停止后继续：真实模型长回复流式到约 65 行时停止，运行记录为 `stopped`；同一会话再次发送后产生第二条完成回复，旧消息没有重复。
- 计划与澄清：真实模型调用 `ask_user`，回答后调用 `present_plan`；从 React 确认只读计划后，模型读取两个文件并汇总，文件 SHA-256 和时间戳前后一致，没有修改文件。
- 多选 UI：补充 `ask_user` 结构化 schema 和提示后，真实模型明确传 `multiSelect: true`，React 将三个候选渲染为 checkbox；选择两个文件并提交的交互已验证。

**代码修正**：`ask_user` 不再把问题参数声明为任意 JSON；问题、选项、`multiSelect` 和 `allowCustom` 均有结构化 schema，保留旧字符串输入的服务端兼容归一化，并补了多选回归测试。计划模式若正常结束却没有待确认交互，Electron 会提醒模型再调用一次 `ask_user` 或 `present_plan`；仍不提交则标记运行失败并明确提示，不再伪装为已完成。全量 Vitest 65 文件 290 项、React/Vue 类型检查、Web/Electron 构建与 `git diff --check` 通过。

**残余风险**：同一真实模型在另一轮澄清回答后只输出了计划文字，没有再次调用 `present_plan`，因此没有生成可确认的计划卡片；运行时收敛保护已补自动化测试，但尚未用真实模型复跑该特定分支。实体键盘/中文输入法、物理鼠标、打包 macOS/Windows、生产第一方授权和包内 React 资源仍未验收。真实提供商凭据已从隔离配置删除，正式用户配置未修改。

**当前结论**：React Harness 的核心真实任务链路已达到“可继续做生产边界评审”的证据强度，但尚未达到“可切换默认生产入口”的放行条件；`/workspace/chat` 继续保留。

**下次从这里开始**：先检查本节与当前未提交工作区；在隔离实例中复跑“澄清后模型只输出计划文字”的真实模型场景，确认运行时提醒确实生成 `present_plan` 或明确失败。之后安排实体键盘、中文输入法和物理鼠标验收，再做第一方授权与 React 包内资源评审。切换生产入口仍未授权。

## 18. 2026-09-28 计划提醒后的正文一致性

**已完成**：上一轮真实 DeepSeek 复跑已观察到提醒分支创建持久化 `plan-review`，但首轮流式正文仍声称“不调用任何工具”，与待确认卡片矛盾。本轮仅在“首轮未创建交互、提醒后创建交互”的分支，将最终助手正文归一为对应的澄清或计划状态文案；正常计划回复保持原文。没有确认或执行旧会话中的待确认计划。

**验证**：新增矛盾正文回归；全量 Vitest 65 文件 291 项、React/Vue 类型检查、Web/Electron 构建和 `git diff --check` 通过。重启隔离开发态 Electron 后，本地脚本模型先流式返回“本轮不调用任何工具”，第二轮调用 `present_plan`；持久化会话 `618ad1cd-0bc5-4ec5-807c-55b5b1be6c2f` 的最终正文为“方案已整理，请确认是否开始执行”，状态为 `completed`、交互为 `plan-review/waiting`。React 页面显示同一正文与计划卡片，不再显示矛盾文字。此轮是脚本模型的桌面验证，不是修复后再次用真实模型跑该分支。

**隔离与下一步**：临时真实 DeepSeek 和本轮脚本提供商均已通过平台 API 从 `/tmp/mira-pilot-verify-CDOHSj/.mira/config/models.json` 删除；正式用户模型配置未修改，生产 `/workspace/chat` 保持旧 Vue。重载复核时 `9001` React 开发资源服务已退出，Wujie 画布为空；重新运行 `node apps/harness-react/dev.mjs` 并重载后，同一会话的计划、正文和等待状态恢复。开发态必须同时保持 Electron Vite 与 React 资源服务运行，这不是打包资源验收。核心真实模型任务链已有第 17 节证据，但实体键盘/中文输入法、物理鼠标、生产第一方授权、React 包内资源、打包 macOS/Windows 仍未验收。下一批从实体输入与生产授权/资源交付检查开始，不能据此切换默认入口。

## 19. 2026-09-28 输入事件边界复核

**浏览器事件证据**：在隔离 React pilot 的新会话中模拟中文组合输入，`compositionstart`/`insertCompositionText`/`compositionend` 后输入值保留为“你”；带 `isComposing` 的 Enter 没有产生用户消息。随后 Shift+Enter 产生换行，输入值为“你\n”，用户消息数仍为 0。该结果与 pilot 输入区的发送/换行约定一致。

**原生设备边界**：本机通过 macOS `System Events` 激活 Electron 后，辅助功能权限返回错误 `-25211`（osascript 不允许辅助访问），因此本轮没有实体键盘、中文输入法或物理鼠标证据。不能将上述 CDP/浏览器事件复核升级为原生设备验收；需要在授予辅助功能权限的开发机上补做。生产授权、React 包内资源、打包 macOS/Windows 也仍未验收。

## 20. 2026-09-28 修复后真实模型复跑

**已完成**：在全新隔离目录中只读复制正式 DeepSeek 配置（未修改或输出正式密钥），用真实 `deepseek-flash` 从 React pilot 宿主 API 完成一条完整链路：只读探索 `list_files/read` → `ask_user` 澄清 → 用户回答 → `present_plan` → 计划确认 → 只读执行。确认后的执行提示已补充“确认动作已经完成、按步骤执行、不要再次请求确认”的约束；真实模型执行时触发了用户允许的只读 `bash` 命令，并返回实际文件分析，而不是再次展示待确认方案。

**结果证据**：会话 `e1754d38-32aa-49d8-b070-75c21516af80` 最终状态为 `completed`，计划为 `completed`，工具 `list_files/read/bash` 均为 `ok`，React 页面显示完整差异结论、`最近任务已完成` 和无文件变更。`alpha.txt` SHA-256 为 `b6a98d9ce9a2d9149288fa3df42d377c3e42737afdcdaf714e33c0a100b51060`、大小 6、mtime `1790583080589.215`；`beta.txt` SHA-256 为 `f2c82decdd7181cf98945929a62598db7e6b477e11f6e0eb0ae97020eff151ad`、大小 5、mtime `1790583080589.2798`，执行前后完全一致。临时目录、复制的模型配置和进程均已清除。

**代码与验证**：`executingPlanSection` 明确确认后的执行语义，并新增提示回归；针对性测试 23 项通过。完整测试、类型检查和构建需以本节之后的最终命令结果为准。实体键盘/中文输入法、物理鼠标、生产第一方授权、React 包内资源、打包 macOS/Windows 仍未验收，生产 `/workspace/chat` 继续保留。

## 21. 2026-09-28 生产 React 接入与 UI 方案 A

**已完成**：`mira-harness` 已登记为内置第一方应用，新增 `harness:workbench` 能力；React 生产入口 `/workspace/harness-react` 使用 `FirstPartyFrame + MessageChannel + grant`，通过受控 RPC 调用 Harness。React 资源由 `npm run harness:build` 输出到 `dist/harness-react-app`，Electron 开发/打包分别解析项目目录与 `process.resourcesPath/harness-react-app`；旧 `/workspace/chat` 保留回退，旧页面提供新版入口。React 工作台改为任务线程主区、会话抽屉和工作区面板按需展开，方案 A 已确认。

**验证**：294 项 Vitest（含内置资源服务和 Harness 授权拒绝回归）、React/Vue 类型检查、Electron Vite 构建、React 静态资源构建、`git diff --check` 和 Impeccable 静态检测通过。未签名 macOS ARM64 目录包已生成，`Contents/Resources/harness-react-app` 内的 HTML/JS/CSS 均存在；打包应用尚未启动，Windows、原生输入和真实模型仍未验收。

**下次从这里开始**：在隔离目录运行 `npm run harness:build` 和 Electron 开发版，打开 `/workspace/harness-react`，确认资源由本地服务加载；随后做 macOS 打包资源路径、grant 撤销/重载和双入口回退验收。上述通过后再进行完整 UI 截图验收，最后评审是否切换根入口。旧 `/workspace/chat` 在此之前不得删除。

**本轮继续验证**：隔离 `MIRA_TEST_HOME=/tmp/mira-react-stage.M7Dsnv` 的 Electron 开发实例中，正式入口 iframe 从本地微应用服务加载 HTML/JS/CSS，React 页面显示任务空态，受控 RPC 成功创建个人工作区会话，工作目录落在隔离 `.mira/workspace`。从新版返回旧 Vue、再从旧版进入新版均成功。CDP 截图检查了开发实例的浅色宽窗口；会话抽屉两个图标重叠已修正。尝试的 1024×680 CDP 截图未对应当前 React 画面，因此不能算窄窗口视觉验收。macOS ARM64 未签名目录包已重新生成，包内 `app.js` 与最新构建产物一致；打包应用本身仍未启动。
