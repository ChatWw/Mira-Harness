# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Mira 的个人使用者，在桌面端完成长篇小说的设定、生成、编辑和整理。

## Product Purpose

将小说创作的项目、素材和模型调用集中在 Mira 中，减少在多个网页工具与本地文件之间切换的成本。

## Positioning

以本机 SQLite 项目库和主进程模型代理承载长文本创作，不暴露模型密钥，也不依赖独立网页应用的本地存储。

## Operating Context

完整能力运行于 macOS 与后续 Windows Electron。浏览器环境不承载小说项目和模型调用。

## Capabilities and Constraints

创作模型负责总纲、章节、正文和自由助手；自动处理模型负责批量优化与拆书。页面必须继承 Mira 的主题、主色、密度与组件语言，不提供独立外观系统。

## Product Principles

- 创作流程围绕作品、章节与正文连续展开。
- 长文本和创作素材先可靠保存，再调用模型处理。
- 模型职责用业务语言命名，不沿用外部项目接口术语。
- 工具可见但不干扰当前写作区域。
