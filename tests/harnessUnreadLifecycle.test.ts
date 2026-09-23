import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { HarnessSession } from '../src/config/harness'

const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }

function createSession(unread: boolean): HarnessSession {
  return {
    version: 1,
    id: 'session-1',
    title: '未读会话',
    permissionMode: 'default',
    messages: [],
    toolCalls: [],
    createdAt: 1,
    updatedAt: 1,
    status: 'active',
    pinned: false,
    unread,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('harness unread lifecycle', () => {
  function installPlatform(initialUnread: boolean) {
    let persisted = createSession(initialUnread)
    const setHarnessSessionUnread = vi.fn(async (_id: string, unread: boolean) => {
      persisted = { ...persisted, unread }
      return { ...persisted }
    })
    vi.stubGlobal('sessionStorage', storage)
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      platform: {
        getHarnessSession: vi.fn(async () => ({ ...persisted })),
        setHarnessSessionUnread,
        listHarnessSessions: vi.fn(async () => [{ ...persisted }]),
        listHarnessProjects: vi.fn(async () => []),
      },
    })
    return setHarnessSessionUnread
  }

  it('clears persisted and sidebar unread state the first time a session is viewed', async () => {
    const setHarnessSessionUnread = installPlatform(true)
    setActivePinia(createPinia())
    const { useHarnessStore } = await import('../src/stores/harness')
    const store = useHarnessStore()
    await store.refreshSessions()

    await store.openSession('session-1')

    expect(setHarnessSessionUnread).toHaveBeenCalledTimes(1)
    expect(setHarnessSessionUnread).toHaveBeenCalledWith('session-1', false)
    expect(store.activeSession?.unread).toBe(false)
    expect(store.sessions[0]?.unread).toBe(false)
    expect(store.unreadSessionIds).not.toContain('session-1')
  })

  it('clears a manually unread active session when it is viewed again', async () => {
    const setHarnessSessionUnread = installPlatform(false)
    setActivePinia(createPinia())
    const { useHarnessStore } = await import('../src/stores/harness')
    const store = useHarnessStore()
    await store.openSession('session-1')
    await store.setSessionUnread('session-1', true)

    await store.markSessionRead('session-1')

    expect(setHarnessSessionUnread).toHaveBeenLastCalledWith('session-1', false)
    expect(store.activeSession?.unread).toBe(false)
    expect(store.sessions[0]?.unread).toBe(false)
    expect(store.unreadSessionIds).not.toContain('session-1')
  })
})
