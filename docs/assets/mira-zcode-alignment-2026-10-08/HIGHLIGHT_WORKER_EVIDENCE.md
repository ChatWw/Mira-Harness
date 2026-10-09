# 2026-10-09 生产高亮 Worker 与 DOM 着色

更新：2026-10-09 15:05 +08:00。Worker、流式/完成态/文件接入和安全颜色继承已实现；本批单 worker 全量、类型、构建、产物审计与浏览器语义/流式行为回归通过。
性能未放行：实际 React 长单行仍有 55/109ms Long Tasks，8001 行传输测试也观测到 72ms 页面长任务；不称整体已无法改进。
更详细的预算、资源闭包、许可和各失败历史见 [生产证据索引](highlight-worker-production/README.md)。整体 ZCode 对齐目标 active。

## 本批实现

- Shiki Oniguruma WASM 在 `workers/mira-code-highlight.worker.ts` 内运行；grammarState 类实例留在 Worker，普通 tokens/styles/offsets 通过明确协议返回。
- opaque iframe 保持 `allow-scripts allow-forms`，Blob classic Worker 导入固定可信 ESM 产物；没有 same-origin 扩权、关闭 webSecurity 或主线程 tokenizer fallback。
- 流式使用 Streamdown 公开容器/标题/复制/下载与 Mira 正文；完成态每消息最多四个并发围栏处理，300 围栏不因 transport 上限而丢失；文件预览保留虚拟行。
- 消费者隔离取消、迟到保护、暖 owner、queued/active ACK、故障重试与正式入口卸载 dispose 已接入。10s 启动/60s 请求截止；256 在途项/32,000,000 源字符 admission 和 128 项/1,000,000 key 字符 LRU **不是** token/result/总 heap 硬上限。
- Worker 逐行续接约 8ms yield；完整病态单行仍不能中途抢占，不截断、限制 tokenization 长度或降级纯文本。
- 共享 HTML renderer 只对完整双主题颜色做行级继承；额外字体/背景/装饰保留独立 spans，缺主题色走原路径。不修改 tokens 或 offsets。94,380 字符样本由 27,303 elements 降至 14,703，完整 Streamdown 围栏含尾换行时为 14,704。
- Shiki/Microsoft/Oniguruma 许可原文与 WASM 来源保存于 `third-party-licenses/`；没有复制 ZCode tokenizer 源码。

## 最新检查与边界

| 证据 | 实际结果 | 不证明的范围 |
| --- | --- | --- |
| [统一检查](highlight-worker-production/validation-results.json)，14:51:38–14:53:27 | `--maxWorkers=1`，103 文件 / 1089 项，70.36s；React/Vue 类型、React/Electron 构建、fresh bundle/license audit、diff check 通过 | 默认/两 worker 并发稳定、安装包、Windows、真实模型 |
| [生产闭包审计](highlight-worker-production/bundle-audit.json) | 291 JS SHA 一致、240 动态目标完整、13 许可文件一致；WASM/core 仅 Worker 可达 | 冷启动、总内存、产品 INP |
| [Chrome 生产 Worker](highlight-worker-production/mira-worker-browser-results.json)，14:54:12–14:54:57 | opaque origin/null CORS、九组完整 reference 等价；27,300 长行 tokens、300 围栏、8001 行/45 挂载行/末行可见、取消与真实入口 404 重试通过 | 完整原生 Mira/preload/IPC/安装包 |
| 同一 Chrome 的实际 React | 21 输入事件与完整尾标识保留；逐字符浅深样式/全文与原 serializer 相等 | 零卡顿或计算提速，观察到 55/109ms 页面长任务 |
| [隐藏 Electron](highlight-worker-production/mira-electron-worker-results.json)，14:20 | Electron 43.3.0/Chromium 150，exact Worker/资源、完整长行、ACK/恢复/dispose/Blob 回收通过 | 完整 Mira UI/IPC；无 CSP 的 fixture 警告保留 |
| [独立颜色继承语义对照](highlight-worker-production/mira-color-inheritance-results.json)，14:56:40–14:57:30 | 三表面、浅深、正反主题与五类输入，共 60 组逐字符样式、全文和滚动宽度等价 | React scheduler、Worker 或性能门槛 |
| [流式行为/几何](highlight-worker-production/mira-streaming-regression-results.json)，15:04:34–15:04:39 | 取消/乱序/卸载/失败重试、精确复制/引用及状态几何通过；文字 Range 排除行号伪元素，行颜色继承浅深色正确 | 受控高亮响应不是 Worker 性能、原生输入或完整产品验收 |

生产 CSS 源文件本批未修改，但生成的 CSS 字节/hash 已变化；不能写成产物字节不变。
当前颜色对照、Worker browser 和流式行为回归的 CSS SHA 均为 `776315833fb7a2cd4903c04db8cbe5d1580f361cf79121fa3b1e5e2bfedf05ea`；旧 411a46e3 开头的回归保持其历史采集身份。
完整 Mira 设置/搜索/浏览的有限原生验收属于另一个流程，27 条记录/三图逐张确认，见 [原生交接](search-ignore-native/README.md)，不由隐藏 Electron fixture 推断。

## 性能结果

94,380 字符长行完整 digest 相同：同步独立 reference 主线程 gap 5756.6ms；生产 Worker gap 24.5ms。
总计算/等待时间 5756.3→6063.8ms，**没有变快**；移出主线程和总耗时是不同结论。
实际 React max timer gap 110ms，55/109ms Long Tasks 尚在；8001 行 Worker 返回阶段还观测到 72ms 页面长任务/gap 76.7ms，未单独归因为 clone、GC 或 DOM。
机器在此期间有高 load/外部 CPU 活动，但没有隔离其因果，不用它解释掉长任务或与旧 69ms 单样本直接归因比较。
颜色继承只确认 DOM 减少和无损表现，不声称已证明真实 React 更快。

## 失败历史

- [改动前 browser](highlight-worker-production/before-dom-inheritance-browser-results.json)、[validation](highlight-worker-production/before-dom-inheritance-validation-results.json)、[audit](highlight-worker-production/before-dom-inheritance-bundle-audit.json) 与截图保留；1077 项/69ms 为当时基线，不是当前结果。
- [14:41 默认并发失败](highlight-worker-production/dom-inheritance-first-validation-failure.json)：8001 行 Node reference 超过默认 5s；仅把完整性测试上限改为 15s，生产预算没有变化。
- [14:43 默认并发失败](highlight-worker-production/dom-inheritance-second-validation-failure.json) 与 [14:47 两 worker 失败](highlight-worker-production/dom-inheritance-two-worker-validation-failure.json)：同一 94,380 字符 reference 超过既有 15s。core 上限未再提高；最终单 worker 全绿不覆盖这三次失败或 CI 稳定性。
- [14:50 语义夹具失败](highlight-worker-production/dom-inheritance-rendered-source-fixture-failure.json)：用无尾换行 reference 对比 Streamdown 围栏的尾换行，导致长度误判。reference 改成完整围栏内容，不裁掉产品源码，后续实际浅深样式/全文均相等。
- [14:59 流式夹具失败](highlight-worker-production/dom-inheritance-streaming-fixture-failure.json)：旧脚本等待 `.line span`；受控双主题 token 已继承到行节点，所以 ready 后没有子 span。夹具改用公开 ready 状态、首个文字节点的 Range 和行继承色读数，15:04 回归通过；没有为旧 DOM 假设回改生产组件。
- 旧属性顺序误判、preload 路径、source/build 失配、并发保存 FIFO 假设、锁屏/原生输入和旧目录规则前提失败保留在各原批目录，不抹为成功。

## 剩余与下次入口

1. 回到整体工作台主线，先核对首屏、会话、对话执行、输入、审批、悬浮摘要与终端/浏览器面板；按整体差距安排下一批，不再连续追加文件功能。旧监听/编辑器错误态和图片/Git 同态仍待验；当前观察截图不是受控同态验收。用户正在 ZCode 输入时停止该窗口操作，不修改草稿或夺取焦点。
2. 分开 profile Worker result clone、HTML、DOM/style/layout、重复运行和内存，依据证据处理剩余长任务；不先增加渐进渲染复杂度。
3. metadata watcher、媒体 lease/Range、可靠进程冷启动、安装包/Windows/真实模型与完整 P0–P3 保持独立关口。

自有隔离 Mira Electron 已 SIGINT 退出、数据目录保留；不关闭用户 ZCode/Chrome/TRAE。本轮没有执行提交或推送。
