# Mira 文件类型图标许可

核验日期：2026-10-10（Asia/Shanghai）。

来源为 [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)，
固定核验版本 `cb1dfb6d9cb73b15681a93939983d75dbba7bf5b`。
原许可为 MIT，版权原文 `Copyright (c) 2025 Material Extensions`；
完整原文保留于 [LICENSE](LICENSE)，未以 ZCode 的 Apache-2.0 许可替代图标许可。
LICENSE SHA-256：`cdab3014d4f69b49dde2b85e81792208c72de613aa6aed7f7a9b5c6609b89670`。

原图标取自用户提供的 ZCode
`packages/desktop/src/renderer/public/material-icons/`。下列 16 个原始素材已逐字节
与上述固定版本的 `icons/` 同名 SVG 核对一致；ZCode 自身未记录首次导入版本，
本次核验不将该版本宣称为 ZCode 的原始导入版本。

Mira 将素材放在 `apps/harness-react/src/assets/file-types/`，使用 Mira 文件名，
仅增加文本文件末尾换行，未修改 SVG 图形、颜色或尺寸。通过本地静态导入随应用
打包，不请求远程图标、不添加 Material Icon Theme 运行时依赖。

| 上游 icons 文件 | Mira 文件 |
| --- | --- |
| `typescript.svg` | `mira-typescript.svg` |
| `javascript.svg` | `mira-javascript.svg` |
| `react_ts.svg` | `mira-react-typescript.svg` |
| `react.svg` | `mira-react-javascript.svg` |
| `json.svg` | `mira-json.svg` |
| `markdown.svg` | `mira-markdown.svg` |
| `vue.svg` | `mira-vue.svg` |
| `python.svg` | `mira-python.svg` |
| `document.svg` | `mira-document.svg` |
| `settings.svg` | `mira-config.svg` |
| `image.svg` | `mira-image.svg` |
| `html.svg` | `mira-html.svg` |
| `css.svg` | `mira-css.svg` |
| `console.svg` | `mira-shell.svg` |
| `yaml.svg` | `mira-yaml.svg` |
| `toml.svg` | `mira-toml.svg` |

文件芯片交互参考 ZCode `packages/ui/src/ToolCallBlocks/renderers/read.tsx`
（`ReadFileChip`）及 `packages/ui/src/lib/fileDisplay.tsx`（路径显示），
Mira 使用自己的组件、类型映射和权限回调，保留独立文件名按钮与旁侧目录文字。
ZCode 原 Apache-2.0 许可另见 `third-party-licenses/zcode/`；这些图标本身采用本目录
的 MIT 许可。品牌和语言图标仅用于文件类型辨识，不表示品牌授权或官方关联。
