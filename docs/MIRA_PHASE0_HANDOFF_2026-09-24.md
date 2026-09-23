# Mira 阶段 0 实施交接（2026-09-24）

当前状态：**未完成，不可宣称外部应用已安全接入或可替换旧小说。** 本文记录本地工作区现状；原始范围和验收门槛见 [MIRA_PHASE0_AUDIT.md](./MIRA_PHASE0_AUDIT.md) 第 3、5、6 节。该审计写于实施前，其中“本轮未迁移源码”等句子不代表现在的状态。

## 已做

- 当前分支是 `codex/mira-harness-first-slice`。Electron 主进程按职责拆入 `bootstrap/`、`ipc/`、`preload/`、`security/`、`services/`、`storage/`、`adapters/`；`electron/main.ts` 保留装配职责。旧 IPC、Harness 与 `/novel` 入口仍在。
- 添加第一方 manifest 类型与校验、隔离 iframe 和 MessageChannel 桥的草稿；增加模型能力的主进程 IPC 校验。`firstPartyAppManifests` 仍是空数组，因此尚未启用真实第一方应用。
- 为开发态增加 `MIRA_TEST_HOME`，隔离 `.mira` 及旧 userData 迁移来源；打包版不接受此覆盖。
- 之前完成的验证：239/239 单测、`vue-tsc --noEmit`、`electron-vite build`；在隔离数据目录启动 Windows Electron，确认 Harness、旧 `/novel` 及作品列表可打开。以上不等于打包版或真实旧作品迁移验收。
- 本次交接前再次运行 `git diff --check`，通过；本次没有重新运行全量测试、类型检查或桌面验收。

## 未完成与风险

1. **应用身份边界未闭合。** `electron/ipc/platformIpc.ts` 的 `platform:generate-first-party-text` 接收渲染进程传入的 `appId`，再按清单检查能力；尚未把调用方与宿主授予的应用身份绑定。旧 Wujie 页面仍可能接触完整 `window.platform`。启用非空 registry 或向外部包提供模型/存储能力之前，必须完成调用来源与身份校验。
2. **iframe 生命周期待验。** `FirstPartyFrame.vue` 首次 `load` 时交付端口，后续 `load` 时关闭端口；需要验证首次加载期间跳转、导航后撤销，以及主题和路由更新，避免端口交给错误页面。
3. **没有真实 Novel Studio 包。** 没有独立仓库/静态包、可信安装和版本回退流程；第一方 manifest 清单为空。现有 `/novel` 仍是用户可用入口，不能删除旧 UI 或领域实现。
4. **作品与模型迁移未验收。** 还没有用可恢复的旧作品副本完成读取、保存、失败重试、回退和真实模型调用；macOS/Windows 打包版也未验收。不能触碰真实 `~/.mira` 作实验。
5. **工作区未提交。** `git status` 显示旧 `electron/*.ts` 删除和新目录未跟踪，这是目录迁移在未暂存状态下的表现；不要仅凭 `git diff --stat` 的删除量判断文件丢失。不要重置或清理这些改动。没有创建提交或推送。

## 明天从这里继续

1. 先读本文件、审计第 5 节，运行 `git status --short`，检查目录迁移及未跟踪文件；保留现有工作区。验证：迁移文件内容齐全，旧入口可回归。
2. 先完成宿主绑定的身份/来源边界，再检查 iframe 首次端口交付和撤销逻辑。验证：伪造 `appId`、缺能力、跳转后调用均被拒绝；合法页面调用仍可用。
3. 在前两项通过后才接入真实 Novel Studio 包；随后用隔离旧数据副本验收作品读写、失败回退、模型调用及打包桌面版。验证全部通过前保留旧 `/novel`。

测试临时目录 `C:\Users\xiaob\AppData\Local\Temp\mira-phase0-24a9c7ddb2ce4b4d92425141c564bee5` 尚未清理；此前自动审批拒绝递归删除。该目录是隔离测试数据，不是真实用户数据。无需为继续开发先清理它。
