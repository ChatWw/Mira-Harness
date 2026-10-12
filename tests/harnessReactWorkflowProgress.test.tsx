// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkflowRunPane } from '../apps/harness-react/src/components/workflows/MiraWorkflowRunPane'
import { workflowActorObservation, workflowEventLine, workflowNodeObservation, type MiraWorkflowHost } from '../apps/harness-react/src/components/workflows/workflow-model'
import type { MiraFlowRunSnapshot, MiraFlowWorkbenchRequest } from '../src/config/miraFlowWorkbench'
import type { ActorRecord, NodeRecord, RunEvent, RunRecord, StoredEvent } from '../packages/mira-flow-kit/src/engine/mira-types'
import type { HarnessEvent } from '../src/config/harness'

const run: RunRecord = { runId: 'run', parentSessionId: 'session', status: 'running', caps: { maxConcurrency: 2 }, spentTokens: 20 }
const actor: ActorRecord = { runId: 'run', siteId: 'writer', ordinal: 1, name: '资料助手', resolvedModel: 'provider/model' }
const ask: NodeRecord = { runId: 'run', siteId: 'ask', ordinal: 1, kind: 'ask', actorSiteId: actor.siteId, actorOrdinal: actor.ordinal, actorSeq: 1, inputHash: 'hash', status: 'running' }
const event = (value: RunEvent, sequence = 0): StoredEvent => ({ sequence, event: value, timeCreated: 1000 + sequence })
const ref = { siteId: ask.siteId, ordinal: ask.ordinal }
const queued = event({ type: 'node-queued', instance: ref, kind: 'ask', actor: { siteId: actor.siteId, ordinal: actor.ordinal }, instructionsHead: '整理 notes.md，生成资料摘要' })
let root: Root | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
async function mount(host: MiraWorkflowHost) { const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container); await act(async () => root!.render(<MiraWorkflowRunPane host={host} identity={{ sessionId: 'session', runId: 'run' }} providers={[]} />)) }
function fixture(initial: MiraFlowRunSnapshot) {
  let snapshot = initial, listener: ((event: HarnessEvent) => void) | undefined
  const request = vi.fn(async (_request: MiraFlowWorkbenchRequest) => structuredClone(snapshot))
  const host: MiraWorkflowHost = { requestWorkflow: request as MiraWorkflowHost['requestWorkflow'], onWorkflowEvent: next => { listener = next; return () => { listener = undefined } } }
  return { host, request, update: async (next: MiraFlowRunSnapshot) => { snapshot = next; await act(async () => listener?.({ type: 'workflow-event', sessionId: 'session', payload: { runId: 'run' } } as HarnessEvent)) } }
}

describe('observed workflow actor/node progress', () => {
  it.each(['waiting', 'queued'] as const)('does not expose an old executing event before a later %s page is synchronized', async status => {
    let resolvePage!: (snapshot: MiraFlowRunSnapshot) => void
    const later = new Promise<MiraFlowRunSnapshot>(resolve => { resolvePage = resolve })
    const firstPage = [queued, event({ type: 'node-executing', instance: ref }, 1), ...Array.from({ length: 98 }, (_, index) => event({ type: 'log', message: '历史记录' }, index + 2))]
    const snapshot = { run, actors: [actor], nodes: [ask], events: firstPage }
    const request = vi.fn(async (input: MiraFlowWorkbenchRequest) => input.action === 'runs.snapshot' && input.afterSequence === -1 ? snapshot : later)
    const host: MiraWorkflowHost = { requestWorkflow: request as MiraWorkflowHost['requestWorkflow'], onWorkflowEvent: () => () => {} }
    await mount(host)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]?.[0]).toMatchObject({ afterSequence: 99 })
    expect(document.querySelector('.mira-workflow-progress')?.textContent).toContain('正在同步最新执行状态')
    expect(document.querySelector('[data-actor-status]')?.getAttribute('data-actor-status')).toBe('pending')
    await act(async () => resolvePage({ ...snapshot, events: [event(status === 'waiting' ? { type: 'node-waiting', instance: ref, cause: 'slot' } : { type: 'node-queued', instance: ref, kind: 'ask' }, 100)] }))
    expect(document.querySelector('[data-actor-status]')?.getAttribute('data-actor-status')).toBe(status)
    expect(document.querySelector('.mira-workflow-progress')?.textContent).not.toContain('任务执行中')
  })

  it('does not confuse admitted journal running rows with observed model execution', () => {
    expect(workflowNodeObservation(run, ask, [])).toMatchObject({ status: 'pending', label: '已接纳，执行状态未记录' })
    expect(workflowNodeObservation(run, ask, [queued])).toMatchObject({ status: 'queued', label: '排队中', instructions: '整理 notes.md，生成资料摘要' })
    expect(workflowNodeObservation(run, ask, [queued, event({ type: 'node-dispatched', instance: ref }, 1)])).toMatchObject({ status: 'dispatched', label: '已派发' })
    expect(workflowNodeObservation(run, ask, [queued, event({ type: 'node-executing', instance: ref }, 2)])).toMatchObject({ status: 'executing', label: '任务执行中' })
  })
  it('moves from model execution to waiting/retry then executing without inventing a current tool', async () => {
    const initial = { run, actors: [actor], nodes: [ask], events: [queued, event({ type: 'node-executing', instance: ref }, 1)] }
    const view = fixture(initial); await mount(view.host)
    expect(document.querySelector('[data-actor-status]')?.getAttribute('data-actor-status')).toBe('executing')
    await view.update({ ...initial, events: [event({ type: 'node-waiting', instance: ref, cause: 'backoff', reason: 'rate_limited', attempt: 2, delayMs: 3000 }, 2)] })
    expect(document.querySelector('[data-actor-status]')?.getAttribute('data-actor-status')).toBe('waiting')
    expect(document.body.textContent).toContain('等待重试 · 模型服务限流 · 第 2 次 · 延迟 3 秒')
    expect(document.body.textContent).not.toContain('当前工具')
    await view.update({ ...initial, events: [event({ type: 'node-executing', instance: ref }, 3)] })
    expect(document.querySelector('[data-actor-status]')?.getAttribute('data-actor-status')).toBe('executing')
    expect(document.querySelector('.mira-workflow-progress')?.textContent).not.toContain('等待重试')
  })
  it('prefers the live ask on a multi-task actor over a newer old completion event', () => {
    const old = { ...ask, siteId: 'old', actorSeq: 0, status: 'completed' as const, result: 'OLD' }
    const events = [queued, event({ type: 'node-executing', instance: ref }, 2), event({ type: 'node-settled', instance: { siteId: 'old', ordinal: 1 }, outcome: 'ok' }, 99)]
    expect(workflowActorObservation(run, actor, [old, ask], events)).toMatchObject({ status: 'executing', tasks: 2, completed: 1, node: ask })
  })
  it('does not let a later queued ask mask this actor current model execution', () => {
    const later = { ...ask, siteId: 'later', actorSeq: 2 }
    const events = [queued, event({ type: 'node-executing', instance: ref }, 1), event({ type: 'node-queued', instance: { siteId: 'later', ordinal: 1 }, kind: 'ask', instructionsHead: 'later instructions' }, 2)]
    expect(workflowActorObservation(run, actor, [ask, later], events)).toMatchObject({ status: 'executing', node: ask, instructions: '整理 notes.md，生成资料摘要' })
  })
  it('shows cancelled/interrupted nodes as stopped while a real failed ask remains failed', async () => {
    const stopped = { ...run, status: 'stopped' as const, stopReason: 'user' as const }
    const cancelled = { ...ask, status: 'failed' as const, error: { code: 'Cancelled' as const, message: 'cancelled' } }
    const failed = { ...ask, siteId: 'failed', ordinal: 2, actorSeq: 2, status: 'failed' as const, error: { code: 'DriverError' as const, message: 'provider failed' } }
    expect(workflowNodeObservation(stopped, cancelled, [])).toMatchObject({ status: 'stopped', label: '已停止' })
    expect(workflowNodeObservation(stopped, failed, [])).toMatchObject({ status: 'failed', label: '失败' })
    const view = fixture({ run: stopped, actors: [actor], nodes: [cancelled], events: [] }); await mount(view.host)
    expect(document.querySelector('[data-node-instance="ask@1"]')?.getAttribute('data-status')).toBe('stopped')
    expect(document.body.textContent).toContain('停止原因：用户停止')
    expect(document.querySelector('[data-node-instance="ask@1"]')?.textContent).not.toContain('失败')
  })
  it('renders task instructions, real progress and ask results with keyboard reachable disclosure', async () => {
    const progress = event({ type: 'node-progress', instance: ref, turn: 3, toolCalls: 2, lastTool: { name: 'read', target: 'notes.md' } }, 1)
    const completed = { ...ask, status: 'completed' as const, result: { summary: '实际任务摘要' }, stats: { tokens: 20, turns: 3, toolCalls: 2 } }
    const view = fixture({ run: { ...run, status: 'completed' }, actors: [actor], nodes: [completed], events: [queued, progress] }); await mount(view.host)
    expect(document.querySelector('.mira-workflow-actor')?.textContent).toContain('整理 notes.md，生成资料摘要')
    expect(document.querySelector('.mira-workflow-task-progress')?.textContent).toContain('已完成 3 轮 · 2 次工具调用')
    expect(document.querySelector('.mira-workflow-task-progress')?.textContent).toContain('最近观察工具：读取文件 · notes.md')
    const details = document.querySelector<HTMLDetailsElement>('.mira-workflow-nodes details')!, summary = details.querySelector('summary')!
    summary.focus(); expect(document.activeElement).toBe(summary)
    await act(async () => summary.click()); expect(details.open).toBe(true)
    expect(details.textContent).toContain('实际任务摘要'); expect(details.textContent).toContain('已记录用量：20 tokens')
  })
  it('does not manufacture tasks or instructions for incomplete old event windows', async () => {
    const view = fixture({ run: { ...run, status: 'completed' }, actors: [actor], nodes: [], events: [event({ type: 'log', message: '保留的一条记录' }, 500)] }); await mount(view.host)
    expect(document.querySelector('.mira-workflow-progress')?.textContent).toContain('尚无任务记录')
    expect(document.body.textContent).toContain('当前任务指令未在已读取事件中记录')
    expect(document.body.textContent).toContain('当前只显示已读取的事件窗口')
    expect(document.body.textContent).not.toContain('0 / 1')
  })
  it('translates observed lifecycle events into actual Chinese descriptions', () => {
    expect(workflowEventLine(event({ type: 'node-executing', instance: ref }))).toContain('模型请求开始执行')
    expect(workflowEventLine(event({ type: 'node-settled', instance: ref, outcome: 'cancelled' }))).toContain('节点已停止')
    expect(workflowEventLine(event({ type: 'node-waiting', instance: ref, cause: 'slot' }))).toContain('等待执行名额')
    expect(workflowEventLine(event({ type: 'node-progress', instance: ref, turn: 2, toolCalls: 1, lastTool: { name: 'web_search' } }))).toContain('最近观察：网页搜索')
    expect(workflowEventLine(event({ type: 'run-caps-changed', runId: 'run', caps: { maxConcurrency: 3 }, previous: { maxConcurrency: 2 } }))).toBe('工作流并发上限 2 → 3')
  })
})
