# Mira 文件树 Git 状态证据

日期：2026-10-09，Asia/Shanghai。实现、自动检查和 headless React 验证已完成；独立 finish review 的文档 P2 已修复并复核，限定 ship 仅覆盖本批只读 Git 装饰源码/headless 与文档修正。原生 Electron/ZCode 同态比较未完成，整体目标仍 active；未提交、未推送。

本页是本批最新检查索引；[图片批](./IMAGE_PREVIEW_EVIDENCE.md) 与 [监听/编辑器批](./WATCH_EDITORS_EVIDENCE.md) 保留原日期、数字及限定评审，不被本页覆盖。

## 完成

- `files.git-status({ sessionId })` 与 `files.git-ignored({ sessionId, paths })` 通过现有第一方授权桥执行。renderer 不传 root、命令、Git 参数或环境；持久化会话决定目录，异步完成后再次核对 grant 与目录。
- 宿主异步 `execFile`，无 shell、不读未跟踪内容、不执行 Git 写操作。porcelain v1 与 check-ignore 使用 NUL 分隔，真实 Unicode/换行/前导 `-` 文件名、重命名和冲突都有回归；冲突显示 M。
- 根目录、父仓库与 `.git` 元数据身份在返回前复核；拒绝 `.git` 符号链接，支持 linked-worktree 的普通 gitfile。非仓库期间新增/移除 `.git`、nested repo 请求期间出现与继承 discovery 范围变量均先红后绿。
- 全局最多 2 个在途 Git 命令、16 个等待命令；每命令 10 秒后 SIGKILL，stdout/stderr 各 8 MiB 上限，进程和输出关闭后才释放槽位。宿主不是 same-root singleflight。
- 文件名称与 M/A/D/R/U 字母使用既有 Git token；目录可有直接字母，并用单个 6px、60% 颜色的点汇总后代状态。按实际源码目录优先 M，其余 A/D/R/U 同级稳定排序；ignored 只装饰精确行，不向祖先聚合。删除路径只进入摘要，不创造不存在的文件行。
- React 状态和 ignored 各单在途，刷新合并、可见行精确查询最多 512 项/批，正负缓存；滚动不轮询 status。会话/root/销毁及 StrictMode 旧结果受代际保护。刷新队列微任务收尾竞态有回归。
- 初次、手动刷新和既有工作目录通知更新状态；普通非仓库无错误。失败清旧装饰，安全错误与专用图标重试可见；既有搜索、选中、展开、焦点、只读页签和文本附件边界不变。

**未实现 Git 元数据 watcher。** 外部 `git add/commit` 只改变 index/HEAD 时不会自动刷新，用户可手动刷新。既有文件 watcher 是 root/显示目录的非递归订阅，不等同于 ZCode 的 git-dir/common-dir 监听；Git stage、commit、diff IDE 和配置 ignore 入口不在本批。

## 自动检查

时间均为上海时间；日志 mtime 只表明完成观察，不是性能样本。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| `npm test -- --maxWorkers=2` | 11:05:34 开始，14.45s；96 文件 / 909 项通过 | tests.log（历史原始日志已清理） |
| React `tsc --noEmit` | exit 0，日志 mtime 11:04:20 | react-typecheck.log（历史原始日志已清理） |
| Vue `vue-tsc --noEmit` | exit 0，日志 mtime 11:04:55 | vue-typecheck.log（历史原始日志已清理） |
| React 正式构建 | exit 0，最新构建日志 mtime 11:06:59 | react-build.log（历史原始日志已清理） |
| `electron-vite build` | exit 0，日志 mtime 11:05:42；不是安装包验收 | electron-build.log（历史原始日志已清理） |
| `git diff --check` | exit 0；文档收尾后另复核 | diff-check.log（历史原始日志已清理） |
| 内存构建与磁盘审计 | 11:08:39，287 JS SHA 匹配，无缺失/陈旧/孤立产物，239 动态目标完整 | [bundle-audit.json](./git-overlay-headless/bundle-audit.json) |
| 许可、HTML 与截图记录 | 11:13:47，7/7 声明、NOTICE/HTML 一致，10 项 SHA 清单 | [产物审计](./git-overlay-headless/bundle-audit.json)、[SHA 清单](./git-overlay-headless/sha256-manifest.json)；重复摘要于 2026-10-10 清理 |

宿主独立 Git 服务 24 项、桥/IPC/host 135 项、drawer/Git/tree/search 64 项定向通过，均已包含于上述全量数字，不相加。默认并发高亮超时历史仍保留，不把受限两 workers 通过写成默认全量通过。

11:25 收尾仅增强隐藏文件/普通 gitfile 浏览回归，未改运行源码、UI、产物或七图；定向 1 文件/56 项与全量 96 文件/910 项通过，原始 909 日志不覆盖。既有 10 项 SHA manifest 内容与字节数只读复核一致，具体命令与时间见 [收尾检查](./git-overlay-headless/closeout-check.md)。

| 产物范围 | 文件数 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| React 入口静态 JS 闭包 | 3 | 2,034,793 | 612,545 |
| 全部 React JS | 287 | 9,559,034 | 1,911,110 |
| React CSS | 1 | 129,455 | 22,916 |

CSS SHA-256：`b066218a995a9219c643bfbe5b1fb1440106632004ee40289e1f62a334be831f`。字节和 gzip 是产物口径，不证明启动、菜单、输入延迟或持续内存改善。

## Headless 页面验证

最终有效采集 11:10:42–46，Chrome `154.0.8037.99`；1440×900、1710×992、1280×800，deviceScaleFactor 1，exit 0。使用实际生产 workbench、FirstPartyHarnessHost/MessageChannel、真实 firstPartyBridge/parser 和真实隔离 Git 仓库/服务。会话与偏好为夹具，grant/IPC 链单测覆盖；watch 是显式协议事件，不冒充原生 fs.watch。没有桌面鼠标键盘操作、Vue Shell 或设置验收。

机器记录：[results.json](./git-overlay-headless/results.json)，完整日志（历史原始日志已清理）。

- M/A/R/U 字母和名称、deleted 后代点、ignored 目录/文件精确灰色、ignored 不染祖先均实际呈现。删除文件无伪造行，28px 行高、10px 字母栏保持稳定。
- 720 文件目录滚动时挂载 53 行，status 调用不增加；实际 ignored 最大批为 52，512 上限由回归覆盖。
- 夹具在外部 stage/commit 后刻意确认无自动 metadata 请求，再点击刷新，搜索 `src/modified` 与选中保留、干净文件移除标记。随后真实写文件并注入 workspace event，M 恢复。
- 注入安全 timeout 经真实桥显示浅深色错误，专用 retry 恢复；普通非仓库无 alert，故意挂起旧会话 status 后切换，迟到结果未污染新会话。
- 七图均双 rAF + 250ms 稳定捕获，主题像素与错误正文断言后逐张打开，无空白、错主题或文字控件重叠；1710/1280 是滚动后窗口布局确认，不是全状态对照。`pageErrors=[]`。

| 图 | 内容 |
| --- | --- |
| [浅色](./git-overlay-headless/mira-git-light.png) | M/A/R/U、deleted 目录点、ignored 行与完整预览 |
| [深色](./git-overlay-headless/mira-git-dark.png) | 同态深色树与预览 |
| [浅色失败](./git-overlay-headless/mira-git-light-error.png) | timeout、无旧装饰、专用 retry |
| [深色失败](./git-overlay-headless/mira-git-dark-error.png) | 同错误深色主题 |
| [非仓库](./git-overlay-headless/mira-git-nonrepo.png) | 新会话普通文件，无旧 Git 标记和 alert |
| [1710 桌面](./git-overlay-headless/mira-git-desktop-1710.png) | 滚动后布局与 264px 侧栏 |
| [1280 桌面](./git-overlay-headless/mira-git-desktop-1280.png) | 较小桌面窗口，无横向溢出 |

[SHA 清单](./git-overlay-headless/sha256-manifest.json) 固定当前七图、结果和两本机脚本。早期夹具 session.get 使用错误字段与重复 aside locator 的错误已修正，其旧 JSON/日志中间产物已清理；监听补读未等待、虚拟树点击改变选择的两批失效截图已清理。这些夹具失败不列为有效全流程验收，也未据此修改产品代码。2026-10-10 清理已被最终多视口结果覆盖的早期单视口 JSON/日志，最终结果及七图保留。

## 独立评审

一次历史样式诊断仅报告既有 4px/5px 局部半径的 advisory；这些不由新增 Git 装饰引入，未改全局尺度。该重复调试输出于 2026-10-10 清理，本段保留观察摘要。独立 fresh reviewer 逐张打开七图，未发现本批源码或视觉 required fix；初次结论为 fix，仅因 DESIGN/surface/sidecar 仍将 Git 写成未实现。

这些当前入口已同步。原 reviewer 仅对该 P2 追加复核：resolved、未观察到此次文档修正引入回归、remaining clear for scored finding、disposition ship。原 fix 历史与新 Verdict/Remaining 保留于 [finish-review.md](./git-overlay-headless/finish-review.md)，没有再次运行 detector、复拍或重建。此 ship 严格限定本批只读 Git 装饰的源码/headless 证据及文档修正，不代表原生 Electron/Vue、ZCode 同态对比、安装包、Windows、性能或整体发布通过。

## 下一入口

1. 桌面可用且用户允许时，先确认真实 PID/正式入口/加载版本，完成上轮监听/编辑器错误态确认和图片/Git 的 ZCode 同态比较；旧截图与 headless 不能替代。
2. Git 后续可单独接真实 git-dir/common-dir 元数据监听，覆盖 linked-worktree、index/HEAD/refs、撤销/切项目/资源释放。不把工作目录监听扩大成全树递归。
3. 音视频 Range/媒体授权与高亮 Worker/profile 的只读建议见 [后续能力审查](./NEXT_CAPABILITY_AUDIT_2026-10-09.md)，本批未实施。
4. 文件树后续先补上游删除虚拟行与只看变更筛选，再独立接搜索 ignore 配置。已核对 `.git` 浏览可见性不是上游偏差：搜索 ignore 不影响浏览，Git ignored 仅装饰行；源码依据和验收建议见 [规则核对](./NEXT_CAPABILITY_AUDIT_2026-10-09.md#文件树浏览与搜索规则核对)。本批不声称这些后续能力已实现。

原生、Windows、正式安装包、真实模型、Novel Studio/分发、BrowserView/CDP 与整体 P0–P3 未验收；`9→0` 未归因，强制重载/退出不保证异步保存。整体目标保持 active。

## 本机复现

[headless 脚本](./git-overlay-headless/mira-file-git-headless.mjs) 和 [证据审计脚本](./git-overlay-headless/mira-evidence-audit.mjs) 使用本机绝对仓库、Chrome、Codex runtime 路径，不是通用 CI。headless 创建并仅清理自己的 mkdtemp 仓库，关闭自己的浏览器/HTTP 服务；不读取真实数据库，不操作前景窗口。重新运行会覆盖同名证据，应使用新的归档目录。
