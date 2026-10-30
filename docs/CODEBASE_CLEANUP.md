# 代码库清理记录

日期：2026-10-30。基线提交：`f031b9f`。范围：当前 Mira-Harness 仓库中的 Mira Electron 宿主、Vue Shell 和正式 React Harness。未修改相邻的 Mira-Novel-Studio。

Mira 正在准备首个发行安装包。本次直接删除开发阶段废弃实现、旧入口、历史别名和数据升级逻辑，不为未发布版本保留跳转或迁移。当前版本产生的会话、草稿、模型配置和偏好仍正常保存并支持重启恢复。

## 删除结果与依据

共删除 437 个 Git 跟踪文件，原文件合计 47.64 MiB；这个数字包含旧测试路径的删除，`layoutMigration.test.ts` 中仍有效的默认设置断言已归入 `platformDefaults.test.ts`。完整路径可通过 `git diff --diff-filter=D --name-only` 查看。

| 类别 | 核实依据与处理 |
| --- | --- |
| 旧 Vue Harness、侧栏与专属 Pinia 状态 | 正式工作台已由 React 承载，已删除旧 UI、加载失败回退和专属状态。 |
| 废弃路由与应用别名 | 删除旧 `/workspace`、聊天、项目、历史、自动化、用量及旧设置、`/system/*` 路由；不再跳转到新入口。移除 `ai-novel` 微应用别名、manifest `legacyIds` 和正式入口的旧查询参数恢复逻辑。 |
| 旧版本数据升级 | 删除 userData 搬迁适配器、SQLite 1–30 版本升级链、旧布局/菜单/偏好重写、模型 V1 JSON 与旧 ID 合并、旧 SQLite 模型表、会话 JSON 导入与备份迁移、localStorage 导入、旧尺寸和单例终端/浏览器标签转换。直接初始化现行结构。 |
| 其他历史数据兼容 | 删除旧回收站来源补齐和无时间戳记录回退、从旧执行表推断自动化会话来源、旧分组排序偏好映射、子任务缺失身份时的归属猜测。 |
| 无生产调用的 Vue preload / IPC | 核对实际调用方后删除 57 个旧直接方法及对应 IPC 处理器，并删除仅供这些方法使用的 PythonEnvironment 适配器。React 正式授权桥与设置页正在使用的接口保留。 |
| 旧设置/管理页及组件 | 删除当前路由和生产导入链均无引用的页面、ProForm/ProTable、图标选择器、hooks，以及默认 AntD/ElementPlus 演示菜单。 |
| React 演示与预览 | 删除 Prototype、Wujie Pilot、LAN 静态原型、旧 HTML 入口、开发服务和独占组件；正式入口为 `app-main.tsx`。 |
| 被替代的界面 | 删除独立归档列表和旧工作流源码编辑器；当前归档设置、工作流详情及元数据编辑保留。 |
| 历史文档和资源 | 删除过期 PRD、设计研究、移交/验收流水、`docs/assets`、`docs/evidence`、审查截图和废弃图标。保留现行产品、界面、接口、部署能力说明和第三方许可证。 |
| 旧启动与验证脚本 | 删除 17 个过期构建/预览/一次性验证脚本；它们不参与当前 npm 构建和生产调用，部分绑定个人路径或旧夹具。保留现行构建脚本及有效回归测试。 |
| 依赖与构建配置 | 删除旧 Web Vite 配置和无用环境变量文件；`dev` 启动 Electron，`build` 执行现行类型检查及完整生产构建。移除 5 个无引用的直接依赖并同步锁文件。 |

删除的直接依赖：`@assistant-ui/react`、`@streamdown/code`、`class-variance-authority`、`vuedraggable`、`pinia-plugin-persistedstate`。

自动化展示工具迁至 `src/config/automationPresentation.ts`，模板类型归入 React 模板模块，解除对已删除 Vue 目录的依赖。

## 保留依据

- `PilotController` 和 `.pilot-*` 仍是当前生产代码命名，保留其实现与有效测试。
- `mobile.html` 和 LAN 客户端由现行远程服务实际提供；本次不删除正在使用的功能，也不增加移动端验收范围。
- `legacyNovelApi*` 仍承载内置小说页面的实际模型调用；`MiraLegacyWordReader` 中的 legacy 指 `.doc` 文件格式。这些名称不代表已废弃功能。
- 当前媒体附件冻结、草稿回收与恢复、会话历史、资源管理、协议校验和外部插件协议支持仍有真实调用，保留。
- Windows 插件 `docs/wiki` 是 MCP 资源，Swift/PowerShell/C# 是原生能力源码；应用图标通过打包配置和运行时引用，均保留。
- 生产模块导入链复查中，剩余无普通导入的源码仅为类型声明文件；已核对打包资源、Worker、CSS 与动态资源引用。
- 未删除或迁移本机用户数据库、会话、密钥、个人 agent 配置。

## 验证结果

- `npm run build` 通过，覆盖 Vue、React、工作流类型检查和 Electron main/preload/renderer 生产构建。
- 最终存储与界面定向回归：5 文件、138 项全部通过，覆盖首次初始化、配置/会话重开、多目录项目、回收站、侧栏偏好和现行资源标签。
- 模型存储/设置、Agent 模型配置、侧栏偏好及分组共 5 文件、227 项在定向复查中通过；工作流运行时文件单独运行 19 项全部通过。对当前 933 个 TypeScript 文件的语法解析复查通过。
- 隔离 Electron 生产资源验证通过：正式授权连接、全新默认配置、真实会话创建和 UI 打开、草稿保存、设置保留 iframe 与返回视图、13 个废弃路径进入 404、进程重启后会话/偏好/草稿恢复。无页面错误，未产生旧迁移备份。全部使用临时 `MIRA_TEST_HOME`，结束后关闭实例并删除测试数据。
- 最终全量：358 文件，332 通过、26 失败；6069 项通过、152 项失败、2 项跳过，另有 19 个未处理错误。没有测试文件解析失败。
- 逐项比较失败用例名称，清理前的 151 项失败全部仍在；额外 1 项为 `tests/miraWorkflowRuntimeHost.test.ts:80` 的工作流结束后 `isProjectRunning` 断言。该文件定向复跑 19 项全部通过，额外失败在全量并发执行时出现；没有删除或放宽该断言。
- `git diff --check`、现行文档本地链接及测试/脚本路径复查通过。未执行安装包、Windows 原生、真实模型调用或整体性能验收。

清理前已有 151 项测试失败及 19 个未处理错误。本次保留仍覆盖现行功能的失败测试，不以删除失败断言代替修复；全量测试结果不能视为安装包发布验收。

## 复查方式

`git diff --diff-filter=D --name-only` 查看删除清单，`git diff` 查看跟踪文件修改，`git status --short` 查看新增文件。当前改动尚未提交或推送。
