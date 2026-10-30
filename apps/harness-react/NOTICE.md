# Mira Harness 第三方来源说明

Mira 的大部分源码由本项目实现，部分 UI 布局与交互参考了
[ZCode](https://github.com/zai-org/ZCode)。独立实现的代码适用仓库根 MIT LICENSE。

实际沿用或改编的 ZCode 源码、模板与图标遵守 Apache License, Version 2.0，
保留 `Copyright 2026 Z.AI Co., Ltd` 及相应来源、修改说明。设计参考与源码复用的
范围分别说明，不将上游版权声明扩展到 Mira 的独立实现。

完整许可和来源集中保留于仓库根 `third-party-licenses/`，并随工作台构建产物分发：

- `zcode/LICENSE`：上游 Apache-2.0 许可证原文。
- `zcode/NOTICE.md`：上游声明原文，其中产品功能与网络行为说明描述 ZCode。
- `zcode/ADAPTATIONS.md`：实际复用源码、模板和素材，以及 Mira 的修改范围。
- `zcode/flow-sources.json`：98 个流程源码的固定版本、来源路径及原始 SHA-256。
- `material-icon-theme/`：本地文件类型图标的 MIT 许可与来源映射。
- `tanstack/`、`react-resizable-panels/`、`radix/`、`lexical/`：界面依赖许可与版本说明。
- `shiki/`、`oniguruma/`、`typescript/`：代码高亮、WASM 和标准库声明的许可。
- 其他依赖的许可与来源见 `third-party-licenses/README.md` 及各自目录。

第三方许可各自适用于对应的复用部分或依赖，不改变 Mira 原创代码的授权条件。
