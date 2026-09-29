import { describe, expect, it, vi } from 'vitest'
import type { HarnessProject, HarnessSession, HarnessSessionSummary } from '../src/config/harness'
import { groupSessions, sessionBadge, sessionMarkdown } from '../apps/harness-react/src/session-groups'

function summary(id: string, overrides: Partial<HarnessSessionSummary> = {}): HarnessSessionSummary {
  return { id, title: `会话 ${id}`, projectId: undefined, permissionMode: 'default', createdAt: 1, updatedAt: 1, status: 'active', pinned: false, unread: false, ...overrides }
}
function project(id: string, overrides: Partial<HarnessProject> = {}): HarnessProject {
  return { id, name: `项目 ${id}`, icon: 'FolderOpened', directory: `/tmp/${id}`, directoryExists: true, createdAt: 1, updatedAt: 1, sessionCount: 0, ...overrides }
}

describe('session drawer grouping', () => {
  it('partitions sessions into pinned, project and recent groups with project order preserved', () => {
    const projects = [project('b'), project('a')]
    const sessions = [
      summary('s1', { pinned: true }),
      summary('s2', { projectId: 'b' }),
      summary('s3'),
      summary('s4', { projectId: 'a', pinned: true }),
      summary('s5', { projectId: 'b' }),
      summary('s6', { projectId: 'missing' }),
    ]
    const model = groupSessions(sessions, projects)
    expect(model.pinned.map(item => item.id)).toEqual(['s1', 's4'])
    expect(model.projects.map(entry => entry.project.id)).toEqual(['b', 'a'])
    expect(model.projects[0].sessions.map(item => item.id)).toEqual(['s2', 's5'])
    expect(model.recent.map(item => item.id)).toEqual(['s3', 's6'])
  })

  it('applies the badge priority plan > permission > running > unread', () => {
    const base = { running: true, unread: true, pending: true }
    expect(sessionBadge(summary('s', { planStatus: 'awaiting_confirmation' }), base)).toEqual({ kind: 'plan', label: '等待确认' })
    expect(sessionBadge(summary('s', { planStatus: 'completed' }), base)).toEqual({ kind: 'waiting', label: '等待审批' })
    expect(sessionBadge(summary('s'), { running: true, unread: true, pending: false })).toEqual({ kind: 'running', label: '执行中' })
    expect(sessionBadge(summary('s'), { running: false, unread: true, pending: false })).toEqual({ kind: 'unread', label: '未读' })
    expect(sessionBadge(summary('s', { unread: true }), { running: false, unread: false, pending: false })).toEqual({ kind: 'unread', label: '未读' })
    expect(sessionBadge(summary('s'), { running: false, unread: false, pending: false })).toBeUndefined()
    expect(sessionBadge(summary('s', { planStatus: 'cancelled' }), { running: false, unread: false, pending: false })).toBeUndefined()
  })

  it('builds session markdown in the same shape as the Vue workbench', () => {
    const session: HarnessSession = {
      version: 1, id: 'session-1', title: '研究任务', permissionMode: 'default',
      messages: [
        { id: 'm1', role: 'user', content: '帮我整理资料', createdAt: 1 },
        { id: 'm2', role: 'assistant', content: '好的，开始整理。', createdAt: 2 },
        { id: 'm3', role: 'assistant', content: '（内部消息不导出）', createdAt: 3, internal: true },
      ],
      toolCalls: [], createdAt: 1, updatedAt: 1, status: 'active', pinned: false,
    }
    expect(sessionMarkdown(session)).toBe('# 研究任务\n\n- 会话 ID: session-1\n\n## 用户\n\n帮我整理资料\n\n## Mira\n\n好的，开始整理。')
  })
})
