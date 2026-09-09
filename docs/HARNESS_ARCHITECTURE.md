# Harness 架构与分层迁移

## 文档目的

Harness 当前同时包含会话界面、流式事件归并、Agent 运行、工具权限、计划、子任务和持久化逻辑。本文件记录重构后的边界和迁移顺序，作为 Electron 端实现与验收的共同依据。

## 当前边界

- `src/pages/frontend/harness/index.vue` 现在只组合布局、公开状态和弹层；消息、输入器、导航与页面动作分别由组件和 facade 承担。
- `src/stores/harness.ts` 保留兼容 facade；草稿/模型、运行归并、权限/计划/Memory 交互分别位于职责 Store。
- `electron/harnessRuntime.ts` 现在是 IPC 门面；权限、计划、子任务、Memory 和运行控制分别由独立协调器持有。
- `electron/harnessStore.ts` 负责会话索引和结构化会话表；旧 JSON 仅保留为恢复备份镜像，不作为运行时读取路径。
- `HarnessEvent` 是渲染进程和 Electron 主进程之间的公开运行边界；Agent、Vue Proxy、AbortController 等内部对象不得通过 IPC 传递。

当前已完成部分前端拆分：会话面板、弹窗、导航逻辑和计划/子任务展示组件已从页面中抽出。后续改动必须保留这些未提交工作区改动。

## 目标分层

```text
页面布局与展示组件
        ↓ 用户动作 / 公开状态
页面 facade 与 Pinia 状态层
        ↓ 结构化 IPC 请求与 HarnessEvent
Electron HarnessRuntime IPC 门面
        ↓
运行协调器 / 工具权限 / 计划 / 子任务 / 记忆 / 用量日志
        ↓
会话、消息、运行、活动、子任务和交互持久化
```

主任务保持控制权，子任务以受限工具和独立上下文作为 agents-as-tools 运行。本轮不引入 handoff，也不把模型内部思维过程持久化或展示。

## 公开运行事件契约

现有事件类型和 IPC 方法名继续保留。事件逐步补充以下元数据：

- `eventId`：事件唯一标识，用于去重。
- `runId`：一次运行的标识，跨消息流、工具活动和完成状态保持一致。
- `sequence`：同一运行内单调递增的顺序号；旧事件缺失时按兼容路径处理。
- `occurredAt`：主进程产生事件的时间戳。

事件 payload 只包含 UI 所需的公开数据，例如活动、子任务摘要、用量、错误和待处理交互。工具实现、模型对象、控制器和内部上下文不属于该契约。

## 状态归并规则

事件 reducer 负责：

1. 按 `eventId` 丢弃重复事件。
2. 对带 `sequence` 的事件忽略已处理的旧序列，避免乱序覆盖新状态。
3. `run-start` 建立运行快照；`run-activity` 更新活动和子任务；`status`、`error` 和 `message-complete` 结束或标记运行。
4. 会话切换时只展示当前会话的公开快照，后台会话仍保留运行/未读标记。
5. 重启后优先使用持久化的运行快照，再等待后续事件补齐状态。

## 持久化迁移

schema version 现为 25。启动时在事务中把现有会话 JSON 和 SQLite 索引迁移到 `harness_session_state`、`harness_messages`、`harness_tool_calls`、`harness_plans`、`harness_interactions`、`harness_runs`、`harness_run_activities` 和 `harness_subtasks`。迁移前为每个源文件创建 `.legacy.bak`，迁移成功后运行时只读取状态表；JSON 只作为恢复镜像写入，不作为兼容读路径。迁移失败会回滚结构化写入并保留源文件，下一次启动可重试。

## 实施与验收顺序

1. 文档、事件契约和 reducer：纯函数测试、现有测试和构建通过。
2. 前端页面 facade 与展示组件：保留视觉和交互，Electron 手工验证发送、停止、计划、权限和引用。
3. Store 拆分与事件接入：验证重复/乱序事件、会话切换和恢复。
4. Runtime 内部编排拆分：验证工具权限、计划、子任务级联停止、Memory、用量和自动化。
5. 一次性数据迁移：覆盖普通会话、引用、计划、子任务和中断运行；恢复备份与失败重试均有测试。
6. 完成 macOS Electron 全链路验收。

每阶段都执行 `npm test -- --run`、`npm run build` 和 `git diff --check`。构建通过不等同于 Electron 原生行为验收。

## 回滚边界

重构期间保留现有 IPC 方法名和旧事件类型，新增字段均可选。任何阶段出现行为回归时，可停留在上一阶段的 facade/adapter，恢复旧运行路径；数据迁移只在事务成功后切换读路径，不静默删除源数据。
