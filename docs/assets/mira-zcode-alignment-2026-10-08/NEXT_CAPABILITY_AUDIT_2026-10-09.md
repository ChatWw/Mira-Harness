# Mira 后续能力只读审查

日期：2026-10-09，Asia/Shanghai；14:48 更新。范围：历史源码/Node 诊断与后续能力入口。删除/筛选、搜索 ignore/Vue 设置和生产高亮 Worker 已接入，有限设置/搜索/浏览原生验收通过；metadata watcher、媒体 lease/Range 与代码块 DOM/profile 仍独立推进。准确结果分别见 [搜索证据](./SEARCH_IGNORE_EVIDENCE.md) 和 [Worker 证据](./HIGHLIGHT_WORKER_EVIDENCE.md)，旧数字/verdict 保留历史；本页不授予完整原生或整体发布放行。

## 音视频预览

ZCode `packages/ui/src/previewPaneMediaContent.tsx` 使用原生 video/audio controls、`preload=metadata`、无 autoplay，容器 24px 留白，视频限制到面板，音频最大 672px。Desktop 主要由 `packages/desktop/src/main/localMediaPreviewProtocol.ts` 注册 privileged standard/secure/stream scheme 和 `registerFileProtocol`，交 Chromium 原生 file loader 处理 Range/seek。源码特别指出尾部 moov MP4 需要正确的标准 URL/流读取，手工 Response 不等价。

`packages/services/src/media-preview/mediaPreview.ts` 的 8MiB inline 是后备路径，不是 Desktop 主路径。上游授权表按 canonical 路径做 30 分钟 TTL / 256 LRU，与 Mira 的 grant/session/window 生命周期不同，不能直接照搬授权假设。

Mira `electron/adapters/localMicroAppServer.ts` 的当前静态 GET/HEAD 不提供媒体 Range；**不能把用户 workspace 挂成新的静态资源根**。媒体能力的独立 slice 建议为受控媒体 lease：以 session + 相对路径准备/释放；opaque token 对应宿主 canonical file，逐请求检查 grant/root/文件身份，撤销、会话换 root、窗口销毁时关闭活动流。具体选择 Electron scheme 还是 loopback Range 服务，应先在实际隔离 iframe 验证 Chromium 可播/可 seek，再确定，不据上游平台直接假设 Mira 等价。

验收需真实大于 8MiB 媒体、tail-moov MP4、HEAD/206/416、分段 seek、backpressure、删除/替换/授权撤销/隐藏恢复、codec 错误、无路径/凭据泄漏与原生浅深色。Office 未包含在此方案，也尚未实现。

## 高亮性能：10:49 历史诊断

当时源码事实：`code-highlighter.ts` 的 Promise continuation 内完整同步执行 `codeToTokens`；异步 API 不等于让出主线程。`file-preview-highlighter.ts` 在每行完成后按 8ms 预算让出，无法中断首次 grammar/regex 编译或单行 tokenizer。后续同日已迁移 WASM Worker，下列诊断不描述当前执行位置。

独立只读审查在 10:49:59（Node 24.7.0、esbuild `write:false` 载入当前 TS）报告下列单样本；原始诊断输出未在本批证据目录保存，故仅作定位线索，不据此回填浏览器 Long Tasks 或性能门槛。

| 输入/范围 | 完成耗时 ms | 5ms timer 最大间隔 ms |
| --- | ---: | ---: |
| 首次两行 TypeScript | 116.91 | 121.53 |
| 同 grammar 暖态 | 0.96 | 5.73 |
| 8001 行合作分块文件 | 655.03 | 22.85 |
| 94,918 字符单行 TS | 1009.55 | 1014.14 |
| 16 次同时增长 64→1024 行快照 | 511.67 | 515.33 |

审查另外报告暖态 batch 16/32/64 的 8001 行约 499/495/487ms，TS/Vue/Python/Shell/Markdown/JSON/CRLF Unicode 七夹具 token 等价。批量参数只能减少调用开销，不解决首次/单行阻塞，本批不为得到更好数字重新采样或改参数。

当时建议先区分初始化、grammar load/compile、tokenize、暖缓存与输入响应，再实现 opaque iframe 的 Worker。生产实现现已覆盖流式/完成态/文件预览，保留语言、跨行状态、双主题、取消/迟到保护和有界缓存，不以删语言、截断或纯文本长行回退获得性能结论，详见 [Worker 证据](./HIGHLIGHT_WORKER_EVIDENCE.md)。主线程 HTML/DOM 着色是新的独立瓶颈，不能把“有 Worker”写成全部性能已收敛。

既往原生 136/161ms long-task 记录保留；默认 8001 行 5 秒超时的完整当次日志未在这次审查定位，不能编造原因。最新两 workers 全量绿只证明限定并发回归，不消除上述边界。

## Git 元数据后续

ZCode `packages/services/src/git/repo/gitCliRepo.ts:142` 用 Git 自身解析 absolute git-dir/common-dir，单独输出元数据 watcher 边界；linked-worktree 的目录可能位于 workspace 外，不能猜 `.git` 路径。Linux 大树 recursive workspace watcher 被明确排除。

Mira 本轮已实现只读装饰与初次/手动/既有 workspace 事件刷新；未实现该 metadata 边界。搜索 ignore 有限原生验收已完成，下一入口回到旧错误态和图片/Git 同态对照，metadata watcher 是独立候选：用 Git 自身解析 canonical git-dir/common-dir，复核授权 root/repository/metadata 身份，以宿主内部监听对象绑定 renderer owner/grant/session/root，不把元数据绝对路径暴露成 renderer 任意监听 API。覆盖 index/HEAD/refs、linked-worktree 公共目录、原子替换/消失恢复、合并刷新与所有生命周期释放；已有 `harnessWorkspaceWatch.ts` 不等于该能力。

下次先读 `electron/services/harnessWorkspaceGit.ts`、`harnessWorkspaceWatch.ts` 和 `electron/ipc/platformIpc.ts` 的 root、metadata 与 grant 生命周期，形成最小协议/预算/错误态设计再实现。验收分别覆盖外部 add/commit/reset/branch 切换、普通仓库/linked-worktree、metadata 位于 root 外时的受控路径、grant 撤销/会话换 root/renderer 导航与销毁；不借旧文件 watch 或搜索 headless 宣称通过。媒体 lease/Range 与高亮 Worker/profile 独立推进，不和 watcher 合并成大批重构。

此页只是后续工作的证据与验收建议；整体目标仍 active，原生桌面可用性不由自动续作推断。

## 文件树浏览与搜索规则核对

2026-10-09 收尾核对，基于本地 ZCode 基线 `29628c9acdb81b703bbd4080c207a0e7ce5e276e` 源码，不是新增原生对照。

- **浏览**：`packages/ui/src/workspace-file-tree/useWorkspaceFileTreeData.ts:222` 调用 `readdir({ includeHidden: true })`，随后直接转换返回项。`packages/services/src/file/fileService.ts:371` 仅按 includeHidden 控制 dotfiles，不特判 `.git`。因此 Mira 浏览树里 `.git` 可见不是该基线的偏差，不据搜索默认规则隐藏它。Mira 保留 `.git/`、普通 gitfile、`.gitignore` 和 `.github`；授权路径边界不变。
- **搜索**：`packages/services/src/file/workspaceFileIgnore.ts:78` 明确规则只影响 @ 文件候选、Command Center 和文件树搜索，不影响浏览、上传或 Agent 文件访问。同日后续 Mira 已用成熟 `ignore` 7.0.5 接入 `.miraignore`：默认 `.git/`、依赖目录等排除，扫描入目录前剪枝；空规则可放开默认排除目录，根 `.miraignore` 不进入候选。规则缓存绑定 root `dev:ino`、文件版本/hash，每查询读规则，编辑/删除/重建失效，warm 返回复核 root。本批只覆盖实际工作区搜索，未覆盖 `@`/Command Center，不能称完整搜索能力无差距。
- **Git ignored**：只用于行装饰，不替代浏览或搜索过滤。精确查询与灰色装饰已实现；搜索规则/编辑入口由独立的 `.miraignore` 服务和 Vue 设置提供，不由 Git ignored 推断。
- **删除与筛选**：`packages/ui/src/workspace-file-tree/model.ts:166` 在已加载父目录下用 Git deleted 状态补齐不存在的文件行，未加载父目录会跳过；`WorkspaceFileTree.tsx:550` 阻止打开该删除行，`:693` 提供只看变更按钮。同日后续 Mira 已接入这两项：仅补已加载父目录、不造缺失祖先，树态保留变更祖先、搜索态仅直接非 ignored 状态，搜索不注入 deleted 名称。新批证据独立见 [GIT_FILTER_EVIDENCE.md](./GIT_FILTER_EVIDENCE.md)，旧 Git overlay 限定 ship 不覆盖它们。

**2026-10-09 上游动作纠正与后续入口**：此前“删除行禁加入对话”的建议不符合该上游。ZCode 保留复制与非位图 AddToChat，只禁打开/打开方式、拖拽和 Reveal；Mira 的删除行只选中，Open/打开方式与 editor 回调禁用，复制/非位图 chip 保留。加入不读取，实际发送仍由 Mira 宿主校验真实文件，缺失走既有错误恢复，不把 chip 当成文件已可读。参考 `WorkspaceFileTree.tsx:167,198,693` 与 `WorkspaceFileTreeRowView.tsx:136,229,334`。

Mira loading 保留最后成功 available/index、筛选、删除菜单与焦点，明确失败/非仓库及 session/root 变化重置；原三视口 headless/10 图与限定 slice-pass 属于 filter 历史，不放行后续搜索规则批次。

## 2026-10-09 搜索规则接入与下一入口

**完成**：首次非空搜索安全初始化 `.miraignore`，Vue `/settings/file-search` 读取缺失文件只给根 `.gitignore` seed + 默认段模板、不落盘。落盘后不自动同步；同步只替当前草稿 seed、恢复默认只替 defaults，保存才写入，缺失/重复标记明确报错且保留草稿，不照上游静默重建。Vue 仅选 DB 现有项目/个人会话工作区，无任意路径输入；加载门槛、模板首次保存/已有文件 dirty 保存、未保存确认、失败留草稿及晚到/卸载保护已接入。

**有意适配差异**：上游 3.14.3 的 `settingsNavigation.ts` 隐藏该 section，Mira 有意开放 Vue 平台设置入口，不称上游隐藏页原生逐像素验收。Mira 保留既有 dotfile/隐藏目录候选，不追加上游 `.env`/二进制/隐藏目录候选排除。matcher 不作用于浏览/预览/上传或 Agent 权限，非秘密/权限隔离，仅实际搜索接入，`@`/Command Center 仍未覆盖。

**检查边界（2026-10-09 13:26 +08:00）**：有界 UTF-8、拒链接/特殊文件、hard-link no-replace、root 串行/revision/mode/flush 与同步提交授权已接入。本次独立服务复现的 awaited 授权 P2 已修复并复验；它不解决通用 POSIX 最后检查至 syscall 的跨进程非 CAS/root 路径竞争，也不承诺 root 移走无临时文件残留。真实 Electron 随后发现的 Vue Proxy target 克隆 P2 已改为 `shallowRef` 与普通 `{ kind, id }` 请求快照，初读/重读/transform/save 不传 Proxy，回归与独立源码复核通过。最新全量/类型、React 与 Electron 重新构建/审计通过，JS/CSS 字节不变，准确数字与评审只看 [本批证据](./SEARCH_IGNORE_EVIDENCE.md)。7 张旧 headless 图未重拍，原 HTTP fixture 不含 preload/IPC；不改变其历史证据身份。

**真实桥与历史环境**：13:14:15 的 [bridge/DOM probe](./search-ignore-native/bridge-transport-results.json) 保留实际读取/CDP 身份，不是原生输入。13:21 锁屏阻断保持历史观察，其独立 JSON 未保留下来，当前 `results.json` 已是后续成功流程，不能用它回证锁屏。AX/CG/helper 可用，未解锁或使用 `DOM.click`。

**14:48 当前完成与下一次**：14:25–14:28 有限原生配置/搜索/浏览流程通过，27 条记录/3 张截图逐张确认，见 [原生交接](./search-ignore-native/README.md)；不重复实施。生产 Worker 也已实现。下一入口回到旧监听/编辑器错误态和图片/Git 同态 ZCode 对照，metadata watcher、媒体 lease/Range、代码块 DOM/profile、可靠冷启动及安装包/Windows/真实模型各自推进。原生截图发现用户正在 ZCode 输入草稿，已停止操作该窗口；新增观察图不算受控同态验收。整体 active，本轮没有执行提交或推送，不称功能或性能已无法改进。
