import { describe, expect, it } from 'vitest'
import { createMiraPromptDocument, replaceMiraPromptDocumentRange, serializeMiraPromptDocument, validateMiraPromptDocument, type MiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'
import { miraSkillReference, restoreMiraSkillPromptDocument } from '../apps/harness-react/src/lib/mira-skill-reference'
import { miraAgentReference, restoreMiraAgentReferences } from '../apps/harness-react/src/lib/mira-agent-reference'
import { miraPluginCommandReference, restoreMiraPluginCommand } from '../apps/harness-react/src/lib/mira-plugin-reference'

const reference = { id: 'session-one', kind: 'session' as const, label: '相关对话', value: 'one', text: '用户：完整问题\n助手：实际已读取正文\n'.repeat(500) }

describe('Mira prompt document boundary', () => {
  it('restores only a leading plugin command and preserves argument text and casing across serialization', () => {
    const text = '  /Mira-Review:check:nested "中文 value" $1'
    const restored = restoreMiraPluginCommand(createMiraPromptDocument(text))
    expect(serializeMiraPromptDocument(restored)).toBe(text)
    expect(validateMiraPromptDocument(restored, text)).toEqual(restored)
    expect(restored.parts[1]).toMatchObject({ type: 'reference', reference: { kind: 'command', value: 'mira-review:check:nested' } })
    for (const text of ['Explain /mira-review:check', '`/mira-review:check`', '> /mira-review:check', '/model', '/mira-review:check?bad']) expect(restoreMiraPluginCommand(createMiraPromptDocument(text))).toEqual(createMiraPromptDocument(text))
    expect(() => miraPluginCommandReference('bad args:command')).toThrow('无效')
  })
  it('restores exact built-in agent hints without changing ordinary text, emails or unknown roles', () => {
    const text = 'Ask @reviewer and @explorer，user@reviewer.example @reviewers @unknown; @tester-test'
    const restored = restoreMiraAgentReferences(createMiraPromptDocument(text))
    expect(serializeMiraPromptDocument(restored)).toBe(text)
    expect(restored.parts.flatMap(part => part.type === 'reference' ? [part.reference.value] : [])).toEqual(['reviewer', 'explorer'])
    const reference = miraAgentReference('implementer')
    expect(validateMiraPromptDocument({ version: 1, parts: [{ type: 'reference', reference }] }, '@implementer')).toBeDefined()
  })
  it('restores exact skill identity, escaped labels and a queue whitelist without changing canonical text', () => {
    const skill = miraSkillReference('skill-one', 'Review [中文] \\ exact')
    const text = `Before ${skill.text} after [$Other](mira-skill:other)`
    const restored = restoreMiraSkillPromptDocument(text, ['skill-one'])
    expect(serializeMiraPromptDocument(restored)).toBe(text)
    expect(restored.parts.filter(part => part.type === 'reference')).toEqual([{ type: 'reference', reference: expect.objectContaining({ value: 'skill-one', label: skill.label, text: skill.text }) }])
    expect(restoreMiraSkillPromptDocument(text, []).parts).toEqual([{ type: 'text', text }])
  })

  it('serializes the actual referenced conversation, never the display label', () => {
    const document: MiraPromptDocument = { version: 1, parts: [{ type: 'text', text: '比较\n' }, { type: 'reference', reference }, { type: 'text', text: '\n结论' }] }
    expect(serializeMiraPromptDocument(document)).toBe(`比较\n${reference.text}\n结论`)
    expect(validateMiraPromptDocument(document, serializeMiraPromptDocument(document))).toEqual(document)
  })

  it.each(['', '单行', '\n开头\n\n尾部\n', '\r\n保持原始换行\n\n'])('preserves plain text exactly: %j', text => {
    expect(serializeMiraPromptDocument(createMiraPromptDocument(text))).toBe(text)
  })

  it('restores only metadata whose canonical output matches the current owner draft', () => {
    const document = { version: 1, parts: [{ type: 'reference', reference }] }
    expect(validateMiraPromptDocument(document, '另一份草稿')).toBeUndefined()
    expect(validateMiraPromptDocument(document, reference.text)).toEqual(document)
  })

  it.each([
    { version: 2, parts: [] },
    { version: 1, parts: [], editorState: { root: {} } },
    { version: 1, parts: [{ type: 'text', text: 'safe', html: '<script>bad</script>' }] },
    { version: 1, parts: [{ type: 'reference', reference: { ...reference, kind: 'unknown-plugin' } }] },
    { version: 1, parts: [{ type: 'reference', reference: { ...reference, text: 123 } }] },
    { version: 1, parts: [{ type: 'reference', reference: { ...reference, html: '<img src=x>' } }] },
    { version: 1, parts: [{ type: 'reference', reference: { ...reference, label: '' } }] },
    { version: 1, parts: [{ type: 'text', text: 'x'.repeat(1_048_577) }] },
    { version: 1, parts: Array.from({ length: 2049 }, () => ({ type: 'text', text: '' })) },
  ])('rejects unknown fields, unsupported kinds, invalid payloads and oversized documents', value => {
    expect(validateMiraPromptDocument(value)).toBeUndefined()
  })

  it('returns detached whitelisted reference data', () => {
    const original = { version: 1, parts: [{ type: 'reference', reference: { ...reference } }] }
    const validated = validateMiraPromptDocument(original)!
    original.parts[0].reference.text = 'changed outside the editor'
    expect(serializeMiraPromptDocument(validated)).toBe(reference.text)
  })

  it('replaces a middle token off-screen, merges text and returns the canonical caret', () => {
    const document = createMiraPromptDocument('前文 @rea 尾句')
    const file = { ...reference, id: 'file', kind: 'file' as const, label: 'read.md', value: 'mira-attachment:frozen', text: '@src/read.md' }
    const next = replaceMiraPromptDocumentRange(document, { start: 3, end: 7 }, [{ type: 'reference', reference: file }])!
    expect(next.document.parts).toEqual([{ type: 'text', text: '前文 ' }, { type: 'reference', reference: file }, { type: 'text', text: ' 尾句' }])
    expect(next.range).toEqual({ start: 3 + file.text.length, end: 3 + file.text.length })
    const replaced = replaceMiraPromptDocumentRange(next.document, { start: 4, end: 5 }, [{ type: 'text', text: '新正文' }])!
    expect(replaced.document.parts).toEqual([{ type: 'text', text: '前文 新正文 尾句' }])
    expect(serializeMiraPromptDocument(document)).toBe('前文 @rea 尾句')
  })

  it('snaps a collapsed insertion to the nearest atomic boundary and does not remove a boundary-touching token', () => {
    const doc: MiraPromptDocument = { version: 1, parts: [{ type: 'text', text: 'a' }, { type: 'reference', reference }, { type: 'text', text: 'b' }] }
    const nearStart = replaceMiraPromptDocumentRange(doc, { start: 2, end: 2 }, [{ type: 'text', text: '+' }])!
    expect(serializeMiraPromptDocument(nearStart.document)).toBe(`a+${reference.text}b`)
    const nearEnd = replaceMiraPromptDocumentRange(doc, { start: reference.text.length, end: reference.text.length }, [{ type: 'text', text: '+' }])!
    expect(serializeMiraPromptDocument(nearEnd.document)).toBe(`a${reference.text}+b`)
    const boundary = replaceMiraPromptDocumentRange(doc, { start: 1, end: 0 }, [])!
    expect(serializeMiraPromptDocument(boundary.document)).toBe(`${reference.text}b`)
    expect(boundary.document.parts[0].type).toBe('reference')
  })

  it('rejects an oversized or invalid off-screen replacement without mutating the source', () => {
    const doc = createMiraPromptDocument('keep')
    expect(replaceMiraPromptDocumentRange(doc, { start: 0, end: 0 }, [{ type: 'text', text: 'x'.repeat(1_048_576) }])).toBeUndefined()
    expect(replaceMiraPromptDocumentRange(doc, { start: Number.NaN, end: 1 }, [])).toBeUndefined()
    expect(serializeMiraPromptDocument(doc)).toBe('keep')
  })
})
