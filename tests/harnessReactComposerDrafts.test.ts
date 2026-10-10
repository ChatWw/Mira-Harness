import { describe, expect, it } from 'vitest'
import { appendComposerReferences, mergeComposerDrafts, readComposerDrafts, serializeComposerDrafts, withoutComposerDraftOwners } from '../apps/harness-react/src/lib/composer-drafts'

describe('React Harness composer draft preferences', () => {
  it('drops only deleted owners after a late saved draft response, including files, recoveries and submissions', () => {
    const intent = { id: 'submission', text: 'old', references: [], selection: { providerId: 'provider', modelId: 'model' }, planning: false }
    const saved = readComposerDrafts({
      drafts: { removed: 'old', retained: 'keep' }, fileDrafts: { removed: [{ path: 'old.md', name: 'old.md' }], retained: [{ path: 'keep.md', name: 'keep.md' }] },
      draft: { id: 'anonymous', groupId: 'research', sessionId: 'removed', visible: false },
      submissions: { removed: intent, retained: { ...intent, id: 'retained-submission' } },
      recoveries: { removed: [{ ...intent, submissionId: intent.id, sessionId: 'removed', permissionMode: 'default', createdAt: 1 }] },
    })
    const restored = withoutComposerDraftOwners(mergeComposerDrafts(saved, readComposerDrafts({}), new Set()), new Set(['removed']))
    expect(restored.drafts).toEqual({ retained: 'keep' }); expect(restored.fileDrafts).toEqual({ retained: [{ path: 'keep.md', name: 'keep.md' }] })
    expect(restored.draft).toBeNull(); expect(restored.recoveries).toEqual({})
    expect(restored.submissions).toEqual({ retained: { ...intent, id: 'retained-submission' } })
    expect(serializeComposerDrafts(restored).draft).toBeNull()
    expect(withoutComposerDraftOwners(saved, new Set(['anonymous'])).draft).toEqual(saved.draft)
  })

  it('round-trips a hidden draft and the independently captured submission placement without private fields', () => {
    const draft = { id: 'draft', groupId: 'current-group', sessionId: 'prepared', visible: false }
    const captured = { id: 'draft', groupId: 'submitted-group', sessionId: 'prepared', visible: false }
    const intent = { id: 'submission', text: '等待原提交确认', references: [], selection: { providerId: 'provider', modelId: 'model' }, planning: false, draft: captured }
    const restored = readComposerDrafts({ drafts: { prepared: intent.text }, draft: { ...draft, privateState: 'private draft' }, submissions: { prepared: { ...intent, draft: { ...captured, credentials: 'private submission' } } } })
    const reloaded = readComposerDrafts(JSON.parse(JSON.stringify(serializeComposerDrafts(restored))))
    expect(reloaded.draft).toEqual(draft); expect(reloaded.submissions).toEqual({ prepared: intent })
    expect(JSON.stringify(reloaded)).not.toContain('private')
  })

  it('omits corrupt draft identities without losing a valid submission intent', () => {
    const intent = { id: 'submission', text: '保留可重试输入', references: [], selection: { providerId: 'provider', modelId: 'model' }, planning: false }
    const invalid = [{}, { id: '' }, { id: '  ' }, { id: 'bad\0id' }, { id: 'x'.repeat(129) }, { id: 'draft', groupId: false }, { id: 'draft', sessionId: '' }, { id: 'draft', visible: 'false' }]
    for (const draft of invalid) {
      const restored = readComposerDrafts({ draft, submissions: { owner: { ...intent, draft } } })
      expect(restored.draft).toBeUndefined(); expect(restored.submissions?.owner).toEqual(intent)
    }
  })

  it('keeps a successful local draft clear against late hydration and restores untouched metadata', () => {
    const saved = readComposerDrafts({ draft: { id: 'draft', groupId: 'research', sessionId: 'prepared' }, drafts: { unrelated: '保持原内容' } })
    const local = { ...readComposerDrafts(null), draft: null }
    const merged = mergeComposerDrafts(saved, local, new Set())
    expect(merged.draft).toBeNull(); expect(merged.drafts).toEqual(saved.drafts)
    expect(readComposerDrafts(JSON.parse(JSON.stringify(serializeComposerDrafts(merged)))).draft).toBeNull()
    expect(readComposerDrafts({ draft: null }).draft).toBeNull()
    expect(mergeComposerDrafts(saved, readComposerDrafts(null), new Set()).draft).toEqual(saved.draft)
  })
  it('restores image metadata and attachment-only intents without putting bytes in preferences', () => {
    const reference = { path: 'mira-attachment:fixture', name: '截图.png', mediaType: 'image/png', size: 70, content: 'PRIVATE IMAGE BYTES' }
    const intent = { id: 'only-image', text: '', references: [reference], selection: { providerId: 'p', modelId: 'm' }, planning: false }
    const restored = serializeComposerDrafts(readComposerDrafts({ fileDrafts: { owner: [reference] }, submissions: { owner: intent, empty: { ...intent, references: [] } } }))
    expect(restored.fileDrafts.owner).toEqual([{ path: reference.path, name: reference.name, mediaType: reference.mediaType, size: reference.size }])
    expect(restored.submissions?.owner?.text).toBe('')
    expect(restored.submissions?.empty).toBeUndefined()
    expect(JSON.stringify(restored)).not.toContain('PRIVATE IMAGE BYTES')
  })
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
    { delivery: 'guide', expectedRunId: 'run', pausedQueueDecision: 'retain', expectedQueueRevision: 1, expectedQueueItemIds: [] },
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
