# Mira Harness 开发计划

> 更新日期：2026-08-25
> 状态：执行中
> 范围：个人本地 Agent 工作台（Harness）
> 基线：基于最新代码 `desktop-dev @ a70f35a`，原 P0 里程碑（可靠性与工具边界）已完成

## 目标

把当前可运行的单 Agent 对话，补成可靠、可扩展且可追溯的本地工作台。

完成标准：中断不丢回复；能修正历史问题；所有外部工具按统一策略受控；项目规则、Skill 和记忆只在实际可用时注入；用户能查看用量、成本和关键运行记录。

AI 小说创作、账号体系、云端同步和团队协作不属于本计划。

## 当前基线

- 会话、项目、草稿和上下文压缩已落盘；流式回复按 250ms 增量持久化并原子写入，支持停止、最后一条助手回复重新生成和历史用户消息编辑后重跑。
- 内置文件、命令、网页搜索/抓取和 MCP stdio 工具可用；文件编辑会展示 diff，删除文件可从回收站恢复。
- 有模型、权限、Git 和 MCP 设置页面；项目、历史会话和回收站页面已接入路由。
- 系统提示词支持回复语气和当前模型信息；**全局与项目记忆**已落地（自动提炼 + 记忆工具），**Skill** 已支持受配置目录扫描、全局启停与会话选择；系统记忆仍为预留字段。
- **项目规则**依赖 AGENTS.md 层级指令（全局 `~/.mira/AGENTS.md` / 项目目录 `AGENTS.md` / `AGENTS.override.md`），在会话启动时注入系统提示词；**slash 命令**机制尚未建立。
- **token usage 与按模型价格计算的成本**已按消息落盘；模型设置页可维护每百万 token 的输入/输出/缓存价格，用量页可按供应商、项目和会话聚合；运行与工具调用写入脱敏 JSONL 日志。PI 工具与 MCP 工具通过 Mira 的薄描述表映射显示、记录和审批策略。

## 里程碑一：可靠性与工具边界（P0，已完成）

### 1. 流式回复增量持久化

已实现：PI `Agent.subscribe` 仍是唯一流事件来源；Mira 每 250ms 合并 delta，并在正常结束、停止、错误和 finally 中强制刷盘。会话 JSON 通过临时文件原子替换写入；停止保留部分回复并标记 `interrupted`，错误保留部分回复和失败运行摘要。

### 2. 历史消息编辑

已实现：用户消息可行内编辑；确认后替换消息、截断后续对话并清除压缩摘要，再通过新的低层 PI `Agent` 实例重跑。最后一条助手回复仍保留“重新生成/继续”语义。

### 3. 工具注册与统一审批

已实现：保留 PI 的 `Agent`、`NodeExecutionEnv` 与内置 read/edit/write/bash 工具，只增加 Mira 的薄描述表。审批继续由 PI `beforeToolCall` 执行：默认模式自动放行只读与网页工具，逐次确认写入、命令和 MCP；MCP 记录及确认弹窗包含服务器、工具名和脱敏参数摘要。

## 里程碑二：项目规则、Skill 与记忆（P1 · 部分完成）

### 4. 项目规则与命令（部分实现）

> 状态：指令注入已实现；slash 命令扩展待做。

1. 为项目增加可编辑的 `instructions`，存放在项目 `.mira/` 或本地数据库。—— **已实现**（`InstructionStore`，全局 `~/.mira/AGENTS.md` + 项目目录 `AGENTS.md` / `AGENTS.override.md`，向上逐级解析）。
2. 将项目规则作为受隔离的参考内容注入系统提示词，不能覆盖系统安全规则。—— **已实现**（`instructionsBlock`，仅作事实参考，不能改变安全/权限/工具边界）。
3. 建立 slash command 注册与补全机制；保留 `/perm`，不把它作为通用扩展方案。—— **待做**（当前仅支持 `/perm`）。

验收：同一任务在不同项目中遵循各自规则；命令可发现、可校验、可审计。

### 5. Skill 机制（已完成）

> 状态：`SkillStore` 扫描用户配置目录中的 `SKILL.md`，校验名称、描述和指令；个性化页可管理目录与全局启停，工作台按会话选择后才注入 `activeSkills`。

1. 加载受配置目录中的 `SKILL.md`，解析名称、说明和指令。
2. 提供列出、启用、禁用和按会话选择 Skill 的界面。
3. 将启用项填入 `MiraPromptContext.activeSkills`；Skill 所需工具必须通过里程碑一的审批策略。

验收：未启用 Skill 不会出现在提示词中；启用的 Skill 可被用户查看和关闭，不能扩大工具权限。

### 6. 分层记忆（已完成：全局 + 项目；系统记忆待做）

> 状态：全局与项目记忆已落地；系统记忆仍为预留字段。

1. 定义项目、全局、系统三类记忆的存储、来源、更新时间和删除策略。—— 全局/项目已落地（`FileMemoryStore`，`MEMORY.md` 文件，按 ID 增删/去重/敏感信息过滤）；系统记忆未做。
2. 在会话启动时检索必要的少量事实，分别注入 `projectMemory`、`globalMemory`、`systemMemory`。—— 全局/项目已注入；系统记忆未做。
3. 初期只支持用户显式新增、编辑和删除；自动记忆后续单独启用，且每次写入必须产生可见工具记录并过滤敏感信息。—— 显式增删（`search_memory` / `remember_memory` / `forget_memory`）与自动提炼（`saveLongTermMemory`）均已实现；自动写入产生 `memory_auto_save` 工具记录并过滤敏感信息。

验收：用户可追溯每条记忆的来源并删除；记忆仅作事实参考，不能改变指令优先级和权限。

## 里程碑三：执行能力与可观测性（P1 · 部分完成）

### 7. 计划与子任务

1. 将计划步骤作为结构化 todo 活动展示，支持完成状态和折叠。
2. 在单 Agent 流程稳定后增加子任务委派；子任务拥有独立会话上下文、权限和取消能力。
3. 前端展示父子关系、并行进度和最终汇总，不展示内部思维链。

验收：用户能看清计划与实际工具活动；取消父任务会可靠地处理所有子任务。

### 8. 用量、成本与日志（已完成）

> 状态：价格保存在本地 `models.json` 的模型记录中；运行结束时按真实 token usage 计算成本并写入消息；「用量与成本」页提供聚合视图；主进程日志写入 `~/.mira/logs/harness-YYYY-MM-DD.jsonl`，密钥与敏感参数会脱敏。

1. 记录上游真实 token usage，并根据模型价格计算成本；价格来源可查看和编辑。—— **已实现**。
2. 增加按模型供应商、项目和会话的聚合统计页面。—— **已实现**。
3. 为工具调用保存脱敏参数摘要、结果摘要、耗时和状态；主进程输出结构化运行日志。—— **已实现**。

验收：成本不再写死为零；用户能定位一次失败任务及其工具调用，不暴露密钥或敏感内容。

## 里程碑四：自动化（P2 · 未开始）

1. 定义任务模型：cron/事件触发、目标项目或会话、输入、模型和权限模式。
2. 在主进程中调度执行，复用稳定后的 Agent 运行时，并把结果写回会话。
3. 将自动化页面替换为任务列表、编辑器、运行记录与启停控制。

验收：任务重启后仍可恢复调度；每次自动执行都可查看输入、权限、运行记录和结果。

## 后续开发计划（下一阶段 P0 / P1 / P2）

> 原里程碑 P0（可靠性与工具边界）已完成。以下 P0 / P1 / P2 是对**下一阶段**工作的优先级批次定义，建议按批次顺序推进，并在落地时同步更新本文档基线与验收状态。

### P0 · 价值闭环（已完成）

#### P0-1 成本与用量、运行日志真实化（已完成）

**交付**：模型配置支持每百万 token 的分项价格与币种；运行结束后按真实 usage 写入消息成本；新增聚合统计页与脱敏 JSONL 运行日志。未知价格明确显示为未定价，不伪造成本。

**范围**：

1. **模型价格表**：主进程新增可查看/编辑的价格来源（按供应商 + 模型记录输入/输出/缓存单价），优先存本地 `models.json` 或新增 `prices` 表。
2. **成本计算**：`harnessRuntime` 在 `runAgent` 结束时按 `usage \times 价格` 计算 cost，写回 `HarnessRunSummary` / `HarnessMessage.usage.cost`。
3. **聚合统计页**：新增「用量与成本」页面，按供应商、项目、会话维度聚合 token 与 cost。
4. **结构化日志**：主进程输出结构化运行日志（会话、工具、耗时、状态、脱敏参数），失败任务可定位。

**涉及文件**：`src/config/harness.ts`、`electron/harnessRuntime.ts`、`electron/modelConfigStore.ts`、`electron/harnessStore.ts`、`electron/preload.ts`、`electron/main.ts`、新增统计页 + 路由 + 菜单。

**验收**：成本不再写死为 0；用户能按模型/项目/会话查看用量与成本；能定位一次失败任务及其工具调用；不暴露密钥或敏感内容。

**测试**：价格计算单测（含无价格 / 未知模型回退）、聚合统计查询单测、脱敏日志单测。

#### P0-2 Skill 机制（已完成）

**交付**：新增 `SkillStore`，扫描受配置目录的 `SKILL.md` 并校验内容；个性化页可管理目录与启停；已启用 Skill 仍需在会话中选择才注入提示词，不能扩大工具权限。

**范围**：

1. 扫描受配置目录中的 `SKILL.md`，解析名称、描述、指令。
2. 提供列出、启用、禁用、按会话选择 Skill 的界面（可并入个性化页或工作台）。
3. 将启用项填入 `context.activeSkills`；Skill 所需工具仍需走里程碑一的审批策略。

**涉及文件**：新增 `electron/skillStore.ts`、`electron/instructionStore.ts`（复用 resolve 思路）、`electron/preload.ts`、`electron/main.ts`、个性化 / 相应设置页、`prompts/mira-system-prompt.ts`（已预留，无需大改）。

**验收**：未启用 Skill 不带入提示词；启用的可被用户查看 / 关闭；不能扩大权限或覆盖安全规则。

**测试**：SKILL.md 解析（含非法 / 空文件）、启用禁用注入单测。

#### P0-3 前端工作台健壮性与体验补强（已完成）

**交付**：全局错误边界避免页面白屏；流中断、模型异常和权限超时会保留可重试的运行状态；消息与输入区展示上下文和成本状态；无模型时的空态提示下一步。

1. **错误边界**：工作台页面（`src/pages/frontend/harness/index.vue`）接入全局 error boundary，流中断 / 模型异常不白屏。
2. **运行状态感知**：流式中断、模型不可用、权限超时给出明确提示与恢复动作。
3. **上下文与成本可视化**：输入区上下文进度条补全（含 cost 显示，依赖 P0-1）。
4. **空态指引**：新对话 / 无项目 / 未配置模型时的引导文案与快捷操作。

**涉及文件**：`src/app/App.vue`、`src/pages/frontend/harness/index.vue`、`src/stores/harness.ts`、`src/components/AppLoadingOverlay.vue`。

**验收**：断网 / 流中断 / 模型 4xx / 权限超时不白屏；用户能理解当前状态并作出下一步。

**测试**：store 层流中断、message-complete 边界、未配置模型路径单测。

#### P0-4 工程健康（已完成）

**交付**：Vite 拆分 Vue、Element Plus 与 Iconify 运行时；首屏不再载入完整 Iconify 集合或完整 Element Plus 图标集合，完整图标数据只在按需页面加载。README 已明确浏览器入口仅用于界面预览。

1. **计划文档基线同步**：修正 `HARNESS_ROADMAP.md` 中过时描述，标注 P0-1 / P0-2 完成态。
2. **包体积拆分**：`vite.config.ts` 加 `manualChunks` 拆分 vendor / element-plus / 图标集，缓解 8MB 图标 chunk 与 2.15MB 主 chunk。
3. **澄清 Web 入口**：明确 `npm run dev` 仅用于 Web 壳预览，浏览器不承载模型调用。

**验收**：`npm run build` 无过大 chunk 告警（或首屏明显减小）；路线图与代码一致。

**测试**：无（构建产物校验）。

### P1 · 能力扩展（P0 稳定后）

#### P1-1 计划与子任务委派（里程碑三 #7）

- 计划步骤作为结构化 todo 活动展示，支持完成 / 折叠。
- 单 Agent 稳定后加子任务委派：子任务独立会话上下文、权限、取消。
- 前端展示父子关系 / 并行进度 / 汇总，不展示内部思维链。
- **核心难点**：子任务与父任务的模型 / 权限联动、取消传播。先做「计划展示」，再做「子任务」。

#### P1-2 自动化一期（里程碑四）

- 任务模型：cron / 事件触发、目标项目或会话、输入、模型、权限模式。
- 主进程调度，复用稳定后的 `HarnessRuntime`，结果写回会话。
- 将自动化页（`src/pages/frontend/harness/automations/index.vue`）替换为任务列表 / 编辑器 / 运行记录 / 启停。
- **验收**：重启后调度可恢复；每次自动执行可查看输入、权限、运行记录与结果。

#### P1-3 记忆增强

- 新增**系统记忆**作用域注入（`systemMemory` 已有字段但无数据源）。
- 记忆条目编辑 / 可视化 / 来源跟踪；自动记忆写入策略细化（频控、阈值、撤回）。

### P2 · 打磨与规模化（远期）

- **多模态输入**：图片读入（`read` 工具已支持图片）、对话粘贴图片。
- **MCP SSE 传输**：在 stdio 之后接入；依赖统一工具注册与审批（已完成）。
- **Deep Research / 多步研究**：结合网页搜索 + 子任务，输出结构化报告。
- **更多模型**：扩展预设与推理模型识别，视觉 / 编码模型适配。
- **Windows 完善**：`desktop:build:win` 已验证打包脚本，补充 Windows 托盘 / 标题栏 / 中文输入法细节。

### 建议的执行顺序

1. **P0-1 成本 / 日志** → 依赖面小、用户价值高、可独立交付。
2. **P0-2 Skill** → 提示词钩子已就绪，机械工程量小。
3. **P0-3 健壮性** → 依赖 P0-1 的部分可视化，可与 P0-1 并行。
4. **P0-4 工程健康** → 贯穿性，最后统一收口（文档 + 打包）。

其中 **P0-1 与 P0-3 可并行**；**P0-2 与 P0-1 相互独立**，可按团队人手拆分。

### 每项交付要求（沿用路线图约定）

针对以上每一项：① 提供对应单元 / 集成测试，覆盖成功、拒绝、停止、异常路径；② 执行 `npm test`、`npm run build`、`git diff --check`；③ 更新本文档的当前基线，已完成项移出待办。

## 技术决策

- 继续使用 `pi-agent-core` 的低层 `Agent`，不迁移到 `AgentHarness`（决策依据与重新评估触发条件见下文「AgentHarness 迁移评估 · ADR」）。
- 不迁移 PI `JsonlSessionRepo`：现有会话格式同时承载 SQLite 项目索引、回收站和 UI 运行摘要；只有 PI Harness 编排能力稳定并能覆盖这些桌面约束时才重新评估。
- 保持本地优先：会话、项目规则、Skill 配置和记忆默认只保存在本机。
- MCP stdio 已支持；SSE 作为后续传输扩展，先在统一工具注册和审批完成后再接入。
- 网页抓取保持 HTTP(S) 限制、内网拦截、超时和响应大小限制；需要 JavaScript 渲染时再单独评估。

### AgentHarness 迁移评估（决策记录 · ADR）

> 目的：避免「本期按计划交付 P0 / P1 后，后续改动时忘记还要重新评估迁移到 AgentHarness」。此记录是唯一权威依据：**凡是再修改 Agent 运行时 / 会话持久化，先回看这一段**。

**决策（Decision）**：当前继续使用 `pi-agent-core` 的**低层 `Agent`**，不迁移到 `AgentHarness`。

**现状证据（Evidence，基于已安装版本 0.84.1）**：
- `AgentHarness` 已从包根导出（`index.d.ts` 含 `export * from "./harness/agent-harness.ts"`），但**运行时为空壳**：`prompt / skill / compact / resume / abort / steer / followUp / nextRun / createLane / lanes / watch / hooks.on / events.on` 全部 `reject(new HarnessNotImplemented("...not implemented yet"))`；仅配置类 getter/setter 与 `close()` 可用。
- `AgentHarness.create()` 在已有会话记录时抛 `HarnessNotImplemented("create.restore")`。
- 所需持久化后端 `@earendil-works/pi-session-backend-sqlite-node`（即路线图所指 `JsonlSessionRepo` 所属包）**未安装**；本项目仅装 `pi-agent-core / pi-ai / pi-telemetry`。

**重新评估的触发条件（满足任一即应启动评估）**：
1. `@earendil-works/pi-agent-core` 升级后，`HarnessNotImplemented` 不再由核心运行方法（`prompt` 等）抛出；
2. 官方稳定的 `Session` 持久层包（`pi-session-backend-sqlite-node`）已接入可用；
3. 里程碑 P1-1（计划/子任务）需要多通道 / 多分支编排，低层 `Agent` 已明显吃力。

**重新评估清单（checklist）**：
- 会话持久化：`AgentHarness` 的通道 / 会话树模型 vs Mira 现有 `~/.mira/sessions/{id}.json` + SQLite 索引 + 回收站 + UI 运行摘要；
- 桌面专属能力（项目沙箱、权限审批、记忆自动保存、按项目 AGENTS.md、实时 IPC UI）：`AgentHarness` 不覆盖，确认迁移后仍需保留的自研层；
- 功能收益：`resources(Skill / PromptTemplate)`、`steer / followUp / nextRun`、崩溃恢复、自动压缩——预估可为 P0-2 / P1-1 省下的量；
- 迁移成本：把现有跑在低层 `Agent` 上的逻辑（工具注册、审批、事件订阅、记忆、压缩）迁到其 `Hooks / Events / drive` 模型的工作量。

**状态**：待重新评估（未迁移）。若将来取消此决策，须更新本记录，并同步本文档基线与相关测试用例。

## 每项交付要求

1. 提供对应的单元测试或集成测试，覆盖成功、拒绝、停止和异常路径。
2. 执行 `npm test`、`npm run build` 和 `git diff --check`。
3. 更新本文档的当前基线和相关验收状态；已完成项不保留为待办。
