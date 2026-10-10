import { describe, expect, it } from 'vitest'
import { closeWorkspaceTab, createWorkspaceRunTab, createWorkspaceSession, createWorkspaceSubtaskTab, openWorkspaceTab, readWorkspaceSessions, restoreWorkspaceTab } from '../apps/harness-react/src/state/workspace-state'

describe('run and subtask workspace owners', () => {
  it('updates the explicitly requested overview run without creating duplicate tabs', () => {
    const first = openWorkspaceTab(createWorkspaceSession(), createWorkspaceRunTab('run-a'))
    const second = openWorkspaceTab(first, createWorkspaceRunTab('run-b'))
    expect(first.tabs).toEqual([{ id: 'overview', label: '任务活动', runId: 'run-a' }])
    expect(second.tabs).toEqual([{ id: 'overview', label: '任务活动', runId: 'run-b' }])
    expect(second.activeTab).toBe('overview')
  })

  it('keeps child tabs distinct across runs and restores their owner through close and reload', () => {
    const a = createWorkspaceSubtaskTab('run:a', 'child:b', '核对配置')
    const b = createWorkspaceSubtaskTab('run', 'a:child:b', '其他运行')
    expect(a.id).not.toBe(b.id)
    const opened = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), a), b)
    const closed = closeWorkspaceTab(opened, a.id)
    const loaded = readWorkspaceSessions({ session: closed }).session
    expect(loaded.recentClosedTabs).toEqual([a])
    expect(restoreWorkspaceTab(loaded, a.id)).toMatchObject({ tabs: [b, a], activeTab: a.id, recentClosedTabs: [] })
  })

  it('rejects stored child tabs whose id and owner metadata disagree, including recent tabs', () => {
    const valid = createWorkspaceSubtaskTab('run-a', 'child-a', '真实子任务')
    const malformed = [{ ...valid, runId: 'run-b' }, { ...valid, subtaskId: 'child-b' }, { ...valid, runId: undefined }, { ...valid, subtaskId: '' }]
    const loaded = readWorkspaceSessions({ a: { tabs: [...malformed, valid], activeTab: valid.id }, b: { tabs: [], recentClosedTabs: [...malformed, valid] } })
    expect(loaded.a.tabs).toEqual([valid])
    expect(loaded.b.recentClosedTabs).toEqual([valid])
  })

  it('preserves explicit overview metadata while leaving legacy overview records unbound', () => {
    const run = createWorkspaceRunTab('run-a')
    const sessions = readWorkspaceSessions({ current: { tabs: [run], recentClosedTabs: [createWorkspaceSubtaskTab('run-a', 'child', '检查')] }, legacy: { tabs: [{ id: 'overview', label: '旧任务活动' }] } })
    expect(sessions.current.tabs).toEqual([run])
    expect(sessions.current.recentClosedTabs[0]).toMatchObject({ runId: 'run-a', subtaskId: 'child' })
    expect(sessions.legacy.tabs).toEqual([{ id: 'overview', label: '旧任务活动' }])
  })
})
