# Mira 局域网移动入口实现与验证记录

LAN 客户端沿用 PC Harness 的视觉与组件，为同一局域网的手机、平板提供项目对话入口。Electron 继续持有模型、文件与任务执行能力；浏览器通过受限远程接口使用这些能力。本文描述当前实现与验证边界。

## 入口与连接边界

- PC 入口位于任务侧栏底部、设置按钮旁，仅保留 Lucide 手机图标：灰色未启用、黄色等待、绿色已连接。提示复用侧栏 `SidebarActionHint`，设置 `hoverOnly`，弹窗打开时暂停提示。点击入口自动启动服务并打开 Radix 非模态弹窗；弹窗没有蒙层，保留 `--shadow-dialog` 阴影。
- 默认关闭。开启后生成 IPv4 私网地址链接；地址范围为 `10/8`、`172.16/12`、`192.168/16`，实现另允许本机回环地址用于本地访问。服务不提供公网入口或 IPv6 连接承诺。
- HTTP 传输未加密；PC 弹窗明确提示仅在可信局域网开启，并说明手机可读取所有项目内的对话、按任务权限执行工作。
- 二维码与复制链接使用同一个带访问密钥的 URL；手机扫码或打开链接直接进入项目空间，不填写设备名称、不核对验证码、不等待电脑审批。密钥在本次服务运行期间有效；移动入口读取 URL fragment 后从地址栏移除，并通过 `/connect` 换取 HttpOnly 会话 cookie。
- 同时仅允许一个在线设备，设备会话有效期为 12 小时；服务以最近 15 秒活动判断在线状态。关闭弹窗继续运行服务；点击“停止”撤销会话、结束事件流并清除密钥，旧链接随即失效。停止后重新打开弹窗启动新服务并生成新链接；应用重启默认关闭。停止远程访问不会停止已提交的任务。
- 弹窗参考 ZCode `WorkspaceWebRemoteControlTrigger` / `WebRemoteControlDialog` 的左侧扫码区，保留停止、复制链接和真实二维码，省略 Bot 区域（noBot 范围）。改编文件保留 Apache-2.0 版权说明，来源见 `third-party-licenses/zcode`。复制失败显示错误；HTTP 浏览器中的消息复制另有兼容处理，不能据此宣称所有浏览器均支持剪贴板。
- 移动端仅提供项目空间内的对话；桌面文件、工具和工作区详情入口显示“此功能需要在电脑上使用”的 toast，不伪装为可用详情页。

实现入口见 `apps/harness-react/src/components/session/MiraRemoteControl.tsx`、`SidebarFooter.tsx`、`apps/harness-react/src/app/mobile-main.tsx`、`src/config/miraRemote.ts`、`electron/services/miraLanRemote.ts` 和 `electron/services/miraRemoteHarness.ts`。控制动作为 `status`、`start`、`stop`。

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

移动端新增的是布局外壳，并非直接缩小完整 PC 工作台。附件菜单支持手机文件、照片选择；队列、停止、审批和错误状态有实现，其真实设备验收边界见下文。

## 手机与平板布局

`mobile.css` 使用 `100dvh`、独立消息滚动区和底部输入区，消息与输入内容最大宽度为 820px。主要手机图标和菜单行采用 44px 操作高度；发送按钮为 40px，项目新建按钮为 32px，不宣称所有控件均达到 44px。

- 390px 手机：`max-width: 799px` 隐藏常驻侧栏，通过页头按钮打开 Radix 项目抽屉；抽屉宽度取 310px 与视口减 48px 的较小值。消息左右留 16px，输入区左右留 10px，输入字体为 16px。安全区使用 `env(safe-area-inset-*)`。
- 1024px 平板：保留 252px 项目侧栏，主对话占剩余空间；内容仍受最大宽度约束。浅深主题沿既有 class 和 tokens，首次跟随系统，页头可切换。
- 低高度视口：CSS 在高度不超过 480px 时缩小页头及编辑区。这是实现事实，不等同于真实手机软键盘验收。

布局和复用来源为 `apps/harness-react/src/components/workbench/MiraMobileWorkbench.tsx`、`apps/harness-react/src/styles/mobile.css` 与 `remote.css`。

## 验证边界

该能力包含 Electron 桌面服务和独立浏览器客户端。自动化回归见 `tests/miraLanRemote.test.ts`、`tests/harnessReactRemoteControl.test.tsx` 与 `tests/miraMobileNavigation.test.tsx`。它们不能替代真实手机扫码、跨设备防火墙与网络可达性、软键盘和实体输入、真实供应商模型及大历史性能验收。

历史迭代截图、一次性验收脚本和旧配对流程的输出已从仓库移除；历史版本可通过 Git 查看。当前实现不依赖这些材料。桌面分支约束继续适用于 Electron 主界面，既有 LAN 客户端作为独立能力保留。
