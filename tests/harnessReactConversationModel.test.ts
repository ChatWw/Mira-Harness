import { describe, expect, it } from 'vitest'
import type { HarnessMessage, HarnessRunSummary, ToolCallRecord } from '../src/config/harness'
import { buildConversationTurns, completedOperationCount, projectTimelineMessages, projectTimelineRenderMessages, toolsForRun, type TimelineRenderMessage } from '../apps/harness-react/src/components/conversation/conversation-model'

const run: HarnessRunSummary = { status: 'completed', startedAt: 100, completedAt: 200, durationMs: 100, activities: [] }
const user = (id: string, createdAt: number): HarnessMessage => ({ id, createdAt, role: 'user', content: `问题 ${id}` })
const assistant = (id: string, createdAt: number): HarnessMessage => ({ id, createdAt, role: 'assistant', content: `回复 ${id}`, run })

describe('Mira conversation turn ownership', () => {
  it('targets the stable active message instead of another segment with the same run or timestamp', () => {
    const messages: HarnessMessage[] = [user('u', 90), { ...assistant('first', 101), runId: 'run', run: undefined }, { ...user('guide', 110), delivery: 'guide', runId: 'run' }]
    const active = { id: 'run', messageId: 'second', startedAt: 100, activities: [], subtasks: [] }
    const result = projectTimelineMessages(messages, active, 120)
    expect(result.slice(0, 3)).toEqual(messages)
    expect(result[3]).toMatchObject({ id: 'stream-second', runId: 'run', content: '' })
    const restored = projectTimelineMessages([...messages, { ...assistant('second', 111), runId: 'run', run: undefined }], active, 130)
    expect(restored).toHaveLength(4)
    expect(restored[1]).toBe(messages[1])
    expect(restored[3]).toMatchObject({ id: 'stream-second', content: '回复 second', run: { durationMs: 30 } })
  })

  it('retains both assistant segment identities when a guide is consumed and the run ends', () => {
    const first = { ...assistant('stream-first', 101), runId: 'run', run: undefined }
    const guide: HarnessMessage = { ...user('guide', 110), delivery: 'guide', runId: 'run' }
    const initial = projectTimelineRenderMessages([user('u', 90), first], 'session')
    const continued = projectTimelineRenderMessages([user('u', 90), { ...first, id: 'first' }, guide, { ...first, id: 'stream-second', createdAt: 111 }], 'session')
    const completed = projectTimelineRenderMessages([user('u', 90), { ...first, id: 'first' }, guide, { ...first, id: 'second', createdAt: 111, run }], 'session')
    expect(continued[1].rendererId).toBe(initial[1].rendererId)
    expect(completed[1].rendererId).toBe(initial[1].rendererId)
    expect(completed[3].rendererId).toBe(continued[3].rendererId)
    expect(completed[3].rendererId).not.toBe(completed[1].rendererId)
  })

  it('keeps guided input inside its original rail turn while ordinary queued input starts another turn', () => {
    const guide: HarnessMessage = { ...user('guide', 110), delivery: 'guide', runId: 'run' }
    const turns = buildConversationTurns([user('u', 90), assistant('first', 101), guide, { ...assistant('stream-second', 111), content: 'continued' }, user('next', 200), assistant('third', 201)])
    expect(turns.map(turn => turn.id)).toEqual(['u', 'next'])
    expect(turns[0]).toMatchObject({ prompt: '问题 u', response: '回复 first\ncontinued', running: true })
    expect(turns[1]).toMatchObject({ prompt: '问题 next', running: false })
  })

  it.each(['completed', 'stopped', 'failed'] as const)('retains renderer identity when a stream becomes a %s persisted reply without changing canonical data', status => {
    const streaming = { ...assistant('stream-run-2', 300), runId: 'run-2', run: undefined }
    const saved = { ...streaming, id: 'persisted-message', run: { ...run, status }, interrupted: status === 'stopped' }
    const before = projectTimelineRenderMessages([user('u', 299), streaming], 'session')
    const after = projectTimelineRenderMessages([user('u', 299), saved], 'session')
    const refreshed = projectTimelineRenderMessages([user('u', 299), { ...saved, content: 'refreshed' }], 'session')
    expect(after[1].rendererId).toBe(before[1].rendererId)
    expect(refreshed[1].rendererId).toBe(before[1].rendererId)
    expect(after[1].original).toBe(saved)
    expect(saved.id).toBe('persisted-message')
    expect(before[0].rendererId).toBe('u')
  })

  it('isolates new runs and sessions while preserving legacy message IDs', () => {
    const current = { ...assistant('persisted', 300), runId: 'run-2' }
    const identity = projectTimelineRenderMessages([current], 'session')[0].rendererId
    expect(projectTimelineRenderMessages([{ ...current, runId: 'run-3' }], 'session')[0].rendererId).not.toBe(identity)
    expect(projectTimelineRenderMessages([current], 'another-session')[0].rendererId).not.toBe(identity)
    expect(projectTimelineRenderMessages([assistant('legacy', 200)], 'session')[0].rendererId).toBe('legacy')
    expect(projectTimelineRenderMessages([user('u', 299)], 'session')[0].rendererId).toBe('u')
  })

  it('keeps multiple assistant messages for the same run distinct without depending on other runs or assuming run IDs are globally unique', () => {
    const first = { ...assistant('first-persisted', 300), runId: 'shared-run' }
    const second = { ...assistant('stream-shared-run', 301), runId: 'shared-run' }
    const before = projectTimelineRenderMessages([first, second], 'session')
    const after = projectTimelineRenderMessages([assistant('legacy', 100), { ...assistant('other', 200), runId: 'other-run' }, first, { ...second, id: 'second-persisted' }], 'session')
    expect(new Set(before.map(message => message.rendererId)).size).toBe(2)
    expect(after.slice(2).map(message => message.rendererId)).toEqual(before.map(message => message.rendererId))
    expect(after.map(message => message.original.id)).toEqual(['legacy', 'other', 'first-persisted', 'second-persisted'])
  })

  it('projects the empty live run placeholder onto the same identity as its authoritative reply', () => {
    const active = { id: 'run-2', startedAt: 300, activities: [], subtasks: [] }
    const empty = projectTimelineMessages([user('u', 299)], active, 310)
    const final = [empty[0], { ...assistant('persisted', 300), runId: active.id }]
    expect(projectTimelineRenderMessages(empty, 'session')[1].rendererId).toBe(projectTimelineRenderMessages(final, 'session')[1].rendererId)
  })

  it('reuses unchanged historical objects across stream updates without mutating or holding canonical messages strongly', () => {
    const cache = new WeakMap<HarnessMessage, TimelineRenderMessage>()
    const history = [user('u1', 99), assistant('a1', 200), user('u2', 299)]
    const first = projectTimelineRenderMessages([...history, { ...assistant('stream-new', 300), runId: 'new' }], 'session', cache)
    const next = projectTimelineRenderMessages([...history, { ...assistant('stream-new', 300), runId: 'new', content: 'next delta' }], 'session', cache)
    expect(next.slice(0, 3).every((message, index) => message === first[index])).toBe(true)
    expect(next[3]).not.toBe(first[3])
    expect(next[3].rendererId).toBe(first[3].rendererId)
    expect(next[3].original.content).toBe('next delta')
  })

  it('invalidates a cached wrapper when its session or same-run occurrence changes', () => {
    const cache = new WeakMap<HarnessMessage, TimelineRenderMessage>()
    const first = { ...assistant('first', 300), runId: 'run' }
    const second = { ...assistant('second', 301), runId: 'run' }
    const original = projectTimelineRenderMessages([first, second], 'session', cache)
    const removed = projectTimelineRenderMessages([second], 'session', cache)
    expect(removed[0]).not.toBe(original[1])
    expect(removed[0].rendererId).not.toBe(original[1].rendererId)
    const otherSession = projectTimelineRenderMessages([second], 'another-session', cache)
    expect(otherSession[0]).not.toBe(removed[0])
    expect(otherSession[0].rendererId).not.toBe(removed[0].rendererId)
  })

  it('gives an empty running turn its own live assistant without rewriting earlier replies', () => {
    const messages = [user('u1', 90), assistant('a1', 201), user('u2', 299)]
    const active = { id: 'run-2', startedAt: 300, activities: [{ id: 'read', label: '读取资料', status: 'running' as const, startedAt: 301 }], subtasks: [] }
    const projected = projectTimelineMessages(messages, active, 310)
    expect(projected.slice(0, 3)).toEqual(messages)
    expect(projected[3]).toMatchObject({ id: 'stream-run-2', content: '', run: { startedAt: 300, activities: active.activities } })
    expect(messages).toHaveLength(3)
  })

  it('refreshes the current live process while preserving streamed text and attachments', () => {
    const live = { ...assistant('stream-current', 301), content: '正文增量', attachments: [{ name: 'readme.md', path: 'readme.md', content: 'file' }] }
    const active = { id: 'current', startedAt: 300, activities: [], subtasks: [] }
    const result = projectTimelineMessages([user('u2', 299), live], active, 340)
    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({ id: live.id, content: live.content, attachments: live.attachments, run: { startedAt: 300, durationMs: 40 } })
    expect(live.run).toBe(run)
  })

  it('never mixes tools from another run or child transcript into an older reply', () => {
    const tools: ToolCallRecord[] = [
      { id: 'old', tool: 'read', status: 'ok', createdAt: 99 },
      { id: 'own', tool: 'read', status: 'ok', createdAt: 100 },
      { id: 'child', tool: 'read', status: 'ok', createdAt: 120, subtaskId: 'child' },
      { id: 'end', tool: 'write', status: 'failed', createdAt: 200 },
      { id: 'next', tool: 'execute', status: 'running', createdAt: 201 },
    ]
    expect(toolsForRun(tools, run).map(tool => tool.id)).toEqual(['own', 'end'])
    expect(toolsForRun(tools, undefined)).toEqual([])
  })

  it('counts only completed operations, not running, stopped or timed-out subtasks', () => {
    const summary = { ...run, activities: [{ id: 'done', label: '完成', status: 'completed' as const, startedAt: 100 }, { id: 'live', label: '运行', status: 'running' as const, startedAt: 101 }], subtasks: ['completed', 'stopped', 'timed_out', 'running'].map((status, index) => ({ id: String(index), parentToolCallId: 'call', role: 'tester' as const, task: 'test', status, createdAt: 1, activities: [] })) } as HarnessRunSummary
    expect(completedOperationCount(summary)).toBe(2)
  })

  it('builds question anchors and merges a complete reply with its current stream in the same turn', () => {
    const messages = [user('u1', 90), assistant('a1', 201), user('u2', 299), { ...assistant('stream-b', 301), content: '' }]
    const turns = buildConversationTurns(messages)
    expect(turns.map(turn => turn.id)).toEqual(['u1', 'u2'])
    expect(turns[0]).toMatchObject({ prompt: '问题 u1', response: '回复 a1', running: false })
    expect(turns[1]).toMatchObject({ response: '', running: true })
  })
})
