# Mira 内置浏览器自动化（首版）

浏览器操作插件 0.2.0 通过宿主内置 MCP 操作已有 Electron webview，不再运行 npx/Playwright MCP 或启动外部 Chrome。

## 调用与所有权

模型 → 既有 MCP 权限/工具封装 → 进程内 MCP → MiraBrowserAutomation → 对应任务的 webview。

- 宿主以当前运行的 sender/sessionId 创建 MCP，模型只传 browserId，不接受窗口、任务或 guest ID。
- browser_open 发出 browser-open 事件，当前任务工作台创建资源标签页，Vue 在 dom-ready 时通过 IPC 绑定 guest。
- 主进程验证 IPC 来自主 frame，且目标是真正属于该窗口的 webview；同一 guest 不能绑定多个任务/标签页。
- 单标签页命令串行执行；替换或销毁使旧请求失效；取消检查贯穿 CDP 调用。活跃操作参与既有浏览器驻留保护。
- MCP 关闭取消请求，但保留用户可见页面；guest 销毁解除注册。沿用既有 persist:mira-harness-browser 分区，登录数据仍跨任务共享。
- 主任务和其授权子任务沿用既有父任务 MCP 借用规则，共享父任务浏览器控制范围。

## 首版工具

browser_list、browser_open、browser_navigate、browser_snapshot、browser_click、browser_fill、browser_scroll、browser_screenshot。

快照最多返回 500 个主文档可见元素、20000 字符正文；每次快照生成新引用，旧快照、DOM 变化及导航前引用拒绝执行。点击前检查元素存在、可见、可用及遮挡，使用 guest CDP 鼠标事件。填写标准 input/textarea，调用原生 value setter 并派发 input/change；不等同于可信物理键盘输入。滚动主文档，截图来自该 guest 的 capturePage。

限制：首版不提供键盘按键、iframe/shadow DOM 内定位、contenteditable、下拉选择、上传、下载管理和录屏。不开放任意 JS 执行或全局远程调试端口。browser_open 需要当前任务工作台处于挂载状态；后台或切走任务时会明确超时，不借用另一任务的页面。

## 验证

- npm test -- tests/miraBrowserAutomation.test.ts tests/miraHostedBrowsers.test.ts tests/miraBrowserProtection.test.ts tests/miraBrowserViewports.test.ts
- Electron 验证使用隔离 `MIRA_TEST_HOME`，通过当前工作台打开真实 webview，检查标签页与任务身份、可见尺寸、MCP 操作及跨任务拒绝；测试结束后关闭实例并删除临时数据。
