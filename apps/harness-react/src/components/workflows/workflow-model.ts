/* Workflow journal presentation adapted from ZCode workflowRunPanel.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/. */
import type { HarnessEvent, ModelProviderSummary, ModelSelection } from '../../../../../src/config/harness'
import type { MiraFlowWorkbenchRequest } from '../../../../../src/config/miraFlowWorkbench'
import type { ActorRecord, AskProgress, NodeRecord, RunRecord, StoredEvent } from '../../../../../packages/mira-flow-kit/src/engine/mira-types'

export interface MiraWorkflowHost {
  requestWorkflow<T>(request: MiraFlowWorkbenchRequest): Promise<T>
  onWorkflowEvent(listener: (event: HarnessEvent) => void): () => void
}
export const workflowStatus: Record<RunRecord['status'], string> = { pending: '等待运行', running: '运行中', completed: '已完成', errored: '运行失败', stopped: '已停止' }
export function workflowError(error: unknown) { return error instanceof Error ? error.message : '工作流操作失败，请重试' }
export function workflowModels(providers: ModelProviderSummary[]) {
  return providers.filter(provider => provider.enabled && (provider.authMode === 'none' || provider.hasApiKey)).flatMap(provider => provider.models.filter(model => model.enabled).map(model => ({ value: JSON.stringify([provider.id, model.id]), label: `${provider.name} / ${model.id}`, selection: { providerId: provider.id, modelId: model.id } as ModelSelection })))
}
export function workflowActorModelLabel(pin: string | undefined, providers: ModelProviderSummary[]) {
  if (!pin) return '尚未分配模型'
  try {
    const model: unknown = JSON.parse(pin)
    if (Array.isArray(model) && typeof model[0] === 'string' && typeof model[1] === 'string') {
      const provider = providers.find(item => item.id === model[0])
      return `${provider?.name || model[0]} / ${model[1]}`
    }
  } catch { /* Older journal model labels are plain text; retain their meaning. */ }
  return pin
}
export function workflowNodeLabel(kind: string) {
  return ({ ask: '智能体任务', 'world-read': '读取工作区', 'world-run': '执行命令', report: '生成报告', artifact: '发布产物' } as Record<string, string>)[kind] ?? kind
}
export function workflowValue(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''
  return text.length > 12000 ? `${text.slice(0, 12000)}\n…内容已截断` : text
}
export function workflowEventLine({ event }: StoredEvent) {
  const instance = 'instance' in event ? `${event.instance.siteId}@${event.instance.ordinal}` : ''
  switch (event.type) {
    case 'phase-entered': return `阶段 · ${event.name}`
    case 'log': return event.message
    case 'run-started': return '开始执行'
    case 'run-settled': return workflowStatus[event.status]
    case 'usage-updated': return `累计 ${event.spentTokens.toLocaleString()} tokens`
    case 'report': return `报告 · ${workflowValue(event.item)}`
    case 'artifact-published': return `产物 · ${event.artifact.id}`
    case 'run-launched': return '工作流已启动'
    case 'actor-created': return `创建智能体 · ${event.name || '未命名智能体'}`
    case 'node-queued': return `${workflowNodeLabel(event.kind)}已排队 · ${event.instructionsHead || instance}`
    case 'node-dispatched': return `${event.kind ? workflowNodeLabel(event.kind) : '节点'}已派发 · ${event.actorName || instance}`
    case 'node-executing': return `模型请求开始执行 · ${instance}`
    case 'node-waiting': return `${workflowWaitLabel(event)} · ${instance}`
    case 'node-progress': return `已完成第 ${event.turn} 轮 · ${event.toolCalls} 次工具调用${event.lastTool ? ` · 最近观察：${workflowToolLabel(event.lastTool.name)}${event.lastTool.target ? ` · ${event.lastTool.target}` : ''}` : ''}`
    case 'node-repairing': return `结果校验未通过 · 第 ${event.attempt} 次修正 · ${instance}`
    case 'node-nudged': return `提醒智能体提交有效结果 · ${instance}`
    case 'node-settled': return `${event.outcome === 'ok' ? '节点已完成' : event.outcome === 'cancelled' ? '节点已停止' : '节点失败'}${event.cached ? '（复用已记录结果）' : ''} · ${instance}`
    case 'run-caps-changed': return `工作流并发上限 ${event.previous.maxConcurrency} → ${event.caps.maxConcurrency}`
    case 'concurrency-changed': return `模型并发上限 ${event.previous} → ${event.next} · ${workflowRetryReason(event.reason)}`
    case 'import-cache-closed': return event.cause === 'world-run' ? '命令执行前已关闭导入缓存' : `${event.actorName || '智能体'}修改工作区前已关闭导入缓存`
    case 'artifact-failed': return `产物发布失败 · ${event.id} · ${event.error.message}`
    case 'compaction': return '智能体上下文已压缩'
    case 'escalation-raised': return `智能体请求协助 · ${event.question}`
    case 'escalation-resolved': return `协助问题已回答 · ${event.answer}`
    case 'run-stalled': return '工作流出现停滞观察'
  }
}

export function workflowToolLabel(name: string) { return ({ read: '读取文件', write: '写入文件', edit: '编辑文件', list_files: '列出文件', bash: '终端命令', web_fetch: '抓取网页', web_search: '网页搜索', submit_result: '提交结果' } as Record<string, string>)[name] ?? name }
function workflowRetryReason(reason?: string) { return ({ rate_limited: '模型服务限流', provider_overloaded: '模型服务繁忙', server_error: '模型服务错误', network_error: '网络错误', timeout: '请求超时', stream_idle_timeout: '响应停滞', stale_connection: '连接失效', offpeak_queued: '服务排队', recovered: '服务已恢复', idle_reset: '空闲重置' } as Record<string, string>)[reason ?? ''] ?? '服务重试' }
export function workflowWaitLabel(wait: { cause: string; reason?: string; attempt?: number; delayMs?: number }) {
  return wait.cause === 'slot' ? '等待执行名额' : `等待重试 · ${workflowRetryReason(wait.reason)}${wait.attempt ? ` · 第 ${wait.attempt} 次` : ''}${wait.delayMs !== undefined ? ` · 延迟 ${(wait.delayMs / 1000).toLocaleString()} 秒` : ''}`
}
export function workflowStopReason(reason: string) { return ({ user: '用户停止', model: '模型停止', provider: '模型服务停止', interrupted: '应用退出或运行中断', superseded: '已由修订工作流替代' } as Record<string, string>)[reason] ?? reason }
export type MiraWorkflowNodeObservation = { status: 'pending' | 'queued' | 'dispatched' | 'executing' | 'waiting' | 'repairing' | 'completed' | 'failed' | 'stopped'; label: string; instructions?: string; progress?: AskProgress; latestSequence: number }

/** Journal terminal truth wins; running rows are admission, never evidence of a live model request. */
export function workflowNodeObservation(run: RunRecord, node: NodeRecord, events: readonly StoredEvent[], eventsCurrent = true): MiraWorkflowNodeObservation {
  const observed: MiraWorkflowNodeObservation = { status: 'pending', label: '已接纳，执行状态未记录', latestSequence: -1 }
  let outcome: 'ok' | 'failed' | 'cancelled' | undefined
  for (const { event, sequence } of events) {
    if (!('instance' in event) || event.instance.siteId !== node.siteId || event.instance.ordinal !== node.ordinal) continue
    observed.latestSequence = sequence
    switch (event.type) {
      case 'node-queued': observed.status = 'queued'; observed.label = '排队中'; observed.instructions = event.instructionsHead; break
      case 'node-dispatched': observed.status = 'dispatched'; observed.label = '已派发'; observed.instructions = event.instructionsHead ?? observed.instructions; break
      case 'node-executing': observed.status = 'executing'; observed.label = '任务执行中'; break
      case 'node-waiting': observed.status = 'waiting'; observed.label = workflowWaitLabel(event); break
      case 'node-repairing': observed.status = 'repairing'; observed.label = `修正结果 · 第 ${event.attempt} 次`; break
      case 'node-nudged': observed.status = 'repairing'; observed.label = '等待有效结果提交'; break
      case 'node-progress': observed.progress = { turn: event.turn, toolCalls: event.toolCalls, ...(event.lastTool ? { lastTool: event.lastTool } : {}) }; break
      case 'node-settled': outcome = event.outcome; break
    }
  }
  if (node.status === 'completed') { observed.status = 'completed'; observed.label = '已完成' }
  else if (node.status === 'failed') {
    const stopped = outcome === 'cancelled' || node.error?.code === 'Cancelled' || node.error?.code === 'Interrupted'
    observed.status = stopped ? 'stopped' : 'failed'; observed.label = stopped ? '已停止' : '失败'
  } else if (run.status === 'stopped') { observed.status = 'stopped'; observed.label = '已停止' }
  else if (run.status === 'completed' || run.status === 'errored') { observed.status = 'pending'; observed.label = '未记录节点结算' }
  else if (!eventsCurrent) { observed.status = 'pending'; observed.label = '正在同步最新执行状态'; observed.progress = undefined }
  return observed
}

/** Aggregate this actor's recorded asks only; previous completion cannot mask its new active ask. */
export function workflowActorObservation(run: RunRecord, actor: ActorRecord, nodes: readonly NodeRecord[], events: readonly StoredEvent[], eventsCurrent = true) {
  const asks = nodes.filter(node => node.kind === 'ask' && node.actorSiteId === actor.siteId && node.actorOrdinal === actor.ordinal)
  const rows = asks.map(node => ({ node, observed: workflowNodeObservation(run, node, events, eventsCurrent) }))
  const live = rows.filter(row => row.node.status === 'running'), candidates = live.length ? live : rows
  const activeRank = (row: typeof rows[number]) => ['executing', 'waiting', 'repairing', 'dispatched'].includes(row.observed.status) ? 0 : 1
  const current = [...candidates].sort((left, right) => live.length
    ? activeRank(left) - activeRank(right) || (left.node.actorSeq ?? left.node.ordinal) - (right.node.actorSeq ?? right.node.ordinal)
    : (right.node.actorSeq ?? right.node.ordinal) - (left.node.actorSeq ?? left.node.ordinal) || right.observed.latestSequence - left.observed.latestSequence)[0]
  let state: MiraWorkflowNodeObservation = current?.observed ?? { status: run.status === 'stopped' ? 'stopped' : 'pending', label: run.status === 'stopped' ? '已停止' : '尚无任务记录', latestSequence: -1 }
  if (!live.length && rows.some(row => row.observed.status === 'failed')) state = { ...state, status: 'failed', label: '存在失败任务' }
  const completed = rows.filter(row => row.observed.status === 'completed').length
  return { ...state, tasks: rows.length, completed, ...(current ? { node: current.node } : {}) }
}
