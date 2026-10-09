# Git 删除虚拟行与变更筛选独立终审

- 复核时间：2026-10-09 12:01 +08:00。
- 仓库：`/Volumes/VrenDisk/project/Mira/Mira-Harness`。
- 分支：`codex/mira-harness-first-slice`。
- 审查方式：独立只读源码、上游行为、当前 JSON 证据与逐张 PNG 检查；本 reviewer 仅新增本文。
- 范围：deleted 虚拟行、changed-only 开关及搜索组合、刷新状态、删除动作边界，以及本轮 Git 刷新菜单稳定性修补。
- 结论：`slice-pass`。本轮范围内没有未解决的可复现 P0/P1/P2 问题；不沿用上一批 `ship`，不放行原生或整体发布。

## 源码结论

检查了 `apps/harness-react/src/lib/file-git.ts`、`components/workspace/ProjectFileDrawer.tsx`、`styles/file-drawer.css`、两份相应测试，并对照本地 ZCode 的 `workspace-file-tree/model.ts`、`WorkspaceFileTree.tsx` 与 `WorkspaceFileTreeRowView.tsx`。

- deleted 只补已经加载的直接父目录，不创造缺失祖先、不替换已有同路径项、不改变 datasource 快照。按父目录 Set 去重并批量复制，每个受影响目录只复制一次。
- 树态 changed-only 保留直接变更与变更后代的目录，搜索态只保留直接非 ignored 状态；过滤后重算兄弟位置与数量。目录加载和监听仍使用完整树，开关不擅自扫描或展开目录。
- 点击、Enter、Space 在 deleted 文件上仅选中；预览、菜单打开与外部编辑有 disabled 和回调 guard。复制以及非位图加入对话保持可用，符合上游行为；后者仅生成引用，实际发送仍由既有宿主读取校验处理。没有扩展宿主权限。
- `refresh()` 保留当前 datasource 的上一份展示快照并标记 loading，避免 D 虚拟行和 Radix 菜单在请求期间卸载。内部 entries、checkedPaths 与 ignoredPaths 仍立即清空，version 仍递增。
- loading 阻止 ignored 请求重新提交；新的成功 status 先替换为无旧 ignored 的 index，再按当前 visiblePaths 重新检查。旧在途 ignored 的成功或失败均受 version/active guard 约束，不能覆盖新快照。旧 ignored 仅作为 loading 期间的旧视图暂存，不作为新缓存复用。
- session/root 变化创建新的 datasource；`activate()` 仍发布 empty，明确失败或非仓库仍清旧状态。没有把上次会话或目录的快照保留到新工作区。
- 开关沿用 28px 图标尺寸与既有 selected/foreground token；没有新增独立主题或全局布局变更。

## 回归问题已解决

`menu-refresh-before-fix.json` 记录实际旧构建中的失败：held root watch 刷新期间 deleted 行和菜单均消失，无法复制。该文件是失败基线，不作为当前通过证据。

当前 `results.json` 最终结果为 `passed: true`，结束于 `2026-10-09T03:58:38.258Z`。本 reviewer 检查了断言实现与结果：

- `deleted-menu-during-refresh`：row、menu、loading 期间复制全部为 true，status 保持 held 到复制完成。
- `watch-tree-focus`：刷新前、期间、之后均聚焦 `src/modified.ts`；ArrowDown 后为 `src/renamed.ts`。此前组件夹具不能覆盖的真实 DOM 焦点边界，在此次独立 headless 浏览器结果中得到补充。
- deleted 单击/Enter/Space 的文件读取增量为 0，新增预览数为 0；复制使用 iframe stub，非位图引用 chip 可加入和移除，位图加入禁用。
- 手动与协议 watch 刷新保持开关、query、展开及选中；失败恢复普通浏览，专用重试恢复 Git 状态但不恢复旧筛选。非仓库无开关和错误；干净仓库有对应筛选空态。
- 同 session 更换 root 后筛选复位，旧 deleted 行消失；切换 session 后也复位。
- 1440x900、1710x992、1280x800 的 264px 抽屉和 28px 控件未溢出。滚动抽样挂载 50 行，未触发 status 轮询，ignored 最大批次为 49。
- `pageErrors` 和 `interactionFailures` 均为空。

`validation-summary.json` 记录主 agent 观察到的命令结果，明确不是原始日志：本轮全量为 96 文件 / 928 项通过，React/Vue 类型检查 exit 0、正式 React 构建通过；本 reviewer 没有重复运行这些命令。刷新窄修在 11:56:54 观察到 2 项失败 / 49 项通过，11:57:17 定向 51 项通过；没有为制造失败回滚源码，也不是整个 deleted/filter slice 的红绿证明。独立检查的 `bundle-audit.json` 时间为 `2026-10-09T03:58:48.119Z`，结论 `passed: true`：287 个 JS 内存/磁盘一致，无 missing/mismatch/stale/orphan；239 个动态目标存在；7 个许可副本及 NOTICE/HTML 一致。静态入口 3 个 JS，共 2,036,882 B，gzip 合计 613,067 B；这些字节不是冷启动或原生性能验收。

## 逐张视觉检查

下列 10 张图均实际打开并逐张检查，来自本次最终 `results.json` 的 capture 清单，没有采用 baseline 或 before-fix 图替代：

| 当前截图 | 观察结果 |
| --- | --- |
| `mira-deleted-context-light.png` | D 字母、选中行和右键菜单可见；打开/打开方式灰置，复制与加入可用；菜单未超出视口。 |
| `mira-menu-refresh-confirmed.png` | held 刷新期间同一 D 行与菜单维持可见，无位置跳动。 |
| `mira-changed-light.png` | 浅色开关 pressed 表面可见，变更祖先与子项保留，28px 行及右侧预览完整。 |
| `mira-changed-dark.png` | 深色开关、状态文字和目录点保持可辨识，主题没有白色残留。 |
| `mira-filter-error-dark.png` | 错误文字换行、重试入口可见；筛选退出，普通文件树与选中项仍可见。 |
| `mira-filter-nonrepo.png` | 非仓库没有 Git 开关或错误，正常文件及空工作区表面完整。 |
| `mira-filter-clean-empty.png` | pressed 开关和“没有变更文件”空态同时可见，没有旧 D 行残留。 |
| `mira-filter-desktop-1440.png` | 1440x900 下抽屉、主线程及预览无新增遮挡/溢出。 |
| `mira-filter-desktop-1710.png` | 1710x992 下尺寸与层级稳定，控件没有拉伸或脱离表面。 |
| `mira-filter-desktop-1280.png` | 1280x800 下标题、Composer、抽屉控件及预览仍完整，无新增重叠。 |

两张 D 菜单图像 SHA 相同是本次捕获的真实结果；对应 JSON 分别记录普通菜单与 held 刷新状态，稳定图像不代表复用旧截图。

## 证据身份

```text
e26d697e22c136e55b05126d0e5f504f6d4b6a632a355c23d12c981a78333175  results.json
95a972a93ddc43edcfd443cdc6c9a22dfa41dd33f5615eb8efff470ddecf6b84  bundle-audit.json
95a9935f993e5d312a6b2b00332c9e5d23b5df90f7952b6fdafcf6d51afc4554  mira-deleted-context-light.png
95a9935f993e5d312a6b2b00332c9e5d23b5df90f7952b6fdafcf6d51afc4554  mira-menu-refresh-confirmed.png
e0ef4e65e5095f899c85f62ce34e6910a6b584c4e75b0212a48444af75f3d68d  mira-changed-light.png
9897e1358d31b47bcabca019f9a75abded3d0bcf67689ba4fdc649d8e8c4dc72  mira-changed-dark.png
056f75f15c254239b741b6a4715096a47f6c6724580606655e44c49936fb4c35  mira-filter-error-dark.png
92f2d62e97893f700a8117bb322d6d0d25245e0a9de10366eaaa0c0a1f6ff50c  mira-filter-nonrepo.png
0539038a1ea62a97b10d04b4f597baa1ecbb9a60ceaf07e6f79818e160e28f90  mira-filter-clean-empty.png
d5a3edeaf52f0a539dd01ce6c6acff21899bd4fb88a1f438c348fb7deaa713b9  mira-filter-desktop-1440.png
cc64ff06d8e06fb8eff742bafa83c54a72ede7cf6241f3f8483602b56ae7dccb  mira-filter-desktop-1710.png
5c1420124c7b0a184306131eeeabcf4a02de011a56337944165c40a91f0d1602  mira-filter-desktop-1280.png
```

## 边界与后续

本次是生产 React、MessageChannel、真实第一方 parser 和隔离 Git/file helper 的 headless 夹具。watch 通知为协议注入、clipboard 为 iframe stub、editor 为夹具；Electron grant/IPC 为单测覆盖，不是此次浏览器中的真实宿主调用。

没有进行前景电脑操作、原生 Electron/Vue 设置验收、同态 ZCode 软件视觉比对、安装包、Windows 或真实模型验证；不认证这些边界。搜索不包含已删除文件名、缺失祖先不虚构、没有 Git metadata watcher 均是记录清楚的当前范围，不据此承诺新能力。

本轮 deleted/filter/刷新菜单稳定性 slice 通过，remaining 在该 slice 内为 clear；原生浅深色和同态 ZCode 对比仍待后续，整体对齐目标保持 active。规划文档的同步由主 agent 另行检查，本文不代替文档终审。

## 2026-10-09 12:12 文档定向复核

本条关闭上节所述的文档待办，不改变其原生/整体边界。本 reviewer 没有重新运行浏览器或捕获截图，只检查同步后的当前描述、契约与既有证据之间的一致性。

复核范围：五份阶段文档（对齐记录、实施 PRD、Phase0 交接、Stage1 设计、工作台交互规格）、根 README、React README、DESIGN、schema-v2 sidecar、工作台 surface、NEXT 能力审查，共 11 份；另检查主 agent 的 `GIT_FILTER_EVIDENCE.md` 与性能记录当前顶部，共 13 份。

| 定向检查 | 结果 |
| --- | --- |
| 当前能力与契约 | Pass：8.11、25 节和 Stage1 第 34 节均记录已加载父目录 deleted 行与 changed-only；搜索不注入 deleted 项、完整树仍驱动加载/监听。 |
| 删除动作边界 | Pass：D 只选中，打开/打开方式/editor 回调禁用；复制及非位图引用允许，chip 不读取，发送仍经宿主真实文件校验。 |
| 刷新与隔离 | Pass：loading 保留最后成功 available/index、筛选、菜单/焦点，内部 ignored 缓存失效及 version guard 保持；明确失败/非仓库、session/root 变化重置。 |
| 数字与历史限定 | Pass：当前 96/928、51 定向项、25 条记录/190 请求、10 张最终图及 03:58:48.119Z 产物体积与 JSON 相符；净增仅表述 18，不再给出未独立证实的细分。旧 overlay 数字与 ship 被明确限定为历史，未套用本轮。 |
| 未完成与续作 | Pass：原生/同态 ZCode、安装包、Windows、真实模型、性能及整体 P0-P3 均未放行；下一未实现文件树 slice 为搜索 ignore 规则/配置，不把搜索规则扩散成浏览或授权规则。 |

sidecar JSON 解析通过；12 份 Markdown 内 170 个本地文件链接的目标均存在（按链接出现次数统计，不是 170 个独立文件，也不是全量锚点验收）。当前 source/headless 与文档待办没有剩余具体不一致；此前各入口的“文档一致性复核待”由本条解决，可据此更新为已通过。

最终限定结论：`slice-pass; documentation-closed; native-pending; overall-goal-active`。只关闭本轮删除/筛选/刷新菜单稳定性及相应文档 slice，不作整体 ship 或原生认证。
