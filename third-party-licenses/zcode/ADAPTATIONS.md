# ZCode 复用来源与 Mira 修改说明

Mira 的应用逻辑、宿主协议、数据存储和大部分界面由本项目实现。部分界面布局与交互
参考了 [ZCode](https://github.com/zai-org/ZCode)；设计参考不等同于源码移植，
不会因此给独立实现的文件添加 Z.AI 版权或 Apache-2.0 文件标识。

本文件记录实际沿用或改编的源码、模板和素材。一个文件含有复用片段，并不表示其中
全部内容均来自上游。下列复用部分遵守 Apache License, Version 2.0，保留来源及修改说明；
Mira 原创部分适用仓库根 [LICENSE](../../LICENSE)。

## 上游许可与版本

- 上游版权：`Copyright 2026 Z.AI Co., Ltd`。
- [LICENSE](LICENSE)：上游 Apache-2.0 许可证全文，保持原文。
- [NOTICE.md](NOTICE.md)：已归档的上游声明，保持原文。其中产品功能与网络行为说明
  描述 ZCode，不代表 Mira 的实现或发行范围。
- 流程编译器与运行时的固定基线为
  [`29628c9acdb81b703bbd4080c207a0e7ce5e276e`](https://github.com/zai-org/ZCode/commit/29628c9acdb81b703bbd4080c207a0e7ce5e276e)
  （3.14.3），逐文件路径和原始 SHA-256 见 [flow-sources.json](flow-sources.json)。
- 其他模块在开发中参考过 3.14.3、3.15.1 与后续源码，不能统一称为来自同一版本。
  本次来源核对使用上述固定基线及
  [`3c5b227649371507ddc4eb46ac5133afe6db1cab`](https://github.com/zai-org/ZCode/commit/3c5b227649371507ddc4eb46ac5133afe6db1cab)。
- 上游完整依赖合集见
  [THIRD-PARTY-NOTICES.md](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/THIRD-PARTY-NOTICES.md)。
  Mira 实际使用的其他第三方组件许可分别保存在本目录的同级目录。

## 流程源码

[flow-sources.json](flow-sources.json) 记录 98 个上游源码到 Mira 文件的映射：

- `packages/mira-flow-kit/src/`：分析、编译、facade、调度与执行工具。
- `packages/mira-flow-runtime/src/`：流程运行时协议及宿主入口。

Mira 修改包括模块与导入路径重命名、宿主接口适配及本地运行边界。对应文件保留原始版权、
Apache-2.0 标识和修改说明，包括直接沿用的 `mira-array-methods.ts`、`mira-hash.ts`
等工具文件。TypeScript 标准库生成数据保留其自身原始声明，许可见
[`../typescript/`](../typescript/)。

## 其他源码与模板

下表路径相对于仓库根；上游路径相对于 ZCode 仓库根。文件内保留的声明仅对应实际复用部分。

| Mira 文件 | 上游源码 | 复用部分与 Mira 修改 |
| --- | --- | --- |
| `src/config/automationRepeat.ts` | `packages/services/src/session/automationCron.ts` | 日历重复计算；接入 Mira 触发器类型 |
| `src/resource-manager/resourceUsageView.ts` | `packages/ui/src/resource-manager/resourceUsageView.ts` | 进程分组、排序与数值格式；适配 Mira 快照和缺失值 |
| `src/utils/documentMotion.ts` | `packages/ui/src/lib/documentHiddenMotionPause.ts` | 隐藏文档监听及清理；Mira 额外结算有限 Web Animations |
| `src/platform/miraBrowserPicker.ts` | `packages/ui/src/lib/webElementPickerScript.ts`、`packages/ui/src/lib/webElementContext.ts` | 网页元素采集及覆盖层样式；Mira 使用固定脚本、所属任务与限长校验 |
| `electron/bootstrap/miraAboutWindow.ts` | `packages/desktop/src/main/aboutWindow.ts` | 关于窗口 HTML/CSS 模板；替换 Mira 图标、版本和作者信息 |
| `electron/bootstrap/resourceNetwork.ts` 中的 `sanitizeResourceUrl` | `packages/shared/src/networkCapture.ts` | URL 凭据及查询值脱敏函数；请求采集生命周期由 Mira 实现 |
| `electron/services/harnessWorkspaceSearch.ts` | `packages/shared/src/workspaceFileSearch.ts` | 模糊评分与有界 top-K 排序；目录扫描、授权、缓存与异步预算由 Mira 实现 |
| `electron/services/harnessWorkspaceIgnore.ts` | `packages/services/src/file/workspaceFileIgnore.ts` | 默认忽略规则及模板；Mira 增加有界读取、版本复核与安全写入 |
| `electron/services/flows/miraFlowArtifacts.ts` | `apps/zcode-cli/packages/bootstrap/src/app/workflow-artifact-publish.ts` | 产物校验与记录构造；Mira 实现本地不可变存储与原子发布 |
| `electron/services/flows/miraFlowWorld.ts` | `apps/zcode-cli/packages/bootstrap/src/app/workflow-world-read.ts`、`apps/zcode-cli/packages/bootstrap/src/app/workflow-git-world-read.ts` | 工作区读取、Git 参数与结果解析；Mira 增加目录身份校验、命令授权及取消 |
| `electron/storage/miraFlowJournal.ts` | `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/dwf-journal.ts`、`apps/zcode-cli/packages/dynamic-workflow/src/engine/journal-memory.ts` | 流程日志存取实现；适配 BetterSQLite、Mira 表与中断恢复 |
| `scripts/generate-mira-flow-libs.mjs` | `apps/zcode-cli/packages/dynamic-workflow/scripts/generate-libs.mjs` | 标准库引用闭包生成；调整 Mira 路径并归档 TypeScript 许可 |
| `apps/harness-react/src/components/git/miraGitGraphLayout.ts` | `packages/ui/src/git-graph/layoutAlgorithm.ts` | Git 图布局算法；替换提交类型导入 |
| `apps/harness-react/src/components/session/sidebar-drag.ts` | `packages/ui/src/lib/workspaceSidebarDrag.ts`、`packages/ui/src/lib/restrictVerticalDragWithinContainer.ts` | 折叠行拖动排序与边界计算；适配 Mira 项目和分组身份 |
| `apps/harness-react/src/hooks/useMiraComposerToolbar.ts` | `packages/ui/src/prompt-editor/useComposerToolbarFit.ts` | 工具栏测量副本与逐级收起实现；使用 Mira 控件、数据属性和档位 |
| `apps/harness-react/src/lib/prompt-input-triggers.ts` | `packages/ui/src/lib/promptInputTriggers.ts` | 触发正则、别名与替换边界；Mira 增加显式选区和自身候选数据 |
| `apps/harness-react/src/lib/image-preview.ts` | `packages/ui/src/previewPaneImageContent.tsx` | Retina 文件名倍率解析；提取工具函数并增加 SVG 数据源 |
| `apps/harness-react/src/lib/mira-file-tree-icon.ts` | `packages/ui/src/lib/fileDisplayHelpers.ts` | 文件名/扩展名图标映射与回退；Mira 使用本地 Material Icon Theme 图标 |
| `apps/harness-react/src/lib/mira-terminal-links.ts` | `packages/ui/src/terminal/terminalLinks.ts` | URL 尾部裁剪与终端缓冲区链接映射；Mira 修正最终宽字符范围并限定导航归属 |
| `apps/harness-react/src/lib/mira-document-links.ts` | `packages/ui/src/lib/officeFilePreview.ts` | 文档链接清理与事件拦截；Mira 增加所属工作区回调和内部锚点处理 |
| `apps/harness-react/src/lib/presentation/mira-presentation-controls.ts` | `packages/ui/src/presentation/presentationPreviewControls.ts` | 页码和缩放计算；Mira 增加非有限页数保护 |
| `apps/harness-react/src/lib/presentation/mira-presentation-elements.ts` | `packages/ui/src/presentation/presentationElementModel.ts` | 元素映射与命中计算；Mira 调整名称及表格累计偏移 |
| `apps/harness-react/src/lib/presentation/mira-presentation-engine.ts` | `packages/ui/src/presentation/pptxRendererPreviewEngine.ts` | 渲染引擎适配；Mira 使用严格类型和显式文档释放 |
| `apps/harness-react/src/lib/presentation/mira-presentation-selection.ts` | `packages/ui/src/presentation/presentationTextSelection.ts` | 元素区域内选中文字提取；适配 Mira 类型 |
| `apps/harness-react/src/lib/presentation/mira-presentation-types.ts` | `packages/ui/src/presentation/types.ts` | 渲染器接口；使用 Mira 名称 |
| `apps/harness-react/src/components/workspace/MiraPresentationReader.tsx` | `packages/ui/src/components/ui/pptx-preview-viewer.tsx` | 幻灯片渲染、缩略图与元素选择实现；Mira 接入自身授权输入、受控链接与导航 |
| `apps/harness-react/src/components/workspace/MiraWordReader.tsx` | `packages/ui/src/previewPaneOfficeDocxContent.tsx` | DOCX 渲染配置、页面处理与生命周期；Mira 增加 ShadowRoot 和迟到结果清理 |
| `apps/harness-react/src/components/workflows/MiraWorkflowAgentFace.tsx`、`apps/harness-react/src/components/workflows/workflow-face-motion.ts` | `packages/ui/src/components/workflow-timeline/WorkflowAgentFace.tsx`、`packages/ui/src/components/workflow-timeline/workflow-face-motion.ts` | 工作流头像与动画实现；适配 Mira 组件名和状态 |
| `apps/harness-react/src/components/workflows/mira-workflow-timeline-model.ts` | `packages/ui/src/components/workflow-timeline/timeline-model.ts`、`packages/ui/src/components/workflow-timeline/timeline-bands.ts`、`packages/ui/src/components/workflow-timeline/timeline-geometry.ts` | 阶段带折叠与轨道/弧线投影；使用 Mira 编译图及运行日志 |
| `apps/harness-react/src/components/workflows/workflow-timeline.css` | `packages/ui/src/styles.css` | 工作流头像样式；阶段站点与轨道接入 Mira 主题 |
| `apps/harness-react/src/styles/mira-foundations.css` | `packages/ui/src/styles.css` | 浅深主题变量和表达式；映射为 Mira 语义变量及桌面字号 |
| `apps/harness-react/src/styles/thread.css` 的渐变文字样式 | `packages/ui/src/styles.css` 的 `animated-gradient-text` / `gradient-flow` | 渐变文字和动画；适配 Mira 类名及动态效果控制 |

## 插件图标

`apps/harness-react/src/components/extensions/plugin-icons.json` 内嵌了实际沿用的图标素材：

- PDF、Word、电子表格、演示文稿、插件创建器：ZCode 的
  `packages/ui/src/assets/plugin-icons/` 原始资源。
- 技能创建器、电脑控制、浏览器操作：ZCode 官方素材地址
  `https://cdn-zcode.z.ai/zcode/official-plugin/assets/` 下的
  `skill-creator/icon.png`、`zcode-cua/icon.png`、`browser-use/icon.png`。

这些素材随应用本地打包，保留 ZCode 来源和 Apache-2.0 许可。Mira 使用指南图标为本项目
自有素材。插件内容的独立来源及许可见 `resources/plugins/UPSTREAM-SOURCES.json`；
图标来源不表示插件实现来自 ZCode。

Material Icon Theme、Lucide、Lexical、Radix 等其他第三方资源及依赖各自适用原许可，
本说明不会替代或移除它们的声明。
