import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeWorkspaceTab, createWorkspaceRunTab, createWorkspaceSession, createWorkspaceSideConversationTab, createWorkspaceSubtaskTab, createWorkspaceTerminalTab, isWorkspaceTerminalTab, openWorkspaceTab, readWorkspaceSessions, restoreWorkspaceTab } from '../apps/harness-react/src/state/workspace-state'

const NOW = 1_791_664_800_000
beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW))
afterEach(() => vi.restoreAllMocks())

describe('run and subtask workspace owners', () => {
  it('keeps independent terminal resources with unique directory labels, closed-tab ownership', () => {
    const first = createWorkspaceTerminalTab('/project/Mira/', [])
    const second = createWorkspaceTerminalTab('/project/Mira', [first])
    expect(first.id).not.toBe(second.id); expect(first.label).toBe('Mira'); expect(second.label).toBe('Mira 2')
    expect(isWorkspaceTerminalTab(first.id)).toBe(true); expect(isWorkspaceTerminalTab('terminal')).toBe(false)
    const open = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), first), second)
    const closed = readWorkspaceSessions({ parent: closeWorkspaceTab(open, first.id) }).parent
    expect(closed.tabs).toEqual([{ ...second, openedAt: NOW }]); expect(closed.recentClosedTabs).toEqual([{ ...first, openedAt: NOW, closedAt: NOW }])
    expect(restoreWorkspaceTab(closed, first.id).tabs).toEqual([{ ...second, openedAt: NOW }, { ...first, openedAt: NOW }])
    expect(readWorkspaceSessions({ parent: { tabs: [{ id: 'terminal', label: '旧终端' }, { id: 'terminal:../bad', label: '拒绝' }] } }).parent.tabs).toEqual([])
  })
  it('restores independent side tabs and rejects mismatched child identities', () => {
    const first = createWorkspaceSideConversationTab('child-a'), second = createWorkspaceSideConversationTab('child-b')
    const open = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), first), second)
    const closed = closeWorkspaceTab(open, first.id)
    const restored = readWorkspaceSessions({ parent: closed }).parent
    expect(restored.tabs).toEqual([{ ...second, openedAt: NOW }]); expect(restored.recentClosedTabs).toEqual([{ ...first, openedAt: NOW, closedAt: NOW }])
    expect(restoreWorkspaceTab(restored, first.id).activeTab).toBe(first.id)
    expect(readWorkspaceSessions({ parent: { tabs: [{ ...first, childSessionId: 'child-b' }, { ...first, childSessionId: '../bad' }] } }).parent.tabs).toEqual([])
  })
  it('updates the explicitly requested overview run without creating duplicate tabs', () => {
    const first = openWorkspaceTab(createWorkspaceSession(), createWorkspaceRunTab('run-a'))
    const second = openWorkspaceTab(first, createWorkspaceRunTab('run-b'))
    expect(first.tabs).toEqual([{ id: 'overview', label: '调用轨迹', runId: 'run-a', openedAt: NOW }])
    expect(second.tabs).toEqual([{ id: 'overview', label: '调用轨迹', runId: 'run-b', openedAt: NOW }])
    expect(second.activeTab).toBe('overview')
  })

  it('keeps child tabs distinct across runs and restores their owner through close and reload', () => {
    const a = createWorkspaceSubtaskTab('run:a', 'child:b', '核对配置')
    const b = createWorkspaceSubtaskTab('run', 'a:child:b', '其他运行')
    expect(a.id).not.toBe(b.id)
    const opened = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), a), b)
    const closed = closeWorkspaceTab(opened, a.id)
    const loaded = readWorkspaceSessions({ session: closed }).session
    expect(loaded.recentClosedTabs).toEqual([{ ...a, openedAt: NOW, closedAt: NOW }])
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
