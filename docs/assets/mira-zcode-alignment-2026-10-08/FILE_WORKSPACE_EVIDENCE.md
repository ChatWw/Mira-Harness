# 文件工作区截图证据

日期：2026-10-08，Asia/Shanghai。来源：真实 macOS 原生窗口截图，不是设计稿、生成图片或浏览器模拟截图。图像保留窗口阴影与外侧黑色区域；逻辑窗口尺寸与 PNG 的 Retina/阴影像素尺寸不同。

Mira 使用隔离 `/tmp/mira-zcode-acceptance.dAACiF`，正式开发态 `/workspace/harness-react`，本地确定性模型 fixture。截图只能证明对应画面，交互与性能结果以 [对齐记录](../../MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md) 和 [性能记录](../../MIRA_HARNESS_PERFORMANCE_2026-10-08.md) 为准；不代表真实远程模型、安装包或 Windows。

## 2026-10-08 文件搜索增量

16:49–16:50 的六张原生复截图来自同一隔离开发 Electron，1440×900 逻辑窗口
（PID 36212 / 窗口 2271），已加载重复同路径清除定位修复。此前 16:21–16:34 同名图片已被
本轮确认截图替换，不再沿用其旧哈希或声称旧图展示修复。
逐张打开确认浅色搜索、目录定位、权限错误、深色搜索、菜单和截断列表，PNG 均为
3104×2024 像素（含 Retina/窗口阴影）。下表副本与 `.impeccable/review/` 原图逐字节一致。

| 截图 | 对应状态 |
| --- | --- |
| [浅色搜索](./search-light.png) | 未展开目录中的文件可搜索；打开后保留关键词，右侧独立只读预览 |
| [目录定位](./search-directory.png) | 打开搜索目录后清空关键词，加载祖先并定位展开，预览保持 |
| [搜索失败](./search-error.png) | 临时移除目录读取权限后的具体错误与重试，不显示不完整匹配；权限已恢复 |
| [深色搜索](./search-dark.png) | 通过实际设置切换深色，搜索与预览沿用既有明暗 token |
| [深色结果菜单](./search-dark-menu.png) | 打开、复制相对/绝对路径、加入对话；Escape 后焦点恢复到结果行 |
| [前 1000 项](./search-dark-truncated.png) | 1100 个匹配项明确截断；End 到第 1000 项，实际仅挂载 36 行 |

操作回归含文件打开保留关键词、X/Escape 清除、无匹配、目录定位、刷新发现新文件、
真实 `chmod` 失败与恢复重试，以及 A/B 两个不同工作目录隔离。完整暗色/刷新/1000 项/会话隔离
临时脚本在修正其选择器拼写后，以 `--no-capture` 重跑 exit 0；清除定位修复加载后，浅色和
深色脚本再次完整 exit 0，并重新拍摄上表同六种状态。
这些操作日志与保存故障注入不是截图本身能证明的内容，详见对齐记录。
每次创建的 1101 个搜索测试文件和随机测试目录均已在 `finally` 清理。
另以 200 个根目录临时文件复现重复同路径清空搜索问题，修复后 X、Escape 与真实
Cmd+A/Backspace 都滚回 `scrollTop=5386`，目标行 `794..822` 在树视口 `132..834` 内；
新增夹具同样在 `finally` 清理，仅保留原隔离夹具。此定位以原生矩形日志与组件回归为证据，
上表无对应位置截图，不将常规目录截图冒充该边界的证明。

本批原生日志与只读构建审计已固化，不依赖 `/tmp` 继续存在：

- [清除定位前后操作的修复后矩形日志](./search-clear-native-results.jsonl)
- [浅色搜索、错误恢复与长任务观察](./search-light-native-results.jsonl)
- [深色菜单、前 1000 项、刷新与会话目录隔离](./search-dark-native-results.jsonl)
- [16:53:57 构建资源、引用和许可证一致性审计](./search-closeout-bundle-audit.json)

同一独立 reviewer 已打开本轮六张复截图并读组件回归与矩形日志，将唯一
“重复同路径清除定位”P2 评分为 `resolved`，`Remaining: clear`，`disposition: ship`
仅限这一修复；不是整体产品、发布矩阵或启动性能的认证。

| 原图 | SHA-256 |
| --- | --- |
| `search-light.png` | `f78cc35ff968d80be5685c78039efa29ebe437d35e9d0417398c74a25fcc3a74` |
| `search-directory.png` | `10b3bc295edd90b465ddf20f665b099adfc029c179eddca5e1a985a525b176e4` |
| `search-error.png` | `276a3e5d1fc0f84410ba8c434102fb339912e263c95b005486ff1e775af3a4c9` |
| `search-dark.png` | `027ada9f19e488c874cdec59b46837e6799ff3798c5271564415f173d0759fbe` |
| `search-dark-menu.png` | `145660ae0650ee9422d0624545159ca668458ff1256339c48a9adb4b725ff0bd` |
| `search-dark-truncated.png` | `dad9a14ec7c2dd70abe81c9accf289adfdead5326edc2046f42d089886492f30` |

## 较早的文件标签桌面复核

以下原图从 `.impeccable/review/` 复制，1440×900 逻辑窗口，Electron PID 13338/窗口 2039；15:35–15:36 在六文件标签关闭按钮覆盖定位修正后的构建中，通过浅色/深色真实设置切换捕获，并逐张打开确认内容。此前同名副本已替换，不能沿用修正前标签样式。

| 截图 | 状态与来源 |
| --- | --- |
| [浅色文件工作区](./mira-file-workspace-light-final.png) | 六文件标签、左侧树、右侧 Alpha Markdown 与当前线程；active 最小 128px，隐藏关闭按钮不占布局；`desktop-light.png` |
| [深色文件工作区](./mira-file-workspace-dark-final.png) | 设置往返后六文件标签恢复、同一文件/线程，实际代码色来自 `--shiki-dark`；`desktop-dark.png` |
| [深色文件菜单](./mira-file-workspace-dark-menu-final.png) | 原生右键菜单；关闭后焦点回 `alpha/README.md`；`desktop-dark-menu.png` |

三份副本的 SHA-256 与 `.impeccable/review/` 同源原图一致，PNG 均为 3104×2024 像素（含 Retina 与窗口阴影）。同一 finish reviewer 已用这组复截图确认标签标题修复 resolved、无本批可见回归；DESIGN 同步亦 resolved，disposition ship 仅限两项收尾。

## 本批较早的操作画面

保留从 `/tmp/` 同名文件复制的原图，截图已逐张核实。它们记录操作时状态，不能声称是后续修正后的最终构建。

| 截图 | 当时状态 |
| --- | --- |
| [同名文件与源码](./mira-file-tabs-same-name-current.png) | Alpha/Beta 同名 Markdown 独立页签，Alpha 源码与 Composer chip |
| [丢失文件](./mira-file-error-current.png) | 临时夹具被移开后显示具体错误/重试，加入对话禁用；文件之后已恢复 |
| [同会话移动项目](./mira-file-migrated-root-current.png) | 新 root 的 Alpha 内容，无旧 root 内容 |
| [大源码虚拟行](./mira-file-source-large-current.png) | 8001 行样本滚动后的局部行；非长任务结果凭证 |

## ZCode 对照

[ZCode 实际搜索结果](./zcode-search-result-native.png) 来自 `/tmp/mira-zcode-search-result-native.png`，
安装版 3.14.4 原生窗口；可对照返回任务、搜索框、项目头和相对路径扁平结果。
对照过程中没有发送、停止任务或写入其项目。其右侧是浏览器，不冒充同态文件预览截图。

[ZCode 实际文件树](./mira-zcode-tree-reference.png) 是安装版 3.14.4 原生窗口，来自 `/tmp/mira-zcode-tree-reference.png`。可用于左侧返回任务、树/缩进和界面密度对照；右侧当时是任务起点，并非文件预览。

文件预览、标签与只读行为同时以用户提供源码 `/Volumes/VrenDisk/project/ZCode/packages/ui/src/PreviewPane.tsx`、`components/ui/code-viewer.tsx`、`app-shell/SidePaneTabTrigger.tsx` 为依据。名为 `/tmp/mira-zcode-preview-reference.png` 的临时图实际是线程页面，已排除出文件预览证据，不用于声称像素复刻通过。

这些文档截图没有作为 Mira 运行时 UI 资产发布。许可与来源映射见根目录 `third-party-licenses/`。
