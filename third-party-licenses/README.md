# 第三方许可与改编记录

本目录集中保留 Mira Harness 使用的第三方源码许可、版权声明与来源记录。
原始法律文本按来源原样归档；Mira 的补充说明单独记录，不改写第三方条款。

| 来源 | 许可证 | 原文及改编记录 |
| --- | --- | --- |
| [ZCode](https://github.com/zai-org/ZCode) 3.14.3 | Apache-2.0 | [LICENSE](zcode/LICENSE)、[NOTICE](zcode/NOTICE.md)、[改编记录](zcode/ADAPTATIONS.md) |
| [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) 固定核验提交 `cb1dfb6d9cb73b15681a93939983d75dbba7bf5b` | MIT | [LICENSE](material-icon-theme/LICENSE)、[图标来源及映射](material-icon-theme/README.md)；16 个本地文件类型图标随应用内联 |
| [TanStack React Virtual](https://github.com/TanStack/virtual/tree/main/packages/react-virtual) 3.14.13 | MIT | [LICENSE](tanstack/react-virtual/LICENSE)、[版本与用途](tanstack/README.md) |
| [React Resizable Panels](https://github.com/bvaughn/react-resizable-panels) 4.8.0 | MIT | [LICENSE](react-resizable-panels/LICENSE-MIT)、[版本与用途](react-resizable-panels/README.md)；主体对话与右面板使用库的公开 API |
| [TanStack Virtual Core](https://github.com/TanStack/virtual/tree/main/packages/virtual-core) 3.17.11 | MIT | [LICENSE](tanstack/virtual-core/LICENSE)、[版本与用途](tanstack/README.md) |
| [ignore](https://github.com/kaelzhang/node-ignore) 7.0.5 | MIT | [LICENSE-MIT](ignore/LICENSE-MIT)、[用途](ignore/README.md) |
| [cmdk](https://github.com/pacocoursey/cmdk) 1.1.1 | MIT | [LICENSE](cmdk/LICENSE.md)；用于本地 Git 分支搜索与键盘选择，结合现有 Radix Popover/Dialog |
| [Radix UI](https://github.com/radix-ui/primitives) Hover Card 1.1.24 / Collapsible 1.1.20 | MIT | [LICENSE](radix/LICENSE)，原文与两个安装包一致；用于轮次悬浮预览和项目/个人区折叠，未修改依赖实现 |
| [Lexical](https://github.com/facebook/lexical) 0.42.0 与此次新增的依赖 | MIT | [共享 LICENSE](lexical/LICENSE)、[完整包清单与依赖许可](lexical/README.md)；保留 23 个 Lexical 包及另外 7 个新增依赖的版权和许可原文 |
| Streamdown 查找投影依赖：remend 1.3.1、unified 11.0.5、remark-parse 11.0.0、remark-rehype 11.1.2 | Apache-2.0 / MIT | [remend](markdown-find/remend/LICENSE)、[unified](markdown-find/unified/license)、[remark-parse](markdown-find/remark-parse/license)、[remark-rehype](markdown-find/remark-rehype/license)；复用现有流式正文解析规则，以上版本从已有间接依赖明确为直接依赖 |

仓库根 [LICENSE](../LICENSE) 继续覆盖 Mira 原创代码。第三方改编部分及直接依赖
仍须遵守各自许可证；此目录不会改变其授权条件。

上游完整 `THIRD-PARTY-NOTICES.md` 是 ZCode 全部发行形态的依赖声明合集，
包含 Mira 未引入的组件。当前改编保留 ZCode 本身的完整 LICENSE 与 NOTICE，
并在改编记录中链接上游依赖合集；新增复制代码或资产时，应同时补入其必要声明。
