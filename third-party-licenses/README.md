# 第三方许可与改编记录

本目录集中保留 Mira Harness 使用的第三方源码许可、版权声明与来源记录。
原始法律文本按来源原样归档；Mira 的补充说明单独记录，不改写第三方条款。

| 来源 | 许可证 | 原文及改编记录 |
| --- | --- | --- |
| [ZCode](https://github.com/zai-org/ZCode) 3.14.3 | Apache-2.0 | [LICENSE](zcode/LICENSE)、[NOTICE](zcode/NOTICE.md)、[改编记录](zcode/ADAPTATIONS.md) |
| [TanStack React Virtual](https://github.com/TanStack/virtual/tree/main/packages/react-virtual) 3.14.13 | MIT | [LICENSE](tanstack/react-virtual/LICENSE)、[版本与用途](tanstack/README.md) |
| [TanStack Virtual Core](https://github.com/TanStack/virtual/tree/main/packages/virtual-core) 3.17.11 | MIT | [LICENSE](tanstack/virtual-core/LICENSE)、[版本与用途](tanstack/README.md) |
| [ignore](https://github.com/kaelzhang/node-ignore) 7.0.5 | MIT | [LICENSE-MIT](ignore/LICENSE-MIT)、[用途](ignore/README.md) |

仓库根 [LICENSE](../LICENSE) 继续覆盖 Mira 原创代码。第三方改编部分及直接依赖
仍须遵守各自许可证；此目录不会改变其授权条件。

上游完整 `THIRD-PARTY-NOTICES.md` 是 ZCode 全部发行形态的依赖声明合集，
包含 Mira 未引入的组件。当前改编保留 ZCode 本身的完整 LICENSE 与 NOTICE，
并在改编记录中链接上游依赖合集；新增复制代码或资产时，应同时补入其必要声明。
