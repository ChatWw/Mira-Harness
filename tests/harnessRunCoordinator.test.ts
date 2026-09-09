import { describe, expect, it, vi } from 'vitest'
import { HarnessRunCoordinator } from '../electron/harnessRunCoordinator'

function setup() {
  const database = { harness: { getSession: vi.fn(() => ({ projectId: 'project-1' })), setActiveRun: vi.fn() } }
  const published: any[] = []
  const coordinator = new HarnessRunCoordinator(database as any, (_sender, event) => published.push(event))
  return { database, published, coordinator }
}

describe('HarnessRunCoordinator', () => {
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
})
