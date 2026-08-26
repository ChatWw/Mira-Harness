import { describe, expect, it, vi } from 'vitest'
import { AutomationScheduler } from '../electron/automationScheduler'

function task(overrides: Record<string, unknown> = {}) {
  return { id: 'task-1', name: '任务', projectId: 'project-1', trigger: { type: 'cron', expression: '0 9 * * *' }, target: { type: 'new-session' }, prompt: '执行', model: { providerId: 'provider-1', modelId: 'model-1' }, permissionMode: 'default', enabled: true, createdAt: 1, updatedAt: 1, ...overrides } as any
}

describe('AutomationScheduler', () => {
  it('records a skipped run when the project is already running', async () => {
    const item = task()
    const database = { automations: { getTask: () => item, createSkippedRun: vi.fn() }, harness: { createSession: vi.fn() } }
    const runtime = { isProjectRunning: () => true, onRunComplete: vi.fn(), abort: vi.fn() }
    const scheduler = new AutomationScheduler(database as any, runtime as any)
    await scheduler.run(item.id, 'manual')
    expect(database.automations.createSkippedRun).toHaveBeenCalledWith(item, 'manual', '项目已有 Agent 正在运行', undefined)
  })

  it('runs only a completed manual session event in the matching project', async () => {
    const eventTask = task({ trigger: { type: 'session-completed' } })
    const database = { automations: { markInterruptedRuns: vi.fn(), listTasks: () => [eventTask], getTask: () => eventTask, createRun: vi.fn(() => ({ id: 'run-1' })), startRun: vi.fn(), finishRun: vi.fn() }, harness: { getSession: () => ({ projectId: 'project-1' }) } }
    const runtime = { isProjectRunning: () => false, onRunComplete: vi.fn(), runAutomation: vi.fn(() => Promise.resolve({ content: 'ok' })), abort: vi.fn() }
    new AutomationScheduler(database as any, runtime as any)
    const listener = runtime.onRunComplete.mock.calls[0][0]
    listener({ origin: 'automation', status: 'completed', session: { projectId: 'project-1', id: 's1' } })
    await Promise.resolve()
    expect(runtime.runAutomation).not.toHaveBeenCalled()
    listener({ origin: 'manual', status: 'failed', session: { projectId: 'project-1', id: 's1' } })
    await Promise.resolve()
    expect(runtime.runAutomation).not.toHaveBeenCalled()
    listener({ origin: 'manual', status: 'completed', session: { projectId: 'project-1', id: 's1' } })
    await Promise.resolve(); await Promise.resolve()
    expect(runtime.runAutomation).toHaveBeenCalledWith('s1', '执行', eventTask.model, 'default')
  })

  it('creates a new session when manually running a session-completed task', async () => {
    const eventTask = task({ trigger: { type: 'session-completed' } })
    const database = { automations: { getTask: () => eventTask, createRun: vi.fn(() => ({ id: 'run-1' })), startRun: vi.fn(), finishRun: vi.fn() }, harness: { createSession: vi.fn(() => ({ id: 'manual-session' })), getSession: () => ({ projectId: 'project-1' }) } }
    const runtime = { isProjectRunning: () => false, onRunComplete: vi.fn(), runAutomation: vi.fn(() => Promise.resolve({ content: 'ok' })), abort: vi.fn() }
    const scheduler = new AutomationScheduler(database as any, runtime as any)
    await scheduler.run(eventTask.id, 'manual')
    expect(runtime.runAutomation).toHaveBeenCalledWith('manual-session', '执行', eventTask.model, 'default')
  })

  it('returns a running record without waiting for the agent to finish', async () => {
    const item = task()
    const runs: any[] = []
    let finishAgent!: (value: { content: string }) => void
    const agentResult = new Promise<{ content: string }>(resolve => { finishAgent = resolve })
    const database = {
      automations: {
        getTask: () => item,
        listRuns: () => runs,
        createRun: vi.fn(() => { const run = { id: 'run-1', taskId: item.id, status: 'running', sessionId: 'session-1' }; runs.unshift(run); return run }),
        startRun: vi.fn(() => runs[0]),
        finishRun: vi.fn(),
      },
      harness: { createSession: () => ({ id: 'session-1' }), getSession: () => ({ projectId: item.projectId }) },
    }
    const runtime = { isProjectRunning: () => false, onRunComplete: vi.fn(), runAutomation: vi.fn(() => agentResult), abort: vi.fn() }
    const scheduler = new AutomationScheduler(database as any, runtime as any)

    await expect(scheduler.launch(item.id, 'manual')).resolves.toMatchObject({ id: 'run-1', status: 'running' })
    expect(database.automations.finishRun).not.toHaveBeenCalled()

    finishAgent({ content: 'ok' })
    await vi.waitFor(() => expect(database.automations.finishRun).toHaveBeenCalledWith('run-1', 'completed', { resultSummary: 'ok' }))
  })
})
