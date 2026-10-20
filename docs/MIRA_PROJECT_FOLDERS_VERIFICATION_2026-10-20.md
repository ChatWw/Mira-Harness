# Mira React 项目编辑与创建验证（2026-10-20）

## 源码依据与实现

参考本地 ZCode `3c5b2276` 的 `packages/ui/src/project-sidebar/ProjectEditor.tsx`、`ProjectFolderTrustDialog.tsx`、`ProjectNodeContent.tsx`，以及项目存储、源文件夹测试。按最新 React UI 的名称字段、源文件夹行、主要标记、空态、操作区及信任流程适配；没有复用 Vue/Element Plus 编辑器。

- 当前 `SessionSidebar` 的项目菜单和右键菜单打开 React `MiraProjectEditor`，删除重复项目重命名；分组重命名保留。
- 项目区“+”打开创建表单；工作台“打开项目”命令与快捷键也使用同一 React 表单。创建显示本机设备，文件夹选择不立即注册项目，用户明确确认信任后才创建。
- 支持多个源文件夹、去重、切换主要目录、移除后回退。按用户确认，编辑和创建都至少保留一个目录。
- 编辑不显示图标选择器。字号、内边距、48px 文件夹行、边框、添加行、操作区及明暗主题参考 ZCode 当前源码，沿用 Mira 主题变量。
- 弹窗没有背景遮罩，仅保留阴影；支持焦点管理、ESC、明确取消及错误重试，禁用忙碌操作。信任确认默认聚焦取消，不用全局 Enter 自动授权。
- 保存链路：React 表单 → PilotController → FirstPartyHarnessHost → 现有 MessagePort 授权桥 → `projects.update/create/select-directories` → Electron/SQLite。移除了本次错误新增的 Vue 编辑器宿主、shell 事件转发及其专用 preload API。
- SQLite roots 列兼容原有 directory。创建多目录原子落盘，失败不留半成品；主要目录变更保留已有任务工作目录，新任务使用新主要目录。附件、终端、监听、MCP 与回收站沿任务原目录解析。
- 项目执行或排队时拒绝修改。源文件夹作为环境事实提供给模型，继续遵循当前工具权限；未引入远程设备协议、多根文件树或自动扩大读写权限。

## 当前验证

通过：

- 10 个相关测试文件，767 项：React 编辑器 DOM、侧栏入口、控制器、授权桥、Electron IPC、真实 SQLite 持久化、旧任务目录兼容、提示词及 MCP。
- `tests/harnessReactFirstScreenNavigation.test.tsx` 定向 5 项：原选目录取消/迟到/草稿流程兼容、新 React 创建命令入口。
- Vue 与 React 类型检查。
- React 产物构建与 Electron main/preload/renderer 构建。
- `git diff --check`。
- `node scripts/verify-mira-project-roots.mjs`：20 项 Electron 点击检查，使用实际 Layout/AppMain/FirstPartyFrame，直接加载 `dist/harness-react-app/index.html` 及其正式 JS/CSS、完整 HarnessWorkbench，实际 MessagePort 桥，隔离 profile，模拟平台持久化。

Electron 检查覆盖实际入口、无重复重命名、最后目录不可删除、无背景遮罩及保留阴影、草稿取消、目录/主要设置保存、重开恢复、删除主要后的回退、创建前不写入、信任默认聚焦取消、取消信任保留草稿、明确确认后只创建一次、新项目出现在实际侧栏及无未捕获渲染异常。

最终界面证据：`/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-project-roots-ui-6jXfvX`（`report.json`、浅色/深色编辑器及信任截图）。

## 验证边界

Electron 点击检查模拟平台接口；真实 SQLite 和 IPC 由独立测试覆盖。未操作用户真实项目、原生目录选择器，未进行完整已安装应用、Windows 或真实模型调用验收。

扩大运行完整 `harnessReactFirstScreenNavigation.test.tsx` 时，原有 7 项失败；临时仅撤去本次工作台项目创建改动后，同样复现 7 项失败，主要涉及既有任务入场包装、底部终端尺寸与草稿参数断言。本次不修改这些无关问题；定向项目入口测试通过。构建已有 CSS `::highlight` 优化器提示，不影响构建成功。

## 正式构建样式遗漏修复

用户截图确认创建、编辑内容落入页面底部。复现发现 `MiraProjectEditor.tsx` 的 CSS 模块导入先由 esbuild 输出为 app.css，随后 Tailwind 编译覆盖同名文件，而全局 CSS 入口尚未引入 project-editor.css，导致正式页面缺失全部弹窗布局样式。之前验收夹具额外加载了 react-entry.css，未暴露该缺陷。

现已移除组件端 CSS 导入，将 project-editor.css 放入正式全局 app.css 的 import 链。未改变弹窗交互及外观设计。

- 新增最终 Tailwind 样式断言：浮层 position/width/shadow、目录行及操作区 flex、信任层级。修复前 position 为 undefined，修复后通过。
- 验收脚本改为直接加载正式构建 HTML/JS/CSS，移除测试专用 React bundle 和额外组件样式。修复前浮层 position 断言失败，修复后 20 项通过，包括实际窗口居中。
- 相关构建/编辑器测试 7 项通过，React 类型检查、正式 React 重建、git diff --check 通过。已检查正式构建浅/深色编辑器和信任截图。
- 本轮未进行已安装应用升级或 Windows 原生操作验收。
