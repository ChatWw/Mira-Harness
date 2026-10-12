// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkflowTimeline, type MiraWorkflowTimelineProps } from '../apps/harness-react/src/components/workflows/MiraWorkflowTimeline'
import { buildMiraWorkflowTimeline, miraWorkflowTimelineGeometry } from '../apps/harness-react/src/components/workflows/mira-workflow-timeline-model'
import type { MiraFlowReviewGraph } from '../src/config/miraFlowReview'
import type { ActorRecord, NodeRecord, RunRecord, RunEvent, StoredEvent } from '../packages/mira-flow-kit/src/engine/mira-types'

const graph: MiraFlowReviewGraph = {
  phases: [{ id: 'draft', name: '撰写' }, { id: 'review', name: '审阅', alongside: ['draft'] }, { id: 'unused', name: '备选分支' }],
  participants: [{ id: 'workspace', phase: 'draft', lane: 'workspace', name: '工作区', steps: ['read'] }, { id: 'writer', phase: 'draft', lane: 'actor#1', actorSiteId: 'actor#1', name: '作者', steps: ['ask1'] }, { id: 'reviewer', phase: 'review', lane: 'actor#2', actorSiteId: 'actor#2', name: '审稿人', steps: ['ask2'] }],
  steps: [{ id: 'read', lane: 'workspace', phase: 'draft', label: 'files.read', kind: 'world-read', line: 2 }, { id: 'ask1', lane: 'actor#1', phase: 'draft', label: '撰写初稿', kind: 'ask', line: 4 }, { id: 'ask2', lane: 'actor#2', phase: 'review', label: '检查事实', kind: 'ask', line: 8, certainty: 'maybe' }],
  handoffs: [{ from: 'workspace', to: 'writer', types: ['资料'] }], phaseEdges: [{ from: 'draft', to: 'review', kind: 'fork' }, { from: 'review', to: 'draft', kind: 'loop' }], truncated: false,
}
const run: RunRecord = { runId: 'run', status: 'running', caps: { maxConcurrency: 2 }, spentTokens: 0 }
const actor: ActorRecord = { runId: 'run', siteId: 'actor#1', ordinal: 1, name: '真实作者', sessionId: 'actor-session' }
const ask: NodeRecord = { runId: 'run', siteId: 'ask1', ordinal: 1, kind: 'ask', actorSiteId: 'actor#1', actorOrdinal: 1, actorSeq: 1, inputHash: 'hash', status: 'running' }
const event = (value: RunEvent, sequence = 0): StoredEvent => ({ sequence, event: value })
let root: Root | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
async function mount(props: Partial<MiraWorkflowTimelineProps> = {}) { const container = document.createElement('div'); document.body.append(container); root = createRoot(container); await act(async () => root!.render(<MiraWorkflowTimeline graph={graph} {...props} />)); return container }
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text)!

describe('ZCode-shaped Mira compiled workflow timeline', () => {
  it('renders only compiler-backed edges, parallel tracks and directed loop arcs', async () => {
    const container = await mount()
    expect(container.querySelectorAll('[data-line-edge]')).toHaveLength(2)
    expect(container.querySelector('[data-line-back=true]')?.getAttribute('data-line-from')).toBe('review')
    const stations = buildMiraWorkflowTimeline(graph)
    expect(stations.map(station => station.track)).toEqual([0, 1, 0])
    expect(miraWorkflowTimelineGeometry(graph, stations).width).toBe(552)
    expect(stations.every(station => station.status === 'static')).toBe(true)
    expect(container.textContent).not.toContain('等待中')
    await act(async () => button('收起').click())
    expect(container.querySelector('.mira-flow-line__canvas')).toBeNull()
    await act(async () => button('展开').click())
    expect(container.querySelector('.mira-flow-line__canvas')).not.toBeNull()
  })

  it('opens real workspace operations and participant handoffs without inventing a transcript', async () => {
    const onActor = vi.fn(), onSelect = vi.fn(), container = await mount({ onActor, onSelect })
    const workspace = container.querySelector<HTMLButtonElement>('[data-line-participant=workspace]')!
    workspace.focus(); expect(document.activeElement).toBe(workspace)
    await act(async () => workspace.click())
    expect(container.querySelector('[role=region]')?.textContent).toContain('files.read')
    expect(container.querySelector('[role=region]')?.textContent).toContain('第 2 行')
    expect(container.querySelector('[role=region]')?.textContent).toContain('资料')
    expect(onSelect).toHaveBeenCalledWith({ kind: 'participant', id: 'workspace', phaseId: 'draft' })
    expect(button('查看智能体记录')).toBeUndefined(); expect(onActor).not.toHaveBeenCalled()
  })

  it('uses node observations and exact actor identity, retaining unobserved branches and delayed windows honestly', async () => {
    const events = [event({ type: 'node-queued', kind: 'ask', instance: { siteId: 'ask1', ordinal: 1 }, phaseName: '撰写', instructionsHead: '根据真实文件整理' }), event({ type: 'node-executing', instance: { siteId: 'ask1', ordinal: 1 } }, 1)]
    const stations = buildMiraWorkflowTimeline(graph, run, [ask], events, [actor])
    expect(stations[0]?.pills.find(pill => pill.actor)?.status).toBe('executing')
    expect(stations[1]?.status).toBe('unobserved'); expect(stations[2]?.status).toBe('unobserved')
    expect(buildMiraWorkflowTimeline(graph, run, [ask], events, [actor], false)[0]?.status).toBe('pending')
    const onActor = vi.fn(), container = await mount({ run, actors: [actor], nodes: [ask], events, onActor })
    await act(async () => container.querySelector<HTMLButtonElement>('[data-line-participant=writer]')!.click())
    await act(async () => button('查看智能体记录').click())
    expect(onActor).toHaveBeenCalledExactlyOnceWith(actor)
    const summary = container.querySelector('summary')!
    expect(summary).toBeTruthy()
    expect(container.querySelector('[role=region]')?.textContent).toContain('根据真实文件整理')
  })

  it('does not attach dynamic receiver or shared phase nodes to the wrong participant', () => {
    const ambiguous: MiraFlowReviewGraph = { ...graph, steps: [...graph.steps, { id: 'copy-other', source: 'ask1', lane: 'actor#1', phase: 'review', label: '共享调用' }] }
    expect(buildMiraWorkflowTimeline(ambiguous, run, [ask], [], [actor])[0]?.status).toBe('unobserved')
    const stamped = [event({ type: 'node-queued', instance: { siteId: 'ask1', ordinal: 1 }, kind: 'ask', phaseName: '撰写' })]
    expect(buildMiraWorkflowTimeline(ambiguous, run, [ask], stamped, [actor])[0]?.status).toBe('queued')
    expect(buildMiraWorkflowTimeline(ambiguous, run, [ask], stamped, [actor])[1]?.status).toBe('unobserved')
    expect(buildMiraWorkflowTimeline(graph, run, [{ ...ask, actorSiteId: 'wrong-actor' }], stamped, [actor])[0]?.status).toBe('unobserved')
  })

  it('shows phase entry without declaring completion and keeps cancellation neutral', () => {
    expect(buildMiraWorkflowTimeline(graph, { ...run, status: 'completed' }, [], [event({ type: 'phase-entered', name: '撰写', ordinal: 2 })])[0]).toMatchObject({ status: 'entered', rounds: 2 })
    expect(buildMiraWorkflowTimeline(graph, { ...run, status: 'stopped' }, [{ ...ask, status: 'failed', error: { code: 'Cancelled', message: '已取消' } }])[0]?.status).toBe('stopped')
  })

  it('uses a vertical phase spine in the pane, folds rosters and draws no loop arcs', async () => {
    const container = await mount({ variant: 'pane', run, actors: [actor], nodes: [ask], events: [event({ type: 'node-executing', instance: { siteId: 'ask1', ordinal: 1 } })] })
    expect(container.querySelector('.mira-flow-line__canvas')).toBeNull()
    expect(container.querySelectorAll('.mira-flow-line__spine-section')).toHaveLength(3)
    expect(container.querySelectorAll('.mira-flow-line__spine-rail')).toHaveLength(1)
    expect(container.querySelector('[data-line-track="1"]')?.getAttribute('style')).toContain('36px')
    const phase = [...container.querySelectorAll<HTMLButtonElement>('.mira-flow-line__phase-toggle')].find(item => item.textContent === '撰写')!
    expect(phase.getAttribute('aria-expanded')).toBe('true')
    await act(async () => phase.click())
    expect(phase.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.mira-flow-line__roster')?.textContent).toContain('真实作者')
    expect(container.textContent).toContain('未观察到运行')
  })

  it('keeps workspace input and results escaped and reveals overflow participants on demand', async () => {
    const many = { ...graph, participants: Array.from({ length: 7 }, (_, index) => ({ ...graph.participants[0]!, id: `workspace${index}` })), truncated: true }
    const read: NodeRecord = { runId: 'run', siteId: 'read', ordinal: 1, kind: 'world-read', inputHash: 'hash', status: 'completed', result: '<script>unsafe()</script>', input: { op: 'files.read', args: ['notes.md'] } as NodeRecord['input'] }
    const container = await mount({ graph: many, run, nodes: [read] })
    expect(container.querySelectorAll('.mira-flow-line__pill')).toHaveLength(5)
    await act(async () => button('还有 2 个参与者').click())
    expect(container.querySelectorAll('.mira-flow-line__pill')).toHaveLength(7)
    await act(async () => container.querySelector<HTMLButtonElement>('.mira-flow-line__pill')!.click())
    expect(container.querySelector('pre[aria-label="实际操作结果"]')?.textContent).toContain('<script>unsafe()</script>')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[role=note]')?.textContent).toContain('部分阶段和操作')
  })
})
