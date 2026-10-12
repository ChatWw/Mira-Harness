import { describe, expect, it, vi } from 'vitest'
import { createHarnessEventPublisher } from '../electron/services/harnessEventPublisher'
import { HarnessPermissionPolicy } from '../electron/services/harnessPermissionPolicy'

describe('harness event publisher', () => {
  it('adds stable run metadata and resets sequence after idle', () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const publish = createHarnessEventPublisher()
    publish(sender as any, { sessionId: 'session-1', runId: 'run-1', type: 'status', payload: { state: 'running' } })
    publish(sender as any, { sessionId: 'session-1', type: 'run-start', payload: { startedAt: 10 } })
    publish(sender as any, { sessionId: 'session-1', type: 'status', payload: { state: 'idle' } })
    publish(sender as any, { sessionId: 'session-1', runId: 'run-2', type: 'status', payload: { state: 'running' } })

    const events = sender.send.mock.calls.map(call => call[1])
    expect(events).toHaveLength(4)
    expect(events[0]).toMatchObject({ eventId: expect.any(String), runId: 'run-1', sequence: 1, occurredAt: expect.any(Number) })
    expect(events[1]).toMatchObject({ runId: 'run-1', sequence: 2 })
    expect(events[2]).toMatchObject({ runId: 'run-1', sequence: 3 })
    expect(events[3]).toMatchObject({ runId: 'run-2', sequence: 1 })
  })

  it('keeps main and workflow sequences independent through approval, settlement and late cleanup', () => {
    const publish = createHarnessEventPublisher()
    const main = (type: 'status' | 'message-delta', payload: Record<string, unknown>, runId?: string) => publish(undefined, { sessionId: 'session-1', runId, type, payload })
    const flow = (type: 'workflow-event' | 'tool-call' | 'permission-request', payload: Record<string, unknown>) => publish(undefined, { sessionId: 'session-1', runId: 'flow-1', type, payload })
    const events = [
      main('status', { state: 'running' }, 'main-1'),
      flow('workflow-event', { event: { type: 'run-started' } }),
      main('message-delta', { delta: '正文' }),
      flow('tool-call', { id: 'flow-tool', status: 'waiting-confirm' }),
      flow('permission-request', { requestId: 'approval-1' }),
      main('message-delta', { delta: '继续' }),
      main('status', { state: 'idle' }),
      flow('workflow-event', { event: { type: 'run-settled', status: 'stopped' } }),
      flow('tool-call', { id: 'flow-tool', status: 'cancelled' }),
      flow('tool-call', { id: 'flow-hook', status: 'cancelled' }),
    ]
    expect(events.filter(event => event.runId === 'main-1').map(event => event.sequence)).toEqual([1, 2, 3, 4])
    expect(events.filter(event => event.runId === 'flow-1').map(event => event.sequence)).toEqual([1, 2, 3, 4, 5, 6])
    expect(main('message-delta', { delta: '无运行归属' })).not.toHaveProperty('sequence')
  })

  it('does not establish a default from explicit non-start events or clear it on a foreign idle', () => {
    const publish = createHarnessEventPublisher()
    publish(undefined, { sessionId: 's', runId: 'flow', type: 'tool-call', payload: { id: 'tool' } })
    expect(publish(undefined, { sessionId: 's', type: 'message-delta', payload: {} })).not.toHaveProperty('runId')
    publish(undefined, { sessionId: 's', runId: 'main', type: 'run-start', payload: {} })
    publish(undefined, { sessionId: 's', runId: 'flow', type: 'status', payload: { state: 'idle' } })
    expect(publish(undefined, { sessionId: 's', type: 'message-delta', payload: {} })).toMatchObject({ runId: 'main', sequence: 2 })
  })

  it('isolates the same run ID in different sessions and forwards metadata to the background publisher', () => {
    const background = vi.fn()
    const publish = createHarnessEventPublisher(background)
    const sender = { isDestroyed: () => true, send: vi.fn() }
    publish(undefined, { sessionId: 'a', runId: 'run', type: 'run-start', payload: {} })
    publish(sender as any, { sessionId: 'b', runId: 'run', type: 'run-start', payload: {} })
    publish(undefined, { sessionId: 'a', type: 'message-delta', payload: {} })
    expect(background.mock.calls.map(call => [call[0].sessionId, call[0].sequence])).toEqual([['a', 1], ['b', 1], ['a', 2]])
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('retains a resumed workflow counter while bounding completed-run history', () => {
    const publish = createHarnessEventPublisher()
    const flow = (runId: string, type: string) => publish(undefined, { sessionId: 's', runId, type: 'workflow-event', payload: { event: { type } } })
    flow('resumed', 'run-started')
    flow('resumed', 'run-settled')
    for (let index = 0; index < 255; index++) flow(`old-${index}`, 'run-settled')
    expect(flow('resumed', 'run-started')).toMatchObject({ sequence: 3 })
    // Resuming removes the run from the settled history before later settlements evict old scopes.
    for (let index = 0; index < 256; index++) flow(`new-${index}`, 'run-settled')
    expect(flow('resumed', 'phase-entered')).toMatchObject({ sequence: 4 })
    expect(flow('new-255', 'run-settled')).toMatchObject({ sequence: 2 })
    expect(flow('old-0', 'run-started')).toMatchObject({ sequence: 1 })
  })

  it('publishes workflow approval and timeout under their explicit run without changing the main default', async () => {
    vi.useFakeTimers()
    try {
      const events: ReturnType<ReturnType<typeof createHarnessEventPublisher>>[] = []
      const publish = createHarnessEventPublisher(event => events.push(event))
      const policy = new HarnessPermissionPolicy({ harness: { getPermissionConfig: () => ({ globalDefaultMode: 'default', dangerousCommands: [] }) } } as any, publish)
      publish(undefined, { sessionId: 's', runId: 'main', type: 'status', payload: { state: 'running' } })
      const pending = policy.preflight(undefined, 's', new Map([['mcp_probe', { risk: 'mcp' as const, title: () => '批准工具', detail: () => '工作流工具' }]]), 'mcp_probe', {}, false, 'default', undefined, { toolCallId: 'flow-tool', runId: 'flow', onRequest: vi.fn() })
      expect(events.at(-1)).toMatchObject({ type: 'permission-request', runId: 'flow', sequence: 1, payload: { runId: 'flow', toolCallId: 'flow-tool' } })
      publish(undefined, { sessionId: 's', type: 'message-delta', payload: { delta: '主对话仍继续' } })
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      await expect(pending).resolves.toMatchObject({ block: true, reason: '权限确认超时，已取消该操作。' })
      expect(events.at(-1)).toMatchObject({ type: 'error', runId: 'flow', sequence: 2 })
      expect(publish(undefined, { sessionId: 's', type: 'status', payload: { state: 'idle' } })).toMatchObject({ runId: 'main', sequence: 3 })
    } finally {
      vi.useRealTimers()
    }
  })
})
