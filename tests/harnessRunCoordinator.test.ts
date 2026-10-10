import { describe, expect, it, vi } from 'vitest'
import { HarnessRunCoordinator } from '../electron/services/harnessRunCoordinator'

function setup() {
  const database = { harness: { getSession: vi.fn(() => ({ projectId: 'project-1' })), setActiveRun: vi.fn() } }
  const published: any[] = []
  const coordinator = new HarnessRunCoordinator(database as any, (_sender, event) => published.push(event))
  return { database, published, coordinator }
}

describe('HarnessRunCoordinator', () => {
  it('accepts guidance only for the attached ready engine and its frozen run selection', async () => {
    const { coordinator } = setup()
    coordinator.begin('s', 'run')
    coordinator.setGuidanceAccepting('s', 'run', true)
    expect(coordinator.guidanceSelection('s', 'run')).toBeUndefined()
    const selection = { providerId: 'p', modelId: 'm', thinkingLevel: 'high' as const }
    coordinator.attachAgent('s', { abort: vi.fn() } as any, selection, 'full')
    selection.modelId = 'changed'
    expect(coordinator.guidanceSelection('s', 'stale')).toBeUndefined()
    const snapshot = coordinator.guidanceSelection('s', 'run')!
    expect(snapshot).toEqual({ providerId: 'p', modelId: 'm', thinkingLevel: 'high', permissionMode: 'full' })
    snapshot.modelId = 'mutated'
    expect(coordinator.guidanceSelection('s', 'run')?.modelId).toBe('m')
    coordinator.setGuidanceAccepting('s', 'stale', false)
    expect(coordinator.guidanceSelection('s', 'run')).toBeDefined()
    coordinator.setGuidanceAccepting('s', 'run', false)
    expect(coordinator.guidanceSelection('s', 'run')).toBeUndefined()
    coordinator.setGuidanceAccepting('s', 'run', true)
    coordinator.abort('s', 'run')
    expect(coordinator.guidanceSelection('s', 'run')).toBeUndefined()
    await coordinator.finish(undefined, 's', 'run')
    expect(coordinator.guidanceSelection('s', 'run')).toBeUndefined()
  })

  it('preempts the identified run and waits for actual child teardown without losing the queue reservation', async () => {
    const { coordinator, database } = setup()
    const controller = coordinator.begin('s', 'old')
    const token = coordinator.reserve('s')
    let finishChild!: () => void
    const child = new Promise<void>(resolve => { finishChild = resolve })
    coordinator.attachSubtasks('s', { stop: vi.fn(), active: () => [{}], close: () => child } as any)
    const settled = vi.fn()
    const wait = coordinator.preemptAndWait('s', 'old').then(settled)
    expect(controller.signal.aborted).toBe(true)
    const finish = coordinator.finish(undefined, 's', 'old')
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    expect(coordinator.isExecuting('s')).toBe(true)
    expect(database.harness.setActiveRun).not.toHaveBeenCalled()
    finishChild()
    await finish
    await wait
    expect(settled).toHaveBeenCalledOnce()
    expect(coordinator.isExecuting('s')).toBe(false)
    expect(coordinator.isRunning('s')).toBe(true)
    coordinator.begin('s', 'new', token)
    await expect(coordinator.preemptAndWait('s', 'old')).rejects.toThrow('当前任务已变化')
    expect(coordinator.currentRunId('s')).toBe('new')
  })

  it('propagates teardown failure to the promotion barrier while releasing the old execution', async () => {
    const { coordinator, database } = setup()
    coordinator.begin('s', 'old')
    const preempted = coordinator.preemptAndWait('s', 'old')
    const rejected = expect(preempted).rejects.toThrow('Teardown failed')
    database.harness.setActiveRun.mockImplementationOnce(() => { throw new Error('Teardown failed') })
    await expect(coordinator.finish(undefined, 's', 'old')).rejects.toThrow('Teardown failed')
    await rejected
    expect(coordinator.isExecuting('s')).toBe(false)
  })

  it('cascades abort to the parent Agent and child runtime', () => {
    const { coordinator } = setup()
    const controller = coordinator.begin('session-1')
    const agent = { abort: vi.fn() }
    const subtasks = { stop: vi.fn(), active: vi.fn(() => []) }
    coordinator.attachAgent('session-1', agent as any)
    coordinator.attachSubtasks('session-1', subtasks as any)

    coordinator.abort('session-1')

    expect(controller.signal.aborted).toBe(true)
    expect(agent.abort).toHaveBeenCalledOnce()
    expect(subtasks.stop).toHaveBeenCalledOnce()
  })

  it('clears the active snapshot and publishes idle after child cleanup', async () => {
    const { database, published, coordinator } = setup()
    coordinator.begin('session-1')
    const subtasks = { active: vi.fn(() => [{ id: 'child-1' }]), close: vi.fn(async () => undefined), stop: vi.fn() }
    coordinator.attachSubtasks('session-1', subtasks as any)

    await coordinator.finish(undefined, 'session-1')

    expect(subtasks.close).toHaveBeenCalledOnce()
    expect(database.harness.setActiveRun).toHaveBeenCalledWith('session-1', undefined)
    expect(published.at(-1)).toMatchObject({ sessionId: 'session-1', type: 'status', payload: { state: 'idle' } })
    expect(coordinator.isRunning('session-1')).toBe(false)
  })

  it('does not stop a newer run when a previous run ID is supplied', async () => {
    const { coordinator } = setup()
    coordinator.begin('s', 'old-run')
    await coordinator.finish(undefined, 's', 'old-run')
    const current = coordinator.begin('s', 'current-run')
    expect(coordinator.abort('s', 'old-run')).toBe(false)
    expect(current.signal.aborted).toBe(false)
    expect(coordinator.abort('s', 'current-run')).toBe(true)
    expect(current.signal.aborted).toBe(true)
  })

  it('ignores stale finish and keeps the current run occupied', async () => {
    const { coordinator, database, published } = setup()
    const current = coordinator.begin('s', 'current-run')
    await coordinator.finish(undefined, 's', 'old-run')
    expect(coordinator.isRunning('s')).toBe(true)
    expect(current.signal.aborted).toBe(false)
    expect(database.harness.setActiveRun).not.toHaveBeenCalled()
    expect(published).toEqual([])
  })

  it('releases admission and publishes idle even when clearing the snapshot fails', async () => {
    const { coordinator, database, published } = setup()
    coordinator.begin('s', 'failed-run')
    database.harness.setActiveRun.mockImplementationOnce(() => { throw new Error('Storage failed') })
    await expect(coordinator.finish(undefined, 's', 'failed-run')).rejects.toThrow('Storage failed')
    expect(coordinator.isRunning('s')).toBe(false)
    expect(published.at(-1)).toMatchObject({ type: 'status', payload: { state: 'idle' } })
    expect(() => coordinator.begin('s', 'retry-run')).not.toThrow()
  })

  it('holds manual admission across an old run teardown and accepts only its queue owner', async () => {
    const { coordinator } = setup()
    coordinator.begin('s', 'first')
    const token = coordinator.reserve('s')
    expect(coordinator.isExecuting('s')).toBe(true)
    await coordinator.finish(undefined, 's', 'first')
    expect(coordinator.isExecuting('s')).toBe(false)
    expect(coordinator.isRunning('s')).toBe(true)
    expect(coordinator.isProjectRunning('project-1')).toBe(true)
    expect(() => coordinator.begin('s', 'automation')).toThrow('该会话正在运行')
    expect(() => coordinator.begin('s', 'next', token)).not.toThrow()
    coordinator.release('s', Symbol('wrong-owner'))
    await coordinator.finish(undefined, 's', 'next')
    expect(coordinator.isRunning('s')).toBe(true)
    coordinator.release('s', token)
    expect(coordinator.isRunning('s')).toBe(false)
  })

  it('ignores deleted executing and reserved sessions when checking a project', () => {
    const { coordinator, database } = setup()
    coordinator.begin('deleted-run')
    coordinator.reserve('deleted-reservation')
    const token = coordinator.reserve('current')
    database.harness.getSession.mockImplementation((sessionId?: string) => {
      if (sessionId?.startsWith('deleted')) throw new Error('未找到会话')
      return { projectId: 'project-1' }
    })
    expect(coordinator.isProjectRunning('project-1')).toBe(true)
    expect(coordinator.isProjectRunning('other')).toBe(false)
    coordinator.release('current', token)
    expect(coordinator.isProjectRunning('project-1')).toBe(false)
  })

  it('releases a failed child teardown without admitting an external run into the queue lane', async () => {
    const { coordinator, published } = setup()
    coordinator.begin('s', 'first')
    const token = coordinator.reserve('s')
    coordinator.attachSubtasks('s', { active: () => [{}], close: async () => { throw new Error('Child cleanup failed') } } as any)
    await expect(coordinator.finish(undefined, 's', 'first')).rejects.toThrow('Child cleanup failed')
    expect(coordinator.isExecuting('s')).toBe(false)
    expect(coordinator.isRunning('s')).toBe(true)
    expect(published.at(-1)).toMatchObject({ runId: 'first', type: 'status', payload: { state: 'idle' } })
    coordinator.release('s', token)
    expect(coordinator.isRunning('s')).toBe(false)
  })

  it('delivers completion only after explicitly settled admission', async () => {
    const { coordinator } = setup()
    const listener = vi.fn()
    coordinator.onComplete(listener)
    coordinator.begin('s', 'first')
    coordinator.publishComplete({ session: { id: 's' } as any, origin: 'manual', status: 'completed' })
    await Promise.resolve()
    expect(listener).not.toHaveBeenCalled()
    await coordinator.finish(undefined, 's', 'first')
    expect(listener).not.toHaveBeenCalled()
    coordinator.flushComplete('s')
    await Promise.resolve()
    expect(listener).toHaveBeenCalledOnce()
    coordinator.flushComplete('s')
    await Promise.resolve()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('isolates a failed completion observer without blocking later observers', async () => {
    const { coordinator } = setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failed = vi.fn(() => { throw new Error('Observer failed') })
    const next = vi.fn()
    coordinator.onComplete(failed)
    coordinator.onComplete(next)
    coordinator.publishComplete({ session: { id: 's' } as any, origin: 'manual', status: 'completed' })
    coordinator.flushComplete('s')
    await Promise.resolve()
    expect(failed).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('handles asynchronous completion observer rejection without an unhandled promise', async () => {
    const { coordinator } = setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    coordinator.onComplete(async () => { throw new Error('Async observer failed') })
    const next = vi.fn()
    coordinator.onComplete(next)
    coordinator.publishComplete({ session: { id: 's' } as any, origin: 'manual', status: 'completed' })
    coordinator.flushComplete('s')
    await Promise.resolve()
    await Promise.resolve()
    expect(next).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
