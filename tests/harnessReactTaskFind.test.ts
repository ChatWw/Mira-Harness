import { describe, expect, it, vi } from 'vitest'
import type { HarnessMessage } from '../src/config/harness'
import { changeFindTargets, createTaskFindProjector, markdownFindText, scheduleTaskFindTargets, streamingMarkdownFindText, taskFindMatches, taskFindOffsets } from '../apps/harness-react/src/lib/conversation-find'
import { miraBrowserPrompt } from '../apps/harness-react/src/lib/mira-browser-reference'
import { createMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'

describe('task find searches displayed task content', () => {
  it('yields through the desktop scheduler and ignores its late continuation after cancellation', async () => {
    let resume: () => void = () => undefined, elapsed = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed++)
    const scheduler = { yield: vi.fn(() => new Promise<void>(resolve => { resume = resolve })) }
    vi.stubGlobal('scheduler', scheduler)
    try {
      const messages = Array.from({ length: 400 }, (_, index) => ({ rendererId: String(index), original: { id: String(index), role: 'user' as const, content: `answer ${index}`, createdAt: index } }))
      const project = vi.fn(createTaskFindProjector()), ready = vi.fn()
      const cancel = scheduleTaskFindTargets(messages, project, ready)
      expect(scheduler.yield).toHaveBeenCalledOnce()
      expect(project.mock.calls.flatMap(([batch]) => batch)).toHaveLength(64)
      cancel(); resume(); await Promise.resolve()
      expect(project.mock.calls.flatMap(([batch]) => batch)).toHaveLength(64)
      expect(ready).not.toHaveBeenCalled()
    } finally { clock.mockRestore(); vi.unstubAllGlobals() }
  })

  it('yields a large history, publishes complete canonical results only, and cancels the pending work', () => {
    vi.useFakeTimers()
    let elapsed = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed++)
    try {
      const messages = Array.from({ length: 400 }, (_, index) => ({ rendererId: String(index), original: { id: String(index), role: 'assistant' as const, content: `**answer** ${index}`, createdAt: index } }))
      const project = vi.fn(createTaskFindProjector()), ready = vi.fn()
      const cancel = scheduleTaskFindTargets(messages, project, ready)
      expect(project.mock.calls.flatMap(([batch]) => batch)).toHaveLength(64)
      expect(ready).not.toHaveBeenCalled()
      cancel(); vi.runAllTimers()
      expect(project.mock.calls.flatMap(([batch]) => batch)).toHaveLength(64)
      expect(ready).not.toHaveBeenCalled()
      project.mockClear()
      scheduleTaskFindTargets(messages, project, ready); vi.runAllTimers()
      expect(ready).toHaveBeenCalledOnce()
      expect(ready.mock.calls[0][0]).toEqual(createTaskFindProjector()(messages))
      expect(taskFindMatches(ready.mock.calls[0][0], 'answer 399')[0].messageId).toBe('399')
    } finally { clock.mockRestore(); vi.clearAllTimers(); vi.useRealTimers() }
  })

  it('matches visible skill and agent labels without indexing hidden reference identities or webpage snapshots', () => {
    const element = { pageUrl: 'https://hidden.example/needle', pageTitle: 'Hidden page', tagName: 'button', role: 'button', accessibleName: 'Hidden element', selector: '#go', xpath: '/html/body/button', text: 'Hidden snapshot', nearbyText: '', htmlExcerpt: '', attributes: '', style: '', rect: { x: 0, y: 0, width: 80, height: 28 } }
    const result = miraBrowserPrompt({ sessionId: 'task', browserId: 'browser:one', element }, createMiraPromptDocument(''))
    if ('error' in result) throw new Error(result.error)
    const original = { id: 'prompt', role: 'user', content: '请 @reviewer 使用 [$Research](mira-skill:research-id)' + result.reference.text } as HarnessMessage
    const targets = createTaskFindProjector()([{ original, rendererId: original.id }])
    expect(targets[0].text).toBe('请 审查 使用 Research')
    expect(taskFindMatches(targets, 'Research')).toHaveLength(1)
    expect(taskFindMatches(targets, '审查')).toHaveLength(1)
    expect(taskFindMatches(targets, 'mira-skill')).toHaveLength(0)
    expect(taskFindMatches(targets, 'Hidden')).toHaveLength(0)
    expect(taskFindMatches(targets, '网页元素快照')).toHaveLength(0)
  })

  it('matches across Markdown formatting but excludes hidden destinations and syntax', () => {
    const text = markdownFindText('A **cross**token [label](https://hidden.invalid/destination) &amp; `code`')
    expect(taskFindOffsets(text, 'crosstoken')).toHaveLength(1)
    expect(taskFindOffsets(text, 'destination')).toHaveLength(0)
    expect(taskFindOffsets(text, '**')).toHaveLength(0)
    expect(taskFindOffsets(text, 'label')).toHaveLength(1)
    expect(taskFindOffsets(text, '&')).toHaveLength(1)
  })

  it('preserves literal backslashes, escaped HTML and full fenced code', () => {
    const text = markdownFindText('```text\n\\* keep <tag> &amp;\n```')
    expect(text).toContain('\\* keep <tag> &amp;')
    expect(taskFindOffsets(text, '<tag>')).toHaveLength(1)
  })

  it('ignores citation controls and image alt text that are not body text nodes', () => {
    const text = markdownFindText('body [1] ![hiddenalt](https://image.invalid)', [{ index: 1, url: 'https://source.invalid', title: 'citation' }])
    expect(text).toContain('body')
    expect(taskFindOffsets(text, '[1]')).toHaveLength(0)
    expect(taskFindOffsets(text, 'hiddenalt')).toHaveLength(0)
  })

  it('uses literal non-overlapping case-insensitive matches and original Unicode offsets', () => {
    expect(taskFindOffsets('aaa a.a A.A', 'a.a')).toEqual([{ start: 4, end: 7 }, { start: 8, end: 11 }])
    expect(taskFindOffsets('aaaaa', 'aa')).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }])
    expect(taskFindOffsets('İ 😀 needle', 'needle')).toEqual([{ start: 5, end: 11 }])
    expect(taskFindOffsets('   ', '  ')).toEqual([])
  })

  it('includes user guides and assistant text parts, excludes reasoning/tool/fallback content', () => {
    const user = { id: 'user', role: 'user', content: 'visible guide', delivery: 'guide' } as HarnessMessage
    const assistant = { id: 'assistant', role: 'assistant', content: 'hidden fallback', parts: [
      { id: 'r', type: 'reasoning', text: 'hidden reasoning' },
      { id: 't', type: 'tool', toolCallId: 'hidden tool' },
      { id: 'text', type: 'text', text: '**visible** answer' },
    ] } as HarnessMessage
    const project = createTaskFindProjector()
    const targets = project([{ rendererId: 'user-renderer', original: user }, { rendererId: 'assistant-renderer', original: assistant }])
    expect(taskFindMatches(targets, 'visible')).toHaveLength(2)
    expect(taskFindMatches(targets, 'hidden')).toHaveLength(0)
    expect(targets.map(target => target.messageId)).toEqual(['user-renderer', 'assistant-renderer'])
    expect(project([{ rendererId: 'assistant-renderer', original: assistant }])[0]).toBe(targets[1])
  })

  it('indexes unmounted messages in canonical order without depending on DOM or changing data', () => {
    const messages = Array.from({ length: 500 }, (_, index) => ({ rendererId: String(index), original: { id: String(index), role: 'user', content: `task-${index}` } as HarnessMessage }))
    const matches = taskFindMatches(createTaskFindProjector()(messages), 'task-250')
    expect(matches).toHaveLength(1)
    expect(matches[0].messageId).toBe('250')
    expect(messages[250].original.content).toBe('task-250')
  })

  it('indexes actual diff text independently of file paths and line numbers', () => {
    const targets = changeFindTargets([{ key: 'change', path: 'hidden-path.ts', tool: 'edit', diff: '@@ -1 +1 @@\n-old needle\n+new needle' } as Parameters<typeof changeFindTargets>[0][number]])
    expect(taskFindMatches(targets, 'needle').map(match => match.changeId)).toEqual(['change', 'change'])
    expect(taskFindMatches(targets, 'hidden-path')).toHaveLength(0)
  })

  it('indexes the repaired streaming display rather than incomplete formatting and GFM checkbox markup', () => {
    expect(streamingMarkdownFindText('**partial')).toBe('partial')
    expect(taskFindOffsets(streamingMarkdownFindText('- [x] task'), '[x]')).toHaveLength(0)
    expect(taskFindOffsets(streamingMarkdownFindText('- [x] task'), 'task')).toHaveLength(1)
    expect(taskFindOffsets(streamingMarkdownFindText('[visible label](https://hidden.invalid)'), 'visible label')).toHaveLength(1)
    expect(taskFindOffsets(streamingMarkdownFindText('[visible label](https://hidden.invalid)'), 'hidden.invalid')).toHaveLength(0)
  })
})
