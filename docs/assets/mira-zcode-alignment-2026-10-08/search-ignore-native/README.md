# 搜索忽略规则原生验收交接

更新：2026-10-09 15:05 +08:00。
仓库：`/Volumes/VrenDisk/project/Mira/Mira-Harness`。
分支：`codex/mira-harness-first-slice`。本轮没有执行提交或推送。

## 本次完成与证据边界

授权 await 缺口和 Vue Proxy clone 问题已修复，最新统一检查为 14:51:38–14:53:27、`--maxWorkers=1`、103 文件 / 1089 项、70.36s，类型、构建和产物审计通过。默认/两 worker 的失败历史单独保留，单 worker 通过不代表并发稳定。
数字与历史区分统一见 [SEARCH_IGNORE_EVIDENCE.md](../SEARCH_IGNORE_EVIDENCE.md)。

[bridge-transport-results.json](bridge-transport-results.json) 证明真实隔离 Electron 的编译后 renderer、preload/contextBridge 与读取 IPC 可用，页面 textarea 与实际读取结果一致；这是 CDP probe，不是鼠标/键盘验收。
[results.json](results.json) 现为 14:25:17–14:28:15 的成功原生流程，`passed=true`，27 条记录、3 张截图。
使用编译后的真实 Mira Electron、preload/IPC 和第一方 React iframe；隔离 home 为 `/private/tmp/mira-native-ignore-8V6O9x`，不使用正式用户数据。
CDP 只负责夹具/API 建立、坐标定位和读取断言；点击、键盘、多行输入由原生 Swift helper 执行。

- 模板读取没有创建 `.miraignore`；原生保存后实际文件与草稿逐字一致。
- 未保存离开选择继续编辑，保留路由/草稿；撤销恢复已保存内容。
- 外部变化后保存冲突，外部文件和本地草稿都保留；确认重读后再次保存成功。
- 浏览树仍显示 `node_modules`；搜索按保存规则只显示根目录 `needle.md`，打开显示正确内容。
- [浅色模板](light-template-native.png)、[深色冲突](dark-conflict-native.png)、[深色 React 搜索预览](dark-react-search-preview-native.png) 逐张打开检查，无可见文字重叠或控件越界。

13:21 曾因 `macOS-loginwindow` guard 阻断；其独立 JSON 未保留下来，当前 `results.json` 已是上述成功流程，不能再引用它为锁屏 JSON。
[native-input-draft-failure-2026-10-09-1419.json](native-input-draft-failure-2026-10-09-1419.json) 保留多行 Unicode CGEvent 输入未完整到达的脚本失败；改为逐行输入加原生 Enter，并复核前景 PID、焦点与最终文本。
[prior-fixture-rules-present-2026-10-09-1424.json](prior-fixture-rules-present-2026-10-09-1424.json) 保留旧目录已有规则的夹具前提失败；换全新目录，没有删除旧规则伪造初始状态。
`pre-fix-results.json` 和 `focus-guard-failure.json` 是历史记录，不能拿来描述当前代码功能失败。

本次只关闭设置/搜索/浏览的有限原生验收。上游同版导航隐藏该设置，因此不称隐藏上游页的逐像素对照已完成。
旧监听错误态、图片/Git 同态 ZCode、真实模型、安装包、Windows、可靠冷启动与完整性能/P0–P3 仍未放行。
生产高亮 Worker 的独立范围见 [Worker 证据](../HIGHLIGHT_WORKER_EVIDENCE.md)。

## 重新执行

先确认桌面已解锁，不尝试控制锁屏界面。以下命令均在仓库根目录执行。
每次使用 `mktemp -d /tmp/mira-native-ignore-XXXXXX` 新建隔离目录；成功流程 home 与旧 `/tmp/mira-native-ignore-aSLqrz` 均已有规则，保留追查，不要重用或删除旧规则来通过“模板不存在”断言。不要替换为用户 home，也不要去掉 `MIRA_TEST_HOME`。

1. 检查 `http://127.0.0.1:9222/json/list` 是否已有进程占用。若存在，先确认它确实是本测试实例；未知实例时停止，不终止用户 Chrome/ZCode/Electron，也不要让脚本连接未知端口。当前 CDP 定位脚本固定使用 9222。
2. 必要时重新执行 `npm run harness:build` 和 `npx electron-vite build`，然后在单独终端启动编译后的隔离 Electron：

```bash
MIRA_TEST_HOME=/tmp/mira-native-ignore-NEWID ./node_modules/.bin/electron . --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
```

3. 将 `NEWID` 替换为已创建的准确目录。确认当前窗口是这次隔离 Mira，调试 page URL 是本仓库 `out/renderer/index.html`，没有其他同名 Electron 窗口；再在另一个终端执行：

```bash
node docs/assets/mira-zcode-alignment-2026-10-08/search-ignore-native/mira-native-ignore-smoke.mjs /tmp/mira-native-ignore-NEWID
```

脚本通过真实 preload 建立隔离项目/会话，实际编辑、保存、菜单和搜索使用原生鼠标/键盘；CDP 只负责夹具/API 建立、元素定位和结果读取。只写隔离 project 下的测试文件及本目录生成证据，不使用正式用户数据。

4. 若上次已保存 `.miraignore`，脚本的“初始模板不存在”断言会失败。不要直接重跑并删除未知文件；为新的验收使用 `mktemp -d /tmp/mira-native-ignore-XXXXXX` 创建全新隔离目录，将其同时用于启动的 `MIRA_TEST_HOME` 和 smoke 参数，先启动 Electron 生成自己的数据库，再运行脚本。保留旧目录用于追查。

## 完成条件

- 模板读取不写 `.miraignore`；原生编辑并保存后，真实文件内容与草稿逐字一致。
- 未保存离开选择继续编辑，路由和草稿保留；撤销恢复已保存内容。
- 外部文件变化导致保存冲突，本地草稿/外部文件都保留；确认重读后可以再次保存。
- 浅色模板、深色冲突、深色 React 搜索预览三张原生截图完整且无遮挡，逐张打开核对。
- React 文件树仍可浏览 `node_modules`，非空搜索遵循保存规则，只匹配根目录 `needle.md`；打开结果显示正确文件。
- `results.json` 的 `passed=true`、records 和 captures 与真实流程一致；失败或阻断记录不计成功。

上述完成条件本次已通过。重跑会更新 `results.json` 与截图，须先保留有价值的旧失败记录；完成后退出自己启动的测试 Electron，不关闭用户应用。
完成后回填证据页、限定复核、PRD/交接/README 的日期、已完成、剩余及下次入口。
七张 headless 图保留原采集身份，不拿新原生结论覆盖历史 HTTP fixture 边界。
ZCode 同态、Windows、安装包、真实模型、冷启动与整个 P0–P3 仍单独验收，不据本流程关闭整体目标。

## 下次入口

不再重复实现搜索 ignore，也不连续追加文件功能。先核对整体工作台的首屏、会话、对话执行、输入、审批、悬浮摘要和终端/浏览器面板，再按整体差距安排下一批，统一看 [对齐记录](../../../MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md)。
旧监听/编辑器错误态、图片/Git 同态、Git metadata watcher、媒体 lease/Range、DOM/profile 和发布保持独立待办；整体目标仍 active。
