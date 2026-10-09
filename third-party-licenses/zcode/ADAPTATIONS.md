# ZCode → Mira Harness 改编记录

更新日期：2026-10-09（Asia/Shanghai）。

前一批检查为 [收尾增量](#2026-10-08-收尾增量) 的 80 文件/458 项；80/455 保留为此前批次。本批文件树与只读预览来源见 [文件工作区增量](#2026-10-08-文件工作区增量)。开发态生命周期验收不等于安装包、Windows 或 P0–P3 放行。未提交、未推送。

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

| Mira 文件/区域 | 上游参考 | Mira 改编内容 |
| --- | --- | --- |
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
| `apps/harness-react/src/components/session/`、`components/composer/`、`components/workbench/`、`components/workspace/` | ZCode 桌面应用的任务侧栏、起点、输入区、资源面板；源码 `packages/ui` 对应区域 | 根据 Mira Harness 已有能力适配交互与布局；Mira 组件、文件与业务变量保持本项目命名 |

本表最后一行记录界面参考范围，不声称完整复制了上游 Agent Runtime、账号服务、
订阅、远控或其他尚未接入的业务能力。实际完成状态由 Mira 进展文档与运行验收记录维护。

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
没有移植上游完整媒体协议、远程工作区、Office 或多模态模型附件。
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

- 本目录 `LICENSE` 与 `NOTICE.md` 是上游根文件的逐字副本，不编辑版权人、条款或正文。
- 改编源码保留原版权与 Apache-2.0 标识，并链接到此目录。
- 实现文件及自定义变量使用 Mira 命名；上游名称仅保留在必要来源与法律声明中。
- Tailwind 的 `--color-*`、`--text-ui-*` 是公开工具类兼容接口，不作为 Mira 内部主题状态名称。
- Mira 原创代码继续使用根 MIT LICENSE；第三方代码不被改签为 MIT。
- 增加上游复制范围或引入其第三方资产时，同步补充本表及相关独立许可证。
