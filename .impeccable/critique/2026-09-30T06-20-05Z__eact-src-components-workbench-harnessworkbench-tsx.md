---
target: apps/harness-react/src/components/workbench/HarnessWorkbench.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-30T06-20-05Z
slug: eact-src-components-workbench-harnessworkbench-tsx
---
Method: dual-agent (A: /root/design_assessment · B: /root/detector_review)

# Mira Harness 对比评审

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | 就绪与权限可见，但模型和执行状态仍埋在 Composer |
| 2 | Match System / Real World | 3/4 | 项目与任务直观，但 Harness、DeepSeek、完全访问偏技术术语 |
| 3 | User Control and Freedom | 3/4 | 新建、关闭、项目、计划模式可见；恢复与撤销不明显 |
| 4 | Consistency and Standards | 3/4 | 三栏结构熟悉，部分图标按钮和低对比控件不够明确 |
| 5 | Error Prevention | 2/4 | 高权限和执行模式在首屏同层出现，缺少自然语言风险说明 |
| 6 | Recognition Rather Than Recall | 3/4 | starter chips 有帮助，但缺少真实项目上下文示例 |
| 7 | Flexibility and Efficiency | 3/4 | 项目与最近任务适合重复工作，但侧栏偏宽、无快捷键提示 |
| 8 | Aesthetic and Minimalist Design | 3/4 | 干净克制，但空态与 Composer 视觉层级断裂 |
| 9 | Error Recovery | 2/4 | 截图没有体现失败、拒绝权限和模型不可用后的恢复路径 |
| 10 | Help and Documentation | 1/4 | 只有搜索和设置入口，首屏没有上下文帮助 |
| **Total** | | **26/40** | 中等，主要问题是可开始性与信任 |

## Design Specificity

Mira 当前设计特异性中等偏低。它已经有自己的 logo、橙色权限语义、中文任务语气和 Harness 术语，但灰白聊天空态、项目/最近列表、底部 Composer 仍与品类模板高度相似。Mira 更像“会话容器 + 高级配置”，还不像一个让用户马上提交个人任务的工作台。

ZCode 的优势是平台导航、项目/任务入口和 Composer 共同形成单一首屏起点；Codex 的优势是把导航和主动作边界压得很清楚。Mira 应借鉴单一路径、作用域显式和按需展开，不应复制它们的插件市场、自动化或代码工作流。

## What's Working

1. 顶部 Shell、会话侧栏和主画布分区清晰，适合后续承载长任务。
2. Composer 固定在底部，发送位置稳定，项目/模型/权限/计划模式已经有实际交互基础。
3. 就绪状态和权限状态有显式反馈，starter chips 为新任务提供了识别入口。

## Priority Issues

### [P1] 首操作路径断裂

空态标题在画布中部，真正可操作的 Composer 在底部，用户需要在“先选项目、先输入、先设置模式”之间来回判断。

修复：将价值说明、1-3 个真实任务模板和 Composer 组织成同一个垂直起始区；提交任务后再回到宽画布。

### [P1] 作用域不明确

侧栏项目树、顶部“个人工作区 / Harness”和 Composer 的“选择项目”同时存在，消息最终归属不够明确。

修复：首屏显式显示当前工作区/项目 scope，默认个人工作区，并在切换项目时解释对文件、记忆和权限的影响。

### [P1] 高风险配置抢占首屏

完全访问、深度搜索/模型和直接执行/先出计划与第一次输入处于同一视觉层级，橙色权限状态会让普通用户先处理风险而不是任务。

修复：默认安全/计划模式；模型、Skill、MCP 和权限收进一个可解释的高级设置入口；发送前只用一句话说明读写边界。

### [P2] 侧栏分类竞争与密度

项目树和最近对话两套分类同时展开，侧栏占据较大宽度，当前项目上下文不够突出。

修复：当前项目优先，最近任务作为单一列表；其他项目默认折叠；搜索和状态队列保留。

### [P2] 产品语义偏内部工具

“Mira Harness”和“个人工作区 / Harness”把通用 Agent 的第一印象拉回工程术语，空态文案也过于泛化。

修复：Harness 保留为次级技术标识；主标题使用 Mira 的个人工作方式，并用真实任务模板表达产品角色。

## Persona Red Flags

- First-timer：看到 Harness、DeepSeek、完全访问等术语，不知道第一步是什么，可能不敢发送。
- Power user：项目和最近列表有价值，但侧栏偏宽、首屏大留白、Composer 偏重，降低连续切换和输入吞吐；快捷键线索不足。
- 风险敏感的文件/代码用户：完全访问像默认高权限，缺少读写边界和撤回说明。
- 低视力用户：侧栏元数据、空态副文案和部分小控件偏浅偏小。

## Detector Evidence

自动检测只发现 1 条 warning：`apps/harness-react/src/styles/thread.css:19` 的 Markdown blockquote 使用 `border-left: 3px solid var(--color-border)`，规则为 `side-tab`。这是 Markdown 引用块的语义样式，使用中性色边框，属于误报，不应为此改 UI。人工后续关注小尺寸图标、hover 隐藏操作、终端 tab 键盘语义、流式状态 `aria-live` 和少量硬编码颜色。

浏览器检测未执行：puppeteer 不可用，React 资源服务 `127.0.0.1:9001` 当前不可连接；本报告不把静态结果当作真实 Electron 验收。

## Questions

- 首轮应优先重做“首屏任务起点”，还是先重做“侧栏与作用域层级”？
- 高级配置是否统一收进一个入口，只把当前权限/模型作为紧凑状态显示？
- 是否保留“Mira Harness”作为顶部产品名，还是让 Mira 成为主品牌、Harness 退到副标题？
