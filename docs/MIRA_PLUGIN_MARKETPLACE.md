# Mira 插件市场

界面依据 ZCode 的 PluginStoreListView、PluginStoreCard、PluginStoreDetailView 和 PluginAddMenu 适配，保留项目已有 ZCode Apache-2.0 声明。Mira 的分段名称为“公共 / 本地”。

插件图标随客户端本地打包：PDF、Word、电子表格、演示文稿和插件创建器采用 ZCode `packages/ui/src/assets/plugin-icons/` 原始资源；技能创建器、电脑控制、浏览器操作采用 ZCode 官方定义中的 `https://cdn-zcode.z.ai/zcode/official-plugin/assets/` 下 `skill-creator/icon.png`、`zcode-cua/icon.png`、`browser-use/icon.png`。保留原色，不做深色反相。Mira 使用指南采用本项目 `src/asset/mira-app-icon.png`。头像内图形沿用 ZCode PluginIcon 的三分之二尺寸比例。运行时无需请求该 CDN；图标不包含 ZCode 插件实现内容。

## 内置内容

九个插件随应用打包，首次启动登记；后续启动保留停用、移除登记的选择。内置插件内容未采用 ZCode 插件包。

| 插件 | 实现来源 | 运行依赖 |
| --- | --- | --- |
| PDF | openai/skills，Apache-2.0 | Python、reportlab / pdfplumber / pypdf；视觉检查需要 Poppler |
| Word | python-openxml/python-docx，MIT；Mira 适配脚本 | Python、python-docx 1.2.0 |
| 演示文档 | scanny/python-pptx，MIT；Mira 适配脚本 | Python、python-pptx 1.0.2 |
| 电子表格 | jmcnamara/XlsxWriter，BSD-2-Clause；Mira 适配脚本 | Python、XlsxWriter 3.2.9、openpyxl 3.1.5（MIT） |
| 电脑控制 | CursorTouch/Windows-MCP，MIT | Windows、uvx、Python 3.14；首次启动需要下载 |
| 浏览器操作 | microsoft/playwright-mcp，Apache-2.0 | Node.js、npx、Chrome；首次启动需要下载 |
| 插件创建器 | OpenAI Skills 创建工作流的 Mira 适配 | Python |
| 技能创建器 | openai/skills，Apache-2.0 | Python；部分验证脚本需要 PyYAML |
| Mira 使用指南 | Mira 自有内容 | 无额外依赖 |

详细版本、来源和许可证见 `resources/plugins/UPSTREAM-SOURCES.json` 及各包许可证文件。Python 库和 MCP 服务没有随此改动打包；离线浏览、内置登记不代表所有功能都能离线执行。电脑与浏览器 MCP 必须被选入当前任务才会启动。

## 添加市场

支持绝对本地目录、HTTPS 清单地址、GitHub `owner/repo` 或仓库 URL。GitHub 方式需要本机 Git，会保存固定提交的本地检出。市场清单支持根目录或 `.mira-plugin`、`.claude-plugin`、`.zcode-plugin` 下的 `marketplace.json`。

```json
{
  "name": "my-market",
  "plugins": [{ "name": "review", "source": "plugins/review", "version": "1.0.0" }]
}
```

插件 source 必须是市场根目录内的相对目录。普通 Skills 仓库不等于插件市场，尚不支持外部仓库对象式 source。HTTPS 分发插件还需要 `files: [{ "path": "...", "sha256": "..." }]`，下载通过校验后才登记。目录遍历和符号链接路径被拒绝。

来源配置保存在 `.mira/config/plugin-marketplaces.json`。移除来源保留已经登记的插件；“移除登记”保留原文件。刷新市场获取最新目录，目前没有自动升级已登记插件。默认内置目录无需访问 Anthropic；未配置未经验证的国内代理，可将下载的市场添加为本地目录。

## 验证范围

市场与组件测试覆盖内置登记、停用/移除持久化、重新安装、本地来源、HTTPS 哈希失败回滚、无效名称和交互。文档脚本已用真实 DOCX/PPTX/XLSX 创建并回读，检查拒绝覆盖已有文件；插件创建器已检查清单和重复创建。

当前回归测试见 `tests/miraPluginMarketplace.test.ts`、`tests/harnessReactPluginInventory.test.tsx`。真实安装包中的原生工具启动与桌面操作需要另行验收。
