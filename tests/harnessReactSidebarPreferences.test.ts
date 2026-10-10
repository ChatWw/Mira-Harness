import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarPreferenceStore, type SidebarGroupingOrder } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { SessionSidebar, type SessionDrawerProps } from '../apps/harness-react/src/components/session/SessionSidebar'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }
    return slot.value
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))
vi.mock('@dnd-kit/core', async original => ({ ...await original<typeof import('@dnd-kit/core')>(), DndContext: 'dnd-context', DragOverlay: 'drag-overlay', KeyboardSensor: 'keyboard', PointerSensor: 'pointer', useSensor: vi.fn(), useSensors: vi.fn() }))

beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })

function mountSidebar(read: () => Promise<unknown>) {
  const controller = { getPreference: vi.fn(read), setPreference: vi.fn(async () => undefined), registerBeforeNavigation: vi.fn(() => () => undefined) }
  const state = { sessions: [], projects: [], runningSessionIds: [], pendingPermissions: {}, unreadSessionIds: [], session: { projectId: 'active' } }
  let tree: React.ReactNode
  const render = () => { hooks.cursor = 0; tree = SessionSidebar({ state, controller, width: 260, onClose: vi.fn() } as unknown as SessionDrawerProps); hooks.effects.splice(0).forEach(effect => effect()) }
  const props = (match: (value: Record<string, unknown>) => boolean) => {
    const visit = (node: React.ReactNode): Record<string, unknown> | undefined => Array.isArray(node) ? node.map(visit).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props) ? node.props : visit(node.props.children as React.ReactNode) : undefined
    return visit(tree)
  }
  const drain = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); render() } }
  render()
  return { controller, props, drain }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('Harness sidebar persisted preferences', () => {
  it('preserves changed view and sort when hydration arrives late', async () => {
    const reading = deferred<unknown>()
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(() => reading.promise, write)
    const load = store.load()
    store.change({ sort: 'created', view: 'project' })
    reading.resolve({ sort: 'manual', view: 'group', expandedProjectIds: ['project', 'project', null] })
    await load; await store.save()
    expect(store.getSnapshot().preferences).toEqual({ projectSectionOpen: true, personalSectionOpen: true, sectionOrder: ['projects', 'personal'], sort: 'created', view: 'project', projectView: 'collections', expandedProjectIds: ['project'], collapsedProjectIds: [], groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [], groupedRootOrder: [] })
    expect(write).toHaveBeenLastCalledWith(store.getSnapshot().preferences)
  })
  it('never writes defaults after failed hydration and retries without losing local edits', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('磁盘读取失败')).mockResolvedValueOnce({ view: 'group', expandedProjectIds: ['a'] })
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(read, write)
    await expect(store.load()).rejects.toThrow('磁盘读取失败')
    store.change({ sort: 'created' })
    expect(write).not.toHaveBeenCalled()
    await store.retry(); await store.save()
    expect(store.getSnapshot()).toMatchObject({ ready: true, error: '', preferences: { view: 'group', sort: 'created', expandedProjectIds: ['a'] } })
  })
  it('serializes saves and flushes the last change before navigation completes', async () => {
    const first = deferred<void>()
    const write = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => null, write)
    await store.load()
    store.change({ sort: 'manual' })
    store.change({ sort: 'created' })
    expect(write).toHaveBeenCalledTimes(1)
    const flush = store.save()
    first.resolve(); await flush
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith({ projectSectionOpen: true, personalSectionOpen: true, sectionOrder: ['projects', 'personal'], expandedProjectIds: [], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'created', groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [], groupedRootOrder: [] })
    const restored = new SidebarPreferenceStore(async () => write.mock.calls.at(-1)?.[0], async () => undefined)
    await restored.load()
    expect(restored.getSnapshot().preferences.sort).toBe('created')
  })
  it('surfaces save failures and retries the unchanged snapshot', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('磁盘写入失败')).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => null, write)
    await store.load()
    store.change({ view: 'group' })
    await vi.waitFor(() => expect(store.getSnapshot().error).toBe('磁盘写入失败'))
    await store.retry()
    expect(store.getSnapshot().error).toBe('')
    expect(write.mock.calls[0][0]).toEqual(write.mock.calls[1][0])
  })
  it('waits for hydration before automatically expanding the active project, preserving other expanded projects', async () => {
    const reading = deferred<unknown>()
    const view = mountSidebar(() => reading.promise)
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    reading.resolve({ expandedProjectIds: ['saved-a', 'saved-b'], view: 'project', sort: 'created' })
    await view.drain()
    expect(view.controller.setPreference).toHaveBeenLastCalledWith('session-drawer', { projectSectionOpen: true, personalSectionOpen: true, sectionOrder: ['projects', 'personal'], expandedProjectIds: ['saved-a', 'saved-b', 'active'], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'created', groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [], groupedRootOrder: [] }, true)
  })
  it('does not touch automatic expansion after a failed read and merges the saved projects after retry', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('读取失败')).mockResolvedValueOnce({ expandedProjectIds: ['saved'], view: 'project', sort: 'updated' })
    const view = mountSidebar(read); await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
    ;(view.props(p => p.children === '重试')!.onClick as () => void)(); await view.drain()
    expect(view.controller.setPreference).toHaveBeenLastCalledWith('session-drawer', { projectSectionOpen: true, personalSectionOpen: true, sectionOrder: ['projects', 'personal'], expandedProjectIds: ['saved', 'active'], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'updated', groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [], groupedRootOrder: [] }, true)
  })
  it('migrates old preferences and sanitizes duplicate group membership and persisted lists', async () => {
    const store = new SidebarPreferenceStore(async () => ({
      groups: [{ id: 'a', name: '  研究  ', color: 'blue', sessionIds: ['one', 'one', null], collapsed: true }, { id: 'a', name: 'duplicate', sessionIds: ['two'] }, { id: 'b', name: '写作', color: 'invalid', sessionIds: ['one', 'two'] }, null],
      hiddenProjectIds: ['p', 'p', null], ungroupedSessionOrder: ['third', 'third'],
    }), async () => undefined)
    await store.load()
    expect(store.getSnapshot().preferences).toEqual({ projectSectionOpen: true, personalSectionOpen: true, sectionOrder: ['projects', 'personal'], expandedProjectIds: [], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'updated', hiddenProjectIds: ['p'], ungroupedSessionOrder: ['third'], groupedRootOrder: [], groups: [{ id: 'a', name: '研究', color: 'blue', collapsed: true, sessionIds: ['one'] }, { id: 'b', name: '写作', color: 'gray', collapsed: false, sessionIds: ['two'] }] })
  })
  it('restores the timeline choice and independent project/group collapse state', async () => {
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(async () => ({ expandedProjectIds: ['p1'], collapsedProjectIds: ['p2'], groups: [{ id: 'g', name: '研究', collapsed: false, sessionIds: ['s'] }] }), write)
    await store.load()
    store.setGroupsExpanded(false)
    store.change({ view: 'project', projectView: 'timeline' })
    await store.save()
    const restored = new SidebarPreferenceStore(async () => write.mock.calls.at(-1)![0], async () => undefined)
    await restored.load()
    expect(restored.getSnapshot().preferences).toMatchObject({ view: 'project', projectView: 'timeline', expandedProjectIds: ['p1'], collapsedProjectIds: ['p2'], groups: [{ id: 'g', collapsed: true, sessionIds: ['s'] }] })
    restored.setProjectsExpanded(['p2'], true)
    expect(restored.getSnapshot().preferences).toMatchObject({ expandedProjectIds: ['p1', 'p2'], collapsedProjectIds: [], groups: [{ collapsed: true }] })
  })
  it('does not re-expand an explicitly collapsed active project after restart', async () => {
    const view = mountSidebar(async () => ({ expandedProjectIds: ['saved'], collapsedProjectIds: ['active'], projectView: 'timeline' }))
    await view.drain()
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('sanitizes the new display preference and gives expanded entries precedence over conflicting collapsed IDs', async () => {
    const store = new SidebarPreferenceStore(async () => ({ projectView: 'unknown', expandedProjectIds: ['p1'], collapsedProjectIds: ['p1', 'p2', 'p2', null] }), async () => undefined)
    await store.load()
    expect(store.getSnapshot().preferences).toMatchObject({ projectView: 'collections', expandedProjectIds: ['p1'], collapsedProjectIds: ['p2'] })
  })
  it('preserves a timeline selection made before preference hydration finishes', async () => {
    const reading = deferred<unknown>()
    const store = new SidebarPreferenceStore(() => reading.promise, async () => undefined)
    const load = store.load()
    store.change({ projectView: 'timeline' })
    reading.resolve({ projectView: 'collections', expandedProjectIds: ['p'] })
    await load; await store.save()
    expect(store.getSnapshot().preferences).toMatchObject({ projectView: 'timeline', expandedProjectIds: ['p'] })
  })
  it('migrates root ordering, preserving interleaving while rejecting duplicate, unknown-group and grouped-session entries', async () => {
    const store = new SidebarPreferenceStore(async () => ({
      groups: [{ id: 'g1', name: '研究', sessionIds: ['grouped'] }, { id: 'g2', name: '写作', sessionIds: [] }],
      ungroupedSessionOrder: ['root'],
      groupedRootOrder: [{ type: 'group', id: 'g1', injected: 'discard' }, { type: 'session', id: 'root' }, { type: 'group', id: 'g2' }, { type: 'session', id: 'root' }, { type: 'group', id: 'missing' }, { type: 'session', id: 'grouped' }, null, { type: 'project', id: 'other' }, { type: 'session', id: 1 }],
    }), async () => undefined)
    await store.load()
    expect(store.getSnapshot().preferences.groupedRootOrder).toEqual([{ type: 'group', id: 'g1' }, { type: 'session', id: 'root' }, { type: 'group', id: 'g2' }])
    expect(store.getSnapshot().preferences.ungroupedSessionOrder).toEqual(['root'])
  })
})

const originalGrouping: SidebarGroupingOrder = {
  groups: [{ id: 'g1', name: '研究', color: 'blue', collapsed: false, sessionIds: ['task'] }, { id: 'g2', name: '写作', color: 'green', collapsed: true, sessionIds: [] }],
  ungroupedSessionOrder: [], groupedRootOrder: [{ type: 'group', id: 'g1' }, { type: 'group', id: 'g2' }],
}
const rootDrop: SidebarGroupingOrder = {
  groups: originalGrouping.groups.map(group => ({ ...group, sessionIds: [] })),
  ungroupedSessionOrder: ['task'], groupedRootOrder: [{ type: 'group', id: 'g1' }, { type: 'session', id: 'task' }, { type: 'group', id: 'g2' }],
}

describe('Harness drag persistence through the real preference store', () => {
  it('writes a completed drop once and restores the exact interleaved root order on reload', async () => {
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(async () => ({ ...originalGrouping, expandedProjectIds: ['project'], hiddenProjectIds: ['hidden'], projectView: 'timeline' }), write)
    await store.load(); await store.applyGroupDrop(rootDrop)
    expect(write).toHaveBeenCalledOnce()
    const restored = new SidebarPreferenceStore(async () => write.mock.calls[0]![0], async () => undefined)
    await restored.load()
    expect(restored.getSnapshot().preferences).toMatchObject({ ...rootDrop, expandedProjectIds: ['project'], hiddenProjectIds: ['hidden'], projectView: 'timeline' })
  })
  it('rolls back only this failed drop, keeps the real error visible and saves the restored state only on retry', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('偏好写入失败')).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => ({ ...originalGrouping, hiddenProjectIds: ['hidden'] }), write)
    await store.load(); await expect(store.applyGroupDrop(rootDrop)).rejects.toThrow('偏好写入失败')
    expect(store.getSnapshot()).toMatchObject({ error: '偏好写入失败', preferences: { ...originalGrouping, hiddenProjectIds: ['hidden'] } })
    expect(write).toHaveBeenCalledOnce()
    await store.retry()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith(store.getSnapshot().preferences)
    expect(store.getSnapshot().error).toBe('')
  })
  it.each(['group-name', 'other-preference'] as const)('does not overwrite a later %s edit after the in-flight drag save fails', async change => {
    const pending = deferred<void>()
    const write = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => originalGrouping, write)
    await store.load()
    const dropping = store.applyGroupDrop(rootDrop), failure = expect(dropping).rejects.toThrow('写入失败')
    if (change === 'group-name') store.updateGroup('g2', { name: '保留后续名称' })
    else store.change({ hiddenProjectIds: ['new-hidden'] })
    const latest = store.getSnapshot().preferences
    pending.reject(new Error('写入失败')); await failure
    expect(store.getSnapshot().preferences).toBe(latest)
    expect(store.getSnapshot().error).toBe('写入失败')
    expect(write).toHaveBeenCalledOnce()
    await store.retry()
    expect(write).toHaveBeenLastCalledWith(latest)
  })
  it('keeps the first successful drop when a later serialized drop fails', async () => {
    const write = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('第二次失败')).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => originalGrouping, write)
    await store.load(); await store.applyGroupDrop(rootDrop)
    await expect(store.applyGroupDrop(originalGrouping)).rejects.toThrow('第二次失败')
    expect(store.getSnapshot().preferences).toMatchObject(rootDrop)
    expect(write).toHaveBeenCalledTimes(2)
    await store.retry()
    const restored = new SidebarPreferenceStore(async () => write.mock.calls.at(-1)![0], async () => undefined)
    await restored.load(); expect(restored.getSnapshot().preferences).toMatchObject(rootDrop)
  })
  it('protects an earlier local drop when two drops share a failed pending write, then retries the retained order', async () => {
    const pending = deferred<void>(), write = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => originalGrouping, write)
    await store.load()
    const first = store.applyGroupDrop(rootDrop), firstFailure = expect(first).rejects.toThrow('在途失败')
    const second = store.applyGroupDrop(originalGrouping), secondFailure = expect(second).rejects.toThrow('在途失败')
    expect(write).toHaveBeenCalledOnce()
    pending.reject(new Error('在途失败')); await firstFailure; await secondFailure
    expect(store.getSnapshot()).toMatchObject({ error: '在途失败', preferences: rootDrop })
    await store.retry()
    expect(write).toHaveBeenLastCalledWith(store.getSnapshot().preferences)
  })
  it('does not initialize defaults or commit a drop before hydration succeeds', async () => {
    const write = vi.fn(), store = new SidebarPreferenceStore(async () => originalGrouping, write)
    await store.applyGroupDrop(rootDrop)
    expect(store.getSnapshot().ready).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })
})

describe('Harness sidebar section-order persistence', () => {
  it.each([
    { label: 'missing', value: undefined }, { label: 'null', value: null },
    { label: 'non-array', value: 'personal' }, { label: 'empty', value: [] },
    { label: 'incomplete', value: ['personal'] }, { label: 'duplicate', value: ['projects', 'projects'] },
    { label: 'unknown', value: ['projects', 'unknown'] }, { label: 'extra', value: ['personal', 'projects', 'unknown'] },
  ])('migrates $label section order without changing expansion or task membership', async ({ value }) => {
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(async () => ({ ...originalGrouping, sectionOrder: value, projectSectionOpen: false, personalSectionOpen: true, expandedProjectIds: ['p'], collapsedProjectIds: ['q'] }), write)
    await store.load()
    expect(store.getSnapshot().preferences).toMatchObject({ ...originalGrouping, sectionOrder: ['projects', 'personal'], projectSectionOpen: false, personalSectionOpen: true, expandedProjectIds: ['p'], collapsedProjectIds: ['q'] })
    expect(write).not.toHaveBeenCalled()
  })

  it('writes one completed section drop and restores its order without changing child preferences', async () => {
    const write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(async () => ({ ...originalGrouping, projectSectionOpen: false, personalSectionOpen: false, expandedProjectIds: ['p'], collapsedProjectIds: ['q'], hiddenProjectIds: ['hidden'] }), write)
    await store.load()
    const previous = store.getSnapshot().preferences
    await store.applySectionDrop(['personal', 'projects'])
    expect(write).toHaveBeenCalledOnce()
    expect(store.getSnapshot().preferences).toEqual({ ...previous, sectionOrder: ['personal', 'projects'] })
    expect(store.getSnapshot().preferences.groups).toBe(previous.groups)
    const restored = new SidebarPreferenceStore(async () => write.mock.calls[0]![0], async () => undefined)
    await restored.load()
    expect(restored.getSnapshot().preferences).toEqual(store.getSnapshot().preferences)
  })

  it('does not initialize or write a section drop before hydration or when its order is unchanged', async () => {
    const write = vi.fn(), store = new SidebarPreferenceStore(async () => ({ sectionOrder: ['personal', 'projects'] }), write)
    await store.applySectionDrop(['personal', 'projects'])
    expect(store.getSnapshot().ready).toBe(false)
    expect(write).not.toHaveBeenCalled()
    await store.load(); await store.applySectionDrop(['personal', 'projects'])
    expect(write).not.toHaveBeenCalled()
  })

  it('preserves a local section order while a late read restores untouched expansion', async () => {
    const reading = deferred<unknown>(), write = vi.fn(async () => undefined)
    const store = new SidebarPreferenceStore(() => reading.promise, write)
    const load = store.load()
    store.change({ sectionOrder: ['personal', 'projects'] })
    reading.resolve({ sectionOrder: ['projects', 'personal'], projectSectionOpen: false, expandedProjectIds: ['p'] })
    await load; await store.save()
    expect(store.getSnapshot().preferences).toMatchObject({ sectionOrder: ['personal', 'projects'], projectSectionOpen: false, expandedProjectIds: ['p'] })
    expect(write).toHaveBeenCalledOnce()
  })

  it('does not replace unread preferences with defaults after a read error and restores their section order on retry', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('读取失败')).mockResolvedValueOnce({ sectionOrder: ['personal', 'projects'], personalSectionOpen: false })
    const write = vi.fn(), store = new SidebarPreferenceStore(read, write)
    await expect(store.load()).rejects.toThrow('读取失败')
    await store.applySectionDrop(['personal', 'projects'])
    expect(store.getSnapshot()).toMatchObject({ ready: false, error: '读取失败' })
    expect(write).not.toHaveBeenCalled()
    await store.retry()
    expect(store.getSnapshot()).toMatchObject({ ready: true, error: '', preferences: { sectionOrder: ['personal', 'projects'], personalSectionOpen: false } })
    expect(write).not.toHaveBeenCalled()
  })

  it('rolls back only a failed section drop and retries the retained order', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('顺序写入失败')).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => ({ ...originalGrouping, expandedProjectIds: ['p'], projectSectionOpen: false }), write)
    await store.load()
    const previous = store.getSnapshot().preferences
    await expect(store.applySectionDrop(['personal', 'projects'])).rejects.toThrow('顺序写入失败')
    expect(store.getSnapshot()).toMatchObject({ error: '顺序写入失败', preferences: previous })
    expect(write).toHaveBeenCalledOnce()
    expect(write.mock.calls[0]![0].sectionOrder).toEqual(['personal', 'projects'])
    await store.retry()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith(previous)
    expect(store.getSnapshot().error).toBe('')
  })

  it.each(['order', 'expansion'] as const)('does not let a late failed drop overwrite a newer %s change', async change => {
    const pending = deferred<void>(), write = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => originalGrouping, write)
    await store.load()
    const dropping = store.applySectionDrop(['personal', 'projects']), failure = expect(dropping).rejects.toThrow('迟到失败')
    store.change(change === 'order' ? { sectionOrder: ['projects', 'personal'] } : { personalSectionOpen: false })
    const latest = store.getSnapshot().preferences
    pending.reject(new Error('迟到失败')); await failure
    expect(store.getSnapshot().preferences).toBe(latest)
    expect(write).toHaveBeenCalledOnce()
    await store.retry()
    expect(write).toHaveBeenLastCalledWith(latest)
  })

  it('retains the last successful section order when a subsequent drop fails', async () => {
    const write = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('第二次顺序失败')).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => originalGrouping, write)
    await store.load(); await store.applySectionDrop(['personal', 'projects'])
    await expect(store.applySectionDrop(['projects', 'personal'])).rejects.toThrow('第二次顺序失败')
    expect(store.getSnapshot().preferences.sectionOrder).toEqual(['personal', 'projects'])
    await store.retry()
    expect(write).toHaveBeenCalledTimes(3)
    const restored = new SidebarPreferenceStore(async () => write.mock.calls.at(-1)![0], async () => undefined)
    await restored.load(); expect(restored.getSnapshot().preferences.sectionOrder).toEqual(['personal', 'projects'])
  })

  it('does not let the first failed pending drop overwrite a later drop and retries the retained order', async () => {
    const pending = deferred<void>(), write = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined)
    const store = new SidebarPreferenceStore(async () => originalGrouping, write)
    await store.load()
    const first = store.applySectionDrop(['personal', 'projects']), firstFailure = expect(first).rejects.toThrow('在途顺序失败')
    const second = store.applySectionDrop(['projects', 'personal']), secondFailure = expect(second).rejects.toThrow('在途顺序失败')
    expect(write).toHaveBeenCalledOnce()
    pending.reject(new Error('在途顺序失败')); await firstFailure; await secondFailure
    expect(store.getSnapshot()).toMatchObject({ error: '在途顺序失败', preferences: { ...originalGrouping, sectionOrder: ['personal', 'projects'] } })
    await store.retry()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith(store.getSnapshot().preferences)
  })
})
