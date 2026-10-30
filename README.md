<div align="center">
<img src="src/asset/mira-logo.png" width="96" alt="Mira 图标" />

# Mira Harness

本地优先的个人 AI 桌面工作台

</div>

Mira Harness 是工程名，安装后的应用名为 **Mira**，对话助手名为 **Mira（米拉）**。
Electron 提供模型调用、Agent 执行、本地文件与数据库能力；Vue 承载窗口 Shell 和统一设置，React 实现正式 Harness 工作台。

## 开发与构建

```bash
npm install
npm run dev               # Electron 开发版（同 desktop:dev）
npm run build             # Vue/React 类型检查与完整 Electron 生产构建
npm test                  # Vitest 回归测试
npm run desktop:build     # macOS Apple Silicon DMG
npm run desktop:build:win # Windows x64 NSIS，需在 Windows 上运行
```

macOS 电脑控制插件的构建需要 Xcode Command Line Tools；原生依赖和电脑控制辅助程序按目标平台构建。Windows 安装包应在 Windows 环境单独验收。

`desktop:dev` 会先构建 React 工作台、工作流运行时和本地工具。修改 React 源码后运行 `npm run harness:build`，再刷新桌面页面。独立构建命令 `flow:build`、`tools:build` 用于对应资源。

完整应用通过 Electron 运行，不提供独立 Web 预览或旧版 Pilot/Prototype 开发服务。

## 当前功能

- Agent 会话、项目与任务分组、计划与审批、消息队列、子智能体、Goal 和工作流。
- 项目文件浏览、全文搜索、代码与文档预览、终端、Git 工具与内置浏览器。
- 自动化任务、运行记录、插件市场、MCP 服务及自定义命令、智能体和 Hooks。
- 模型服务、指令与记忆、权限、外观、通知、归档、用量与资源管理设置。
- 现有小说创作页面，以及第一方应用、Wujie 和 iframe 宿主。
- 局域网远程对话：Electron 持有执行能力，独立浏览器客户端连接桌面服务。

数据与密钥保存在本机；在线模型调用会向用户配置的供应商发送请求。

正式工作台地址为 `/workspace/harness-react`。首次发行仅提供当前入口和数据格式，不保留开发阶段旧路由、别名或数据迁移。

## 目录

```text
apps/harness-react/       React 工作台、远程客户端及第一方桥
src/                     Vue Shell、设置、小说页面与共享契约
src/resource-manager/    独立资源管理窗口
electron/               主进程、preload、IPC、执行服务与存储
packages/                工作流编译器与运行时
resources/               随应用分发的插件与 Python 资源说明
scripts/                 构建和安装准备脚本
tests/                   现行功能回归测试
docs/                    接口、能力说明与现行需求文档
third-party-licenses/    第三方许可、通知与改编记录
build/                   安装器资源
```

## 文档

- [产品定位](PRODUCT.md) · [界面规范](DESIGN.md) · [清理记录](docs/CODEBASE_CLEANUP.md)
- [React 工作台结构](apps/harness-react/README.md)
- [第一方 SDK 契约](docs/MIRA_FIRST_PARTY_SDK_CONTRACT.md)
- [文件访问边界](docs/MIRA_FILE_ACCESS.md)
- [内置浏览器自动化](docs/MIRA_EMBEDDED_BROWSER_AUTOMATION.md)
- [插件市场](docs/MIRA_PLUGIN_MARKETPLACE.md)
- [局域网远程对话](docs/MIRA_LAN_REMOTE_IMPLEMENTATION.md)
- [内置模型协议地址](docs/BUILTIN_MODEL_PROTOCOLS.md)
- [内测反馈指南](内测反馈指南.md) · [Issue 标签方案](标签方案.md)

仓库原创代码采用 [MIT](LICENSE)；第三方代码遵循各自的[许可与改编记录](third-party-licenses/README.md)。
