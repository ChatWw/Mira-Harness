# Mira 两层 layout 与 React Harness 设计 brief（2026-09-24）

> 最近更新：2026-10-09。Electron 能力、Vue 双层 Shell 与 React 正式第一方入口已接入；文件工作区、搜索、保存、监听、外部编辑器、位图/SVG、Git 装饰及删除虚拟行/只看变更、搜索忽略规则和 Vue 设置已实现。本批自动检查、类型、React/Electron 编译、审计与独立 Chrome headless 已有通过记录，最终限定评审以本批证据页为准，不沿用旧 Git/filter verdict。原生设置/搜索/浏览、旧错误态与图片/Git 同态 ZCode 仍待确认；整体 active，性能/发布/P0–P3 未放行，未提交、未推送。
> 当前续做入口：[搜索忽略规则与 Vue 设置](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-09-搜索忽略规则与-vue-设置)。第 4 节起的早期候选、线框和日期记录用于历史追溯，其中“下一图片/Git/删除与筛选/搜索 ignore”等待办不覆盖本轮状态。

当前检查索引为 [2026-10-09 搜索忽略规则与 Vue 设置](#35-2026-10-09-搜索忽略规则与-vue-设置)；最终数字、headless、审计与限定评审统一看 [搜索忽略规则证据页](./assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)。旧 Chrome headless 的真实 Vue/Element Plus/AppIcon/样式与 HTTP 文件服务 fixture 不含 preload/IPC，7 张图保留原采集身份。新增真实隔离 Electron preload/IPC bridge 与 CDP DOM 只读 probe 已通过，不等于实体输入/截图验收。旧数字与限定 verdict 保留原日期/范围；整体及发布未放行。

2026-10-09 续作：搜索 ignore 不重复实施，真实 Electron 的 Vue Proxy 克隆 P2 已修复并复核。当前锁屏阻止前景鼠标/键盘/截图，下一入口为解锁后重启隔离 Electron，仅补本批设置/搜索/浏览有限原生交互，不自动扩展为完整 native、同态 ZCode、Windows、真实模型或 P0–P3 放行。Git metadata watcher 仅为随后候选，先设计 root/Git metadata/grant 生命周期，既有文件 watch 不等于它。旧错误态、图片/Git 对照与媒体 lease/Range、高亮 Worker/profile 独立推进，依据见 [下一能力审查](./assets/mira-zcode-alignment-2026-10-08/NEXT_CAPABILITY_AUDIT_2026-10-09.md)，不据旧截图或旧 ship 放行。

## 0. 本轮设计结论

本轮只解决一个问题：应用显示区内部如何组织 Harness 的会话、任务执行、审批和成果。

- Mira 外层继续只有 Shell 的公共职责：窗口控件、全局搜索、应用切换和设置。
- React Harness 内部采用“任务线程为主、上下文面板按需出现”的工作台，不把 Shell 侧栏再次复制进来。
- 桌面宽窗左侧任务/项目导航默认显示，可收起；右侧工作区按需打开。紧凑桌面窗口保留互斥浮层，应用内布局以 ZCode 对齐记录为准。
- 审批是当前状态下唯一的主动作；停止、重试、继续和打开成果都必须在当前视线内可达。
- 方案 A、早期线框与 v1/v2 高保真稿均为历史，用户本轮已要求直接对齐 ZCode，逐功能操作和结果对比继续实施。
- 当前代码基线：侧栏默认 264px、Header 48px、主面板 12px 圆角、4px frame/分隔空间、新任务有效输入宽 672px；基础字号 14px，只跟随 Shell 浅/深色。Radix 菜单和 assistant-ui 消息原语继续复用。
- 文件工作区：左树在应用内部替换任务侧栏，返回任务保留右侧独立只读页签；树行/搜索框 28px、缩进 12px、预览工具栏 40px。完整路径区分同名文件，加入对话只更新附件，状态按会话与项目根目录隔离；搜索整个授权目录，文件打开保留 query，目录打开清 query 并强制 reveal，路由离开等待最新状态保存成功。
- 文件更新与打开：共享受控目录监听更新树/搜索/预览，隐藏预览激活再读，删除保留标签并支持恢复；标题栏提供 28+20px 分体编辑器按钮与 160px Radix 菜单，文件菜单/预览支持外部打开，主/子菜单按可用高度滚动。偏好读取失败可重试，失败 launch 不阻断初始/重试 hydration，成功显式选择阻止旧偏好覆盖且仅保存最新选择；预览不提供内置写回。
- 图片预览：位图经授权 `files.read-image` 相对路径/会话读取，4MiB 有界 handle/stat/root 复核；保持 40px 工具栏，以 8px 透明棋盘和 `@Nx` 尺寸显示，解码失败可 retry。位图禁文本复制/换行/加入，树内加入也禁用；SVG 以编码 `<img>` 预览，可切源码，读取成功的源码态在 decode 失败下仍可按文本边界复制/换行/加入。文本附件维持单文件 256KiB、累计 1MiB、最多 12 项，沿用身份、监听和隐藏延期读取。
- Git 文件树：名称/直接 `M/A/D/R/U`、目录单后代点和精确 ignored；deleted 仅合成已加载父目录的缺失文件、不造祖先。只看变更保留树态变更祖先、搜索仅直接状态且不注入 deleted 搜索项；D 只选中，打开禁用但复制/非位图引用 chip 保留。刷新 loading 保留最后成功快照/筛选/菜单/焦点，失败/非仓库及 session/root 变化重置。无 Git 写操作、metadata watcher 或外部 add/commit 自动刷新保证。
- 搜索 ignore：`.miraignore` 仅用于实际工作区搜索，首次非空搜索安全初始化；Vue `/settings/file-search` 管理 DB 已有项目/个人工作区，模板读取不落盘、同步/恢复仅改草稿，保存才写入，未保存离开有确认。规则不影响浏览/预览/上传或 Agent 权限，也不覆盖 `@`/Command Center；保留 dotfile 搜索，不额外排除 `.env`/二进制/隐藏候选。
- 主题实现为 `src/styles/mira-foundations.css` 的 `--mira-*`，Tailwind 公共语义别名保留；第三方来源集中在根 `third-party-licenses/`。

## 1. 参考图锁定的内容

用户提供的空白 layout 图表达的是一个整体 Mira 桌面窗口，不是让各应用复制同一套侧栏。它有两层：

```text
┌──────────────────────────────────────────────────────────┐
│ Mira 外层窗口：系统窗口控件、全局搜索、应用切换等公共入口     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 纯白应用显示区：默认加载 React Harness             │  │
│  │ 会话、项目、工具、审批、成果等布局由 Harness 自己决定│  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- 外层窗口和内层应用显示区保持清晰的表面层级，内层承载应用的完整工作区。截图中的设计工具面板、画布尺寸和浏览器 chrome 不是 Mira UI 规格。
- Shell 不提供常驻的 Harness 会话侧栏，不规定其他应用必须有侧栏，也不复制应用内标题栏或工具栏。全局搜索属于外层；应用内搜索由应用自己决定。
- 截图只固定结构，不规定精确边距、圆角、阴影和应用内的栏数；这些要在后续设计稿与实际桌面窗口中确认。`#fff` 是浅色参考图中的应用表面，深色主题使用对应的深色表面，两种主题都须保持两层可辨。

## 2. 责任与当前差距

| 区域 | 目标所有者 | 当前差距 |
| --- | --- | --- |
| 窗口控件、全局搜索、应用切换、统一设置 | Vue Shell + Electron | 双层 Shell 已落地，公共职责不进入 React 任务布局。 |
| 中间应用显示区 | Vue 应用宿主；应用拥有内部结构 | 正式 `/workspace/harness-react` 已经 FirstPartyFrame 隔离 iframe 接入，Wujie pilot/prototype 仅作开发辅助。 |
| 会话、输入、计划/审批、过程、成果、失败恢复 | React Harness | 已通过第一方 MessageChannel + grant 连接 Electron 服务；第一轮开发态桌面操作已完成，发布、真实模型和跨平台矩阵仍未完成。 |
| 模型凭据、任务执行、文件操作、会话存储 | Electron 服务 | 继续由宿主持有；React 不直接取得完整 preload 或密钥，发布/跨平台矩阵仍未完成。 |

## 3. React Harness 设计任务

目标用户是以资料、文件、研究和写作为主、兼顾编程的个人桌面 Agent 使用者。首要任务是清楚地提交工作、辨认当前状态、处理必要确认、检查成果和回到历史任务。完整工作台须覆盖空态、执行、计划/澄清、权限审批、完成、失败和停止；长会话、长路径、多文件成果以及窄桌面窗口不能造成操作遮挡。

当前按已授权的 ZCode 界面和源码实施，不再新增布局候选。保留现有 Harness 会话、审批、取消和持久化语义，以实际桌面操作检查导航、Composer、线程、摘要和工作区；完成/剩余/下一次入口记入本轮对齐文档。旧 `/workspace/chat` 继续可回退，正式入口已接入不等于已通过发布验收。

## 4. 历史：2026-09-24 应用内布局候选

第 4–7 节保存当时方案与线框，供理解演进；其中“推荐”“不推荐”和形态限制均是当时判断，现行 UI 基线以第 0–3 节及 2026-10-08 对齐记录为准。

### 方案 A：任务线程 + 按需上下文面板（推荐）

这是默认桌面工作区。线程是唯一持续的主阅读流，侧栏只在用户需要切换会话或检查执行上下文时出现。

```text
┌──────────────────────────────────────────────────────────────┐
│ [会话]  项目 / 当前会话                         [工作区] [⋯] │
├───────────────────────────────────────────────┬──────────────┤
│                                               │              │
│ 任务线程                                      │ 工作区       │
│ 用户任务                                      │ 状态摘要     │
│ Mira 回复                                    │ 执行阶段     │
│ 工具活动（折叠）                              │ 计划/审批     │
│ 失败/停止/完成卡                              │ 成果列表     │
│                                               │              │
│ ┌───────────────────────────────────────────┐ │              │
│ │ 继续这个任务…                    [发送]   │ │              │
│ └───────────────────────────────────────────┘ │              │
└───────────────────────────────────────────────┴──────────────┘
```

- 顶部的“会话”按钮打开左侧抽屉，包含新任务、最近会话、项目筛选和历史恢复；关闭后不占用阅读宽度。
- “工作区”按钮打开右侧面板。面板只承载状态、计划/审批、活动摘要和成果，不重复完整消息。
- 空态不显示右侧面板，主线程居中显示任务输入和 2–3 个真实高频入口；首次发送后切换为线程态。
- 审批卡既出现在线程的当前节点，也在右侧工作区保持定位入口；两个入口指向同一个待处理交互，不能产生两份状态。
- 右侧面板宽度采用稳定的桌面范围，打开/关闭改变主线程可用宽度，不触发整体网格跳动。

优点：主流程最清楚，能承载长回答；面板内容不会和对话重复；与 Electron 任务快照、事件订阅的边界自然对应。风险：用户需要理解两个按需入口，因此首次空态必须明确“会话”和“工作区”的位置。

### 方案 B：固定三栏任务控制台

```text
┌──────────────┬──────────────────────────────────┬──────────────┐
│ 会话/项目     │ 对话与输入                         │ 执行/成果      │
│ 历史列表      │ 用户任务、Mira 回复、审批           │ 状态、步骤、文件 │
└──────────────┴──────────────────────────────────┴──────────────┘
```

- 三栏在桌面始终存在，会话、对话和任务上下文一眼可见。
- 适合高频切换多个会话、同时观察执行过程的重度使用者。
- 不推荐作为第一版：空态显得稀疏，窄窗口会压缩对话，且容易重新复制旧 Harness 的“三栏就是产品”的问题；会话和成果也会争夺持续注意力。

### 方案 C：全宽对话 + 底部任务抽屉

```text
┌──────────────────────────────────────────────────────────────┐
│ 会话入口                              任务状态 / 工作区入口    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                         全宽任务线程                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ 输入区                                                       │
└──────────────────────────────────────────────────────────────┘
                         ↓ 点击后展开
┌──────────────────────────────────────────────────────────────┐
│ 当前执行 / 审批 / 成果抽屉                                    │
└──────────────────────────────────────────────────────────────┘
```

- 对话阅读最轻，适合写作和长文本。
- 但执行中状态、审批和成果默认隐藏，用户需要额外打开抽屉才能判断任务是否卡住；不适合作为 Harness 的首个主应用。

## 5. 推荐方案 A 的交互线框

### 5.1 空态

```text
                         Mira Harness
                 今天要研究、整理或完成什么？

              [描述任务输入框                       ]
              [附件] [项目] [权限]             [发送]

       整理资料        提炼文章要点        写一段代码
```

- 空态的主动作只有“提交任务”；模型、项目和权限作为输入区的次级控制，不在页面四角散落。
- 未配置模型时，发送按钮保留但给出明确的配置入口，不用空白错误或无响应。
- 真实任务入口只保留高频范例，不把演示场景切换器带入生产 UI。

### 5.2 执行中

```text
任务线程                                    工作区（可选打开）
用户：整理项目资料并输出摘要                 正在执行任务
Mira：我会先检查资料范围…                     ├─ 理解任务      ✓
  查看资料目录                         …      ├─ 检查资料      ●
  读取项目说明                         …      └─ 交付成果      ○
  正在整理摘要结构                         活动 2 项 · [停止]

输入区：继续这个任务…
```

- 过程消息显示用户能理解的活动名称；工具参数和原始返回值默认折叠。
- 停止属于当前运行的明确动作，停止后保留已生成内容和活动记录，输入区变成“继续这个任务”。
- 工作区是辅助观察，不是第二份聊天记录。

### 5.3 计划 / 澄清 / 审批

```text
Mira：我理解你的目标是……
计划  1. 检查目录  2. 阅读资料  3. 写入摘要

需要你的确认
准备创建「项目摘要.md」，将写入：……
                         [拒绝] [允许并继续]
```

- 计划确认、澄清问题和权限审批均作为线程中的阻塞节点；右侧工作区同步显示“等待你的确认”。
- 阻塞节点只允许一个主动作组，避免同时出现“确认计划”“允许写入”“继续执行”等互相竞争的按钮。
- 澄清问题没有答案时，输入区切换为回答模式；回答提交后回到执行状态，不新建一条无关会话。

### 5.4 完成 / 成果

```text
任务已完成 · 用时 02:14                         工作区
已整理 8 个文件，生成 1 项成果                   成果  1

[项目摘要.md   Markdown 文档   打开预览 ↗]         [打开]
你可以继续提出修改，或重新进入本次会话。
```

- 成果卡显示文件名、类型、状态和打开/预览入口；长路径换行或通过 tooltip 查看，不撑宽布局。
- 继续修改沿用原会话；“新任务”是显式动作，不由完成态自动跳转。

### 5.5 失败 / 停止恢复

```text
本次任务未完成
读取资料目录时失败，已完成的步骤仍可查看。
                         [重新尝试] [检查项目]
```

- 失败不伪装成完成；已完成活动和部分成果仍可展开查看。
- “重新尝试”复用当前任务上下文；“检查项目”打开项目/文件入口。停止后的主动作是“继续回复”，不把停止误显示为失败。

## 6. 响应式与可达性规则

- 桌面宽度足够时，线程保持可读宽度，工作区面板打开后以稳定宽度占位；不使用会导致内容重排的临时覆盖层。
- 窄桌面窗口下，左侧会话抽屉和右侧工作区改为同一窗口内的抽屉/面板，任一时刻只打开一个；线程和输入区始终可回到。
- 输入区固定在工作区底部，长文本在内部滚动；发送按钮在输入为空、运行中、等待确认和错误恢复时分别有明确禁用/动作状态。
- 所有图标按钮提供可访问名称；审批、失败和停止状态使用文本加图标，不仅依赖颜色。
- 长会话默认定位最新消息；用户向上浏览时不强制跳回，出现“回到底部”入口。工具详情和错误详情默认折叠。
- 白天/黑夜只改变语义色和表面层级，不额外暴露主题色、布局样式或加载风格配置。

## 7. 推荐方案的实现边界

第一批 React 正式 UI 只实现方案 A 的最小闭环：

1. 会话抽屉：新任务、最近会话、项目入口、历史恢复。
2. 任务线程：用户消息、助手消息、工具活动折叠、计划/澄清节点、审批节点。
3. 输入区：发送、继续、停止、回答澄清、模型/权限摘要。
4. 工作区：运行状态、阶段、审批定位、成果列表和预览入口。
5. 失败恢复：重试、继续回复、保留已生成内容和事件记录。

明确不在本轮：真正的文件 diff 编辑、撤销整组变更、排队消息、多 Agent 分支画布、Novel Studio/Vision、应用下载器和真实模型验收。

React UI 通过受控适配层读取已有 Electron Harness API；不直接读取模型密钥，不复用 Vue Pinia 实例，也不把演示原型的场景切换器带入生产。

## 8. 本阶段验收与下一步

- 当前可确认：Electron / Vue 双层 Shell / React 第一方工作台的归属与连接；ZCode 对齐已获用户授权，生产 React 入口不是演示原型。
- 已实现范围：任务起点、可收起会话导航、输入/配置菜单、线程与审批、左树及右侧独立只读文件预览、全目录搜索、变更/终端/浏览器工作区；文件菜单键盘、复制/加入对话、跨会话与同会话换根隔离已有下述历史原生证据。workspace 读取失败不写空、late hydration 保留 local clearing、按 key 顺序写入及离开等待最新保存已修复；工作区监听、统一两读队列和外部编辑器已落地，本批受限并发回归、完整原生操作与重载恢复通过，最终限定结论只看本批证据索引。
- 当前增量：删除虚拟行与只看变更已接入；本批最终自动检查/headless/审计通过，新独立源码/10 图逐张复核 slice-pass，未见可复现 P0–P2，文档一致性复核通过，最新限定结论统一见 [删除与筛选证据页](./assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)。旧 overlay ship 保留原范围，不覆盖本批。
- 下一步：先核对本批文档一致性复核；电脑操作工具恢复后确认监听/编辑器错误态实拍与复评，再做图片和 Git 原生浅深色/同态 ZCode 比较；不可用时先做搜索 ignore，再分别推进 metadata watcher、媒体 lease/Range 和高亮 Worker/profile。此前 `9→0` 仍未归因；继续复现须记录 session/target/timeOrigin 与保存次序，force reload/进程终止不保证异步保存。
- 未完成：搜索 ignore 规则/配置、Git metadata watcher、音视频/Office、首次 grammar/病态单行/布局 profile、可靠冷启动/安装包性能、正式安装包、Windows、真实模型完整状态矩阵和 P0–P3 整体关口；旧 Vue 回退和用户数据继续保留。

## 9. 2026-09-28 开源 React UI 复核与选型

第 9–34 节为对应日期和批次的历史实施/验证记录。“当前”“下一步”和检查数字只描述当时状态，最新索引见第 35 节。

本节复核 GitHub 默认分支的仓库状态、许可证、包声明和相关源码/文档；**没有安装或运行候选，也没有验证它们在 Mira 的 Wujie 容器内工作**。采用具体版本或复制源码前，仍须核对该版本及文件级许可。这里的目标是借成熟 UI 降低手写量，不替换 Mira 的 Electron Harness 运行时。

| 候选 | 已确认的可复用部分 | 与 Mira 的冲突和结论 |
| --- | --- | --- |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT，`@assistant-ui/react` 支持 React 18/19；线程、消息、输入、工具渲染原语。其 [ExternalStoreRuntime](https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/content/docs/runtimes/custom/external-store.mdx) 允许由 Mira 提供消息快照和操作回调，不接管持久化。 | **首选接入试验**。计划、澄清、权限审批、文件成果和跨应用恢复仍需 Mira 组件与适配层；不能把通用聊天组件当完整 Harness。0.x API 须锁定版本。 |
| [assistant-ui/react-pi](https://github.com/assistant-ui/assistant-ui/tree/main/packages/react-pi) | MIT，已有 Pi 事件、工具和阻塞交互的 React 适配实现，可借鉴事件投影方式。 | 其 Node 入口面向 `@earendil-works/pi-coding-agent`、`PiThreadSupervisor` 和自己的线程契约；Mira 当前使用 `pi-agent-core` 加自有 Electron 会话/审批存储。**只参考映射，不直接引入其 Node 运行时**。 |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) | MIT，React UI 与 Agent/AG-UI 组件较完整。 | `@copilotkit/react-ui` 依赖 react-core 和 runtime-client-gql；为接入 Mira 需再适配一层协议/运行时。当前不选作底座。 |
| [AionUi](https://github.com/iOfficeAI/AionUi)、[Goose](https://github.com/aaif-goose/goose)、[Harnss](https://github.com/OpenSource03/harnss) | 分别为 Apache-2.0、Apache-2.0、MIT；可对照桌面工作台、工具过程、审批、成果和会话切换。 | 都是完整产品而非独立 UI 组件，运行时、路由和数据归属与 Mira 重叠；Harnss README 还明确标注早期开发和计划大规模重写。**仅作交互参照，不 Fork 整仓**。 |

### 推荐的复用边界

- **直接复用**：`assistant-ui` 线程/消息/输入原语及其 React 18/19 可用组件；已有 `lucide-react` 继续承担图标。先锁定包版本，检查生成组件的许可与依赖，再落到 Mira 的视觉规范。
- **薄适配**：由 Mira 的受控宿主接口输出会话快照、事件订阅和提交/停止/确认动作；在 React 侧投影为 `ExternalStoreRuntime` 所需消息与回调。Electron 继续持有模型凭据、任务执行、SQLite 和文件权限；React 不读取完整 `window.platform`，也不复制 Pi 会话管理器。
- **Mira 专属 UI**：会话/项目入口、计划与澄清、审批后果、工作面板、文件成果、失败/停止恢复。这里不可避免需要少量应用组件，但不重新手写通用聊天控件和基础交互。

### 放行试验与失败条件

1. 在现有开发态 React/Wujie 原型旁建立隔离试验，接一条真实宿主会话快照与事件流；不替换 `/workspace/chat`，不碰真实用户数据。
2. 验证一条任务链：发起任务、流式内容和工具过程、待确认节点的允许/拒绝、停止/失败恢复、成果打开，以及切到其他应用再返回后的状态恢复。审批是宿主动作，不由 UI 本地假完成。
3. 同时核对 1024×680 桌面窗口、浅色/深色、中文输入法、焦点/滚动和 Wujie 卸载后的订阅清理；先用隔离 mock 或脚本化事件，不把它算作真实模型验收。

若 `ExternalStoreRuntime` 的消息投影需要丢失关键审批/计划/成果语义，或导致同一状态维护两份事实来源，就只保留其独立控件并停止整线程接入，回到 Mira 自有线程容器。试验通过后再逐步替换旧 Vue Harness；旧生产页和数据路径在完整任务验收前保留。

## 2026-09-28 生产接入与方案 A 实施记录

用户已确认按方案 A 直接实施。第一方 manifest 登记 `mira-harness`，能力为 `harness:workbench`；宿主通过 `MessageChannel` 将绑定当前 `webContents` 的 grant 交给内置 React 页面，React 仅调用会话、项目、模型摘要、任务执行、审批、计划、澄清、停止和目录打开等受控 RPC。参数在 Vue bridge 与 Electron IPC 两层校验，React 不读取完整 `window.platform` 或模型凭据。页面重新导航会撤销旧授权并要求从 Shell 重新加载。

正式 UI 已从试验期固定三栏改为“线程常驻 + 会话/工作区按需展开”：空态和对话保持中心阅读宽度，会话抽屉承载新任务与历史，工作区承载任务状态、活动、工具记录、文件变更和成果入口；窄桌面任一时刻只打开一个面板。旧 `/workspace/chat` 继续作为回退，未通过打包及原生桌面验收前不删除或替换。

**当前状态**：294 项测试（含内置资源服务和 Harness 授权拒绝回归）、React/Vue 类型检查、Electron Vite 构建、React 静态资源构建、diff 检查与 Impeccable 检测通过。未签名 macOS ARM64 目录包内的 React HTML/JS/CSS 已确认存在。待做的是打包应用实际加载、授权撤销/重载、Windows 桌面验收，之后再进行截图级 UI 视觉验收与默认入口迁移评审。

隔离 Electron 开发版已打开正式入口并创建个人会话；新版与旧 Vue 之间的双向切换正常。浅色宽窗口截图发现会话抽屉的“新任务”与“关闭”图标重叠，已修正。1024×680 CDP 截图指向旧 Vue 画面，不能作为新版窄窗口证据；深色与最终视觉验收也未完成。

## 10. 2026-09-28 开发态接入试验进展

**已完成**：安装并锁定 `@assistant-ui/react@0.15.22`；增加独立 `/workspace/harness-pilot` 路由与 Wujie 子应用入口；Vue 宿主只传递会话、模型、任务、事件、停止及交互确认方法。React 用 `ExternalStoreRuntime`、Thread/Message/Composer 原语展示消息和输入；Mira 自有会话导航、模型选择、权限/计划/澄清区。事件 delta 临时投影，终态重新读取 Electron 持久化快照；切会话忽略旧请求，卸载取消事件订阅。原演示 `/workspace/harness-react-dev` 和生产 `/workspace/chat` 均保留。

**验证**：控制器 3 项针对性测试覆盖流式与终态快照、权限等待宿主调用、切会话/卸载；全量 Vitest 64 文件 271 项通过；React TypeScript、`vue-tsc`、Web 和 Electron 构建通过；开发资源服务经 Electron 同源代理返回 pilot HTML/JS。未验证真实模型、原生 Electron 交互、打包版、真实权限事件和成果打开。

**当时剩余（发送、允许审批、恢复及 diff 已在第 11 节验证）**：停止/失败恢复、审批拒绝和完整计划/多选澄清仍待验收。当前宿主 props 是开发态试验接口，不是生产级第一方 grant；上述链路放行前不得替换旧 Vue Harness。

## 11. 2026-09-28 任务链与恢复验证

**已完成**：Electron 主进程可按会话查询仍在等待的权限请求，超时或处理后即不返回；pilot 重挂载时恢复审批，运行活动和工具调用从会话快照更新，文件变更可预览持久化 diff。修复 `assistant-ui` 只接受助手消息状态的投影错误，避免发送后 React 根节点卸载。

**验证**：隔离 `MIRA_TEST_HOME` 下配置本地 OpenAI 兼容脚本模型，React 发送后收到流式回复；脚本请求写入 `pilot-proof.txt` 时，切到旧工作台再返回，审批仍在。点击允许后，文件仅在临时目录落盘，Electron 会话为 `completed`、工具记录为 `write/ok`，右侧展示 `+1 pilot approval passed`。浅色 1440×900、1024×680 与 Shell 驱动的深色页面已截图检查；开发者工具输入属于模拟交互。

**剩余/下一步**：审批拒绝、停止/失败恢复、计划和多选澄清仍需 pilot 端完整桌面联调；成果目前是已有 diff 的预览，不是任意文件打开器。当前 Wujie props 是开发态接口，生产第一方授权、真实模型、物理鼠标、打包版和 Windows 均待验收。旧 `/workspace/chat` 继续保留。

## 12. 2026-09-28 流程先行与页面切换门槛

React pilot 已补显式工作区选择、会话模型恢复、计划模式入口、计划内容审阅、单/多选澄清及停止/失败状态呈现。运行时仍由 Electron 持有，Vue Shell 仅经开发态有限宿主接口转接；这不是生产授权边界。全量 281 项测试和 React/Vue 类型、Web/Electron 构建通过。

本轮没有重新取得隔离 Electron 的拒绝写入、停止后继续、计划/澄清全过程证据；不能据此切换生产页面。下一关先完成这些桌面场景和 1024×680 浅/深色检查，再设计第一方 grant、资源打包、默认路由切换与旧 Vue 回退。若计划待确认或权限待确认跨应用切换丢失，仍按试验失败处理。

## 13. 2026-09-28 流程验证后的设计关口

隔离开发态 Electron + 本地脚本模型已走通第 12 节缺少的拒绝写入、停止/失败后继续、多选澄清、计划批准，以及允许写入和跨页审批恢复。1024×680 与 1440×900 的浅色/深色截图未见横向溢出；控制器回归测试覆盖重挂载恢复待确认计划。失败工具活动与会话整体 `completed` 可以同时成立，因此 pilot 的顶部和工作区统一呈现“部分操作未完成”，不以会话总状态替代工具结果。

这只放行**开发态脚本输入下的流程验证**，不放行默认入口切换。生产前仍需：把 React 静态资源随 Electron 包交付；以主进程绑定的第一方身份/能力授权替代 Wujie props 直接传宿主方法；核对中文输入法、焦点、长会话滚动和真实模型；按 macOS 打包版与 Windows 分别验收。成果现阶段只有持久化 diff 预览，任意文件打开需另定受控 API。旧 Vue `/workspace/chat` 继续作为回退。

## 14. 2026-09-28 长会话与流式内容修正

开发态 Electron 发现 `assistant-ui` 运行态消息内容原语未实时绘制已接收的增量；控制器和外部运行时快照正确，终态可显示。pilot 仅在当前流式节点直接展示同一份控制器正文，终态继续交回 `assistant-ui` 和 Electron 持久化快照。隔离脚本模型下，29 条增量期间 DOM 文本确实增长，向上阅读不被拉回，停止后无重复正文；这满足开发态的流式呈现检查，不代表真实模型或物理输入设备验收。

生产页面切换门槛不变：先用实体键盘与中文输入法复核 Enter、Shift+Enter、组合输入和焦点，再以真实模型跑完任务；之后审查第一方授权、包内资源及回退。CDP 普通 Enter 在补齐键码与文本参数后可发送；Shift+Enter 注入没有生成换行，仍需实体设备复核，不把模拟输入结果宣称为完整键盘验收。

## 15. 2026-09-28 会话目录入口

pilot 工作区可通过现有 Electron 会话目录接口打开文件管理器。React 不提供路径，只提交当前会话 ID；主进程以持久化会话/项目确定目录。按钮具备禁用、打开中及失败状态，异步操作不会污染切换后的会话。此入口不等于任意文件打开器，也不改变开发态 Wujie props 的授权性质。控制器回归、全量 287 项测试、React/Vue 类型与 Web/Electron 构建通过；实体点击和 Finder 结果仍须在隔离桌面环境复核。真实模型、实体输入、生产授权、打包与跨平台门槛不变。

## 16. 2026-09-28 隔离 Finder 结果

开发态 Electron 中已用开发者协议对 React 目录按钮执行 DOM `click()` 与 CDP 鼠标坐标输入；后者复核时确认宿主收到当前会话 ID、Electron 返回成功，Finder 实际目标为 `/private/tmp/mira-pilot-verify-CDOHSj/pilot-project/`。这证明开发态 Wujie 指针路由、主进程会话目录解析与系统打开结果；仍不能代替实体鼠标。真实模型探测仍返回 401，不能把脚本模型流程升级为真实模型验收。

## 17. 2026-09-28 输入换行复核

CDP 的 Shift+Enter 注入补齐 `char` 事件后，React 输入草稿从 `A` 变为 `A\n`，浏览器发出 `insertLineBreak`，没有新增用户消息；测试草稿已清空。此前未换行是注入参数不足。实体键盘、中文输入法与真实模型门槛不变。

## 18. 2026-09-28 真实模型闭环结果

隔离 DeepSeek `deepseek-flash` 已从 React pilot 完成短消息流式与重载恢复、文件审批写入/读取、停止后继续、`ask_user` 澄清、`present_plan` 确认和只读计划执行。文件写入严格落在隔离项目目录，绝对路径被拒后相对路径成功；审批前文件不存在，计划执行前后文件哈希与时间戳不变。`ask_user` 参数现已收紧为结构化 schema，并用真实模型验证 `multiSelect: true` 能渲染 checkbox。

一次真实模型澄清续跑仍直接输出计划文字而未调用 `present_plan`。Electron 运行时现补一次有上限的工具调用提醒；第二次仍无交互则明确失败，不把计划文本当作可确认方案。该分支的单元回归已通过，但真实模型复跑仍待完成；不可把单次成功当成模型遵循性已完全解决。全量 290 项测试、React/Vue 类型和 Web/Electron 构建通过。真实凭据已从隔离配置删除。生产授权、资源打包、实体设备和默认入口切换仍未放行。

## 19. 2026-09-28 计划交互与最终正文一致性

真实 DeepSeek 曾在运行时提醒后创建计划卡片，但此前流式正文保留了“本轮不调用任何工具”的首轮错误承诺。现只在提醒后成功创建交互时，用与 `question` 或 `plan-review` 一致的终态文案覆盖最终持久化正文；正常计划回复不变。隔离开发态 Electron 中，本地脚本模型确定性复现“先错误文字、后 `present_plan`”，React 最终展示待确认计划与一致正文，持久化快照同样一致；未批准执行。该桌面复核不替代修复后的真实模型重跑。全量 291 项测试、React/Vue 类型和 Web/Electron 构建通过，临时提供商已清除。实体输入、生产第一方授权、包内资源和打包版仍是默认入口切换前的关口。

## 20. 2026-09-28 输入复核边界

隔离 React 页面已用浏览器组合输入事件复核：中文组合文本不会因 `isComposing` 的 Enter 提前发送；Shift+Enter 保留换行且不创建用户消息。macOS 原生辅助功能权限返回 `-25211`，本轮无法取得实体键盘、中文输入法和物理鼠标证据；浏览器事件结果不能替代原生设备验收。默认入口切换前仍须在有权限环境补做，并完成生产授权、React 包内资源和打包 macOS/Windows 验收。

## 21. 2026-09-28 修复后真实模型执行复核

真实 DeepSeek `deepseek-flash` 在全新隔离目录中完成澄清、计划确认和只读执行。执行提示补充已确认方案的明确语义后，模型不再输出“请确认后我再执行”，而是执行读取和用户允许的只读命令并返回差异结论；计划和会话均为完成态，React 页面状态为“最近任务已完成”，文件哈希和修改时间不变。隔离配置和目录已清理。原生输入设备、生产授权、包内资源和打包版仍未验收。

## 22. 2026-09-30 ZCode 对齐后的交互收口

**已完成**：按 ZCode 的工作台交互实现收口新版 React Harness。桌面窗口保留会话栏、线程和工作区三栏；860px 以下会话与工作区改为互斥浮层。会话项目展开偏好增加加载完成门槛，避免初始空数组覆盖持久化值；会话键盘拖拽采用 `sortableKeyboardCoordinates`；会话关闭按钮补齐局部定位上下文。终端建立握手前缓存输出并在绑定 terminal ID 后回放；浏览器导航增加会话代次校验，过期导航完成后主动关闭旧会话。React 构建产物同时带 `apps/harness-react/NOTICE.md`，保留 ZCode Apache-2.0 派生声明。

**验证**：`npx tsc -p apps/harness-react/tsconfig.json --noEmit` 通过；全量 Vitest 70 个文件、315 项测试通过；`npm run harness:build` 通过并确认 `dist/harness-react-app/NOTICE.md` 存在；`git diff --check` 通过。Impeccable 仍提示两个可拖宽边界的 width transition 和 Markdown blockquote 的 3px 左边框，这些属于视觉性能与样式收口项，不影响本轮交互修复。

**剩余**：还需要在 Electron 打包版完成桌面三栏、860px 窄窗口互斥、终端首段输出、浏览器切会话、键盘排序和深浅色截图验收；之后再进行高保真视觉调整。当前没有切换旧 Vue `/workspace/chat` 的默认入口。

## 23. 2026-09-30 Harness 工作台 UI 重整（第二批完成，完整规格待续）

**输入与结论**：用户提供的实际截图显示 Composer 模式文字被挤成竖排、主线程与右侧面板大量留白、入口层级不清；现有版仅能跑通功能，不能作为正式视觉验收结果。交互目标、信息架构、状态矩阵及目录边界已写入 [MIRA_HARNESS_WORKBENCH_INTERACTION_SPEC_2026-09-30.md](./MIRA_HARNESS_WORKBENCH_INTERACTION_SPEC_2026-09-30.md)。参考 Codex/ZCode 的任务主线与可持续侧边面板，复用现有 assistant-ui、dnd-kit、xterm、lucide 和 ZCode 派生令牌；没有引入完整 ZCode 运行时或新协议。

**本轮已实现**：React 源码从单层平铺迁至 `app/components/interactions/session/workbench/workspace/platform/state/hooks/lib/styles`；生产、Pilot、演示入口及 build/dev/test 路径同步。Composer 模式保持横向，中文组合输入 Enter 不误发，发送失败尝试恢复草稿；模型和权限改为 Radix Dropdown Menu，自动审核/完全访问仍需二次确认。会话侧栏可搜索，并把置顶、需要处理、运行中、项目、最近任务去重分组。右侧活动面板增加待确认返回和失败重跑入口；文件树增加已加载文件筛选、刷新、复制；变更面板增加增删统计和行号。计划审核新增修改要求，澄清向导的跳过选项可完成提交。

**会话级工具与窄窗**：工作区 tab、选中变更和浏览器 URL 按会话保存到第一方 preference；隐藏面板或切换会话不卸载已打开的终端，PTY 调用显式绑定所属会话。终端面板支持多个实例、重命名、重启和关闭；浏览器因 Shell 当前只有一个原生 WebView，切会话关闭旧视图，回到会话时按保存 URL 重建，不保留原生历史栈。<=1180px 侧栏/工作区是互斥浮层，支持遮罩、Esc、初始与返回焦点、Tab 焦点约束。

**验证**：`npx tsc -p apps/harness-react/tsconfig.json --noEmit`、`npm test`（72 文件/321 项）、`npm run harness:build`、`npx electron-vite build`、`git diff --check` 通过。Electron 自带 Chromium 加载生产 React HTML 和模拟授权宿主，在 1440x900、1024x900、820x900 截图确认页面非空、浅/深色渲染、紧凑浮层和模型菜单可见，DOM `scrollWidth === viewport`；模拟宿主统计两个终端打开后隐藏/重开面板仍为 2 次 open/0 次 close，主动关闭一个才有 1 次 close。这是模拟宿主的渲染与生命周期检查，不是打包版、真实 PTY 输入或真实模型验收。

**剩余与下次入口**：交互规格中的部分高阶体验尚未完成：文件树搜索只筛选已加载节点，未做全目录搜索；变更尚未按 run 分组或折叠大段上下文；活动面板缺运行时长、工具错误复制；浏览器恢复只保留 URL；任务线程的长会话自动滚动和状态矩阵需要真实桌面复验。`HarnessWorkbench.tsx` 仍约 600 行，后续可把文件/变更/浏览器面板继续拆入 `components/workspace`。下次先在隔离开发 Electron 中逐项验证运行中、待审批、失败、完成四态及真实文件、终端和浏览器，再做 macOS 打包版与 Windows 验收；在此之前不替换旧 Vue `/workspace/chat` 默认入口。

## 24. 2026-09-30 首屏任务起点与配置层级改造

**已完成**：根据 ZCode/Codex 对比评审，首屏空态改为 Mira 任务起点（`pilot-launchpad`），任务说明与 Composer 处于同一垂直区域；有任务历史时继续使用底部固定 Composer。侧栏增加当前工作区 scope 摘要，并将当前项目置顶。Composer 显式展示任务范围、项目名和目录；模型保留紧凑选择，权限、Skill、MCP 收进基于 Radix Dropdown Menu 的“高级设置”，权限档位增加读写风险说明，原有二次确认和宿主调用不变。右侧面板标题改为“任务工作区”，同步展示当前项目、任务名和实时状态。

**验证**：`npx tsc -p apps/harness-react/tsconfig.json --noEmit`、`npm test`（72 个测试文件/321 项）、`npm run harness:build`、`npx electron-vite build`、`git diff --check` 全部通过；短暂启动 React 资源服务后，`/harness-react-dev/`、`pilot/` 和 `app.css` 均返回 200。未把静态构建或资源可达性当作视觉完成，真实 Electron 截图需下一轮补做。

**下一步**：启动隔离 Electron 做 1440px、1024px、820px 的真实截图与窄窗交互复验；再处理工作区常驻上下文、运行态摘要和侧栏平台级入口。此轮复用现有 Radix、assistant-ui、lucide 与 ZCode 派生 token，没有复制 ZCode 业务命名或运行时实现。

## 25. 2026-10-08 第二批增量

**已实现**：工作区动态标签排序/键盘操作、中键关闭、关闭其他/全部、最近关闭恢复；模型与推理档位按会话持久化，有文本/附件的已有会话草稿在启动清理中保留；原始 PTY 输入和恢复活动终端自动挂载；launcher 小于 480px 容器宽度为单列资源行，至少 480px 为自适应卡片；首屏水印移除。流式和完成态代码使用 Mira `shiki/core` + JavaScript engine 适配器，保留 253 个物理 grammar、235 个公开 ID、含别名 332 个名称；实际注册两个 GitHub 主题，完整代码/语言/主题缓存键按 128 项和 1,000,000 key 字符上限淘汰。

**已验收**：原生拖拽保留选中，中键关闭非活动终端不抢浏览器选中，关闭其他/全部与最后标签回 launcher，A/B 标签和关闭历史隔离；恢复终端创建新 PTY 40982 → 41412 且旧进程消失。iframe 焦点下 `⌘N` / `⌘K`、原生文件多选去重/移除、实际引用发送时切会话及不可读附件失败后的原草稿/chip 恢复通过。模型 reasoning 能力控制入口，B 高/A 低在 A/B 导航中各自恢复；完成态两段 TypeScript 各含 13 个带样式 token。

重启后 C 未发送草稿与外部附件、A 低/B 高档位恢复，切任务后活动终端自动连接；真实 PTY 单独空格/Enter 成功。真实键盘 Tab 到非活动文件标签后 Enter 激活而不拖动，Space → Left → Space 排序成功。

launcher 原生拖宽从 420px 单列/48px 行变为 559px 三列/88px 卡片；深色完成态代码各 13 个 token，实际使用 `--shiki-dark`。正式 Harness Frame 限定剪贴板写授权后，原生复制及 `pbpaste` 精确源码/尾换行通过，未开放读取或改变 sandbox。

失效文件提交实际显示“引用文件已不可读取，请重新选择文件后发送。”并保留草稿/chip，恢复后实际重发成功；A 低/B 高实际请求分别传 `reasoning_effort: low/high`。

原生 Tab 补全 README 后 Enter 输出文档，`Ctrl+@` 经 `od` 输出 `00`、`stty` 恢复；`Ctrl+Space` 被 macOS 拦截，不算通过。真实新任务起点无 M 水印。

侧栏原生重命名同步 Header/Sidebar，归档当前及二步确认删除后列表/标题/主线程无残留、自动切 B。实际 Vue 模板 SSR 三组 manifest 剪贴板回归 3 项通过并纳入最终全量，仅 Harness 有 write-only，无 read/same-origin。

**收尾修复前的验证**：14:03:43 当次全量 80 文件/455 项、React/Vue 类型检查与 `git diff --check` 通过，正式 `harness:build` 两次通过；14:02:52 静态闭包 3 JS/1,959,740 bytes，全部 287 JS/9,483,981 bytes，磁盘/内存构建 SHA-256 一致，239 动态引用齐全，旧块残留 0。当前未提交、未推送。

## 26. 2026-10-08 收尾增量

`platformIpc` 用 WeakSet 对每个 WebContents 注册一次 `destroyed` 钩子，共同清理 grant/PTY，避免授权创建/终端打开的监听积累。14:11:38 全量 80 文件/458 项在 3.79s 通过（`platformIpc` 16 项含新增 3 项），React/Vue 类型检查重新通过，diff 检查通过。React 产物未变、未重新构建，保留 14:02:52 字节记录。

隔离开发 Electron 重启后的原生 12 次设置往返都有 iframe、无路由错误，16 次终端创建均连接并可关闭回单终端；无监听超限警告，最后离开到设置时 PTY 回收、返回输入区无非空 alert。销毁清理一次/窗口隔离仅单测验证，不算原生多窗口或发布验收；当前未提交、未推送，下一入口保持高亮 profile 和文件树/独立只读预览。

**本批当时的剩余与入口**：profile 首次高亮长任务/布局跳动、进程冷启动及安装包性能；六次 `no-store` 导航不作可靠冷暖对照。文件树/独立预览为当时下批计划，当前结果与续做入口更新至第 27 节；本段保留 14:11:38 的历史边界。

## 27. 2026-10-08 文件工作区增量

**已实现**：左侧项目文件树替换任务侧栏，返回任务不关闭右侧预览；树行固定 28px、缩进 12px，采用虚拟列表、完整树键盘与单一 Tab 入口、Radix 菜单、目录懒加载和刷新重试。右侧以完整相对路径 `file:path` 区分独立只读页签，40px 工具栏支持 Markdown/源码切换、自动换行、复制相对/绝对路径及内容、加入对话；加入只更新附件，不自动发送。会话和项目 root 各自隔离。

**修复**：累计引用 12 项原子限制、个人工作区提示、正式入口文件样式覆盖，以及同 session 移到新项目时旧树/预览/附件的失效。8001 行源码早期仅挂载 50–61 行 DOM；原整体高亮 888ms 已定位，新高亮采用分块与 8ms 扫描预算。

**检查与原生证据**：15:04:30 全量 82 文件/596 项在 6.08s 通过，React/Vue 类型、`git diff --check` 与正式 React 构建通过。同名文件独立 tab、28/12/40 尺寸、精确源码复制、返回保留预览、B 不继承 A 附件/预览、右键 Escape 回树且单 Tab 入口、Left/Right/Shift+F10、空文件、丢失文件友好错误/禁加入/恢复重试、中键关闭 beta 与最近关闭恢复，以及同 session 从 Alpha 移到新项目后立即显示新 root 并精确复制路径已有开发态正式入口原生证据。最新 8001 行 fixture 完整高亮耗时 2205.5ms、`highlight longTasks=[]`、挂载 46 行；滚动为 `longTasks=[]`、挂载 56 行、`first=17/top=550`。该异步完成耗时不与旧同步阻塞直接比较，也不放行整体性能。

**剩余与下次入口**：从 [当前对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md) 继续首次 grammar 加载、病态单行与布局边界，再安排可靠进程冷启动及安装包性能。完整工作区搜索、watch、外部编辑器、媒体预览、Git 状态叠加、BrowserView/CDP、插件市场、完整模型目录、真实模型完整矩阵、正式安装包、Windows 及 P0–P3 未放行。当前未提交、未推送。

## 28. 2026-10-08 文件工作区收尾

**修复与收尾**：独立 finish review 发现隐藏关闭按钮参与标签布局，挤压标题。CSS 已改 absolute overlay：非活动标签宽 60–156px、活动标签最小 128px；hover/focus 根据关闭按钮显示留标题空间并渐隐。原生复验与同一 reviewer 确认布局项 resolved，活动 README 完整可辨、非活动保留 emp/tran/large。独立 documenter 更新 DESIGN/sidecar，8 节/schema2/9 静态组件断言通过，DESIGN 过期项 resolved；remaining clear、disposition ship 仅限这两项，整体 ZCode/性能/发布不放行。

**最终原生及截图**：`/tmp/mira-file-tabs-finish-smoke.mjs` exit 0，隔离 Electron PID 13338、窗口 2039、1440×900。六 tab client/scroll 418/443px、活动宽 128px、README label 73.648px；Space → Left → Space 排序、中键关闭 source 不抢 README、最近关闭恢复及五秒稳定通过。设置 → 外观深色 → 返回恢复六 tab、无非空 alert，树右键 Escape 回 alpha/README 焦点。15:35–15:36 的浅色/深色/深色菜单最终图已固化 `docs/assets/mira-zcode-alignment-2026-10-08/mira-file-workspace-{light,dark,dark-menu}-final.png`，逐张检查且 SHA 与原图一致；详见 [文件标签收尾](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-文件标签收尾)。

**最新检查**：15:27:21 全量 82 文件/596 项在 5.43s 通过，React/Vue 类型重新通过；15:26:55 `harness:build` 完成。15:27:43 `write:false` 只读审计确认 287/287 JS 一致；静态闭包 3 JS/2,005,769B（逐文件 gzip9 605,004B）、全部 JS 9,530,010B（gzip9 1,903,569B）未变；CSS 124,328B（gzip9 22,163B），12 个关键 CSS 与 7/7 许可通过。15:04:30 测试和 15:11:26 审计保留先前历史。

**当前入口**：先独立复现工作区 preferences 读失败回写空值、快速离开未等最后保存的相邻风险；它们不是此前 `9→0` 未归因观察的已证实根因。之后继续文件搜索/watch/外部编辑器和首次 grammar/病态单行/布局 profile；可靠进程冷启动、安装包性能、Windows、真实模型完整矩阵、媒体/Git 状态叠加及 P0–P3 均未验收。未提交、未推送，产物完整性不是原生验收结论。

## 29. 2026-10-08 搜索与状态保存增量

**实现与交互**：host `files.search({ sessionId, query, refresh? }) -> { entries, truncated }` 搜索持久化会话的完整授权目录，含隐藏项、`.git`、`node_modules`；复用上游 basename/相对/绝对路径 fuzzy scoring，top1000 与截断标记。realpath/`dev:ino` 隔离 root，60 秒 TTL、4-root LRU、估算累计 128MiB 缓存；8 目录并发、约 8ms 扫描/评分预算后让出线程，返回前再校验候选，不可读目录使整个搜索失败。React 28px 框/120ms 防抖、立即清旧结果、epoch/序号抑制/重试；文件打开保留 query，目录打开清 query，`revealPath` 强制按 root → 祖先 → 目录刷新。

workspace preference 读取成功才 ready、失败不写空；late hydration 保留同会话 local edit/clearing，合并未触碰会话。按 key 有序写入，保存最新 snapshot 并 merge loop 吸收后续修改；受控路由离开 await 最新成功 save，失败显示并阻止离开、支持 retry。StrictMode replay、读/写失败、晚到读取、保存期间新修改和快速 unmount 等有回归；force reload/进程终止不保证 async 保存。此前 `9→0` 仍未归因。

**证据**：16:34:16 全量 84 文件/643 项在 5.03s 通过，React/Vue 类型及 diff 通过，正式构建约 16:34:15 完成；16:35:08 最终审计 287 JS SHA 一致、缺失/旧块 0、239 动态目标完整、7/7 许可及 NOTICE/HTML 一致。静态 3 JS/2,011,166B（逐文件 gzip9 606,344B），全部 JS 9,535,407B（gzip9 1,904,909B），CSS 125,300B（gzip9 22,261B）；16:21:10 的 84/643（4.77s）和 16:20:47 构建保留原时间。

原 P2 reveal 经独立 reviewer 标 resolved、树 17 项回归；搜索原生 smoke exit 0，覆盖未展开 deep/file、query 保留/首次 clear 回树、目录 reveal、无匹配、Down/Enter/Escape、chmod 无部分结果/恢复 retry，observer `longTasks=[]`。原生保存故障阻止设置离开且 timeOrigin 不变、retry 最新 snapshot 后可离开；返回展开树与原 tab 恢复，工作区默认收起、展开后标签可见。最终桌面脚本完整重跑 exit 0，深色菜单/Escape、新文件 refresh、1100 匹配 cap1000 明确提示/End `0999`/37→36 虚拟行、A→B 同 query 无匹配→A query 空且原 tab 恢复均通过；首次 selector 拼写失败更正后重跑，1101 测试文件/随机目录 finally 清理，无故障注入残留。六搜索图及 ZCode 对照已固化。新收尾 reviewer disposition **fix**：重复同路径打开后 clear 不定位，需统一 X/Escape/清空输入定位并补组件回归/同一原生复验；上述数字为该新发现修复前证据。Node helper 约 131781 文件 cold 818ms/warm 89ms、timer gap 17ms 是搜索单次抽样。

**剩余与下次入口**：先完成重复同路径 clear 定位 P2 的最小修复、组件回归和同一原生复验；权威入口 [本批对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-搜索与状态保存增量)，交互契约见交互规格第 8.3/8.7/20 节。追查九标签变零先补 session/target/timeOrigin 与保存次序；文件 watch/外部编辑器/媒体/Git、首次 grammar/病态单行/布局与可靠冷暖/进程冷启动，安装包/Windows/真实模型完整矩阵及整体 ZCode/P0–P3 分别验收。未提交、未推送，不以本批回归放行全部关口。

## 30. 2026-10-08 搜索清除定位收尾

**完成与证据**：`setSearchQuery` 统一 onChange/X/Escape，空白 query 按当前 `selectionPath` 重新排队 `pendingReveal`，既有 layout/searching 依赖不改。新增 5 项真实组件 callback 回归，覆盖 X/Escape/deleting/whitespace 重复 same path 与无 selected；16:48:05 旧三入口 4 fail/1 pass，恢复修复后 16:48:33 5/5 pass。修复后的同一原生复现 exit 0，首次/重复 X/Escape/实际 Cmd+A → Backspace 均 scrollTop=5386、行 794..822 在视口 132..834 内；200 生成文件 finally 清理。

**最终证据与限定评审**：16:50:22 全量 85 文件/648 项在 6.26s 通过，React/Vue 类型与 diff 重新通过；最终构建 app mtime 16:53:05、bundler 378ms、exit 0；16:53:57 审计 287/287 JS SHA 一致、缺失/旧块 0、239 动态目标及 645 静态边、7/7 许可、NOTICE/HTML 完整。静态 3 JS/2,011,179B（逐文件 gzip9 606,377B），全部 JS 9,535,420B（gzip9 1,904,942B）、CSS 125,300B（gzip9 22,261B）不变。浅深色完整原生脚本均 exit 0，浅色 longTasks=[]、top1000 37/36 行、A/B 隔离及最终 needle/transient 两 file tab 通过；六修复后截图已逐张检查、覆盖固化且 SHA 一致。同一 reviewer **Verdict Pass**，唯一 clear P2 **resolved**、Remaining **clear**、Disposition **ship**，仅限这次定位修复。

**剩余与入口**：本批收尾完成，权威入口 [本批对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-搜索清除定位收尾)，交互规格第 21 节；第 29 节的 84/643、16:35:08 审计与 fix 保留修复前历史。watch/外部编辑器、性能/可靠冷启动、安装包/Windows/真实模型及整体 ZCode/P0–P3 继续分别验收；`9→0` 未归因、force reload/进程终止不保证 async 保存。未提交、未推送。

## 31. 2026-10-08 工作区监听与外部编辑器

**完成与交互**：受控非递归目录监听绑定 owner/grant/session/canonical root，宿主 150ms、React 300ms 合批；每订阅最多 256 目录（含 root），每 owner 最多 8 订阅，无轮询。子目录身份变化重绑、消失时监听存活祖先并恢复，alias 改指已监听目录仍全失效。树/预览共享订阅、搜索强刷；隐藏预览激活再读，删除保留标签和错误恢复。树首次/reveal/手动/监听刷新共用每个数据源两项实际在途目录读取预算，旧 epoch 未完成读取仍计数；grant 撤销与主 renderer 导航/崩溃/销毁回收 watch/PTY。

外部编辑器使用固定 Mira ID、30 秒探测缓存与最多 4 worker，失败等待在途任务排空；32px PNG 图标采用有界异步读取。28+20px 标题栏分体按钮、160px Radix 菜单、树打开方式和预览外部打开已接入，主/子菜单受 Radix 可用高度约束并可滚动，目标路径仍受授权 root 限制。启动使用参数数组、`shell:false`，Windows GUI 不等待退出；偏好读取失败保持错误，仅失败时允许重试 hydration，普通重探测不重复读取。失败 launch 不阻断初始/重试 hydration，成功显式选择阻止旧偏好覆盖且仅保存最新选择；卸载/controller 变化后迟到结果不保存，偏好保存失败可见。文件继续只读。

**验证**：本批构建/类型、受限并发全量回归、完整原生操作与重载恢复通过；独立代码复评发现的偏好时序问题已修复并有先红后绿回归，独立最终视觉复评待归档。最终数字、失败重跑、日志与限定结论仅引用 [本批验证证据](./assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md)，不重复数字。默认并发高亮及限制并发监听用例超时的历史不能被覆盖，不宣称默认全量无条件通过；第 30 节的 ship 只覆盖搜索清除定位。

**剩余与下次入口**：先核对证据索引的独立最终视觉复评，下一批为真实位图与 SVG 预览/源码切换：新增宿主授权图片读取桥，复用会话/root 隔离、监听和错误恢复，不将预览冒充图片加入模型上下文。之后音视频/Office、Git 叠加、首次 grammar/病态单行/布局与可靠冷暖/进程冷启动分别推进；高级浏览器/工作流、安装包/Windows/真实模型、Novel Studio/分发和整体 ZCode/P0–P3 分别验收。交互契约见交互规格第 8.8、8.9、22 节；旧批次待办保持历史，watch/editor 不再是未实现 TODO。`9→0` 未归因，强制 reload/进程终止不保证异步保存，未提交、未推送。

### 2026-10-09 续作

**完成**：本批最终构建、类型、受限并发全量回归与完整原生操作通过：监听刷新/恢复、真实外部编辑保存、打开失败恢复、重载后监听重接及短窗口多项菜单真实滚动均有固化日志，浅深色实拍已固化。同步偏好失败重试/失败 launch hydration/成功选择屏障、主子菜单高度约束与当前入口；旧检查和锁屏中断保留历史，最终数字只在证据页记录。

**剩余与下次入口**：独立最终视觉复评待归档，从 [本批证据页](./assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md) 核对限定结论；下一次从上节真实位图/SVG slice 开始，不重新实现监听/编辑器。后续音视频/Office、Git/profile/发布待办分别验收，默认并发高亮超时、强制 reload 保存与 `9→0` 未归因边界保持，未提交、未推送。

## 32. 2026-10-09 位图与 SVG 预览

**完成**：宿主 `files.read-image({ sessionId, path })` 按会话/项目授权 root 读取支持的位图相对路径，4MiB 上限、有界 handle 读取和前后 stat/root/路径复核已接入。React 保持 40px 工具栏，新增 8px 透明棋盘、`@Nx` 尺寸、加载/解码失败与 retry；SVG 沿用文本读取并可切预览/源码。原有身份隔离、共享监听、隐藏延期读取与恢复继续复用。

**动作边界**：位图无文本复制、自动换行和加入对话，树内加入也禁用。SVG 预览使用编码 `<img>`，decode 失败的预览态禁加入，读取成功的源码态仍可复制/换行并按单文件 256KiB、累计 1MiB、最多 12 项的文本附件边界加入。预览不等于模型图片上下文，不新增内置写回。

**验证与剩余**：最终受限两 workers 自动检查与 headless 局部确认通过；最终自动检查、无头 fixture 与限定结论只看 [图片证据页](./assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md)。同一 reviewer 已确认两项 CSS P2 与 SVG 源码动作三项修复通过，仅覆盖 headless React。实际生产 JS/CSS 和图片 helper 的 fixture 不代表真实 Electron grant、原生操作或 Vue 设置通过。原生图片浅深色/同态 ZCode 比较、上轮错误态浅深复拍及复评确认仍待完成。

**下一次入口**：桌面空闲后先恢复上轮错误态确认，再完成图片原生验收与同态 ZCode 比较，然后音视频/Office、Git/profile、可靠冷启动和发布矩阵；不重复实施图片。代码入口为 `harnessWorkspaceFiles.ts`、第一方文件桥、`FilePreviewPanel.tsx`、`MiraImagePreview.tsx` 与 `lib/image-preview.ts`，契约见交互规格第 8.10、23 节。旧第 31 节及此前“下一图片”/检查数字保留历史；整体 ZCode/P0–P3 未放行，未提交、未推送。

## 33. 2026-10-09 Git 文件树状态叠加

本节保留 overlay 批次历史；删除与筛选及其新验证见第 34 节，旧未实现项、数字和限定 ship 不覆盖当前入口。

**完成**：`lib/file-git.ts` 与 `ProjectFileDrawer.tsx` 对现有树/搜索行显示名称颜色与直接 `M/A/D/R/U`；目录直接状态可显示字母，后代汇总只有单个 dot，`M` 优先于 `A/D/R/U`，本批 deleted 仅进入祖先摘要，尚未补删除虚拟行。ignored 精确命中仅当前行置灰、不传播祖先。status/ignored 各单在途，ignored 每批最多 512 可见路径并缓存，刷新/卸载/会话或 root 变化抑制过期结果。

**读取与刷新**：`files.git-status/ignored` 按会话授权 root 使用异步 `execFile` 和 NUL parser，前后复核 root/repository/metadata 身份，IPC 返回前复核 grant/session/root。后端最多两命令并行、16 等待，10 秒超时，stdout/stderr 各 8MiB。首次、手动与工作区通知刷新；非仓库 `available:false`，失败有安全提示及 retry。无 Git 写操作、无 metadata watcher，外部 add/commit 不保证自动刷新。

**验证与剩余**：受限两 workers 自动检查、React/Vue 类型、React/electron-vite 编译与正式 React headless 通过，最新数字、7 张 PNG、日志与复核统一见 [Git 证据页](./assets/mira-zcode-alignment-2026-10-08/GIT_OVERLAY_EVIDENCE.md)。独立复核原 P2 已解决、未见回归，remaining clear；限定 ship 仅覆盖本只读 Git 源码/headless 与文档修正，原生桌面验收暂停。headless 使用 MessageChannel、实际第一方桥/parser 和真实隔离 Git helper；grant/IPC 是单测、watch 是 fixture，不能代替真实 Electron grant、原生操作、Vue 设置、安装包或 Windows。

**下一次入口**：桌面可用后确认监听/编辑器错误态和复评，再完成图片与 Git 原生浅深色/同态 ZCode 比较；不可用时先推进删除虚拟行/changed-only，再分别设计 metadata watcher、媒体 lease/Range 与 performanceWorker/profile，均未实现。契约见交互规格第 8.11、24 节；第 32 节图片及更早数字保留原范围。整体 ZCode/P0–P3 未放行，未提交、未推送。

## 34. 2026-10-09 删除虚拟行与只看变更

本节保留 filter 批次历史；搜索 ignore 已在第 35 节实现，本节旧待办、数字和限定 verdict 不作为当前入口。

**完成**：仅在已加载父目录补缺失 deleted 文件，不造缺失祖先、不改文件数据源快照；按父目录去重和批量合成。28px 图标只看变更保持原视觉 token，树态保留变更祖先、搜索态只保留直接非 ignored 状态且不补 deleted 搜索项，重算可访问同级位置。D 点击/Enter/Space 只选中，Open/打开方式与 editor 回调禁用；复制和非位图加入对话保留上游行为，chip 不读文件、实际发送由宿主校验。

**状态与验证**：query/展开/选中不被开关清除；loading 保留最后成功 available/index、筛选、D 菜单与行焦点，清 ignored cache 并推进 version guard；失败/非仓库、session/root 变化才重置。最终两 workers 96 文件/928 项、React/Vue 类型、React/Electron 编译、产物审计及三视口生产 React headless 通过；旧生产 baseline、D 菜单 before-fix 和快照修复两项失败后 51/51 通过证据保留，仅此修复有 red/green 证据。准确时间、10 张最终 PNG 与独立终审见 [本批证据页](./assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)。新独立源码/10 图逐张复核 slice-pass，未见可复现 P0–P2，文档一致性复核通过；旧 overlay ship 不覆盖本批，headless/watch fixture/剪贴板 stub 不替代原生 grant、电脑操作、Vue 设置、安装包或 Windows。

**下一次入口**：核对本批文档一致性复核，下一未实现文件树 slice 为搜索 ignore 规则/配置，再独立设计 metadata watcher、媒体 lease/Range 和高亮 Worker/profile。电脑操作工具恢复后补监听/编辑器错误态及图片/Git 同态 ZCode 比较。契约见交互规格 8.11、25 节；整体 active、P0–P3/性能/发布未放行，未提交、未推送。旧数字、限定 verdict、`9→0` 未归因和 force reload 保存边界保持历史范围。

## 35. 2026-10-09 搜索忽略规则与 Vue 设置

**完成**：`ignore` 7.0.5 解析 `.miraignore`；首次非空搜索安全初始化根 `.gitignore` seed + 上游默认段，设置读取缺失文件只给模板。落盘后 `.gitignore` 不自动同步；同步只替 seed、恢复只替 defaults，作用于当前草稿，保存后落盘。分区标记缺失/重复明确失败，不静默重建。扫描入子目录前剪枝，规则版本/hash 与 root `dev:ino` 组成缓存身份，每查询读规则，编辑/删除/重建失效，旧扫描不污染新缓存，warm 返回复核 root。

**交互**：Vue `/settings/file-search` 复用既有平台设置，不另做 React 配置页；仅选择 DB 已有项目/个人会话工作区，无任意路径输入。加载前禁编辑/保存，未修改模板可首次保存、已有文件需修改后保存；重读/换工作区/受控路由离开确认未保存修改，失败留草稿，迟到/卸载结果不应用。空规则允许搜索默认排除目录，根 `.miraignore` 自身不作候选；规则仅覆盖实际工作区搜索，非 `@`/Command Center，不改变浏览、上传、预览和 Agent 权限。Mira 保留既有 dotfile 行为，不移植上游额外 `.env`/二进制/隐藏目录候选排除。

**验证与边界**：IPC 仅顶层 renderer，以 project/session ID 从 DB 推导 root；有界 UTF-8 handle、拒 symlink/特殊文件、hard-link no-replace 初始化、root 串行/revision/授权复核与 flush/原子替换/mode 保留。权限/只读失败搜索可用内存模板，危险规则文件不降级；最终 syscall 跨进程非绝对 CAS、root 移走临时文件残留和 hard-link 不支持显式失败仍是边界。最终数字、截图、构建/审计及限定评审见 [本批证据页](./assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)。真实 Vue 的独立 Chrome headless + HTTP 文件服务 fixture 不等于 preload/IPC/native，未操作用户 Chrome/ZCode/Electron。上游同版导航隐藏该 section，Mira 有意开放设置，不称上游隐藏页逐像素原生通过。

**收尾**：第二人发现的 awaited 授权 P2 已关闭：最后异步检查后同步授权紧接 link/rename，既有保存/模板保存/搜索初始化三类同一真实服务复现均不再落盘；修后全量/类型/构建/审计通过，准确记录见证据页。UI 仍用修前有效 headless 截图，未重拍，原生待验收；本次 await 缺口修复不等同于最终 syscall 的跨进程非 CAS 窗口已解决。

**真实桥续作（2026-10-09 13:26 +08:00）**：真实 Electron 复现第二个 P2：Vue `ref` 数组中的 Proxy target 经 `contextBridge` 报 `An object could not be cloned.`。`useSearchIgnoreEditor` 使用 `shallowRef` 与普通 `{ kind, id }` 请求快照，初读/重读/transform/save 不传 Proxy，回归与独立源码复核通过。最新全量/类型、React 与 Electron 重新构建与审计通过，JS/CSS 字节不变，准确数字只看证据页。13:14:15 的 [bridge/DOM probe](./assets/mira-zcode-alignment-2026-10-08/search-ignore-native/bridge-transport-results.json) 经过真实 preload/IPC，确认约 460B 模板、启用且内容一致的 textarea 与无 alert；三产物 SHA 与最新构建一致，但 probe 未重跑。这是 CDP 只读观察，不是实体输入/截图验收，7 张旧 headless 图未重拍。

**下一次入口**：从 [本批对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-09-搜索忽略规则与-vue-设置) 与交互规格 8.12、26 节继续；源码入口为 `harnessWorkspaceIgnore.ts`、`harnessWorkspaceSearch.ts`、`harnessWorkspaceIgnoreIpc.ts` 和 `src/pages/backend/fileSearch/`。前景仍为 `616=com.apple.loginwindow`，隔离 Electron 已退出、无可见窗口；原生脚本在夹具设置/输入前记录 `blockedBy=macOS-loginwindow`、0 actions/0 captures，未解锁或使用 `DOM.click`，不算功能失败。下次解锁后重启隔离 Electron，仅补本批配置/搜索/浏览有限原生验收，不自动扩展为完整 native 或同态 ZCode 放行。Git metadata watcher 仅为随后候选；旧错误态/image/Git、媒体 lease/Range 和高亮 Worker/profile 分别推进。整体 active，性能/发布/P0–P3 未放行，未提交、未推送；历史数字、`9→0` 和 force reload 保存边界保持。
