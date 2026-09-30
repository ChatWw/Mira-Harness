# Mira Harness 工作台（React）

Mira Harness 默认工作台的 React 实现，经第一方授权桥（sandbox iframe + MessageChannel + grant）挂入 Vue Shell。

## 结构

```text
src/
├── app/                 生产、Pilot 和演示入口
├── components/
│   ├── composer/        输入、模型、权限和执行模式
│   ├── conversation/    Markdown、消息操作和运行轨迹
│   ├── interactions/    计划审核与澄清
│   ├── session/         会话侧栏、分组与上下文菜单
│   ├── workbench/       主线程和工作区编排
│   └── workspace/       工作区 tab 与会话级终端
├── hooks/               抽屉键盘焦点约束
├── platform/            第一方 MessagePort 桥与宿主主题
├── state/               PilotController 外部 store
├── styles/              ZCode 派生令牌和工作台区域样式
└── lib/                 通用工具
```

`app/app-main.tsx` 是生产入口：接收宿主 `mira:connect` 握手，经 `platform/first-party-host.ts` 调用宿主能力，渲染 `components/workbench/HarnessWorkbench.tsx`。`app/pilot-main.tsx` 是开发态 Wujie pilot 入口，`app/main.tsx` 是纯演示入口；两者不代表生产 grant 流程。`design-review.html` 是早期静态结构稿，不是当前 UI 的视觉基准。

交互规格见 `docs/MIRA_HARNESS_WORKBENCH_INTERACTION_SPEC_2026-09-30.md`。ZCode 派生令牌与许可声明见 `src/styles/zcode-tokens.css` 和 `NOTICE.md`。

## 构建

- 生产：`npm run harness:build` — esbuild 打包 `src/app/app-main.tsx` 到 `dist/harness-react-app`（进安装包 extraResources），由本地微应用服务以 `/apps/<appId>/` 提供。
- 开发：`npm run harness:dev` — 同时启动 Electron 开发版与本地资源服务（127.0.0.1:9001，路径 `/harness-react-dev/`，经 Vite 同源代理）。esbuild watch 无 HMR，改完需刷新。

开发态路由（仅 DEV）：`/workspace/harness-prototype`（演示版）、`/workspace/harness-pilot`（Wujie props 试验）。生产路由为 `/workspace/harness-react`（FirstPartyFrame iframe + grant）。

## 验证

```bash
npx tsc -p apps/harness-react/tsconfig.json   # 本应用类型检查
npm test -- --run                              # 全量测试
npm run build                                  # 主项目构建
```

测试须在隔离 `MIRA_TEST_HOME` 下运行，不得写入真实用户数据。桌面验收按 `docs/MIRA_IMPLEMENTATION_PRD.md` 的证据纪律执行（打包版与真实模型不可被静态测试替代）。
