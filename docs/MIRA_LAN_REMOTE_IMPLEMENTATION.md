# Mira 局域网移动入口实现与验证记录

本次沿用 PC Harness 的既有视觉与组件，为同一局域网的手机、平板提供项目对话入口。Electron 继续持有模型、文件与任务执行能力；浏览器通过受限远程接口使用这些能力。本文记录普通功能扩展，不建立新的视觉方向，也不修改 `DESIGN.md` 或 `.impeccable/design.json`。

## 入口与连接边界

- PC 入口位于任务侧栏底部、设置按钮旁，仅保留 Lucide 手机图标：灰色未启用、黄色等待、绿色已连接。提示复用侧栏 `SidebarActionHint`，设置 `hoverOnly`，弹窗打开时暂停提示。点击入口自动启动服务并打开 Radix 非模态弹窗；弹窗没有蒙层，保留 `--shadow-dialog` 阴影。
- 默认关闭。开启后生成 IPv4 私网地址链接；地址范围为 `10/8`、`172.16/12`、`192.168/16`，实现另允许本机回环地址用于本地访问。服务不提供公网入口或 IPv6 连接承诺。
- HTTP 传输未加密；PC 弹窗明确提示仅在可信局域网开启，并说明手机可读取所有项目内的对话、按任务权限执行工作。
- 二维码与复制链接使用同一个带访问密钥的 URL；手机扫码或打开链接直接进入项目空间，不填写设备名称、不核对验证码、不等待电脑审批。密钥在本次服务运行期间有效，没有旧版 5 分钟或一次性配对限制；移动入口读取 URL fragment 后从地址栏移除，并通过 `/connect` 换取 HttpOnly 会话 cookie。
- 同时仅允许一个在线设备，设备会话有效期为 12 小时；服务以最近 15 秒活动判断在线状态。关闭弹窗继续运行服务；点击“停止”撤销会话、结束事件流并清除密钥，旧链接随即失效。停止后重新打开弹窗启动新服务并生成新链接；应用重启默认关闭。停止远程访问不会停止已提交的任务。
- 弹窗参考 ZCode `WorkspaceWebRemoteControlTrigger` / `WebRemoteControlDialog` 的左侧扫码区，保留停止、复制链接和真实二维码，省略 Bot 区域（noBot 范围）。改编文件保留 Apache-2.0 版权说明，来源见 `third-party-licenses/zcode`。复制失败显示错误；HTTP 浏览器中的消息复制另有兼容处理，不能据此宣称所有浏览器均支持剪贴板。
- 移动端仅提供项目空间内的对话；桌面文件、工具和工作区详情入口显示“此功能需要在电脑上使用”的 toast，不伪装为可用详情页。

实现入口见 `apps/harness-react/src/components/session/MiraRemoteControl.tsx`、`SidebarFooter.tsx`、`apps/harness-react/src/app/mobile-main.tsx`、`src/config/miraRemote.ts`、`electron/services/miraLanRemote.ts` 和 `electron/services/miraRemoteHarness.ts`。控制动作仅为 `status`、`start`、`stop`，不再暴露配对审批动作。

## 既有视觉与组件复用

移动布局继续使用系统无衬线字体、灰度表面与黑白主操作。颜色由既有 `--mira-*` 及工作台别名控制：正文、弱化文字、背景、边框、hover、选中、主色和主色前景分别沿用 `--text`、`--muted`、`--app-bg`、`--border`、`--hover`、`--mira-selected`、`--accent`、`--on-accent`；toast 与弹窗复用 tooltip、shadow-soft、shadow-dialog。入口等待态局部使用黄色 `#d99b00`，在线态复用 `--mira-success`，不扩展为全局品牌色；没有新增全局字号、圆角体系。

| 内容 | 复用与适配 |
| --- | --- |
| 消息 | `UserMessage`、`AssistantMessage` 与既有 timeline 投影；保留 PC 消息内容、工具结果和文本层级 |
| 输入 | `MiraPromptEditor` 与既有 prompt 文档序列化；移动外壳管理各对话草稿、附件和发送状态 |
| 模型 | `MiraModelMenu`，显示电脑配置中启用的模型；思考强度复用 `ComposerReasoningOptions` |
| 权限 | `ComposerPermissionOptions` 与电脑权限配置约束；自动批准、完全访问按电脑配置禁用，不另造移动权限体系 |
| 计划与提问 | `TaskInteraction`，接回既有确认、修改和回答流程 |
| 菜单与图标 | Radix Dialog、DropdownMenu、Tooltip 与 Lucide；沿既有 Composer 菜单样式 |

移动端新增的是布局外壳，并非直接缩小完整 PC 工作台。附件菜单支持手机文件、照片选择；队列、停止、审批和错误状态有实现，但不应仅凭下方三张截图声称这些状态已全部视觉验收。

## 手机与平板布局

`mobile.css` 使用 `100dvh`、独立消息滚动区和底部输入区，消息与输入内容最大宽度为 820px。主要手机图标和菜单行采用 44px 操作高度；发送按钮为 40px，项目新建按钮为 32px，不宣称所有控件均达到 44px。

- 390px 手机：`max-width: 799px` 隐藏常驻侧栏，通过页头按钮打开 Radix 项目抽屉；抽屉宽度取 310px 与视口减 48px 的较小值。消息左右留 16px，输入区左右留 10px，输入字体为 16px。安全区使用 `env(safe-area-inset-*)`。
- 1024px 平板：保留 252px 项目侧栏，主对话占剩余空间；内容仍受最大宽度约束。浅深主题沿既有 class 和 tokens，首次跟随系统，页头可切换。
- 低高度视口：CSS 在高度不超过 480px 时缩小页头及编辑区。这是实现事实，不等同于真实手机软键盘验收。

布局和复用来源为 `apps/harness-react/src/components/workbench/MiraMobileWorkbench.tsx`、`apps/harness-react/src/styles/mobile.css` 与 `remote.css`。

## 实际验证与证据

本轮使用真实隔离 Electron 验证侧栏手机入口、自动启动、二维码等待、连接、停止和重新开启状态；实际浏览器打开二维码所含 URL 后直接进入项目空间，未出现设备名称、验证码或电脑审批步骤。390×844 手机浏览器视口已截图检查，不等同于实体手机扫码验证；验收结束后已停止隔离实例的测试服务。

前一轮曾使用真实应用、桥接、任务及本机受控 SSE 模型走通项目内新建对话、模型选择、移动端发消息与接收返回、桌面详情入口 toast 和 HTTP 消息复制。该轮采用旧版配对流程，其截图和聊天链路结果作为历史证据保留，不能作为最新版直连流程的验收依据；受控回复也不代表真实供应商联网调用。

本轮 gateway、publisher、IPC 相关定向测试 14 项及 UI 测试 1 项通过，React 与 Vue typecheck、React 与 Electron/Vue 生产构建通过；启动／停止加载文案细化后，最新 React typecheck、生产重建与 UI 测试再次通过，diff 检查通过。此前远程边界 13 项及相关测试 580 项通过属于前一轮记录。文档整理未自行重跑测试。完整 IPC 测试出现 5 项失败和 1 项 unhandled error；主线程已用 HEAD 版本 IPC 与 HEAD 测试的临时副本对照，得到完全相同的失败用例及错误，归为既有基线失败，完整 IPC 仍不能记为全绿。基线输出见 [ipc-baseline.txt](evidence/lan-remote/ipc-baseline.txt)。Impeccable detector 因下载 engine 失败未完成，不提供自动视觉审计通过结论。

| 证据 | 本次可支持的结论 |
| --- | --- |
| [desktop-qr-waiting.jpg](evidence/lan-remote/desktop-qr-waiting.jpg) | 本轮隔离 Electron：无蒙层、有阴影的扫码弹窗、真实二维码及等待状态 |
| [desktop-qr-connected.jpg](evidence/lan-remote/desktop-qr-connected.jpg) | 本轮隔离 Electron：浏览器通过二维码 URL 直连后的连接状态 |
| [desktop-qr-stopped.jpg](evidence/lan-remote/desktop-qr-stopped.jpg) | 本轮隔离 Electron：停止后的状态与二维码区域；密钥撤销另由服务测试验证 |
| [mobile-qr-direct.png](evidence/lan-remote/mobile-qr-direct.png) | 本轮浏览器：390×844 手机视口打开二维码 URL 后直接进入项目空间，无配对审批页 |
| [desktop-entry.jpg](evidence/lan-remote/desktop-entry.jpg) | 历史迭代：旧版入口和含蒙层弹窗，已不代表当前桌面交互 |
| [mobile-live.png](evidence/lan-remote/mobile-live.png) | 历史迭代：390px 手机浅色视口的受控对话返回、底部输入、权限与模型行 |
| [tablet-live-dark.png](evidence/lan-remote/tablet-live-dark.png) | 历史迭代：1024×768 深色视口的常驻项目侧栏、受控对话返回、输入和模型行 |

截图仅覆盖所列状态，不代表抽屉、菜单、任务审批、附件、断连和错误状态的全覆盖。历史手机浅色和平板深色图片已核对主对话、底部输入与导航几何，但不能替代当前直连版本的移动视口检查。

## 尚未验证与已有文档漂移

未完成真实手机、跨设备防火墙与网络可达性、软键盘和实体输入、真实供应商模型调用，以及大历史性能验收。浏览器视口截图不替代这些验证；现有成功链路也不说明移动端已获得完整桌面资源工作区能力。

本次与 incumbent 一致的部分是 Mira 灰度主题、系统字体、消息/编辑器/模型/权限组件、Radix/Lucide 和 Electron 持有执行能力。移动端 799px 断点、252px 侧栏与触控尺寸是局部布局适配，不回写成 PC 全局规范。

已有 `PRODUCT.md` 的“当前分支只面向 Electron 桌面”和 `DESIGN.md` 的“当前分支不开发移动端布局”与本次 LAN 浏览器扩展发生范围漂移；Electron 仍为能力宿主这一产品约束保持。`DESIGN.md` 开头的 frontmatter 区间混入大量历史记录，也已存在结构漂移。本次仅记录这些事实，不刷新设计世界、不修订这两份文件或 sidecar；后续如整理，应单独核对真实实现与历史记录。
