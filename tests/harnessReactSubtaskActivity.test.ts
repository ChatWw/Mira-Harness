import { describe, expect, it } from 'vitest'
import type { HarnessMessage, HarnessRunSummary, HarnessSession, HarnessSubtask, ToolCallRecord } from '../src/config/harness'
import { findMiraDelegateSubtask, selectMiraRunActivity, selectMiraSubtask } from '../apps/harness-react/src/lib/subtask-activity'

const child = (id = 'child', parentToolCallId = 'call'): HarnessSubtask => ({ id, parentToolCallId, role: 'reviewer', task: '检查文件', status: 'completed', createdAt: 2, activities: [], report: '检查完成' })
const summary = (subtasks: HarnessSubtask[] = []): HarnessRunSummary => ({ startedAt: 1, completedAt: 10, durationMs: 9, status: 'completed', activities: [], subtasks })
const assistant = (id: string, runId: string | undefined, run?: HarnessRunSummary): HarnessMessage => ({ id, role: 'assistant', content: '报告', createdAt: 1, runId, run })
const tool = (id: string, overrides: Partial<ToolCallRecord> = {}): ToolCallRecord => ({ id, tool: 'delegate_task', runId: 'run', providerCallId: 'call', createdAt: 2, status: 'ok', ...overrides })
const session = (overrides: Partial<HarnessSession> = {}): HarnessSession => ({ version: 1, id: 'session', title: '任务', permissionMode: 'default', messages: [], toolCalls: [], createdAt: 1, updatedAt: 10, status: 'completed', pinned: false, ...overrides })

describe('Mira read-only run activity selection', () => {
  it('prefers the matching active run over saved summaries without mutating session data', () => {
    const activeChild = { ...child(), status: 'running' as const }
    const source = session({ messages: [assistant('saved', 'run', summary([child()]))], activeRun: { id: 'run', startedAt: 20, activities: [], subtasks: [activeChild] } })
    const before = structuredClone(source)
    expect(selectMiraRunActivity(source, 'run')).toMatchObject({ runId: 'run', startedAt: 20, status: 'running', subtasks: [activeChild] })
    expect(selectMiraSubtask(source, 'run', 'child')?.subtask).toBe(activeChild)
    expect(source).toEqual(before)
  })

  it('selects the last authoritative assistant summary across multiple segments and unrelated active runs', () => {
    const final = { ...summary([child()]), status: 'failed' as const, error: '运行失败', usage: { total: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3 } } }
    const source = session({ activeRun: { id: 'other', startedAt: 20, activities: [], subtasks: [] }, messages: [
      assistant('first', 'run', summary()),
      { id: 'guide', role: 'user', content: '继续', createdAt: 4, runId: 'run', run: summary() },
      assistant('final', 'run', final),
      assistant('trailing-segment', 'run'),
      assistant('other', 'other', summary()),
    ] })
    expect(selectMiraRunActivity(source, 'run')).toMatchObject({ ...final, runId: 'run', tools: [] })
  })

  it('keeps all parent tools from the exact run and excludes child, legacy and cross-run records', () => {
    const first = tool('run:response-1:call'), second = tool('run:response-2:call')
    const source = session({ messages: [assistant('first', 'run'), assistant('last', 'run', summary())], toolCalls: [first, tool('other', { runId: 'other' }), tool('legacy', { runId: undefined }), tool('child-tool', { subtaskId: 'child' }), second] })
    expect(selectMiraRunActivity(source, 'run')?.tools).toEqual([first, second])
  })

  it('switches from active data to the completed, failed or stopped authoritative summary', () => {
    for (const status of ['completed', 'failed', 'stopped'] as const) {
      const source = session({ activeRun: { id: 'run', startedAt: 1, activities: [], subtasks: [child()] } })
      expect(selectMiraRunActivity(source, 'run')?.status).toBe('running')
      delete source.activeRun
      source.messages = [assistant('final', 'run', { ...summary([child()]), status })]
      expect(selectMiraRunActivity(source, 'run')?.status).toBe(status)
    }
  })

  it('uses only the provided session and requires an exact run source', () => {
    const left = session({ messages: [assistant('left', 'run', summary([child('left')]))] })
    const right = session({ id: 'other-session', messages: [assistant('right', 'run', summary([child('right')]))] })
    expect(selectMiraRunActivity(left, 'run')?.subtasks[0].id).toBe('left')
    expect(selectMiraRunActivity(right, 'run')?.subtasks[0].id).toBe('right')
    expect(selectMiraRunActivity(left, 'missing')).toBeUndefined()
    expect(selectMiraRunActivity(undefined, 'run')).toBeUndefined()
    expect(selectMiraRunActivity(session({ messages: [assistant('legacy', undefined, summary())] }), 'run')).toBeUndefined()
  })
})

describe('Mira child tool ownership', () => {
  it('keeps explicit child tools in their exact run and allows legacy tools for one run owner', () => {
    const own = tool('own', { subtaskId: 'child' }), legacy = tool('legacy', { subtaskId: 'child', runId: undefined })
    const source = session({ messages: [assistant('first', 'run', summary([child()])), assistant('final', 'run', summary([child()]))], activeRun: { id: 'run', startedAt: 1, activities: [], subtasks: [child()] }, toolCalls: [own, legacy, tool('cross-run', { subtaskId: 'child', runId: 'other' }), tool('other-child', { subtaskId: 'other' }), tool('parent')] })
    expect(selectMiraSubtask(source, 'run', 'child')?.tools).toEqual([own, legacy])
  })

  it('rejects legacy tools when a child ID is owned by multiple runs, while retaining explicit records', () => {
    const own = tool('own', { subtaskId: 'child' }), other = tool('other', { subtaskId: 'child', runId: 'other' })
    const source = session({ messages: [assistant('run', 'run', summary([child()])), assistant('other', 'other', summary([child()]))], toolCalls: [own, other, tool('legacy', { subtaskId: 'child', runId: undefined })] })
    expect(selectMiraSubtask(source, 'run', 'child')?.tools).toEqual([own])
    expect(selectMiraSubtask(source, 'other', 'child')?.tools).toEqual([other])
  })

  it('rejects legacy child tools if another owner cannot be identified', () => {
    const source = session({ messages: [assistant('run', 'run', summary([child()])), assistant('unknown', undefined, summary([child()]))], toolCalls: [tool('legacy', { subtaskId: 'child', runId: undefined })] })
    expect(selectMiraSubtask(source, 'run', 'child')?.tools).toEqual([])
  })

  it('does not resolve a missing, cross-run or repeated child record', () => {
    const source = session({ messages: [assistant('run', 'run', summary([child(), child()])), assistant('other', 'other', summary([child('elsewhere')]))] })
    expect(selectMiraSubtask(source, 'run', 'child')).toBeUndefined()
    expect(selectMiraSubtask(source, 'run', 'elsewhere')).toBeUndefined()
    expect(selectMiraSubtask(source, 'missing', 'child')).toBeUndefined()
    expect(selectMiraSubtask(undefined, 'run', 'child')).toBeUndefined()
  })
})

describe('Mira delegate parent identity resolution', () => {
  it('resolves canonical parents despite repeated provider IDs across responses', () => {
    const first = tool('run:response-1:call'), second = tool('run:response-2:call')
    const firstChild = child('first', first.id), secondChild = child('second', second.id)
    const source = session({ messages: [assistant('first-segment', 'run'), assistant('last-segment', 'run', summary([firstChild, secondChild]))], toolCalls: [first, second] })
    expect(findMiraDelegateSubtask(source, 'run', first.id)).toBe(firstChild)
    expect(findMiraDelegateSubtask(source, 'run', second.id)).toBe(secondChild)
  })

  it('resolves a raw provider parent only when its delegate candidate is unique in the whole run', () => {
    const delegate = tool('run:response-1:call'), task = child()
    const source = session({ messages: [assistant('run', 'run', summary([task]))], toolCalls: [delegate, tool('other:response-1:call', { runId: 'other' }), tool('child-delegate', { subtaskId: 'child' }), tool('read', { tool: 'read' })] })
    expect(findMiraDelegateSubtask(source, 'run', delegate.id)).toBe(task)
    source.toolCalls.push(tool('run:response-2:call'))
    expect(findMiraDelegateSubtask(source, 'run', delegate.id)).toBeUndefined()
    expect(findMiraDelegateSubtask(source, 'run', 'run:response-2:call')).toBeUndefined()
  })

  it('resolves a legacy exact raw public ID and gives exact identity priority over another provider ID', () => {
    const task = child(), source = session({ messages: [assistant('run', 'run', summary([task]))], toolCalls: [tool('call', { providerCallId: undefined }), tool('other-public-id')] })
    expect(findMiraDelegateSubtask(source, 'run', 'call')).toBe(task)
    expect(findMiraDelegateSubtask(source, 'run', 'other-public-id')).toBeUndefined()
  })

  it('does not guess from suffixes, timing or an unowned legacy delegate', () => {
    const source = session({ messages: [assistant('run', 'run', summary([child()]))], toolCalls: [tool('run:response-1:call', { providerCallId: undefined }), tool('call', { runId: undefined })] })
    expect(findMiraDelegateSubtask(source, 'run', 'run:response-1:call')).toBeUndefined()
    expect(findMiraDelegateSubtask(source, 'run', 'call')).toBeUndefined()
  })

  it('rejects multiple children or duplicate public tool records rather than picking the first', () => {
    const delegate = tool('public'), source = session({ messages: [assistant('run', 'run', summary([child('first', 'public'), child('second', 'call')]))], toolCalls: [delegate] })
    expect(findMiraDelegateSubtask(source, 'run', 'public')).toBeUndefined()
    source.messages = [assistant('run', 'run', summary([child('first', 'public')]))]
    source.toolCalls.push({ ...delegate })
    expect(findMiraDelegateSubtask(source, 'run', 'public')).toBeUndefined()
  })

  it('cannot resolve a child through another run, another session or a non-delegate tool', () => {
    const task = child('child', 'public'), source = session({ messages: [assistant('run', 'run', summary([task]))], toolCalls: [tool('public')] })
    expect(findMiraDelegateSubtask(source, 'other', 'public')).toBeUndefined()
    expect(findMiraDelegateSubtask(session({ id: 'other-session' }), 'run', 'public')).toBeUndefined()
    source.toolCalls[0].tool = 'read'
    expect(findMiraDelegateSubtask(source, 'run', 'public')).toBeUndefined()
    expect(findMiraDelegateSubtask(undefined, 'run', 'public')).toBeUndefined()
  })
})
