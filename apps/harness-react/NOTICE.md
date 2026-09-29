# NOTICE

本目录（apps/harness-react）的部分样式与组件实现派生自 ZCode
（https://github.com/zcode-app/zcode，Apache License 2.0）。

依照 Apache-2.0 第 4 条保留其版权与许可声明：

- `src/styles/zcode-tokens.css`：完整拷贝自 ZCode `packages/ui/src/styles.css`
  的 `@theme` 与 `.dark` 设计令牌层（Tailwind v4 CSS-first）。
- `src/lib/utils.ts`、消息区/composer/运行轨迹组件的类名组织方式：
  参照 ZCode `packages/ui` 的 shadcn/ai-elements 模式改写。
- `streamdown` 流式 markdown 管线的接入方式参照 ZCode
  `components/ai-elements/message.tsx` 的插件配置（cjk + code/shiki）。

ZCode 源码遵循 Apache License 2.0（见 ZCode 仓库 LICENSE 与
THIRD-PARTY-NOTICES.md）。本仓库其余部分仍为 MIT。
