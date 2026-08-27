import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { HarnessSession } from '../src/config/harness'

const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }

function createSession(id = 'session-1'): HarnessSession {
  return {
    version: 1,
    id,
    title: '测试对话',
    permissionMode: 'auto-approve',
    messages: [],
    toolCalls: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
    pinned: false,
  }
}

function installWindow(getHarnessSession = vi.fn(async (id: string) => createSession(id))) {
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    platform: {
      getHarnessSession,
      listHarnessSessions: vi.fn(async () => []),
      listHarnessProjects: vi.fn(async () => []),
      deleteHarnessSessions: vi.fn(async () => undefined),
    },
  })
  return getHarnessSession
}

async function createStore() {
  setActivePinia(createPinia())
  const { useHarnessStore } = await import('../src/stores/harness')
  const store = useHarnessStore()
  store.activeSession = createSession()
  return store
}

function streamedContent(store: Awaited<ReturnType<typeof createStore>>) {
  return store.activeSession?.messages.at(-1)?.content || ''
}

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('harness message streaming', () => {
  it('renders a buffered model delta over multiple 16ms frames', async () => {
    vi.useFakeTimers()
    installWindow()
    const store = await createStore()
    const delta = '一'.repeat(20)

    store.applyEvent({ sessionId: 'session-1', type: 'message-delta', payload: { delta } })

    expect(streamedContent(store)).toBe('')
    await vi.advanceTimersByTimeAsync(16)
    expect(streamedContent(store).length).toBeGreaterThan(0)
    expect(streamedContent(store).length).toBeLessThan(delta.length)
    await vi.advanceTimersByTimeAsync(500)
    expect(streamedContent(store)).toBe(delta)
  })

  it('accelerates a large backlog without exceeding the frame safety cap', async () => {
    vi.useFakeTimers()
    installWindow()
    const store = await createStore()
    const delta = '一'.repeat(2_000)

    store.applyEvent({ sessionId: 'session-1', type: 'message-delta', payload: { delta } })
    await vi.advanceTimersByTimeAsync(16)

    expect(streamedContent(store).length).toBe(48)
  })

  it('keeps the visual tail after the model becomes idle and refreshes only after it drains', async () => {
    vi.useFakeTimers()
    const getHarnessSession = installWindow()
    const store = await createStore()
    const delta = '一'.repeat(500)

    store.applyEvent({ sessionId: 'session-1', type: 'status', payload: { state: 'running' } })
    store.applyEvent({ sessionId: 'session-1', type: 'message-delta', payload: { delta } })
    store.applyEvent({ sessionId: 'session-1', type: 'message-complete', payload: {} })
    store.applyEvent({ sessionId: 'session-1', type: 'status', payload: { state: 'idle' } })

    expect(store.running).toBe(false)
    expect(store.rendering).toBe(true)
    expect(getHarnessSession).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)

    expect(store.rendering).toBe(false)
    expect(getHarnessSession).toHaveBeenCalledWith('session-1')
  })

  it('cancels queued content when the active session is cleared', async () => {
    vi.useFakeTimers()
    installWindow()
    const store = await createStore()

    store.applyEvent({ sessionId: 'session-1', type: 'message-delta', payload: { delta: '不会写入新会话' } })
    store.clearActiveSession()
    store.activeSession = createSession('session-2')
    await vi.advanceTimersByTimeAsync(1_000)

    expect(store.rendering).toBe(false)
    expect(store.activeSession.messages).toEqual([])
  })

  it('keeps permission requests by session until the run becomes idle', async () => {
    vi.useFakeTimers()
    installWindow()
    const store = await createStore()

    store.applyEvent({ sessionId: 'session-2', type: 'permission-request', payload: { requestId: 'approval-1', title: '允许执行命令？', detail: 'npm test' } })
    expect(store.pendingPermissionRequests['session-2']).toEqual({ requestId: 'approval-1', title: '允许执行命令？', detail: 'npm test' })

    store.applyEvent({ sessionId: 'session-2', type: 'status', payload: { state: 'idle' } })
    expect(store.pendingPermissionRequests['session-2']).toBeUndefined()
  })

  it('retains a runtime error for an explicit retry action', async () => {
    vi.useFakeTimers()
    installWindow()
    const store = await createStore()

    store.applyEvent({ sessionId: 'session-1', type: 'error', payload: { message: '模型请求超时' } })
    expect(store.lastRunError).toEqual({ sessionId: 'session-1', message: '模型请求超时' })
    store.applyEvent({ sessionId: 'session-1', type: 'status', payload: { state: 'running' } })
    expect(store.lastRunError).toBeUndefined()
  })

  it('removes a deleted session from shared navigation state immediately', async () => {
    vi.useFakeTimers()
    installWindow()
    const store = await createStore()
    store.sessions = [{ ...createSession('session-1'), projectName: '项目' }, { ...createSession('session-2'), projectName: '项目' }]

    await store.deleteSessions(['session-1'])

    expect(store.sessions).toEqual([])
    expect(store.activeSession).toBeUndefined()
  })

  it('serializes plan answers before sending them through Electron IPC', async () => {
    vi.useFakeTimers()
    const answerHarnessInteraction = vi.fn(async () => undefined)
    installWindow()
    window.platform.answerHarnessInteraction = answerHarnessInteraction
    const store = await createStore()
    const reactiveAnswer = new Proxy({ id: 'scope', selected: new Proxy(['稳定性'], {}) }, {})

    await store.answerInteraction('session-1', 'question-1', [reactiveAnswer as any], { providerId: 'provider-1', modelId: 'model-1', thinkingLevel: 'medium' })

    const [, , answers, selection] = answerHarnessInteraction.mock.calls[0]
    expect(answers).toEqual([{ id: 'scope', selected: ['稳定性'] }])
    expect(answers[0].selected).not.toBe((reactiveAnswer as any).selected)
    expect(selection).toEqual({ providerId: 'provider-1', modelId: 'model-1', thinkingLevel: 'medium' })
  })
})
