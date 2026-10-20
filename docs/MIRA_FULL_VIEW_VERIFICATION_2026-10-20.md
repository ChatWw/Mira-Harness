# Mira 多目录文件管理器与完整视图验证（2026-10-20）

## 源码依据和目标

参考本地 ZCode `3c5b2276` 的实际 React 实现及说明：

- `packages/ui/src/project-sidebar/ProjectNodeContent.tsx`、`useProjectFileTree.ts`：一个根目录直接打开，多个根目录从文件按钮旁的菜单选择。
- `packages/ui/src/WorkspaceFileTree.tsx`、`lib/workspaceSidePane.ts`、`docs/ui/workspace-file-tree.md`：右侧独立文件管理器标签、左预览右目录、合并工具栏、目录折叠及宽度记忆。
- `packages/ui/src/side-pane-full-view/ConversationHost.tsx`、`model.ts`、`useSidePaneFullView.ts`、`CONTRACT.md`、`docs/ui/side-pane-full-view.md`：面板完整视图、固定对话标签、同一对话和编辑器 DOM、七个吸附位置、浮窗运行状态及回答气泡、原分屏入口下线。

实现仅面向 Electron 桌面，沿用 Mira 当前 React 工作台、主题、资源标签、控制器和授权桥；没有使用旧 Vue 项目编辑器。

## 实现及入口

1. 左侧项目文件按钮：单目录直接打开；多目录使用无背景遮罩的锚定菜单，显示完整根路径。打开后左侧仍显示项目和任务。
2. 文件管理器在右侧资源面板打开，每次打开创建独立标签。左侧预览、右侧目录；支持搜索、展开目录、拖动宽度及折叠恢复，文件操作工具栏与目录开关位于同一行。
3. 根路径贯穿列表、读取、图片/媒体、Git、外部编辑器、HTML 浏览和文件监听。宿主只接受已登记项目根目录；任务文件绑定任务持久化工作目录，项目主要目录改变不会把旧任务悄悄指向新目录。
4. 右侧标签栏的“进入完整视图”及 Cmd/Ctrl+Shift+F 切换完整视图；右侧内容占满任务列表以外的区域。固定第一项为当前对话，不能关闭或拖动；点击对话显示完整消息和底部终端，点击资源标签恢复浮窗。
5. 浮窗支持输入、展开历史、最小化、拖动并吸附七处位置。复用同一编辑器 DOM，保留草稿、附件、光标和撤销历史。运行占位使用当前时间线状态与共用时长格式；新完成回答显示两行纯文本气泡，点击展开或关闭。
6. 最小化后收到权限、问答或记忆确认时恢复输入窗口，确认内容计入可见高度。展开、收起和最小化保持当前会话状态；完整视图按任务在内存中记忆，关闭面板或最后资源标签清除，吸附位置通过宿主偏好保存。
7. 新增分屏菜单和边缘拖入入口撤下；已有分屏仍恢复、聚焦、显示和关闭。进入完整视图时仅展示当前焦点对话，退出恢复原分屏。

主要文件：`MiraFileManager.tsx`、`MiraFullViewHost.tsx`、`HarnessWorkbench.tsx`、`WorkspaceTabs.tsx`、`side-pane-full-view.css`、`workspace-state.ts`、`firstPartyHarness.ts`、`platformIpc.ts`、`miraHostedBrowsers.ts`。

## Electron 原生网页层叠

Mira 的原生 webview 在 sandbox iframe 外的宿主层。仅增大 iframe 内浮窗的 z-index 无法覆盖它，因此浏览器呈现协议携带可见浮窗/操作栏/回答区域，宿主对原生浏览器容器应用合并后的圆角裁剪孔。浮窗区域由 React 接收输入，其他网页区域继续点击；切换对话标签隐藏原浏览器，切回恢复同一 guest 及页面状态，不重新加载或换父节点。

浮窗模式只隐藏已打开的底部终端布局，不卸载终端；切到完整对话或退出完整视图恢复。面板库外层自带内联 display/flex，隐藏规则直接作用于外层，避免终端仍分配高度造成输入框下方空白。

## 验证

- 10 个相关测试文件共 519 项通过：根目录授权及 IPC、桥协议、资源标签恢复、侧栏入口、文件预览/监听、完整视图状态、吸附点、完成回答边界、原生浏览器裁剪和 HTML 浏览。
- 导航新增场景定向 11 项通过（文件/完整视图 10 项、分屏入口退役 1 项），覆盖多根右侧标签、持久化任务目录、HTML 打开/迟到取消、完整视图任务记忆与关闭清除。
- React `tsc --noEmit` 与宿主 `vue-tsc --noEmit` 通过。
- `npm run harness:build` 通过；构建已有 `::highlight` CSS 优化器提示。
- 桌面交互使用 `scripts/verify-mira-full-view.mjs`：隔离 Electron profile，实际 Layout/FirstPartyFrame、正式 `dist/harness-react-app` HTML/JS/CSS、MessagePort 桥和原生 webview；持久化和运行事件由夹具提供。

最终 Electron 交互检查 45 项通过，无未捕获渲染错误；覆盖目录选择、浮窗/完整对话切换、编辑器/附件/光标/撤销保留、拖动及顶部展开边界、运行/完成气泡、确认自动恢复、原生网页点击及状态保留、侧栏折叠、底部终端保活和旧分屏恢复关闭。已人工查看正式产物的浅色原生网页浮窗、深色展开历史及左右文件布局截图。

证据目录：`/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-full-view-ui-PXhOzC`，包含 `report.json`、`browser-floating-light.png`、`full-view-expanded-light.png`、`full-view-expanded-dark.png`、`files-split-light.png` 等。执行中曾复现打开底部终端后浮窗空白，已修复并通过本轮检查；一次并行高负载运行的鼠标吸附断言未通过，独立重跑全部检查通过，吸附算法另有单元测试覆盖。

完整导航文件已有 7 项失败（133 项通过），与前轮项目编辑验收记录相同，涉及终端尺寸模拟、任务入场包装与草稿参数/恢复断言；本次功能定向测试通过，未扩大修改这些无关问题。不能将完整导航套件称为全通过。

## 验收边界

Electron 点击检查模拟平台持久化和运行事件；实际 IPC/目录授权由单独测试覆盖。未操作用户真实项目、连接真实模型执行任务、进行 Windows 或已安装应用升级验收。跨项目/跨根文件加入对话继续沿用既有目录权限，没有额外扩大导入范围。没有提交或推送代码。
