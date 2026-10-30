# Mira Harness 工作台（React）

Electron 桌面应用的正式工作台，经 Vue Shell 的 sandbox iframe、MessageChannel 与 grant 调用受控宿主能力。

`src/app/app-main.tsx` 接收 `mira:connect` 握手，通过 `platform/first-party-host.ts` 连接 Electron，再由 `PilotController` 驱动 `HarnessWorkbench`。`PilotController` 是现行生产控制器的历史命名，仍负责会话、草稿、事件与导航，不是演示实现。

`src/app/mobile-main.tsx` 是现有局域网远程对话客户端，由 Electron 的 `MiraLanRemote` 提供资源。它与已移除的静态预览原型不同。

## 构建

在仓库根目录运行：

```bash
npm run desktop:dev   # 先构建资源，再启动 Electron
npm run harness:build # 单独重建 React 资源，完成后刷新桌面页面
npm run build        # 类型检查及完整生产构建
npm test             # 现行功能回归
```

产物位于 `dist/harness-react-app`。构建会复制离线文档预览 Worker、字体、WASM 与许可证；这些资源不是测试产物。

## 结构

```text
src/app/             正式工作台和远程客户端入口
src/components/      会话、输入、文件、文档、浏览器、自动化、插件与工作流
src/hooks/           工作区、面板和交互状态
src/lib/             文件处理、预览、高亮、草稿与搜索
src/platform/        第一方授权桥、主题及远程协议
src/state/           生产控制器、会话和工作区状态
src/styles/          Mira 主题与组件样式
src/workers/         代码高亮 Worker
```

自动化展示工具共用于 `src/config/automationPresentation.ts`，模板定义位于本应用的 `components/automations/automation-templates.ts`，不再依赖旧 Vue 工作台目录。

界面规范见根 [DESIGN.md](../../DESIGN.md)，开源来源见 [NOTICE.md](NOTICE.md) 与 [第三方许可](../../third-party-licenses/README.md)。构建、组件测试、实际 Electron 操作、真实模型和安装包验收各自记录，不互相替代。
