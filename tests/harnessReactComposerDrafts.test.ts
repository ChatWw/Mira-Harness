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
})
