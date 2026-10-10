# Mira Harness 生产入口 JS 分包证据

最近更新：2026-10-10 09:24 +08:00。轮次栏虚拟化后的三次独立采样已完成，慢首开长尾仍在；首屏完整状态统一见 [首屏总文档](MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)。下列性能数据属于明确的旧冻结产物，不是之后搜索回焦/分区折叠构建的重测；整体性能未放行，本批未提交/推送。

## 2026-10-10 轮次栏虚拟化后的独立采样（09:00）

轮次栏使用 TanStack 10px 行高/overscan 6，只挂载可见按钮；活动轮次滚入窗口，hover/focus 使用 Radix Hover Card 显示实际对话片段。新真实 DOM 回归覆盖跨窗口键盘移焦、单一 Tab 停靠、blur 取消和 scroll 后迟到预览保护。三次独立非 trace 采样保持相同 500 轮/1000 消息、1440×900 隔离隐藏 Electron，挂载轮次按钮 75–81 个、正文 18–34 条。

| 操作 | 样本数 | 中位数 ms | 最小–最大 ms |
| --- | ---: | ---: | ---: |
| 首次打开长会话 | 3 | 157.8 | 152.1–289.1 |
| 切到小会话 | 9 | 72.0 | 64.6–78.9 |
| 切回长会话 | 9 | 105.9 | 93.7–260.2 |
| Composer 输入 | 12 | 9.05 | 2.6–17.0 |
| rail 滚动挂载目标 | 18 | 13.9 | 6.2–28.5 |
| 已挂载轮次按钮点击定位 | 18 | 25.6 | 15.6–52.8 |

首次打开原始样本为 152.1/157.8/289.1ms，慢首开及 260.2ms 长会话切回仍未归因。rail 的滚动挂载与点击定位分开计时，不把 25.6ms 和旧全挂载 rail 的 29.55ms 当作等价指标。3 次 A/B 阅读恢复均保持 `performance-user-250`，偏移差 0；计时截止目标 DOM 满足后两次 rAF，不是原生显示帧/人工输入延迟，不足以证明 P95 或整体性能解决。

原始结果 `/tmp/mira-history-trace-20261010.OcWVRb/results-2026-10-10T01-00-07-545Z.json`；已独立复核分布、fixture、563 个产物 hash 和 cleanup。性能产物 JS `913bb8bad50538376e99a0f7765675c843fbce29717c871a51de7a13abfc0496`，CSS `a2523c56c99e01a3979491dd5b347b2d4edb00509bd061b0e71a5b8d7188dc48`；main `6775d5f6…`、preload `7e4444b3…`、HTML `42805e35…`。三个实例及回环端口全部退出，0 页面错误/外网/模型请求。后续分区/搜索构建的身份由首屏总文档维护，本节不覆盖它。

## 2026-10-10 对话提交链优化与独立复测

按原始 trace 修正三处：历史位置只在真实视口离开时捕获，跟随底部时不扫描历史锚点；轮次 rail 的同步布局测量改为合并的 rAF，并在工具/思考展开后的真实 ResizeObserver 更新高亮；完整 external-store adapter 以实际消息、运行、发送与规划依赖 memo。随后使用公开 API 的 memo viewport + children context，正文与审批继续更新，无关父组件更新不重挂 assistant-ui 视口 ref；不代理库的 ref，不修改 node_modules。

三个真实 ReactDOM 生命周期回归覆盖不重挂、正文/审批更新、真实 rail 回调、暂停后内容增长、恢复跟随以及 ready/messageWindow/会话 key/卸载；相关 6 套/118 项及 React 类型检查通过。05:34 全量 148 文件/2439 项、Vue 类型、React/Electron 编译、diff 通过；05:37 审计 291 JS/240 动态目标/19 许可匹配，缺失/差异/旧块 0，CSS 与 fresh Tailwind 一致。此检查的生产 JS SHA-256 为 `b9513ebc6801e7fb0d31e24d4f0165ad3b6a3ae1847b6608d972d3856569496f`，CSS 为 `b35848a73aa35db5eacb642bf989bc4c46313b4488ce27601d64846fe424d9ad`；后续侧栏修复不能沿用本产物身份。

三批均为同一 500 轮/1000 消息、1440×900、每轮 8 段正文和 TypeScript 的独立启动；每批 3 次非 trace 计时，另 1 次诊断不混入分布。标准中位数采用偶数样本两中间值平均，以下单位为 ms：

| 操作 | 样本数/批 | 原始 04:14 | 第一轮 05:09 | viewport 优化后 05:38 | 最新最小–最大 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 首次打开长会话 | 3 | 164.5 | 264.1 | 261.2 | 134.8–276.9 |
| 切回长会话 | 9 | 115.6 | 102.4 | 110.6 | 88.2–243.3 |
| 切到小会话 | 9 | 75.7 | 75.7 | 64.7 | 62.5–79.0 |
| Composer 输入 | 12 | 12.9 | 10.7 | 9.15 | 3.4–16.5 |
| 轮次定位 0/250/499 | 18 | 33.35 | 33.35 | 29.55 | 14.7–52.9 |

局部热点减轻不等于整体更快：Timeline 原同步测量退出主要应用热点，capture 的原 10.48/8.19ms 降到真实 cleanup 路径约 1.51/1.53ms；最新 viewport 高度读取 ref 栈的诊断采样从 22.364/10.931ms 降至 7.249/3.146ms，诊断最大任务从 80.913/49.736ms 降至 66.182/46.645ms。采样包含时间可重叠，不相加、不当作精确插桩耗时。首开中位数仍显著差于原始基线，长会话切换也差于上一轮；慢首开样本未带 trace，尾延迟尚未归因，不能宣称整体性能解决或无法继续改进。

最新 4 次实例功能检查通过：计时外 21 次 rail 选中符合目标、4 次 A/B 阅读返回同轮次/−120px 偏移，误差 0；0 页面错误/外网/模型请求。291 JS sourcemap 经等长 hashed import 文件名配对后逐字节匹配，保留代码行列位置；562 个生产文件 hash 前后不变。8 个自有进程退出、4 个回环端口关闭，并已独立复核。

结果只存 `/tmp/mira-history-trace-20261010.7m7iC5/`：原始 `results-2026-10-09T20-14-40-199Z.json`、第一轮 `results-2026-10-09T21-09-24-125Z.json`、最新 `results-2026-10-09T21-38-29-449Z.json` 及各自同时间戳 analysis；旧报告/分析/source map 未覆盖。统一检查在 `/tmp/mira-cleanup-drag-ref-final-20261010.3Uu9aj/`。计时仍截止目标 DOM 满足后的两次 rAF，仅表示隐藏 renderer 绘制机会；不放行原生显示帧/输入/INP、P95、内存、真实模型、ZCode 同态、安装包或 Windows。

## 2026-10-10 长会话原始重复采样与归因（04:14 基线）

以下保留改动前正式 React/Electron 冻结构建的原始数据，不代表上方后续产物。同样 500 轮/1000 消息、1440×900、每轮 8 段正文和 TypeScript 代码。3 次独立进程用于非 trace 计时，另一次仅诊断 trace/V8 CPU，诊断时间不混入分布。计时截止目标满足后的两次 rAF，是隐藏 renderer 绘制机会，输入由 DOM 事件触发，不是人类原生输入或显示器帧。

| 操作 | 样本数 | 标准中位数 | 最小–最大 |
| --- | ---: | ---: | ---: |
| 首次打开长会话 | 3 | 164.5ms | 156.7–309.7ms |
| 切回长会话 | 9 | 115.6ms | 112.6–284.8ms |
| 切到小会话 | 9 | 75.7ms | 63.4–81.3ms |
| Composer 输入 | 12 | 12.9ms | 5.3–17.5ms |
| 轮次定位 0/250/499 | 18 | 33.35ms | 15–64ms |

首开长任务分别 86/78/81ms，旧 84ms 问题仍存在。诊断含 87,991 trace 事件、7 份 CPU profile；首开最长主线程任务 74.530ms 主要经过 React 同步提交。采样包含时间指向 `MiraConversationTimeline.tsx:164` 布局测量约 15.98ms、`useConversationScroll.ts:28/43` capture/ref 约 10.48ms、assistant-ui `thread-runtime.ts:575` getState 约 14.13ms；切回长会话的对应布局/capture约 16.73/8.19ms。包含时间可能重叠，不相加、不视作精确插桩耗时，仍需受控前后优化验证。

结果 `/tmp/mira-history-trace-20261010.7m7iC5/results-2026-10-09T20-14-40-199Z.json` 与同目录 `analysis-2026-10-09T20-14-40-199Z.json`。analysis 采用偶数样本两中间值平均；raw runner 的 upper-middle 字段保留原样本且不作标准中位数引用。临时 sourcemap 经等长 chunk 引用名配对后 291 JS 逐字节一致，行列位置不变；生产文件未修改，562 个 out/dist 文件 hash 前后相同。4 次实例及 loopback 端口关闭，0 页面错误/外网/模型请求，挂载 18/34 消息行。

首次 runner 原生 SQLite 打包失败另存原报告，仅修 `/tmp` runner；本批没有生产优化。源码映射、CPU 采样和隐藏 Electron 功能通过不放行 ZCode 同态、真实输入/INP、P95、内存、安装包或 Windows。

## 2026-10-10 Timeline 500 轮单样本

同一确定性 seed、1440×900 隐藏真实编译 Electron/main/preload/Vue/第一方桥/生产 React 与隔离 HarnessStore，500 轮/1000 消息，无模型请求。计时从实际侧栏按钮点击到目标标题、视口和末条助手出现后两帧，是隐藏 renderer 绘制机会，不是显示器原生首绘；前后仅单样本，不能推断 P95。

| 指标 | 改进前 | 当前产物 |
| --- | --- | --- |
| 底部挂载消息 | 1000 | 18 |
| 底部子节点 | 24,420 | 506 |
| 中部挂载消息 | 1000 | 34 |
| 会话首开 | 424.9ms | 178.3ms |

00:26:16 当前产物 7/7 检查、0 页面错误，rail 0/250/499 分别 42.4/84.3/38.5ms，A/B 返回保持轮次 250/偏移 0，真实离屏正文搜索 125 与摘要 499 正确。当前首开仍有一项 84ms 长任务，不能声称性能无法继续改善；本样本也不覆盖原生输入/INP、Windows、安装包或 ZCode 同态。三张截图检查通过，隔离实例已退出，五项 hash 前后一致。

临时结果：`/private/tmp/mira-history-performance-20261009.RHHOum/after-2026-10-09T16-26-16-077Z.json`；基线为同目录 `baseline-2026-10-09T15-48-52-360Z.json`。当前 JS SHA-256 `331eae86c712fccf36e6271ee91f8643989ebffdb9cf800356abeab0853d284a`，CSS `3b31eed43a86c2bee24ce21f1db8ee14236634e54d29048c929e826d8d01774a`。00:16:13 的 205.0ms/101ms 是最后几何恢复修复前样本，保留原身份，不混用为当前产物。

## 2026-10-09 行级渲染收尾与当前结果

**完成与限定检查**：共享renderer仅对完整浅/深颜色对作行级继承，等色token不包独立span，字体/背景/装饰仍保留，tokens/source/offset不改；新增12项回归，独立60组computed-style/full-source/scrollWidth等价。长行诊断DOM元素27303→14703，正式React统计14704（容器计数口径不同）。改进前 [69ms基线](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/before-dom-inheritance-browser-results.json) 与 [1077检查](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/before-dom-inheritance-validation-results.json) 独立存档。

14:51:38–14:53:27最终 [validation-results.json](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/validation-results.json) 使用 `--maxWorkers=1`：103文件/1089项，Vitest70.36s，React/Vue类型、React/Electron编译、fresh审计/diff exit0。14:41默认FilePreview8001超5s、14:43默认core94k长行超15s、14:47两workers同core超15s（1088/1089、85.85s）三次failure JSON/log保留；只将FilePreview此完整性测试等待设15s，不改core15s/生产预算。单worker绿不代表默认并发/CI速度修好；机器load约19.8和其他进程CPU观察未证明根因。

**最终Chrome单次样本**：14:54:12–14:54:57，实际当前React/client/生产Worker，opaque iframe保持原sandbox。以下全为独立无预算WASM reference对同语义生产Worker，单位ms；timer gap与Long Task只观测页面主线程，不含Worker CPU。

| 完整样本 | 主线程reference：总耗时 / timer gap / Long Task | Worker：总耗时 / timer gap / 页面Long Task |
| --- | --- | --- |
| 94,380字符单行 / 27,300 tokens | 5756.3 / 5756.6 / 5756 | 6063.8 / 24.5 / 无记录 |
| 8001行 / 104,000 tokens | 1285.2 / 1285.3 / 1285 | 2246.5 / 76.7 / 72 |
| 16增长快照 / 113,152 tokens | 1352.5 / 1352.6 / 53–154（12项，见JSON） | 2220.4 / 11.4 / 无记录 |

三组完整digest、9等价fixture、300围栏、45虚拟行/文件末行、共享取消/theme/loader重试/最新streaming通过。真实React长行6526.0ms、gap110.0ms，**55/109ms Long Tasks仍存在**；21fixture输入事件/最终标识符保留、浅深逐字符有效样式相等，但非原生输入/INP。DOM更少不证明当前性能更快，也不把文件请求72ms页面任务抹成零；两批机器状态不同，不能做可靠前后收益推断。

**最新产物**：14:53:23–14:53:27 fresh双入口291JS/240动态目标/13许可一致，missing/mismatch/stale/orphan0；app静态5JS/1,895,538B/gzip9 567,956B，Worker静态4JS/135,242B/gzip9 43,339B，全部JS10,138,512B/gzip9 2,127,553B。CSS **131,700B / gzip9 23,214B**、SHA `776315833fb7a2cd4903c04db8cbe5d1580f361cf79121fa3b1e5e2bfedf05ea`，fresh Tailwind一致；没有CSS源码修改但生成产物已变化，不能写字节不变。Worker SHA仍为 `ff83414a4e4aef1d8a8290364b8d837b0096fedceda687a9e3a1d7d59863b63e`。详细许可/运行时/失败记录只看 [生产证据索引](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/README.md)。

**新CSS行为复核**：14:56:40–14:57:30颜色继承60组以776...CSS重跑通过；15:04:34–15:04:39 [延迟流式呈现回归](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/mira-streaming-regression-results.json) 13请求、errors/unhandled为空，公开ready/Text Range与继承色观察确认几何稳定、完整尾行/复制、浅深色、乱序/卸载/取消、失败重试和引用通过。14:59旧token-span selector等待30s失败保留，修复仅夹具，不再有生产源码变更；mock/delayed highlighter不计Worker性能/native验收。

**剩余与下一入口（15:08调整）**：先回看整体工作台的主界面、会话、对话执行、输入、审批、悬浮摘要及终端/浏览器面板，形成剩余对齐清单，核心交互优先；本次没有重新设计或重新验收这些区域。旧监听/编辑器错误态、图片/Git同态、metadata watcher、媒体与性能保留待办，不要求连续先做文件能力。当前用户ZCode有输入草稿，不抢焦点/不操作，观察截图不是同态验收。token clone/HTML/React长任务、真实输入/INP、重复/内存/冷暖/进程冷启动独立profile，安装包/Windows/真实模型/P0–P3另验，`9→0`与force reload保存边界不变；不重做Worker/搜索ignore，不截短/删语法换性能通过，整体仍active。

## 2026-10-09 生产高亮 Worker 与最终验证

本节保留14:34改进前基线（1077项、14:33的69ms、旧包体积）；其当时“当前/最终/下一步”不覆盖上节新renderer结果。原JSON已另存 `before-dom-inheritance-*`，同名非before JSON现在指新批次，不据本节旧数字放行当前源码。

**完成**：流式与完成态代码块、文件预览已接入独立 `mira-code-highlight.worker`，构建改为 app / Worker 双入口的 ESM 分包。采用 Shiki 3.23.0 公共 API 与 Oniguruma WASM，保留全部语言/别名和 GitHub 浅深主题；逐行携带 grammar state、修正绝对 offset，传输前去除不可克隆的 grammar state。`tokenizeTimeLimit:0` / `tokenizeMaxLineLength:0` 是为完整语义作出的明确引擎迁移，不将旧默认 JS engine 截断样本当作提速基线。

保持 opaque iframe 的 `allow-scripts allow-forms` / origin `null`，classic Blob + 固定 ESM dynamic import 正式 loader 不增加 same-origin 或放宽 CORS/sandbox；无主线程 tokenizer fallback。请求 ID、取消/迟到保护、共享消费者、错误重试、dispose 回收已接入；启动超时 10s、请求超时 60s，在途最多 256 请求 / 32,000,000 源码字符，LRU 仍为 128 项 / 1,000,000 key 字符。取消保留 warm owner，排队取消移除请求；单行 engine 扫描不能中途打断。上述 admission / key 限制不是 token 结果、总内存或整机响应时延的硬上限。

**最终自动检查**：14:24:26–14:24:51 +08:00，[validation-results.json](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/validation-results.json) `passed=true`；103 文件 / 1077 测试，Vitest 10.44s，React/Vue 类型、React/Electron 编译、fresh bundle audit 和 diff check exit 0。14:17 全量曾因“第一个调用必胜”的并发保存测试假设失败：锁按 root 异步解析后的入队次序串行，并非调用次序；已改为验证实际唯一赢家与磁盘一致，另加两种受控入队顺序回归，33/33 和相关 3 用例连续 10 轮通过。生产 ignore 实现未因此修改，[失败 JSON](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/concurrent-save-winner-test-failure.json) 与 [修复回归](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/concurrent-save-regression-results.json) 分别保留。

**最终 Chrome 单次样本**：14:32:46–14:33:06，Chrome `154.0.8037.99`，真实当前 React/client 与精确生产 Worker，独立无预算 WASM reference 仅存在于 fixture。修正截图 fixture 将主题应用到真实 `#root` / `applyHostTheme` 后完整重跑；下表使用这次最新 JSON，不沿用 14:25 样本。单位 ms；timer gap 为页面 5ms timer 的最大间隔，Long Tasks 只观测页面主线程，不包括 Worker 执行。

| 完整语义样本 | 主线程 WASM reference：总耗时 / timer gap / Long Task | 生产 Worker：总耗时 / timer gap / 页面 Long Task |
| --- | --- | --- |
| 94,380 字符单行，2100 statements，27,300 tokens | 3008.1 / 3008.7 / 3008 | 3095.5 / 11.4 / 无记录 |
| 8001 行文件，104,000 tokens | 648.4 / 648.5 / 648 | 1208.9 / 44.2 / 无记录 |
| 16 个增长快照，累计 8704 行 / 113,152 tokens | 701.1 / 701.1 / 50、57、61、68、73、77、81 | 1114.4 / 10.1 / 无记录 |

三个样本 token/style digest 均相等；另有 9 个多语言/跨行、别名、CRLF、交换主题/未知语言 fixture 相等，不代表所有 grammar / 输入全覆盖。共享取消另一消费者存活，theme / loader failure 后重试、最新 streaming、300 个完成代码块通过；8001 行预览只挂载 45 行且最后文件行可见，传输结果无 grammar state。准确源码/Worker SHA、请求与截图见 [生产证据索引](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-production/README.md)。Worker 降低本次主线程阻塞但总耗时更高，不能声称计算更快或全场景性能完成。

**React 残余与分层边界**：真实 React 长行渲染总耗时 3060.3ms、timer gap 69.5ms，仍有 **69ms Long Task**；21 个 fixture input event 保留 `Mira input stays live` 和最后标识符，但不是原生输入、INP 或零卡顿证明。两张 1400×850 组件画布截图逐张复核；深色 root/行号栏背景 `rgb(22,22,22)`、正文 `rgb(245,245,246)`，701 色 / 53,103 非背景像素，不再是未应用主题的白底 fixture，但不是完整原生工作台深色验收。14:14 的延迟 highlighter fixture 单独验证原文/高亮的行号与几何稳定、尾换行复制、未闭合 streaming fence、错误/重试、卸载/迟到取消和 citation；它不测生产 Worker 性能。14:20 的真实 Electron 43.3.0 / Chromium 150.0.7871.212 隐藏 renderer、contextIsolation/sandbox/webSecurity 与 opaque iframe 验证精确 Worker/资源闭包及取消/重试/dispose：单行 27,300 tokens、完整 source / offset，2401ms / timer gap 6.9ms，两 owner 回收、Blob URL 剩余 0。保留开发 CSP warning；该隐藏 fixture 不经过完整 Mira preload/IPC，不是可见应用或原生工作台验收。

**最终产物与许可**：14:24:50 fresh audit 确认双入口 291/291 JS SHA 一致、240 动态目标完整，缺失/差异/旧块/孤儿 0。app 静态闭包 5 JS / 1,894,924B / gzip9 567,734B；Worker 静态闭包 4 JS / 135,242B / gzip9 43,339B；全部 JS 10,137,898B / gzip9 2,127,331B，CSS 131,492B / gzip9 23,205B。共享 chunk 不重复相加，gzip 为逐文件估算而非实际传输。253 个物理 grammar、235 ID / 97 alias / 332 keys、仅两主题；WASM/tokenizer 仅属于 Worker 可达闭包，无 app-root tokenizer fallback 或 JS regex converter。13 份许可、NOTICE/HTML 与来源一致；新增 Shiki MIT、Microsoft binding MIT、native Oniguruma BSD-2 原文，466,610B WASM 与 `vscode-oniguruma@1.7.0` 的 tarball 逐字 SHA 对应，来源见 [Oniguruma 说明](../third-party-licenses/oniguruma/README.md)。不复制 ZCode tokenizer。

**有限原生流程与下一入口**：14:25:17–14:28:15 在 `/private/tmp/mira-native-ignore-8V6O9x` 真实 Mira preload/IPC、原生 click/type/keys 跑通搜索设置模板不写盘、保存、离开取消留草稿、外部冲突不覆盖文件/草稿、重读后重试、browse 不过滤 / search 按规则过滤和预览；27 records / 3 captures、`passed=true`，三张原生图逐张复核未见文字重叠/控件越界，不扩展为整体 ZCode/native/性能验收。旧锁屏、输入丢字符与旧夹具规则冲突均是历史失败/阻断，不能抹成成功。

下一步先 profile token clone/序列化、HTML/React 的 69ms 长任务和真实输入，再做重复样本、内存、冷暖/进程冷启动；保留单行不可中断和完整语义，不以截短/删语言/纯文本退化换通过。旧监听/编辑器错误态与图片/Git 的浅深色同态 ZCode、Git metadata watcher、媒体 lease/Range、正式安装包/Windows/真实模型与 P0–P3 分别推进。整体目标仍进行中，本次证据不提供“无法继续改进”或发布放行结论。

## 2026-10-09 高亮 Worker 诊断

本节是 13:54 更新时的原型历史；“尚未实现”和当时下一步只描述该采集阶段。当前生产实现及最终数据以本文件上节为准，以下历史数字、失败和验证边界不改写。

**采集与完成范围**：13:48:11–13:48:24 +08:00，隔离 headless Google Chrome `154.0.8037.99`、1440×900 桌面 viewport。使用 [诊断脚本](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-profile/mira-highlight-profile.mjs) 临时编译当时的 `code-highlighter.ts` / `file-preview-highlighter.ts` 与 Worker 原型，记录 [profile-results.json](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-profile/profile-results.json) 的源码 SHA；没有修改生产源码/构建、Electron、用户数据库或历史证据。`passed=true` 仅代表此次诊断结束，`productionWorkerImplemented=false`，不能作为下一批生产 Worker 的通过结论。

**opaque iframe 加载**：保持 `sandbox="allow-scripts allow-forms"`，effective origin 为 `null`。直接 URL module Worker 报 `SecurityError`；module blob 和静态 module import 失败。classic blob + dynamic `import()` 在原有本地资源 CORS helper 下成功，记录中的脚本请求返回 200、`Access-Control-Allow-Origin: null`。这是隔离 Chromium 的加载可行性，不是正式 Electron 资源闭包或 CSP/跨平台验收；不通过增加 same-origin、放宽 sandbox/CORS 或改宿主权限获得通过。

下表仅比较高亮/请求完成阶段的单次样本；单位为 ms，取一位小数。timer gap 是 5ms interval 的最大间隔，Long Tasks 只观测页面主线程，不包括 Worker 内部执行。

| 样本 | baseline 总耗时 / 最大 timer gap / Long Task | Worker 原型总耗时 / 最大 timer gap / 页面 Long Task |
| --- | --- | --- |
| 冷 TypeScript，47 字符 | 53.0 / 53.0 / 无记录 | 51.9 / 6.3 / 无记录 |
| 暖 TypeScript，47 字符 | 0.9 / 6.3 / 无记录 | 1.0 / 6.2 / 无记录 |
| 单行 2100 statements，94,380 字符，默认 JS engine | 1019.1 / 1019.4 / 1019 | 1026.3 / 6.4 / 无记录 |
| 同一单行，WASM 无时间预算诊断变体 | 2196.7 / 2177.6 / 2175 | 2182.3 / 7.4 / 无记录 |
| 文件预览 8001 行，357,780 字符 | 685.1 / 16.2 / 无记录 | 798.1 / 28.8 / 无记录 |
| 16 个增长快照并发高亮 | 439.7 / 439.7 / 439 | 468.3 / 8.7 / 无记录 |

原型降低了上述单行/增长样本的页面主线程阻塞，不等于计算更快；8001 行原型耗时和 timer gap 反而更高，不能宣称全场景改善。诊断没有真实输入/INP、React 渲染、首次 paint、布局、内存预算或 Electron 冷启动测量。

**语义与失败历史**：最终四个当前默认配置样本的 token/style digest 均相等，另有 9 个多语言/跨行注释或字符串、CRLF、语言别名、交换浅深主题和未知语言样本相等；不代表全部 253 个 grammar 或所有输入已等价。默认 Shiki 每行约 500ms 时间预算会令长单行输出随运行变化；最终单行的 116 tokens 相等不能消除历史不等价，也不能宣称单行完整高亮。WASM `tokenizeTimeLimit:0` 的 27,300 tokens 仅是不同 engine 的明确诊断变体，不是生产配置、JS/Worker 提速对照或引擎切换决策。

- 13:39:42–13:39:43：[首次 Worker loader 失败](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-profile/initial-worker-loader-failure.json)，`passed=false`、`frame.evaluate` Worker error；不记成功。
- 13:41:37–13:41:42：[module loader 与长单行 mismatch](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-profile/module-loader-and-long-line-mismatch.json)，opaque module loader 失败，随后宿主原型出现 `Worker token/style mismatch`；该历史宿主加载不证明 opaque iframe 通过。
- 13:44:34–13:46:42：[无预算 JS reference 中断](./assets/mira-zcode-alignment-2026-10-08/highlight-worker-profile/unlimited-js-reference-interrupted.json)，3000 statements 默认单行 baseline/Worker 分别 78/77 tokens、digest 不等，随后页面/浏览器关闭，`passed=false`；没有完整无预算 JS 结果，不推断为生产功能失败或无限预算可行。

**剩余与下一入口**：主 agent 将据此实施独立的生产 Worker 批次，当前尚未实现、没有其回归/类型/正式构建/产物审计或性能通过结论。需验证正式 opaque iframe loader、完整语言/浅深主题和跨行状态、长行时间预算及完整性、取消/迟到响应、故障恢复、有界队列/缓存与卸载资源回收，随后同条件复测主线程与总耗时；不靠删语言、截短输入或把长行退为纯文本放行。原默认并发超时、历史原生长任务、冷暖/安装包边界保留。

原生设置/搜索/浏览仍由 [原生交接](./assets/mira-zcode-alignment-2026-10-08/search-ignore-native/README.md) 单独推进：13:21 锁屏记录为 `macOS-loginwindow`、0 actions/0 captures，解锁后重启隔离 Electron 再做有限原生验收。此 profile 未操作锁屏、没有原生截图或 ZCode GUI 对照；整体 ZCode、性能、发布与 P0–P3 未放行，未提交、未推送。

## 2026-10-09 删除与筛选性能记录（历史）

2026-10-09 最新检查入口：[删除虚拟行与只看变更证据](./assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)。本批最终 96 文件/928 项（两 workers）、React/Vue 类型、React/Electron 编译与产物/许可检查通过；正式 React headless 三种桌面尺寸与 10 张当前截图有新独立复核，仅覆盖本批源码/页面，不是原生 Electron、整体性能或发布放行。旧 overlay 的 909/910 与图片批数字保留原日期范围。

Git 后端为有界异步命令，不是同根 singleflight；前端状态/ignored 分别单在途，刷新保留上一份成功展示快照，但缓存失效和过期响应抑制仍执行。删除合成按父目录 Set 去重、批量复制；筛选不额外扫描或强制展开，滚动不轮询 status。本轮 headless 抽样挂载 50 行、ignored 最大批次 49，不等于其 512 上限或整机性能门槛。11:58:48.119 静态闭包 3 JS/2,036,882 B（逐文件 gzip9 合计 613,067 B），全部 287 JS/9,561,123 B（gzip9 合计 1,911,632 B），CSS 129,561 B（gzip9 22,939 B），SHA/结果见新证据页。这不是启动或交互耗时改善证明。

首次 grammar、病态单行和同时增长快照仍有同步阻塞线索；本次只读诊断边界、未归因日志与下一步真实浏览器 profile/Worker 验收见 [后续能力审查](./assets/mira-zcode-alignment-2026-10-08/NEXT_CAPABILITY_AUDIT_2026-10-09.md)。原默认超时、原生 long-task 与冷暖/安装包待办不因本批绿而删除。

初版日期：2026-10-08；最近更新：2026-10-09（Asia/Shanghai）。状态：文件预览分块高亮与全目录搜索已有历史抽样证据；工作区监听、外部编辑器、位图/SVG 和 Git 删除/筛选已实现，自动检查与 headless React 局部确认通过，原生 Electron 与同态 ZCode 对照待验。当前数字、产物完整性和限定评审统一以删除与筛选证据页为准，不等于默认并发全量无条件通过。首次同步编译、病态单行、可靠冷暖启动、正式安装包和跨平台耗时未验收。当前未提交、未推送。

当前检查索引：[GIT_FILTER_EVIDENCE.md](./assets/mira-zcode-alignment-2026-10-08/GIT_FILTER_EVIDENCE.md)；图片历史仍看 [IMAGE_PREVIEW_EVIDENCE.md](./assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md)，上轮原生操作、重载循环及尚待错误态确认的限定结论仍看 [WATCH_EDITORS_EVIDENCE.md](./assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md)。搜索清除定位的 85/648、搜索批 84/643 与更早检查保留原时间和限定范围，不作为本批最新数字；整体与发布未放行。

下方旧批次的检查、字节与当时待办保留历史口径；旧“下一步”不覆盖当前删除/筛选证据页的续作入口。下一开发 slice 为搜索 ignore 规则/配置；性能独立先做真实浏览器 profile，再决定高亮 Worker 实现，不重做已完成的文件树增量。

2026-10-09 视觉收尾：独立复评发现浅色监听错误与文件丢失提示的正文对比度不足，已局部修正颜色，深色与普通空态不变；最后一次错误态实拍与复评确认待归档，不据旧截图或旧 `ship` 放行。

## 2026-10-08 第一批最后一次开发态记录（历史）

第一批最后一次 `npm run harness:build` 后，从正式 `/workspace/harness-react` Electron iframe 观察到入口及静态 chunk 均成功加载，未出现模块 CORS、MIME 或 404 错误。递归解析 `index.html → app.js` 的静态 ESM 导入得到：`app.js` 1,439,629 bytes、`chunks/chunk-QSRJRC6M.js` 525,932 bytes、`chunks/chunk-YEHCSWIG.js` 658 bytes，首屏 JS 合计 1,966,219 bytes（未压缩）；`app.css` 114,461 bytes、`index.html` 344 bytes。这不是第二批最新构建数字；该记录覆盖开发态模块加载，不等于启动耗时或正式安装包性能通过。

## 第一批 ESM 分包（历史）

正式 React 工作台 `apps/harness-react/app.html` 通过本地微应用服务加载。
原构建的 `format: 'iife'` 将 Shiki 注册表中的动态导入合并成一个首屏 JS 文件。
即使界面只使用 `github-light` / `github-dark`，仍包含全部 253 个语言模块、65 个主题，
以及未在当前 JavaScript regex 路径中使用的默认 Oniguruma/WASM 模块。

该批只调整生产构建和正式 HTML：

- `scripts/build-harness-react.mjs`：ESM + `splitting: true`，子块使用
  `chunks/[name]-[hash]`；入口仍为 `app.js`。
- `apps/harness-react/app.html`：将入口声明为 `type="module"`。
- 该批全语言、语言别名、全部 65 主题和代码高亮插件保持原实现；第二批已改为下文的 Mira 适配器，不能沿用此描述。
- 保留并打包 `third-party-licenses/`，未删除现有构建目录中的文件。

## 第一批较早的前后构建数据（历史）

对同一轮源码用 esbuild 的 `metafile: true, write: false` 对照 IIFE 和 ESM，
再将 ESM 审计结果与实际 `npm run harness:build` 的磁盘产物逐字比对。
这里的“首屏”是入口及其递归静态 import 的体积，不包含按需动态 import。

| 指标 | 原 IIFE | ESM 分包 |
| --- | ---: | ---: |
| 首屏 JS 原始字节 | 11,397,355 | 1,955,542 |
| 首屏 JS gzip 估算字节 | 2,208,851 | 591,137 |
| 全部 JS 原始字节 | 11,397,355 | 11,393,360 |
| 首屏 JS 文件数 | 1 | 3 |
| 构建 JS 文件数 | 1 | 351 |
| 语言模块 | 253 | 253 |
| 主题模块 | 65 | 65 |

首屏原始 JS 下降 82.84%，gzip 估算下降 73.24%。整体分发包大小基本保持；
这是首屏解析负担的降低，不能据此声称启动耗时下降同样比例。

当时本地微应用服务器未启用 gzip，表中的 gzip 是 `node:zlib.gzipSync` 可比估算，
不是 Electron 实际网络传输量。

该次实际首屏文件：

| 文件 | 原始字节 | gzip 估算字节 |
| --- | ---: | ---: |
| `app.js` | 1,428,952 | 435,092 |
| `chunks/chunk-QSRJRC6M.js` | 525,932 | 155,663 |
| `chunks/chunk-YEHCSWIG.js` | 658 | 382 |

原 IIFE 中的主要语法资源：

| 资源 | JS 输出字节 |
| --- | ---: |
| 全语言语法 | 7,490,898 |
| 全部主题 | 1,314,185 |
| WASM 相关模块 | 634,457 |

这些资源互不代表完整依赖树成本，未将重叠分组相加为新的总包大小。

## 第一批验证与边界（历史）

该批已验证：

- `npm run harness:build` 成功；实际产物与相同参数的内存审计构建一致。
- 共 303 个动态 import 引用；产物中全部目标文件存在。
- 正式产物 `index.html` 使用 module script。
- 分包前后语言/主题模块数量一致；未通过删语法减小首屏。
- 发行目录 LICENSE / NOTICE 与原始保留文件逐字一致。
- `git diff --check` 通过。

正式入口 iframe 的 sandbox 为 `allow-scripts allow-forms`，其来源为 opaque/null。开发态实际已确认入口和两个静态 chunk 请求成功，并继续操作了会话、输入、停止、主题、文件、终端和浏览器。
`electron/adapters/localMicroAppServer.ts` 已为 Origin: null 返回
`Access-Control-Allow-Origin: null`，且 `.js` MIME 为 JavaScript；源码支持模块请求所需条件。
这些构建检查和开发态加载证据不能代替冷暖启动耗时、授权桥完整矩阵、全语言语法高亮、正式安装包或 Windows 验收。

当时记录的后续测量要求仍未全部完成；第二批当前入口见文末：

1. 记录冷启动与暖启动至少 3 次的中位数，分别记录 iframe 导航、React 首次可交互和第一个代码块高亮的时间。
2. 以 streaming 代码块分别验证 JavaScript/TypeScript/TSX、Vue、JSON、shell、
   Python、SQL、Markdown、HTML/CSS、diff 以及一种不常用语言；确认对应语言与两个
   github 主题按需加载成功。未知语言仍按原插件规则回退纯文本。
3. 与 IIFE 同环境基线比较，不能只报告资源体积。
4. 正式安装包/Windows 未在本轮验收，发布前按目标平台补验。

## prototype / pilot / watch 的兼容范围

`apps/harness-react/dev.mjs` 的 prototype / pilot 开发入口及 watch 仍使用 IIFE，
其 HTML 仍使用 classic script，保留现有独立启动方式。它们与正式入口共享第二批高亮
适配器，因此不能沿用第一批开发 bundle 字节；其加载成功也不代表生产 ESM 模块路径验收。
不得手动把生产 `app.js` 放进这些 classic-script 入口，亦不得用这些页面截图代替正式工作台验收。

正式入口由本地 HTTP 微应用服务器提供；直接双击 `app.html` 以 file:// 打开
不属于支持的运行路径，模块 CORS 表现可能不同。

## 2026-10-08 第二批增量

**已完成实现**：原 `@streamdown/code` 路径已由 Mira 独立高亮适配器替换，使用 `shiki/core` + JavaScript engine；仓库 Shiki 版本统一为 3.23.0。流式和完成态共用该适配器，语言仍按需注册，实际仅注册 `github-light` / `github-dark`。当前产物不含 `@streamdown/code` runtime、`engine-oniguruma`、`vscode-oniguruma` 或 WASM；JavaScript regex 引擎仍依赖 `oniguruma-parser` / `oniguruma-to-es`，不能笼统声称产物完全没有 Oniguruma 名称。

保留 253 个物理 grammar 模块、235 个公开语言 ID、含别名 332 个名称。缓存键包含完整代码、归一化语言和主题；LRU 限制 128 项及累计 1,000,000 个 key 字符。上述数量是资源/注册表覆盖，不能替代所有语言的真实桌面高亮验收。

**收尾修复前的检查与桌面证据**：全量 80 文件/455 项测试通过（14:03:43 开始，4.53s 完成），Vue 类型检查当次复核无错误；React 类型检查已通过且当时之后无 React 源码修改，`git diff --check` 通过，正式 `harness:build` 两次通过。完成态两段 TypeScript 各 13 个带样式 token，没有结束退色；深色计算值实际来自 `--shiki-dark`，限定正式 Harness Frame 的剪贴板写授权后，原生复制与 `pbpaste` 精确源码及尾换行通过。

### 最终构建审计

“静态闭包”是 `index.html → app.js` 及递归静态 import，不含动态按需块；gzip 使用 level 9 对各 JS 文件分别压缩后求和，属于估算量，不是本地 HTTP 实际传输量。

| 范围 | JS 文件数 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| 首屏静态闭包 | 3 | 1,959,740 | 591,293 |
| 全部 JS | 287 | 9,483,981 | 1,889,858 |

磁盘 287 个 JS 的 SHA-256 与相同参数 `write:false` 构建相同；239 个动态引用目标全存在，旧块残留 0，14:02:52 最终审计再次一致。语言资源为 253 个物理 grammar、235 个公开 ID 加 97 个 alias（共 332 个名称），实际主题为 GitHub 浅/深两个。

首次审计发现旧 chunk 集合 349 个、9,963,750 bytes，已备份至 `/tmp/mira-chunk-cleanup-backup-Qb090h/chunks` 后清理，可从该临时备份恢复；它是当时的磁盘集合，不是当前可达闭包。第二次构建清理旧块数为 0。以上最终字节覆盖本批 adapter 与 launcher/终端/键盘修复，不沿用第一批构建数字。

### 先前 Node 微基准与单次导航

下表来自第二批适配器落地前的一次 Node 编译微基准，使用第一批最后一次源码对照 IIFE 与 ESM 静态闭包；它不是 Electron 启动测量。

| 指标 | IIFE | ESM 静态闭包 |
| --- | ---: | ---: |
| JS 原始字节 | 11,408,039 | 1,966,219 |
| Node 编译耗时 | 55.097 ms | 22.940 ms |

另一次正式入口单次导航观察到 DCL 61.1 ms、FCP 104 ms、LCP 120 ms；它不是重复冷/暖启动测试，也不是第二批适配器收益。不得从上述字节、Node 微基准或单次导航推算 Electron 启动改善比例。

### 本批六次导航采样的边界

已采集六次导航，但本地 HTTP 返回 `no-store`，普通 reload 组与 `clearBrowserCache` 组不能作为可靠冷暖对照，也不是 Electron 进程冷启动。首次两次代码高亮观察到 136/161 ms 长任务，后四次没有同类长任务；原因仍在分析，不能据此宣称可靠启动性能通过。

原始记录：`/tmp/mira-renderer-bench.jsonl`。下表时间相对单次 iframe 导航起点，单位 ms；LCP 取该次最后一个观察项，“shift 合计”是观察窗口内无近期输入 shift 值之和，不是整场会话完整 CLS。

| 导航组/次序 | DCL | FCP | LCP | bridge | input | config | code | 长任务耗时 | shift 合计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 普通 reload 1 | 51.3 | 84 | 300 | 52.3 | 60.0 | 92.5 | 274.8 | 161 | 0.080826 |
| 普通 reload 2 | 39.6 | 68 | 236 | 40.2 | 45.5 | 66.2 | 210.6 | 136 | 0.052760 |
| 普通 reload 3 | 38.6 | 72 | 120 | 39.1 | 45.1 | 64.7 | 95.1 | 无 | 0.052760 |
| clearBrowserCache 1 | 34.9 | 64 | 116 | 35.5 | 40.6 | 61.8 | 89.7 | 无 | 0.052760 |
| clearBrowserCache 2 | 36.4 | 80 | 128 | 37.1 | 85.9 | 85.9 | 90.2 | 无 | 0.065950 |
| clearBrowserCache 3 | 35.1 | 76 | 128 | 35.7 | 67.1 | 67.1 | 100.5 | 无 | 0.065950 |

普通 reload 的 bridge/input/config/code 中位数为 40.2/45.5/66.2/210.6 ms；clearBrowserCache 组为 35.7/67.1/67.1/90.2 ms。因 `no-store` 且共享同一进程/JIT 状态，组间差异不证明冷暖或提速。六次无记录到页面错误，但首次高亮长任务和小布局跳动仍需 profile，不据这些中位数放行性能。

临时采样脚本已从生成的 `index.html` 移除，文件与源码逐字一致，重载后 `__miraRendererBench=false`；最终磁盘审计再次与正式构建一致。采样埋点不是正式交付的一部分。

预编译 Shiki 的只读实验未采用：`rosmsg` raw 样本失败，shell/Vue/Markdown 的颜色与字体不同，Markdown 加粗发生溢出；即使 JavaScript/TypeScript 首次 tokenize 仍超过 50 ms，无法保证桌面长任务收益。当前版本保持现有适配器，不把实验方案计为已交付优化。

### 剩余与下次入口

先 profile 首次高亮长任务与布局跳动，再决定针对性减轻方式，不盲目替换高亮库；保留未知语言回退、别名、嵌套语言、连续 streaming 和缓存边界的验证范围，已通过的深色/复制和 TypeScript 两段样本不等于全语言等价。随后在可定义可靠缓存/进程条件的同环境记录至少三次冷/暖启动中位数，分别测 iframe 导航、React 首次可交互与第一个代码块高亮，之后安排进程冷启动、正式安装包和 Windows。

历史只读剪枝实验曾得到保留 253 个 grammar 时 IIFE 约 9,468,246 bytes；这只是当时可行性数据，不是当前实际构建值。历史依赖曾为插件内置 Shiki 3.23.0/仓库顶层 4.4.3，本批已统一为 3.23.0。当前未提交、未推送。

## 2026-10-08 收尾增量

`platformIpc` 用 WeakSet 让每个 WebContents 仅注册一次销毁钩子，共同清理 grant/PTY，消除授权创建/终端打开逐次加监听。14:11:38 的全量 80 文件/458 项在 3.79s 通过，`platformIpc` 16 项含新增 3 项；React/Vue 类型检查重新通过，`git diff --check` 通过。React 产物没有变化且没有重建，14:02:52 的体积/完整性证据继续保留原时间。

重启隔离开发 Electron 后，原生 12 次设置往返与 16 次终端创建/关闭通过，日志无 `MaxListenersExceededWarning`，离开到设置时 PTY 回收、返回有输入区且无非空 alert。该复验不是进程冷启动计时；销毁清理恰好一次与窗口隔离仅单测验证。首次高亮长任务/布局跳动仍须 profile，可靠冷暖/进程冷启动、安装包和 Windows 性能未放行。当前未提交、未推送。

第三方归属和本轮 UI 改编范围见
`third-party-licenses/README.md` 与 `third-party-licenses/zcode/ADAPTATIONS.md`；
此性能构建变更不改变其上游许可证或 Mira 根 MIT LICENSE。

## 2026-10-08 文件预览分块高亮

### 定位与实现

8001 行 TS 只挂载 50–61 行 DOM，但原整份 Shiki tokenize 仍出现 888ms 主线程长任务。虚拟列表只减少 DOM，不消除 tokenization 成本。

`lib/file-preview-highlighter.ts` 复用共享 Shiki core，以公开 grammarState 逐行续接语法，约 8ms 扫描预算后通过 `setTimeout(0)` 让出线程；合并全部 tokens 与绝对 offset，不是只给可见行着色。AbortSignal 取消隐藏 tab、旧会话与旧目录请求，已完成内容不重复高亮。首次同步 grammar/regex 编译及单次病态长行仍不可抢占，不声称 20ms 硬上限。

### 原生复测

脚本 `/tmp/mira-file-perf-smoke.mjs` 用原生点击/滚动，CDP 只读取 DOM 并采样 PerformanceObserver；开发 Electron 正式入口，隔离同一进程/数据目录。8001 行源码完整高亮后约 2205.5ms，观察窗口内 `longTasks=[]`，当时挂载 46 行、552 个带样式 span。滚动到 scrollTop=550 后 first=17、挂载 56 行，仍无记录长任务。

2205.5ms 是包含异步让出的完成耗时，888ms 是旧主线程单段阻塞，二者不是同一个指标，不能说耗时下降。该抽样证明这一文件路径未重现长任务，不证明所有语言/单行或进程冷启动无长任务。TS/Vue/Python/Shell/Markdown/JSON 与整份 tokens 等价、取消及事件循环让出测试通过；预览 47 项与共享高亮 19 项通过。

### 修正前磁盘审计（历史）

15:11:26 执行 `node /tmp/mira-file-workspace-bundle-audit.mjs`，exit 0；相同 esbuild 参数 `write:false`，不覆盖产物。

| 范围 | JS 数量 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| 入口递归静态闭包 | 3 | 2,005,769 | 605,004 |
| 全部 JS | 287 | 9,530,010 | 1,903,569 |

287/287 SHA-256 一致，缺失、差异和旧 chunk 均 0，239 动态目标、645 静态边完整。CSS 123,932B/gzip9 22,082B，12 项文件树/预览/虚拟行/换行/深色规则存在；7/7 发行许可副本一致，TanStack 原包→仓库→dist MIT 原文一致。HTML/NOTICE 与源码一致。gzip 是估算，当前本地 HTTP 不代表已压缩传输。

15:04:30 全量 82 文件/596 项在 6.08s 通过，React/Vue 类型、正式 `harness:build`、diff 检查通过。修复组件 CSS 被 Tailwind 覆盖后，真实 Tailwind 编译回归验证文件布局规则不会再次丢失。最终浅/深色截图见 [文件证据](./assets/mira-zcode-alignment-2026-10-08/FILE_WORKSPACE_EVIDENCE.md)。

### 剩余与下次入口

继续 profile 首次 grammar/regex 编译、病态单行和布局跳动；可靠定义缓存与进程条件后补冷暖与进程冷启动，最后独立验收正式安装包及 Windows。流式对话高亮的历史 136/161ms 与本批文件分块不是同一路径，不以本次文件抽样代替其回归。文件全目录搜索/watch/外部编辑器及总体目标仍未完成，当前未提交、未推送。

## 2026-10-08 文件标签收尾审计

本次只修正标签关闭按钮覆盖定位及标题渐隐，JS 没有变化。15:26:55 正式 `harness:build` 通过；15:27:21 全量 82 文件/596 项在 5.43s 通过，React/Vue 类型重新通过，定向两文件/五项通过。现有真实 Tailwind 输出回归检查 absolute 关闭按钮、活动标签 128px 下限及标题渐隐。

15:27:43 `node /tmp/mira-file-workspace-bundle-audit.mjs` 只读 `write:false` 审计 exit 0，287/287 JS SHA-256 与磁盘一致，缺失/差异/旧 chunk 为 0；239 动态目标、645 静态边完整。

| 范围 | 文件数量 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| 入口递归静态 JS 闭包 | 3 | 2,005,769 | 605,004 |
| 全部 JS | 287 | 9,530,010 | 1,903,569 |
| CSS | 1 | 124,328 | 22,163 |

12 项关键 CSS 规则、HTML/NOTICE 和 7/7 许可副本一致。15:11:26 的 CSS 123,932B/gzip9 22,082B 是修正前历史；gzip 是估算，审计不证明启动或交互耗时改善。

六文件原生复验通过排序、中键关闭、最近关闭恢复、五秒稳定和设置浅/深色往返，截图见 [文件证据](./assets/mira-zcode-alignment-2026-10-08/FILE_WORKSPACE_EVIDENCE.md)。8001 行的 2205.5ms/无观测长任务仍是同进程单文件抽样；首次编译、病态单行及流式对话的历史长任务没有因此放行。冷启动、安装包、Windows、真实模型及总体对齐仍未完成，未提交、未推送。

## 2026-10-08 全目录搜索与状态保存

### 实现与工作预算

host `files.search({ sessionId, query, refresh? }) -> { entries, truncated }` 搜索完整授权目录，含隐藏项、`.git`、`node_modules`，复用上游 basename/相对/绝对路径 fuzzy scoring，最多返回 1000 个匹配。root 使用 realpath/`dev:ino` 隔离；缓存 60 秒 TTL、最多 4 个 root 的 LRU、估算累计 128MiB 上限，超预算索引不缓存；refresh 强制重扫。缓存预算是实现中的估算字节，不是进程 RSS 实测。扫描最多 8 个目录并发，扫描和评分约 8ms 工作预算后让出事件循环；单次文件系统调用不可抢占，不承诺硬响应上限。

返回候选重新校验 realpath 在当前 root 且类型一致；不可读目录使整个搜索失败，不返回部分结果。React 120ms 防抖、query 一变立即清旧结果、epoch/请求序号抑制旧响应及 retry；打开文件保留 query，打开目录清 query 并强制 root → 祖先 → 目录 reveal。独立 reviewer 将原 P2 目录 reveal 标 resolved，树 17 项回归覆盖新目录和过期请求。

### 搜索抽样与证据边界

主进程 Node helper 的单次文件搜索抽样约 131781 个文件，cold 扫描/查询约 818ms、warm 缓存查询约 89ms，观察 timer gap 17ms。cold/warm 描述的是 helper 的索引缓存条件，不是 Electron 进程冷暖启动；同一机器的一次样本不能代表中位数、跨平台、正式安装包或所有目录规模。

隔离开发 Electron 正式入口的搜索 smoke exit 0：未展开深层文件、打开文件保留 query、clear 后树选中、目录 reveal、无匹配、Down/Enter/Escape 与 chmod 不可读目录无部分结果/恢复重试通过。PerformanceObserver 的本次窗口 `longTasks=[]`，只说明这次 renderer 搜索操作未观测到长任务，不证明主进程无阻塞或首次 grammar/病态单行已解决。

### 状态保存与本批检查

workspace preference 读取成功才 ready，失败不写初始空值；late hydration 保留同会话修改/主动 clearing，合并未触碰会话。按 key 有序 write、最新 snapshot 和 merge loop；受控路由离开等待最新 save 成功，失败显示并阻止离开、支持 retry。StrictMode replay、快速 unmount、读/写失败与晚到读取等有回归。force reload/进程终止不保证异步保存；此前 `9→0` 未归因，不把相邻风险修复当其根因。

16:34:16 全量 84 文件/643 项在 5.03s 通过，React/Vue 类型及 `git diff --check` 通过，正式 `harness:build` 约 16:34:15 完成，exit 0。16:21:10 的 84/643（4.77s）与 16:20:47 构建是本批先前检查；15:27:43 字节只作前批历史。

原生保存故障注入阻止设置离开且 document timeOrigin 不变，retry 保存最新 snapshot 后可离开；返回展开树与 `file:unopened/deep/mira-search-needle.md` tab 恢复。工作区默认收起，点击后看到持久 tab，不属于标签丢失。最终 `/tmp/mira-search-final-desktop.mjs --no-capture` 完整重跑 exit 0、日志 `/tmp/mira-search-final-native-results.jsonl`；深色菜单/Escape、新文件 refresh、1100 匹配只显示 1000 且明确提示、初始 37 行 DOM/End `0999` 后 scrollTop=27338/36 行、A→B 同 query 无匹配→A query 空且原 tab 恢复通过。首次末段 selector 拼写错误修正后重跑；finally 清理 1101 测试文件及随机目录，无故障注入残留。六张搜索图及 ZCode 对照已核实固化。新收尾 reviewer disposition **fix**：重复同路径打开后 clear 不定位，需统一 X/Escape/清空输入定位并补回归和同一原生复验；上述检查为该新发现修复前证据。

### 最终构建审计

16:35:08 `/tmp/mira-search-final-bundle-audit.json` 完成；287/287 JS SHA 一致，缺失/差异/旧 chunk 0，239 动态目标完整，7/7 许可副本及 NOTICE/HTML 一致。

| 范围 | 文件数 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| 入口递归静态 JS 闭包 | 3 | 2,011,166 | 606,344 |
| 全部 JS | 287 | 9,535,407 | 1,904,909 |
| CSS | 1 | 125,300 | 22,261 |

gzip 仍是逐文件估算，不是本地 HTTP 实际传输量；构建完整性不证明交互耗时改善或启动放行。15:27:43 的 2,005,769/9,530,010/124,328B 保留修正前历史，不改写成新产物。

### 剩余与下次入口

先完成重复同路径 clear 定位 P2 的最小修复、组件回归和同一原生复验，再从 [本轮权威入口](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-搜索与状态保存增量) 核对最终证据和实例。文件 watch/外部编辑器、媒体/Git 状态叠加仍待实现；首次同步 grammar/regex、病态单行、流式历史长任务和布局 profile 继续独立验证，可靠冷暖/进程冷启动、正式安装包、Windows 与真实模型完整矩阵均未放行。追查 `9→0` 须补 session/target/timeOrigin 与保存次序。当前未提交、未推送。

## 2026-10-08 搜索清除定位收尾

**已完成与定向证据**：统一 onChange/X/Escape 的 `setSearchQuery`，空白 query 时以当前 `selectionPath` 排队 `pendingReveal`，既有 layout/searching 依赖不改。真实组件 callback 5 项覆盖重复 same path 的 X/Escape/deleting/whitespace 和无 selected；16:48:05 临时旧三入口 4 fail/1 pass，恢复修复后 16:48:33 5/5 pass。修复后同一原生首次/重复 X/Escape/实际 Cmd+A → Backspace 均 scrollTop=5386、目标行 794..822 在视口 132..834 内，结果日志 `/tmp/mira-search-clear-fixed-results.jsonl` exit 0，200 生成文件 finally 清理。

**最终自动检查**：16:50:22 全量 85 文件/648 项在 6.26s 通过，React/Vue 类型 exit 0 重新通过、diff 检查通过；最终 `harness:build` app mtime 16:53:05（bundler 378ms），exit 0。16:53:57 `/tmp/mira-search-closeout-bundle-audit.json` 完成，287/287 JS SHA 一致，缺失/差异/旧 chunk 0，239 动态目标和 645 静态边完整，7/7 许可副本与 NOTICE/HTML 一致。

| 范围 | 文件数 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| 入口递归静态 JS 闭包 | 3 | 2,011,179 | 606,377 |
| 全部 JS | 287 | 9,535,420 | 1,904,942 |
| CSS | 1 | 125,300 | 22,261 |

CSS 字节不变。gzip 是逐文件估算，不是本地 HTTP 实际传输量；上节 16:35:08 的 2,011,166/9,535,407B 与 84/643 保留修复前历史，不改写。

**完整原生与限定评审**：浅色 `/tmp/mira-search-light-fixed-results.jsonl` 和深色 `/tmp/mira-search-dark-fixed-results.jsonl` 两个完整脚本均 exit 0；浅色 observer longTasks=[]、top1000 37/36 虚拟行、A/B 隔离和最终 needle/transient 两 file tab 通过。六个同视图修复后截图（浅 16:49:21/26/34、深 16:50:34/35/43）已逐张打开、覆盖固化且 SHA 一致。同一 reviewer **Verdict Pass**，唯一 clear P2 **resolved**、Remaining **clear**、Disposition **ship**，只放行重复同路径清除定位修复，没有因此放行总体对齐或性能。

**剩余与入口**：本批收尾完成，权威入口 [本批对齐记录](./MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md#2026-10-08-搜索清除定位收尾)。继续 watch/外部编辑器与首次 grammar/病态单行/布局 profile，再定义可靠冷暖/进程冷启动；本次修复不证明搜索提速。安装包/Windows/真实模型及整体 ZCode/P0–P3 未完成，`9→0` 未归因，force reload/进程终止不保证 async 保存。未提交、未推送。

## 2026-10-08 工作区监听与外部编辑器

**实现与预算**：目录监听使用非递归 `fs.watch`，无轮询；每订阅最多 256 目录（含 root），每 renderer owner 最多 8 订阅。宿主 150ms 合批、React 300ms 合批，共享树/预览订阅；目录身份变化重绑、目录消失监听存活祖先并恢复、alias 改指已监听目录发全失效。搜索强制重扫，隐藏预览激活再读，删除保留文件 tab 并可恢复。树首次读取、reveal、手动/监听刷新共用每数据源最多两项实际在途目录读取，旧 epoch 未完成读取仍占预算；该预算不等于全应用所有文件操作的全局并发上限。grant 撤销、主 renderer 非同文档主框架导航/崩溃/销毁回收 watch/PTY。

外部编辑器使用 30 秒探测缓存、最多 4 个 worker；失败等待在途 worker 排空后才释放 pending，retry 不叠加旧工作。图标为 32px PNG，macOS 用结构化 plist 和有界异步转换；图标失败不阻止已安装应用打开。主/子菜单受 Radix 可用高度约束并可滚动，固定 Mira ID、授权 root/目标类型校验、参数数组和 `shell:false` 保留安全边界；Windows detached GUI 启动不等待应用退出。偏好读取失败保持错误，仅失败时允许重试 hydration，普通重探测不重复读取；失败 launch 不阻断初始/重试 hydration，成功显式选择阻止旧偏好覆盖且仅保存最新选择。卸载/controller 变化后的迟到结果不写偏好，严格偏好保存失败可见。文件预览保持只读。

**自动检查历史与验收边界**：2026-10-08 实现与自动检查已完成，但默认并发两次 8001 行高亮用例出现原 5 秒超时，不能写默认全量无条件通过。限制并发曾出现 native watcher 用例超时；用例改为先通过 marker 确认 watcher 就绪并接受 `paths=[]` 合法全失效，未放宽 timeout、未据此修改生产实现。通过的受限并发检查与上述失败条件均保留在 [本批证据](./assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md)，不在本文件重复最终数字。

2026-10-08 原生保存/原子保存/隐藏预览激活/删除恢复/子目录替换/搜索更新/权限错误与 retry 有部分证据，但末段 maxReads 断言失败。MessagePort 不同监听回调间微任务可能令 monitor 计数顺序失真，已调整监测位置；锁屏打断后未取得修正监测的完整新统计。这一历史观察既不是完整脚本通过，也不能直接当真实 I/O 峰值结论。十次重载与完整原生循环在取得对应 exit 0 和日志前不宣称通过；重载后重新打开文件的监听恢复不证明强制 reload 前异步标签保存有保证。

### 2026-10-09 续作

**完成**：本批最终构建、类型、受限并发全量回归与完整原生操作通过，真实监听保存/原子保存/隐藏预览/删除恢复/目录替换/搜索/权限重试、外部编辑保存、打开失败恢复、重载后监听重接及短窗口多项菜单真实滚动均有固化日志，浅深色实拍已固化。隔离监测器改为只处理 `mira:request`，按 port 分域并在真实响应处理前减计数，排除旧峰值误计且不再拦截 React Scheduler；实际读取预算、空闲请求、保存延迟与 longTasks 仅是该脚本样本，最终数字见 [WATCH_EDITORS_EVIDENCE.md](./assets/mira-zcode-alignment-2026-10-08/WATCH_EDITORS_EVIDENCE.md)。偏好失败时序修复有先红后绿回归，独立最终视觉复评待归档。

**剩余与下次入口**：先读证据页核对独立最终视觉复评，下一开发 slice 为真实位图与 SVG 预览/源码切换，新增授权图片读取桥并复用 root 隔离/监听/错误恢复；不将预览等同于图片加入模型上下文。性能继续独立测首次 grammar/regex、病态单行、流式历史长任务、布局跳动与可靠定义缓存/进程条件的冷暖及进程冷启动。合批和 worker 上限不是硬耗时承诺，产物字节/SHA 一致不证明交互提速或启动通过；单次 longTasks 抽样不放行整体性能。音视频/Office、Git 叠加、高级浏览器/工作流、正式安装包、Windows、真实模型完整矩阵及整体 ZCode/P0–P3 独立验收。默认并发高亮超时历史不被受限并发通过覆盖；`9→0` 未归因，force reload/进程终止不保证异步保存，未提交、未推送。

## 2026-10-09 位图与 SVG 预览

### 实现与预算

位图使用授权 `files.read-image`，固定 4 MiB 编码文件上限和有界 file-handle 读取；前后复核 root/realpath 与 dev/inode/size/纳秒 mtime/ctime。该上限不是解码像素或 renderer 内存硬预算，未新增全局图片读取队列；既有最多两读只约束文件树目录数据源。SVG 继续文本读取，以 `img` data URI 预览，源码用原虚拟行/Shiki；非活动未完成请求失效，激活重读，已完成内容保留缓存。

40px 满宽工具栏、8px 棋盘和图片 40px 留白使用当前表面；`@Nx` 折算自然尺寸，容器限制超大显示，SVG 适配空间。旧 inspector section/p 污染已局部修正，真实 Tailwind/PostCSS 回归先红后绿。SVG 解码失败不阻止在源码态加入可读取文本；位图不参与文本附件。

### 最终产物与检查

10:35:47 全量受限两 workers 检查 94 文件 / 852 项在 11.81s 通过；React/Vue 类型、正式 React 构建、Electron 编译、diff 与 10:36:24.951–25.315 只读分块/许可审计通过。最终日志与限定结论统一看 [图片证据页](./assets/mira-zcode-alignment-2026-10-08/IMAGE_PREVIEW_EVIDENCE.md)，既往默认并发高亮超时不被本次通过覆盖。

| 范围 | 文件数 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| 入口递归静态 JS 闭包 | 3 | 2,029,195 | 611,110 |
| 全部 JS | 287 | 9,553,436 | 1,909,675 |
| CSS | 1 | 128,056 | 22,715 |

287 JS SHA 一致，缺失/陈旧/孤立产物 0，645 静态边、239 动态目标完整，7/7 许可与 NOTICE/HTML 一致。新增图片 CSS 几何/正文级联由真实编译样式回归与 headless computed style 另检查；审计脚本的旧 12 条 selector 不是新图片全样式审计。gzip 是逐文件估算，静态产物变化不证明交互或启动性能。

### 确认边界与下一入口

10:36:31–35 有效 headless 采集使用实际生产工作台/MessageChannel/parser/file helper，六图逐张检查与同一 reviewer 局部 Verdict Pass；两 CSS P2 和 SVG 源码动作 resolved，仅放行这三项 headless 确认。10:34 compositor 滞后图已归档，不据其放行。图片/SVG 解码、失败恢复、隐藏后激活重读和 SVG script/外链夹具通过，但没有运行 Electron grant、原生 watcher 或 Vue 设置；watch 通知是协议夹具。

先完成上轮错误态原生浅深复拍，再核实新宿主与 CSS 已加载、进行图片/SVG 原生操作和同态 ZCode 对照，之后音视频/Office 或 Git 叠加。APNG/GIF 动画、巨大解码尺寸/内存、首次 grammar/regex、病态单行、流式历史长任务、布局 profile、可靠冷暖/进程启动、安装包、Windows 和真实模型矩阵未验收。`9→0` 未归因；当前未提交、未推送，整体目标仍 active。
