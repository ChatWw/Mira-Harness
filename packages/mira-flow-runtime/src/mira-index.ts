// Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
// Adapted for Mira: file/module and flow symbol names, Mira runtime paths.
// Source: ZCode apps/zcode-cli/packages/dynamic-workflow-runtime/src/index.ts
// See third-party-licenses/zcode/LICENSE, NOTICE.md and flow-sources.json.

/**
 * `@zcode/dynamic-workflow-runtime`：沙箱 harness。
 *
 * 对外暴露 harness 入口、线协议类型、入口文件的渲染与落盘（`renderChildEntry` /
 * `writeChildEntryFile`，测试与工具据此造出与生产同形的入口文件），以及子进程出口 `childMain`。
 * SEA 隐藏子命令（`__mira-flow-child`）不再 import 本包：入口文件自带 childMain，子命令只
 * `import()` 文件并调它的 `start`。
 */

export { miraFlowChildEnvironment } from "./mira-environment.js";

export {
  runMiraFlowScript,
  type DriverFactory,
  type RunControlBinding,
  type RunMiraFlowOptions,
} from "./mira-harness.js";
export {
  childMain,
  renderChildEntry,
  type ChildMainDeps,
  type ChildReadlineInterface,
  type ChildVmModule,
} from "./mira-child-source.js";
export {
  childEntryFileName,
  fallbackMiraFlowRunsDir,
  workflowRunsDir,
  writeChildEntryFile,
  type ChildEntryFile,
  type HarnessWarning,
  type WriteChildEntryFileInput,
} from "./mira-child-entry-file.js";
export {
  type ChildMessage,
  type ChildPayload,
  type CompleteMessage,
  type CreateActorMessage,
  type EventMessage,
  type ParentMessage,
  type RequestMessage,
  type ResponseMessage,
  type WireError,
} from "./mira-protocol.js";
