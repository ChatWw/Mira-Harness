# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Mira 的个人使用者，在桌面端完成资料整理、文件处理、研究和写作任务，也会用它辅助编程。

## Product Purpose

以 Mira-Harness 为默认应用，让用户在一个桌面工作台提交 Agent 任务、处理必要确认、查看执行过程和成果，并能切换到其他专业应用继续工作。

## Positioning

Electron 持有桌面、模型、文件和 Harness 执行能力；Vue + Wujie 承载外层 Shell、统一设置与应用切换；React 实现默认 Harness 工作台。Harness 是产品主体，其他应用通过受控平台能力接入，而不是依赖聊天页面保持打开。

## Operating Context

完整能力运行于 macOS 与后续 Windows Electron。首阶段先完成 Harness，再接入独立维护的 Mira Novel Studio；Mira Vision 仅预留，暂不开发。应用工作区、项目文件和运行记录由本机宿主协调，在线模型调用仍会发送到用户配置的供应商。

## Capabilities and Constraints

Harness 保留现有会话、计划、审批、工具、取消、恢复与成果语义；React UI 经受控接口连接 Electron 服务，不直接取得模型密钥或完整 preload。Shell 只维护浅色/深色主题及公共入口；应用各自决定内部导航和工作区布局。当前 React/Wujie 原型仍是演示数据，真实接入尚待完成。

## Product Principles

- 任务从提交、必要确认到成果交付应保持连续，并可重新进入会话继续工作。
- 执行能力和数据由宿主持有，应用界面可以独立替换，不复制运行时。
- 平台只绘制公共窗口与入口；应用拥有本领域的导航和操作流程。
- 用户数据和既有会话在界面迁移期间保持可恢复，旧入口在验收前保留。
