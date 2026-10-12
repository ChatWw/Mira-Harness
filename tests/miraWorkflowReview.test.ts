import { describe, expect, it, vi } from 'vitest'
import { HarnessPermissionPolicy } from '../electron/services/harnessPermissionPolicy'
import { compileMiraFlow } from '../electron/services/flows/miraFlowCompile'
import type { PlatformDatabase } from '../electron/storage/database'
import type { MiraFlowReview } from '../src/config/miraFlowReview'
import type { HarnessEvent } from '../src/config/harness'
import { analyzeMiraFlowProgram, createMiraFlowProgram } from '../packages/mira-flow-kit/src/mira-index'
import { projectMiraFlowReview } from '../electron/services/flows/miraFlowReviewGraph'

const source = 'const writer=agent("作者"); const editor=agent("编辑"); phase("撰写"); const text=await writer.ask("撰写文章"); phase("审核"); return await editor.ask(text);'
const review = (): MiraFlowReview => ({ action: 'run', name: '文章流程', source, sourceHash: 'a'.repeat(64), commands: [], graph: { phases: [], participants: [], handoffs: [], phaseEdges: [], steps: [], truncated: false } })
function fixture() {
  const publish = vi.fn((_sender: unknown, _event: HarnessEvent) => undefined)
  const database = { harness: { getPermissionConfig: () => ({ globalDefaultMode: 'full', dangerousCommands: [] }) } } as unknown as PlatformDatabase
  return { policy: new HarnessPermissionPolicy(database, publish), publish }
}

describe('workflow review always gates the compiled source', () => {
  it('retains user phases, participants and control transitions from the same compilation', () => {
    const compiled = compileMiraFlow(source)
    expect(compiled.ok).toBe(true)
    const graph = compiled.executable!.reviewGraph
    expect(graph.phases.map(phase => phase.name)).toEqual(['撰写', '审核'])
    expect(graph.participants.map(actor => actor.name)).toEqual(['作者', '编辑'])
    expect(graph.phaseEdges.some(edge => edge.from === graph.phases[0]!.id && edge.to === graph.phases[1]!.id)).toBe(true)
    expect(graph.truncated).toBe(false)
    expect(structuredClone(graph)).toEqual(graph)
  })

  it('bounds the display without leaking dangling participant or phase references', () => {
    const analysis = analyzeMiraFlowProgram(createMiraFlowProgram(source))
    analysis.flow!.phases = Array.from({ length: 65 }, (_, index) => ({ id: `phase${index}`, name: '阶段' + index, alongside: ['phase64'] }))
    analysis.causality!.steps[0]!.phase = 'phase0'
    analysis.causality!.steps[1]!.phase = 'phase64'
    analysis.handoff!.participants[0]!.phase = 'phase0'
    analysis.handoff!.participants[1]!.phase = 'phase64'
    analysis.handoff!.handoffs = [{ from: analysis.handoff!.participants[0]!.id, to: analysis.handoff!.participants[1]!.id }]
    analysis.flow!.phaseEdges = [{ from: 'phase0', to: 'phase64', kind: 'branch' }]
    const graph = projectMiraFlowReview(analysis)
    expect(graph.truncated).toBe(true)
    expect(graph.phases).toHaveLength(64)
    expect(graph.participants).toHaveLength(1)
    expect(graph.phaseEdges).toEqual([]); expect(graph.handoffs).toEqual([])
    expect(graph.phases.every(phase => phase.alongside?.length === 0)).toBe(true)
    expect(graph.participants.every(actor => actor.steps.every(id => graph.steps.some(step => step.id === id)))).toBe(true)
  })

  it('requires a fresh explicit decision even when the policy or Hook would allow execution', async () => {
    const { policy, publish } = fixture(), input = review(), onRequest = vi.fn()
    const pending = policy.reviewWorkflow(undefined, 'parent', input, undefined, { toolCallId: 'tool', runId: 'creator', onRequest, hookPermission: 'allow', beforeRequest: async () => ({ allowed: true }) })
    await Promise.resolve(); await Promise.resolve()
    expect(publish).toHaveBeenCalledOnce()
    const request = publish.mock.calls[0]![1].payload
    expect(request).toMatchObject({ workflowReview: input, toolCallId: 'tool', runId: 'creator' })
    input.source = 'changed'; input.graph.phases.push({ id: 'changed', name: 'changed' })
    expect(policy.listPending('parent')[0]!.workflowReview!.source).toBe(source)
    expect(policy.listPending('parent')[0]!.workflowReview!.graph.phases).toEqual([])
    policy.resolve(String(request.requestId), false)
    expect(await pending).toMatchObject({ allowed: false })
    expect(policy.listPending('parent')).toEqual([])
  })

  it('cancels pending source review on Stop and ignores late approval', async () => {
    const { policy, publish } = fixture(), controller = new AbortController()
    const pending = policy.reviewWorkflow(undefined, 'parent', review(), controller.signal, { toolCallId: 'tool', runId: 'creator', onRequest() {} })
    await Promise.resolve(); await Promise.resolve()
    const id = String(publish.mock.calls[0]![1].payload.requestId)
    controller.abort()
    expect(await pending).toMatchObject({ allowed: false, reason: '运行已停止' })
    policy.resolve(id, true)
    expect(policy.listPending('parent')).toEqual([])
  })

  it('defers write approval until compilation while retaining automatic-task restrictions', async () => {
    const { policy, publish } = fixture()
    const descriptors = new Map([['create_workflow', { risk: 'write' as const, deferApproval: true, title: () => '启动流程', detail: () => 'source' }]])
    expect(await policy.preflight(undefined, 'parent', descriptors, 'create_workflow', {}, false, 'default')).toBeUndefined()
    expect(publish).not.toHaveBeenCalled()
    expect(await policy.preflight(undefined, 'parent', descriptors, 'create_workflow', {}, true, 'default')).toMatchObject({ block: true })
  })
})
