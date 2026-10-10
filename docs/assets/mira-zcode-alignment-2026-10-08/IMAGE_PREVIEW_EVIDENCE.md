# Mira 图片与 SVG 预览证据

日期：2026-10-09，Asia/Shanghai。状态：实现、最终自动检查和 headless React 局部确认已完成；原生 Electron 与同态 ZCode 对照待完成。未提交、未推送，整体目标仍 active。

本页是本批最新检查索引。前批的搜索、监听与编辑器记录保持原日期及限定范围；本页不覆盖 [上轮原生错误态待确认项](./WATCH_EDITORS_EVIDENCE.md)。

## 完成

- 第一方 `files.read-image({ sessionId, path })` 仅接收当前授权会话的相对路径，复用 grant、主框架和窗口归属校验，再以持久化会话解析项目目录；不是任意路径读取接口。
- 图片按固定 4 MiB 编码文件限制有界读取。handle 前后复核文件 dev/inode/size/纳秒 mtime/ctime、根目录与真实路径，始终关闭 handle，错误脱敏。复用现有调用开始时的 grant 检查，未新增在途读取的 grant 撤销取消机制。
- 白名单位图为 APNG、AVIF、BMP、GIF、ICO、JPEG/JPG、PNG、WEBP；SVG 使用原有文本读取，作为 `img` data URI 预览，不注入 SVG DOM。
- 右侧独立文件标签、满宽 40px 工具栏、图片 40px 留白及 8px 透明棋盘；位图自然尺寸、`@Nx` Retina 折算并限制到可用空间；SVG 适配空间。
- 图片实际 load/error、失败重试、读取错误和删除恢复；隐藏预览不主动重读，激活时读取最新 revision，已完成内容保持缓存。
- SVG 预览/源码互斥；源码沿用虚拟行和 Shiki。解码失败可切源码检查，并将可读取文本加入对话；预览失败态与读取失败态仍禁加入。
- 位图没有加入对话、复制文本内容、自动换行；树右键加入对话禁用。图片预览不等于模型多模态附件。现有附件边界仍为 12 项、单项 256 KiB、总 1 MiB 的文本并拒绝 NUL。
- 修复旧 inspector section/p 级联：预览外壳 padding/底边框清零，错误正文实际继承 foreground 和 13px。只改文件预览范围，不改全局空态。
- [React NOTICE](../../../apps/harness-react/NOTICE.md) 和 [ZCode 改编说明](../../../third-party-licenses/zcode/ADAPTATIONS.md) 补充 `previewPaneImageContent.tsx` 来源；原始许可/版权声明保留。

## 最终自动检查

下表时间均为上海时间；类型与编译的窗口是调用至完成观察区间，不是精确性能样本。

| 检查 | 时间 | 结果与日志 |
| --- | --- | --- |
| React 正式构建 `npm run harness:build` | JS/CSS 最终产物 mtime 10:31:34–35 | exit 0；构建日志（历史原始日志已清理）；mtime 不是完整构建耗时 |
| React `tsc --noEmit` | 10:35:23–30 | exit 0；日志（历史原始日志已清理） |
| Vue `vue-tsc --noEmit` | 10:35:35–41 | exit 0；日志（历史原始日志已清理） |
| `npm test -- --maxWorkers=2` | 10:35:47 开始，11.81s | 94 文件 / 852 项通过；日志（历史原始日志已清理） |
| `electron-vite build` | 10:36:08–16 | exit 0；日志（历史原始日志已清理）；不是 DMG/NSIS 安装包验收 |
| `git diff --check` | 10:36:24 | exit 0；日志（历史原始日志已清理），文档收尾后另检查 |
| 只读 `write:false` 分块/许可审计 | 10:36:24.951–25.315 | 287 JS SHA 全匹配，645 静态边、239 动态目标完整，无缺失/陈旧/孤立产物，7/7 许可及 NOTICE/HTML 一致；日志（历史原始日志已清理） |

定向宿主回归 4 文件/191 项、React 图片/SVG 回归 4 文件/74 项通过。SVG 源码动作回归先红后绿；真实 Tailwind/PostCSS 测试的外壳与错误段落四个断言先红后绿，最后该文件 4 项通过。这些不是另加到全量数字的独立测试项。

构建只观察到 npm 用户配置、`@vueuse` PURE 注释及 icons 混合导入告警。既往默认并发的 8001 行高亮超时仍保留，不以本次受限两 workers 通过替代默认全量结论。

## 产物度量

| 范围 | 文件数 | 原始字节 | 逐文件 gzip level 9 合计字节 |
| --- | ---: | ---: | ---: |
| React 入口递归静态 JS 闭包 | 3 | 2,029,195 | 611,110 |
| 全部 React JS | 287 | 9,553,436 | 1,909,675 |
| React CSS | 1 | 128,056 | 22,715 |

CSS SHA-256：`ff78d4d41790528b7801e4bc6cef9845a624bfe364d7629c0b47030cf0056619`。
Electron main 为 415,196 B，preload 为 13,203 B，renderer 静态目录合计 245 文件 / 24,068,029 B。gzip 是逐文件估算；静态目录总和不是首屏下载量。此表不证明启动、交互耗时或内存改善。

文档收尾检查：本地链接、SHA 与结果检查日志（历史原始日志已清理） 校验本批本地链接、8 个 SHA 文件、headless 成功记录与 schema-v2 sidecar，错误为 0；最终 diff 检查日志（历史原始日志已清理） 另覆盖文档收尾。

## Headless 确认

最终有效采集：10:36:31–35，Chrome `154.0.8037.99`、1440×900、deviceScaleFactor 1、exit 0。使用实际 `dist/harness-react-app` 的完整工作台及生产 FirstPartyHarnessHost/MessageChannel，宿主 fixture 调用实际参数 parser 与 workspace 文件服务。会话、偏好、模型列表和 watch 通知由隔离夹具提供，没有运行 Electron IPC/grant 链或原生 fs.watch；授权及生命周期由定向/全量测试另覆盖。没有桌面鼠标键盘操作。

日志：mira-image-final-headless.log（历史原始日志已清理），机器记录：[results.json](./image-preview-headless/results.json)。

- 透明 PNG：640×320 自然尺寸，经 `@2x` 展示 320×160；外壳 padding/border 0，面板/工具栏同宽 418px、工具栏 40px、图片留白 40px。
- JPEG、JPG、WEBP、GIF、AVIF、ICO、BMP 实际解码成功；PNG 由透明夹具覆盖。超宽/超高均成功解码，超高夹具最终 19.25×721.875 位于 418×802 容器内。
- 损坏 PNG 解码错误、覆盖恢复并重试成功；缺失 PNG 读取错误、恢复并重试成功。浅色读取错误与深色解码错误正文均与 alert 父颜色相同且 13px。
- SVG 预览/源码来回切换成功；损坏 SVG 源码可读并实际点击加入对话，Composer 出现 `mira-broken.svg` 文本引用。
- SVG script/onload 未执行；外部图片请求为 0。只证明本夹具以 `img` 加载时的结果，不是全类型安全审计。
- 隐藏预览后发送变更通知未读取图片，重新激活读数 23→24 并显示新尺寸；这是协议事件夹具，不冒充原生监听验收。
- `pageErrors=[]`。未对 APNG/GIF 动画像素变化、巨大解码尺寸、持续内存或冷暖启动采样，不将静态 GIF 解码称为动画通过。

### 最终截图

六张均已逐张打开确认主题、内容、选中和状态有效，无空白或重叠，仅作为 headless fixture 图：

| 图 | 内容 |
| --- | --- |
| [浅色图片](./image-preview-headless/mira-image-light.png) | 透明 PNG 与完整预览表面 |
| [深色图片](./image-preview-headless/mira-image-dark.png) | 同图深色棋盘与主题 |
| [解码失败](./image-preview-headless/mira-image-decode-error.png) | 深色错误正文和重试 |
| [SVG 预览](./image-preview-headless/mira-svg-preview.png) | `img` SVG 适配显示 |
| [SVG 源码](./image-preview-headless/mira-svg-source.png) | 等宽高亮源码与工具栏 |
| [读取失败](./image-preview-headless/mira-image-read-error.png) | 浅色文件不存在与重试；Composer 保留损坏 SVG 的文本引用 |

[SHA-256 清单](./image-preview-headless/sha256-manifest.json) 固定六图、结果及本机复现脚本。10:34 的捕获存在 compositor 滞后，dark 图仍浅色、decode 图仍加载，该失效截图批次已清理，不用于放行。测试脚本增加双 requestAnimationFrame、250ms 采集等待和主题像素/错误态断言后重新采集，没有再次改产品 UI。早期会话启动等待和 Retina 错误期待属于夹具失败，其两个中间 JSON 已于 2026-10-10 清理；最终六图与结果保留，不将夹具失败改写成产品通过。

### 限定复评

同一独立 reviewer 逐张看过最新六图，Verdict Pass；原两项级联 P2 与 SVG 源码动作均 resolved，Required Fixes 无、三项 Remaining clear、Disposition ship。仅覆盖本批三项修复的 headless React 确认，不代表 Electron 原生、Vue Shell、安装包或整体对齐通过。上轮监听/编辑器原生错误态仍 pending。

## 本机复现材料

[归档脚本](./image-preview-headless/mira-image-preview-headless.mjs) 是本机证据材料，不是运行时资源或通用 CI 脚本。它使用此机器的绝对仓库、Chrome 与 Codex runtime Playwright/Sharp 路径，需要先构建。迁移机器需显式核对这些路径。

```sh
npm run harness:build
node docs/assets/mira-zcode-alignment-2026-10-08/image-preview-headless/mira-image-preview-headless.mjs
```

脚本创建自己的 `mkdtemp` 图片目录和临时 HTTP 服务，在 finally 关闭浏览器/服务、清理该具体目录；不会打开前景桌面，不操作生产项目或数据库。重新运行会覆盖同名当前证据，应先另存本批证据；当前 SHA 仅代表此次有效采集。

## 剩余与下一入口

1. 桌面可用后，先确认前景 PID、正式路由、document timeOrigin 与已加载 CSS，完成上轮监听/编辑器错误态浅深复拍；不能用 Chrome/旧缓存图覆盖有效原生截图。
2. 在隔离 Electron 正式入口逐项操作图片/SVG，与 ZCode 相同状态比较；核实新宿主代码确已载入，再验真实 grant、watch 和外部打开。当前运行实例未因本批构建被重启或证明加载新代码。
3. 本批图片功能不重写；下一能力 slice 是音视频/Office 预览或 Git 状态叠加，按现有差距清单逐项限定。

性能首次 grammar/regex、病态单行、流式历史长任务、布局 profile、可靠缓存/进程条件的冷暖启动继续独立采样。正式安装包、Windows、真实模型矩阵、插件/完整模型目录、高级浏览器/工作流、Novel Studio/分发及整体 P0–P3 未验收。`9→0` 未归因，force reload/进程终止不保证异步保存；4 MiB 文件限制也不构成解码像素内存的硬预算。
