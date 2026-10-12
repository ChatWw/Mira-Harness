# Mira Harness 首屏完整对齐与验收

## 当前交付：PDF 阅读与随包搜索（2026-10-12 10:24 +08:00）

完成：目标模式已在当前版本，沿 `/goal <目标>`、逐轮计划/独立核验、暂停/恢复/清除和预算，不重复开发。本批两路并行：项目 PDF 在资源面板真正阅读；工作流搜索使用随包 rg，不再要求用户另装系统命令。保留既有 ZCode 工作台、两层 Shell、Vue 设置与 React 主应用，未提交/推送。

PDF：沿 ZCode `previewPanePdfContent.tsx` / `components/ui/pdf-viewer.tsx`，使用相同 react-pdf 10.4.1 / PDF.js 5.4.296；按需加载阅读器，单页、前后页/页码/左右键、缩放/适合宽度、可选择文字、密码及错误重试。隐藏/切换/关闭/离页释放授权和独立 worker；同一仍打开标签返回保留本次页码/倍率，不承诺重启保存。宿主沿逐文件授权流式服务扩 PDF MIME；opaque sandbox 保持不变，响应暴露 Range 头，classic Blob 导入本地 worker，等待自有握手而忽略库先发的 ready 消息，避免假 worker 与主线程解析。worker、CMaps、标准字体/WASM及原许可随 React 包分发，不用 CDN；资源文字与焦点沿 Impeccable/现有 tokens。PDF 预览尚不是模型 PDF 附件，入口明确禁用。懒加载/模块异常限制在 PDF 面板并释放授权；模块失败提示重新加载 Mira，不能承诺普通重试能清除浏览器模块缓存。

搜索：固定构建依赖 `@vscode/ripgrep@1.18.0`，复制目标平台二进制与上游 MIT/PCRE2 许可到 `dist/mira-tools/ripgrep`，打包为 `resources/tools/ripgrep`；开发启动预构建工具，electron-builder beforePack 按真实目标平台/架构检查，缺包明确失败，不拿主机二进制冒充目标版本。真实 platformServices/HarnessRuntime 注入绝对路径，显式测试覆盖保持，输出路径统一 `/`；没有扩展 Shell PATH 或移植整个上游搜索服务。

验证：最终 PDF/媒体/Goal 桥与摘要/资源标签共7文件62项 `/tmp/mira-pdf-goal-final-20261012.json` 通过，含 reader 失败保留工作台、迟到授权回收、库 ready 消息和 worker 失败；搜索2文件20项 `/tmp/mira-bundled-search-tests-final-20261012.json` 在空 PATH 下通过，覆盖中文/换行路径、限额、取消、缺失/不可执行与许可。Electron Node/现有 SQLite 的真实 HarnessRuntime→FlowController→编译 worker→随包 rg 定向1项通过 `/tmp/mira-bundled-search-electron-host-final-20261012.json`，该文件其余17项跳过，不称全仓或正式安装包通过。React/Vue类型、媒体服务依赖链严格类型、工具 resolver 严格类型、React及Electron/Vue生产构建、beforePack实际解析/执行、diff和原许可比对通过；既有构建警告保留。

实际桌面最终 `/tmp/mira-pdf-desktop-20261012.oNGhTE/report.json` passed=true/errors=[]：独立home/约904KB真实PDF、英文及预定义CMap中文、选择文字、密码错/对、翻页/输入边界/键盘/缩放、隐藏销毁worker、切换/关闭/离页回收、损坏/删除后重试与重载撤销通过，无模型请求。观察到实际206、CMap200与具名blob dedicated worker，无fake-worker警告。初次 XvaQ0W 真实产品缺陷为误把库ready当导入失败，已修并增加回归；4koDtz 为驱动在关闭IPC完成前立即HEAD断言，改成等标签卸载和有界撤销确认，未为通过断言改产品。MCFK9q 是焦点样式修正前通过记录；主代理批量检查其五图，修正后确认oNGhTE密码焦点与暗色两图。未嵌入STSong字体的夹具有系统字体警告，当前macOS回退字体实际可读，不称所有机器/字体都已验证。

当前启动：仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 的 `npm run desktop:dev`。10:21已有dev进程PID60769启动；保留其进程和数据，没有关闭/重启，也没有再创建第二个正常预览。最新React静态资源已构建，旧PID51714及七入口说明只属于下方历史。本批桌面走查使用当时实际磁盘入口，不能把用户dev窗口称为本批操控验收；生产构建检查与真实桌面/CDP检查分别记录。

剩余/下次开始：优先首版侧栏、timeline、Composer、Goal和资源面板的用户反馈；继续Office/PPTX预览、模型音视频/PDF附件、插件OAuth/预注册客户端/共享授权事务及真实供应商。原生ZCode computer-use工具仍不可调用，当前为Playwright Electron/CDP/capturePage，未称完整原生对等、整体性能上限、Windows或安装包通过。完整目标active，下方全部是历史记录。

## 历史交付：音视频侧面板与目标入口复核（2026-10-12 09:56 +08:00）

完成：项目文件树打开音频/视频后使用资源侧面板原生播放器，不再走文本/二进制报错。支持播放、暂停、拖动进度；切换标签、收起工作区、关闭资源或离开任务页停止播放并释放逐文件授权。重新展开保留本次标签内的位置且保持暂停，不承诺重启后续播。读取失败、编码不支持及重试接通，暗色播放器和音视频类型图标已适配。音视频暂不能作为模型附件，加入对话入口明确禁用。Goal沿已交 `/goal <目标>`、逐轮计划/独立核验、暂停/恢复/清除及预算，正常首版再次确认候选/插入，不重复开发。

宿主：Electron从授权目录提供随机逐文件loopback URL，以文件描述符流读取，支持HEAD/单段Range、206/416及背压，不经base64全文件载荷。句柄绑定窗口/第一方授权，每个请求复核目录、根身份和文件版本；显式撤销中断活动流，重载/崩溃/退出回收。不宣称已经发出的响应会因任意外部目录移动即时中断。媒体显式刷新，目录监听初始化和其他文件变化不再重载播放，文本和文件列表保留自动刷新。来源 `packages/shared/src/media-preview.ts` / `packages/ui/src/previewPaneMediaContent.tsx`，Mira命名/Apache原文及发布ADAPTATIONS保持。Impeccable用于既有播放器状态与明暗适配，保留两层Shell。

验证：最后5文件109项 `/tmp/mira-media-final4-20261012.json`、标签/搜索2文件10项 `/tmp/mira-media-tabs-final-20261012.json`、IPC媒体生命周期定向2项 `/tmp/mira-media-ipc-final-20261012.json` 通过；IPC同文件其余86项未运行，不称全仓通过。无效响应立即回收/解码失败清源及目录监听打断播放分别先红后绿。React/Vue类型、媒体服务及本地服务器依赖链严格类型、React/Electron/Vue生产构建、diff和Apache原文/发布说明比对通过。初次无paths别名的直接tsc失败，继承项目别名的临时配置检查通过，没有修改产品配置或称整个Electron严格类型通过；既有构建警告保留。

正式桌面最终 `/tmp/mira-media-desktop-20261012.w8MkXF/report.json` passed=true/errors=[]：独立home/项目，真实Electron/Vue/React/桥/SQLite/HTTP与Chromium解码，生成PCM WAV/VP9 WebM实际播放/暂停/seek，切换/关闭/收起/进度恢复、损坏/删除文件重试、切自动化停止、重载撤销及实际206通过，无模型调用。主代理看修正前五图及最终暗色播放器/视频两图，未称未看的图已逐张验收。CXNbNm未展开项目、uf9kPe监听旧播放器、tC7Spr重载后未悬浮/选中任务动作为驱动失败；uBZ0r1目录监听重载播放是实际产品缺陷，已修复并回归，失败证据保留。lbZK13属主题/图标修正前，通过不替代最终w8MkXF。

可见首版：正常PID51714、长驻会话97061，`/tmp/mira-workflow-visible-20261012.eZJTa2/publish-report.json` passed=true/errors=[]，七入口匹配最终桌面产物，保原home/userData/sessionData、空稿首页；Goal候选/插入及工作流入口已验。此前45301实际已退出，没有终止用户运行或清空草稿，媒体验收夹具未写入正常预览。自己启动仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 的 `npm run desktop:dev`，配置实际模型后 `/goal <目标>`；媒体从自己的项目文件树打开。分支 `codex/mira-harness-first-slice`，本批未提交/推送。

剩余/下次开始：先处理用户首版侧栏、timeline、Composer、Goal和资源面板的实际反馈。音视频只是项目预览，PDF/PPTX/Office预览与模型音视频附件仍未接；真实公开供应商/模型、插件OAuth/预注册客户端/共享事务、rg发布依赖、原生ZCode computer-use同态对照、整体性能与Windows/安装包未验。当前无原生电脑工具，本批为Playwright Electron/CDP/capturePage，不宣称完全对等或性能无法继续改进。整体active，下方均为历史。

## 历史交付：插件管理、失败恢复与任务试用（2026-10-12 09:23 +08:00）

完成：目标模式已交，本批再次确认正常首版 `/goal` 候选及插入入口；逐轮计划、独立核验、暂停/恢复/清除与预算沿已交执行能力。公开插件卡片与详情新增统一 Radix 管理菜单，支持启用、停用及仅移除登记，清楚说明保留已下载文件。停用后 Composer 候选消失，重新启用后恢复。目录加载失败与安装/启停/移除失败分开，重试重新执行原操作；修复目录重试一次后所有后续导航都强制联网的问题。

任务入口：公开卡片、详情与已安装列表提供“试用”，交给既有新建任务导航及 Composer 结构化插件引用；已有匿名/准备中草稿沿标准入口复用并保留文字、附件与引用，不另造第二套草稿。重复试用去重，不自动发送、不创建正式任务或调用模型。当前登记再次验证已启用、无错误/冲突且有可引用 Skill；待确认提交先提示处理，失败保留原稿。只含 Agent/命令/MCP 的插件继续通过各自选择器调用，不冒称本批试用支持全部插件组件。来源参考 ZCode PluginStoreCard/DetailView/Page，Mira 命名及 Apache 原文保留，ADAPTATIONS 已同步到 React 发布资源；Impeccable 用于既有桌面界面状态检查，未改外层 Shell。

验证：管理/市场/存储相关4文件90项通过 `/tmp/mira-plugin-actions-final-20261012.json`；新增试用/草稿/导航最终4文件344项通过 `/tmp/mira-plugin-prefill-final-20261012.json`，包含待确认首发保稿。试用核心先红2项后绿；首次组合回归有旧导航断言缺少新增可选参数，更新该断言后通过，不改变旧入口行为。React类型、生产构建、diff、Apache原文及发布ADAPTATIONS比对通过，本批未改Electron服务或Vue产品代码，不重跑无关全量、不把两个集合相加称为全仓通过。

正式桌面最终 `/tmp/mira-plugin-actions-desktop-20261012.NSkse3/report.json` passed=true/errors=[]：同一隔离 home、真实公开包及 Electron net.fetch，离线已安装刷新不联网；停用/Composer消失/启用、移除保留原目录/原包重新登记、安装503后无登记/临时残留/真实重试、键盘菜单/Escape焦点、公开详情和本地列表试用/草稿与结构化引用重载/重复去重均通过。503为受控网络失败，成功请求使用真实公网；未调用模型。主代理亲看最终明暗菜单、安装失败与试用草稿四图。早期 BygWkh/CExKx2/0f6Pe2/vVkhff/M5Acf0 为驱动误期待透出HTTP状态、切页已自动读取、焦点回归尚未settle及偏好API/命名空间写错的失败，证据保留；产品未因驱动错误绕过完整性或修改接口。

可见首版：正常 PID45301、长驻会话55393，`/tmp/mira-workflow-visible-20261012.7Fnj2v/publish-report.json` passed=true/errors=[]，七入口hash与NSkse3桌面产物一致；空稿首页与Goal候选已亲看。替换43247前两次核验身份、空可见草稿、无普通/Goal/工作流活动运行，正常退出并保原home/userData/sessionData；市场验收安装数据没有写入正常预览。自己启动：仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 的 `npm run desktop:dev`，配置实际模型后 `/goal <目标>`。分支 `codex/mira-harness-first-slice`，本批未提交/推送。

剩余/下次开始：优先用户首版侧栏、timeline、Composer、Goal及资源面板实际反馈；市场HTTP失败仍经过桥层安全泛化，后续可按已知状态码改善提示，不能把泛化文案当作原始错误。真实供应商/模型、插件OAuth/预注册客户端/共享授权事务、rg发布依赖、原生ZCode computer-use同态对照、整体性能与Windows/安装包仍未验。当前工具没有原生computer-use，用Playwright Electron/CDP/capturePage明确限定验收；首版可走查不等于完整复刻目标完成。整体active，下方均为历史。

## 当前交付：公开市场实装与目录加载（2026-10-12 09:02 +08:00）

完成：目标模式已补齐，本批再次验证 `/goal` 候选、插入及 Goal 存储/执行/摘要回归，不重复开发。公开市场目录从串行改为最多六项一批；同 SHA 下载仍复用，拒绝无许可/不完整条目，失败批次先收尾再允许刷新，不发布部分目录。新增两项回归先红后绿。旧“Hook 尚不支持”测试已过时，改用仍不支持的 LSP 组件，原完整性、撤销授权及不发布断言保留；没有为通过测试退化已交 Hook 能力。

实际页面：`/tmp/mira-market-desktop-20261012.LMM9H5/report.json` 正式 Electron 的公开 GitHub 读取、14 个 Skill/5 个插件包、theme-factory 实际下载/启用及明暗页面通过，首次两目录就绪3330ms、同进程重载后缓存28ms。随后保留该隔离 home 重开，`/tmp/mira-market-desktop-20261012.agEs6t/report.json` 实装 academy-guide 插件，确认 `$theme-factory` 和 `@academy-guide` 的真实 Composer 候选；未调用模型。该次 Chromium HTTP 缓存已热，83ms不能叫公网冷加载。主代理已看初次五图、后续插件安装与引用图，未把所有截图计作逐张验收。

性能证据：`/tmp/mira-market-benchmark-20261012.GQJA6n/report.json` 使用同一18项目录/36次实际 loopback HTTP/每响应30ms，前后各三个独立服务实例；首次中位1195ms→215ms，最大并发1→6，安装、缓存和条目一致。不将夹具数称为公网提速或整机性能。终端 Node fetch/curl 一度超时，早期桌面 BtOWfz 的 Skill selector 也错误；jj3cHz 安装在 notices 网络请求时失败，CgvEXY 显示公开超时后，验收脚本未等刷新结束便断言按钮启用。这些失败报告保留，不冒称离线完整验收通过；没有因此改产品或绕过完整性验证。

验证：最终相关7文件/144项通过 `/tmp/mira-market-goal-final-20261012.json`（Vitest 总 suite 数15不等于文件数）；React/Vue 类型、正式 Electron/Vue 构建、diff 与 Apache 原文比对通过，Node 测试后已重建 Electron native ABI。额外直接严格检查市场依赖链仍报既有 paths 初始化及 Markdown token 类型错误；未修改无关模块，不宣称整个 Electron 严格类型或全仓测试通过。本批无 React 产品代码或样式改动；Impeccable 测量规范用于限定优化范围并保留既有 ZCode 视觉。

可见首版：PID43247、长驻会话84335，`/tmp/mira-workflow-visible-20261012.jK9ihM/publish-report.json` passed=true/errors=[]；七入口与上述桌面产物一致，最新空稿首页已亲看。替换39627前两次确认身份、无可见草稿、无普通/Goal/工作流活动运行，正常退出再保原 home/userData/sessionData 打开；没有安装市场验收夹具到用户预览或配置模型。用户在 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 运行 `npm run desktop:dev`；配置实际模型后 `/goal <目标>`。分支 `codex/mira-harness-first-slice`，本批未提交/推送。

剩余/下次开始：先处理首版侧栏、timeline、Composer、Goal 与资源面板的实际体验反馈，再补公开安装失败/重试及插件启停的完整桌面流程、真实供应商和 rg 发布依赖。插件 OAuth/预注册客户端/跨进程授权、原生 ZCode computer-use 对比、整体性能、Windows/安装包仍未验。整体目标 active，首版可走查不等于完整复刻已完成；下方全部为历史记录。

## 当前交付：浏览器授权与 Agent MCP 服务范围（2026-10-12 08:45 +08:00）

完成：沿现有 ZCode 工作台与 Vue 设置补全全局/项目远程 MCP 的浏览器登录入口。保存选择 OAuth→打开授权→本机回调→状态更新，支持 HTTP/SSE SDK、PKCE、正确 state 校验、拒绝/超时/浏览器失败重试及持久化凭据刷新；URL、验证码和凭据均留在 Electron。safeStorage 加密 canonical client/token pair，安全存储不可用明确失败，不回退明文；不可读记录显式重试时保留备份。项目授权使用独立临时探测连接，完成显示“已授权 · 任务启动时连接”，不把凭据存在冒称正在连接任务。全局重连不关闭项目连接；变更/停用/退出使旧回调与旧工具失效。授权等待期间轮询只更新当前页面，不覆盖草稿；成功提示已修为完成文案。

Agent：用户/插件 Markdown 的 `mcpServers` 已接执行层。父任务捕获选中且连接成功的 global/plugin/project 元数据，包含零工具服务；子 Agent 只借用冻结范围，精确名称匹配，缺失/同名冲突拒绝。省略或空数组不另加限制，`*` 不是通配符，tools/disallowedTools 与 Mira 角色权限取交集。表单修改保留高级字段及注释，排队与审批后再验证 profile。真实 HarnessRuntime→项目 stdio→具名 Agent 已验，单连接借用不另启进程。

验证：最终相关 17 文件 330 项通过 `/tmp/mira-mcp-oauth-agent-final-20261012.json`；React/Vue 类型、MCP 授权/凭据/管理器及配置模块严格类型、React/Electron/Vue 生产构建、diff 与 Apache 原文比较通过。未称全仓测试或整个 Electron 严格类型通过，原有构建警告保留。真实加密、两协议及实际 OAuth/MCP HTTP 服务覆盖在测试中；测试模型回复/本机授权供应商仍为受控夹具。

桌面：最终 `/private/tmp/mira-mcp-oauth-desktop-20261012.8ge4o1/report.json` passed=true、errors=[]，全局和项目真实 Vue 表单/IPC/SDK/safeStorage、草稿保留、授权回调、应用关闭重开后自动恢复通过。最终 UI 同源码的 kfmU1Q 明暗图已逐张复核，修正后的状态文字可读、无裁切；之前 upFrXy 为完成提示修正前历史。最后仅类型签名与配置文件 fd 关闭修正，无额外视觉改动。早期桌面失败为验收驱动过早离开 Harness、Element Select 错误命中，修正驱动等待与实际 wrapper 点击后通过，未据此改产品。

可见首版：正常窗口 PID39627、长驻会话96638，保留原预览 home/userData/sessionData；此前 PID6799 经实际检查已退出，没有关闭或覆盖用户运行/草稿。`/tmp/mira-workflow-visible-20261012.hUvunH/publish-report.json` passed=true、errors=[]，七入口 hash 与最终桌面产物一致，首页/Goal 候选/工作流三图已亲看，停在空稿首页；未 seed 模型或发起公网模型请求。仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness`，分支 `codex/mira-harness-first-slice`，启动 `npm run desktop:dev`。目标模式 `/goal <目标>` 及暂停/恢复/预算已经交付，不重做；本批未提交/推送。

剩余/下次开始：优先首版真实体验中的侧栏、timeline、Composer、Goal 与资源面板问题；继续公开市场安装/实际供应商、rg 发布依赖及有测量依据的性能检查。插件 OAuth、预注册客户端和跨进程共享授权事务仍未移植，不能将本批称为全部 OAuth 对等。原生 ZCode computer-use 当前工具不可用，本批采用 DOM/CDP/capturePage；公网 OAuth/模型、整体性能上限、Windows/安装包与完整逐功能对等仍未验。整体复刻目标保持 active；下方是历史，不拿旧“未实现”重复安排已交功能。

## 当前进展：目标可用、工作流轨道与智能体对话已接通（2026-10-12 07:54 +08:00）

完成：Goal 已交付并复核，输入 `/goal <目标>` 启动持续目标，摘要/详情显示实际逐轮计划与独立核验，支持暂停、恢复、清除和可选 Token 预算。工作流审批与会话卡改为 ZCode 风格横向阶段轨道与智能体药丸；运行侧面板使用可折叠竖向阶段脊线、并行缩进及真实循环轮次。节点展开呈现真实操作参数、结果和任务进展，准确匹配的智能体可以进入其只读对话，显示已保存请求、回复、思考与工具记录，支持分页、刷新、重试及返回焦点；不把持久化刷新说成逐 token 流。

持久化与收尾：批准的编译图首次冻结在独立 SQLite 表并绑定运行/源码 hash，后续读取不重新编译或覆盖；旧运行缺图明确回退实际记录。修复启动前图保存失败后界面缺终态事件的问题：先落盘停止状态与事件，再安全通知界面，观察者异常不覆盖原始错误或阻止资源回收。新增失败回归先红 `/tmp/mira-flow-graph-terminal-red-20261012.json`，两项均为缺少终态通知，修复及最终外层时序断言纳入下方最终回归。原版权及 Apache LICENSE/NOTICE 保留，来源已补到 `third-party-licenses/zcode/ADAPTATIONS.md`。

验证：最终相关 18 文件 416 项通过 `/tmp/mira-flow-timeline-goal-final-20261012.json`，覆盖 Goal、审批/运行/图存储、智能体对话、第一方桥与工作台事件投影。此前 12 文件 148 项是修复前记录，不合并数字。React/Vue 前端类型与严格 flow 包类型、React/flow/Electron/Vue 生产构建及 diff 检查通过；原有 CSS highlight 与打包提示保留，不称全仓测试、整个 Electron 严格类型或安装包验收通过。

桌面最终证据：`/private/tmp/mira-workflow-timeline-desktop-20261012.NeIorR/report.json`，passed=true、errors=[]。实际源码审批→四阶段→两智能体并行→循环两轮→图冻结→智能体对话→返回焦点→重载恢复通过，五次 actor 请求，重载不重复执行。六张明暗截图已由独立收尾代理逐张查看，主代理另看其中五张。生产 Electron/React/授权桥/编译器/Pi Agent/SQLite/文件系统真实；本机 HTTP 模型回复与 DOM/CDP 输入受控。初次 `b8HPBK` 失败是验收驱动误把 `savePreference` 当即时主题通知，修正为重载主题后通过，未因此修改产品。

可见首版：正常窗口 PID6799 已更新并停在空稿任务首页，保留原 home/userData/sessionData；没有 seed、保存用户模型配置或发起模型请求。`/tmp/mira-workflow-visible-20261012.ZFUYJt/publish-report.json`，首页、Goal 候选、工作流页面三图已亲看，七入口 hash 与最终桌面验收一致。替换 PID97282 前两次核验身份、空草稿及无普通/Goal/工作流活动运行。长驻预览会话 7204，保留窗口打开。用户自行启动：在 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 运行 `npm run desktop:dev`，配置实际模型，Goal 用 `/goal <目标>`，工作流先选择项目再 `/workflow <需求>`，保存流程入口“自动化”→“工作流”。分支 `codex/mira-harness-first-slice`，本批未提交/推送。

剩余/下次开始：明天先走查首版侧栏、对话、Composer、Goal 和资源面板，优先修实际体验反馈；不再把 Goal、工作流轨道、智能体只读对话或已交 MCP/Hook 列为从零实施。后续核对 OAuth/profile、公开市场与真实供应商、rg 发布依赖，再分别进行原生 ZCode 同态对照、整体性能和 Windows/安装包验收。本批使用 CDP/capturePage，不冒称 computer-use 逐功能对等，也未证明性能无法继续改进；整体复刻目标保持 active。下方均为历史。

## 历史交付：首版可见、工作流能力与审批收口（2026-10-12 07:34 +08:00）

完成：Goal 已交付，Composer `/goal <目标>` 启动持续目标，真实逐轮计划与独立核验、暂停/恢复/清除和可选 Token 预算均已接通。模型 `/workflow`、人工源码审阅、后台执行、产物预览/保存沿上批保持。本批工作流智能体继承实际选择的全局/项目/插件 MCP，使用运行独立连接、项目指令及 Hook 生命周期；恢复识别为 resume，停止能取消 Hook/MCP 并回收进程。诊断性 Hook 错误保持既有继续策略，不把所有 Hook 失败称为阻止提交。

修复：主对话与工作流分别跟踪事件序号，主回复结束不会隐藏后台审批；并行审批保留并逐个显示。运行侧面板显示实际排队/派发/执行/等待/重试/完成/停止、任务指令、已完成轮次和最近观察工具；历史分页自动补读，同步期间不拿旧执行事件冒充最新状态，journal 终态优先。“任务执行中”覆盖模型及工具处理，不误称模型仍在生成。当前仍是事件摘要与节点列表，不宣称完整 operation/parallel/loop 图或智能体对话钻取已完成。

验证：文案最后修正前相关 18 文件 470 项通过（`/tmp/mira-workflow-actor-final-delivery-20261012.json`）；payload 守卫后 pilot 209 项通过；最后文案修正后 progress 10 项及 React 生产构建通过，数量不相加冒称最后全量。React/Vue 类型、flow 包严格类型及双生产构建已通过；未称整个 Electron 严格类型或全仓测试通过。独立复核关闭分页 P2 并实际查看 FxZbbs 五图，文案修正后主代理另逐张查看最终 m9cglT 五图。

桌面最终证据：`/private/tmp/mira-workflow-actor-desktop-20261012.m9cglT/report.json`，passed=true、errors=[]。真实 React `/workflow`→源码审批→父回复结束→后台智能体→项目与插件 stdio MCP→两次 UI 工具审批→Hook/SQLite 记录→进程回收通过；Hook 暂停及 MCP 调用暂停时分别走生产 Stop，确认实际进程退出，MCP 收到取消且工具为 cancelled。生产 Electron/桥/Agent/编译/存储/子进程真实；本机 HTTP 模型回复、DOM/CDP 输入和导入选择路径受控。公网模型、原生 ZCode computer-use、Windows、安装包及整体性能仍未验，不把本批称为完整复刻完成。

可见首版：正常窗口 PID97282 已打开并停在空稿任务首页，保留原 home/userData/sessionData，无 seed 或模型请求。`/tmp/mira-workflow-visible-20261012.QULy0U/publish-report.json`，首页、Goal 候选、工作流页三图已亲看，七入口 hash 与 m9cglT 最终验收一致。替换 PID58241 前两次确认无草稿、普通/Goal 活动任务及工作流 owner/run；首次发布驱动未等待 Lexical 清稿提交而失败，修正焦点/候选关闭/DOM 等待后以同一数据重开，仅清自己的 `/goal`，切页确认空稿，没有据此改产品。当前长驻预览会话 89177。用户启动：在 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 运行 `npm run desktop:dev`，配置实际模型后用 `/goal <目标>`；工作流先选项目再 `/workflow <需求>`，已保存流程入口“自动化”→“工作流”。分支 `codex/mira-harness-first-slice`，未提交/推送。

剩余/下次开始：先按用户实际走查反馈修侧栏、对话、Composer、Goal 和资源面板。下一开发切片直接对照 ZCode 工作流图与智能体对话详情，补 operation/parallel/loop 及节点钻取交互，不再重做已交 Goal、工作流执行、MCP/Hook 或产物入口。OAuth/profile、公开市场/模型实测、rg 发布依赖、原生同态对照、整体性能与 Windows/安装包分别推进；完整复刻目标保持 active。下方均为历史，旧“未实现”不能作为当前待办。

## 历史交付：目标模式复核、模型工作流与产物交付（2026-10-12 06:57 +08:00）

完成：目标模式已经接通，Composer `/goal <目标>` 创建持续目标，摘要/详情显示真实逐轮计划与独立核验，支持暂停、恢复、清除及可选 Token 预算。首版正常窗口已实际验证 `/goal` 候选与插入，插入不提交任务。本批新增 `/workflow <需求>` 模型创作：当前请求按需读取真实编译器 facade/规则/保存目录，保留原用户消息，不向普通对话注入整份接口。模型自写流程必须先读取当前契约；生成后宿主编译，再人工审阅本次完整源码/hash、阶段、参与者、交接、命令、实参及模型，full/Hook allow 不跳过确认，Hook deny 仍生效。审批冻结同一源/参数/执行体；接纳后在原主会话后台运行，不替换父模型，完成/失败通知排入原会话串行队列。独立保存工具另行审阅作用域、覆盖及项目优先关系，保存不执行；一次性草稿不自动升级为保存定义。

产物：运行侧面板的真实不可变发布版本可预览文本/Markdown/有限位图，并通过原生保存入口导出实际字节。渲染器只提供 session/run/artifact/version 身份，宿主复核 journal、指纹、hash、文件类型与所有权；不接受任意路径。HTML/SVG 仅源码，Markdown 不加载远程链接/图片。大文件明确提示保存查看；取消保存没有成功状态或文件。预览/保存的等待、失败重试与切换旧结果守卫均已接线。

修正：用户拒绝生成流程显示中文“运行工作流/保存工作流”和“已取消”，真实编译错误仍失败。自动完成通知在模型暂不可用或输入持久化失败后重试仍是内部消息，仅成功持久化后消费标记。审批卡的横向 flex 最小宽度约束已修，两个参与者卡与审批按钮完整容纳；长源码只在代码框横滚。收尾沿 Impeccable 局部修正并保留既有 ZCode 视觉，正式 CSS 从 app.css 引入。

验证：最后相关 27 文件 785 项通过 `/tmp/mira-workflow-authoring-delivery-tests-20261012.json`；目标摘要/存储/桥另 3 文件 71 项通过 `/tmp/mira-goal-delivery-recheck-20261012.json`，两组不重叠。React/Vue 类型、独立 flow 包严格类型及 React/Electron/Vue 生产构建通过；不称全仓测试或整个 Electron 严格类型通过，原有构建警告保留。Apache LICENSE/NOTICE.md 与 ZCode 原文逐字一致，改编记录已进入 React/flow 发布资源。

桌面最终证据：`/private/tmp/mira-workflow-authoring-desktop-20261012.P9QtJU/report.json`，四张明暗源码审阅/产物/重载截图已由主代理与独立代理逐张查看。验证真实生产 Electron→React→第一方授权桥→编译 Worker→子进程/真实 files.read→HTTP actor→SQLite/发布产物；拒绝不创建 run、不请求 actor；批准保留一个主会话和一次 actor；完成通知一次，重载不重执行，保存结果字节与发布版本一致。卡片与裁切祖先实际 rect、两个参与者 rect、按钮命中、Tab 源码焦点及 ArrowRight 真横滚均通过，不能仅以自身 scrollWidth 判断裁切。模型回复和原生保存对话框选择结果为本机受控夹具；保存文件系统是真实生产代码。早期 BOjcEe/H5nfYb 失败为验收驱动误用程序焦点/未展开工作过程，P9QtJU 修正驱动后通过；没有为这些测试误判改产品逻辑。

可见首版：PID58241 已保留原 home/userData/sessionData，留在干净任务首页，无 seed/新供应商/模型请求。`/tmp/mira-workflow-visible-20261012.DE3Jfg/publish-report.json` 与 `ready-report.json`，首屏、Goal 候选和工作流页面已亲看；main/preload/Vue HTML/React JS/CSS/flow runtime/compiler Worker 七入口 SHA 与最终桌面验收相同。替换旧 PID32021 前两次核验身份、无草稿/普通或 Goal 活动运行及工作流 owner/run；第一次预览驱动误写 Goal DOM id，旧预览正常退出后再用相同数据打开，未清空数据。DE3Jfg 首屏旧图含驱动输入，最后准确空稿图为 workbench-ready.png；仅清掉驱动自己的 `/goal`，经真实键盘和页面切换确认保留为空。仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness`，启动 `npm run desktop:dev`，先配置真实模型；Goal 用 `/goal <目标>`，模型工作流先选择项目再 `/workflow <需求>`，保存工作流仍在“自动化”→“工作流”。分支 `codex/mira-harness-first-slice`，本批未提交/推送。

剩余/下次开始：首版已经可以实际走查；优先处理侧栏、对话、Composer、Goal 与资源面板的用户反馈，不按下面旧待办重做 Goal、`/workflow` 或产物入口。后续切片为 workflow actor 项目/插件 MCP/Hook 完整生命周期，再核对 OAuth/profile、graph/timeline 细节和 rg 发布依赖；公网模型/市场、原生 ZCode computer-use、整体性能、Windows/安装包验收仍独立待办。本批是 CDP/DOM/capturePage，不冒称原生软件逐功能对等或性能已无法改进；整体目标保持 active。

## 历史交付：工作流桌面执行与可见首版（2026-10-12 06:18 +08:00）

完成：目标模式已经可用，Composer 输入 `/goal <目标>`，摘要/详情支持逐轮计划与独立核验、暂停/恢复和可选预算；本批不重做已交 Goal。新增真实工作流入口为侧栏“自动化”→“工作流”：全局/项目分组、保存定义与源码、宿主权威编译检查、项目/模型/参数启动、运行历史、会话摘要与侧面运行详情；停止、原模型原样续跑和并发调整均接实际服务。保存不执行；拒绝启动保留表单，接纳后导航失败只重试打开，不重复创建运行。补参数立即清除本地校验错误，保留独立宿主拒绝。

执行链：Controller/SQLite/启动恢复/退出等待及独立资源已接生产 Electron；第一方授权桥保留 `window.platform` 兼容并复核应用、窗口、能力与任务所属。真实配置模型→Pi Agent→既有 Harness 工具/审批/项目锁→工作流子进程→journal/上下文全部贯通。普通 Stop 和会话/Git 互斥覆盖工作流；命令使用已审批 argv，不解释 Shell 文本，取消/超时清理后代进程。修正极长 Node 超时、输出上限结构化错误以及供应商错误落盘前密钥脱敏。actor 固定原模型/推理档位，不让恢复替换源/参数。

验证：最后相关 17 文件 260 项通过 `/tmp/mira-workflow-final-delivery-tests-20261012.json`，含真实 Controller、编译 Worker、Node 子进程、HTTP 模型协议、Pi Agent、审批/工具、SQLite 及命令进程树取消回归。React/Vue 与严格 flow 包类型检查、Electron/Vue 与 React 生产构建通过；最后局部 UI 修改后 React 类型/构建与上述 260 项再次通过。既有 CSS highlight 构建警告保留，不称全仓测试或全 Electron 严格类型通过。Apache LICENSE/NOTICE 与上游逐字比较通过。

桌面最终证据：`/private/tmp/mira-workflow-desktop-20261012.c7f0De/report.json`，明暗六图、非法源码真实拒绝、缺参不启动、实际项目内容进入 HTTP 模型、执行完成、重载持久记录且模型请求仍仅一次。仅本机 HTTP 回复受控，产品服务/Agent/编译/存储均真实。修复长模型/会话标识常驻与代码字体覆盖；主行显示可读模型和中文动作，完整身份保留展开详情。最后采图等待 200ms 分屏展开结束，记录从运行面板到根节点每层 `clientWidth=scrollWidth` 和源码 computed 等宽字体；早版 `lQB7Gk` 横滚图是展开过程截图，保留为历史，未靠修改产品掩盖。

可见首版：正常预览 PID32021 已更新并留在任务首页，`/tmp/mira-workflow-visible-20261012.fYOAyn/publish-report.json` 与两张首屏/工作流图已亲看。替换 PID97561 前两次核验身份、无草稿/活动任务，原 home/userData/sessionData 保留；不 seed、不保存用户配置、不请求模型。预览六入口 SHA 与最终桌面证据完全一致。用户自行启动：仓库根 `npm run desktop:dev`，配置实际模型后使用 `/goal <目标>`；新工作流从上述侧栏入口创建。代码保留分支 `codex/mira-harness-first-slice` 工作树，本批未提交/推送。

剩余/下次开始：首版可以实际走查；先处理侧栏、对话、Composer、目标与资源面板的用户反馈。下一工作流切片为 Composer `/workflow` 与模型生成源码/graph 的运行审阅，产物字节读取/预览/下载仍未开放，当前仅真实元数据；actor 的项目/插件 MCP/Hook 全生命周期尚未全面接入。OAuth/profile、原生 ZCode computer-use、公网模型/市场、当前整体性能、Windows 与安装包验收分批继续，系统 rg 发布依赖仍需核查；本批 CDP 不冒称原生软件对比，整体目标保持 active。

## 历史交付：动态工作流执行底层（2026-10-12 05:42 +08:00）

首版状态：目标模式已交付，可从 Composer 输入 `/goal <目标>`，查看逐轮计划/核验、暂停/恢复及可选预算。现有工作台、后台智能体入口和插件 Hook 保持可用。正常预览 PID97561 本批未重启，main/preload/Vue/React/CSS 五入口再次核对与下方 05:06 表完全一致；本批是新增执行底层，不冒称预览已有工作流 UI。

本批完成：ZCode 编译/分析/schema/lowering/引擎及真实子进程/VM/NDJSON 改编为独立 `packages/mira-flow-kit`、`packages/mira-flow-runtime`；99 个来源文件逐项记录原路径/hash，文件与工作流符号采用 Mira 命名，保留 Apache LICENSE/NOTICE。宿主只接源代码，独立 Worker 由同一次 Program 生成 graph、askSpecs、actorProfiles 与执行体，包含取消/旧结果守卫和源 hash。新增全局/项目工作流定义存储、参数校验/CAS，四表 SQLite journal、持续 actor 上下文存储及 host-only RunService。真实 Pi Agent 连续 ask 保留会话/模型 pin、同 actor FIFO、跨 actor 独立；typed 结果经真实 submit_result→校验→修复/nudge，不解析最终文字。取消、关闭与原样续跑保留原脚本/cwd/args/caps、节点身份及上下文，最终返回前等待 Agent 转录落盘。

世界与产物：真实文件 read/glob/ripgrep、Git status/diff/log/changedFiles；命令仅通过编译声明及宿主注入的审批/argv 执行端口，无直接 Shell 回退。文件/Markdown 产物复制真实字节，fsync 后原子发布，使用 `mira-artifact://<sha256>` 和不可变 metadata/payload，处理重复发布、冲突与损坏。执行端口仍负责取消子进程与输出上限。运行子进程不继承供应商凭据/Node 注入；VM 与环境收窄不等于 OS 隔离。

验证：最终 9 文件 104 项通过 `/tmp/mira-flow-host-delivery-20261012.json`。联合链使用真实编译 Worker→压缩 runtime→Node 子进程→真实 Pi Agent→SQLite→文件/产物，只有模型 StreamFn 为受控夹具；验证结构化错误修复、连续上下文、累计用量、消息边界及数据库关闭重开。文件/Git/rg/受控命令另走真实 I/O。包 strict/noUncheckedIndexedAccess、Vue 类型、`npm run flow:build`、diff 检查通过；独立审查复核 minified childMain、99 项来源和取消修复。新增失败回归先红 `/tmp/mira-flow-host-failure-red-20261012.json`：通知监听器抛错及启动后异常原先遗留 running；现已隔离通知异常，执行失败先清理/等落盘再回收，并将未结算记录停为 interrupted，保留可续跑节点；不覆盖已结算结果。最终整合包含这两个回归，早一版 63/101 项属于对应中间状态。

剩余/下次开始：把新服务接入实际 `HarnessRuntime`、进程启动/退出、数据库与生产模型/工具/项目锁，然后接第一方授权桥、保存工作流中心、启动参数/项目选择、timeline 摘要、侧面运行/产物面板及 Composer `/workflow`。模型请求新建工作流须展示当前源/graph 的运行确认；直接用户启动已保存流程不增加冗余模型审批，保存不等于运行授权。当前没有新增工作流 IPC/UI，正常启动/安装包也未接新 worker/runtime 资源；不要把现有定时自动化称为工作流。原生 computer-use/ZCode 同态、公网、当前整体性能、Windows/安装包仍未验；整体目标 active，未提交/推送。用户首版启动仍为仓库根 `npm run desktop:dev`。

## 历史交付：插件 Hook 安装、审阅、真实执行与跳过状态（2026-10-12 05:06 +08:00）

完成：插件默认 `hooks/hooks.json` 与 manifest 对象/路径/数组统一解析、来源去重、稳定身份与版本；纯 Hook 插件可安装，未知事件/类型和被忽略的参数明确诊断。已安装详情显示命令、匹配、执行方式、来源及诊断，跳转 Vue Hooks 插件范围精确筛选。设置审阅授权/撤销只写宿主信任记录，不改第三方文件。主任务既有七事件执行批准的冻结声明，调用前复查当前插件、根路径、启用、冲突、版本和信任；时间线记录真实来源/输出。提供 Mira/Claude/ZCode 插件路径、数据、项目和会话变量，argv 字面展开，Shell 使用环境展开。

收尾修正：未授权的 Hook 不启动进程，保留工具记录/对话片段/事件并显示“已跳过”与理由，不生成执行 activity，不把正常完成误报为失败或部分完成。仅 Hook 的 `cancelled + skipReason` 使用此展示；真实执行失败、已接受声明后来失效及实际取消保留各自状态。五项新增复现先红后绿，独立审查确认存储与事件合并保留跳过理由。

验证：最终相关 14 文件 321 项通过 `/tmp/mira-plugin-hook-skipped-integrated-20261012.json`，含真实 Agent、进程、插件登记、信任、IPC、UI、导航及既有 Goal 回归。Runner 三项与跳过状态五项的失败复现分别保留在 `/tmp/mira-plugin-hook-runner-red-20261012.json`、`/tmp/mira-hook-skipped-red-20261012.json`。React/Vue 严格前端类型、双生产构建、diff 检查及 Apache LICENSE/NOTICE 逐字比较和归属同步通过；最后构建 `/tmp/mira-plugin-hook-skipped-react-build-20261012.log`、`/tmp/mira-plugin-hook-skipped-delivery-build-20261012.log`。303 项报告与此前构建属于跳过修复前历史，不冒称全仓测试或全 Electron 严格类型通过。

桌面：以 `/tmp/mira-plugin-hooks-desktop-20261012.8otttL/final-skip3-report.json` 为最终证据，明暗各 5 次实际 Agent 请求、3 次真实 Node Hook 进程、12 图通过。实际 React 添加纯 Hook 插件→Vue 审阅两份来源→主会话执行与结果→撤销/停用阻止执行→修改默认声明令旧授权失效，未变行内声明仍正常执行；跳过标签/理由与正常完成摘要已在本轮最终产物确认。真实主/预加载/Vue/React/第一方桥/SQLite；仅初始化 provider/project/未运行会话，原生目录选择器返回定向隔离夹具，公网请求被隔离。使用 Playwright/CDP/capturePage，不是原生 computer-use/ZCode 同状态比较。`final-report.json` 属于跳过修复前历史；初始失败报告保留，市场返回导航、macOS canonical 路径、异步会话选择和动画截图均为驱动问题，未通过修改产品绕过。桌面 agent 已逐张查看最终 24 图；root 另看最终浅色未授权与深色修改声明后的结果，确认“已跳过”和正常完成状态。

最终产物身份（已逐项核对桌面验收、正常预览和当前构建一致）：

| 入口 | SHA-256 |
| --- | --- |
| `out/main/main.js` | `9a4e5607651d2a2bbf162987c1064dac5d4ea94a6255b7ecc45852a33712e04a` |
| `out/preload/preload.mjs` | `12a976f20e899ee3140cda20f7e08c067d2f699bbf0a93ff758acfe5f83c532b` |
| `out/renderer/index.html` | `95a2e6cd8a91486d8998a78bac1cfcdf896657fc9540a76107cd9618bb264c54` |
| `dist/harness-react-app/app.js` | `16ca260d711eb20f1992d49b64c88df3fbc9aa73a4d19ed2c08a3c3914092b0d` |
| `dist/harness-react-app/app.css` | `4bc4ac1b983d49e1ac4ce37df7a2ce0c97a53cc7f113ad486480dd8382a81903` |

可见首版：正常预览 PID97561，报告 `/tmp/mira-plugin-hooks-final-visible-20261012.5otWIp/publish-report.json` 与 `workbench.png`，root 已亲看。替换 PID89214 前两次核验窗口身份、空草稿及无 activeRun；原 home/userData/sessionData 全保留，不 seed、不保存配置、不调用模型。最终隔离验收进程均正常退出，正常预览保留打开；早一版 `/tmp/mira-plugin-hooks-visible-20261012.anwzOf/publish-report.json` 及其 PID/产物只属历史。

剩余/下一入口：目标模式、Composer 后台智能体入口及插件 Hook 主任务链已交，首版可走查。先响应用户首屏实际反馈，再推进真实动态工作流和 OAuth/profile 等独立差异。ZCode 所提供版本只有七个 Hook 事件，子任务创建处也未注入外部 Hook runner/snapshot；子 Agent Hook 继承属于 Mira 可选增强，不作为缺失上游功能或首版前置。现有定时自动化不可冒称工作流，后续必须接真实脚本编译/执行/阶段/产物。原生对照、公网模型与市场、当前总体性能、Windows 和安装包仍未验，整体目标 active，未提交/推送。用户从仓库根 `npm run desktop:dev` 启动，配置模型后输入 `/goal <目标>`；下方旧待办和旧预览 PID 均属历史。

## 历史交付：目标模式互斥与 Composer 后台智能体入口（2026-10-12 04:35 +08:00）

状态：本轮补首屏实际交互，目标创建/核验/预算/重启链沿04:12已交实现继续，不重做后端；整体ZCode复刻仍active，未提交/推送。以下旧PID和证据属于各自历史。

完成：暂停目标后可制定计划，但计划模式中不能从摘要、`/goal resume`或`/target resume`恢复目标；提示先关闭计划模式，拒绝时保留草稿与目标身份。关闭计划只清除对应模式冲突提示，不清其他错误或输入。子对话不显示Goal候选，直接命令仍由既有门禁拒绝。参考ZCode Composer后台工作入口，主/侧任务只统计自己当前activeRun中queued/running/stopping子智能体；单个打开所属详情，多项打开既有执行面板，无活动隐藏，点击复核当前session/run/状态。没有虚构workflow或后台bash数量。

修正：生产CSS从`styles/app.css`统一导入，避免Tailwind覆盖TSX样式导入导致图标/count上下排列。侧面新入口键盘进入详情聚焦返回按钮，返回到仍存在入口或可编辑Composer；暂不可编辑时停留本窗格。该焦点链只作用新入口，不抢其他面板焦点。摘要环境与Goal条件均转Boolean，避免无Goal/非Git项目露出孤立“0”。

验证：整合中9文件351项通过 `/tmp/mira-goal-background-final-confirm-contract-20261012.json`；后续焦点fallback17项、最后摘要与相关52项分别通过 `/tmp/mira-background-return-unready-green-20261012.json`、`/tmp/mira-summary-last-zero-green-20261012.json`，不相加称最后全量。新增门禁、错误残留、焦点和两类0均有先红后绿复现。最终React严格类型、React构建、diff及许可证同步通过，最终构建 `/tmp/mira-goal-background-delivery-build-20261012.log`；Electron/Vue生产构建本轮较早通过，后续没有改这些源码。既有CSS highlight警告保留，不称Windows/release或全Electron严格类型验收。

桌面：`/tmp/mira-goal-plan-mode-desktop-20261012.BEIcUo/final-report4.json` 明暗各7图/7次受控本机请求通过，真实Goal暂停→计划阻止两条恢复命令且保稿→关闭计划清提示保稿→恢复同目标→无工具核验完成；真实delegate/wait/child read、计数同排/提示/所属详情/完成隐藏均通过，摘要无孤立0。agent逐张看14图，root另亲看最终浅色计数、深色完成。Side键盘真实进出通过`side-focus-final2.json`，root看其焦点截图；它属于React `8fa99953…`，最后只改Goal条件Boolean，不冒称在最终hash重跑Side。原失败报告/图保留，含产品缺陷及驱动空行/display blockification断言误差，不覆盖失败证据。

最终产物：main `55ef1abb…`、preload `923b77e6…`、Vue HTML `b762a86f…`保持04:12身份；React `9d41f0fd…`、CSS `28c32bad…`，完整SHA在final-report4。使用正式Electron/桥/SQLite/真实Agent及本机受控SSE，不是原生computer-use/ZCode同态、公网模型或总体性能验收。新增来源记录保留Apache LICENSE/NOTICE逐字内容并同步产物。

可见首版：PID74326正常预览已打开，两次无草稿/无activeRun及身份检查后安全替换63458，原home/userData/sessionData全保留，不seed、不保存配置、不请求模型。`/tmp/mira-goal-mode-visible-20261012.RR1nEQ/publish-report.json`与`workbench.png`，root已亲看，五入口与final-report4完全一致。预览脚本等待关闭是保留窗口，不是失败；本批自有验收进程已退出。

剩余/下次开始：可见首版主流程已具备，用户启动仓库根`npm run desktop:dev`，配置实际模型后输入`/goal <目标>`，管理用摘要或空`/goal`。先按首版实际走查反馈处理阻挡，再分批推进OAuth/profile mcpServers、完整Hook、workflow/media及原生对照/公网/整体性能/Windows发布；这些扩展不作为首版可见前置。本轮不新增总体性能结论，不声称已经无法改进。

## 历史交付：目标逐轮真实待办与长摘要（2026-10-12 04:12 +08:00）

状态：目标模式进一步对齐 ZCode 的逐轮权威待办摘要，本批已收口并更新正常桌面首版；整体复刻仍 active，未提交/推送。前一目标轮有实际实现、测试及桌面证据，属于 progress。本节是接续入口，下方旧 PID/产物/待办只属历史。

完成：Goal 保存每轮父任务实际 `kind=plan` 活动及 pending/running/completed/failed/stopped 状态，轮次间即便复用 plan ID 仍隔离；React 摘要显示真实完成数/总数。待办全部完成不等于目标核验通过，独立核验通过也不改写失败或未执行待办；没有真实计划时不生成 0/0，不从工具条数、子活动或缺失历史补造。过期 run/目标/轮次拒绝写入，暂停/预算仅容许既有运行项终态收尾；重启保存历史并停止遗留运行项。只在计划内容改变时写快照，不随每个文本片段写入；沿既有计划推进语义，不新增工具协议。

展示：长下一行动在摘要截三行、停止理由两行，完整当前核验理由/下一步保留在目标详情；逐轮标题及理由沿原提示。完成数量与核验状态同屏区分。真实 13 项计划可执行，新投影不加任意数量上限；Goal 展示文本脱敏、去 NUL、最多 4000 字符，原活动和工具协议不截改。

验证：新存储/执行回归先红后绿，store 28/runtime 23 共 51 项通过；React 摘要 20 项含三个新增复现先红后绿。最终相关 8 文件/218 项通过，`/tmp/mira-goal-plans-final-contract-green-20261012.json`；React/Vue 类型、React 与 Electron/Vue 生产构建、diff 和许可同步通过，桌面构建日志 `/tmp/mira-goal-plans-final-build-20261012.log`。整合初次 218 中 37 失败是两份旧 MCP 测试替身缺少新父工具快照使用的 getTools；只补空目录接口、保留原断言后通过，初次报告 `/tmp/mira-goal-plans-final-contract-20261012.json` 保留。没有以产品降级绕过测试；51/20 与218有重叠，不相加称全量。既有 CSS highlight 警告保持，全 Electron 严格 tsc、Windows/安装包仍未验。

桌面：`/tmp/mira-goal-plans-delivery-20261012.OieqPr/report.json` 明暗各 8 图/共16图通过，使用真实正式 Electron、SQLite、Agent 和每轮 set_plan→实际 write/read→无工具独立核验。每主题两轮目标10次模型请求，第一轮2/2仍 failed，第二轮2/2先等待核验再 passed；真实 one.txt/two.txt、两轮标签/状态及累计100 Token一致。同一隔离数据重开不 reseed，计划与核验历史一致、不额外续跑；无计划目标另2次请求且无虚构count。长下一行动来自实际第一轮核验回复，不用历史种子替代执行；576px桌面分屏预算保存、摘要滚动和正文/Composer边界通过。

视觉补证：agent逐张查看原16图，root另看浅色第一轮未通过、深色两轮完成、分屏与正常首屏。原预算图虽瞬时focus坐标通过，截图未显示预算框，不能算稳定视觉证据；保留原图/报告。仅重开同隔离home，滚动预算框至视区并focus，0/100/250ms及截图后仍保持焦点/可见，再补明暗两图 `/tmp/mira-goal-plans-delivery-20261012.OieqPr/confirm-budget.json`，root与agent均实际查看。补证没有模型调用/reseed/产品改动，五入口hash不变，六个自有验收PID均退出。以上为本机受控SSE模型，不代表公网模型质量、computer-use、原生ZCode同态或总体性能。

可见首版：正常PID63458，两次无可见草稿/无activeRun与身份检查后安全替换41737，原home/userData/sessionData保留，不seed、不写配置、不调用模型。报告 `/tmp/mira-goal-plans-visible-20261012.HRBne8/publish-report.json` 与 `workbench.png`，已亲看；最终main `55ef1abb…`、preload `923b77e6…`、Vue HTML `b762a86f…`、React `97164680…`、CSS `e359434b…`，完整SHA在报告，与桌面验收一致。用户数据启动仍为仓库根 `npm run desktop:dev`；实际配置模型后 `/goal <目标>`。原Apache LICENSE/NOTICE逐字保留，逐轮待办来源记录已同步正式产物。

剩余/下次开始：首版已可实际走查，优先处理用户主流程反馈；继续对照ZCode剩余扩展，包括OAuth/profile mcpServers、子Agent/plugin Hook完整覆盖、workflow/media及原生ZCode/公网模型/整体性能/Windows发布。本批没有新增总体性能采样，不声称“无法继续改进”，整体目标保持active。Goal逐轮待办与重启保持已交，不按历史待办重做；正式接续用本节与工作台交互规格，临时证据在 `/tmp`。

## 历史交付：项目 MCP、首发预选与目标逐轮进展（2026-10-12 03:55 +08:00）

状态：本批已完成并更新正常桌面首版；目标模式已补齐，独立项目 MCP 不再是未实施项。整体 ZCode 对齐仍 active，未提交/推送。接手从本节开始，下方旧 PID、产物和待办只属于各自历史时间。

完成：设置→MCP 在全局与已登记项目间切换、创建/编辑/启停/删除，保留未保存稿并隔离迟到响应。项目配置位于 `.mira/mcp.json`，读取不创建目录；损坏或符号链接配置拒绝覆盖，管理 IPC 只接受已登记 projectId。项目服务使用独立身份，stdio cwd 由宿主固定；父任务持有、子任务借用，停止/结束回收。审批后配置改动/停用/删除/取消选择阻断旧调用，Plan 或未选择时不启动；公开目录不泄露命令、URL、环境变量和请求头。

首发：项目新任务在发送第一条消息前即可用 `/mcp` 预选项目服务，不提前创建会话、进程或模型请求。切换项目或返回个人工作区移除旧项目服务选择，保留全局/插件选择与输入；晚到偏好不能回填旧项目。首条发送沿原准备会话→保存选择→发送链执行，显式 projectId 不回退到旧会话。

目标进展：摘要从权威逐轮核验历史显示真实行动、理由和状态，按 iteration/updateAt 去重；首轮显示目标，后轮使用上一轮 nextAction，缺历史不伪造日志、未来轮次或完成率。暂停/预算状态优先于迟到 running，只有 passed 显示完成。长目标和理由截断，详情沿原滚动与管理入口；明暗 576px 桌面任务分屏内独立滚动、预算键盘操作、正文与 Composer 不遮挡均已验。目标创建/续跑/核验、暂停恢复、预算与重启暂停的真实执行证据见下方 02:53 历史节。

启动修复：实际桌面发现旧迁移每次启动递归删除项目 `.mira`，会丢失 MCP、智能体、命令及 Hook。已移除根目录删除，仅迁移原回收格式的真实目录；未知文件和目录保留。三次 reopen/migrate 回归先红后绿，最终桌面在启动前写入项目配置，正常启动后仍在，不以晚注入绕过缺陷。失败证据 `/tmp/mira-project-startup-red-20261012.json` 与最终验收目录内 `startup-deleted-project-config-report.json` 保留。

验证：迁移修复前整合 18 文件/794 项通过，`/tmp/mira-project-goal-final-contract-20261012.json`；迁移修复后 storage/项目MCP/智能体/Hook/命令 5 文件/214 项通过，`/tmp/mira-project-startup-green-20261012.json`。不合并冒称最后全量。React/Vue 类型、React 构建在迁移修复前通过，迁移未改前端；最后 Electron/Vue 构建 `/tmp/mira-project-startup-fixed-build-20261012.log` 通过，React 日志 `/tmp/mira-project-goal-final-react-build-20261012.log`。原 highlight CSS 警告保持，全 Electron 严格 tsc、Windows/安装包不在通过范围。

桌面：项目设置/已有会话明暗各 3 组、共 10 图通过 `/tmp/mira-project-mcp-delivery-20261012.TSMEoQ/report.json`，包含实际设置保存→选择→审批→真实 stdio 结果及配置变更阻断，属于早期 main/React 产物。最终匿名首发+Goal 明暗各 3 组、共 14 图通过 `/tmp/mira-final-anonymous-goal-20261012.hjag71/report.json`，五入口身份前后一致，每主题 2 次任务模型请求与 1 次正常标题请求分列，实际项目 cwd/审批/SQLite/结果及进程退出已验。Goal 三轮历史是权威存储 lifecycle 渲染夹具，本批真实操作暂停和预算保存；不冒称本批重新执行三轮模型核验，真实续跑引用上述独立早期证据。验收 agent 逐张检查最终 14 图，root 另看浅色三轮、深色分屏预算、深色项目隔离与正常首屏。使用本机受控模型、真实 Electron/CDP，不是 computer-use、原生 ZCode、公网服务或整体性能验收；隔离进程均退出。

可见首版：最终 PID41737，旧 PID18495 两次无可见草稿/无 activeRun、身份匹配后正常退出；保留原 home/userData/sessionData，不 seed、不写配置、不调用模型。报告 `/tmp/mira-project-goal-visible-20261012.eIuyBb/publish-report.json` 与 `workbench.png`，root 已查看。最终 main `2f602f64…`、preload `923b77e6…`、Vue HTML `b762a86f…`、React `ea862bfd…`、CSS `652eb476…`，完整 SHA 见报告，与最终匿名/Goal验收一致。用户启动：仓库根 `npm run desktop:dev`；配置实际模型后输入 `/goal <目标>`，管理用空 `/goal`，暂停/恢复/预算也可在摘要操作。Apache LICENSE/NOTICE 保持，项目 MCP/首发/目标进展改编已记录并同步正式产物。

剩余/下次开始：优先按用户首版走查反馈修侧栏、对话、Composer、目标与资源面板的实际阻挡。OAuth、profile `mcpServers`、子Agent/plugin Hook完整覆盖、高级 workflow/media、原生 ZCode/公网模型/整体性能/Windows及发布包仍剩余；不将这些扩展当作可见首版前置。目标、项目 MCP、匿名预选和启动配置保护本批已收口，不按历史待办重做。临时证据在 `/tmp`，正式接续以本文件顶部和交互规格为准。

## 历史交付：子智能体 MCP、同名路由与目标分屏确认（2026-10-12 03:21 +08:00）

状态：目标模式已交付，本批进一步接通子智能体借用所选 MCP；最新正常首版已打开，整体 ZCode 对齐仍 active，未提交/推送。接手看本节；以下旧时间、PID、产物与待办均为历史。

完成：父任务冻结一份所选 MCP 工具描述符，测试/实现子角色借用同一连接；探索/审查仍保留本地只读上限。支持 `mcp`、`mcp__server__*`、`mcp__server__tool` 与真实 Mira 执行名选择/禁用规则，不允许任意 glob；本地 `read` 不匹配同名远程工具。Vue 智能体表单支持 MCP 选项并保留高级规则。实际子调用沿现有 schema、记录、审批、结果和独立取消信号执行；审批期间停用/改动插件或取消选择服务均阻断，子任务停止不关闭父连接，父结束回收。审批卡明确显示发起子智能体名称和子任务正文，界面使用真实工具名，配置及插件指令正文不进入公开审批。

验证：身份文案修正前，相关 10 文件/210 项通过（`/tmp/mira-child-mcp-final-contract-20261012.json`），后来另补取消选择回归；最后身份修正后 3 文件/65 项通过，其中真实父/子 Agent、SQLite 与 SDK stdio 专项 27 项（`/tmp/mira-child-mcp-identity-contract-20261012.json`）。不相加冒称最后全量。React/Vue 类型与 React 构建在身份文案修正前通过；最后只修改 Electron 文案和专项断言，Electron/Vue 生产构建与 diff 检查通过，日志 `/tmp/mira-child-mcp-identity-build-20261012.log`。

桌面：文案修正前明暗 6 组/8 图含真实审批、成功、子停止及高级规则表单，通过 `/tmp/mira-subtask-mcp-delivery-20261012.gQhXDO/report.json`；最终明暗 4 组/6 图确认姓名/任务、允许后真实 stdio 结果及 allow/deny 同屏无溢出，通过同目录 `final-confirm-report.json`，产物身份前后一致。root 另亲看最后浅色审批、深色规则表单和正常首屏。模型是本机受控 SSE；两次最终驱动定位失败是 ElementPlus 隐藏 native 控件/标签祖先定位，修正夹具后通过，未改产品。隔离应用均退出，不冒称公网模型或原生 computer-use/ZCode 同态验收。

目标布局补验：`/tmp/mira-goal-desktop-layout-20261012.h0veZf/report.json` 明暗各 4 状态/共 8 图通过，覆盖单窗 1164px、主分屏/子任务 576px、分屏加底部真实 PTY，长摘要可独立滚动，预算/清除可键盘聚焦，文流回退未遮挡正文或 Composer；该布局本批无需再改。Goal 不再是未实现项，操作说明见下一历史节与交互规格。

追加同名路由：只读实际 Pi Agent 复现两个服务同名 echo 时“审批最后服务、调用第一服务”，MCP read/bash 还覆盖内置审批描述；复现 `/tmp/mira-mcp-name-collision-20261012.test.ts`。新增正式回归8项先红后绿。将原插件命名空间集中到 McpManager，以 serverId/原工具名形成独立执行名，保留原名/服务元数据，远端仍调用原名；模型描述含明确服务来源。插件不二次命名，既有插件执行名保持。内置read/bash、Plan只读工具与子角色权限不再被同名MCP污染。

最后命名修正验收：root 新身份/插件父任务/插件子任务3文件45项通过，报告 `/tmp/mira-mcp-namespace-core-20261012.json`；代理另验连接11项、真实SDK远程18项、消息记录26项共55项通过。最后Electron/Vue构建 `/tmp/mira-mcp-namespace-build-20261012.log`、diff及许可同步通过，不称全量或重新运行未改动的React构建。最终真实Electron明暗两套流程：每套4次受控本机模型请求，内置read实际读取local.txt，两个global stdio服务均提供read，各自审批/调用/SQLite结果同源，公开界面保持原名无hash。`/tmp/mira-global-mcp-collision-20261012.viWDKU/report.json` 与 `confirmed-report.json` 通过，main `79cac058…`前后一致；后者仅等待展开挂载后补浅色结果图，未改产品或重跑整个场景。root亲看深色两服务结果、浅色west审批和最新正常首屏；子审批4组6图与Goal分屏证据属于上述早期产物，不冒称在最终命名产物重跑。全部隔离Electron/stdio进程已退出；不是公网模型、computer-use或整体性能测试。

可见首版：最终PID18495使用原home/userData/sessionData，PID11774两次无可见草稿/无activeRun、身份匹配后正常退出；较早PID86376同样已安全替换。最终 `/tmp/mira-mcp-namespace-visible-20261012.QBY0t8/publish-report.json` 与 `workbench.png`，不seed、不写配置、不调用模型，验收/预览产物完全一致。main `79cac058…`、preload `773077ce…`、Vue HTML `93de8a22…`、React `45e8eb9c…`、CSS `ab1bcbae…`，完整SHA在报告。用户自己的数据从仓库根 `npm run desktop:dev` 启动，模型需自行配置；输入 `/goal <目标>` 启动目标。Apache LICENSE/NOTICE保持，子MCP与统一执行身份来源已记入ADAPTATIONS并同步正式React产物。

剩余/下一入口：优先响应首版实际走查反馈；Goal、子Agent插件MCP和global同名路由从未实施待办移除。OAuth、独立项目MCP配置、profile `mcpServers`、子Agent/plugin Hook完整事件覆盖、高级workflow/media、原生ZCode/公网模型/整体性能/Windows发布仍剩余。后续先核对独立项目MCP配置入口与已有plugin配置边界，再分批补实现；不把这些扩展继续作为首版可见的前置条件。临时验收证据在 `/tmp`，操作与正式进展以本文件和交互规格为入口。

## 历史交付：目标模式与首版收口（2026-10-12 02:53 +08:00）

状态：用户新增的目标模式已交付，存储/运行核验/React 三线并行完成，正常首版已更新并打开。目标模式本批收口，整体 ZCode 对齐仍进行中；没有提交或推送。接手先看本节，下方时间、PID、产物和待办均属历史。

完成：Composer `/goal <目标>`（`/target` 别名）创建目标并执行，空 `/goal` 或 `show` 展开详情；摘要内暂停/恢复/清除、用时/迭代/可选预算和 timeline 逐轮核验接通。`pause`、`resume`、`clear`、`budget <正整数|none>`、`replace <目标>` 同样支持原生命令。普通执行每轮结束后另起无工具核验，宿主提供最近 60 条、最多 64 KiB 脱敏工具证据；未满足且有具体下一行动才续跑，核验通过才完成，异常/无下一行动暂停。核验只判断已有证据，不独立执行验收工具，不能保证任意模型判断正确。

安全与持久：SQLite 保存目标身份/版本、用时、实报 Token、逐轮核验和消息锚点；暂停先持久再取消，拒绝迟到通过，重启结算到最后记录并暂停。父任务/子任务/核验/自动压缩实际 usage 累加，不估算消费。预算默认不限，达到预算停止后续请求及工具调用，单次在途请求可能超额；提高或取消预算仍等待显式恢复。目标创建沿普通 FIFO，不挤成运行中指导；附件及结构化引用保留普通消息语义，Plan 不创建目标，旁路子对话不支持 Goal。

最终修正：明暗初次截图发现暂停顶栏误报完成、增额后仍显示用尽、摘要遮挡用户气泡；已修为真实目标状态、“已暂停，待恢复”，显式展开摘要预留正文空间。最终验收的阅读区宽 1158px，正文右边界 1074、摘要左边界 1098，保留 24px 间隔，12 个展开状态均测量通过；800px 以下桌面任务单元使用文流布局的回退未做本批实机专项，不冒称多窗格全部验收。

验证：期间完整 219 文件/4053 项通过（`/tmp/mira-goal-full-suite-20261012.json`）；运行/契约整合后 9 文件/563 项通过（`/tmp/mira-goal-final-contract-20261012.json`）；最后状态/布局修正后 6 文件/289 项通过（`/tmp/mira-goal-ui-final-contract-20261012.json`）。前两份不冒称最后源码全量重跑。最终 React/Vue 类型、React 和 Electron/Vue 生产构建、diff 检查通过；原 CSS highlight 构建警告保持，全 Electron 严格 tsc、发布包和 Windows 不在通过范围。

桌面：`/tmp/mira-goal-ui-confirm-20261012.g0KXjT/report.json` 最终明暗各四组共八组/14 图通过。正式 main/preload/Vue/React/第一方授权/SQLite/真实 Agent/file write：两轮 one.txt/two.txt、重复 provider tool ID、failed→passed 两轮核验及实际 60 Token；暂停拒绝迟到 passed；10 Token 预算暂停，增到 30 不自动运行，恢复后实际累计 19；show/clear 不请求模型。模型为本机受控 SSE，使用隔离数据，不是公网模型、原生 computer-use 或 ZCode 同态验收。初次14图代理逐张查看发现上述问题，最终主 agent 查看暂停、核验、预算三张及正常首屏；不把 DOM 测量冒称所有最终图逐张人工复核。初次证据 `/tmp/mira-goal-delivery-20261012.vSVQXt/` 保留，早期启动/picker 夹具错误报告亦保留。

可见首版：正常 PID86376，原预览 home/userData/sessionData 保留；PID35996 两次无可见草稿/无活动 run 检查且身份匹配后正常退出。报告 `/tmp/mira-goal-visible-20261012.K8IKIV/publish-report.json`，`workbench.png` 已查看；不写配置、不 seed、不调用模型。用户启动仓库根 `npm run desktop:dev`，会预构建正式 React；没有模型时先在设置配置，测试 fixture 不会进入正常预览配置。main `b3b1ba4d…`、preload `773077ce…`、Vue HTML `9ccdbeab…`、React `45e8eb9c…`、CSS `ab1bcbae…`（完整 SHA 以上述报告为准）。Apache LICENSE/NOTICE 保持，目标模式改编来源已写入 ADAPTATIONS 并同步正式产物。

剩余与下一入口：先让用户走查首版侧栏/对话/Composer/目标模式/资源面板，修实际阻挡反馈；目标模式不再列作未实现。OAuth、独立项目 MCP/子 Agent 插件 MCP、plugin Hook/高级字段完整覆盖、高级 workflow/media、原生 ZCode 对照、公网模型、总体性能及 Windows/安装包另批推进，不以这些扩展继续推迟首版。验收临时目录位于 `/tmp`，不是永久发布交付；正式进展与操作说明以本文件和工作台交互规格为接续入口。

## 历史交付：插件 MCP 真实调用与首版更新（2026-10-12 02:20 +08:00）

状态：插件声明解析、会话执行、React 目录交互三线并行完成；最终明暗生产 Electron 8 组通过，正常首版已打开。本批收口，完整 ZCode 复刻仍 active；本 agent 未提交/推送。以下旧条目的 PID、产物及待办只属于各自历史时间。

完成：支持纯 MCP 插件、默认 `.mcp.json` 和 manifest 的内联/相对文件/数组合并；stdio、HTTP、SSE 沿现有 SDK。插件清单展示真实服务数量、协议及不可用原因，`/mcp` 按所属会话选择，插件服务显示“任务启动时连接”，不提供误导的全局重连。公开目录不包含启动参数、URL、环境变量或认证请求头。

执行：父任务按当前项目目录建立独立连接，真实 schema 和唯一工具命名空间进入 Agent；现有审批、参数检查、工具结果、下一轮模型和停止回收接通。执行前重验冻结修订与实际启用状态，审批期间停用/修改不能继续调用；并发项目的 cwd/env/进程隔离。冻结目录失效需要新建会话重新选择。namespace 只用于执行身份；工具记录、提示/可访问名称和运行中悬浮摘要显示实际工具名。主动停止详情使用中性色，无失败警报；真正失败保留错误状态。

验证：最终展示修正前完整 215 文件/3974 项通过，报告 `/tmp/mira-plugin-mcp-final-suite-20261012.json`。随后实际截图发现内部工具名和主动停止的红色详情，新增回归先红后绿；最后工具行/摘要修正后 5 文件/77 项通过，报告 `/tmp/mira-plugin-mcp-last-contract-20261012.json`，React/Vue 类型、React 与 Electron/Vue 生产构建及 diff 检查通过。3974 不冒称最后修正后重跑全量；严格全 Electron tsc 不在通过范围。

桌面：最终 `/tmp/mira-plugin-mcp-delivery-20261012.bFkTOI/last-report.json` 明暗各四组通过：真实插件导入/浏览不启动，`/mcp` 选择→schema→审批→实际结果，审批期间实际停用后阻断，长调用实际停止/子进程回收。使用正式 main/preload/Vue/React/第一方 IPC/SQLite/Agent 和真实 SDK stdio 进程；本机 SSE 模型回复受控，目录选择器返回隔离 fixture，不称原生 chooser、公网模型或 computer-use/ZCode 同态验收。最终 12 图含明暗插件清单、picker、审批、成功、阻断与停止；验收代理逐张查看，主 agent 另查看真实结果及正常首屏。工具行/审批胶囊均不露内部 hash，取消详情中性/noAlert；实际运行产物与冻结身份一致。

可见首版：PID35996 使用原预览 home/userData/sessionData，正式页面为 `/workspace/harness-react`。之前 PID24620 已由缺失进程及 exec exit0 确认退出，重新启动未写配置、测试种子或请求模型，不声称本次有退出前保稿检查。报告 `/tmp/mira-plugin-mcp-last-visible-20261012.w96Ppz/confirmed-publish-report.json`，稳定截图 `workbench-stable.png` 已亲看。用户自己的数据从仓库根运行 `npm run desktop:dev`；预览没有配置模型时需先在设置中配置，不能把 fixture 的模型当作真实已配置服务。`harness:dev` 不是正式 React 页面热更新。

产物：main `91ab8709…`、preload `11f23746…`、Vue HTML `1fdca4a5…`、React `6fbcab73…`、CSS `a5d30e8d…`，完整 SHA 在上述最后报告。Apache LICENSE/NOTICE 保持，ADAPTATIONS 已同步到正式 React 产物；早期 accepted snapshot 的许可记录未包含本批追加，不用早期记录证明最终许可同步。本批没有新增整体性能采样，停止 111/113ms 只是两次本机受控功能样本，不是 P95、优化比例或公开服务结论。

剩余与下一入口：首版已经可用，优先处理用户在侧栏、对话、Composer、工作面板实际走查的反馈。完整复刻仍有扩展能力（OAuth/项目 MCP 配置、plugin Hook/子 Agent 的完整覆盖及未支持高级字段）、高级 workflow/media，以及原生 ZCode 对照、公网模型/市场网络、当前整体性能、Windows/安装包验收。插件 MCP 父任务接通不等于独立项目 MCP 配置或子 Agent 插件 MCP 已交付；OAuth/auth、timeoutMs、user_config 和插件 data/session/skill 上下文变量明确不可用。后续分批交付，不用这些扩展推迟首版可见窗口。

## 历史交付：全局/项目 Hooks 与真实执行链（2026-10-12 01:07 +08:00）

状态：2026-10-12 01:20 +08:00 收尾，本批实现已冻结，唯一信任审核排版修复通过独立视觉审查，结论 ship 仅限本批，已收口；正常可见首版已更新。完整 ZCode 复刻仍 active，未提交/推送。

完成：设置→Hooks 支持全局/项目配置及七事件 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、`Stop`，存储与管理 IPC 限宿主使用。可配置 argv/shell、匹配条件、仅 command 的异步模式和高级超时/退出码/custom；CRUD、版本冲突保稿、信任当前 revision 与修改撤销信任接通实际文件。默认 60 秒、可配 1–600 秒、输出上限 32 KiB，属于行为边界，不是性能结论。

运行：真实 Agent 生命周期执行 Hook，支持工具参数替换、审批 `allow/ask/deny`、真实工具成功/失败事件；Stop 初始执行后最多继续三次，停止实际回收子进程，异步 Hook drain 完成才进入 idle。上下文和实际 Hook 执行记录可见。动态 permission rules 明确不支持，本批不覆盖子 Agent 或 plugin Hook 的完整事件链。

验证：完整 213 文件/3942 项通过对应末尾小调整之前；排版修复前设置 23 项与 runtime 17 项共 40 项通过，runner/coordinator 另 66 项通过，最后排版修复后设置 23 项、Vue 类型与 Electron/Vue 生产构建再次通过，不叠加冒称最终全量重验。严格全 Electron tsc 未通过，该检查不是既有配置，不能声称全类型全绿。React JS/CSS 本批未变。原冻结构建 `/tmp/mira-hooks-build-accepted-20261012.log`；排版修复前末 40 项 `/tmp/mira-hooks-last-contract-20261012.json`。

实际桌面：排版修复前冻结生产 Electron 明暗 15 组（8 light/7 dark）功能验收通过，使用真实本机 SSE 模型、SSE MCP、真实审批、Hook subprocess 和 SQLite 保存；外部编辑全局/项目配置后重新信任、长运行停止后实际 PID 消失均已验。报告 `/tmp/mira-hook-delivery-20261012.Jz2att/confirmed-report.json` 与 `confirmed-current-identity.json`，对应当时489源文件/583产物身份，不冒称15组已在最终排版产物重跑。

视觉收尾：信任审核改为 `dl` grid，完整标签保持单行，值独立并以路径 `wbr`/等宽呈现、宽度上限640px；修复后明暗global/project四张稳定图逐张复核，DOM确认完整标签singleline/noOverflow，独立审查ship仅覆盖此排版。报告 `/tmp/mira-hook-delivery-20261012.Jz2att/layout-review-report.json`。原accepted项目文件补图时已不存在，项目图使用等价隔离重建的timestamp/revision，不声称保留原文件；四图没有执行Hook、确认信任或请求模型，四个自有验收进程已退出。

可见交付：正常预览 PID81549 替代 4383，原 home/data 保留，没有测试种子、配置写入或模型调用；最终排版产物在两次确认无草稿/运行后同窗reload成功，未写配置/数据。原确认 `/tmp/mira-hooks-visible-20261012.4hn8u7/confirmed-publish-report.json`；最终刷新 `/tmp/mira-hooks-visible-20261012.4hn8u7/layout-refresh-report.json` 与 `workbench-layout-final.png`，总控已亲看。使用自己的数据仍从仓库根运行 `npm run desktop:dev`；`harness:dev` 不等于正式 React 页面热更新。

产物：最终Vue HTML `b65fa633…`；main `48123ef5…`、preload `11f23746…`、React `96b07a43…`、CSS `a5d30e8d…`保持原冻结身份。最终Vue身份见排版审核/刷新报告，原完整SHA见功能身份报告。ZCode许可证与NOTICE保留，ADAPTATIONS已记录Hook改编。

剩余/下次开始：让用户走查可见首版，先修首屏主流程实际反馈；其余按三批推进：OAuth/项目插件 MCP，高级 workflow/media，原生 ZCode 同态/公网模型/总体性能/Windows 安装包。15组本机Electron功能流程和最终四图排版审核不代表这些范围已验；本批已收口，整体复刻未完成。以下为历史记录，旧 PID 和旧待办不代表当前状态。

## 历史交付：远程 MCP 停止与超时恢复（2026-10-12 00:28 +08:00）

状态：运行层修复、停止链审计、实际桌面验收三线并行完成，本批收口；正常可见首版已更新。完整 ZCode 复刻仍进行中，未提交/推送。

完成：仅修改 `electron/adapters/mcpManager.ts` 与既有 `tests/miraMcpRemoteRuntime.test.ts`。工具执行将所属 Agent 的 AbortSignal 交给实际 SDK；已取消请求不发送，进行中取消返回稳定的“运行已停止”，不关闭共享连接。SDK 将取消包装成 RequestTimeout 时优先按真实 signal 分类；没有用户取消的超时显示“工具调用超时，请重试”，保持 SDK 默认 60 秒。React、Vue 与 Harness 原有停止身份、工具 cancelled、活动/回复 stopped、草稿和 idle 收尾复用，不提前伪造空闲。

验证：新增 HTTP/SSE 六项复现修改前全红，修改后相关 5 文件 148 项通过，Electron/Vue 生产构建与 diff 检查通过；只读审计另跑既有停止链 3 文件 233 项，范围有重叠，不相加为全量。本批没有重跑全量或未改动的前端类型/React 构建。实际冻结生产 Electron 明暗 HTTP/SSE 停止和恢复共 8 组，再独立实际默认 60 秒超时/恢复 2 组，共 10 组。真实审批后点击停止按钮或 Esc，会话停止收尾 33–70ms、SDK 服务端取消 32–68ms；旧 HTTP requestId 的实际迟到响应不覆盖重试后的历史和 UI。真实超时在 60009ms 触发服务端取消，工具保留 failed，稳定错误进入模型与界面，原连接重试成功；不是缩短定时器的桌面结论。定向测试中的超时仅加速 SDK 定时器，单独保留该边界。

证据：`/tmp/mira-mcp-abort-red-20261012.json`、`/tmp/mira-mcp-stop-integration-20261012.json`；桌面 `/tmp/mira-mcp-stop-delivery-20261012.8DjfpV/confirmed-report.json`、`timeout-report.json`、`final-delivery-identity.json`。484 源文件/581 产物与冻结一致；代理逐张核看 10 图，总控另看停止、重试、超时及正常预览图。3 个验收 Electron 进程/3 个服务端口已关闭。

可见交付：正常预览 PID4383 替代 98324，原 home/userData/sessionData 保留，没有模型请求、测试种子、配置保存或主题改动。先两次核实无草稿/运行再正常退出旧预览；临时发布脚本两次读取调试端口失败（ESM require、userData/sessionData 路径），仅关闭自身新实例，修正脚本后恢复，不为驱动修改产品。稳定确认 `/tmp/mira-mcp-stop-visible-20261012.0f8BsP/confirmed-publish-report.json`，`workbench-stable.png` 已查看。自己的数据仍从仓库根 `npm run desktop:dev` 启动。

产物：main `a4368741…`；preload `29866f4e…`、Vue HTML `45e42cd1…`、React `96b07a43…`、CSS `a5d30e8d…` 未变，完整 SHA 在最终身份报告。停止延迟仅是本机受控调用样本，不代表公开服务、总体性能或 before/after 性能验收。

剩余/下次开始：对照 ZCode 的 Hook 配置入口和实际触发链补齐扩展交互；OAuth、项目/插件 MCP、高级工作流/媒体继续独立推进。当前没有可调用 computer-use，实际验收用 Electron/CDP，未完成原生 ZCode 同状态逐项对照、公开远程服务/模型、总体性能、Windows/安装包。以下是历史记录，旧 PID 和旧待办不代表当前状态。

## 历史交付：远程 MCP 完整调用切片（2026-10-12 00:13 +08:00）

状态：设置、SDK传输/存储、实际桌面验收三线并行完成，本批收口；可见首版已更新，完整ZCode复刻仍active。

完成：设置→MCP服务支持旧stdio及环境变量、Streamable HTTP、SSE及请求头JSON；内联编辑、真实状态/工具数、单服务重连、失败保稿/重试、未保存离开保护。清空可选字段确实清掉旧凭据，连接中有界刷新且不覆盖编辑稿。配置损坏明确提示、保留原字节，不阻挡桌面启动。正式SDK连接有15秒上限和失效版本保护；远程认证/网络错误脱敏，实际工具的schema/必填项传给模型并参与参数校验。React `/mcp`选择只影响所属会话，真实工具沿原审批/记录执行；设置IPC限宿主主Frame，React授权桥不暴露URL/请求头/环境变量。

验证：最终206文件/3768项全量、Vue/React类型、React与Electron/Vue生产构建通过；33许可文件/发行NOTICE一致，原构建警告保留。实际隔离生产Electron明暗各5组及配置损坏2组，共12组通过；明暗每套4次受控本机模型SSE请求、HTTP/SSE各1次真实MCP工具调用。覆盖UI创建/存储/刷新、401、失败保稿、单行重连保兄弟连接、实际选服务/参数schema/审批/结果，以及真实子frame的四直接IPC拒绝。随后仅重开原隔离home、展开工作过程/工具输出，明暗HTTP/SSE四图和DOM显示真实marker，零新增模型请求。22张成功截图已由验收代理全部核看；总控另查正常首版4图、稳定设置2图与隔离保稿/终态2图。484源码/581产物身份一致，8测试Electron进程及5端口已关闭。报告 `/tmp/mira-remote-mcp-delivery-20261012.A0zQIK/confirmed-report.json`、`expanded-output-confirmed-report.json`、`final-delivery-identity.json`；全量 `/tmp/mira-remote-mcp-all-tests-20261012.json`。三份早期driver定位失败保留，未为脚本改产品，也不计入通过组数。

可见交付：正常预览PID98324替代64331，先两次核实无草稿/运行，再平滑重启；原预览home与数据保留，没有测试服务/模型注入、配置保存或模型请求。明暗工作台与HTTP表单已确认，最终浅色工作台保持可见。设置首次两图截在Element下拉退出动画内，仅一次等待真正关闭后补稳定两图，产品未改；确认报告 `/tmp/mira-remote-mcp-visible-20261012.eTr7Hb/confirmed-publish-report.json`，稳定图 `mcp-settings-stable-light.png` / `mcp-settings-stable-dark.png`。使用自己的数据仍为仓库根 `npm run desktop:dev`。

产物：main `7c81918b…`、preload `29866f4e…`、Vue HTML `45e42cd1…`、React `96b07a43…`、CSS `a5d30e8d…`；完整SHA见最终交付确认。未做新性能采样，不套用历史性能结论；未提交/推送。

剩余与下次：先核验远程MCP运行中停止/超时，再补OAuth、项目/插件MCP及Hook；高级工作流/媒体、原生ZCode同状态对照、真实远端服务/模型、性能、Windows/安装包继续独立推进。当前无可调用computer-use；本批使用Electron/CDP/capturePage和受控本机服务，node-enabled隔离iframe仅为产生真实子frame IPC，不代表生产开启node能力。不能称完整MCP/OAuth或整体复刻已完成。以下为历史记录，旧PID与旧待办不代表当前状态。

## 历史交付：可见首版与智能体独立模型（2026-10-11 23:49 +08:00）

状态：可见首版已更新，本批并行开发已收口，完整复刻仍 active。设置界面、独立模型存储与真实委派、桌面验收分别并行；现有侧栏、对话、Composer、悬浮摘要和资源面板可以先使用，不等待其余扩展完成。

完成：设置→智能体中，内置四角色与已安装插件智能体可独立选择实际模型和推理强度，或恢复继承父模型。配置独立存于 SQLite，不改插件原文件；失效模型保留原值并说明原因，实际委派拒绝静默回落。项目锁等待、审批后和工具执行前复核配置；保存失败只回滚对应行，保留其他自定义智能体草稿。自定义智能体原结构化表单与专属模型仍保持独立。ZCode 许可及改编记录保留。

验证：最终 202 文件/3698 项全量通过，Vue/React 类型检查与 Electron/Vue 生产构建通过；React JS/CSS 本批未改变。实际隔离生产 Electron 明暗各4组、合计8组通过，真实 IPC/SQLite/Lexical/父子运行时，明暗各16次受控本机 SSE 请求。覆盖持久保存、父子模型分流、恢复继承、停用/删除模型拒绝及一次显式 IPC 失败后的局部回滚与保稿。15张截图已核看，其中 `final-light-failure.png` 是保留的定位器失败图，不作为成功画面；保稿依实际 DOM，继承模型依真实请求身份。484源码/581产物身份一致，隔离7进程/7端口均已退出。报告 `/tmp/mira-agent-model-delivery-20261011.TTiTpl/delivery-report.json` 与 `delivery-identity.json`，全量 `/tmp/mira-agent-model-all-tests-20261011.json`。

可见入口：正常预览 PID64331（已替代28640），保留原预览 home 和数据，最终为浅色工作台，无测试模型/插件注入或模型请求。明暗工作台/设置4组及截图已确认，无页面错误；报告 `/tmp/mira-user-agents-visible-20261011.VJYamO/agent-model-publish-report.json`。使用自己的模型与数据，在 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 运行 `npm run desktop:dev`；`harness:dev` 不等于正式 React 页面热更新。

产物：main `db968ab7…`、preload `ca151eab…`、Vue HTML `4b085d8c…`、React `ab18fdbf…`、CSS `a5d30e8d…`，完整 SHA 在交付确认报告中。33许可文件及发行 NOTICE 一致；原构建警告保留。没有新性能采样，不套用历史速度/内存结论。

剩余：Hook、远程 MCP/OAuth 和尚未对齐的高级工作流/媒体；原生 ZCode 同状态对照、真实远端模型、完整性能、安装包与 Windows 验收。当前没有可调用 computer-use，Electron/CDP/capturePage 不替代原生电脑验收。本批设置返回后的 `@` 候选点击未建立；插件执行验证使用实际 Lexical 引用恢复并显式提交。下一次先处理用户首版可见反馈，再推进独立扩展；未提交/推送。以下为历史记录，旧 PID 和旧“剩余”不代表当前状态。

## 历史交付：结构化智能体表单（2026-10-11 23:22 +08:00）

状态：可见首版已更新，完整复刻继续。三线并行完成 Vue 表单、Markdown 转换与真实 Electron 验收；本批收口，不追加扩展阻挡首版使用。

23:24 +08:00 收口确认：代理已查看全部10张明暗图，总控另查两张正常窗口及两张隔离流程图；冲突保稿依据实际DOM断言，不从只显示顶部的截图推断。482源码/580产物逐项一致，隔离PID31351/31540及端口57346/57377已退出，正常PID28640保留。确认报告 `/tmp/mira-agent-form-delivery-20261011.pkrmd6/delivery-identity.json`。

完成：设置→智能体默认表单编辑，包含名称、用途、八色、实际可用模型与推理强度、可见工具复选框、禁止工具、系统指令及 AGENTS.md 继承。保留高级 Markdown；未改动往返保持字节，修改已知字段保留注释与完整正文，不可表示字段/无效 YAML 留在高级编辑。未命名的新建可切高级但不能保存；缺失模型明确提示、可改为继承。已有名称/范围固定，冲突与取消换范围保留稿；工具声明不能扩张委派角色上限。许可改编表已补充并同步发行目录。

验证：3 个相关测试文件 51 项、Vue 类型与 Electron/Vue 生产构建通过；本批未重跑全量/React构建或性能采样。实际隔离生产 Electron 明暗各4组、共8组通过，真实Vue控件/IPC/SQLite/父子Agent和本机双provider SSE，覆盖结构化创建、无损切换/高级回退、冲突保稿和实际专属模型/工具/正文/AGENTS委派。源码482/产物580身份一致，报告 `/tmp/mira-agent-form-delivery-20261011.pkrmd6/candidate-report.json`，相关检查 `/tmp/mira-user-agent-form-targeted-20261011.json`。main/preload/React/CSS保持上一批hash；Vue HTML为 `a1508de9…`，不将以前3644项冒称当前全量。

可见交付：正常预览PID28640、原home与数据保留；确认无用户输入/运行后同窗刷新。结构化表单演示已取消并明确丢弃，没有保存测试Agent或请求模型，最终回工作台保持可见。报告 `/tmp/mira-user-agents-visible-20261011.VJYamO/structured-form-publish-report.json`；表单与工作台两图已查看。首次演示脚本点到Element Plus内部combobox被选中文字遮挡，仅调整/tmp定位到可见wrapper，保留演示正文后继续，未为脚本改产品。

启动：仓库根 `npm run desktop:dev`。首版主体验（侧栏/对话/Composer/摘要/资源面板）和命令、智能体管理已可走查。下一步先修首版实际反馈；其余按三批推进：扩展配置（Hook、远程MCP/OAuth、内置/插件Agent模型覆盖）、未对齐高级工作流与媒体、性能/原生同态/安装包与Windows验收。当前无可调用computer-use，CDP/capturePage不能冒称原生ZCode逐项对照。未提交/推送；整体目标保持active。以下为历史记录。

## 当前交付：可见首版与自定义智能体（2026-10-11 22:52 +08:00）

正常窗口最后已在确认无草稿/运行后同窗刷新，PID28640/home不变；实际服务JS与最终构建 `ab18fdbf…` 一致，无页面报错，浅色首屏已复核。最终发布报告 `/tmp/mira-user-agents-visible-20261011.VJYamO/refreshed-candidates-report.json`，截图同目录 `refreshed-candidates-workbench-light.png`。本轮实现与发布到此收口。

2026-10-11 23:03 +08:00 最终收口：可视补验发现候选键盘高亮未完整滚入列表，已仅修候选组件内部scrollTop与异步布局校正，不滚页面/timeline。既有焦点测试21项、React类型及重建通过；最终明暗2项真实ArrowDown与两图通过，选中行完整可见、外层滚动不变、未提交/无模型请求。证据 `/tmp/mira-user-agent-delivery-20261011.G6R5Bn/final-visible-report.json`，最终React `ab18fdbf…`；main/preload/Vue/CSS与前12组一致。下文3644项和12组为滚动修正前产物，不冒称最后全部重验。当前正常首版PID28640复用原home-preview，管理/工作台明暗4图与实际入口确认通过，报告 `/tmp/mira-user-agents-visible-20261011.VJYamO/confirmed-publish-report.json`；旧PID61015在无输入/运行时平滑退出，数据保留。未提交/推送，整体复刻仍active。

完成：按用户要求并行开发存储、Vue 管理/React Composer、真实子任务回归与桌面验收，主线整合授权桥和运行时。设置→智能体支持全局/项目 Markdown 创建、编辑、启停、删除回收与版本冲突保稿；Composer `@ / +` 显示真实来源和不可用原因，选择只插入请求，实际由主 Agent 委派。项目优先于全局，最高优先级停用或不可用明确拒绝，不静默回落。子任务读取宿主指令，工具与角色上限取交集；支持专属 provider/model/thinking 与 AGENTS 继承开关，侧面板显示实际来源及模型。获得项目锁后、审批后与执行前复核来源和版本；专属模型凭据不会进入公开报告与工具输出。

验证：最终200文件3644项通过，Vue/React类型与React、Electron/Vue生产构建通过；33许可文件及NOTICE与发布目录一致。实际生产Electron明暗各6组、合计12组通过，真实IPC/SQLite/Lexical、父子Agent和本机受控双provider SSE，覆盖管理、冲突、仅引用、真实委派、跨项目、模型切换、停用/不可用/缺模型拒绝及回收删除。证据 `/tmp/mira-user-agent-delivery-20261011.G6R5Bn/stable-report.json`；全量 `/tmp/mira-user-agent-delivery-all-tests-final-20261011.json`。初次全量3项为旧admission mock缺userAgents，补mock后全绿；桌面早期失败为夹具完整名称已转chip、文件/Agent同名候选及Element Plus隐藏input选择问题，均保留报告，未为夹具修改产品。main `c7b47f0b…`、preload `690c265b…`、Vue `c03ed204…`、React `be230077…`、CSS `a5d30e8d…`，冻结功能源码481/产物580。

使用：仓库根运行 `npm run desktop:dev`，先使用首版侧栏、对话区、Composer、悬浮摘要和资源面板；智能体入口为设置→智能体或Composer→管理智能体。本轮到此交付，不以Hook/远程MCP扩展继续拖延首版。下次从用户实际界面反馈开始，优先修可见问题与主流程；Hook、远程MCP/OAuth、插件和内置智能体模型覆盖、更多媒体、Windows/安装包独立分批。当前仅Electron/CDP，原生computer-use/ZCode同状态、真实远程模型、完整性能与发布仍未验；高级配置目前是Markdown，不冒称ZCode结构化表单/全部扩展字段已对齐。整体复刻仍active，未提交/推送。以下为历史记录。

## 历史交付：可见首版（2026-10-11 22:26 +08:00）

按用户要求并行完成命令存储、Vue 设置/React Composer 和实机验收，主线完成授权桥与运行时集成。用户/项目自定义 Markdown 命令可创建、编辑、删除；`/` 展示范围、参数和覆盖状态，选择只插引用，发送才展开执行。同名按项目→全局→插件，内置名称不能覆盖；revision 冲突保留编辑稿，删除移至同卷回收目录。动态 Shell 沿用原工具审批/锁/取消，普通后续历史不重复执行；排队后命令改变会停留待撤回，不静默替换来源。列表按会话工作目录查询，设置管理按项目根目录；独立 worktree 编辑不在本次交付范围。

验证：功能冻结后全量 198 文件/3591 项通过，React/Vue 类型与生产构建通过；实际生产 Electron 明暗各12项、合计24项通过，真实授权 IPC/SQLite/Agent 与受控本机 SSE，8图已逐张复核。报告 `/tmp/mira-user-command-delivery-20261011.P5KSGo/final-report.json`。随后仅去掉命令设置中的已知 Electron 错误前缀，既有 Vue3项与重建通过，明暗2项冲突保稿确认通过；24项属于此前产物，未将它们冒称最后文案产物的全量实机结果。源码/产物身份和33个许可文件核对通过；没有新增性能优化或重测，不套用历史性能数据。原构建警告保留。

可见正常首版 PID61015（独立临时数据，无历史 seed/模型/请求拦截），最后文案产物重建后已刷新。截图 `/tmp/mira-custom-command-visible-20261011.NtNYfw/preview-light.png`、`preview-dark.png`。使用自己的模型和数据：仓库根运行 `npm run desktop:dev`；设置→自定义命令，或 Composer `/`→管理自定义命令。现有侧栏、对话/工具状态、悬浮摘要、资源面板和 `@ / + # $` 已有代码链路，不能把源码审计等同整产品逐项验收。

最后文案证据：`/tmp/mira-command-error-copy-20261011.ykboAl/stable-report.json`，明暗2项及两图均通过，中文冲突原因、未保存正文、原文件保留；478源码/578产物身份一致，Vue HTML `dd5fa6b8…`，main/preload/React/CSS与前24项同hash。首次暗色DOM已更新但capturePage尚未paint文字，保留旧报告后只做一次稳定帧补图；不改产品、不扩大验证。根已检查最终浅色图；子agent两图逐张复核。自有隐藏验收进程已退出，正常可见首版保留。

下一入口：用户实际使用首版后，优先解决可见界面与主流程问题；自定义 Agent CRUD、Hook、插件/远程 MCP OAuth、更多媒体及在线 Agent 市场分批继续。首版交付不等待这些扩展，但整体复刻目标仍 active。当前使用 Electron/CDP，未验原生 computer-use/ZCode同状态、实体输入、真实远程模型、Windows/发布包。没有提交/推送；下方均为历史记录。

2026-10-11 21:56 +08:00：并行交付插件 Agent 切片。已安装插件的 `agents/*.md` 进入 `@`、`/`、`+` 候选及插件明细；选择只插引用，实际 `delegate_task` 读取宿主 profile 正文，工具与内置角色上限取交集，子任务面板显示真实名称和来源。启动、获得项目锁后及工具执行前复核插件/正文/目录；停用、改动和不存在的 profile 不静默回退。模型覆盖、未知工具和其他未接行为逐项显示不可用，不称自定义 Agent CRUD 或在线 Agent 市场已完成。

验证：最终全量 196 文件/3555 项、React/Vue 类型、React 与 Electron/Vue 构建通过；7 文件/289 项定向。最终隔离生产 Electron 明暗 14 项通过，真实 IPC/SQLite/Agent/受控本机 SSE/read/bash，含实际写锁等待期间停用/改正文后阻断。证据 `/tmp/mira-plugin-agent-delivery-20261011.s1YZ2b/final-report.json`，main `79b71521…` / React `7c096c5d…` / CSS `a5d30e8d…`，475 源码/576 产物冻结。最初全量3项失败来自旧测试 mock 缺 catalog，补 mock 后重跑全绿，旧报告保留。新正常可见预览 PID71289、完全独立数据且无 seed/请求拦截，浅深首屏图已复核；另复核插件候选/暗色子任务终态/浅色锁阻断3图。部分验收截图是父任务尚运行的过渡帧，不当作父终态。可见窗口若被隐藏，请由 Dock 返回，或仓库根 `npm run desktop:dev`；新预览不是用户原数据。

剩余与下次：首版已可走查，先处理用户界面反馈；扩展待办为用户/项目自定义命令管理、用户自定义 Agent CRUD、Hook、插件 MCP 与 HTTP/SSE/OAuth，以及模型覆盖/Goal/workflow。公开市场当前仍是 Skill 来源，不能称在线 Agent 安装闭环。当前采样没有需要阻挡首版的明显长任务，性能数据见性能文档；四流内存/帧率、原生 ZCode 同态、实体输入、真实远端模型和 Windows/安装包仍未验。computer-use 工具当前不可调用，以上使用 Electron/CDP。整体 active，未提交/推送；下方均为历史记录。

2026-10-11 21:31 +08:00：动态插件命令切片完成。对照 ZCode 当前 bootstrap，inline/fenced Shell 只在任务接纳后按顺序执行，沿用真实工具行、审批、项目锁和取消；30 秒/128 KiB 边界，stdout 进入模型与历史，浏览和选择不执行。普通下一轮及 submission 重放不重复执行；显式重新生成重新读取当前模板并重新审批。参数与输出不产生额外动态块；模板/插件/工作目录在审批后和获得项目锁后复核，失败保存部分输出，已接纳队列不自动重复执行。

验证：最终 196 文件/3525 项、React/Vue 类型与生产构建通过；最终冻结 `/tmp/mira-dynamic-rerun-20261011.rMroRg/snapshot` 的明暗生产 Electron 22 项通过，474 源码/576 产物前后一致。真实 IPC/SQLite/bash/Agent 与本机受控 SSE；报告 `/tmp/mira-dynamic-plugin-delivery-20261011.QNEZ8v/accepted-stable-report.json`。截图早截出现“正在思考”，复核终态连续约 2.2 秒为“最近任务已完成”，未因此伪改产品。重点查看最终明亮审批与暗色稳定终态两图，其余截图不冒称逐张视觉验收。原构建警告保留，旧失败/候选报告不合并成最终通过数；首版可见预览保留原21:03产物。

剩余与下一入口：继续对照 ZCode 插件 Agent/Hook/MCP 和自定义 Agent 的真实启用链路，同时进入首开/长会话/多任务性能定位；model/allowed-tools 元数据覆盖、远程 OAuth、Goal/workflow、完整原生对照、真实远端模型和 Windows/安装包仍未完成。当前没有可调用 computer-use，CDP 不等同电脑操作验收；整体目标保持 active。工作期间 HEAD 外部推进到 `7f14978`，本 agent 没有提交/推送，现增量保留在工作树。以下为历史记录。

2026-10-11 21:03 +08:00：首版走查交付。并行完成侧栏与 Composer 的 ZCode 当前源码对照：顶部入口 32px/14px/16px，候选列表几何和查询提示收敛，每窗格独立候选 ID；保留当前全宽 `+` 面板。聚焦 Esc 可在审批隐藏输入时停止所属 run，关闭弹窗不误停，迟到停止失败不污染新任务。真实工具元数据先于 message part 发布，React 直接合并脱敏公开记录，消除审批先出现而工具行短暂“不可用”及过程状态滞后。

验证：最终源码全量 195 文件/3500 项、React/Vue 类型、React 与 Electron/Vue 生产构建通过；当前冻结产物明暗审批/真实文件结果/延迟快照 20 项、聚焦停止 8 项、`+`/`@` 候选与主侧引用 6 项通过。可见正常窗口另验证 3 项，独立 home/userData/sessionData/logs，无 seed/模型/请求拦截；当前首版窗口保持打开，浅深首屏截图已查看。证据 `/tmp/mira-live-tools-20261011.XxqRTC/`，全量报告 `/tmp/mira-first-visible-delivery-all-tests-20261011.json`。候选夹具早期未等待真实附件桥/候选加载导致失败，原报告保留；生产源码未因此改动。许可资源 33 文件、291 JS/240 动态目标及 CSS 审计通过，原 highlight 和 Vue 构建警告保留。

开始走查：仓库根 `/Volumes/VrenDisk/project/Mira/Mira-Harness` 运行 `npm run desktop:dev`（会预构建正式 React），默认进入 `/workspace/harness-react`；`harness:dev` 的旧试验服务不等于正式页面 React 热更新。下次先处理用户首屏走查反馈，并继续完整 ZCode 原生对照及真实模型流程。当前可见 computer-use 工具缺失，以上使用 Electron/CDP，不冒称原生 ZCode/实体输入。动态插件 Shell/Agent/Hook/MCP、自定义 Agent、远程 OAuth、Goal/workflow、最终性能及安装包/Windows 仍未完成，不将首版交付等同整体目标完成。核实上游 drag 明确拒绝已放置窗格重排，撤销旧条目的重排待办。整体 active，未提交/推送；下方为历史范围。


2026-10-11 20:31 +08:00：多窗格删除/归档与草稿恢复切片完成。侧栏操作可见侧任务前保存全部已注册输入，失败保留任务/窗格并在所属行提示重试，不向主输入复制通用错误；隐藏无关任务不被草稿门禁阻塞。参照ZCode，组合主任务删除后解散布局回空白任务，不隐式提升侧任务，也不新增主窗格关闭按钮；迟到删除不取消新的任务加载。实际Electron发现侧任务草稿已保存但主Composer缓存过期，现切换owner时增量读取并保留未保存本地修改、附件/富文本及恢复信息；晚读取不覆盖新输入/导航。

验证：既有6文件633项定向、React类型/生产构建、diff和291JS/240动态目标/33许可审计通过；最终明暗隔离生产Electron14项通过，473源码/576产物身份一致。6张capturePage中最终复核明亮归档失败、暗色删除失败2张；前一产物复核4张发现泛化错误，修正后重新验收。真实IPC/SQLite/Lexical、菜单与F5，无模型调用；最终证据 `/tmp/mira-task-lifecycle-delivery-20261011.mhkAme/`，测试 `/tmp/mira-task-lifecycle-delivery-accepted-tests-20261011.json`。早期候选因夹具未hover、侧任务重新打开草稿缓存及提示问题失败/不足，均保留，不混称最终完成。构建原2条highlight警告保留，Electron/Vue沿用既有产物。

下一入口：核对已放置任务窗格的拖动重排、聚焦后快捷键/审批/停止归属与真实摘要组合。归档沿用保稿占位，不把归档当删除。动态插件/自定义Agent/远程MCP OAuth/Goal workflow、原生ZCode同态/实体输入/真实远端模型/Windows发布和总体性能仍未完成；整体active，未提交/推送，自有Electron已退出。以下为历史记录。

2026-10-11 20:07 +08:00：匿名任务分屏的侧栏选择增量完成。对照ZCode `workbenchSessionPlacement.ts`，匿名主任务旁聚焦某个侧任务时，普通侧栏选择另一条未入组合的任务只替换该叶子，保留主Lexical节点/输入、方向/比例/邻近叶子及资源；旧任务进入既有最近关闭记录，先保存各任务草稿。已有组合恢复及明确消息/文件/执行详情导航沿用原路径，不新增ZCode没有的侧栏“分屏组合列表”。保存失败保留原任务和输入，明确提示“切换任务前未能保存工作台，当前输入已保留；请重试。”；成功后只清除此错误。迟到保存完成遇到更晚焦点/布局/owner/请求变化时不替换。修复截图发现的重试成功仍留旧自动保存提示：任何成功保存当前快照都会清除此提示，保留其他错误。

最终验证：既有7测试文件624项、React类型/生产构建、diff及291 JS/240动态目标/33许可资源审计通过。最终明暗隐藏隔离生产Electron10项通过，真实IPC/SQLite/React/Lexical、HTML5拖入与CDP输入；历史消息seed，没有发起模型调用。6张capturePage截图中最终复核明亮成功重试和暗色保存失败2张；前一候选4张截图复核暴露旧自动保存提示，已先红后绿修复，不能作最终验收。证据 `/tmp/mira-draft-pane-replace-delivery-20261011.uYOCxq/`，`identity-after.json` 核对473源码/576产物一致，React `98061a51…`、CSS `ed7505e5…`；测试报告 `/tmp/mira-draft-pane-replacement-delivery-tests-20261011.json`。构建仍有原2条highlight优化器警告。上条分屏/摘要34项属于其自身候选，不合并成当前产物的44项。

下一入口：核对ZCode任务组合的primary关闭/剩余任务归属及多窗格删除/归档，继续完善组合语义；侧栏组织分组与分屏组合分别处理。动态插件/自定义Agent/远程MCP OAuth/Goal workflow、摘要真实Git/子任务/审批组合、原生ZCode同态/实体输入/真实远端模型/Windows发布/四流帧率内存与总体性能仍未完成。整体active，未提交/推送；测试数据与临时脚本都在/tmp，未新增测试规划文档。


2026-10-11 19:51 +08:00：多任务分屏与各任务独立摘要切片完成。已有侧面任务使用自己的 Controller 渲染悬浮摘要、轮次导航、分支入口、文件变更与运行详情；详情在所属窗格打开，返回保留输入节点和草稿。待确认计划定位所属确认，已完成计划仅查看所属运行详情，不重新批准或继续任务。最多4任务的四边拖入、比例、关闭保稿、匿名首发布局迁移和超额旧标签恢复保持。

验证：最终候选 `/tmp/mira-side-summary-final-20261011.sN49jY/`，`delivery-identity.json` 汇总明暗隔离生产 Electron 34项（分屏16、匿名首发6、侧摘要12），473源码/576产物与当前代码一致；React生产构建、类型、许可资源审计与diff通过。本切片React全量91文件1934项在最后已完成计划fallback之前通过；最后改动后5文件172项定向通过，不混称最后全量。20张capturePage截图中重点复核明暗摘要、窄窗格、所属diff及四任务布局4张。运行采用真实IPC/SQLite/Lexical及本机受控SSE；侧摘要历史run/变更/完成计划明确使用seed。没有可调用computer-use，未验原生ZCode同态、实体输入、真实远端模型、Windows/release、四流帧率/内存与总体性能。

下一入口：对照ZCode核对侧栏任务组合显示与菜单，当前恢复owner组合不等于独立完整task group；任意组primary关闭、已放置窗格拖动、多pane删除/归档及取消竞态、摘要真实Git/子任务/审批组合仍待核对。动态插件、自定义Agent、远程MCP/OAuth和Goal/workflow仍未完成。整体active，未提交/推送，以下日期条目为历史范围。


## 当前完成、剩余与下一入口（2026-10-11 19:34 +08:00）

2026-10-11 19:34 +08:00：多任务分屏增量完成。对照ZCode实际启用入口，最多4任务、四边32%拖入预览、25%–75%比例和稳定叶子DOM；资源面板独立。拖动只更新DOM几何，松开提交一次；关闭保稿且不停止运行，侧栏选成员恢复原owner组合。匿名首发迁移布局并保留主/侧原输入节点；旧超额标签转入最近关闭入口，不删除会话。窄窗格的Header/Composer/关闭重试入口可达。最终5文件353项定向、React类型/生产构建/许可与diff通过，最终明暗隔离生产Electron16项分屏＋6项匿名首发通过，本机受控SSE、F5、四任务独立运行均验证。最终证据 `/tmp/mira-task-grid-final-20261011.aeFmTl/`，472源码/576产物一致；12张capturePage中重点查看明暗失败关闭及首发迁移4张。整体active，未提交/推送。下一入口：补分屏任务自己的悬浮摘要、轮次导航和详情归属；完整任务组语义、动态插件/Agent、远程MCP/OAuth、原生ZCode/实体输入、远端模型、Windows发布及总体性能尚未完成。旧条目为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 18:46 +08:00）

完成：已有任务窗格不再重复渲染标题横条，保留资源标签标题与sr-only可访问标题；参照ZCode `v4/ConversationHeader.tsx`实际left/top样式，左上8px浮动关闭及跨工作区basename徽标。同工作区省略归属徽标，长目录截断并保留完整路径提示；文件/执行详情仍可返回，旁路子对话不改。关闭复用主/侧草稿flush和owner/viewRevision门禁，只移除窗格、不调用run.abort；保存失败保留窗格/草稿、禁用重复提交，并在所属窗格显示“重试关闭”。嵌套flush传递局部反馈模式，自动保存单独失败使用保稿提示；关闭已有明确提示时抑制重复自动保存提示，其他Composer错误保持，后续保存成功清除自动保存提示。移除原焦点DOM后回到邻近资源/标签列表，延迟关闭不抢较新的Lexical焦点。

验证：既有4测试文件456项、React类型/生产构建、diff与许可资源审计通过。实际明暗1440×880隔离生产Electron40项通过，每主题4次真实Agent/本机受控SSE；覆盖双任务/草稿/F5、原窗格消息搜索及所属目录文件搜索、隐藏完成未读/显示清除、关闭运行任务不停止/最近关闭恢复、保存失败保稿及重试、关闭pending、延迟成功不抢焦点、同目录徽标省略、归档保稿/删除清理。18张原生capturePage截图已生成，本次重点查看明暗双草稿、同目录与失败关闭6张，未把未逐张查看的12张记作视觉验收。新增自动保存回归检查反馈去重、保稿、其他错误保留与继续编辑成功清除；首次测试误把含图标的alert children视作纯文字，已改查实际文本span。

证据：最终`/tmp/mira-pane-chrome-closed-20261011.507aGp/`包含report、18图、bundle-audit-final、frozen-contract和identity-after；470源码/576产物一致，React `976ea801…`、CSS `2bbb826e…`。最终测试报告`/tmp/mira-pane-chrome-closed-tests-accepted-20261011.json`。之前recheck/accepted快照功能通过但截图暴露主任务错误错位；final/delivery批分别保留嵌套flush与自动保存重复反馈失败，不作为当前验收。Electron/Vue沿用15:26产物，本批未改其源码或重跑严格类型基线/全量测试。没有可调用computer-use，用Playwright/CDP控制隐藏隔离Electron，本机协议不能替代原生ZCode/实体输入/远端模型/Windows发布/总体性能；自有实例已退出，未提交/推送，没有新增仓库规划或测试文档。

剩余/下次开始：先核对ZCode真实启用的分屏/任务组放置入口和Mira资源标签容器差异，不恢复上游注释掉的split-right/down按钮。任意多窗格/组归属/拖拽放置仍未实现；继续核对首屏Header/timeline/Composer，动态插件/自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能仍待完成。整体active。以下18:12及更早条目均为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 18:12 +08:00）

完成：侧栏选中态跟随当前主/侧任务焦点，回到主任务仍保留侧面任务。全局搜索的文件范围跟随所操作任务；命中已打开侧面任务的消息、文件与执行详情交给原窗格Controller，不替换主任务、不重复创建任务。消息搜索恢复本窗格历史视图后定位虚拟轮次，文件按自己的项目目录预览。连续请求只允许最新一次放置，关闭/切页后的迟到请求失效；定位成功消费请求，避免关闭重开后复播旧搜索。任务可见性与runtime主任务身份独立，已显示主/侧任务完成不提示未读；隐藏窗格或其他页面完成保留未读，再显示清除。后台挂载绑定Controller不会清除未读。列表读取期间的已读修改不会被旧列表复活；实际Electron发现Vue Shell旧事件监听重新持久化未读，已在列表刷新时协调真实可见任务。

验证：既有5文件361项定向、React类型、生产构建、diff及资源许可审计通过；新增Controller/Workbench/侧栏回归覆盖可见与隐藏任务、旧列表与Shell持久化冲突、侧搜索保持主身份/范围、最新请求、关闭目标、请求消费。最终明暗1440×880实际隔离生产Electron28项/10图全部查看，每主题4次真实Agent/本机受控SSE请求；覆盖双Lexical草稿/F5、侧栏焦点、搜索真实历史消息的虚拟定位、所属项目文件搜索/预览、关闭工作区期间真实运行完成的未读及重开清除，继续验证实际read/停止、关闭复开、归档保稿、删除清理。执行详情路由与迟到竞态由定向检查覆盖，本批未重复实际双权限审批。

证据：最终`/tmp/mira-pane-navigation-accepted-20261011.gMK2hj/`含report、10图、frozen-contract、identity-after与bundle-audit-final；470源码/576产物一致，React `431f8a96…`、CSS `7c1833ab…`。定向报告`/tmp/mira-pane-navigation-verified-20261011.json`。`/tmp/mira-pane-navigation-20261011.1eRuXy/`保留真实侧栏未读失败；`/tmp/mira-pane-navigation-final-20261011.qhxgLJ/`保留未等待主焦点提交的夹具失败及真实旧搜索重开复播问题；`/tmp/mira-pane-navigation-verified-20261011.5pQARK/`功能28项通过，但随后补了可选值类型门禁，最终证据使用新产物和新快照。Electron/Vue沿用15:26产物；没有改其源码、重跑严格Electron/Vue类型基线或全量测试。无可调用computer-use，本批用Playwright/CDP与隐藏隔离Electron，不替代原生ZCode/实体输入/远端模型/Windows发布/总体性能；自有实例已退出，未提交/推送，无新仓库测试文档。

剩余/下次开始：最新ZCode `v4/ConversationHeader.tsx` 并不重复渲染侧面标题横条，而使用浮动关闭与跨工作区归属徽标；下一步以此核对Mira侧面任务chrome，减少重复标题，确保关闭仅移除窗格、不停止任务。完整任意多分屏/组归属/拖拽放置仍未实现。动态插件、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能仍未完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 17:52 +08:00）

完成：参照ZCode任务菜单、splitPaneEntryContext及workbenchSessionPlacement，侧栏右键/更多与Header增加“在侧面打开任务”。主任务不被替换，已有侧面目标定位原面板，当前焦点任务禁用重复分屏；侧面焦点可返回主任务，匿名主草稿也可并排打开。使用绑定既有session的独立Controller，不复制历史、不创建子会话或替代任务。两份Composer按owner增量合并并串行保存；本机保存失败保留原delta可重试，合并后仍检查262144字符上限。侧面发送/停止/审批沿用自己的任务、run/request及模型身份，文件链接在本面板按自己的项目目录预览，可加入本输入框。归档隐藏输入并保稿；删除向绑定Controller同步通知，清理全部引用标签/最近关闭记录及草稿，防止卸载回写复活旧owner。任务标题随列表更新；程序定位面板的焦点改用现有主题token，消除浏览器默认整面板橙框。无新依赖，Apache声明及Mira命名保持。

验证：既有8文件558项定向、React类型/生产构建、diff及资源许可审计通过。最终明暗实际隔离生产Electron20项、8图逐张复核；每主题3次真实Agent/本机受控SSE请求。实际覆盖原任务身份、主任务不变、双Lexical草稿/SQLite保存及F5恢复、重复定位、跨项目真实read结果、所属预览/附件、侧面真实停止、关闭重开、归档保稿与删除清理；匿名草稿和迟到打开取消由定向Workbench检查覆盖，审批身份由Controller回归覆盖，本批未重复做双任务实际权限审批。

证据：最终`/tmp/mira-task-pane-verified-20261011.Go3127/`含report、8图、frozen-contract、identity-after与bundle-audit-final；470源码/576产物一致，React `66d5e167…`、CSS `7c1833ab…`。定向报告`/tmp/mira-task-pane-targeted-final-20261011.json`。首轮`/tmp/mira-task-pane-final-20261011.qOBxTN/`功能18项通过，但截图有默认橙框，未当作最终视觉完成；更早`/tmp/mira-task-pane-20261011.Ex2Dd5/`保留缺失依赖软链、错误测试API/工具/abort方法等夹具失败。最终色值检查曾错误硬编码黑白，已改为实测与现有focus token比较，原失败report保留。Electron/Vue沿用15:26产物，未改其源码或重跑严格类型基线/全量；无computer-use可调用，未声称原生ZCode/实体输入/远端模型/Windows发布或总体性能通过。自有Electron实例已关闭，未提交/推送。

剩余/下次开始：当前功能仍落在Mira已有右侧标签容器，不等同ZCode完整任意多分屏/组归属/拖拽放置。下一步优先对齐当前焦点任务的侧栏选中与已读状态，以及全局搜索命中已有侧面任务时的消息定位（当前带message/file/execution参数仍走主任务导航），再补任务面板Header动作与分屏放置。动态插件、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能仍未完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 17:09 +08:00）

完成：对照ZCode TaskListItem，项目/时间线任务行增加16px前置置顶按钮，hover/focus可见、置顶常显，有完整任务名称及aria-pressed；原拖拽柄保留，未置顶分组行不追加此按钮。复用既有第一方session.set-pinned/SQLite，不导航、不改当前对话。真实Electron发现Controller捕获错误后返回void，行内runner无法显示失败；仅该方法改为向行返回失败，组件同步防重复提交并可重试。失败文字随所属行展开，不再覆盖下一条任务；无需新配置或依赖。

验证：组件新回归原13绿/1红，Controller原174绿/1红，修复后既有6文件302项、React类型/生产构建、diff及资源许可审计通过。明暗实际隔离生产Electron10项/4图逐张检查：按钮显示/名称、接纳前失败与就地重试、真实桥及SQLite写入、置顶后常显/拖拽保留、不导航、F5持久恢复、分组取消后回原列表；错误几何在行内、下一行位于下方。无模型调用。

证据：最终`/tmp/mira-sidebar-pin-layout-20261011.f3EKn6/`含report、4图、frozen-contract、identity-after与bundle-audit-final；470源码/576产物一致，React `d47d3f98…`、CSS `365b9630…`，宿主沿用15:26。旧`/tmp/mira-sidebar-pin-20261011.P8zUbV/`保留吞错真实失败；`/tmp/mira-sidebar-pin-final-20261011.A6dTP2/`功能通过但截图仍有错误覆盖，不作为最终视觉通过。临时夹具曾期待未脱敏错误及未等待取消后的列表刷新，失败报告保留。定向结果`/tmp/mira-sidebar-pin-controller-final-20261011.json`；本批未重跑全量或Electron/Vue类型构建，无computer-use可调用，原生ZCode/实体输入/远端模型/Windows发布或总体性能未验，自有实例已关闭，未提交/推送。

剩余/下次开始：对照任务菜单及Header补“在侧面打开已有任务”的完整能力，必须使用独立Controller、草稿、审批及停止身份，不能以复制主对话或既有子会话入口冒充；继续Header/timeline/Composer剩余可见交互。动态插件、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能未完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 16:57 +08:00）

完成：改编ZCode TaskTitleOverflowText，长标题按原始文字实测溢出；整行悬停或键盘聚焦1秒后开始滚动，24px间距、40px/s、最短6秒移动和2秒停顿，并同步两侧mask。移除遮挡动画的原生title，完整名称保留在按钮aria-label，重复文本aria-hidden；离开、菜单、忙碌/拖拽、页面隐藏和减少动态效果取消定时及动画。任务/项目右键菜单独立维护打开状态，共享提示暂停和菜单锚点，不再只跟踪更多菜单。

验证：新增两项真实DOM回归先红后绿（原10绿/2红），最终既有5文件125项、React类型/生产构建、diff及资源许可审计通过。实际隔离生产Electron明暗12项、4图全部查看：实测溢出/短名静止、延迟/速度/停顿、键盘、不导航、右键稳定与提示互斥、减少动态效果开关、项目路径提示恢复。隐藏实例使用CDP焦点模拟使页面可见以验证WAAPI，不等同锁屏实体鼠标或原生ZCode对照；无模型调用。

证据：`/tmp/mira-sidebar-title-20261011.Nk455M/`含report、4图、frozen-contract、identity-after及bundle-audit-final；回归JSON为`/tmp/mira-sidebar-title-before-20261011.json`与`/tmp/mira-sidebar-title-final-20261011.json`。470源码/576产物一致，React `a782458c…`、CSS `d9b3ea3c…`，宿主沿用15:26；291JS/240动态目标/33许可/freshCSS/无旧JS。未重跑全量或Electron/Vue类型构建；无computer-use可调用，原生ZCode/实体输入/远端模型/Windows发布及总体性能未验。自有实例退出，未提交/推送。

剩余/下次开始：补齐任务行直接置顶入口，再继续Header/timeline/Composer可见状态；动态插件、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能未完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 16:31 +08:00）

完成：侧栏“分组/项目”复用已有Radix Tabs，对齐ZCode WorkspaceSidebar的两个一级页签；方向键循环、Home/End、自动激活、单一Tab停靠点与tab/tabpanel关联接通。保留28px胶囊、原焦点样式及时间线二级偏好；切换不打开任务或清稿，点击归档中的已选页签仍返回原列表。没有新增第三个一级标签，也没有重写拖拽/持久化协议。

验证：新增真实React键盘回归先红后绿（旧12绿/1红），最终既有4文件139项、React类型/生产构建、diff及资源许可审计通过；明暗隔离生产Electron8项、4图逐张检查，包含循环切换、准确焦点、Tab退出、归档返回、F5恢复时间线/分组与同一任务草稿。截图未见侧栏高度或焦点裁剪变化，布局扫描无发现；没有调用模型。

证据：`/tmp/mira-sidebar-tabs-20261011.R9iTJt/`含report、4图、frozen-contract、identity-after及bundle-audit-final；回归JSON在`/tmp/mira-sidebar-tabs-before-20261011.json`和`/tmp/mira-sidebar-tabs-final-20261011.json`。469源码/576产物一致，React `504c8c61…`、CSS `775a5ce1…`，宿主仍沿用15:26。首次runtime失败是临时XPath定位器错误，原报告保留。未重跑全量/Electron/Vue类型构建；无computer-use可调用，不能替代原生ZCode/实体输入/远端模型/Windows发布或总体性能。自有实例退出，未提交/推送。

剩余/下次开始：继续核对侧栏项目/任务菜单的可见入口与悬浮提示，以及Header/timeline/Composer未对齐状态；不返回文件支线，不重做已验页签/确认布局。动态插件、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能仍未完成。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 16:20 +08:00）

完成：参考ZCode ElicitationDialog，长问题/方案改为固定标题与操作区、独立可聚焦正文滚动区；修改要求放在正文内，错误及按钮留在底部，避免展开修改后正文只剩一行。切题重置当前正文并显露焦点，选项箭头只移焦点；查看确认仅重置所属dock正文，不改变主/旁历史阅读位置。

验证：既有5文件172项、React类型/生产构建及资源许可审计通过；明暗1440×640实际隔离Electron14项/6图逐张检查，覆盖20行背景/12选项、40步方案、修改失败保稿/重试、F5双等待计划及独立草稿、显式主批准/旁取消。初始问题/旁计划为种子，主计划/修订由真实Agent与本机受控SSE产生；首次提交失败在接纳前拦截。共用布局补验真实权限链16项/4图全部检查，主允许写入/旁拒绝命令/旁新请求允许保持。

证据：`/tmp/mira-confirmation-body-final-20261011.aKfnFJ/`与`/tmp/mira-confirmation-permission-20261011.s94stI/`，469源码/576产物身份一致，React `2e2029c2…`、CSS `131e4acb…`。保留早期正文14px真实失败及未模拟用户暂停跟随的夹具失败；权限补验首次缺依赖软链属夹具错误。未重跑全量/Electron/Vue类型与构建，宿主沿用15:26；无可调用computer-use，不代替原生ZCode/实体输入/远端模型/Windows发布或整体性能验收。自有实例已关闭，未提交/推送。

剩余/下一入口：回到侧栏、Header/timeline与Composer首屏差异，按上游实际可见功能核对。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能仍待完成。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 16:05 +08:00）

完成：权限传输失败返回所属审批卡，不再吞错或同时写入通用错误。Controller捕获任务generation，校验显式requestId/当前会话/加载及disposed状态；迟到成功不清除新任务审批，迟到失败不覆盖新任务错误。主/旁路卡片catch仅更新仍匹配请求的局部错误，保留显式重试及同步防重复回复。

验证：原错误吞掉及迟到失败污染新任务两项回归先红后绿（原171绿/2红），最终既有6文件311项定向、React类型/生产构建及diff/资源许可审计通过。实际明暗隔离生产Electron16项、4张新状态图全部查看，每主题8次实际Agent/本机SSE；首次权限传输失败在runtime接纳前受控，仅旁路卡出现一次错误、真实等待run保留，拒绝取消实际命令、主允许及旁新请求允许写入临时目录；F5双审批及小桌面长命令/按钮几何保持。跨任务迟到失败由定向Controller测试覆盖，未冒称已在原生Electron切换竞态穷尽验证。

证据：`/tmp/mira-permission-local-20261011.uydVh7/`含report、4图、frozen-contract、identity-after及bundle-audit-final；定向结果`/tmp/mira-permission-local-final-20261011.json`，旧红结果`/tmp/mira-permission-local-before-20261011.json`。469源码/576产物一致，291JS/240动态目标/33许可/freshCSS/无旧JS；React `01634ac4…`、CSS `00afafe8…`，main/preload/Vue同15:26。本批未重跑全量或Electron/Vue构建/严格类型，61条基线诊断以上次为边界；无computer-use可调用，不替代原生ZCode、实体输入、远端模型、Windows/release或总体性能。自有Electron退出，未提交/推送。

剩余/下一入口：完善长计划及多题澄清的固定标题/动作和正文滚动，继续三块首屏功能；动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及整体原生/发布/性能未完成，目标active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 15:59 +08:00）

完成：对照ZCode `V4InteractionDialogs.tsx` / `PermissionDialog.tsx`，主/旁路权限审批迁入所属Composer底部dock，优先于澄清/计划，历史只保留真实工具状态，不重复审批卡。输入保持挂载但hidden/inert；只提供现有runtime支持的拒绝/允许，不虚构项目永久授权。旁路补同步防重复回复、错误按requestId隔离；方向键/Home/End仅移动审批按钮焦点，不批准，保留原生Enter/空格和composition。查看确认只定位所属dock，不暂停跟随或滚动历史。

验证：既有6文件160项定向、React类型/生产构建、diff及资源许可审计通过，布局机械扫描无发现。最初定向夹具缺closest方法已补，不当作产品回归。实际1440×640有队列及80行命令时按钮越界，已改为队列有界滚动、命令正文收缩滚动、标题和操作留在卡内；初次真实失败留档。最终隔离生产Electron明暗共14项/8图全部复核，每主题8次实际Agent/本机受控SSE，主写入允许/旁命令拒绝/旁新请求允许均验证真实结果；F5恢复双审批准确身份，队列定位不滚动两段历史，首次失败在runtime接纳前明确拦截。零页面错误，自有实例退出。

证据：最终`/tmp/mira-permission-dock-final-20261011.7ixIWh/`含report、8图、vitest-targeted、frozen-contract、identity-after、bundle-audit-final；469源码/576产物一致，291JS/240动态目标/33许可/freshCSS/无旧JS；React `5df9464a…`、CSS `00afafe8…`，Electron/Vue沿用15:26。本批未重跑全量或Electron/Vue类型/构建，严格Electron仍以上次61条同基线诊断为边界。旧夹具打包失败及实际越界失败在`/tmp/mira-permission-dock-20261011.Gf7AcX/`，不覆盖为通过。临时资料仅/tmp，未新增仓库测试文件，Apache原文保留，未提交/推送。无可调用computer-use，不冒称原生ZCode/实体IME剪贴板、远端模型、Windows/release或总体性能通过。

剩余/下一入口：审批错误仍同时进入通用错误及局部卡，下一步收敛局部反馈并验证切换任务后迟到失败隔离；长计划/问题标题和动作持续可见性仍待完善。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及整体原生/发布/性能仍待完成，目标active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 15:47 +08:00）

完成：对照ZCode `v4/SessionPane.tsx` 与 `ConversationComposer.tsx`，主/旁路澄清及计划确认移入固定底部dock，离开历史滚动区；与输入区使用同一主列宽度和60%高度上限，长内容内部可滚动。Composer和Lexical保持挂载，只有surface隐藏且inert/禁用；队列和错误继续显示。阻断隐藏输入的发送、配置、上下文、快捷键、全局compose-draft注入及编辑回调，审批结束恢复同一DOM与原稿，不偷其他活动控件的焦点。确认导航只在所属conversation root寻找dock；权限卡仍按工具内/回退历史展示，本轮未假称它已完成dock迁移。未移植上游CLI/账号/配额或share协议，Apache原文保留。

验证：既有6文件340项定向、React类型/生产构建及diff/资源许可审计通过；新增隐藏编辑回调回归在首次实现失败（147绿/1红），补边界后通过，旧结果保留。新增dock root定位验证忽略另一面板。没有重跑全量或Electron/Vue构建/严格类型；宿主沿用15:26及61条相同基线诊断，不称全类型通过。

实际页面：明暗正常1440×880共20项、8图，小桌面1440×640专项22项、4图，12图全部逐张复核。每阶段每主题4次实际Agent/本机受控SSE；初始历史/问题为种子，首次传输失败明确在接纳前受控。主旁dock均在阅读viewport之外，滚动历史不移动它；隐藏输入保稿/键盘与注入不夺焦点，问题→计划及批准后保持同一实际输入DOM；F5恢复待批准计划和独立草稿，旁路仍隐藏而已完成主输入恢复。小桌面实际生成40步旁路计划可内部滚动，键盘聚焦取消/批准所在操作区不越面板，历史保留至少95px；不是全部窗口/工具/原生输入/性能验收。零页面错误，自有实例退出。

证据：`/tmp/mira-interaction-dock-20261011.7kyiV6/`的vitest-targeted（真实编辑回调红）、vitest-targeted-final、report、bounds-report、12图、frozen-contract、identity-after与bundle-audit-final。469源码/576产物前后一致；291JS/240动态目标/33许可/freshCSS/无过时JS。React `68c086f0…`、CSS `6f7c3bd6…`，main/preload/Vue同15:26。临时脚本与图仅/tmp，只扩展既有仓库测试，未提交/推送。无可调用computer-use，未冒称原生ZCode/实体IME剪贴板、远端模型、Windows/release或总体性能通过。

剩余/下一入口：继续对照ZCode `V4InteractionDialogs.tsx` / `PermissionDialog.tsx` 对齐权限固定dock，保持真实工具身份、多个待批准项、拒绝/允许/失败重试和主旁隔离；完善长确认区标题/动作可见性。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/总体性能仍待完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 15:34 +08:00）

完成：旁路澄清后的实际助手回复不再覆盖计划确认卡。实时尾部复用已有历史轮次，完成时TanStack缓存仍可能保留旧高度；调整取值优先最新实时测量，并在完成内容已提交后的layout effect只实测这一轮、写入虚拟器。不会扫描或同步测量全部历史；隐藏视口跳过。保留key、虚拟化、阅读恢复、主旁草稿及审批语义，不用遮罩掩盖重叠。

验证：扩展既有Timeline测试，两项回归先红后绿；最终5文件87项定向、React类型/生产构建及diff/资源许可审计通过。未重跑全量、Electron/Vue构建或严格类型（宿主产物沿用15:26及61条同基线诊断）。明暗隔离生产Electron18项、4张最终图逐张复核，每主题4次真实Agent/本机受控SSE；组合回答→实际计划→修改→显式批准、独立旁路空补充提交保持通过。末行到方案卡稳定间距两主题均20.5px，零页面错误，自有实例关闭。本轮限定这个完成状态，不冒称全部长历史/窗口/原生输入/发布/总体性能通过。

证据：最终`/tmp/mira-side-transition-20261011.k0gIsZ/`含report、4图、冻结身份、验后身份和资源审计；469源码/576产物前后一致，291JS/240动态目标/33许可/freshCSS/无过时JS，React `751e4997…`、CSS `36b128c6…`，其余同15:26。测试最终`/tmp/mira-side-timeline-20261011.6GuUDB/vitest-transition-final.json`。旧Electron真实失败分别留在`/tmp/mira-side-timeline-20261011.6GuUDB/`（等600ms仍重叠）及`/tmp/mira-side-timeline-final-20261011.TBzY6n/`（仅改缓存优先级仍失败），不覆盖为成功；两项红回归留同目录vitest-before及vitest-transition-before。临时资料仅/tmp，Apache许可原文保持，未提交/推送。

剩余/下一入口：继续核对ZCode侧栏/对话/Composer首屏可见交互，检查运行中输入与确认浮层的焦点/键盘竞争。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生ZCode/实体输入/远端模型/Windows/release/总体性能仍未完成，无可调用computer-use，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 15:26 +08:00）

完成：host澄清答案投影同时保留选择与补充（“选项；补充：正文”），多行保留，空白补充不吞选项；结构化答案原样保存。第一方桥允许编辑后清空的custom空字符串/空白，仍拒绝非字符串、超过20000字符及NUL。

验证：既有5文件447项定向、Vue类型和Electron/Vue生产构建通过，React本批未修改，产物审计新鲜一致。Electron严格类型当前/基线均失败，相同61条诊断；未重跑全量。实际明暗隔离生产Electron16项，每主题4次真实Agent/本机受控SSE；主组合答案、多行及旁路清空补充后提交穿过真实桥/IPC到模型请求，Composer草稿独立、F5保持等待计划和草稿。初始问题为种子，首次传输失败在接纳前明确受控；不声称未提交回答跨F5保存。14张最终截图逐张查看，发现旁路末尾助手内容与计划卡重叠，视觉验收仍待修复，不能写成全部UI通过。

证据：`/tmp/mira-answer-complete-20261011.c0GWxr/`的`vitest-targeted-final.json`、`report.json`、14张最终图、`frozen-contract.json`、`identity-after.json`、`bundle-audit-final.json`与`electron-type-audit.json`。469源码/576产物前后一致，291JS/240动态目标/33许可/freshCSS/无过时JS。main `4951c0f8…`、VueHTML `e6c4a23d…`、React `21de8808…`、CSS `36b128c6…`。修复前实际失败：选项投影丢失两项、桥拒绝空白两项，见/tmp中answer-projection-before-valid-fixture及answer-bridge-before报告。首版Agent未present_plan，以及Electron evaluate参数顺序两处仅为夹具错误，旧报告保留，未冒称产品失败。无可调用computer-use，不代替原生ZCode/实体IME剪贴板、远端模型、Windows/release或总体性能；自有实例关闭，未提交/推送。

剩余/下一入口：先验证旁路timeline虚拟行与方案卡的稳定几何关系，处理已看到的重叠；再继续三块首屏。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/总体性能仍待完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 15:12 +08:00）

完成：计划确认不再吞掉失败或让上一任务迟到失败污染新任务。Controller验证waiting、模型及预期请求身份，捕获原generation再刷新；卡片就地反馈并允许显式重试。同步提交门禁防快速双击，修改/取消/输入在请求中禁用；缺少cancel处理器不显示假可用，缺失或ID不匹配的计划不可确认。要求修改将焦点交给文本框，收起再开及提交失败保留正文；没有添加裸Enter批准计划的快捷操作。

验证：既有5文件410项定向、React类型及最终生产构建、diff与资源许可审计通过；旧确认吞错与跨任务错误污染两项回归先红后绿，证据`/tmp/mira-plan-controller-before-20261011.json`。本批未重跑全量或Electron/Vue构建/严格类型。明暗隔离生产Electron各7项共14项、12张最终图逐张检查，每主题3次实际Agent/本机受控SSE：澄清重试保存回答并产生present_plan，修改失败保稿后重试得到实际修订计划，F5仍待批准，批准传输失败只在本卡提示，再显式重试执行一次。失败均明确拦截在runtime接纳之前；初始问题/历史为种子，不称远端模型或全失败矩阵。零页面错误，自有实例关闭。澄清答案/修改稿在组件挂载内保留，不声称其跨F5保存。

证据：`/tmp/mira-plan-review-20261011.Gg8vYY/`的`vitest-targeted-final.json`、`report.json`、12张最终图、`frozen-contract.json`、`identity-after.json`及`bundle-audit-final.json`；469源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS。React `21de8808…`、CSS `36b128c6…`，main/preload/Vue同12:53。没有可调用computer-use；原生ZCode同态、实体IME/剪贴板、远端模型、Windows/release与总体性能未验。临时文件只在/tmp，扩展既有测试，Apache原文保持，未提交/推送。

剩余/下一入口：检查澄清回答同时选择选项与填写补充时的模型投影，当前host文本以custom优先，需保留两者；再继续三块首屏差异。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/性能仍待完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 15:04 +08:00）

完成：多题澄清保留选项和补充回答，往返时将焦点交给当前题；方向键移动选项焦点而不自动选中，空格选择，单选Enter只选择，多选/补充Enter推进或最终提交，Cmd/Ctrl+Enter仅在所有题完成时提交，Shift+Enter和文本上下键保持编辑。Escape回上一题，第一题只回卡片焦点；没有擅自新增取消问题协议。IME/composition/229与按钮自身键盘行为保留。问题卡接收失败并就地显示原样重试，提交同步门禁防双击，在途锁定答案和题目导航；主/旁路radio使用独立请求name。Controller校验waiting/模型/预期请求ID，捕获原generation，不将上一任务失败写进新任务通用错误。计划修改文本框补token、placeholder与可见焦点。

验证：既有5文件404项定向、React类型/生产构建、diff及资源许可审计通过。原Controller错误吞掉和迟到错误污染两项回归先红后绿；没有重跑全量及Electron/Vue构建/严格检查。明暗隔离生产Electron共10项、8张最终图逐张检查，每主题1次真实Agent/本机受控SSE：首次传输拒绝明确拦截在runtime接纳前，失败不调用模型；原样重试经真实桥/IPC保存两题答案，present_plan产生实际待确认计划，F5保持计划和独立Composer草稿。初始问题/历史为种子；未声称澄清答案本身跨F5持久化。零页面错误，自有实例关闭。

证据：`/tmp/mira-question-navigation-20261011.w2g3Ub/`的`vitest-targeted-final.json`、`report.json`、8张最终图、`frozen-contract.json`、`identity-after.json`与`bundle-audit-final.json`；469源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS，React `b6d2df4a…`、CSS `36b128c6…`，main/preload/Vue同12:53。临时脚本首次误用node启动esbuild二进制已修正；旧`report-before-content-fixture.json`只因断言把SSE文本数组当字符串失败，实际请求含完整答案，未冒称产品缺陷。修复前回归见`/tmp/mira-question-controller-before-20261011.json`。临时文件只在/tmp，只扩展既有测试，未提交/推送。

剩余/下一入口：继续计划确认/修改的提交门禁、局部失败与重试；完整首屏、动态插件、自定义Agent、远程MCP/OAuth、Goal/workflow等仍待完成。无可调用computer-use；原生ZCode同态、实体IME/剪贴板、远端模型、Windows/release及总体性能未验，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 14:55 +08:00）

完成：Composer/队列“查看确认”精确定位所属主/旁路的待批准权限、计划或澄清卡片；移除全局DOM查询，忽略另一面板及记忆卡，屏外权限先挂载其所属虚拟消息再滚动聚焦。任务/owner变更取消迟到定位，失效请求不跳转；查看不自动批准、提交或恢复。实际工具待批准时宿主尚未标queue.paused，旧队列因此漏掉确认入口，已按真实confirmationPending补显示，不伪造暂停状态。计划/问题卡使用ZCode式中性popover、选项反馈和可见焦点；实际明亮正文4.116:1不足，局部调整至7.937:1（深色6.678:1），不改全局主题或记忆卡。

验证：既有8文件345项定向、React类型及最终生产构建通过；本批没有重跑全量、Electron严格类型或Electron/Vue构建，后者沿用12:53产物及其61条类型基线。明暗隔离生产Electron各6项共12项、10张最终图逐张检查；每主题4次真实Agent/本机受控SSE，含两个并行工具权限、屏外精确导航、独立草稿、F5及撤回排队后显式允许。计划/多题问题是明确种子数据，不称模型真实生成。零页面错误，自有实例退出。没有可调用computer-use；原生ZCode同态、实体IME/剪贴板、远端模型、Windows/release及总体性能未验。定位记录包含测试等待，不作总体性能结论。

证据：`/tmp/mira-confirmation-owner-20261011.79dkkm/`的`vitest-targeted-final.json`、`report.json`、10张最终图、`frozen-contract.json`、`identity-after.json`、`bundle-audit-final.json`。469源码/576产物验前验后一致；291JS/240动态目标/33许可/freshCSS/无过时JS。React `8db8df1d…`、CSS `082e600d…`，main/preload/Vue同12:53。旧失败报告保留：SSE文本数组、异步导航与oklch解析属于临时夹具错误；漏确认入口和实际对比度不足是产品缺陷并已修复。只扩展既有测试，临时证据留/tmp，Apache原文保留，未提交/推送。

剩余/下一入口：核对多题澄清的键盘导航、保稿、失败和重试，以及计划修改文本框；继续三块首屏差异。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及原生/发布/总体性能仍未完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 12:53 +08:00）

完成：对照ZCode `promptHistory.ts`、`promptHistoryStorage.ts`、`LexicalChatInput.tsx` 接入↑/↓历史输入。空正文或翻阅中才接管无修饰方向键；上下均可从空稿读取最近条目，最早条目停住，向下越过最近条目回到空稿。编辑退出翻阅，非空普通/多行草稿、候选菜单、IME/229及修饰键保持自身行为；回忆斜线不主动弹候选，显式+仍可打开。按Electron实际目录存入独立SQLite表（schema30），最近30条、连续去重、A/B/A保留、单条100k及序列化262144字符上限；超限输入不清空已有历史。只记录已接纳提交，拒绝/确认/重放/压缩不新增历史。渲染器不能传任意目录；切范围丢弃迟到结果，翻阅列表保持原顺序，错误可重试且保稿。主/旁路共享目录历史并接跨任务队列变更刷新，但草稿、附件和正文各自独立；不回放旧网页快照/文件附件。

修复：异步接纳记录保持原队列Promise身份，发送重放继续返回同一Promise。实际隐藏Electron发现关闭键入候选后立即全选被延迟回焦覆盖，仅删末字；历史回忆后也有同类问题。前者在输入框仍持焦时保留选区，后者改为实际编辑器事务，不安排迟到光标恢复。两项选区回归先红后绿，跨任务历史刷新有独立回归。旧全量测试另有3处夹具滞后：项目添加桥已使用安全错误文案、市场详情点击需要currentTarget；仅更新相应现有夹具，不修改生产授权及详情协议。

验证：最终195文件3377项全量通过；React/Vue类型、React及Electron/Vue生产构建、diff与资源/许可审计通过。Electron严格检查仍失败，但与本轮前snapshot对比61条诊断多重集合相同，不称类型全绿。明暗隔离生产Electron各8项共16项，8张最终截图逐张检查；每主题5次真实Agent/本机受控SSE（4主、1旁），验证新旁路提交立即可在已挂载主输入框回忆、目录/个人隔离、F5及实际进程退出重开。较早历史是明确种子数据，不冒称用户既有数据迁移；没有实体IME/剪贴板、实时ZCode同态、远端模型、Windows/正式包或总体性能验收。当前工具仍无可调用computer-use。

证据：`/tmp/mira-input-history-20261011.oEUkoN/`中`vitest-full-closed.json`、`report.json`、8张带时间戳最终图、`frozen-contract.json`、`identity-after.json`、`bundle-audit-final.json`、`electron-type-audit.json`。469源码/576产物验前验后一致；291JS/240动态目标/33许可/freshCSS/无过时JS；main `df99b2e2…`、React `116371e6…`、CSS `0e938ff9…`。旧snapshot及失败报告保留，启动依赖软链缺失、拒绝请求的message/text字段和不存在的getPreference属临时夹具错误；迟到选区恢复属于真实产品缺陷，未混淆。只扩展既有仓库测试，临时脚本/报告/截图留在/tmp，Apache原文保留，未提交/推送。

剩余/下一入口：从ZCode `ConversationComposer.tsx` / `SessionPane.tsx` 核对运行中发送、排队/引导、暂停确认、停止与候选浮层的可见状态和焦点/快捷键竞争，修实际遗漏；随后继续三块首屏交互。动态插件Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth、Goal/workflow及完整原生/发布/总体性能仍未完成，整体目标active。下方旧下一步仅指各历史批次。

2026-10-11 12:22 +08:00：修复Composer候选浮层拦截辅助按钮按键：分类/重试按钮的Enter、空格、Tab及方向键交回按钮自身；列表/输入区候选选择和Esc保稿回焦保持。实际旧生产Electron复现“焦点在/分类按钮却插入高亮插件”，5项回归先红后绿；最终4文件208项、React类型/构建及资源许可审计通过。明暗隔离Electron14项、8张最终截图已逐张检查，含真实旁路创建与草稿隔离；467源码/576产物身份一致，JS `c3feb73c…`，CSS/Electron/Vue不变。证据 `/tmp/mira-composer-panel-20261011.0WPqdc/`；保留失败报告与旧snapshot，最终同名截图仅对应本批成功产物。辅助按钮重试按键范围有回归，本批未验证真实目录失败后的重试成功。临时定位器及将键入面板当显式+面板的夹具假设已纠正；键入候选失焦关闭仍保持。未重跑全量、未调用模型；无实体输入/ZCode同态、Windows/release或总体性能验收。下一入口：对照ZCode核对↑/↓历史输入翻阅，继续Composer首屏差异；动态插件、自定义Agent及远程MCP仍待完成。整体active，未提交/推送。

2026-10-11 12:14 +08:00：已安装插件横向条为键盘焦点轮廓保留4px内边距，并用负外边距保持原左对齐。明暗隔离生产Electron6项通过，4张最终截图已逐张检查；实际首尾条目键盘聚焦、横向滚动与本地管理可用。React构建/资源许可审计通过，467源码/576产物身份一致；CSS `1fc1dda9…`，JS及Electron/Vue不变。CSS单行修复未重跑Vitest或全量；截图等待绘制的修正属于临时夹具，旧报告保留。证据 `/tmp/mira-market-focus-20261011.36V5X7/`；公开网络受控离线，本批不重复声称安装、原生ZCode/输入、发布或总体性能通过。下一入口：Composer候选交互和主/旁对话归属，再继续首屏功能对齐；整体active，未提交/推送。

## 当前完成、剩余与下一入口（2026-10-11 12:06 +08:00）

完成：市场分段改用已安装的Radix Tabs 1.1.21，并在根package及锁文件直接声明；不额外安装或手写方向键循环。方向键/Home/End/循环切换与Tab进入活动面板、准确aria-controls/labelledby接通。Skill/插件可用Enter/空格进入，详情将焦点放到返回按钮；返回精确恢复卡片或已安装条入口和原滚动位置。实际Electron发现插件目录异步加载时原条目未就绪，旧RAF直接结束回焦；再发现过早恢复滚动被短暂加载态截短。现统一等待目录就绪恢复，用户已移焦则保留新焦点/位置，卸载/再开详情拒绝旧恢复。

验证：最终4文件136项定向、React类型/生产构建、diff及资源许可审计通过；本轮未重跑全量，Electron/preload/Vue沿用11:48产物。实际隔离生产Electron明暗各6项共12项、10图全部逐张复核；除了初始离线受控，本轮net.fetch实际下载固定raw提交，恢复14个Skill及5个插件条目，打开真实Skill/插件详情，每主题在隔离目录安装brand-guidelines，已安装条与F5保持。验证键盘分段/活动面板、卡片和条目准确回焦/滚动及独立草稿；零页面错误/模型调用，自有实例退出。无computer-use，不代替实体输入、ZCode同态、Windows/release或总体性能验收；实际安装仅限定此包，不扩大为完整市场安装矩阵。

证据：最终`/tmp/mira-market-return-verified-20261011.haQOb5/`的`vitest-targeted.json`、`report.json`、10图、`frozen-contract.json`、`bundle-audit-final.json`及`identity-after.json`；467源码/576产物一致，291JS/240动态目标/33许可/freshCSS/无过时JS。React `5732f30c…`、CSS `d0717e57…`，main/preload/Vue同11:48。修复前键盘/详情回归及真实插件返回失败见`/tmp/mira-market-keyboard-20261011.z0VudU/`，局部修复后真实滚动失败见`/tmp/mira-market-keyboard-final-20261011.j0wHvf/`；Radix使用mousedown/延迟焦点的测试夹具纠正与实际产品缺陷区分保留。只扩展既有测试，临时文件仅/tmp，Apache声明保留，未提交/推送。

剩余/下一入口：最终图中已安装条的键盘焦点轮廓下缘被横向滚动容器裁剪，继续补足可見焦点；不据此否认已经通过的操作链路。动态Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth及Goal/workflow仍未完成，整体active。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 11:55 +08:00）

完成：参考ZCode目录分区结构，公开插件包和独立Skill目录的错误、加载、重试回到各自标题下，重复通用错误现在标明归属；失败不声称空目录或0项。Skill目录错误不覆盖已打开的可读详情；本地已安装内容离线仍能刷新、启停并持久化。两项新增回归在修改前失败，修复后通过。

验证：最终4文件131项定向、React类型/生产构建、diff与资源许可审计通过；本轮无全量重跑，未改Electron/Vue沿用11:48产物。实际隔离生产Electron明暗各5项共10项通过，6图逐张复核：双目录错误归属、Skill挂起加载/单次重试、插件单次重试、已安装刷新无外网请求、实际本地登记停用、导航/F5保稿和持久化。net.fetch只受控离线/挂起，不验证公开下载/安装成功或模型；实际UI/桥/IPC/本地登记运行，零页面错误，自有实例退出。

证据：`/tmp/mira-market-feedback-20261011.qvqUFi/`的`vitest-before.json`、`vitest-targeted.json`、`report.json`、6图、`frozen-contract.json`、`bundle-audit-final.json`及`identity-after.json`；467源码/576产物身份一致，291JS/240动态目标/33许可/freshCSS/无过时JS。main/preload/Vue/CSS同11:48，React `ea8414c7…`。首次临时根目录依赖软链遗漏导致fixture启动失败，`report-launch-before.json`保留；仅修夹具，不算产品修复。临时文件仅/tmp，只扩展既有测试，Apache原文保留，未提交/推送。

剩余/下一入口：对照ZCode核对市场浏览/详情的键盘导航与焦点返回；继续首屏功能差异。动态插件、自定义Agent、远程MCP/OAuth及Goal/workflow仍未完成，整体active；无可调用computer-use，实体ZCode同态/输入、Windows/release及总体性能未验。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 11:48 +08:00）

完成：添加项目后同步实际项目清单，新增项目立即可见并展开父区/项目，已有隐藏目录恢复同一身份、不重复创建；不创建/切换任务，取消保持原状态。实际Electron复现目录选择失败只显示通用“平台调用失败”，已在projects.select桥限定映射安全恢复说明，不泄露未知路径/内部错误；侧栏就地提示，即使插件市场处于主视图也能发现，重试清旧错误。草稿、当前任务、消息与模型保持，刷新恢复展开状态。

验证：最终5文件439项定向、React/Vue类型、React生产构建、Electron/Vue生产构建及资源许可审计通过；本轮未重跑全量。隔离生产Electron明暗各5项共10项通过，最终8图全部逐张复核；验证单次选择/取消、新目录真实SQLite记录、隐藏身份恢复、失败不增任务、侧栏错误和重试/F5保稿。仅原生目录选择返回受控，实际UI→MessagePort→IPC→store链运行；零模型请求/页面错误，自有实例退出。市场外网请求由夹具阻断，不代表本批验证公开下载。

证据：`/tmp/mira-project-select-final-20261011.1nrhNM/`的`vitest-targeted.json`、`report.json`、8图、`bundle-audit-final.json`、`identity-after.json`；467源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS。main `e2aa3242…`、preload `7e4444b3…`未改；Vue `4fd08d9b…`已重建，React `2a181455…`、CSS `616752ab…`。新/已有项目刷新、安全错误映射及局部反馈均先红后绿，失败证据保留于`/tmp/mira-project-select-20261011.hZnyna/`。临时文件仅/tmp，只扩展既有测试，Apache声明保留，未提交/推送。

剩余/下一入口：核对插件市场两类独立来源的加载、错误与重试归属，避免重复通用错误和无关详情被目录失败干扰。动态Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth及Goal/workflow仍未完成，整体active。无可调用computer-use，不宣称实体ZCode同态、实体IME/剪贴板/原生选择器、远端模型、Windows/release或总体性能通过。以下为历史记录，不覆盖当前状态。

## 当前完成、剩余与下一入口（2026-10-11 11:40 +08:00）

完成：按ZCode readOnlyReason与目录警告交互，Mira用实际directoryExists快照显示可键盘聚焦的警告、完整路径与恢复说明；折叠/展开均可发现。项目新建、文件树和原生目录/终端打开禁用并在菜单说明原因；历史任务可读，元数据改名/隐藏/恢复保持。目录恢复后F5重新读取可用状态。实际Electron发现项目改名成功但侧栏名称不更新：renameProject原来只刷新任务列表，已补真实projects.list更新且不重开无关任务，回归先红后绿。截图发现项目名称Tooltip覆盖已打开菜单，改为同一行菜单打开时暂停提示并清理旧打开状态；菜单说明可完整读取。

验证：最终6文件341项定向、React类型/生产构建、diff和资源许可审计通过；本轮未重跑全量或重建未改Electron/preload/Vue。隔离生产Electron明暗各5项共10项通过，最终6图逐张复核，覆盖真实目录移走/恢复、完整路径键盘提示、四种禁用动作、SQLite历史阅读、真实改名、隐藏/恢复、独立草稿与F5；零模型调用/页面错误，自有实例退出。无可调用computer-use，不冒称实体ZCode同态、实体IME/剪贴板、原生文件选择/终端、Windows/release或总体性能验收。

证据：最终`/tmp/mira-project-availability-closed-20261011.U07w65/`中的`vitest-targeted.json`、`report.json`、6图、`frozen-contract.json`、`bundle-audit-final.json`、`identity-after.json`；467源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS。main `e2aa3242…`、React `321ab66f…`、CSS `616752ab…`。首次警告4项失败及实际改名缺陷/失败回归见`/tmp/mira-project-availability-20261011.sbyPNX/`；依赖软链、初始iframe焦点与改名后未hover隐藏菜单按钮属于夹具修正，不冒称产品修复。修复改名后明暗10项通过但截图发现Tooltip遮挡的版本保留在`/tmp/mira-project-availability-final-20261011.wfWooW/`。临时文件仅在/tmp，未新增仓库测试文件；Apache原文保留，未提交/推送。

剩余/下一入口：核对添加项目后的实时清单与可见状态，从PilotController.selectProject只刷新任务列表的链路开始；当前尚未修复该链路。动态Shell/模型工具覆盖、自定义Agent、远程MCP/OAuth及Goal/workflow未完成，整体目标active。以下为历史记录，不代表当前剩余。

## 当前完成、剩余与下一入口（2026-10-11 11:30 +08:00）

完成：折叠项目与自定义分组按完整实际成员聚合未读、执行中、待确认状态，超出首5条仍可发现；同一任务待确认优先于执行中，独立未读保留。展开恢复逐任务状态，不导航、不清未读。状态提供键盘焦点和Radix提示。项目动作闲置时不占标题宽度，hover/focus/打开菜单时保留；项目和任务更多菜单用独立menuOpen维持触发按钮，避免Tooltip覆盖data-state导致离开后定位变化。Header/任务更多按钮已统一悬浮与键盘提示。

验证：最终10文件217项定向、React类型/生产构建、diff及资源许可审计通过；本轮未重跑全量，未改Electron/preload/Vue沿用11:06产物。隔离生产Electron明暗各6项共12项、8图逐张复核，覆盖折叠/分页/未读与审批、hover动作占位/菜单锚点、Header与任务提示、实际Agent运行到完成、独立草稿及F5。每主题1次受控本机SSE，零页面错误；自有实例退出。无可调用computer-use，不代替实体ZCode同态、实体IME/剪贴板、远端模型、Windows/release或总体性能验收。

证据：`/tmp/mira-sidebar-menu-final-20261011.53Tb7p/`中的`vitest-targeted.json`、`report.json`、8图、`frozen-contract.json`、`bundle-audit-final.json`、`identity-after.json`；467源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS。main `e2aa3242…`、React `31eec596…`、CSS `7df457e9…`。前轮项目/任务菜单按钮消失是真实产品缺陷并已修复；种子交互缺失、选择器/隐藏按钮几何与iframe初始焦点等待属于夹具修正，失败记录保留于PKVJQ7/6fNkj6/mSPWbm/8RIrx0各临时目录，不覆盖成成功。只扩展既有测试，临时文件仅在/tmp；Apache原文保留，未提交/推送。

剩余/下一入口：核对ZCode项目目录不可用提示及Mira项目菜单门禁，补齐有数据但禁用无解释的交互；再继续首屏缺口。插件Shell动态展开/模型工具覆盖、自定义Agent、远程MCP/OAuth与Goal/workflow仍未完成，整体目标active。以下为历史记录，不代表当前剩余。

## 当前完成、剩余与下一入口（2026-10-11 11:06 +08:00）

完成：已安装插件的静态 Markdown 命令已接通发现、`/`候选、原子命令标签、参数与真实执行。支持命令独立包和嵌套名称；选择不自动发送，命令只在正文开头调用。宿主展开参数及插件根变量，聊天记录保留用户原命令，后续上下文沿用首次保存的展开正文。排队、重试和自动化按实时启用状态/原目录/内容复核，变更时暂停并可撤回原稿；renderer不能提供展开提示词。必需Skill不存在时拒绝，需要Skill的命令在计划模式拒绝；不支持的Shell动态展开、模型/工具覆盖或未知元数据明确显示不可用。命令独立包不能通过`@`冒充Skill。

验证：195文件3324项全量通过后补充计划模式边界；最终11文件520项定向、Vue类型与Electron/Vue重建通过，React类型/生产构建沿用本批已验证版本。最终隔离生产Electron明暗各6项共12项通过，每主题3次受控本机SSE，覆盖真实展开/附件、短命令历史、F5冻结上下文、队列变更暂停和撤回、安装清单及主旁独立草稿。前批12图逐张复核，最终重建后的明亮命令/深色清单再次复核。外网市场请求由夹具阻断，本批不验公开下载。无可调用computer-use；实体ZCode同态、实体IME/剪贴板、远端模型、Windows/release及总体性能仍未验。

证据：最终`/tmp/mira-plugin-commands-closed-20261011.vu1pft/`的`vitest-targeted.json`、`report.json`、12图、`frozen-contract.json`、`bundle-audit-final.json`和`identity-after.json`；467源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS。main `e2aa3242…`、React `ccd3ec51…`、CSS `0eab8575…`。全量证据在`/tmp/mira-plugin-commands-final-20261011.Cng0zO/vitest-full.json`，早期mock扫描/参数断言、夹具依赖和安装tab选择失败保留，不覆盖成成功。临时脚本/图/报告只在/tmp，Apache原文保留，未提交/推送。

剩余/下一入口：继续核对侧栏项目/分组折叠时的未读及运行提示，与ZCode首屏状态保持一致。插件Shell动态展开/模型工具覆盖、自定义Agent、远程MCP/OAuth与Goal/workflow仍未完成；整体目标active。以下为历史记录，不代表当前剩余。

## 当前完成、剩余与下一入口（2026-10-11 10:36 +08:00）

完成：修复草稿末尾为`/`等触发器时，刷新/切任务尚未聚焦输入框就自动打开补全的缺陷。参考ZCode SlashCommandPlugin/MentionPlugin的失焦关闭行为，键入候选绑定实际Lexical焦点及编辑器身份，失焦关闭并保留正文/外部焦点；显式`+`菜单继续独立持有焦点和插入选区。主/旁对话切换只显示当前编辑器候选，匿名草稿提升沿用既有编辑器身份。`/model`、Escape回焦和旁路`+`原子角色引用保持可用。

验证：既有4文件225项定向回归、React类型/生产构建、diff与资源许可审计通过；新增四种触发器的真实DOM回归先红后绿。本轮未重跑全量、未重建未改Electron/Vue。隔离生产Electron明暗各5项共10项通过，6图逐张复核，覆盖刷新/导航、四触发器键盘失焦、模型菜单回焦、主旁独立草稿与`+`引用。没有模型请求；实体ZCode同态、实体IME/剪贴板、远端模型、Windows/release或总体性能仍未验。

证据：`/tmp/mira-composer-focus-verified-20261011.lQdG4d/`中的`vitest-targeted.json`、`report.json`、6图、`frozen-contract.json`、`bundle-audit-final.json`、`identity-after.json`。466源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS。ReactJS `ac379744…`、CSS沿用`78d2a8a3…`。修改前未聚焦仍展开的真实Electron记录和截图在`/tmp/mira-composer-disclosure-20261011.ZtzMxR/`；最初DOM夹具用匿名稿而非已有任务、运行夹具误用空Lexical innerText及未等RAF回焦，失败均保留并纠正，仅修改夹具。临时脚本在/tmp，未新增仓库测试文件，未提交/推送。

剩余/下一入口：`electron/storage/miraPluginStore.ts`当前将commands/agents等标为unsupported，只有Skill可执行。下一批从已安装插件命令目录、`/`候选、参数展开及实际发送契约核对开始，先定义兼容格式和权限/草稿边界，再接真实能力。自定义Agent、其余非Skill插件、远程MCP/OAuth及Goal/workflow仍未完成。整体目标active，以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 10:26 +08:00）

完成：修复小桌面窗口中展开摘要覆盖 Composer 的实际缺陷；修改前复现重叠48px，修改后摘要限定在消息阅读区，与多行输入框相隔16px。长计划/子智能体内容可独立滚动，键盘可进入摘要正文并到达末尾执行入口。底部终端压缩阅读空间至不足140px时，临时显示胶囊，空间恢复后按原 mini/panel/auto 偏好显示；不改写用户选择。只有被隐藏摘要持有焦点时才将焦点转到胶囊，外部焦点与草稿不受影响。沿用现有组件/token及ZCode许可。

验证：定向5文件146项、React类型与生产构建、diff及资源许可审计通过；本轮未重跑全量或重建未改Electron/Vue。隔离生产Electron明暗各5项共10项通过，最终6图复核，覆盖长计划/24个历史子智能体、多行草稿、键盘滚动与准确run、底部终端空间、模式/任务切换和F5。历史数据为夹具；没有真实模型请求，终端本批仅验布局。无可调用computer-use，不能代替实体ZCode同态、实体IME、远端模型、Windows/release或总体性能验收。

证据：`/tmp/mira-summary-boundary-verified-20261011.5d4Tuh/` 中 `vitest-targeted.json`、`report.json`、截图、`bundle-audit-final.json`、`identity-after.json`。466源码/576产物验前验后一致；291JS/240动态目标/33许可/freshCSS/无过时JS。ReactJS `ca0f7b24…`，CSS `78d2a8a3…`；修改前证据在`/tmp/mira-summary-boundary-before-20261011.goAk9D/`。只扩展既有测试，未新增仓库QA文件，未提交/推送。

剩余/下一入口：继续对照ZCode补Composer `@`、`/`、`+`的实际交互差异。非Skill插件、自定义Agent、远程MCP/OAuth仍未接；Goal/workflow不伪造入口。整体目标active，以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 10:16 +08:00）

完成：参考 ZCode Header 的执行轨迹入口，将 Mira 既有“查看执行详情”接入标题栏、侧栏右键和更多菜单。标题栏打开所捕获的当前/最近历史 run；侧栏通过现有导航事务打开目标任务及其活动面板，迟到结果不覆盖更新的导航。显示实际活动、工具、子智能体、用量，不冒称完整模型请求/响应轨迹。无记录显示明确空态，不创建新会话、不执行模型；Header 不恢复此前移除的状态或文件树按钮。沿用现有 Radix、tokens 和 Apache 声明。

验证：定向4文件156项、React类型/生产构建、diff及资源许可审计通过；本轮没有重跑全量测试或重建未改的Electron/Vue。隔离生产Electron明暗各5项共10项通过，6图逐张复核：Header键盘打开、其他任务右键/更多菜单、空态、真实Agent运行到完成的同一面板、F5及独立草稿。历史记录由夹具播种，新运行经过实际SDK/主进程与受控本机SSE；页面/意外网络错误为空，自有实例退出。测试初次断言访问未挂载面板/空Header、随后引用未导入组件均为夹具错误，仅修断言。

证据：`/tmp/mira-task-execution-20261011.iAROjI/` 中 `vitest-targeted.json`、`report.json`、6图、`frozen-contract.json`、`bundle-audit-final.json`、`identity-after.json`。466源码/576产物验前验后一致；291JS/240动态目标/33许可/freshCSS/无过时JS。ReactJS `7be5ec6d…`；main/preload/Vue/CSS与10:05产物相同。临时脚本只在/tmp，扩展既有测试，未新增QA文档或测试文件，未提交/推送。

剩余/下一入口：继续核对Composer的`@`、`/`、`+`分类和ZCode本地可实现入口，优先用户首屏路径；非Skill插件、自定义Agent、远程MCP/OAuth仍待接。无可调用computer-use，尚未验实体ZCode同态、实体IME、远端模型、Windows/release或总体性能。整体目标active，以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 10:05 +08:00）

完成：Composer 上下文用量改为真实 Radix 浮窗，支持悬浮、点击、焦点、方向键进入操作和 Escape 返回；显示实际 token/容量、进度及估算/实测，无数据不编造零用量、套餐或缓存命中。浮窗压缩不消费输入正文。`/compact` 和 `/compress` 在运行/审批/已有队列时按 FIFO 追加明确的上下文操作，不作为用户消息或指导发给模型；模型/目录冻结，执行及写回前重验第一方授权。重复操作阻止，同提交 ID 的排队/执行中重试返回已有接纳结果；暂停队列不被越过。可排序/删除/立即执行，压缩操作不提供普通正文编辑。失败/停止保留命令和原上下文，恢复后重试；队列仍为进程内。

修复：真实恢复重试发现排队压缩只有悬浮胶囊、没有 Composer 停止入口。新增回归先失败再修复，进度/停止现在同时识别宿主 `context-compaction` 和本地进行态；切换回正在压缩的任务也可停止。已结束或撤销的压缩不再残留“已加入待发送”提示；新稿和迟到任务归属保护保持。

验证：最终195文件3300项全量、React/Vue类型、React/Electron/Vue生产构建和资源许可审计通过。最终隔离生产Electron明暗各8项共16项通过：实际主进程/preload/Vue/MessagePort/React/Lexical/SQLite/模型适配器/SDK摘要/Agent，验证浮窗键盘与焦点、原稿不清、图片/旧摘要、FIFO前后消息、下一轮使用摘要、真实摘要失败/在途停止/恢复重试、任务切换/双草稿/迟到隔离和F5。仅模型回复由本机SSE控制；零页面/受限网络错误，无可见原生窗口，自有进程退出。

证据：`/tmp/mira-context-usage-verified-20261011.MRXc7v/` 中 `report.json`、`vitest-full.json`、`frozen-contract.json`、`bundle-audit-final.json`、`identity-after.json`及8图。466源码/576产物验前验后一致；291JS/240动态目标/33许可/freshCSS/无过时JS。main `dc0e292e…`、React `b06fc4bc…`、CSS `853ee6de…`。初轮7项/主题及夹具误用旧队列API保留在`/tmp/mira-context-usage-20261011.P7pHXo/`；执行中同ID重试调整后的版本、夹具未等待接纳ACK及真实停止按钮缺陷/失败回归保留在`/tmp/mira-context-usage-final-20261011.rYT2Bi/`，不将夹具失败混作产品修复。最终代码无后续修改。临时脚本/图/报告仅在/tmp，Apache原文保留，未提交/推送。

剩余/下一入口：回到ZCode侧栏项目/分组菜单、Header及Composer剩余首屏入口，先核对实际源码与已有能力，再接通差异，不重复压缩或回到文件支线。完整非Skill插件、自定义Agent、远程MCP/OAuth仍未完成。当前无可调用computer-use；隔离生产宿主不代替实体ZCode同态、实体IME、远端模型、Windows/正式包或总体性能验收。整体目标active。以下均为历史记录，不覆盖此段当前状态。

## 当前完成、剩余与下一入口（2026-10-11 09:47 +08:00）

完成：空闲已有任务提供 `/compact`，整条无附件/结构化引用的 `/compress` 同样可触发。复用Mira摘要器、冻结图片、现有运行锁/停止和受控第一方桥；最近一轮保持原文，较早内容与原摘要进入真实模型请求，完整历史和文件不删除。成功且草稿owner/revision未变才消费命令；失败/停止保留旧上下文与命令，可重试，期间可以编辑和切任务。压缩是明确的上下文操作，摘要胶囊及Composer状态/停止入口保留，不生成空白助手回复。

验证：最终全量195文件3287项通过，React/Vue类型、React/Electron/Vue生产构建及资源许可审计通过。最终隐藏生产Electron明暗各5项共10项通过，实际主进程/preload/Vue/MessagePort/React/Lexical/SQLite/模型适配器/摘要器/Agent；真实摘要包含旧上下文和冻结图片、排除最新一轮，后续Agent使用已保存摘要和最新对话。实际模型失败/中止/重试、重复压缩无额外请求、双草稿/迟到隔离和F5均通过，零页面/受限网络错误，自有进程退出。最终6图逐张复核。第一轮图发现普通运行投影追加空白助手，回归先失败后通过；修复后完成上述全量、重建及最终两主题确认。

证据：`/tmp/mira-context-compaction-final-20261011.rZcf4g/report.json`、`vitest-full.json`、`frozen-contract.json`、`bundle-audit-final.json`、`identity-after.json`及6图。465源码/576产物验前验后一致；291JS/240动态目标/33许可/freshCSS/无过时JS。main `c5728630…`、React `85b08f38…`、CSS `1bbfa02c…`。旧版本和两次夹具请求识别失败保留于 `/tmp/mira-context-compaction-20261011.xVQiQN/`：SDK completeSimple同样流式请求，修正夹具分类，没有为此修改产品。临时文件仅在/tmp，Apache原文保留，未提交/推送。

剩余/下一入口：对齐上下文用量浮窗及其压缩入口，再核对ZCode运行中压缩命令排队；当前压缩只允许空闲且无待发送消息，不冒称上游命令队列同态。完整非Skill插件、自定义Agent、远程MCP/OAuth仍未完成。当前无可调用computer-use；本批受控本地模型验证不替代实体ZCode同态、实体IME、远端模型、Windows/正式包或总体性能验收。整体目标继续推进，以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 09:30 +08:00）

完成：按 ZCode 回复操作接入“从这里分支”。从准确的已完成回复创建独立可见任务，保留该回复及之前的历史、相关工具记录、适用摘要和独立冻结图片；不复制活动执行/审批，不重执行工具，不回滚项目文件，不重复累计历史用量。分支分隔线可返回源消息，双方草稿独立。受控桥只接受源任务/回复/幂等请求身份；保存后复查任务归属，迟到响应不抢当前任务或覆盖草稿。

验证：定向8文件545项及最终全量195文件3270项通过；React/Vue类型、React与Electron/Vue生产构建、diff与资源许可审计通过。最终隐藏生产Electron明暗各5项共10项通过，真实主进程/preload/Vue/MessagePort/React/Lexical/SQLite/Agent；12轮历史在第4轮分支得到8条消息/4条工具记录，独立图片、准确返回、草稿恢复、实际续写和F5持久化通过。迟到测试延迟真实已提交MessagePort回复，独立任务及新稿未被覆盖。最终6图逐张复核，零页面/受限网络错误，自有进程退出。

证据：`/tmp/mira-conversation-fork-20261011.nZ0qfb/report.json`、`vitest-full.json`、`frozen-contract.json`、`bundle-audit-final.json`、`identity-after.json`及6图。465源码/576产物验前验后一致；291JS/240动态目标/33许可/freshCSS/无过时JS。main `bf5833cd…`、React `e57c2633…`、CSS `d0676cd3…`。夹具依赖、空编辑器换行、选择器、模型图片能力配置和ACK拦截失败另存，不冒称产品修复；最终测试后未修改产品代码。临时文件仅在/tmp，Apache原文保留，未提交/推送。

剩余/下一入口：核对ZCode `/compact` 与Mira现有自动压缩，再接入手动压缩；此命令尚未实施。完整非Skill插件、自定义Agent、远程MCP/OAuth仍未完成。模型验证为受控本地SSE，当前无可调用computer-use；本批不替代实体ZCode同态、实体IME、远端模型、Windows/正式包或总体性能验收。整体目标继续推进。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 09:09 +08:00）

完成：`/mcp` 为已配置、启用但失败/断开的服务提供定向重连；连接中显示真实进行态并防重复操作，刷新仍只读。第一方桥只接受登记的服务 ID，不接受页面启动命令；其他服务与工具不重建。连接版本和客户端身份防止关闭/替换后的旧异步结果恢复过期工具。保留正文、权限和选择，运行中不提供重连；切任务/改草稿后不写入旧错误或刷新旧菜单。

验证：全量195文件3262项通过；最后的连接中状态投影/清旧错误修改后，定向264项、React类型和生产构建通过，Vue类型及Electron/Vue构建也通过。最终隐藏生产Electron明暗各5项共10项，真实stdio失败、重试、断连、重复操作、切任务与兄弟PID保留均通过；恢复的工具经实际Agent执行，结果进入SQLite和本地受控模型协议。最终两张连接中截图复核；恢复截图与前次已逐张复核图的哈希一致。零页面/受限网络错误，自有MCP及Electron进程退出。未把最后定向验证称为全量重跑。

证据：`/tmp/mira-mcp-reconnect-final-20261011.gJZBia/report.json`、`bundle-audit-final.json`、`frozen-contract.json`、`identity-after.json`与4图；465源码/576产物验前验后一致，291JS/240动态目标/33许可/freshCSS/无过时JS审计通过。main `ac1ceb9a…`、React `23d788a1…`、CSS `d86838d6…`。临时脚本与图只在/tmp，未提交/推送。

剩余/下一入口：继续对照ZCode首屏交互，优先检查侧栏项目/分组菜单、Header与Composer尚未接通的操作；完整非Skill插件、自定义Agent、远程MCP/OAuth仍未完成。当前无可调用computer-use；隐藏生产宿主不替代实体ZCode同态、实体IME、远端模型、Windows/正式包或总体性能验收。整体goal active。以下均为历史记录，不覆盖上方当前进展。

## 当前调查与下一入口（2026-10-11 08:53 +08:00）

08:48工具栏代码已完成，当前产物另做三次独立生产Electron性能调查：500轮1000完整消息，首开中位79ms、输入29.9ms、阅读恢复71.4ms且锚点漂移0；工作区打开/关闭DOM42.9/51.1ms，动画另等。初始及全过程均未复现≥50ms主线程longtask。独立启动trace最大FunctionCall45.388ms，主要采样含Radix首次布局；291份映射与实际JS逐字节一致，没有据此修改性能代码或声称性能到顶。完整原始证据、失败夹具记录和边界见 [性能调查](MIRA_HARNESS_PERFORMANCE_2026-10-08.md)。没有重跑不变代码的全量功能回归。

下次从首屏`/mcp`失败恢复开始：当前刷新只读取真实状态，`McpManager.refresh`会重建所有连接，不可直接拿来作为单服务重连。先补已配置且启用的失败/断开服务的定向重连，再接第一方受控协议、Composer状态/重试操作和真实stdio验收；保持其他服务、所属草稿及运行任务不受重置影响。尚未实施该能力。完整非Skill插件、自定义Agent、远程MCP/OAuth、实体ZCode同态/IME/远端模型/Windows/正式包和总体性能仍未完成。整体goal active，未提交/推送；以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 08:48 +08:00）

完成：参考 ZCode `useComposerToolbarFit`，Composer 按真实内容宽度依次收起权限、计划、推理文字（保留绿色档位）、推理纯图标，最后将模型名收为 Package 图标；空间恢复即还原。移除旧540px容器规则，避免一次隐藏多项文字并覆盖新逻辑。不可见/inert副本测量，保留真实Radix按钮、菜单、Lexical身份与草稿；主/旁路分别计算，继续使用既有悬浮提示。权限“下一次提交生效”已经在当前第一方队列入口实现，本批仅核查其链路，不重复改写；旧宿主兼容保留。

验证：全量195文件3255项通过，最终CSS调整后定向246项、React类型/生产构建/diff检查通过。旧冻结生产产物在合法桌面分屏274px工具栏宽度复现按钮侵入右侧；新冻结产物明暗各5项共10项真实隐藏Electron检查通过，含实际拖拽逐档收起、无重叠/按钮不挤小、真实菜单/提示/焦点、模型推理入口增减、计划增减、实际旁路双草稿与展开还原。最终4图逐张复核，零页面/受限网络错误；465源码/576产物验前验后一致。291JS/240动态目标/33许可/freshCSS/无过时JS审计通过，Apache原文保持。全量在最终CSS移除前完成，最终调整后的定向与生产验证单列，不冒称全量重跑。

证据：`/tmp/mira-composer-toolbar-final-20261011.hcg4u5/report.json`、`vitest-full.json`、`bundle-audit-final.json`、`frozen-contract.json`、`identity-after.json`与4图；React `c0fe23b8…`、CSS `d86838d6…`，main/preload/Vue沿用底部终端已验产物。旧容器规则冲突的失败留在`/tmp/mira-composer-toolbar-20261011.YjjfMY/`，fixture窗口resize等待、模型Radio角色与/side保留空格断言的失败均保留独立记录；不是新增产品错误。自有隐藏Electron已退出，没有操作用户现有数据/前台窗口。新helper/报告/图仅在/tmp。

剩余/下次入口：回到实际生产首屏/打开工作区的性能成本，复现并定位此前长任务，先明确开销再修改；不得用本批按钮布局通过代替总体性能结论。非Skill插件、自定义Agent、MCP重连/OAuth仍待接。当前没有可调用computer-use；实体ZCode同态、实体IME、远端模型、Windows/正式包与总体性能仍未验。整体goal active，未提交/推送。以下均为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 08:30 +08:00）

完成：对照 ZCode 的 Header/Terminal/AnimatedTerminalPanel，标头终端按钮与 Cmd/Ctrl+J 改为切换主对话下方的独立底部终端，命令中心终端入口同样打开底部；右侧＋继续新建独立终端资源。底部首次打开才启动 PTY，支持多个标签、方向键/Home/End、单项关闭与调整高度（最小140px、最大主区域50%）。面板与最后一个标签关闭只收起，切任务保留原PTY，删除任务回收所属视图；沿用 Mira task grant 隔离，未移植上游 workspace/RPC。补齐悬浮提示、选中状态、Cmd/Ctrl+Alt+B工作区快捷键与终端焦点归属；终端Ctrl+J不额外写入shell换行，查找/模型快捷键不串到主对话。真实终端URL点击通过原授权桥打开独立侧边浏览器。

修复：真实PTY退出时宿主已移除会话，旧卸载逻辑仍发close导致未处理平台错误。先以DOM回归复现，再在exit时清除实例身份，忽略后续事件/输入，不再次关闭；退出早于open响应的缓冲事件同样覆盖。正常主动关闭仍关闭精确PTY。

验证：195文件3253项通过；React类型、生产构建与diff检查通过；291JS/240动态目标/33许可、freshCSS与无过时JS审计通过。最终隔离隐藏生产Electron明暗各7项共14项通过，实际主进程/preload/Vue桥/React/SQLite/PTY；覆盖真实工作目录、后台命令及shell变量保留、多终端、任务切换、键盘调整高度、底部/侧边并存、最后标签收起、真实exit回收重建、真实xterm链接点击。最终4图逐张复核，零页面/意外网络错误。首次底部启动本机单次明/暗为214/167ms，仅作记录，未作为总体性能结论。验证自有实例和端口随测试退出，没有操作用户现有数据或抢占前台。

证据：`/tmp/mira-bottom-terminal-final-20261011.BwVc2o/report.json`、`vitest-full.json`、`frozen-contract.json`、`bundle-audit-final.json`与4图。464源码/576产物冻结，main `c75fb68d…`、React `a5b4a595…`、CSS `f8ad5f03…`。早期夹具缺依赖链接、未等待快照/任务导航提交、xterm文本层被透明screen覆盖的失败记录保留于/tmp；不是产品验收。真实exit错误已修复并在最终两主题重验。

剩余/下次入口：继续首屏Header/Composer剩余差异，优先核对权限选择“下一次提交生效”的语义和运行中修改行为，沿用既有Mira审批协议；完整外部插件非Skill组件、自定义Agent、MCP重连/OAuth仍待接。当前没有可调用computer-use，未完成实体ZCode同态、实体IME、远端模型、Windows/安装包或总体性能验收。整体goal active，本批未提交/推送。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 08:13 +08:00）

完成：主对话和旁路共用 ZCode 的工作过程/末尾回复分离结构。连续末尾文本独立显示，之前的中间说明、公开思考、工具调用进入 Radix 折叠区；运行时默认展开，成功结束默认折叠，历史手动展开按会话记忆。审批和失败保持可见，run 错误放在折叠区外；文件变更与回复操作跟随结果，明确 run 的执行详情入口保留。有序消息不再追加重复 RunProgressCard；没有 parts 的旧消息沿用原展示，不按时间猜测顺序。查找先挂载虚拟轮次、按 renderer/part 展开具体命中过程，再测量并定位；自动折叠回收消失的工具焦点，不抢最终回复焦点。延续现有 Mira/ZCode tokens，未另创视觉风格。

验证：最终195文件3249项、React类型和生产构建、资源/许可审计通过。实际隐藏生产Electron/main/preload/Vue/React/SQLite 明暗各4项、共8项行为检查通过：180轮历史首轮查找展开及原生CSS Highlight、真实list_files工具、本地SSE流式回复、完成身份不变/自动折叠/重开/明确run详情。第一轮逐张查看6张关键截图，确认轮查看明暗2张详情截图；最终8图使用有限动画完成后捕获，旧过渡帧不作最终样式证据。审批、错误与焦点由真实React DOM回归覆盖，本轮未宣称它们经过原生审批操作验收。自有Electron和服务器退出，源/产物身份稳定；既有npm及CSS构建警告保留。

最终证据：`/tmp/mira-assistant-process-verified-20261011.ojedT2/report.json`、同目录`frozen-contract.json`/`bundle-audit-final.json`/8图；全量`/tmp/mira-assistant-process-final-20261011.MG9Dkw/vitest-full.json`。ReactJS `57e682c9…`、CSS `cdbf01d6…`；main/preload/Vue沿用07:57同一产物。463源码/576产物，291JS/240动态目标/33许可闭合，无过时JS。前轮夹具依赖/私有tmp路径/查找placeholder误作aria-label失败在各原目录保留，不当作产品失败；旧查找测试更新为明确片段参数，未绕过等待定位。许可改编记录后再冻结，产品JS/CSS字节不变；临时脚本、截图和报告只在/tmp，未新增仓库QA文档或测试文件。

剩余/下次入口：继续Header与其他首屏交互差异，子智能体独立时间线仍沿用已有展示，不能混称全局工作过程投影已完成。完整插件非Skill组件、自定义Agent、MCP重连/OAuth待接。无可调用computer-use，本批不代替实体ZCode同态、实体IME、远端模型、Windows/安装包或完整性能验收；整体goal active，未提交/推送。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 07:57 +08:00）

完成：任务摘要采用 ZCode 的六项折叠阈值与三项当前窗口，优先运行项、再未完成项，结尾回补三项；前后分组保留原顺序、真实状态和数量。Radix HoverCard 支持悬浮、焦点/Enter打开、方向键/翻页/Home/End滚动、Escape返回触发按钮。两行标签带完整title，已完成划线；预览随计划快照与任务切换销毁。修复旧高优先级CSS禁止标签收缩的问题。保留原Apache许可与改编说明，文件/变量使用Mira命名。

完成：发现原set_plan归一化静默截断到6步，导致上游长待办交互无法通过真实Agent触发。移除截断，保留模型简洁计划建议、无效项过滤与顺序；不移植TodoWrite协议。12步解析回归先失败后通过，真实Electron验证9步/40步完整保存，9次真实list_files逐步推进并完成9项；第二轮40项仍待办，未伪装完成。

验证：195文件3243项通过；React/Vue类型与React/Electron/Vue生产构建通过，最终CSS修复后重建React。资源审计291JS/240动态目标/33许可/freshCSS/无过时JS通过。最终隐藏生产Electron明暗各7项共14项，真实主进程/preload/Vue/React/SQLite/Agent；每主题13次受控本地模型SSE请求，其余计划/工具/持久化未替换。覆盖当前窗口、前后预览、实际键盘滚动、旧快照销毁、结尾回补、后台完成与切任务返回。生成最终10图，本次逐张复核其中中段/长预览明暗4图；前批10图已逐张复核。无页面或意外网络错误，自有进程/端口均退出。既有npm/CSS/Vue构建警告保留；没有新增仓库QA文档或测试脚本。

证据：`/tmp/mira-summary-todos-final-20261011.VX1Fwb/summary-results-2026-10-10T23-55-49-441Z.json`、同目录`frozen-contract.json`/`bundle-audit-final.json`；全量`/tmp/mira-summary-todos-final-full-20261011.json`。461源码/576产物冻结前后一致；main `c75fb68d…`、React `c6e2f7d3…`、CSS `a1cfc2ab…`，完整身份见contract。早期浅层测试因新组件边界失败已调整断言，真实DOM回归保留；首轮helper误将Escape后的同焦点当成重新focus，修正为Enter重开。失败记录在`/tmp/mira-summary-todos-20261011.AsnfX5`及/tmp原报告，未覆盖旧冻结身份。

剩余/下次入口：继续Header/timeline的首屏差异。通用外部插件来源与非Skill组件、自定义Agent、MCP重连/OAuth仍待接；Goal/workflow不伪造。当前无可调用computer-use；隐藏宿主不替代原生Mira/ZCode同态、实体输入/IME、真实远端模型、Windows安装包或完整性能验收。整体goal active，未提交/推送。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 07:37 +08:00）

完成：按ZCode插件列表/详情/组件分组结构接入固定提交 `683bc88e56f3e09ba94f7055977f3d3aa499f202` 的真实 `anthropic-agent-skills` marketplace。5包均可浏览，claude-api、academy-guide、discernment-nudge可安装；document-skills特殊许可、example-skills中doc-coauthoring缺少包许可明确禁用。公开包与独立Skill分区、已安装条、组件/原文件/逐份许可详情及本地管理接通；没有使用商业CDN或收费资源。

完成：复用现有校验下载器，六路有界并发、Git blob字节/哈希校验、暂存后发布；完整下载声明的Skill目录/深层资源，保留原marketplace、许可/第三方声明并生成Mira适配manifest。独立市场命名空间登记；失败/授权撤销不留半包，移除只删登记，再安装逐文件校验且不覆盖用户改动。标准YAML解析解决实际上游多行描述显示成 `>` 和嵌套元数据覆盖名称，alias展开受限。网络失败经授权桥映射为固定恢复提示，未知异常不外泄路径。

完成：安装中从列表进入详情或切换已安装页仍更新真实登记并释放忙状态，按当前页重读安装结果。真实DOM先复现后修复；未把导航视为下载撤销。工作台草稿保留，公开插件沿用既有@引用/正常权限/首次运行目录冻结，真实Agent可读取实际下载的Skill。

验证：最终195文件3241项、React/Vue类型、React与Electron/Vue生产构建通过；最终React导航修改后重做React类型/构建，Electron/Vue沿用本批已完成的同一构建。资源审计291JS/240动态目标/33许可/freshCSS/无过时JS通过。最终真实隐藏生产Electron/main/preload/Vue/React/Lexical/SQLite/Agent明暗各8项、共16项通过，6张最终图逐张复核。实际HTTPS GitHub请求未替换公开数据；仅模型使用每主题2次受控本地SSE。两种导航只延迟真实安装ACK，非伪造安装结果。启停、重载、移除保文件和再登记均已验证；页面/意外网络错误为空，自有进程/端口退出。既有npm、CSS和Vue构建警告保留。

最终证据：`/tmp/mira-public-plugins-final-20261011.AEJ2fD/plugins-results-2026-10-10T23-35-58-473Z.json`、同目录 `frozen-contract.json` / `bundle-audit-final.json`；全量 `/tmp/mira-public-plugin-final-verified-full-20261011.json`。460源码/576产物冻结前后一致，ReactJS `8fa84f31ec3f455acc150086cdff4b39ed17ec3d9418821c8087b2e01d2a1b7c`、CSS `2cd2b623b5a7b3221b8f3191a25aa44d49e67a7c4a89a3d653f845c275233ad3`；完整main/preload/Vue身份见contract。旧目录 `.926GWL` 的动态import夹具失败/一次网络失败、`.Q5FOLk` 的断言大小写失败与此前通过记录保持独立；它们不是最终身份。全量偶发文件搜索断言已用明确含note的根名重现：绝对路径模糊匹配会返回安全目录，修正测试排序/边界断言，未改搜索生产逻辑。前后解析/桥/导航失败报告留在/tmp，不新增仓库QA文档。

剩余/下次入口：回到Header、timeline、悬浮摘要与Composer的首屏差异核对。本批仅支持固定公开Skill插件包，不等于通用外部来源插件市场，MCP/Agent/命令/Hook等组件执行仍待接；自定义Agent、MCP重连/OAuth待做。当前无可调用computer-use，隐藏宿主不能代替原生Mira/ZCode同态、实体输入/IME、远端模型、Windows安装包或完整性能极限验收。整体goal active，未提交/推送。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 07:07 +08:00）

完成：对照 ZCode 的子智能体 mention 与跨组排序，`/`、`@`、`+` 增加探索/审查/测试/实现四个真实已有角色，使用共享角色/工具事实源和可删除、撤销、恢复的 @role 原子提示。默认选跨组最佳匹配但不重排分类；无项目、计划模式或关闭委派时明确不可用。引用不自动执行、不改权限或委派设置，主 Agent 经既有 delegate_task 按需协作。实际 reviewer 子任务只具备 read/list_files，文件读取与报告回传、持久化和右侧活动页均已验证。

完成：主 Composer 新增 `/side` 本地命令，复用已有 openSideConversation、父子会话与工作区标签。只移除当前命令 token，保留前后正文、已有引用与主草稿，不自动发送。匿名/prepared 草稿和旁路 Composer 不显示嵌套入口；重复操作产生独立标签，父历史按既有 internal 快照继承。没有新增运行器或改变执行权限。

验证：最终195文件3226项、React类型/生产构建和资源许可审计通过。实际隐藏生产 Electron/main/preload/Vue/React/Lexical/SQLite/Agent 明暗各13项、共26项通过；每主题5次受控本地SSE协议请求。覆盖原子删除/撤销、reload、@/+、弱Skill对精确角色的匹配、模式门禁、队列撤回、真实只读委派/报告、侧面板和两条独立旁路。生成12张图，本批逐张复核其中最终旁路/子任务明暗4图；前一轮最佳匹配/子任务明暗4图也已复核。面板初图抓到200ms动画中间帧，等待有限动画结束后明暗实际边界一致：右缘1435/可用宽1440，opacity=1；没有为截图修改产品。无页面错误/外部请求，自有进程与端口退出。

证据：`/tmp/mira-side-command-20261011.WW1hDT/agents-results-2026-10-10T23-05-33-226Z.json`、同目录 `frozen-contract.json` 和 `bundle-audit-final.json`；全量 `/tmp/mira-side-command-full-20261011.json`。459源码/576产物，main `6ac6a01c…`、React `cadae88c…`、CSS `07d70a4a…`；291JS/240动态目标/33许可。最终Electron后仅补改编声明并重建许可副本，审计确认五个主产物SHA完全相同；冻结记录保留声明改动前的身份，不覆盖。角色单独批次3224项/20项证据在 `/tmp/mira-agent-reference-20261011.J7BTv7/agents-results-2026-10-10T22-58-41-192Z.json`。新命令回归先红后绿；临时夹具依赖链接缺失、误认继承历史为空和误用preferences IPC的false报告保留，修正夹具契约后同一产品产物通过。

剩余/下次入口：继续完整公开插件包市场的真实浏览/下载与已安装分类；当前公开市场是Skill下载、本地插件是登记，不混称完整Plugin市场已完成。自定义/插件Agent档位、命令/Hook/MCP组件运行、MCP重连/远程OAuth仍未接；Goal/workflow及云端能力不伪造。当前没有可调用computer-use，隐藏宿主不代替原生Mira/ZCode同态、实体IME/OS、远端模型、Windows/发布或完整性能验收。整体goal active，未提交/推送；临时报告/脚本/截图仅在/tmp。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 06:43 +08:00）

完成：Composer `/` 只列命令与技能，不混入 MCP 服务。`/mcp` 打开独立状态/会话选择面板，显示真实连接中、已连接、失败、未连接及工具数量；兼容旧宿主时明确“状态未知”。刷新只读状态、不连接、不改变选择；运行中允许查看/刷新/进入管理，禁止改当前会话选择。管理入口打开统一 Vue MCP 设置，返回原任务并保留草稿。启用服务在后台连接，不再挡住工作台启动；失败、断连、刷新替换和退出都清理客户端，连接中也可立即关闭，迟到结果不能复活旧工具。设置文案明确“后台连接”与“当前会话选择”是不同操作。

验证：195 个测试文件 / 3218 项、React/Vue 类型检查、React/Electron 生产构建及许可资源审计通过。最新冻结构建的隐藏实际 Electron 明暗各 10 项，共 20 项；8 张截图逐张复核。实际本地 SDK stdio 服务覆盖成功、tools/list 失败、持续连接中与停用不启动；慢服务请求仍悬挂时工作台可编辑，Agent 经真实第一方桥/SQLite/本地 SSE 调用回显工具，取消选择后下一轮无该工具。退出后各主题 3 个 MCP 子进程、Electron 与本地应用端口全部关闭。模型使用隔离本地服务，测试会话为完全访问；未验证实体 ZCode/computer-use、IME、远端模型、Windows、安装包或整体性能极限。

证据：`/tmp/mira-mcp-final-20261011.kdeRP7/mcp-results-2026-10-10T22-41-48-721Z.json`，同目录 `frozen-contract.json`、`bundle-audit-final.json`；全量 `/tmp/mira-mcp-final-full-20261011.json`。457 源码 / 576 产物，main `95101b18…`、React JS `e0e54ec1…`、CSS `07d70a4a…`；291 JS / 240 动态目标 / 33 许可，资源与源码一致。立即关闭在途连接的失败回归 `/tmp/mira-mcp-pending-before-20261011.json` 保留，修复后及全量通过。前一冻结版本明暗各 9 项仍保留在 `/tmp/mira-mcp-status-20261011.KQyEij/`，不充当后台启动改动的证据；该轮最初深色恢复断言过早，等待真实草稿恢复后通过，未改产品绕过。

剩余与下一入口：继续核对首屏命令/子任务入口与悬浮摘要；公开完整 Plugin 包下载、插件非 Skill 组件执行、MCP 主动重连/断连和远程 HTTP/OAuth 尚未接入。当前 `/mcp` 是状态与会话选择，不冒称完整 CLI 控制同态。整体目标 active；本轮未提交/推送，未新增仓库 QA 文档。以下为历史快照。

## 当前完成、剩余与下一入口（2026-10-11 06:26 +08:00）

2026-10-11 06:26 +08:00：本地插件 Skill 切片完成。市场“已安装”可添加已下载插件目录、启停和移除登记；@/+ 优先展示已启用插件并插入原子引用，发送/排队/撤回/草稿恢复保留明确 pluginIds。首次执行冻结会话目录，后续按实时启用状态与原目录交集读取；引用仅提示能力，Agent 经正常权限按需读取 Skill/包内资源，不自动安装、连接 MCP 或注入整篇 Skill。补齐市场交互：公开错误仅显示在公开浏览；已安装技能错误独立反馈，刷新同时更新本地插件与技能、无需外网，启停在途禁止刷新覆盖。194文件/3212项、React/Vue类型、生产构建及许可资源审计通过；最终明暗隐藏Electron各11项、10图复核通过。剩余：公开完整插件包下载、MCP/Agent/命令/Hook组件执行，以及/mcp配置语义和首屏缺口。整体active、未提交/推送；原生computer-use/ZCode同态、实体IME、远端模型、Windows/发布和完整性能仍未验。

验收使用实际生产 main/preload、Vue 授权桥、React/Lexical、Agent 和隔离 SQLite；每主题5次受控 localhost SSE 请求，覆盖插件优先分类/连续查询复用、原子删除撤销、+ 保留正文且不自动发送、标识提示而非整篇指令注入、引导降为下一任务及撤回、真实 Skill/资源工具、组件展示与本地包添加、启停/冻结目录和草稿重载。目录选择结果由测试自有目录控制，公开 Skill 市场刻意离线；这不等于实体系统选择器、公开下载或原生 ZCode 同态通过。10图逐张复核，页面错误为空；没有本批整体性能采样。

最终证据：`/tmp/mira-plugin-inventory-20261011.ksfM5Q/plugins-results-2026-10-10T22-24-46-661Z.json`，同目录`frozen-contract.json`、`bundle-audit-final.json`；全量`/tmp/mira-plugin-inventory-current-full-20261011.json`。冻结456源码/576产物；React JS `58c824eb…`、CSS `26b44720…`，main `84fd921e…`/preload/Vue沿用06:21插件构建，本次只重建React。291JS/240动态目标/33许可/freshCSS/无过时JS。新增DOM回归3项在06:21旧冻结源码全部复现失败（`/tmp/mira-plugin-final-20261011.lhSXLW/inventory-before.json`），当前通过；最后Electron额外验证真实登记变化后刷新、不重试公开请求及错误隔离。两主题所有测试自有进程退出、端口关闭。原Apache LICENSE/NOTICE保留，登记移除不删插件包及许可；helper/报告/图片仅放/tmp，未新增仓库QA文档。

06:21前一切片193/3209、20项、10图的最终报告仍在`/tmp/mira-plugin-final-20261011.lhSXLW/`保留原身份；最新UI检查为以上06:26构建，不混用旧JS。

失败证据保持原身份：06:17旧冻结构建的20项通过报告留在 `/tmp/mira-plugin-reference-20261011.2r4fZW/`，不充当最新公开会话投影的验证；此前启动依赖、全量替换query、Electron evaluate参数顺序及最初同步IPC await问题已分别纠正。最新完整回归发现持久会话含内部pluginCatalog而公开投影已剥离，更新断言分别验证持久化与公开内容，最终193/3209通过，未隐藏原失败报告。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 05:50 +08:00）

2026-10-11 05:50 +08:00：`#` 已扩展为同一Mira本地Controller内的跨项目对话候选，当前项目优先、更新时间排序、项目名可搜索、每项目过滤后最多20项；`@` 仍限当前项目。引用读取真实公开正文，原子删除/撤销及owner/目录/revision保护保持，发送不切任务。技能/MCP独立分类按需加载，`$`/技能分类不读MCP，MCP分类重试不读技能，`#`不读文件或能力目录。最终192文件3188项、React类型/生产构建与资源许可审计通过；实际隐藏生产Electron明暗各11项，共22项通过，每主题5次受控本地SSE协议请求，真实跨项目正文恰好发送一次，10图逐张复核。下一入口：对照ZCode继续完善 `@`/`+` 的插件分类、已安装插件引用和MCP配置语义；当前市场是实际Skill包市场，MCP仍属会话配置，未声称完整Plugin manifest/runtime已实现。整体active、未提交/推送；原生computer-use同态、实体IME、远端模型和完整性能尚未验。

证据：`/tmp/mira-composer-catalogs-20261011.CpUeJ8/skills-results-2026-10-10T21-48-01-447Z.json`，同目录 `vitest-full.json`、`bundle-audit-final.json`、`frozen-contract.json`。452源码/576产物冻结；React JS `6803f992…`、CSS `4ad3d8a9…`，main/preload/Vue与05:30里程碑同一产物，未为本批重复构建Electron。291JS/240动态目标/33许可/freshCSS/无过时JS审计通过；页面错误及受限外部请求为空，自有进程/端口退出。本批只确认减少无关目录请求，不据此推断整体延迟或性能已无优化空间。

跨项目扩展前后回归保持：其他项目只由同一本地Controller索引，不引入远端Host；搜索之后再限20项，不因默认预览截掉可搜索旧记录；排序不改侧栏原数组。旧任务读取过程中换项目或编辑会丢弃迟到结果，引用正文内的Skill文字不作为授权。

过程证据分别保留：`/tmp/mira-cross-project-mentions-20261011.VRLYWL/skills-results-2026-10-10T21-45-31-863Z.json`（192/3186，20项，目录分载前）；此前21:44 false报告是runner在异步读取完成前继续输入，产品按revision保护保留了新草稿，且runner未解码模型text数组。最终等待真实chip/焦点并读取真实协议文本；没有改产品以绕过保护，没有覆盖旧报告。技能分类的无关MCP请求和MCP重试无关技能请求先由失败回归复现，再拆开目录加载生命周期修复。

摘要定位核对结论延续05:42记录：ZCode也采用窄分屏悬浮覆盖；保持已确认结构，未把状态移入header。以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 05:42 +08:00）

2026-10-11 05:42 +08:00：新增 `#` 对话引用独立入口与 `+` 面板底部切换，使用既有真实对话读取/草稿归属校验和可删除原子标签，不自动发送；本批限定当前项目，跨项目候选尚待对齐。`#` 不读取文件、Skill 或 MCP 目录。最终192文件3183项、React/Vue类型、React生产构建与资源许可审计通过；实际隐藏生产Electron明暗各8项，共16项通过，8张图逐张复核。main/preload/Vue沿用技能里程碑的同一产物；每主题4次受控本地SSE请求。补查ZCode源码确认窄分屏摘要也采用悬浮覆盖，不再将截图遮挡直接认定为Mira独有缺陷。下一入口：核对 `#` 跨本地项目范围、`@`/`+` 分类与插件/MCP语义。整体active、未提交/推送；原生computer-use同态、实体IME、远端模型和完整性能尚未验。

证据：`/tmp/mira-conversation-mentions-20261011.oD5ZOJ/skills-results-2026-10-10T21-38-25-418Z.json`，同目录 `vitest-full.json`、`bundle-audit-final.json`、`frozen-contract.json`。452源码/576产物冻结，React JS `766fe2ec…`，CSS/main/preload/Vue与05:30里程碑一致；页面错误为空，自有进程/端口退出。前3次失败原报告保留：footer可访问名称包含空格、Escape后同token按设计保持关闭、DOM click绕过mousedown及受控编辑尚未稳定。最终使用真实Playwright指针click并等编辑更新帧，不强制选择、不注入产品结果，未为runner差异改动产品代码。

摘要核对来源：ZCode `ConversationStatusPanel.tsx` 的absolute top-0/right16悬浮容器与 `conversationLayout.ts` 的1280宽屏定位；Mira保持已确认悬浮结构，不把状态移入header。以下05:30及更早记录为历史快照，摘要遮挡观察不再作为已确认缺陷。

## 当前完成、剩余与下一入口（2026-10-11 05:30 +08:00）

完成：技能选择从会话配置开关改为本次消息的原子引用。`$`、`/` 与分类面板使用同一短标签/稳定目录身份；可删除、撤销和恢复，主/旁路隔离。第一方桥白名单传递skillIds，队列和重试fingerprint冻结；明确停用在接纳前拒绝并保稿。引用对话内的技能文字不自动激活，撤回恢复只重建原提交身份。实际Agent只在本次执行注入，运行中新技能引导降为下一条任务，后续普通消息不继承；旧会话选择兼容保留。运行中的/perm与权限按钮一致可用。计划模式继续沿用现有不注入技能的策略。

验证：全量 **192文件/3181项**、React/Vue类型、React/Electron生产构建、资源许可审计及diff检查通过。真实隐藏Electron明暗各7项、共 **14项**通过，使用真实main/preload/Vue/授权桥/SQLite/React/Lexical/Agent，每主题4次受控本地OpenAI-compatible SSE请求。覆盖键盘选择/Escape/删除撤销、主旁路隔离、运行中权限入口、冻结排队和真实技能system/developer提示词、普通后续无继承、停用拒绝后新身份重发，以及双草稿SQLite重载。6图逐张复核，自有进程/端口退出，页面及受限外部请求错误为空。

证据：`/tmp/mira-skill-intent-20261011.GH20h4/skills-results-2026-10-10T21-29-07-230Z.json`，同目录`vitest-full.json`、`bundle-audit-final.json`与`frozen-contract.json`。452源码/576产物冻结；JS `395e85d9…`、CSS `4ad3d8a9…`、main `6fc08795…`，preload保持；291JS/240动态目标/33许可/freshCSS/无过时JS通过。代码未在截图验收后继续修改，文档随后更新。新helper/report/图只放/tmp，未新增仓库QA文档。

剩余/下次入口：继续核对Composer的+/@/命令与MCP目录交互、插件/对话引用分类。截图还可见主/旁路分屏时浮动摘要遮住正文，应结合ZCode的定位/留白核对，不计入本批修复。当前无可调用computer-use；隐藏实际Electron不代替原生Mira/ZCode同态、实体输入/IME、远端模型、Windows/安装包或完整性能。无本批新性能结论；整体goal active、未提交/推送。

以下为历史记录。


## 当前完成、剩余与下一入口（2026-10-11 05:15 +08:00）

完成：权限按主/旁路所属草稿保存并随下一条消息提交，运行中选择不立即修改会话、不锁输入；匿名准备和队列撤回保留所选档位。第一方桥白名单传递 `permissionMode`，新接纳校验设置策略，队列与重试 fingerprint 冻结明确权限。未知 ACK/重载保持原权限与 ID；明确禁用返回 `permission-mode-disabled`，保留正文且允许换档重发。实际执行时权限与用户消息同一次保存；引导权限不一致时降为待发送。旧直接运行仍动态读取全局工具策略，全局收紧仍触发审批。

验证：最终全量 **192文件/3167项**、React/Vue类型、React/Electron生产构建与资源许可审计通过。包括实际 Agent/SQLite 写工具的明确 full/default 两种策略回归。实际隐藏生产 Electron 明暗各7项、共 **14项**通过，使用真实 main/preload/Vue/授权桥/SQLite/React/Lexical/Agent 和受控本地 OpenAI-compatible SSE，不替换产品返回。每主题3次真实模型协议请求，核查运行中编辑、排队冻结、明确禁用后保稿重发、换任务以及双草稿/权限SQLite重载；最终4图逐张复核。自有进程与端口退出，页面及受限外部请求错误为空，无本批性能采样；既有构建/CSP警告保持。

证据：`/tmp/mira-permission-intent-20261011.G3w3sV/intent-results-2026-10-10T21-13-16-151Z.json`，同目录`vitest-final.json`、`bundle-audit.json`、`frozen-contract.json`。451源码/576产物冻结；JS `1668d5b8a99e088c1aede1bcce617da64c7cdccad4212e0b0e97a56d1a2b914f`、CSS `71c727bd7414f239e6a7aa4821b9b5db74dcd375070336bda2b8b35278c4e8f2`、main `fe50580afa2c404b845b0b2c2c0108cf63453abf955bd8eda5fb323d086f9ebd`；preload保持，Vue本批重建。291JS/240动态目标/33许可/freshCSS/无过时JS通过。验收后补日期改编说明及发布目录许可副本，最终许可审计和身份变化见`bundle-audit-final.json` / `current-identity.json`；运行源码与JS/CSS/main/preload/Vue保持验收身份，不改写冻结快照。早期测试旧契约/匿名夹具选错RadioGroup、旧直接入口动态策略回归以及helper缺依赖/runner误将developer提示词当system的失败均保留原报告；真实策略回归已修复，不合并早期失败为一次成功。

剩余/下次入口：核对 Composer 的 `+`、`@`、`/`、Skill/MCP 选择与当前任务上下文；本批只完成权限提交链路，未宣称其余能力都已改成草稿。整体goal active、未提交/推送。当前没有可调用computer-use；隐藏真实Electron与受控模型协议不代替原生Mira/ZCode同态、实体IME/OS输入、远端模型、Windows/安装包或完整性能。所有新helper/report/图仅在/tmp，不新增仓库QA文档。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 04:55 +08:00）

完成：权限/计划沿用 ZCode 的独立计划勾选、三档权限单选和说明文字，最小52px行/12px间距/18px图标/右侧标记。权限、推理和项目菜单使用 Mira 自有焦点 hook，关闭只回所属 Lexical；外部交互、设置导航、隐藏和任务切换不抢焦点，IME组合/229不误选或关闭。真实 Electron 复现保存ACK后 Lexical DOM仍暂为只读、关闭移除聚焦项，以及外部已聚焦后才执行的 Radix关闭回调；分别保留回归，延至编辑器DOM更新帧后恢复，并在关闭回调和该帧重查归属/外部焦点。

验证：最终全量 **192文件/3147项**通过，定向3文件152项（包含13项焦点生命周期回归）、React类型/生产构建/资源许可审计与diff检查通过。真实隐藏生产 Electron 明暗各9项、共 **18项**通过；真实main/preload/Vue/授权桥/SQLite/React/Lexical，仅延迟真实权限保存返回，不替换产品结果。主/旁路独立配置和双草稿、计划与权限独立、IME事件、正常选择、保存后所属焦点、保存中外部交互/隐藏/换任务及真实SQLite偏好均已核查。最终4图逐张复核；侧面板图等实际开合动画结束后捕获，避免把中途固定内容宽度/滚动当作稳定页面。自有进程和端口退出，页面/受控外部请求错误为空；既有Electron CSP/npm/CSS警告保留。没有本批实体IME、远端模型或性能采样。

证据：`/tmp/mira-composer-menus-acceptance-20261011.8cl6MS/menus-results-2026-10-10T20-54-24-890Z.json`，同目录`vitest-final.json`、`bundle-audit.json`、`frozen-contract.json`。451源码/576产物冻结身份；JS `c8f1af56437dceaca61e6cbe175761176a41ce6026310a7aaa2846d3595a7a42`、CSS `71c727bd7414f239e6a7aa4821b9b5db74dcd375070336bda2b8b35278c4e8f2`，main/preload/Vue沿用既有身份，本批未改/重建Electron/Vue。291JS/240动态目标/33许可/freshCSS/无过时JS通过。早期真实焦点失败和补测中的rAF测试夹具时序失败保留各自release/final/verified临时目录；本目录初次导航失败因在旧保存ACK前试图输入，产品仍暂锁，最终改为ACK后检查新任务输入与外部焦点，未冒称ACK前可编辑。20:52通过记录18项与20:53诊断属于同一产品、不同runner身份；最终20:54报告补等待开合动画，不将早期截图当作最终画面。

当前身份复核：同目录`current-identity.json`确认451源码/576产物中，只有验收后补日期与验证说明的`third-party-licenses/zcode/ADAPTATIONS.md`改变；运行源码及全部产物仍匹配冻结记录，不修改旧快照或合并失败记录。

剩余/下次入口：源码已确认 ZCode `useDraftConfigControl.handleDraftSwitchMode` 只更改下一次Submission的权限intent；Mira仍通过`selectPermission → session.set-permission`立即存会话，运行中禁止修改且保存期间（包括切任务后）输入暂锁。下一步让权限按主/旁路所属草稿保存，提交时经第一方桥传给Electron并在接纳/入队时冻结；审计重试fingerprint、队列恢复/引导兼容和失败保稿，保持统一设置策略约束、计划独立。整体goal active，尚未完整对齐。当前无可调用computer-use，隐藏宿主不代替原生Mira/ZCode同态、实体输入、真实模型、Windows/安装包或完整性能；未提交/推送，临时脚本/报告/图仅在/tmp，不新增仓库QA文档。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 04:29 +08:00）

完成：原平铺模型列表改为 ZCode 的供应商→模型两级菜单，沿用现有 Radix/视觉 token 与 Mira controller，新增独立 MiraModelMenu 组件。保留跨供应商搜索、当前供应商/模型标记、配置能力图标和固定管理入口；32px 行，长子菜单在可用空间内滚动。搜索上下键进入菜单、左右键进入/退回子菜单、Enter 选择、Escape 关闭整组并回所属 Lexical；点击外部或跳转设置不抢焦点，重开清空搜索。IME 组合与229事件在搜索和菜单行均不会误选或关闭。供应商/模型二元组区分含冒号身份。模型和推理档位沿用真实下一次提交/会话偏好；浮层按钮上的 CtrlM/CtrlShiftM 不触发后台 Composer。

验证：新增真实 Radix DOM 回归先复现后修复 IME 误选，最终全量 **191 文件 / 3130 项**通过；React 类型/生产构建/资源与许可审计通过。实际隐藏生产 Electron 明暗各9项、共 **18 项**通过；真实 main/preload/Vue/第一方桥/SQLite/React/Lexical，不替换产品返回。检查两级键盘选择、配置图标、禁用模型、无结果、IME事件、草稿/焦点、搜索重开、CtrlT和权限快捷键；SQLite实际存储所选供应商/模型/推理档位。长菜单25模型、32px行/288px高、可用宽度内滚动，4张最终图逐张复核。页面/外部请求错误为空，自有进程和端口退出；保留既有未打包 Electron CSP warning 和 npm/CSS warning。没有实体 IME 或远端模型发送验收，本批没有性能采样。

最终证据：`/tmp/mira-model-menu-final-20261011.lY6NQ6/models-results-2026-10-10T20-28-08-758Z.json`、同目录 `vitest-final.json`、`bundle-audit.json`、`frozen-contract.json`。450源码/576产物冻结身份；JS `2840abddae8aed808bceccb9f52ec596070c5bd2999064ded10c5046593af23d`、CSS `5d3b2592d1e3cc1df9b3dd2df3d67d5443504ea2c389f53e493157d5a48d7a6b`；main/preload/Vue沿用04:13身份，本批未改/重建Electron/Vue。291JS/240动态目标/33许可/freshCSS/无过时JS。前置 runner 的依赖链接缺失、未等待 Radix 延迟焦点和误设推理默认档位已修正，旧失败报告保持在 release 临时目录；最终首次全量中的2条错误 Escape 层级断言按 Radix 实际契约改为 ArrowLeft退一级/Escape关整组，`vitest-full.json`失败报告保持，最终通过为`vitest-final.json`。这些是不同证据身份，不合并成一次成功。

剩余/下次入口：继续权限、推理菜单的外部关闭/旁路焦点与计划、权限独立性，再核其余首屏入口。本批没有可调用 computer-use，隐藏宿主不代替原生 Mira/ZCode 同态、实体输入、远端模型、Windows/安装包或完整性能验收。整体 goal active，未提交/推送；临时脚本/报告/截图仅在 /tmp，不新增仓库 QA 文档。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 04:13 +08:00）

完成：复现并修复 Git 分支菜单在 IME 组合期间按 Tab 意外切分支，以及终端迟到连接抢走非模态浮窗按钮焦点的问题。分支菜单通过所属 Composer 的 Lexical handle 返回焦点，取消旧的全页面 textarea 查找；摘要入口回自己的按钮，外部已取得焦点不抢回。普通 Tab 仍切换分支。现有子任务主动停止已正确结算为 stopped，复核现有回归通过，修正交互规格中的过期待办。

验证：新增真实 DOM 回归先红后绿；最终全量 **190 文件 / 3117 项**、React 类型/生产构建与资源许可审计通过。实际隐藏生产 Electron 明暗各7项、共 **14 项**通过，使用真实 Git、授权桥、Lexical 与 PTY；只延迟真实 terminal.open 的返回，不替换结果。检查 IME Tab 不触发 git.checkout、普通 Tab 真实切换、Escape/外部焦点、浮窗按钮在迟到 PTY 返回后保持焦点、重开面板恢复终端焦点及 owner-bound close。两张最终图逐张复核；页面/外部请求错误为空、自有 Electron 进程/端口退出。保留未打包 Electron 的既有 CSP warning，以及 npm/CSS 构建警告。

证据：`/tmp/mira-popup-focus-release-20261011.oOppVM/focus-results-2026-10-10T20-12-20-768Z.json`，同目录 `vitest-full.json`、`bundle-audit.json`、`frozen-contract.json`。449源码/576产物冻结前后一致；JS `b3632638c5c2b4a3b69110343048f88ff0480c29dd04fa3b7cf6a8a0f8e0781e`、CSS `439f8bbf…`，main/preload/Vue沿用03:58身份。本批未改或重建 Electron/Vue。两次早期 runner 失败分别为未等待分支刷新可操作、收栏渲染完成前再次切栏；修正等待后同一产品产物通过，旧失败报告保留。

启动调查：04:02测量属于改动前 `5c612874…`，三次独立非 trace 实例的首屏输入就绪中位184.5ms、长会话首开73.1ms、Lexical输入30.15ms；初始 buffered longTasks 均为空。独立原生启动 trace 最大首屏 FunctionCall 39.951ms、module evaluation 23.722ms，首次 Radix 样式读取包含布局；没有证据认定终端是主要瓶颈，未进行猜测性拆包。原始数据在 `/tmp/mira-startup-profile-20261011.flaSIC`，完整方法见性能记录；不把这些样本当作最终 `b3632638…` 的重测。

剩余与下次入口：继续 Composer 模型、推理强度、权限菜单的键盘/焦点与 ZCode 交互核对，再补其余首屏入口。无可调用 computer-use，隐藏宿主不代替原生 Mira/ZCode 同态、实体 IME/OS输入、远端模型、Windows/安装包或完整性能验收。整体 goal active，未提交/推送；临时脚本/报告/图仅在 `/tmp`，不新增仓库 QA 文档。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 03:58 +08:00）

完成：03:54的标签概览交互保持；进一步实际复现 macOS Cmd+N/Cmd+K 在非模态 Radix Popover 搜索中触发后台命令。会话全局快捷键和历史导航现按事件目标让给普通 dialog/Popover，仍保留任务内查找和正常 Composer 的全局入口。输入法提交Enter不激活搜索结果。未扩展快捷键配置系统，不改变主对话/终端协议。

最终验证：全量 **189 文件 / 3111 项**、React 类型/生产构建及资源许可审计通过。`/tmp/mira-overview-shortcuts-release-20261011.lYDfEL/workspace-overview-2026-10-10T19-57-00-051Z.json` 明暗各9项、共 **18 项**实际隐藏生产Electron检查通过；新增真实Cmd/Ctrl新建、搜索、侧栏及Cmd+[历史导航的浮层归属，确认不新建会话、不打开另一个搜索、不切任务。原搜索/关闭/恢复/guest遮挡/SQLite重载检查也在最终构建重测，最终四图逐张复核。自有进程/端口退出，页面/console/受控外部请求错误为空。

身份：449源码/576产物冻结前后一致，JS `5c612874de23aa9de9882e2a338a47462c3933d9f2419d93636ac8e723f594d1`、CSS仍为 `439f8bbf…`，main/preload/Vue沿用03:41身份；完整SHA、全量与审计见同目录 `frozen-contract.json` / `vitest-full.json` / `bundle-audit.json`。没有修改或重建Electron/Vue、没有新性能样本；291 JS/240动态目标/33许可/fresh CSS通过，既有构建警告保留。此前03:51的16项与3108项属于上一身份，不覆盖最终构建；临时夹具准备先于snapshot结束造成的启动失败已顺序等待后重试，不改写旧冻结记录。

下一入口：对齐后的首屏代码继续核查剩余功能，并按既有独立trace方法定位初始加载的长任务；先测实际瓶颈，再做性能改动。原生Mira/ZCode同态、实体OS/IME/剪贴板、远端模型、Windows/安装包和完整性能仍待验。当前无可调用computer-use，整体goal active；未提交/推送，所有临时runner/report在`/tmp`。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 03:54 +08:00）

完成：按 ZCode `SidePaneTabOverview.tsx` 及搜索/展示工具，将资源标签概览换为已有 Radix Popover + cmdk：288px 浮层、固定搜索框、有界 320px 列表、打开/最近关闭分组；标题/类型/路径/URL 多词搜索和稳定排序，就地关闭、恢复、当前项提示、相对时间、空结果与键盘操作已接。Command value 使用完整资源 ID，同名页面不混选；关闭不激活后台标签、不退出搜索，键盘关闭后回搜索，迟到关闭不抢新草稿焦点；Escape 回概览入口。时间由真实打开/关闭记录，旧数据留空，恢复更新时间，不把关闭时间带回打开标签。原浏览器/终端/旁路/子任务归属和资源生命周期保持。

验证：最终全量 **189 文件 / 3108 项**、React 类型、React 生产构建和资源/许可审计通过。实际隐藏生产 Electron 明暗各 8 项、共 **16 项**通过，覆盖真实同名网页搜索/键盘选择、就地关闭释放指定 guest、新身份恢复、浮层隐藏 guest、320px 滚动列表、空结果/外部草稿焦点，以及 Vue/React 重载后 SQLite 最近关闭记录和时间保持。四张最终明暗概览/最近关闭图逐张查看；上一批网页引用四图也已补查。

证据：`/tmp/mira-workspace-overview-final-20261011.6xh58U/workspace-overview-2026-10-10T19-51-21-333Z.json`；同目录 `vitest-full.json`、`bundle-audit.json`、`frozen-contract.json`。449 源码 / 576 产物冻结前后一致，291 JS / 240 动态目标 / 33 许可 / fresh CSS 通过；JS `f8dda653efcc351befe6bf8f0471a6340d2a26eb58b0939ba2df9818614807b2`，CSS `439f8bbfb298b6634226cd8d349599e7e07aeebbaa6b7047a2f547888f53b6be`。main/preload/Vue 沿用03:41已验证产物，本批没有修改或重建它们，不重复声称 Vue 类型/Electron 构建新验证。自有进程与端口全部退出，页面/console/外部请求错误为空。早期 runner 错用 cmdk 输入框的可访问名称；实际核对后使 Command label 与“搜索标签页”一致并重新构建冻结。时间新增使旧精确对象断言失效，更新为真实生命周期契约；早期失败报告保持。

剩余与下一入口：继续首屏弹层打开时的快捷键/焦点归属，避免标签概览或分支 Popover 未标注 aria-modal 导致后台新建/导航；然后继续已定位性能热点和可执行首屏对照。当前没有可调用 computer-use；本批不等于原生 ZCode 同态、实体 OS/IME/剪贴板、远端模型、Windows/安装包或完整性能验收。整体 active，未提交/推送；临时 runner/report 仅在 `/tmp`，不新增仓库 QA 文档。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 03:41 +08:00）

完成：参照 ZCode `browserTabResidencyPolicy.ts` / `browserTabResidencyCoordinator.ts` / `browserGuestManager.ts`，同一工作台窗口跨任务累计最多 32 个逻辑浏览器标签，空白标签也计数；超过上限时按最近活动、选择、打开顺序关闭不受保护的后台标签。保护当前可见标签、加载、媒体、真实下载/捕获和 viewport/元素选择操作；全部受保护时暂时超限，保护结束后重试，32 个以内没有轮询。先成功保存标签删除及最近关闭，再复核选择/活动/native 保护后释放页面；复核失败或状态变化恢复存储，保存失败保留页面。并发文件修改与用户选择不丢失，删除任务清理工作区记录，晚到 hydration 不复活已删任务。最近关闭按既有协议恢复新资源/guest。修复 32 个标签下概览无限长导致最近关闭不可达：限定 420px/可用空间、滚动与 overscroll containment。

验证：最终全量 **188 文件 / 3099 项**、React/Vue 类型、React/Electron 生产构建及资源许可审计通过。最终证据目录 `/tmp/mira-browser-residency-release-20261011.Z8rXE1`：`browser-residency-2026-10-10T19-39-50-026Z.json` 明暗各 8 项共 **16 项**专项通过，实际 UI 创建 32/33 标签、真实 DownloadItem、先写 SQLite 再 guest destroyed、新身份恢复、跨任务总量、Vue/React 重载均覆盖；`browser-contexts-2026-10-10T19-40-14-905Z.json` 明暗各 11 项共 **22 项**网页引用回归通过。驻留复开/重载明暗 4 图逐张复核；网页引用 4 图另查。没有将 32 个逻辑标签当成 32 个真实 guest 压测。

诊断与边界：早期临时依赖链接缺失保留失败报告；微小下载响应没有达到 Chromium 的 sniffing 阈值，改为 128KiB 分段响应后真实下载启动，最终用 guest `downloadURL`，不声称网页鼠标下载验收。Playwright 自身 `Emulation.setFocusEmulationEnabled(true)` 会增加 capturer count，独立非 Playwright Electron 复现 false→true→false；最终仅在其原始 CDP session 撤销这个工具 override，未修改产品保护返回值。历史点击/捕获失败保留，产品没有忽略真实 `isBeingCaptured`。首次概览溢出是真缺陷已修；换任务后工作区按现有语义收起，夹具改为实际重新展开。媒体/捕获并发主要由单测覆盖，尚无完整真实播放/录制矩阵。

身份：447 源码 / 576 产物冻结前后匹配；JS `b6a7c937e9497dfdf182d01287f1f42d1560c750dc9a3b04ea8b19c3b696f7b3`、CSS `d4df39ea853a048c685f643f3099041dea6b894572a7be9b433d8feb2d00c626`、main `49608512…`、Vue HTML `7f539957…`；完整 SHA 见 `frozen-contract.json`。291 JS / 240 动态目标 / 33 许可与 fresh CSS 审计通过；自有进程/端口退出，页面/受控外部请求错误为空，原有构建警告保留。所有临时 runner/report 位于 `/tmp`，未新增仓库 QA 文档。

剩余与下次入口：资源标签概览继续参照 ZCode `SidePaneTabOverview.tsx`，补完整搜索、类型/路径提示与概览就地关闭交互，再回首屏未验状态和性能热点；这批不重做文件支线。当前无可调用 computer-use，不代替原生 Mira/ZCode 同态、实体 OS 输入/剪贴板、远端模型、Windows/正式包或完整性能验收。整体 active，未提交/推送。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 03:07 +08:00）

完成：参考 ZCode `ContextAttachmentPill.tsx` / `WebElementContextAttachmentChip.tsx`，网页元素从 Lexical 正文转为 32px 聚合胶囊及 320px / 12px 圆角 HoverCard；长标题截断、标签/来源信息、单项/全部删除、ArrowDown/Esc 和最后删除后的编辑器焦点返回已接通。已发送用户消息复用右对齐只读胶囊。沿用 canonical document 和现有偏好存储，保留正文、行内文件及会话引用；旧纯文本快照草稿、trim 后纯网页消息可恢复，重复快照不重复添加。详情展开隐藏原生 guest，收起恢复。

发送修复：真实受控模型请求暴露普通文本同时进入初始 history 和 prompt，导致当前消息重复、文件内容只在其中一份。现取完整当前模型输入移出 history，再 prompt 一次，保留文本附件和真实图片块。新增普通连续发送、网页/文件发送、重跑及编辑重跑回归；纯文件请求不再额外发送文件名占位。SQLite 用户原文和附件保存语义保留。

验证：最终全量 **186 文件 / 3074 项**通过，`/tmp/mira-web-contexts-verified-20261011.qlnLdd/vitest-full.json`；React/Vue 类型、Electron 生产构建、React fresh JS/CSS 和许可审计、diff 检查通过。React 产物与前次胶囊构建字节一致，资源审计为 291 JS / 240 动态目标 / 33 许可。原构建警告仍在，未重测独立严格 Electron 类型或性能。

实际宿主：同目录 `browser-contexts-2026-10-10T19-05-55-126Z.json`，明暗各 11 项、共 **22 项专项检查**通过：真实双元素选择/去重、详情/guest 遮挡、删除/焦点、正文和文件保留、任务切换、Vue/React 重载恢复、真实 grant/IPC/Agent→localhost 模型及 SQLite、完整网页快照只发送一次、发送后只读详情和草稿清理。四张最终明暗 Composer/已发送详情图逐张复核。此次不把上批 160 项宿主回归算作新胶囊版本的重测。自有进程/宿主与模型端口全部退出，页面/console/服务器/受控外部请求错误为空。

身份：445 源码 / 576 产物冻结前后匹配；React JS `f8bf074a81a20a4bce301739003d1b2d4200034df5be6375aa8222797e5a07a3`、CSS `d2c4174679b26520d20d011d421ca7338e781f648dc9ed007130771ba974b704`、main `4b2bac83fd9849c5508d07012d3becc9f2c1e9cf2cb030e6a6820e6403297ed0`。完整身份和 runner hash 在同目录 `frozen-contract.json` 与运行报告，Apache 原 LICENSE/NOTICE 保持，改编声明已同步。临时夹具和证据仅在 `/tmp`，未新增仓库 QA 文档。

失败记录：旧 `mira-browser-contexts*` 和本目录 19:04/19:05 false 报告保留。最后一次选取时，隐藏 CDP 指针跨 iframe 后不一定产生新的 pointermove；另一次原生 guest 仍为过渡宽 3px，而 DOM 已 520px，导致坐标换算错误。最终 runner 在同 iframe 先实际移开鼠标，等待原生 innerWidth/innerHeight 与实际画布一致，再移动/点击并断言选区；未强制点击、注入结果或改产品几何。此前清空引用后焦点被版本更新取消的真实问题已修复。首次发送检查也实际复现上述模型重复输入，修复后重新构建/冻结及全量验收，没有改写旧失败。

剩余与下次入口：浏览器驻留策略，从 Vue `MiraHostedBrowsers` 和 ZCode `browserTabResidencyPolicy.ts` 核对容量、可见/加载/执行中保护及关闭恢复语义，再实现；然后回到剩余首屏菜单/状态与已定位性能热点。当前无可调用 computer-use，隐藏宿主不代替 Mira/ZCode 原生同态、实体 OS 输入/剪贴板、远端模型、Windows/正式包或完整性能验收。整体 active，分支 `codex/mira-harness-first-slice`，保留既有 dirty 修改，未提交/推送。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 02:30 +08:00）

完成：浏览器工具栏接入选择/取消元素、Esc、蓝色网页高亮和 ZCode 尺寸/颜色/字体属性浮层。点击读取实际目标，拦截网页原动作；快照包含 URL、标题、选择器、XPath、正文、附近内容、HTML、属性、位置及样式，通过固定授权操作进入当前主任务的 Composer 原子引用。保留原草稿、去重、限量、保存和提交；引用可随编辑删除。导航/隐藏/关闭/切换任务取消选择，run 和资源身份丢弃迟到结果，取消恢复原光标并移除监听。Vue 解析真实 guest 并覆盖目标，主进程保留 grant/主 frame/session/embedder 校验；没有向 React 开放任意脚本。快照移除表单值、textarea 正文、脚本和事件属性，所有跨页面字段限长验证。

验证：最终全量 **186 文件 / 3063 项**、React/Vue 类型、React/Electron 生产构建及资源许可审计通过。最终隔离真实宿主报告 `/tmp/mira-browser-picker-release-20261011.l7SS1V/terminal-browser-2026-10-10T18-29-54-463Z.json`：明暗各 80 项，共 **160 项**通过，包括 50% 原生缩放下的悬停选区/点击、原网页动作不执行、SQLite 原子引用、重复选择、guest/工具栏 Esc、Radix 遮挡取消、删除及既有主旁/PTY/浏览器生命周期回归。最终明暗属性浮层两图逐张复核；前轮引用明暗两图已复核，未逐张审核全部 68 图。早一轮 `fHbaPP` 的 160 项属于浮层视觉补齐前证据，最终以 `l7SS1V` 为准。

身份与收尾：444 源码 / 576 产物冻结前后匹配，React JS `7d259616e1946a840c55f0f1b7d45d0e264da8b9086a99956bd32032a6dbb8bd`、CSS `ab2d9006925e624cadea064f744db81a5cb84668b4be4c82744912c6b620662f`、main `e115cc48…`、Vue HTML `edee1bb2…`，完整 SHA 见该目录 `frozen-contract.json`。291 JS / 240 动态目标 / 33 许可 / fresh CSS 审计通过；自有进程和端口全部退出，无页面、模型或受控外部请求错误。未操作用户桌面、ZCode 草稿或系统剪贴板，临时脚本/报告仅在 `/tmp`。

剩余与下次入口：Composer 网页引用当前仍是行内原子标签；下一步对齐 ZCode `ContextAttachmentPill.tsx` / `WebElementContextAttachmentChip.tsx` 的聚合附件胶囊、HoverCard 详情和单项/全部删除，保留现有草稿归属与提交可靠性。随后处理浏览器 residency、其余首屏功能和已定位性能热点。当前无可调用 computer-use，隐藏宿主不替代原生 Mira/ZCode 同态、实体 OS 输入/剪贴板、远端模型、Windows/正式包或完整性能验收；本批未重测性能。整体 active，分支 `codex/mira-harness-first-slice`，保留既有 dirty 修改，未提交/推送。

以下为历史记录。

## 当前完成、剩余与下一入口（2026-10-11 02:13 +08:00）

完成：按 ZCode 源码接入浏览器自由尺寸入口、32px 尺寸/缩放栏、393×852 默认 viewport、适应及 50–200% 预览、四边/四角拖拽与键盘调整。宽 320–3840、高 320–2160；Enter/失焦提交，非法草稿保留并提示，Escape 恢复。Vue Shell 固定容器托管同一 guest，主进程校验 grant/主 frame/session/embedder 后串行设置真实 CDP viewport；React 仅提交尺寸与显示比例。模式切换保留页面、历史及表单状态，超出画布的原生网页裁剪，应用 zoom 补偿独立。偏好先读取再打开网页，尺寸 200ms 合并保存，模式/比例立即保存；应用导航等待在途写入，失败可重试且旧失败不回滚新值。修复 webview `display:block` 导致内部原生画面仅 150px 高度的问题，恢复 Electron 所需 flex 布局。

验证：最终 185 文件 / 3053 项全量、React/Vue 类型、生产 React/Electron 构建与 diff 检查通过；291 JS / 240 动态目标 / 33 许可及 fresh CSS 审计通过。全部临时证据位于 `/tmp/mira-browser-viewport-release-20261011.eTlpFa`，全量为 `vitest-full.json`，运行报告为 `terminal-browser-2026-10-10T18-12-11-880Z.json`。实际隐藏生产 Electron 明暗各 74 项 / 共 148 项通过，覆盖真实尺寸、尺寸输入、50% 点击、比例换算的鼠标拖拽/键盘调整、应用 125%/75%/100% 下的 800×600 网页与真实宿主鼠标点击、滚动画布裁剪、同 guest 状态和 SQLite 偏好，以及原有主/旁对话、审批、终端、独立浏览器/历史/图标/关闭恢复回归。64 张图中最终明暗 fit、scroll clip、125% 明/75% 暗六张逐张检查；原生画面与控件位置一致，无新增遮挡。自有进程/端口全部退出，页面/服务/外部请求错误为空，冻结前后及当前 441 源码 / 576 产物一致。

失败记录保持原身份：初次全量旧符号链接搜索用例随机匹配临时根目录，单独复查和两次后续全量通过，没有修改文件搜索代码。`/tmp/mira-browser-viewport-20261011.9K9lXL` 的首次运行漏建临时依赖链接，启动失败；之后的 guest 枚举未等待 DOM ready，夹具改为等待可用 ID。`/tmp/mira-browser-viewport-native-20261011.hYL0Lr` 保留早期光栅/输入失败与诊断：真实 150px 光栅问题由 flex 修复；整体 zoom 的截屏前后 viewport 改写来自 Playwright CDP 截图流程，改用 Electron 宿主原生 `capturePage` 后，同一产品在 18:10 与最终新产品 18:12 的严格尺寸/鼠标断言均通过。诊断脚本曾手动修改受控 guest 的 metrics/CSS，报告保持 false，未用于最终验收；最终 runner 无这些替换。不改历史报告或混用构建。

身份：React JS `cebf2503536a808bf7e6b798213469a3ee6a81dd2dd40f6133b0d8c392b10ff6`；CSS `ab2d9006925e624cadea064f744db81a5cb84668b4be4c82744912c6b620662f`；main `0b5a9a1707061a119ec8b8f35296668013f2e490a149c07afdaa9eb80f1563d5`；preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`；Vue HTML `48653c1158b212368b6896d016458cc7f9a9e6832a9aa9cd0d7625b0b5e86595`。其后仅已有文档更新。ZCode Apache 声明保留，新代码使用 Mira 命名及既有目录。

剩余与下一入口：浏览器元素选择（指向/高亮/选中引用到 Composer/取消与资源归属），然后 residency 和其余首屏功能/性能热点。当前无可调用 computer-use；隐藏宿主不替代 Mira/ZCode 原生同态、实体 OS 输入/剪贴板、远端模型、Windows/正式包或完整性能验收，本批未重测性能。整体 active，分支 `codex/mira-harness-first-slice`，未提交/推送。以下 01:37 及更早记录保持历史身份。

## 当前完成、剩余与下一入口（2026-10-11 01:37 +08:00）

完成：浏览器资源新增按 WebView `page-favicon-updated` 事件保存网站图标。图标只接受 HTTP(S) 无凭据地址，异常图标回退地球；完整 URL 导航按新地址清理，同地址刷新或缓存历史页从资源自身的 URL 图标缓存恢复。图标与 URL/标题一起按任务和资源保存，最近关闭恢复新资源身份但保留图标。上批 48px 工具栏、地址协议推断、默认浏览器/开发者工具菜单、错误/证书画布和原地址重试保持。

验证：全量 **184 文件 3041 项**通过，报告 `/tmp/mira-browser-icons-verified-20261011.VdMV8E/vitest-full.json`；React/Vue 类型、React/Electron 生产构建、291 JS/240 动态目标/33 许可/fresh CSS 审计与 diff 通过。真实宿主报告 `/tmp/mira-browser-icons-verified-20261011.VdMV8E/terminal-browser-2026-10-10T17-35-07-380Z.json` 明暗各 67 项共 134 项通过，真实 guest favicon、独立资源、SQLite 偏好及恢复均覆盖。OS 外部窗口与前台 DevTools 不冒称已验，开发者工具仍使用隐藏宿主和目标 WebContents 身份检查。

身份：438 源码/576 产物冻结前后和当前 checkout 一致；最新 React JS `8446a52da6ff7f88e194973ea19e33c419ae63cf1ced6590b06e5638620657d9`，CSS `2ffed4adfea9ed642583d15142580a597c9d6df64af552bb5c8ada7a8fbe8aa4`，main `dc3faa16…`、HTML `77da44ed…`、preload `7e4444b3…`。完整身份见 `/tmp/mira-browser-icons-release-20261011.sEKrl0/frozen-contract.json`、审计和报告。所有自有进程和模型/网页端口退出，页面/模型/受控外部请求错误为 0。临时脚本与报告只在 `/tmp`，没有新增仓库 QA 文档。

剩余与下一入口：自由尺寸/zoom 偏好、元素选择、完整浏览器驻留策略和其余首屏/性能热点。Shell 跨 iframe 提示收起、原生同态、实体输入、真实远端模型、Windows/正式包及性能到顶仍未验。分支 `codex/mira-harness-first-slice`，整体 active，保留既有 dirty 修改，未提交/推送。

以下记录保留历史身份。

## 当前完成、剩余与下一入口（2026-10-11 01:26 +08:00）

完成：参考 ZCode `EmbeddedBrowserPaneParts.tsx` / `embeddedBrowserHelpers.ts` / `UnifiedBrowserView.tsx`，新增 Mira 命名的浏览器工具栏与地址解析。48px 工具栏、28px ghost 按钮/地址栏，加载时刷新图标旋转，回车导航、聚焦全选，不保留额外提交按钮；Radix 提示与更多菜单接真实默认浏览器和指定 guest 开发者工具。地址区分本机/私网/`.local`/`.test`/显式非443端口 HTTP 与公网 HTTPS；保持 HTTP(S)、无凭据边界。

失败恢复：宿主保留主页面错误到下一次加载，忽略子框架失败与 ERR_ABORTED，避免 did-stop-loading 抹掉失败。错误画布隐藏原生 guest，完整失败/证书说明及重试入口；桥调用失败后按原请求地址重试，不错误返回上次成功页面。隐藏任务、迟到导航、重定向 ACK 和多资源授权边界保留。

验证：定向 6 文件 257 项及最终全量 **184 文件 3038 项**通过（Vitest JSON 的 suite 计数 427 不等于文件数），报告 `/tmp/mira-browser-toolbar-20261011.Xgvcsi/vitest-full.json`。React/Vue 类型、React/Electron 生产构建、291 JS/240 动态目标/33 许可/fresh CSS 审计与 diff 通过。未重测严格 Electron 独立类型或性能，原构建警告保留。

真实宿主：同目录 `terminal-browser-2026-10-10T17-24-36-695Z.json`，明暗各 62 项共 124 项通过，保留原主旁审批/草稿/停止、PTY 和多浏览器生命周期回归。实际 main/preload/Vue/React/grant/IPC/SQLite/Agent/PTY/WebView；模型与网页为 localhost。更多菜单的外部操作执行真实 shell.openExternal 调用，但最终 OS 启动使用受控 sink，不打开用户默认浏览器；开发者工具绑定实际 guest 与自有隐藏 DevTools WebContents（隐藏宿主 isDevToolsOpened 为 false，依据目标身份及 devtools 页面加载确认，不冒称可见窗口验收）。实际断连产生 ERR_EMPTY_RESPONSE，错误保留、菜单禁用外部打开，恢复后同 guest 加载原地址。选用明暗菜单/空态/失败/恢复 8 图与最新提示 2 图逐张复核，未逐张审核全部 42 图。

身份与收尾：437 源码/576 产物共 1013 文件与当前 checkout 一致；React JS `407c77d3ccb0e362a48c1e05271428de2b19c0e87cb5b7ebf9d4f5e942925399`，CSS `85b91a8fee5769b05e4b46379e0c8aa4a527cdb41fc0d7ac4e80bbf38b5f1163`，main `dc3faa16…`、HTML `f7bdabe6…`、preload `7e4444b3…`。完整 SHA、运行器身份和冻结范围见同目录 `frozen-contract.json` 及报告。所有自有进程、宿主/模型端口退出，页面与外部请求错误 0；临时脚本/报告仅 `/tmp`，没有新增仓库 QA 文档。

失败检查保留：17:18/17:19 的提示检查在刷新点击后直接跨 iframe 移开，隐藏 CDP 未产生源 trigger 的 pointerleave；17:23 实际事件诊断证明仅 pointermove，17:24 在同一 iframe 真实移开再悬停后提示通过，没有改产品或强制打开 Tooltip。17:20 的可见性断言误将隐藏 DevTools 的 isDevToolsOpened 当作必要条件；实际目标 WebContents 和 devtools 页面已创建，后改用目标身份/页面加载检查，仍不声称前台可见。旧 false 报告与 runner 身份保留，不扩大其结果。

剩余与下次入口：自由尺寸/zoom 偏好、元素选择、favicon 与驻留策略，再补其余首屏和已定位性能热点。Shell 跨 iframe 提示收起仍待前台观察。computer-use 当前无可调用工具；隐藏宿主不等于原生 Mira/ZCode 同态、实体输入、OS 外部窗口、真实远端模型、Windows/正式包或性能到顶。分支 `codex/mira-harness-first-slice`，整体 active，保留既有 dirty 修改，未提交/推送。

以下记录保留历史身份。

## 当前完成、剩余与下一入口（2026-10-11 01:01 +08:00）

完成：重新核对 ZCode `useAppPanels.ts`，普通网址和空浏览器入口每次新建独立标签，最近关闭恢复新身份并保留地址/标题。00:28 的单浏览器复用不符合这一上游行为，本批已替换。React 按任务/资源保活，真实页面标题更新资源名，背景 URL/标题只保存到来源任务；Vue 新增自有 `MiraHostedBrowsers`，按 `[sessionId, browserId]` 管理 WebView、历史、可见性、监听和精确释放。沿用真实第一方 grant/IPC 校验，新增资源参数仍兼容旧 `browser` 和旧调用。授权在途的导航被关闭、替代或宿主撤销后不能创建幽灵页面，旧 attach/加载失败不删除新实例。来源与原 Apache 声明已同步。

交互修复：Shell 搜索返回后的纯文字 tooltip 曾拦截下方工作区按钮；搜索/设置/导航的提示改为不可进入且不接收指针，保留实际按钮及键盘语义。仅 `enterable=false` 不能解决跨 iframe 焦点保留情况下的拦截，最终使用组件 `popper-style` 明确让点击通过。没有强制点击或隐藏夹具浮层绕过。

验证：浏览器批次全量 183 文件 2996 项通过，报告 `/tmp/mira-browser-resources-final-20261011.Msbh2x/vitest-full.json`；最终四处 Shell tooltip 指针属性调整后，相关 4 文件 97 项、Vue 类型及 Electron 生产重新构建通过。React 类型及生产构建已在同一浏览器代码通过，最终 291 JS/240 动态目标/33 许可/fresh CSS 审计通过，diff 无错误。未重复宣称最后四处属性后重跑全量，也未重测性能或严格 Electron 独立类型。

实际宿主：`/tmp/mira-browser-resources-verified-20261011.dnNpHj/terminal-browser-2026-10-10T16-59-59-742Z.json` 明暗各 55 项共 110 项通过。真实 main/preload/Vue/React/grant/IPC/SQLite/Agent/PTY/WebView，模型及网页仅 localhost。覆盖普通/重复链接各自新 guest、同标签地址修改/重定向/历史、各标签 URL/标题持久化、Shell/Harness 搜索及菜单遮挡恢复、A→B→A 保活、精确关闭/最近恢复新 guest、关闭其他/全部且不影响别的任务。额外夹具只延迟一次导航到达真实 IPC listener 的时机，最终仍执行原授权 listener：先关资源再释放授权，页面不复活。原主旁审批/指导/草稿/停止及 PTY 回归保留；受控复制 sink/粘贴 payload 不触碰系统剪贴板。32 张图中多资源/最终浏览器明暗 4 张逐张复核，其他图不算本批逐张审核。

身份与收尾：435 源码/576 产物冻结前后及当前 checkout 共 1011 文件一致；React JS `463c2d55b54bd711b51dbc5b7e508ba4152901306cb689d7b158e89074570e3c`、main `6ddeb984…`、Vue HTML `f4265818…`，CSS/preload 与前批相同。最终 runner `b1d6d6ec8b06bde685e0f6ee1d918909a62f5dc76862ab6e130a39703cde20e5`；完整 SHA 见同目录 `frozen-contract.json`。自有进程、宿主与模型端口均退出，无页面/模型/外部请求错误。后续仅已有文档更新，未新增仓库 QA 文件。

失败历史保留：初目录 `.5IduYP` 的 16:51 是夹具根缺少依赖链接，未启动产品；16:52 与 `.Msbh2x` 的 16:55 复现真实 tooltip 拦截。最终 `.dnNpHj` 的 16:56 和 16:58 是跨任务夹具在导航完成前判断展开状态，以及用 `isVisible` 判断被零宽面板裁切的内容；修为等待目标任务真实激活、读取 `aria-expanded` 并从实际按钮展开，未改产品导航或使用 force。所有旧 false 报告及构建身份原样保留。

剩余与下次入口：从 `MiraBrowserPanel.tsx` 对照 ZCode `browser-use/UnifiedBrowserView.tsx` / `HumanBrowserView.tsx` 继续工具栏、favicon、viewport/zoom 偏好和浏览器驻留策略，再补其余首屏菜单/状态与已定位性能热点；不转回文件支线。Shell tooltip 跨 iframe 的焦点显示收起仍需观察，本批仅证明不再拦截点击。computer-use 当前无可调用工具，隐藏宿主不等于原生 Mira/ZCode 同态、实体输入、真实远端模型、Windows/正式包或性能到顶。分支 `codex/mira-harness-first-slice`，整体 active，未提交/推送。

以下 00:28 及更早保留历史身份，不代表当前多浏览器行为。

## 历史记录（2026-10-11 00:28 +08:00）

完成：新增 Mira 命名的 `mira-terminal-links.ts`，按 ZCode 缓冲区逻辑行识别 plain HTTP(S) URL，映射 UTF-16 偏移到实际终端单元格，支持换行/宽字符/组合字符、末尾完整宽字符列，去掉正文尾标点及多余闭括号。TerminalPanel 注册 link provider/OSC 8 linkHandler，悬停下划线/手型，点击只交给当前主任务资源浏览器；隐藏、卸载、旧终端页签/旧任务不发导航，不直接打开系统窗口。当前 callback 更新不重建 PTY。

浏览器：从 Workbench 内移到 `components/workspace/MiraBrowserPanel.tsx`，使用一次性明确请求，空浏览器、已有浏览器和重复同 URL 均可导航；同主任务复用一个资源标签和 WebView。实际浏览器 URL/重定向事件不触发重载循环，迟到 ACK 不覆盖观察到的目标地址。保留旧 session epoch、navigation revision、overlay/bounds 与关闭清理；查找/全局搜索或离开会话时隐藏资源，不抢其他任务。现有宿主协议、原 Apache LICENSE/NOTICE 不改。

验证：最终全量 182 文件 2977 项通过（`/tmp/mira-terminal-browser-final-20261011.SLS8k4/vitest-full.json`），React 类型、Vue 类型、React/Electron 生产构建、291 JS/240 动态目标/33 许可/fresh CSS 审计及 diff 通过。早一批 2976 项对应重定向 ACK 修复前；最终多一项真实 React 迟到重定向覆盖测试。终端链接范围、provider/OSC 8/隐藏与 dispose、Workbench owner/页签、已开/重复/反馈/迟到/错误与模态隐藏有针对性回归。Electron 完整严格类型、本批性能没有重测，构建原有警告仍在。

实际宿主：`/tmp/mira-terminal-browser-final-20261011.SLS8k4/terminal-browser-2026-10-10T16-26-26-414Z.json` 明暗各 48 项，共 96 项通过。真实 main/preload/Vue/React/grant/IPC/SQLite/Agent/PTY/WebView，页面和模型仅 localhost。实际鼠标悬停链接出现手型，点击经桥打开页面；新地址/重复 URL 复用同 guest，重复请求确实到达本地服务器，redirect 更新真实地址并保存；后退/前进按 Chromium 实际历史项检查，刷新后等待工具栏加载结束。主旁引用/草稿/审批/指导/停止和终端复制/粘贴/关闭/重启回归保持。30 张截图中本轮明暗最终浏览器 2 张及前次同产物 2 张逐张检查，未逐张审核其余截图。所有自有进程/端口退出，页面/模型/外部请求错误 0，434 源码/576 产物冻结前后及当前产品一致。runner hash `8fb9166eec58de041f7ec4e46836738033f06ee62b079201131884a71c3b177e`。

失败历史：`/tmp/mira-terminal-browser-20261011.14si4c` 的 16:21 报告查错 xterm 手型 class 层级，截图实际已划线；16:22 重复 URL 检查命中上一次输出，未等待新 PTY 行，修为输出行数增加后真实鼠标离开再悬停，不强制点击或改产品过测。两份 false 报告及旧 `fef5d460…` 包保留原身份。最终目录 16:24 的 96 项 true 属同一最终产品，但第二浏览器图可能在刷新阶段；16:26 等待工具栏加载结束后再截图确认，前一次结果保留。没有混用旧构建/改写历史状态。

身份：React JS `207c1eb4c78f88c99be49a76f559802b710059771607d0119879a3de5e05c919`；CSS `9e1a7f37…`、main `db982f8a…`、preload `7e4444b3…`、Vue HTML `9f26dfd6…` 与前批字节相同，来源声明已同步到产物。后续只有已有文档更新。

剩余与下一入口：浏览器资源关闭/最近恢复、跨主任务导航与浮层遮挡的真实宿主检查；再继续首屏其余菜单/状态与已定位性能热点，不转回文件/媒体支线。当前 computer-use 无可调用工具，隐藏宿主不代替原生 Mira/ZCode 同态、实体输入/剪贴板、真实远端模型、Windows/正式包或性能到顶。分支 `codex/mira-harness-first-slice`，整体 active，未提交/推送。

以下 00:10 及更早保持历史身份。

## 当前完成、剩余与下一入口（2026-10-11 00:10 +08:00）

完成：终端接入 ZCode 对应的 Radix 复制/粘贴菜单及 Lucide 图标，沿用 Mira 菜单视觉。无选区禁用复制；未连接/退出/宿主不支持时禁用粘贴，关闭回终端焦点，隐藏时收起且不抢其他输入。macOS 保留 xterm 默认右键选词。新增 Mira 自有 `terminal.paste`：现有 grant/session/PTY owner 校验先于一次主进程剪贴板读取，按 xterm 6 换行和括号粘贴语义向目标 PTY 写入；返回 void，页面不获得剪贴板文本，不新增 iframe clipboard-read。空文本不写，超限/读取失败公开反馈；原 Ctrl/Cmd+V 单 paste 路径保留。

验证：全量 180 文件 2966 项、定向 5 文件 205 项及后续实际菜单 8 项通过，React/Vue 类型、生产 React/Electron 构建、291 JS/240 动态目标/33 许可/fresh CSS 审计和 diff 通过。全量报告 `/tmp/mira-terminal-menu-20261011.r5H3T7/vitest-full.json`。覆盖跨窗口/错 session/关闭终端不读剪贴板、空/超限/失败不写、括号/非括号换行、grant/主 frame/删除 session 拒绝、void 与纯身份协议、真实 Radix 操作/禁用/隐藏/焦点。本批没有重测性能或严格 Electron 独立类型，构建既有警告保留。

生产宿主：同目录 `terminal-menu-2026-10-10T16-08-09-779Z.json`，明暗各 42 项共 84 项通过。真实 main/preload/Vue/React/grant/IPC/SQLite/Agent/PTY，模型仅 localhost SSE；主进程 clipboard.readText 和页面复制 sink/快捷 paste payload 为受控测试内容，系统剪贴板未读写。实际鼠标选区内右键复制、菜单关闭焦点、一次授权粘贴及真实 shell 输出 `MIRA_MENU_PASTE_OK` 通过，终端打开/切换/关闭/重启/最近恢复、主旁审批/指导/草稿/停止回归保持。26 图中最终菜单明暗 2 图逐张复核。无页面/模型/外部请求错误，自有进程/端口退出，432 源码/576 产物冻结前后及当前产品一致。

失败历史保留：16:05 夹具在原选区外右键，macOS 默认选词使实际复制为鼠标下内容，不能判为产品复制丢选区；16:06 点 xterm 的不可点击文字行，改为实际屏幕坐标鼠标输入；16:07 的 printf 字面双反斜线和 regex 转义错误，已更正受控命令与原严格实际输出断言。没有强制点击、改产品绕过或覆盖原报告，最终 runner 启动至完成未修改。

身份：main `db982f8a902878fbfb4e46748113891c5bef35a8d7e9980327eae0c8dfe616c1`、React JS `8155ac553c02fdfaa2b3ded3c3587b19e97eb578bc6ed24b30af787d943ee5ab`、CSS `9e1a7f37…`、Vue HTML `9f26dfd6…`；preload 字节不变，来源说明已同步。后续仅既有文档更新。

剩余与下次入口：参考上游 `terminalLinks.ts` 的跨行/宽字符映射，接 HTTP(S) 链接到当前任务浏览器，核对已有浏览器再打开新地址的导航/晚到回执隔离，再继续首屏其余未验入口与性能。当前仍无可调用 computer-use，不代替 ZCode 原生同态、实体剪贴板/IME、真实远端模型、Windows/正式包和完整性能验收。整体 active，分支 `codex/mira-harness-first-slice`，未提交/推送。

以下 2026-10-10 23:56 及更早保留历史身份。

## 当前完成、剩余与下一入口（2026-10-10 23:56 +08:00）

完成：按 ZCode `SidePaneTerminalPane.tsx` 的单 shell/不嵌套 tabs 结构，每个终端移到右侧统一资源标签栏。目录名自动去重，每资源拥有独立 PTY；切换/隐藏保留输出，关闭只释放目标，菜单重启保留资源身份但新建进程，最近关闭恢复同一标签并创建新连接。保留旧 `terminal` 偏好、原始输入及晚到连接清理。关闭按钮卸载后焦点回相邻标签/空栏入口，异步关闭不抢用户新输入焦点。去掉旧内层终端栏/常驻连接头；标签统一 156px/最小 60px 收缩，终端仅单层 12px 内边距，不继承 inspector 的额外 padding/底边线。

验证：定向 4 文件 87 项及最终全量 180 文件 2959 项通过。React 类型、生产 React 构建、291 JS/240 动态目标/33 许可/fresh CSS 审计与 diff 通过；本批未重跑 Vue/Electron 构建或性能。最终报告 `/tmp/mira-terminal-resource-verified-20261010.ObSooo/vitest-full-after-contract.json`；首次 `vitest-full.json` 为 2958 通过/1 失败，原因是旧构建断言仍要求选中标签 128px，同步已批准的等宽收缩规则后全过，保留原失败报告。

生产宿主：同目录 `resource-tabs-2026-10-10T15-53-23-711Z.json` 明暗各 40 项共 80 项通过。冻结 432 源码/576 产物前后不变，实际 main/preload/Vue/React/grant/IPC/SQLite/Agent/PTY，无运行状态或终端返回值替身；模型仅 localhost SSE，复制 sink/paste payload 仍受控，不等于实体系统剪贴板。两独立 PTY 的开关/切换/关闭、输出保活、重启/最近恢复和原主旁审批/指导/双草稿/停止通过。真实悬停后关闭命中正确，四标签均 102.25px，终端屏幕距边界均 12px；24 图中最终终端明暗 2 图逐张检查。无页面/模型/外部请求错误，自有进程/端口已退出。

纠正：`/tmp/mira-terminal-resource-tabs-20261010.2BS6rM` 的 15:45 和 `/tmp/mira-terminal-resource-final-20261010.z0ZMFZ` 的 15:50 关闭失败，来自夹具在未悬停标签时直接点击/hover 尚不可命中的按钮，不能归为产品标题遮挡。旧包独立 `baseline-geometry-2026-10-10T15-52-03-780Z.json` 按正确悬停顺序命中为 true，实际差异是选中 128px、其他约 93.67px。最终只保留等宽修正，撤回无依据的 z-index/标题 flex 改造。所有失败报告与旧冻结包保持原身份，不改状态。

身份：React JS `5bc5f90218aca4354c5df34d42eb9f57ea2bbc357128bb5927031d203cc58d75`，CSS `9e1a7f378f586a539eaac02a73a37eef79f7be8556e656803abe4c0dc7b5f0f0`；main/preload/Vue 字节同 23:35，许可改编说明已同步。后续只有测试断言和已有文档更新，产品与冻结产物保持一致。

剩余与下次入口：对照上游终端右键复制/粘贴菜单及 HTTP 链接打开，先核对 Mira 已有授权桥与 write-only 剪贴板边界，再补实际动作；随后继续浏览器资源导航/生命周期与首屏其他未验入口。原生 computer-use 当前无可调用工具，ZCode 原生同态、实体剪贴板/IME、真实远端模型、Windows/发布与完整性能仍未验。整体 active，分支 `codex/mira-harness-first-slice`，未提交/推送。

以下 23:35 及更早保留历史身份。

## 当前完成、剩余与下一入口（2026-10-10 23:35 +08:00）

完成：`TerminalPanel.tsx` 对齐 ZCode 的终端打开/新建/切换聚焦与选区复制。连接后及重新激活时下一帧聚焦，隐藏/卸载取消；用户已在其他输入框输入或重命名终端时不抢焦点，晚到连接只清理自己的 PTY。Ctrl/Cmd+C 有选区复制，无选区 Ctrl+C 仍发中断；长按不重复写剪贴板，复制失败公开反馈且保留选区。Ctrl/Cmd+V 让出 xterm 按键处理，实际文本由 xterm 的 paste 事件写入一次，支持括号粘贴；不新增 clipboard-read 权限或复制 ZCode 的 readText 路径。保留 Apache 来源与 Mira 命名。旧终端等宽字体原本未登记，补入 DESIGN，不更换字体。

回归：新增实际 React 生命周期与 xterm 接口边界测试，旧实现 4 项失败/2 项通过，修后相关 8 文件 229 项及全量 179 文件 2955 项通过（`/tmp/mira-terminal-input-20261010.ZsSmlr/vitest-focused.json`、`vitest-full.json`）。React 类型、生产构建、291 JS/240 动态目标/33 许可/fresh CSS 审计与 diff 通过。本批未重跑 Vue/Electron 构建或性能，不把旧性能数据归到此构建。

生产宿主：`/tmp/mira-terminal-input-20261010.ZsSmlr/terminal-actions-2026-10-10T15-33-46-836Z.json`，明暗各 34 项共 68 项通过，432 源码/576 产物前后冻结一致，actualRunner 与最终脚本一致。真实 main/preload/Vue/React/grant/IPC/SQLite/Agent/PTY，模型仅 localhost SSE；复制目的端为受控内存 sink，粘贴按键及 payload 为受控 DOM 事件，实际 xterm 处理与 terminal.write/PTY 未替身。真实 CDP 鼠标选择输出后 Ctrl/Cmd+C 各复制一次且无 PTY 中断；Ctrl/Cmd+V 的单 paste 事件各写一次，无 ^V 字节/异步 readText；打开/新建/切换两个实际 PTY 输入焦点、资源让键、双草稿、审批/撤回及主旁停止保持。22 图中最终终端明暗 2 图逐张复核。无页面/模型/外部请求错误，所有自有进程及端口退出。

最终 JS `619d5fef433f0a2eac33bdd1f7df00835a58956245e1ab404f16663bd4ba1f12`；CSS/main/preload/Vue 与 23:23 字节相同。源码和打包许可证同步。本批 15:32 首次 66 项报告没有追加 Cmd 路径；15:32:48 失败因夹具将真实 Cmd+V 默认 paste 与手工 paste 连用，实际收到一个空的原生 paste 和一个测试 payload，不能说用户文本发生重复。最终使用受控按键/paste 事件隔离系统剪贴板，失败报告保留；原生系统 Cmd+V、实体剪贴板及权限仍未验，不能用受控结果代替。

剩余与下次入口：继续资源页签关闭/重开/切换的焦点回收、终端重启及隐藏生命周期，对齐当前 ZCode 交互；后续仍需首屏其他菜单/状态与性能。computer-use 当前无可调用工具，原生 ZCode 同态、实体剪贴板/IME、真实远端模型、Windows/正式发布与完整性能未放行。整体 active，分支 `codex/mira-harness-first-slice`，未提交/推送。

以下 23:23 及更早保持历史身份。

## 当前完成、剩余与下一入口（2026-10-10 23:23 +08:00）

完成：对照 ZCode `v4/SessionPane.tsx` 的 focused pane 停止规则和 `terminal/TerminalSession.tsx` 的终端按键处理，修复资源面板仍归主对话的快捷键冲突。Workbench 的工作区捕获指针/焦点，旁路内部捕获继续指定 child；切换资源页签不重置为 main，关闭工作区或切换主任务才恢复 main。TaskFind 另检查事件目标，旧焦点状态尚未提交时也不会从终端、浏览器或文件预览打开主查找；当前任务文件变更查找保持可用。没有新增文件编辑器或终端搜索。

验证：先补复现，旧实现 2 项失败；修后定向 5 文件 218 项通过（`/tmp/mira-resource-keyboard-20261010.zTxyas/vitest-focused.json`）。React 类型、生产构建、diff 和 291 JS / 240 动态目标 / 33 许可 / fresh CSS 审计通过。未重跑全量、Vue/Electron 构建或性能；上一批 178 文件 2947 项和提速数据保留原身份，不归给本批。

最终隔离宿主：`/tmp/mira-resource-keyboard-20261010.zTxyas/resource-actions-2026-10-10T15-21-08-980Z.json`，明暗各 28 项共 56 项通过。真实生产 main/preload/Vue/React/grant/IPC/SQLite/Agent 与真实 PTY；模型仅 localhost SSE。验证 Cmd+F 保留终端焦点，Ctrl+C/F/M/T 和 Escape 字节到达 PTY，取消 shell 的 Escape 输入后实际 printf 输出完整标记；浏览器地址保稿、文件源码/资源工具栏不抢主查找或误停后台任务；资源内全局搜索、切回旁路查找、双草稿、审批/撤回及主旁停止保持。22 张图中最终终端/文件明暗 4 张逐张复核。无页面、模型或外部请求错误，自有进程/端口退出，432 源码/576 产物冻结前后相同，报告保留实际 runner URL/hash。

构建：React JS `15742bc893deeedb7866dc61f98154ef20ad69ec2f3fbf68c1b4c900fac9ed7c`；CSS `5bb3ff3560b709a4c74325e7bc629bc91087235a5bbc97e5c53b2dea32e7ac73`。main/preload/Vue 与 23:05 相同。

夹具失败保留：15:16 缺夹具根 node_modules，15:17 立即断言旁路 rAF 聚焦，15:19 shell Escape 吃掉 printf 首字母，15:20 错把单独读取当成查阅分组。分别修夹具依赖、等待真实聚焦、等待 PTY 新提示符/实际输出及使用现有文件按钮；没有改产品绕过断言。15:18 的 54 项报告尚未包含文件源码和实际命令输出，不代替最终 56 项。15:20 runner 运行期间有夹具文本更新，该失败报告不作为当前脚本身份验收；最终报告启动后至完成未修改脚本。

剩余与下次入口：继续终端激活焦点、选择复制/粘贴和侧面板生命周期的 ZCode 对齐，再核对首屏其余菜单与状态。computer-use 当前无可调用工具；隐藏宿主不代替原生 ZCode 同态、真实远端模型、Windows/正式发布及完整性能验收。分支 `codex/mira-harness-first-slice`，整体 active，未提交/推送。

以下 23:05 及更早保留各自历史身份。

更新：2026-10-10 23:05 +08:00（去除历史消息重复运行时，完成本批性能与交互回归）。
状态：本批限定验证通过；整体复刻仍 active，原生同态及完整性能验收未完成。

## 当前完成、剩余与下一入口（2026-10-10 23:05）

完成：主/旁对话直接将 canonical 消息传给可见轮次。原 assistant-ui 适配层即使只挂载约10条消息，仍为1000条历史创建消息运行时及订阅；现去掉这套重复状态、索引等待和重复自动滚动状态。完整历史、稳定 renderer 身份、TanStack overscan 4、Streamdown/Shiki、Radix、Lexical、审批、消息操作与 Mira 自有阅读恢复保持。没有修改库内部、截正文或换用简化 Markdown。Impeccable optimize 流程要求以实际热点和前后测量判断改善，视觉继续遵循用户指定 ZCode。

性能：同方法 `20261010-beforeinput-required-send-button-v2`、1440×900、500轮1000条完整消息，前后各三个独立非trace生产 Electron 进程。首开109.9→76.8ms，切回86.0→68.8ms，阅读恢复107.7→72.4ms；输入30.1→30.2ms、轮次点击49.9→49.9ms，基本持平，三次阅读锚点漂移均0。前批 `/tmp/mira-first-open-profile-20261010.iGn1nt/results-2026-10-10T14-42-54-073Z.json`，后批 `/tmp/mira-canonical-window-final-20261010.g0QDfO/results-2026-10-10T14-55-31-251Z.json`。进程冷启动不等于清空OS缓存，DOM就绪加两次rAF不等于原生显示帧或INP/P95。

独立诊断：同目录 `diagnostic-2026-10-10T14-56-08-659Z.json`及291份逐字节对应的外部source-map。本次首开132.3ms（带trace），最大FunctionCall12.264ms，首开区间没有longtask；旧诊断59.216ms提交热点本次未出现。非trace第一实例在初始加载阶段仍有54ms长任务，不能宣称所有长任务消失或性能到顶。

验证：新增真实React消息生命周期覆盖转义/换行、附件-only、编辑重排/owner切换和流式转持久化的DOM身份；5文件128项及全量178文件2947项通过。React/Vue类型、React构建、diff、当前资源审计291 JS/240动态目标/33许可/fresh CSS通过。Electron/main未改，本批没有重新运行其构建或严格独立类型检查。当前main `ee106a4a…`、preload/Vue同22:36，React JS `00fd0cf7aa1ce2513f24c34c165812972151ccf6445012fa21be41ce6357b1a5`，CSS `5bb3ff35…`。

生产交互：同目录 `side-actions-2026-10-10T14-56-28-290Z.json`明暗42项；`stop-2026-10-10T15-04-15-268Z.json`明暗20项及稳定分栏几何断言；`coverage-long-light-2026-10-10T14-58-30-404Z.json`、`coverage-short-dark-2026-10-10T14-58-34-722Z.json`共26项；两份 `long-side-results-2026-10-10T14-58-38-606Z.json` / `15-00-28-694Z.json`明暗共28项。实际main/preload/Vue/React/grant/IPC/SQLite/运行器，不替换返回值；交互模型仅localhost SSE，长历史检查无模型请求。覆盖主旁发送/审批/停止/指导/引用/草稿、离屏查找/编辑、双栏独立阅读/开合/改宽和三个委派停止入口。页面/外部请求错误0，自有进程及端口已退出。

截图：本批已逐张查看主旁回复/审批两图、长旁路明暗三图、短回复深色一图及早期子任务停止/重载两图。早期深色重载图取在200ms开栏动画中，出现锁宽裁切；补等待动画结束及parent/transcript横向溢出、请求左缘断言，稳定明暗结果通过，最终浅色停止/深色重载两图也逐张复核，左缘完整且无横向溢出。不把未逐张查看的全部输出图写成人工验收。复用夹具时三份bootstrap误保留旧临时目录正则，启动失败报告保留false；修校验到当前真实隔离目录后通过，没有修改产品绕过失败。

身份：冻结432源码/576产物及所有历史报告保持原身份。后续仅Workbench注释/空白和许可改编表修正；`current-equivalence.json`确认五项核心产物字节仍与测试包一致，唯一产物差异是同步后的ADAPTATIONS。`current-bundle-audit.json`再次从当前源码只读重建全部JS并匹配；`vitest-full.json`为本批全量结果。临时夹具/截图不进入仓库。

剩余与下一入口：继续首屏未验交互，优先核对对话/终端/文件编辑器快捷键归属及侧面板生命周期；初始加载54ms长任务另行定位，不反复测已通过的同一热点。当前无可调用computer-use，隐藏Electron不代替Mira/ZCode原生同态、远端模型、Windows/正式包验收。分支 `codex/mira-harness-first-slice`，未提交/推送，整体active。

以下22:40及更早记录保留历史身份，不覆盖当前完成项。

## 首开热点续作（2026-10-10 22:40）

复用当前22:36最终生产身份做一次独立诊断，未修改产品来降低指标。`/tmp/mira-first-open-profile-20261010.iGn1nt/diagnostic-2026-10-10T14-38-53-869Z.json`通过冻结、完整500轮/1000消息、切换/输入/轮次导航/阅读恢复和清理检查；原轮250偏移漂移0，模型/外部请求和页面错误0，自有进程及58037端口退出。291份外部source-map在仅等长hash文件名重写后与冻结生产JS逐字节匹配；没有修改node_modules或生产产物。

本次带trace首开158.1ms，其中React提交FunctionCall59.216ms、其内layout/update2.937ms。采样指向assistant-ui message runtime getState（自耗时约7.221ms）与GC（约10.201ms）；应用Composer样本约2.559ms。包含时间不能相加成精确耗时；这是单次诊断，不能和21:46非trace中位数直接比较，不代表新性能改善、INP/P95或原生帧验收。

下一入口：核对可见消息订阅与assistant-ui运行时桥的重复工作，再用独立非trace前后实例评估实际修改；不改库内部、不截正文，也不凭单次CPU样本重构整套消息架构。首屏原生ZCode同态与正式发布仍未验，整体active。

## 当前完成、剩余与下一入口（2026-10-10 22:36）

完成：`SubtaskRuntime`原先在finally中无条件把未完成工具活动记为failed，现仅在主动停止时结算为stopped。真实失败、超时与存储重启恢复的意外中断保持异常；迟到成功和保留listener不复活任务。复用已有“已停止”标签与中性活动样式，不增加UI或通用计划状态。历史failed活动不做推断迁移。

回归：现有迟到事件测试先在旧实现失败，再修复通过；补超时/运行错误保留检查，增强真实子Agent/bash/registry/SQLite测试的活动、事件、停止前输出与重载一致性。最终全量177文件2944项、定向5文件124项通过，见 `/tmp/mira-child-tool-stop-verified-20261010.Z6F57p/vitest-full.json`。React/Vue类型、React/Electron构建、diff及资源审计291 JS/240动态目标/33许可/fresh CSS通过；严格Electron独立类型本批未跑，既有构建警告保留。

生产宿主：`/tmp/mira-child-tool-stop-verified-20261010.Z6F57p/stop-2026-10-10T14-33-35-097Z.json`明暗各10项共20项通过；实际生产main/preload/Vue/React/grant/IPC/SQLite/HarnessRuntime/SubtaskRuntime/Agent，仅模型为隔离localhost SSE。三个tester按真实项目写锁串行，在摘要胶囊、父对话卡片、右侧面板分别停止；确认指定子任务停止、保留公开前缀与停止前输出、工具cancelled/活动stopped、父整合一次、刷新一致。8图中停止/重载明暗4图逐张复核。无页面/外网/模型夹具错误，自有进程及端口退出；432源码/576产物前后冻结一致，actualRunner记录真实URL/hash。不替代computer-use、远端模型或性能验收。

旧生产复现：`/tmp/mira-child-tool-stop-before-20261010.98a765/stop-2026-10-10T14-34-14-418Z.json`在旧main `f86e6ab3…`明暗实际复现任务stopped但活动failed。更早同目录符号链接appPath断言失败及 `/tmp/mira-child-tool-stop-final-20261010.JoQO0W` 的动态import、字面换行断言两次夹具失败保持false；修夹具，不改产品绕过断言。首次中间包先于许可证资源同步，最终verified包重建并通过许可审计，不混用两包。

当前身份：main `ee106a4ad92793b0cd70e9b7cd77dca109bf9952d9cca004d0008980bcdc55f4`；React JS `1481034d5c7b04a0f9f78179912cf205450fb036c82ed586968bf8b4c4cbacee`；CSS `5bb3ff3560b709a4c74325e7bc629bc91087235a5bbc97e5c53b2dea32e7ac73`；preload/Vue字节同22:25。没有新性能样本。

剩余与下次入口：继续首开React/assistant-ui提交热点与未验首屏同态。computer-use仍无可调用工具，隐藏宿主不替代原生ZCode对照、远端模型、Windows或正式发布。未提交/推送，分支`codex/mira-harness-first-slice`，整体active。

以下22:25及更早保持历史身份和当时下一入口，不覆盖当前状态。

## 当前完成、剩余与下一入口（2026-10-10 22:25）

完成：对照ZCode `conversationTurnWorkSegments.ts` 与 `conversationAssistantWorkItems.ts` 的中断/取消和错误区分，修正Mira运行器在准备或生成中主动停止时把剩余活动写为failed的问题。`HarnessRunActivity.status`局部增加stopped，不扩充计划的通用状态；运行中的活动和待审批工具结算为stopped，正在执行的计划步同步停止，已经completed/failed的活动不覆盖。真实工具失败继续显示异常。共享摘要用中性停止图标，右侧执行活动显示“已停止”，既有输出、引用、双草稿与停止会话归属保持。

回归：新增准备/生成停止、真实MCP失败后再停止的持久化/事件/重载检查，增强待审批工具取消断言；旧代码在准备、生成和审批停止三项真实失败。首次失败保留检查误用了直接返回isError的临时工具，与实际MCP adapter不等价；已改用真实McpManager.toAgentTool而不修改产品绕过夹具。修后定向6文件128项及最终全量177文件2942项通过；SSR同时检查停止摘要无假异常、停止详情标签及真实失败仍计为1项异常。React/Vue类型、React/Electron生产构建和diff检查通过；严格Electron独立类型检查未运行，既有Tailwind highlight/Vueuse注解/动态导入警告保留。

最终宿主：`/tmp/mira-stopped-activity-final-20261010.t1TkKf/side-actions-2026-10-10T14-22-05-372Z.json`，冻结未替换的生产main/preload/Vue/React/grant/IPC/SQLite/运行器/Agent，模型仅隔离localhost SSE。明暗各21项共42项，覆盖此前旁路及查找/菜单/草稿合同，新增主/旁停止的实际持久化活动、摘要无假异常与右侧执行详情状态。生成18图，本批逐张检查停止摘要/执行详情的明暗4图，不混称全部18图人工复核。`vitest-full.json`、`bundle-audit.json`与`frozen-contract.json`同目录；actualRunner记录真正执行脚本URL/hash。

身份：main `f86e6ab37eabbec9ec79fb3004546b1ace0c6266109acf82612ae50bc4179cc6`；React JS `1481034d5c7b04a0f9f78179912cf205450fb036c82ed586968bf8b4c4cbacee`；CSS `5bb3ff3560b709a4c74325e7bc629bc91087235a5bbc97e5c53b2dea32e7ac73`；preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`、Vue HTML `af0ab893daf09ccd79b59367d2a3ccd0a57fd9efcd0d721b00e0eb97286902b7`重建后字节不变。432源码/576产物前后冻结不变，291JS/240动态目标/33许可/fresh CSS通过，无页面/受控模型/外部请求错误；自有进程退出，57522/57554及模型57512/57549端口关闭。本构建无新性能样本。

旧版本复现：`/tmp/mira-side-actions-final-20261010.sSRn0Q/side-actions-2026-10-10T14-22-04-364Z.json`，旧main `bc6d76af…` / JS `bccff029…` 明暗均真实failed→stopped断言失败。更早14:20脚本首次缺actualRunner字段的false报告保留，不用其runner声明作最终证据；最终复现与成功报告均有真实脚本身份。上一批成功报告不被新增失败覆盖。

剩余与下次入口：`subtaskRuntime.ts`仍在委派子任务停止后将未完成工具活动写为failed，现有 `subtaskRuntime.test.ts` 的迟到成功测试也断言该旧行为；下一批改为主动停止的中性活动状态，并保持失败/超时/意外中断及迟到事件隔离。历史保存的旧failed活动未做推断迁移。继续首屏/ZCode完整同态及首开提交热点；computer-use仍无可调用工具，隐藏宿主不替代原生对照、远端模型、Windows/安装包和完整性能验收。未提交/推送，分支 `codex/mira-harness-first-slice`；整体active。

以下22:15及更早保留各自源码、构建与结果身份。

## 当前完成、剩余与下一入口（2026-10-10 22:15）

完成：`HarnessComposer.tsx` 的非模态查找判断限定到自身对话；另一栏查找不再阻止当前栏普通Escape停止。本栏查找、模型菜单、全局模态搜索的Escape只关闭对应浮层，不发停止；既有输入法、长按、已消费事件和其他编辑器/终端让键保留。主、侧的实际run.abort各发给对应session，输出和两栏草稿保留。

完成：对照ZCode `SessionPane.tsx` 中selectionSideChat禁用retry/edit/fork的约束，侧消息不展示历史编辑或重新生成入口；仍可复制、引用和继续发送。`MiraSideConversation.tsx` 禁止侧历史重跑，共享 `MiraConversationMessages.tsx` 不给子会话传重生成回调；主任务的历史操作保留。没有添加新的旁路分叉能力。

验证：停止回归旧实现2项失败/115项通过，修后定向3文件191项通过；侧操作回归旧实现canRerun为true真实失败，修后定向4文件202项通过。最终全量177文件2938项、React类型/生产构建、diff检查，以及291JS/240动态目标/33许可/fresh CSS审计通过。停止修改后的2937全量属于中间JS `9fb49738…`，最终2938属于下面 `bccff029…`；不混用旧结果。Electron/Vue代码未改，不重新声称本批跑了它们的严格类型或构建。

最终宿主：`/tmp/mira-side-actions-final-20261010.sSRn0Q/side-actions-2026-10-10T14-13-42-559Z.json`，实际冻结编译main/preload/Vue/React/grant/IPC/SQLite/HarnessRuntime/Agent，模型仅隔离localhost SSE。明暗各18项共36项，覆盖引用创建/复用、恢复、侧复制及主历史操作、真实提交与工具审批、指导撤回、双栏查找Escape、菜单/模态保护、当前栏停止与双草稿保留。生成16图，本批逐张检查回复与主停止的明暗4图；未称全部16图人工复核或原生鼠标hover验收。`vitest-full.json`、`bundle-audit.json`、`frozen-contract.json`同目录。

身份：最终React JS `bccff029da42be5d4debf6a24660a7322711cfd862e1de3f57193334db7f683b`，CSS `5bb3ff3560b709a4c74325e7bc629bc91087235a5bbc97e5c53b2dea32e7ac73`；main `bc6d76af…`、preload `7e4444b3…`、Vue HTML `af0ab893…`沿用22:00完整SHA。432源码/576产物冻结前后不变，无页面、模型服务或外部请求错误；自有进程退出，57254/57271及57249/57266模型端口关闭。此构建未重测性能，不把21:46改善算作本批新性能证据。

失败保留：`/tmp/mira-pane-stop-before-20261010.TsTOqA/side-2026-10-10T14-06-52-138Z.json` 在旧 `e60073a2…` 明暗真实复现侧Escape无abort。中间 `9fb49738…` 在 `/tmp/mira-pane-stop-final-20261010.wzWuQB/side-2026-10-10T14-11-22-464Z.json` 明暗34项通过；同目录 `side-actions-2026-10-10T14-12-06-047Z.json` 保留侧编辑入口未对齐的真实失败。早期脚本对已被菜单隐藏的编辑器定位、停止文字两处匹配、查找/分栏动画未稳定时定位的false报告不覆盖；修正夹具操作焦点与等待，不为此改产品。

剩余与下次入口：最终截图和真实run-activity事件发现用户主动停止后，answering生成活动被运行器结算成failed，摘要因此显示“1项异常”；下一批从 `electron/services/harnessRuntime.ts` 的终态活动结算和 `run-progress.tsx` 的实际异常计数继续，须保留真正工具失败的显示。当前没有嵌入文件编辑器，不把只读预览称为编辑器验收。继续首屏/ZCode完整同态及已定位首开提交热点；computer-use仍无可调用工具，隐藏宿主不替代原生Mira/ZCode操作、远端模型、Windows/安装包或性能到顶。未提交/推送，分支 `codex/mira-harness-first-slice`；整体active。

以下22:00及更早保留各自源码、构建与结果身份。

## 当前完成、剩余与下一入口（2026-10-10 22:00）

完成：在真实冻结生产Electron复现侧Composer按Cmd+F打开主查找。参考ZCode SessionPane的focused/visible分离，主/旁共享MiraTaskFind但各自保存query/匹配位置；Cmd/Ctrl+F与Escape只由当前focused pane接收。可同时打开两条非模态查找，切换焦点不自动抢Composer；CSS Highlight只显示当前焦点结果，旧owner迟到cleanup不能清掉新owner高亮。关闭查找返回本pane之前的输入位置；关闭工作区让主对话重新接管快捷键。Command Center“查找当前任务”明确选择主任务。旁路不提供未接通的文件变更搜索，不假借主任务变更。

验证：新增真实ReactDOM双pane回归和Workbench接线回归，先复现失败再修复；定向5文件109项、全量177文件2933项、React类型/生产构建及diff通过。正式资源291JS/240动态目标/33许可/fresh CSS审计通过。main/preload/Vue未改或重建，Vue/严格Electron类型未重跑；既有Tailwind highlight警告保留。

宿主：隔离实际main/preload/Vue授权桥/生产React/SQLite，主旁各500轮，明暗最终各11项共22项通过，最终4图逐张复核。覆盖侧焦点Cmd+F、主/侧离屏canonical轮125/250挂载及高亮owner、独立query与草稿、回焦不抢输入、单paneEscape、收起后主快捷键及重开侧query、全关闭清理和分栏动画结束后查找条/主体无横溢出。这里是隐藏Chromium可信键盘及DOM断言，不代表OS人工操作或逐显示帧；本批功能计时不混入21:46性能分布，没有新的性能提速结论。

身份与证据：React JS `e60073a254ac6d1b32f7da0869535c972e60c118aa3e38303f3d30cb6232249d` / CSS `5bb3ff3560b709a4c74325e7bc629bc91087235a5bbc97e5c53b2dea32e7ac73`，main/preload/Vue沿用21:09身份。432源码/576产物冻结前后一致，当前五项主产物与freeze匹配。目录 `/tmp/mira-pane-find-final-20261010.K2eboc/`，最终明 `find-pane-final-2026-10-10T13-57-14-865Z.json`、暗 `13-57-31-507Z.json`、`vitest-full.json`、`bundle-audit.json`。页面/外部请求错误0，自有main/renderer与56667/56679端口退出。

失败记录保留：旧 `3672b89e…` 的 `/tmp/mira-timeline-buffer-20261010.c7IJbV/find-pane-before-2026-10-10T13-47-26-485Z.json` 确认侧F归主；新增3/4回归在旧实现失败。测试夹具首次缺任务正文导致find命令不存在、命令返回会自动收工作区导致测试误开，已按真实合同修正。首次许可改编记录更新晚于build，审计真实失败，重新build与新freeze后通过。J3vyTw缺helper依赖symlink、K2eboc旧home白名单和并发相同ms临时home碰撞均保留失败报告；只修fixture，未改产品绕过错误。初次明图处于200ms分栏动画，确认批等动画结束再断言几何；未凭中间帧改产品。

剩余与下一入口：继续首屏交互对齐，核对对话与终端/文件编辑器间快捷键归属、侧面板生命周期，再继续首开React/assistant-ui提交热点。原生computer-use不可调用，隐藏宿主不能替代Mira/ZCode原生同态、远端模型、Windows/安装包；整体目标未完成。当前分支 `codex/mira-harness-first-slice`，本批未提交/推送，不新增仓库临时QA文档。下方21:46性能只属于其JS身份。

## 当前完成、剩余与下一入口（2026-10-10 21:46）

完成：Timeline 历史预渲染缓冲由8轮改为4轮；保留完整canonical历史、Markdown、搜索、焦点/编辑轮次保留逻辑，不截短回复。稳定底部挂载消息18→10条。

性能：与21:29冻结JS `f474f2e8…` 同1440×900、500轮1000条完整消息、每轮八段正文与TypeScript，前后各三次独立非trace生产Electron，方法 `20261010-beforeinput-required-send-button-v2` 不变。首开中位115.9→97.9ms（3项，110.3–119.3→97.6–106.7ms），切回88.4→86.0ms（9项），Lexical输入30.15→30.10ms（12项），阅读恢复104.4→100.7ms（3项），已挂载轮次点击49.95→49.90ms（18项）。只确认本夹具首开改善，其余不声称显著提升。三次主轮250/−120px漂移0；首开仍有57/58/57ms长任务，性能未到顶。独立trace总首开154.4ms、React函数57.973ms/layout2.961ms，不混入非trace分布。

功能：明暗主/旁各500轮的开关、键盘分栏、导航卸载恢复与双草稿28项通过；长正文明主题与短回复密集列表暗主题共26项，覆盖十次实际Chromium可信wheel事件后两次rAF的可见窗口覆盖、Cmd+F离屏轮125及高亮定位、编辑轮移出视口后保稿/保挂载、取消释放。共54项隐藏宿主功能检查、6图逐张查看。短回复场景与并发功能计时不混入性能样本，也不声称逐显示帧或OS原生滚轮验收。

验证与身份：定向4文件51项、React类型/生产构建、291JS/240动态目标/33许可/fresh CSS资源审计通过；176文件2928项属于21:29的前一构建，本次不冒称重跑全量。当前React JS `3672b89e6694da090c1a794ba1835f2a1b49b392a4ec574a20e359f046459ac1`，CSS及main/preload/Vue HTML同21:29。432源码/576产物冻结、无页面/外部请求错误、自有进程与端口退出。

证据：`/tmp/mira-timeline-buffer-20261010.c7IJbV/`，性能 `results-2026-10-10T13-33-58-609Z.json`、独立诊断 `diagnostic-2026-10-10T13-35-26-939Z.json`；明暗长旁路 `long-side-results-2026-10-10T13-36-29-490Z.json` / `13-39-37-966Z.json`，滚动/搜索/编辑 `coverage-long-light-2026-10-10T13-38-22-820Z.json` / `coverage-short-dark-2026-10-10T13-39-37-997Z.json`。source-map全部291JS等长hash引用归一化后逐字节一致。

剩余与下一入口：复现并修复主/旁对话Cmd+F焦点归属，继续主界面交互对齐及首开提交热点。原生computer-use不可调用，隐藏宿主不能替代Mira/ZCode原生同态、远端模型、Windows/安装包；未提交/推送。以下21:29及更早保留原身份和历史边界。

## 当前完成、剩余与下一入口（2026-10-10 21:29）

完成：历史行首次挂载不再逐行同步读取布局，复用已测高度或估值，ResizeObserver 提交实际尺寸；阅读恢复与跳转仍批量实测后定位，运行末轮保留真实测量。修复旁路收起到零宽时把 17671px 的换行高度写入虚拟缓存，导致展开后总高度膨胀、滚动条失真。两个测量回归均先失败后通过，修改集中在 `MiraConversationTimeline.tsx` 及其现有测试。

功能验证：最终全量176文件2928项、React类型/生产构建与diff检查通过。主/旁各500轮1000条完整消息，明暗各14项共28项隐藏生产Electron检查通过，覆盖分栏开关、真实键盘拖宽、切换任务/卸载后双锚点恢复和独立草稿；主轮250、旁轮444均保留−120px偏移。旧冻结构建 `05bff045…` 在相同新增断言下真实失败（旁历史82215→2845123px）；最终明主题82215→89506px，额外正常测量不再产生百万级缓存污染。冻结真实父子存储与运行器的独立旁路明暗24项也重新通过。

性能验证：同1440×900、500轮完整正文与代码，前后各三次独立非trace实例，方法 `20261010-beforeinput-required-send-button-v2` 未变。恢复阅读中位147.9→104.4ms（3项），首开115.3→115.9ms（3项），切回长会话87.1→88.4ms（9项），Lexical输入30.0→30.15ms（12项）；三次锚点漂移均0。只确认恢复改善，不声称首开、输入或整体显著改善。最终独立诊断仍见首开64.415ms、恢复53.156ms函数任务，React/assistant-ui提交及GC继续待查；诊断不混入非trace样本，也不作为原生帧/INP/P95。

证据：前基线 `/tmp/mira-timeline-before-20261010.NAIegN/results-2026-10-10T13-13-59-010Z.json`；最终 `/tmp/mira-timeline-final-20261010.hSyK64/` 中 `results-2026-10-10T13-24-31-107Z.json`、`diagnostic-2026-10-10T13-25-30-715Z.json`、`long-side-results-2026-10-10T13-23-57-669Z.json`（明）、`long-side-results-2026-10-10T13-26-10-401Z.json`（暗）、`side-2026-10-10T13-26-10-412Z.json`、`vitest-full.json`、`bundle-audit.json`。最终共16图，本批逐张查看长阅读/恢复明暗4图与引用草稿明暗2图，不混称全16图人工复核。早期runner双编辑器定位/切任务后工作区收起定位失败保留false；旧缓存污染回归位于 `/tmp/mira-timeline-after-20261010.I4JeZm/long-side-results-2026-10-10T13-23-58-933Z.json`，没有改写旧报告。

身份：最终React JS `f474f2e85a273282aa92cd992ce00b29c33fb02c23502fa4a4c3b97f4ca41e85`；CSS `bb945f659d294ee66b80f108490de79ca32854c673598270a0dff0ab2c889210`；main/preload/Vue HTML沿用下方21:09身份，本批没有修改或重建它们。432源码/576产物前后冻结不变，291JS/240动态目标/33许可/fresh CSS审计通过；无页面或外部请求错误，自有宿主进程及端口均退出。Vue与严格Electron类型未重跑，既有构建警告保留。

剩余与下次入口：继续首屏/ZCode完整同态及首开React/assistant-ui提交热点；本批未调整上游overscan或未经证实的旁路padding偏移。原生computer-use目前不可调用，隐藏宿主/本机受控模型不替代原生对照、远端模型、Windows/安装包验收。Novel/媒体和P0–P3未放行；分支 `codex/mira-harness-first-slice`，未提交/推送。下面21:09及更早为历史批次，保留各自身份。

## 当前完成、剩余与下一入口（2026-10-10 21:09）

完成：选中片段可“在旁路对话中提问”，右侧打开真实独立会话与 Composer，引用只进入草稿，不自动发送。选中操作复用已有侧对话，工作区固定入口新建另一侧对话；同一父任务创建单在途，失效标签替换，迟到创建留在原父任务而不抢新导航。多标签/最近关闭按父任务保存。共享消息、工具与审批渲染已提取到 `MiraConversationMessages.tsx`，业务入口是 `MiraSideConversation.tsx`，不是委派子任务的只读记录页。

完成：Electron 通过第一方 `session.create-side` 建立父子关系，只继承稳定历史的正文/附件及压缩摘要，作为隐藏模型上下文；不复制活动执行、工具调用身份、计划、交互、队列或 Goal，不声称与上游完整 parts fork 字节等价。继承项目、目录、权限、Skill/MCP与已生效模型；新增已执行推理档位元数据，旧会话未记录的档位不凭空补齐，也不取主 Composer 未提交配置。

完成：侧对话独立 Controller、审批、停止和 owner 草稿/附件/待确认提交，刷新及关闭后重开能恢复；侧对话不写主任务恢复位置或全局模型偏好，不混入主侧栏/搜索/项目计数。父任务存在运行中或待确认的侧工作时禁止破坏性操作；主任务直接删除及归档批量删除均级联侧历史/附件和草稿过滤，迟到旧写入不能复活删除 owner。待应用指导复用真实队列展示与撤回，撤回只恢复侧草稿；Esc停止保稿。修正资源面板通用CSS覆盖侧对话正文的11px/灰色及额外padding，实测正文与主对话同字号/颜色/行高。

验证：`/tmp/mira-side-final-host-20261010.GyD0xL/vitest-full.json` 全量176文件2926项通过，包含归档父子清理和生效档位继承回归；React类型、React/Electron生产构建及diff通过。随后补两行待应用指导渲染与许可记录，React类型/构建重新通过，定向5文件145项通过（96+49），没有冒称再次全量。Vue与严格Electron类型本批未重跑，既有构建警告保留。

最终宿主：`/tmp/mira-side-guide-final-20261010.vUzxWy/side-2026-10-10T13-07-38-583Z.json` 明暗各12项共24项通过，真实未改生产main/preload/Vue/React/grant/IPC/SQLite/HarnessRuntime/Agent；仅模型使用隔离localhost SSE。覆盖创建/复用/独立正文与档位、引用无自动发送、原主草稿与消息不变、刷新恢复、真实工具审批与隔离目录写入、待应用指导与撤回、Esc停止、关闭flush/最近重开、第二侧对话。最终12图已生成，本次逐张检查其中明暗回复/审批/指导6图；此前同CSS `0f637400…` 的10图已逐张检查，不混称12图全部人工复核。短主会话检查不替代长会话阅读保持验收。

身份：main `bc6d76af1dcb3878d833f23c036d9575f1f6496f7a604c582c9da46a323d4462`；preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`；Vue HTML `af0ab893daf09ccd79b59367d2a3ccd0a57fd9efcd0d721b00e0eb97286902b7`；React JS `c62cbc3e2155a9112f87875ad1dc183a1b7d82680b2bc49fca111abd002e08ae`；CSS `bb945f659d294ee66b80f108490de79ca32854c673598270a0dff0ab2c889210`。最终432源码/576产物前后冻结不变，291JS/240动态目标/33许可及fresh CSS审计通过，无旧块、页面或外部请求错误，自有进程退出、55388/55404及模型端口关闭。

失败保留：最初全量2项旧mock缺少新store方法已修；最终目录首次缺依赖symlink导致启动失败报告保持false。指导回归在旧冻结构建中真实复现无待应用行；临时symlink路径身份断言、补行后有草稿使主按钮变成“引导当前任务”的runner停止定位失败均保留false。最终改按真实Esc停止，未改变产品来满足夹具。

剩余与下次入口：继续完整首屏/ZCode同态与长会话性能热点，优先调查既有trace中的TanStack测量/React提交，不跳回文件或媒体支线。旁路的长历史阅读恢复/分栏重排、真实远端模型与原生同态仍待验；未插入成功的引用重试只保存在当前挂载内存，不承诺刷新恢复。当前无可调用computer-use工具，隐藏CDP不是原生操作或显示帧/P95验收。Novel/媒体、Windows/安装包及P0–P3未放行；本批未提交/推送，分支 `codex/mira-harness-first-slice`。

以下20:21及更早为历史批次，保留各自源码与产物身份；旧“旁路尚未实现”不覆盖上方状态。

## 当前完成、剩余与下一入口（2026-10-10 20:21）

完成：对照 ZCode `toolbarShortcuts.ts` 修复长按 Ctrl+M 反复开关模型菜单、Ctrl+Shift+M/Ctrl+T 反复切换配置和 Escape 重复停止；新增复现先红后绿。原有 Composer/全局作用域、模态与编辑器让键、IME/229 保持。

完成：对照上游 `ConversationSelectionTooltip`、`SelectionActionMenu`、`useTextSelection` 和引用边界接入“添加到当前任务”。只接受当前主对话内同一消息、同一正文/公开思考/已展开工具记录区域；跨消息/区域、按钮/summary/输入和模态不接受。浮层跟随原选区、限制在应用画布内；滚动、缩放、切任务/隐藏和 Escape 撤除，Escape 不落到停止任务，点击前重验原文本及来源，虚拟卸载或流式变化不引用过期 DOM。

完成：选中快照作为 Mira 自己的 `selection` canonical Lexical 引用，短标签保留原文 tooltip，发送使用原文；在保存的光标处插入而不替换已有草稿选区，支持原子删除/撤销/重做、去重和偏好刷新恢复。单片段8000字、最多8片段、片段正文总计16000字，错误保稿。正文/思考/工具输入输出和普通命令展示均挂独立region；未展示载荷不凭空读取。保留 ZCode LICENSE/NOTICE 并补改编记录，不复制上游全局store/RPC或协议标记；最后去掉 selection 标签不适用的@前缀。

验证：相关6文件210项通过；全量 `/tmp/mira-selection-host-20261010.qf5BdV/vitest-full.json` 为176文件2914项全部通过，React类型、React与Electron生产构建、diff检查通过。随后仅一行CSS去掉@，React生产构建与最终宿主/资源审计重新通过，未冒称再次全量。Vue类型与严格Electron类型本批未重跑；现有Tailwind highlight、Vueuse注解及导入警告保留。

最终宿主：`/tmp/mira-selection-final-host-20261010.Vy4TAY/selection-2026-10-10T12-20-58-689Z.json` 明暗各10项共20项通过，6图逐张查看。冻结未改生产Electron main/preload/Vue/React、实际grant/IPC/SQLite/HarnessRuntime/Agent；模型仅为自有localhost SSE。实际正文选区浮层、光标6处保两侧草稿、去重、滚动关闭、SQLite偏好刷新恢复、思考/工具输出独立引用、一次实际提交与模型请求完整包含原文、成功清稿通过。图验证明暗浮层及标签，未声明每种选区均完成原生鼠标操作。

当前身份：React JS `4a7c35bc2c2938407e8cb0d3ee6c04ed5c9bcb1326c5771368dc615325ab4401`；CSS `5a86a74553c360fd5fa476e4cce9a8a96bfac38f0814bbdb05b61ce653e9b186`；main/preload/Vue HTML与19:56身份相同。最终 `bundle-audit.json` 确认291 JS/240动态目标/33许可及正式CSS一致，无旧块。冻结430源码/576产物前后相同，页面/外部请求/受控服务错误0，自有进程退出、54372/54387与模型54367/54382端口关闭。

失败记录：旧目录12:16临时目录realpath断言、12:17模型菜单aria-hidden导致编辑器定位失败、12:18偏好由平台IPC而非Harness IPC记录及光标异步时序、12:19summary角色误判均保留false报告，修正runner未改变产品满足夹具；12:20同JS旧CSS20项通过。最终CSS使用新冻结目录验证，不覆盖旧身份。

剩余与下一入口：ZCode独立旁路对话（选中后在右侧可编辑会话继续提问）尚未实现，当前没有假入口或将其映射为委派子任务；下一批接真实独立session/controller、父/侧草稿归属、侧栏tab与生命周期/审批。再继续完整首屏/ZCode同态与已定位性能热点，不借本批测试通过宣称性能到顶。computer-use工具当前不可调用，隐藏CDP/受控模型与原生/远端验收分别记录。Novel/媒体、Windows/安装包及P0–P3未放行。本批未提交/推送，分支 `codex/mira-harness-first-slice`，整体active。

以下19:56及更早记录保留各自源码与产物身份。

## 当前完成、剩余与下一入口（2026-10-10 19:56）

完成：修复已进入运行器但仍在等待项目锁的 queued 子任务停止后重新启动、重复终态回调的问题；停止会中断锁等待，由运行器结算一次。取消等待写锁后立即重新调度，使后续读任务不被已取消的写任务阻塞。两项真实锁回归先失败后通过。

完成：实际生产流复现父任务已在 `wait_for_tasks` 等待报告，但三个子任务仍分别追加 follow-up，造成四次相同收尾回复。协调器现在按等待范围抑制重复提醒；指定范围外的任务和等待结束后新任务仍正常通知。全部/指定等待两项真实 child Agent 回归先红后绿。对话工具行及新活动标签将委派/查看/等待/停止子任务显示为中文，无 target 的短工具行不再按40%裁切名称；原始调用记录保留真实工具身份。

验证：锁/停止定向7文件154项、追加契约/子消息6文件202项通过；报告去重修复后5文件59项，以及标签/摘要/父运行/消息队列4文件122项通过，未冒称重跑全量。报告分别保留在 `/tmp/mira-subtask-stop-host-20261010.soFcb6/` 和 `/tmp/mira-child-report-stop-host-20261010.HNcIUv/`。React类型、React/Electron生产构建、diff检查通过；严格Electron类型本批未运行。

宿主：最终 `/tmp/mira-child-stop-label-host-20261010.FzuQi9/stop-2026-10-10T11-54-50-662Z.json` 明暗各10项、共20项通过。实际 Composer提交、主进程grant/IPC、HarnessRuntime/SubtaskRuntime/Agent、SQLite和生产React均未替身；仅模型使用自有localhost OpenAI SSE。摘要/父对话/子面板分别停止对应child，兄弟继续、公开部分回复保留、按钮撤除、停止IPC每child一次、真实HTTP流关闭；父任务只收尾一次，刷新后状态与正文仍在。中文标签与实际未裁切尺寸确认，8图逐张查看，截图等待分栏动画结束。冻结428源码/576产物前后相同；请求/页面/受控服务错误0，自有进程退出，53665/53687及模型53660/53682端口关闭。

当前身份：main `4c03afd336904a92d41eccefe25e1757c4c5ea7ad0e3af20c44af89fff8b39f6`；preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`；Vue HTML `11ea11706f2edf354f4d48094aa21d48a324d151b226b9d6309e9b9fc519de4f`；React JS `7664039e14d894536f5d7677f8d308448d3ba1a31a0b1c4677d6bc3482150d53`；CSS `577b13fa49c7622563ead38a83da03f4ac8ecde82407b71b774fd7a4bc17a41b`。同目录 `bundle-audit.json` 确认291 JS/240动态目标/33许可与当前源码、正式CSS一致，无旧块，原ZCode LICENSE/NOTICE保留。

失败记录：11:43/11:45分别为React提交时序、隐藏details同一child记录的定位问题，只修runner，不改产品；11:47报告保留实际重复答复。11:50的旧标签构建18项通过仅代表其身份，不覆盖最终20项。首次审计在临时目录初始化esbuild造成默认工作目录不同，已显式指定实际仓库并重新审计，未因此改产品。

剩余与下次入口：继续首屏完整原生/ZCode同态与已定位的长对话测高性能热点；当前computer-use不可调用，隐藏CDP结果不冒充原生鼠标/输入法、真实远程模型或性能验收。刷新只证明相同隔离宿主内存储恢复，不冒称重启。部分完成提醒在父任务开始等待前已经入队的情形未由本批覆盖。Novel/媒体、Windows/安装包及P0–P3仍待验。本批未提交/推送，分支 `codex/mira-harness-first-slice`，整体目标active。

以下19:35及更早记录保留各自源码与产物身份。

## 当前完成、剩余与下一入口（2026-10-10 19:35）

完成：实际30轮完整历史与存储计划的隔离生产 Electron 复现了打开右栏后，第15轮/−120px变为可见第8轮、原锚点+4153px。根因是宽度重排与虚拟行分批测高后，滚动记录被新的布局覆盖。`useConversationScroll.ts` 现在保留重排前的轮次/偏移，在最后宽度变化120ms后通过既有 Timeline 恢复；期间不让布局事件覆盖记录或逐行补偿，wheel/滚动条/键盘导航/回到底部可取消旧补偿，卸载清理计时和帧。保持ZCode摘要浮层策略，不新增固定摘要栏。

验证：新增复现及用户接管两项，复现先失败后通过。相关5文件/72项全部通过，报告 `/tmp/mira-pane-reading-host-20261010.suXSm1/vitest-scroll-final.json`；React类型/生产构建与 `bundle-audit.json` 通过，291 JS/240动态目标/33许可一致，无旧块。当前JS `eadb625663fdf4aca28dafd18114815a38fdb595f24c01606434275bef2dda39`，CSS/main/preload/Vue HTML与19:15身份相同；Vue/Electron类型或构建未额外重跑，未修改对应源码。

宿主：`/tmp/mira-pane-reading-host-20261010.suXSm1/geometry-2026-10-10T11-32-19-800Z.json` 明暗各16项、共32项通过。实际1100px/1300px对话容器覆盖auto/mini/panel；窄区摘要开合的正文/Composer宽度、滚动及锚点完全保持，宽区面板与正文/Composer不重叠。右栏开合、键盘与CDP鼠标拖宽均保留第15轮/−120px，重开保留选择的比例且真实host偏好保存匹配，回到底部后开合继续追底。6图已复核：其中4图与前次同身份已查看截图逐字节一致，其余2图重新查看。冻结428源码/576产物前后相同；外部请求/页面错误0，自有进程退出、53105/53118端口关闭。

失败边界：11:24报告为新夹具缺少依赖软链导致启动失败，非产品结论；11:25报告保留真实阅读跳动，未改写成功。单测首次先红，之后计时替身问题只修测试；正式生产修复通过独立宿主再验。11:30报告先确认22项，11:32报告补真实保存/拖动阅读/追底。以上是隐藏生产宿主/CDP，不能称原生computer-use、真实模型、重启数据库恢复或完整性能验收。

剩余与下一入口：继续完整首屏ZCode同态、原生鼠标分栏及活动子任务主动停止；性能按已记录trace调查，不借本批几何通过声称提速。computer-use目前不可调用；锁屏期间继续可执行的源码与隔离宿主工作。真实模型/调度、Novel/媒体、Windows/安装包和P0–P3仍待验。本批未提交/推送，分支仍为 `codex/mira-harness-first-slice`，整体目标 active。

以下19:15及更早记录保留各自源码与产物身份。

## 当前完成、剩余与下一入口（2026-10-10 19:15）

代码：仓库 `/Volumes/VrenDisk/project/Mira/Mira-Harness`，分支 `codex/mira-harness-first-slice`，HEAD `f171499`（17:55，UI界面更新）。本轮开始时工作区干净，本批改动尚未提交/推送；下方历史状态与旧产物身份不扩大为现在的验收。

完成：完整公开 `input.command` 优先于旧展示 target；保守识别所有段都为读取/目录/搜索的静态 bash，动态/脚本/重定向/混合执行保持执行展示，不影响授权。连续调用分别归“查阅”与“执行”，真实计数、运行项优先、失败/取消可发现，审批保持组外；正文/思考/不完整记录/run/child 是边界，流式尾组结束后旧 running 子项不重新开启阶段。两层展开按明确 owner 恢复，真实详情按需挂载；展开命令不重复摘要标题，已修明暗“终端”短标签裁切。

完成：显式 `+` 获得菜单焦点，方向键/Enter/Space可选，Escape/再次关闭恢复原完整选区，输入 `@`/`/` 保留编辑器焦点。相同 owner/正文的 token 内纯光标移动保留完整查询、替换范围和候选高亮，不重复搜索；非末端确认保留两侧正文，文本编辑/范围选择/移出/切任务失效。侧栏重命名等实际保存成功才退出，失败保留输入，IME/重复提交/旧请求隔离。

完成：B 切换侧栏，关闭后仍可复开；K/Shift+P/侧栏/Shell 复用一个应用所属搜索，Vue Shell 自身获焦点也支持两组搜索键。开关与搜索 hover/focus 提供提示。普通 PlainText Composer 的 B 对齐 ZCode，文件编辑器/终端保留自身 B 是 Mira 明确取舍；modal/menu、IME/229、repeat 和已消费事件不发起工作台动作。另修 Radix capture Escape 在输入法合成/229 时误关闭搜索，保留查询和焦点，普通 Escape 仍关闭并回源入口。

验证：命令/焦点/重命名/测量合并全量 173 文件/2870 项通过；随后 token/快捷键整合全量为 `/tmp/mira-firstscreen-keyboard-integration-20261010.rU8vCA/vitest-final.json`，174 文件/2893 项全过。此后 Vue 搜索两行与新增 5 项回归，相关 3 文件/32 项在 `vitest-shell-final.json` 通过；搜索 Escape 新增两项实际 React/Radix DOM 用例先红后绿，相关 4 文件/67 项于 19:08 通过，不冒称此后再次全量。React/Vue 类型、React/Electron 构建通过，最后 Escape 修正后 React 类型/构建重新通过；严格 Electron 类型未重跑，既有诊断不称已修。命令标签工具定向 4 文件/78 项与补跑探索 1 文件/19 项通过，初次不存在的探索文件名已按真实路径补验。

已确认的宿主：JS `ac70ca07…`/CSS `f0164018…`/Vue HTML `11ea1170…` 的独立冻结生产 Electron/main/preload/Vue grant/React 明暗各 13 项，共 26 项通过；报告 `/tmp/mira-keyboard-host-20261010.XBz907/host-keyboard-2026-10-10T11-11-24-144Z.json`，12 图经代理复核，总控查看前次同身份 12 图并核对末次 9 图逐字节相同、其余 3 图重新查看。覆盖真实 Composer B 开关/保稿、六搜索入口单 Harness 弹窗/精确回焦且 Vue 搜索 0、菜单/合成/repeat/229 保护、`@` ArrowLeft 保留高亮且 files.search 2→2、非末端引用真实 stage/整 token 确认、`/plan` 保前后正文、`+` 菜单键盘、实际 rename IPC、完整命令/独立审批及跨任务展开记忆。早期 modal aria-hidden role selector 与宿主记录字段定位的夹具问题只修 runner，三份 false 报告保留；末次 review 分别检查各 B guard 和准确候选身份，不以多个事件抵消或仅存在任意引用作为通过。

当前构建：main `95e415562e2581b6a214d51815a0bf247b02e3daacbb1a508009a6f5d8a7cac8`，preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`，Vue HTML `11ea11706f2edf354f4d48094aa21d48a324d151b226b9d6309e9b9fc519de4f`，React JS `81e2705d5cadbd8625df9c69e013bb4a4cffd7bcc99c0020ddd26de36f21f4d0`，CSS `f01640189fe49e128f2f0c8739315401a0842ee9969cff4725b0ff30d5f292c9`。最终资源审计 `/tmp/mira-search-escape-integration-20261010.OPlwSz/bundle-audit.json`：291 JS 与当前源码构建一致、240 动态目标、33 许可及正式 Tailwind CSS 一致，无旧块；原 ZCode LICENSE/NOTICE 保留。

最终 Escape 定向宿主：新的 `81e2705d…` 独立冻结副本在 `/tmp/mira-search-escape-host-20261010.TEgtfE/search-escape-2026-10-10T11-13-38-144Z.json` 明暗 12 项通过，Composer/Shell 两入口分别验证合成 Escape/229 保留 query/focus/单浮窗，实际普通 Escape 精确回焦；2 图经代理与总控查看。两版 428 源码/576 产物前后身份一致，报告记录页面错误/外部请求 0、自有进程及端口退出，总控独立核对端口。公开工具/项目数据写入隔离 SQLite，pending 仅在真实 grant 验证后注入，未点击审批或执行模型/命令/系统剪贴板。合成事件不等于原生输入法；`+` 只确认菜单焦点与正文，不声称原生 caret offset。旧 ac70 的 26 项不改称最终 81e 全量验收，旧 2e/4a 工具结果仍保留原身份。

性能：Timeline 历史行复用 TanStack 高度缓存，恢复/跳转先批量读取再更新。前后各三次500轮同方法隐藏 Electron：首开122.1→119.1ms、暖大会话91.2→95.0ms、输入29.9→29.9ms、阅读恢复156.8→155.2ms，整体基本持平；阅读恢复≥50ms任务由每次2项→1项，anchor250/−120px漂移0。准确报告身份、诊断和谓词版本见 [性能记录](MIRA_HARNESS_PERFORMANCE_2026-10-08.md)，不能把2e测量扩大为当前81e性能验收。

上一轮原生结果：已实际查看子任务、独立滚动、文件入口、摘要恢复、键盘分栏及明暗主题；原生鼠标拖宽未验证成功，主动停止因任务先超时而未完成。隐藏宿主操作与原生操作分别记录，不互相替代。核对 ZCode `conversationLayout.ts`/`SessionPane.tsx`/`ConversationStatusPanel.tsx` 后确认：对话容器 <1280px 的显式 panel 本就允许局部覆盖正文，不把它当作 Mira 漏功能或新增固定栏；自动模式/宽容器让位以及展开收起后的阅读保持仍待原生几何确认，具体合同已同步交互规范第 6.3 节。

现场变化：本轮核对发现旧 `/tmp` 夹具、报告、截图与清理备份已不在；下方测试数字、旧 SHA 与观察保留为当时记录，不能从这些失效路径重新复核。清理记录为净删 76 项、29 tracked；tracked 内容可从删除前的 Git 提交恢复，非 tracked 的本机备份当前不可用，不继续承诺全部可恢复。新检查仍仅存 `/tmp`，完成摘要写入现有文档。

剩余与下一步：本批隐藏键盘/单浮窗/token 确认已收尾；在 computer-use 可用时补完整首屏原生矩阵与 ZCode 同态，重点鼠标分栏、活动子任务主动停止和摘要模式/几何/阅读保持。现有 trace 的阅读恢复新行测高仍约21.925ms（含重叠布局18.357ms），会话重挂使组件内cache重置，跨会话/宽度缓存只列调查点，尚不实施未经失效验证的优化；首开主要分散于React/assistant-ui/GC，不猜测改Markdown。当前无可调用 computer-use，锁屏期间只做代码和隔离宿主，不用隐藏CDP冒充原生。真实模型/调度、独立Novel搜索、其他媒体、Windows/安装包及P0–P3仍待验；下次从上述首屏项继续，不返回已关闭文件支线。

以下 17:14 及更早记录为历史，验证范围和产物身份不扩大为本轮结果。

## 当前完成与下一入口（2026-10-10 17:14）

完成：使用 `react-resizable-panels` 4.8.0 实现对话/右栏比例分栏，右栏默认 45%、最小 240px、最大 65%；鼠标/键盘调整、偏好持久化及旧像素偏好迁移已接。移除 1180px 模态覆盖，实际窗口缩放空闲 300ms 后按对话宽度收栏，显式打开不立即被收起；开合 200ms 动画、减少动态效果、拖动接管及中途缩放取消已处理。偏好写入失败可传给导航，后续操作可重试，不再吞掉失败。

完成：子任务从真实 Agent 事件保存公开正文、公开思考及工具引用，React 复用主对话渲染器，具备独立滚动、暂停跟随/回到底部、悬浮摘要和停止；旧记录保留真实活动/报告 fallback。工具按 session/run/child/响应/调用序号隔离；provider 重复 ID、只有最终消息才补齐的文字与工具顺序、累计用量、停止后保留部分消息和重启恢复均有回归。父运行结束先等待子任务收尾，不公开引擎原始消息、系统提示或签名。

代码验证：171 文件/2831 项全部通过，报告 `/tmp/mira-pane-child-closure-20261010.iAcp5v/vitest-after-fixes.json`；React/Vue 类型与 React/Electron 构建通过。全量结果先于最后两处纯 CSS 正文修正；修正后重新构建、产物审计和实际明暗 computed style 检查通过。独立严格 Electron 类型仍有既有诊断，不以 Vue 检查替代。最终审计 `/tmp/mira-child-dark-audit-20261010.N0rjXj/bundle-audit.json`：291 JS、240 动态目标、33 许可文件，无缺失、差异或旧块；ZCode 原 LICENSE/NOTICE 未改。

当前构建验收：main `95e415562e2581b6a214d51815a0bf247b02e3daacbb1a508009a6f5d8a7cac8`；preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`；Vue HTML `1963f7bcff975c8afeedf863bb3ee4de0f0432872827ee36d2ced8537de96d98`；React JS `381c668d5b042663769c31dbb9a123d0e5384ab0c5e645698efc0e8664c9d899`；CSS `145823f1f6dbe0ab70aab006bb4d7c9eddb5d0c48da76d8b965210d4fa6cb20c`。隔离 Electron/main/preload/Vue grant/生产 React 联动 25 项通过、errors 为空；报告 `/tmp/mira-pane-child-host-20261010.zIC91owZ/pane-child-results-2026-10-10T09-00-30-888Z.json`，同时间戳目录 18 张浅深截图经代理与总控逐张查看。真实 Runtime/Coordinator/Agent/工具/SQLite 已使用；模型输出和父助手编排明确受控，无真实模型/网络验收。正文两主题均与主对话相同 14px/24.5px，引用保留辅助色；展开摘要在内容顶部预留高度。两个 helper 有序关闭，进程/62759、62780 端口退出，576 产物/339 源码前后身份未变。

失败与边界：首次全量 12 项是旧 window timer mock 缺失，修正夹具后最终全量通过；真实 Agent 的最终消息排序回归先失败后修复。隐藏宿主 `08-36-58`、`08-38-02` 的滚动失败是夹具跟随状态/内容不足，原报告保留。`08-49-48` 发现真实暗色正文色差，产品修复后新 25 项通过，不覆盖旧 false 报告。当前可见窗口前次只读探针选错 iframe 的失败也保留，已用精确 iframe 修正；临时探针不算产品变更。旧原生 `/tmp/mira-native-alignment-20261010.Yux3a9/REPORT.md` 的 8 图只覆盖当时版本，不当作当前新构建通过。

剩余与下次入口：当前有限原生分栏/子对话操作收尾后，继续首屏完整原生覆盖及当前构建的首次打开、输入和长对话性能，针对实际瓶颈修复。命令语义分组、真实模型/调度、PDF/视频、独立 Novel 搜索、跨 owner 预览/监听、Windows/安装包/P0–P3 仍待验。遗留净删 76 项/29 tracked，有本机可恢复备份；清理审计核对 34 文档/496 本地链接无失效。仓库与分支为 `/Volumes/VrenDisk/project/Mira/Mira-Harness`、`codex/mira-harness-first-slice`，保留无关 dirty 修改，未提交/推送，不新增仓库临时测试报告。

以下 15:12 记录保留原实现与代码证据；其中“新宿主正在准备”是当时状态。

## 当前完成与下一入口（2026-10-10 15:12）

完成：读取/列目录/搜索/抓取显示轻量摘要，成功状态隐藏，调用记录由 hover/focus 的独立入口展开；连续两项及以上明确只读工具合并为“查阅”，不跨正文/思考/缺失记录/其他 run/写入/审批边界。分组身份锚定首项，展开状态随会话/运行保存，子项按需挂载；流式阶段结束由后续权威 part 判断，不把已完成的最后子项当成阶段结束。失败/取消可发现，统计按真实工具调用数量。运行折叠态可直接打开当前文件，缺少目标的读取被跳过，文件子按钮的键盘动作不展开父组。

完成：工具行对齐 14px 字号、16px 静态图标、hover/focus 右箭头和展开旋转，运行文字扫光支持减少动态效果。文件类型图标、文件名及旁侧目录共同显示，同名文件可分辨；外部/不可授权路径仅显示、不提供预览。16 个 Material Icon Theme 原图与固定提交核对，MIT 原文和来源独立保留；原 ZCode LICENSE/NOTICE 不变。生产/开发 SVG 使用本地 data URL。独立面板/芯片 CSS 已显式加入 Tailwind 正式入口，避免被生产构建覆盖；最终产物确实含新选择器。设计检查仅在工具样式文件登记运行状态扫光的限定例外。

完成：实际计划活动存在时隐藏成功 set_plan，失败/审批/缺少活动保持原记录与分组边界。父对话智能体为单行入口，独立右侧页签保存明确 session/run/child 归属，关闭/恢复/排序保留身份；“查看本轮执行过程”打开对应 run，旧记录不跟随最新运行。子面板展示真实任务、活动、文件、报告、错误、时间、用量与关联工具；不制造 child transcript/thinking。停止仅当前活动 queued/running owner 可执行，按钮防重/等待/失败可见；导航、换运行或卸载后迟到失败不覆盖新页面。

修复：Coordinator 从真实 registeredTools.prepareTool 取得 canonical 父调用 ID，原 raw ID 调用者兼容；历史 fallback 仅在整个 run 唯一时关联，歧义记录可从真实智能体列表打开。子活动使用每次实际调用的独立 ID 与当前执行对象，模型重复 provider ID 不结算到旧活动；取消/终态后忽略事件并退订。SubtaskRuntime 仍明确 sequential，不新增并行运行假设。

代码验证：最终 168 文件/2807 项全过，原始报告 `/tmp/mira-exploration-subtasks-20261010.uHwtEM/vitest-after-fixes.json`。React 类型、生产 React 与 Electron 编译通过；Vue 类型/严格 Electron 类型本批未重跑，不声称既有严格诊断消失。首次全量 `vitest-results.json` 为 2804 通过/3 失败，保留不覆盖：旧成功状态断言随交互更新；文件断言先误改到终端分支，后正确区分不可点击展示与预览动作；94380 字符长行高亮在并行检查时超 15s，独立两 worker 原断言约 7s 通过，未放宽超时或修改高亮代码。57 项复核与最终 maxWorkers=2 全量通过；不把测试调度变化称为产品性能提升。

冻结身份：main `da07871d755bef5dce66f28f9f7989b26b38c75c5b50d8543b4467564dfa563f`；preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`；Vue HTML `1963f7bcff975c8afeedf863bb3ee4de0f0432872827ee36d2ced8537de96d98`；React JS `ebd6afcd89c5c45d368ab82a4cfe36eb48f45600573c55ee2c31d4fd7ef6f37e`；最终 CSS `5f5828e5b251ea9e4b3aa7f975fdf6364c8005181c20955440448198ea00f63f`。早期 CSS `5469037d…` 的通过审计保留，只证明当时一致性，不覆盖加入面板/芯片后的最终 CSS。

产物审计：最终报告 `/tmp/mira-exploration-subtasks-20261010.uHwtEM/final-audit.7i1SA9/bundle-audit.json` 通过，291 个 JS 与当前源码构建一致、240 个动态目标完整，无缺失/差异/旧块；最终 CSS 与正式 Tailwind 输出一致，31 份许可及 NOTICE/HTML 完整。此检查只证明构建与资源一致性，不替代交互或性能验收。

原生参考：实际 computer-use 已只读观察 ZCode 历史的“查阅”、搜索失败与独立子智能体侧面板，证据 `/tmp/mira-zcode-readonly-tool-ui-20261010.6g12ep/OBSERVATIONS.md`。查阅/搜索/子任务关键图已人工查看；运行态依据源码，没有发起新 ZCode 任务。本观察用于实现依据，不能当成新版 Mira 的同态验收。

剩余与下次入口：对上述冻结版本运行新隔离 Electron/main/preload/Vue grant/生产 React 的查阅、计划、run/child 页签和停止联动，复核明暗截图，再完成实际 Mira/ZCode 原生对照。完整 child timeline 需真实公开子消息和 scoped events；当前子活动面板不声称等同。命令语义分组、慢首开与完整首屏原生覆盖随后继续，不回到已关闭文件工具批次。真实模型/调度、PDF/视频、独立 Novel 搜索、跨 owner 预览/监听、Windows/发布/P0–P3 仍待验。遗留净删 76 项/29 tracked 与本机可恢复备份沿用原批；本批未提交或推送，不新增仓库临时测试报告。

## 历史工具批次（2026-10-10 14:28）

更新：2026-10-10 14:28 +08:00（命令输出与编辑 diff 批次收尾）。
状态：侧栏、Lexical Composer 及本批工具展示已实现；最终全量 164 文件/2744 项通过，明暗隐藏 Electron 工具检查 23 项通过、22 张截图逐张复核。完整 ZCode 复刻目标仍 active，原生同态与真实模型尚未验收。

## 本批完成与下一入口（2026-10-10 14:28）

完成：终端工具显示真实命令和五行输出视口，运行时吸底，上滚冻结阅读记录，回到底部恢复新输出，结束保留阅读位置；滚动边缘渐隐，参数按需展开。失败与取消保留实际部分输出，同一错误前缀不重复。Runtime 接入真实工具 `onUpdate`，终态/取消后忽略迟到投影。

完成：编辑/写入优先展示历史记录的 diff，支持 Mira 编号格式与完整 unified diff，显示真实行号、记录变更数量、明暗红绿背景及 Worker 异步语法高亮；原始调用记录仍可查看。不完整或未知格式保留原文，不读取当前文件冒充历史变更。

修复：真实 2005 行命令触发框架临时日志时，原沙箱会拒绝追加而把成功命令判失败。现在仅授权本工具环境登记、仍存在且 canonical 路径不变的精确普通临时文件；父目录、其他文件、其他环境、符号链接、目录及删除后重建不获授权。cleanup 清登记表，不声称日志自动回收或 OS 原子沙箱。公开输出同时保留框架截断标记，不公开内部 details。

验证：React 类型检查、React/Electron 构建、资源包一致性及 diff 检查通过；291 JS、240 动态目标、29 许可文件一致。最终原始测试报告 `/tmp/mira-tool-display-final-20261010.OETPCI/vitest-after-fixture-fix.json` 为 164 文件/2744 项全部通过。Vue 类型与严格 Electron 类型本批未重跑，既有严格类型诊断未顺手修改。

失败记录保留：此前全量报告 `vitest-results.json` 为 2743 通过/1 失败。既有搜索测试假定 `loop` 只返回一个候选，但绝对路径模糊匹配会受随机临时根名影响；独立复现同样的额外合法候选后，最小修正为验证精确目标首位、唯一及无循环/目录链接后代，外链与损坏链接仍排除。未修改产品搜索逻辑；56 项定向及最终全量通过，旧失败报告未覆盖。

冻结身份：main `0072bc99099ae109c4021fcefb2cfdad95d863cda43ff3cf0440c561a01d9e0a`；preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`；HTML `1963f7bcff975c8afeedf863bb3ee4de0f0432872827ee36d2ced8537de96d98`；JS `0ee3de0ea449ae5b2669e97296c6b165f1fd6f201ae15f60b00da2b7293e3df0`；CSS `5ee5931b17d654ab5169f3655c26203058d23815fd8d4177e7976056996aeb0e`。旧 Composer、性能与早期工具报告继续保持各自构建身份。

宿主：`/tmp/mira-firstscreen-ui-host-20261010.Ud4WxF/tool-results-2026-10-10T06-20-07-394Z.json` 为 `passed=true`、23 项。实际编译 main/preload、Vue grant/MessagePort、生产 React 与隔离 SQLite，工具 helper 由冻结 Runtime 源码编译，实际执行本地 read/edit/write/bash。验证磁盘改动、流式冻结/回底/最终行、失败取消去重、2005 行截断与完整磁盘日志、旧格式和原文安全展示、重载。22 张浅深截图经代理与总控逐张复核；各主题 10 张为组件裁切，1 张为完整工作台，2005 行图只展示头部，完整尾部由 DOM 与磁盘字节断言验证。

边界：assistant/run 容器受控，无真实模型、外部网络或调度；隐藏窗口/CDP 不替代 OS 输入、原生 ZCode 同态、Windows/发布或性能验收。五 SHA 和完整 572 个产物前后不变，自有宿主/工具进程与端口已关闭。前四份工具失败报告保留；其中真实长输出权限错误已修，其他为夹具定位/调度修正。第二次失败运行遗留的自有 shell 已精确清理并记录在 `cleanup-followup-audit.json`，不把早期仅检查 Electron 的结果写成当时所有进程均退出。

电脑可用性：14:27 的真实 computer-use 只读 `getState` 已成功返回应用清单，无锁屏错误，桌面现可读取；未聚焦、输入或截图。这只确认后续原生对照可继续，不等于本批已做原生 ZCode 验收。

性能：新版 Lexical 的三次独立 500 轮采样已完成，首开中位数 140.7ms、切大会话 109.2ms、实际输入 40.25ms，仍有首开慢尾；输入改用真实编辑器事件，不与旧 textarea setter 比退化百分比。具体分布、第四次诊断及限制见 [性能记录](MIRA_HARNESS_PERFORMANCE_2026-10-08.md)。采样属于此前 Composer 构建，不覆盖本批工具产物。

剩余与下次入口：先补读取/搜索的轻量摘要和连续只读工具“探索”分组，再处理成功计划重复、子任务独立活动面板与“查看本轮执行过程”的准确 run 联动；均使用现有公开数据，不造子 Agent 聊天。随后做完整原生/ZCode 同态与性能瓶颈复核。PDF/视频、独立 Novel 搜索、跨 owner 预览/监听、真实模型/调度、Windows/发布/P0–P3 保持独立待办。遗留清理仍为净删 76 项/29 tracked，有本机可恢复备份；本批未提交或推送，不新增仓库一次性测试文档。

## 历史批次（2026-10-10 11:49）

以下 Composer 证据保持 `b85d6be2…`/`3f04bf3c…` 原构建身份；旧“下一步”只描述当时，不覆盖上方当前入口。

完成：Composer 使用 Lexical `0.42.0` 公开 PlainText/History，文件与对话引用显示真实 TextNode 短标签，提交/复制/剪切仍为 canonical 路径或公开对话正文。整项删除、撤销/重做、普通纯文本粘贴和中文合成保护已接；剪贴板写入失败不删选区。`@`、`/`、`$`、`+` 共用真实候选，命令替换保留前后正文与已有引用；Skill/MCP 继续调用实际配置协议，不制造后端引用语法。

完成：项目浏览不创建任务，选中文件经真实 stage 冻结字节并关联该次附件 DTO；行内文件删除/撤销同步当前 owner 附件，独立上传不随正文消失。文件重试 continuation 保留原范围，新文本不被旧范围覆盖；对话迟到按 owner/项目/目录/revision 保护。匿名 → prepared → accepted 保持编辑器身份，切 owner 或权威清稿隔离旧撤销历史。version 1 草稿文档只恢复白名单、匹配 canonical 正文与 owner DTO；262144 字符偏好超限先省略可选引用元数据，正文/附件/未确认提交保留，重载降纯文本，仍超限则可见失败。

自动检查：11:40:12 起全量 161 文件/2701 项通过，React 类型、生产构建与 diff 检查通过；原有 Tailwind Custom Highlight 优化告警保留。记录在 `/tmp/mira-inline-composer-20261010.MTzIUB/code-checks.json`，来源为本次命令观察记录，非原始测试日志。11:42:35 的只读 `/tmp/mira-inline-composer-20261010.MTzIUB/bundle-audit.json` 为 `passed=true`：291 JS、240 动态目标、29 许可文件一致，缺失/差异/旧块均为 0，fresh Tailwind CSS 一致；本轮新增依赖许可已进入发行目录。静态入口闭包 2500585 bytes、gzip9 各文件合计 751099 bytes，仅为包体数据，不是加载或交互性能验收。Vue/Electron 类型与严格类型既有诊断保留原批边界。

当前冻结身份：JS `b85d6be2bdd3ea8754e863c30e42658c4d492d5eef1a25f9798bc8949b2432e7`，CSS `3f04bf3cbc04ee72233cd9ccc4cb354fd5d606fb5a36aa340571d26b984bf196`；main `6775d5f680443e9169a579d1b047571a5c93ed4f526f107076c6eb46e83c11c7`、preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`、HTML `5a977f2514120fe6bf892d6ae00f2ba18caa63c7243c9e7b4999bab1692fad75` 与前批相同。旧 `6f82e047…` 宿主报告/截图保留旧身份，不覆盖为新版本。

宿主验证：11:46:17–11:46:32，同一上述冻结版本的真实编译 Electron main/preload、Vue 第一方 grant/MessagePort、生产 Lexical React 与隔离 SQLite 检查通过。最终报告 `/tmp/mira-firstscreen-ui-host-20261010.zeXKRM/rich-composer-results-2026-10-10T03-46-17-185Z.json` 为 `passed=true`，浅色 9 项、深色 9 项、隔离 1 项合计 19 项，覆盖匿名项目首个引用及真实 stage、撤销重做不重新 stage、Backspace/附件 X 一致性、已解决根文件不重开候选及 slash/plus 保引用、canonical 复制/剪切失败保稿/IME、A/B 文档和撤销隔离、文件失败重试与新正文保护、迟到首发 ACK 的 owner 提升/编辑器身份/焦点/新输入、重载恢复文档和附件。

最终运行五 SHA 前后不变，`errors=[]`、外部请求为 0，自有 PID 全退出，`53357` 端口关闭；总控独立重算五 SHA 并用 lsof 复核端口。8 张图在 `rich-composer-captures-2026-10-10T03-46-17-185Z/`，宿主代理与总控均逐张查看，Composer/引用/附件没有明显裁切。`+` 两图采集时面板已经关闭，只证明引用保留，不证明展开面板视觉；reload 两图上方正文尚未可读，只作 Composer/附件恢复证据；ACK 两图仍为欢迎起点，不证明正式对话线程已显示。不能把这组图写成全屏全部状态通过。

验证边界：`@` 项目查询、stage 冻结字节、草稿偏好与重载来自真实 Mira 服务/SQLite；文件拒绝和延迟首发接纳为明确 IPC 夹具，ClipboardEvent 的 `clipboardData` 为本地 JS stub，没有写系统剪贴板。输入使用隐藏 BrowserWindow/CDP；本批没有真实模型/网络/终端/调度、OS 输入、实时 ZCode 对照、Windows/安装包/性能验收。仅在 `/tmp` 保存夹具和报告，不修改冻结源码/产物，不抢桌面。

前四份同一 Composer 批次报告继续为 `passed=false`，各自页面 `errors=[]`、自有进程已退出且端口已关闭；夹具修正不改写其状态，也不算新的产品修复：

| 原报告 | 失败范围（原记录保留） |
| --- | --- |
| `rich-composer-results-2026-10-10T03-43-20-324Z.json` | 初始 canonical preference 等待未完成，尚无完成检查；夹具的持久偏好定位/等待修正 |
| `rich-composer-results-2026-10-10T03-44-12-802Z.json` | 前 3 项完成，slash listbox 等待超时；诊断显示引用后直接 `/`，夹具输入范围/分隔修正 |
| `rich-composer-results-2026-10-10T03-44-56-890Z.json` | 前 4 项完成，受控剪切拒绝后 canonical preference 等待未完成；夹具按真实保留正文及空格修正 |
| `rich-composer-results-2026-10-10T03-45-29-810Z.json` | 前 7 项完成，accepted owner 的持久结果等待未完成；夹具接纳结果定位修正 |

剩余与下次入口：当前 Composer 源码、静态与限定隐藏宿主批次已收尾，从下方三块矩阵继续完整原生/ZCode 同态，建立当前新版的慢首开、输入与长会话性能基线再针对瓶颈改进；旧 `913bb8…` 等性能样本不覆盖新 `b85d6be2…`。不重做已接侧栏/对话/引用协议。PDF/视频、独立 Novel 搜索、跨 owner 预览/自动监听、真实模型/调度、Windows/安装包/P0–P3 仍独立待办，Goal/workflow 不伪造。整体目标仍 active，本批未提交/推送；清理与本机备份保留原批身份。

## 历史批次（2026-10-10 11:16）

以下对话/textarea 批次保持 `6f82e047…` 的原检查和宿主证据；其“下一批进行中”是当时状态，不覆盖上方已完成源码与静态检查的新版本。

完成：Header 重命名保护中文合成输入，桥拒绝保留草稿，迟到 A 响应不覆盖 B 编辑。历史消息编辑在滚离和失焦后保留挂载与输入，取消后释放虚拟行；编辑重跑在宿主权威快照确认受理后才关闭，早期拒绝保留输入。工具/公开思考展开状态按会话、run、条目隔离，虚拟卸载再挂载恢复，焦点所在轮次保留；工具文件按钮调用真实受控服务，工作区内绝对路径规范化，外部路径不提供预览。

完成：工具失败使用 Radix Popover，Enter 不切换父工具，Tab 进入复制后可前后离开，Escape 还焦触发按钮且不重新打开，外部已获焦时不抢回。摘要 `auto/mini/panel` 由 Workbench 生命周期管理，A→B→A 保留、重载回 `auto`，与上游 App `useState` 一致；磁盘持久化不是本轮缺陷。当前/待执行步骤优先于泛化状态，各详情区独立折叠，子任务默认收起、结束记录仍可查看，迟到停止失败不串任务。项目草稿通过 `@`/`+` 浏览或搜索真实项目文件不创建会话，选中文件才准备 1 个项目 owner 并冻结附件，未发送时为 `prepared`、消息数 0。

自动检查：本批最终全量 159 文件/2660 项、React 类型、生产构建、diff 检查及资源包一致性审计通过，均对应下面的冻结版本，不覆盖随后加入的 Lexical 编辑器/依赖。Vue/Electron 类型与原生边界沿用各批准确记录，不写成全部类型或发布通过；本批未新增性能采样。

已完成批次冻结身份：JS `6f82e047d1c445b70652dc4cf5258499837715546bbebc8502365e54d92e7813`，CSS `2b91492fed3d90b940bac3b7df8a74c998a2c4af69b20c43a1ba780c456874e0`；main `6775d5f680443e9169a579d1b047571a5c93ed4f526f107076c6eb46e83c11c7`、preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`、HTML `5a977f2514120fe6bf892d6ae00f2ba18caa63c7243c9e7b4999bab1692fad75`。工作树正在推进下一批，不将这份身份描述为后续未验证源码的结果。

宿主证据仅在 `/tmp/mira-firstscreen-ui-host-20261010.zeXKRM/`：同一上述冻结版本，真实编译 Electron main/preload、Vue 第一方 grant/MessagePort、生产 React、隔离 SQLite 中 A/B 各 100 轮与真实记录 parts/tools，浅色分段合计 8 项、深色完整 8 项通过。四份报告保留原状态：

| 报告 | 已通过范围 | 报告整体状态与边界 |
| --- | --- | --- |
| `feature-slice-results-2026-10-10T02-57-51-201Z.json` | 浅色摘要、工具/思考、错误键盘、文件预览、重命名 5 项 | `passed=false`；后续夹具误等仅分组视图才存在的草稿行，仅修 `/tmp` 定位 |
| `feature-slice-results-2026-10-10T02-59-32-098Z.json` | 浅色项目草稿 `@` 文件 1 项 | `passed=false`；后续夹具直接点击虚拟 rail 未挂载的第 20 轮，仅修 `/tmp` 滚动定位 |
| `feature-slice-results-2026-10-10T03-02-20-404Z.json` | 浅色历史编辑/取消释放、编辑拒绝与权威受理 2 项，另加隔离边界 | `passed=true`，3 项检查；不改写前两份失败报告 |
| `feature-slice-results-2026-10-10T03-02-45-530Z.json` | 深色全部 8 项功能，另加隔离边界 | `passed=true`，9 项检查；确认准备 owner 消息数为 0 |

26 张状态截图位于上述目录各报告对应的 `feature-slice-captures-<报告时间>/`，已逐张审核。小桌面窗显式 `panel` 会覆盖用户气泡末端和工具行右侧状态；历史编辑截图带有 rail 焦点触发的 HoverCard，但编辑框完整可见。最后两张 terminal 截图的终态文字仍在 viewport 外，不能作为“最终回复可见”证据，也不能宣称全部截图无遮挡。交互断言与实际数据库的受理/终态检查分别保留其范围。

四次运行无页面错误，全部自有 PID 已退出，端口 `50951/51033/51166/51201` 已关闭；通过报告确认窗口隐藏且不聚焦、隔离 home、零外部请求、五产物 SHA 前后不变。输入使用隐藏窗口/CDP，重命名拒绝/延迟、编辑受理/结束和复制结果为明确受控夹具，不是 OS 剪贴板、computer-use、实时 ZCode 同态、真实模型/终端/调度、Windows/安装包或性能基准验收。

剩余与下次入口：继续当前 Lexical 富文本 Composer/行内引用批次，保留草稿 owner、caret token、IME、统一快捷键、附件与首发接纳协议；先完成对应源码与回归，再建立新构建身份和宿主证据，不能用 textarea 批次的通过覆盖新编辑器。完整原生/ZCode 同态、慢首开、PDF/视频、独立 Novel 搜索、跨 owner 预览/自动监听、真实模型/调度与 Windows/发布仍独立待办。已有侧栏及本批对话交互不重复实现，Goal/workflow 不伪造。本批未提交/推送；清理与备份保留原批身份。

## 历史批次（2026-10-10 10:10）

完成：项目/个人分区使用 dnd-kit 独立排序，更新时间排序也可拖动分区；Escape/返回原位不保存，有效放下一次保存，失败回滚且保留后续修改。已修键盘反方向回退仍锚定拾起源的问题，补两个方向先红后绿回归。自定义组悬浮标题复用真实名称/颜色/数量和折叠/草稿/颜色/解散动作；拖拽或切视图立即隐藏，150ms 退出期间副本立即禁用，菜单与迟到回调按当前组校验。

完成：按提供的 ZCode 源码纠正旧计划——+5 分页只用于项目任务，自定义组完整展示，未分组根层取消 12 条截断；组内与混合根层超过 80 项才虚拟化，overscan 12、实高测量和共享滚动重新挂载不回顶。焦点、Radix 菜单、重命名、拖拽、归档确认、异步操作与错误反馈保留原行；实际长列表回归已验证等待期间滚远再返回不重复请求、失败可见并可重试，成功后释放行。使用现有 Radix/dnd-kit/TanStack，不新增依赖，原始许可保持，改编映射已补。

自动检查：10:05:29–10:06:13 全量 154 文件/2600 项通过；React 类型、生产构建及产物审计通过。291 JS、240 动态目标、20 许可一致，缺失/差异/旧块均为 0，fresh Tailwind 匹配；结果只在 `/tmp/mira-sidebar-slice-20261010.4HU3fo/`。首轮全量的 6 个失败来自旧 callback 树遍历不识别 `renderItem` 插槽，修测试遍历后 14 项定向及最终全量通过，失败 JSON 保留；未为适配 mock 改产品行为。新 Chromium 综合回归使用真实 SessionSidebar/Row、Radix 与共享滚动，不是实际 App/原生验收。Vue/Electron 本批未改，沿用上一批编译/类型边界，严格 Electron 仍有既有 48 条诊断。

冻结产物：JS `50116ee764ec2392ea454c26968f2381d715002f0908d7dc788c6e0047ab5fdc`，CSS `d9127259ac47ecf550d4c67e0d034d9c2c2ed1df9285e0b5ae32fe3d90db8d3d`；main `6775d5f680443e9169a579d1b047571a5c93ed4f526f107076c6eb46e83c11c7`、preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`、HTML `5a977f2514120fe6bf892d6ae00f2ba18caa63c7243c9e7b4999bab1692fad75` 未变。此前各报告保留原构建身份。

宿主确认：10:13:16–10:13:51 明暗 35 项通过，报告 `/tmp/mira-firstscreen-ui-host-20261010.zeXKRM/sidebar-slice-results-2026-10-10T02-13-16-243Z.json`。真实隔离 SQLite 483 个任务覆盖分区鼠标/键盘取消与一次保存/F5、双向返回原位零写、24/18 小组完整显示、悬浮几何/切组/颜色/草稿/折叠/解散、240 项组与 200 项未分组首尾可达及有界 DOM、菜单/焦点保留、虚拟任务 Escape 保滚动与跨组一次保存。五产物 SHA 前后不变，0 页面/console error、无模型请求，自有进程/端口已退出。早期失败仅修 `/tmp` 夹具的 hover/隐藏按钮、KeyboardSensor 监听挂载时序与 overscan 不稳定定位，原失败报告保留，未为这些修改生产代码。隐藏 Electron/main/preload/Vue grant/MessagePort/生产 React 联调不等于 OS 输入、computer-use、实时 ZCode 同态、真实模型或 Windows/发布验收；没有新性能结论。

剩余与下次入口：本批侧栏增量已收尾，核对三块首屏未验入口，继续对话 Header/timeline/工具状态/悬浮摘要与 Composer 的 @、/、+、键盘及焦点同态。当前没有可调用 computer-use，隐藏 CDP 不代替 OS 输入或实时 ZCode 对照；不抢桌面、不操作用户 ZCode 草稿。慢首开仍待修，本批没有性能采样；PDF/视频、独立 Novel 搜索、跨 owner 预览/自动监听、真实模型/调度与 Windows/发布仍独立待办。清理仍为净删 76 项/29 tracked，本机可恢复备份保留；未提交/推送。下方旧“下一步/未实现”仅描述当时范围，不再实施自定义组 +5 分页。

## 历史批次（2026-10-10 09:40）

完成：项目视图中的“项目”和“个人工作区”使用 Radix Collapsible 独立折叠并保存偏好，旧配置默认展开。14px 标题在 hover/focus 显示箭头和动作；个人区为空或折叠时仍可新建草稿，不立即增加正式任务。项目任务初始 5 条，每次加载 5 条；各项目分页独立，折叠/隐藏/离开可见视图后重置。临时搜索不改保存的开合状态。全部展开/折叠在一个事务中控制父项目区和子项目，个人区不受影响。添加/重新选择项目后展开父区和目标；已修第 7 个及之后的已有项目被前 6 项截断的问题，成功选择才展开完整项目列表，取消/失败不改列表、不改排序、不造任务。

完成：Shell 搜索通过既有授权 MessagePort 携带一次性焦点请求。用户取消时由当前发起层还焦，原入口失效或其他目标已经获焦则不抢回；执行结果动作、外部导航和迟到旧关闭不回原按钮。重复打开会重新聚焦搜索输入并保留 query。显式新建/复开草稿在目标挂载后一次聚焦 Composer，hydration/阅读/迟到响应不抢当前焦点。运行/待审批任务保留原项目或个人工作区归属，任务菜单实时显示未读状态。

完成：轮次 rail 使用 TanStack Virtual 挂载可见按钮与 Radix Hover Card 展示真实片段，补键盘 Home/End/Page、hover 锚定及迟到预览保护；正文的虚拟轮次/阅读恢复继续使用既有协议。必要 Collapsible/Hover Card 许可集中保存，原始 LICENSE/NOTICE 未改写，来源映射已同步。

最终代码检查：09:34:45 起全量 152 文件/2567 项通过，React 类型、React 构建与新目录产物审计通过；291 JS/240 动态目标/20 许可一致，无缺失/差异/旧块，fresh Tailwind 匹配。结果为 `/tmp/mira-sidebar-selected-project-20261010.OgYN2y/`。Vue 类型 09:18 已通过，此后未改 Vue；Electron main/preload 已编译，严格 Electron 类型仍有既有 48 条诊断，不能写成严格类型全通过。第 7+ 项目两项 DOM 回归先红后绿，独立复核后相关 4 文件/98 项通过。

最终产物身份：JS `669643c6f8dd99aad4feddfa83fc78ee66224b0cd95d3e6c0d4fb36a20c03e0a`，CSS `13021f65fc52ac936da9ef74f1f05d9f6eb0a11baf67d0406dab89fecdb0a734`；main `6775d5f680443e9169a579d1b047571a5c93ed4f526f107076c6eb46e83c11c7`，preload `7e4444b366821a5c401e796e843298f28a09d4eab119c468f211c0c603cc3f6b`，HTML `5a977f2514120fe6bf892d6ae00f2ba18caa63c7243c9e7b4999bab1692fad75`。不同报告分别保留自己的构建身份，不把旧 UI/性能样本覆盖为新产物。

宿主整合验证：09:22:08 的浅深 25 项通过，报告 `/tmp/mira-firstscreen-ui-host-20261010.zeXKRM/firstscreen-ui-results-2026-10-10T01-22-08-324Z.json` 属 JS `94e35e…`/CSS `802cf4…`；覆盖搜索取消/重复打开/执行后焦点、分区偏好/F5、个人草稿、项目 5→10→12、运行/审批归属与虚拟 rail。18 张图已逐张查看，其中 4 张正文异步采集不完整，只作侧栏状态证据。09:27:33 的 bulk 窄确认 5 项通过，`bulk-results-2026-10-10T01-27-33-281Z.json` 属 JS `92a56b…`/上述最终 CSS；8 张补图都先等 user/assistant 正文实际可见，逐张查看无明显主题或裁切异常，覆盖父/子联动、个人区保持、F5 与 5→10→5。各自五产物 SHA 前后不变、自有 PID/端口已退出；旧失败报告保留，不覆盖。第 7+ 项目新构建的窄宿主确认单独记录，不重新包装成 25+5 全量 UI 重跑。

最终项目选择窄确认：09:38:19 浅深 9 项通过，报告 `/tmp/mira-firstscreen-ui-host-20261010.zeXKRM/project-selection-results-2026-10-10T01-38-19-150Z.json` 对应上述最终 JS `669643c6…`。真实隔离 SQLite 有 9 个项目，受控 picker 返回原第 9 个已有目录；普通截断目标、隐藏目标恢复均可见并展开，取消/失败保持原列表状态，SQL 顺序/任务数不变、不导航或创建任务。4 张图逐张检查，五产物 SHA 前后不变，自有进程与 `63537` 端口已退出，无外网/模型/页面错误。09:37:23 原失败报告保留：夹具错误等待上游原始错误文案，而真实桥已清理为“平台调用失败”；只修 `/tmp` 断言，没有为通过修改产品错误边界。

验证边界：上述运行真实编译 Electron/main/preload、Vue grant/port、生产 React 和隔离 SQLite，但输入为隐藏窗口/CDP；项目选择结果/失败由隔离 picker 控制，运行/审批/完成事件使用夹具经真实 `harness:event` 注入，部分父层焦点用受控 DOM focus。它们不是当前电脑操作插件、OS 输入/原生目录选择器、实时 ZCode 同态、真实 Coordinator 模型/调度、Windows 或发布验收。当前没有可调用 computer-use 工具，不解锁或抢用户桌面。

性能增量：09:00 三次独立 500 轮/1000 消息采样的首开中位数 157.8ms、切回长会话 105.9ms、输入 9.05ms；最慢首开 289.1ms 尚未解决。rail 挂载与已挂载按钮点击分别计时，不与旧全挂载一次点击混比。准确分布和限制见 [性能记录](MIRA_HARNESS_PERFORMANCE_2026-10-08.md)，报告仅对应旧 JS `913bb8…`，不声称重测了最终搜索/分区构建。

清理仍为净删 76 项/29 tracked，当前有效回归、迁移、构建和许可保留；可恢复备份只在本机 `/tmp`，不随 Git 跨机器。临时报告/图只在 `/tmp`，更新已有六文档与 DESIGN，不新增一次性测试文档。本批未提交或推送。

剩余与下次入口：先参考上游 purpose-section preferences 与 sticky-group-header 补分区排序、长组悬浮标题、组内 +5 分页和大任务列表虚拟化，保留现有草稿/归属/焦点协议；再逐入口做前台浅深 ZCode 同态和实体快捷键/IME，定位慢首开。PDF/视频、独立 Novel 搜索、跨 owner 预览/自动监听、真实模型/调度与 Windows/安装包/P0–P3 仍独立待办。不重做已闭合的拖拽、草稿、搜索回焦与 ref/rail 优化。下方历史的“下一步/尚未实现”仅指当时范围。

## 历史批次（2026-10-10 08:19）

完成：组内新任务显示组首临时草稿，根新任务显示根首临时行；点击或输入不立即增加正式任务。需要附件/配置时准备同一个隐藏会话，`prepared` 不进入列表、搜索、历史、项目计数或最近时间；首次输入被宿主实际接纳后变为 `accepted`，进入发送时捕获的组首，原组已删除则进入根首。

关闭临时行只隐藏入口并清临时分组，正文、附件和配置仍可复开；切项目复用同一 owner，不复制附件或生成孤儿草稿。首发在途/确认未知时复用捕获的草稿与位置，不重复创建或发送。迟到确认/移动/刷新不抢当前导航、不清另一任务的新输入；位置保存失败保留本地修改供重试。刷新无 Shell 导航快照时等待草稿 hydration，再经受保护的导航恢复；prepared 不进入正式导航历史，accepted 空任务与有持久引用的 prepared owner 在重启时保留。

验证：08:11:52 起全量 148 文件/2506 项、React/Vue 类型与 React 重建通过；Electron main/preload 已重新编译。新产物审计 291 JS/240 动态目标/19 许可一致，无旧块，fresh Tailwind 匹配。检查在 `/tmp/mira-group-draft-restored-20261010.bjLoXc/`，Electron 编译在 `/tmp/mira-group-draft-delivery-20261010.drsC9g/electron-build.log`。严格 Electron 类型仍为既有 48 条诊断，不把编译写成严格类型全通过。

实际隐藏 Electron/main/preload/Vue grant/MessagePort/生产 React 的生命周期与正式 UI 各 7 项通过。08:12:57 的浅深两轮覆盖组入口、正文、附件准备、关闭复开、F5 自动恢复、实际 Composer 首发接纳与再次刷新，12 张 2880×2000 图逐张检查；无页面/console 错误或外部请求。夹具、报告与图片仅在 `/tmp/mira-prepared-host-20261010.Qe1GcE/`，最终报告为 `prepared-ui-results-2026-10-10T00-12-57-990Z.json`；自有进程和端口已关闭。

产物身份：最终 UI 的 JS `ebc6427128090935a7b4a4879a7dbcdd5024d5cee5f0aeedd79f5092bf1710ca`，CSS `95f499db9b09cc5f708f080e1571aa624e3179babc30bb987edfdd2f6df5130f`。生命周期报告 `prepared-host-results-2026-10-09T23-59-51-870Z.json` 的 JS 为修恢复前 `1499a324…`，两次运行各自的五项运行产物前后不变，不混称同一完整构建。

修前失败保留：08:04:54 正式 UI 发现 F5 后草稿未自动恢复；08:06:33 点击草稿的通过仅作诊断。已修初始化并补无导航快照回归，最终路径无需点击绕行。输入使用 CDP 指针/键盘与 DOM ClipboardEvent(File)，首发用 `/perm auto-approve` 验证真实接纳且不调用模型；不等于 OS 剪贴板、原生电脑操作、实时 ZCode 同态、真实模型或 Windows 验收。队列仍仅进程内。

清理：净删 76 项、其中 29 个 tracked；保留当前回归、迁移兼容、构建入口、必要 Swift helper 和原始 LICENSE/NOTICE。恢复备份仍在本机 `/tmp/mira-legacy-cleanup-20261010.NTOfhw/`、`/tmp/mira-success-log-cleanup-20261010.F72WXX/`、`/tmp/mira-cleanup-final-20261010.05tBKm/`，不随 Git 跨机器。文档同步后独立复核 34 份文档/496 个本地链接无缺失，46 份日志及 13 份额外备份哈希一致，当前构建入口与许可证完好；新报告 `/tmp/mira-cleanup-sidebar-rereview-20261010.XKbysO/post-restore-audit.json`，旧报告未覆盖。本批未提交或推送。

剩余与下次入口：从本页矩阵核对尚未验收的首屏入口，补侧栏/对话/Composer 的原生焦点、菜单、IME、快捷键和浅深 ZCode 同态；随后依据 [性能记录](MIRA_HARNESS_PERFORMANCE_2026-10-08.md) 定位慢首开，本批没有新性能采样。PDF/视频、独立 Novel 搜索、跨 owner 预览/自动监听、真实模型/调度、安装包/Windows/P0–P3 保持独立待办。不重做组草稿、拖拽、hover 或已完成的 ref/rail 优化；下方旧批次保留各自证据与失败身份。

## 历史批次（2026-10-10 07:15）

完成：分组非置顶任务 hover/focus 显示文件树、手动移到根层顶部和 X 直接归档；项目/置顶/时间线任务归档改为同一按钮的红色原位确认，离开 hover 保留，Escape/行外点击/打开菜单取消。保留审批状态和更多菜单，操作在途禁重复、失败可重试。归档成功保留任务草稿/模型，不触发永久删除清理；迟到 ACK/列表不抢新任务或草稿，提交成功但列表刷新失败显示全局提示。

文件树只切侧栏，按所选项目或个人任务 owner 读取，不创建/打开会话、不等待当前草稿保存，自动化主视图也不切换。个人目录错误可见，旧树回调不能覆盖新 target；当前个人树复用监听，换其他 owner 释放。其他任务的浏览树不借当前会话的文件预览/引用/编辑器，跨 owner 右侧预览和项目/其他任务自动监听仍未扩展。

验证：07:09:52 起全量 148 文件/2455 项、React 类型、React 构建及 diff 检查通过；新产物审计 291 JS/240 动态目标/19 许可全部一致，无旧块，fresh Tailwind 匹配。结果在 `/tmp/mira-task-actions-focus-final-20261010.xTrR2c/`。JS `6d02fa651a254bb5e2bda5d3312d503ac2d07e6c842a14c2f2b7fe60b303e946`，CSS `5fe24420bc9e15d3e6aa678c7afa5f55c133da8bf75b569dba7767dd31ddb577`；未变的 Vue/main/preload 沿用此前编译，严格 Electron 类型仍保留既有 48 条诊断。

07:17 来源映射同步后重新打入资源包，六项运行产物 hash 保持上述身份，更新的许可目录/NOTICE/HTML 副本经独立审计一致；收尾报告 `/tmp/mira-task-actions-delivery-20261010.7K9kwg/bundle-audit.json`。只更新元数据，不重复不变代码的测试或界面验收。

07:11:50 的实际编译 Electron/main/preload/Vue grant/MessageChannel/生产 React 检查 11 项通过，11 张浅深图逐张复核。真实指针首击后父焦点 IFRAME/子焦点确认 BUTTON，Escape 无人工 focus 补偿即可取消；归档写实际隔离 SQLite，失败/hold 是明确 IPC 注入。项目和私人目录的根/子目录读取均使用目标 owner，草稿保存挂起时仍能展开且不改当前任务/草稿写入次数。0 页面/console 错误及外部请求，五项产物 hash 前后一致；五个自有 PID 和 `57930` 端口关闭。报告 `/tmp/mira-task-actions-20261010.YdbqiH/task-actions-results-2026-10-09T23-11-50-622Z.json`；隐藏窗口/CDP 不替代原生电脑操作、实时 ZCode 同态、真实模型/调度、Windows 或发布验收。

失败保留：07:04 的正式验收发现按钮 preventDefault 阻止从 Shell 回到 iframe 的焦点；产品已移除该默认行为阻断，并补真实鼠标回归。07:07 带人工 focus 的通过仅作诊断，07:11 先触发 tooltip 再等消失的采图夹具失败也保留，均不当作最终无条件通过。旧 `530db871…` 的全量/审计保持原产物身份。

清理独立复核仍为净删 76 项/29 tracked；34 文档/495 本地链接无缺失，全部删项备份、构建入口及必要 Swift helper 正常。报告/图片只放 `/tmp`，备份仅在本机；原始 LICENSE/NOTICE 保留，本批未提交或推送。

剩余与下次入口：组内新任务仍会立即创建真实会话；下一批复用现有 ComposerDraftSnapshot 区分临时草稿身份和已准备会话，补组首临时行/关闭清草稿/首次发送接纳后提升，正文、引用、模型、计划和附件迟到均不得跨 owner。附件现依赖真实 sessionId，不能用一个 callback 假装已完成首发创建。PDF/视频、独立 Novel 搜索、完整原生/ZCode 同态、真实模型/调度和整体性能继续待办，安装包/Windows/P0–P3 未放行。下方 06:36 及更早记录为历史，不重复拖拽/hover 实现或沿用旧性能身份。

## 历史批次（2026-10-10 06:36）

完成：净清理 76 项遗留材料，保留当前有效测试/迁移兼容/原始许可与必要验证源码；备份和文档链接已独立复核。跨组拖拽已完成空组防循环与独立组边缘重测修复；鼠标/键盘移动、根任务与组交错、展开/折叠组四边、一次快照落盘与重载、Esc 零写、临时折叠恢复、保存失败回滚及后续修改胜过迟到失败均通过。

最新正式 JS 为 `9dec325560cc29a84a365bcf5b12d813a16107de965f28bb140ba24bad5c23ed`，CSS `b35848a73aa35db5eacb642bf989bc4c46313b4488ce27601d64846fe424d9ad`。06:21 全量 148 文件/2439 项、React 构建、新目录的 291 JS/240 动态目标/19 许可审计通过；React 类型通过，未变的 Vue/Electron 沿用本批此前通过的类型/编译，严格 Electron 类型仍为相同 48 条既有诊断。审计/全量证据在 `/tmp/mira-cleanup-sidebar-final-20261010.2CpxTR/`，旧审计保持原身份。

06:31:48 的实际编译 Electron/main/preload/Vue grant/MessageChannel/生产 React 完整切片 21 项通过；除拖拽合同，还验证工具展开零 scroll 更新 rail、A/B 阅读锚点及实际 Vue 浅深主题/键盘焦点。正文采图等待文字 Range 实际相交与连续帧几何稳定，六图逐张查看，0 页面/console 错误、外网或模型请求，五项产物 hash 未变。五个自有 PID 及 `56619` 端口均已关闭。最终报告 `/tmp/mira-firstscreen-20261010.BAfGLm/first-screen-results-2026-10-09T22-31-48-945Z.json`；保存失败是隔离 IPC 注入，隐藏窗口/CDP 不替代前台原生、ZCode 同态、真实模型、Windows 或发布验收。旧固定 footer 路径未进入真实目标及早拍空白图均保留原失败/范围，不改写历史。

06:36:19 清理最终复核为净删 76、tracked 29、34 文档/495 个本地链接无缺失，46 份日志和 13 个补审备份 SHA 一致；恢复的 Swift 源码与原备份一致。所有本批生成报告/图片只在本机 `/tmp`，不增加仓库测试证据堆。原始 LICENSE/NOTICE 保留且未改。最终五 PID 和端口已再次独立核对关闭，diff 检查通过。

剩余：组内新任务先创建草稿、首次发送才持久化；任务行 hover 归档的就地确认与文件树入口；PDF/视频另列。整体性能仍有慢首开及长任务，分布与旧 `b9513ebc…` 性能身份见 [性能记录](MIRA_HARNESS_PERFORMANCE_2026-10-08.md)，不把拖拽构建当作重测性能。当前没有可调用电脑操作工具，完整原生/ZCode 同态待补，不解锁或抢焦点。独立 Novel 搜索、真实模型/调度、安装包/Windows/P0–P3 仍未放行。本批未提交或推送。

下次从组内草稿和任务行 hover 开始，不重复拖拽实现或已完成的 ref/rail 优化。下方 06:33/06:16 是联调检查点，其“仍在收尾”已由本节限定通过取代；其源码/产物/失败身份继续保留。

## 历史收尾（2026-10-10 06:16）

06:33 联调增量：已确认并修复独立 group head/tail 的碰撞坐标陈旧，SortableContext 只重测排序行，遗漏随预览移动的标题/末端；新增 9 行 child 在预览变化后重测全部 enabled droppables，保留空组防循环保护。真实 CSS 的展开组前上行红测转绿，鼠标/键盘空组、改投、Esc 零写与 drop 一写仍通过；5 文件/82 项及 React 类型通过。

06:21:56 起重新全量 148 文件/2439 项通过，React 重建通过；新只读审计 291 JS/240 动态目标/19 许可全匹配，旧块/缺失/差异 0。新 JS `9dec325560cc29a84a365bcf5b12d813a16107de965f28bb140ba24bad5c23ed`，CSS 与前批相同；报告另存 `/tmp/mira-cleanup-sidebar-final-20261010.2CpxTR/`，保留旧 `fe365587…` 审计。未重复未变的 Vue/Electron 构建。06:27:30 清理复核仍净删 76、tracked 29、34 文档/494 链接无缺失，全部备份校验通过。

完整新 workbench suite 尚未通过：六项鼠标落点/重载检查通过，展开组尾固定上行未产生预期落点；实际 CSS 对照证明尚未进入旧 10px footer 就先触发任务行预览，将 footer 移至指针下方，继续上行没有进入当前目标。保留失败报告 `first-screen-results-2026-10-09T22-21-24-454Z.json`，0 页面错误；该轨迹未满足进入真实 footer 的前提，不认定为新的产品缺陷。正式夹具将记录当前 box/指针相交并保持原组尾/drop/reload 合同。源码/正式产物保持冻结，临时 tail 诊断片段已移除，不遗留未运行回归。

06:30:47 独立 save 切片 3 项通过：受控 IPC 保存失败回滚三个顺序字段并提供可读错误/重试，后续本地折叠不会被迟到旧拖拽失败覆盖，重试/重载保留最新快照；0 页面错误/外网，五项产物 hash 未变。`first-screen-results-2026-10-09T22-30-47-572Z.json` 与一张错误态图在上述临时目录，图片已查看。仅为隔离故障注入，不是原生磁盘故障；后续完整 suite 仍须闭合实际组边缘与全部交互。

下方 06:16 和更早数据保留当时身份，其中“组前正在修复”已由本增量取代；组边缘与完整实际交互仍未收尾。

清理完成：净移除 76 项旧测试、重复文档/日志和临时产物，其中 Git 删项 29 个，全部有本机可读备份；仍被原生脚本引用的 Swift 辅助源码保留。06:05 独立只读复核 34 份文档/493 个本地链接无缺失，46 份日志与 13 个补审备份 SHA 一致。当前 148 份有效测试，05:59:29 起全量 2439 项通过；保留新版、迁移兼容、小说转换、构建脚本及原始 LICENSE/NOTICE。生成证据只放 `/tmp`，不新增仓库测试文档或截图。三份备份目录见下方清理历史；备份仅在本机，不随 Git 跨机器。

对话性能局部优化完成：底部跟随不扫描无用锚点，真实离开视口才捕获位置；rail 布局读取合并到 rAF，工具展开通过 ResizeObserver 更新；完整 external-store adapter memo 与公开 API 的 memo viewport/children context 减少无关 ref 重挂。真实 ReactDOM 生命周期、正文/审批更新及阅读恢复回归保留。独立复测的输入和定位中位数改善，但首开仍有 76/70/68ms 长任务、慢样本尚未归因；三批准确分布与 `b9513ebc…` 的冻结范围见 [性能记录](MIRA_HARNESS_PERFORMANCE_2026-10-08.md)。后续侧栏产物不沿用这批性能身份。

侧栏跨组拖拽已实现根列表与组交错、跨组/空组/根首尾落点、折叠组前后及展开组边缘、键盘与鼠标、Esc 零写和一个偏好快照。独立真实 CSS 复现空组预览导致 React 更新循环，已用完整传感器位移阻止纯布局变化重复预览；正式 workbench 的空组及七项鼠标落点/重载检查通过。展开组前的实际上行动作仍失败，正在核对自定义 head/tail 的旧碰撞坐标，暂不宣布拖拽整体通过。保存失败/晚失败保护的真实桥验证还在收尾。

05:59 当前产物审计为 291 JS/240 动态目标/19 许可匹配，缺失/差异/旧块 0，CSS 与 fresh Tailwind 一致；正式 JS `fe3655878acb42bb09789273ef724bc8bae42e6164a4205fbfcf1faefea87575`，CSS `b35848a73aa35db5eacb642bf989bc4c46313b4488ce27601d64846fe424d9ad`。结果在 `/tmp/mira-cleanup-drag-ref-final-20261010.3Uu9aj/`；该目录审计文件现在描述侧栏产物，不把它当作仍单独保存的旧 `b9513ebc…` 全量审计。React/Vue 类型和 React/Electron 构建通过；严格 Electron 类型仍有相同 48 条既有诊断。

06:10 隐藏编译 Electron 的 reading 切片通过实际工具展开零 scroll 更新 rail、A/B 独立锚点、真实 Vue 浅深主题及键盘焦点，四图逐张查看。旧 06:03 图在虚拟行布局稳定前采集，正文 Range 与视口相交为 0，不能作为视觉通过；新报告保留初始/5 帧/500ms 对照，稳定后正文完整。后续采图必须等正文文本实际可见且几何连续稳定，不能只测 wrapper/rail。结果为 `/tmp/mira-firstscreen-20261010.BAfGLm/first-screen-results-2026-10-09T22-10-47-476Z.json`，生产五项 hash 未变、0 页面错误；不替代前台原生或 ZCode 同态。

下一步：先关闭展开组前落点与保存失败验证，随后组内新任务改为草稿/首次发送持久化、任务行 hover 归档确认和文件树入口。PDF/视频另列；当前没有可调用电脑操作工具，不解锁或抢焦点。完整原生/ZCode 同态、真实模型、整体性能、Windows/发布/P0–P3 未放行，本批未提交或推送。

## 历史批次（2026-10-10 04:23）

完成：根路由、裸工作区、主应用选择、404 返回及非法配置页回退统一到正式 React；合法静态页与显式旧 Vue 会话深链保留。归档工具栏提供 `… → 删除所有归档任务…` 与退出 `X`，列表显示项目来源、相对时间和完整时间提示。

批量删除由主进程生成 grant 绑定的不可变 ID 快照，确认显示完整数量，不以当前 50 条分页、筛选或隐藏项目限定范围；快照替换/撤销失效且确认只消费一次。写入时重查归档、运行、队列及未确认提交状态；损坏数据保护为失败，分别反馈删除/跳过/失败。成功目标的附件与草稿清理，迟到保存/读取不能复活已删 owner；取消、退出归档、切自动化与设置不被晚响应重新打开。仅刷新读取可重试，不重放删除；相关自动化对象保留。

统一检查：04:09:25–04:09:56 两 workers 全量 148 文件/2385 项全部通过，React/Vue 类型、React/Electron 编译和 diff 检查通过；04:10:14 只读审计 291 JS 全匹配、240 动态目标、19 许可副本/NOTICE/HTML 一致，缺失/差异/旧块 0。CSS SHA-256 `e948167667ab48554c87e47d6b8077e6fa44b1f693dcdbe7430720cb71be17ae`；结果在 `/tmp/mira-archive-entry-20261010.MZ8Vd2/`。独立严格 Electron 类型检查仍有 48 条诊断，编译不代表该检查通过。

实际隐藏编译 Electron 两个独立验证各 6 项通过：默认首次启动、应用/设置往返、旧 Vue 深链兼容及实际进程重启后的草稿/附件原字节保持；另验证 62 个归档（含置顶、隐藏项目、超出第一页）、取消与晚响应保护、真实 UI→桥→IPC 删除 60/跳过 1/失败 1，快照后新归档不受影响。删除 IPC 仅一次，之后列表实际读取两次，不声称一次刷新请求。六张图已查看，0 页面错误，五项产物 hash 不变；隔离库、进程及本地服务已退出。结果分别在 `/tmp/mira-startup-20261010.nnnNwB/` 和 `/tmp/mira-archive-20261010.Zsi4gG/`，不替代前台原生、真实模型或 Windows 验收。03:46 gallery 报告原本的 `passed:false` 保留，默认入口问题由本批独立验证关闭。

只读性能：当前冻结产物下 3 次独立启动的 500 轮/1000 消息样本，首开中位数 164.5ms、切回长会话 115.6ms、Composer 输入 12.9ms、轮次定位 33.35ms。首开仍有 86/78/81ms 长任务；独立 trace/CPU 指向 React 同步提交、Timeline 布局测量、scroll ref 捕获和 assistant-ui 订阅更新，尚未实施此批优化。计时、样本数量、映射核验与边界见 [性能文档](MIRA_HARNESS_PERFORMANCE_2026-10-08.md)，不把隐藏绘制机会当作原生输入延迟。

清理：本次继 01:43 的 18 项后再移除 46 份已由 JSON/摘要替代的成功日志，合计 64 项；原始内容及修改前引用文件按 SHA 校验备份到 `/tmp/mira-success-log-cleanup-20261010.F72WXX/`。保留 5 份诊断日志、现行 148 份测试、产品文档、迁移/兼容回归及许可。移除失效日志链接和 manifest 条目；本次清理前后 528 个源码/测试/依赖/许可等文件 hash 一致，随后仅同步现有进度文档，不重复测试/构建不变的代码。备份只在本机临时目录，不进 Git。

2026-10-10 清理补审：新增净移除 12 项，累计净移除 76 项；包括 1 份已退出自由菜单录入功能的测试、1 份旧验证包装器、4 份已在证据页保留摘要的重复 JSON/评审文件及 6 份过期一次性原生脚本。旧 `/system/menus` 已重定向，`filterIframeMenus` 仅被不可达旧页面引用；微应用复用的是另一份菜单编辑组件，不删其代码或有效测试。仍供首屏/搜索原生脚本使用的 `mira-zcode-cu.swift` 已在 05:14 补审时按原 SHA 恢复，避免依赖只存在于本机临时二进制。当前保留 147 份测试、迁移/兼容覆盖、构建/开发脚本、设计上下文、许可、仍被引用的验证结果与对照图。新增删项和修改前文档备份在 `/tmp/mira-cleanup-final-20261010.05tBKm/`；恢复前审计记录的 523 个其余受保护文件哈希未变、34 份文档/491 个本地链接无缺失以及 13 个备份保持历史身份，不用于核验后续功能增量。恢复后 tracked 删项为 29 个，全部有可读备份；其余 46 份旧日志及 12 个新增删项的备份继续保留。清理本身不修改功能代码；后续跨组拖拽与性能改动另行验证。

05:18 清理收尾复核：净删项 76 个、tracked 删除 29 个；34 份文档/493 个本地链接无缺失，46 份旧日志和 13 个补审备份均校验通过，恢复的 Swift 文件与备份 SHA 完全一致，`swiftc -typecheck` exit 0（保留既有 macOS 弃用警告）。结果只存 `/tmp/mira-cleanup-final-20261010.05tBKm/post-restore-audit.json`，不新增仓库测试文档或截图。新版功能代码、有效回归与原始许可保留。

下一步：按已定位的长会话提交链做有前后同条件证据的局部优化；侧栏继续补跨组拖拽、组内新任务先建草稿/首次发送持久化、任务行 hover 归档确认与文件树入口。PDF/视频另列；电脑工具恢复后补真实原生与 ZCode 同态，当前不解锁、不抢焦点。整体 active，未提交/推送。

## 历史批次（2026-10-10 03:46）

完成：附件选择/拖拽/粘贴走会话绑定的不可变存储，PNG/JPEG/GIF/WebP 和 UTF-8 文本可单独发送；公开历史与快照不内嵌图片字节，模型调用/压缩边界才读取。模型不支持图片时在 ACK、队列和历史写入前拒绝，保留原稿并允许切模型重试。文件树菜单与预览可将受支持图片加入 Composer，其余图片格式给转换提示。文本上限 256KiB/项、累计 1MiB；图片 20MiB/项、累计 40MiB；共用最多 12 个引用，PDF/视频未接。

Composer 与同一条历史消息共用图片组预览：箭头/方向键循环、50–300% 缩放、可用区域内拖动、窗口调整后约束位置、逐图读取/解码错误及重试、关闭后恢复缩略图焦点。原生保存桥只接 sessionId/path，主进程解析冻结内容并选择目的地；取消不改草稿。保存旧图的迟到失败不显示到新图或新任务，预览模态隔离 Composer 模型/权限快捷键。实际页面复现并修复缓存图片重试的 onLoad 先于 effect、导致永久加载的问题，复现回归保留。

附件 GC 在迁移完成、Runtime 创建前按历史、持久草稿、恢复列表和未确认提交读取引用根；未知或损坏状态保守保留相应 owner，空会话清理同时检查历史消息及 owner 身份。不承诺运行中即时回收、SQLite 文件缩小或 ACK 后进程内待执行队列重启恢复：该队列不持久化，ACK 已清除 durable draft/submission，进程退出后不再构成引用根。

自动验证：03:33:19–03:33:49 两 workers 全量 146 文件/2345 项通过；最后 React 修复后 React 类型、React 构建通过，Vue 类型及 Electron 构建在其前通过且此后未改 Vue/Electron。严格 Electron 类型仍有既有诊断。03:33:38 只读产物审计 291 JS 一致，缺失/差异/旧块 0，240 动态目标存在，19 许可副本一致；静态闭包 2,184,619 bytes，逐文件 gzip9 合计 649,273。CSS SHA-256 `4d4ec520421be0bc831208db05fe371e3ef37deaf9bd6ddecb6c1d03a2b84e69`。结果在本机 `/tmp/mira-gallery-20261010.3lQGDC/vitest-final-results.json` 和 `final/bundle-audit.json`；字节不证明整体性能通过。

实际隔离联调：最新隐藏编译 Electron/main/preload/Vue/opaque iframe/MessageChannel/React StrictMode 报告通过 10 项，涵盖真实文件冻结、受控本地 HTTP 图片请求、guide 降级入队、粘贴移除、实际模型菜单重试、浅深图片组/缩放/拖动/解码重试/焦点、保存替身精确字节与取消、工作区图片加入及新稿唯一 owner。页面异常 0，五项产物 hash 不变；8 张最终图逐张检查。报告 `/tmp/mira-gallery-20261010.3lQGDC/gallery-results-2026-10-09T19-35-35-945Z.json` 整体仍 `passed:false`：最后重启落在实际默认旧 Vue 页面，夹具没有进入 React；不能声称 React 重启后草稿 UI 已通过。此前真实图片重试失败、后续 Radix aria-hidden 定位器失败分别保留原报告，不改写结果。

重启后另行只读 SQLite 检查：历史 4 个附件、草稿 1 张图、恢复 1 张图共 6 项保留原字节，废弃/已移除图片回收，3 个 owner 会话保留；未在此夹具播种 submission 根，该根仅有单测证据。准确范围见同目录 `startup-gc-readonly-results.json`。测试进程与本地服务已退出。选择/保存对话框是隔离替身，输入用 CDP/DOM；不替代原生输入、真实模型推理、同态 ZCode、Windows、发布或完整性能。

下一步：先将根启动、主应用选择和合法 React 静态路由的导航回退纠正到 `/workspace/harness-react`，保留显式旧 Vue 会话深链接；用真实编译 Electron 验证无需点“新版工作台”的首次启动、设置返回与进程重启。之后补 ZCode 归档视图的批量永久删除，再逐入口同态对照与 profile。当前工具无可调用 computer-use，前景仍为锁屏 `com.apple.loginwindow`，不解锁、不抢桌面焦点。整体 active，增量未提交/推送。

## 历史批次（2026-10-10 02:20）

完成：Vue Shell 箭头与平台主修饰键 `[` / `]` 共用 React 导航事务，最多 50 条；任务、自动化列表/详情/记录/筛选及市场可前进后退。仅实际打开成功后提交位置，保存/打开失败、取消和旧请求不推进；删除清除对应历史，归档保留。设置往返在同一窗口恢复快照、前进栈、对话草稿的正文/项目/计划及自动化新建草稿，Novel/设置不显示或接管 Harness 导航；快照只保存目标和 UI 位置，不存正文，不承诺进程重启恢复。

验证：02:12:41–02:13:09 两 workers 全量 142 文件 / 2186 项通过，React/Vue 类型、React/Electron 构建及 diff 检查通过。新产物审计 291 JS 一致、无旧块/缺失/不匹配，240 动态目标存在、19 许可匹配，CSS 与 fresh Tailwind 一致。02:16:16–02:16:20 隔离真实编译 Electron、preload、Vue Shell、opaque iframe、MessageChannel 与 React StrictMode 的 9 项联调通过，4 张图已逐张查看；覆盖导航重放、设置往返/两类草稿、真实缺失会话失败后正文及位置保持、Novel 隔离。数据在隔离 SQLite，自动化禁用且零运行，外网被阻断；市场错误态是该夹具预期，不是本批在线市场验收。结果为本机 `/tmp/mira-navigation-20261010.nTVa2z/vitest-final-results.json`、`bundle-audit.json` 与 `results-2026-10-09T18-16-16-745Z.json`，不新增仓库证据堆。

失败与边界：初轮自动化 busy 接线/旧窗口夹具失败已修，最终全量通过；桌面脚本首轮因错误文案断言过窄失败，后续修夹具并补实际正文 Range/可见性确认，生产产物未变，旧失败保留。严格 Electron 类型仍保留既有诊断，编译不替代它；隐藏 Electron/CDP 不等于原生输入、同态 ZCode、真实模型/调度、深色全矩阵、性能或发布验收。此前 84ms 长任务未在本批重测。当前增量未提交/推送。

## 本轮纠偏

2026-10-10 01:43 +08:00 清理增量：移除 18 个遗留文件（17 个 Git 文件、1 个本机日志）：7 个旧 Vue 界面纯源码字符串测试、1 份过时 UI 评审、2 份旧单入口审计脚本、2 份可重新生成的夹具 CSS、4 份被后续结果取代的 JSON、1 张未引用观察图及 1 份早期日志。同步修正文档链接和两份清单，生成的夹具 CSS 不再纳入 Git。当前功能回归、迁移/设置/授权测试、有效对照证据与许可证保留；原有未提交源码保持。

清理后验证：01:42:01–01:42:27 两 workers 全量 137 文件 / 2047 项通过，React/Vue 类型及 diff 检查通过；548 个项目文档本地链接无新缺失，两份修订清单 JSON 可解析。保留的 498 个源码、测试、依赖与许可文件哈希逐项一致。只改清理相关文件及引用，不重建或重拍不变的界面，测试结果在上述临时目录，不新增仓库证据文件。

删除前已备份到本机 `/tmp/mira-legacy-cleanup-20261010.NTOfhw/` 的两份 tar，以及单独保留的 PNG/日志；临时备份不进 Git，不跨机器。以上源码哈希与 2047 项测试仅为 01:43 清理检查点；2186 项是随后 02:20 导航批次，当前附件实现及最终检查以上方最新批次为准。

此前只参考布局、接了局部按钮，就转向文件能力，没有先完成用户第一眼能看到的三块界面。源码可用并不意味着已经按源码完成；之前缺少逐入口、逐状态和实际装载路径的完整映射，文档又把局部验收概括得过宽。

本轮以 ZCode 已实际装载的组件、软件画面和 Mira 真实能力为依据。不重新设计一种“类似 Agent 的 UI”，不以图标、测试数量或已有文件功能证明首屏对齐。

## 已确定的产品边界

- Electron 负责桌面、Harness 运行和持久化；Vue 保留两层 Shell、统一设置和应用切换；React 承载 Harness 内部导航、对话、输入、自动化与扩展主视图。
- 侧栏搜索和 Mira 右上角搜索在同一活动应用内应共用一个应用搜索入口。Shell 负责按钮、快捷键与分派，应用负责弹层内容、检索范围和结果动作；平台设置与应用切换仍由 Shell 管理。不能把 Harness 检索内容作为所有应用的全局搜索，也不能把标题过滤称为全局搜索。
- 2026-10-09 搜索职责补充：Shell 右上角是统一入口，搜索内容由当前应用决定。Harness 内侧栏、右上角与 `⌘K` 打开同一个 Harness 弹层，文件范围为当前任务授权工作区；独立 Mira Novel Studio 应自行提供作品/章节/人物/设定等应用搜索，不出现 Harness 的项目文件/终端等命令。“统一入口”不代表混搜各应用数据。目前只接 Harness 转发，旧 `/novel` 和设置页回退平台导航搜索；独立 Novel 搜索尚未接入，本轮不在 Harness 仓库实现小说检索或虚构能力。后续接入时明确当前应用搜索与平台导航的范围。
- 建议交互：提示和弹层标题显示当前应用（如“搜索 Harness”“搜索 Novel Studio”），切应用关闭旧弹层，不沿用前一应用的结果与授权范围；未接入应用搜索时明确回退为“平台导航”，不伪装成业务搜索。这是后续独立应用接入要求，当前未新增通用搜索框架或跨应用索引。
- 自动化保留现有 scheduler、任务与运行记录，不重写调度引擎；迁移表现层为工作台内 React 页面，保持侧栏、导航选中态和对话草稿。旧 Vue 页面只是迁移期入口，不算完成。
- 2026-10-09 用户确认：插件市场本轮接公开开源来源，支持真实浏览和安装，不只做本地 Skill/MCP 管理。已接 `anthropics/skills` 固定审查提交 `683bc88e56f3e09ba94f7055977f3d3aa499f202`，19 个目录中 14 个 Apache-2.0 包可安装；特殊许可的 docx/pdf/pptx/xlsx 与无包许可的 doc-coauthoring 排除。刷新重新校验同一提交，不自动跟随 main。MCP 仍管理实际配置，不冒充在线 MCP 市场。
- 现有统一设置继续是配置事实来源，包括浅/深主题与发送快捷键。React 不另建主题、快捷键或模型设置系统。
- 保留既有计划、权限、记忆确认、委派、审批和草稿保存能力；UI 重排不授权删掉真实能力。
- 不默认引入上游账号、付费、云端分享、远控、画板、Goal 持续运行或工作流引擎。缺底层数据的内容不造占位功能；这些产品扩展须单独讨论。
- 上游“移除项目入口”保留历史，Mira `deleteProject` 会删除关联会话、回收站和自动化。两者不得共用一个假装等价的按钮。

## 三块验收矩阵

下表区分已接入的真实交互与剩余缺口，最新状态见本页顶部记录。代码实现不等于原生同态验收；历史宿主检查保留原构建身份，不扩大为全部工作台状态或完整同态。

| 区域 | 对齐内容 | 当前发现与要求 |
| --- | --- | --- |
| 侧栏顶部 | 新建、搜索、自动化、插件市场；hover、选中、快捷键 | 已接共享命令中心、React自动化、公开独立Skill与固定来源Skill插件包浏览/详情/完整下载；已安装条、管理、@引用和导航中安装结果有07:37限定Electron验证。安装包静态命令已接/选择/参数/宿主展开与冻结上下文；通用外部来源、动态Shell/模型工具覆盖、Agent/Hook及插件MCP执行未接，原生hover/快捷键完整对照未完成 11:55补双目录局部错误/加载/重试、详情隔离与已安装离线刷新/启停，明暗Electron10项/6图已验；12:06市场Radix键盘切换、详情准确回焦/滚动和真实固定源Skill安装有明暗Electron12项/10图验证；12:14已安装条焦点裁剪修复，明暗Electron6项/4图已验 |
| 任务视图 | 自定义分组 / 项目、排序、时间线、全部折叠 | 已接独立组名/7 色/新任务/折叠/移入移出/解散/组与组内手动排序，偏好保存；时间线按日期分桶、20 条分页、项目来源副标题，仍只有分组/项目两个一级标签。项目/组全部展开折叠独立保存；原生重载保持明确折叠，不改变活动会话。空组任务重启保留有存储回归；折叠项目/组按完整成员显示未读/执行/待确认，展开不切任务或清未读，11:30明暗生产Electron12项已验 |
| 项目区与长列表 | 原生目录新增、分区开合/排序、hover 操作、悬浮组标题与完整任务可达 | 已接项目/个人分区独立持久折叠与鼠标/键盘排序、空/折叠个人新草稿、项目任务每次 +5/折叠重置；父/子全部开合一个事务，添加后目标可见。运行/审批保留原归属。自定义组与未分组完整展示，组内/混合根层 >80 虚拟化，焦点/菜单/异步操作及错误保留；悬浮组标题接真实组动作。目录新增/改名/文件树/打开方式/隐藏恢复保留；11:40补目录不可用警告/菜单说明、禁用目录操作但历史/元数据可用，真实改名刷新及菜单不被Tooltip遮挡有明暗Electron10项/6图验证，完整原生选择、拖拽与 ZCode 同态待验 11:48补添加项目实际清单刷新、隐藏身份恢复/展开及侧栏安全失败/重试，明暗Electron10项/8图已验； |
| 任务行 | hover/focus、状态/未读/待确认、置顶/改名/移动/归档/复制/打开方式 | 跨组/空组/根交错及组边缘拖拽、任务 hover 快捷操作、原位归档确认和不切任务的文件树已通过限定 Electron 验证；组首/根首临时草稿、准备时隐藏、首发接纳后提升、关闭复开及 F5 自动恢复已通过。任务更多统一Radix悬浮/键盘提示，菜单独立menuOpen保留按钮及定位；原生菜单/快捷键完整同态仍待验 |
| 归档 | 切换视图、分页、打开、恢复、确认永久删除 | 查询/恢复/分页/二步单项删除与全量快照批量永久删除已接；精确数量、取消/晚响应、写入状态复查与逐项结果已有回归及独立 Electron UI 验证 |
| 底部与设置 | 设置、技能、MCP、用量、浅深模式及返回 | 已接分离入口和 pathname/query 白名单、React 来源返回；统一设置仍是事实来源。本批实际 Vue 引导设置保存、浅深往返与重载通过，完整设置矩阵/原生草稿恢复待验 |
| Header | 标题、目录/路径/分支信息、更多、编辑器/终端/面板 | 已接目录详情/复制/打开、任务菜单与分组移动；标题重命名的 IME、拒绝保稿、真实成功与迟到旧任务隔离已有本批明暗宿主验证。Git 分支归摘要环境入口，状态/文件树不在 Header 常驻。当前任务更多统一Radix悬浮/键盘提示有11:30明暗Electron验证；完整原生同态待验 |
| timeline | 用户附件/引用、轮次 rail、hover 预览、点击定位、滚动恢复 | 已接会话/root 隔离的 renderer 阅读记忆、正文/rail 分别虚拟化，运行轮保持正常流；Radix Hover Card、Home/End/Page 与迟到保护已接。焦点或正在编辑的轮次保留，编辑取消后释放编辑保留、焦点离开后释放焦点保留，本批 100 轮明暗宿主验证有界 DOM。rail/搜索/摘要先挂载再定位，guide 保留独立 query 导航；正文/变更查找、跨节点高亮、流式/终态定位和阅读接管沿用既有协议，不承诺进程重启恢复 |
| 共享搜索 | Shell/侧栏同一入口、实际结果动作、搜索历史与跨 frame 焦点 | 已接工作区隔离的 20 条偏好历史，默认 6 条、展开/清空/重放/失败重试，只有成功打开结果才记录。取消由发起层还焦，当前 port 一次性身份与入口有效性保护；动作/导航不回旧按钮，重复打开保留 query 重新聚焦。晚结果/关闭不抢新焦点；完整原生/ZCode 同态仍待验 |
| 执行过程 | 思考、工具参数/结果、进行中/等待/完成/失败/停止/部分失败 | 已接父任务有序 text/reasoning/tool parts、有界输入输出和工具内审批；拒绝/超时/Stop 保留取消记录。展开状态按会话/run/条目隔离，流式转终态及虚拟重挂载恢复。错误 Radix Popover 支持复制反馈与 Tab/Shift+Tab/Escape，文件按钮调用真实受控服务且不切父详情，本批明暗验证通过。旧无 parts 历史兼容、不生成虚假思考，真实模型与原生同态待验 |
| 消息操作 | 复制反馈、编辑重跑、准确目标的重试与分支 | 已接复制反馈与仅最新合格回复重试；历史用户编辑保稿与宿主权威受理已有限定验证。从准确回复分支、独立历史/图片、源消息返回、草稿隔离、迟到ACK及真实Agent续写有09:30明暗生产Electron验证；不回滚文件、不重复计历史用量，原生ZCode同态仍未完成 |
| 悬浮胶囊 | 有内容才出现；计划/待办/文件变更/子任务区和操作 | 已接真实计划/子任务停止/变更及 auto/mini/panel；Workbench 生命周期切任务保留、重载 auto。步骤优先、各区独立折叠、子任务默认收起/晚错误隔离已接。长待办当前窗口与前后预览、完整计划已接。10:26修复小桌面panel遮挡Composer：阅读区边界、可键盘滚动、低空间胶囊回退与焦点保护有明暗生产Electron10项验证；不扩大为全部窗口状态。Goal/workflow与原生同态未验 |
| Composer 壳 | 项目条、附件、左侧 + /权限/计划，右侧用量/模型/思考/发送 | 保留统一顺序和真实能力，已接 Lexical PlainText/History、状态 placeholder/准备 spinner/hover 移除计划；短标签引用与 canonical 正文分离。匿名/prepared/accepted 保持编辑器，真正切 owner 或清稿隔离历史；本批限定浅深宿主及截图复核通过，不另画常驻 @、/ 按钮 |
| `@` / `$` / `#` | 光标触发、分类搜索、真实上下文选择与插入 | @含已启用本地插件、四种内置子智能体、当前项目文件/对话；$为本次消息Skill原子引用；#跨本地Controller项目查询公开对话正文。角色引用不执行、不改委派/权限，受项目/计划/委派门禁约束；真实reviewer只读执行与回传已验。100k/owner/目录/revision与附件DTO保护保持，skillIds/pluginIds冻结与撤回恢复已接。自定义/插件Agent及原生同态未验 |
| `/` | 光标 token、能力目录、保留前后正文、键盘和空态 | Lexical token替换保前后文/引用；命令/技能/内置子智能体分组，跨组默认选最佳匹配。/side连接真实旁路，主任务可用、草稿/旁路不嵌套、不自动发送。/mcp真实状态/工具数、只读刷新、选择与Vue管理保稿，后台连接/在途清理/定向重连已接且实际stdio和Agent恢复通过。/compact及/compress、用量浮窗、FIFO压缩/防重复、真实摘要/图片/停止/重试/保稿/续写有10:05明暗生产Electron验证；安装包静态命令/嵌套名/原子标签/参数/必需Skill与计划门禁、短历史/冻结展开、实时队列复核与撤回已接；动态Shell/模型工具覆盖、自定义Agent、远程OAuth与实体IME完整矩阵待验 |
| `+` | 同一上下文面板，附件/插件/子智能体/文件/对话，焦点/键盘 | Radix统一分类面板/底部切换；插件与内置角色原子chip保正文不自动发送，真实Lexical/Agent/Electron已验。项目文件复用@的stage/owner协议，失败保range不覆盖新输入；独立附件与token分离。隐藏视图停用快捷键/portal，完整原生输入与ZCode同态未验 |
| ↑/↓输入历史 | 空正文或翻阅中、编辑退出、目录隔离、重载保持 | 12:53已接宿主SQLite最近30条、连续去重/有界载荷/仅接纳记录；主旁路共享目录历史、跨任务实时刷新及独立草稿，斜线回忆不自动展开候选。迟到选区覆盖已修复，实际Agent/本机SSE、明暗Electron16项、F5及进程重开已验；实体IME与ZCode同态待验 |
| 运行中输入 | 可继续写；空稿停止，有稿入队/指导；队列撤回 | 已接宿主权威队列、撤回恢复/排序/原子立即发送、暂停确认/恢复，以及统一设置控制的 queue/guide。引导在当前助手/工具批次完成后由同一运行消费，待消费项内联展示且可撤回；停止保留为暂停队列，不支持的输入明确降级。晚ACK/重载不重复提交。队列为进程内状态，不宣称应用进程重启恢复 |
| 输入边界 | 统一发送偏好、IME、Enter/换行、Esc、模型/推理快捷键、保存 | 保留 host-owned `sendShortcut/showContextUsage`、revision/flush；已接原子引用删除、canonical 纯文本复制/剪切、写失败不删稿及 plain paste。owner version 1 文档匹配正文/附件，偏好超限先省略可选元数据；静态回归与限定隐藏宿主通过。复制/剪切和首发 ACK 是明确受控夹具，实体剪贴板/IME 与真实模型尚待验 |
| 附件完整性 | 文本/多媒体、拖拽/粘贴、预览/失败、附件-only | 图片/UTF-8 文本冻结、模型能力拒绝/切换重试、选择/拖拽/粘贴、附件-only、消息与 Composer 图片组预览/保存及启动 GC 已接；prepared owner 的正文/附件关闭复开与 F5 自动恢复已有正式 UI 验证。旧图片批次重启失败保留，当前不扩大为所有图片/原生选择保存/真实模型同态通过；PDF/视频未接 |

## 实施与验收顺序

1. 并行完成首屏现有能力接线：侧栏导航/归档/排序/footer；对话附件/轮次/工具状态/胶囊；Composer `@`、`/`、`+`/快捷键/草稿保护。验证交互、授权、迟到和持久化，不改文件支线。
2. 接插件市场在线浏览/详情/安装与 Composer 使用；补自定义组和项目菜单，再完成共用命令中心及 React 自动化。验证真实源与隔离安装、分组独立于项目、移除不误删历史。
3. 补底层缺契约的首屏能力：运行中队列、完整工具轨迹/思考事件、输入附件类型。先查引擎和旧能力，不画无效入口；产品变化再问用户。
4. 在相同主题、展开/选中/运行状态下对照 ZCode。批量检查首屏、hover/菜单/焦点、运行四态与设置往返，再集中修正并确认。软件 3.14.4 与源码 3.14.3 不视为严格同版本。

区分源码/单测、真实 React 浏览器、Electron/preload/IPC、原生输入与同态截图。单测不替代后三类。只操作隔离实例，不用用户会话测试、不改 ZCode 草稿、不抢用户正在使用的桌面。

## 历史批次（2026-10-10 01:21）

完成：参考 ZCode `TaskFindDialog` / `useConversationTimelineFind`，接 360×36 非模态查找栏、⌘/Ctrl+F 重聚焦、Enter/Shift+Enter/↑↓ 循环、单项重复定位、0/0 禁用、Esc 关闭/焦点恢复和对话/变更切换。查找用户输入、guide 与助手正文，不索引思考/工具或隐藏链接地址；CSS Custom Highlight 跨 Markdown/代码节点，流式投影复用 Streamdown 的 remend/GFM/CJK 公共解析规则。冷虚拟行等实测坐标再定位；正文转终态会重新定位，但 wheel/pointer/PageUp/Home 等阅读接管及关闭/换任务会取消排队定位。共享命令中心搜索历史按授权工作区 SHA-256 键写现有第一方偏好，最多 20 条，成功选择才记录；默认 6 条、重放/展开/清空和异步读写失败重试已接。

最终验证：01:18:34–01:19:00 两 workers 全量 142 文件/1977 项、React 类型/构建及 diff 检查通过。01:18:35 产物审计 291 JS 一致、旧块 0、240 动态目标存在、19 许可/NOTICE 匹配，静态 JS 闭包 2,149,306 bytes（逐文件 gzip9 合计 638,282）；JS SHA-256 `8e549b6b0c751ec6cdf9c9f322b02654bfab6ee864e279d74c3045dd55a61b71`，CSS `2036a484dcce8c5fc9f474d373ec5316f43efbc9de066baae5b63bc1bd049cab`。报告仅存 `/tmp/mira-find-final-20261010.nqBWuj`。完整 Electron 严格类型仍有前批 38 个既有诊断，本批没有修改 Electron/Vue 源码，未写成全类型通过。

页面证据分批：00:56 的旧 `2ae00cef…` 构建主线 15 项覆盖查找快捷键/IME/浅深高亮、diff、搜索历史重载/隔离/清空和流式正文；随后终态专项确实失败（稳定 Range 784–798，视口 53–699），保留失败 JSON。最终 01:18:38–01:18:45 冻结 `8e549b6b…` 真实编译 Electron/生产 React/第一方桥专项 7/7、4 次本地受控 SSE 请求、0 页面错误；冷 25/50 离屏定位、正文链接/未闭合 Markdown/代码标题排除及终态 Range 369–383 可见，wheel/pointer/实际 PageUp+Home 接管后保持原轮次偏移。三张截图已检查，五项产物 hash 前后一致，实例与服务器关闭。最终证据 `/tmp/mira-find-electron-20261010.dV3N17/results-2026-10-09T17-18-38-625Z.json`；前 15 项和各失败仍保留原产物身份，不当作最终构建全入口重验。

下一步：Vue Shell 应用切换右侧接前进/后退，React 管理 50 项任务/自动化/市场历史，经当前授权 MessagePort 分派；草稿保存/打开失败不推进游标，回放不重复入栈，切 Novel 清除 Harness 状态，设置往返保留有界宿主内存快照。自动化详情/标签导航需一起核对，不能只实现三个主视图就声称完全对齐。多模态/归档批量删除及完整原生、真实模型、ZCode 同态和性能仍未完成；当前工具列表无可调用 computer-use，隐藏 Electron/CDP 不冒称原生。此前 500 轮的 84ms 长任务仍待定位，未用新查找构建重测其性能。整体 active，本批增量未提交或推送。

## 历史批次（2026-10-10 00:30，Timeline）

完成：阅读记忆保存当前轮次/偏移与追底意图，按会话和目录隔离，renderer 内最多 200 项；异步消息及虚拟行实测坐标落实后才完成恢复，用户滚动或导航可接管。历史以任务轮次虚拟化，当前运行轮不参与窗口裁剪，历史高度缓存有界；同一运行转终态保留已展开详情。rail、正文搜索和摘要共用先挂载后定位，摘要按真实数据取最新助手，不从当前 DOM 猜测。修复子布局先于父 ref 导致短会话不显示、尺寸缩放误暂停追底及短历史返回落错轮次。未改 Electron/Vue 能力或原许可正文。

验证：00:16 全量 139 文件/1930 项通过，早于最后的恢复几何修复；最后修复后 React 类型、React 构建、00:26:54 定向 4 文件/37 项与 diff 检查通过。00:20:55 新产物审计 291 JS 一致、旧块 0、240 动态目标存在、15 许可匹配，静态 JS 闭包 2,131,300 bytes（逐文件 gzip9 合计 632,606）。当前 JS SHA-256 `331eae86c712fccf36e6271ee91f8643989ebffdb9cf800356abeab0853d284a`，CSS `3b31eed43a86c2bee24ce21f1db8ee14236634e54d29048c929e826d8d01774a`。完整 Electron 严格类型仍保留前批既有诊断，不写成全通过。

500 轮验证：00:26:16 启动的真实编译 Electron/main/preload/Vue/第一方桥/生产 React 与隔离 HarnessStore 检查 7/7，页面错误 0；底部挂载 18 条消息/506 个子节点（基线 1000/24,420），中部 34 条。rail 0/250/499、A/B 原轮次偏移恢复、离屏搜索 125 与摘要 499 正确。相同 seed/1440×900 下首开单样本 424.9→178.3ms，当前仍有 84ms 长任务；隐藏 renderer 两帧绘制机会不是原生首绘或 P95。三张截图已检查，五项 hash 前后一致，隔离实例已关闭。结果只存 `/private/tmp/mira-history-performance-20261009.RHHOum/after-2026-10-09T16-26-16-077Z.json`；旧 205.0ms/101ms 样本保留原产物身份。完整同态、真实模型、Windows 和发布仍未验收。

交互验证：同一冻结产物的隐藏 Electron/CDP 主线 24 项检查为 true，覆盖 A/B/草稿、真实 delta/complete 不抢历史阅读、自然到底/按钮恢复跟随、pin、展开 live 思考转终态、侧栏键盘/拖拽/折叠、双向迟到响应、rail/共享搜索/摘要及自动化/市场往返。主线 JSON 的整体 passed 为 false，仅尾部旧 1300px 夹具未产生额外换行；没有改写失败结果。随后独立补验 4/4、整体 passed 为 true，实际打开工作区使文字列 921→341px、高度 7446→16392px，不追底；跨宽度 A/B 恢复同轮次偏移 -70px，正常动画偏好下 rail 点击落偏移 0 并保持返回记忆。两份结果分别是 `/tmp/mira-timeline-electron-20261009.9xPahK/results-2026-10-09T16-23-50-645Z.json`、`results-2026-10-09T16-28-16-414Z.json`，三图已查看，五项产物 hash 不变，页面错误 0，实例已关闭。本地 SSE、夹具及 CDP 不替代原生/真实模型验收。

清理复核：58 个删项全部对应三份可读本机临时备份，48 个 tracked 删除已在既有 HEAD，10 个原未跟踪产物已移除；现存 139 个测试文件，管理/小说转换测试和 LICENSE/NOTICE 保留。无删项活跃引用或失效构建入口。guide/Timeline 增量保留在工作树，未提交/推送。

## 历史批次（2026-10-09 23:00）

已完成：统一 Vue 设置决定 queue/guide，默认 queue；运行中 guide 普通发送引导、⌘/Ctrl+Enter 入队，queue 模式修饰键立即发送。引导与原运行绑定，提交 ACK 不算消费；以真实 Agent 的用户消息边界写入已闭合回复、引导和下一段助手身份，停止/失败把未消费项保留为暂停队列。附件/计划或运行配置不兼容时保留完整输入并提示降级，动态工具授权仍按原策略执行。修复引导导致轮次 rail 高亮丢失、错过分段/终态事件后的快照恢复无限重读，以及 Vue 设置/主题往返和 renderer 重载后侧栏运行分组丢失；新列表来自当前进程 Coordinator，迟到列表不能覆盖更新事件。ZCode 许可归因同步，LICENSE/NOTICE 保持原文。

验证：22:53:20 全量 136 文件/1903 项通过，React/Vue 类型、React/Electron 构建与 diff 通过。22:54:03 产物审计 291 JS 一致、旧块 0、240 动态目标存在、15 许可匹配，静态 JS 闭包 2,121,452 bytes（逐文件 gzip9 合计 629,012）；CSS SHA-256 `20c6d3d45269ca4fec5232594e749e9d13c664b55cdfc50316938eb68b6886b1`。完整 Electron 严格类型仍有 38 个既有诊断（HEAD 为 39），不能写为全通过。22:55:37 启动的隐藏窗口真实编译 Electron/生产 React/第一方授权桥检查 18 项、75 事件、4 次本地受控 SSE 请求、0 错误；三个浅深截图已检查，含主题往返/重载后同一运行仍唯一留在“运行中”，停止恢复和进程重开后的 canonical 历史/设置无重放。五个产物 hash 前后一致，React JS `7b3c32c9f9cac352334a1131a69f8c20a3a564f4a9a7e17a11ca0cc95324b454`。证据仅存 `/tmp/mira-guide-final-20261009.QvXjVb` 与 `/tmp/mira-guide-electron-20261009.ocyuUG/results-2026-10-09T14-55-37-314Z.json`，不新增仓库测试文档或截图堆。前轮临时定位器/SQLite helper 夹具失败保留原身份；本批不算原生输入、ZCode 同态、真实模型、性能、Windows 或发布验收。

清理收尾：58 个废弃文件（48 tracked、10 临时产物）已移除；菜单/平台管理/小说转换与现版 Harness 测试保留，三份本机临时归档完整可读，无活动脚本或文档引用删项。备份不进 Git、不跨机器；当前 guide 增量未提交/推送，不覆盖既有工作树修改。

## 历史批次（20:46 及更早）

2026-10-09 20:46 增量：Composer按上游源码接运行中普通入队、⌘/Ctrl+Enter与平台主修饰键点击立即发送，不改变统一发送偏好；暂停队列先由宿主要求确认，Esc/关闭不发不删，保留发送后旧队列继续暂停，清空仅在新输入实际接纳后删除已确认的旧项。提交携旧运行身份、队列revision和完整IDs，过期确认重新显示最新队列；明确旧运行拒绝刷新权威会话并保留草稿重新提交，不确定ACK仍保留冻结提交身份。原子准备中也纳入任务/项目变更守卫，新输入从未临时插入普通队列。对话行使用会话+运行+同运行序号的渲染身份，canonical消息ID、搜索、审批与重跑不变；完成/停止/失败保持已展开思考/工具详情，新运行/换会话不继承，折叠不挂载详情。会话级WeakMap复用未变历史对象，避免每个delta重复转换历史；不存UI偏好，也不承诺未来prepend/删除同运行更早回复时的序号保持。

本批最终验证：20:44:02起两workers全量128文件/1709项通过（19.69s）；React/Vue类型、React/Electron构建和diff通过。20:44:09新产物审计291个JS一致、无旧块、CSS与fresh Tailwind一致、14个许可文件匹配；严格Electron tsc仍有既有错误，编译不替代类型/正式包/Windows验收。20:44:34–20:44:41 `scripts/verify-harness-message-queue.mjs` 的22项生产React/opaque iframe/MessageChannel检查和8张浅深图通过，逐张未见新增遮挡或重叠，包含确认取消/保留/清空/过期重确认、修饰键发送/晚ACK及终态DOM保持。JS SHA-256 `8b41d62d208c126c1e518793e40be34e26f27cf3d978764dfb214515e28eb771`，CSS `82ed23d1cd28fffd6286c39dbadf407ca64bebae64bb42f498f521ac15f08038`。结果在 `/private/tmp/mira-harness-current-validation-20261009.MVIc0C/vitest-immediate-final-results.json`、同目录 `bundle-audit.json` 及 `/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-message-queue-browser-SJRTqR`，均是本机临时证据，不进Git。另有11组真实React/assistant-ui生命周期检查；1000条旧消息+100次更新粗测确认缓存使转换次数100100→100，仅防止本批引入回退，不等于整体性能放行。

失败保留：本批第一轮全量使用修改中的旧Composer测试快照，另遇既有文件搜索夹具偶发失败；独立56项及最终全量通过。绝对路径fuzzy会匹配随机临时根目录的`note`子序列，安全内部候选可能从2项变5项，外部/broken仍排除；未修改这条既有搜索行为/测试。前三次浏览器分别暴露夹具未持久化部分回复、Radix模态aria-hidden与关闭后焦点异步，修正脚本夹具/等待条件后通过，未为过测修改生产行为；失败JSON保留各自临时目录 `mira-message-queue-browser-2GydtK`、`-Vt0BR4`、`-yhSvxA`。没有本批原生输入、真实模型或同态ZCode验收；当前无可调用computer-use工具，不以headless冒称原生。

下方20:14/20:19批次保持历史身份，旧数字及“发送确认/终态展开未完成”不覆盖上方当前实现。

2026-10-09 20:14 增量：运行中输入由 Electron 队列管理，第一方桥接提交/查询/撤回/排序/立即发送/恢复；模型、推理、附件字节及授权目录在接收时冻结，renderer 重载复用提交身份。补队列开始时权威用户消息与上一轮助手同步，旧 run/晚快照不污染新任务。公开父任务 text/reasoning/tool parts 按真实顺序流式与 JSON 持久化；工具身份包含 run/response/providerCallId，审批终态事件含 request/run/tool 身份并清除对应确认卡。工具数据、diff与公开思考有64KiB UTF-8边界，正文不截断，MCP错误沿引擎失败路径传递。思考仅保证当前provider API key跨chunk隐藏，不宣称任意凭证全面安全；不暴露子任务推理。

当前自动检查：20:13:46 起两workers全量128文件/1649项通过，React/Vue类型、最终React/Electron编译与diff通过；20:18:57新产物审计291个JS一致、无旧块、CSS与fresh Tailwind一致、14个许可文件完全匹配。严格Electron tsc仍有既有错误，编译不替代它、安装包或Windows验收。`scripts/verify-harness-message-queue.mjs` 最终20:18:56–20:19:02的16项生产React/opaque iframe/MessageChannel检查与6张浅深图通过，JS SHA-256 `c8be440a48116f0ab38c0d02231f0e352bd8fa920c0c0af3efcea43552fd926a`、CSS `e846ba9fa0db56714a67a7df5dbdd98ef46206010f47fda3e487b60ad638184c`。覆盖用户消息同步、FIFO/立即发送、键盘排序、重载/晚事件、工具输入输出、内联拒绝失败重试及取消历史，截图未见新增重叠；不是同态ZCode比对。当前结果暂存 `/private/tmp/mira-harness-current-validation-20261009.MVIc0C` 和 `/var/folders/tg/csdp22n50xn1nwfmfgh6808w0000gn/T/mira-message-queue-browser-2veEl8`，不新增仓库证据堆。会话/模型/权限为明确fixture，核心另有真实PlatformDatabase/工具集成回归；没有本批原生输入、真实模型或性能验收。

清理（2026-10-09 21:38 +08:00 复核）：最终移除58个旧原型/无效测试/PoC/过期或无效截图与临时产物，48个tracked和10个非tracked均有本地临时归档；未发现指向删项的活动链接或导入。此前60个计数包含两份旧管理模块测试，本次已恢复，保留仓库中尚存工具函数的覆盖；现版本回归测试、小说转换测试、许可和必要当前证据保留。清理后两workers全量134文件/1773项、React/Vue类型与diff检查通过，不替代原生UI验收。备份不进入Git，也不是跨机器备份。

以下16:58与17:27段落保留当时批次范围，数字不更新为本批结果。

完成：上表所列首屏入口与跨层桥已落地。自动化保留 scheduler/store/8 个既有模板，用 React 完整创建编辑页、设置/运行历史、启停/立即运行/重试/停止/删除确认和关联聊天；默认权限不升级。组、自动化与对话草稿保持独立，隐藏自动化暂停轮询/关闭弹层。

公开市场：固定 Git tree/raw 下载、blob SHA 与大小校验、路径/符号链接/子模块/跨平台名称限制，128 文件/4 MiB 单文件/32 MiB 包边界；先隔离暂存，再独占新目录发布，失败撤销本次安装，不覆盖用户目录，不执行脚本。安装保留完整许可/NOTICE/来源，接真实 SkillStore 启用与 Composer 使用。Electron 下载采用 `net.fetch` 遵循系统代理设置，不自动配置代理或新增凭据。

联调修复：归档 query 在 Bridge→IPC 两次解析后丢筛选、无参数 MCP 查询被 parser 拒绝、组件 CSS 被 Tailwind 覆盖、匿名 GitHub API 限额阻断，以及 Unicode 正文搜索与 SQLite ASCII `lower` 不一致。后者使用同一 JS Unicode fold；另补组任务重启保留回归。模型/通用设置入口纠正为实际路由；Workbench、Controller 与 Composer 的异步导航有效性检查已完成，旧请求不覆盖新视图/草稿。定向导航回归 14 项，移除保护时 10 项失败，最终源码已重新全量检查与构建。

16:58 批次验证（后续侧栏增量不沿用为全量通过）：16:50:47–16:51:20 两 workers 全量 123 文件/1313 项、React/Vue 类型、React/Electron 编译、产物/许可审计与 diff 通过。16:51:45–16:51:59 独立生产 React/opaque iframe/MessageChannel 页面检查 9 项、13 图通过，三份 React 产物 SHA 与自动验证一致；实际浏览、安装公开 brand-guidelines 并在 Composer 选中。会话/自动化为明确 fixture，不执行模型/调度；raw 直连超时，最终样本显式使用本机临时代理，不是 Electron 原生下载通过。完整结果、13 图、复现命令和边界见 [首屏证据页](assets/mira-zcode-alignment-2026-10-08/first-screen/README.md)。

17:27 增量：补侧栏时间线/独立批量展开折叠/隐藏项目恢复菜单，并修复纯提示 Tooltip 及其 Radix 外层拦截相邻归档按钮的点击。定向 4 文件/53 项、React 类型/构建与新产物许可审计通过。17:11 原生搜索 10 条记录/3 图确认同一个 Harness 弹层、`⌘K` 中文输入/Esc 草稿保留、旧小说路由不打开 Harness 搜索；该批使用旧 16:58 React 产物。17:26 新侧栏产物原生检查 21 条记录/3 图确认折叠/重载/时间线/归档真实 IPC/分组独立/保持活动任务。两次失败及修复原因单独保留。新结果与准确 SHA 统一见 [有限原生证据](assets/mira-zcode-alignment-2026-10-08/first-screen-native/README.md)，不混用两批截图或扩大为完整原生验收。

历史：16:33 的 122 文件/1299 项与 16:42:15 起点的 9 项/10 图先于导航收尾，保留旧样本身份，不覆盖最终源码。当前同名 JSON/截图为上方最终批次；未声称全部旧成功记录已单独归档。本轮未提交/推送。

当前剩余：未验首屏入口的完整原生/ZCode 同态、真实模型/调度与慢首开；PDF/视频、独立 Novel 搜索及跨 owner 预览/自动监听另列。默认 React、草稿恢复、归档批量删除、跨组拖拽、任务行 hover/文件树与组内草稿已完成限定验证。历史 DOM 虚拟化不等于宿主消息数据分页，阅读记忆和导航快照不承诺进程重启恢复；队列仍仅进程内。整体性能、正式包/Windows 未验收，旧首开 76/70/68ms 长任务尚未归因，本批没有新采样。

下次开始：按本表核对剩余首屏入口/状态，对照上游源码和实际软件补原生输入与浅深同态，再定位慢首开；不重做已完成的草稿/拖拽/hover/ref/rail，不跳回文件/metadata/媒体支线。隐藏 Electron 不冒称原生，不操作用户 ZCode 草稿或抢桌面焦点。

下次从本表未完成的首屏项继续，不返回文件/metadata/媒体预览支线。旧 [侧栏清单](MIRA_SIDEBAR_ALIGNMENT_2026-10-09.md) 保留细项源码索引；[PRD](MIRA_IMPLEMENTATION_PRD.md) 管总阶段，[对齐记录](MIRA_ZCODE_UI_ALIGNMENT_2026-10-08.md) 管证据状态，[交接](MIRA_PHASE0_HANDOFF_2026-09-24.md) 管续作入口。
