# Mira Harness 工作台（React）

Mira Harness 默认工作台的 React 实现，经第一方授权桥（sandbox iframe + MessageChannel + grant）挂入 Vue Shell。

## 结构

- `src/app-main.tsx` — 生产入口（iframe + MessagePort）：接收宿主 `mira:connect` 握手，经 `FirstPartyHarnessHost` 调用宿主能力，渲染 `PilotWorkbench`。
- `src/first-party-host.ts` — MessagePort RPC 封装（`mira:request`/`mira:response` 与 `mira:harness-event` 事件订阅）。
- `src/pilot-state.ts` — 外部 store 状态机（PilotController），纯函数可单测（`tests/harnessReactPilot.test.ts`）。
- `src/pilot-workbench.tsx` — 工作台 UI：会话抽屉、任务线程（@assistant-ui/react ExternalStoreRuntime）、权限/计划/澄清卡、Composer、右侧工作区（活动/文件/变更/终端/浏览器标签）。
- `src/main.tsx` + `src/workbench.tsx` — 开发态演示版（Wujie 挂载，纯演示数据），仅用于结构审阅。
- `src/pilot-main.tsx` — 开发态 pilot 入口（Wujie props 直传宿主方法，非生产级 grant）。
- `design-review.html` — 静态结构审阅稿（浏览器直接打开）。

## 构建

- 生产：`npm run harness:build` — esbuild 打包 `src/app-main.tsx` 到 `dist/harness-react-app`（进安装包 extraResources），由本地微应用服务以 `/apps/<appId>/` 提供。
- 开发：`npm run harness:dev` — 同时启动 Electron 开发版与本地资源服务（127.0.0.1:9001，路径 `/harness-react-dev/`，经 Vite 同源代理）。esbuild watch 无 HMR，改完需刷新。

开发态路由（仅 DEV）：`/workspace/harness-prototype`（演示版）、`/workspace/harness-pilot`（Wujie props 试验）。生产路由为 `/workspace/harness-react`（FirstPartyFrame iframe + grant）。

## 验证

```bash
npx tsc -p apps/harness-react/tsconfig.json   # 本应用类型检查
npm test -- --run                              # 全量测试
npm run build                                  # 主项目构建
```

测试须在隔离 `MIRA_TEST_HOME` 下运行，不得写入真实用户数据。桌面验收按 `docs/MIRA_IMPLEMENTATION_PRD.md` 的证据纪律执行（打包版与真实模型不可被静态测试替代）。
