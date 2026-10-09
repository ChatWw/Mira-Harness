# Mira Harness 工作台交互规格

最近更新：2026-10-09。状态：文件工作区、搜索、保存、监听、外部编辑器、位图/SVG、Git 装饰及删除虚拟行/只看变更、搜索忽略规则与 Vue 设置已实现。本批自动检查、类型、React/Electron 编译、审计与独立 Chrome headless 已有通过记录，最终限定评审统一看本批证据页，不沿用旧 Git/filter verdict。原生设置/搜索/浏览与旧错误态、图片/Git 同态 ZCode 仍待确认。整体 active，性能/发布/P0–P3 未放行，未提交、未推送；用户已授权直接对齐所提供的 ZCode 软件/源码。第 13 节是验收要求，不代表发布关口完成。
范围：`apps/harness-react` 的 Harness 主工作台及 Vue 平台文件搜索设置；保留 Electron/Vue/React 职责和受控授权边界，允许为草稿离开保存、项目文件选择等交互闭环作必要协议扩展，不改旧 Vue `/workspace/chat` 的业务语义。

当前续做入口：[搜索忽略规则与 Vue 设置](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-09-搜索忽略规则与-vue-设置)。Electron 能力、Vue 双层 Shell 与 React 正式第一方入口 `/workspace/harness-react` 已接入；原型/pilot 是开发辅助入口。旧日期实施段落保留历史证据，其中“下一图片/Git/删除与筛选/搜索 ignore”等当时待办不覆盖本轮状态。安装包、Windows、真实模型完整矩阵及 P0–P3 整体关口仍未验收。

当前检查见 [2026-10-09 搜索忽略规则与 Vue 设置](#26-2026-10-09-搜索忽略规则与-vue-设置)，最终数字、headless、审计与限定评审统一引用 [搜索忽略规则证据页](./assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)。旧 Chrome headless 的真实 Vue/Element Plus/AppIcon/样式与 HTTP 文件服务 fixture 不包含 preload/IPC，7 张图保持原采集身份。新增真实隔离 Electron preload/IPC bridge 与 CDP DOM 只读 probe 已通过，不等于实体输入/截图验收。旧批次数字与限定 verdict 保留原日期/范围；编译不等于安装包、Windows 或整体发布验收。

2026-10-09 续作：搜索 ignore 不重复实施，真实 Electron 的 Vue Proxy 克隆 P2 已修复并复核。当前锁屏阻止前景鼠标/键盘/截图，下一入口为解锁后重启隔离 Electron，仅补本批设置/搜索/浏览有限原生交互，不自动扩展为完整 native、同态 ZCode、Windows、真实模型或 P0–P3 放行。Git metadata watcher 仅为随后候选，先设计 root/Git metadata/grant 生命周期，既有文件 watch 不等于它。旧错误态、图片/Git 对照与媒体 lease/Range、高亮 Worker/profile 独立推进，依据见 [下一能力审查](./assets/mira-zcode-alignment-2026-10-08/NEXT_CAPABILITY_AUDIT_2026-10-09.md)，旧截图或旧 ship 不放行本批/整体。

## 1. 目标与判断

本轮针对已有会话、执行、审批、文件变更、终端和浏览器界面的连续使用问题：任务主线、执行轨迹、Composer 控制层级与右侧资源上下文。代码已在适配，是否达标由实际桌面操作与截图对比判断。

本轮按用户提供的 ZCode 桌面软件和 3.14.3 源码逐功能对齐；软件、截图和源码结合确定实际交互，Mira 自有运行时和授权边界继续保留：

- 任务线程是唯一主线：用户消息、计划、工具调用、审批、成果都沿同一条时间线出现。
- 侧栏承载导航，工作区承载证据：会话侧栏用于找任务，右侧面板用于查看文件、变更、终端和浏览器，不在两处重复展示同一内容。
- 运行状态必须可见且可恢复：运行中、待审批、失败、已完成、已停止都有明确动作和恢复入口。
- 信息按需展开：摘要常驻，详细轨迹、工具参数和大段结果折叠，避免主线程被日志淹没。
- 面板是会话级资源：打开终端/浏览器后切换会话，面板保留在对应会话，不创建一次性静态预览。

参考实现：ZCode 侧栏、Composer、侧面板 launcher、终端与文件树。用户已授权参考和适配开源实现；文件名、组件名和业务变量采用 Mira 风格，必要版权与许可原文集中保留在 `third-party-licenses/`。这不等于移植上游账号服务或完整 Agent Runtime。

## 2. 信息架构

```text
Mira Shell（Electron + Vue + Wujie）
└── Mira Harness（React）
    ├── Session Sidebar
    │   ├── 新建任务
    │   ├── 置顶任务
    │   ├── 运行中 / 待审批
    │   ├── 项目分组
    │   └── 最近任务
    ├── Task Thread
    │   ├── Thread Header
    │   ├── Task Summary
    │   ├── Messages / Plan / Activity / Interaction
    │   └── Composer
    └── Workspace Side Pane
        ├── 任务活动
        ├── 文件
        ├── 变更
        ├── 终端
        └── 浏览器
```

## 3. 桌面宽屏布局（> 1180px）

- 外层保持 Mira Shell 提供的窗口控制、全局搜索和主题。
- Harness 内部使用三列：Session Sidebar 默认 264px、可调 220–420px；Thread 自适应；Workspace Side Pane 默认 420px、可调 360–640px，按需打开。
- 工作台 frame 保留 4px 边距/分隔空间，主线程面板圆角 12px，应用内 Header 高 48px；新任务 Composer 容器最大 720px、左右各 24px 内边距，有效输入卡宽 672px。字号、浅深色与组件约束见根 `DESIGN.md`。
- 左右列都可拖拽调整宽度，宽度变化不改变中间消息的阅读宽度上限。
- 中间 Thread 由 Header、可滚动消息区和固定 Composer 组成。Composer 固定在消息区底部，不随消息流失去焦点。
- 右侧面板打开时，中间线程保持最小 520px；不足时自动收窄内容间距，不强行压缩控件文字。
- 任务摘要以中间线程右上角的轻量浮层常驻，显示当前阶段、已完成步骤、变更数量和“打开工作区”入口；不遮挡消息和 Composer。

## 4. 紧凑窗口布局（<= 1180px）

- Thread 作为唯一底层页面，Session Sidebar 与 Workspace Side Pane 变为带遮罩的浮层。
- 同一时间只允许打开一个浮层；打开会话栏时自动关闭工作区，反之亦然。
- 会话浮层宽度为 `min(360px, calc(100vw - 24px))`，工作区为 `min(420px, calc(100vw - 24px))`；关闭按钮和 Esc 均可退出。提前进入浮层模式可保证 1024px 窗口的 Thread 不被双侧栏挤压。
- Header 提供会话栏、工作区、任务状态三个稳定入口；不能依赖悬停操作。
- Composer 的模式切换改为横向 segmented control，空间不足时收进“更多”菜单，禁止文字竖排。

## 5. Session Sidebar

### 5.1 顶部

- 顶部提供新任务、搜索和会话栏开合入口；下方是平台级导航、项目与任务列表，单行任务保持紧凑密度。
- 新任务回到居中起点，项目/个人工作区选择与 Composer 保持连续；首条发送时建立对应会话，不要求先在侧栏完成创建表单。
- 已实现会话搜索、分组、重命名、置顶/归档、移动与上下文菜单；具体鼠标和键盘结果由本轮验收矩阵记录。

### 5.2 分组顺序

1. `置顶`：用户明确置顶的任务。
2. `需要处理`：待审批、需要回答澄清或失败待恢复的任务。
3. `运行中`：当前仍有 Harness run 的任务。
4. 项目分组：项目名、会话数、展开/折叠状态可持久化。
5. `最近任务`：按最近更新时间排序，显示未读和最后状态。

会话行显示：标题、项目名/工作目录、状态点、未读点或运行 spinner。运行中和待处理任务永远优先于纯历史任务。

### 5.3 操作

- 单击打开会话；右键或 `...` 打开上下文菜单：重命名、置顶、标记已读、移动项目、归档、复制工作目录/会话 ID、打开终端/文件管理器、删除。
- 拖拽只改变同一排序范围内的顺序；键盘拖拽使用方向键，不能只支持鼠标。
- 搜索只过滤侧栏，不影响当前 Thread 的消息检索。
- 控件和选中态使用黑白/灰语义；运行状态同时提供文字/图标，待处理 amber、失败 red、完成 green，不用 teal 作为通用主操作色。

## 6. Task Thread

### 6.1 Header

- Header 为 48px 单层应用标题条，左侧提供会话栏入口、当前任务标题与必要状态；新任务显示相应空态标题。
- 项目/工作目录归属于任务上下文和 Composer 项目条，不再用两行大标题重复占据阅读区。
- 右侧提供任务摘要、文件/变更/终端/浏览器与工作区开合入口；只暴露已接通的 Mira 能力。
- 状态 badge 文案：`等待任务`、`正在执行`、`等待确认`、`已完成`、`已停止`、`执行失败`。

### 6.2 消息与任务轨迹

- 用户消息靠右，助手消息靠左，正文阅读宽度控制在 65–75ch。
- 每个 run 在助手消息下形成可折叠时间线：理解任务、计划、工具调用、子任务、结果。
- 默认展示步骤名称、状态、耗时和一句结果摘要；参数、原始输出和错误详情通过折叠展开。
- 文件变更以独立摘要行出现，点击直接打开右侧“变更”面板并定位文件。
- 助手消息操作：复制、编辑并重跑、重新生成；运行期间禁用会改变历史的操作。
- 长任务消息区保持自动跟随底部；用户向上滚动后显示“回到底部”按钮，不抢夺阅读位置。

### 6.3 悬浮任务摘要

摘要是 Thread 的状态 HUD，不是第二个任务面板。内容固定为：状态、当前阶段、已完成步骤数、变更数、工作区入口。运行结束后保留为可回顾的结果摘要，点击可定位到最后一个 run。

## 7. Composer

### 7.1 主输入

- 输入框支持中文输入法、`Enter` 发送、`Shift+Enter` 换行、`/` 触发命令菜单、附件 chip 和文件引用。引用文件前必须先选择项目；系统选择器支持项目目录内文件和项目外文本文件，取消选择不改变已有 chip，读取/发送失败保留草稿并提示恢复动作。
- 无会话时可保留草稿、选择项目/个人工作区与配置，首条发送建立会话；创建失败保留输入并显示恢复入口。无模型时给出管理模型入口。
- 发送按钮只在可发送且有文本时启用；运行中切换为停止按钮。

### 7.2 工具栏顺序

左组为添加上下文、权限与计划模式、上下文用量；右组为模型和发送/停止。文件、Skill、MCP 收入添加上下文菜单，避免工具栏持续堆叠。

- 模型和权限使用紧凑 popover，不使用原生 select 挤占宽度。
- 模型菜单按 provider 分组并可搜索，当前项有选中状态；模型具备 reasoning 能力时提供推理档位选择和快速循环控件，不支持时隐藏入口。模型及有效档位按会话保存，切换 A/B 不继承其他会话的选择，恢复时忽略不可用模型和非法档位。
- 计划模式是权限菜单内独立开关，权限档位是互斥选项；计划开关与权限不能互相覆盖。
- `自动审核`、`完全访问` 等高风险权限必须有解释和二次确认；当前会话生效并在 Header 显示风险状态。
- 快捷建议只在空输入时显示，点击后填入草稿，不直接提交。
- Slash 菜单支持上下键、Enter、Esc 和鼠标选择，列表为空时显示可恢复提示。

## 8. Workspace Side Pane

### 8.1 通用行为

- 顶部是面板 tab：`任务活动`、`文件`、`变更`、`终端`、`浏览器`。新会话默认没有打开的 tab；无标签时显示“打开标签页”，顺序为文件、变更、终端、浏览器、任务活动。launcher 按面板容器宽度响应：小于 480px 为单列资源行，至少 480px 为自适应卡片。选择资源后创建/激活动态 tab，所有 tab 均可关闭。
- 每个 tab 有明确 active、关闭、溢出菜单状态，可拖拽排序；排序保持原选中，Enter 激活标签，Space 开始键盘拖拽。中键关闭非活动标签不改变当前选中；右键可关闭当前、其他或全部标签，并恢复最近关闭的标签。
- 关闭当前 tab 后优先选中原位置右侧邻项，末尾则选左侧；没有剩余标签时回到 launcher。标签和最近关闭历史按会话隔离，恢复终端创建新 PTY，不恢复已关闭进程。
- 面板标题区显示当前会话标题和工作目录，避免在不同会话间误操作。
- 面板空态必须说明“这里会出现什么”和下一步动作，不能只留大面积空白。

### 8.2 任务活动

- 顶部展示当前状态、运行时长、已完成/总步骤。
- 下方按时间显示活动和工具记录；工具详情可折叠，错误高亮并提供重试/复制。
- 待审批时把审批卡置顶，允许在面板和 Thread 两处进入同一确认动作，但只能触发一次。

### 8.3 文件

- 左侧文件树替换任务导航，右侧每个完整相对路径是独立只读预览 tab；返回任务保留预览。树为 28px 虚拟行、12px 缩进，目录懒加载、刷新/重试、单一 Tab 入口和完整方向键/Shift+F10 操作；预览工具栏为 40px。
- 28px 搜索框以 120ms 防抖调用 `files.search({ sessionId, query, refresh? }) -> { entries, truncated }`，搜索整个当前授权目录内经 `.miraignore` 过滤的候选，包含未展开节点；默认排除 `.git/`、依赖等目录，空规则可放开。保留 Mira 既有 dotfile/隐藏目录候选，不另加上游候选黑名单。按上游 basename/相对/绝对路径 fuzzy scoring 返回前 1000 项；截断有提示，不声称只有这些匹配。
- query 修改立即清旧结果；epoch/请求序号拒绝旧会话、root 或 query 响应。无匹配、搜索失败和重试各有状态；不可读目录令整个搜索失败，不展示部分结果。刷新强制重扫缓存。
- 打开搜索中的文件保留 query；清除搜索返回树并定位选中文件。打开搜索中的目录先清 query，再以 `revealPath` 强制刷新 root → 祖先 → 目标目录，展开并定位，包括搜索后新建但旧树尚未包含的目录。
- 主进程按 realpath/`dev:ino` 隔离 root；60 秒 TTL、4-root LRU、估算累计 128MiB 缓存；扫描最多 8 个目录并发、约 8ms 工作预算后让出事件循环。返回候选前重新验证路径仍在当前 root 和类型一致，这些预算不构成硬耗时承诺。
- 文本预览提供刷新、Markdown/源码、自动换行、复制相对/绝对路径与内容、加入对话和外部打开；加入只合并附件并聚焦输入，不发送。文件读取失败有具体可恢复提示；监听、外部编辑器、图片与 Git 状态叠加见第 8.8–8.11 节，音视频/Office 尚未实现，文件保持只读。

### 8.4 变更

- 按消息/run 分组显示新增、修改、删除统计。
- 点击文件打开 diff；默认折叠大段上下文，保留文件名、行号和变更统计。
- 完成任务后，变更面板是成果入口之一，不能只在消息里显示一行链接。

### 8.5 终端

- 终端实例按会话维护 registry；创建中显示占位 session，首段输出不能丢失。
- 支持多个终端 tab、重命名、重启和关闭；命令输入、输出和错误有清晰层级。
- 输入数据保持 xterm 原始字符，包括 CR、空格、Tab 和 NUL；终端 ID 与目录仍按各自参数规则校验。按保存标签恢复为活动终端时自动挂载，不等待再次点击标签。
- 终端不可用时显示宿主能力状态和恢复提示，不伪造“正在连接”。

### 8.6 浏览器

- 工具栏提供后退、前进、刷新、地址栏和加载状态；导航请求绑定当前会话。
- 切换会话时清理旧 WebView/过期导航，避免旧页面写入新会话。
- 浏览器面板关闭后保留最后 URL 和 bounds，重新打开恢复上下文。

### 8.7 工作区状态保存

- workspace preference 成功读取后才 ready，失败显示错误并可重试，禁止用初始空状态覆盖持久化值。
- 晚到 hydration 合并未触碰会话；同会话本地修改和主动关闭全部标签的 clearing 优先保留。按 key 顺序写入最新 snapshot，保存期间的新修改继续合并并写入。
- 受控路由离开前等待读取完成和最新保存成功；保存失败显示错误、阻止离开，retry 成功后再导航。快速 unmount 在控制器仍有效时尝试合并并保存；force reload 或进程终止不保证异步保存完成。
- 此契约针对已复现的读/写/离开风险；此前缺少 session/target/timeOrigin 的九标签变零观察仍未归因。

### 8.8 工作区监听与自动刷新

- `files.watch({ sessionId, paths }) -> { watchId }`、`files.unwatch({ sessionId, watchId })` 与文件变化事件使用当前第一方授权；订阅绑定 renderer owner/grant/session/canonical root/`dev:ino`，客户端不能监听任意路径。每订阅最多 256 个目录（含 root），每 owner 最多 8 个订阅。
- 只监听 root、当前可见展开目录与已打开预览的父目录；使用非递归 `fs.watch`，不轮询。宿主 150ms 合批，React 共享树/预览订阅并以 300ms 合批；这些预算是实现策略，不是端到端硬延迟承诺。
- 每批复核子目录 canonical/inode；替换后重绑，消失时监听存活祖先，恢复后重绑。alias 改指另一个已监听目录也发全失效；授权 root 身份变化则停止旧监听并提示重新打开，不跟随旧权限跨目录。
- 自动刷新保留展开/选中及当前标签，搜索绕过缓存重扫；非活动预览延迟到激活再读。文件删除保留 tab、显示可恢复错误，恢复后重新读取；不把文件监听变化写成聊天运行事件。
- 文件树首次读取、reveal、手动/监听刷新共用每个数据源最多两项的实际在途目录读取队列。旧 epoch 请求直到完成才释放预算，取消排队项需 settle；这不是所有文件预览和宿主文件系统操作的全局并发上限。
- 监听启动或运行失败、超限有具体错误与 retry/手动刷新入口；切会话/root、无可见文件工作区、grant 撤销、主 renderer 非同文档主框架导航/崩溃/销毁均释放对应监听，宿主同时回收 PTY。

### 8.9 外部编辑器与打开方式

- Header 使用 28px 主打开按钮与 20px 下拉按钮组成稳定分体控件，Radix 菜单宽 160px；主/子菜单的最大高度取 Radix 提供的可用高度，超出内容在菜单内纵向滚动，短桌面窗口中末项仍可达。当前图标有 tooltip，打开中禁重复触发。目录入口排除仅支持文件的应用；文件树“打开方式”子菜单与预览工具栏支持打开当前文件。
- `editors.list({ refresh? })` 只返回已安装的固定 Mira editor ID、名称、可用图标和文件限制；检测使用 30 秒缓存，重探测强制刷新。同一探测最多 4 worker；失败先等待在途任务排空再释放 pending，不能让 retry 叠加超过预算。图标为有界 32px PNG，图标读取失败不阻止已安装应用打开。
- `files.open-editor({ sessionId, path, editorId })` 在宿主重新验证安装状态、会话所属 root 和目标类型；仅打开授权目录内文件/目录，拒绝越界及不支持目录的应用。使用参数数组与 `shell:false`；Windows detached GUI 启动成功不等待应用退出，不用超时杀用户编辑器。Finder/Explorer 的文件打开为系统揭示。
- 检测与偏好读取错误分别保留；检测成功不能清掉偏好读取错误。“重新检测”仅在偏好读取失败时同时重试 hydration，正常重探测不重复读取偏好。失败 launch 不阻断尚未完成的初始/重试 hydration；成功显式选择构成屏障，晚到偏好读取不能覆盖它。
- 显式选择后仅成功 launch 才保存最新选择；普通重复打开不改偏好，卸载/controller 变化后的迟到 launch 不保存。偏好写入失败通过严格保存路径反馈，不能静默吞错。安装、偏好读取、打开及保存失败均提供实际错误和重试/改选入口。
- 外部编辑保存由第 8.8 节刷新预览，不引入内置 dirty 状态、任意文件编辑器或 `⌘S` 写回。真正打开和外部保存需原生操作验收，菜单截图/静态测试不能替代。

### 8.10 位图与 SVG 只读预览

- 位图通过 `files.read-image({ sessionId, path })` 读取当前会话/项目授权 root 内的相对路径；支持 APNG、AVIF、BMP、GIF、ICO、JPEG/JPG、PNG、WebP，实际解码能力仍由桌面 Chromium 判断。宿主不接受任意绝对路径或 URL，拒绝越界与 root 外符号链接，只返回允许 MIME 的图片数据。
- 单位图预览上限 4MiB。宿主以有界 handle 读取，读取前后复核文件 `dev:ino`、size/mtime/ctime、路径和 root 身份；增长、替换、root 变化或不可读给出实际可恢复错误，不使用无界 `readFile` 读取位图。客户端保留会话/root 身份和过期响应抑制，不能凭前端类型判断放宽宿主授权。
- 预览保持 40px 工具栏；位图使用 8px 透明棋盘和文件名 `@Nx` 显示尺寸，支持加载、解码失败提示与 retry。位图不提供文本内容复制、自动换行或加入对话，文件树的位图“加入对话”禁用；复制路径、刷新和受控外部打开保持可用。
- SVG 使用既有文本读取与 XML 源码显示，预览将源码编码为 `<img>` 数据源，不直接注入 DOM；可切预览/源码。图片解码失败只影响预览：失败预览态禁加入，读取成功的源码态仍可复制、换行和加入；读取失败则文本动作也不可用。加入是 SVG 文本附件，不是模型图片输入；继续遵守单文件 256KiB、累计 1MiB、最多 12 项，不自动发送。
- 位图/SVG 复用第 8.8 节共享监听、会话/root 身份隔离、非活动预览延期读取和删除恢复；切会话、移动项目或身份变化不得显示旧图片。刷新/重试沿用读取生命周期，不新增内置 dirty 状态或写回。
- 验收要求：安全/限额/身份与动作回归、生产 JS/CSS 和图片 helper 的无头解码/布局 fixture，以及正式 Electron 浅深色原生操作和同态 ZCode 图片比较分别记录。覆盖透明位图、`@Nx`、SVG 源码切换、decode 失败/恢复、文本动作限制和会话/root 更新；headless 不代表真实 grant/native/Vue 设置通过。最终自动检查与限定结论只引用 [图片证据页](./assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md)，同时补上轮错误态浅深复拍和复评确认；本节要求不代表验收已通过。

### 8.11 Git 文件树状态叠加

- 文件名按直接状态着色，直接状态显示 `M/A/D/R/U`；目录直接状态也可显示字母，后代状态汇总为单个 dot，`M` 优先于 `A/D/R/U`，tooltip/可访问名称保留具体状态集合。deleted 只在已有 `entries` 的已加载父目录合成缺失文件行，不造缺失祖先、不覆盖实际项、不改文件数据源快照，按父目录去重并批量合成。
- 28px Lucide 图标开关提供只看变更，使用既有选择色、tooltip、动态 aria-label 和 aria-pressed。树态保留变更文件及其已有祖先，搜索态仅直接非 ignored 状态，重算可访问同级位置；不扫描或强制展开，不改变完整树驱动的目录加载/监听。搜索使用实际文件索引，不注入 deleted 名称，这是上游真实限制。
- D 行点击/Enter/Space 只选中，不读文件或打开预览；Open/打开方式及 editor 回调禁用。保留路径复制与非位图加入对话，这是上游动作：加入只产生可移除 chip、不读取，实际发送由宿主校验真实文件，缺失时走既有草稿/chip 恢复；不把添加引用表述成文件可读。
- `files.git-ignored({ sessionId, paths })` 按当前可见路径精确判断 ignored；仅该行灰显，不给祖先目录着色或追加后代点。目录可因自身精确命中灰显，不能由某个 ignored 后代推断整目录忽略。
- `files.git-status({ sessionId }) -> { available, entries }` 与 ignored 读取从持久化会话解析授权 root，使用异步 `execFile`、NUL parser；不信任调用方路径或继承的 Git repository 环境覆盖。前后复核 root/repository/metadata 身份，IPC 返回前复核 grant/session/root，变更中的旧结果不可发布。
- 后端最多两条 Git 命令同时运行、最多 16 条等待；每条 10 秒超时、stdout/stderr 各 8MiB，进程 stdio 排空后释放槽位。React status 与 ignored 各自单在途；ignored 每批最多 512 可见路径、缓存已查路径，刷新重建缓存，version/active guard 拒绝旧响应。
- 首次进入、手动刷新和工作区变化通知触发 Git 刷新；loading 保留最后成功 available/index 与筛选，清 ignored cache 并推进 version guard，显示读取中。切换筛选不清 query/展开/selection，刷新期间 deleted 行、其菜单与已聚焦行保持；明确失败/非仓库、session/root 变化才清快照并重置筛选，普通树仍可浏览。非仓库 `available:false` 不显示 Git 错误；Git 缺失、超时、超限或失败提供脱敏错误和 retry。无 Git 写操作或 metadata watcher，外部 `git add/commit` 不保证自动刷新，可手动更新。
- 搜索 ignore 规则/配置尚未对齐；本节不表示完整 Git 文件工作区已完成，后续差异与源码依据见 [下一能力审查](./assets/mira-zcode-alignment-2026-10-08/NEXT_CAPABILITY_AUDIT_2026-10-09.md)。
- 验收分别记录真实隔离 Git helper/状态解析与预算回归、grant/IPC 单测、正式生产 React + MessageChannel + 实际第一方桥/parser 的 headless，以及真实 Electron 浅深色操作/同态 ZCode 比较。watch 通知为 fixture、剪贴板为 iframe stub，不等于原生监听、grant 或 Vue 设置通过；最新证据统一见 [删除与筛选证据页](./assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)。新独立源码/10 图逐张复核 slice-pass，文档一致性复核通过，旧 overlay ship 不覆盖本批，原生验收待完成。

### 8.12 搜索忽略规则与平台设置

- 规则只作用于非空 query 的实际工作区文件搜索，不覆盖 `@`/Command Center。浏览树、预览、上传和 Agent 文件权限不使用 matcher，不能把 ignore 当权限或秘密隔离；Git ignored 行装饰也是独立语义。
- 使用成熟 `ignore` 7.0.5 解析器；首次非空搜索安全初始化根 `.miraignore`，设置读取缺失文件只返回模板、不落盘。模板由根 `.gitignore` seed 与上游默认段组成，落盘后不自动同步；空规则允许搜索依赖/默认排除目录，根 `.miraignore` 自身不进入候选。保留 Mira 既有 dotfile 搜索，不追加上游 `.env`/二进制/隐藏目录候选排除。
- Vue `/settings/file-search` 归平台设置，复用 SettingsPageShell/Element Plus/AppIcon；工作区选择器只提供 DB 已有项目及个人会话工作区，无任意路径输入。没有工作区显示空态，加载失败显示具体安全错误与重读入口；加载成功前禁编辑和保存。
- 同步 `.gitignore` 只替 seed、恢复默认只替 defaults，保留当前草稿的自定义/未变段，保存才落盘。分区标记缺失或重复明确报错，保留草稿，不静默重建。处理中禁重复操作；模板可未修改首次保存，已有文件仅修改后可保存；超过 256KiB UTF-8 字节禁保存。
- 重读/换工作区/受控路由离开遇未保存修改，显示“放弃修改”/“继续编辑”确认；撤销回到已加载内容。读写/同步失败保留草稿，revision 冲突要求重读，不自动覆盖；晚到/卸载请求不应用。force reload、进程强退或 OS 关闭不保证草稿保存。
- IPC 仅顶层 renderer，以 `{kind:'project'|'session', id}` 从 DB 推导根目录；固定文件名、有界 UTF-8 handle，拒 symlink/特殊文件。初始化 hard-link no-replace，保存按 root 串行、revision/授权复核、flush 后原子替换并保留 mode。所有最后 awaited 检查后同步授权紧接 link/rename，覆盖保存与首次搜索初始化；最终 syscall 的跨进程非 CAS、root 移走临时文件残留及 hard-link 不支持显式失败仍有边界。
- Vue target 使用 `shallowRef` 和普通 `{ kind, id }` 请求快照，初读、重读、transform、save 不将 `ref` 数组中的 Proxy 传入 `contextBridge`；真实 Electron 的克隆失败 P2 已复现、修复并通过回归及独立源码复核。
- 规则在进入子目录前剪枝；每查询读取规则，缓存绑定 canonical root/`dev:ino` 与规则版本/hash，编辑/删除/重建失效，旧扫描不能污染新规则缓存，warm 返回复核 root。只读/权限失败时搜索可用内存模板；危险链接/特殊文件/错误编码不能静默降级。
- 上游 3.14.3 导航实际隐藏该 section；Mira 有意提供 Vue 设置入口，不称隐藏上游页的原生逐像素对照已完成。本批检查和限定评审见第 26 节与独立证据页。

## 9. 审批、计划和澄清

- 权限审批：说明动作、目标和风险，提供拒绝/允许；允许按钮标明影响范围。
- 计划审批：显示步骤列表、预计工具、潜在写入点；用户可确认、要求修改或取消。
- 澄清问题：一个问题一个回答控件，支持选择项和自由文本；提交后回到运行时间线。
- 所有交互都要有 loading、失败和重复提交保护；恢复后能在当前 Thread 找到原始请求。

## 10. 主题、键盘与可访问性

- 只跟随 Mira Shell 的浅色/深色主题，不新增独立主题色配置。
- 所有图标按钮提供 aria-label 和 tooltip；所有浮层支持 Esc、焦点回收和点击外部关闭。
- 可拖拽分隔条支持方向键调整；tab 顺序遵循侧栏 → Thread → Workspace。
- 状态不能只靠颜色表达，必须同时提供文字或图标。
- 尊重 `prefers-reduced-motion`；动画只用于面板进入、状态切换和加载反馈。

## 11. 空态、加载态、失败态

- 空态：说明 Harness 能做什么，并提供三个可点击任务示例；不显示虚假的执行记录。
- 加载态：保留布局尺寸，使用局部 skeleton/spinner，不让 Thread 跳动。
- 失败态：说明失败阶段、已保留的结果和下一步；支持重试、编辑重跑、复制错误。
- 长文本和超长路径必须省略并提供完整 tooltip，不能撑破侧栏或工具栏。

## 12. 目录约束

`apps/harness-react/src` 按运行边界组织，不再平铺业务组件：

```text
src/
├── app/              # React 入口、挂载、路由边界
├── components/       # composer、conversation、session、workbench、workspace、interactions
├── hooks/            # 布局、面板、会话偏好、终端生命周期
├── state/            # PilotController、selectors、projections
├── platform/         # FirstPartyHarnessHost 与宿主适配
├── lib/              # 无业务副作用的工具
├── styles/           # token、全局和组件样式
└── types/            # 工作台 UI 类型
```

迁移只调整 import 路径和文件归属，保留现有 `PilotController`、`FirstPartyHarnessHost`、`app-main.tsx`、`pilot-main.tsx` 的运行时职责。

## 13. 实施顺序与验收

1. 规格文档和目录骨架落地；验证 TypeScript 路径无循环依赖。
2. 迁移入口、宿主、状态和基础组件；验证 `tsc --noEmit`。
3. 重做 Composer、Thread Header、摘要和执行轨迹；验证发送、停止、审批、重跑行为测试。
4. 重做 Session Sidebar 和 Workspace 面板；验证文件、变更、终端、浏览器生命周期测试。
5. 宽屏/紧凑窗口视觉验收；验证 1440px、1024px 与 820px 无溢出、无竖排文字、浮层互斥。
6. 运行全量测试、React 构建、`git diff --check`，并更新阶段记录。

验收门槛：

- 业务能力与第一方桥接行为不回归。
- Composer 在 820px、1024px、1440px 均不发生文字挤压或控件重叠。
- 运行、待审批、失败、完成四种状态都能从 Thread 和 Workspace 找到下一步动作。
- Session Sidebar 与 Workspace 在窄窗互斥，刷新/切换会话后状态可恢复。
- `npx tsc -p apps/harness-react/tsconfig.json --noEmit`、`npm run test`、`npm run harness:build` 全部通过。

## 14. 2026-09-30 实施对照与下一次开工入口

本节及第 15 节为历史记录，保留当时的完成/待办与检查数字；当前续做入口统一看 [2026-10-08 对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md)，不再根据历史“下一步”重新要求设计评审。

**代码已落地**：三栏/紧凑浮层、会话搜索与优先队列、Thread/摘要/Composer、Radix 模型与权限菜单、计划修改与澄清、文件树已加载节点筛选/刷新、变更增删行号、多终端管理、会话级工作区偏好和浏览器 URL 恢复。浏览器受 Shell 单 WebView 约束，切会话重建视图而非保留原生历史；终端仅在同一次应用运行内保留进程，页面刷新后按已存 tab 新建。

**仍未达到本规格**：文件全目录搜索、变更按 run 分组及大段上下文折叠、活动运行时长和工具错误复制、完整任务状态的真实桌面截图、打包版终端/浏览器生命周期、Windows 和真实模型/实体输入验收。上述是待办，不应因静态构建和模拟截图通过而标记为完成。

**下次从这里开始**：先用隔离开发 Electron 对运行、待审批、失败、完成四态逐项操作并记录截图与宿主调用结果；再处理上述剩余交互，最后做打包 macOS/Windows 验收和默认入口切换决策。阶段执行记录详见 [MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md](./MIRA_REACT_HARNESS_STAGE1_DESIGN_2026-09-24.md) 第 23 节。

## 15. 2026-09-30 首屏与作用域改造记录

状态：已实现，静态构建与全量测试通过；真实 Electron 视觉验收待开发服务恢复后补做。

本次按 ZCode/Codex 的交互原则完成第一轮 Mira 化改造，复用现有 React 19、Radix Dropdown Menu、assistant-ui 和 lucide，不复制 ZCode 业务命名或内部实现：

- 空会话改为 `pilot-launchpad` 任务起点，标题、Mira 任务说明和 Composer 处于同一首屏区域；有任务历史后恢复固定底部 Composer。
- 首屏文案改为“把下一件事交给 Mira”，强调任务连续性；无会话时明确引导选择任务工作区。
- 侧栏增加当前工作区 scope 摘要，项目列表将当前项目置顶，保留搜索、状态队列和项目折叠。
- Composer 顶部显示任务范围、项目名和目录；模型保持紧凑入口，权限、Skill、MCP 统一进入 Radix “高级设置”菜单。
- 权限菜单补充逐次确认、自动审核、完全访问的风险说明；已有二次确认逻辑保持不变。
- 右侧面板标题改为“任务工作区”，同时显示当前项目、任务名和实时任务状态，让文件、变更、终端、浏览器明确属于当前任务上下文。

验证：`npx tsc -p apps/harness-react/tsconfig.json --noEmit`、`npm test`（72 个测试文件、321 项通过）、`npm run harness:build`、`npx electron-vite build`、`git diff --check` 均通过。短暂启动 React 资源服务后，`/harness-react-dev/`、`pilot/` 和 `app.css` 均返回 200；未声称完成浏览器或 Electron 截图验收。

下一步：启动 React/Electron 开发环境做 1440px、1024px、820px 的真实截图；随后继续处理工作区常驻上下文、运行态摘要和侧栏平台级导航层级。

## 16. 2026-10-08 第二批增量

**已实现**：第 7、8 节的模型/推理档位、动态标签/最近关闭、PTY 原始输入、launcher 容器响应式，以及首屏水印移除、启动时保留已有会话文本/附件草稿。流式与完成态高亮共用 Mira 的 Shiki core/JavaScript engine 适配器：253 个物理 grammar、235 个公开 ID、含别名 332 个名称，仅两个 GitHub 主题；缓存用完整代码/语言/主题键，LRU 限制 128 项和累计 1,000,000 key 字符。

**原生桌面已通过**：拖拽保留选中，中键关闭非活动终端不抢浏览器焦点，关闭其他/全部及最后标签回 launcher，A/B 标签与关闭历史隔离；恢复终端创建新 PTY 且旧进程消失。iframe 焦点下 `⌘N` / `⌘K`，文件原生多选去重/移除，真实引用发送期间切会话及不可读附件失败恢复均通过。reasoning=false 隐藏档位入口、支持后显示；B 高/A 低导航后分别恢复。完成态两段 TypeScript 各含 13 个带样式 token。

重启后 C 未发送草稿/外部附件及 A 低/B 高档位恢复，切任务后活动终端自动连接；真实 PTY 单独空格/Enter 成功。真实键盘 Tab 到非活动文件标签后 Enter 只激活、不开始拖动，Space → Left → Space 完成排序。

launcher 原生拖宽从 420px flex 单列/48px 行变为 559px grid 三列/88px 卡片；深色两段代码各 13 个 token，实际使用 `--shiki-dark` 颜色。正式 Harness Frame 限定 `clipboard-write` 授权后，原生复制与 `pbpaste` 精确源码及尾换行通过；不开放 clipboard-read，不改变 sandbox。

失效文件实际提交显示“引用文件已不可读取，请重新选择文件后发送。”并保留草稿/chip，恢复文件后实际重发成功；A 低/B 高的请求日志分别为 `reasoning_effort: low/high`。

原生 Tab 补全 README 后 Enter 输出文档；`Ctrl+@` 经 `od` 输出 `00` 验证 NUL，`stty` 恢复；macOS 拦截的 `Ctrl+Space` 不算通过。真实新任务起点无 M 水印。

侧栏原生重命名同步 Header/Sidebar；归档当前和二步确认删除后列表/主线程/标题无残留，自动切 B。实际 Vue 模板 SSR 的三组 manifest 剪贴板回归 3 项通过并纳入最终全量，仅 Harness 有 write-only，不增加 read/same-origin。

**收尾修复前的检查**：14:03:43 当次全量 80 文件/455 项、React/Vue 类型检查和 `git diff --check` 通过，正式 `harness:build` 两次通过；14:02:52 静态闭包 3 JS/1,959,740 bytes，全部 287 JS/9,483,981 bytes，磁盘/内存构建 SHA-256 一致，239 动态引用齐全，旧块残留 0。当前未提交、未推送。

## 17. 2026-10-08 收尾增量

宿主 `platformIpc` 以 WeakSet 限定每个 WebContents 一次 `destroyed` 钩子，共同清理 grant/PTY，不让授权创建和终端打开累积监听。14:11:38 全量 80 文件/458 项在 3.79s 通过（`platformIpc` 16 项含新增 3 项），React/Vue 类型检查重新通过，diff 检查通过；React 产物未变、未重建，保留 14:02:52 字节证据。

隔离开发 Electron 重启后，原生鼠标 12 次设置往返正式入口有 iframe 且无路由错误，16 次终端创建均连接、关闭后回单终端，主进程日志无监听超限警告；离开设置时存活 PTY 回收，返回输入区存在且无非空 alert。销毁清理一次/不同窗口隔离仅单测验证，不作为原生多窗口或发布验收。当前未提交、未推送，下一入口仍高亮 profile 与文件树/独立只读预览。

**剩余与下次入口**：profile 首次高亮长任务/布局跳动、可靠进程冷启动及安装包性能；六次 HTTP `no-store` 导航不作可靠冷暖对照。普通文件按真上游先左侧树抽屉/独立预览 tab/Radix 菜单/树键盘/加入对话，再 watch/search/外部编辑器，不默认内置编辑器。继续按 [对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md) 验收；BrowserView/CDP、插件市场、完整模型目录、真实远程模型、正式安装包、Windows 和 P0–P3 未完成。

## 18. 2026-10-08 文件工作区增量

本节更新第 8.3 节文件行为；第 14–17 节保留各批历史，旧“下一步”不再作为当前入口。

- 左侧“查看文件”切为当前任务授权目录的文件树，不把树嵌进右侧预览；“返回任务”恢复任务导航而不关闭右侧文件。个人工作区也有真实目录。
- 固定 28px 行/12px 缩进、目录懒加载、刷新与错误重试。树只有一个 Tab 入口；方向键移动/展开/收起，Home/End、Enter 与 Shift+F10 可操作，菜单 Escape 返回原行。
- 打开文件生成独立右侧只读 tab，身份用完整相对路径，`alpha/README.md` 和 `beta/README.md` 不合并；沿用排序、中键关闭、右键关闭与最近关闭恢复。
- 40px 工具栏提供面包屑、刷新、加入对话与 Radix 选项；选项包括复制相对/绝对路径与文件内容、Markdown 预览/源码、自动换行。没有通用 dirty 或 `⌘S` 写回，不伪造未实现的外部编辑器入口。
- 文件首次激活才读取，切 tab 保留内容；会话/root/path 变化拒绝旧响应。空、加载、具体读取失败和恢复后重试均有状态；失败或未读完不能加入文件内容，复制失败有反馈。
- 加入对话只合并附件并聚焦输入，不自动发送；与原生选择器共用去重合并，累计最多 12 份，超限整批拒绝且保留原附件。会话/项目变化不遗留旧引用。
- 源码采用虚拟行与完整逐行语法续接；约 8ms 扫描后让出线程，隐藏/切换取消旧高亮。首次编译/病态单行仍不可抢占，不承诺硬延迟上限。

原生已验证：同名 tab、返回保留、精确复制、加入不发送、Markdown/换行、空/丢失/恢复、中键关闭/恢复、树键盘/菜单焦点、A/B 隔离、同会话移项目后读取/复制新 root；浅/深色与深色菜单已复核。15:04:30 全量 82 文件/596 项、类型/正式构建/diff 通过；15:11:26 当前 287 JS/239 动态目标/12 CSS 规则/7 许可完整性审计通过。8001 行原生高亮约 2205.5ms 无记录长任务、46 行 DOM，滚动 56 行无记录长任务；仅该抽样，不是发布性能放行。

剩余及下次入口：首次 grammar/病态单行/布局与可靠冷启动/安装包；文件完整工作区搜索、watch、外部编辑器、媒体/Git、BrowserView/CDP、真实模型及 Windows 后续分别验收。完整证据与当前方向见 [对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md)。

## 19. 2026-10-08 文件标签收尾

标签关闭按钮为覆盖定位，inactive 且未 hover/focus 时隐藏、不占标题布局、不接收点击；active/hover/focus 预留 27px 关闭空间。inactive 沿用上游 60–156px 收缩，active 最小 128px，标题渐隐；标签宽度不因 hover 改变，继续提供横向滚动、活动标签自动滚入视野和完整路径列表。

1440×900 隔离正式开发 Electron 的六文件原生复验：列表 418px/内容 443px、active 128px；Space → Left → Space 排序、中键关闭非活动 source 保持 README、最近关闭恢复、最终六标签五秒稳定。Vue 设置切到深色返回后恢复六标签，无非空 alert；树菜单 Escape 回 `alpha/README.md`。15:35–15:36 浅色/深色/菜单三图已固化于 [截图索引](./assets/mira-zcode-alignment-2026-10-08/FILE_WORKSPACE_EVIDENCE.md)。

15:26:55 正式构建、15:27:21 全量 82 文件/596 项（5.43s）及 React/Vue 类型通过；15:27:43 审计 287 JS、239 动态目标、645 静态边、12 CSS 规则与 7 许可一致，CSS 124,328B/gzip9 22,163B。构建/原生截图不等于真实模型、安装包、Windows 或整体性能通过。下一步独立验证工作区偏好读取失败与离开保存风险，随后继续搜索/watch/外部编辑器；当前未提交、未推送，总体目标进行中。

独立 documenter 已同步 DESIGN/sidecar；同一 finish reviewer 对标签标题和过期文档两项均评为 resolved，remaining clear、disposition ship。该结论只覆盖本批两项，不扩大到完整 ZCode、性能或发布关口。

## 20. 2026-10-08 搜索与状态保存增量

**已实现**：第 8.3 节全目录搜索、上游 fuzzy scoring/top1000、host root/cache/候选校验与失败语义，React 防抖/旧结果清除/过期响应抑制、文件保留 query 和目录清 query/reveal；第 8.7 节读取成功门槛、late hydration/local clearing、按 key 顺序保存、最新 snapshot/merge loop 及离开成功确认。独立 reviewer 对搜索目录 reveal 的原 P2 已标 resolved，树 17 项回归通过；保存包含 StrictMode、快速 unmount、读/写失败和重试、未完成保存期间的新修改等回归。

**证据**：16:34:16 全量 84 文件/643 项在 5.03s 通过，React/Vue 类型与 diff 通过，正式构建约 16:34:15 完成；16:35:08 最终审计 287 JS SHA 一致、缺失/旧块 0、239 动态目标及 7/7 许可、NOTICE/HTML 一致，字节口径见性能文档。16:21:10 的 84/643（4.77s）及 16:20:47 构建为先前本批检查。

搜索原生 smoke exit 0，覆盖未展开深层文件、文件 query 保留/首次 clear 回树、目录 reveal、无匹配、Down/Enter/Escape、chmod 无部分结果/恢复重试，observer `longTasks=[]`。保存故障阻止设置离开且 timeOrigin 不变，retry 最新 snapshot 后离开，返回展开树与原 file tab 恢复；工作区默认收起、点击后持久 tab 可见。最终 `/tmp/mira-search-final-desktop.mjs --no-capture` 完整重跑 exit 0，包含深色菜单/Escape、刷新新文件、1100 匹配 top1000 明确提示/37→36 虚拟行/End `0999`、A→B 同 query 无匹配→A query 空且原 tab 恢复；结果日志 `/tmp/mira-search-final-native-results.jsonl`。先前末段 selector 拼写错误已更正后重跑，finally 清理 1101 测试文件/随机目录，无故障注入残留。六张已核实搜索图和 ZCode 原生对照固化于截图索引。独立收尾 reviewer disposition **fix**：重复同路径打开后 clear 不定位，X/Escape/清空输入需统一排队当前选中路径并补回归/同一原生复验；前述检查为该分支修复前证据。Node helper 131781 文件 cold 818ms/warm 89ms、timer gap 17ms 只是单次文件搜索抽样。

**剩余与下次入口**：先修复重复同路径 clear 定位 P2，验证 X/Escape/清空输入及同一原生复现；权威入口是 [本轮对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-搜索与状态保存增量)。此前 `9→0` 仍未归因，继续复现时须记录 session/target/timeOrigin 与保存请求次序；force reload/进程终止不能保证 async 保存。下一文件批次为 watch/外部编辑器，再分别安排媒体/Git、首次 grammar/病态单行/布局与可靠冷启动；正式安装包、Windows、真实模型完整矩阵、整体 ZCode/P0–P3 未放行。当前未提交、未推送。

## 21. 2026-10-08 搜索清除定位收尾

**已修复与定向验证**：统一 `setSearchQuery`，query 变为空白时以当前 `selectionPath` 排队 `pendingReveal`，onChange/X/Escape 同一转换，既有 layout 的 `searching` 依赖不改。5 项真实 `ProjectFileDrawer` 组件 callback 回归覆盖 X/Escape/deleting/whitespace 重复 same path 与无 selected。16:48:05 仅还原旧三入口时 4 fail/1 pass，恢复修复后 16:48:33 5/5 pass；原生首次/重复 X/Escape/实际 Cmd+A → Backspace 均 scrollTop=5386、目标行 794..822 在树视口 132..834 内，200 生成文件已 finally 清理。

**最终证据与限定评审**：16:50:22 全量 85 文件/648 项在 6.26s 通过，React/Vue 类型与 diff 重新通过；最终构建 app mtime 16:53:05、bundler 378ms、exit 0；16:53:57 审计 287/287 JS SHA 一致、缺失/旧块 0、239 动态目标及 645 静态边、7/7 许可、NOTICE/HTML 完整。静态 3 JS/2,011,179B（逐文件 gzip9 606,377B），全部 JS 9,535,420B（gzip9 1,904,942B）、CSS 125,300B（gzip9 22,261B）不变。浅/深色完整原生脚本分别 `/tmp/mira-search-light-fixed-results.jsonl`、`/tmp/mira-search-dark-fixed-results.jsonl`，均 exit 0；浅色 longTasks=[]、top1000 37/36 行、A/B 隔离与最终 needle/transient 两 file tab 通过。六同视图新截图逐张检查并覆盖固化、SHA 与原图一致。同一 reviewer **Verdict Pass**，唯一 clear P2 **resolved**、Remaining **clear**、Disposition **ship**，仅限该定位修复。

**剩余与入口**：本节收尾完成，第 20 节 84/643、16:35:08 审计与 fix 为修复前历史。权威入口 [搜索清除定位收尾](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-搜索清除定位收尾)。watch/外部编辑器及既有性能/发布待办继续分别验收，`9→0` 未归因，force reload/进程终止不保证 async 保存；完整 ZCode/安装包/Windows/真实模型/P0–P3 未放行，未提交、未推送。

## 22. 2026-10-08 工作区监听与外部编辑器

**完成**：第 8.8 节的授权绑定、非递归监听、身份重绑/消失恢复、共享订阅、树/搜索/预览更新与真实两读队列已实现；第 8.9 节分体控件、安装探测/真实图标、文件打开方式、主/子菜单可用高度滚动、偏好读取失败重试/失败 launch hydration/成功选择屏障及严格成功后偏好保存已接入。主 renderer 非同文档主框架导航/崩溃/销毁撤销 grant 并回收 watch/PTY；上游来源与 Mira 适配声明保留，业务命名不复制上游。

**验证**：本批最终构建/类型、受限并发全量回归、完整原生操作与重载恢复通过；独立代码复评发现的偏好时序问题已修复并有先红后绿回归，独立最终视觉复评待归档。检查数字、失败重跑、日志及限定结论只引用 [本批验证证据](./assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md)。本批曾出现默认并发高亮与限制并发监听用例超时，必须保留失败条件，不写默认全量无条件通过。历史 maxReads 已排除监测时序误计；第 21 节 ship 不覆盖本批。

**剩余与下次入口**：先核对证据索引的独立最终视觉复评，下一批为真实位图与 SVG 预览/源码切换：新增宿主授权图片读取桥，复用已有会话/root 隔离、监听和错误恢复，不将预览等同于图片加入模型上下文。之后音视频/Office、Git 叠加、首次 grammar/病态单行/布局 profile 与可靠冷暖/进程冷启动分别推进；高级浏览器/工作流、安装包/Windows/真实模型和整体 ZCode/P0–P3 独立验收。旧批次“下一步”和数字保留历史；watch/editor 是已实现能力而非后续 TODO。`9→0` 仍未归因，force reload/进程终止不保证异步保存，未提交、未推送。

### 2026-10-09 续作

**完成**：本批最终构建、类型、受限并发全量回归和完整原生操作通过，监听刷新/恢复、真实外部编辑保存、打开失败后恢复、重载后监听重接及短窗口多项菜单真实滚动均有固化日志，浅深色实拍已固化。同步第 8.8/8.9 节和当前入口，偏好失败时序问题有先红后绿回归；保留旧批次检查、默认并发超时及锁屏中断历史，最终数字只在证据页记录。

**剩余与下次入口**：独立最终视觉复评待归档，先从 [本批证据页](./assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md) 核对限定结论；下一次从上节授权图片读取与真实位图/SVG slice 开始。后续音视频/Office、Git/profile/发布待办分别验收，默认并发高亮超时、强制 reload 异步保存与 `9→0` 未归因边界保持，未提交、未推送。

## 23. 2026-10-09 位图与 SVG 预览

**完成**：第 8.10 节受控 `files.read-image`、4MiB 有界读取与文件/root 复核、40px 工具栏、8px 棋盘/`@Nx`、SVG 预览/源码和 decode 失败 retry 已接入，复用身份、监听、隐藏延期读取与恢复。位图无文本动作，树内位图加入禁用；SVG 读取成功的源码态不受 decode 失败影响，按原文本附件边界加入。

**验证与剩余**：最终受限两 workers 自动检查与 headless 局部确认通过，最终自动检查、无头 fixture 与限定结论仅看 [图片证据页](./assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md)。同一 reviewer 已确认两项 CSS P2 与 SVG 源码动作三项修复通过，仅覆盖 headless React。fixture 使用实际生产 JS/CSS 和图片 helper，不能代替真实 Electron grant、原生操作或 Vue 设置验收。图片浅深色原生操作/同态 ZCode 比较、上轮错误态浅深复拍与复评确认仍待完成。旧第 22 节及更早检查数字、默认并发超时和限定 ship 保留历史。

**下一次入口**：桌面空闲后先恢复上轮错误态确认，再完成图片原生验收与同态 ZCode 比较；之后音视频/Office、Git/profile、可靠冷启动及发布矩阵，不重复实施图片。实现入口为 `harnessWorkspaceFiles.ts`、第一方文件桥、`FilePreviewPanel.tsx`、`MiraImagePreview.tsx` 与 `lib/image-preview.ts`。force reload/进程终止不保证异步保存、`9→0` 未归因，整体 ZCode/P0–P3 未放行，未提交、未推送。

## 24. 2026-10-09 Git 文件树状态叠加

本节保留 overlay 批次历史；删除与筛选及其新验证见第 25 节，旧未实现项、数字和限定 ship 不覆盖当前入口。

**完成**：第 8.11 节名称颜色/直接 `M/A/D/R/U`、目录单后代点/M 优先和精确 ignored 已接入；本批删除仅祖先摘要，尚未补删除虚拟行；受控异步 Git/NUL parser、前后 root/repository/metadata 与返回前 grant/session/root 复核、有界命令和 React status/ignored 各单在途、512 可见路径批/cache/过期 guard 均有回归。首次、手动和工作区通知刷新；非仓库 `available:false`，安全错误/重试。无 Git 写操作或 metadata watcher，外部 add/commit 不保证自动刷新。

**验证与剩余**：受限两 workers 自动检查、React/Vue 类型、React/electron-vite 编译与正式 React headless 通过；准确数字、7 张 PNG、日志与独立复核统一见 [Git 证据页](./assets/mira-zcode-alignment-2026-10-08/GIT_OVERLAY_EVIDENCE.md)。独立复核原 P2 已解决、未见回归，remaining clear；限定 ship 仅覆盖本只读 Git 源码/headless 与文档修正，原生桌面验收暂停。headless 使用 MessageChannel、实际第一方桥/parser 和真实隔离 Git helper；grant/IPC 是单测、watch 是 fixture，不代表真实 Electron grant、原生操作、Vue 设置、安装包或 Windows。

**下一次入口**：桌面可用后确认监听/编辑器错误态和复评，再做图片与 Git 原生浅深色/同态 ZCode 比较；不可用时先推进删除虚拟行/changed-only，再分别设计 metadata watcher、媒体 lease/Range 和 performanceWorker/profile，均尚未实现。旧第 23 节图片、监听与搜索等数字保留原日期/范围；整体 ZCode/P0–P3 未放行，未提交、未推送。

## 25. 2026-10-09 删除虚拟行与只看变更

本节保留 filter 批次历史；搜索 ignore 已在第 26 节实现，本节旧待办、数字和限定 verdict 不作为当前入口。

**完成**：第 8.11 节已加载父目录合成 deleted、只看变更树祖先/搜索直接过滤、同级可访问位置、D 只选中且打开禁用/复制和非位图引用保留均已接入。开关保留 query/展开/选中，不扫描或强制展开；loading 保留最后成功快照、筛选、删除菜单与行焦点，明确失败/非仓库及 session/root 变化重置。搜索不注入 deleted 项；加入 chip 不读取，实际发送仍经宿主真实文件校验，缺失错误恢复不改变。

**验证与限定结论**：最终两 workers 96 文件/928 项、React/Vue 类型、React/Electron 编译、产物审计与三视口正式 React headless 通过；最终数字、25 条记录/190 requests、10 张 PNG 统一见 [本批证据页](./assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)。旧生产缺 root D/filter 的真实 baseline 及 D 菜单刷新 before-fix 均保留；仅快照保留修复有两项失败后 51/51 通过证据，不把整批称为 red/green。新独立源码/10 图逐张复核 slice-pass，未见可复现 P0–P2，文档一致性复核通过；旧 overlay ship 不覆盖本批。实际第一方桥/parser/Git helper、watch fixture、剪贴板 stub 和 grant/IPC 单测不代替真实 Electron grant/电脑操作、Vue 设置、安装包或 Windows。

**下一次入口**：核对本批文档一致性复核，下一未实现文件树 slice 为搜索 ignore 规则/配置，再独立设计 metadata watcher、媒体 lease/Range、高亮 Worker/profile。电脑操作工具恢复后补监听/编辑器错误态和图片/Git 同态 ZCode 比较。旧数字/限定 verdict、`9→0` 未归因、force reload 保存边界保持历史范围；整体 active、P0–P3/性能/发布未放行，未提交、未推送。

## 26. 2026-10-09 搜索忽略规则与 Vue 设置

**完成**：第 8.12 节 `.miraignore` 成熟解析、首次非空搜索安全初始化、设置模板读取不落盘、分区草稿同步/恢复、扫描前剪枝与 root/规则缓存失效已接入。Vue 平台设置选择现有项目/个人工作区，包含加载门槛、模板首次保存、已有文件 dirty 保存、未保存确认、revision 冲突和失败留草稿/迟到取消。仅实际搜索使用 matcher，非 `@`/Command Center，也不改变浏览/预览/上传或 Agent 权限。

**验证与限定结论**：最终数字、类型/构建/审计、浅深色多视口截图与限定评审只见 [本批证据页](./assets/mira-zcode-alignment-2026-10-08/SEARCH_IGNORE_EVIDENCE.md)。独立 Chrome headless 运行真实 Vue/Element Plus/AppIcon/全局样式，经隔离 HTTP fixture 调真实 Electron 文件服务，不经过 preload/IPC/native；未操作用户 Chrome/ZCode/Electron 或 `/tmp/mira-ui-project-smoke.md`。上游同版导航隐藏该设置，Mira 有意开放 Vue 页，不称上游隐藏页已做原生逐像素验收。跨进程最终 syscall 非绝对 CAS、root 移走临时文件残留、hard-link 不支持显式失败与受控路由之外保存边界保留；旧 Git/filter verdict 不覆盖本批。

**收尾**：独立服务复现的 awaited 授权 P2 已修复并由发现者同一三类真实服务复验关闭，实际平台 callback 也覆盖 grant 撤销/DB 目录切换/sender 销毁；修后全量/类型/构建/审计通过，准确数字见证据页。UI 截图仍是修前有效 headless 采集，未重拍，不提升原生证据；本次授权 await 缺口与未解决的 POSIX 最终 syscall 非 CAS 是两个边界。

**真实桥续作（2026-10-09 13:26 +08:00）**：真实 Electron 复现第二个 P2：Vue Proxy target 经 `contextBridge` 报 `An object could not be cloned.`；`shallowRef` 与普通 `{ kind, id }` 请求快照覆盖初读、重读、transform、save，回归与独立源码复核通过。最新全量/类型、React 与 Electron 重新构建及审计通过，JS/CSS 字节不变，准确结果只看证据页。13:14:15 的 [bridge/DOM probe](./assets/mira-zcode-alignment-2026-10-08/search-ignore-native/bridge-transport-results.json) 经真实 preload/IPC，模板约 460B、textarea 启用且内容一致、无 alert；三产物 SHA 与最新构建一致，但 probe 未重跑。仅 CDP 只读观察，不是实体输入/截图验收，7 张旧 headless 图保持原采集身份。

**剩余与下一入口**：从 [本批对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-09-搜索忽略规则与-vue-设置) 与第 8.12 节继续；代码为 `harnessWorkspaceIgnore.ts`、`harnessWorkspaceSearch.ts`、`harnessWorkspaceIgnoreIpc.ts`、`src/pages/backend/fileSearch/`。前景仍为 `616=com.apple.loginwindow`，隔离 Electron 已退出、无可见窗口，原生脚本在夹具设置/输入前记录 `blockedBy=macOS-loginwindow`、0 actions/0 captures，未解锁或使用 `DOM.click`，不算功能失败。下一步解锁后重启隔离 Electron，仅补本批配置/搜索/浏览有限原生验收，不自动扩展为完整 native 或同态 ZCode 放行。Git metadata watcher 仅为随后候选，不把文件 watch 当它；旧错误态/image/Git、媒体 lease/Range、高亮 Worker/profile 分别推进。整体 active，P0–P3/性能/发布未放行，未提交、未推送；历史数字、限定 verdict、`9→0` 和 force reload 保存边界保留。
