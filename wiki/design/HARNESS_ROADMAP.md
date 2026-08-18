# Agent 工作台（Harness）路线图

> 版本: 0.1.0-draft
> 日期: 2026-08-18
> 状态: 待评审
> 定位: 个人本地 Agent 工作台

---

## 0. 文档目的

本文档回答一个问题：**把当前"勉强可用的 Agent 工作台"做成一个可靠的个人本地 Agent 工作台，还缺什么、按什么顺序补。**

范围仅限 Harness（Agent 工作台）模块，不涉及 AI 小说创作模块。

---

## 1. 现状基线

Harness 的**最小闭环已经存在**：能建项目（绑定本地目录）、发消息、跑单 Agent、流式回显、用 5 个本地工具读写文件/执行命令、自动压缩上下文、按三档权限审批、会话落盘。

| 维度 | 已有能力 |
| --- | --- |
| 运行时 | 单 Agent 顺序执行；SSE 流式；token 估算 + 80% 阈值自动压缩；中止 |
| 工具 | `read_file` / `list_files` / `write_file` / `delete_file` / `bash`（硬编码） |
| 权限 | `default` / `auto-approve` / `full` 三档；危险命令黑名单；路径沙箱 + 符号链接检测；回收站删除 |
| 数据 | 项目（`harness_projects`）、会话（JSON 文件，项目内 `.mira/sessions/` 或用户目录）、模型供应商、权限配置 |
| UI | 对话流 + Markdown + 对话快速导航轨 + 运行步骤展示 + 上下文用量环 + 模型/推理强度/权限选择 + 附件 + 草稿持久化 |
| 页面 | chat 主页可用；`history`/`projects` 页已写但未接路由；`automations` 是空占位 |

关键实现文件：

- 运行时：`electron/harnessRuntime.ts`
- 存储：`electron/harnessStore.ts`
- 模型配置：`electron/modelConfigStore.ts`
- 前端状态：`src/stores/harness.ts`
- 前端页面：`src/pages/frontend/harness/index.vue`
- 类型与常量：`src/config/harness.ts`

---

## 2. 目标愿景

- **短期（1 个迭代）**：让已跑通的闭环**可信**——中断不丢数据、说错能改、会话找得到、删了能找回。
- **中期（2~4 个迭代）**：让它**能干活**——工具可扩展、可接 MCP、文件变更可见 diff。
- **长期**：让它**干得放心**——用量/成本透明、日志可查、能无人值守。

---

## 3. 阶段总览

| 阶段 | 主题 | 优先级 | 状态 |
| --- | --- | --- | --- |
| 零 | 架构决策（AgentHarness 迁移评估） | P0 | 待开始 |
| 一 | 可靠性补完 | P0 | 待开始 |
| 二 | 工具生态 | P0/P1 | 待开始 |
| 三 | Agent 能力进阶 | P1 | 待开始 |
| 四 | 可观测性与成本 | P1/P2 | 待开始 |
| 五 | 自动化 | P2 | 待开始 |

依赖关系见 [§9](#9-依赖关系)。

---

## 3.5 阶段零：架构决策（P0，先行）

> 结论先行：**已查证并 PoC 验证 —— 不迁移 `AgentHarness`（它是空壳），继续用低层 `Agent` 编排，复用框架现成能力替换自造部分。** 这是所有阶段的共同前置。

### 关键发现（查证源码 + PoC 验证后）

查证 `@earendil-works/pi-agent-core@0.84.1` 源码后，结论与初版判断相反：

1. **`AgentHarness` 是空壳**：`harness/agent-harness.js` 里 `prompt`/`resume`/`steer`/`skill`/`watch`/`createLane`/`compact`/`abort` 全部 `throw new HarnessNotImplemented(...)`，`hooks`/`events` 也是 `UnavailableRegistry`。**它不能直接用。**
2. **低层 `Agent` 才是能跑的编排层**，且项目当前**没用全它的能力**：它自带 `beforeToolCall`/`afterToolCall`（工具拦截）、`steer`/`followUp`（引导/队列）、`abort`/`continue`/`waitForIdle`、`transformContext`/`shouldStopAfterTurn`、`toolExecution`。
3. **框架真正可复用、且应替换项目自造部分的独立模块**：

| 框架现成能力 | 替换项目的自造部分 |
| --- | --- |
| `createEditTool`（返回 `diff`+`patch`）、`createReadTool`（带图片）、`createWriteTool`、`createBashTool`（带 `prepare` 拦截） | 手写 5 工具 |
| `NodeExecutionEnv`（`FileSystem` + `Shell`） | 手写 `execFile` + 路径处理 |
| `Session` / `InMemorySessionStorage` / `JsonlSessionRepo`（含 token/cost 统计、搜索、lane 分叉） | 手写 JSON 会话存储 |
| 低层 `Agent.beforeToolCall` / `abort` / `steer` / `continue` | 手写 `approve()` 弹窗 + `AbortController` |
| `loadSkills`（SKILL.md） | （无，Skill 缺失） |
| `compaction`（`generateSummaryWithUsage` 等） | 项目已用 |

**框架没有的（仍需自造）**：MCP 客户端、`web_search`/`web_fetch`、SSRF 防护、Electron 权限弹窗（挂在 `beforeToolCall` 里）、沙箱 `FileSystem`（包装 `NodeExecutionEnv` 限制在项目目录）、成本聚合 UI。

### 决策（已定）

**不迁移 `AgentHarness`（空壳），继续用低层 `Agent` 做编排，复用框架现成能力替换自造部分。** 这才是"接入 + 适配 UI"的正确姿势，也是当初"写着写着变成重复造轮子"的反面。

### 目标架构（正确的接入姿势）

**框架负责（直接接入，不重写）**：
- 编排：低层 `Agent`（`prompt`/`abort`/`continue`/`steer`/`followUp`/`beforeToolCall`/`afterToolCall`）
- 工具：`createBashTool` / `createEditTool`（带 diff）/ `createReadTool`（带图片）/ `createWriteTool`，经薄适配器接进低层 `Agent`
- 执行环境：`NodeExecutionEnv`（或包装成沙箱 `FileSystem`）
- 会话：`Session` / `JsonlSessionRepo`（统计、搜索、分叉）
- Skill：`loadSkills`（SKILL.md）
- 压缩：`compaction` 系列

**项目负责（真正的"自己的活"）**：
1. 薄适配器 —— 把 `AgentHarnessTool`（execute 带 context）包成低层 `Agent` 的 `AgentTool`（execute 无 context）
2. Electron 权限审批桥 —— 用低层 `Agent.beforeToolCall` 挂 `dialog.showMessageBox`
3. 文件系统沙箱 —— 实现"限定在项目目录内"的 `FileSystem`（平移现有 `assertProjectPath`），框架本身不强制
4. 模型映射 —— 现有 `modelConfigStore` + `openAICompletionsApi` 接成 `models`/`model`
5. MCP 客户端 —— MCP server 工具转成 `AgentTool` 注入
6. `web_search` / `web_fetch` —— 框架没有，需自造
7. UI —— 低层 `Agent.subscribe` 事件映射到现有 `harness:event` 通道

### PoC 结论（已完成 ✅）

`scripts/poc-harness.mjs`（`node scripts/poc-harness.mjs`，需 node ≥ 22.19）10 项验证全部通过：

- ✅ `createEditTool` 返回 diff 并真实写入文件
- ✅ `createBashTool` 执行命令
- ✅ 薄适配器把内置工具接进低层 `Agent`，跑通一次带工具调用的会话
- ✅ `beforeToolCall` 能放行 / 能 `block`（权限拒绝后文件未被修改）
- ✅ `Session` 记录消息并统计
- ✅ `agent.abort` / `steer` / `continue` 均可用

**结论：方案成立。** 后续按"复用框架 + 薄适配 + 自造 MCP/web/沙箱/UI"执行，缺口清单据此重排（见各阶段）。

---

## 4. 阶段一：可靠性补完（P0）

> 目标：不做任何"中断 = 白干、说错不能改、删了找不回"的坑。这是信任问题，投入小、价值最高。

### 4.1 流式输出增量持久化

**问题**：`harnessRuntime.ts` 的 `runMessage` 中，流式文本只存在局部变量 `output`，成功走完才 `appendAssistantText` 落盘；中止/报错时已显示的半截回复在刷新后丢失。

**任务**：
1. 在 `HarnessStore` 增加"增量写 assistant 文本"的方法（如 `appendAssistantDelta(id, delta)`），逐 delta 或按节流批量写会话 JSON。
2. `harnessRuntime.ts` 在 `emit(message-delta)` 的同时调用落盘；中止/异常路径同样保留已产出文本，并给消息标记 `interrupted` 状态。
3. 前端 `stores/harness.ts` 不再只改内存态——确保 `finishMessageStream` 重新拉取时能对账（避免双写重复）。

**涉及文件**：`electron/harnessStore.ts`、`electron/harnessRuntime.ts`、`src/config/harness.ts`（消息类型加 `interrupted?`）。

**验收**：
- [ ] 发送后立即点"停止"，刷新页面，已显示的内容仍在，且标记为"已中断"。
- [ ] 模型报错时，错误前的部分输出不丢失。

### 4.2 编辑历史消息 + 重新生成（regenerate）

**问题**：`runMessage` 只能追加，不能"改上一句重跑"或"删掉这条重问"。

**任务**：
1. `HarnessStore` 增加 `truncateMessages(id, index)`（截断到指定位置）与 `regenerate(id)`（删除最后一条 assistant 回复）。
2. 通过 preload + `PlatformApi` 暴露；前端给每条 user 消息加"编辑"、给 assistant 消息加"重新生成"操作。
3. 编辑后重跑，复用现有 `runMessage` 逻辑。

**涉及文件**：`electron/harnessStore.ts`、`electron/preload.ts`、`electron/main.ts`、`src/types/index.ts`、`src/pages/frontend/harness/index.vue`。

**验收**：
- [ ] 能编辑任意一条历史 user 消息并重发，之后的旧对话被替换。
- [ ] 能对最后一条 assistant 回复"重新生成"。

### 4.3 续跑 / 恢复中断任务

**问题**：`abort` 后会话即 `failed`，无法从断点继续。

**任务**：
1. 依赖 4.1 的 `interrupted` 标记，提供"继续"入口：以断点前的完整上下文（含已产出文本）重新发起 `runMessage`。
2. 明确续跑语义（重新生成最后一条回复，而非追加第二条），避免重复。

**涉及文件**：`electron/harnessRuntime.ts`、`electron/harnessStore.ts`、前端页面。

**验收**：
- [ ] 中断的会话可以一键"继续"，上下文不丢、不产生重复段落。

### 4.4 接通会话/项目视图

**问题**：`src/router/index.ts` 中 `/workspace/history` 与 `/workspace/projects` 被 redirect 到 chat，`history/index.vue`、`projects/index.vue` 是死页面。

**任务**：
1. 恢复这两个路由（去掉 redirect），接入已写好的页面组件。
2. 在顶栏/侧边栏/命令面板补入口（`commandPalette.ts` 已能列 session，补 project 分类）。
3. 核对 `projects/index.vue` 的 `sessionCount` 展示与删除语义（当前删除仅"移除注册"）。

**涉及文件**：`src/router/index.ts`、`src/config/commandPalette.ts`、`src/pages/frontend/harness/projects/index.vue`、`src/pages/frontend/harness/history/index.vue`。

**验收**：
- [ ] 能通过独立页面浏览、搜索、打开、删除会话与项目。

### 4.5 回收站管理 UI

**问题**：`HarnessStore` 已实现 `listTrash`/`restoreTrash`，但 preload/main 未暴露，删除的文件无法找回。

**任务**：
1. 暴露 `listTrash(projectId)` / `restoreTrash(projectId, token)` 的 IPC 与 `PlatformApi` 方法。
2. 在项目视图或会话面板加"回收站"入口，支持列出与还原。

**涉及文件**：`electron/main.ts`、`electron/preload.ts`、`src/types/index.ts`、项目/会话页面。

**验收**：
- [ ] 被 Agent 删除的文件能浏览并还原。

---

## 5. 阶段二：工具生态（P0/P1）

> 目标：把"5 个写死的本地工具"变成"可扩展、可接外部生态"的能力边界。

### 5.1 工具注册机制（P0）

**任务**：
1. 抽离 `tools()` 为独立的 `toolRegistry`：工具 = `{ name, label, description, schema, execute }`，按名称注册、按会话权限筛选。
2. 允许通过配置/目录加载自定义工具（先支持内置清单，再考虑外部加载），避免每次加工具改运行时源码。
3. 网络工具（5.4）与 MCP 工具（5.2）均作为首批通过 registry 挂载的能力。

**涉及文件**：`electron/harnessRuntime.ts`（拆分出新文件，如 `electron/tools/`）。

**验收**：
- [ ] 新增一个工具无需改动 `runMessage` 主体逻辑。

### 5.2 MCP 客户端接入（本期）

**任务**：
1. 调研 `pi-agent-core` 是否已有 MCP 适配，否则引入轻量 MCP client。
2. 支持在设置页配置 MCP server（stdio / SSE），启动时连接并把 server 的工具注入 registry。
3. 工具调用复用现有审批链路。

**涉及文件**：`electron/`（新增 MCP 模块）、`src/pages/backend/`（新增 MCP 设置页）。

**验收**：
- [ ] 配置一个 MCP server 后，其工具出现在 Agent 能力中并可调用。

### 5.3 文件变更 diff 可视化（P0）

**现状**：框架 `createEditTool` 已返回 `diff`/`patch`（PoC 已验证），无需自造 diff 算法。

**任务**：
1. 用框架 `createEditTool`/`createWriteTool` 替换自写工具（依赖阶段零薄适配器）。
2. 把工具返回的 `diff` 写入 `ToolCallRecord.diff`。
3. 前端在运行步骤中展示可读的 diff（先纯文本 diff，再做行级高亮）。

**涉及文件**：`electron/harnessRuntime.ts`、`src/pages/frontend/harness/index.vue`。

**验收**：
- [ ] Agent 每次改文件，用户能看到 diff，而非一句"文件已写入"。

### 5.4 网络工具（本期，web_search + web_fetch）

**澄清**：Agent 运行在 Electron 主进程（Node 运行时），主进程原生 `fetch` 即可联网（模型调用本身已在主进程 fetch 上游）。Agent 回答"不能联网"是因为当前工具集未注册网络工具，不是环境限制，也**不需要 Chromium 内核**。

**工具**：
- `web_search(query, limit?)` → 返回 `[{ title, url, snippet }]`
- `web_fetch(url, maxChars?)` → 返回清洗后的网页正文文本

**实现要点**：
1. **搜索后端**（选型见 [§10](#10-待决策项) #2）：
   - **查证结论**：`pi-agent-core` / `pi-ai` **无内置 web search 工具**，`openAICompletionsApi` 适配器也不透传各家"模型端搜索"；且模型端搜索发生在供应商服务器，不经过本机主进程，无法做 SSRF 防护、无法写入 `ToolCallRecord` 展示。因此"模型自带搜索"**不能作为 web_search 的唯一实现**，仅当某供应商明确暴露标准 web search 工具时作为可选增强。
   - 主方案：独立搜索 API —— A. DuckDuckGo lite / Instant Answer（免 key，国内可达性一般）；B. Tavily / Brave Search（质量高，需 API key）。
   - 推荐：默认 A 免 key 起步，预留 B 的可配置入口。
2. **抓取**：主进程 `fetch` + HTML→正文清洗（去 `script`/`style`/导航噪声，提取正文，限长），处理超时、重定向、编码。
3. **安全（SSRF 防护，必须）**：
   - 拒绝 `file:`、`data:`、`javascript:` 等非 http(s) 协议
   - 拒绝 `localhost` / `127.0.0.0/8` / `10.0.0.0/8` / `172.16.0.0/12` / `192.168.0.0/16` / `169.254.0.0/16` / `::1`
   - 限制响应体大小与超时
   - （进阶）DNS 重绑定防护
4. **架构整合**：作为首批通过 registry 挂载的工具；复用审批链路（搜索只读低风险，抓取可审批可见）；结果写入 `ToolCallRecord` 并展示。
5. **分阶段**：先做静态 fetch（覆盖绝大多数站点）；仅当页面需要 JS 渲染时，再复用 Electron 自带 Chromium（离屏 `BrowserWindow` 或 puppeteer-core 连接 Electron）作为进阶项，不纳入本期起点。

**涉及文件**：`electron/tools/`（新增）、`electron/harnessRuntime.ts`、`src/config/harness.ts`。

**验收**：
- [ ] Agent 能搜索并抓取网页正文。
- [ ] 抓取 localhost / 内网地址被拒绝。
- [ ] 响应过大 / 超时被拦截且不拖垮主进程。

---

## 6. 阶段三：Agent 能力进阶（P1）

> 目标：从"单 Agent 单轮"走向"能分工、有约束、可沉淀"。

### 6.1 计划 / 待办透出

**任务**：把 Agent 的计划步骤透出为结构化的 `todo` 活动，前端渲染为可勾选/可折叠的任务列表（区别于现有 thinking/answering 三态）。

### 6.2 多 Agent / 子任务

**任务**：基于 `pi-agent-core` 的 subagent 能力，支持把子任务委派给独立 Agent；前端展示并行/嵌套进度。

### 6.3 自定义指令与项目规则

**任务**：
1. 支持 per-project 的 `instructions`（存项目 `.mira/` 或数据库），注入 system prompt。
2. 支持 slash command（`/xxx`）注册与自动补全。

**涉及文件**：`electron/harnessStore.ts`、`electron/prompts/`、前端 composer。

### 6.4 Skill 机制

**现状**：框架已有 `loadSkills`（从 `SKILL.md` 目录加载）+ `formatSkillInvocation`，低层 `Agent` 通过自定义工具/skill 调用。

**任务**：
1. 用 `loadSkills` 加载 skill 目录（`SKILL.md`），接入项目。
2. 提供"skills 目录"配置与 UI 管理。
3. 把 skill 调用接入现有权限/审批链路。**待决策**：与 MCP/工具的边界。

---

## 7. 阶段四：可观测性与成本（P1/P2）

> 目标：让用户看得见消耗、查得到历史，才敢放手让 Agent 跑。

### 7.1 真实用量与成本统计

**任务**：
1. 补全 `harnessRuntime.ts` 中写死的 `cost`（当前全 0）：从上游 usage + 模型单价计算。
2. 新增聚合视图：按 provider / 项目 / 会话统计 token 与金额。

**涉及文件**：`electron/harnessRuntime.ts`、`electron/modelConfigStore.ts`（单价）、新增统计页。

### 7.2 工具调用日志

**任务**：完善 `ToolCallRecord`（参数、返回值摘要、耗时），提供可筛选的日志视图。

### 7.3 运行日志

**任务**：主进程引入结构化日志文件，便于排查 Agent 运行问题。

---

## 8. 阶段五：自动化（P2）

> 目标：让 Agent 无人值守地执行定时/触发任务。

**任务**：
1. 定义自动化任务模型（cron 触发 + 目标会话/项目 + 输入）。
2. 主进程调度执行，复用 `HarnessRuntime`，结果回写会话。
3. 替换 `automations/index.vue` 空占位为真实管理页。

**涉及文件**：`electron/`（调度）、`src/pages/frontend/harness/automations/index.vue`。

---

## 9. 依赖关系

```
阶段一（P0）─── 阶段二.1 工具注册 ── 阶段二.2 MCP
   │                │
   │                ├── 阶段二.4 网络工具（依赖 5.1 注册机制）
   │                └── 阶段三（依赖 4.2 编辑/重跑 与 工具注册）
   │
   ├── 阶段二.3 diff
   │
   阶段四（依赖 7.1 的 usage 上报，可与阶段二同步埋点）
                     │
                     阶段五（依赖阶段一~三的稳定运行时）
```

- **阶段零（架构决策）是所有阶段的共同前置**：先定迁移与否，再排期。
- 阶段一是所有后续工作的地基（先保证数据完整）。
- 阶段二.1 工具注册是 MCP、网络工具、自定义工具、Skill 的前置。
- 阶段四.1 需要上游 usage 数据，可在阶段二同步埋点。

---

## 10. 待决策项

| # | 问题 | 影响 |
| --- | --- | --- |
| 0 | （已定）不迁移 `AgentHarness`（空壳），复用低层 `Agent` + 内置工具/Session，见 §3.5 | 全部阶段排期 |
| 1 | MCP 优先 stdio 还是 SSE（已纳入本期） | 阶段二.2 实现顺序 |
| 2 | 网络搜索后端选型（独立 API：免 key DDG vs Tavily/Brave；模型自带已排除为主方案） | 阶段二.4 搜索质量与成本 |
| 3 | Skill 与 MCP/工具的职责边界 | 阶段三.4 |
| 4 | 成本单价来源（预设 vs 手动配置） | 阶段四.1 |
| 5 | 自动化任务的存储位置与调度框架 | 阶段五 |

---

## 11. 明确不做（本期范围外）

- 评测/基准测试（evals）能力——定位已定为日常使用，非评测型 harness。
- 多用户 / 团队协作、云端同步——保持"个人本地"。
- 与 AI 小说创作模块的功能耦合扩展。
