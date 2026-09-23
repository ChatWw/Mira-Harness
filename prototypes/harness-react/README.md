# Mira Harness 工作台原型

这是 `codex/mira-harness-first-slice` 分支的第一步设计与嵌入验证，不是生产 Harness 替代品。

## 目标与边界

- 用同一条“发起任务 → 查看执行 → 审批 → 打开成果 → 失败恢复”的流程验证信息层级与交互。
- React 工作台通过 Wujie 挂入现有 Vue Shell；开发态路由为 `/workspace/harness-prototype`，不进入正式应用清单，也不出现在生产路由中。
- 五种场景均为演示数据。发送、审批、停止、重试和成果预览只更新原型内存状态，不调用模型、Harness IPC 或真实文件。
- 沿用 Mira 的中性表面、青色操作强调和白天／黑夜两套界面；壳负责导航，原型负责任务过程与成果。

## 启动

在仓库根目录运行 `npm run prototype:harness`，然后在开发版中打开 `/workspace/harness-prototype`。脚本同时启动 Electron 开发版和本地 React 资源服务（端口 9001）；如果已经有开发版占用端口 9000，请先关闭旧实例。

React 的 TSX/CSS 被 esbuild 监听并打成经典脚本，提供给 Wujie。修改原型文件后需要重新进入原型路由或手动刷新；这条链路不宣称具备 Vite HMR。现有 Vue Harness 仍在 `/workspace/chat`，顶部可以随时切回。

单独检查原型类型：`npx tsc -p prototypes/harness-react/tsconfig.json`。主项目检查：`npx vue-tsc --noEmit`、`npm test -- --run`、`npm run build`。

## 本批次的验证结论

浏览器开发版中确认：React 通过 Wujie 显示；演示审批可进入完成并打开成果；白天／黑夜从壳传到子应用；离开返回后能重新挂载。主项目 47 个测试文件、210 个用例通过，类型检查与构建通过。

尚未验证：真实 Harness 事件/审批/成果接口、任务与草稿持久化、Vite HMR、原生 macOS/Windows Electron 操作、真实模型任务。尤其不能用本原型的场景切换证明任务跨应用恢复。后续先设计任务快照与事件适配，再选择 Vue 改造或 React 正式迁移。
