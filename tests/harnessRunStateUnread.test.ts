import { describe, expect, it } from 'vitest'
import type { HarnessSessionSummary } from '../src/config/harness'
import { createHarnessRunStateManager } from '../src/stores/harnessRunState'

describe('harness run-state unread sessions', () => {
  it('restores persisted unread sessions and clears manually read sessions', () => {
    const state = createHarnessRunStateManager({
      getActiveSession: () => undefined,
      setActiveSession: () => undefined,
      refreshSessions: async () => undefined,
      refreshProjects: async () => undefined,
    })

    state.syncUnreadSessions([{ id: 'persisted', unread: true }] as HarnessSessionSummary[])
    state.setSessionUnread('manual', true)
    state.setSessionUnread('manual', false)

    expect(state.unreadSessionIds.value).toEqual(['persisted'])
  })
})
