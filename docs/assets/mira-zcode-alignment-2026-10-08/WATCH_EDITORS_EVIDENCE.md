# 工作区监听与外部编辑器验证证据

初版/最近更新：2026-10-09，Asia/Shanghai。状态：本批功能实现、构建、受限并发回归、完整原生操作与十次重载恢复通过；独立复评发现错误态文字对比度不足，局部修正已落地，最终实拍确认尚未通过。完整 ZCode 对齐目标仍进行中，未提交、未推送。

## 环境与边界

- 仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness`，分支 `codex/mira-harness-first-slice`；保留已有累计改动。
- 隔离 home `/tmp/mira-zcode-acceptance.dAACiF`，项目 `/tmp/mira-ui-project.xsM04t`；未修改真实用户配置。
- 正式开发 Electron 入口 `/workspace/harness-react`；Electron 提供能力、Vue Shell/设置、React 工作台不变。
- 09:35 监听脚本实例 PID 86402/窗口 2433；09:40 重启后的编辑器/重载/截图实例 PID 41261/窗口 2550。原生日志保留 URL、窗口与 timeOrigin，不能混用实例。
- 无独立可调用的 computer-use 插件；使用 macOS Accessibility/CoreGraphics 真实点击、键盘、滚轮和屏幕捕获。CDP 只用于 DOM 定位、读取结果及隔离测试夹具准备。
- ZCode 源码 3.14.3 / commit `29628c9`，安装版 3.14.4。版权、改编路径和声明集中 `third-party-licenses/zcode/`。
- 以下结果不代表正式安装包、Windows、真实远程模型、冷启动或全部 ZCode 能力；文件仍是只读预览。

## 自动检查

| 检查 | 最新结果与证据 |
| --- | --- |
| `npm test -- --maxWorkers=2` | 2026-10-09 10:08:36，最终错误态 CSS 修正后 91 文件 / 784 项通过，11.76s；历史通过日志已清理，结果摘要保留 |
| React `tsc --noEmit` | 09:46 exit 0；类型日志（历史原始日志已清理）（只含 npm 配置提醒，无类型诊断） |
| Vue `vue-tsc --noEmit` | 09:46 exit 0；类型日志（历史原始日志已清理） |
| `npm run harness:build` | 10:01 错误态 CSS 修正后 exit 0，JS bundler 846ms / CSS 168ms；完整日志（历史原始日志已清理） |
| `electron-vite build` | 10:04 exit 0；最终日志（历史原始日志已清理）；不是 DMG 构建/安装验收 |
| 构建图/许可审计 | 10:01:54，只读 `write:false` 重建，287/287 JS SHA 一致；缺失、差异、旧块 0；239 动态目标 / 645 静态边完整，7/7 许可一致；[最终 JSON](./mira-watch-editors-final-bundle-audit-2026-10-09.json) |
| `git diff --check` | 09:47 exit 0；不代表未跟踪文件已提交 |

静态入口闭包 3 JS / 2,024,802B，逐文件 gzip9 合计 609,756B；全 JS 9,549,043B / gzip9 1,908,321B；最终 CSS 126,918B / gzip9 22,526B。09:46 的原 CSS 为 126,628B / gzip9 22,480B；旧审计 JSON 及其清单条目已于 2026-10-10 清理，最终审计 JSON 保留，原始通过日志已清理。字节只说明产物大小与完整性，不推导启动、渲染或交互提速。

### 修复与失败历史

- 2026-10-08 默认并发两次出现 8,001 行高亮的原 5 秒超时；不能将受限并发通过写成默认全量无条件通过。
- 17:57 的受限并发曾出现原生 watcher 测试超时。macOS `fs.watch` 返回不保证 OS 订阅已就绪，测试现在先写 marker 等 root/child 收到真实回调，再进行 rename；接受合法 `paths=[]` 全失效并确认 child handle 重建。未放宽 timeout、未为测试更改生产实现；24 项随后连续两轮通过。
- 09:37:30 新增三个编辑器偏好重试回归先红，09:38:04 全 20 项绿：检测成功不清掉偏好错误、仅失败的偏好重新读取、迟到读取不覆盖成功显式选择。
- 独立复评又发现失败 launch 会阻止尚未完成的偏好读取。09:44:00 新增三例先红，09:44:22 全 23 项绿：失败 launch 允许初始/重试 hydration，成功选择阻止旧偏好覆盖；并发顺序、卸载/controller 变化及保存失败报告保留。
- 主/子菜单按 Radix 可用高度约束并 `overflow-y:auto`；不改变锁定的颜色、尺寸或交互方向。
- 旧读取监测器误计峰值 3，且一度拦截 React Scheduler MessagePort 导致输入状态不更新。改为只处理 `mira:request`、按 port 分域、在真实 onmessage 处理前减数，post 成功后计数并 finally 清理后，输入/搜索恢复。该故障属于隔离监测器，不是产品代码回归。

## 原生操作

### 工作区监听

[完整原生日志](./mira-watch-editors-native-final-results.jsonl)，2026-10-09 09:35:44–09:36:15 完整脚本 exit 0，stderr 为空。真实文件操作覆盖：

1. 新建目录与文件自动进入树并可打开预览；外部保存自动更新，单样本观测延迟 815ms。
2. 临时文件 rename 原子保存；隐藏预览不提前重读，激活后读取新内容（read 7→8）。
3. 删除保留文件 tab 和可恢复错误，文件恢复后重新显示。
4. 同路径 child 目录替换后重新绑定，旧目录移出 workspace 的修改不污染树。
5. 搜索匹配自动更新并保留 query；真实 chmod 错误具体可见，恢复权限后图标重试恢复。
6. 空闲窗口请求 121→121，无轮询；实际目录读取峰值 2；本观察窗口 `longTasks=[]`。这是单脚本抽样，不是总体性能认证。

09:53 同一保留夹具再次实际 chmod、触发 root 事件并原生重试，exit 0；[日志](./mira-watch-permission-final-native-results.jsonl)与下方实拍图相互对应。权限和 probe 文件均在 finally 恢复/清理。

### 外部编辑器与重载

[最终完整脚本](./mira-editors-reload-native-final-results.jsonl)，09:46:36–09:48:05 exit 0，第一轮重载起加载本次最终 React 构建：

- 本机真实探测 Finder、Trae，主菜单 160px，两项 32px PNG 图标 SHA 不同。
- 选择 Finder 实际打开并保存 `mira-finder`；再次选择同项仍打开；重新检测可用。
- 树子菜单启动 TextEdit，原生键盘输入/保存，磁盘变更与 Mira 预览同步；文件级打开不改变目录默认偏好。
- 预览的 Finder 外部打开可用。
- 连续十次实际 `Cmd+R`，每次等待 timeOrigin 变更、真实重新搜索/打开保留夹具并等 tab 偏好落盘，再修改文件；十次均收到监听更新，无可见 alert。

这证明重载后的重新授权/监听恢复，不证明强制 reload 前尚未完成的异步保存有保证，也没有解决历史未归因的 `9→0` 观察。

[边界完整脚本](./mira-editors-boundaries-native-evidence-results.jsonl)，09:51:58–09:52:18 exit 0：

- 实际移开文件后外部打开显示“文件或目录已不存在”；finally 恢复后再次打开成功。
- 1440×680 逻辑短桌面窗口，24 项明确标为 `Mira fixture editor` 的隔离响应；真实滚轮将主菜单滚到 `scrollTop=244.5`、最后重新检测项可见，子菜单滚到 `scrollTop=66`、第 24 项可见；均没有超出 iframe 可用高度。
- 24 项只是菜单压力夹具，没有声称本机装了 24 个应用，没有 launch 伪编辑器；恢复原 MessagePort、窗口 1440×900 并重新探测真实 Finder/Trae。
- 脚本早先有 AppleScript 选择语法失败、compact 浮层遮挡下定位不到标题按钮、清理时忘记先滚到菜单末尾三次失败；修正测试步骤后的上列最终脚本才记通过，未据此改产品代码。

## 真实截图

以下 Mira 功能验收图均是 09:51–09:53 `screencapture -R` 捕获当前前景桌面的精确窗口矩形，不是浏览器截图或合成设计稿；标准图为 2880×1800 Retina 像素，短窗口图为 2880×1360。它们是错误态对比度修正前的归档图，不冒充最终视觉确认。按窗口 ID 的 `-l` 截图曾保留失真的旧画面，已排除并以当时矩形实拍覆盖；不再用旧哈希证明本轮。截图只是其状态证据，不证明所有操作。

| 图 | 状态 |
| --- | --- |
| [浅色主菜单](./mira-editors-light-final-native.png) / [深色主菜单](./mira-editors-dark-final-native.png) | 真实 Finder/Trae 图标、当前项、重新检测 |
| [浅色打开方式](./mira-open-with-light-final-native.png) / [深色打开方式](./mira-open-with-dark-final-native.png) | 文件树上下文菜单实际展开 Finder/Trae/TextEdit 子菜单 |
| [浅色预览](./mira-watch-preview-light-final-native.png) / [深色预览](./mira-watch-preview-dark-final-native.png) | 保留文件 tab 与只读实时内容、面包屑及外部打开 |
| [短窗口主菜单](./mira-editor-short-fixture-native.png) / [主菜单末尾](./mira-editor-short-fixture-scrolled-native.png) / [子菜单末尾](./mira-open-with-short-fixture-scrolled-native.png) | 明确标注的 24 项夹具，真实滚动后末项可见 |
| [外部打开失败](./mira-editor-open-error-native.png) | 文件临时移开后的具体错误，文件已恢复 |
| [监听权限失败](./mira-watch-permission-final-native.png) | chmod 失败与重试入口，权限已恢复 |

浅/深色通过实际 Vue 设置切换，截图实例与时间分别见 [浅色捕获日志](./mira-editors-light-capture-native-results.jsonl)、[深色捕获日志](./mira-editors-dark-capture-native-results.jsonl)；浅色 09:52:18 被边界脚本复拍为相同真实应用状态，最终来源时间/哈希见 `WATCH_EDITORS_MANIFEST.json`。

[ZCode 主菜单参考](./mira-zcode-editors-reference.png)展示真实分体按钮、Finder/Trae 和独立 Terminal 项；Mira Terminal 保持现有标题工具/PTY，不伪装成安装编辑器。[ZCode 文件菜单参考](./mira-zcode-file-open-with-reference.png)未展开子菜单，不能宣称等态像素复刻。树子菜单与只读预览同时参考上游源码，品牌和业务命名仍使用 Mira。

## 复现材料与限定评审

2026-10-10 清理了 6 份依赖旧绝对 `/tmp` 路径、CDP9222、窗口与原生工具的一次性验收脚本；删除前已在本机仓库外按 SHA-256 备份，历史操作结果与截图保留。目录 [watch-editor-scripts](./watch-editor-scripts/) 保留仍被其他原生验证脚本引用的 `mira-act.mjs`、`mira-cdp.mjs` 和 [Swift 辅助源码](./watch-editor-scripts/mira-zcode-cu.swift)；补审已恢复该源码，避免本机 `/tmp` 二进制失效后无法重建。这不是可直接重跑本批流程的完整工具包。图与日志的 SHA-256、复制一致性见 `WATCH_EDITORS_MANIFEST.json`。

独立代码复评完成：已发现并修复偏好失败时序 P2，23 项对应回归通过；其余已核查的菜单约束、grant/session/root 和生命周期回收未发现新的可证实缺陷。

独立视觉 reviewer 逐张打开上述 13 图，未见菜单截断、文字重叠或浅深色遮挡；确认短窗口末项可达、日志/十次重载与构建数字相符。但发现 1 组 P1：浅色监听错误 12px 红字 `#e03131` / `#f0f0f0` 仅 3.96:1；丢失文件错误正文 13px `#878787` / `#f8f8f8` 仅 3.38:1，低于 4.5:1。旧图保留为发现证据，不冒充修复后确认图。

最小修正：仅 file-drawer 错误文字在浅色使用 destructive 与黑色 85/15 混合，深色保留原色；file-preview `notice[role=alert]` 使用既有 foreground，一般空态不变。最终 CSS 构建通过。10:02 复拍仍载入旧 notice 样式，且 10:05 矩形截图读到 Chrome 前景；两者均未作为有效确认图归档。检测到桌面与用户日常使用冲突后停止鼠标/键盘，等待空闲窗口，不将测试环境时序故障改写成产品通过。截图脚本已加 capture 前后前景 PID 验证，恢复后需先确认真正重载、当前 CSS 与实例身份。

限定评审状态为 **fix / 待最后一次确认**，不使用 `ship`。本批还未覆盖完整菜单键盘/屏幕阅读器；浅深色错误态待有效实拍。已通过的功能操作不因此丢弃，也不放行尚未确认的可读性。

## 剩余与下一次入口

先在桌面空闲时完成错误态浅/深色有效复拍与同一 reviewer 的一次确认；记录前景 PID、timeOrigin、当前 CSS 样式与截图，确保没有 Chrome/旧构建混入。然后从 [对齐记录](../../MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md)继续“真实位图预览 + SVG 预览/源码切换”：新增授权图片读取桥，复用既有 watch/错误恢复，不能把图片预览冒充图片加入模型上下文。之后音视频/Office、Git 工作树状态、高级浏览器/工作流、插件/模型目录及性能 profile 分批补齐。

首次 grammar、病态单行、布局压力、可靠冷暖/进程冷启动、正式安装包、Windows、真实模型完整矩阵、Novel Studio/分发与整体 P0–P3 未验收；不因本页局部通过整体放行。未提交、未推送。
