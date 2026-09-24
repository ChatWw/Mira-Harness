# Mira 换电脑续作交接（2026-09-24）

> **回到另一台电脑后，先读本文。本文是当前实现状态和下一步工作的唯一续作入口。**
> 产品边界和长期规划看 [`MIRA_PLATFORM_PLAN.md`](./MIRA_PLATFORM_PLAN.md)；模块关口和发布验收看 [`MIRA_IMPLEMENTATION_PRD.md`](./MIRA_IMPLEMENTATION_PRD.md)；源码审计和开源 UI 对比看 [`MIRA_PHASE0_AUDIT.md`](./MIRA_PHASE0_AUDIT.md)。

## 1. 当前基线

- 仓库：`ChatWw/Mira-Harness`，目录：`/Volumes/VrenDisk/project/core-platform`
- 分支：`codex/mira-harness-first-slice`
- 基线提交：包含 `c4537b9` 的当前分支最新提交（以远端 `HEAD` 为准）
- 远端：`origin/codex/mira-harness-first-slice`
- 本轮交接时工作区：干净，分支与远端同步
- 当前范围：桌面 Electron；Vue + Wujie Shell；Mira-Harness 默认应用；Novel Studio 和 Vision 只做受控接入配置

不要从 `main`、`desktop-dev` 或旧聊天记录重新开始，也不要把 React/Wujie 演示原型当作生产 Harness。

## 2. 已经完成的内容

### 2.1 规划和范围

- 已明确本仓库最终只承载 Electron 平台、Vue Shell、Mira-Harness、统一设置和第一方应用接入配置。
- `mira-novel-studio` 后续独立 Git 仓库维护；本仓库保留接入配置，迁出前不删除旧 `/novel`。
- `mira-vision` 目前不开发，只保留禁用配置，不创建业务目录、应用中心条目或构建工程。
- 设置方向已收敛为基础能力、平台能力、模型与应用绑定、应用中心、应用专属、关于；只保留白天/黑夜主题，删除布局样式、主题色、自由微应用录入、菜单管理和多页签等无效能力的后续计划。
- React 与开源 Agent UI 仍是评估项。候选结论是：保留 Mira 运行时和数据语义，优先用真实任务对照 Vue 改造与 React + `assistant-ui` primitives；不直接 Fork 完整 Agent 产品。

### 2.2 代码切片

- Electron 主进程已按职责拆分为 `bootstrap/`、`ipc/`、`preload/`、`security/`、`services/`、`storage/`、`adapters/`；`electron/main.ts` 现在主要负责装配。
- 已增加第一方应用 manifest、校验和受控配置；`firstPartyAppManifests` 当前为空，因此真实外部应用尚未启用。
- 已增加 `FirstPartyFrame.vue` 和 `firstPartyBridge.ts` 的隔离 iframe + `MessageChannel` 草稿。
- 已增加模型能力的主进程 IPC 校验、Novel Studio 专属能力检查和本地 API token/grant 基础设施。
- 已增加 `MIRA_TEST_HOME` 开发态隔离数据目录，避免用真实 `~/.mira` 做实验。
- 已保留旧 IPC、Harness、旧 `/novel` 和现有数据路径，未做不可逆迁移。

### 2.3 已有验证基线

交接前的历史记录包括：`239/239` 单测通过、`vue-tsc --noEmit`、`electron-vite build`，以及隔离数据目录下开发态 Electron 可打开 Harness、旧 `/novel` 和作品列表。

这些记录不是本轮重新运行的结果，也不代表打包版、真实旧作品、真实模型或 macOS/Windows 双端均已验收。换电脑后要重新运行并分别记录证据，不能把单测或构建写成原生桌面通过。

## 3. 当前没有完成的事项

1. **宿主绑定的应用身份未闭合。** `platform:generate-first-party-text` 目前仍接收 renderer 传入的 `appId`，只按 manifest 检查，尚未证明调用者就是宿主授予该身份的具体 frame。
2. **iframe 生命周期未完成验证。** 首次加载、页面跳转、重复 `load`、卸载、route/context 更新与端口撤销还缺针对性测试。
3. **没有真实 Novel Studio 包。** 没有独立仓库、静态发布包、可信来源、安装回退或版本兼容流程。
4. **旧作品、模型和打包版未完成验收。** 不得直接操作真实 `~/.mira`；不得因为拆目录删除旧小说 UI、SQLite 表或用户数据。
5. **React 正式迁移尚未批准。** 当前 React/Wujie 页面是 disposable spike，只能证明挂载可行。

## 4. 换电脑后的准确开始方式

### 4.1 同步代码

已存在本地仓库时，按顺序执行：

```bash
cd /Volumes/VrenDisk/project/core-platform
git status --short --branch
git fetch origin codex/mira-harness-first-slice
git switch codex/mira-harness-first-slice
git merge --ff-only origin/codex/mira-harness-first-slice
```

如果工作区有本地改动，先停下来逐项检查并保留；不要使用 `git reset --hard`、`git checkout --`、强制覆盖或在不清楚状态时直接 `git pull`。

尚未克隆时，先克隆仓库，再用：

```bash
git switch --track -c codex/mira-harness-first-slice origin/codex/mira-harness-first-slice
```

### 4.2 开工顺序

1. 读 `AGENTS.md` 和本文第 3、5、6 节。
2. 读 [`MIRA_PHASE0_AUDIT.md`](./MIRA_PHASE0_AUDIT.md) 第 2、5、6 节，确认真实文件边界和安全风险。
3. 只检查以下文件，不要先接真实 Novel Studio：
   - `electron/ipc/platformIpc.ts`
   - `electron/services/platformServices.ts`
   - `src/pages/frontend/microAppHost/FirstPartyFrame.vue`
   - `src/platform/firstPartyBridge.ts`
   - `src/config/firstPartyApps.ts`
   - `electron/adapters/localMicroAppServer.ts`
4. 为“宿主授予应用身份”设计最小 grant/session 契约，再补测试；通过后才改实现。
5. 验证 iframe 生命周期和撤销；最后重新运行静态检查、单测和构建。

## 5. 下一刀：宿主绑定应用身份和生命周期

### 5.1 目标

让每个第一方 iframe 获得由宿主创建、与 `appId`、能力清单和生命周期绑定的授权会话。子应用不能通过请求参数自报另一个 `appId`，不能读取模型 API key，不能访问其他应用能力；frame 卸载、跳转或端口关闭后，旧授权必须失效。

### 5.2 推荐最小实现方向

- 宿主在创建受控 frame 时向主进程申请一次性或可撤销 grant，绑定 `appId`、允许能力、frame/session 标识和过期/撤销状态。
- `MessagePort` 请求携带 grant 标识或由宿主 bridge 注入的会话凭据；主进程以服务端保存的授权状态为准，不信任 renderer 自报的 `appId`。
- `platform:generate-first-party-text` 等 IPC 只接受已授权会话，并再次校验能力、参数和应用归属。
- `FirstPartyFrame.vue` 在 URL/manifest/frame 变化、重复 `load`、卸载和错误时关闭旧端口并撤销 grant；route/context 只发送给当前有效端口。
- 保留现有旧 IPC 和内置 `/novel` 行为；本批不开放真实外部应用，不引入安装器。

### 5.3 必须覆盖的用例

- 合法 frame 使用允许能力成功。
- 伪造 `appId`、缺少能力、未知 grant、过期 grant、撤销后调用均失败。
- 一个应用的 grant 不能调用另一个应用的模型或 Novel 能力。
- frame 跳转后旧 port/grant 失效，新页面必须重新完成受控连接。
- route/context 更新不会发送到已关闭或旧页面的 port。
- iframe 卸载后没有悬挂订阅、请求或端口。

### 5.4 本批完成标准

- 相关单测覆盖以上伪造、拒绝、撤销和生命周期场景。
- `git diff --check`、项目单测、`vue-tsc --noEmit`、`electron-vite build` 通过。
- 仍能在隔离数据目录打开 Harness 和旧 `/novel`；未验证的原生平台、打包版、真实模型和真实作品明确标为待验收。
- 提交并推送后，更新本文“当前基线”和“已有验证基线”，不要把规划写成完成。

## 6. 现在明确不要做的事

- 不要马上创建或接入真实 `mira-novel-studio` 仓库。
- 不要删除旧 `/novel`、`src/pages/frontend/aiNovel/`、小说 IPC、SQLite 表或迁移逻辑。
- 不要做 SQLite 重写、真实用户数据迁移或不可恢复的双写。
- 不要现在决定 React 全量替换，也不要把开源 Agent 产品整体 Fork 进来。
- 不要实现 Vision 业务、应用市场、远程下载器或安装脚本。
- 不要用 `~/.mira` 做测试；使用 `MIRA_TEST_HOME` 或等价的临时测试目录。

## 7. 验收记录规则

每次交接或提交都分开记录：

| 类别 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| 单元测试 | 函数、IPC 注册、授权拒绝等静态行为 | 原生窗口、真实模型、真实用户数据 |
| `vue-tsc` / 构建 | 类型和产物可生成 | 产物在 macOS/Windows 正常运行 |
| 开发态 Electron | 指定平台的窗口、导航和隔离目录场景 | 打包安装、签名、升级和另一平台 |
| 打包 Electron | 指定包可启动 | 真实模型、完整旧数据和所有桌面操作 |
| 真实模型/旧作品 | 端到端业务结果 | 其他平台或未运行的场景 |

未运行的项写“待验收”，不要写“通过”。

## 8. 一句话指令

换电脑后直接对 Codex 说：

> 继续 `codex/mira-harness-first-slice`。先读 `AGENTS.md` 和 `docs/MIRA_PHASE0_HANDOFF_2026-09-24.md`，核对工作区，不要重置现有改动。按本文第 5 节先实现宿主绑定的第一方应用 grant/session 和 `FirstPartyFrame.vue` 生命周期测试；保持旧 IPC、Harness 和 `/novel` 不变；完成后分别报告单测、类型、构建和 Electron 验证结果。
