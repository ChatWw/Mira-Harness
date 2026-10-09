# TanStack Virtual 许可来源

核验日期：2026-10-08（Asia/Shanghai）。

| 已安装包 | 实际版本 | 用途 | 许可证原文 |
| --- | --- | --- | --- |
| `@tanstack/react-virtual` | `3.14.13` | Mira 文件树和只读文件预览的 React 虚拟列表 | [LICENSE](react-virtual/LICENSE) |
| `@tanstack/virtual-core` | `3.17.11` | React Virtual 依赖的虚拟列表核心 | [LICENSE](virtual-core/LICENSE) |

- 上游仓库：[TanStack/virtual](https://github.com/TanStack/virtual)。
- 包来源分别为 `packages/react-virtual` 与 `packages/virtual-core`。
- 版本与依赖关系以本次已安装的 `node_modules/@tanstack/*/package.json` 核验；
  React Virtual `3.14.13` 声明依赖 Virtual Core `3.17.11`。
- 两份 `LICENSE` 分别保留各已安装包内的完整 MIT 原文，版权为
  `Copyright (c) 2021-present Tanner Linsley`。
- Mira 通过公开 API 使用这些包；本批没有修改或复制其运行库实现。

发行时须保留上述版权与许可原文。Mira 根 MIT LICENSE 不替代依赖自身的声明。
