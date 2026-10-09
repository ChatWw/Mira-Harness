# 2026-10-09 搜索忽略规则与 Vue 设置

状态：已实现；2026-10-09 13:32 更新。授权竞态与 Vue Proxy 跨桥问题已修复，最新全量/类型/构建/产物审计通过；真实隔离 Electron preload/IPC 读取与页面 DOM probe 通过。headless 七图保留原采集身份，前景鼠标/键盘/截图被 macOS 锁屏阻断，文档当前口径独立抽查通过；整体 ZCode 对齐目标 active。
本页是本批检查与边界的唯一数字入口，旧 Git/filter/image 的证据保持历史，不覆写。

## 范围与来源

- Electron：`harnessWorkspaceIgnore.ts` / `harnessWorkspaceSearch.ts`；Vue：`/settings/file-search`。
- `.miraignore` 是搜索规则文件，默认从根 `.gitignore` 加上上游默认排除段初始化。
- 使用显式 `ignore` 7.0.5 依赖，不手写 Git ignore 语法。版权与许可见仓库 `third-party-licenses/`。
- 上游 3.14.3 / `29628c9acdb81b703bbd4080c207a0e7ce5e276e`：
  `packages/services/src/file/workspaceFileIgnore.ts`、`fileService.ts`、
  `packages/ui/src/settings/WorkspaceFileSearchSection.tsx`。
- 上游编辑器源码存在，但 `settingsNavigation.ts` 隐藏该 section；正常导航及深链均回落。
  Mira 有意提供可用的 Vue 平台设置入口，不能称为该隐藏上游页面的原生逐像素验收。

## 已接入的行为

首次非空搜索安全创建规则文件；设置读取不存在的文件只返回模板，不落盘。
文件成为规则源后，`.gitignore` 变化不自动同步；同步仅替换 seed 段，恢复默认仅替换 defaults 段。
两操作变换当前草稿，保留自定义段及未变化段的字节，点击保存才写入。
分区标记缺失/重复时明确失败，保留草稿，不按上游退化逻辑静默重建。
空规则文件允许搜索默认排除的目录；根 `.miraignore` 自身不进入候选。
目录后缀 `/`、`**`、转义与反选使用成熟解析器；父目录排除后子文件不能反选恢复。

扫描在进入子目录前剪枝。缓存身份绑定 root `dev:ino` 及规则文件版本/内容 hash；
每次查询读取规则，编辑/删除/重建自动失效缓存，旧扫描不能写回新规则缓存。
返回前复核 `workspacePath` 的 canonical root 和 `dev:ino`，包含 warm-cache 与别名切换。
浏览树、预览、上传和 Agent 文件权限不使用此 matcher；它不是权限隔离或秘密保护机制。
Mira 保留既有可搜索 dotfile 行为，不移植上游额外的 `.env`、二进制候选/隐藏目录候选排除。
当前只接入实际工作区文件搜索，不宣称 Command Center 与 @ 文件候选也已接入。

Vue 选择器只接受数据库已有项目或个人会话工作区，无任意目录输入。
加载成功前禁编辑/保存；未编辑模板允许首次保存，已有文件只在修改后允许保存。
重读/切换工作区/受控路由离开对未保存修改显示放弃或继续编辑确认；失败保留草稿。
同步/保存期间禁止重复操作；晚到请求和卸载后的读取不应用到新工作区。
这是受控页面交互保护，不保证进程强退、force reload 或 OS 关闭时保存草稿。

## 安全边界

规则固定路径、有界 256 KiB UTF-8 handle 读取，拒绝 symlink/特殊文件，读取前后复核 root/file 身份。
首次初始化采用临时文件 + hard link no-replace，不能覆盖并发创建的规则文件。
保存按 root 串行、带 root/file/content revision 校验，临时文件 flush 后原子替换，保留原 mode。
IPC 仅顶层 renderer，通过 project/session ID 从数据库解析 root；排队及 commit 前再次检查授权。
保存与首次搜索初始化在所有 awaited revision/root 检查结束后，同步复核授权，紧接调用 rename/link，中间没有 await。
第一方搜索回调同时复核 grant、当前数据库会话目录和 sender 销毁状态。
数据库/文件系统异常按固定安全错误表脱敏，renderer 不能注入目标文件名、绝对路径或任意根。
只读/权限失败时搜索使用内存 `.gitignore`/默认模板；危险链接、特殊文件和错误编码不降级。

通用 Node/POSIX 没有跨进程 compare-and-rename CAS：最终检查到 rename 间的极窄外部修改竞争不能绝对排除。
root 被移走时可能在被移走目录留空临时文件；不会据此覆盖新 root 的规则。
hard link 不可用且不是权限错误时显式失败，不伪造初始化成功。

## 检查记录

- 12:27:26 首次合并定向：5 文件 / 152 项通过（随后补 warm-root 与卸载用例）。
- 12:31:46 全量：100 文件 / 1026 项，14.16s，两 workers，exit 0；React/Vue 类型通过。
- 首轮测试夹具失败：ESM 导出不能 spy、自动规则文件增加候选、绝对路径 fuzzy 导致额外匹配、旧 synthetic lstat 没有规则读取。
  修正真实模块 mock 与候选期望，65,000 候选/top1000/128 MiB 原覆盖保留；不称整批 red/green。
- 首轮 browser fixture 失败：缺少 bundled Chromium、IPv6/IPv4 URL不一致、middleware 位于 Vite SPA fallback 之后。
  改为已安装 Google Chrome 的独立 headless 进程并正确注册 middleware；不操作用户 Chrome/ZCode/Electron。
- **修复前历史全量**：12:38:20 开始，100 文件 / 1027 项，两 workers，15.51s，exit 0。该记录早于后续授权回归，不用于当前源码放行。
  服务规则 28 项、IPC 57 项、搜索集成 6 项、Vue 编辑器 8 项；既有文件服务 56 项保留。
- **修复前历史类型与构建**：React `tsc`、Vue `vue-tsc` exit 0；正式 React build（esbuild 856ms/Tailwind 321ms）和
  Electron/Vue 编译（66 main、8 preload、2447 renderer modules，renderer 6.62s）exit 0。
  保留 PURE 注释/静态动态图标导入警告；编译通过不等于已生成或验收安装包。
- **历史 12:38:55.569 产物审计观察**：287/287 JS SHA 一致，
  missing/mismatch/stale/orphan 0，239 动态目标齐全；9/9 许可文件和 NOTICE/HTML 与源一致。
  静态闭包 3 JS / 2,036,882B（逐文件 gzip9 合计 613,067B）；全部 JS 9,561,123B（gzip9 1,911,632B）；
  CSS 129,561B（gzip9 22,939B）。本次 React JS/CSS 字节与前批相同，不据此推算搜索或启动性能。
- [validation-summary.json](search-ignore-headless/validation-summary.json) 是主 agent 记录的命令观察摘要，不是原始 stdout 日志。

## 12:51 授权竞态修复与重新验证

12:39 原评审没有覆盖第二次授权检查后的 awaited 文件操作。独立服务复核发现：授权在 revision/root 校验期间撤销时，旧实现仍然 rename/link；操作后拒绝不能撤回已发生的写入。
这不是最终 syscall 的不可避免非 CAS 窗口，旧 `slice-pass` 不覆盖该新发现。

- **真实红测**：12:48:56 运行 `npx vitest run tests/harnessWorkspaceIgnore.test.ts -t 'rejects revocation during awaited commit checks' --maxWorkers=2`，exit 1，1 failed / 28 skipped；promise 成功返回 `replacement/` 而不是拒绝。
- **修复**：`atomicWrite` 在 `await beforeCommit()` / `await assertRoot(root)` 后同步调用独立 `assertAuthorized`，随即 link/rename；已有文件保存和两类初始化均传入该回调。
- **定向转绿**：12:49:40，5 文件 / 160 项，754ms，exit 0；原失败用例、模板首次保存、搜索初始化及规则/IPC/编辑器/文件服务共同通过。
- **平台绑定回归**：3 个真实 `files.search` 用例在初始化检查的 await 间隙撤销 grant、修改数据库项目目录或销毁 sender；两个隔离目录均无新规则/临时文件，原文件不变。平台整文件 30 项通过；没有 mock 搜索服务或文件系统，数据库/Electron 调用方仍是测试夹具。
- **最终全量**：12:51:08，`npx vitest run --maxWorkers=2`，100 文件 / 1035 项，13.69s，exit 0。规则 helper 31、搜索集成 8、ignore IPC 57、Vue 编辑器 8、既有文件服务 56、平台 IPC 30。
- **最终类型/构建**：React `tsc` / Vue `vue-tsc` exit 0；React build esbuild 286ms / Tailwind 106ms；Electron/Vue 编译 66 main / 8 preload / 2447 renderer modules，renderer 5.95s，exit 0。既有注释/动态图标警告保留，未生成安装包。
- **最终产物审计**：`2026-10-09T04:51:47.447Z`，[bundle-audit.json](search-ignore-headless/bundle-audit.json) 中 287/287 JS、239 动态目标、9/9 许可与 NOTICE/HTML 一致，无 missing/mismatch/stale。JS/CSS 字节与修复前相同，本轮没有 UI 源码修改，不据此宣称性能提升。
- **独立服务复核**：发现该 P2 的 reviewer 使用真实临时文件复验 existing-save/template-save/first-search，三项均在最终授权检查拒绝，旧内容保留、新文件不创建、临时文件清理；此结论关闭上述可收窄 await 缺口，不消除通用文件系统的最终非 CAS 竞争。

## 界面与隔离证据

[脚本](search-ignore-headless/mira-search-ignore-headless.mjs) 运行真实 Vue 页面/Element Plus/AppIcon/全局样式，
API fixture 调用真实 Electron 文件服务，但用隔离 HTTP 替代 preload/IPC，数据库目标只为临时项目。
最终 12:35:34.750，15 次请求/11 条记录，准确内容见 [results.json](search-ignore-headless/results.json)。
浅深色和 1440×900、1280×800、1710×992 共 7 张图，无水平溢出，pageErrors 为空。
首次浏览检查后本页补 `show-title=true`、局部错误对比度和 dispose guard；后续仅一次确认，不无限微调。
临时项目全部由脚本 finally 清理；用户项目和 `/tmp/mira-ui-project-smoke.md` 未改动。

| 状态 | 最终截图 |
| --- | --- |
| 浅色模板 | [1440](search-ignore-headless/light-template-1440.png) |
| 浅色保存失败 | [1440](search-ignore-headless/light-save-error-1440.png) |
| 深色外部冲突 | [1440](search-ignore-headless/dark-conflict-1440.png) |
| 深色读取失败 | [1440](search-ignore-headless/dark-load-error-1440.png) |
| 深色个人模板 | [1440](search-ignore-headless/dark-personal-template-1440.png)、[1280](search-ignore-headless/dark-personal-template-1280.png) |
| 浅色个人模板 | [1710](search-ignore-headless/light-personal-template-1710.png) |

限定评审：[finish-review.md](search-ignore-headless/finish-review.md)。12:39 界面/集成审查是历史批次；其后授权发现及独立服务复核已单独补记。7 图仍为 12:35 原采集，不冒充修复后原生 IPC 证据。
本批不替代原生 Electron grant/IPC、真实鼠标键盘、同态 ZCode、安装包、Windows、真实模型或冷启动性能验收。

## 2026-10-09 13:23 Proxy 修复与最终回归

真实 Electron 桥复现了 Vue 响应式对象传入 `contextBridge` 时的 `An object could not be cloned.`。
`useSearchIgnoreEditor.ts` 改用 `shallowRef`，加载时创建普通 `{ kind, id }` 快照，供初读、重读、转换和保存复用；选择器后续变化不能改写已保存目标。
新增回归实际执行 `structuredClone`，覆盖 reactive selection、四条调用路径及快照隔离。独立源码 reviewer 重跑 Vue 编辑器 9/9 通过；不编造未记录的 Proxy 单测红测。

- **实际 Electron 读取证据**：13:14:15 +08:00 的 [bridge-transport-results.json](search-ignore-native/bridge-transport-results.json) 来自隔离工作区 `/private/tmp/mira-native-ignore-aSLqrz/project`、编译后 `out/renderer/index.html` 与真实 preload/IPC。Proxy 明确拒绝，普通目标读取成功；textarea 已启用、与读取内容一致、alerts 为空。JSON 保存了当时 main/preload/renderer SHA-256。
- **证据限制**：上述 probe 使用 CDP 读取/调用 API，不包含真实点击、键盘、保存全流程或截图。它补足实际桥的读取验证，不代替原生鼠标/键盘、其他 grant 生命周期或 ZCode 同态验收。
- **锁屏阻断**：13:21:44 +08:00 运行原生 [smoke 脚本](search-ignore-native/mira-native-ignore-smoke.mjs)，[results.json](search-ignore-native/results.json) 的 `blockedBy=macOS-loginwindow`、records/captures 均为 0，exit 1。锁屏 guard 在夹具创建和任何输入之前退出；本轮没有用户可见操作或新截图，不能判作功能失败或通过。此前 focus guard 失败及 Proxy 修复前记录分别保留于该目录的历史 JSON。
- **最新全量**：13:21:45 开始，`npx vitest run --maxWorkers=2`，100 文件 / 1036 项，12.79s，exit 0。Vue 编辑器为 9 项，旧 1035/8 项是 Proxy 修复前历史。
- **最新类型**：`npx vue-tsc --noEmit` 和 `npx tsc --noEmit -p apps/harness-react/tsconfig.json` 均 exit 0。
- **最新构建**：`npm run harness:build` exit 0（esbuild 247ms、Tailwind 106ms）；`npx electron-vite build` exit 0（main 66/preload 8/renderer 2447 modules，renderer 5.40s）。既有 PURE 注释/图标导入警告保留；没有生成或验收安装包。
- **最新产物审计**：13:23:15 +08:00，[bundle-audit.json](search-ignore-headless/bundle-audit.json) 为 287/287 JS SHA 一致、239 动态目标完整、9/9 许可及 NOTICE/HTML 一致，无缺失/差异/旧块。静态闭包 3 JS / 2,036,882B（逐文件 gzip9 合计 613,067B），CSS 129,561B（gzip9 22,939B）；字节不变，不据此宣称性能提升。
- **差异检查**：`git diff --check` exit 0；文档同步后再检查一次。命令结果摘要见 [validation-summary.json](search-ignore-headless/validation-summary.json)，它仍是主 agent 的观察记录，不冒充原始 stdout。

## 2026-10-09 13:32 文档收尾

两份 README、PRD、handoff、Stage1、交互规格、DESIGN、surface、下一能力审查及 sidecar 已同步 13:26 记录，主对齐页同步 13:27 记录。文档执行者检查 143 个本地链接/锚点无误，JSON/schema2/10 个静态组件与差异检查通过，未改变 tokens/HTML/CSS。
独立 reviewer 只读核对本批四份证据/原生交接文档及 JSON，另抽查全部上述最新段落：没有混淆 HTTP fixture、真实读取 probe 与原生输入范围，最新构建和保留探针时间明确，下一入口一致。四份证据内 26 个本地链接存在，三项 probe SHA 与重建产物一致；未重跑 probe、UI 或全量测试。
本次关闭的仅是 `documentation-pending` 门槛；`native-input-blocked`、同态 ZCode、发布/性能/P0–P3 与整体目标继续未放行。13:32 状态回填后主 agent 再执行 JSON 解析及 `git diff --check`。

## 剩余与下一入口

搜索 ignore 已实现。当前第一入口是解锁桌面后重启隔离 Electron，并执行本页原生配置/搜索/浏览有限验收；不因锁屏改变开发主线。
重启和检查步骤见 [原生交接](search-ignore-native/README.md)。需验证模板不落盘、真实编辑/保存、未保存离开确认、外部冲突/重读恢复、浅深色、React 浏览保留 node_modules 而搜索排除，并逐张核对截图和真实文件。
随后补旧监听错误态、图片/Git 同态对照。Git metadata watcher 仅是后续候选，先读 `harnessWorkspaceGit.ts` / `harnessWorkspaceWatch.ts` 的 root、metadata、grant 生命周期，再给出最小监听设计与单独验收，不把已有文件 watch 当成 metadata watcher。
媒体 lease/Range、高亮 Worker/profile、可靠进程冷启动与正式安装包/Windows/真实模型及 P0–P3 仍独立推进。
未提交、未推送，整体目标不标 complete。
