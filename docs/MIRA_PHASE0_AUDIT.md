# Mira 阶段 0：代码边界审计、开源 UI 选型与第一刀改动

> 日期：2026-09-23；审计分支：`codex/mira-harness-first-slice`。
> 性质：实施前决策记录；本轮未迁移源码、创建外部仓库、修改数据或验收原生 Electron。
> 上位范围：[平台方案](./MIRA_PLATFORM_PLAN.md)与[实施 PRD](./MIRA_IMPLEMENTATION_PRD.md)。当前 `PRODUCT.md` 仍以小说创作为产品定位，和已确定的桌面 Harness 平台范围不一致；实施时须单独同步，不能用它覆盖本轮决策。

## 0. 换电脑从这里开始

**这份文件是唯一开工入口。**回到另一台电脑后先取 `origin/codex/mira-harness-first-slice`，不要从 `main` 或 `desktop-dev` 接着改；先运行 `git status`，若已有本地未提交改动，先检查并保留，不要覆盖。尚未克隆仓库则克隆 `ChatWw/Mira-Harness`，再获取该远端分支；若本地已有同名分支，先确认没有未提交改动，再做快进更新。不要在不清楚工作区状态时直接 `git pull`、重置或强推。

在已经克隆的仓库中，安全的获取步骤是 `git status` → `git fetch origin codex/mira-harness-first-slice`。若本地没有这个分支，用 `git switch --track -c codex/mira-harness-first-slice origin/codex/mira-harness-first-slice`；已有分支则先 `git switch codex/mira-harness-first-slice`，确认工作区状态后运行 `git merge --ff-only origin/codex/mira-harness-first-slice`。若 Git 报冲突或本地提交分叉，先停下核对，不强行覆盖。

先读本文件第 2–3 节的现状和文件归属，再读第 4 节选型结论、第 5 节的第一刀。上位决策以 [平台方案](./MIRA_PLATFORM_PLAN.md) 为准；P0–P3 和后续批次看 [实施 PRD](./MIRA_IMPLEMENTATION_PRD.md)。当前阶段只批准下方的**首批切片**，不启动完整架构迁移。

可直接交给下一轮 Codex 的开工描述：

> 我在 `codex/mira-harness-first-slice` 继续 Mira。请先读 `AGENTS.md` 和 `docs/MIRA_PHASE0_AUDIT.md`，核对当前分支、远端与工作区。先按第 5 节第 1 步做一个无行为变化的 Electron 应用宿主装配/IPC 切片：保持现有 IPC 名称、参数、返回值、Harness 和旧 `/novel` 入口不变；先确定抽取边界与回归用例，再改代码。不要同时重构 React、迁出小说、改 SQLite、清理设置或开发安装器。不要用真实 `~/.mira` 用户数据做实验；需要运行 Electron 时使用隔离数据目录并分别报告静态检查与原生验收。已有 React/Wujie 页面是演示原型，不是真实 Harness 适配。

本次交接的预计远端状态：分支上应有本文和两份规划文档，以及单独标注为 **spike** 的 React/Wujie 原型；原型不能作为生产 Harness 或新架构验收。若远端分支不存在或文件不齐，先停下来核对本次交接的推送结果，不要按旧 `desktop-dev` 文档猜测工作内容。

首批切片验收：现有 IPC 行为、Harness 会话和内置小说入口不变；新增针对注册/错误路径的回归检查；改动只围绕 `electron/main.ts` 的应用宿主装配和相关 IPC；`git diff --check`、相关测试、类型检查通过。若使用隔离数据目录启动 Electron，分别记录是否实测 macOS/Windows、旧作品读取与真实模型；未测不写通过。原实现保持可回退，在下一批完成身份与权限边界前不向外部包开放模型密钥或小说存储。

## 1. 前提与完成标准

- 本仓库最终只承载 Electron 平台、Vue Shell、默认 Mira-Harness，以及 Novel Studio/Vision 的**受控接入配置**。Novel Studio 的业务源码和构建发布迁往独立 Git 项目；Vision 仅预留禁用配置，尚无工程或下载条目。
- 旧小说作品、模型配置、会话、安装记录不能因为“整理目录”被删除。独立 Novel Studio 尚未建仓或提供包，当前实现仍是用户的可用旧入口。
- React/Wujie 原型只证明开发态演示界面可挂载；尚未证明真实模型、原生 Electron、任务恢复或生产加载。旧工程的测试通过仅是回归基线，不是新架构验收。
- 本阶段交付：当前依赖图、逐类文件归属与迁出顺序、候选 UI 的许可证/复用成本对比、明确的第一批代码切片和每批验收/回退。下文的“建议”不等于已经执行。

## 2. 当前真实依赖，不按目标目录想象代码

```text
Vue Shell / 动态菜单 ──> 内置 /novel 页面 ──> window.platform 全量 preload
                     └─> Wujie 宿主 ──> SQLite 中的 micro_apps / 本地静态服务
                                         └─> /apps/novel/{authoring,automation} 模型代理

Harness Vue 页面 ──> Pinia store / 事件 reducer ──> preload IPC ──> HarnessRuntime
                                                          └─> PlatformDatabase / ~/.mira
小说 Vue 页面 ──> 作品 IPC ──> NovelStore ──> 同一 SQLite 的 novel_projects / novel_settings
            └─> 模型 HTTP 代理 ──> 主进程供应商凭据
```

| 边界 | 当前证据 | 对拆分的影响 |
| --- | --- | --- |
| Electron 启动、装配、IPC | [`electron/main.ts`](../electron/main.ts) 同时创建窗口、打开数据库、启动 Harness/自动化/本地 HTTP 服务，并注册菜单、模型、会话、小说等 IPC；[`electron/preload.ts`](../electron/preload.ts) 导出一整套 `window.platform` | 先按职责收紧接口，不能把全量 preload 当子应用 SDK；主进程执行能力不随小说前端移走 |
| Harness | [`src/pages/frontend/harness/index.vue`](../src/pages/frontend/harness/index.vue) 已拆消息、输入、工作面板；[`src/stores/harness.ts`](../src/stores/harness.ts)、[`src/stores/harnessEventReducer.ts`](../src/stores/harnessEventReducer.ts) 处理会话快照、事件去重、运行状态；[`electron/harnessRuntime.ts`](../electron/harnessRuntime.ts) 持有真实执行 | UI 可以另选框架，仍须保留会话、审批、取消、成果的数据语义；不能把运行时复制进 React 子应用 |
| 小说 UI 与业务 | [`src/pages/frontend/aiNovel/`](../src/pages/frontend/aiNovel/) 内有编辑器、章节、提示词、自动保存和流式生成；领域文档在 [`src/config/novel.ts`](../src/config/novel.ts)；[`src/config/menus.ts`](../src/config/menus.ts) 把 `/novel` 作为受保护内置菜单 | 迁出不等于把一个 Vue 文件复制出去；需迁组件、领域规则和构建依赖，并保留旧 `/novel` 链接过渡 |
| 小说模型与数据 | [`electron/novelApi.ts`](../electron/novelApi.ts) 是小说专用模型代理；[`electron/novelStore.ts`](../electron/novelStore.ts) 解析/校验作品 JSON；[`electron/database.ts`](../electron/database.ts) 建立 `novel_projects`、`novel_settings`，并保留旧 `ai-novel` 微应用迁移逻辑 | 外部应用不能直接 import 主仓库内部文件。数据暂留宿主可以是过渡，但“主仓库只留配置”最终需要把小说领域逻辑迁出，并用受控存储契约读取旧作品 |
| 应用宿主 | [`src/config/microApps.ts`](../src/config/microApps.ts) 内置清单当前为空；[`src/config/platformValidation.ts`](../src/config/platformValidation.ts) 的 Wujie 模式只接受本地目录/内置包；[`src/pages/frontend/microAppHost/index.vue`](../src/pages/frontend/microAppHost/index.vue) 目前仅传主题、语言、导航上下文 | 现有宿主能加载资源，不等于已有受信任第一方目录、版本化 SDK 或下载更新；开发 URL 需要独立受控机制 |
| 旧应用身份 | [`src/types/index.ts`](../src/types/index.ts) 要求 `micro-${code}`；[`src/config/runtime.ts`](../src/config/runtime.ts) 从 SQLite 快照列出启用应用；`/novel` 仍是内置页面 | 从 `ai-novel` 到 `mira-novel-studio` 需要兼容别名/旧链接映射；不能直接更名导致入口或持久化记录失联 |
| 数据位置 | [`electron/miraPaths.ts`](../electron/miraPaths.ts) 指向用户 home 下的 `.mira/state.sqlite`；构造 `MiraPaths(...).ensure()` 会创建真实目录 | 阶段 0 仅看源码；后续 Electron 验收要用明确隔离的测试 home，不能用当前用户真实数据直接试迁移 |

### 必须先处理的安全边界

当前 `LocalMicroAppServer` 的小说 POST 路径按 URL 中的 `novel` 找处理器；其 CORS 策略允许本机回环来源及 `null` Origin。这是**来源限制，不是应用身份或权限认证**；本机其他进程也不受浏览器 CORS 约束。见 [`electron/localMicroAppServer.ts`](../electron/localMicroAppServer.ts) 与 [`electron/main.ts`](../electron/main.ts)。另外主进程存在获取模型 API Key 的 IPC，preload 也有对应方法。外部应用正式调用模型/作品前，必须定义宿主绑定的应用身份、允许能力、参数校验和调用通道；不得直接暴露完整 `window.platform` 或把 loopback 地址当作授权依据。这里记录的是源码边界风险，**没有做渗透测试，也不推断当前 Wujie 子页面已能调用全部 IPC**。

## 3. 文件归属与迁出顺序

| 现有文件或数据 | 目标归属 | 第一批动作与迁出门槛 |
| --- | --- | --- |
| `electron/main.ts`、`preload.ts`、`database.ts`、`miraPaths.ts`、`harnessRuntime.ts` | 主仓库平台/Harness | 不整体搬家；先明确启动、IPC、服务、存储边界，再逐块迁移并保留现有调用行为 |
| `src/pages/frontend/harness/`、`src/stores/harness*`、`src/config/harness.ts` | 主仓库 Harness；UI 是否 React 待真实适配验证 | 现有 Vue 继续服务用户；原型只保留作对照，不直接替换生产路由 |
| `src/pages/frontend/aiNovel/`、小说专用组件、应用端领域逻辑 | 独立 `mira-novel-studio` | 独立构建、平台接口、旧作品读取、保存与失败回退全部通过之后，才移除主仓库副本；不双写 |
| `src/config/novel.ts` 中的作品 schema/默认提示词、`electron/novelStore.ts` 的领域解析规则 | 独立项目拥有领域定义；主仓库过渡层或通用存储只保留必要兼容契约 | 先定 `NovelProjectDocument.version` 和迁移责任；不能把业务 schema 永久留在宿主，同时声称“这里只是配置” |
| `novel_projects`、`novel_settings`、旧模型绑定、`/novel`、`ai-novel` 历史记录 | 用户数据/兼容状态，绝不随源码删除 | 记录旧样本，备份与事务化迁移/兼容读取；保留可重试旧入口，明确何时安全停用 |
| `electron/novelApi.ts` | 过渡时仍由宿主代理；目标为平台受控模型能力而非小说专用公开端点 | 先补应用身份/权限契约，再迁调用方；不把密钥给外部子应用 |
| `src/config/microApps.ts`、`platformValidation.ts`、`microAppHost/index.vue` | 主仓库受控应用清单/宿主 | Novel Studio 后续有启用配置；Vision 仅禁用保留，不能出现在应用中心；开发入口与生产安装清单隔离 |
| 新的独立 `mira-novel-studio` Git 仓库与未来 `mira-vision` Git 仓库 | 与主仓库并列 | 本轮不创建；不要放入主仓库目录、submodule 或先造空业务工程 |

暂定迁出顺序：**定身份/数据契约 → 独立小说工程构建 → 受控本地包加载 → 旧作品读写与模型调用 → 回退验收 → 移除主仓库旧 UI/领域实现**。Vision 不参加这条链。旧 SQLite 表是否保留为平台兼容层、何时转为应用命名空间存储，须用真实旧作品样本验证后决定；不能把“移动源码”和“移动数据”绑成一次不可恢复操作。

## 4. 开源 Agent UI 候选与建议

本节基于 2026-09-23 GitHub 默认分支 README、目录、包元数据和仓库许可证作**源码级初筛**；未安装候选、未运行它们的 UI，也未实测其与 Mira 事件/Wujie 的适配。许可证仅记录仓库声明，采用具体包/复制代码前仍需锁定版本并复核文件级许可和第三方依赖。

| 候选 | 许可与可复用层级 | 对 Mira 的收益 | 主要适配成本 / 判断 |
| --- | --- | --- | --- |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT；React 组件/运行时包，`@assistant-ui/react` 声明 React 18/19 peer | 消息、输入、线程与工具渲染 primitives；支持自定义 backend/runtime，适合 React 路线的**组件候选** | Mira 的计划审批、文件成果、任务恢复与 IPC 事件需要适配；不能只安装组件就得到 Agent Harness。保留为 React 首选试验对象 |
| [Element Plus X](https://github.com/element-plus-x/Element-Plus-X) | MIT；`vue-element-plus-x`，Vue 3 + Element Plus peer | Bubble、Sender、ThoughtChain 等可在现有 Vue/Element Plus 路线低成本对照 | 是 AI 对话组件而非任务运行时；审批、权限、成果、桌面面板仍由 Mira 设计。保留为 Vue 对照对象 |
| [AionUi](https://github.com/iOfficeAI/AionUi) | Apache-2.0；完整桌面产品，含独立 backend/多 Agent | 通用个人工作台的信息组织、审批与设置可作为流程参考 | 整套运行时/后端与 Mira 平台重叠；不作为直接 Fork 的起点 |
| [Goose](https://github.com/aaif-goose/goose) | Apache-2.0；桌面 React + Rust Agent/CLI | 运行过程、工具与权限的状态呈现参考 | 运行时及桌面架构不同，复制 UI 需拆大量后端约定；不直接接管 Mira 运行时 |
| [Cline](https://github.com/cline/cline) | Apache-2.0；SDK/CLI/IDE 扩展 | 文件操作与审批交互参考 | 编程/IDE 场景权重高，与通用个人工作台不完全一致；不作为整体 UI 底座 |
| [Harnss](https://github.com/OpenSource03/harnss) | MIT；Electron/React 完整 Agent 桌面端 | 工具卡、变更面板、子任务展示参考 | README 标注早期开发并计划较大重写；ACP/SDK/状态管理耦合，不建议现在 Fork |

**本阶段结论**：不 Fork 完整 Agent 产品，不搬它们的执行器/会话数据库。默认保留 Mira 运行时和现有 Vue 生产页；以同一设计和真任务对照两条 UI 实现：Vue + Element Plus X（或现有组件）与 React + assistant-ui primitives。React 原型已经证明开发态挂载的可能性，但**框架选型尚未放行**；只有真实事件、审批、文件成果、重新进入会话和桌面操作的适配成本明显优于 Vue，才进入正式 React 迁移。此选择是可执行的评估路线，不宣称候选 UI 已经达到 Mira 产品验收。

按桌面“操作型”界面审查这条流程时，重点比较：空态是否给出清楚下一步、运行状态与工具详情是否分层、审批是否说明后果并可拒绝、成果是否可定位、失败/停止后是否知道如何恢复；夜间主题、键盘/输入法与焦点管理同样要查。不可把漂亮的聊天截图当作任务全流程设计证据。

## 5. 第一批代码切片：先平台边界，再外部应用

阶段 0 完成后，建议第一刀限定为**无行为变化地拆出桌面应用宿主的装配/IPC 边界**，不同时做 UI 替换或数据迁移：

1. 从 `electron/main.ts` 梳理并抽出应用入口/本地资源服务相关的 IPC 注册与依赖注入；入口只装配服务。保持现有 IPC 名称、参数、返回值和 `/novel` 旧入口不变。先复用 `tests/platformManagement.test.ts`、`tests/menuManagement.test.ts`、`tests/novelStore.test.ts` 等既有回归，再补注册与错误路径的针对性用例；验证隔离数据环境的桌面开发版中 Harness 和旧小说仍可打开。**这一步不宣称应用已经安全隔离。**
2. 基于这条边界设计第一方清单字段：应用 ID/历史别名、启用状态、受信任发布源、入口、Shell/API 兼容版本、能力白名单、开发态覆盖入口。先按现有数据格式确定兼容映射，再让 Novel Studio 有可加载的本地包；Vision 只能处于禁用保留状态。验证旧微应用快照和旧 `/novel` 链接不丢失。
3. 在调用外部小说包的模型/存储前实现最小授权桥，证明独立子应用只能获得自己的能力，不能读取模型密钥或其他应用的数据；用隔离的旧数据副本验收读取、保存、失败重试及回退。之后才讨论移除旧小说业务代码。

阶段 1 仍要逐批验证：类型检查/单测只覆盖静态回归；开发态 Electron、打包 macOS、Windows 和真实模型调用分别记录，未运行项标为待验收。真实数据目录是 `~/.mira`，本阶段没有启动 Electron 或访问用户作品；涉及数据迁移时先用临时测试 home 和可恢复备份。

## 6. 放行前未解决的问题

1. Novel Studio 的独立工程何时、放在哪里建立及由谁维护发布？在此之前不删除本仓库旧 UI。
2. 旧 `novel_projects` 的长期所有权：平台保留受控兼容存储，还是迁往应用命名空间的通用持久化？两者均须保持旧作品可恢复；本轮未做不可逆选择。
3. 第一方应用身份如何跨 Wujie/HTTP 与宿主安全绑定、避免通过 URL 或页面参数自报身份？未定前不能把本地小说模型代理开放为 SDK。
4. 外部包的签名/可信发布来源、安装回退、版本兼容尚无实现；不能把手动选择目录当成正式应用中心。
5. React vs Vue 的正式选择等待同一真实任务与原生 Electron 操作对照；当前原型只含演示数据。
