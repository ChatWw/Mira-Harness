# Mira 首屏有限原生检查

更新：2026-10-09 17:27 +08:00。这里只证明隔离未打包 Electron 的搜索/侧栏流程；不代表完整首屏、ZCode 同态、性能、模型/调度、安装包或 Windows 验收。

## 范围与身份

实际仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness`，隔离数据 `/private/tmp/mira-first-screen-native-tA0SSf`。自有 Electron 1440×900 逻辑窗口，原生 macOS 鼠标、快捷键和 Unicode 键入；CDP 仅用于断言、采集和夹具路由准备。使用真实 Vue Shell、生产 React opaque iframe、MessageChannel、preload/IPC 与隔离 SQLite，不读取用户会话，不修改 ZCode 草稿。

computer-use 插件在本会话没有可调用工具，原生输入由本机已存在的 Swift 辅助程序执行；不称为插件验收。脚本限制目标进程、数据路径、当前前台，采集后恢复原前台。测试实例在本轮检查后停止，隔离数据保留。

| 检查 | 时间（2026-10-09 +08:00） | 结果 |
| --- | --- | --- |
| [搜索](search-results.json) | 17:11:30–17:11:45 | passed，10 条记录/3 图；侧栏与 Shell 只打开一个 Harness 弹层；原生 `⌘K`、中文输入、Esc 保留草稿；旧 `/novel` 回退 Vue 平台搜索，不是独立 Novel 搜索 |
| [侧栏增量](sidebar-results.json) | 17:26:22–17:26:55 | passed，21 条记录/3 图；项目全部折叠、原生 CmdR 后保持明确折叠、日期时间线/项目副标题/42px 行、真实归档恢复 IPC、分组折叠独立、返回时间线不切当前会话 |
| [产物与许可](bundle-audit.json) | 17:25:16 | 新产物 291 JS 与当前源码只读构建一致，缺失/旧块/不一致 0；14 许可文件、NOTICE/HTML 一致，CSS 与新的 Tailwind 编译一致 |

本轮定向 Vitest 4 文件/53 项通过（17:19），React `tsc --noEmit`、React 构建通过。没有重跑整仓全量，旧 [16:58 首批证据](../first-screen/README.md) 的 123 文件/1313 项不覆盖本轮增量。

搜索采集 app.js SHA 为 `2aa88fd4cc82affdca5c73ff79c7474bbadac8975bb0c213b58e38926a1a933c`，CSS 为 `3873721d7e36a24f9a7830c640bedc3e8855a836c890bd14f71b6a1aa02c220e`。

侧栏采集 app.js SHA 为 `5e5987522c73338752f7be61a8238ad774324103d3fcb25dc278757080e7d6ba`，CSS 为 `21f735ff26ab9cbdeb5e6f4552dcc3c024f7c54d05802ae6a0631f528b0baa5f`。两批主进程/preload 不变，完整身份见各自 JSON。不能把两批截图称为同一最新产物的全部验收。

## 失败保留

- [首轮侧栏失败](sidebar-first-failure-2026-10-09-1719.json)及[截图](sidebar-timeline-native-light.png)：时间线之后归档按钮被右侧 Tooltip 覆盖，原生 hit-test 拒绝点击。不是按钮缺失；修复纯提示及其专属 Radix wrapper 的 `pointer-events`，不影响菜单 Popper。原 `failure-native.png` 和 `sidebar-first-failure-2026-10-09-1719.png` 与保留图的 SHA-256 完全相同，已去除重复副本；原 JSON 的采集名称和失败记录不改写。
- [重载夹具失败](sidebar-reload-fixture-failure-2026-10-09-1725.json)：侧栏处于关闭状态，脚本直接等待侧栏超时。修正测试前置步骤，通过可见“会话”按钮原生打开侧栏；没有修改产品的布局偏好行为。
- 以上失败不抹除；最终通过仅指 17:26 新批。截图中的测试任务为空对话，不证明模型回复/工具轨迹。

## 截图

搜索三图与侧栏三图已逐张检查，均为真实窗口采集，不是设计稿。

- [侧栏搜索](sidebar-search-native-light.png)
- [Shell 搜索](shell-search-native-light.png)
- [旧小说路由平台回退](novel-platform-search-native-light.png)
- [日期时间线](sidebar-timeline-native-light.png)
- [独立分组折叠](sidebar-group-collapsed-native-light.png)
- [归档恢复后时间线](sidebar-restored-native-light.png)

## 续作

Shell 统一搜索入口，搜索内容/授权范围/结果动作由当前应用负责；独立 Mira Novel Studio 应搜索作品、章节、人物、设定，不继承 Harness 的项目/文件/终端命令。当前只接 Harness，其他页面是平台导航回退；不在本仓库扩写小说检索或跨应用索引。

按 [首屏总文档](../../../MIRA_FIRST_SCREEN_ALIGNMENT_2026-10-09.md) 的未完成项继续：设置完整往返/浅深同态与其他首屏入口、运行中队列、完整执行事件；真实模型/调度、市场原生公网下载、拖拽、ZCode 同态、性能与正式包仍需各自证据。

复现需先启动独立测试实例、准备隔离项目/会话/归档夹具，再执行本目录 `mira-native-search-smoke.mjs <隔离目录>` 或附加 `sidebar`。脚本依赖本机 `/private/tmp/mira-zcode-cu` 与 9222 调试端口；不能直接针对用户正在使用的实例运行。脚本会更新对应 JSON/截图，再运行前先保留原有批次；不自动创建或删除用户数据。
