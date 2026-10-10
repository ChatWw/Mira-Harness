---
name: Mira Harness
description: Electron 桌面中的 React Agent 工作台，按用户提供的 ZCode 界面与源码适配。
colors:
  mira-primary-light: "#000000"
  mira-primary-dark: "#ffffff"
  mira-background-light: "#f8f8f8"
  mira-background-dark: "#161616"
  mira-panel-light: "#ffffff"
  mira-panel-dark: "#202020"
  mira-sidebar-light: "#f0f0f0"
  mira-sidebar-dark: "#161616"
  mira-input-light: "#ffffff"
  mira-input-dark: "#2b2b2b"
  mira-border-light: "rgba(13, 13, 13, 0.1)"
  mira-border-dark: "rgba(255, 255, 255, 0.1)"
  mira-success-light: "#1e8a3e"
  mira-success-dark: "#46bf72"
  mira-warning-light: "#e07b00"
  mira-warning-dark: "#ff8a30"
  mira-destructive-light: "#e03131"
  mira-destructive-dark: "#ff5c5c"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
    fontSize: "14px"
    fontWeight: 550
    lineHeight: 1.5
  caption:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  secondary:
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  badge:
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  frame: "12px"
  composer: "16px"
  control: "8px"
  compact: "6px"
spacing:
  frame: "4px"
  compact: "8px"
  group: "12px"
  content: "24px"
components:
  primary-button:
    backgroundColor: "{colors.mira-primary-light}"
    textColor: "{colors.mira-primary-dark}"
    rounded: "{rounded.control}"
    height: "28px"
    width: "28px"
  primary-button-dark:
    backgroundColor: "{colors.mira-primary-dark}"
    textColor: "{colors.mira-primary-light}"
    rounded: "{rounded.control}"
    height: "28px"
    width: "28px"
  composer:
    backgroundColor: "{colors.mira-input-light}"
    rounded: "{rounded.composer}"
    padding: "{spacing.group}"
  thread-frame:
    backgroundColor: "{colors.mira-background-light}"
    rounded: "{rounded.frame}"
  sidebar:
    backgroundColor: "{colors.mira-sidebar-light}"
    width: "264px"
  thread-header:
    height: "48px"
    padding: "6px 12px"
---

# Design System: Mira Harness

2026-10-10 10:13 +08:00 当前增量：分区排序、悬浮组标题及 >80 的组内/混合根层虚拟滚动已接；小组完整展示，+5 仅用于项目任务。操作等待/失败行保持原状态，键盘反向回退已修。154 文件/2600 项、React 类型/构建及产物审计通过，实际明暗宿主 35 项通过。准确完成/剩余、构建身份与下一入口见 [首屏总文档](docs/MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)，完整原生/ZCode 同态和性能仍未验收；下方旧日期记录保留历史身份。

最近更新：2026-10-10 08:19 +08:00。当前完成/剩余/下一入口统一看 [首屏完整对齐与验收](docs/MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)。沿用 ZCode 视觉与 token；默认启动、归档删除、跨组拖拽、任务行 hover/文件树和组内草稿已有限定验证。草稿临时行、正文/附件、关闭复开、首发提升与刷新保持的 12 张浅深图逐张检查，隐藏 Electron 不替代原生同态。

2026-10-10 09:33 +08:00：源码已接入首屏侧栏、对话执行、Composer、权威队列/引导、阅读恢复/历史轮次虚拟化及导航历史。项目/个人分区独立折叠、项目任务 +5 分页、Shell 搜索跨 frame 取消回焦和虚拟轮次 rail 已接。Composer 48px/历史 80px 图片缩略图、全画布图片组预览、左右循环、50–300% 缩放/拖动、原生保存及文件面板图片加入已接；图片内容独立存储，消息快照只带元数据。组内草稿仅显示临时行，准备 owner 隐藏，首次真实接纳后进入原组首；关闭复开与 F5 自动恢复保留正文附件，迟到确认不抢导航。启动回收保护历史/持久草稿/恢复/未确认提交，损坏数据保守保留。PDF/视频及完整原生/ZCode 同态、真实模型和整体性能仍待完成。09:00 已补三次 500 轮采样，首开中位数 157.8ms、慢样本 289.1ms 未解决；性能报告属于当时 `913bb8…` 构建，不覆盖随后搜索/分区产物，准确分布见性能记录。整体 active，发布/P0–P3 未放行，本批增量未提交或推送。

既有文件/搜索/Worker 证据继续保留原批身份，见 [对齐记录](docs/MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md)、[搜索证据](docs/assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)、[Worker 证据](docs/assets/mira-zcode-alignment-2026-10-08/HIGHLIGHT_WORKER_EVIDENCE.md) 与 [性能记录](docs/MIRA_HARNESS_PERFORMANCE_2026-10-08.md)。有限原生设置/搜索/浏览通过不代替本批首屏验收；旧错误态、图片/Git 同态、metadata watcher 和媒体保持独立待办，不抢当前优先级。

## Overview

**Creative North Star: "ZCode 桌面工作台"**

用户提供的 ZCode 软件、截图与源码是本轮视觉依据。Mira 保留自己的双层 Electron/Vue Shell、
业务名称与受控 Harness 服务；React 只实现应用内部任务界面。整体采用紧凑、平静的黑白灰
工作表面，任务线程居中，任务/项目导航与资源面板提供持续操作位置。

界面代码和变量使用 Mira 命名；上游版权、许可与来源原文保留于
[third-party-licenses](third-party-licenses/README.md)。这份规范不授权恢复已退出的主题色、
布局配置、Shell 多页签或自由微应用录入。应用内的文件与资源标签沿用当前工作区规范。

**Key Characteristics:**

- 双层 Shell 与应用任务画布各自承担职责。
- 黑白主操作、灰色表面、紧凑的桌面信息密度。
- 同一 Composer 承接新任务草稿和会话继续输入。
- 文件、变更、终端与浏览器属于当前任务工作区。
- 项目文件在左侧浏览，每个已打开文件在右侧拥有独立只读标签。
- 位图与 SVG 复用只读文件工作区，预览能力不等同于模型多模态附件。
- Git 状态装饰现有树与搜索行，精确 ignored 不影响祖先，只读快照不提供写操作。
- `.miraignore` 过滤复用 `files.search` 的文件抽屉、`@` 和 Command Center 查询；配置归 Vue，不影响浏览、预览、上传或 Agent 权限。
- 正式入口使用第一方授权桥，演示页不作为验收基准。

## Colors

前置 token 表记录主题中的实际值；实现源是
`apps/harness-react/src/styles/mira-foundations.css`。
内部使用 `--mira-*`，Tailwind `--color-*` 是工具类兼容别名。

### Primary

主操作跟随浅色黑/深色白，前景相反。模型、项目、普通菜单等次级控制使用透明背景和灰色
hover；不用独立彩色主题覆盖通用按钮。

### Neutral

背景、侧栏、主面板、输入和 popover 各用对应语义。结构以低对比边框和表面明度区分，
避免把同一个白/黑值硬编码到所有区域。暗色只切换宿主 `.dark`，不维护第二份应用主题状态。

### State

成功、待处理和危险各自使用 success/warning/destructive 语义；状态同时有文字或图标。
Git、diff、文件类型、代码与引用节点保留各自语义，不被通用黑白主操作覆盖。

## Typography

界面基础字号由 `--mira-font-size: 14px` 控制，Header 的 h1 也是 UI 基础字号。
`text-ui-xl/lg/base/caption/sm/xs` 分别为基础字号 +4/+2/+0/-1/-2/-4。
这些是内容角色，不应靠全局修改 html font-size 来缩放几何布局。

系统无衬线栈用于界面正文、标题和控件；`--font-mono` 用于命令、路径、代码、hash 与终端，
并保留 CJK 无衬线 fallback。新任务问候语的 28px（紧凑窗 24px）是现有起点标题角色，
不扩展为通用控件字号。

## Layout

Mira 外层由 Electron + Vue 提供窗口控制、全局入口、设置和应用画布；React 不复制 Shell
标题栏或外部应用切换导航。正式入口是 `/workspace/harness-react` 的 FirstPartyFrame。

桌面宽窗应用内结构为任务侧栏、主线程和按需工作区：

- 侧栏默认宽 264px，当前拖拽边界为 220–420px。
- 项目文件抽屉替换同一个左侧任务导航位置，返回任务时保留右侧已打开的文件。
- Header 为 48px；主线程面板圆角使用 frame token。
- frame 留 4px 外侧空间，左右分隔拖拽区宽 4px。
- 新任务 Composer 外容器最大 720px，左右各 24px，输入卡有效最大宽 672px。
- 会话消息与底部 Composer 区最大 840px；工作区默认 420px、可调 360–640px，按需展开。
- 1180px 及以下是紧凑桌面窗口，侧栏/工作区成为互斥浮层；当前分支不开发移动端布局。

具体任务起点、面板开合与拖宽行为记在工作台交互规格；本文的尺寸来自当前实现，
视觉结果仍由实际桌面截图验证。

## Elevation & Depth

默认工作表面以灰度层级和 1px 低对比边框划分。菜单/popover 使用
`0 4px 16px color-mix(in srgb, black 12%, transparent)`，紧凑窗口浮层使用更明确的
向下软阴影。阴影用于真实浮层或 Composer，不在每个消息和导航行外加卡片阴影。

局部 hover/focus 变化使用 120–160ms ease-out。尊重 `prefers-reduced-motion`，
不为常规工作区切换加入与任务无关的装饰动画。

## Shapes

frame、Composer、control、compact 使用前置 token 表的实际圆角。
主面板 12px 与 Composer 16px 承担不同容器角色，不能把二者合并成一个全局圆角设置。
发送、附件与模型等控件使用紧凑圆角；状态点和回到底部控件可使用圆形。
4px 分隔区保持可点/可拖，不借视觉留白扩大为占据内容的实心栏。
文件抽屉头部图标按钮沿用局部圆角（5px）；这是当前 CSS 的观察值，未新增或改写全局圆角 token。

## Components

### Navigation

顶部依次为新任务、搜索、自动化和插件市场；自动化与市场是 React 主视图，切换不清对话草稿。
分组/项目是两个一级视图，时间线在项目视图菜单内，按日期分桶/20 条分页；项目和自定义组各自支持全部展开/折叠。
项目/个人工作区使用 Radix Collapsible 独立持久开合，标题 14px，hover/focus 显示 chevron 与动作。项目区添加目录，个人区空/折叠仍能新建草稿；分区开合不导航、不改子项目偏好。项目全部展开/折叠以同一保存事务处理父区和子项目，个人区保持。
项目任务初始 5 条，每次 +5；各项目分页独立，项目/父区折叠、隐藏或离开可见视图清临时分页。搜索临时展开不落盘。项目/个人分区支持独立拖拽排序，标题动作 hover/focus 可见；有效放下保存一次，Escape/返回原位不保存，键盘只经过同级分区。

自定义组全部展示成员，根层未分组任务不截断；组内/混合根层超过 80 项才虚拟化，overscan 12、任务估高 32px，组实高持续测量，两层共享滚动。焦点、菜单、重命名、拖拽、归档确认、异步操作与错误反馈保留原行状态，不因移出视窗重复请求或丢失失败信息。展开组标题滚过视窗上沿且组尾仍可见时显示悬浮副本，名称/颜色/数量和真实组一致；副本支持折叠/新建/颜色/解散，150ms 退出期间立即禁用，拖拽或切视图立即隐藏。
独立自定义组提供名称、7 色、折叠、组内新任务、移入移出和解散保留历史；手动排序使用 dnd-kit 鼠标/键盘。
项目行在 hover 或 focus-within 时出现新任务、文件和更多，菜单可重命名、打开目录/终端、排序、隐藏；恢复隐藏入口不删除历史。
归档按钮切换归档列表而非归档当前任务，列表支持分页/恢复/二步永久删除，归档时保留全局置顶；批量永久删除以主进程完整快照确认，分别反馈成功/跳过/失败。
任务行保留单行密度、选中/hover、真实状态、未读和上下文动作；只在手动排序范围内拖拽。
新任务与搜索入口展示快捷键；图标动作提供 tooltip，菜单使用 Radix 的定位、键盘与焦点恢复。
底部设置、技能、MCP 与用量指向现有 Vue 页面，合法 pathname/query 被校验并保留正式 React 返回来源。
Shell 搜索、侧栏搜索与应用快捷键共用 HarnessCommandCenter，命令/真实正文片段定位/授权文件不重复造索引。
搜索取消由发起层回焦；Shell 的一次性请求经既有授权 port 回传，父层入口失效或其他目标已获焦则不抢回。执行动作/导航关闭不回旧入口，重复打开保留 query 并重新聚焦搜索输入。运行/待审批任务保留原分组/项目/个人归属，不额外复制到优先列表。
读取偏好成功前不能用默认值覆盖旧排序/展开/分组；失败可重试，离开需等待最新保存。

### Conversation first screen

48px Header 保留侧栏开合、可达工作目录、任务标题/菜单与编辑器/终端/工作区动作；按用户要求，状态归执行摘要、文件树入口归侧栏，不在 Header 常驻。
目录菜单展示项目和完整路径，支持复制与实际打开；标题菜单复用已有任务动作，不加入没有数据的分支/分享入口。
两轮起显示 ConversationTurnRail，TanStack Virtual 仅挂载可见按钮，Radix Hover Card 在 hover/focus 时展示真实用户/助手片段，点击先挂载目标再定位、滚动同步轮次；方向键/Home/End/Page 导航保留键盘焦点，迟到预览不跨任务。
用户文本附件以真实 chip 展示；相对 workspace 路径可受控预览，外部文本附件不能冒充可预览工作区文件。
有序parts展示真实公开思考/正文/工具调用，思考默认折叠，工具参数/结果/diff仅展开挂载；旧无parts消息保留运行卡。审批按request/run/tool显式身份内联，失败可重试，拒绝/超时/Stop保留取消记录；缺失数据明确说明，不造思考。渲染身份与canonical消息ID分离，完成/停止/失败后保持已展开详情；本批限定浏览器验证通过，原生与真实模型仍待验。
助手复制有反馈；重跑只出现在最新可重跑助手轮次，不能把旧消息的按钮接到最新任务。
TaskSummary 有内容才出现，自动/胶囊/展开三态显示真实计划、子任务、变更和活动；停止子任务经实际 Controller，失败可见。

### Composer

新任务和已有会话使用同一个受控输入区。左组是添加上下文与权限/计划，右组是上下文用量、模型、支持推理模型的强度选择与发送/停止。
计划为独立开关，权限档位互斥。项目条选择任务范围，附件与 Skill/MCP 不扩展成常驻多行设置面板。
输入失败保留草稿，运行/等待确认按真实状态限制动作。
显式新建/复开草稿在目标挂载后一次聚焦 Composer；hydration/阅读恢复/迟到响应不抢当前输入目标。
caret `@`/`/`/`$` 和 `+` 共用分类候选面板，Popover 保留输入焦点，方向键/Enter/Tab/Esc 和鼠标选择都保留触发前后正文。
文件/Skill/MCP/对话候选来自真实桥，loading/error/empty 可恢复，异步结果绑定当前会话/root/token；切任务不串候选。
统一宿主控制发送快捷键与用量可见性，中文合成期间不提交。Esc 优先关闭菜单，没有浮层时才允许停止任务。
运行中空稿停止，有稿按宿主权威队列接收；FIFO、撤回恢复、排序、立即发送及停止暂停/恢复保持完整输入与新草稿。统一设置默认 queue，普通发送入队、⌘/Ctrl+Enter 原子立即发送；guide 模式普通发送引导、修饰键入队。待消费引导内联展示，可撤回恢复；提交 ACK 不算消费，当前助手/工具批次完成后同一运行接续分段回复。停止/失败保留未消费项为暂停普通队列，不兼容输入明确提示降级。暂停队列保留/清空确认仍由宿主决定，取消不发不删、清空在新输入接纳后执行，旧队列版本重确认。队列为进程内，renderer 重载不重复提交。图片/文本与附件-only 已接入，不支持图片的模型在入队/写历史前拒绝且保留草稿；PDF/视频待实现。隐藏 Electron 检查不代替原生/真实模型验收。

### Menus and messages

复用 Radix Dropdown/Context Menu 负责菜单定位、键盘、焦点回收；消息投影复用
assistant-ui ExternalStoreRuntime。Mira 不另造同类通用交互组件，也不引入上游业务运行时。
Lucide 图标保持一致笔画。静态 Markdown 继续承载引用与代码复制，streaming 使用 Streamdown；
两种状态及文件预览共用 Mira 独立的 Shiki WASM Worker 适配器；正文保持完整源码和浅深色，不以截断长行或流式不着色作为性能修复。

### Resource workspace

右侧工作区按任务承载文件、变更、PTY 终端和受控浏览器；打开标签页 launcher 按容器宽度布局：
小于 480px 为单列行，达到 480px 后使用自适应资源卡片；原生拖宽已验证 420px 单列/48px 行和 559px 三列/88px 卡片。
标签、关闭、切换与资源回收由实际会话生命周期驱动，不能用静态演示结果冒充宿主调用成功。

### Project file drawer

项目文件沿用侧栏浅表面与紧凑树行。打开文件入口后，左侧依次显示返回任务、搜索框、项目根目录、
目录操作和刷新；中间任务线程保持可用，树与预览不嵌套在同一个右侧工具面板。

树行固定（28px），基础左内边距（8px），每层增加缩进（12px）；文件名单行省略并保留完整路径提示。
TanStack Virtual 只挂载可见行和焦点行，选中、hover、焦点、加载、空目录和失败各有对应反馈。
Radix 右键菜单提供打开/展开、已安装应用的“打开方式”子菜单、复制相对或绝对路径、文件加入对话与失败重试；Escape 或菜单操作结束后恢复树焦点，
点击树外关闭时不抢回焦点。
树使用单一可 Tab 进入的行焦点：上下/Home/End 移动，左右展开/收起或进入父子层，Enter/Space 打开，
Context Menu 键或 Shift+F10 打开菜单。只支持文件的 TextEdit/Notepad 不出现在目录打开方式中；跨项目浏览仍为后续范围。

树与只读预览共享当前授权会话的非递归监听。宿主（150ms）合批、React（300ms）合批后刷新相关已读目录，
搜索绕过索引缓存重新扫描；首次读取、reveal、手动和监听刷新共用最多两读队列。非活动预览等激活后再读取，
删除文件保留页签和错误状态，文件恢复后可自动重新显示。目录替换时重绑，目录消失时监听存活祖先以便恢复，不轮询。
监听失败在树和预览显示具体错误与图标重试；切换会话、根目录、授权失效和离开窗口均回收监听。
浅色的 12px 监听错误文字将既有 destructive 与黑色按 85/15 混合以达到 AA 对比度；深色保留既有 destructive，其他错误/品牌 token 不变。
文件预览失败正文使用既有 foreground 与（13px）字号，而非一般空态的 subtle 前景；正文继承错误容器的颜色和字号，不受旧工作区段落样式覆盖。

### Installed editor controls

任务标题栏的分体按钮高（28px），主打开按钮宽（28px），选择按钮宽（20px），Radix 菜单最小宽（160px）。
主按钮打开当前偏好应用，选择菜单项每次都会真实打开；只有打开成功才保存新的显式选择。重新检测不改写偏好，
打开失败或偏好保存失败可见，支持重新选择或重试。检测期间禁用重复操作，卸载应用可通过重新检测恢复。
主菜单与文件树子菜单按 Radix 可用高度限制并可纵向滚动；偏好读取失败的重试不会被检测成功清除。
失败的外部启动允许迟到偏好恢复，成功显式选择后迟到读取不覆盖新选择。
macOS/Windows 安装探测缓存（30s），最多（4）个图标任务；macOS 真实图标有界异步转换为（32px）PNG。
图标失败保留通用图标和打开能力。系统图标保留自己的颜色，不染成 Mira 黑白色。
所有打开动作仍经宿主按固定 Mira editor ID 和当前授权根目录校验；只读预览不增加内置保存或写回。

### Project file Git decorations

现有树与搜索行按直接 Git 状态着色文件名；直接字母为 `M/A/D/R/U`，固定字母栏（10px × 16px），
使用既有 Git 颜色和等宽粗体。目录自身的直接状态也可显示字母；后代只汇总为单个圆点（6px），
以对应颜色的（60%）混合呈现，M 优先于 A/D/R/U。tooltip 和可访问名称说明具体状态集合。
deleted 仅在已有 entries 的已加载父目录补缺失文件行，不造缺失祖先、不覆盖实际项或改变文件数据源快照；
按父目录去重并批量合成。ignored 精确命中只灰该行，不给祖先着色或追加后代点。

标题栏只看变更使用 Lucide GitCommitVertical 图标按钮（28px），沿用 selected token、tooltip、动态 aria-label 与 aria-pressed。
树态保留变更文件和已有变更祖先，搜索态仅保留直接非 ignored 状态并重算同级可访问位置；
搜索使用实际文件索引、不注入 deleted 项。筛选不扫描或强制展开，完整树仍驱动目录加载/监听。
D 行点击、Enter、Space 只选中，不打开预览；Open/打开方式及 editor 回调禁用。
路径复制和非位图加入对话保留上游行为；chip 不读文件，发送仍由宿主真实校验，缺失走既有草稿/chip 恢复。
切换筛选保留 query、展开和选中；loading 保留最后成功 available/index、筛选、删除菜单和已聚焦行，
刷新开始清 ignored cache 并推进 version guard。明确失败/非仓库、session 或 root 变化才清快照并重置筛选。

首次进入、手动刷新和工作区通知刷新只读 Git 快照；非仓库不显示 Git 错误，失败清旧装饰并提供安全正文与专用图标重试。
status 与 ignored 各单在途，可见 ignored 路径最多（512）项/批并缓存；会话/root 变化和卸载拒绝旧结果。
没有 Git metadata watcher，外部 add/commit 只改 index/HEAD 时需要手动刷新；不提供 Git 写操作或内置 diff IDE。

### Project file search

返回任务下方的搜索框固定（28px），沿用现有输入表面、边框和 compact 圆角；文字为（12px），
Lucide Search 与清除 X 保持（14px），清除按钮固定（20px）。焦点改变输入边框，未关联目录时禁用。
非空 query 搜索当前会话授权目录内经 `.miraignore` 过滤的候选，包括未展开目录；
默认规则排除 `.git/`、依赖等目录，空规则可放开。结果按匹配排序显示相对路径，不依赖已挂载树节点。
保留 Mira 原有 dotfile/隐藏目录候选行为，不移植上游额外 `.env`/二进制/隐藏候选排除；根 `.miraignore` 不作候选。

输入防抖（120ms），query 变化立即清除旧结果；切换会话、根目录、query 或重试后，旧请求不能覆盖当前结果。
搜索结果复用固定（28px）虚拟行、选中/焦点表面和 Radix 右键菜单，以平铺相对路径区分同名项。
ArrowDown 从输入进入结果，上下/Home/End 移动，Enter/Space 打开，菜单 Escape 返回当前行。

打开文件保留 query 与结果。打开目录清除 query，强制按根目录 → 祖先 → 目标目录加载并在树中定位。
X、Escape、删除输入或仅留空白都返回文件树，保留展开与选中状态，并重新定位当前 selection；
重复打开同一已选文件也走相同定位路径。

加载、无匹配、具体错误与图标重试留在抽屉内；无法完整搜索时显示失败，不返回看似完整的部分结果。
最多显示前（1000）项，截断时明确提示“仅显示前 1000 项匹配结果”；刷新绕过索引缓存并重新扫描，
新建文件可经刷新进入结果。搜索沿用现有浅深色语义，不增加独立视觉主题。

### Search ignore settings

Vue `/settings/file-search` 属于统一平台设置，复用 SettingsPageShell、Element Plus 和 AppIcon，
不在 React 抽屉里复制设置页。选择器只提供 DB 已有项目/个人会话工作区，无任意路径输入；
加载前禁编辑/保存，没有工作区有空态，加载失败有安全错误与重读入口。
规则编辑器采用（12px/20px）等宽正文和有约束的纵向尺寸，路径/错误可换行，工具栏可折行，
重读按钮用 Lucide 图标与 tooltip，同步、恢复、撤销和保存用清楚的命令按钮；沿用平台浅深主题，不新增全局 token。

首次非空搜索安全初始化 `.miraignore`；设置读取缺失文件只给根 `.gitignore` seed + 默认段模板、不落盘。
落盘后 `.gitignore` 不自动同步；同步只替当前草稿 seed，恢复默认只替 defaults，保存才落盘，
分区标记缺失/重复明确失败并保留草稿，不静默重建。模板可首次保存，已有文件只在修改后保存，
处理中禁重复操作；重读、换工作区和受控路由离开确认未保存修改，失败留草稿，迟到/卸载结果不应用。
工作区 target 使用 `shallowRef` 和普通 `{ kind, id }` 请求快照，初读、重读、transform、save 不将 Vue Proxy 传入 `contextBridge`；真实桥克隆 P2 已有复现、回归与独立源码复核。

成熟 `ignore` matcher 在进入子目录前剪枝；每查询读规则，root `dev:ino` 与规则版本/hash 绑定缓存，
编辑/删除/重建失效，旧扫描不污染新缓存，warm 返回复核 root。文件抽屉、`@` 与 Command Center 复用 `files.search`，
浏览/预览/上传与 Agent 权限不使用 matcher，不能当秘密或权限隔离。规则服务和 IPC 的读写/授权约束见证据页，
最后 awaited 检查后同步授权紧接提交关闭了本次可复现 P2，但不声称跨进程最终 syscall 为绝对 CAS。
上游同版导航隐藏该设置，Mira 有意开放 Vue 页，不称隐藏上游页原生逐像素验收通过。

### Read-only file preview

每个会话内的相对路径拥有独立文件标签，同名文件通过完整路径区分。预览在读取时捕获会话和目录，
切换任务或目录后不展示旧请求结果；关闭或返回任务导航不改变文件内容。

预览外壳不带额外内边距或底边框，隔离旧 inspector 的 section 样式。顶部面包屑工具栏固定（40px）并横跨预览宽度，路径区域可横向滚动，操作组保持尺寸；刷新、加入对话、选项和偏好外部应用打开使用图标
与工具提示。Markdown 的预览/源码采用互斥菜单，自动换行为 checkbox；同一菜单承载复制相对路径、
绝对路径和完整内容。加入对话只添加到现有 Composer，尚未读取成功时禁用。
读取中、空文件、具体错误/重试与复制反馈保持在预览表面内，错误文本可换行。

源码使用等宽字体（12px/20px）、粘性行号和虚拟行；开启换行后重新测量行高。
浅深色复用 Mira Shiki WASM Worker 和 GitHub 两个主题。grammarState 留在 Worker 内逐行续接，约（8ms）扫描预算后
让出 Worker，保留完整 tokens；隐藏标签和过期读取会取消。首次 grammar/regex 同步编译与病态单行仍不能在 Worker 内中途抢占；主线程不运行 tokenizer，HTML/DOM 着色成本仍单独测量。

### Bitmap and SVG preview

位图沿用文件标签、面包屑、刷新、复制路径和外部应用打开；宿主通过第一方 `files.read-image` 校验授权会话与目录，
只读取 APNG、AVIF、BMP、GIF、ICO、JPEG/JPG、PNG、WEBP，固定上限（4 MiB）。图片按实际解码的 load/error 展示，
读取失败与解码失败分别反馈并可重试；隐藏时不继续提交未完成读取结果，已有内容保留，变更后等激活再读，删除仍保留标签。

图片画布四周留白（40px），透明区域使用语义表面色组成的棋盘（8px）；自然尺寸居中、超宽/超高受可用空间约束，
不裁切图像。文件名 `@Nx` 按有效且大于 1 的倍率折算 Retina 显示尺寸；SVG 预览适配可用空间。
这组局部几何值来自 ZCode 图片预览惯例，不新增全局颜色、间距或字号 token。

SVG 继续通过文本读取，以编码后的 data URI 放入 `img`，不将内容插入可执行 DOM。Radix 互斥菜单切换预览/源码，
源码复用虚拟行与 Shiki XML 高亮，可复制文本、自动换行或加入对话。图片解码失败时，预览模式禁用加入对话；
读取成功的 SVG 源码仍可加入现有 Composer 供后续修复，读取失败时保持禁用。
位图不显示加入对话、复制文件内容或自动换行，文件树的位图加入对话也禁用；当前附件仍是受限文本，不宣称模型支持图片输入。

### Workspace tabs

标签条固定（48px），标签本体（28px）；非活动标签可在（60–156px）内压缩，活动标签最小（128px）。
标题以末端渐隐保留信息，条带横向滚动，完整路径在 tooltip 与标签列表菜单中可查。
关闭按钮绝对覆盖定位：非活动且未 hover/focus 时隐藏、不占布局；hover、活动或焦点状态显示，并预留标题右侧空间。
这样多文件标签不会因不可见关闭按钮挤窄活动标题。

鼠标拖拽与 Space → 方向键 → Space 排序保持当前活动标签；未进入拖拽时 Enter 只激活，中键可关闭非活动标签而不抢走当前内容。
Radix 菜单承载关闭当前/其他/全部与最近关闭恢复；关闭菜单后回到仍存在的活动标签或列表入口。
会话分别保存文件标签、顺序、活动路径、树展开和最近关闭记录。

工作区偏好读取成功后才允许保存，读取失败显示错误并可重试，不能将初始空状态写回。
晚到的读取合并未触碰会话，并保留同会话本地修改和主动清空；同一 key 有序保存最新快照。
受控路由离开等待最新保存成功，失败阻止离开并支持再次操作重试。强制 reload 或进程终止不保证异步保存完成；
早先九标签变为零的观察缺少实例与保存次序证据，仍未归因，不能据本轮相邻风险修复宣称完全解决。

### Evidence and boundaries

当前首屏实现、限定回归、最新生产 React headless 的实际覆盖与未完成项统一看顶部首屏总文档；旧文件批次的全量数字、截图、原生输入和限定 ship 不转移为首屏通过。完整同态 ZCode、实体输入、首屏性能与发布均单独验收。

以下保留各文件批次历史证据。文中旧“下一入口”只记录当时顺序，不覆盖现在侧栏、对话与 Composer 的优先级。

本轮与历史批次的正式 React 构建、全量回归、React/Vue 类型、产物字节和 SHA-256 一致性审计，
均以顶部所链接的技术记录为准；旧文件标签和搜索批次的检查不代替当前监听/外部编辑器批次的验证。
[监听与编辑器证据](docs/assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md) 分别记录自动化、原生操作、截图与尚未放行的边界。
[图片预览证据](docs/assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md) 记录本批位图/SVG 的实现、回归和 headless 验证。
`image-preview-headless/results.json` 的逻辑与 computed-style 断言已通过，六张截图完成稳定复拍并逐张检查；旧 compositor 滞后截图已排除。
该夹具运行实际 React 工作台、MessageChannel、第一方 parser 和文件服务，但不包含 Electron grant/runtime 集成，watch 通知为注入夹具。
因此不代替原生鼠标/键盘、Vue 设置、安装包或真实模型验收；同一 reviewer 的限定结论以证据页为准，不释放整体对齐目标。
[Git overlay 历史证据](docs/assets/mira-zcode-alignment-2026-10-08/GIT_OVERLAY_EVIDENCE.md) 保留该批自动检查、七张 headless 图和独立限定 ship，不能放行后续删除与筛选。
Git headless 使用正式生产 React 工作台、MessageChannel、实际第一方桥/parser 与真实隔离 Git helper；
grant/IPC 由单测覆盖，watch 通知使用 fixture，剪贴板为 iframe stub，不能代替真实 Electron grant/runtime、电脑操作或 Vue 设置。
[删除与筛选历史证据](docs/assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md) 保留该批检查、产物审计、10 张最终 PNG 与限定终审。
该批最终两 workers 96 文件/928 项、React/Vue 类型、React/Electron 编译及三桌面视口 headless 通过；
旧生产缺 root D/filter 的 baseline 与 D 菜单刷新 before-fix 保留，只有快照保留修复有先红后绿记录。
新独立源码/10 图逐张复核 slice-pass，未见可复现 P0–P2，文档一致性复核通过；原生验收暂停，整体目标 active。
该批“下一搜索 ignore”是历史计划，现已接入，不沿用其 slice-pass 放行本批。
[搜索忽略规则证据](docs/assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md) 是当前最终检查、产物审计和限定评审入口。
独立服务复核关闭 awaited 授权 P2；真实 Electron 随后发现的 Vue Proxy target 克隆 P2 也已用 `shallowRef` 与普通请求快照关闭，含复现、回归与独立源码复核。
2026-10-09 13:26 +08:00 更新：最新全量/类型、React 与 Electron 重新构建和审计通过，JS/CSS 字节不变。7 张旧独立 Chrome headless 图仍保留修前采集身份，未重拍或提升为原生证据；该 HTTP fixture 不含 preload/IPC。
13:14:15 的 [bridge/DOM probe](docs/assets/mira-zcode-alignment-2026-10-08/search-ignore-native/bridge-transport-results.json) 经过真实隔离 Electron preload/IPC，确认约 460B 模板、启用且内容一致的 textarea 与无 alert；三产物 SHA 与最新构建一致，但 probe 未重跑。这是 CDP 只读观察，不是实体输入/截图验收。
13:21 锁屏阻断保持历史；该独立 JSON 未保留下来，当前 `results.json` 已是 14:25–14:28 成功流程，不能用它回证锁屏。
2026-10-09 14:32 +08:00：真实 Mira Electron/preload/IPC 中的原生规则编辑/保存、未保存取消、外部冲突/重读，以及 React 浏览不过滤、搜索过滤和结果预览通过；27 条记录与三张原生图逐张确认，见 [原生交接](docs/assets/mira-zcode-alignment-2026-10-08/search-ignore-native/README.md)。它不等于隐藏上游设置逐像素、完整 native 或图片/Git 同态放行。下一入口回到旧错误态与图片/Git 对照；metadata watcher 须单独绑定 root/metadata/grant，已有文件 watch 不等于它。
[截图证据](docs/assets/mira-zcode-alignment-2026-10-08/FILE_WORKSPACE_EVIDENCE.md) 来自
1440×900 的隔离 macOS 开发 Electron 正式入口，记录浅色、目录定位、错误、深色、菜单和截断搜索表面。
搜索六视图已在（16:49–16:50）复拍并逐张检查、固化；副本与本轮原图的 SHA 一致。
文件标签排序、中键关闭、最近关闭恢复、设置往返，以及搜索保留/清除、目录 reveal、菜单焦点返回、
刷新和会话/根目录隔离分别有原生操作记录；截图本身仅证明对应采集时的画面。
重复打开同一路径后的 X、Escape 与删除输入定位经过组件回归和同一原生复验，同一 reviewer 给出
Pass、clear 定位问题 resolved、remaining clear、disposition ship；该结论只覆盖这一项收尾修复。

8001 行文件抽样在异步高亮完成和滚动期间未观测到长任务，初始/滚动分别挂载 46/56 行；
约 2205.5ms 包含异步等待，不能与旧单段阻塞耗时直接比较。完整证据与首次编译、病态单行、对话流式路径、
可靠冷暖/进程启动、安装包、Windows 及真实模型边界见性能记录，整体发布关口仍未完成。
文件 watch、外部编辑器、位图/SVG、Git 状态/删除/筛选和搜索 ignore/Vue 设置已实现；有限设置/搜索/浏览原生验证通过，旧错误态与图片/Git 原生同态 ZCode 仍待完成。
生产高亮 Worker 已实现，精确产物在 Chrome opaque iframe 与隐藏 Electron fixture 中分别验证；深色 fixture 现使用生产 #root/theme 契约，不再是白背景错误夹具，但仍只是隔离组件画布。准确数据和 DOM 性能后续见 [Worker 证据](docs/assets/mira-zcode-alignment-2026-10-08/HIGHLIGHT_WORKER_EVIDENCE.md)。APNG/GIF 动画、Git metadata watcher、音视频/Office、媒体 lease/Range、代码块 DOM/profile 和完整发布仍未放行。

## Do's and Don'ts

### Do

- Do 按提供的 ZCode 软件/截图与源码校准，同时保留 Mira 的业务和授权边界。
- Do 使用 Mira 语义变量与既有 Radix、assistant-ui、Lucide 组件。
- Do 保留浅深色、焦点、hover、disabled、loading、error 和空态。
- Do 保留文件树的固定行高、层级缩进及预览工具栏和标签的稳定尺寸。
- Do 让搜索结果沿用文件树表面，并保持文件打开保留搜索、清除后定位当前选中项的交互。
- Do 将搜索忽略规则留在 Vue 平台设置，草稿操作与落盘分开，未保存离开确认，失败保留修改。
- Do 保留图片的 40px 留白、8px 透明棋盘、Retina 与错误/重试状态，并按位图或 SVG 源码限制对话附件动作。
- Do 用现有 Git 颜色、10px 字母栏和单个6px后代点装饰真实行；ignored 精确命中只灰当前行。
- Do 使用标题栏28+20px分体按钮、160px Radix菜单和系统应用真实图标；打开成功才保存显式选择，失败可见可重试。
- Do 让编辑器主菜单和树子菜单在可用高度内滚动；偏好读取失败可重试，失败启动不阻止偏好恢复、成功显式选择不被旧值覆盖。
- Do 在隔离 Electron 正式入口逐项记录电脑操作与结果。

### Don'ts

- Don't 把 prototype/pilot、静态稿、构建通过或字节下降写成真实桌面验收通过。
- Don't 将 Harness 的任务侧栏移动到公共 Vue Shell。
- Don't 复制 ZCode 品牌、业务变量或账户 Runtime 到 Mira 实现。
- Don't 删除必要上游版权、许可原文或旧用户数据。
- Don't 恢复独立主题色、布局样式、Shell 多页签或移动端范围。
- Don't 将只读文件预览扩展为内置编辑器，或用尚未实现的音视频、Office、Git 写操作或 metadata watcher 承诺能力。
- Don't 把搜索 ignore 当浏览/Agent 权限限制，或把独立 Chrome 的 HTTP fixture 写成原生 Electron 设置验收。
