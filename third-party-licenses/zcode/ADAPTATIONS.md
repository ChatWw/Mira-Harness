# ZCode → Mira Harness 改编记录

2026-10-13 08:56 +08:00 任务配置入口：参考当前v3.15.1的packages/ui/src/TaskActionMenuContent.tsx中onOpenProviderConfig／“前往配置”入口，Mira在自有SessionMenuItems增加“模型设置”，沿自身PilotController导航与保存守卫打开现有Vue统一模型页，不复制上游配置文件／RPC或变量，不新建配置系统。现有版权／Apache LICENSE／NOTICE保持；458项和实际Electron19项证据见首屏记录顶部，分享排除，原生ZCode／实体输入／远端复杂负载／Windows未验。

2026-10-13 08:46 +08:00 上游版本核对：当前参考仓库为 aac47556（v3.15.1），LICENSE保持原文，NOTICE.md同步该版本原文；此前副本来自旧版本，并非当前上游逐字相同。声明中的远控、Bot、营销等是上游功能说明，不代表Mira实现或接入这些服务；Mira仍本地优先且排除分享链接。

2026-10-13 08:40 +08:00 侧栏菜单与改名：参考ZCode packages/ui/src/TaskActionMenuContent.tsx、workspace-grouped-tasks/task-context-menu-content.tsx的项目／分组菜单层级，group-item.tsx的组合输入保护；Mira沿既有SessionSidebar／SidebarCollectionSection与任务改名保护实现，使用自身groupedActions、请求身份守卫和原资源动作，不移植上游RPC／store／文件名。文件与变量沿Mira命名，原Apache LICENSE／NOTICE与版权保持。278项及隔离Electron23项／明暗四图见首屏记录顶部；合成IME不代替实体输入，原生ZCode／远端复杂负载／Windows和整体性能未验，分享排除，整体active。

2026-10-13 07:20 +08:00 Composer菜单复核：对照ZCode packages/ui/src/v4/composer/V4ComposerModeControls.tsx、ModelConfigSelect.tsx与WorkspaceSidebar.tsx当前接入，Mira既有Radix权限／独立计划、供应商子菜单和排序入口保持；本批仅补自有HarnessComposer计划标记关闭后的Lexical焦点与禁用保护，不复制新上游实现，不宣称上游已有该焦点行为。命名沿Mira，原Apache LICENSE／NOTICE／版权不变，分享排除。312项及隔离Electron16项／明暗三图证据见首屏记录顶部；原生ZCode／实体IME／远端复杂负载／Windows与完整性能未验，目标active。

2026-10-13 07:09 +08:00 Header动作语义：参考ZCode `packages/ui/src/WorkspaceHeader.tsx`、`WorkspaceHeaderSections/WorkspaceHeaderActionSection.tsx`及`WorkspaceSidePaneToggleButton.tsx`的草稿隐藏编辑器、动作顺序、展开面板不重复开关和PanelRightOpen。Mira沿HarnessWorkbench／hasTaskProgress、自有资源标签／焦点ref实现，显式面板关闭后归还入口焦点，不移植上游RPC／store或窗控；Electron／Vue Shell继续承担原窗控。文件与变量沿Mira名称，原Apache LICENSE／NOTICE／版权保持，分享排除。最终195项及隔离Electron22项／导航23项、明暗3图见首屏记录；原生ZCode／系统IME／远端复杂模型／Windows与完整性能未验，目标active。

2026-10-13 06:56 +08:00 新任务欢迎区：参考ZCode `packages/ui/src/v4/ConversationDraftEmptyState.tsx`的标题自身容器测量、ResizeObserver／帧合并及六时段本地问候边界。Mira以自有MiraDraftWelcome、原HarnessWorkbench／layout.css实现，保留Mira标志／文案与既有28px最大字号（上游30px），不移植上游组件名、store或RPC；应用隐藏清理、回焦刷新和测量裁剪沿Mira实现。原Apache LICENSE／NOTICE／版权保持。相关141项及同产物隔离Electron欢迎14项／导航23项／状态50项证据见首屏记录顶部；分享排除，原生ZCode／远端复杂负载／Windows尚未验，目标active。

2026-10-13 06:36 +08:00 轨迹工具条与正文复制：参考ZCode packages/ui/src/ModelTrajectoryPane.tsx、ModelTrajectoryExpansion.ts、ModelTrajectoryExpansionMenu.tsx、ModelTrajectoryRoleStyles.ts及ModelTrajectoryExpandableMessage.tsx的独立六类／默认展开、直接全部按钮、持续开关菜单、展开正文复制与实际标题／用量摘要。Mira沿自有MiraModelTracePane／miraTraceSections／miraTraceSummary、Radix与本地provider记录实现，使用Mira命名，不移植上游Context／RPC／store；保留参数／用量诊断分类并修自身虚拟列表补偿与搜索定位。原Apache LICENSE／NOTICE／版权不改。76项与最新隔离Electron41项／200调用50项证据见首屏记录顶部；分享排除，原生ZCode／远端／Windows尚未验，目标active。

2026-10-13 06:16 +08:00 轨迹虚拟化与增量输入：参考ZCode packages/ui/src/ModelTrajectoryTimeline.tsx的可见调用挂载、先调用再精确文本搜索、首请求及后续输入增量，以及ModelTrajectoryExpandableMessage.tsx的全局展开与临时搜索展开分离。Mira以自有miraTraceCalls／MiraModelTracePane验证序列前缀并隔离已知agent上下文，原始模型IO存储不修改，增加完整请求上下文查看模式；使用现有TanStack与Radix、不移植上游Context／RPC。文件、变量、section身份沿Mira命名，Apache LICENSE／NOTICE／版权保持。70项及实际Electron35项、合成200调用38项和同产物长历史34项详见首屏记录；分享排除，原生ZCode／远端／Windows和性能上限未验。

2026-10-13 06:01 +08:00 轨迹逐处搜索：参考ZCode packages/ui/src/ModelTrajectorySearch.ts、ModelTrajectorySearchHighlight.ts及ModelTrajectorySearchBar.tsx的非重叠命中、跨空白归一、原文偏移、当前命中与滚动导航。Mira自行实现miraTraceTextMatches及自有section／mark投影，不移植上游Context、CSS Highlight注册或轨迹RPC；标题／正文可查、相同段落逐处定位、Unicode大小写扩展保持原文偏移，关闭不保留延迟搜索高亮。文件／变量沿Mira命名，原Apache LICENSE／NOTICE及版权不变。当前66项及实际Electron35项／3图、同产物长历史34项证据见首屏记录，分享排除，原生ZCode／远端模型／Windows及整体性能上限尚未验。

2026-10-13 05:45 +08:00 模型轨迹与任务日志菜单：参考ZCode packages/ui/src/TaskActionMenuContent.tsx、ModelTrajectoryPane.tsx及services/src/zcode-agent/modelTrajectory.ts的真实model-IO、最近200条、右侧资源、搜索／分类展开与路径菜单。Mira自行实现miraModelTrace／MiraModelTraceStore／MiraModelTracePane、Pi实际payload与终态观察、授权IPC及本地目录，未移植上游CLI runner／RPC／store；文件／变量保持Mira风格，旧记录不补造，原Apache LICENSE／NOTICE.md／版权保持，分享排除。756项及隔离Electron28项／3图见首屏记录，原生ZCode／远端／Windows和总体性能未验。


2026-10-13 模型时间线边界：参考ZCode CLI `zcode-protocol-v4/product-projection.ts`的TurnStarted模型事实及UI `ConversationRowView.tsx`的modelChange轻分隔。Mira以自有HarnessRunModel、SQLite消息元数据、运行事件与miraModelChanges投影记录实际provider/model，首次使用不显示切换，选择未发送不改变历史，同名模型跨供应商仍区分；提示在对应用户输入前，纯续跑在助手段前。未移植上游RPC／reducer／store，不把提示插入模型上下文；字段与函数沿Mira名称，原Apache LICENSE／NOTICE.md及版权保持，分享排除。

2026-10-13 04:51 +08:00 原生PDF／视频附件：参考ZCode `packages/ui/src/lib/chatAttachments.ts`、`ChatMediaAttachmentPreviewDialog.tsx`及CLI `attachment-media-resolver`／`media-capability`／`attachment-pdf`／`attachment-video`／`adapters/model/transform.ts`的原始媒体协议、独立能力与预览状态。Mira以自有miraModelMedia包装Pi onPayload，保留SDK文本／图片与工具流，在原用户所属消息编码file／video_url；自有SQLite冻结存储、队列、历史／压缩、Vue能力开关、MiraBinaryAttachmentPreview与本地PDF阅读器贯通，不移植上游CLI／RPC／store。文件与变量沿Mira风格，原Apache LICENSE／NOTICE.md及版权保持，分享排除。相关回归、隔离macOS Electron15项／4图证据见首屏记录；商业模型、全部codec、原生ZCode、Windows及总体性能未验收。

2026-10-13 04:20 +08:00 整窗缩放：参考ZCode `packages/desktop/src/main/desktopZoom.ts`、`desktopCommandHandlers.ts`、`desktopApplicationMenu.ts`和`desktopWindowChrome.ts`的范围／步长、原生菜单及加载后恢复语义。Mira使用自有miraDesktopZoom、WindowManager、SQLite偏好和Vue安全区，不移植上游设置store／RPC；每次主页面加载读取最新比例，修复重置后刷新沿旧创建值。文件／变量沿Mira命名，原Apache LICENSE／NOTICE.md／版权保持。51项及隔离Electron20项／3图证据见首屏记录，不冒称原生OS快捷键／ZCode或Windows实机通过，分享排除。

2026-10-13 04:03 +08:00 键盘布局回退：参考ZCode `packages/ui/src/lib/keyboardShortcuts.ts` 的字符／物理键双匹配，Mira仅在现有资源／终端快捷键补KeyB／KeyJ，保留自己的平台修饰与所有者保护，不移植上游完整绑定系统。另修自身MiraBottomTerminal尺寸观察器合并重开／收起时的状态同步，PTY／授权沿Mira实现。文件／变量保持Mira名称，原Apache LICENSE／NOTICE.md／版权保持；157项与实际Electron64项证据见首屏记录，不声称原生ZCode或实体键盘布局同态，分享排除。

2026-10-13 03:47 +08:00 平台主快捷键：参考ZCode `lib/keyboardShortcuts.ts`、`shortcuts/bindings.ts`及shared `shortcutCommands.ts`的CmdOrCtrl按平台隔离语义。Mira以自有isMiraPrimaryModifier／miraPrimaryKeyShortcuts复用现有Shell／React所有者，保留明确Ctrl工具／后台命令及编辑器边界，不移植上游可配置绑定store或RPC，文件／变量仍Mira风格。Apache LICENSE／NOTICE.md与版权保持，分享排除；实际证据／平台边界见首屏记录。

2026-10-13 03:32 +08:00 选区一致性：参考ZCode `packages/ui/src/mentions/activePromptInputToken.ts`及历史ChatPromptEditor的Lexical插件，Mira主输入／历史编辑使用自有函数式状态快照，按选区事件顺序保留完整查询／替换范围和退出null；正文／焦点／owner及原子引用保护沿自身实现。不复制上游nodeKey／store／CLI，文件／变量仍为Mira风格；Apache LICENSE／NOTICE.md与版权保持。上游短token跳出同样关闭，原生ZCode同态未验；证据见首屏记录，分享排除。

2026-10-13 03:13 +08:00 Slash技能和历史候选：参考ZCode `packages/ui/src/slashCommandPanelSections.tsx`、`lib/slashApplyMentionPayload.ts`及`SlashCommandPlugin.tsx`，Mira主输入／历史编辑以$展示技能但按自有目录ID取真实名称插入，历史Slash三类／首尾停止／来源错误合并，其他引用空组隐藏。沿Mira文件／变量、授权／canonical payload／Lexical／Radix，不复制上游CLI或目录store；原Apache LICENSE／NOTICE和版权保持。实际验收边界及连续键盘选区待查见首屏记录，分享排除。

2026-10-13 02:52 +08:00 Slash分类和键盘：参考ZCode `packages/ui/src/slashCommandPanelSections.tsx`／`SlashCommandPlugin.tsx`的三类和首尾停止语义，Mira在HarnessComposer合并现有来源目录，保留Mira授权／身份／管理操作及依赖不可用原因。自有nextMiraSuggestionIndex增加非循环模式，仅Slash启用；@与历史编辑循环保持。未复制CLI或上游store，文件／变量沿Mira风格，Apache LICENSE/NOTICE／版权保持，分享排除。

2026-10-13 02:39 +08:00 用户／项目命令Skill依赖：参考ZCode `apps/zcode-cli/packages/contracts/src/commands/index.ts`的声明依赖语义与命令提交契约。Mira沿自有SkillStore、PromptCommandStore、运行时／消息队列及第一方桥实现名称解析、宿主身份冻结／复核、当前运行指令和可恢复错误；不移植上游CLI或Skill工具。当前上游model/allowed-tools仅解析、未沿提交链执行，Mira保留明确不可用。文件／变量采用Mira名称，原Apache LICENSE/NOTICE与版权保持，分享排除。

2026-10-13 01:43 +08:00 上下文分类与中文搜索：参考ZCode `packages/ui/src/mentions/mentionSearch.ts`的可见分类与汉字查询规则，Mira在HarnessComposer沿原候选身份筛除@/#/$已就绪空分类、保留加载/错误/重试；全空提供一条上下文提示，/与+及MCP分类规则保留。prompt-input-triggers使用自有评分与命名，汉字只匹配连续前缀/子串，英文子序列保留；文件候选沿授权宿主检索不二次丢弃。原Apache LICENSE/NOTICE及改编版权保持，分享排除。

2026-10-13 01:22 +08:00 Composer滚动边缘：参考ZCode `packages/ui/src/mentions/components/MentionPanel.tsx`与`scrollMask.ts`的24px上下渐隐，Mira在现有ComposerSuggestionPanel与composer.css中实现自有data属性/样式变量。仅裁切方向渐隐、手动滚动不强制追选中项，键盘选项露出后更新提示，加载/错误空列表与resize也同步；不新增React状态/渲染器或移植上游虚拟列表。文件/变量沿Mira风格，原Apache LICENSE/NOTICE及版权保持。首屏和三块矩阵另做现状核对，分享仍排除。

2026-10-13 01:02 +08:00 原生关闭上下文：参考ZCode `packages/ui/src/lib/closeActiveContext.ts`、App/Root的资源优先事件及`packages/desktop/src/main/desktopApplicationMenu.ts`不使用close role的设计。Mira采用自有closeActiveResource、Vue事件、第一方grant端口与本地草稿保存/资源回收；沿自身文件/变量命名，不复制RPC/账号。保存失败单提示、失效/超时/迟到保护和窗口设置回落已接；280项与隔离Electron原生菜单回调15项通过，未声称原生上游/实体OS快捷键/商业模型/Windows对等。Apache LICENSE/NOTICE与版权保留，分享排除。

2026-10-13 00:38 +08:00 工作台命令与终端收起：参考ZCode共享快捷键表的主题和打开项目，以及底部面板的收起/重开语义。Mira以自有miraWorkbenchShortcut/useMiraWorkbenchShortcuts、Vue主题owner、第一方context和已有Electron目录准入实现；修复自有MiraBottomTerminal动态约束造成的收起占位。沿既有Radix/Lucide/主题及Mira命名，不复制RPC/变量/账号。真实面板回归及隔离Electron19项通过，未声称原生ZCode computer-use、商业模型或Windows对等。Apache LICENSE/NOTICE及改编版权保持，分享排除。

2026-10-13 00:07 +08:00 任务导航：参考ZCode `packages/ui/src/lib/quickPickConversationNavigation.ts`、App.tsx及`packages/shared/src/shortcutCommands.ts`的工作目录内相邻任务和独立历史导航。Mira以自有miraAdjacentTasks/useMiraTaskNavigationShortcut、侧栏排序和第一方导航保存契约实现，文件/变量沿Mira命名，不复制上游query cache/RPC/账号。214项及实际Electron16项/2图通过，不声称原生ZCode computer-use、商业模型或Windows对等。新增改编文件保留Apache版权/SPDX，原LICENSE/NOTICE保持；分享排除。

2026-10-12 23:47 +08:00 完整输出：参考 `packages/ui/src/app-shell/BackgroundBashOutputSidePane.tsx` 的完整文件入口→独立CodeViewer交互。Mira以自有MiraCommandOutputs/MiraCommandOutputFile、canonical任务/run/tool、第一方grant和现有FilePreviewPanel/TanStack虚拟行实现，不复制上游RPC、文件命名或变量。主资源标签与独立侧面owner、脱敏本地日志、失败/停止/正常重启读取、换行/全内容复制已接；沿既有16MiB限制，强制崩溃中途输出未承诺恢复。523项及实际生产Electron32项/3图通过；不声称原生ZCode、商业模型或Windows发布对等。Apache LICENSE/NOTICE及版权保持，账号/分享排除。

2026-10-12 23:07 +08:00 全局前台命令快捷键：对照ZCode `packages/shared/src/shortcutCommands.ts` 的CmdOrCtrl+B侧栏和CLI `contracts/src/tools/bash.ts` 的手动后台说明，Mira自有useMiraCommandShortcut/焦点handler与既有侧栏派发实现上下文优先级，不声称直接移植上游GUI后台快捷键。canonical当前run/root bash、主/侧焦点、草稿、终端/编辑器行为、禁自动化和失败反馈沿Mira权限/桥；不复制上游RPC/变量/账号。148项及最终真实Electron21项通过，不声称原生/商业模型/Windows发布对等。原Apache LICENSE/NOTICE与版权保持，分享排除。

2026-10-12 22:50 +08:00 后台结果回报与归属：参考ZCode `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts`、`runtime-command-queue.ts` 和 `tool/handlers/bash.ts` 的内部结果批次、模型续接及idle任务限制。Mira以自己的HarnessMessageQueue、canonical任务/run/tool、内部消息JSON元数据和stopOwned registry实现，不复制上游RPC/变量/运行器；待发通知仅内存，已消费身份持久化。自动化保持前台；actor/子任务结束回收自身命令。沿既有execute-group/explore改编组件修复真实job终态和长摘要收缩，保留完整title。最终UI82项和实际Electron15项/5图通过，不声称原生/商业模型/Windows发布对等。原Apache LICENSE/NOTICE及版权保持，不复制账号/云端分享。

2026-10-12 22:09 +08:00 后台命令：参考ZCode `apps/zcode-cli/packages/core/src/tool/handlers/bash-background-policy.ts`、`bash-background-lifecycle.ts`、`apps/zcode-cli/packages/adapters/src/exec/node-execution-adapter-lifecycle.ts` 的同执行转后台/取消/独立生命周期，以及既有BackgroundBashOutputSidePane与ConversationStatusPanel。Mira以MiraCommandJobs/MiraCommandJob、canonical任务/run/tool、Pi Bash、第一方桥和SQLite独立实现，保持自身秒数timeout、审批、插件Shell与输出脱敏预算；不复制上游变量、RPC或执行器。命令资源/Composer计数/胶囊与过程反映实际job，正常退出回收、重启失去控制不重跑。当前689项与实际Electron23项通过；通知轮次、全量输出访问及actor/自动化/子任务生命周期仍待完成，不声称原生/商业供应商/Windows发布对等。原Apache LICENSE/NOTICE及版权保留，不复制账号/云端分享。

2026-10-12 21:10 +08:00 命令输出侧面板：参考 `packages/ui/src/app-shell/BackgroundBashOutputSidePane.tsx` 与 `v4/ConversationStatusPanel.tsx` 的输出导航、滚动跟随及暂停/恢复。Mira以MiraCommandPane/MiraCommandOutput与自有workspace-state命名复用Radix/Lucide、canonical任务/run/tool快照和第一方宿主，不复制RPC或上游变量。当前实现真实前台bash的有界输出资源，未移植后台进程生命周期或完整输出文件。实际Electron22项/7次受控SSE/5图通过，不声称原生上游、商业授权、后台运行或发布对等。原Apache LICENSE/NOTICE与版权保留，不复制账号/分享。

2026-10-12 20:39 +08:00 工作过程可见性：参考 `packages/ui/src/v4/conversationTurnRenderUnits.ts` 与 `ConversationTurnGroup.tsx` 的当前/异常/无最终回复默认展开，MiraAssistantProcess沿自身canonical消息与Radix组件实现，不照搬变量/RPC。停止保稿、历史焦点与摘要runId归属沿Mira状态和宿主契约；明暗实际生产Electron87项/19次受控SSE验证，不声称原生上游、商业授权或性能/发布对等。原LICENSE/NOTICE与版权说明保持，不复制账号/分享。

2026-10-12 20:22 +08:00 工作台首屏提示与资源标签：参考 `packages/ui/src/WorkspaceSidebar.tsx`、`app-shell/SidePaneTabTrigger.tsx` 的拖拽释放点击保护、`SidePaneTabTitleTooltip.tsx` 的1500ms提示及拖拽关闭，以及 `AnimatedSidePanePanel.tsx` 的320px纵向空态入口。Mira使用现有SessionSidebar/WorkspaceTabs命名、Radix组件、自有资源状态和授权接口；删除宽面板卡片网格并隔离旧字号覆盖。实际明暗生产Electron37项验证，不声称原生上游或商业供应商对等；不复制账号/分享。原LICENSE/NOTICE与既有版权说明保持。

2026-10-12 19:55 +08:00 历史编辑文件联动：参考 `v4/ConversationRowView.tsx` 普通preserve/文件时钟rewind，以及 `ConversationFileRewindDialog.tsx` 的editConflict/ConversationOnly；Mira复用自身Radix弹窗、第一方授权桥和SQLite日志，实现MiraHistoryEditWorkspace/Blocked契约、文件恢复/历史截断同提交与失败补偿。净变化的unchanged字节判定由Mira私有快照派生，保留历史记录和空文件变更。实际生产Electron65项/12次本机受控SSE通过，不冒称原生上游、断电、商业模型或Windows对等。不复制RPC/账号/云端分享，文件/变量沿Mira命名，原LICENSE/NOTICE与改编版权保持。

2026-10-12 19:28 +08:00 独立文件恢复：沿ZCode文件恢复对话和workspace rewind语义，Mira使用自有授权token/SQLite日志/逐项游标/文件替换与失败补偿，退休快照并更新任务净变化；不复制RPC/账号/分享。实际Electron47项包含显式注入中断夹具，不宣称原生ZCode或断电/Windows对等。历史编辑preserve/rewind联动仍待接。原LICENSE/NOTICE与Mira命名/版权保持。

2026-10-12 逐轮快照与只读恢复预览：参考CLI `runtime/methods/file-rewind.ts`、`rewind-message.ts`、contracts/rewind及 `packages/ui/src/v4/ConversationFileRewindDialog.tsx` 的checkpoint边界、安全/冲突/忽略列表与只读预览。Mira采用自身命名 `miraFileRewind`、`MiraFileRewindPreview` 与自有SQLite/第一方授权协议；真实工具执行前后快照、消息祖先链、UTF-8字节与路径边界由Mira实现，复用现有Radix/Lucide/主题，不复制RPC、账户或云端分享。此次只接只读预览，没有移植实际apply/恢复日志/编辑冲突选择，不据此声称完整rewind对等。文件/变量采用Mira命名，改编组件/服务/类型保留原版权与Apache-2.0说明，原LICENSE/NOTICE保持。

2026-10-12 历史编辑候选与附件：参考 `packages/ui/src/v4/ConversationRowView.tsx:985–1028` 的完整编辑附件列表/显式删空、`prompt-editor/ChatPromptEditor.tsx` 的候选和附件交互。Mira自有 `MiraHistoryPromptEditor` 复用已有Lexical/Radix、授权目录、附件暂存/导入与IPC；新增@、/、#/$提示插入、附件增删/粘贴/拖入、拒绝保稿和原生Escape事件消费。保留Mira旧接口不传附件时的兼容语义，保留原历史冻结字节，宿主验证累计限额和编辑后图片能力，不移植上游RPC、账号/分享或项目文件rewind。实际隔离Electron验收25项，不声称完整原生ZCode对等。文件/变量采用Mira命名，原Apache LICENSE/NOTICE与既有版权说明保持。

2026-10-12 用户引用与历史编辑：参考 `packages/ui/src/v4/ConversationUserInputContent.tsx` 与 `v4/ConversationRowView.tsx` 的引用chip、正文前上下文卡和rich editor。Mira自有 `miraUserPrompt` 共用既有canonical解析，复用自有Lexical/Radix与原宿主重跑；上下文移除/失败保稿/查找可见标签，不移植上游projection/RPC、账户、云端分享或文件回滚。原附件只读保留，新增候选/附件删改仍待对齐。文件/变量采用Mira命名，原Apache LICENSE/NOTICE与既有改编版权说明保持。

2026-10-12 长用户消息阅读：参考 `packages/ui/src/v4/ConversationUserInputBody.tsx` 的120px折叠、渐隐、展开/收起和异步尺寸测量。Mira使用自有 `MiraUserMessageBody`，完整原文保留用于复制、编辑和查找；按会话/消息隔离展示状态，查找先展开真实正文再定位，隐藏窗格不覆盖可用尺寸。组件/变量使用Mira命名，改编组件保留版权与Apache-2.0说明，原LICENSE/NOTICE保持；不引入上游会话分享。

2026-10-12 首屏帮助与键盘：参考 `WorkspaceHelpMenuButton.tsx` 的帮助入口、`ConversationStatusPanel.tsx` 的1280px摘要布局以及 `SlashCommandPlugin.tsx` 未命中候选时归还按键的行为。Mira使用自有 `MiraWorkbenchHelp`、已有Radix/草稿保存/授权桥/Vue设置；空候选发送、Shift+Enter、可自定义compress归属及目录失败保稿沿Mira实际协议，不移植上游账户或CLI。新任务渐隐构图参考 `ConversationDraftEmptyState.tsx`，线框由Mira自有M标志派生，不复制ZCode标识。文件/变量采用Mira命名，原Apache LICENSE/NOTICE保持。

2026-10-12 连续输出性能：本轮保存优化是Mira自有SQLite/JSON实现，不复制ZCode存储代码；仅当前助手行增量写入并保留完整恢复快照，原UI改编文件、Mira命名、上游Apache LICENSE/NOTICE均保持。最终生产Electron重验109项通过，原计划/旁路交互无变化；不据本机受控基线声明与上游商业性能完全对等。

2026-10-12 历史方案目录：参考 `packages/ui/src/v4/conversationStatusPanelModel.ts` 的 settled 工具目录、`v4/ConversationStatusPanel.tsx` 的 SessionPlansStatusSection，以及 `app-shell/PlanDetailSidePane.tsx` / `lib/planToolCall.ts` 的独立Markdown详情。Mira自有 `miraSessionPlans.ts`、`MiraPlanDetail.tsx` 和 `planToolId` 标签身份，直接派生既有真实present_plan公开输入，不移植RPC/lease/projection全套或另造重复历史库。摘要短标题与审批/详情Markdown复用同一格式化函数，旧缺失/截断输入明确不完整。侧面任务焦点/导航、任务隔离及持久化沿Mira原协议；原Apache LICENSE/NOTICE保持，文件/变量使用Mira命名。

2026-10-12 模型错误恢复：参考 `packages/ui/src/ChatErrorBanner.tsx` 的简短摘要、独立Radix详情、复制及模型设置交互。Mira自有 `MiraModelErrorBanner.tsx`、`miraModelErrors.ts` 与宿主/控制器适配，使用已有Vue设置路由和草稿保存守卫，实际stream错误来源识别、脱敏及8KiB诊断上限，不按文本猜测模型配置缺失。保留任务/run/message身份和历史恢复，不移植ZCode付费升级、账户、反馈服务或RPC。文件/变量采用Mira命名，新增组件含来源说明，原Apache LICENSE/NOTICE保持。

2026-10-12 连续运行呈现：继续参考 `packages/ui/src/v4/ConversationTurnGroup.tsx` 的TurnChatLoadingSlot及AssistantHistoryStatus。Mira既有 `MiraAssistantProcess` 使用自有run.startedAt/durationMs，轻量首token/文本流状态、运行工作行耗时、审批无spinner和终态timer回收，主/旁路共用；不复制上游API重试projection或捏造重试次数。已有来源/版权及Apache LICENSE/NOTICE保持，Mira文件和变量命名不变。

2026-10-12 任务净贡献：参考 `packages/ui/src/TaskListItem.tsx`、`packages/ui/src/lib/taskChangeSummary.ts` 与 `packages/shared/src/lineChangeStat.ts`。Mira在 `src/config/miraTaskChanges.ts` 和 `electron/services/miraTaskChanges.ts` 保留来源/Apache说明，采用任务首次修改前与最后修改后语义和有界LCS；自有SQLite私有基线、现有工具/取消及跨项目身份、脱敏紧凑patch、侧栏/摘要/面板接入。原文不经公开桥传输，缺少快照不假定完整；不移植上游RPC/账户/持久化接口，不把Git总变化当单任务贡献。Mira名称及原Apache LICENSE/NOTICE保持。

2026-10-12 旁路首条消息：参考 `packages/ui/src/v4/slashCommands.ts` 的带问题旁路解析，以及 `v4/SessionPane.tsx` 的 `handleOpenSelectionSideConversationWithPrompt`、权威命令覆盖与send-time分派。Mira在既有HarnessComposer/Workbench中适配非空纯文本 `/side`、`/btw`，菜单裸别名只开空旁路；保留自定义同名命令优先、无能力/附件/结构化上下文普通提交。Mira自身的 `HarnessSideConversationInput`、第一方授权桥和canonical消息队列持久化唯一提交身份、输入指纹及错误重试，失败/未确定接纳不丢稿、导航后不抢新主任务；不复制上游RPC、账户或CLI。新增文件/变量使用Mira命名，原版权与Apache LICENSE/NOTICE保持。首屏变更数字后续按ZCode任务首末文件快照语义接入，不把项目Git工作树总变化当作单任务贡献。

2026-10-12 首屏核心交互：参考当前 `packages/ui/src/workspace-grouped-tasks/view.ts`、`task-row.tsx` 与 `TaskInteractionBadge.tsx`，Mira组内置顶保留所属分组、标题显示实际目录提示、真实等待状态使用已有语义token。参考 `packages/ui/src/v4/SessionPane.tsx` 原生 `/plan` 分派与 `prompt-editor/ChatPromptActionMenu.tsx` 工作流首层入口，Mira仅消费本地命令前缀并保留显式发送/保稿和Goal互斥。参考 `packages/ui/src/v4/ConversationStatusPanel.tsx` 的WorkflowStatusSection及mini状态，Mira新增 `useMiraWorkflowRuns` 为timeline/常驻摘要共享一份owner列表，复用已有运行详情与宿主协议，不复制上游RPC/服务端或伪造运行。文件/变量使用Mira命名，原Apache LICENSE/NOTICE不变。

2026-10-12 PPTX 元素引用：参考 `packages/ui/src/components/ui/pptx-preview-viewer.tsx`、`pptx-selection-action-bar.tsx`、`packages/ui/src/lib/pptxElementReference.ts` 和 `packages/ui/src/v4/composer/PptxElementReferenceChip.tsx`。Mira 使用 `MiraPresentationReader`、`MiraPresentationContexts` 与 `mira-presentation-reference.ts`，保留真实元素索引、表格单元优先命中、原生文字划选、悬浮 AI 编辑意见、逐元素引用和原页导航；取消不退出选择，失败保留意见，加入引用不自动发送。宿主契约、所属任务/工作目录身份、源文件 SHA-256、排队与执行前复核由 Mira 自行实现，沿既有草稿/队列/历史保存，不复制上游 RPC、账户或任意路径访问。反向导航只定位原幻灯片，不按旧坐标伪造高亮；源变化提示重新引用。文件和变量采用 Mira 命名，改编文件保留原版权与 Apache-2.0 标记，原 LICENSE/NOTICE 不变。该记录不声明已完成 PPTX 编辑结果保真、模型 Office 附件或 PDF 导出。

2026-10-12 已安装市场插件管理：参考 `packages/ui/src/settings/PluginStoreCard.tsx` 的卡片/详情共用启停及移除菜单，以及 `pluginEnabledChange.ts` 的宿主确认成功后再更新原则。Mira 新增自身命名的 `MiraPluginMenu`，使用现有 Radix 菜单与工作台主题，公开市场卡片/详情调用既有授权桥启停或移除登记；移除明确保留已下载文件。操作错误与目录加载错误分别展示，重试保留原操作身份，不用目录刷新冒充再次安装；目录重试只使该次读取刷新，后续返回仍可走缓存。Mira 不移植账户、付费、自动更新或上游卸载文件语义；原 Apache LICENSE/NOTICE 保持。

2026-10-12 MCP 浏览器授权与 Agent 服务范围：参考 CLI `packages/adapters/src/mcp/oauth-interactive.ts`、`oauth-credentials.ts`、`auth/localhost-callback.ts` 的 SDK 授权、PKCE、正确 state 回调和 canonical client/token pair，以及 `packages/core/src/subagent/profile-frontmatter.ts`、`borrowed-mcp-port.ts`、`runtime/methods/subagent.ts` 的父连接快照与服务名称限制。Mira 使用 `MiraMcpAuthorization`、`MiraMcpCredentialStore`、现有 MCP 管理器与 Vue 设置：URL 留在宿主、显式打开浏览器、凭据由 Electron safeStorage 加密、配置换代及退出关闭回调；项目授权探测独立于任务连接。用户/插件 Agent 的 `mcpServers` 使用父任务启动时选中且连接成功的真实快照，零工具服务保留；精确名称匹配、重名拒绝、tools/disallowedTools 与角色权限取交集，子任务仅借用连接。文件和变量采用 Mira 名称；未移植 ZCode 多进程共享 credential lease、RPC/账户、插件 OAuth 配置或预注册客户端，不宣称这些扩展已完成。原 Apache LICENSE/NOTICE 保持。

2026-10-12 工作流轨道与智能体记录：参考 `packages/ui/src/components/workflow-timeline/` 的 `WorkflowTimeline`、`WorkflowTimelineStation`、`WorkflowAgentPill`、`timeline-model`、`timeline-bands`、`timeline-geometry`，以及 `app-shell/WorkflowRunPhaseList.tsx` 与 `WorkflowActorSessionSidePane`。Mira 使用 `MiraWorkflowTimeline` 和自身模型/主题：审批与会话卡横向阶段轨道，运行侧面竖向脊线、折叠阶段和并行缩进，循环显示真实轮次；操作展开读取实际参数、结果与进展，仅精确匹配的 actor 提供对话入口。编译图首次冻结在绑定源码 hash 的独立 SQLite 表，重载读取批准时的图，不重编译伪造旧结构；旧记录缺图明确回退。智能体对话经所属父会话/run/site/ordinal 验证，从实际持久化 Pi 消息有界分页读取，支持思考与工具记录、刷新、错误重试和返回焦点，不伪装逐 token 流或可交互子对话。文件/内部变量采用 Mira 命名，原版权和 Apache LICENSE/NOTICE 保留；不移植上游 RPC 或账户。

2026-10-12 工作流智能体能力：参考 `workflow-actor-tools.ts`、`workflow-facade.ts`、`workflow-driver.ts` 及 runtime-tools 的子执行体/Hook 边界。Mira 通过自身 HarnessRuntime 给工作流持有独立的选中项目/插件 MCP 连接，父普通回复结束不释放后台连接；沿既有工具审批、项目锁、声明版本与来源信任复核。各 actor 独立 Hook 生命周期，单 ask 取消传至真实 Hook，恢复上下文使用 SessionStart resume，资源等待所有 actor 收尾后关闭。工具调用记录按 actor 与模型响应区分，供应商重复调用 ID 不覆盖历史。保留 typed submit 的既有结算规则与 Hook 诊断继续语义，不添加上游未提供的 persona 权限/模型配置。提供版本的 ZCode 未完整继承项目 Hook admission；Mira 项目 Hook 使用自己已有的可信策略，不宣称此部分逐字移植。原 Apache LICENSE/NOTICE 保持。

2026-10-12 工作流创作与运行审阅：参考 ZCode builtin-workflow-command、dynamic-workflows 技能、CreateWorkflow/SaveWorkflow handlers、workflow-analysis-display 及 WorkflowPermissionBlock。Mira 使用自身 `/workflow` 指令、按需读取的真实编译器 facade、主会话 host-only 提交与独立保存授权；同一次 Worker 编译生成源码 hash、阶段/参与者/交接投影及执行体，成功后人工审阅，full/Hook allow 不绕过，Hook deny 仍生效。后台执行不替换父会话或普通 run，完成结果进入原会话串行队列；恢复固定原模型和源/参数。自写工具、文件和组件保持 Mira 命名，不复制 ZCode RPC、账户或 CLI。原 Apache LICENSE/NOTICE 保持。

2026-10-12 工作流发布产物增量：参考 `packages/ui/src/app-shell/workflow-artifacts/WorkflowArtifactBody.tsx`、`WorkflowArtifactCards.tsx` 与宿主 immutable publication receipt。Mira 自有 `miraFlowArtifactReader.ts` / `miraFlowArtifactSave.ts` / `MiraWorkflowArtifactPreview.tsx` 使用所属会话、运行、产物 ID 和版本从实际 journal 解析已发布副本；验证 receipt、元数据与 payload SHA-256、大小和文件身份，不读取后续变化的工作区源文件，不允许 renderer 输入路径或 URI。文本、Markdown 与受限位图可预览；HTML/SVG 仅源码、Markdown 不继承远程图像/链接，不加载 iframe；其他文件通过宿主原生保存对话框导出。预置看板没有伪文件下载。授权在异步读取、保存选择与提交前复核；不移植 ZCode RPC、账户或可执行 HTML。原 Apache LICENSE/NOTICE 保持。

2026-10-12 工作流桌面接线：Mira 自有 `miraFlowController.ts`、`miraFlowCommands.ts`、IPC/preload/第一方授权桥将上述运行器接入真实 HarnessRuntime、配置模型、既有工具审批与项目读写锁；普通 Stop、会话互斥及退出等待覆盖工作流。actor model pin 保留原模型/推理档位，命令以审批后的 argv 执行并清理取消时的进程树；供应商错误在写入 actor/journal 前脱敏。资源经桌面预构建及 `extraResources` 分发；不移植上游 CLI/RPC 或账户。下方 05:42“尚未接线”仅说明该历史批次，当前已有真实 Electron 工作流 UI 与执行链。原 Apache LICENSE/NOTICE 逐字保留。

2026-10-12 工作流工作台：参考 ZCode `packages/ui/src/settings/saved-workflows/AutomationsPageTitleSwitch.tsx`、`SavedWorkflowsSection.tsx`、`SavedWorkflowCard.tsx`、`useSavedWorkflowLauncher.ts`、`SavedWorkflowMetaForm.tsx`、`SavedWorkflowArgsTable.tsx` 以及 `packages/ui/src/app-shell/WorkflowRunSidePane.tsx`、`workflowRunPanel.ts`。Mira 在 React `components/workflows/` 实现作用域分组、编辑/权威编译检查、参数与模型启动、运行历史、会话摘要和真实 journal 详情；侧栏沿既有自动化入口、工作区资源标签与 Mira 主题，文件/变量使用 Mira 名称。启动失败保留表单，宿主接受后才切会话，已接受但导航失败只重试打开；停止、原样续跑与并发设置使用 Mira 授权桥。续跑使用父会话记录的原模型/推理档位，不接受替换脚本或实参。节点/用量/报告/产物来源于实际 journal，不用进入下一阶段推算前阶段完成，不提供缺少字节读取接口的下载按钮；事件只刷新当前会话摘要或选中实例，不轮询全部工作流。未移植 ZCode RPC、账户、灰度、遥测或服务端；原 Apache LICENSE/NOTICE 保持。

2026-10-12 动态工作流基础：独立编译/分析/schema/lowering/engine 与子进程/VM/NDJSON runtime 改编为 `packages/mira-flow-kit`、`packages/mira-flow-runtime`。文件名统一 `mira-`，工作流公开类型及运行入口使用 MiraFlow 名称，运行目录改为 `.mira`；模型脚本 facade 和 wire 数据保持协议语义。逐文件上游路径与 SHA-256 见 `flow-sources.json`，每文件新增原作者 Apache-2.0 与改编说明。标准库由 `scripts/generate-mira-flow-libs.mjs` 在构建时从实际 TypeScript 版本生成，保留声明内原许可。05:42 新增真实 Pi Agent 持续 actor、SQLite journal/上下文、host-only 运行服务与文件/Git/产物端口的联合实现；实际 HarnessRuntime/生产模型工具、授权桥、工作流 UI/IPC 与发布资源仍未接入。原 LICENSE/NOTICE 不变。

actor/世界/产物参考 `bootstrap/src/app/workflow-driver.ts`、`workflow-driver-submit-bridge.ts`、`workflow-driver-transcript.ts`、`workflow-world-read.ts` 与 `workflow-artifact-publish.ts`。Mira 使用自有 Pi Agent、宿主注入端口、SQLite 转录及 model pin、真实 submit_result 与 FIFO 收尾；world 使用真实 fs/rg/Git，命令由显式审批与 argv port 执行；产物为独立 SHA-256 不可变存储。运行服务冻结作者源与参数、验证原样续跑身份、隔离观察者异常并补偿未结算宿主失败；不移植上游账号、供应商/工具配置或 CLI/RPC。公开脚本协议保持，文件/变量采用 Mira 命名，每个参考文件保留原作者标记。

Mira 后续适配：分析器提供共享 Program 入口，使图/schema/lowering 由同一源码编译；独立 Worker 绑定源码 SHA、取消/迟到与内存/墙钟边界。运行子进程只接 OS 启动路径及 Electron Node 模式，不继承宿主模型密钥/Node 注入项；VM 为受控运行环境，不声称 OS 隔离或可安全执行任意恶意脚本。定义存储/参数词汇参考上游 `core/src/tool/handlers/saved-workflows/{frontmatter.ts,args.ts,store.ts}` 及 `contracts/src/tools/saved-workflow.ts`，新文件采用 Mira 命名/注释标记、宿主注入目录、精确正文、版本冲突与符号链接检查，保存不赋予执行授权。TypeScript 原许可与第三方声明另保存在 `third-party-licenses/typescript`。

SQLite journal 参考 `adapters/src/storage/session-store/repositories/dwf-journal.ts`、`dynamic-workflow/src/engine/journal-memory.ts` 与 `bootstrap/src/app/dynamic-workflow-run-reconcile.ts`：Mira 四张独立表、原子终态/产物、用量/并发窄写、事件游标分页；启动仅回收 run，不将可重派发的 running 节点伪改 failed。运行层修正预取消仍写入/启动的问题，并将 child/pipe 错误监听置于取消处理之前；停止原因沿原协议保留。

2026-10-12 目标逐轮待办：参考 ZCode `conversationGoalSummaryModel.ts` 与 `ConversationStatusPanel.tsx` 的逐轮权威待办及完成数量。Mira 在既有 GoalStore、父任务活动和 React 摘要中记录/投影实际每轮计划，不由工具数量或核验通过推算待办，不重建缺失历史；待办全部完成仍独立等待目标核验。运行、轮次与目标身份隔离，重启保持历史并停止遗留运行项。长下一行动与停止理由在摘要截断，完整证据保留在目标详情。使用 Mira 文件/变量与存储协议，未移植上游 RPC、CLI 或命名，原 Apache LICENSE/NOTICE 保持。

2026-10-12 首发选择与目标进展：参考 ZCode 项目范围 MCP 目录及启用的 ConversationStatusPanel/conversationGoalSummaryModel。Mira 匿名项目草稿可在首条消息前读取项目服务元数据并预选，不提前创建会话或连接；换项目移除旧项目选择，保留全局服务与输入。Goal 摘要从已有权威核验历史提取实际轮次行动和状态，按轮次去重，暂停/预算沿真实目标状态；缺历史不重建执行日志，不虚构完成率或未来轮次。使用 Mira 自有授权、草稿和命名，不改变原运行语义；原 Apache LICENSE/NOTICE 保持。

2026-10-12 项目 MCP：参考 ZCode 用户/工作区 MCP 配置范围及现有设置、服务选择交互。Mira 在 Vue 设置中管理已登记项目的 `.mira/mcp.json`，通过自有 projectId 授权桥解析目录，使用独立项目服务身份；公开 React 目录只提供名称、来源、类型和连接状态。任务仅连接显式选中的项目服务，stdio 工作目录由宿主固定，父任务持有连接、子任务借用，结束与取消回收。审批后复核项目配置及当前选择，修改、停用、删除与跨项目声明拒绝执行；读取不创建目录，损坏配置或符号链接拒绝覆盖。沿用成熟 MCP SDK 与 Mira 自有存储/运行时，不移植上游运行时或命名；OAuth 与 profile `mcpServers` 仍不在本批范围。原 Apache LICENSE/NOTICE 保持。

2026-10-12 全局 MCP 执行身份：将既有插件 MCP 的稳定 serverId/原工具名命名空间生成集中到 Mira `electron/adapters/mcpManager.ts`，插件包装不再二次命名，原插件执行名称保持。全局与插件工具均保留原名/服务元数据，远端调用仍使用原始工具名，模型描述补服务来源；解决同名跨服务和内置 read/bash 的注册/审批/实际调用错配。沿用上方子任务、记录与权限实现，不复制新的上游运行时；原 Apache LICENSE/NOTICE 保持。

2026-10-12 子智能体 MCP：参考 ZCode `apps/zcode-cli/packages/core/src/subagent/borrowed-mcp-port.ts`、`tool-policy.ts` 及 `runtime/methods/subagent.ts` 的父启动快照借用、连接生命周期归父、MCP 工具选择/禁用规则。Mira 在既有 `harnessSubtaskCoordinator`/`subtaskRuntime`/`harnessRuntime` 中借用同一父任务选中描述符和插件连接，子任务停止不关闭父连接，父任务结束回收；复用自有工具记录/审批和子任务 abort signal，执行前重新校验服务选择及插件内容。新增 Mira 工具规则 helper、Markdown 解析和 Vue 表单选项，不复制上游命名或运行时。Mira 已有 tester/implementer 可变更角色可用所选 MCP，explorer/reviewer 仍保留本地只读能力上限，声明只能缩减有效工具。高级 mcpServers/profile 服务字段和子智能体 Hook 全覆盖不在本批实现范围。原 Apache LICENSE/NOTICE 保持。

2026-10-12 目标模式：参考 ZCode `packages/ui/src/v4/conversationGoalSummaryModel.ts`、`packages/ui/src/ToolCallBlocks/renderers/goal.tsx`、`apps/zcode-cli/packages/cli/src/command-center/handlers/goal.ts` 和 `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/goal-compact.ts` 的会话目标、目标摘要、暂停/恢复及逐轮完成核验交互。Mira 使用自有 `miraGoals.ts`、SQLite `harnessGoalStore.ts`、现有 Agent/权限/消息队列、第一方授权桥，以及 React `MiraGoalSummary`/`MiraGoalVerification`，保留 Mira 文件、变量及事件命名。完成核验独立、无工具，使用宿主记录的脱敏证据；未满足且有下一行动才续跑，异常暂停。累计 provider 实报的父/子任务、核验及压缩使用量，可选预算是请求边界，不声称计费或硬上限。重启回收暂停、版本和目标身份门禁、逐轮核验历史、摘要与正文避免遮挡均为 Mira 独立适配；没有移植上游 CLI、账户、服务端或遥测。原 Apache LICENSE/NOTICE 保持。

2026-10-12 插件 MCP：参考 ZCode `apps/zcode-cli/packages/adapters/src/plugins/mcp.ts` 的默认 `.mcp.json`、manifest 声明合并、服务隔离与变量解析，以及现有插件清单和 MCP 选择交互。Mira 使用自有 `miraPluginMcp.ts`、`harnessPluginMcp.ts` 与第一方会话目录协议；公开清单只提供身份、类型和不可用原因，不公开启动参数或凭证。父任务按会话选择，在当前项目目录建立独立 SDK 连接，工具使用 Mira 命名空间并接入已有审批、结果记录与停止回收，执行前重新校验插件修订和启用状态。没有移植 ZCode CLI、账户或运行时；子智能体插件 MCP、OAuth/auth、timeoutMs、user_config 及插件 data/session/skill 上下文变量仍未支持，并明确显示不可用。冻结目录失效后需要新建会话重新选择，不将重新打开旧会话描述为恢复办法。Apache LICENSE/NOTICE 保持。

2026-10-12 Hooks：参考 ZCode `packages/shared/src/hooks.ts`、`packages/ui/src/settings/HookForm.tsx`、`HooksList.tsx`、`HooksSection.tsx` 及 CLI `hooks/output.ts`、`runtime/methods/hooks.ts` 的七事件、配置表单、匹配、输入输出和有限续写语义。Mira 使用 Vue/Element 设置、独立文件存储和宿主主 Frame IPC；本地真实进程按 JSON stdin 执行，支持命令/进程、超时、取消、异步回收与公开记录脱敏。项目声明需要当前修订信任，工具参数修改经 Mira schema 与危险命令门禁重新校验，Stop 最多续写三次。Mira 自有存储、运行时和名称，不移植 ZCode CLI、服务端、账户或遥测；权限规则动态更新暂未支持，明确拒绝而不伪装已应用。原 Apache LICENSE/NOTICE 保持。

2026-10-12 远程 MCP：参考 ZCode `packages/ui/src/settings/McpServerForm.tsx`、`McpServerList.tsx`、`McpFailurePresentation.tsx` 与 `apps/zcode-cli/packages/adapters/src/mcp/index.ts` 的传输选择、请求头/环境变量、连接状态和重连交互。Mira 沿用 Vue/Element 设置层、React Composer、既有 MCP 配置及权限桥，用成熟 MCP SDK 的 Streamable HTTP/SSE 实现实际远程连接，不复制上游服务层或命名。原 stdio 配置兼容；本批没有移植 OAuth、项目级配置或插件 MCP。Apache LICENSE/NOTICE 保持。

2026-10-11 动态插件命令：参考 ZCode `apps/zcode-cli/packages/bootstrap/src/custom-command-shell-expansion.ts` 的 inline/fenced Shell 语法、顺序执行、30 秒超时、128 KiB 输出上限及 stdout 替换。Mira 使用自有 `miraPluginCommands.ts`、`miraPluginShell.ts` 和现有 Electron 工具/项目锁/审批/取消/SQLite，不移植上游 CLI 执行器。先识别原模板再一次替换参数，参数和 stdout 不产生新执行片段；显式重新生成重新执行，普通历史与 submission 重放复用结果。保留冻结模板校验与失败时的部分结果，计划模式及无人值守权限限制仍生效。model/allowed-tools 的解析不被当成上游已生效的能力。原 Apache LICENSE/NOTICE 保持。

2026-10-11 首版收尾：参照当前 `WorkspaceSidebar.tsx` / `button.tsx` 的 32px 入口、14px 字号和 16px 图标，及 `MentionPanel` 的候选列表几何，校准 Mira 侧栏与 Composer；多任务候选列表使用 Mira 自有稳定实例 ID，保留第一方目录、模型和引用协议。没有把上游当前全宽 `+` Popover 改成旧版菜单。

参照 `SessionPane.tsx` 与 `composer/escapeStop.ts` 的聚焦停止语义，Mira 在审批隐藏输入时仍可 Esc 停止所属 run，关闭弹窗不误停，旧停止失败不污染新任务。工具记录直接合并 Mira 已脱敏公开事件，宿主先发布工具元数据再发布 message part；不以占位文字伪造工具结果。当前上游拒绝拖入已放置任务，不把窗格内部重排列为缺失功能。原 Apache LICENSE/NOTICE 与版权声明保持。

2026-10-11 组合删除与草稿恢复：参考 `v4/WorkbenchPane.tsx` 的 `handleSessionDeleted` 与 primary 不显示关闭按钮规则。Mira 删除组合主任务后解散布局回空白任务，侧任务仍可独立打开；不隐式提升侧任务。侧任务删除收拢原布局，归档保留草稿占位。Mira 自有 Controller 对可见侧任务增加保存门禁，保留新加载；自有 Composer 切换 owner 时合并本机最新草稿并拒绝迟到读取覆盖新输入。没有复制上游 store、变量名或跨 Host 协议，Apache LICENSE/NOTICE保持。

2026-10-11 匿名分屏侧栏选择增量：参考 `v4/workbenchSessionPlacement.ts` 的匿名主任务/focused secondary 选择规则。Mira 在匿名主输入旁点击未入组合的侧栏任务时，仅替换当前侧面任务叶子，保留分割节点/方向/比例、主输入节点和资源身份；旧任务进入现有最近关闭历史，替换前保存各任务草稿。已有组合恢复、明确消息/文件/执行详情导航保持既有路径。晚结果受布局、焦点、owner与请求版本约束，保存失败不切任务。使用Mira自有Controller、偏好和命名，Apache LICENSE/NOTICE不变。

2026-10-11 任务分屏增量：参考当前启用的TaskListItem、V4WorkspaceChatArea、workbenchSessionPlacement及paneLayoutTree/workbenchDragDrop。Mira独立实现4叶二叉布局、四边32%拖入预览、25%–75%分割比例、键盘/鼠标缩放与稳定叶子DOM；使用Mira任务身份、原Controller和现有workspace偏好。已有侧面任务标签作为兼容元数据迁移到对话区的任务布局，资源面板独立开合；关闭收拢布局但不停止任务，侧栏选择恢复原owner组合。未复制ZCode自定义store、跨Host协议或远程身份，未恢复下线的chrome split按钮。原Apache LICENSE/NOTICE保持。

Mira补充：匿名首发准备/接纳时保留主Composer与已有任务Controller，将原draft布局归属迁移到真实任务；旧版超过四窗格的标签转入既有最近关闭列表（最多8项），不删除会话或消息，其他会话仍可从侧栏打开。拖动只更新叶子/分隔条DOM几何，松开后持久化一次；窄任务单元内控件使用现有明暗token并换行保留入口。

2026-10-11 侧面任务摘要增量：参考SessionPane中每窗格的ConversationStatusPanel与ConversationTimeline/TurnNavigator组织方式，复用Mira现有TaskSummary、ConversationTurnRail、MiraBranchPicker；原Mira变更列表提取为MiraTaskChangesPanel供主/侧共用。计划/活动/智能体/变更/轮次导航均绑定所属任务Controller和消息身份，详情在本窗格查看并保留原Composer，跨工作区徽标与关闭不变。小任务单元摘要避开浮动关闭；宽任务单元沿用同一摘要空间保留规则，不引入第三方状态协议。

2026-10-11 侧面任务 chrome 增量：参考 `v4/ConversationHeader.tsx` 的实际可见实现，Mira 已有任务窗格取消重复标题横条，保留可访问标题与资源标签标题；左上角悬浮关闭和仅跨工作区的目录徽标，长目录截断并保留完整路径提示。未恢复上游已注释的拆分按钮或虚构远程标识。文件/执行详情保留返回标头，旁路子对话结构不变。关闭复用 Mira 的草稿 flush、owner/revision 门禁与最近关闭资源记录，只移除窗格，不停止 runtime；失败保留原窗格，并在所属窗格说明保稿和提供重试，不覆盖主任务错误。嵌套保存链传递局部错误模式；Composer 自动保存失败明确说明输入保留，关闭失败已有提示时不重复显示，其他输入错误仍保留，后续保存成功清除自动保存提示。移除后的键盘焦点回到选中资源或标签列表，不抢用户新输入焦点。使用 Mira 文件/变量与既有主题 token，Apache LICENSE/NOTICE 原文保持。

2026-10-11 已有任务侧面打开增量：参考 `TaskActionMenuContent.tsx`、`v4/splitPaneEntryContext.tsx` 与 `v4/workbenchSessionPlacement.ts` 的任务菜单和已打开任务定位规则。Mira 使用自有 task 标签、绑定既有会话的 Controller、真实第一方桥及 SQLite；不复制对话、不创建替代子会话，主/侧任务按 owner 合并草稿保存，保留各自运行、审批及项目目录。已打开目标定位现有面板，主任务可从侧面返回焦点；采用 Mira 文件/变量命名。当前适配既有右侧标签面板，尚未移植上游任意多分屏/组归属/拖拽放置；Apache LICENSE/NOTICE 原文保持。

2026-10-11 手动上下文压缩增量：参考 `v4/slashCommands.ts` 的 `/compact`、`/compress` 与 `SessionPane.tsx` 的压缩入口，Mira 复用自身摘要器、冻结图片、上下文边界及第一方桥。命令不成为用户消息，不删除历史或重新执行工具；最近一轮保持原文，运行/审批/待发送消息门禁、真实进度、停止与失败保留上下文由既有运行协调器提供。Composer 只在成功且草稿归属/版本未变化时消费命令，未移植上游CLI命令队列/CAS/账户协议。Apache LICENSE/NOTICE 原文保留。

2026-10-11 对话分支增量：参考 `v4/ConversationRowView.tsx` 的完成回复 ghost 分支动作/边界分隔线，以及 `v4/SessionPane.tsx` 的创建后任务导航。Mira 使用自有 `session.fork` 受控协议、幂等请求 ID 和 SQLite 会话快照；只复制截至准确助手回复的历史及冻结图片，不移植上游 CLI/CAS/rowId 协议、不回滚文件、不复制在途运行或审批。源/分支任务独立保存，复制历史不重复计费；分支边界可返回原任务的准确消息。文件/变量采用 Mira 命名，Apache LICENSE/NOTICE 原文保持。

2026-10-11 Composer工具栏增量：参考 `prompt-editor/useComposerToolbarFit.ts`、`V4ComposerModeControls.tsx`、`V4ComposerToolbar.tsx`、`ThoughtLevelCycleControl.tsx` 与 `ModelConfigSelect.tsx`。Mira自有 `useMiraComposerToolbar.ts` 在不可见/inert副本上测量并按权限→计划→推理文字→推理纯图标→模型图标分档投影；空间恢复时回到完整标签。保持真实Radix触发器、焦点、菜单与输入编辑器身份，不按固定窗口断点裁掉功能。推理紧凑态绿色标尺只显示既有off/low/medium/high配置；模型使用Package图标与完整悬浮提示。属性和文件采用Mira命名，没有引入上游商业供应商前缀、CUA入口或Runtime。当前第一方队列入口的权限草稿/下次Submission快照原本已经存在，本批不重复改写该协议；旧宿主兼容分支保留。Apache LICENSE/NOTICE原文保持。

2026-10-11 底部终端增量：参考 `Terminal.tsx`、`TerminalTabTrigger.tsx`、`app-shell/AnimatedTerminalPanel.tsx`、`WorkspaceTerminalToggleButton.tsx` 与 `shortcutCommands.ts`。Mira 自有 `MiraBottomTerminal.tsx` 在主对话下方提供独立可调整高度的终端面板，标头与 Cmd/Ctrl+J 切换面板，右侧＋继续新建独立资源标签。底部支持多个终端、键盘选中和单项关闭；最后一个标签与面板关闭只收起并保活，真实进程退出移除标签，删除任务释放其终端。使用既有 xterm、react-resizable-panels、Electron PTY 和授权桥，按 Mira task grant 隔离会话，不复制上游 workspace/RPC。显式展开/选中转交终端焦点，资源焦点不触发主对话查找与模型快捷键；链接仅由当前可见所属终端打开独立浏览器。Apache LICENSE/NOTICE 原文保持。

2026-10-11 工作过程增量：参考 `v4/ConversationTurnGroup.tsx` 与 `conversationTurnRenderUnits.ts` 的工作过程/轮尾回复分离。Mira 使用自有 `MiraAssistantProcess.tsx`、`mira-assistant-process.ts`，保留 canonical message/part/run 身份、已有工具分组及 Radix Collapsible；连续末尾文本独立显示，之前的文本、公开思考和工具调用进入过程。运行中默认展开，成功结束默认折叠，已完成过程手动展开按会话记忆；审批/工具失败保持展开，run 错误独立可见。查找传入明确片段身份，先挂载虚拟轮次、展开命中过程再测量定位；完成折叠回收工具焦点，不抢最终回复焦点。移除有序消息重复的 RunProgressCard，历史执行详情仍通过明确 run 打开。未移植上游 lane/RPC/runtime；无有序 parts 的旧历史沿用原渲染，不推断时间顺序。原 Apache LICENSE/NOTICE 保持。

2026-10-11 安装导航增量：Mira 的公开插件安装在切换详情或已安装页后仍更新登记清单，释放本页忙状态，并按当前页重读真实安装结果；不把 UI 导航等同于撤销后台下载。沿用原来源声明与许可。

2026-10-11 公开插件包校验增量：实际页面核查发现上游多行 Skill 描述被显示为 YAML 的 `>`；Mira 使用显式依赖 yaml 2.9.0 解析标准 frontmatter，限制 alias 展开，只读取顶层名称/描述，非法元数据返回固定错误。市场授权桥仅映射已知网络、完整性与已安装失败，未知主进程错误保持脱敏并给出重试入口。该解析与错误恢复属于 Mira 实现，不复制 ZCode 解析器；原 Apache LICENSE/NOTICE 保持。

2026-10-11 公开插件包增量：参考 `PluginStoreListView.tsx`、`PluginStoreDetailView.tsx` 与 `PluginComponentGroups.tsx` 的列表/详情、已安装条和组件分类。Mira 自有 `MiraPublicPlugins.tsx` 与既有 SkillMarketplaceService 读取固定版本 Anthropic Agent Skills 的真实 marketplace manifest，完整下载声明的 Skill 目录和资源、保留逐文件许可、第三方声明与原 manifest，并生成 Mira 适配 manifest。分块六路下载/逐文件 Git blob 校验/先暂存后发布，登记使用独立市场命名空间；失败或授权撤销不留半包，再安装校验原文件且不覆盖改动。Skill 发现不再误把深层资源目录算成嵌套 Skill，资源读取仍经过原边界校验。没有移植上游商用CDN、账户、付费资产或CLI；非Skill组件继续明确列出未支持。Apache LICENSE/NOTICE 原文保持。

2026-10-11 `/side` 增量：参考 `packages/ui/src/slashCommandHelpers.ts` 的 App 本地命令及 `shouldOfferSideSlashCommand` 门禁，主 Composer 的 `/side` 连接 Mira 已有 `openSideConversation`、父子会话与资源标签；只消费命令 token，保留前后正文，不自动发送或改变权限。草稿/prepared/旁路 Composer 不提供嵌套入口，重复操作新建独立标签。未移植 CLI 命令目录或新增运行器；原 Apache LICENSE/NOTICE 保留。

2026-10-11 子智能体引用增量：参考 `slashCommandPanelSections.tsx`、`mentions/providers/subagentsMentionProvider.ts`、`lib/slashApplyMentionPayload.ts` 的独立分类与 @agent mention，以及 `SlashCommandPlugin.tsx` / `lib/promptInputTriggers.ts` 的跨组最佳匹配。Mira 自有 `miraAgents.ts` 将已有四种运行角色/工具范围作为共同事实源，`mira-agent-reference.ts` 插入/恢复原子 @role 提示，既有 Lexical/草稿/队列承载。不是点选即运行，不改变委派或权限配置，运行仍由实际 delegate_task/正常权限处理；没有复制上游 Agent 配置/插件 runtime 或伪造远程角色。原 Apache LICENSE/NOTICE 保留，完整原生同态仍待验。

2026-10-11 MCP 状态增量：参考 `packages/ui/src/slashCommandPanelSections.tsx` 的命令/Skill/子智能体分类，`settings/McpServerList.tsx` 的连接状态点与工具数量，以及 CLI `command-center/handlers/mcp.ts` 的状态读取语义。Mira 在原 Composer 增加独立 /mcp 状态/会话选择面板、刷新与统一 Vue 设置入口；Mira 自有 `miraMcp.ts` 和既有 McpManager 提供真实状态投影，读取不连接、不开放启动配置，刷新版本/断连清理避免旧连接复活。启动后台连接不阻塞工作台，连接中的客户端也由退出/刷新立即关闭，设置文案明确会话选择范围。并未复制上游账户、远程来源、OAuth 或 CLI connect/disconnect 控制。原 Apache LICENSE/NOTICE 保留；完整 MCP 功能同态继续待验。

2026-10-11 06:12 +08:00 插件引用增量：参考 `apps/zcode-cli/packages/adapters/src/plugins/index.ts` 的 `.zcode-plugin/.claude-plugin/.codex-plugin` manifest、Skill 根与命名空间，`core/src/plugin-reference/catalog.ts` / `reminder.ts` 的会话冻结目录、同名冲突和 live 能力交集，以及 `packages/ui/src/mentions/providers/pluginsMentionProvider.ts` 的插件优先分类和 canonical `plugin://name@marketplace` 引用。Mira 使用自有 `miraPluginStore.ts`、`miraPlugins.ts`、`mira-plugin-reference.ts`、`MiraInstalledPlugins.tsx`，经原第一方桥/SQLite 会话/消息队列实现本地包登记、Skill 能力读取和消息引用；不复制上游 runtime、商用市场资产或账户服务。仅 Skill 执行已接入；其他组件明确显示尚未支持，公开市场仍为既有独立 Skill 下载，不冒称完整插件包市场。Apache LICENSE/NOTICE 原文保持；移除登记不删除用户原包或原许可文件。

2026-10-11 05:15 +08:00 权限提交增量：参考 `packages/ui/src/v4/composer/useDraftConfigControl.ts` 的 `handleDraftSwitchMode`：计划独立、权限仅改下一次 submission intent。Mira 使用自有 `HarnessComposer`、`composer-drafts` 所属权限映射和既有第一方桥/运行队列；新增明确 `permissionMode` 白名单与 fingerprint，接纳验证/入队冻结/重试原快照/撤回恢复/旁路隔离。执行时权限与用户消息同一次保存；不修改已运行轮次，保留旧直接运行的动态全局策略。明确禁用返回可重新采样结果而不丢草稿；没有移植上游 RPC、账户或 runtime。192文件3167项、明暗真实隐藏Electron14项及4图通过，使用受控本地模型协议，非原生/远端/完整性能验收。Apache LICENSE/NOTICE 原文保持。

2026-10-11 04:55 +08:00 配置菜单增量：参考 `packages/ui/src/v4/composer/V4ComposerModeControls.tsx` 的独立计划勾选、三档权限单选、52px最小行/12px间距/18px图标与右侧标记，以及 `chat-input-toolbar/ThoughtLevelCycleControl.tsx` 的档位选择和关闭返回。Mira 自有 `useMiraComposerMenuFocus.ts` 为权限/推理/项目菜单绑定所属 Lexical、非模态外部交互与 IME保护；保存返回后等待Lexical可编辑DOM更新帧，菜单移除焦点项保持正常恢复，外部已聚焦后才到达的关闭回调不安排新恢复，外部操作/任务切换/隐藏撤销延后焦点。最终192文件3147项、明暗真实隐藏Electron18项和4图复核通过。继续使用现有Radix/Mira协议，没有复制上游Select/账户/RPC。此批权限仍立即保存会话、运行中禁止修改且保存时输入暂锁，与上游下一次Submission intent的差异单列后续，未宣称完整对齐；Apache LICENSE/NOTICE原文保持。

2026-10-11 模型选择增量：参考 `packages/ui/src/ModelConfigSelect.tsx` 的供应商 SubTrigger/SubContent、当前供应商标记、32px 模型行与固定管理入口。Mira 自有 `MiraModelMenu.tsx` 使用现有 Radix 和主题 token，保留跨供应商搜索，图片/推理图标只取 Mira 已配置能力；以供应商 ID 与模型 ID 的二元组区分身份。选中接回 Mira 原有 controller/草稿/下一次提交协议；没有复制上游账户、商业连接或 RPC。搜索支持方向键进入菜单、左右键子菜单、Enter 选择、Escape 回所属 Lexical，IME 组合事件不导航或关闭，外部交互不抢焦点；Apache LICENSE/NOTICE 原文保持。

2026-10-11 浏览器驻留增量：参考 `packages/desktop/src/main/browserView/browserTabResidencyPolicy.ts`、`browserTabResidencyCoordinator.ts` 与 `browserGuestManager.ts` 的窗口级 32 个逻辑标签上限、后台活动排序与 durable close。Mira 自有 `mira-browser-residency.ts` 跨任务计数，保护当前可见标签及加载/媒体/下载/捕获/在途 viewport 或 picker；先保存工作区关闭和最近关闭记录，重新校验活动、选择和 native 保护后才释放 guest，状态变化则恢复存储。Vue 按任务/资源解析真实 guest，`miraBrowserProtection.ts` 只在既有第一方授权桥返回保护布尔值，不开放任意 guest 操作。全部受到保护时允许暂时超限，保护解除后重试；32 个以内不轮询。删除任务同时移除工作区记录。原 Apache LICENSE/NOTICE 保留；没有复制上游 RPC 或 suspended runtime，不代表原生 ZCode 对照或性能上限验收。

2026-10-11 元素选择增量：参考 `hooks/useWebElementPicker.ts`、`lib/webElementPickerScript.ts`、`lib/webElementContext.ts` 与 `EmbeddedBrowserPaneParts.tsx`。Mira 自有 `miraBrowserPicker.ts`、`useMiraBrowserPicker.ts`、`mira-browser-reference.ts`，保留蓝色网页选区及深色属性浮层、工具栏选择/取消、Escape、网页上下文引用；仅允许固定 picker 操作，Vue 从任务/资源解析真实 guest，主进程校验 grant、主 frame、session/embedder。选中内容进入 Mira 原子引用与现有草稿/提交协议，不复制上游全局事件、workspace 身份或 RPC。取消清除监听并恢复原光标；导航/隐藏/关闭/任务切换取消在途选择，按 run 丢弃迟到结果。页面数据限长校验，快照移除输入值、textarea 正文和脚本事件属性。Apache LICENSE/NOTICE 原文保持；Composer 与已发送消息的网页元素复用 MiraBrowserContexts 聚合胶囊，布局与 HoverCard 详情改编自 ContextAttachmentPill.tsx / WebElementContextAttachmentChip.tsx；使用现有 Radix，保留单项/全部删除、键盘展开与 Escape，正文、文件和会话引用继续由 Mira canonical 文档持有。只含快照的消息及省略元数据的旧草稿仍可恢复；没有移植上游 runtime。

2026-10-11 自由尺寸增量：参考 `browser-use/BrowserViewportToolbar.tsx`、`ResponsiveBrowserViewport.tsx`、`ResponsiveBrowserResizeHandles.tsx`、`browserViewportZoom.ts` 及主进程 `browserGuestManager.ts` 的固定 viewport/CDP metrics 策略。Mira 自有命名为 `MiraBrowserViewport.tsx`、`miraBrowserViewport.ts`、`miraBrowserViewports.ts`，复用既有 Radix DropdownMenu 和 Mira 视觉 token。宽 320–3840、高 320–2160，默认 393×852，适应及 50–200% 预览；Enter/失焦提交、Escape 恢复，保留非法草稿并反馈。网页由 Vue 固定容器托管，React 只交尺寸/比例；宿主解析资源 ID 并覆盖 guest 目标，主进程校验 grant/主 frame/session/embedder，串行执行明确的 CDP metrics，不开放任意 CDP。模式不重建 guest，桌面 zoom 补偿、画布裁剪、边/角拖拽、200ms 偏好保存沿用上游行为并按 Mira 授权/导航体系改编。人类显示偏好不接管 Agent viewport，元素选择和 residency 尚待接入。Apache LICENSE/NOTICE 原文保持；本段记录实现，验收见首屏对齐文档。

2026-10-11 浏览器资源增量：继续参考 `packages/ui/src/hooks/useAppPanels.ts` 的 `handleOpenBrowserUrl`、`handleOpenBrowserTab` 和 `handleReopenClosedSidePaneTab`：普通终端网址及空浏览器入口每次创建独立资源，最近关闭恢复创建新身份并保留地址/标题。参考 `browser-use/UnifiedBrowserView.tsx` 的实际页面标题更新。Mira 使用自有 `MiraBrowserPanel.tsx`、`workspace-state.ts`、`miraHostedBrowsers.ts` 和既有第一方授权桥；按主任务与资源共同管理 WebView、独立历史、隐藏保活、精确关闭、背景事件归属和授权在途关闭保护，不复制上游 RPC、registry 或浏览器 Runtime。00:20 批次的单浏览器复用只属历史实现，不再作为当前对齐行为。旧 `browser` 偏好/无资源参数调用仍兼容；完整 favicon、viewport 偏好和上游 residency 管理尚未移植。Apache LICENSE/NOTICE 原文保持。

2026-10-11 00:20 +08:00：参考 ZCode `terminal/terminalLinks.ts` 与 `terminal/TerminalSession.tsx` 的 plain URL provider/OSC 8 linkHandler，新增 Mira 命名的 `lib/mira-terminal-links.ts`，保留 Apache 来源，按逻辑换行读取缓冲区并映射 UTF-16 到实际宽字符/组合字符单元格，链接末尾包含完整宽字符列；清理正文尾标点和多余括号。终端仅把 HTTP(S) 交给当前主任务的资源浏览器，不直接打开系统窗口；隐藏/卸载/过期 owner 不发导航。浏览器从 Workbench 内移入 `workspace/MiraBrowserPanel.tsx`，使用 Mira 自有一次性导航请求，已打开和重复同 URL 均可响应，观察到的 URL/重定向不触发循环导航。原宿主协议和 Apache LICENSE/NOTICE 原文保持。

2026-10-11 00:04 +08:00：`TerminalPanel.tsx` 继续参考 ZCode `terminal/TerminalSession.tsx` 的 Radix 复制/粘贴菜单，复用 Mira 菜单视觉/图标、选区与焦点。Mira 不移植浏览器 `clipboard.readText`：新增自己的 `terminal.paste` 授权调用，主进程先校验 grant/session/PTY owner，再读取一次系统文本并按 xterm 6 的换行/括号粘贴语义写入指定 PTY，返回 void，不把内容交给 renderer。空内容不写，超限/读取失败反馈；原 Ctrl/Cmd+V 单 native paste 路径不变。原 Apache 声明保留，本段只描述实现，不代替运行验收。

2026-10-10 23:53 +08:00：资源标签继续遵循 `app-shell/SidePaneTabTrigger.tsx` 的 156px 等宽/最小 60px 收缩，移除 Mira 选中标签额外 128px 下限。终端排除旧 inspector section 的额外内边距/底边线，实际内容仅保留 `SidePaneTerminalPane.tsx` 对应的单层 12px。悬停后关闭动作沿用既有结构；旧关闭失败来自夹具没有先悬停后台标签，不作为产品缺陷或按钮层级改造依据。

2026-10-10 23:46 +08:00：按 `packages/ui/src/SidePaneTerminalPane.tsx` 明确的单 shell/不嵌套 tabs 结构，以及 `hooks/useAppPanels.ts` 的独立终端资源、目录标题去重和关闭 release，Mira 把每个 PTY 移到自身统一资源条中。`TerminalPanel.tsx` 不再提供内层终端栏/常驻连接头，使用上游 12px 内边距；`workspace-state.ts` 为 Mira 独立终端资源创建身份和目录标题，保留旧 `terminal` 偏好与最近关闭恢复。Workbench 按主会话/资源独立保活、关闭释放和局部重启；标签菜单提供重启，不复制 ZCode registry/RPC。`WorkspaceTabs.tsx` 回收已移除关闭按钮的焦点，保留用户已切去的输入焦点。23:35 的内层 tabs 行为是历史结构，不能再宣称当前一致。

2026-10-10 23:32 +08:00：`TerminalPanel.tsx` 参考 ZCode `terminal/TerminalSession.tsx` 的可见 session 下一帧聚焦及有选区 Ctrl/Cmd+C 复制规则。Mira 保留自己的 PTY/Controller、连接/隐藏/卸载生命周期与输入焦点保护；复制失败公开反馈且不发送 SIGINT。粘贴由 xterm 原生 paste 事件处理，Ctrl/Cmd+V 只让出 xterm 按键处理，不复制上游 clipboard.readText 路径或开放 iframe 剪贴板读取权限，避免双重写入。代码保留 Apache 来源声明，原终端字体栈补录 DESIGN，不更换视觉。

2026-10-10 23:23 +08:00：参考 `packages/ui/src/v4/SessionPane.tsx` 的 focused pane 停止归属和 `packages/ui/src/terminal/TerminalSession.tsx` 的终端按键边界，Mira Workbench 为资源面板独立记录焦点，旁路内部捕获指定 child；资源页签切换不重置 main。`MiraTaskFind.tsx` 检查实际资源事件目标，避免终端/文件/浏览器误开主查找，保留自身任务变更查找与全局搜索。仅适配 Mira 自有焦点/事件状态，不复制上游终端输入 fallback、RPC 或配置协议。原 Apache 声明与许可保留；定向及隔离宿主结果见首屏文档，不宣称原生/完整性能验收。

2026-10-11 审批定位增量：继续参照 ZCode `v4/SessionPane.tsx` 的 pane 归属与 `v4/ConversationQueuePanel.tsx` 的确认门禁，Mira Composer 将“查看确认”交给当前会话所属的 Timeline。权限与计划/澄清按请求身份、局部 viewport 定位；长历史中的行内权限先用既有虚拟消息导航挂载，再将键盘焦点交给确认卡。计划摘要只查找计划确认，不命中记忆保存或其他权限卡；会话切换取消在途定位。工具仍在运行但实际待审批时亦显示确认入口，不伪造queue.paused。`TaskInteraction.tsx` 与局部 `mira-task-interaction` 样式参考 `ElicitationDialog.tsx` 的中性popover、16px轮廓、12px留白、选项hover/selected与主按钮；移除计划/澄清旧整块warning背景，保留Mira的实际计划/问题协议。不复制上游 RPC/队列实现，原 Apache LICENSE/NOTICE 保留。验收以本批首屏记录为准。

更新日期：2026-10-10 16:32 +08:00（Asia/Shanghai，追加比例分栏与真实公开子对话适配；验收状态以首屏记录为准）。

当前改编批次为 [首屏实现增量](#2026-10-09-首屏实现增量)，下一入口仍是首屏交互/截图与性能验收，不回到文件支线。前一批 [收尾增量](#2026-10-08-收尾增量) 的 80 文件/458 项及 80/455、后续文件批次继续保留历史身份，不能作为当前首屏验收统计。限定回归与 opaque iframe headless 不等于新的原生 Electron、安装包、Windows 或 P0–P3 放行。本批未提交、未推送。

## 可核验来源

- 上游仓库：https://github.com/zai-org/ZCode
- 本地源码：`/Volumes/VrenDisk/project/ZCode`
- 本地 Git remote：`git@github.com:zai-org/ZCode.git`
- 基线版本：根 `package.json` 的 `3.14.3`
- 基线 commit：[`29628c9acdb81b703bbd4080c207a0e7ce5e276e`](https://github.com/zai-org/ZCode/commit/29628c9acdb81b703bbd4080c207a0e7ce5e276e)
- 核验：本地 HEAD、remote、版本与 GitHub commit API 返回的 SHA 一致；
  该基线用于本轮改编，不代表上游最新版本。
- 上游原始版权：`Copyright 2026 Z.AI Co., Ltd`
- 上游许可：Apache License, Version 2.0
- 上游完整依赖声明：[THIRD-PARTY-NOTICES.md](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/THIRD-PARTY-NOTICES.md)

## 改编范围

2026-10-11：标签概览参考 `SidePaneTabOverview.tsx`、`sidePaneTabSearch.ts`、`sidePaneTabPresentation.ts`，使用已有 Radix Popover 与 cmdk，实现打开/最近关闭分组、标题/类型/路径/URL 多词搜索和排序、逐项关闭、恢复及键盘操作。Mira 以自身资源 ID 区分同名项；打开/关闭时间来自真实状态转换，旧偏好不补造时间；保留宿主授权与浏览器资源回收，不移植上游 RPC、全局 store 或商业服务。`MiraWorkspaceOverview.tsx`、`lib/mira-workspace-tab-presentation.ts` 及 WorkspaceTabs/state/CSS 为本批改编位置。

2026-10-10 23:00：主/旁对话的可见轮次直接消费 Mira canonical 消息，不再为整份历史建立第二套 assistant-ui 消息运行时与订阅。保留上游参考的布局和交互、完整历史、renderer 身份、TanStack 虚拟轮次、Streamdown/Shiki 正文、Radix 工具折叠、Lexical 输入与 Mira 自有滚动恢复。未移植上游消息引擎，不修改 node_modules；本项性能与交互验收以首屏记录为准。

2026-10-10 21:55：参考 `SessionPane.tsx` 的 focused/visible 分离及 `useConversationTimelineFind.ts`，Mira主/旁对话查找使用各自查询状态，当前焦点独占Cmd/Ctrl+F、Escape与高亮；全局CSS Highlight采用当前owner保护，避免旧面板cleanup清掉新结果。侧对话只显示实际接通的对话查找，不提供尚未接通的文件变更查找入口；不移植上游RPC或find全局store。功能验收以首屏文档为准。

| Mira 文件/区域 | 上游参考 | Mira 改编内容 |
| --- | --- | --- |
| `hooks/useMiraPaneGeometry.ts`、`lib/pane-geometry.ts`、Workbench 与 layout/workspace CSS | `app-shell/useAnimatedResizablePanel.ts`、`sidePaneLayout.ts`、`animatedSidePanePanelModel.ts`、`WorkspaceShellLayout.tsx` | 参考主体右侧默认 45%/最小 240px/最大 65% 比例分栏、显式 200ms 开合与窗口缩放空闲后收栏，复用 `react-resizable-panels` 4.8.0 公开 API，其 MIT 原文另存 `../react-resizable-panels/`。Mira 保留桌面 Shell，移除 1180px 模态浮层；像素侧栏、旧偏好迁移、串行保存/失败导航阻断与重试、拖拽期间 CSS 更新、动画取消和内容锁宽为 Mira 适配，不复制上游 RPC/偏好存储 |
| `MiraToolExploration.tsx`、`lib/tool-exploration.ts`、`AssistantMessageParts.tsx`、`run-progress.tsx` 与 `styles/thread.css` | `packages/ui/src/v4/conversationAssistantWorkItems.ts`、`ToolCallBlocks/renderers/explore.tsx`、`renderers/read.tsx`、`renderers/search.tsx`、`ToolSummaryRow.tsx` 与 `ToolLayout.tsx` | 适配连续只读工具“查阅”聚合、首项身份与阶段流式状态、按需挂载、轻量读取/搜索摘要和运行文字扫光；工具类别/统计来自 Mira 明确公开记录，不把任意 shell 推断为只读。成功状态隐藏，失败/取消与原始记录仍可发现；运行收起态的文件可独立预览，键盘子动作不展开父组。14px/16px 与悬浮右箭头参考上游。成功计划只有实际计划活动存在时才去重，审批和失败记录保留 |
| `MiraToolCommandGroup.tsx` 与上述对话工具接线 | `packages/ui/src/ToolCallBlocks/renderers/execute-group.tsx`、`renderers/execute.tsx`、`renderers/explore.tsx` 与 `v4/conversationAssistantWorkItems.ts` | 适配连续执行分组、当前活动命令优先、按需展开与展开后不重复命令摘要。Mira 原创 `lib/mira-command-presentation.ts` 只从完整公开输入提取命令；有限静态规则必须识别复合命令的全部片段，未知、动态或复杂命令保持执行类别，缺失或截断输入不聚合。查阅按一次真实公开调用计一个类别，阶段状态由可见时间线尾部决定；运行/子任务边界及审批记录不合并。分类只用于 UI，不改变 Runtime、风险或授权策略 |
| `MiraToolFileChip.tsx`、`styles/mira-tool-files.css` 与 `assets/file-types/` | `packages/ui/src/ToolCallBlocks/renderers/read.tsx` 的 `ReadFileChip`、`lib/fileDisplay.tsx` | 改编文件名独立操作与旁侧目录显示，Mira 保留自己的路径授权和预览协议；不可授权的路径只显示。16 个静态图标来自上游使用的 Material Icon Theme，原图逐项固定提交核验、MIT 原文与 Material Extensions 版权独立保留于 `../material-icon-theme/`，不使用 ZCode Apache-2.0 替代图标许可；Mira 名称、末尾换行及内联打包见其来源说明 |
| `MiraSubtaskRecord`、`MiraSubtaskPanel.tsx`、`OverviewPanel.tsx`、`TaskSummary.tsx`、Workbench 接线与 workspace-state | `packages/ui/src/ToolCallBlocks/renderers/agent.tsx`、`v4/ConversationAgentToolCallRow.tsx`、`app-shell/SubagentSessionSidePane.tsx`、`SessionPane.tsx` | 参考父对话单行智能体入口、独立右侧可关闭页签、运行过程入口及子对话布局。新 Mira 子记录通过自身公开 parts 契约显示实际有序正文/思考/工具，复用 Mira renderer，保留独立滚动/展开记忆及不遮挡首行的悬浮摘要；旧记录仍显示真实活动/报告，不补造历史对话。tab 保存明确 session/run/child 身份；停止 single-flight、迟到导航回执保护、canonical 调用关联、跨 response/同 response 重复 provider ID 隔离、250ms 发布合并、多响应用量累计和恢复中断均为 Mira 原创 Runtime 适配，不复制上游 Runtime、系统提示或私有引擎消息 |
| `MiraToolCommand.tsx`、`MiraToolDiff.tsx`、`lib/tool-diff.ts`、`run-progress.tsx` 与 `styles/thread.css` | `packages/ui/src/ToolCallBlocks/renderers/execute.tsx`、`ExecuteOutput.tsx`、`EditInlineDiffContent.tsx`；`components/ui/scroll-fade-viewport.tsx`、`highlighted-lightweight-diff-preview.tsx`、`lightweight-diff-preview.tsx`；`lib/patchDiffPreview.ts` | 改编命令盒、五行输出窗口、上滚冻结/回底跟随、滚动边缘渐隐与轻量 diff。Mira 原创工具进度投影复用现有有界脱敏、忽略取消/终态后的迟到结果，保留上游严格布尔截断标志；diff 读取真实公开记录，编号/unified 双格式按实际范围显示单行号，未知/不完整记录保持原文、不造统计；全记录经已有取消/重试 Worker 高亮，不读取当前磁盘冒充历史变更，不移植 ZCode RPC/快照后台。输入/输出原记录仍可展开查看，文件动作继续经原授权桥 |
| `MiraConversationDetails.tsx`、`MiraToolFailure.tsx`、`run-progress.tsx`、`AssistantMessageParts.tsx` 与 `HarnessWorkbench.tsx` 接线 | `packages/ui/src/ToolCallBlocks/ToolLayout.tsx`、`ToolSummaryRow.tsx`、`renderers/read.tsx`、`renderers/execute.tsx` | 适配 Radix 工具摘要/键盘折叠、工具类别/文件入口、失败状态浮层和复制。带复制动作的浮层使用 Popover，键盘可达且不冒泡展开工具；Mira 使用真实有界 input/output/error，文件动作仍经原工作区授权。展开记忆按会话/运行/记录隔离，仅 renderer 内保存最近 200 个会话且关闭即释放，不复制上游无界工具 Map、CLI snapshot 或模型协议。虚拟历史编辑/焦点轮保留为 Mira 原创生命周期修复 |
| `MiraTaskTitleEditor.tsx`、`message-parts.tsx`、`pilot-state.ts` 与 Header/用户消息接线 | `packages/ui/src/TaskRenameDialog.tsx`、`WorkspaceHeaderSections.tsx`、`v4/ConversationRowView.tsx` | 适配中文输入法、重命名发起目标、保存回执成功才退出和失败保留输入；Mira 根据真实 run-start/canonical 消息判断编辑已受理，保留自身完整运行 IPC 与 owner/导航/卸载保护，不复制上游远端事务 |
| `TaskSummary.tsx` 与 Workbench 的受控 mode | `packages/ui/src/App.tsx`、`v4/ConversationStatusPanel.tsx` 及真实消费者链 | 摘要模式按 App 生命周期保持，切任务保留、重启自动；适配待办/变更/终态优先级、独立分区、智能体默认折叠、模式菜单和键盘回焦。Mira 没有新增磁盘持久化，也没有把缺少后端协议的 Goal/workflow 接成假功能 |
| `HarnessComposer.tsx`、`useComposerCatalogs.ts` 与 `lib/composer-drafts.ts` | `packages/ui/src/v4/ConversationComposer.tsx`、`prompt-editor/ChatPromptEditor.tsx`、`mentions/MentionPlugin.tsx` 的项目引用与输入消费链 | 新项目草稿可在首次发送前浏览/搜索文件，选择前不创建任务；Mira 复用已授权 project files 和真实 stage，选择后唯一 prepared owner 冻结附件。行内文件引用关联该次 DTO，删除/撤销与当前 owner 附件同步；独立上传保留。失败重试保存原范围，新输入不被迟到 continuation 覆盖；对话读取按 owner/项目/目录/revision 保护。版本 1 文档白名单、owner 生命周期、偏好容量降级与草稿/队列/ACK 均为 Mira 适配，不复制上游 store/RPC/Runtime；Skill/MCP 仍使用 Mira 实际配置协议 |
| `apps/harness-react/src/components/composer/MiraPromptEditor.tsx`、`MiraPromptReferenceNode.ts` | `packages/ui/src/LexicalChatInput.tsx`、`mentions/nodes/PromptMentionNode.ts`、`mentions/promptSerialization.ts`、`mentions/PromptClipboardPlugin.tsx` | 改编 Lexical shell、真实 TextNode token、短标签与 canonical 原文分离、原子选择/删除和纯文本剪贴板；保留 Apache-2.0 标识及原版权。Mira 使用公开 PlainText/History API、原生中文合成保护、受控回传/历史隔离和剪切失败保稿，不恢复上游插件 URI、任意 Lexical JSON 或 HTML。Lexical 0.42.0 及新增依赖的原始 MIT 许可另存 `../lexical/`；未修改运行库 |
| `apps/harness-react/src/lib/prompt-editor-document.ts` | 上述 canonical 引用/选区交互；Mira 独立数据契约 | Mira 独立实现 version 1 text/reference parts、字段/大小白名单、canonical 序列化与不可拆分的引用 offset/range 替换；不复制上游内部节点 JSON 或后端引用解析器。正文匹配失败回退纯文本，文件 pill 恢复需 owner DTO；来源记录不声明完整 ZCode 同态、性能或发布验收 |
| `MiraSelectionActions.tsx`、`lib/mira-conversation-selection.ts`、Composer 和正文/思考/工具区域接线 | `packages/ui/src/v4/ConversationSelectionTooltip.tsx`、`SelectionActionMenu.tsx`、`hooks/useTextSelection.ts`、`lib/conversationSelectionGuard.ts`、`conversationSelectionReference.ts` | 改编单 row/region 选区门禁、悬浮动作定位与 scroll/resize/Escape 生命周期、8000/8/16000 引用限制。Mira 独立使用 session/message/part 身份及 canonical Lexical selection pill，保存选中快照、去重、保留已有草稿选区和原子撤销；不复制上游全局引用 store、RPC 或 userselect 解析协议。提供添加当前任务和旁路提问，后者见下行 |
| `MiraSideConversation.tsx`、共享 `MiraConversationMessages.tsx`、Workbench/Composer/工作区状态与 Electron 会话适配 | `packages/ui/src/app-shell/SelectionSideChatPane.tsx`、`v4/SessionPane.tsx` 的 `handleOpenSelectionSideConversation`、`lib/selectionSideInheritedModel.ts`、`apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`、`bootstrap/src/zcode-protocol/v4-bridge.ts` 与 `commands/handlers/selection-side-session.ts` | 改编独立可编辑侧对话、选中时复用/固定入口新建、单在途创建和失效替换。Mira 使用自己的 parentSessionId、第一方 session.create-side、独立 Controller/草稿 namespace/审批/队列/停止及父生命周期守卫；只复制稳定正文、附件与压缩摘要作为隐藏模型上下文，不复制 ZCode 全量 parts/tool history/runtime/goal/queue。继承已生效模型与推理档位，不带入主 Composer 未提交配置。复用 Mira 同一消息/工具/引用渲染与待应用指导组件，资源面板 CSS 不覆盖对话正文；不移植上游全局 store、RPC、商业服务或 telemetry |
| `apps/harness-react/src/components/conversation/ConversationTurnRail.tsx`、`styles/thread.css` | `packages/ui/src/v4/ConversationTurnNavigator.tsx`、`conversationTurnNavigatorHelpers.ts` | 适配 10px 行高/overscan 6 的 TanStack 虚拟轮次栏、120ms/80ms Radix Hover Card、right/start 随项预览和相邻山峰视觉；活动轮次滚入可见窗口。Mira 保留自己的 query/message 身份，并独立增加单一 Tab 停靠、方向/Home/End/Page 键跨窗口移焦与迟到焦点取消，不复制上游 hydration/RPC；真实宿主及性能证据由首屏记录维护 |
| `apps/harness-react/src/components/session/SessionSidebar.tsx`、`styles/session.css` 与工作台文件树接线 | `packages/ui/src/workspace-grouped-tasks/task-row.tsx`、`TaskListItem.tsx`、`TaskList.tsx`、`WorkspaceSidebar.tsx` | 适配分组行文件树/移到根顶部/X关闭、项目/置顶/时间线原位归档确认及 hover/focus 状态；成熟 Radix tooltip/menu 与按钮默认焦点保留。Mira 独立实现偏好事务、single-flight/失败重试、归档导航生命周期及 project/session owner 文件浏览，不复制上游任务 Runtime；组草稿见下行，跨 owner 预览仍未扩展 |
| `MiraSidebarSection.tsx`、`SessionSidebar.tsx`、`sidebar-preferences.ts`、`styles/session.css` | `packages/ui/src/WorkspaceSidebar/WorkspacePurposeSection.tsx`、`lib/sidebarPurposeSectionPreferences.ts`、`lib/workspaceTaskPagination.ts` 与 `WorkspaceSidebar.tsx` | 适配项目/个人区独立持久折叠、标题 hover/focus 操作、个人新任务入口、项目内每次 +5 展开和不可见项目的分页清理。使用 Radix Collapsible 与 dnd-kit 分区排序；Mira 独立实现同级键盘路径、一次保存/失败回滚/后续修改保护，偏好继续保存到宿主，添加项目成功才展开分区。未复制远端工作区或 RPC |
| `MiraSidebarStickyHeader.tsx`、`SidebarCollectionSection.tsx`、`styles/session.css` 与 `SessionSidebar.tsx` 接线 | `packages/ui/src/workspace-grouped-tasks/sticky-group-header.tsx`、`sticky-group-header-slot.tsx`、`WorkspaceGroupedTasksSection.tsx` | 适配组标题越过顶部且组尾仍在视窗时的悬浮副本、150ms 退出和真实颜色/数量/折叠/新建/解散。Mira 使用实际 DOM 几何、resize/mutation 观察与现有偏好/草稿；退出立即 inert，拖拽/切视图卸载菜单，迟到回调按当前组身份校验，不复制上游 Runtime |
| `MiraSidebarVirtualList.tsx` 与 `SessionSidebar.tsx` | `packages/ui/src/workspace-grouped-tasks/virtualized-group-task-list.tsx`、`virtualized-top-level-list.tsx`、`virtualized-scroll.ts` | 适配 >80 阈值、overscan 12、共享侧栏滚动、实高测量和重新挂载不回顶；小组与未分组完整展示，+5 仅保留在项目任务。Mira 独立保留焦点/菜单/拖拽/重命名/归档确认/异步动作和错误行，沿用已有 TanStack Virtual 许可，无新增依赖；实际页面/性能状态仍由首屏记录维护 |
| `SessionSidebar.tsx`、`HarnessComposer.tsx`、`HarnessWorkbench.tsx`、`lib/composer-drafts.ts`、`state/pilot-state.ts` 与第一方桥/宿主存储及接纳边界 | `packages/ui/src/workspace-grouped-tasks/group-item.tsx`、`hooks/useGroupedTaskView.ts`、`app-shell/useWorkspaceTaskNavigation.ts` 的组首草稿与接纳后定位交互 | 适配组首/根首临时草稿行、重复入口重定位和关闭保留输入。Mira 独立使用 prepared/accepted SQLite 生命周期：准备附件不进入任务查询/搜索/计数，首次真实接纳后才提升；同 owner 跨项目迁移保留冻结附件，未知首发确认复开捕获位置而不创建隐藏孤儿。恢复统一经导航事务，提交捕获原组/正文/附件/模型，迟到确认不抢导航、不清别的任务输入；分组已删除则根首，偏好失败保留本地位置供重试。未复制 ZCode 草稿 store、RPC 或 Runtime；队列仍仅进程内，原生同态/性能不由源码适配记录放行 |
| `apps/harness-react/src/components/session/ArchivedSessions.tsx`、`SessionSidebar.tsx`、`styles/session.css` 的归档工具栏与确认流程 | `packages/ui/src/DeleteAllArchivedTasksButton.tsx`、`lib/archivedTaskDeletion.ts`、`WorkspaceArchivedTasksFlatSection.tsx`、`WorkspaceSidebar.tsx` | 适配归档工具栏操作菜单、全量范围/数量确认、逐项删除/跳过/失败反馈及退出 X；Mira 使用 grant 绑定的宿主快照与 SQLite 归档条件写入，独立实现运行/队列保护、一次刷新和草稿清理，不移植上游远端服务或账号逻辑 |
| `apps/harness-react/src/components/composer/MiraAttachmentPreview.tsx` 及 Composer/消息图片组接线 | `packages/ui/src/components/ai-elements/image-preview-dialog.tsx` | 适配全画布遮罩、圆形前后切换/关闭/保存按钮、方向键循环、50–300% 缩放和拖动画布；切项释放 pointer capture 并重置视图，错误可单项重试。原生保存由 Mira 会话附件令牌与受控 IPC 实现，不复制上游远程下载、视频或账号能力；文本继续用普通内容弹窗 |
| `apps/harness-react/src/components/composer/MiraComposerAttachments.tsx`、`MiraAttachmentPreview.tsx`、`lib/attachment-input.ts` 与 `HarnessComposer.tsx` 附件入口 | `packages/ui/src/v4/composer/useComposerAttachments.ts`、`packages/ui/src/lib/chatAttachments.ts`、`packages/ui/src/v4/ConversationComposer.tsx`、`packages/ui/src/ChatMediaAttachmentPreviewDialog.tsx` | 适配 Composer 48px 图片缩略图与文本条目、hover/focus 移除、原生选择/拖拽/粘贴、15Ki 字符文本粘贴转附件及附件-only 发送；用 Mira 的不可变会话附件令牌、受控桥与 Radix 预览，未复制上游附件 RPC/临时文件路径。保留 Mira 既有最多 12 个引用（上游 8 个），图片单张 20 MiB/总 40 MiB、文本单个 256 KiB/总 1 MiB；当前模型链只支持真实图像与 UTF-8 文本，不宣称视频/PDF 输入已对齐 |
| `apps/harness-react/src/components/conversation/message-parts.tsx` 附件展示与工作台用户消息 | `packages/ui/src/v4/ConversationRowView.tsx` | 图片显示为实际持久化内容的 80px 缩略图并打开预览，文件保留 compact pill；附件-only 不生成空文本气泡或复制空正文。图片通过 Mira OpenAI-compatible SDK 的 ImageContent 传入模型，不移植上游 CLI/provider 路由 |
| `apps/harness-react/src/components/conversation/MiraConversationTimeline.tsx`、`lib/conversation-timeline.ts` | `packages/ui/src/v4/ConversationTimeline.tsx`、`conversationTimelineLiveTail.ts`、`conversationTurnRenderUnits.ts`、`timelineRowHeightCache.ts` | 按 Mira 普通输入建立任务轮次，guide 与助手分段保留原顺序；历史 TanStack overscan 4、72px 估高和实例内 4000 条测高缓存，仅真实运行末轮保留正常流。可见轮次直接渲染 canonical 消息；搜索/rail/摘要先挂载目标再定位，阅读记忆附带轮次锚点。未移植上游 RPC、历史分页或持久化 UI 状态 |
| `apps/harness-react/src/lib/conversation-scroll.ts`、`hooks/useConversationScroll.ts`、`components/conversation/MiraConversationViewport.tsx` | `packages/ui/src/lib/chatSessionScrollMemory.ts` 与 `packages/ui/src/v4/ConversationTimeline.tsx` 的 scope/阅读恢复 | renderer 内按 Mira 工作目录/会话隔离的 200 条 LRU；切换前保存旧 DOM，等 canonical 消息提交后恢复，主动滚动/轮次与搜索导航取消恢复。Mira 自有跟随/ResizeObserver/宽度补偿管理原生 viewport，不引入上游 RPC 或承诺进程重启后恢复 |
| `MiraSidebarTaskTitle.tsx`、`styles/session.css` 与任务/项目菜单接线 | `packages/ui/src/components/TaskTitleOverflowText.tsx` | 改编原始文字测宽、溢出mask、24px双份间距、40px/s/最短6秒移动/2秒暂停及1秒延迟。Mira增加键盘聚焦、菜单暂停、页面隐藏和减少动态效果生命周期，按钮保留完整可访问名称，重复文字隐藏；右键和更多菜单共享提示暂停身份，不复制上游业务store |
| `SessionSidebar.tsx` 的前置置顶按钮与 `styles/session.css` | `packages/ui/src/TaskListItem.tsx` 的 leading pin action | 适配16px前置槽、hover/focus显示、置顶常显及无导航切换；保留Mira独立拖拽柄、分组行语义和既有置顶IPC/SQLite。失败由Controller返回所属行并允许重试，错误在行内展开，不复制上游远端或移动端标记 |
| `apps/harness-react/src/styles/mira-foundations.css` | `packages/ui/src/styles.css` 的 `.theme-zai-light` / `.theme-zai-dark` | 使用实际浅深色主题值；内部变量改为 `--mira-*`；由宿主 `.dark` 切换，保留 Tailwind 工具类别名；桌面 UI 默认 14px |
| `apps/harness-react/src/styles/app.css` | 同文件的滚动条与语义配色 | 将区域样式兼容别名桥接至 Mira 主题，滚动条沿用透明轨道与 3px 透明边 |
| `apps/harness-react/src/lib/utils.ts` | `packages/ui` 的 shadcn 类名合并模式 | 使用本项目的 clsx / tailwind-merge；不引入上游业务状态或 RPC |
| `apps/harness-react/src/components/conversation/markdown.tsx` | `packages/ui/src/components/ai-elements/message.tsx` 的 Streamdown 插件接入 | 使用本项目消息与 CJK 插件；流式和完成态共用 Mira 独立高亮适配器，保留引用与复制 |
| `apps/harness-react/src/lib/code-highlighter.ts`、`code-highlight-core.ts`、`code-highlight-worker-client.ts`、`workers/mira-code-highlight.worker.ts` | Mira 独立适配 Shiki 公开 API 与 Streamdown 插件接口；没有复制 ZCode tokenizer | 2026-10-09 改为独立 Oniguruma WASM Worker，classic Blob 动态导入固定产物，不放宽 sandbox；253 个物理 grammar、235 个公开语言 ID、含 alias 共 332 个标识；仅加载 github 浅深两个主题；缓存 key 包含完整代码、归一化语言与主题，LRU 上限为 128 项及 1,000,000 个 key 字符；真实 grammarState 留在 Worker、plain tokens 跨线程。所有长行不限 Shiki 时间/长度预算，Worker 失败显示重试，不冒充成功；不声称保留原 `@streamdown/code` 实现或 65 个主题 |
| `apps/harness-react/src/components/workspace/WorkspaceLauncher.tsx`、`apps/harness-react/src/styles/workspace-launcher.css` | `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx` 的 `openTabLauncher`；`packages/ui/src/styles.css` 的 `.side-pane-open-tab-shell` 与容器规则 | 适配打开标签页入口：小于 480px 为 320px 内容列内的单列行，达到 480px 后为自适应卡片；使用现有 Mira 动作和宿主资源协议 |
| `apps/harness-react/src/components/workspace/WorkspaceTabs.tsx` | `packages/ui/src/app-shell/SidePaneTabTrigger.tsx`、`SidePaneTabOverview.tsx`、`SidePaneTabTitleTooltip.tsx` 与 `AnimatedSidePanePanel.tsx` | 适配排序、中键关闭、右键关闭其他/全部、标签概览及最近关闭；历史按 Mira 会话隔离，PTY 回收由现有宿主协议执行 |
| `apps/harness-react/src/components/workspace/ProjectFileDrawer.tsx`、`apps/harness-react/src/styles/file-drawer.css` | `packages/ui/src/workspace-file-tree/WorkspaceFileTree.tsx`、`WorkspaceFileTreeRowView.tsx` 与 `constants.ts` | 适配左侧项目文件抽屉、28px 行高与 12px 缩进、虚拟列表、Radix 菜单和树键盘导航；动作仅连接 Mira 已有的文件读取、目录打开、复制路径与加入对话协议 |
| `apps/harness-react/src/lib/file-tree.ts` | `packages/ui/src/workspace-file-tree/model.ts` 与 `useWorkspaceFileTreeData.ts` | 使用 Mira 相对路径数据构建目录优先的可见树；补全焦点与键盘导航，按会话/目录生命周期及单目录请求序号抑制旧响应；刷新已加载或展开目录，并发上限为 2 |
| `apps/harness-react/src/lib/file-git.ts`、`ProjectFileDrawer.tsx`、`styles/file-drawer.css` 的 Git 装饰 | `packages/ui/src/workspace-file-tree/model.ts`、`statusStyles.ts`、`WorkspaceFileTreeRowView.tsx`、`WorkspaceFileTreeList.tsx` 与 `gitStatus.ts` | M/A/D/R/U 名称颜色和字母、目录直接标记与单个后代点；精确 ignored 灰色不聚合到祖先。Mira 状态/ignored 分别单在途、可见行分批最多 512、正负缓存与生命周期过期抑制 |
| 同上文件的删除行与只看变更增量（2026-10-09） | `workspace-file-tree/model.ts`、`useWorkspaceFileTreeRows.ts`、`WorkspaceFileTree.tsx` 与 `WorkspaceFileTreeRowView.tsx` | 仅在已加载的直接父目录补删除文件，不虚构祖先；Mira 按父目录 Set 去重和批量复制，不修改原目录快照。树筛选保留变更祖先，搜索筛选只保留直接状态且不注入删除结果；重新计算可访问兄弟序号。Lucide 图标开关复用 Mira 选中色，刷新保留开关，失败/非仓库及上下文切换复位。删除行保留选中、路径复制和非位图引用，禁打开/外部编辑；引用实际发送仍由 Mira 宿主校验 |
| `electron/services/harnessWorkspaceSearch.ts` | `packages/shared/src/workspaceFileSearch.ts` | 改编 basename/相对及绝对路径模糊评分与 top-K 排序；Mira 独立实现异步完整目录扫描、真实根目录及 inode 隔离、访问校验、60 秒/4 根目录/估算 128MiB 有界缓存、刷新代际和返回相对路径，最多 1000 项并明确截断 |
| `apps/harness-react/src/lib/workspace-watch.ts`、文件树/预览监听接入 | `packages/ui/src/workspace-file-tree/useWorkspaceFileTreeData.ts`、`packages/services/src/fileWatcher/fileWatcherService.ts` 的订阅与合批交互 | 沿用显示目录订阅、150ms 宿主/300ms UI 合批与两读预算；Mira 独立宿主服务绑定 grant/session/root、复核 inode/别名关联、缺失目录祖先恢复及重载清理。普通文本预览自动更新是 Mira 扩展，上游普通文本预览不自动监听，不能声称相同实现 |
| `apps/harness-react/src/components/workspace/WorkspaceEditorButton.tsx`、`hooks/useWorkspaceEditors.ts`、`lib/workspace-editors.ts`、`styles/workspace-editors.css` | `packages/ui/src/WorkspaceEditorButtonGroup.tsx`、`workspace-file-tree/WorkspaceFileTreeRowView.tsx`、`PreviewPane.tsx` | 28+20px 分体入口、160px 菜单、树的打开方式子菜单、预览 ExternalLink；通过 Mira 第一方协议执行，打开成功后才保存显式选择，失败/回退/迟到选择不覆盖首选项 |
| `electron/services/harnessWorkspaceEditors.ts` | `packages/desktop/src/main/editors.ts`、`openInEditor.ts` | Mira ID、固定 allowlist 与真实工作目录边界；异步探测和 30 秒缓存，macOS 结构化 plist 与有界异步图标转换，Windows 固定 executable、参数数组及 detached GUI 启动；没有移植上游同步转换、远程 SSH/WSL 或账号服务 |
| `apps/harness-react/src/lib/file-search.ts`、`ProjectFileDrawer.tsx`、`styles/file-drawer.css` 的搜索部分 | `packages/ui/src/workspace-file-tree/WorkspaceFileTree.tsx` 的搜索输入及扁平结果交互 | 接入 Mira `files.search` 第一方协议，120ms 防抖、立即清理旧结果、生命周期序号校验、错误重试；文件打开保留搜索，目录打开强制刷新祖先后定位，沿用既有虚拟行和 Radix 菜单 |
| `apps/harness-react/src/components/workspace/FilePreviewPanel.tsx`、`apps/harness-react/src/styles/file-preview.css` | `packages/ui/src/PreviewPane.tsx` 与 `packages/ui/src/components/ui/code-viewer.tsx` | 适配右侧独立只读文件预览、面包屑、复制/加入对话菜单、Markdown 预览与源码切换；调用 Mira 捕获会话的读取协议和既有 Shiki 渲染，源码行采用虚拟列表 |
| `apps/harness-react/src/lib/file-preview.ts` | `packages/ui/src/lib/codeViewer.ts`、`packages/ui/src/lib/path.ts` 与 `packages/ui/src/PreviewPane.tsx` 的文件预览流程 | 参考语言识别、路径呈现与读取生命周期；Mira 独立实现语言映射、面包屑及绝对路径显示、捕获会话的读取助手与响应路径核验；未复制上游完整预览源模型或运行服务 |
| `apps/harness-react/src/components/workspace/MiraImagePreview.tsx`、`lib/image-preview.ts`、`styles/file-preview.css` 的图片画布、`FilePreviewPanel.tsx` 的 SVG 入口 | `packages/ui/src/previewPaneImageContent.tsx`、`PreviewPane.tsx` | 40px 留白、8px 透明棋盘、自然尺寸与 Retina 文件名折算、SVG 适配画布及 image data URI；Mira 增加原生图片解码状态、失败重试、SVG 源码虚拟行及位图文本动作限制。文件名与状态采用 Mira 命名 |
| `apps/harness-react/src/components/composer/HarnessComposer.tsx`、`apps/harness-react/src/lib/model-reasoning.ts` | `packages/ui/src/chat-input-toolbar/ThoughtLevelCycleControl.tsx`、`thoughtLevelOptions.ts`、`modelSelection.ts` | 适配模型与推理工具栏、档位显示和焦点返回；仅暴露 Mira Runtime 支持的关闭/低/中/高，第一方桥保留 `thinkingLevel`，不复制上游供应商配置体系 |
| `apps/harness-react/src/components/git/MiraBranchPicker.tsx`、`git-controls.css`、Composer 项目条与 `TaskSummary.tsx` 的环境区 | `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`、`packages/ui/src/v4/ConversationStatusPanel.tsx`、`packages/ui/src/GitActionMenu.tsx` | 参考 Composer 和悬浮摘要中的分支入口；Header 目录提示保持只读。使用 cmdk 1.1.1、Radix 与 Lucide 实现搜索、当前分支、工作树状态、创建及失败重读；宿主快照和项目忙碌守卫由 Mira 独立实现，不强制切换、不 stash、不丢弃更改；cmdk MIT 原文保留在 `../cmdk/LICENSE.md` |
| `apps/harness-react/src/components/session/SidebarCollectionSection.tsx`、`SessionSidebar.tsx`、`session-groups.ts`、`sidebar-preferences.ts`、`styles/session.css` | `packages/ui/src/WorkspaceGroupedTasksSection.tsx`、`workspace-grouped-tasks/view.tsx`、`group-item.tsx`、`task-item.tsx`、`hooks/useGroupedTaskView.ts`、`task-context-menu-content.tsx`、`types.ts` 与 `WorkspaceSidebarItem.tsx` | 改编独立自定义组的名称/颜色/折叠/任务移动/解散，以及项目 hover 新任务/文件树/更多的交互结构。2026-10-10 补任务跨组、展开首尾/空组、折叠组前后根层落点及任务/组根层交错排序，拖组仅临时折叠，取消不写入；Mira 使用 dnd-kit 的指针/键盘与 DragOverlay、偏好原子保存/失败回滚和后续修改保护，主进程保留根层草稿并过滤已删除任务 ID。保留历史的项目隐藏不调用破坏性删除，不复制上游组服务或工作区 Runtime；实际页面与性能结论仍以首屏记录为准 |
| `apps/harness-react/src/components/search/HarnessCommandCenter.tsx`、`command-center-query.ts`、`command-center.css` | `packages/ui/src/command-center/CommandCenterDialog.tsx` | 改编命令/对话/文件分类、搜索结果与键盘选择；Mira 用自己受控桥的正文搜索和授权目录文件搜索，由 Shell 与侧栏共用入口；未移植完整导航/搜索历史 |
| `apps/harness-react/src/components/automations/AutomationsView.tsx`、`AutomationEditor.tsx` 与对应样式 | `packages/ui/src/settings/AutomationsSection.tsx`、`AutomationEditView.tsx` | 改编任务列表、编辑与运行记录主视图；任务、触发、启停/运行/重试/停止和草稿使用现有 Mira scheduler/存储与第一方桥，不复制 ZCode 云端调度/工作流引擎 |
| `apps/harness-react/src/lib/app-navigation-history.ts`、`state/workbench-navigation.ts`、`HarnessWorkbench.tsx`、`src/platform/appNavigation.ts` 与 Vue Shell/Frame | `packages/ui/src/lib/taskNavigationHistory.ts`、`app-shell/useWorkspaceTaskNavigation.ts`、`DesktopTopOverlay.tsx` 与 `shared/shortcutCommands.ts` | 改编 50 项任务/自动化/市场历史、前进后退和平台快捷键。Mira 独立实现成功后提交游标、草稿保存与打开失败保护、删除取消、受控 MessageChannel 和设置往返快照；新对话/自动化草稿在历史栈外，快照不含正文，不移植上游任务缓存、RPC 或插件设置业务 |
| `apps/harness-react/src/components/extensions/SkillMarketView.tsx` 与 `skill-market.css` | `packages/ui/src/settings/PluginStoreListView.tsx`、`PluginStoreDetailView.tsx` | 改编搜索/已安装条带/目录/详情布局；Mira 固定公开 Skill 来源与真实 `SkillStore` 安装，不复制上游私有市场、计费或插件包。市场内容的独立来源/许可见 `third-party-licenses/skill-marketplace/` |
| `apps/harness-react/src/components/conversation/ConversationTurnRail.tsx`、`TaskSummary.tsx` 与 `conversation-model.ts` | `packages/ui/src/v4/ConversationTurnNavigator.tsx`、`ConversationFileSummaryPanel.tsx` 及用户提供的实际工作台画面 | 参考真实轮次 hover/定位与悬浮摘要交互；状态投影、计划/子任务/变更与操作由 Mira 独立实现，缺失 reasoning/完整工具数据不造假；不复制上游完整 conversation renderer 或反馈/分享后台 |
| `apps/harness-react/src/components/conversation/AssistantMessageParts.tsx`、`run-progress.tsx` 与 `styles/thread.css` | `packages/ui/src/v4/ConversationRowView.tsx` 的 ReasoningRow/ToolCallRow 及共享工具行 | 参考有序正文/折叠公开思考/工具参数结果与内联审批表现；Mira 独立 parts 契约与数据库 JSON 持久化，使用实际 pi-ai 公开事件及工具调用身份；子对话复用相同渲染器和严格 run/child 归属。旧消息兼容，公开思考和工具文本有界，不暴露系统提示、私有引擎消息或附件临时 prompt，不移植上游 Runtime |
| `apps/harness-react/src/components/composer/HarnessMessageQueue.tsx`、`HarnessComposer.tsx` 与 `styles/composer.css` | `packages/ui/src/v4/ConversationQueuePanel.tsx`、`ConversationComposer.tsx`、`SessionPane.tsx` 的运行中入队/撤回/排序/立即发送/暂停发送确认交互，以及 CLI `session-flow.ts` 的保留队列语义 | 改编队列面板、dnd-kit键盘排序、修饰键立即发送与Radix暂停确认；Mira独立实现宿主FIFO/完整输入冻结/撤回草稿恢复/原子预占和admission后清空/停止暂停与受控桥，renderer重载复用提交身份。待发送队列仅进程内；本轮引导适配见下一行 |
| `apps/harness-react/src/components/conversation/MiraPendingGuides.tsx`、`HarnessComposer.tsx`、`conversation-model.ts` 与 Vue General 设置 | `packages/ui/src/v4/ConversationPendingGuideList.tsx`、`ConversationRowView.tsx`、`ConversationComposer.tsx`、`composer/followupModeSettings.ts`；语义参考 CLI `runtime/methods/turn-guide-drain.ts`、`turn-tools.ts`、`turn-stop.ts` 和 `steering.ts` | 改编运行中引导/队列偏好、修饰键反转与内联待应用用户行，使用 Mira 命名和 Radix/Lucide。实际 Agent.steer、整批工具结束后消费、消费确认、同run分段持久化、停止转暂停队列、权限/模型/附件不兼容回退、快照游标恢复均为 Mira 独立宿主/Controller 实现，不复制上游 Runtime；待应用引导不伪装成已消费消息。验证状态由首屏文档维护，不声明原生或完整同态通过 |
| `apps/harness-react/src/components/composer/ComposerSuggestionPanel.tsx`、`ComposerControlHint.tsx`、`useComposerCatalogs.ts`、`HarnessComposer.tsx` 与 `lib/prompt-input-triggers.ts` | `packages/ui/src/mentions/activePromptInputToken.ts`、`MentionPlugin.tsx`、`SlashCommandPlugin.tsx` 及已装载输入框的引用/命令交互 | 参考 caret 触发、同 token 内纯光标移动保留查询/替换范围/高亮与完整范围确认；Mira 快照独立绑定 owner/正文，canonical token 替换保留前后草稿和既有行内引用。显式 `+` 将焦点交给同一 Radix Popover，Escape 恢复原选区，键盘和输入法/迟到焦点保护由 Mira 实现。发送偏好来自统一宿主，不移植上游多模态或插件业务；运行队列/引导的独立适配见前两行 |
| `SessionSidebar.tsx` 的工作台快捷键、`HarnessWorkbench.tsx` 提示与 Vue `SearchBar/index.vue` 搜索别名 | `packages/shared/src/shortcutCommands.ts`、`packages/ui/src/hooks/useAppKeyboard.ts` 与 `App.tsx` 的 toggleSidebar/command center 绑定 | 参考 B 切侧栏与 Shift+P 搜索别名，Mira 复用 K/Shell/侧栏的应用所属搜索与 MessagePort。普通 Lexical PlainText Composer 的 B 在 capture 一次消费；文件编辑器/终端保留原生 B，是明确的 Mira 差异。模态/菜单、输入法、repeat/已消费事件守卫和 hover/focus 提示独立实现，不复制上游完整键盘注册体系 |
| `apps/harness-react/src/components/session/`、`components/composer/`、`components/workbench/`、`components/workspace/` | ZCode 桌面应用的任务侧栏、起点、输入区、资源面板；源码 `packages/ui` 对应区域 | 根据 Mira Harness 已有能力适配交互与布局；Mira 组件、文件与业务变量保持本项目命名 |

本表最后一行记录界面参考范围，不声称完整复制了上游 Agent Runtime、账号服务、
订阅、远控或其他尚未接入的业务能力。实际完成状态由 Mira 进展文档与运行验收记录维护。

2026-10-10 工具批次追加：Mira 原创 `agentTools.createSandboxedEnv` 仅为当前环境自己创建的完整命令日志登记精确 canonical 普通文件，支持框架长输出 spill；不授权临时目录、其他环境或替换的符号链接/目录。cleanup 撤销登记，不声明日志自动回收或 OS 沙箱。命令错误已包含输出前缀时不重复渲染，失败浮层仍使用完整真实错误。这些适配不复制上游 Agent Runtime。

## 2026-10-09 首屏实现增量

本批将侧栏、对话与 Composer 作为同一主线实施，来源映射见上表；不是新的原创视觉方案，也不是完整 ZCode 商业业务移植。实际已接入独立任务组与项目菜单、归档/排序、共享搜索中心、React 自动化/Skill 市场主视图、轮次定位/状态摘要和 caret `@`/`/`/`$`/`+`。改编组件保留必要上游版权与 Apache-2.0 声明，Mira 文件/业务名称不照搬 ZCode。

Mira 原创宿主适配包括第一方参数白名单/双解析、项目原生选择与打开、偏好串行保存/晚到读取保护、组任务保留、对话正文查询、现有自动化 scheduler 调用，以及市场有界下载、Git blob hash/大小核验、授权复核和原子发布。这些能力不依赖复制上游 RPC 或 Runtime。

市场目录固定到 `anthropics/skills` commit `683bc88e56f3e09ba94f7055977f3d3aa499f202`，来源清单在 `electron/services/marketplace/curated-skill-source.json`；只从固定 `raw.githubusercontent.com` 地址下载该 commit 的文件，不再依赖匿名 GitHub API，也不自动跟随 main。审核的 19 个目录中，仅 14 个包级 Apache-2.0 包可安装；特殊非开源/无许可条目排除，保留完整包、许可、上游第三方声明和来源记录。MCP 仅管理 Mira 已有本地配置，不表示具备在线 MCP 市场；Skill 文件不按 UI 文件重命名规则改写。

本批限定回归与生产 React opaque iframe headless 有记录，正式桥/parser 在隔离 fixture 下执行；最新检查、截图及最后评审统一见 [首屏总记录](../../docs/MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)，不重复旧样本数字。市场浏览器样本通过本机临时显式代理访问真实公开来源并写入隔离 `SkillStore`，不称 raw 直连或 native Electron 下载通过。桌面访问使用 Electron `net.fetch` 遵循已有系统代理，不修改系统设置；当前系统代理关闭，完整原生网络仍需实测。浏览器检查不等于新的 Electron grant/preload/IPC、实体鼠标/键盘、ZCode 同态、真实模型或性能放行。

2026-10-09 20:14追加队列与父任务有序执行数据链，20:46补修饰键原子立即发送与暂停确认；本轮追加引导偏好与待应用消息，来源见上表。公开思考仅保证当前provider API key跨chunk隐藏，不声明任意凭证全面脱敏。终态渲染身份与会话级WeakMap是Mira独立适配，不复制上游完整renderer或持久化UI状态。多模态、阅读恢复/线程虚拟化、导航/搜索历史、完整同态截图与性能继续留待首屏主线，不宣布完整对齐。未移植的ZCode云账号、订阅、云分享、Goal、远控、画板与工作流不作为已完成能力；历史文件批次的通过范围不扩大。

## 2026-10-08 第二批增量

当前验证索引：[收尾增量](#2026-10-08-收尾增量) 为 80 文件/458 项；下述 80/455 和 React 构建字节保留修复前批次。

当前变更未提交、未推送。本批已完成来源映射与适配；桌面已通过标签排序/关闭/历史隔离、
最近关闭终端的 PTY 回收与重建、iframe 快捷键、附件去重/移除及跨会话发送/失败恢复。
模型 reasoning 能力控制入口、A/B 高低档位导航与重启恢复、C 未发送草稿/附件重启恢复、
活动终端自动连接、PTY 单独空格/Enter 和标签 Enter 激活/Space 排序通过。launcher 原生拖宽从
420px 单列/48px 行切到 559px 三列/88px 卡片；深色完成态 token 实际颜色与原生代码复制通过。
正式 Harness iframe 的剪贴板写授权不开放读取、不改变 sandbox。失效文件的具体错误、草稿/chip
恢复与实际重发通过，实际请求确认推理 low/high。收尾修复前 80 文件/455 项测试、React/Vue 类型检查、
`git diff --check` 和两次正式 React 构建通过；静态 3 JS/1,959,740 bytes，全部 287 JS/9,483,981 bytes，239 动态引用
齐全，磁盘/内存 SHA-256 一致，旧块残留 0。

原生 Tab 补全与 Enter、`Ctrl+@` NUL（`od` 输出 `00`，`stty` 恢复）和新任务无 M 水印已验证；
macOS 拦截的 `Ctrl+Space` 不列为通过。

侧栏原生重命名/归档/二步确认删除已通过，Header 与 Sidebar 一致、无旧任务残留；实际 Vue
模板 SSR 的三组 manifest 剪贴板回归 3 项通过，仅 Harness write-only，无 read/same-origin，
该回归已纳入最终全量。

剩余：首次高亮长任务/布局跳动的 profile、可靠进程冷启动与安装包性能。普通文件下批按
上游先左侧树抽屉/独立预览 tab/Radix 菜单/树键盘/加入对话，再 watch/search/外部编辑器，
不默认内置编辑器。插件市场、
BrowserView/CDP 不列为完成。

下次从正式 `/workspace/harness-react` 复验这些项目，完成/剩余清单见根 `DESIGN.md` 的第二批增量；
实际操作证据继续维护于 `docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md`。

## 2026-10-08 收尾增量

Mira 原创宿主 `platformIpc` 使用 WeakSet，每个 WebContents 一次 `destroyed` 钩子，共同清理 grant/PTY；此生命周期修复无需新增 ZCode 来源映射。14:11:38 全量 80 文件/458 项在 3.79s 通过（`platformIpc` 16 项、新增 3 项），React/Vue 类型检查重新通过，`git diff --check` 通过；React 资源未变、未重建，14:02:52 字节证据不改。

隔离开发 Electron 原生 12 次设置往返及 16 次终端建立/关闭均通过，无监听超限警告；离开时存活 PTY 回收，返回正式输入区无非空 alert。清理恰好一次/不同窗口隔离仅单测验证，不算原生多窗口或安装包验收。下一入口保持高亮 profile 和文件树/独立只读预览，发布边界不变。当前未提交、未推送。

## 2026-10-08 文件工作区增量

本批来源映射覆盖左侧文件树抽屉、右侧独立只读预览及两个数据助手，
保留上游 Apache-2.0 版权与改编标记，应用名称、组件和状态使用 Mira 命名。
文件操作继续通过 Mira Harness 宿主协议执行；路径拼接仅用于显示和复制，
不替代宿主对工作目录范围的校验。

文件树和源码行虚拟化引入直接依赖 `@tanstack/react-virtual` `3.14.13`，
其已安装依赖 `@tanstack/virtual-core` 为 `3.17.11`。两包均为 MIT；
各包已安装版本附带的许可全文及版权分别保留于
[`../tanstack/react-virtual/LICENSE`](../tanstack/react-virtual/LICENSE) 和
[`../tanstack/virtual-core/LICENSE`](../tanstack/virtual-core/LICENSE)，
用途及版本核验见 [TanStack 来源说明](../tanstack/README.md)。

本节记录来源与适配范围，不作为桌面运行、安装包、Windows 或功能验收通过声明；
文件监听与外部编辑器仍由后续宿主协议与验收记录维护。全工作区搜索已在下述增量接入。

## 2026-10-08 文件搜索与保存增量

搜索评分及 top-K 的上游归属见改编表与宿主文件头；原许可证和 NOTICE 原样保留。
完整扫描含隐藏目录、`.git` 和 `node_modules`，不创建或解析忽略文件。
未授权根目录和目录符号链接不作为递归扫描入口；返回候选再次检查实际路径。
目录读取失败时整次搜索失败，不返回不完整成功列表。缓存与异步调度为 Mira 的宿主适配。

工作区偏好读取、按 key 顺序保存和路由离开前等待最新快照，是 Mira 既有宿主/React
协议的修复，不复制上游偏好服务。测试、原生验收与剩余边界由
`docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md` 维护；本来源记录不单独宣告整体对齐完成。

## 2026-10-08 文件监听与外部编辑器增量

来源和 Mira 改编边界见上表。`harnessWorkspaceWatch.ts` 的授权、路径复核与生命周期管理为
Mira 宿主实现，不复制上游 Runtime。外部应用图标在运行时读取本机已安装的应用，
不将 Finder、Trae 等图标作为 Mira 静态资源重新分发；检测失败仍保留应用名称与打开能力。
实际自动化检查和原生桌面证据由对齐/性能文档维护，本来源说明不宣布整体对齐或发布完成。

## 2026-10-09 位图与 SVG 预览增量

图片画布的上游来源与改编标识见上表和文件头。`files.read-image` 的固定 4 MiB
有界 file-handle 读取、前后身份检查、工作目录约束与错误脱敏是 Mira 独立宿主实现；
SVG 继续使用既有文本读取，并以独立 `<img>` 展示，不作为内联 SVG DOM 执行。
该历史批次没有移植上游完整媒体协议、远程工作区、Office 或多模态模型附件；2026-10-10 新增图片/文本模型附件及图片组预览的范围见本表，不扩大为视频/PDF 已完成。
验证范围及未完成原生桌面验收由 Mira 的阶段证据文档维护，本说明不作功能放行声明。

## 声明的保留与命名

2026-10-09 高亮 Worker 增量：协议、队列、取消确认、缓存共享与完整源码 key 均为 Mira
独立实现；`MiraStreamingCode.tsx` 使用 Streamdown 公开容器/标题/复制/下载组件，不复制
上游 renderer 源码。Shiki/engine MIT 原文另存 `../shiki/LICENSE-MIT`；实际内联 WASM
与 `vscode-oniguruma` 1.7.0 原包的 SHA 完全一致，其 Microsoft MIT 与 Oniguruma BSD-2
通知在 `../oniguruma/` 原样分发。此来源记录不声明计算速度、渲染性能或原生功能放行。

2026-10-09 搜索规则增量：`electron/services/harnessWorkspaceIgnore.ts` 的模板、默认规则和分区变换
改编自 `packages/services/src/file/workspaceFileIgnore.ts`，保留 Apache-2.0 与版权标识。
`harnessWorkspaceSearch.ts` 的规则指纹/剪枝与 Vue `/settings/file-search` 的编辑、同步、恢复、保存交互参考
`packages/services/src/file/fileService.ts` 和 `packages/ui/src/settings/WorkspaceFileSearchSection.tsx`。
名称、分区标记、固定路径、会话/项目授权、有界 UTF-8 读取、no-replace 初始化、revision/草稿保护是 Mira 适配。
上游隐藏该设置入口，Mira 有意在 Vue 平台设置开放；缺失标记报错保留内容，不复制上游静默重建行为。
`ignore` 7.0.5 的 MIT 原文另存 `third-party-licenses/ignore/`；不将规则过滤称为文件权限边界。
来源记录不作原生、性能或整体功能放行声明。

2026-10-09 Git 增量：上表及 `lib/file-git.ts` 保留改编声明。宿主
`harnessWorkspaceGit.ts` 是 Mira 独立的异步 `execFile` 实现，使用 NUL 状态和 ignored
解析、会话工作目录范围、根目录/元数据前后身份复核、2 在途命令/16 等待队列、
10 秒超时和每个输出流 8 MiB 上限；不复制上游行式解析或同步 Git 服务。
当前刷新来自初次、手动及既有工作目录通知，未移植上游 Git 元数据监听服务。
自动检查、headless 与原生桌面验收各自以阶段证据为准，本说明不作整体放行声明。

2026-10-10 任务查找与搜索历史增量：`MiraConversationFindBar.tsx` / `conversation-find.css`
参考 `packages/ui/src/quickpick/TaskFindDialog.tsx` 的 chat 非模态放置与键盘/范围交互；
`lib/conversation-find.ts` / `conversation-find-dom.ts` 改编自 `packages/ui/src/v4/conversationFindIndex.ts`
和 `conversationFindHighlightDom.ts`，保留 Apache-2.0 与原版权。Mira 使用实际展示文本投影、跨 Text 节点 Range、
当前历史虚拟化导航和已有文件差异视图，不复制上游源码计数/单节点高亮不一致的路径。
Command Center 历史参考 `packages/ui/src/command-center/commandCenterSearchHistory.ts` 与
`CommandCenterDialog.tsx`；Mira 沿用受控偏好桥、按工作目录隔离、异步保存保护，动作成功才记录。
原始法律文件保持不变，本来源记录不代表原生同态或整体功能/性能验收完成。

2026-10-10 主/旁 Escape 停止作用域：参考 `packages/ui/src/v4/composer/escapeStop.ts`
的焦点及已消费键盘事件边界。Mira 沿用已有 Controller 和停止桥；只有当前对话的非模态查找
阻止停止，另一对话的查找不阻止。模态窗口、其他 dialog 和打开的 menu 继续保护。

2026-10-10 旁路消息操作：对齐 `SessionPane.tsx` 的 `selectionSideChat` 约束，
旁路保留复制与继续发送，不提供历史编辑或回复重新生成；主任务的相应操作保持。

2026-10-10 主动停止活动状态：参考 `conversationTurnWorkSegments.ts` 与
`conversationAssistantWorkItems.ts` 对中断/取消和错误的区分。Mira 的运行器自行将主动
停止的活动结算为stopped，执行详情显示“已停止”，摘要用中性停止图标；真实失败活动不改写。
委派智能体也按同一语义结算正在执行的工具活动；超时、真实失败和意外中断仍保留异常，
迟到事件不重新激活已经停止的智能体。

2026-10-11 工作区浏览器工具栏与失败恢复：参考 `EmbeddedBrowserPaneParts.tsx`、
`embeddedBrowserHelpers.ts` 与 `browser-use/UnifiedBrowserView.tsx`。
`MiraBrowserToolbar.tsx`、`mira-browser-address.ts` 保留 Apache-2.0 归因；Mira 用
Radix 菜单与提示、现有设计令牌及按任务/资源授权的桥适配导航、默认浏览器和开发者工具。
本机/私网地址默认 HTTP，公网默认 HTTPS；Mira 继续限制 HTTP(S) 和无凭据地址。
主页面失败保留到下一次加载，子框架失败与取消导航不覆盖页面；错误画布支持原地址重试。
自由尺寸、元素选择和 favicon 尚未在此批次接入；此记录不代表浏览器整体对齐完成。

2026-10-11 浏览器页签图标续批：参考 `UnifiedBrowserView.tsx` 的同步 guest
`page-favicon-updated` 监听与 metadata 归属，Mira 使用 HTTP(S) 无凭据图标、按任务/资源
事件与既有 workspace 偏好保存；完整导航清旧图标，图片失败回退地球图标，最近关闭恢复
保留图标。未引入上游 residency API，不扩大为自由尺寸/元素选择或驻留验收。

本批验证：Mira 图标事件、URL 归属与恢复已在明暗隐藏 Electron 中通过；OS 外部窗口、前台 DevTools、自由尺寸/zoom 和元素选择仍不算原生同态验收。

2026-10-11 Composer 技能引用：参考 `mentions/providers/skillsMentionProvider.ts`、
`MentionPlugin.tsx`、`lib/slashApplyMentionPayload.ts` 与 `services/src/skills/skillsService.ts`
的“选择后插入引用、随消息激活”交互。Mira 使用自己的 `mira-skill:` 稳定目录身份、
Lexical 引用节点、第一方白名单 `skillIds` 与队列 fingerprint；不复制上游变量/文件名或
把目录路径当作执行授权。输入和已发送正文显示技能标签，删除/撤销、重试/重载与撤回恢复
保留身份；引用对话中的技能文字不自动激活。运行中新技能引导降为下一任务，旧会话选择
兼容保留；计划模式继续沿用现有不注入技能的策略。本段记录实现范围，不宣称原生同态验收。

2026-10-11 对话引用入口：参考 `lib/promptInputTriggers.ts` 与 `MentionPlugin.tsx`
的 `#` 对话候选入口。Mira 扩展现有 caret token/替换与分类面板，以同项目的真实对话正文
和已有 owner/revision 保护插入；不扫描文件或加载技能/MCP目录，不自动发送。
保留现有 `@` 对话选择作为兼容入口，不直接采用上游 session 协议或任意跨项目查询。

2026-10-11 对话范围续作：参考 `mentions/mentionPanelRouting.ts` 与
`mentions/providers/sessionsMentionProvider.ts` 的同authority跨workspace候选、当前workspace
优先、更新时间排序和每workspace 20项上限。Mira仅使用既有本地Controller索引，不查询
其他Host；`@` 保持当前项目，`#` 展示本地项目名称并可搜索，过滤后按项目限制候选。
引用仍读取Mira正文，保留当前草稿owner/revision校验，不移植上游store/protocol。

2026-10-11 任务摘要长待办：参考 `v4/ConversationStatusPanel.tsx` 的六项折叠阈值、
三项当前窗口、临近结尾回补和前后分组 HoverCard。Mira 用真实 run activities，
移除 `set_plan` 归一化的六步静默截断；保留简洁计划建议，不移植上游 TodoWrite 协议。
预览随计划快照和任务切换销毁，支持悬浮、焦点打开、方向键/翻页键滚动与 Escape 返回。

2026-10-11 上下文用量与排队压缩：参考 `chat-input-toolbar/contextUsage.tsx`、
`v4/SessionPane.tsx` 和 `zcode-protocol-v4/commands/handlers/goal-compact.ts`。
Mira 使用已有 Radix Popover、真实上下文用量和 SDK 摘要器，独立实现悬浮/焦点/点击详情、
估算/实测说明和压缩入口，不移植商业配额、TokenLens 或第三方 Context 组件源码。
压缩操作采用明确队列类型，运行中/审批中/暂停队列按 FIFO 追加，冻结模型和目录并重验
第一方授权；失败/停止保留原上下文与命令，不添加聊天消息。队列仍为进程内，非原生同态验收。

2026-10-11 标题栏/侧栏执行详情：参考 `WorkspaceHeaderSections.tsx` 的
`onViewModelTrajectory` 任务菜单入口。Mira 复用既有运行活动面板及导航事务，
展示当前/最近历史运行的活动、工具、子智能体和真实用量；不移植商业反馈接口，
不将运行活动冒称完整模型请求/响应轨迹。两类 Radix 菜单共用入口，迟到导航
不能覆盖新任务；无记录显示空态，不创建会话或执行模型。

2026-10-11 摘要阅读区域边界：参考 `v4/ConversationStatusPanel.tsx` 的限高与
两层滚动结构。Mira 将悬浮摘要置于实际对话阅读区域，使用CSS flex限制外层高度，
保留内部各区块滚动、mini/panel/auto及独立键盘焦点；多行Composer和底部终端
变化时不遮挡输入。空间不足140px时以container query显示胶囊，保留所选模式；
ResizeObserver仅在被隐藏面板拥有焦点时归还胶囊，不执行React逐帧尺寸更新。

2026-10-11 Composer补全焦点：参考 `SlashCommandPlugin.tsx` 与
`mentions/MentionPlugin.tsx` 的失焦关闭行为。Mira将键入触发的候选面板绑定到
实际Lexical编辑器焦点和编辑器身份；刷新或切任务恢复草稿不主动打开候选，
失焦收起且不抢外部焦点。显式＋菜单继续独立持有焦点和插入选区，保留
匿名草稿提升时的编辑器身份、原子引用、键盘/IME与草稿协议。

2026-10-11 插件命令：参考 `packages/services/src/commands/commandsService.ts`、
`packages/ui/src/SlashCommandPlugin.tsx` 及 CLI contracts/commands、
custom-command-prompt/expand 的目录、命名空间、原子命令和参数语义。
Mira 使用自有注册存储、YAML读取、单次参数替换及受控宿主发送；命令选择
不执行，原始斜线保留在对话，展开正文随消息保存为模型上下文。队列执行前
复核启用状态、目录和正文；重试/编辑/旁路/自动化复用原有权限和审批。
模型/工具覆盖、Shell动态展开及未支持元数据明确禁用，不执行安装Hook。

2026-10-11 目录不可用提示：参考 `WorkspaceSidebarItem.tsx` 的readOnlyReason、
可键盘聚焦的目录警告及禁用原因。Mira使用实际directoryExists快照，保持
历史可读、元数据改名/隐藏；新任务/文件树/原生打开禁用并给出恢复原路径提示。
不复制远程重连、RPC或工作区权限实现。

2026-10-11 折叠集合提示：参考 `WorkspaceSidebarItem.tsx` 的折叠未读指示。
Mira按集合实际成员汇总未读，并扩展现有任务的执行中/待确认状态；不移植
上游workflow计数或伪造工作流能力。展开后恢复逐任务提示，折叠/查看提示
不打开任务、不标记已读；标记复用已有token、图标和Radix Tooltip。
项目/分组操作只在悬浮、焦点或菜单展开时占用宽度，空闲时让出项目名称空间。

2026-10-11 Composer历史输入：参考 `packages/ui/src/lib/promptHistory.ts`、
`promptHistoryStorage.ts` 和 `LexicalChatInput.tsx` 的空输入/翻阅状态及键盘优先级。
Mira独立实现Electron SQLite按实际目录存储、最近30条、连续去重和有界载荷；
仅记录已接纳输入，发送重放不重复记忆，保留原Admission Promise。
React只在空正文或翻阅状态处理无修饰↑/↓，编辑退出、候选与IME优先，
回忆斜线不自动展开候选；主/旁对话共享目录历史但保持独立草稿及现有附件。
不复制上游localStorage、不回放旧网页快照和附件，不新增渲染器任意目录读写。

2026-10-11 内置/插件智能体模型覆盖追加：参考上游 `SubagentModelOverrideControl`
及 `subagentsService` 的独立用户配置语义。Mira 使用全局 SQLite preferences
按内置角色或插件 ID 与完整 Agent 名分别保存模型/推理覆盖，原插件正文不改写。
Vue 行内选择即改即存，失败恢复所属行并保留其他草稿；真实子任务在启动、锁后及
审批后复核配置和模型可用性，失效覆盖拒绝执行，不静默继承父任务模型。

2026-10-11 智能体表单追加：参考上游 `packages/ui/src/settings/SubagentsSection.tsx`
的名称、用途、颜色、模型、推理强度、工具、系统指令与 AGENTS 继承表单语义。
Mira 在 `src/pages/backend/agents/index.vue` 中复用 Element Plus 设置组件，
`src/config/miraUserAgentEditor.ts` 仅补丁修改已改变的 YAML 字段，保留正文与注释。
模型来自 Mira 实际宿主目录，工具声明不能扩张实际角色权限；未知字段继续高级编辑，
不引入上游账号、运行时或尚未支持的 MCP、后台运行等配置。

2026-10-12 目标/计划互斥与 Composer 子任务入口：参考上游
`packages/ui/src/v4/SessionPane.tsx` 的 Plan 下目标恢复门禁和
`packages/ui/src/v4/composer/ConversationBackgroundWorkTrigger.tsx` 的真实后台工作计数。
Mira 的命令与摘要恢复入口在计划模式下均阻止恢复并保留草稿；
主/侧任务 Composer 只汇总各自实际 activeRun 中排队、运行和停止中的子智能体，
单个进入既有子任务详情、多个进入既有执行面板，点击前复核会话/运行身份。
没有任务即隐藏，不移植上游 workflow/后台 bash 协议或虚构计数。

2026-10-12 插件 Hook：参考上游 CLI `adapters/src/plugins/hook-sources.ts` 与
`plugins/index.ts` 的默认文件、manifest 声明、来源去重和事件明细，以及
`core/src/hooks/configured-runner-input.ts` 的插件环境和 argv 上下文。
Mira 在 `miraPluginHooks.ts`、`HarnessHookCatalog` 和既有 Hook runner 中适配，
已安装详情与 Vue Hooks 设置复用各自组件；插件 Hook 必须经宿主审阅授权，
第三方声明不被修改。每次执行复核冻结身份、根路径、启用、声明版本及信任，
保留 Mira 变量并支持上游兼容变量，命令 Shell 使用环境展开避免路径被解释为代码。
未支持类型明确诊断；本切片仅接主任务既有七事件，不移植工作流或子任务新事件。

- 2026-10-12：插件试用入口参考 `packages/ui/src/settings/PluginStoreDetailView.tsx`
  与 `PluginStorePage.tsx`，卡片、详情和已安装列表交给 Mira 既有新建任务导航，
  复用 Composer 的 canonical 插件引用，保留已有任务草稿，不自动发送或启动模型。
  停用/失效插件不允许试用；提交待确认与导航失败保稿，重复添加去重。

- 2026-10-12：项目音视频侧面板参考 `packages/shared/src/media-preview.ts` 和
  `packages/ui/src/previewPaneMediaContent.tsx` 的格式分类、原生播放器及加载/错误状态。
  Mira 使用宿主授权目录、随机逐文件句柄及支持 HTTP Range 的 loopback 流式读取，
  不把绝对路径或整个媒体文件交给渲染器；切换/隐藏/关闭暂停并释放授权，返回保留进度。
  不移植上游 Tauri 文件协议、不将预览冒称模型音视频附件，编码不支持明确提示重试或外部打开。

- 2026-10-12：PDF 侧面板参考 `previewPanePdfContent.tsx` / `components/ui/pdf-viewer.tsx`，
  使用同版 react-pdf 10.4.1 与 PDF.js 5.4.296，Mira 命名和授权 Range URL；
  单页、翻页/页码/缩放/适合宽度/文本选择/密码及错误重试，隐藏释放授权。
  worker、CMaps、标准字体和 WASM 随 React 包分发，不依赖 CDN；依赖 LICENSE 与资产内许可保留。

- 2026-10-12：Word/Excel侧面预览参考 `previewPaneOfficeContent.tsx`、
  `previewPaneOfficeDocxContent.tsx`、`previewPaneOfficeXlsxContent.tsx` 和
  `lib/officeFilePreview.ts`。沿 docx-preview 0.4.0 / react-xlsx 0.16.0，Mira使用
  授权完整二进制读取、25MiB输入上限、ShadowRoot样式隔离与受控浏览器外链。
  XLSX构建时仅适配opaque worker初始化队列与canvas链接两个接缝，不写vendor源文件；
  本地worker/WASM及docx-preview/react-xlsx/JSZip/fflate/duke-sheets许可随包保留。
  不移植Tauri/base64文件接口，不将Office预览冒称模型附件或完整Office兼容。

- 2026-10-12：旧DOC与PPTX继续参考上游Office预览分派及阅读器交互，
  Mira分别使用固定react-docx 0.8.1 / pptx-renderer 1.2.4；自有命名、授权二进制读取、
  本地Word worker/WASM、只读分页及PPTX懒缩略图/翻页/缩放/受控链接，不复制上游文件接口。
  Word构建仅适配worker构造与禁止主线程fallback两个接缝，不写node_modules；
  react-docx、pptx-renderer及ECharts LICENSE/NOTICE/d3、zrender、tslib、pretext、
  fast-png/iobuffer、utif/pako等所需原许可随React发布包保留，不改签为Mira MIT。
  PPTX元素模型/索引仅为后续基础，不声明已交元素AI编辑或PDF导出。
  目标首层入口参考上游新任务加号菜单，Mira只插入原生命令，不自动替换既有目标。

- 2026-10-13：桌面界面动画参考上游 `components/ui/tooltip.tsx`、`dropdown-menu.tsx`、
  `context-menu.tsx`、`popover.tsx`、`hover-card.tsx`、`dialog.tsx`、`button.tsx`，以及
  `app-shell/useAnimatedResizablePanel.ts`、`WorkspaceShellLayout.tsx`、
  `lib/documentHiddenMotionPause.ts`（参考提交 `aac4755666d09fdcd70272fcf063c077a639015f`）。
  Mira 在 `motion.css` 中统一 Radix 浮层的短淡入淡出、方向位移与轻微缩放；
  保留 Popper 定位和弹窗居中，Vue 桌面外壳使用对应短过渡。
  侧栏采用一次布局提交后的 Web Animations 位移，工作区沿用有界 flex-grow 过渡，
  补齐结束与中断清理；隐藏文档与减少动态效果关闭动画，并结算有限 Web Animations。
  保留 Mira 原有 Logo、组件、偏好和焦点逻辑，不移植上游应用外壳或持久化协议。

- 本目录 `LICENSE` 与 `NOTICE.md` 是上游根文件的逐字副本，不编辑版权人、条款或正文。
- 改编源码保留原版权与 Apache-2.0 标识，并链接到此目录。
- 实现文件及自定义变量使用 Mira 命名；上游名称仅保留在必要来源与法律声明中。
- Tailwind 的 `--color-*`、`--text-ui-*` 是公开工具类兼容接口，不作为 Mira 内部主题状态名称。
- Mira 原创代码继续使用根 MIT LICENSE；第三方代码不被改签为 MIT。
- 增加上游复制范围或引入其第三方资产时，同步补充本表及相关独立许可证。

2026-10-13：底部终端外观参考 `app-shell/AnimatedTerminalPanel.tsx`、`app-shell/WorkspaceShellLayout.tsx` 与 `Terminal.tsx` 的独立面板边框、4px 拖动间隙和单层内容内边距。Mira 调整自身 HarnessWorkbench 嵌套与 workspace/layout CSS，保留任务所属 PTY、既有面板折叠/高度保活逻辑，未移植上游窗口形状、RPC 或终端动画机制；原 Apache LICENSE/NOTICE 与版权保持。

2026-10-13：流式思考摘要参考 `packages/ui/src/components/ai-elements/reasoning.tsx` 的最新非空行、溢出遮罩和末尾滚动。Mira 沿自身公开 reasoning parts、原生 details 与详情状态记忆实现，保留正文展开/完成状态；新增自有 MiraWorkingIndicator 接入主/侧对话末尾，使用既有任务状态与动画降级机制，不复制 ZCode 的摘要队列动画或国际化/RPC 协议。源文件补 Apache 来源版权，原 LICENSE/NOTICE 保持。

2026-10-13：终端开关动画参考 `app-shell/useAnimatedResizablePanel.ts` 的下一帧尺寸命令、200ms flex-grow 过渡、transitionend/240ms 兜底清理，结合 `AnimatedTerminalPanel.tsx` 的透明度过渡。Mira 在既有 MiraBottomTerminal 内实现，保留自身 px 高度记忆、任务 PTY 与自动折叠规则，仅动画期间排除中间尺寸回调；减少动态效果直接跳过。react-resizable-panels 4.8 的 elementRef 指向外层尺寸容器，动画样式施加于该层；原 Apache 来源版权与 LICENSE/NOTICE 保持。

2026-10-13：PPT 交付卡参考 ZCode lib/assistantFileReferences.ts、lib/assistantPreviewCards.ts 和 AssistantPreviewCards.tsx 的引用候选、存在验证及内部打开语义。Mira 使用自身解析、任务相对目录 listFilesFor 与现有 PPT 阅读器；仅 PPTX，成功同轮 bash 输出可作路径证据，最终文件需实际存在，不复制上游 file stat/RPC 或自动打开队列。解析文件保留 Apache 来源版权，原 LICENSE/NOTICE 不变。

2026-10-13：执行过程标题与分割线、中文时长格式参考 `packages/ui/src/v4/ConversationTurnGroup.tsx` 的 AssistantHistoryStatus 和 `conversationWorkDuration.ts`；思考固定 Brain 图标参考 `components/ai-elements/reasoning.tsx`，思考/工具运行标题改编 `styles.css` 的 animated-gradient-text 与 gradient-flow（4 秒、300% 背景、34/50/66% 色停点）。Mira 保留自身 run 状态、详情折叠/焦点/查找、底部工作提示及减少动态效果机制，不移植上游国际化或 RPC；Apache 来源版权与 LICENSE/NOTICE 保持。

2026-10-13：上下文容量预览参考 `packages/ui/src/chat-input-toolbar/contextUsage.tsx`、`components/ai-elements/context.tsx` 和 `lib/tokenNumberFormat.ts`：320px 宽、12px 内容内边距/圆角、8px 蓝色分段进度、中文 compact 总量与百分比、按来源字符量排序、仅展示至少 78% 的缓存收益。Mira 运行完成后记录自身 agent 消息/系统提示词/技能/系统与 MCP 工具定义字符量和真实 usage 缓存命中率；沿用自身 Popover/focus 与压缩入口，不复制上游额度/RPC 协议或假造缺失来源明细；Apache LICENSE/NOTICE 保持。

2026-10-13：执行过程节奏改编 `ToolCallBlocks.tsx` 的工具首次流式出现记录（最多 800 项、1000ms 清理）、`styles.css` 的 900ms cubic-bezier(0.16,1,0.3,1) 淡入，以及 `ToolCallBlocks/QueuedSummaryContent.tsx` 的 300ms 滚动/500ms 停留、两项待播队列、同 key 原位刷新和超时漂移跳过。MiraStreamMotion 使用 React 状态与原生 CSS 实现同等摘要队列，接入思考最新行与查阅/命令组目标；保留完整正文和调用记录，不引入 motion/react。正文沿上游 message.tsx 的 animated=false/isAnimating=false，未加入上游明确禁用的逐字延时或整段重复淡入；Apache LICENSE/NOTICE 保持。

2026-10-14 侧栏拖拽呈现：参考 ZCode `workspace-grouped-tasks/group-drag-overlay.tsx`、`WorkspaceSidebar.tsx`、`SortableWorkspaceSidebar.tsx` 及 `lib/workspaceSidebarDrag.ts` / `restrictVerticalDragWithinContainer.ts`。Mira 沿现有 dnd-kit、分组偏好和项目顺序接口，复刻同宽 32px 分组／项目浮层、原项隐藏、活动项目临时收起与固定标题高度让位；分组／任务采用 150ms 回落，保留自身任务分屏拖拽与导航。新增 sidebar-drag.ts 保留 Apache 版权与 SPDX，原 LICENSE／NOTICE 保持。

- Sidebar task rows use whole-row dnd-kit activation like ZCode grouped tasks. Mira forwards pointer drops to its own task-grid placement API, retains chronological sort choices separately from dragged scope order, and commits the live preview without a second drop overlay animation.

2026-10-14：对话分屏拖入遮罩参考 `packages/ui/src/v4/WorkbenchPane.tsx` 的 `DROP_PREVIEW_STYLE`，采用 14% 品牌色透明底、34% 内描边、6px 圆角与 4px 边距，移除中央文字；浮动任务行参考 `workspace-grouped-tasks/task-row.tsx` 保留行内图标与标题，Mira 通过 Portal 移出侧栏裁剪层，沿用自身分屏布局、跨项目任务控制器与已有分屏成员去重规则。原 Apache LICENSE/NOTICE 保持。

2026-10-15：关于弹窗改编 ZCode `packages/desktop/src/main/aboutWindow.ts` 与 `about.ts` 的 256×312 独立模态窗口、排版、主题和关闭交互；使用 Mira 图标、实际版本及既有作者信息。帮助与系统菜单共用宿主入口，Cmd+I 保留原设置页跳转；原 Apache LICENSE/NOTICE 保持。

2026-10-15：项目文件树预览参考 ZCode `WorkspaceSidebar.tsx` 的 `onOpenPreview`：预览携带所属 workspace 而不切换当前任务。Mira 使用持久化项目 ID 和宿主复核目录，复用现有文本、图片、媒体及文档预览；跨项目同名文件独立标签，新任务无需创建会话，不把其他项目文件加入当前对话。

2026-10-15：文件树类型图标参考 `workspace-file-tree/WorkspaceFileTreeRowView.tsx` 与 `lib/fileDisplayHelpers.ts`，保留特殊文件名优先、多段配置名逐级回退及扩展名匹配。Mira 使用本地静态 SVG、16px 图标与文档回退，保留自身目录图标、Git 标记及虚拟行交互；Material Icon Theme 图标的独立 MIT 许可与新增素材清单见 `../material-icon-theme/`。

2026-10-15：分屏对话焦点交互参考 `v4/WorkbenchPane.tsx` 的指针/键盘焦点切换和 `INACTIVE_PANE_OVERLAY_STYLE`（34% 背景混合、brightness/saturate 0.94），保持覆盖层不拦截点击；分隔线参考 `WorkbenchSplitDivider.tsx` 的独立拖拽标记，Mira 按需求仅在拖拽时显示线条，标题跟随激活对话。

2026-10-15：共享任务标题栏参考 `app-shell/WorkspaceShellLayout.tsx` 放在分屏内容区之外，拖拽预览、布局和未激活覆盖层仅作用于对话正文；焦点同步参考 `v4/V4WorkspaceChatArea.tsx` 的 `syncShellActiveSession`。Mira 复用已挂载对话的控制器和输入框引用，任务菜单、重命名、终端及资源面板随激活任务切换，分屏布局仍由原任务持有。

2026-10-15：回复链接参考 `components/ai-elements/message.tsx` 的本地文件链接在 Streamdown harden 前解析、独立文件/网页打开回调，以及 `lib/markdownFileLink.ts` 的路径、file URI 与行号处理。Mira 在流式和完成态共用点击捕获，取消普通、修饰键与中键的原生导航；文件交给授权工作目录预览，网页交给所属任务的浏览器面板，保留原 Markdown 安全过滤和宿主路径校验。

2026-10-15：文件树 HTML／HTM 条件菜单参考 `packages/ui/src/workspace-file-tree/WorkspaceFileTreeRowView.tsx` 与 `helpers.ts`（上游 `aac4755666d09fdcd70272fcf063c077a639015f`），沿现有 Radix 菜单补“用内置浏览器打开”和系统文件管理器显示；非当前项目／任务同样可选外部编辑器。Mira 使用自有授权工作目录、独立 loopback HTTP origin、受控浏览器标签与文件来源恢复，不移植上游 file URL／RPC／远程工作区协议，原 Apache LICENSE／NOTICE 保持。

2026-10-15：对话摘要 Git 工具参考 v4/ConversationStatusPanel.tsx 的 GitSection、v4/conversationStatusPanelModel.ts 的工作树变更显示条件、GitActionMenu.tsx 的暂存选择／消息生成／提交推送、GitGraphDialog.tsx 的分页和刷新。miraGitGraphLayout.ts 改编上游 git-graph/layoutAlgorithm.ts，仅替换提交类型导入。Mira 使用自身授权 IPC、项目任务互斥、仓库快照及模型配置；保留无暗色遮罩和悬浮阴影，仓库审阅与提交使用相同根目录，不移植上游 RPC，Apache LICENSE/NOTICE 保持。

2026-10-15：文件交付展示参考 `AssistantPreviewCards.tsx`、`lib/assistantFileReferences.ts`、`v4/ConversationFileSummaryPanel.tsx` 与 `OpenSplitButton.tsx`。Mira 使用自身文件类型图标、Radix 菜单、授权工作区文件校验及现有恢复预览；回复展开列表按文件合并，行数来自宿主保存的本轮首末快照，旧数据缺少快照时不累计中间编辑行数。任务操作历史默认折叠，不移植上游 RPC、远端工作区协议或品牌，Apache LICENSE/NOTICE 保持。

2026-10-20：React 项目编辑、创建及文件夹信任流程参考 ZCode 本地源码 `3c5b2276` 的 `project-sidebar/ProjectEditor.tsx`、`ProjectFolderTrustDialog.tsx`、`ProjectNodeContent.tsx`、`project-storage/project-repository.ts` 和 `projectEditorRoots.test.ts`。Mira 使用当前 React/Radix 工作台、自有 SQLite/授权 IPC 与目录权限模型；取消项目菜单重复重命名，至少保留一个目录。弹窗不加背景遮罩，保留阴影及明暗主题，创建前明确确认信任。主要目录用于新任务，已有任务继续使用原工作目录，回收站保留原还原位置；未移植远程项目协议或多根文件树。

2026-10-20：多目录文件入口、右侧文件管理器与完整视图参考 ZCode 本地源码 `3c5b2276` 的 `project-sidebar/ProjectNodeContent.tsx`、`useProjectFileTree.ts`、`WorkspaceFileTree.tsx`、`lib/workspaceSidePane.ts`、`side-pane-full-view/ConversationHost.tsx`、`model.ts`、`useSidePaneFullView.ts` 及 `docs/ui/workspace-file-tree.md`、`docs/ui/side-pane-full-view.md`。Mira 使用自身 React/Radix 工作台、授权根目录 IPC、资源标签及同一份编辑器 DOM，改编目录选择、右侧可折叠目录布局、固定对话标签、七处吸附浮窗、运行占位及回答气泡；通过宿主浏览器裁剪区域处理 sandbox iframe 与原生 webview 的层叠关系，保留现有分屏显示与关闭，撤下新增分屏入口。未移植上游工作区 RPC、远程协议或会话存储；Apache LICENSE/NOTICE 与上游版权保持。
2026-10-21 设置公共布局：参考 `packages/ui/src/SettingsPage.tsx`、`settings/SettingsPageParts.tsx` 的独立内容面板、48px 顶部留白和896px内容列，在 Mira Vue `SettingsPageShell.vue` 实现；侧栏采用 Mira Harness 默认280px，保留自有主题、路由与Element Plus控件，不引入上游账号、RPC或响应式图标栏。原Apache LICENSE/NOTICE保留。

2026-10-21 设置字体：参考本地上游 `3c5b2276` 的 `packages/ui/src/styles.css`、`SettingsPage.tsx` 与 `settings/SettingsPageParts.tsx` 中设置标题、导航分组、标签和说明的字号及字重层级；在 Mira 设置专用 `settings-typography.scss` 和页面局部样式中统一，中文回退采用 Mira Harness 字体栈。保留自有 Vue/Element Plus、桌面布局与等宽代码字段，未引入字体资产或上游响应式标题断点；原版权、Apache LICENSE/NOTICE 保持。

2026-10-21 设置整理追加：在上述布局基础上，按 Mira 现有运行链路重组导航、拆分权限页、迁移回收站，撤下旧 Git/Python 设置入口，修正保存失败和草稿保护；这些能力取舍及宿主配置实现属于 Mira 自有逻辑。具体文件和 292 项回归、隔离 macOS Electron 21 组验收证据见 `docs/MIRA_SETTINGS_VERIFICATION_2026-10-21.md`；远程服务、Windows 原生与安装包不在本次实际验收内。原版权、Apache LICENSE/NOTICE保持。

2026-10-21：框架标题栏侧栏开关、新建任务入口参考 `packages/ui/src/DesktopTopOverlay.tsx` 和 `app-shell/WorkspaceShellLayout.tsx`，沿用 PanelLeftClose/Open、MessageCirclePlus 图标及收起侧栏后 300ms 宽度/透明度显隐。Mira 使用自身 Vue Shell、React 侧栏状态与授权 MessagePort，同步入口仅在 Harness 显示，不移植上游平台服务；原 Apache LICENSE/NOTICE 保留。

2026-10-21：悬浮对话修正参考 `side-pane-full-view/ConversationHost.tsx` 的40px内置工具栏、裁剪视口与贴底保留内容三层结构，以及 `v4/SessionPane.tsx` 的 inline composer。Mira 修正收起态候选菜单锚点、网格按钮尺寸、附件行与统一阴影，继续使用自己的 React 编辑器、草稿和能力目录；原 Apache LICENSE/NOTICE 保留。

2026-10-21 归档管理：参考 `project-sidebar/ArchiveManagement.tsx`、`ArchiveGroupCard.tsx`、`archive-view.ts` 与 `useArchiveManagement.ts`，将归档列表入口从侧边栏移到 Mira Vue 设置页；移植搜索、时间排序、项目身份分组/筛选、折叠列表与单项/分组/筛选结果批量恢复删除。沿用 Mira Electron 归档接口、删除确认与本地项目身份，不引入上游远程 Host 或自动归档服务；原 Apache LICENSE/NOTICE 保留。

2026-10-21 任务列表导航：移除 Mira 分组/项目双 Tab，统一在任务视图菜单切换项目、分组、时间线；项目分区采用上游 `PurposeSections.tsx` 的 Lucide ListChevronsDownUp / ListChevronsUpDown 图标与有展开即全部折叠的行为。当前固定 lucide-react 未含此图标，使用已安装 Lucide 图标目录的原始路径经 createLucideIcon 绘制；项目标题行采用 2px 行间距与仅 hover 背景，空个人工作区默认收起。保留 Mira 自有偏好、项目与任务排序、桌面交互；原 Apache LICENSE/NOTICE 保留。

2026-10-26 设置范围选择器：参考 `packages/ui/src/settings/PluginScopeMenu.tsx`、`components/ui/dropdown-menu.tsx` 和 `button.tsx` 的胶囊触发器、256px 菜单、当前项右侧勾选与工作区分组，改编为 Mira Vue `SettingsScopeSelect.vue`。沿用 Element Plus 的弹层定位、键盘导航和关闭交互；用户本机范围命名为“全局”，工作区显示 Mira 传入的名称，工具与扩展仅提供全局。未移植上游远程主机、RPC 或工作区目录读取；原 Apache LICENSE/NOTICE 保持。

2026-10-27 MCP 外部导入：参考 ZCode 的 McpSettingsSection、PluginInstallEmptyState、SettingsResourceHeaderActions、ExternalAgentImportDialog 及 settingsSyncService，补齐空状态的新建与导入按钮、更多菜单及来源分组/逐项选择/导入结果。改编为 Mira Vue 与受控 Electron IPC，只合并到 Mira 全局配置，保留同名项，不写回来源文件；TOML 沿用 smol-toml 解析，原 Apache LICENSE/NOTICE 保持。

2026-10-27 命令与钩子设置：参考 `CommandsSection.tsx`、`CommandForm.tsx`、`HooksSection.tsx`、`HookForm.tsx`、`SettingsFormActions` 及空状态的目录工具栏、分组、表单与二级面包屑布局。Mira 使用 Vue/Element Plus、共享作用域选择器，新增和编辑统一进入二级页；命令支持结构化字段、保留原文的 Markdown 编辑和用户选择的 Markdown 文件导入草稿。保留 Mira 的名称规则、项目身份、版本冲突与钩子逐内容授权；未移植上游 RPC 和外部 Agent 扫描服务。原 Apache LICENSE/NOTICE 保持。
