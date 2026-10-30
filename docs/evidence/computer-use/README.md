# 电脑控制后端迁移验收

2026-10-30 macOS 补充：已加入电脑控制详情页的原生权限检测、系统授权入口和持久光标设置，修复首次输入 / 按键 / 打开应用时浮层未显示。当前 Mac 原生与完整应用证据见 [macos/README.md](macos/README.md)；下方为先前 Windows 迁移阶段的验收记录。

2026-10-30：`computer-use` 升级至 0.4.0。同一个入口按系统选择 Windows / macOS 后端，移除 Cua 的运行解析器、下载构建脚本、插件声明、许可文件和打包资源项。

- Windows 来源：[Yu-tao-Li/dsh-computer-use-win](https://github.com/Yu-tao-Li/dsh-computer-use-win)，固定 revision `6fb642129595a6357588c70812974951db304662`。采用完整独立 MCP + PowerShell 原生后端，保留控制提示、指针反馈与 Esc。UIA 是可选能力，截图 / OCR / 坐标操作独立可用。
- macOS 来源：[OrderG-X/dsh-mac-computer-use](https://github.com/OrderG-X/dsh-mac-computer-use)，固定 revision `0c38a4dd3635f785e6d04429bd8a4f7cf09195d6`。采用 Swift CGEvent 引擎和 NSPanel 光标，新增独立 MCP 适配；默认视觉操作，保留可选 AX 编号工具。移除 DSH 设置 UI、用户路径搜索和持久日志，二进制在 Mac 构建时编译并随 Mira 分发。
- 截图：Windows 常规截图在内存编码；OCR / WGC 中转图片在系统 TEMP 清理。Mac 附件直接转成 MCP 图片，私有临时文件在成功和失败后都清理；结束时关闭本轮子进程、光标和临时目录。不会在项目目录建立截图文件。

运行 `node scripts/verify-mira-computer-use.mjs` 已通过：

1. 原生 Windows 提示 helper 编译、浮层点击穿透、焦点保持和光标显示。Esc 使用 helper 的测试入口，覆盖注入 Esc 忽略和实体 Esc 分支；不是物理键盘实测。
2. 真实 McpManager 启动指定 Windows 后端，向独立 Electron 测试窗口执行截图、OCR、真实坐标点击和中文粘贴。取消、关闭、刷新时中断等待并丢弃排队点击。测试窗口需要可见；以隐藏窗口启动 Electron 会触发上游遮挡保护，未绕过该保护。
3. 实际 React/CSS 的浅色 / 深色工具记录：中文动作与目标、失败和取消状态，无横向溢出。批量步骤为展示夹具，用于检验历史计划与结果区分；新后端逐次记录实际工具调用。

[report.json](report.json) 是当前原生报告；[light.png](light.png)、[dark.png](dark.png) 为真实渲染、夹具数据；[windows-indicator.png](windows-indicator.png)、[windows-pointer.png](windows-pointer.png) 为原生 helper 独立绘制，黑底是捕获底图，不是桌面内容。

定向 6 文件 50 项通过，真实 Harness 插件链路串行 23 项通过，合计 73 项。覆盖 Mac 图片返回及成功 / 失败清理、两平台独立 MCP 协议、架构与框架构建参数、会话互斥、取消、中文摘要和 Windows OCR 冷编译。首次 OCR 启动暴露 MCP 默认环境缺少 PATHEXT，已修复并加冷编译回归。React 类型、MCP / 电脑控制定向类型、工具构建和 electron-vite 生产构建通过。

本机只验证 Windows 原生操作。Mac 原生 Swift 编译、TCC 权限、真实应用操作及签名安装包仍需在 Mac 上验收；跨平台协议与模拟构建测试不能替代这些检查。未进行外部模型完整任务或安装包验收。旧的 wider Windows 夹具失败（换行文件名、symlink 权限、Git 和斜杠路径预期）未在本次重跑，不声称全量测试通过。

本地 computer-use 注册指向本项目的 resources/plugins/computer-use；插件启用。更新主进程后新开会话才会载入新版 manifest 与工具。旧 Cua 二进制仍在 dist/mira-tools/cua-driver，下载缓存仍在 node_modules/.cache/mira-cua-driver：自动审批阻止了递归删除及指定文件删除，仅返回 blocked by policy。它们不再被新运行 / 构建 / 打包配置引用。
