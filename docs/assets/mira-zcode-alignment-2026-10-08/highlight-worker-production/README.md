# Mira 生产高亮 Worker：实现、证据与续作

记录日期：2026-10-09；最近更新：15:08 +08:00。最终单worker103/1089、14:54Chrome、新CSS14:56颜色/15:04流式行为限定通过，旧69ms/1077非当前；前三默认/两workers失败保留、core15s/生产预算不抬。React55/109ms、文件页面72ms长任务未解决，DOM少不证明性能。下一步按最新反馈回看整体工作台/列核心交互剩余清单，不继续连续文件支线；旧文件/媒体/metadata/performance待办保留，整体/发布/P0–P3不放行。本次未提交/推送。

## 完成的实现

- 正式流式/完成态代码块和文件预览共用 Mira 高亮请求/缓存，tokenizer 在独立 `mira-code-highlight.worker` 中运行；`scripts/build-harness-react.mjs` 生成 app / Worker 双入口、共享 ESM chunks。没有主线程 tokenizer fallback。
- Shiki / engine 3.23.0 使用公共 API 的 Oniguruma WASM；逐行延续 grammar state，修正 token 全文 offset，移除不能跨线程克隆的 grammar state。`tokenizeTimeLimit:0` / `tokenizeMaxLineLength:0` 保证不因默认时间预算或行长阈值把测试单行截成部分高亮；保留全语言、别名、跨行语义、未知语言纯文本和 GitHub 浅深主题。
- 引擎迁移是针对完整语义作出的决定。比较对象是独立同版本、无预算 WASM whole-document reference，不是此前截断/不稳定的默认 JavaScript engine 输出；不能据旧截断输入宣称提速。
- 保留 `sandbox="allow-scripts allow-forms"`、effective origin `null`，classic Blob + 固定 ESM dynamic import loader；不增加 same-origin、不放宽 CORS/sandbox，不添加通用外部脚本入口。
- 请求 ID、取消/迟到保护、共享请求消费者、故障后重试和 dispose 释放已接入。启动超时 10s、请求超时 60s；client admission 最多 256 在途请求和 32,000,000 源码字符，取消响应前仍计预算。Worker 串行处理，队列取消移除对应项，active cancel 在行间 yield 后检查；单次 engine 的长单行不能中途打断。普通取消保留 warm owner，dispose / loader error / timeout 才停止 owner。
- LRU 缓存仍限制 128 项 / 1,000,000 个 key 字符，key 包含完整代码、归一化语言和主题。源码/key admission 限制不是 token 结果、engine 语法缓存、总内存或整机时延的硬上限。

代码入口：[core](../../../../apps/harness-react/src/lib/code-highlight-core.ts)、[client](../../../../apps/harness-react/src/lib/code-highlight-worker-client.ts)、[protocol](../../../../apps/harness-react/src/lib/code-highlight-protocol.ts)、[Worker](../../../../apps/harness-react/src/workers/mira-code-highlight.worker.ts)、[共享 highlighter](../../../../apps/harness-react/src/lib/code-highlighter.ts)、[文件 highlighter](../../../../apps/harness-react/src/lib/file-preview-highlighter.ts)。

### 后续行级颜色继承

14:40 的最小 renderer 改进只调整共享 HTML 输出，不修改 Worker tokens/offsets：完整且仅含浅/深颜色的 token 以每行最常见颜色对作继承，省去等色 token span；字体/背景/装饰仍保留独立 span，缺色/非 own theme color 保留原路径，源码与属性继续 escaping。新增 12 项回归；独立 5 文件 119/119 与 React 类型通过。

[颜色继承诊断](./mira-color-inheritance-results.json) / [runner](./mira-color-inheritance-audit.mjs) 已于 **14:56:40–14:57:30** 用当前CSS `776315833fb7a2cd4903c04db8cbe5d1580f361cf79121fa3b1e5e2bfedf05ea` 重跑：60组 completed/file/streaming、浅深/交换主题及多语言逐字符computed styles/full source/scrollWidth均相等；长行elements27303→14703。tokenizer仅在Node准备reference，Chrome用当前共享renderer/生产CSS；这是独立DOM样式等价，不是Worker/React scheduler/native/INP/总性能。改进前 [browser](./before-dom-inheritance-browser-results.json)、[validation](./before-dom-inheritance-validation-results.json)、[audit](./before-dom-inheritance-bundle-audit.json) / [浅色图](./before-dom-inheritance-light.png) 分开，旧69ms/1077不放行新renderer。

## 分层结果索引

| 证据 | 时间（+08:00） | 确认范围 | 不包含 |
| --- | --- | --- | --- |
| [validation-results.json](./validation-results.json) / [runner](./mira-verify.mjs) | 14:51:38–14:53:27 | `--maxWorkers=1`，103文件/1089测试、React/Vue类型、React/Electron编译、fresh audit/diff exit0，Vitest70.36s | 默认/两workers无条件绿、原生UI、安装包、Windows、模型/整体放行 |
| [bundle-audit.json](./bundle-audit.json) / [runner](./mira-bundle-audit.mjs) | 14:53:23–14:53:27 | 当前双入口/JS/新CSS/动态闭包/许可来源审计 | 运行时、语义、取消、性能或发布 |
| [mira-worker-browser-results.json](./mira-worker-browser-results.json) / [runner](./mira-worker-browser.mjs) | 14:54:12–14:54:57 | Chrome154.0.8037.99、opaque iframe、当前React/client/行级renderer + 精确生产Worker；完整digest及浅深逐字样式，reference仅fixture | preload/IPC、实体输入、原生窗口、安装包、INP/冷启动/ZCode GUI |
| [mira-streaming-regression-results.json](./mira-streaming-regression-results.json) / [runner](./mira-streaming-regression.mjs) | 15:04:34–15:04:39 | 当前CSS776...真实React + 延迟highlighter，公开ready/Text Range/继承色；13请求/geometry/复制/浅深/乱序/取消/卸载/重试/引用通过 | Worker性能/Electron/native/INP；14:59旧selector失败另存，不抹除 |
| [mira-electron-worker-results.json](./mira-electron-worker-results.json) / [runner](./mira-electron-worker.mjs) | 14:20:28–14:20:31 | Electron 43.3.0 / Chromium 150.0.7871.212 隐藏 renderer 的精确 Worker/资源/取消/dispose | 完整 Mira preload/IPC、可见原生应用、实体输入/截图、React 渲染/INP |
| [原生搜索 README](../search-ignore-native/README.md) / [results.json](../search-ignore-native/results.json) | 14:25:17–14:28:15 | 新隔离 home 的真实 Mira preload/IPC + 原生设置/搜索/浏览有限流程，27 records / 3 captures | Worker 原生性能、完整 ZCode/native 矩阵、图片/Git 对照 |

表中独立证据不相互补足为“整体通过”；例如隐藏 Electron Worker 不证明完整 preload/IPC，原生搜索不证明代码块实体输入响应。

## 最新 Chrome 单次指标

单位 ms，取一位小数。timer gap 是页面 5ms timer 的最大间隔，Long Tasks 只观测页面主线程，不计 Worker 内部 CPU 工作；均是单次样本，不作稳定分位数/跨环境性能门槛。

| 等价完整样本 | 独立主线程 WASM reference：总耗时 / timer gap / Long Task | 生产 Worker：总耗时 / timer gap / 页面 Long Task |
| --- | --- | --- |
| 单行 94,380 字符 / 2100 statements / 27,300 tokens | 5756.3 / 5756.6 / 5756 | 6063.8 / 24.5 / 无记录 |
| 文件 8001 行 / 104,000 tokens | 1285.2 / 1285.3 / 1285 | 2246.5 / 76.7 / 72 |
| 16 个增长快照 / 累计 8704 行与 113,152 tokens | 1352.5 / 1352.6 / 53、60、67、79、94、107、106、115、126、143、143、154 | 2220.4 / 11.4 / 无记录 |

三组完整 token/style digest 相等；另有 TypeScript、Vue、Python、shell、Markdown、JSON、带空格混合大小写 TS alias、JavaScript CRLF 和未知语言 9 fixture 相等，含跨行注释/字符串及浅深主题交换。资源全量保留与样本等价不代表所有 grammar / 输入已实测。

共享取消观察到一消费者 AbortError、另一消费者完成；unsupported theme 拒绝后重试成功、loader failure / 404 后旧 owner 终止并恢复；最新 streaming 内容未被旧响应覆盖。300 个完成代码围栏成功，文件 45 行虚拟挂载且最后 8001 行可见，传输结果 `hasGrammarState=false`。

真实React长行渲染总耗时 **6526.0ms**、最大timer gap **110.0ms**，仍记录 **55/109ms Long Tasks**；文件Worker请求页面阶段也有 **72ms** Long Task。21fixture input events保留 `Mira input stays live` 与最后标识符，浅深两种逐字样式相等；正式React统计14704元素，独立diagnostic14703元素（容器口径不同）。这不是实体输入/INP、零卡顿或计算更快证明，DOM减少不说明两批机器状态下总渲染提速。token clone/序列化、HTML/React/DOM仍为独立performance待办，机器load/外部CPU仅观察、未隔离证明根因。

### 浅深组件截图

截图fixture使用实际 `applyHostTheme/#root`，14:54已随新renderer/当前生成CSS完整重跑；旧只给 `#view` 设主题的白底fixture不作为当前深色图。两张1400×850画布的JSON记录SHA、计算样式/像素；与此前逐张复核的有效图SHA相同，不把组件图升级为原生整机验收：

- [浅色长行](./worker-long-line-light.png)：root背景 `rgb(248,248,248)`，高亮token仍27300；继承颜色后fixture styled-span计数14701，不等于删token。748色、141759非背景像素。
- [深色文件](./worker-file-dark.png)：root/行号栏背景 `rgb(22,22,22)`，正文 `rgb(245,245,246)`；701 色、53,103 非背景像素。

这是当前 React 组件 + 生产 CSS 的 isolated canvas，不是完整可见 Mira 原生工作台深色验收，也不是 ZCode 同态截图。

## 延迟呈现与隐藏 Electron

**最新15:04:34–15:04:39延迟highlighter回归**使用当前CSS776...，13请求、errors/unhandled为空，公开ready与首Text Range几何/行继承颜色：raw→ready的text inset/gutter/行几何不变、尾行完整；乱序前请求abort/最新可见、源码及尾换行精确复制；未闭合streaming在完成前可见/高亮；错误保留完整escaped source、retry新请求恢复、浅深/error/retry几何不变；卸载/过期取消无迟到alert；citation可点/未知引用plain，完成态失败/乱序/重试正确。修正只fixture，无后续生产源码修改，不计性能或native。

14:14旧CSS411...结果不能放行当前CSS；14:59新CSS首次因旧token-span selector等待30s失败，双主题颜色已可继承到 `.line`，修成公开ready/Text Range/继承色后单独重跑通过，failure保留。delayed/mock tokenizer不代替真实Worker/React性能或实体输入。

隐藏 Electron 使用临时隔离 userData，`show:false` / `nodeIntegration:false` / `contextIsolation:true` / `sandbox:true` / `webSecurity:true`，精确生产 Worker/chunks 与当前 client。94,380 字符单行输出 27,300 tokens，2100 个 const/export/identifier，fullSource/exactOffsets=true；2401ms、renderer timer gap 6.9ms，只测完成前 timer 代理，不测渲染/INP。pre-abort、active cancel、unsupported theme/retry、dispose/restart 通过，两 Worker owner 终止、Blob URLs 剩余 0，rendererFailures 为空。开发 CSP warning 如实保留，不是正式包 CSP 放行；临时目录已清理，sources 未改。

## 双入口产物与许可来源

fresh build 审计使用与生产相同参数 `write:false` 并比对磁盘 SHA：291/291 JS 一致，240 动态目标存在，missing/mismatch/stale/orphan 为 0。app / Worker 共享 chunks，以下静态行不能相加为新分发总量；gzip9 是逐文件估算求和，不是本地 HTTP 实际压缩传输。

| 范围 | JS 数 | 原始字节 | 逐文件 gzip9 合计 |
| --- | ---: | ---: | ---: |
| app 静态闭包 | 5 | 1,895,538 | 567,956 |
| Worker 静态闭包 | 4 | 135,242 | 43,339 |
| 全部 JS | 291 | 10,138,512 | 2,127,553 |
| CSS（非 JS） | 1 | 131,700 | 23,214 |

253个物理grammar inputs/contributions、235公开ID、97aliases、332keys，仅GitHub两主题；WASM/tokenizer仅Worker可达闭包、无app-root fallback/JS regex converter。CSS与fresh Tailwind file输出一致，13许可/NOTICE/HTML匹配。当前CSS SHA为 `776315833fb7a2cd4903c04db8cbe5d1580f361cf79121fa3b1e5e2bfedf05ea`；虽未修改CSS源码，生成产物已由旧411.../131492B变为当前776.../131700B，不能写产物字节不变，行为证据须关联新SHA。

生产 Worker SHA：`ff83414a4e4aef1d8a8290364b8d837b0096fedceda687a9e3a1d7d59863b63e`。源码/入口/所有资源 SHA 分别在 browser / Electron / audit / validation JSON，不用截图文件名推断资源身份。

新增与保留的许可证：

- [Shiki MIT](../../../../third-party-licenses/shiki/LICENSE-MIT)。
- [Microsoft binding MIT](../../../../third-party-licenses/oniguruma/LICENSE-MICROSOFT-MIT)。
- [native Oniguruma BSD-2 notices](../../../../third-party-licenses/oniguruma/NOTICES.txt)。
- [WASM 来源核对](../../../../third-party-licenses/oniguruma/README.md)：Shiki/engine 3.23.0 的 466,610-byte WASM 与 npm `vscode-oniguruma@1.7.0` tarball `package/release/onig.wasm` 的 SHA 均为 `fd885c2d12e5951e59d761ebd4a006e06254b1491fd6f530c92b69fb4d8d77d9`。

许可随生产资源发行；不是只注明 Shiki 就覆盖 native WASM。没有复制 ZCode tokenizer，使用 Shiki 公共 API，ZCode 的既有 UI 归属仍独立保留。

## 失败历史不覆盖

- 13:39 loader failure、13:41 module loader / token mismatch、13:44 无预算 JS reference 中断保留在 [原型 profile 目录](../highlight-worker-profile/) 和 [历史性能诊断](../../../MIRA_HARNESS_PERFORMANCE_2026-10-08.md#2026-10-09-高亮-worker-诊断)，不计生产通过。
- 14:10 [reference property-order failure](./initial-reference-property-order-failure.json)：fixture 序列化属性顺序造成 comparator mismatch，修正 stable reference 比较后复测；不是产品 tokens 截断，失败 JSON `passed=false` 保留。
- [citation 修复前 fixture](./mira-streaming-regression-before-citation-fix.json) 与最终 [呈现回归](./mira-streaming-regression-results.json) 分开，不能沿用修前状态。
- 14:15 [preload 路径证据错误](./initial-preload-path-evidence-failure.json)：runner 假定 `out/preload/index.js` 导致 ENOENT，重新采用实际产物路径；属于证据 runner，不是产品 Worker loader 缺陷。
- 14:17 [concurrent-save failure JSON](./concurrent-save-winner-test-failure.json) / [原始失败日志](./concurrent-save-winner-test-failure.log)：103文件中1fail、1074pass/1fail。root异步realpath/lstat后才入串行锁，测试错误固定首调用 `first/` 必胜；只修测试按唯一实际成功请求对照磁盘，增加两种受控入队次序。[回归JSON](./concurrent-save-regression-results.json)/[日志](./concurrent-save-regression.log)33/33、3相关用例10轮、原failure SHA未变，生产ignore不改；改进前1077和本次单worker1089通过都不抹掉失败。
- 新 renderer 的两次默认并发全量都 exit 1，不能标绿：14:41:02–14:41:33 [首轮 JSON](./dom-inheritance-first-validation-failure.json) / [日志](./dom-inheritance-first-test-failure.log) 的 FilePreview 8001 行完整性测试超过默认 5s；14:43:33–14:44:09 [第二轮 JSON](./dom-inheritance-second-validation-failure.json) / [日志](./dom-inheritance-second-test-failure.log) 的 core 94,380 字符完整语义测试超过既有 15s。只将 FilePreview 此完整性测试的等待上限显式设为 15s，不改生产请求/engine 预算；core 15s 不继续提高。后续受限 `--maxWorkers=2` 即使通过也不证明默认并发、CI 速度或这些历史性能风险彻底解决。
- 14:47:04–14:48:30 [两workers失败JSON](./dom-inheritance-two-worker-validation-failure.json) / [日志](./dom-inheritance-two-worker-test-failure.log)：1088/1089，core同一完整长行15s timeout，exit1 / elapsed85.85s。此批不再描述为“受限并发绿”；保留核心验收门槛，后续单worker只按自己的采集范围记结果。机器load约19.8/外部高CPU是观察，不等于已隔离根因。
- 14:50:10–14:50:44 [rendered-source fixture failure](./dom-inheritance-rendered-source-fixture-failure.json)：`Rendered source changed`断言失败，不用其85ms样本作为最终改善；最终14:54逐字源码/浅深样式另采集通过。逐字节相同的自动失败副本已清理。
- 14:59:26–14:59:58 [streaming fixture failure](./dom-inheritance-streaming-fixture-failure.json)：第94行旧token-span条件30s超时，`passed=false`；新renderer颜色继承在 `.line`，旧选择器假设失效。仅修公开ready/Text Range/继承色采样，15:04独立重跑通过，原失败保留。
- 13:21 锁屏、14:19 原生注入丢字符、14:24 旧 fixture 已有规则的失败保留在 [原生证据目录](../search-ignore-native/README.md)；新 home 的27 records/3 captures完整成功另记，不将失败改成成功。

审计中曾出现 Tailwind stdout 额外末尾 LF 与并发源码变化导致 fresh mismatch；对齐 file-writer 输出/重新构建后14:24审计通过。这些是证据/产物不同步的检查失败，不据旧成功沿用新源码身份。当前 JSON/日志同名重跑可更新，只有专门保存的 failure 文件明确代表历史批次；需要重现应在隔离目录执行 runner，不能写真实用户库。

## 剩余与下次入口

完成：生产Worker、完整语义/请求生命周期、行级颜色继承、新CSS60组样式等价与15:04延迟呈现回归，最后单worker1089/类型/构建/闭包/许可；有限原生搜索通过，三图逐张确认无可见重叠/越界。前三默认/两workers及各fixture失败保留，单worker不证明默认速度通过。

剩余：先核对整体工作台的主界面/会话/对话执行/输入/审批/悬浮摘要/终端浏览器，形成对齐清单、核心交互优先；未新设计/新原生验收这些区域。旧监听/编辑器错误态、图片/Git同态、metadata/媒体保留待办，不强制下批连续文件改动。独立performance的React **55/109ms**、文件页面 **72ms**、clone/HTML/单行不可中断、实际输入/INP、重复/内存/冷启动/正式包，Windows/模型/P0–P3另验，`9→0`和force reload保存边界不变。

下次核对 `/Volumes/VrenDisk/project/Mira/Mira-Harness`、分支/Git和最新源码/产物SHA，从 [交接当前入口](../../../MIRA_PHASE0_HANDOFF_2026-09-24.md#2026-10-09-行级渲染收尾与当前结果) 回看整个工作台/列剩余对齐清单，核心交互优先，不重做Worker/搜索ignore或继续堆文件支线。自有Electron已退出/隔离数据保留，用户ZCode草稿不操作/不抢焦点，新增观察图非同态验收；按变更风险校验、不截短/删语法换性能绿，整体仍active。
