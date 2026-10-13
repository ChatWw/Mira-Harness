import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertMiraPresentationReferences, miraPresentationWorkspaceIdentity } from '../electron/services/miraPresentationReferences'
import { MiraWorkspaceMedia } from '../electron/services/miraWorkspaceMedia'
import { parseMiraPresentationReferences, readMiraPresentationReference, serializeMiraPresentationReference, type MiraPresentationReference } from '../src/config/miraPresentation'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const digest = (value: string | Buffer) => 'sha256:' + createHash('sha256').update(value).digest('hex')
const owner = { grantId: 'presentation-grant', webContentsId: 17 }
function reference(overrides: Partial<MiraPresentationReference> = {}): MiraPresentationReference {
  return { version: 1, id: 'reference-1', sessionId: 'task-1', workspaceIdentity: digest('workspace'), sourcePath: 'slides.pptx', sourceFingerprint: digest('presentation'),
    element: { slideIndex: 0, slidePart: 'ppt/slides/slide1.xml', nodeId: '2', nodeName: '标题', nodeType: 'shape', text: '原始标题', bounds: { x: 4, y: 7, width: 100, height: 20 }, zIndex: 0 },
    comment: '修改这个标题', capturedAt: 1791792000000, ...overrides }
}
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'mira-presentation-ref-')); roots.push(base)
  const root = join(base, 'workspace'); await mkdir(root)
  const bytes = Buffer.from('original presentation bytes'); await writeFile(join(root, 'slides.pptx'), bytes)
  const media = new MiraWorkspaceMedia(), preview = await media.open(root, 'slides.pptx', owner, () => undefined)
  return { base, root, bytes, media, preview, ref: reference({ sourceFingerprint: preview.sourceFingerprint!, workspaceIdentity: preview.workspaceIdentity! }) }
}
describe('presentation element reference protocol', () => {
  it('roundtrips Unicode/comments with embedded fences and removes only a valid reference block', () => {
    const ref = reference({ comment: '把 ```json 和四个反引号 ```` 保留。', selectedText: '部分文字' })
    const serialized = serializeMiraPresentationReference(ref)
    expect(serialized).toContain('\n`````json\n')
    expect(parseMiraPresentationReferences(`请帮我修改${serialized}保留颜色`)).toEqual({ references: [ref], visibleText: '请帮我修改保留颜色' })
    expect(parseMiraPresentationReferences('  普通正文  \n')).toEqual({ references: [], visibleText: '  普通正文  \n' })
    expect(parseMiraPresentationReferences(`  普通正文  \n${serialized}\n 尾部 `)).toEqual({ references: [ref], visibleText: '  普通正文  \n\n 尾部 ' })
    expect(parseMiraPresentationReferences(serialized)).toEqual({ references: [ref], visibleText: '' })
    expect(parseMiraPresentationReferences(serialized.slice(2, -1))).toEqual({ references: [ref], visibleText: '' })
    expect(parseMiraPresentationReferences([serialized, serializeMiraPresentationReference(reference({ id: 'ref-2' }))].join(''))).toMatchObject({ references: [ref, reference({ id: 'ref-2' })], visibleText: '' })
    expect(readMiraPresentationReference(ref)).toEqual(ref)
  })
  it('leaves malformed JSON, extra fields, array blocks, mismatched fences and non-exact headings visible', () => {
    const block = (json: string) => `演示文稿元素引用：\n\`\`\`json\n${json}\n\`\`\``
    for (const input of [block('{'), block(JSON.stringify({ ...reference(), absolutePath: '/private/user/file' })), block(JSON.stringify([reference()])),
      serializeMiraPresentationReference(reference()).replace(/```\n$/, '````\n'), serializeMiraPresentationReference(reference()).replace('演示文稿元素引用：', '元素引用：')]) {
      expect(parseMiraPresentationReferences(input)).toEqual({ references: [], visibleText: input })
    }
  })
  it('rejects unsafe paths, invalid owners/fingerprints, nested unknown fields and nonfinite geometry', () => {
    for (const sourcePath of ['/slides.pptx', '../slides.pptx', 'a/../slides.pptx', 'a//slides.pptx', 'a\\slides.pptx', 'file:slides.pptx', 'slides.docx']) expect(readMiraPresentationReference(reference({ sourcePath }))).toBeUndefined()
    for (const ref of [reference({ workspaceIdentity: 'hash' }), reference({ sourceFingerprint: 'sha256:' + 'z'.repeat(64) }), reference({ sessionId: '' }), reference({ capturedAt: Number.NaN }),
      { ...reference(), element: { ...reference().element, extra: true } },
      { ...reference(), element: { ...reference().element, bounds: { ...reference().element.bounds, x: Infinity } } },
      { ...reference(), element: { ...reference().element, nodeType: 'table-cell' } }]) expect(readMiraPresentationReference(ref)).toBeUndefined()
  })
  it('returns a nonthrowing limit error with overflow blocks visible and enforces it on host submission', () => {
    const blocks = Array.from({ length: 9 }, (_, index) => serializeMiraPresentationReference(reference({ id: `ref-${index}` })))
    const parsed = parseMiraPresentationReferences(blocks.join('\n\n'))
    expect(parsed.references).toHaveLength(8); expect(parsed.error).toContain('8'); expect(parsed.visibleText).toContain(blocks[8])
    expect(() => assertMiraPresentationReferences(blocks.join('\n'), 'task-1', '/does-not-exist')).toThrow('8')
    const large = reference({ comment: '字'.repeat(4096), selectedText: '字'.repeat(8192), element: { ...reference().element, text: '字'.repeat(8192), nodeName: '字'.repeat(512), nodePath: '字'.repeat(512), nodeId: '字'.repeat(256) } })
    const input = `演示文稿元素引用：\n\`\`\`json\n${JSON.stringify(large)}\n\`\`\``
    expect(parseMiraPresentationReferences(input)).toMatchObject({ references: [], visibleText: input, error: expect.stringContaining('64 KiB') })
    expect(() => serializeMiraPresentationReference(large)).toThrow('64 KiB')
    expect(() => assertMiraPresentationReferences(input, 'task-1', '/does-not-exist')).toThrow('64 KiB')
  })
})
describe('presentation reference host ownership and file versions', () => {
  it('hashes the authorized preview bytes and validates a current reference without disclosing canonical roots', async () => {
    const { root, bytes, preview, ref, media } = await fixture()
    expect(preview.sourceFingerprint).toBe(digest(bytes))
    const canonical = realpathSync(root)
    expect(preview.workspaceIdentity).toBe(miraPresentationWorkspaceIdentity(canonical, lstatSync(canonical, { bigint: true })))
    expect(JSON.stringify(preview)).not.toContain(canonical)
    expect(() => assertMiraPresentationReferences(serializeMiraPresentationReference(ref), 'task-1', root)).not.toThrow()
    await writeFile(join(root, 'note.pdf'), 'pdf')
    const pdf = await media.open(root, 'note.pdf', owner, () => undefined)
    expect(pdf).not.toHaveProperty('sourceFingerprint'); expect(pdf).not.toHaveProperty('workspaceIdentity')
    media.closeAll()
  })
  it('rejects cross-task and cross-workspace quotes, changed bytes and unavailable files with safe messages', async () => {
    const { root, base, bytes, ref } = await fixture(), text = serializeMiraPresentationReference(ref)
    expect(() => assertMiraPresentationReferences(text, 'another-task', root)).toThrow('不属于当前任务')
    expect(() => assertMiraPresentationReferences(text, 'task-1')).toThrow('没有工作目录')
    await mkdir(join(base, 'another')); await writeFile(join(base, 'another/slides.pptx'), bytes)
    expect(() => assertMiraPresentationReferences(text, 'task-1', join(base, 'another'))).toThrow('重新打开并引用')
    await writeFile(join(root, 'slides.pptx'), Buffer.alloc(bytes.length, 42))
    expect(() => assertMiraPresentationReferences(text, 'task-1', root)).toThrow('重新打开并引用')
    await rm(join(root, 'slides.pptx'))
    try { assertMiraPresentationReferences(text, 'task-1', root); throw new Error('expected failure') } catch (error) { expect(String(error)).not.toContain(root) }
  })
  it('rejects a recreated workspace even when all file bytes are identical', async () => {
    const { root, base, bytes, ref } = await fixture()
    await rename(root, join(base, 'old-workspace')); await mkdir(root); await writeFile(join(root, 'slides.pptx'), bytes)
    expect(() => assertMiraPresentationReferences(serializeMiraPresentationReference(ref), 'task-1', root)).toThrow('重新打开并引用')
  })
  it('accepts multiple elements of one file but rejects conflicting versions in that same submission', async () => {
    const { root, ref } = await fixture()
    const second = { ...ref, id: 'reference-2', element: { ...ref.element, nodeId: '3' } }
    expect(() => assertMiraPresentationReferences(serializeMiraPresentationReference(ref) + serializeMiraPresentationReference(second), 'task-1', root)).not.toThrow()
    expect(() => assertMiraPresentationReferences(serializeMiraPresentationReference(ref) + serializeMiraPresentationReference({ ...second, sourceFingerprint: digest('other version') }), 'task-1', root)).toThrow('重新打开并引用')
  })
  it('permits internal symlinks but rejects external symlinks and over-limit files', async () => {
    const { root, base, bytes, media, ref } = await fixture()
    await symlink('slides.pptx', join(root, 'alias.pptx'))
    expect(() => assertMiraPresentationReferences(serializeMiraPresentationReference({ ...ref, sourcePath: 'alias.pptx' }), 'task-1', root)).not.toThrow()
    await writeFile(join(base, 'outside.pptx'), bytes); await symlink(join(base, 'outside.pptx'), join(root, 'external.pptx'))
    expect(() => assertMiraPresentationReferences(serializeMiraPresentationReference({ ...ref, sourcePath: 'external.pptx' }), 'task-1', root)).toThrow('重新打开并引用')
    await truncate(join(root, 'slides.pptx'), 25 * 1024 * 1024 + 1)
    expect(() => assertMiraPresentationReferences(serializeMiraPresentationReference(ref), 'task-1', root)).toThrow('重新打开并引用')
    await expect(media.open(root, 'slides.pptx', owner, () => undefined)).rejects.toThrow('25 MiB')
  })
  it('rechecks authorization after preview hashing, and plain or malformed messages never access a workspace', async () => {
    const { root, media } = await fixture()
    let calls = 0
    await expect(media.open(root, 'slides.pptx', owner, () => { if (++calls > 1) throw new Error('授权已撤回') })).rejects.toThrow('授权已撤回')
    expect(() => assertMiraPresentationReferences('ordinary message', 'task-1', '/missing')).not.toThrow()
    expect(() => assertMiraPresentationReferences('演示文稿元素引用：\n```json\n{}\n```', 'task-1', '/missing')).not.toThrow()
  })
})
