import { describe, expect, it } from 'vitest'
import type { HarnessMessage } from '../src/config/harness'
import { changeFindTargets, createTaskFindProjector, markdownFindText, streamingMarkdownFindText, taskFindMatches, taskFindOffsets } from '../apps/harness-react/src/lib/conversation-find'

describe('task find searches displayed task content', () => {
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
