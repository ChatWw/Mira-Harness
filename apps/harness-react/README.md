# Mira Harness 工作台（React）

当前首屏入口（2026-10-10 06:36 +08:00）：先读 [首屏完整对齐与验收](../../docs/MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)。清理、对话提交链局部优化和跨组拖拽限定验收已完成；下一次继续组内新任务草稿及任务行 hover。

最近更新：2026-10-10 06:36 +08:00。跨组拖拽的空组循环/边缘重测已修，完整隐藏 Electron 切片 21 项、最终六张稳定图通过；准确源码、构建/审计与边界见总文档。完整原生/ZCode 同态仍未验；整体 active，本批未提交或推送。

当前剩余：组新任务草稿、任务行 hover 归档/文件树、PDF/视频及完整原生/ZCode 同态、真实模型、性能和发布验收。阅读记忆/导航快照仅 renderer 内，队列仅进程内，附件 GC 仅在启动执行；DOM 虚拟化不等于宿主消息分页。对话提交链已局部优化，最新首开仍有 76/70/68ms 长任务，慢首开尚未归因。

Mira Harness 默认工作台的 React 实现，经第一方授权桥（sandbox iframe + MessageChannel + grant）挂入 Vue Shell。

当前入口与逐项进展见 [首屏完整对齐与验收](../../docs/MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)，[ZCode 对齐记录](../../docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md) 保留全批次证据。Electron 提供运行能力，Vue 负责双层 Shell/统一设置，React 负责应用内部任务界面；正式入口已接入，不代表安装包、Windows、真实模型或 P0–P3 整体放行。

## 2026-10-09 首屏实现增量

- 侧栏：分组/项目、持久化排序/展开、归档页/恢复/删除确认、底部设置与用量；自定义组名称/7 色/折叠/任务移入移出/解散保留会话与手动排序。项目 hover/focus 新任务、文件树、更多，原生添加、真实重命名/打开、隐藏/恢复仅修改侧栏入口，不复用删除项目。
- 搜索：`HarnessCommandCenter` 由侧栏、应用快捷键和 Vue Shell 搜索共享；命令/对话真实正文片段及消息定位/当前授权目录文件。工作区搜索历史最多 20 条，成功选择才记录，默认 6 条、重放/展开/清空/重试；成功打开目标同步接入应用导航历史。
- 自动化：React 主视图、任务表单/启停/立即运行/停止/删除确认/记录与重试，复用 Mira 的现有 scheduler 和存储，编辑草稿保存及离开等待沿既有第一方偏好协议。
- Skill 市场：列表、详情、已安装与真实安装，固定公开 `anthropics/skills` commit `683bc88e56f3e09ba94f7055977f3d3aa499f202`，curated 清单中的 14 个包级 Apache-2.0 包按固定 raw 下载，不再匿名 API、不自动跟随 main；保留许可/通知/来源。MCP 为本地管理，不是在线市场。
- 对话：目录/任务Header、真实轮次hover/定位、附件/复制反馈、父任务text/reasoning/tool有序parts、工具内审批/失败重试和取消历史、计划/执行待办/子任务/变更摘要；无parts旧消息保持兼容，不伪造思考。公开思考与工具文本有64KiB UTF-8上限，正文不截断；工具payload仅展开挂载。
- Composer：caret `@`/`/`/`$`、`+` 分类面板和真实文件/Skill/MCP/对话引用、键盘/草稿保护；权威队列支持 FIFO、撤回恢复、排序、立即发送、停止暂停/恢复。统一 queue/guide 设置，待消费引导内联展示，当前助手/工具批次完成后由同一运行接续；不支持的输入明确降级。晚 ACK、重载及跨任务不重复提交或覆盖新草稿；图片/UTF-8 文本附件与附件-only 已接，PDF/视频尚未实现。

验证分开看：16:18:39 侧栏相关 5 文件/49 项是限定回归；最新整合测试、类型、正式构建、[首屏 headless 结果](../../docs/assets/mira-zcode-alignment-2026-10-08/first-screen/results.json) 与最终截图覆盖统一见 [首屏总文档](../../docs/MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)，不重复旧计数。浏览器用实际生产 React、隔离 opaque iframe 与真实桥/parser，但会话/权限等为明确 fixture；真实公开市场下载使用临时显式代理并写入隔离 SkillStore，不证明 Electron 原生下载。桌面市场改用 Electron `net.fetch` 遵循已有系统代理，不改系统设置；当前系统代理关闭时 raw 直连失败的边界仍须实测。浏览器证据不是实体输入、ZCode 同态或性能结论。

下一入口：对最新正式构建逐入口完成浅/深主题、hover/focus/菜单、IME/快捷键、跨视图草稿、项目/组/搜索/自动化失败与重启恢复，检查截图并测量首屏长线程/输入响应。旧原生搜索、文件和 Worker 数字不放行当前首屏。未移植 ZCode 云账号、计费、分享、远控、Goal 或工作流，不把它们作为虚构已对齐功能。

## 结构

```text
src/
├── app/                 生产、Pilot 和演示入口
├── components/
│   ├── composer/        输入、模型、权限和执行模式
│   ├── conversation/    Markdown、消息操作和运行轨迹
│   ├── automations/     任务编辑、运行记录与既有调度引擎接入
│   ├── extensions/      固定公开 Skill 市场、详情与安装
│   ├── interactions/    计划审核与澄清
│   ├── session/         会话侧栏、分组与上下文菜单
│   ├── search/          Shell/侧栏共享命令中心与结果导航
│   ├── workbench/       主线程和工作区编排
│   └── workspace/       文件树/只读预览、编辑器控件、工作区 tab 与会话级终端
├── hooks/               抽屉焦点约束与外部编辑器选择/偏好
├── platform/            第一方 MessagePort 桥与宿主主题
├── state/               PilotController 外部 store
├── styles/              Mira 语义主题和工作台区域样式
├── workers/             独立语法高亮执行入口
└── lib/                 文件树/搜索/预览、共享监听、编辑器、高亮协议/客户端与草稿
```

`app/app-main.tsx` 是生产入口：接收宿主 `mira:connect` 握手，经 `platform/first-party-host.ts` 调用宿主能力，渲染 `components/workbench/HarnessWorkbench.tsx`。`app/pilot-main.tsx` 是开发态 Wujie pilot 入口，`app/main.tsx` 是纯演示入口；两者不代表生产 grant 流程。

交互规格见 [工作台规格](../../docs/MIRA_HARNESS_WORKBENCH_INTERACTION_SPEC_2026-09-30.md)。视觉基线见根 [DESIGN.md](../../DESIGN.md)：侧栏默认 264px、Header 48px、主面板圆角 12px、frame/分隔空间 4px、新任务有效输入宽 672px、基础字号 14px。浅深色主题在 `src/styles/mira-foundations.css`，自定义主题变量使用 `--mira-*`，Tailwind 公共别名保留。开源归属见 [NOTICE](./NOTICE.md) 和根 [third-party-licenses](../../third-party-licenses/README.md)。

## 文件工作区（既有实现与历史证据）

以下保留文件工作区既有实现与各批验收。文中的“下一次/下次入口”是对应日期的历史计划，当前下一入口以上方首屏章节为准；本轮不新增连续文件能力。`@` 和 Command Center 本批已经复用同一 `files.search` 真实查询，因此会使用宿主当前忽略规则；历史“尚不含这些入口”不能作为现在的调用范围。

`ProjectFileDrawer.tsx` 在应用左侧替换任务侧栏，返回任务时保留右侧预览。文件树采用 28px 固定虚拟行与 12px 层级步进，提供完整树键盘导航、单一 Tab 入口、Radix 上下文菜单、目录懒加载和重试；刷新保留选中/展开。28px 搜索框通过受控 `files.search` 搜索整个授权目录，120ms 防抖、top1000/截断提示和失败重试；打开文件保留 query，打开目录清 query 并强制 reveal，X/Escape/空输入回树并定位选中项。

搜索现使用 Electron `harnessWorkspaceIgnore.ts` 的 `ignore` 7.0.5 matcher，在进入子目录前剪枝；root `dev:ino` 与规则版本/hash 绑定缓存，每查询读规则，编辑/删除/重建失效，warm 返回复核 root。首次非空搜索安全初始化 `.miraignore`，Vue `/settings/file-search` 读取缺失文件只返回模板，根 `.gitignore` seed + 默认段落盘后不自动同步。同步/恢复默认只改草稿对应段，保存才写入，缺失/重复分区标记明确报错并留草稿。空规则可搜索默认排除目录，根 `.miraignore` 不作候选，Mira 保留 dotfile，不增加上游 `.env`/二进制/隐藏候选额外排除。文件抽屉、`@` 与 Command Center 的文件查询复用 `files.search`，不改变浏览/预览/上传或 Agent 权限；配置归 Vue 平台，不新增 React 设置页。

`FilePreviewPanel.tsx` 以完整相对路径的 `file:path` 标识独立页签；同名文件可同时打开。预览工具栏为 40px，文本支持只读 Markdown/源码切换、自动换行、复制相对/绝对路径及原始内容、加入对话与外部打开。加入对话仅更新附件，不自动发送；文本附件保持单文件 256KiB、累计 1MiB、最多 12 项，超限原子拒绝并保留已有附件，个人工作区提示与实际可用目录一致。

位图预览经 `files.read-image({ sessionId, path })` 读取授权 root 内相对路径，宿主以 4MiB 上限、有界 handle 读取和前后 stat/root 身份复核返回数据。`MiraImagePreview.tsx` 与 `lib/image-preview.ts` 使用 8px 透明棋盘、`@Nx` 显示尺寸、加载/解码失败与重试，不提供文本复制或自动换行。PNG/JPEG/GIF/WebP 可从树菜单或成功读取/解码的活动预览“加入对话”，经 `attachments.stage` 冻结为当前会话图片；不支持的位图格式禁用并提示转换，删除/读取失败/解码失败的预览不加入。SVG 沿用文本读取，预览以编码后的 `<img>` 显示，可切源码、复制和自动换行；解码失败的预览态禁加入，但读取成功的源码态仍允许按文本附件边界加入。图片继承共享监听、会话/root 身份、隐藏延期读取和恢复。

`lib/workspace-watch.ts` 为树/预览提供共享订阅，宿主 150ms、React 300ms 合批；只监听 root、可见展开目录和已打开预览父目录，非递归、无轮询，每订阅最多 256 目录、每 owner 最多 8 订阅。目录身份替换/消失恢复和 alias 全失效驱动树/搜索更新，隐藏预览激活再读，删除保留 tab 并可恢复。`lib/file-tree.ts` 首次/reveal/手动/监听刷新共用每数据源两项实际在途目录读取预算，旧 epoch 未完成读取仍计数；并非整个应用文件 I/O 的全局两项限制。grant 撤销与主 renderer 非同文档主框架导航/崩溃/销毁回收监听和 PTY。

`WorkspaceEditorButton.tsx`、`useWorkspaceEditors.ts` 与宿主编辑器服务提供 28+20px 标题栏分体控件、160px Radix 菜单、树打开方式和预览外部打开；主/子菜单受 Radix 可用高度约束并可滚动。固定 Mira ID、30 秒安装探测缓存、最多 4 worker；失败等待在途任务排空，图标为有界 32px PNG。目标仍限制在授权 root，启动使用参数数组/`shell:false`，Windows GUI 不等退出。偏好读取失败保持具体错误，重新检测仅在该读取失败时重试 hydration；普通重探测不重复读取。失败 launch 不阻断尚未完成的初始/重试 hydration，成功显式选择阻止旧偏好覆盖且仅保存最新选择；卸载/controller 变化后迟到结果不保存，严格偏好保存失败可见。不提供内置 dirty/`⌘S` 写回。

读取与状态按会话及项目根目录隔离，包括同一会话移动项目时失效旧预览和附件。正式入口样式覆盖、文件树菜单 Escape 后返回焦点、Left/Right/Shift+F10、空文件、丢失文件友好错误与恢复重试、非活动文件中键关闭与最近关闭恢复、跨 A/B 附件/预览隔离及移动项目后新根目录与精确复制已有原生证据。

8001 行源码早期虚拟列表实际 DOM 为 50–61 行，原整体高亮 888ms 阻塞已定位；历史分块 fixture 异步完整高亮约 2205.5ms、无观测长任务、挂载 46 行，滚动挂载 56 行且无观测长任务。该异步耗时不与旧同步阻塞直接比较，也不放行首次 grammar/病态单行/流式/布局和整体性能。workspace 读失败/late hydration/local clearing/顺序保存/离开保护已有回归；此前 `9→0` 仍未归因，force reload/进程终止不保证异步保存。当前 Git 已接入，下一次先完成监听/编辑器错误态、图片与 Git 原生验证，再继续 metadata watcher、音视频/Office、性能 profile、可靠冷暖/进程冷启动与安装包/Windows/真实模型和整体 P0–P3 验收。

此前 2026-10-08 的 80 文件/455 项、80 文件/458 项及 14:02:52 字节记录保留在其原批次，不能作为本批产物数字。

## 2026-10-08 文件标签收尾（历史）

独立 finish review 发现隐藏关闭按钮仍参与标签布局、挤压标题。CSS 已改为 absolute overlay：非活动标签宽 60–156px，活动标签最小 128px，关闭按钮在 hover/focus 时保留标题空间并配合渐隐。最终原生复验与同一独立 reviewer 已确认布局问题 resolved；活动 README 完整可辨，非活动标签保留 emp/tran/large。独立 documenter 同步 DESIGN/sidecar 后，8 节/schema2/9 静态组件断言通过，DESIGN 过期项也 resolved；review remaining clear、disposition ship 仅限这两项。

`/tmp/mira-file-tabs-finish-smoke.mjs` exit 0，隔离 Electron PID 13338、窗口 2039、1440×900。六 tab 的 client/scroll 为 418/443px、活动宽 128px，README label 为 73.648px；Space → Left → Space 排序、中键关闭 source 不抢 README、最近关闭恢复与六 tab 五秒稳定通过。设置 → 外观深色 → 返回后恢复六 tab、无非空 alert，树右键 Escape 返回 alpha/README 焦点。

15:35–15:36 的浅色、深色与深色菜单三张最终图已逐张检查，并固化到 `docs/assets/mira-zcode-alignment-2026-10-08/mira-file-workspace-{light,dark,dark-menu}-final.png`。重复的评审副本已清理，保留的截图与原采集 SHA 一致。该批历史证据见 [文件标签收尾](../../docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-文件标签收尾)，不覆盖当前监听/编辑器。

15:27:21 全量 82 文件/596 项在 5.43s 通过，React/Vue 类型重新通过；15:26:55 `harness:build` 完成。15:27:43 `write:false` 只读审计确认 287/287 JS 一致，静态闭包 3 JS/2,005,769B（逐文件 gzip9 605,004B），全部 JS 9,530,010B（gzip9 1,903,569B）未变；CSS 为 124,328B（gzip9 22,163B），12 个关键 CSS 规则与 7/7 许可通过。此前 15:04:30 测试和 15:11:26 构建审计保留其原批次；JS 完整性与字节记录不代替原生验收。

## 2026-10-09 图片续作入口

**完成**：宿主受控位图读取与 React 位图/SVG 预览、源码切换、解码失败/重试及原有身份/监听恢复已接入。位图禁止文本动作，SVG 源码读取成功时的文本动作不受图片解码失败影响；图片预览不等于图片加入模型上下文。

**验证与剩余**：最终受限两 workers 自动检查与 headless 局部确认通过，最终自动检查、无头 fixture 和限定结论仅看 [IMAGE_PREVIEW_EVIDENCE.md](../../docs/assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md)。同一 reviewer 已确认两项 CSS P2 与 SVG 源码动作三项修复通过，仅覆盖 headless React。fixture 使用实际生产 JS/CSS 和图片 helper，不能代替 Electron grant、原生操作或 Vue 设置验收。原生图片浅深色/同态 ZCode 对比，以及上轮错误态浅深复拍和复评确认仍待完成。上轮监听/编辑器数字和结果保留 [原批证据](../../docs/assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md)；默认并发超时历史不被本次受限通过覆盖。

**下次入口**：桌面空闲后先恢复上轮错误态确认和图片原生同态 ZCode 比较，再推进音视频/Office、Git/profile/发布边界，不重复实施图片。force reload/进程终止不保证异步保存，`9→0` 仍未归因；整体 ZCode/P0–P3 未放行，未提交、未推送。

## 2026-10-09 Git 文件树状态叠加

本节保留 overlay 批次历史；删除与筛选及其新验证见后面的同日章节，旧未实现项、数字和限定 ship 不覆盖当前入口。

**完成**：`lib/file-git.ts` 与 `ProjectFileDrawer.tsx` 对实际树/搜索行显示名称颜色和直接 `M/A/D/R/U`；目录直接状态可显示字母，后代汇总只有单个 dot，`M` 优先于 `A/D/R/U`，本批 deleted 仅进入祖先摘要，尚未补删除虚拟行。`files.git-ignored` 按可见路径精确判断，ignored 只灰该行、不染祖先。status 与 ignored 各单在途，ignored 每批最多 512 路径并缓存，刷新/卸载/会话或 root 变化抑制过期结果。

**受控读取**：`files.git-status/ignored` 通过会话授权 root 调用异步 `execFile` 与 NUL parser，前后复核 root/repository/metadata 身份，IPC 返回前复核 grant/session/root。后端最多两条命令并行、16 条等待，10 秒超时，stdout/stderr 各 8MiB。首次进入、手动与工作区通知刷新；非仓库返回 `available:false`，失败提供安全提示和重试。无 Git 写操作、无 metadata watcher，外部 `git add/commit` 不保证自动刷新。

**验证与剩余**：受限两 workers 自动检查、React/Vue 类型、React 与 electron-vite 编译及正式 React headless 通过；准确数字、7 张 PNG、日志与独立复核只看 [Git 证据页](../../docs/assets/mira-zcode-alignment-2026-10-08/GIT_OVERLAY_EVIDENCE.md)。独立复核原 P2 已解决、未见回归，remaining clear；限定 ship 仅覆盖本只读 Git 源码/headless 与文档修正。headless 使用 MessageChannel、实际第一方桥/parser 和真实隔离 Git helper；grant/IPC 为单测、watch 事件为 fixture，未证明真实 Electron grant/native/Vue 设置、安装包或 Windows。图片历史保持上一节范围；整体 ZCode/P0–P3 未放行，未提交、未推送。

## 构建

- 生产：`npm run harness:build` — esbuild 将 `src/app/app-main.tsx` 以 ESM 分包输出到 `dist/harness-react-app`（进安装包 extraResources），由本地微应用服务以 `/apps/<appId>/` 提供；保留 253 个物理 grammar、235 个公开 ID / 含 alias 332 个名称；仅按需注册 `github-light` / `github-dark` 两个主题。构建证据与模块验收边界见 [性能记录](../../docs/MIRA_HARNESS_PERFORMANCE_2026-10-08.md)。
- 开发：`npm run harness:dev` — 同时启动 Electron 开发版与本地资源服务（127.0.0.1:9001，路径 `/harness-react-dev/`，经 Vite 同源代理）。esbuild watch 无 HMR，改完需刷新。

开发态路由（仅 DEV）：`/workspace/harness-prototype`（演示版）、`/workspace/harness-pilot`（Wujie props 试验）。生产路由为 `/workspace/harness-react`（FirstPartyFrame iframe + grant）。

## 2026-10-09 删除虚拟行与只看变更

本节保留 filter 批次历史；搜索 ignore 已在下一节实现，本节旧待办、数字和限定 verdict 不作为当前入口。

**完成**：`lib/file-git.ts` 仅为已加载父目录合成缺失 deleted 文件，不造祖先、不改数据源快照；按父目录去重批量追加。`ProjectFileDrawer.tsx` 提供 28px 图标只看变更，树态保留变更祖先、搜索仅直接非 ignored 状态并重算可访问同级位置；搜索不注入 deleted 项，监听/读取仍由完整树驱动。D 点击/Enter/Space 只选中，Open/打开方式及 editor 回调禁用；复制与非位图 chip 保留上游行为，加入不读文件、发送由宿主真实校验。

**状态与验证**：query/展开/选中保持；loading 保留最后成功 available/index、筛选、D 菜单与焦点，清 ignored cache、推进 version guard；失败/非仓库及 session/root 变化重置。最终两 workers 96 文件/928 项、React/Vue 类型、React/Electron 编译、产物审计和三视口正式 React headless 通过；旧生产 baseline、D 菜单刷新 before-fix 及仅快照修复的先红后绿记录保留。准确时间、10 张最终 PNG 与新独立源码/截图 slice-pass 统一见 [本批证据页](../../docs/assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)，文档一致性复核通过；旧 overlay ship 不覆盖本批。

**剩余**：搜索 ignore、metadata watcher、媒体 lease/Range、高亮 Worker/profile 尚未实现；电脑操作工具不可用，原生浅深色/同态 ZCode、Electron grant/Vue 设置、安装包/Windows/真实模型及整体 P0–P3 未放行。headless watch 为 fixture、剪贴板为 iframe stub，不等于原生；整体 active，未提交、未推送。

## 2026-10-09 搜索忽略规则与 Vue 设置

**完成**：宿主搜索规则和 Vue 设置已接入。设置仅选择 DB 已有项目/个人会话工作区，无任意路径输入；加载前禁编辑/保存，模板可首次保存、已有文件须修改后保存，重读/换工作区/受控路由离开确认未保存修改，失败留草稿，迟到/卸载结果不应用。IPC 限顶层 renderer，从 ID 推导 root；有界 UTF-8 handle、拒 symlink/特殊文件、hard-link no-replace 初始化及 root 串行/revision/授权复核、flush 后原子替换保留 mode。权限/只读失败时搜索可用内存模板，危险文件不降级；跨进程最终 syscall 非绝对 CAS、root 移走临时文件残留与 hard-link 不支持显式失败保留。

**收尾**：独立服务复现的 awaited 授权 P2 已修复并由发现者同一复验关闭；最后异步检查后同步授权紧接 link/rename，已有保存/模板保存/搜索初始化失去授权后均不落盘。修后全量/类型/构建/审计通过，准确数字见证据页；本次修复不消除 POSIX 最终 syscall 跨进程非 CAS 窗口。

**真实桥修复（2026-10-09 13:26 +08:00）**：真实 Electron 暴露第二个 P2：Vue `ref` 数组中的 Proxy target 无法由 `contextBridge` 克隆，报 `An object could not be cloned.`。`useSearchIgnoreEditor` 使用 `shallowRef` 和普通 `{ kind, id }` 请求快照，初读/重读/transform/save 均不传 Vue Proxy；回归与独立源码复核已通过。最新全量/类型、React 与 Electron 重新构建及审计通过，JS/CSS 字节不变，准确数字见证据页。13:14:15 bridge/DOM probe 的三产物 SHA 与最新构建一致，但 probe 未重跑。

**验证与剩余（2026-10-09 14:32 +08:00）**：最终数字与历史看 [本批证据页](../../docs/assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)。7 张旧 HTTP headless 图与 13:14 bridge/DOM probe 保留身份；14:25–14:28 新 [原生结果](../../docs/assets/mira-zcode-alignment-2026-10-08/search-ignore-native/README.md) 经真实 preload/IPC、原生点击/输入，通过设置保存/冲突/恢复与 React 浏览/搜索/预览，三图逐张确认。旧锁屏、输入失败和夹具前提失败保持历史。上游导航隐藏该 section，Mira 有意开放 Vue 页，不称隐藏上游页逐像素验收。旧错误态/image/Git 同态 ZCode、metadata watcher、媒体 lease/Range、代码块 DOM/profile、Windows、安装包与真实模型仍未放行。

## 2026-10-09 生产高亮 Worker

`workers/mira-code-highlight.worker.ts` 运行 Shiki Oniguruma WASM；`lib/code-highlight-worker-client.ts` 在 opaque iframe 创建 Blob classic Worker 并导入可信 ESM 产物。grammarState 留在 Worker，主线程只接收普通 tokens/styles；没有主线程 tokenizer fallback，不增加 same-origin 或关闭 webSecurity。
流式代码复用 Streamdown 公开容器/标题/复制/下载，正文由 `MiraStreamingCode.tsx` 承载；完成态围栏与虚拟文件源码共享同一适配器。取消隔离、乱序、错误重试、暖 owner 与正式卸载 dispose 已接入。
准确预算、生产闭包/许可、Chrome 实际 React 与隐藏 Electron fixture 的结果/剩余分别见 [Worker 证据](../../docs/assets/mira-zcode-alignment-2026-10-08/HIGHLIGHT_WORKER_EVIDENCE.md)；timer 可用不等于消除 DOM 长任务或获得产品 INP/冷启动结论。

## 验证

```bash
npx tsc -p apps/harness-react/tsconfig.json   # 本应用类型检查
npm test -- --run                              # 全量测试
npm run build                                  # 主项目构建
```

测试须在隔离 `MIRA_TEST_HOME` 下运行，不得写入真实用户数据。桌面验收按 `docs/MIRA_IMPLEMENTATION_PRD.md` 的证据纪律执行（打包版与真实模型不可被静态测试替代）。
