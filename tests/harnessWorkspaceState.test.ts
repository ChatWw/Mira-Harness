import { describe, expect, it } from 'vitest'
import { closeWorkspaceTab, createWorkspaceSession, labelWorkspaceTab, openWorkspaceTab, readWorkspaceSessions } from '../apps/harness-react/src/state/workspace-state'

describe('React Harness workspace state', () => {
  it('keeps each session tab selection and browser URL independent', () => {
    const alpha = { ...openWorkspaceTab(createWorkspaceSession(), { id: 'terminal', label: '终端' }), browserUrl: 'https://example.com' }
    const beta = openWorkspaceTab(createWorkspaceSession(), { id: 'changes', label: '变更' })
    const sessions = { alpha, beta }
    expect(sessions.alpha.activeTab).toBe('terminal')
    expect(sessions.alpha.browserUrl).toBe('https://example.com')
    expect(sessions.beta.tabs.map(tab => tab.id)).toEqual(['overview', 'changes'])
    expect(sessions.beta.browserUrl).toBe('')
  })

  it('does not duplicate tabs and returns to the last available tab when closing', () => {
    const files = openWorkspaceTab(createWorkspaceSession(), { id: 'files', label: '文件' })
    const changes = openWorkspaceTab(files, { id: 'changes', label: '变更' })
    const renamed = labelWorkspaceTab(changes, 'changes', 'notes.ts')
    expect(openWorkspaceTab(renamed, { id: 'changes', label: '变更' }).tabs).toHaveLength(3)
    expect(closeWorkspaceTab(renamed, 'changes')).toMatchObject({ activeTab: 'files', tabs: [{ id: 'overview' }, { id: 'files' }] })
    expect(closeWorkspaceTab(renamed, 'overview')).toBe(renamed)
  })

  it('restores valid per-session preferences without trusting malformed stored tabs or URLs', () => {
    expect(readWorkspaceSessions({ a: { tabs: [{ id: 'terminal', label: '终端' }, { id: 'terminal', label: '重复' }, { id: 'unknown', label: '无效' }], activeTab: 'terminal', browserUrl: 'https://example.com' }, b: { tabs: [], activeTab: 'browser', browserUrl: 'javascript:alert(1)' } })).toMatchObject({
      a: { tabs: [{ id: 'overview' }, { id: 'terminal', label: '终端' }], activeTab: 'terminal', browserUrl: 'https://example.com' },
      b: { activeTab: 'overview', browserUrl: '' },
    })
  })
})
