import { describe, expect, it, vi } from 'vitest'
import { createHarnessEventPublisher } from '../electron/harnessEventPublisher'

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
})
