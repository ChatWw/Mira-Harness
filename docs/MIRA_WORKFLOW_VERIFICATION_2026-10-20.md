# Mira 工作流对照与验真（2026-10-20）

## 对照范围

参考本机 `/Applications/ZCode.app` 的工作流页面、用户提供的七张界面，以及 `/Volumes/VrenDisk/project/ZCode/packages/ui/src/` 的以下实现。沿用 Mira 现有 Electron 运行宿主、主题和权限边界。

| 区域 | ZCode 依据 | Mira 实现 |
| --- | --- | --- |
| 保存列表、全局/项目分组、卡片菜单 | `settings/saved-workflows/SavedWorkflowsSection.tsx`、`SavedWorkflowCard.tsx`、`SavedWorkflowProjectGroup.tsx`、`SavedWorkflowGlobalGroup.tsx` | `MiraWorkflowsView.tsx` |
| 定义、元数据、参数、历史 | `SavedWorkflowDetailView.tsx`、`SavedWorkflowMetaForm.tsx`、`SavedWorkflowArgsTable.tsx` | `MiraWorkflowDefinitionDetail.tsx`、`MiraWorkflowMetaForm.tsx` |
| 启动表单 | `SavedWorkflowLaunchDialog.tsx` | `MiraWorkflowLaunch.tsx` |
| 阶段线、参与者、头像动作 | `components/workflow-timeline/WorkflowAgentPill.tsx`、`WorkflowAgentFace.tsx`、`workflow-face-motion.ts`、`WorkflowTimelineStation.tsx` | `MiraWorkflowTimeline.tsx`、`MiraWorkflowAgentFace.tsx`、`workflow-face-motion.ts` |
| 对话卡片展开/收起 | `WorkflowRunDigest.tsx` | `MiraWorkflowDigest.tsx` |
| 侧边栏阶段状态 | `components/workflow-run-line/TaskWorkflowRunLines.tsx` | `MiraWorkflowActivity.tsx`、`SessionSidebar.tsx` |
| 详情阶段名单及配置 | `app-shell/WorkflowRunPhaseList.tsx`、`WorkflowRunPhasePills.tsx`、`WorkflowRunSettingsFields.tsx` | `MiraWorkflowRunPane.tsx`、`MiraWorkflowRunControls.tsx` |
| 运行和保存确认内容 | `WorkflowPermissionBlock.tsx`、`SaveWorkflowPermissionBlock.tsx` | `MiraWorkflowSourceReview.tsx` |

## 已实现

- 列表卡片独立类名，修复与运行卡片的 CSS 互相覆盖。保存卡片为 132px 高、12px 内边距，网格间距 16px；对话运行卡片本轮按原版改为上 6px、水平 14px、下 8px。
- 定义详情包含说明、使用时机、参数表，可增删参数、选择类型、设置必填和默认值。改动后出现保存/放弃；校验重复名称、无效默认值，保存失败保留草稿。保存沿用版本校验，脚本正文原样保留。脚本使用现有高亮 Worker。
- 补齐运行历史、通过对话创建/修订、提升为全局、移入项目、删除确认。移动禁止覆盖；删除核验版本并保留运行记录。
- 启动窗复用统一浮层选择器，支持模型、项目、布尔/JSON 等参数。启动失败保留输入；弹窗背景透明并保留阴影。
- 卡片显示工作流名称、阶段数和工作中子代理数。收起仅隐藏参与者，阶段线继续读取事件，不中断状态更新。
- 阶段灯区分完成、执行和未开始；真实的派发/排队/执行/修复状态显示旋转标记。子代理采用 ZCode 的九色头像、表情及眨眼/视线动作，支持减少动态效果、页面不可见及离屏暂停，卸载清理计时器。
- 工作流头像在对话卡片与详情名单中使用同一颜色计算，收起名单不再裁切头像。
- 侧边栏通过统一索引读取当前运行的阶段名和迷你阶段灯。对一个会话的多次运行按数据库返回顺序选择最近活跃运行，避免异步快照返回顺序决定显示内容。
- 悬浮胶囊收起显示工作流名称与当前阶段；展开显示运行数量、工作流行和阶段状态，可打开所属运行。纯工作流摘要去掉重复标题。
- 右侧详情以纵向阶段线为主，运行中阶段自动展开，点击子代理直接查看实际对话并可返回。原始节点、阶段事件和诊断合并到默认收起的诊断区；结果、产物、代码、事件记录保留。
- 对话卡片与详情共用实际并发配置/停止命令；配置浮层含步进器、输入校验、取消、应用及错误反馈。
- 运行/保存确认内容补齐名称、作用域、阶段、模型、并发数、元数据和参数表；完整脚本仍可展开。

## 验真结果

### 自动回归

- 工作流、保存存储、请求协议、侧边栏、任务摘要相关 20 个测试文件合计 357 项通过。
- 新增头像动作生命周期测试 2 项通过；最终胶囊文案调整后任务摘要 28 项重新通过。
- 覆盖元数据重复参数、数字默认值解析、保存失败保留草稿、放弃恢复、脚本不变与版本校验、并发请求、非法并发禁用、停止失败、侧栏索引完成清除，以及头像离屏暂停/卸载清理/减少动态效果。
- React TypeScript 检查通过；`npm run harness:build` 通过。构建仍有既有 CSS `::highlight` 压缩器提示。

### 隔离 Electron 实跑

脚本：`scripts/verify-mira-workflows.mjs`。

真实 Electron 加载实际 React/CSS、侧栏和摘要，连接实际 IPC、工作流控制器、定义存储和运行引擎。通过本机 HTTP SSE 模型服务返回 `submit_result`，实际执行子代理任务；命令只运行 `/bin/sleep`。测试权限自动批准仅存在于隔离测试宿主，不修改产品权限规则。

三阶段流程为准备资料 → 子代理检查内容 → 生成报告。18 项断言通过，渲染运行错误为零。包括：参数保存且脚本不变、高亮 Worker、启动模型浮层、真实执行动画、侧边栏阶段、卡片收起保留轨道、运行中并发落库、胶囊展开/收起、打开实际子代理对话、结束回写、删除取消/确认及历史保留。

上一轮报告目录：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-acceptance-U0oafZ`

内含 `report.json` 及以下截图：

- `hub-light.png`、`definition.png`、`definition-edited.png`、`launch.png`
- `running-prepare.png`、`running-check.png`、`running-collapsed.png`
- `run-settings.png`、`capsule-expanded.png`、`capsule-collapsed.png`
- `running-pane.png`、`actor-conversation.png`、`completed-pane.png`、`completed-dark.png`

胶囊在此隔离入口中按普通文档布局定位；生产中的右上角定位仍由原工作台容器负责，因此此截图不代表完整工作台的定位验收。个别截图可能捕获到 Radix 弹层退出动画中间帧。

运行方式：

```sh
MIRA_PLAYWRIGHT_MODULE=/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs node scripts/verify-mira-workflows.mjs
```

## 尚存差异与验证边界

以下内容没有宣称已与 ZCode 全量对齐：

1. ZCode 的工作流模式设置（例如始终开启）没有对应的 Mira 宿主配置协议；此次未添加无效开关。
2. 运行配置当前支持真实调整并发数。运行中切换子代理模型没有宿主命令，尚未实现；启动时可以选择模型。
3. 工作流权限确认仍使用 Mira 的逐次批准/拒绝协议；ZCode 的编号选择、会话内始终允许、反馈修订及确认前编辑模型/并发尚未接入。此轮完善的是确认内容展示，不能视为整个审批交互已还原。
4. 子代理查看沿用 Mira 的资源面板返回模式；尚未实现 ZCode 同时保留多个子代理的标签页。侧栏当前只展示最近活跃运行，尚未实现 ZCode 多运行逐行展示和未读结束状态的确认折叠。
5. RunRecord 没有稳定的开始/结束时间字段，胶囊尚无 ZCode 的运行耗时；本轮没有编造时间。定义面包屑已移到工作流页面左上角，独立于居中表单；完整 Shell 顶栏集成仍需在生产外壳验收。
6. 历史记录以名称/运行目录关联，同名全局与项目工作流的历史归属仍有歧义，尚未扩展持久化标识。
7. 未验完整 Vue/Wujie 外壳中的定位、原生实体输入、用户真实远程模型、复杂并行负载和 Windows 安装包。以上隔离 Electron 结果不替代这些验收。

## 可复现的桌面检查路径

1. 自动化 → 工作流 → 打开已有工作流 → 编辑说明/使用时机/参数 → 保存/放弃 → 切换运行历史。
2. 点击运行 → 选择模型/项目 → 检查类型参数输入 → 启动。
3. 观察左侧阶段状态、对话时间线、胶囊；分别展开/收起，确认阶段继续变化。
4. 配置 → 修改并发 → 应用；从工作流详情点击子代理查看对话，再返回概览。
5. 工作流结束后查看卡片/详情/历史，确认旋转停止、阶段完成且运行结果可读。
6. 删除定义时分别取消和确认；确认后检查历史仍保留。

## 本轮按源码修正的四项差异

- 列表移除搜索、运行视图切换、手动新建以及详情手动脚本编辑入口；保留源码中的通过对话创建、详情运行历史。缺少对话宿主回调时禁用创建，不回退到手动编辑器。
- 参照 `SettingsHeaderBreadcrumb.tsx`，导航独立置于页面左上角；自动化为独立返回按钮，项目和当前工作流分别呈现，仅保留面包屑分隔符，移除返回箭头。生产工作流容器与验真容器均移除包裹整个详情的居中层。
- 参数按 `SavedWorkflowArgsTable.tsx` 的六列网格还原，每行仅一个上分隔线，移除原生表格叠加边框。布尔默认值采用选择菜单，必填开关为 32×18；按钮为“放弃更改 / 保存元数据”，32px 高，分别单层描边和实心主按钮。文本框遵循原版自动高度且不可拖拽。
- 脚本使用单层圆角边框，32px 表头承载文件名和复制按钮；浅色代码正文白底，表头为 surface，暗色正文和高亮使用暗色配色。

本轮工作流交互回归 22 项通过，React 类型检查及构建通过。隔离 Electron 增加入口缺失、导航位置、参数分隔线、浅色代码背景和暗色高亮断言，截图包含未保存参数、保存后、代码明暗主题。完整 Vue/Wujie 外壳仍不在此次隔离验收范围。

本轮最终隔离实跑 23 项断言通过，渲染错误为零。最终报告与明暗截图目录：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-acceptance-v4pmbJ`

## 对话页面工作流卡片修正

源码依据：`v4/workflowTurnDigests.ts`、`v4/ConversationTurnGroup.tsx`、`v4/ConversationWorkflowDigests.tsx`、`components/workflow-timeline/WorkflowRunDigest.tsx`、`WorkflowCardChrome.tsx`、`timeline-summary.ts`、`WorkflowPermissionBlock.tsx`。

- 原因：旧工作台在整个消息时间线后统一渲染全部 run，因此无论哪轮发起，后续对话都会将卡片推到最底部。现在先以原始工具 part 的 toolCallId 关联，再使用工具记录的 messageId / runId 兼容历史记录，卡片渲染在所属轮末尾。直接从列表启动、没有会话锚点的卡放在消息时间线前，不猜测归属最新轮。
- 卡片使用原版 6/14/8 内边距、12px 圆角、弱边框及卡片底色，状态词/名字/右侧计数分开布局，详情改用 Maximize2。整卡空白可点击或 Enter/Space 折叠，子控件操作不误触折叠；收起保留阶段线。运行词复用现有与原版一致的扫光。
- 时间线按 32px 药丸、6px 行距扣除末行多余间距；收起不为“更多参与者”预留空行。横向滚动条采用 2px 样式。完成状态统计子代理总数，运行状态统计实际工作中代理。
- 确认卡片去掉外层重复的工具标题与说明，保留工作流问句、模型、并发、阶段结构、脚本展开和批准/拒绝。模型和并发文本去掉额外色块。

隔离 Electron 已加入真实 `MiraConversationTimeline`；追加后续对话后分别断言运行态、完成态卡片仍属于发起轮。确认卡以真实编译图和源码构造受控请求，截图检查布局；批准流程仍由原有交互回归验证。验真不覆盖完整 Vue/Wujie 外壳和真实远程模型。

本轮截图和 26 项 Electron 断言报告：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-acceptance-sijKkF`

重点截图：`conversation-workflow-order.png`、`conversation-workflow-permission.png`、`conversation-workflow-completed.png`、`running-collapsed.png`、`running-check.png`。该报告生成后又修正了完成态子代理计数文案，最终文案由新增交互回归验证。

最终相关回归合计 87 项通过（工作流交互 24、轮次归属 3、时间线 7、虚拟列表 30、确认卡 3、消息部件 20）；React 类型检查、构建及 `git diff --check` 通过。

## 接续七项工作流展示修正

- 胶囊在没有待确认请求时优先显示当前运行的工作流名称；移除 mini 内重复的阶段标题，展开状态保留运行列表和阶段进度。
- 对照 ZCode `WorkflowTimelineTracks.tsx` 确认原版存在轨道，保留阶段结构；移除 Mira 追加的 SVG 箭头和右侧阶段贯穿线。
- 右侧阶段展开按钮增加左右 6px 内边距，保留既有 hover，标题不再贴边。
- 标签展示映射由 GitBranch 改为 Workflow；智能体独立标签使用 Bot。
- 运行概览、智能体实例、阶段／工作区操作分别拥有独立标签身份。相同节点重复打开复用自身标签，不替换运行概览；标签保存、恢复、关闭重开保留父会话／运行／节点身份。
- 智能体输入复用正常对话的用户气泡与长文本折叠；思考复用 AssistantMessageParts，已配对工具调用复用 ToolRecord。同一调用的多段结果合并且只出现一次；当前页没有结果的调用明确显示“结果尚未读取”，跨页结果保留可见。
- 确认卡、运行卡使用不透明 panel 背景，浅色为白色；深色继续使用现有主题。

验证：10 个相关测试文件共 173 项通过；最终工具结果多段合并补充断言及相关 58 项检查通过，React 类型检查、构建、git diff --check 通过。

隔离 Electron 共 34 项检查通过，实际使用工作流 controller/store/engine、IPC、WorkspaceTabs 与 React/CSS；受控本地模型完成真实子智能体任务，验证概览／智能体／工作区三个同级标签，以及持久化工具结果合并。报告目录：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-acceptance-tBhTL5`

首轮浅色运行卡、胶囊、确认卡与独立标签截图目录：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-acceptance-TwTNq5`

已查看浅色运行／确认／标签截图、第二轮已保存智能体消息和深色概览截图。第二轮 `actor-conversation-saved-light.png` 出现 compositor 滞后，与深色截图重复，排除其浅色验收证据；不将该文件名作为主题通过依据。设计扫描仅提示既有字号和圆角与 DESIGN.md 记录不一致，保留用户指定的 ZCode 样式，不扩展修改范围。

完整 Vue/Wujie 外壳、远程模型、安装包与 Windows 尚未验收。本轮未提交或推送。

## 工作流完成后侧边栏残留 loading

根因：侧边栏 runningSessionIds 来自 HarnessRuntime.listSessions 的聚合 isRunning（主任务或工作流 owner）。工作流 run-settled 更新卡片时 owner 尚未释放；释放后缺少列表失效通知，侧边栏可能保留启动时的 busy 状态。

修复：释放 owner 后发布 session-activity-changed，前端只重新读取宿主的聚合会话状态，不关闭普通对话的运行游标。取消、失败释放路径复用相同通知。刷新前递增该会话运行版本，阻止旧 busy 请求晚返回后重新点亮；主对话仍运行时继续保留真实 loading。

复现测试先红后绿，涵盖完成清理、旧列表返回、同时运行的普通回复。273 项控制器／真实工作流宿主测试、React 类型检查、构建和 diff 检查通过。隔离 Electron 36 项通过，额外验证启动时侧边栏 spinner 可见、宿主释放后自动消失；零 renderer 错误。证据：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-acceptance-GyxDQB`

未对用户当前正在运行的完整桌面实例操作；完整 Vue/Wujie 外壳、远程模型与 Windows 不在本轮验收范围。

## 关系线去重与并行折叠

本轮按用户最新要求优先处理关系线，完成卡片、产物、运行历史及结束后的主对话输出暂缓。

对照 ZCode `timeline-model.ts`、`timeline-bands.ts`、`WorkflowTimelineTracks.tsx`、`timeline-geometry.ts`：

- 先过滤自环、无效端点，同一方向的阶段对只绘制一次；不因不同控制边类型重复占用弧道。
- 并行组按共享分叉／汇合绘制，同轨相邻阶段由轨道连接，跨轨向前边不再额外叠线。并行组的多条外部返回投影为一条组级返回。
- 保留真实跨阶段跳转和回边；短弧先分配低道，互不相交的弧复用高度，同灯端点按 10px 分开。
- 有并行轨道时名称置于独立站台行，避免轨道穿过阶段名称；无外部前驱／汇合的并行组补齐两端，尾端预留完整宽度。
- 只修改展示模型与 SVG／名称定位，原始编译图、交接关系及执行行为不变。

5 个新增回归用例先红后绿；工作流与时间线共 35 项测试通过，最终新增端点间距断言所在的 11 项再次通过。React 类型检查、构建、diff 检查通过；构建保留既有 highlight CSS 和包体积警告。

新增 `scripts/verify-mira-workflow-lines.mjs`，在隔离 Electron 内使用真实 React 与完整主题 CSS 检查顺序、并行、真实跳转、并行返回四组固定编译图，6 项断言通过，无 renderer 错误。已检查浅色／深色截图并完成一次修正确认；最终证据：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-lines-TtPLmT`

这是绘图夹具验证，不是用户当前 `ts-syntax-spec-check` 历史数据的重放，也未操作用户正在运行的桌面实例。

## 完成卡片、结果回传、产物标签和历史（本轮）

本节更新上方早期记录中的完成态、产物、时间和标签能力；早期“尚存差异”不代表这些能力的当前实现。

用户澄清的“跑完下方没有输出”指完成卡片后没有 Mira 总结回复。根因是 `retainUntilSettled` 只对具有 `creatorRunId` 的对话工具启动通知父会话，保存工作流列表启动、重跑和续跑未触发。现在释放 owner 后统一通知运行宿主，由原消息队列生成真实主代理回复；通知内容携带结果、报告和产物记录，保留内部消息标记、去重及失败重试机制。停止运行不会生成成功总结。该修改不包含启动后恢复历史漏发通知的扫描。

对照 ZCode 的 `WorkflowToolSummary`、`WorkflowCompletionCard`、`WorkflowArtifactRow/Tile`、`WorkflowRunSidePaneSections`、`WorkflowRunProvenance`、`WorkflowArtifactSidePane`、`SavedWorkflowRunHistoryPanel`：

- 成功的 `create_workflow` 工具采用紧凑摘要，可打开实例和产物。
- 完成卡片收起运行轨道，展示主产物的 160×100 内容缩略图、名称、说明、文件信息，以及耗时、tokens、子代理和阶段四格统计。保存版本匹配时显示已保存、完成状态和再次运行；重跑使用原参数、模型和精确保存版本。
- 运行详情分为头部状态、可滚动的说明／参数／结果／阶段、底部默认展开的产物区。结束后阶段默认收起，保留真实任务计数与纵向连接线，诊断／来源代码／日志可按需展开。
- 产物在与概览、子代理、操作并列的独立标签打开，按 run/id/version 固定已发布版本；支持 Markdown、文本和位图预览、文本复制及现有原生保存。不读取可变工作区文件冒充历史产物。异步切换版本时，旧请求不能阻止新版本读取或覆盖新内容。
- 运行历史显示实际时间、耗时、tokens、参数、产物入口和查看实例；定义页显示最近产物。时间从 SQLite 事件时间聚合，说明取运行时源码快照，产物取每个 id 的最新已完成版本。缺失时间显示“—”，不编造。
- 图表／指标／看板类预置产物仍展示其数据 spec，未实现 ZCode 的交互看板渲染；不会提供虚假的字节预览和文件保存动作。

验证：10 个相关测试文件 411 项通过；随后产物异步切换回归补充后该文件 9 项通过，累计覆盖 412 项。React 类型检查、React 构建及 diff 检查通过。构建仍有原有 highlight CSS 和包体积提示。

隔离 Electron 使用真实控制器、SQLite、编译器、运行引擎、React/CSS、IPC、受控本地 HTTP 模型和临时工作区；40 项断言通过，无 renderer 错误。验证工作流结束后真实父会话 assistant 总结落库，父回复结束后侧边栏 spinner 清除，产物作为第四个并列标签打开并读取精确版本，以及历史参数和删除后记录保留。截图已检查浅／深色完成卡片、详情、产物标签、运行历史，并完成一轮布局修正确认。最终完整脚本报告：

`/private/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-workflow-acceptance-e5qVCQ`

完整 Vue/Wujie 外壳、用户当前远程供应商、实际旧运行重放、Windows 安装包仍未验收。隔离对话夹具含静态后续对话，真实自动总结以父会话持久化消息断言为证，不将夹具静态文本视为模型输出。本轮未提交或推送，未操作用户正在运行的桌面实例。
