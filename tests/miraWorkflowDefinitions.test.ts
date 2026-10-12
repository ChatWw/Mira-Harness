import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiraWorkflowDefinitions, parseMiraWorkflowSource, serializeMiraWorkflowSource } from '../electron/storage/miraWorkflowDefinitions'
import { validateMiraWorkflowArgs, type MiraWorkflowMeta } from '../src/config/miraWorkflows'

const roots: string[] = []
const fault = vi.hoisted(() => ({ afterWrite: undefined as (() => void) | undefined }))
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>()
  return { ...original, writeFileSync: (...args: Parameters<typeof original.writeFileSync>) => { original.writeFileSync(...args); if (typeof args[0] === 'number') fault.afterWrite?.() } }
})
afterEach(() => { fault.afterWrite = undefined; roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mira-workflows-'))); roots.push(home)
  const paths = { globalRoot: join(home, 'global/workflows'), projectRoot: join(home, 'project/.mira/workflows') }
  return { home, paths, store: new MiraWorkflowDefinitions(paths) }
}
const meta: MiraWorkflowMeta = { description: '整理资料', whenToUse: '资料复核', args: { target: { type: 'string', required: true }, count: { type: 'number', default: 3 }, strict: { type: 'boolean', default: false }, data: { type: 'json', default: { items: ['中文', null] } } } }
const input = { scope: 'project' as const, name: 'review', meta, script: '\r\n// 中文\r\nexport default async () => "result";\r\n' }

describe('Mira saved workflow source codec', () => {
  it.each(['mira', 'zcode'] as const)('preserves %s source and script bytes, leading blanks and diagnostic line offsets', marker => {
    const source = `\r\n\r\n/* ${marker}-workflow\r\ndescription: 中文\r\n*/\r\n${input.script}`
    expect(parseMiraWorkflowSource(source)).toEqual({ ok: true, marker, meta: { description: '中文' }, script: input.script, bodyLineOffset: 5 })
    const generated = serializeMiraWorkflowSource(meta, input.script)
    expect(generated.startsWith('/* mira-workflow\n')).toBe(true)
    expect(parseMiraWorkflowSource(generated)).toMatchObject({ ok: true, meta, script: input.script, marker: 'mira' })
    expect(serializeMiraWorkflowSource({ args: meta.args, whenToUse: meta.whenToUse, description: meta.description }, input.script)).toBe(generated)
  })
  it.each([
    ['description: x\nconst x = 1', 'missing_frontmatter'],
    ['/* mira-workflow\ndescription: x', 'unterminated_frontmatter'],
    ['/* mira-workflow\ndescription: [\n*/\ncode', 'invalid_yaml'],
    ['/* mira-workflow\ndescription: x\ndescription: y\n*/\ncode', 'invalid_yaml'],
    ['/* mira-workflow\ndescription: x\nunknown: y\n*/\ncode', 'invalid_metadata'],
    ['/* mira-workflow\ndescription: x\nargs: {count: {type: number, default: wrong}}\n*/\ncode', 'invalid_metadata'],
    ['/* mira-workflow\ndescription: x\nargs: {count: {type: number, extra: wrong}}\n*/\ncode', 'invalid_metadata'],
  ])('reports distinct invalid definition %s', (source, reason) => {
    expect(parseMiraWorkflowSource(source)).toMatchObject({ ok: false, reason })
  })
  it('preserves empty and unterminated final body lines without pretending to compile', () => {
    for (const script of ['', 'export default () => {', 'const x = 1', '\n\n']) expect(parseMiraWorkflowSource(serializeMiraWorkflowSource(meta, script))).toMatchObject({ ok: true, script })
    expect(() => serializeMiraWorkflowSource({ description: 'closes */ comment' }, '')).toThrow('注释')
  })
  it('validates required, defaults, unknown fields and primitive/JSON values without mutating defaults', () => {
    expect(validateMiraWorkflowArgs(meta.args, { target: 'input' })).toEqual({ ok: true, args: { target: 'input', count: 3, strict: false, data: { items: ['中文', null] } } })
    expect(validateMiraWorkflowArgs(meta.args, { count: Infinity, strict: 'yes', extra: 1 })).toEqual({ ok: false, errors: ['未知参数：extra', '缺少必填参数：target', '参数 count 需要 number', '参数 strict 需要 boolean'] })
    expect(validateMiraWorkflowArgs(undefined, { extra: 1 })).toEqual({ ok: false, errors: ['未知参数：extra'] })
    const result = validateMiraWorkflowArgs(meta.args, { target: '' })
    if (result.ok) (result.args.data as { items: unknown[] }).items.push('changed')
    expect(meta.args?.data!.default).toEqual({ items: ['中文', null] })
    expect(validateMiraWorkflowArgs({ data: { type: 'json' } }, { data: null })).toEqual({ ok: true, args: { data: null } })
    for (const data of [undefined, NaN, { invalid: undefined }, new Date(), () => null]) {
      if (data === undefined) continue
      expect(validateMiraWorkflowArgs({ data: { type: 'json' } }, { data })).toMatchObject({ ok: false })
    }
  })
})

describe('Mira workflow definitions with host-injected roots', () => {
  it('reads without creating directories and prefers project while allowing explicit global reads', () => {
    const view = fixture()
    expect(view.store.list()).toEqual([]); expect(view.store.read('review')).toBeUndefined()
    expect(existsSync(view.paths.globalRoot)).toBe(false); expect(existsSync(join(view.home, 'project'))).toBe(false)
    const global = view.store.save({ ...input, scope: 'global', script: 'global-script' })
    const project = view.store.save(input)
    expect(view.store.read('review')).toEqual(project); expect(view.store.read('review', 'global')).toEqual(global)
    expect(view.store.list()).toEqual([expect.objectContaining({ scope: 'project', name: 'review' }), expect.objectContaining({ scope: 'global', name: 'review', shadowed: true })])
    expect(new MiraWorkflowDefinitions(view.paths).read('review')).toEqual(project)
    expect(project.sourceHash).toBe(createHash('sha256').update(project.source).digest('hex')); expect(project.revision).toBe(project.sourceHash)
  })
  it('previews the exact old version and commits only against its source revision, never silently overwriting', () => {
    const view = fixture(), before = view.store.preview(input)
    expect(before.previous).toBeUndefined(); expect(existsSync(view.paths.projectRoot)).toBe(false)
    const created = view.store.save(input), preview = view.store.preview({ ...input, script: 'new body' })
    expect(preview.previous).toEqual(created); expect(preview.next.script).toBe('new body')
    expect(readFileSync(created.path, 'utf8')).toBe(created.source)
    expect(() => view.store.save({ ...input, script: 'new body' })).toThrow('修改')
    const saved = view.store.save({ ...input, script: 'new body', expectedRevision: preview.previous!.revision })
    expect(saved.script).toBe('new body'); expect(saved.revision).not.toBe(created.revision)
    expect(() => view.store.save({ ...input, expectedRevision: created.revision })).toThrow('修改')
    writeFileSync(saved.path, serializeMiraWorkflowSource(meta, 'external'))
    expect(() => view.store.save({ ...input, expectedRevision: saved.revision })).toThrow('修改')
    expect(view.store.read('review')?.script).toBe('external')
    expect(readdirSync(view.paths.projectRoot)).toEqual(['review.dwf.ts'])
  })
  it('rechecks CAS at commit and cleans only its own temporary file on conflict or write failure', () => {
    const view = fixture(), created = view.store.save(input)
    fault.afterWrite = () => writeFileSync(created.path, serializeMiraWorkflowSource(meta, 'changed during commit'))
    expect(() => view.store.save({ ...input, expectedRevision: created.revision })).toThrow('修改')
    expect(view.store.read('review')?.script).toBe('changed during commit')
    const current = view.store.read('review')!
    fault.afterWrite = () => { throw new Error('disk-write-failure') }
    expect(() => view.store.save({ ...input, expectedRevision: current.revision })).toThrow('disk-write-failure')
    expect(view.store.read('review')).toEqual(current); expect(readdirSync(view.paths.projectRoot)).toEqual(['review.dwf.ts'])
  })
  it('never replaces a concurrently created definition during first save', () => {
    const view = fixture(), file = join(view.paths.projectRoot, 'review.dwf.ts')
    fault.afterWrite = () => writeFileSync(file, serializeMiraWorkflowSource(meta, 'other writer'))
    expect(() => view.store.save(input)).toThrow('修改')
    expect(view.store.read('review')?.script).toBe('other writer'); expect(readdirSync(view.paths.projectRoot)).toEqual(['review.dwf.ts'])
  })
  it('keeps compatibility source exact on read and uses Mira marker on subsequent saves', () => {
    const view = fixture(); mkdirSync(view.paths.projectRoot, { recursive: true })
    const source = '\n/* zcode-workflow\ndescription: upstream\n*/\n// preserve\r\nexport default () => 1'
    writeFileSync(join(view.paths.projectRoot, 'review.dwf.ts'), source)
    const doc = view.store.read('review')!
    expect(doc.source).toBe(source); expect(doc.marker).toBe('zcode')
    const saved = view.store.save({ ...input, meta: doc.meta, script: doc.script, expectedRevision: doc.revision })
    expect(saved.marker).toBe('mira'); expect(saved.script).toBe(doc.script)
  })
  it('lists damaged definitions explicitly, blocks overriding them and never falls back past a damaged project name', () => {
    const view = fixture(), global = view.store.save({ ...input, scope: 'global' })
    mkdirSync(view.paths.projectRoot, { recursive: true }); const file = join(view.paths.projectRoot, 'review.dwf.ts')
    writeFileSync(file, 'broken source')
    expect(view.store.list()).toEqual([expect.objectContaining({ name: 'review', diagnostic: { reason: 'missing_frontmatter', detail: expect.any(String) } }), expect.objectContaining({ scope: 'global', shadowed: true })])
    expect(() => view.store.read('review')).toThrow('missing_frontmatter')
    expect(view.store.read('review', 'global')).toEqual(global)
    expect(() => view.store.preview(input)).toThrow('missing_frontmatter'); expect(() => view.store.save(input)).toThrow('missing_frontmatter')
    expect(readFileSync(file, 'utf8')).toBe('broken source')
  })
  it.each(['../outside', 'a/b', 'a\\b', '.', '..', '/absolute', ' a', 'a\0b', 'a'.repeat(65)])('rejects path traversal and invalid name %s without creating roots', name => {
    const view = fixture(); expect(() => view.store.save({ ...input, name })).toThrow('名称')
    expect(() => view.store.read(name)).toThrow('名称'); expect(existsSync(view.paths.projectRoot)).toBe(false)
  })
  it('refuses file/root/intermediate symlinks without touching targets or creating other folders', () => {
    const view = fixture(), external = join(view.home, 'external'); mkdirSync(external)
    const saved = view.store.save(input); rmSync(saved.path); const target = join(external, 'review.dwf.ts'); writeFileSync(target, saved.source); symlinkSync(target, saved.path)
    expect(() => view.store.read('review')).toThrow('符号链接'); expect(() => view.store.save({ ...input, expectedRevision: saved.revision })).toThrow('符号链接')
    expect(readFileSync(target, 'utf8')).toBe(saved.source)
    const linked = join(view.home, 'linked'); symlinkSync(external, linked)
    const hostile = new MiraWorkflowDefinitions({ globalRoot: join(linked, 'nested') })
    expect(() => hostile.list()).toThrow('符号链接'); expect(() => hostile.save({ ...input, scope: 'global' })).toThrow('符号链接'); expect(existsSync(join(external, 'nested'))).toBe(false)
  })
  it('requires a host-selected project root, refuses stale creation and oversized sources', () => {
    const view = fixture(), global = new MiraWorkflowDefinitions({ globalRoot: view.paths.globalRoot })
    expect(() => global.save(input)).toThrow('项目')
    expect(() => view.store.save({ ...input, expectedRevision: 'a'.repeat(64) })).toThrow('修改')
    expect(() => view.store.save({ ...input, script: 'x'.repeat(256 * 1024 + 1) })).toThrow('256KB')
    expect(existsSync(view.paths.projectRoot)).toBe(false)
  })
  it('shows invalid UTF-8 and oversized external files as diagnostics and refuses replacement', () => {
    const view = fixture(); mkdirSync(view.paths.projectRoot, { recursive: true })
    const file = join(view.paths.projectRoot, 'review.dwf.ts')
    for (const bytes of [Buffer.from([0xff, 0xfe]), Buffer.alloc(256 * 1024 + 1, 32)]) {
      writeFileSync(file, bytes)
      expect(view.store.list()[0]!.diagnostic?.reason).toBe('read_error')
      expect(() => view.store.read('review')).toThrow(); expect(() => view.store.save(input)).toThrow()
      expect(readFileSync(file)).toEqual(bytes)
    }
  })
})
