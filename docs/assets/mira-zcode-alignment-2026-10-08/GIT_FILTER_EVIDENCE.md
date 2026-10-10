# 删除文件行与只看变更：本轮证据

日期：2026-10-09，Asia/Shanghai。范围：正式 React 工作台、真实隔离 Git helper、第一方参数解析与 MessageChannel；不是原生 Electron 或完整 ZCode 放行。整体目标仍 active，未提交、未推送。

## 完成

- `file-git.ts` 在已加载的直接父目录补不存在的 deleted 文件，不造祖先、不覆盖真实目录项、不改原快照；按父目录 Set 去重和批量复制。
- 文件树「只看变更」保留直接变更与其祖先，排除普通/ignored 行；搜索只按直接状态筛选，不把已不存在的文件注入真实搜索索引。可访问兄弟序号重新计算。
- 删除行点击、Enter、Space 只选中；打开/打开方式禁用。路径复制及非位图加入对话保留，加入仅生成可移除引用 chip；发送仍由既有宿主校验真实文件。
- 切换不清搜索、展开和选中状态；手动/watch 刷新保留筛选与上一份成功视图，明确失败/非仓库及 session/root 改变才清除。错误后普通浏览仍可用，重试恢复 Git 能力但不重新开启旧筛选。
- 沿用 Radix、TanStack Virtual、Lucide 和既有浅深色 token；264px 抽屉、28px 行与图标按钮不变，没有新增宿主权限。

## 自动检查

准确命令结果见 [validation-summary.json](./git-filter-headless/validation-summary.json)，它是已观察结果摘要，不冒充原始控制台日志。

| 检查 | 最终结果 |
| --- | --- |
| 全量 `vitest run --maxWorkers=2` | 11:57:48 开始，96 文件/928 项，12.71s，exit 0 |
| Git helper/drawer 定向 | 11:57:17，2 文件/51 项，exit 0 |
| React/Vue 类型 | 两项 exit 0 |
| 正式 React 构建 | 刷新修复后的源文件已重新构建，exit 0 |
| `electron-vite build` | 编译 exit 0；随后只改 React Git 视图，不改 Electron/Vue 源文件 |

相对上一批 910，本批全量净增 18 项。仅刷新修复有真实红绿证据：11:56:54 两断言失败，11:57:17 全部 51 通过；没有回滚源码，不能把整批表述为从红到绿。默认并发高亮超时的旧记录不被这次两 workers 通过覆盖。

## 页面行为与截图

[最终脚本](./git-filter-headless/mira-file-filter-headless.mjs) 在 11:58:38 完成，exit 0；[results.json](./git-filter-headless/results.json) 共 25 条记录、190 次协议请求，页面错误与交互失败均为空。11 个行为检查、3 个桌面几何检查及 10 张最终截图分别保留，不重复当作 25 项独立测试。

覆盖根级/嵌套删除、未加载/缺失父目录、鼠标与键盘、菜单禁用、复制与引用 chip、筛选与搜索组合、手动/watch 刷新、明确错误/重试、非仓库/干净仓库空态、session 及同 session root 切换。1440×900、1710×992、1280×800 的文档/抽屉无溢出；滚动挂载 50 行，本样本 ignored 最大批次 49，无滚动 Git 状态轮询。此采样不是整体启动或性能门槛。

旧包 [baseline-results.json](./git-filter-headless/baseline-results.json) 确认删除行与筛选入口原本缺失。修前 [menu-refresh-before-fix.json](./git-filter-headless/menu-refresh-before-fix.json) 受控延迟刷新时删除行/菜单消失，exit 1；修后两者保持，Git 尚未返回时可复制。筛选树的 focus 在刷新前、中、后均为 `src/modified.ts`，ArrowDown 正常移动至 `src/renamed.ts`。没有用等待刷新完成绕过该菜单问题。

截图：

- [删除行菜单](./git-filter-headless/mira-deleted-context-light.png)、[刷新中菜单保留](./git-filter-headless/mira-menu-refresh-confirmed.png)
- [浅色筛选](./git-filter-headless/mira-changed-light.png)、[深色筛选](./git-filter-headless/mira-changed-dark.png)
- [错误](./git-filter-headless/mira-filter-error-dark.png)、[非仓库](./git-filter-headless/mira-filter-nonrepo.png)、[干净仓库空态](./git-filter-headless/mira-filter-clean-empty.png)
- [1440](./git-filter-headless/mira-filter-desktop-1440.png)、[1710](./git-filter-headless/mira-filter-desktop-1710.png)、[1280](./git-filter-headless/mira-filter-desktop-1280.png)

旧包和修前故障两张 PNG 保留历史，不作为新版通过证据。所有截图均为生产 React 的独立 headless Chrome，不是 ZCode 同态实拍。

## 产物与许可

当时的独立 `write:false` 审计于 11:58:48.119 通过：[bundle-audit.json](./git-filter-headless/bundle-audit.json) 的 287 JS 内存/磁盘 SHA 一致，缺失/差异/陈旧/孤立产物为 0，239 动态目标完整；7 份许可副本及 NOTICE/HTML 一致。2026-10-10 清理已过时的单入口审计脚本及其清单条目；当前复验使用 [双入口审计脚本](./highlight-worker-production/mira-bundle-audit.mjs)，不将旧结果当作新版通过。

| 范围 | 文件数 | 字节 | 逐文件 gzip9 合计 |
| --- | ---: | ---: | ---: |
| 入口静态 JS 闭包 | 3 | 2,036,882 | 613,067 |
| 全部 JS | 287 | 9,561,123 | 1,911,632 |
| CSS | 1 | 129,561 | 22,939 |

新 [证据审计](./git-filter-headless/mira-evidence-audit.mjs) 核对 10 张最终图、两张历史图、必需状态和源码指纹，结果与 [SHA 清单](./git-filter-headless/sha256-manifest.json) 在同目录。既往 overlay/image 清单只保留当时版本，不据新版构建回填旧哈希。

## 评审与剩余

本轮新的独立结论见 [finish-review.md](./git-filter-headless/finish-review.md)：源码与 10 张当前截图为 `slice-pass`，同步后的 13 份文档定向一致性检查通过，无剩余具体不一致。不沿用上一批 `ship`；复核限于本轮源码、截图、协议/真实 helper 证据和对应文档，不认证原生或整体发布。

本会话无可调用 `@电脑`，未操作前景桌面或用户数据库；剪贴板是 iframe stub，watch 是协议通知，grant/IPC 是既有单测。原生 Electron/Vue 设置、实体输入、真实 fs-watch/系统剪贴板、同态 ZCode 浅深色比较、安装包、Windows 与真实模型仍需分别验收。

下次从对齐主文档本轮节和本页开始。桌面可用先补上述原生比较；开发侧下一独立 slice 为搜索 ignore 规则/配置，随后分别设计 Git metadata watcher、受控媒体 lease/Range 和高亮 Worker/profile。浏览树显示 `.git` 不是该 ZCode 基线的偏差；搜索过滤不能扩散为浏览或授权规则。全目标、性能和 P0-P3 未放行。
