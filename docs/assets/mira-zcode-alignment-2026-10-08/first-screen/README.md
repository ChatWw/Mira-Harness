# Mira Harness 首屏首批证据

更新：2026-10-09 16:58 +08:00。状态：首屏首批实现与限定整合检查完成；整体 ZCode 对齐目标仍 active，不代表原生、同态或性能验收完成。

产品范围、已完成和剩余清单见 [首屏总文档](../../../MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md)。本目录只记录本批证据，不沿用旧文件工作区的通过结论。

## 最终结果

| 检查 | 最终时间（+08:00） | 结果与口径 |
| --- | --- | --- |
| [自动验证](validation-results.json) | 16:50:47–16:51:20 | 7 项 exit 0：两 workers 全量 123 文件/1313 测试、React/Vue 类型、React 构建、electron-vite 构建、产物审计、diff；不是安装包验收 |
| [产物与许可审计](bundle-audit.json) | 16:51:19–16:51:20 | 291/291 JS 与当前源码只读构建一致，缺失/不一致/旧块均 0；240 动态目标齐全；14 许可文件与源文件一致，NOTICE/HTML 一致 |
| [浏览器交互](results.json) | 16:51:45–16:51:59 | 9 项操作、89 个桥请求、13 张截图，passed=true、page errors=[]；实际生产 React、opaque iframe、MessageChannel、真实第一方桥/parser |

浏览器的 app.js、app.css、高亮 Worker SHA-256 与自动验证记录完全一致。app.js 为 `2aa88fd4cc82affdca5c73ff79c7474bbadac8975bb0c213b58e38926a1a933c`；完整产物身份见两份 JSON。源码后续变化须重新验证，不凭同名文件沿用结论。

app 静态闭包为 5 JS/2,042,346 bytes，逐文件 gzip9 合计 606,252 bytes；这是产物大小，不是启动、输入、渲染或内存性能指标。旧长任务记录没有因此被清除。

## 实际覆盖

- 对话真实组件渲染：用户文本附件、轮次 hover 预览与定位；消息/run 数据为明确 fixture，不执行模型。
- Composer：键盘打开 `+` 保留光标前后文字、鼠标二次点击关闭、caret 文件候选与引用；候选目录/搜索由 fixture 返回，不能证明原生授权目录搜索。安装后的公开 Skill 来自隔离真实 SkillStore，在 Composer 可选择。
- 侧栏：归档失败/重试/恢复、侧栏与宿主共享正文搜索、自定义分组名称/颜色与解散保留会话。
- 自动化：React 创建/编辑表单保存，经真实桥/parser 验证字段；任务与运行数据为 fixture，不触发 scheduler 或真实调度。
- 市场：实际公网读取 `anthropics/skills` 固定提交目录、详情，实际下载 `brand-guidelines`，经生产安装服务校验，写入隔离真实 `SkillStore` 并启用。不是伪造成功 toast。

导航竞态修复纳入最终源码及全量回归：过期任务/项目/搜索创建不覆盖新导航，Composer 已取消的会话准备不覆盖新草稿。定向导航回归 14 项；移除保护时 10 项失败的复现已执行，未将整批称为先红后绿。模型/通用设置入口分别使用实际 `/settings/model-config`、`/settings/general`。

## 公开来源与网络边界

来源固定到提交 `683bc88e56f3e09ba94f7055977f3d3aa499f202`。19 个目录中仅 14 个包级 Apache-2.0 包允许安装；docx/pdf/pptx/xlsx 的特殊许可与无包许可 doc-coauthoring 被排除。刷新重新校验同一提交，不跟随 main；MCP 仍是本地配置管理，不是在线 MCP 市场。许可/安装策略见 [来源声明](../../../../third-party-licenses/skill-marketplace/README.md)。

本机 raw 直连超时；最终浏览器样本显式使用 `MIRA_MARKET_PROXY=http://127.0.0.1:7897`。这是测试进程中的临时代理，不修改系统代理，不能作为生产 Electron 下载的原生通过记录。生产服务注入 Electron `net.fetch`，遵循现有系统网络/代理；采集时系统代理关闭，实际桌面公网下载仍待验。

## 截图索引

13 张图均为本批实际生产 React 浏览器截图，已逐张检查。它们不是设计稿、完整 Vue Shell 截图或 ZCode 同态比较。

| 画面 | 截图 |
| --- | --- |
| 浅色任务线程，1440 | [thread-light-1440.png](thread-light-1440.png) |
| Composer 上下文面板 | [composer-context-light.png](composer-context-light.png) |
| 归档列表 | [sidebar-archive-light.png](sidebar-archive-light.png) |
| 共享命令中心 | [command-center-light.png](command-center-light.png) |
| 自定义分组 | [sidebar-groups-light.png](sidebar-groups-light.png) |
| 浅色自动化 | [automations-light.png](automations-light.png) |
| 自动化编辑 | [automation-editor-light.png](automation-editor-light.png) |
| 深色自动化 | [automations-dark.png](automations-dark.png) |
| 公开 Skill 市场 | [market-light.png](market-light.png) |
| 浅色实际安装完成 | [market-installed-light.png](market-installed-light.png) |
| 深色已安装市场 | [market-installed-dark.png](market-installed-dark.png) |
| 深色线程，1440 | [thread-dark-1440.png](thread-dark-1440.png) |
| 深色线程，1024，侧栏收起 | [thread-dark-1024.png](thread-dark-1024.png) |

## 复现

在实际仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness`、安装当前依赖后运行。验证脚本会更新本目录的结果/日志及构建产物；浏览器脚本会更新截图/结果并创建新的隔离临时数据目录，不读取用户会话。

```sh
node docs/assets/mira-zcode-alignment-2026-10-08/first-screen/mira-first-screen-verify.mjs
node docs/assets/mira-zcode-alignment-2026-10-08/first-screen/mira-first-screen-browser.mjs
```

浏览器脚本当前依赖本机已提供的 Playwright 绝对路径和 Google Chrome 应用路径，见脚本顶部；换机器时先核对路径。直连不可达且有可用本机 HTTP 代理时，使用实际代理地址。本批命令为：

```sh
MIRA_MARKET_PROXY=http://127.0.0.1:7897 node docs/assets/mira-zcode-alignment-2026-10-08/first-screen/mira-first-screen-browser.mjs
```

不要假定其他机器也监听 7897，不为通过测试自动修改系统网络。

## 历史失败与旧样本

- [16:37 失败](failure-2026-10-09T08-37-08.750Z.json)：测试 locator 对组菜单的名称/hover 状态判断错误；改定位方式后重跑。
- [16:39 失败](failure-2026-10-09T08-39-51.229Z.json)：市场候选未在超时内出现；当时 raw 直连超时，后续明确代理通路与生产网络区别。[failure.png](failure.png) 属于失败样本，不是最终画面。
- 16:33 的 122 文件/1299 测试、16:42 的 9 项/10 图先于导航收尾，仅为历史摘要；当前同名最终 JSON/截图属于 16:50–16:51 批次，不冒称保存了全部旧成功样本。

## 剩余与下一入口

会话、权限、文件查询/监听与自动化由明确 fixture 返回；浏览器剪贴板为 writeText stub，不能证明原生复制。未取得本批 Electron grant/preload/IPC 原生操作、实体鼠标/输入法/快捷键、实际调度或模型执行、同状态 ZCode 截图、首屏性能、正式安装包或 Windows 验收。computer-use 插件当前不可用，本批没有以只读桌面状态冒充操作结果，也未操作用户 ZCode 草稿。

下次先核对真实仓库/分支和隔离 Electron 数据，验证本批首屏入口、设置返回、hover/菜单/快捷键、跨视图草稿、分组重启与浅深同态。之后补运行中队列/指导/撤回、完整 reasoning/工具输入输出事件、多模态/附件-only、Header 分支/组菜单、线程查找/分页/阅读位置、导航/搜索历史、全部折叠/时间线及批量归档。不要转回文件/metadata/媒体支线。

本轮未 staging、commit 或 push；保留既有 dirty 修改，整体目标仍 active。
