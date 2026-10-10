# Mira Harness 第三方来源说明

本应用部分主题与界面实现参考或改编自 [ZCode](https://github.com/zai-org/ZCode)，
源码基线为 3.14.3 / `29628c9acdb81b703bbd4080c207a0e7ce5e276e`。

Copyright 2026 Z.AI Co., Ltd

相关上游代码采用 Apache License, Version 2.0。原始完整许可证、上游 NOTICE
和本地改编记录集中保留于仓库根 `third-party-licenses/`；发行包中保留同名目录。

- `third-party-licenses/zcode/LICENSE`：上游许可证全文，原样保留。
- `third-party-licenses/zcode/NOTICE.md`：上游声明全文，原样保留；其中关于 ZCode
  功能、发行形态与网络行为的说明描述其上游产品，不代表 Mira 提供这些功能。
- `third-party-licenses/zcode/ADAPTATIONS.md`：来源路径、基线与 Mira 改编范围。
- `third-party-licenses/material-icon-theme/LICENSE` 与 `README.md`：16 个本地文件类型图标的 MIT 原文、Material Extensions 版权及固定提交来源；图标静态内联，不请求远程素材。
- `third-party-licenses/tanstack/react-virtual/LICENSE`：`@tanstack/react-virtual`
  `3.14.13` 附带的 MIT 许可证全文与原作者版权，原样保留。
- `third-party-licenses/tanstack/virtual-core/LICENSE`：`@tanstack/virtual-core`
  `3.17.11` 附带的 MIT 许可证全文与原作者版权，原样保留。
- `third-party-licenses/tanstack/README.md`：TanStack 实际版本、依赖关系与本应用用途。
- `third-party-licenses/lexical/README.md` 与该目录内的 LICENSE：Lexical 0.42.0 及本次新增依赖的实际版本和 MIT 许可原文。输入编辑器使用其公开 API；安装依赖中的协同模块不代表 Mira 已实现协同编辑。
- `third-party-licenses/radix/LICENSE`：Radix Hover Card 1.1.24 与 Collapsible 1.1.20 安装包共同的 MIT 许可原文（Copyright (c) 2022 WorkOS），用于轮次悬浮预览及项目/个人区折叠。
- `third-party-licenses/shiki/LICENSE-MIT`：Shiki 与 Oniguruma engine 3.23.0 的 MIT 原文。
- `third-party-licenses/oniguruma/LICENSE-MICROSOFT-MIT` 与 `NOTICES.txt`：WASM 中 Microsoft bindings 和原生 Oniguruma 的许可原文。
- `third-party-licenses/oniguruma/README.md`：实际 466,610-byte WASM、版本来源与 SHA 核验。

`src/styles/mira-foundations.css` 将上游实际启用的浅色/深色主题映射为 `--mira-*`
语义变量；Tailwind 公共工具类使用 `--color-*` / `--text-ui-*` 兼容别名。
文件名、组件名与业务变量遵循 Mira 命名，原作者版权与许可文字保持原文。

`ProjectFileDrawer.tsx` 与 `FilePreviewPanel.tsx` 将上游文件树和文件预览交互
适配为 Mira 左侧项目文件抽屉与右侧独立只读预览；`lib/file-tree.ts` 和
`lib/file-preview.ts` 使用 Mira 的相对路径、捕获会话与宿主读取协议。
具体来源、修改内容及本地独立实现边界记录于上述 ZCode 改编表。

`MiraImagePreview.tsx`、`lib/image-preview.ts` 和 `styles/file-preview.css` 的图片画布
改编自 `packages/ui/src/previewPaneImageContent.tsx`：透明棋盘、40px 留白、
Retina 文件名折算及 SVG 的独立 image 数据源。Mira 增加解码失败与重试；
图片读取使用独立的会话授权、固定 4 MiB 有界宿主实现，不移植上游媒体 RPC，
也不代表支持图片模型附件、音视频或 Office 预览。

`electron/services/harnessWorkspaceSearch.ts` 的模糊评分和 top-K 排序改编自
上游 `packages/shared/src/workspaceFileSearch.ts`，保留 Apache-2.0 标识与版权。
目录扫描、范围校验和有界缓存适配 Mira 宿主；文件抽屉搜索通过 Mira 第一方协议执行。

`lib/workspace-watch.ts` 与外部编辑器入口适配上游显示目录订阅、合批刷新、
标题栏分体按钮、文件打开方式菜单和预览外部打开交互。授权所有权、目录身份复核、
生命周期清理、偏好保存和异步应用检测均连接 Mira 宿主；普通文本自动刷新是 Mira 扩展。
运行时读取本机应用图标，不将这些第三方应用图标作为静态资源分发。

`lib/file-git.ts` 与文件树状态装饰改编自上游 `workspace-file-tree/model.ts`、
`statusStyles.ts`、`WorkspaceFileTreeRowView.tsx` 和 `WorkspaceFileTreeList.tsx`：
文件 M/A/D/R/U、精确 ignored 灰色及目录单个后代状态点。Mira 使用自己的
会话授权、异步有界 Git CLI、NUL 解析、可见行批量查询和过期结果保护，
不移植上游 Git Runtime，不提供 Git 写操作或声称已完成元数据自动监听。

文件树和源码预览行通过 TanStack Virtual 的公开 API 虚拟化。
`@tanstack/react-virtual` `3.14.13` 与其依赖 `@tanstack/virtual-core` `3.17.11`
均采用 MIT License，原作者声明为 `Copyright (c) 2021-present Tanner Linsley`。
本批未修改这些依赖的运行库实现；其完整许可随应用保留于上述独立文件中。

ZCode 品牌、账号服务和完整 Agent Runtime 不属于本应用的改编范围。
Mira 原创代码继续适用仓库根 MIT LICENSE；该许可不替代上述 Apache-2.0 条款，
也不替代各直接依赖组件自己的许可证。

工作台主体分栏使用 `react-resizable-panels` 4.8.0 的公开 Group/Panel/Separator API，
原 MIT 许可保留于 `third-party-licenses/react-resizable-panels/LICENSE-MIT`。
`useMiraPaneGeometry.ts` 和 `lib/pane-geometry.ts` 的比例边界、显式开合动画与
窗口缩放空闲后收起策略参考 ZCode `useAnimatedResizablePanel.ts`、
`animatedSidePanePanelModel.ts`、`WorkspaceShellLayout.tsx`（Apache-2.0）；
Mira 适配第一方宿主偏好、旧像素宽度迁移和侧栏生命周期，不移植上游完整应用壳。

工作区搜索的 `.miraignore` 模板、默认规则与分区交互参考上游
`packages/services/src/file/workspaceFileIgnore.ts` 和 `WorkspaceFileSearchSection.tsx`，
适配为 Mira Electron 规则服务与 Vue 设置。规则解析使用显式依赖 `ignore` 7.0.5，
原始 MIT 许可保留于 `third-party-licenses/ignore/LICENSE-MIT`。

代码高亮使用 Mira 独立的 Worker 协议与 Shiki 公开 API，不移植 ZCode tokenizer。
流式代码容器、标题、复制与下载复用 Streamdown 的公开组件；异步取消、乱序保护和重试
属于 Mira 适配。生产 Worker 使用 Oniguruma WASM、保留全部语言/别名、浅深双主题及
跨行 grammarState，不截断长行；内部类状态不跨线程传输。该声明不代表完整性能或原生验收。
