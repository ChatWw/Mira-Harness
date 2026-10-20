import { describe, expect, it } from 'vitest'
import { workflowTurnDigests } from '../apps/harness-react/src/components/workflows/workflow-turn-digests'
import type { TimelineRenderMessage } from '../apps/harness-react/src/components/conversation/conversation-model'
import type { ToolCallRecord } from '../src/config/harness'
import type { RunRecord } from '../packages/mira-flow-kit/src/engine/mira-types'
const user = (id: string): TimelineRenderMessage => ({ rendererId: id, original: { id, role: 'user', content: id, createdAt: 1 } })
const assistant = (id: string, tool?: string): TimelineRenderMessage => ({ rendererId: id, original: { id, role: 'assistant', content: id, createdAt: 2, ...(tool ? { parts: [{ id: 'part', type: 'tool', toolCallId: tool }] } : {}) } })
const run = (id: string, toolCallId?: string): RunRecord => ({ runId: id, toolCallId, name: '同名工作流', status: 'running', caps: { maxConcurrency: 2 }, spentTokens: 0 })
describe('workflow cards stay in their originating conversation turn', () => {
  it('keeps distinct launches at their own turn after later messages and status changes', () => {
    const messages = [user('u1'), assistant('a1', 'call1'), user('u2'), assistant('a2', 'call2'), user('u3'), assistant('a3')]
    const result = workflowTurnDigests(messages, [], [{ ...run('r1', 'call1'), status: 'completed' }, run('r2', 'call2')])
    expect(result.byTurn.get('u1')?.map(run => run.runId)).toEqual(['r1'])
    expect(result.byTurn.get('u2')?.map(run => run.runId)).toEqual(['r2'])
    expect(result.byTurn.has('u3')).toBe(false)
    expect(result.unanchored).toEqual([])
  })
  it('uses authoritative tool ownership for legacy parts and stable streaming identities', () => {
    const messages = [user('u1'), { ...assistant('a1'), original: { ...assistant('a1').original, id: 'stream-a1', runId: 'parent-run' } }, user('u2'), assistant('a2')]
    const tools = [{ id: 'call1', messageId: 'u1' }, { id: 'call2', runId: 'parent-run' }] as ToolCallRecord[]
    const result = workflowTurnDigests(messages, tools, [run('r1', 'call1'), run('r2', 'call2')])
    expect(result.byTurn.get('u1')?.map(run => run.runId)).toEqual(['r1', 'r2'])
    messages[1].original.id = 'a1'
    expect(workflowTurnDigests(messages, tools, [run('r1', 'call1')]).byTurn.get('u1')?.[0].runId).toBe('r1')
  })
  it('does not guess the newest turn for direct or missing historical launches', () => {
    const runs = [run('direct'), run('old', 'missing')]
    const result = workflowTurnDigests([user('new'), assistant('reply')], [], runs)
    expect(result.byTurn.size).toBe(0)
    expect(result.unanchored).toEqual(runs)
  })
})
