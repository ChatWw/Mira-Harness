# Mira Harness 工作台原型

这是 `codex/mira-harness-first-slice` 分支的第一步设计与嵌入验证，不是生产 Harness 替代品。

## 目标与边界

- 用同一条“发起任务 → 查看执行 → 审批 → 打开成果 → 失败恢复”的流程验证信息层级与交互。
- React 工作台通过 Wujie 挂入现有 Vue Shell；开发态路由为 `/workspace/harness-prototype`，不进入正式应用清单，也不出现在生产路由中。
- 五种场景均为演示数据。发送、审批、停止、重试和成果预览只更新原型内存状态，不调用模型、Harness IPC 或真实文件。
- 沿用 Mira 的中性表面、青色操作强调和白天／黑夜两套界面；壳负责导航，原型负责任务过程与成果。

## 启动

在仓库根目录运行 `npm run prototype:harness`，然后在开发版中打开 `/workspace/harness-prototype`。脚本同时启动 Electron 开发版和本地 React 资源服务（端口 9001）；Electron 渲染器使用其实际开发端口并通过同源代理加载 React 资源。若端口已被旧开发实例占用，请先确认当前运行的是哪个实例。

React 的 TSX/CSS 被 esbuild 监听并打成经典脚本，提供给 Wujie。修改原型文件后需要重新进入原型路由或手动刷新；这条链路不宣称具备 Vite HMR。现有 Vue Harness 仍在 `/workspace/chat`，顶部可以随时切回。

## 2026-09-28 真实数据接入试验

开发态 `/workspace/harness-pilot` 使用 `@assistant-ui/react@0.15.22` 的 `ExternalStoreRuntime`、线程、消息和输入原语。Vue 宿主通过 Wujie props 只传递本试验所需的 Harness 方法；Electron 仍持有会话和运行时。Electron Vite 将 `/harness-prototype` 同源代理到本地 9001 资源服务，因此 `npm run prototype:harness` 可同时打开原演示与 pilot。测试时应先设置隔离的 `MIRA_TEST_HOME`，不得写入真实用户数据。

当前覆盖会话列表/快照、新任务、模型选择、发送、流式文本、权限确认、计划确认、澄清回答和停止；终态重新读取持久化快照，卸载取消事件订阅。2026-09-28 在隔离 Electron 中用本地脚本模型验证了发送、切离再返回后的权限恢复、允许写入、文件 diff 和工具记录。拒绝审批、停止/失败恢复、完整多选澄清、真实模型和物理鼠标仍待验收。此开发态 props 接口不是生产级第一方 grant，也未替换 `/workspace/chat`。

同日补充：创建任务需先选择个人工作区或项目，发送前核对页面所示目录；输入区可切换“直接执行 / 先出计划”，计划与多选澄清已接入宿主方法。自动化与构建已通过，拒绝写入、停止、计划和多选的完整桌面复验仍按交接文档第 11 节执行。

单独检查原型类型：`npx tsc -p prototypes/harness-react/tsconfig.json`。主项目检查：`npx vue-tsc --noEmit`、`npm test -- --run`、`npm run build`。

## 本批次的验证结论

浏览器开发版中确认：React 通过 Wujie 显示；演示审批可进入完成并打开成果；白天／黑夜从壳传到子应用；离开返回后能重新挂载。主项目 47 个测试文件、210 个用例通过，类型检查与构建通过。

尚未验证：真实 Harness 事件/审批/成果接口、任务与草稿持久化、Vite HMR、原生 macOS/Windows Electron 操作、真实模型任务。尤其不能用本原型的场景切换证明任务跨应用恢复。后续先设计任务快照与事件适配，再选择 Vue 改造或 React 正式迁移。
