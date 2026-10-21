# Mira 设置中心执行与验收记录

日期：2026-10-21。目标：[MIRA_SETTINGS_EXECUTION_PLAN.md](./MIRA_SETTINGS_EXECUTION_PLAN.md)。平台：macOS Electron 桌面端。

## 应用扩展入口追加

「基础设置」新增「应用扩展」，路径 `/settings/app-extensions`，保留设置返回参数并加入首方导航白名单。新页 `src/pages/backend/appExtensions/index.vue` 沿用 Agent 扩展页的用户范围、搜索栏、分组列表及共享字体/布局；展示 Mira Novel Studio、Mira Vision 两个规划应用，支持名称、应用 ID、简介和分类搜索及空结果清除。

两个安装按钮均为原生 disabled；外层可聚焦容器承接鼠标 hover 和键盘 focus 的 Element Plus 提示，内容为「规划中」。无发布版本或安装数量的虚构信息，不读取示例目录，不联网、不注册应用、不触发安装；Release 目录、缓存、安装更新卸载仍待后续实现。

验证：Vue 类型检查、Electron 构建、现有设置及导航 3 文件 55 项检查通过。隔离 macOS Electron 实测菜单选中与返回路径、两个按钮禁用及 hover/focus 提示、英文/中文/ID 搜索与空状态；浅深色 × 1440×900/1100×760 四种桌面状态无横向溢出，侧栏宽度 280px，GitHub 请求和 pageerror 均为 0。截图和结果位于 `node_modules/.cache/mira-app-extensions-verification/`；Windows 原生及安装包未验收。

## 字体追加调整

依据用户对设置与前台字体差异的反馈，对照本地 ZCode `3c5b2276` 的 `packages/ui/src/styles.css`、`SettingsPage.tsx`、`settings/SettingsPageParts.tsx` 及 Mira Harness 的字体栈，增加设置专用 `settings-typography.scss`。保留现有布局、交互和代码字体，不修改全局 Vue 字体变量或 React 前台样式。

| 角色 | 最终规则 |
| --- | --- |
| 界面字体 | 系统无衬线，明确加入 Microsoft YaHei UI、PingFang SC 中文回退；不下载新字体 |
| 常规页面标题 | 24px / 600 / 32px；保留 ZCode 独立设置标题层级 |
| 分区标题 | 18px / 600；模型内部小节与配置子标题 16px / 600 |
| 表单标签、资源名称 | 14px / 500；正文与控件基准 14px / 400 |
| 设置行说明 | 14px / 400 / 24px，替换原先 12px 小字；路径及紧凑元数据仍使用 12px |
| 导航分组 | 12px / 500；菜单项 14px / 400 |
| 弹窗、下拉菜单 | 仅在设置页显示时统一字体，弹窗标题 16px / 600，选中项 500 |

模型供应商标题原先为 20px/700 和 19px/700，改为 18px/600；扩展页、智能体列表、快捷键、关于等页面去除浏览器默认 700 粗体。扩展详情正文及标签恢复 14px 基准，代码、命令和路径保留各自等宽字体。

验证：`vue-tsc --noEmit`、`electron-vite build`、设置相关 4 个测试文件共 25 项通过。隔离 macOS Electron 记录了前台与 14 个设置页的浅深色计算样式和截图，并检查模型弹窗、发送快捷键下拉，以及 1100×760 的常规、模型、智能体、数据与配置页面；主面板与内容容器无横向溢出，采样标题无遗留 700 字重，未出现 pageerror。证据位于 `node_modules/.cache/mira-settings-typography/{before,after,confirm}/`。Windows 原生字体渲染和安装包未验证。

## 交付结果

P0—P3 已完成：设置中心保留 Vue＋Element Plus，左侧固定采用 Harness 默认 280px、隐藏滚动条并保留滚动；右侧参考 ZCode 的独立内容面板、48px 顶部留白、896px 常规内容列与 32px 横向内边距。模型管理保留内部双栏滚动，资源管理保留宽页例外。没有添加移动端布局。

| 分组 | 页面 |
| --- | --- |
| 基础设置 | 常规、外观、键盘快捷键 |
| Agent 能力 | 模型服务、权限与审批、指令与记忆、扩展、智能体、自定义命令、Hooks |
| 数据与系统 | 文件搜索、数据与配置、用量统计、关于 |

Git 和 Python 正式设置入口撤下，旧地址保留查询参数并回落常规。Git 分支前缀仅找到旧 Vue 工作台消费，其余旧 Git 配置未找到新版执行消费；Python 检测和安装接口存在，但未找到新版 Agent 使用同一环境适配器的证据。底层接口、历史字段和文件均保留。

权限移至独立页面，区分全局选择、允许选择的档位及自动化任务权限。回收站移至数据与配置。个性化改为指令与记忆，备份与偏好改为数据与配置，插件入口改为扩展。移除旧布局 JSON 复制操作，修正关于、模型页和导入导出说明中的旧产品文案。

## 实现范围

| 文件 | 变化 |
| --- | --- |
| `src/pages/backend/settings/components/SettingsPageShell.vue`、`SettingsSiderMenu.vue` | 公共布局、菜单分组、控件高度、错误及焦点状态 |
| `src/router/index.ts`、`src/platform/firstPartyNavigation.ts` | 权限新路由、旧地址回落、首方白名单 |
| `src/pages/backend/permissions/index.vue`、`settings/usePermissionSettings.ts` | 权限页与回收站共享宿主配置；加载失败阻止写入；保存前读取最新配置，避免跨页覆盖 |
| `src/pages/backend/settings/useSettingsPreference.ts`、`general/index.vue` | 宿主保存成功后才更新界面偏好，失败保留原值；保存期间阻止离开 |
| `src/pages/backend/personalization/index.vue` | 读取失败重试、指令和称呼草稿保护、保存反馈、重置记忆后刷新列表 |
| `src/pages/backend/backupPreferences/index.vue` | 回收站、准确的范围说明、导入确认和取消处理；加载完成后挂载数字输入框 |
| `src/pages/backend/modelConfig/index.vue` | 未保存离开保护、内部高度约束、更新保存提示 |
| `src/pages/backend/plugins/index.vue`、`agents/index.vue`、`usage/index.vue` | 清理重复 padding/居中、标题统一、智能体编辑器列布局适应桌面内容宽度 |
| `src/pages/backend/fileSearch/index.vue`、`about/index.vue` | 明确搜索忽略规则作用范围，更新介绍；关于页链接仅保留颜色过渡 |
| `src/pages/backend/keyboardShortcuts/index.vue` | 发送快捷键及其常规设置关联说明；同文件其他完整视图说明来自并行工作 |
| `electron/services/harnessMemoryCoordinator.ts` | 错误提示同步“指令与记忆”入口名称 |

工作目录同时存在 Harness 工作台、首方桥、Shell 导航和快捷键的并行修改。本任务没有覆盖或提交这些修改。运行验收基于当前合并工作目录产物，不能把并行修改归因于本任务。

## 保存和消费证据

| 设置 | 保存与消费证据 |
| --- | --- |
| 对话输入偏好 | 界面写入后读取宿主快照；`platformIpc.ts` 的 `composer.preferences` 返回偏好，React `HarnessComposer.tsx` 读取并用于快捷键、上下文及运行中消息处理 |
| 权限 | 界面切换完全访问再撤销其可选性，宿主回落逐次确认；`harnessRuntime.ts` 手动提交读取全局模式，自动化保留独立配置；权限回归通过 |
| 指令、称呼、语气、记忆 | 实际宿主保存与重启；本地 SSE 请求的 system 消息包含全局指令、称呼和记忆；`harnessRuntime.ts` 构建提示时消费语气和身份 |
| 模型 | 通过已有 Ollama 本地入口配置可编辑 Endpoint、添加模型并保存；测试连接和真实 `runHarnessMessage` 均收到本地 SSE 响应 |
| 智能体、命令、Hooks | 界面保存项目智能体、项目命令及停用 Hook，宿主读取作用范围正确；存储及真实 Agent/子进程 Hook、项目与插件 MCP 回归通过 |
| 扩展、MCP、技能 | 插件详情和 Teleport 菜单可用，MCP 表单真实保存停用服务，技能标签页可达；现有 MCP/插件运行回归通过。未对外部包安装或 OAuth 作验收承诺 |
| 文件搜索 | 隔离项目 `.miraignore` 真实保存，取消离开保留草稿；`harnessWorkspaceSearchIgnore` 与编辑器回归通过 |
| 回收站 | 真实保存 14 天并重启读取；保留原 1—30 天范围；`harnessStore.ts` 的过期清理读取该字段 |
| 导出、导入、恢复默认 | Electron 真实下载；JSON 顶层只含 `mainMenus`、`microApps`、`preferences`；实际导入替换偏好，实际重置恢复默认偏好；任务、模型、权限、记忆及指令仍存在 |
| 外观与窗口 | 实际主题按钮切换并读取宿主；真实窗口 close 事件分别验证隐藏到后台和退出 |
| 用量统计 | 页面矩阵加载，`harnessAppUsage` 回归通过；现有宿主 `queryHarnessUsage` 链路保持 |

配置导出包含偏好中的工作台布局、打开状态和消息草稿，不能称完整任务备份。数据库导入/恢复默认先调用 `backup()`，只替换菜单、微应用和偏好；任务消息、模型及凭据、权限、记忆、技能及项目文件不随 JSON 导出。指令文件也不在 JSON 范围内。没有新增完整备份能力。

## 验证结果

- `git diff --check`：通过。
- `npx vue-tsc --noEmit`：通过。
- 16 个设置、导航、权限、主题、记忆、模型和搜索相关测试文件：179 项通过。
- 6 个能力消费测试文件：113 项通过，覆盖智能体/命令存储、用量以及真实 Agent 的 Hooks、项目 MCP、插件 MCP 链路。两批合计 292 项。
- `npx electron-vite build`：通过，包含新宿主、preload、Vue renderer。保留现有依赖 PURE 注释等警告。
- `npm run harness:build`：通过；React 产物包含并行工作目录修改，保留现有 CSS highlight 提示。
- 隔离 Electron 自动验收：21 组检查通过、无 renderer error。其中布局为 14 页面 × 2 尺寸 × 2 主题，共 56 个页面状态。
- 设置至真实工作台往返：未发送草稿和工作台尺寸保持；设置期间任务改名产生后台事件，表单焦点保持。
- 失败恢复：偏好写入失败、权限读取/写入失败及重试、指令写入失败、取消离开保护均有自动回归。实际磁盘满、系统权限拒绝未作故障注入。
- Windows：组件测试确认仅 Windows 模式挂载窗口控制；这不能代表 Windows 原生运行。
- Impeccable：仅有公共标题 24px 不在历史 DESIGN.md 字号表的 advisory；作为本次明确的层级选择保留，没有修改无关设计文档。加载、对话框和全局主题动画保留。

人工检查截图覆盖常规浅色、智能体深色、数据与配置浅色、扩展深色、智能体编辑、插件详情、模型对话框。布局检查确认侧栏 280px、隐藏滚动条、末项可达及页面无横向溢出；模型使用内部滚动。

验证中修复了回收站数字输入框的可访问状态问题：Element Plus 从加载禁用状态切回可用后保留过期 `aria-disabled`，改为配置读取成功后再挂载。脚本的旧菜单名称、Electron 下载事件及任务加载等待问题均已修正；失败重跑不计入通过数量。

## 复验

自动桌面验证脚本：`scripts/verify-mira-settings.mjs`。先构建 Electron 与 Harness，使用独立 `MIRA_TEST_HOME` 临时目录；测试会导入、重置和关闭该隔离实例，不使用日常 Mira 配置。

```sh
npm run harness:build
npx electron-vite build
MIRA_PLAYWRIGHT_PATH=/absolute/path/to/playwright node scripts/verify-mira-settings.mjs
```

如项目本地已安装 Playwright，可省略 `MIRA_PLAYWRIGHT_PATH`。脚本使用 macOS Electron 可执行文件路径。输出默认位于 `node_modules/.cache/mira-settings-verification/`，可用 `MIRA_SETTINGS_EVIDENCE_DIR` 指定：`results.json`、页面截图、真实导出和导入的测试 JSON。临时证据与隔离配置不提交 Git；产物不包含真实凭据。

两批测试日志为 `/tmp/mira-settings-tests.log`、`/tmp/mira-settings-consumers.log`；类型、构建和桌面日志为 `/tmp/mira-settings-types.log`、`/tmp/mira-settings-electron-build.log`、`/tmp/mira-settings-react-build.log`、`/tmp/mira-settings-desktop.log`。日志和截图仅描述采集状态。

## 未验范围

Windows 原生交互、系统拖拽、真实鼠标/触控板长期使用、安装包、新机器迁移、远程模型供应商、外部 MCP/OAuth、插件下载安装和复杂长期任务不在本次实际验收证据内。模型使用本地受控 SSE 服务，证明保存与运行链路可用，不能替代远程供应商稳定性和真实模型质量验收。布局矩阵不等同所有资源数量和所有错误状态穷举。
