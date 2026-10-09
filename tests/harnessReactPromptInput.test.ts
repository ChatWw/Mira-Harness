import { describe, expect, it } from 'vitest'
import { filterMiraSuggestions, findMiraPromptToken, formatMiraConversationReference, insertMiraPromptTrigger, miraPromptReplacementRange, nextMiraSuggestionIndex, replaceMiraPromptRange } from '../apps/harness-react/src/lib/prompt-input-triggers'

describe('Mira composer caret triggers and replacements', () => {
  it('opens @ and slash at the caret without requiring an otherwise empty draft', () => {
    expect(findMiraPromptToken('检查 @README 之后继续', 10)).toEqual({ trigger: '@', query: 'README', start: 3, end: 10 })
    expect(findMiraPromptToken('before /plan after', 12)).toEqual({ trigger: '/', query: 'plan', start: 7, end: 12 })
    expect(findMiraPromptToken('看看@readme', 9)).toEqual({ trigger: '@', query: 'readme', start: 2, end: 9 })
    expect(findMiraPromptToken('用户@例子.公司', 8)).toBeNull()
    expect(findMiraPromptToken('a@example.com', 13)).toBeNull()
    expect(findMiraPromptToken('before /plan', 9, 10)).toBeNull()
  })

  it('inserts a trigger from + without discarding preceding or following text', () => {
    expect(insertMiraPromptTrigger('已有草稿 后续正文', { start: 5, end: 5 }, '/')).toEqual({ text: '已有草稿 /后续正文', caret: 6 })
    expect(insertMiraPromptTrigger('before selected after', { start: 7, end: 15 }, '@')).toEqual({ text: 'before @ after', caret: 8 })
    expect(insertMiraPromptTrigger('前文后文', { start: 2, end: 2 }, '/')).toEqual({ text: '前文 /后文', caret: 4 })
  })

  it('replaces only the current token including a matching suffix after the caret', () => {
    const text = 'before /plan after', token = findMiraPromptToken(text, 10)!
    expect(token.query).toBe('pl')
    expect(replaceMiraPromptRange(text, miraPromptReplacementRange(text, token, ['/plan']), '')).toEqual({ text: 'before  after', caret: 7 })
    const bare = findMiraPromptToken('before /original body', 8)!
    expect(replaceMiraPromptRange('before /original body', miraPromptReplacementRange('before /original body', bare, ['/plan']), '')).toEqual({ text: 'before original body', caret: 7 })
    const completed = findMiraPromptToken('/plan正文', 5)!
    expect(miraPromptReplacementRange('/plan正文', completed, ['/plan'])).toEqual({ start: 0, end: 5 })
  })

  it('normalizes the Chinese skill-trigger aliases and skips disabled keyboard candidates', () => {
    expect(findMiraPromptToken('￥research', 9)?.trigger).toBe('$')
    expect(nextMiraSuggestionIndex(0, -1, [{}, { disabled: true }, {}])).toBe(2)
    expect(nextMiraSuggestionIndex(0, 1, [{}, { disabled: true }, {}])).toBe(2)
    expect(nextMiraSuggestionIndex(0, 1, [{ disabled: true }])).toBe(-1)
    expect(nextMiraSuggestionIndex(0, 1, [])).toBe(-1)
  })

  it('ranks direct and fuzzy candidate matches without mutating the source directory', () => {
    const source = [{ label: 'review' }, { label: '/plan', description: '规划' }, { label: 'read-version' }]
    expect(filterMiraSuggestions(source, 'rev').map(item => item.label)).toEqual(['review', 'read-version'])
    expect(filterMiraSuggestions(source, '规划').map(item => item.label)).toEqual(['/plan'])
    expect(source.map(item => item.label)).toEqual(['review', '/plan', 'read-version'])
  })

  it('uses real visible conversation content and does not leak internal prompt messages', () => {
    expect(formatMiraConversationReference({ title: '资料\n总结', messages: [{ role: 'user', content: '需求' }, { role: 'assistant', content: '结论' }, { role: 'assistant', content: 'private', internal: true }] })).toBe('【引用对话：资料 总结】\n用户：\n需求\n\nMira：\n结论\n【引用结束】\n')
    expect(() => formatMiraConversationReference({ title: 'empty', messages: [] })).toThrow('暂无可引用')
  })
})
