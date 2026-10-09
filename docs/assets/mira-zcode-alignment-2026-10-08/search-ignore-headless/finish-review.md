# 文件搜索忽略规则与设置页终审

> 更新于 2026-10-09 13:32 +08:00：下列 12:39 审查保留为历史，不作为后续授权/Proxy 改动的独立放行。新发现的 P2、修复及真实服务/桥证据见文末；文档当前口径独立抽查通过，前景原生验收被锁屏阻断，整体目标未放行。

- 复核时间：2026-10-09 12:39 +08:00。
- 仓库：`/Volumes/VrenDisk/project/Mira/Mira-Harness`。
- 分支：`codex/mira-harness-first-slice`。
- 本次范围：搜索规则加载/缓存接入、三条设置 IPC、Vue 编辑状态、设置页桌面浅深色和当前 headless 工作流。
- 本次审查只新增本文，没有修改源码、运行大型测试或采用上一批通过结论。
- 结论：`slice-pass; documentation-pending; native-pending; overall-goal-active`。当前范围没有未解决的可复现 P0/P1/P2 问题，不放行整体产品或原生发布。

## 独立性与验证来源

本 reviewer 此前实施了 `electron/services/harnessWorkspaceIgnore.ts` 与对应 28 项测试；因此不将这两份文件的复核称为第二人独立源码审查。其定向 28 项测试和独立 strict TypeScript 检查在 12:27 通过。

本次独立审查针对主 agent 的 search 集成、IPC、Vue 状态/页面、对应测试及 headless 脚本/JSON/PNG。检查了 6 项 search 集成测试、8 项 editor 测试、IPC 用例和服务 28 项测试的当前断言；未在本轮重复执行这些测试。全量测试和项目类型/构建验证由主 agent 单独报告，本文不把检查测试源码等同于执行结果。

阶段 PRD、交接、性能、许可清单及其他规划文档的同步不属于这次终审范围，故保持 `documentation-pending`，不能用本文替代文档一致性检查。

## 源码复核

- 正常读取时，业务排除规则由根目录 `.miraignore` 提供；空文件确实放开默认目录。根目录 `.gitignore` 只提供首次模板或显式同步的内容，不是持续叠加的隐藏规则。根 `.miraignore` 控制文件自身不进入搜索候选。
- 成熟 `ignore@7.0.5` 负责 gitignore 语义。目录先匹配再入扫描队列，排除目录不会被读取；不修改文件浏览、预览、上传或 Agent 授权。
- fingerprint 绑定根 `dev:ino`、文件版本与正文哈希；缓存/在途扫描 identity 使用根身份和 fingerprint。新规则扫描替换旧在途记录后，旧结果不能重新填充当前缓存。已有 top1000、TTL、LRU、缓存估算预算和让出事件循环策略保持。
- 新增最终 `realpath(workspacePath)` 与 `dev:ino` 检查覆盖 warm cache，不仅依赖完整扫描末尾检查。两个真实临时目录用例在评分让出阶段分别替换别名/根目录，要求原请求失败；此前指出的缓存根校验缺口已闭环。
- 规则读限于固定根文件、256 KiB、有效 UTF-8；检查 regular file，使用不跟随链接与非阻塞打开、前后 stat/根身份验证。首次搜索初始化采用独占临时文件和 hard-link no-replace，外部同时创建规则不会被覆盖；权限失败仅使用内存模板，危险链接/格式/大小错误不做权限降级。
- 保存按根串行，revision 绑定根身份，排队后与提交前复核授权/版本；临时写入 sync/close 后原子提交，保留现有普通权限位。正文为空也需要有效 revision，正常提交失败保留旧文件并清理临时文件。
- 同步和默认恢复变换调用方当前草稿；未变化的默认/自定义分区保留原始内容。标记缺失、重复或顺序错误明确失败，未以整体重建丢弃自定义规则。
- IPC 仅接收 project/session ID，不采纳调用方路径；数据库解析当前根。顶层宿主 frame、销毁状态与目标配置在操作前后复核，保存回调覆盖排队和提交前；错误仅保留共享白名单。
- Vue 只有加载成功才允许保存；template 可以直接创建。save/transform 忙态阻止重复提交，失败保留草稿与 revision；epoch 抑制旧工作区/卸载后的结果。新增 active guard 阻止组件卸载后由晚到工作区列表触发新的 load。
- 页面切换工作区、重读和路由离开先确认未保存修改；加载失败输入/保存禁用而重读可用。`show-title=true` 只影响本页，错误 `color-mix` 也局限于本页，没有改动全局设置样式。

## 当前 Headless 证据

只使用本目录当前 `results.json`，时间为 `2026-10-09T04:35:34.750Z`，`passed=true`、`requests=15`、`pageErrors=[]`。这 15 次是浏览器夹具 API 请求，不是原生 Electron IPC 请求。

检查脚本后确认：它渲染当前 Vue 页面、真实 SettingsPageShell/Element Plus/样式；以临时 project 和 personal 目录调用隔离打包的真实 ignore/files helper；`window.platform`、项目/会话列表、API 传输及一次权限故障为夹具。没有连接用户数据库或真实宿主授权。

当前断言覆盖：template 读取不写文件、保存创建、搜索排除但浏览/预览保持可访问、未保存同步/恢复只改草稿、保存后缓存失效、取消路由离开、撤销、保存失败保留并重试、外部修改冲突保护、重新载入确认、个人目录隔离、加载失败禁编辑并重试、缺失标记保留草稿及确认离开。

七个截图记录均无 document/main 横向溢出，编辑区固定约 824x330 px，12px/20px 等宽文本，7 个操作图标有实际渲染。按记录的计算样式计算，错误文字对比度浅色约 5.65:1、深色约 5.59:1；这是当前错误文字的检查，不是整页全部可访问性审计。

## 逐张视觉检查

下列七张 PNG 均在本次实际单独打开检查，没有使用拼图、失败运行或上一批截图替代。

| 截图 | 检查结果 |
| --- | --- |
| `light-template-1440.png` | 标题与工作区层级可见；模板可编辑、状态为尚未创建，保存可用且撤销禁用；操作区完整。 |
| `light-save-error-1440.png` | 未保存草稿仍在编辑区；权限错误单独成行、未遮挡按钮；保存重试和撤销均可辨识。 |
| `dark-conflict-1440.png` | 深色编辑区保留本地修改，版本冲突文字可读；未保存状态与恢复入口完整，无浅色残留。 |
| `dark-load-error-1440.png` | 个人工作区身份明确；空输入与保存禁用、重新读取可用，错误与操作区无重叠。 |
| `dark-personal-template-1440.png` | 个人模板与项目草稿隔离，默认规则等宽排列；标题、状态及保存位置稳定。 |
| `dark-personal-template-1280.png` | 1280x800 桌面下标题、路径、工具栏、编辑区和底部按钮均在视口内，无新增遮挡或横向溢出。 |
| `light-personal-template-1710.png` | 1710x992 桌面下内容保持约束宽度，未拉伸工具控件；模板、状态和动作区完整。 |

## 上游事实与有意差异

本地 ZCode 的 `settingsNavigation.ts` 把 `workspaceFileSearch` 列入隐藏集合；配置过滤、SettingsPage 首次落点、跳转及后续回落都使用此限制，因此正常入口与深链不能打开该编辑器。保留源码不等于原生产品当前可用入口；Mira 本次主动提供了可见设置入口，不能宣称视觉逐像素复刻该隐藏页面。

默认目录清单沿用上游，没有新增 `.venv/`。ZCode 另有永久的 `.env`/部分二进制文件过滤，以及隐藏目录不占候选但继续遍历的处理；Mira 保留既有 dotfile/隐藏目录候选行为，未擅自加这组文件黑名单。正常规则内容源与这些候选策略不能混为一谈。

## 证据身份

```text
637e795d036e213368e902d0063695afb431e41b9b04e297db2b1d51daefd7cc  results.json
2ca8b5e8f4bd4106745ab3cb17e0c86aaff4bca28c078fdac6f67d934c6d5fb6  light-template-1440.png
17716b7323b67f616b3e4d29e2ee146f1b6e219c56ec7d76db70ec3636521d1c  light-save-error-1440.png
3c08c2ded40a7c803475aea61d5b8c3249e971002f2430fda22bb92629983ac3  dark-conflict-1440.png
4b152adb40ebcdfcc91f4a47c0fb27567da123098b1d8c7a0ac31c99818eba2f  dark-load-error-1440.png
5c71a4109f58ad8e1f9f05bb08849b7b55d19c9a11b708e40fa21098f6da1806  dark-personal-template-1440.png
afabc424ea466d9b4c29e90ccb2b1c3deed8f82d1d96c201a9402702d55731fc  dark-personal-template-1280.png
0793e9e7963c2b18bdf784be880e4d0d1f6bd140015b616e2540de58adeba314  light-personal-template-1710.png
```

## 边界

首次初始化具有 no-replace 保障；已有文件保存的版本检查仍不是跨进程原子 compare-and-swap，最后校验至 rename 间有极窄的外部并发窗口。工作目录在准备期间被移动时会拒绝提交，可能在旧目录留下临时文件；不承诺 adversarial 目录替换下的临时文件零残留。Windows 文件系统/link/rename 权限行为未经原生验证。

当前证据不包含前景 computer use、原生 Electron IPC/Vue 桌面设置、同态 ZCode 软件对比、安装包、Windows、真实模型或冷启动/性能上限验收。没有复跑历史搜索性能样本，不能把旧样本套到本批规则加载上。

以上为 12:39 当时的 source/headless 结论，其后授权改动不由该结论覆盖。本文不授予整体 ship，也不声称功能或性能无法继续改进。

## 2026-10-09 12:52 授权缺口独立复核补记

独立 reviewer `git_filter_docs`（非规则服务作者）发现并复现 P2：第二次授权检查后仍等待 revision/root 文件操作，授权在 await 期间撤销后会写入旧目录。12:48:56 主 agent 在原实现执行真实文件回归，1 failed / 28 skipped，返回 replacement 而非拒绝。该发现否定了旧结论对这条服务写入路径的覆盖。

修复后的 `atomicWrite` 在所有 awaited commit 校验结束后同步执行独立授权回调，然后立即调用 link/rename，二者之间无 await。保存及搜索首次初始化均传入；第一方 callback 复核 grant、数据库目录与 sender 状态。

同一独立 reviewer 以 esbuild 内存载入真实服务、创建真实隔离目录，复验已有文件保存、模板保存和首次搜索初始化。三项均在最终授权检查拒绝；已有文件保持 original，后两项不创建 `.miraignore`，无 `.tmp` 残留。此项是第二人服务复核，不与上述服务作者的自审混同。

另一 reviewer 在实际平台 handler 到真实文件服务之间补 3 项回归：初始化检查的 await 间隙撤销 grant、改变数据库项目目录或标记 sender destroyed。没有 mock 文件系统/服务；两个隔离目录保持 needle 内容、无规则或临时文件。数据库/Electron sender 为夹具，故仍不属于原生验收。

主 agent 重新执行 100 文件 / 1035 项全量、React/Vue 类型、React/Electron 构建及产物审计，具体命令数字集中于 [SEARCH_IGNORE_EVIDENCE.md](../SEARCH_IGNORE_EVIDENCE.md) 和观察摘要。P2 的可收窄 await 缺口已关闭；最终 syscall/root 替换的非 CAS 边界仍保留。7 张 UI 图没有重拍，视觉证据身份/范围保持原记录。

当前结论：`authorization-gap-fixed; independent-service-review-pass; documentation-pending; native-pending; overall-goal-active`。文档一致性完成后单独更新文档门槛，不借局部检查关闭整个 ZCode 对齐目标。

## 2026-10-09 13:23 Vue Proxy 与实际 Electron 桥补记

本节由主 agent 追加事实与验证边界，不冒充上面的 reviewer 重新执行了原生全流程。

设置页的 reactive 工作区对象跨 `contextBridge` 会抛 `An object could not be cloned.`；`useSearchIgnoreEditor` 现在用 `shallowRef` 保存加载时的普通 `{ kind, id }` 快照。回归覆盖初读、重读、两个转换和保存中的 `structuredClone`，以及选择器变更不会污染快照。另一独立源码 reviewer 复核此修改并重跑编辑器 9/9 通过，没有修改文件或操作 UI。

[实际桥 probe](../search-ignore-native/bridge-transport-results.json) 于 13:14:15 +08:00 记录真实编译后 Electron renderer/preload/contextBridge 和读取 IPC：Proxy 拒绝、普通对象成功、真实 textarea 启用且与返回内容一致，无 alert。CDP 调用 API 和读取 DOM 不等于真实鼠标/键盘/截图或完整保存流程。

13:21:44 原生脚本重新尝试，[锁屏记录](../search-ignore-native/results.json) 在任何夹具创建和输入之前以 `macOS-loginwindow` 阻断，零 action、零 capture；exit 1 是环境阻断，不是界面功能失败。旧 focus/Proxy 失败留作历史，没有生成有效原生截图。

主 agent 最新全量为 100 文件 / 1036 项（13:21:45，12.79s）；React/Vue 类型、React/Electron 构建、287 JS/239 动态目标/9 许可审计和差异检查通过。数字只集中于 [SEARCH_IGNORE_EVIDENCE.md](../SEARCH_IGNORE_EVIDENCE.md)，旧 1035 项及 headless 七图保持原采集范围。初步文档边界已补，本批文档一致性仍待独立核对。

当前结论：`authorization-gap-fixed; proxy-transport-fixed; independent-source-review-pass; actual-read-bridge-probe-pass; documentation-pending; native-input-blocked; overall-goal-active`。
下一入口为解锁后按 [原生交接](../search-ignore-native/README.md) 重启隔离 Electron，完成配置/搜索/浏览有限流程；metadata watcher 仅是后续候选，不因锁屏改主线。

## 2026-10-09 13:32 文档门槛更新

独立 reviewer 对四份证据/原生交接材料、JSON 及 13:26/13:27 阶段文档最新段落完成只读一致性复核，无新增阻断发现。时间、数字、构建/探针身份与锁屏零操作记录一致；26 个本地证据引用有效。文档执行者另检查九份归属文档的 143 个链接/锚点及 sidecar 结构通过。没有重读全历史、运行 UI/测试或修改源码。

据此仅将当前文档门槛更新为 `documentation-pass`：`authorization-gap-fixed; proxy-transport-fixed; independent-source-review-pass; retained-actual-read-bridge-probe-pass; documentation-pass; native-input-blocked; overall-goal-active`。
这不改变七图的 HTTP fixture 身份，也不放行原生保存/鼠标/键盘、同态 ZCode、安装包、Windows、真实模型、性能或整体目标。
