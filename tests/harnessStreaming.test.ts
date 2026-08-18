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
})
