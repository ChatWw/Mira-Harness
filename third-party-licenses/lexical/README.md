# Lexical 行内编辑器许可来源

核验日期：2026-10-10（Asia/Shanghai）。

Mira Composer 通过 Lexical 的公开 API 实现文本、行内引用、选择和撤销历史。
直接依赖 `lexical` 与 `@lexical/react` 固定为 `0.42.0`；本目录保留这次安装新增
的 30 个非开发依赖包附带的完整许可原文。包名、版本及依赖范围以
`package-lock.json` 和实际 `node_modules/*/package.json` 核验。

以下是安装依赖清单，不表示每个包都进入生产入口的 bundle，也不表示 Mira
实现了上游所有插件、富文本格式或协同编辑功能。未修改这些包的运行库源码。

## Lexical 包

上游仓库：[facebook/lexical](https://github.com/facebook/lexical)。

以下 23 个包的版本均为 `0.42.0`，采用 MIT License，其安装包内 `LICENSE`
内容逐字节相同，因此共用原样保留的 [LICENSE](LICENSE)。版权原文为
`Copyright (c) Meta Platforms, Inc. and affiliates.`。

| 包 | 包 | 包 |
| --- | --- | --- |
| `lexical` | `@lexical/react` | `@lexical/clipboard` |
| `@lexical/code-core` | `@lexical/devtools-core` | `@lexical/dragon` |
| `@lexical/extension` | `@lexical/hashtag` | `@lexical/history` |
| `@lexical/html` | `@lexical/link` | `@lexical/list` |
| `@lexical/mark` | `@lexical/markdown` | `@lexical/offset` |
| `@lexical/overflow` | `@lexical/plain-text` | `@lexical/rich-text` |
| `@lexical/selection` | `@lexical/table` | `@lexical/text` |
| `@lexical/utils` | `@lexical/yjs` | |

共享原文 SHA-256：
`da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93`。

## 其他新增依赖

`@lexical/react` 的依赖树及 npm 解析的 peer 依赖同时新增下列 7 个包，均为 MIT。
各自版权和条款与 Lexical 不同，按安装包原文分别保留，不以共享 LICENSE 替代。

| 包 | 实际版本 | 原文 |
| --- | --- | --- |
| `@floating-ui/react` | `0.27.20` | [LICENSE](dependencies/floating-ui-react/LICENSE) |
| `@preact/signals-core` | `1.14.4` | [LICENSE](dependencies/preact-signals-core/LICENSE) |
| `react-error-boundary` | `6.1.6` | [LICENSE](dependencies/react-error-boundary/LICENSE) |
| `tabbable` | `6.5.0` | [LICENSE](dependencies/tabbable/LICENSE) |
| `yjs` | `13.6.33` | [LICENSE](dependencies/yjs/LICENSE) |
| `lib0` | `0.2.119` | [LICENSE](dependencies/lib0/LICENSE) |
| `isomorphic.js` | `0.2.5` | [LICENSE](dependencies/isomorphic.js/LICENSE) |

以上安装包没有附带单独的 NOTICE 文件；必要版权声明保留在各原始 LICENSE 中。
现有 `scripts/build-harness-react.mjs` 将整个 `third-party-licenses/` 目录递归复制到
Harness 发行目录，Electron 的 `extraResources` 再包含该 Harness 发行目录。
本次未修改构建或打包规则。
