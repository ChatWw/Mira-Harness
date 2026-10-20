# 桌面布局动画调整（2026-10-20）

对照 ZCode `WorkspaceShellLayout.tsx` 的侧栏宽度过渡、`useAnimatedResizablePanel.ts` 的显式开关尺寸过渡、`AnimatedSidePanePanel.tsx` 的内容锁宽，以及 `ConversationBottomDockTransition.tsx` 的 260ms 入场／180ms 退场和缓动。未改动任务或工作流执行逻辑。

## 修改

- `useMiraSidebarMotion.ts`：移除“先按最终宽度重排，再 translate 整个正文”的做法，改为 200ms ease-out 的真实侧栏宽度过渡；正文随实际宽度变化换行。连续反向切换从当前可见宽度继续，结束、拖拽、窗口缩放、页面隐藏和减少动态效果时清理。
- `useMiraPaneGeometry.ts`、`layout.css`：右侧显式展开／收起时，对话面板和右面板同步以 200ms ease-out 变化 flex-grow；继续锁定右侧内容宽度，避免重型预览反复换行。普通拖拽不附加尺寸动画。减少动态效果路径延至下一帧应用尺寸，等待 react-resizable-panels 更新 collapsible 约束，防止关闭后仍占宽。
- `MiraTaskTransition.tsx`、`HarnessWorkbench.tsx`：欢迎区入场淡入并上移归位、退场淡出下移；输入框按切换前后实际位置平移，保留组件实例、输入、焦点。退出欢迎层仅保留无交互、无读屏的临时副本，180ms 后删除；快速切换、缩放、页面隐藏、减少动态效果及卸载清理。首次挂载不播放动画。

## 验证

5 个相关测试文件 56 项通过：侧栏连续反向／完整关闭后重开、面板几何与设置、任务入退场草稿焦点、对话键盘滚动。React 类型检查、React 构建、git diff --check 通过；构建保留原有 highlight CSS／包体积提示。

`scripts/verify-mira-layout-motion.mjs`：隔离 Electron，使用真实 hooks、react-resizable-panels 和 Mira CSS。10 项通过、零 renderer 错误。逐帧验证侧栏开关存在中间宽度、对话随右面板连续变化、输入实例／值／焦点保留、退出层删除、快速切换清理、减少动态效果立即切换及右面板最终宽度为 0。

证据目录：`/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-layout-motion-2itQ5D`。含 report.json 和浅／深色面板、任务入场截图。该夹具提供长段落和简化输入框，不代替完整工作台、真实长会话性能、Vue/Wujie 外壳及 Windows 验收。

扩展跑 `harnessReactComposerInteraction.test.ts` 有 11 项失败，单文件复跑同样失败，涉及既有 Goal 菜单／命令候选和引用断言；该文件不导入本次动画 hooks、布局或任务过渡组件，未修改其实现或断言，也不宣称扩展套件全绿。
