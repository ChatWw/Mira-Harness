import { describe, expect, it } from 'vitest'
import { appendComposerReferences, mergeComposerDrafts, readComposerDrafts, serializeComposerDrafts } from '../apps/harness-react/src/lib/composer-drafts'

describe('React Harness composer draft preferences', () => {
  it('limits accumulated file picker selections without changing the existing draft', () => {
    const existing = Array.from({ length: 8 }, (_, index) => ({ path: `first/${index}.md`, name: `${index}.md` }))
    const selected = Array.from({ length: 8 }, (_, index) => ({ path: `next/${index}.md`, name: `${index}.md` }))
    expect(() => appendComposerReferences(existing, selected)).toThrow('最多引用 12 个文件')
    expect(existing).toHaveLength(8)
    expect(selected).toHaveLength(8)
    expect(appendComposerReferences(existing, selected.slice(0, 4))).toHaveLength(12)
  })

  it('deduplicates both existing and selected paths before applying the limit', () => {
    const existing = Array.from({ length: 12 }, (_, index) => ({ path: `${index}.md`, name: `${index}.md` }))
    expect(appendComposerReferences(existing, [existing[0], existing[0]])).toEqual(existing)
    expect(appendComposerReferences(existing.slice(0, 11), [existing[11], existing[11]])).toEqual(existing)
    expect(appendComposerReferences([], [{ path: 'a/README.md', name: 'README.md' }, { path: 'b/README.md', name: 'README.md' }])).toHaveLength(2)
  })

  it('restores task text, references and explicit draft configuration', () => {
    const saved = {
      drafts: { draft: '  准备下一步\n', session: '继续研究' },
      fileDrafts: { session: [{ path: '/project/README.md', name: 'README.md' }] },
      config: { permission: 'auto-approve', skillIds: ['research'], mcpIds: ['docs'], delegation: false, planning: true, projectId: 'project' },
    }
    expect(readComposerDrafts(saved)).toEqual(saved)
  })

  it('rejects corrupt values, deduplicates references and omits unrelated secret-bearing fields', () => {
    const restored = readComposerDrafts({
      drafts: { valid: '草稿', invalid: { apiKey: 'secret' }, empty: '   ' },
      fileDrafts: { session: [null, { path: '/a', name: 'A', content: 'file contents' }, { path: '/a', name: 'duplicate' }, { path: false, name: 'bad' }] },
      config: { permission: 'unknown', skillIds: ['one', null, 'one', ''], mcpIds: false, delegation: false, planning: 'true', projectId: 7, apiKey: 'secret' },
      providers: [{ apiKey: 'secret' }],
    })
    expect(restored).toEqual({
      drafts: { valid: '草稿' },
      fileDrafts: { session: [{ path: '/a', name: 'A' }] },
      config: { permission: 'default', skillIds: ['one'], mcpIds: [], delegation: false, planning: false },
    })
    expect(JSON.stringify(restored)).not.toContain('secret')
    expect(readComposerDrafts(null)).toEqual(readComposerDrafts([]))
  })

  it('preserves new input and intentional clears when a saved snapshot arrives late', () => {
    const saved = readComposerDrafts({ drafts: { draft: '旧输入', cleared: '旧内容', untouched: '恢复内容' }, fileDrafts: { cleared: [{ path: '/a', name: 'A' }] }, config: { planning: true } })
    const local = { ...readComposerDrafts(null), drafts: { draft: '刚输入的新内容', cleared: '' }, fileDrafts: { cleared: [] } }
    const merged = mergeComposerDrafts(saved, local, new Set())
    expect(merged.drafts).toEqual({ draft: '刚输入的新内容', cleared: '', untouched: '恢复内容' })
    expect(merged.fileDrafts.cleared).toEqual([])
    expect(merged.config.planning).toBe(true)
  })

  it('keeps locally changed config fields while restoring untouched choices', () => {
    const saved = readComposerDrafts({ config: { permission: 'full', planning: true, projectId: 'old', skillIds: ['saved'] } })
    const local = readComposerDrafts({ config: { planning: false, projectId: 'new' } })
    expect(mergeComposerDrafts(saved, local, new Set(['planning', 'projectId'])).config).toEqual({
      permission: 'full', planning: false, projectId: 'new', skillIds: ['saved'], mcpIds: [], delegation: true,
    })
  })

  it('writes only nonempty draft keys while retaining attachment-only drafts', () => {
    const snapshot = { ...readComposerDrafts(null), drafts: { draft: '', done: ' ', pending: '  保留格式\n' }, fileDrafts: { done: [], attachment: [{ path: '/a', name: 'A' }] } }
    const serialized = serializeComposerDrafts(snapshot)
    expect(serialized.drafts).toEqual({ pending: '  保留格式\n' })
    expect(serialized.fileDrafts).toEqual({ attachment: [{ path: '/a', name: 'A' }] })
  })

  it('reports the real host preference size limit rather than silently truncating drafts', () => {
    const snapshot = { ...readComposerDrafts(null), drafts: { draft: 'x'.repeat(262_144) } }
    expect(() => serializeComposerDrafts(snapshot)).toThrow('草稿超过宿主保存上限')
    expect(snapshot.drafts.draft.length).toBe(262_144)
  })

  it('round-trips only the bounded public recovery DTO and keeps session ownership', () => {
    const item = { id: 'withdrawn', submissionId: 'submission', sessionId: 'session', text: '撤回待恢复', references: [{ path: 'README.md', name: 'README.md', content: 'secret file' }], selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'high', apiKey: 'secret key' }, planning: true, permissionMode: 'default', createdAt: 2, provider: { apiKey: 'secret provider' } }
    const restored = readComposerDrafts({ recoveries: { session: [item, item], other: [item], corrupt: [null, { ...item, sessionId: 'corrupt', selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'impossible' } }] } })
    expect(restored.recoveries).toEqual({ session: [{ ...item, references: [{ path: 'README.md', name: 'README.md' }], selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' }, provider: undefined }] })
    expect(JSON.stringify(restored)).not.toContain('secret')
    expect(serializeComposerDrafts(restored).recoveries).toEqual(restored.recoveries)
  })

  it('keeps local recovery clears against delayed preference hydration and enforces the shared size limit', () => {
    const item = { id: 'withdrawn', submissionId: 'submission', sessionId: 'session', text: '撤回待恢复', references: [], selection: { providerId: 'provider', modelId: 'model' }, planning: false, permissionMode: 'default', createdAt: 2 }
    const saved = readComposerDrafts({ recoveries: { session: [item] } })
    const local = { ...readComposerDrafts(null), recoveries: { session: [] } }
    expect(mergeComposerDrafts(saved, local, new Set()).recoveries?.session).toEqual([])
    expect(serializeComposerDrafts(local).recoveries).toBeUndefined()
    const oversized = readComposerDrafts({ recoveries: { session: Array.from({ length: 4 }, (_, index) => ({ ...item, id: `item-${index}`, text: 'x'.repeat(100_000) })) } })
    expect(() => serializeComposerDrafts(oversized)).toThrow('宿主保存上限')
  })

  it('persists only the public submission intent and honors a local successful clear', () => {
    const submission = { id: 'submission', text: '等待确认', references: [{ path: 'README.md', name: 'README.md', content: 'secret file' }], selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium', apiKey: 'secret key' }, planning: false }
    const saved = readComposerDrafts({ submissions: { session: submission, corrupt: { ...submission, id: '', selection: { providerId: 'p', modelId: 'm', thinkingLevel: 'bad' } } } })
    expect(saved.submissions).toEqual({ session: { ...submission, references: [{ path: 'README.md', name: 'README.md' }], selection: { providerId: 'provider', modelId: 'model', thinkingLevel: 'medium' } } })
    expect(JSON.stringify(saved)).not.toContain('secret')
    expect(serializeComposerDrafts(saved).submissions).toEqual(saved.submissions)
    const local = { ...readComposerDrafts(null), submissions: { session: undefined } }
    expect(serializeComposerDrafts(mergeComposerDrafts(saved, local, new Set())).submissions).toBeUndefined()
  })

  it('round-trips atomic delivery and confirmed queue identities without persisting unknown fields', () => {
    const submission = { id: 'atomic', text: '确认后的提交', references: [], selection: { providerId: 'p', modelId: 'm' }, planning: false }
    const options = { delivery: 'immediate', pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: 4, expectedQueueItemIds: ['one', 'two'], secret: 'do not persist' }
    const restored = readComposerDrafts({ submissions: { session: { ...submission, options } } })
    expect(restored.submissions?.session?.options).toEqual({ delivery: 'immediate', pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: 4, expectedQueueItemIds: ['one', 'two'] })
    expect(JSON.stringify(restored)).not.toContain('secret')
    expect(serializeComposerDrafts(restored).submissions).toEqual(restored.submissions)
  })

  it('restores a guide submission without changing its original delivery, run identity or full input', () => {
    const submission = { id: 'guide', text: '指导正文'.repeat(100), references: [{ path: 'notes.md', name: 'notes.md' }], selection: { providerId: 'p', modelId: 'm', thinkingLevel: 'high' }, planning: true, options: { delivery: 'guide', expectedRunId: 'original-run', internalCredential: 'secret' } }
    const restored = readComposerDrafts({ submissions: { session: submission } })
    expect(restored.submissions?.session).toEqual({ ...submission, options: { delivery: 'guide', expectedRunId: 'original-run' } })
    expect(serializeComposerDrafts(restored).submissions).toEqual(restored.submissions)
    expect(JSON.stringify(restored)).not.toContain('secret')
  })

  it.each([
    { delivery: 'guide', expectedRunId: null },
    { delivery: 'guide' },
    { delivery: 'guide', expectedRunId: '' },
    { delivery: 'unknown', expectedRunId: 'run' },
    { delivery: 'immediate' },
    { pausedQueueDecision: 'discard', expectedRunId: null },
    { pausedQueueDecision: 'retain', expectedRunId: null, expectedQueueRevision: -1, expectedQueueItemIds: ['one'] },
    { pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: 1, expectedQueueItemIds: ['one', 'one'] },
    { pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: 1, expectedQueueItemIds: Array.from({ length: 33 }, (_, index) => String(index)) },
    { delivery: 'immediate', expectedRunId: '' },
    false,
  ])('does not restore a submission with corrupt atomic options: %j', options => {
    const submission = { id: 'atomic', text: '不能用错误路由重试', references: [], selection: { providerId: 'p', modelId: 'm' }, planning: false, options }
    expect(readComposerDrafts({ submissions: { session: submission } }).submissions).toBeUndefined()
  })
})
