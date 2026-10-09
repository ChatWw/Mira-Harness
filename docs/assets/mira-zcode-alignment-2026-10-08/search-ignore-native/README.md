# 搜索忽略规则原生验收交接

更新：2026-10-09 13:23 +08:00。
仓库：`/Volumes/VrenDisk/project/Mira/Mira-Harness`。
分支：`codex/mira-harness-first-slice`。未提交、未推送。

## 已完成与证据边界

授权 await 缺口和 Vue Proxy clone 问题已修复，最新全量 100 文件 / 1036 项、类型与构建通过。
数字与历史区分统一见 [SEARCH_IGNORE_EVIDENCE.md](../SEARCH_IGNORE_EVIDENCE.md)。

[bridge-transport-results.json](bridge-transport-results.json) 证明真实隔离 Electron 的编译后 renderer、preload/contextBridge 与读取 IPC 可用，页面 textarea 与实际读取结果一致；这是 CDP probe，不是鼠标/键盘验收。
[results.json](results.json) 当前是锁屏 guard 记录：`macOS-loginwindow`，零 action、零 capture，未开始夹具创建。没有有效原生截图，也没有保存全流程通过结论。
`pre-fix-results.json` 和 `focus-guard-failure.json` 是历史记录，不能拿来描述当前代码功能失败。

## 解锁后从这里开始

先确认桌面已解锁，不尝试控制锁屏界面。以下命令均在仓库根目录执行。
隔离目录 `/tmp/mira-native-ignore-aSLqrz` 及其 `.mira/state.sqlite` 已存在；不要替换为用户 home，也不要去掉 `MIRA_TEST_HOME`。

1. 检查 `http://127.0.0.1:9222/json/list` 是否已有进程占用。若存在，先确认它确实是本测试实例；未知实例时停止，不终止用户 Chrome/ZCode/Electron，也不要让脚本连接未知端口。当前 CDP 定位脚本固定使用 9222。
2. 必要时重新执行 `npm run harness:build` 和 `npx electron-vite build`，然后在单独终端启动编译后的隔离 Electron：

```bash
MIRA_TEST_HOME=/tmp/mira-native-ignore-aSLqrz ./node_modules/.bin/electron . --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
```

3. 确认当前窗口是这次隔离 Mira，调试 page URL 是本仓库 `out/renderer/index.html`，没有其他同名 Electron 窗口；再在另一个终端执行：

```bash
node docs/assets/mira-zcode-alignment-2026-10-08/search-ignore-native/mira-native-ignore-smoke.mjs /tmp/mira-native-ignore-aSLqrz
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

完成后回填证据页、限定复核、PRD/交接/README 的日期、已完成、剩余及下次入口。
七张 headless 图保留原采集身份，不拿新原生结论覆盖历史 HTTP fixture 边界。
ZCode 同态、Windows、安装包、真实模型、冷启动与整个 P0–P3 仍单独验收，不据本流程关闭整体目标。
