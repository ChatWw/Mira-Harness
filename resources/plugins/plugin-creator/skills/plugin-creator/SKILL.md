---
name: plugin-creator
description: 为 Mira 创建、修改与校验本地插件及本地测试市场。适用于插件清单、Skill、命令、Agent、MCP 和 Hook 的集成。
---

# Mira 插件创建器

工作流参考 Apache-2.0 开源的 OpenAI Skills plugin-creator，清单和市场结构适配 Mira。先明确插件用途、位置和可验证的输入输出，检查现有文件，保留用户代码。

使用内置脚本生成最小可用结构：

```
python <技能目录>/scripts/create_plugin.py <目标父目录> <插件名称>
```

生成 `<目标父目录>/<名称>/.mira-plugin/plugin.json`、`skills/<名称>/SKILL.md` 和父目录的 `marketplace.json`。脚本拒绝覆盖现有插件；修改已有插件时编辑原始文件并递增版本。生成后必须实现真实能力，不能把脚手架输出称为功能已完成。

清单支持 `name`、`description`、`version`、`skills`、`commands`、`agents`、`mcpServers`、`hooks` 和 `listing`。Skill 使用含 `name`、`description` 的 YAML frontmatter 和 Markdown 正文。命令与 Agent 使用 Markdown；MCP 使用标准 stdio／HTTP 声明。凭据使用环境变量或 Mira 的 MCP 凭据机制，不能写入包内。Mira 尚未支持 `userConfig`、LSP、自动依赖安装等字段，不为这些字段生成假配置。

市场格式：`{"name":"市场名称","plugins":[{"name":"插件名","source":"插件相对目录","version":"0.1.0","description":"用途","listing":{"displayName":"显示名","category":"开发者工具"}}]}`。本地市场的 source 相对市场根目录；在线 HTTPS 文件清单分发还需要 `files:[{"path":"插件内相对路径","sha256":"内容的SHA-256"}]`。

验证清单 JSON、路径边界、资源存在性和代表性任务。交付实际绝对路径、市场名称、插件完整 ID 和试用提示词。指导用户打开 **插件市场 → 添加 → 添加插件市场** 输入父目录，再查看对应来源并安装。只生成文件不会自动安装；插件必须在 Mira 中登记后才能通过 @ 引用。
