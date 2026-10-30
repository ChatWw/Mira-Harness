import { FACADE_DTS } from '../../packages/mira-flow-kit/src/facade/mira-dts'
import { parseMiraPromptCommandInvocation } from '../../src/config/miraPromptCommands'

export function miraWorkflowInvocation(text: string) {
  const invocation = parseMiraPromptCommandInvocation(text)
  return invocation?.name === 'workflow' ? invocation.args : undefined
}

export function expandMiraWorkflowPrompt(text: string) {
  const args = miraWorkflowInvocation(text)
  return args === undefined ? text : `请使用工作流完成以下任务。先决定智能体拓扑、共享上下文、每个任务的结果与验证标准，再编写脚本并调用 create_workflow；不得替换成普通委派或仅描述计划。\n\n${args || '请先澄清需要工作流完成的具体任务。'}`
}

export function miraWorkflowAuthoringPrompt(saved: unknown[]) {
  return `\n\n## Mira 工作流创作契约
用户明确要求用工作流（包括 /workflow）才启动工作流；不要自行把普通任务改成工作流。
先检查以下可复用定义。适合当前任务的已保存定义优先于重写脚本。运行 saved 不需要重写源码；同名项目定义优先于全局定义，可用 scope 消歧。
${JSON.stringify(saved)}
create_workflow 的 script、saved、path 必须恰好传一个。script 是一次性 TypeScript 正文；saved 是 {name,scope?,args?}；path 是项目内脚本/上次结果提供的草稿路径。args 只随 path，saved.args 随 saved。内联 script 不接收 args。
name 必须是用户看得懂的简短名称。脚本先编译；编译失败返回诊断且没有运行，修正后重试。成功后用户审阅真实源码、阶段/智能体/交接图及命令，再启动后台运行。不得声称未批准的工作流已经启动。
工具成功返回 runId。运行在后台完成后会自动通知主对话，除非用户要求等待，否则继续其他工作，不轮询或重复启动同一任务。
max_concurrency 仅在用户提出并发上限时设置；它是正整数，超过宿主上限会钳制。所有智能体使用本次选定模型，不能在脚本内指定模型或工具档位。
每个 agent() 创建独立上下文。同一个 actor 的 ask 串行且积累上下文；独立任务用不同 actor 并 Promise.all。非空名称在一次运行中必须唯一，循环里用稳定的不同名称或匿名。子智能体不能再创建工作流。
根据控制流需要用 ask<T> 的窄结果类型；声明普通 interface/type，字段用 JSDoc说明。传文件路径而非大段文件内容。只读任务在 ask 中明确禁止编辑。
必须用 phase("用户语言的阶段名称") 标记有效阶段。限制循环轮数，带入上轮反馈。事实结论安排独立核验；机器可判断的门槛用 world.run 并检查 exitCode，不相信模型声称检查通过。
脚本没有 Node、浏览器、网络、时间、随机或 import 能力；仅使用下方 facade。world.run 的命令必须是字面量，动态值放 argv；命令仍遵守运行权限。无法验证的事情说明原因，不能编造成功。
report() 渐进保存结果；返回紧凑的结论、已验证及未覆盖事项。用户需要保存的文件或完整报告通过 artifact.file/markdown 发布。避免重复产物。产物标识必须是字面量。
save_workflow 只在用户明确要求保存/更新定义时调用。保存与运行是两件事：它只编译、审阅并保存，不启动。scope 必填 project/global，name 为文件安全标识，description 必填，whenToUse 与参数声明按需提供。script 和 script_path 恰好一个；内联正文不带元数据块。覆盖既有定义需要审阅，批准后若定义变化会拒绝保存。
当前提供 read_workflow_contract、create_workflow 与 save_workflow，不要调用未注册的 AmendWorkflow、EvalWorkflowSnippet、WaitWorkflowRun、ListSavedWorkflows 等工具。现有工作流的状态和停止/原样续跑由工作台提供。
\n### 编译器的真实 facade\n\`\`\`typescript\n${FACADE_DTS}\n\`\`\``
}

export const MIRA_WORKFLOW_AUTHORING_HINT = '\n\n用户明确要求工作流时才调用 create_workflow。自写或保存脚本前先调用 read_workflow_contract 读取真实 facade、规则与可复用目录；按名字运行 saved 定义不需要重写脚本。保存只在用户明确要求时调用 save_workflow；启动和保存均须审阅，运行结果会后台通知。'
