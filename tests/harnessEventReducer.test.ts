import { describe, expect, it } from 'vitest'
import { createHarnessRunState, reduceHarnessRunEvent } from '../src/stores/harnessEventReducer'

describe('harness public run event reducer', () => {
  it('builds a run snapshot and ignores duplicate events', () => {
    const start = { sessionId: 'session-1', runId: 'run-1', eventId: 'event-1', sequence: 1, type: 'run-start' as const, payload: { startedAt: 100, activities: [], subtasks: [] } }
    const first = reduceHarnessRunEvent(createHarnessRunState(), start)
    const duplicate = reduceHarnessRunEvent(first, start)

    expect(first).toMatchObject({ sessionId: 'session-1', runId: 'run-1', status: 'running', startedAt: 100, lastSequence: 1 })
    expect(duplicate).toBe(first)
  })

  it('does not let an older sequence overwrite the current activity', () => {
    const initial = reduceHarnessRunEvent(createHarnessRunState(), { sessionId: 'session-1', runId: 'run-1', sequence: 2, type: 'run-activity', payload: { activities: [{ id: 'new', label: '新步骤', status: 'running', startedAt: 20 }] } })
    const stale = reduceHarnessRunEvent(initial, { sessionId: 'session-1', runId: 'run-1', sequence: 1, type: 'run-activity', payload: { activities: [{ id: 'old', label: '旧步骤', status: 'completed', startedAt: 10 }] } })

    expect(stale).toBe(initial)
    expect(stale.activities[0].id).toBe('new')
  })

  it('keeps a failure when a later idle event arrives', () => {
    const failed = reduceHarnessRunEvent(createHarnessRunState(), { sessionId: 'session-1', runId: 'run-1', sequence: 1, type: 'error', payload: { message: '模型请求超时' } })
    const idle = reduceHarnessRunEvent(failed, { sessionId: 'session-1', runId: 'run-1', sequence: 2, type: 'status', payload: { state: 'idle' } })

    expect(idle.status).toBe('failed')
    expect(idle.error).toBe('模型请求超时')
  })

  it('accepts a lower sequence when a new run starts', () => {
    const previousRun = reduceHarnessRunEvent(createHarnessRunState(), { sessionId: 'session-1', runId: 'run-1', sequence: 8, type: 'status', payload: { state: 'idle' } })
    const nextRun = reduceHarnessRunEvent(previousRun, { sessionId: 'session-1', runId: 'run-2', sequence: 1, type: 'run-start', payload: { startedAt: 200, activities: [], subtasks: [] } })

    expect(nextRun).toMatchObject({ runId: 'run-2', status: 'running', startedAt: 200, lastSequence: 1 })
  })
})
