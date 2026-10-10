import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppNavigationStore } from '../src/stores/appNavigation'
import type { MiraAppNavigationState } from '../src/platform/appNavigation'

const state = (overrides: Partial<MiraAppNavigationState> = {}): MiraAppNavigationState => ({
  type: 'mira:app-navigation-state', revision: 4, canGoBack: true, canGoForward: false, busy: false,
  snapshot: { entries: [{ kind: 'conversation', sessionId: 'a' }, { kind: 'extensions' }], cursor: 1, detached: false }, ...overrides,
})
beforeEach(() => setActivePinia(createPinia()))

describe('Vue application navigation owner', () => {
  it('does not dispatch until the current frame has supplied a valid state', () => {
    const store = useAppNavigationStore(), send = vi.fn(() => true)
    expect(store.go('back')).toBe(false)
    const owner = store.register('mira-harness', send)
    owner.receive({ ...state(), snapshot: { entries: [], cursor: 0, detached: false } })
    expect(store.state).toBeNull(); expect(store.go('back')).toBe(false); expect(send).not.toHaveBeenCalled()
    owner.receive(state()); expect(store.go('back')).toBe(true)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'mira:app-navigation-command', direction: 'back', expectedRevision: 4 })
  })

  it('blocks repeat commands while busy and resumes from the frame acknowledgement', () => {
    const store = useAppNavigationStore(), send = vi.fn(() => true), owner = store.register('mira-harness', send)
    owner.receive(state()); expect(store.go('back')).toBe(true); expect(store.state?.busy).toBe(true)
    expect(store.go('back')).toBe(false); expect(store.go('forward')).toBe(false)
    owner.receive(state({ revision: 5, canGoBack: false, canGoForward: true }))
    expect(store.go('back')).toBe(false); expect(store.go('forward')).toBe(true)
    expect(send).toHaveBeenLastCalledWith({ type: 'mira:app-navigation-command', direction: 'forward', expectedRevision: 5 })
  })

  it('accepts same-revision busy transitions and rejects older or malformed revisions', () => {
    const store = useAppNavigationStore(), owner = store.register('mira-harness', () => true)
    owner.receive(state({ busy: true })); expect(store.go('back')).toBe(false)
    owner.receive(state()); expect(store.state?.busy).toBe(false)
    const accepted = store.state
    owner.receive(state({ revision: 3, busy: true })); owner.receive(state({ revision: NaN }))
    owner.receive({ ...state(), snapshot: undefined }); owner.receive({ ...state(), extra: 'foreign' })
    expect(store.state).toBe(accepted); expect(store.getSavedSnapshot('mira-harness')).toEqual(accepted?.snapshot)
  })

  it('ignores every callback from a replaced or released owner', () => {
    const store = useAppNavigationStore(), firstSend = vi.fn(() => true), secondSend = vi.fn(() => true)
    const first = store.register('mira-harness', firstSend); first.receive(state())
    const second = store.register('mira-harness', secondSend)
    first.receive(state({ revision: 9 })); expect(store.state).toBeNull()
    second.receive(state({ revision: 1 })); const accepted = store.state
    first.reset(); first.release(); expect(store.state).toBe(accepted)
    expect(store.go('back')).toBe(true); expect(firstSend).not.toHaveBeenCalled(); expect(secondSend).toHaveBeenCalledOnce()
    second.release(); second.receive(state({ revision: 2 })); expect(store.state).toBeNull(); expect(store.go('back')).toBe(false)
  })

  it('keeps only a cloned same-window Harness snapshot across settings and registration', () => {
    const store = useAppNavigationStore(), owner = store.register('mira-harness', () => true), input = state()
    owner.receive(input); input.snapshot.entries.length = 0
    const saved = store.getSavedSnapshot('mira-harness')!; expect(saved.entries).toHaveLength(2)
    owner.release(); expect(store.state).toBeNull(); expect(store.getSavedSnapshot('mira-harness')).toEqual(saved)
    saved.entries.length = 0; expect(store.getSavedSnapshot('mira-harness')?.entries).toHaveLength(2)
    store.register('mira-harness', () => true); expect(store.state).toBeNull(); expect(store.getSavedSnapshot('mira-harness')?.entries).toHaveLength(2)
    setActivePinia(createPinia()); expect(useAppNavigationStore().getSavedSnapshot('mira-harness')).toBeUndefined()
  })

  it('invalidates visible state on connection reset while retaining the saved snapshot', () => {
    const store = useAppNavigationStore(), send = vi.fn(() => true), owner = store.register('mira-harness', send)
    owner.receive(state()); owner.reset(); expect(store.state).toBeNull(); expect(store.go('back')).toBe(false)
    expect(store.getSavedSnapshot('mira-harness')).toEqual(state().snapshot)
    owner.receive(state({ revision: 0 })); expect(store.state?.revision).toBe(0); expect(store.go('back')).toBe(true)
  })

  it('preserves the detached automation draft identity through settings without mixing it with a conversation draft', () => {
    const store = useAppNavigationStore(), owner = store.register('mira-harness', () => true)
    owner.receive(state({ snapshot: { ...state().snapshot, detached: true, draft: 'automations' } }))
    owner.release(); expect(store.getSavedSnapshot('mira-harness')).toEqual({ ...state().snapshot, detached: true, draft: 'automations' })
    store.register('mira-harness', () => true); expect(store.getSavedSnapshot('mira-harness')?.draft).toBe('automations')
  })

  it('never grants Novel access to Harness history or command ownership', () => {
    const store = useAppNavigationStore(), harnessSend = vi.fn(() => true), novelSend = vi.fn(() => true)
    const harness = store.register('mira-harness', harnessSend); harness.receive(state())
    const novel = store.register('mira-novel-studio', novelSend); novel.receive(state({ revision: 99 })); novel.reset(); novel.release()
    expect(store.state?.revision).toBe(4); expect(store.getSavedSnapshot('mira-novel-studio')).toBeUndefined()
    expect(store.go('back')).toBe(true); expect(harnessSend).toHaveBeenCalledOnce(); expect(novelSend).not.toHaveBeenCalled()
  })

  it('restores the enabled state after a failed send so the same command can be retried', () => {
    const store = useAppNavigationStore(), send = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true), owner = store.register('mira-harness', send)
    owner.receive(state()); expect(store.go('back')).toBe(false); expect(store.state?.busy).toBe(false)
    expect(store.go('back')).toBe(true); expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls[0]).toEqual(send.mock.calls[1])
  })

  it('does not restore an obsolete state when synchronous send invalidates its owner', () => {
    const store = useAppNavigationStore()
    const owner = store.register('mira-harness', () => { owner.release(); return false })
    owner.receive(state()); expect(store.go('back')).toBe(false); expect(store.state).toBeNull()
  })
})
