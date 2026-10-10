import { describe, expect, it, vi } from 'vitest'
import type { MiraAppNavigationCommand, MiraAppNavigationSnapshot, MiraAppNavigationState, MiraAppNavigationTarget } from '../src/platform/appNavigation'
import { emptyMiraNavigationHistory, recordMiraNavigation } from '../apps/harness-react/src/lib/app-navigation-history'
import { MiraWorkbenchNavigation, type MiraNavigationAction } from '../apps/harness-react/src/state/workbench-navigation'

const conversation = (sessionId: string): MiraAppNavigationTarget => ({ kind: 'conversation', sessionId })
const stack = (...targets: MiraAppNavigationTarget[]) => targets.reduce(recordMiraNavigation, emptyMiraNavigationHistory())
const success = vi.fn<MiraNavigationAction>(async () => true)
const deferred = () => {
  let resolve!: (value: boolean) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<boolean>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}
const harness = () => {
  const publish = vi.fn<(state: MiraAppNavigationState) => void>()
  const navigation = new MiraWorkbenchNavigation(publish)
  navigation.connect()
  return { navigation, publish }
}
const command = (navigation: MiraWorkbenchNavigation, direction: 'back' | 'forward' = 'back'): MiraAppNavigationCommand => ({ type: 'mira:app-navigation-command', direction, expectedRevision: navigation.getSnapshot().revision })

describe('Mira workbench navigation transactions', () => {
  it('initializes once from the real current view without executing a restore', async () => {
    const { navigation, publish } = harness()
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    expect(navigation.ready).toBe(false)
    expect(await navigation.initialize(undefined, conversation('a'), execute)).toBe(true)
    expect(navigation.ready).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('a')))
    expect(execute).not.toHaveBeenCalled()
    const settled = navigation.getSnapshot()
    const count = publish.mock.calls.length
    expect(await navigation.initialize(stack(conversation('b')), conversation('c'), execute)).toBe(true)
    expect(navigation.getSnapshot()).toBe(settled)
    expect(publish).toHaveBeenCalledTimes(count)
  })

  it('does not invent an entry without a real current target', async () => {
    const { navigation } = harness()
    expect(await navigation.initialize(undefined, undefined, success)).toBe(true)
    expect(navigation.getSnapshot()).toMatchObject({ canGoBack: false, canGoForward: false, busy: false, snapshot: emptyMiraNavigationHistory() })
  })

  it('commits restored history only after its active target opens', async () => {
    const { navigation } = harness()
    const saved = { ...stack(conversation('a'), conversation('b'), { kind: 'extensions' }), cursor: 1 }
    const pending = deferred()
    const execute = vi.fn<MiraNavigationAction>(() => pending.promise)
    const restoring = navigation.initialize(saved, conversation('fallback'), execute)
    expect(navigation.ready).toBe(false)
    expect(navigation.busy).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(emptyMiraNavigationHistory())
    expect(execute.mock.calls[0][0]).toEqual(conversation('b'))
    expect(execute.mock.calls[0][1]()).toBe(true)
    pending.resolve(true)
    expect(await restoring).toBe(true)
    expect(navigation.getSnapshot()).toMatchObject({ canGoBack: true, canGoForward: true, busy: false, snapshot: saved })
  })

  it.each(['false', 'throw'] as const)('uses the real current target when restored opening returns %s', async failure => {
    const { navigation } = harness()
    const execute: MiraNavigationAction = async () => { if (failure === 'throw') throw new Error('target unavailable'); return false }
    expect(await navigation.initialize(stack(conversation('missing')), conversation('fallback'), execute)).toBe(true)
    expect(navigation.ready).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('fallback')))
    expect(navigation.busy).toBe(false)
  })

  it('honors an explicitly empty persisted history without opening the fallback', async () => {
    const { navigation } = harness()
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    expect(await navigation.initialize(emptyMiraNavigationHistory(), conversation('fallback'), execute)).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    expect(navigation.getSnapshot().snapshot).toEqual(emptyMiraNavigationHistory())
  })

  it.each(['conversation', 'automations', undefined] as const)('restores detached %s drafts outside the history stack', async draft => {
    const { navigation } = harness()
    const saved: MiraAppNavigationSnapshot = { ...stack(conversation('a')), detached: true, ...(draft ? { draft } : {}) }
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    expect(await navigation.initialize(saved, conversation('fallback'), execute)).toBe(true)
    expect(execute.mock.calls[0][0]).toBeUndefined()
    expect(execute.mock.calls[0][2]).toBe(draft ?? 'conversation')
    expect(navigation.getSnapshot()).toMatchObject({ canGoBack: true, canGoForward: false, snapshot: saved })
  })

  it('replays back and forward without pushing duplicate entries', async () => {
    const { navigation } = harness()
    const saved = stack(conversation('a'), { kind: 'automations', taskId: 'scheduled' }, { kind: 'extensions' })
    await navigation.initialize(saved, undefined, success)
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    expect(await navigation.go(command(navigation), execute)).toBe(true)
    expect(execute.mock.calls[0][0]).toEqual({ kind: 'automations', taskId: 'scheduled' })
    expect(navigation.getSnapshot().snapshot).toEqual({ ...saved, cursor: 1 })
    expect(await navigation.go(command(navigation, 'forward'), execute)).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(saved)
    expect(navigation.getSnapshot().snapshot.entries).toHaveLength(3)
  })

  it.each(['false', 'throw'] as const)('keeps the cursor and allows a retry when save/open returns %s', async failure => {
    const { navigation } = harness()
    const saved = stack(conversation('a'), conversation('b'))
    await navigation.initialize(saved, undefined, success)
    const pending = deferred()
    const moving = navigation.go(command(navigation), () => pending.promise)
    expect(navigation.getSnapshot()).toMatchObject({ busy: true, canGoBack: false, canGoForward: false, snapshot: saved })
    if (failure === 'throw') pending.reject(new Error('save failed'))
    else pending.resolve(false)
    expect(await moving).toBe(false)
    expect(navigation.getSnapshot()).toMatchObject({ busy: false, canGoBack: true, snapshot: saved })
    const retry = vi.fn<MiraNavigationAction>(async () => true)
    expect(await navigation.go(command(navigation), retry)).toBe(true)
    expect(retry.mock.calls[0][0]).toEqual(conversation('a'))
    expect(navigation.getSnapshot().snapshot.cursor).toBe(0)
  })

  it('rejects stale, unavailable and malformed commands while publishing a newer revision', async () => {
    const { navigation, publish } = harness()
    await navigation.initialize(undefined, conversation('a'), success)
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    for (const rejected of [
      { ...command(navigation), expectedRevision: 0 },
      command(navigation, 'forward'),
      { ...command(navigation), direction: 'reload' } as unknown as MiraAppNavigationCommand,
    ]) {
      const previous = navigation.getSnapshot()
      expect(await navigation.go(rejected, execute)).toBe(false)
      expect(navigation.getSnapshot().revision).toBeGreaterThan(previous.revision)
      expect(navigation.getSnapshot().snapshot).toBe(previous.snapshot)
      expect(publish.mock.lastCall?.[0]).toBe(navigation.getSnapshot())
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a command while busy without cancelling the accepted transaction', async () => {
    const { navigation } = harness()
    await navigation.initialize(stack(conversation('a'), conversation('b')), undefined, success)
    const pending = deferred()
    let isCurrent!: () => boolean
    const moving = navigation.go(command(navigation), (_target, current) => { isCurrent = current; return pending.promise })
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    const busyRevision = navigation.getSnapshot().revision
    expect(await navigation.go(command(navigation), execute)).toBe(false)
    expect(navigation.getSnapshot().revision).toBeGreaterThan(busyRevision)
    expect(navigation.busy).toBe(true)
    expect(isCurrent()).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    pending.resolve(true)
    expect(await moving).toBe(true)
    expect(navigation.getSnapshot().snapshot.cursor).toBe(0)
  })

  it('lets a direct user visit supersede an older navigation without committing its late result', async () => {
    const { navigation, publish } = harness()
    const saved = stack(conversation('a'), conversation('b'))
    await navigation.initialize(saved, undefined, success)
    const old = deferred()
    const latest = deferred()
    let oldIsCurrent!: () => boolean
    const moving = navigation.go(command(navigation), (_target, current) => { oldIsCurrent = current; return old.promise })
    const visiting = navigation.visit({ kind: 'extensions' }, () => latest.promise)
    expect(oldIsCurrent()).toBe(false)
    old.resolve(true)
    const count = publish.mock.calls.length
    expect(await moving).toBe(false)
    expect(publish).toHaveBeenCalledTimes(count)
    expect(navigation.busy).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(saved)
    latest.resolve(true)
    expect(await visiting).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('a'), conversation('b'), { kind: 'extensions' }))
  })

  it('retains committed history when a superseding visit fails', async () => {
    const { navigation } = harness()
    const saved = stack(conversation('a'), conversation('b'))
    await navigation.initialize(saved, undefined, success)
    const pending = deferred()
    const moving = navigation.go(command(navigation), () => pending.promise)
    expect(await navigation.visit({ kind: 'extensions' }, async () => false)).toBe(false)
    pending.resolve(true)
    expect(await moving).toBe(false)
    expect(navigation.getSnapshot()).toMatchObject({ busy: false, snapshot: saved })
  })

  it('truncates forward entries only after a successful direct visit', async () => {
    const { navigation } = harness()
    await navigation.initialize(stack(conversation('a'), conversation('b'), conversation('c')), undefined, success)
    await navigation.go(command(navigation), success)
    const before = navigation.getSnapshot().snapshot
    expect(await navigation.visit({ kind: 'extensions' }, async () => false)).toBe(false)
    expect(navigation.getSnapshot().snapshot).toBe(before)
    expect(await navigation.visit({ kind: 'extensions' }, success)).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('a'), conversation('b'), { kind: 'extensions' }))
    expect(navigation.getSnapshot().canGoForward).toBe(false)
  })

  it('visits a draft without pushing it and returns to the existing cursor target', async () => {
    const { navigation } = harness()
    const saved = stack(conversation('a'))
    await navigation.initialize(saved, undefined, success)
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    expect(await navigation.visit(undefined, execute, 'automations')).toBe(true)
    expect(execute.mock.calls[0][0]).toBeUndefined()
    expect(execute.mock.calls[0][2]).toBe('automations')
    expect(navigation.getSnapshot().snapshot).toEqual({ ...saved, detached: true, draft: 'automations' })
    expect(await navigation.go(command(navigation), success)).toBe(true)
    expect(navigation.getSnapshot().snapshot).toEqual(saved)
  })

  it('records changed user destinations only after readiness and outside pending actions', async () => {
    const { navigation, publish } = harness()
    navigation.record(conversation('ignored-before-init'))
    navigation.detach()
    await navigation.initialize(undefined, conversation('a'), success)
    const settled = navigation.getSnapshot()
    const count = publish.mock.calls.length
    navigation.record(conversation('a'))
    expect(navigation.getSnapshot()).toBe(settled)
    expect(publish).toHaveBeenCalledTimes(count)
    navigation.record({ kind: 'automations', tab: 'settings', filter: 'all' })
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('a'), { kind: 'automations' }))
    navigation.detach('automations')
    const detached = navigation.getSnapshot()
    navigation.detach('automations')
    expect(navigation.getSnapshot()).toBe(detached)
    const pending = deferred()
    const visiting = navigation.visit(conversation('b'), () => pending.promise)
    navigation.record(conversation('ignored-while-busy'))
    navigation.detach()
    expect(navigation.getSnapshot().snapshot).toBe(detached.snapshot)
    pending.resolve(true)
    await visiting
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('a'), { kind: 'automations' }, conversation('b')))
  })

  it('prunes deleted sessions and cancels pending replay so deleted entries cannot return', async () => {
    const { navigation, publish } = harness()
    await navigation.initialize(stack(conversation('a'), conversation('b')), undefined, success)
    const pending = deferred()
    let isCurrent!: () => boolean
    const moving = navigation.go(command(navigation), (_target, current) => { isCurrent = current; return pending.promise })
    navigation.removeSession('a')
    expect(isCurrent()).toBe(false)
    expect(navigation.getSnapshot()).toMatchObject({ busy: false, snapshot: stack(conversation('b')) })
    const count = publish.mock.calls.length
    pending.resolve(true)
    expect(await moving).toBe(false)
    expect(publish).toHaveBeenCalledTimes(count)
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('b')))
  })

  it('cancels visits to deleted destinations even before they enter committed history', async () => {
    const { navigation } = harness()
    await navigation.initialize(undefined, conversation('a'), success)
    const pending = deferred()
    const visiting = navigation.visit({ kind: 'automations', taskId: 'deleted', tab: 'history' }, () => pending.promise)
    navigation.removeAutomation('deleted')
    pending.resolve(true)
    expect(await visiting).toBe(false)
    expect(navigation.getSnapshot()).toMatchObject({ busy: false, snapshot: stack(conversation('a')) })
  })

  it('removes deleted automation details and run filters while retaining ordinary page entries', async () => {
    const { navigation, publish } = harness()
    await navigation.initialize(stack({ kind: 'automations' }, { kind: 'automations', taskId: 'deleted' }, { kind: 'automations', section: 'runs', runTaskId: 'deleted' }, conversation('a')), undefined, success)
    navigation.removeAutomation('deleted')
    expect(navigation.getSnapshot().snapshot).toEqual(stack({ kind: 'automations' }, conversation('a')))
    const count = publish.mock.calls.length
    navigation.removeAutomation('missing')
    navigation.removeSession('missing')
    expect(publish).toHaveBeenCalledTimes(count)
  })

  it('allows cancelled initialization to retry after a StrictMode disconnect/reconnect', async () => {
    const { navigation, publish } = harness()
    const pending = deferred()
    let isCurrent!: () => boolean
    const restoring = navigation.initialize(stack(conversation('stale')), undefined, (_target, current) => { isCurrent = current; return pending.promise })
    navigation.disconnect()
    expect(isCurrent()).toBe(false)
    expect(navigation.busy).toBe(false)
    const disconnectedCount = publish.mock.calls.length
    navigation.record(conversation('ignored'))
    expect(await navigation.go(command(navigation), success)).toBe(false)
    expect(publish).toHaveBeenCalledTimes(disconnectedCount)
    navigation.connect()
    expect(await navigation.initialize(undefined, conversation('current'), success)).toBe(true)
    pending.resolve(true)
    expect(await restoring).toBe(false)
    expect(navigation.getSnapshot().snapshot).toEqual(stack(conversation('current')))
  })

  it('preserves completed history on reconnect and discards a late pending result', async () => {
    const { navigation, publish } = harness()
    const saved = stack(conversation('a'), conversation('b'))
    await navigation.initialize(saved, undefined, success)
    const pending = deferred()
    const moving = navigation.go(command(navigation), () => pending.promise)
    navigation.disconnect()
    const count = publish.mock.calls.length
    pending.resolve(true)
    expect(await moving).toBe(false)
    expect(publish).toHaveBeenCalledTimes(count)
    expect(navigation.ready).toBe(true)
    navigation.connect()
    const execute = vi.fn<MiraNavigationAction>(async () => true)
    expect(await navigation.initialize(undefined, undefined, execute)).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    expect(navigation.getSnapshot()).toMatchObject({ canGoBack: true, busy: false, snapshot: saved })
  })

  it('provides a stable external-store snapshot and unsubscribes listeners', async () => {
    const { navigation } = harness()
    const listener = vi.fn()
    const unsubscribe = navigation.subscribe(listener)
    const initial = navigation.getSnapshot()
    expect(navigation.getSnapshot()).toBe(initial)
    await navigation.initialize(undefined, conversation('a'), success)
    expect(navigation.getSnapshot()).not.toBe(initial)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    const count = listener.mock.calls.length
    navigation.record({ kind: 'extensions' })
    expect(listener).toHaveBeenCalledTimes(count)
  })
})
