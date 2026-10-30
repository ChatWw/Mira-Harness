# macOS 电脑控制设置与光标验收

2026-10-30，在本机 macOS arm64 验证。沿用 Mira 插件详情页样式，只为电脑控制插件增加 macOS 使用设置。

- 展示原生组件、屏幕录制和辅助功能权限；缺项与检测失败不会显示“已就绪”。权限由实际执行操作的 Swift helper 检测，页面载入只检查权限；用户点击后才请求对应权限并打开固定的系统设置页面。
- 光标开关默认开启，保存在 `~/.mira/config/computer-use.json`。通过受授权的 Vue / React 工作台桥读取和保存；已存在的 MCP 会话跟随该文件，关闭后退出自己的浮层，再次操作可重新启动。
- 首次输入、按键或打开应用也会显示 Mira 光标；任务停止和结束关闭本轮子进程并清理临时目录。

`node scripts/verify-mac-computer-settings.mjs` 的 [report.json](report.json) 记录真实 Swift 组件、原生权限检测、NSPanel 初次显示 / 隐藏、已有后端开关切换 / 退出清理，以及独立 MCP 对自建可见 Electron 窗口的真实坐标点击、中文输入、按键和截图。

[native-mira-cursor.png](native-mira-cursor.png) 是该测试窗口的系统截屏裁剪，包含实际原生 Mira 光标。[light-permissions.png](light-permissions.png)、[light-ready.png](light-ready.png)、[dark-permissions.png](dark-permissions.png)、[dark-ready.png](dark-ready.png) 使用真实 React 组件和应用 CSS 在 Electron 中渲染；权限状态是明确的夹具，不代表本机处于缺权限状态。

`scripts/verify-mac-computer-settings-app.mjs` 使用独立临时 Mira 数据目录启动实际构建的 Electron 应用，从插件市场进入电脑控制，读取真实原生权限，验证开关落盘及完整重启后的恢复。[app-report.json](app-report.json)、[app-light.png](app-light.png)、[app-dark.png](app-dark.png) 是完整 Vue Shell、React 工作台和授权 IPC 链路的证据。脚本需要安装的 Playwright，可通过 `MIRA_PLAYWRIGHT_PATH` 指定路径；不会操作用户日常 Mira 数据。

验证边界：已真实编译 / 签署本机 arm64 helper；未改变用户的 TCC 授权，未执行系统授权弹窗的人工流程，未验收 Intel 实机、签名安装包、外部应用或外部模型完整任务。Windows 后端源码未改动；其原生验收保留此前 Windows 记录。
