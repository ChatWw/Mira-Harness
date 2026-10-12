/* Saved workflow file codec/store semantics adapted from ZCode saved-workflows.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira: host-injected roots, byte-preserving reads, symlink guards and source CAS. */
import { createHash, randomUUID } from 'node:crypto'
import { constants, closeSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, parse, resolve } from 'node:path'
import { parseDocument, stringify } from 'yaml'
import { validateMiraWorkflowMeta, type MiraWorkflowDocument, type MiraWorkflowEntry, type MiraWorkflowMeta, type MiraWorkflowParsed, type MiraWorkflowPreview, type MiraWorkflowScope, type MiraWorkflowWrite } from '../../src/config/miraWorkflows'

const LIMIT = 256 * 1024, EXTENSION = '.dwf.ts', CONFLICT = '工作流已存在、已移除或已被修改，请刷新后重试'
const hash = (source: string) => createHash('sha256').update(source, 'utf8').digest('hex')
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function parseMiraWorkflowSource(source: string): MiraWorkflowParsed {
  const lines = source.split('\n')
  let start = 0
  while (start < lines.length && !lines[start]!.trim()) start++
  const marker = lines[start]?.trim() === '/* mira-workflow' ? 'mira' : lines[start]?.trim() === '/* zcode-workflow' ? 'zcode' : undefined
  if (!marker) return { ok: false, reason: 'missing_frontmatter', detail: '需要 /* mira-workflow 元数据注释；兼容读取 /* zcode-workflow' }
  let end = start + 1
  while (end < lines.length && lines[end]!.trim() !== '*/') end++
  if (end === lines.length) return { ok: false, reason: 'unterminated_frontmatter', detail: '元数据注释缺少单独一行的 */' }
  let metadata: unknown
  try {
    const yaml = lines.slice(start + 1, end).map(line => line.replace(/\r$/, '')).join('\n')
    if (yaml.includes('*/')) throw new Error('元数据包含提前闭合的注释')
    const doc = parseDocument(yaml)
    if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors, ...doc.warnings].map(error => error.message).join('；'))
    metadata = doc.toJS({ maxAliasCount: 50 })
  } catch (error) { return { ok: false, reason: 'invalid_yaml', detail: errorText(error) } }
  try { validateMiraWorkflowMeta(metadata) }
  catch (error) { return { ok: false, reason: 'invalid_metadata', detail: errorText(error) } }
  return { ok: true, marker, meta: metadata, script: lines.slice(end + 1).join('\n'), bodyLineOffset: end + 1 }
}

export function serializeMiraWorkflowSource(meta: MiraWorkflowMeta, script: string): string {
  validateMiraWorkflowMeta(meta)
  if (typeof script !== 'string' || Buffer.from(script, 'utf8').toString('utf8') !== script) throw new Error('工作流正文需要有效 UTF-8 文本')
  const ordered = { description: meta.description, ...(meta.whenToUse === undefined ? {} : { whenToUse: meta.whenToUse }), ...(meta.args === undefined ? {} : { args: meta.args }) }
  const yaml = stringify(ordered)
  if (yaml.includes('*/')) throw new Error('工作流元数据不能提前闭合注释')
  const source = `/* mira-workflow\n${yaml}*/\n${script}`
  if (Buffer.byteLength(source, 'utf8') > LIMIT) throw new Error('工作流定义超过 256KB')
  return source
}
function stat(path: string) {
  try { return lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
}
/** Inspect every component before reads or writes; never follow a user-created link. */
function checked(path: string) {
  const target = resolve(path), root = parse(target).root
  let current = root
  const segments = target.slice(root.length).split(/[\\/]/).filter(Boolean)
  for (let index = 0; index < segments.length; index++) {
    current = join(current, segments[index]!); const info = stat(current)
    if (info?.isSymbolicLink()) throw new Error('工作流路径不能经过符号链接')
    if (info && index < segments.length - 1 && !info.isDirectory()) throw new Error('工作流目录无效')
  }
  return target
}
function validName(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) || value.endsWith('.')) throw new Error('工作流名称无效')
}
function readSource(path: string): string | undefined {
  const target = checked(path)
  if (!stat(target)) return
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = fstatSync(fd)
    if (!info.isFile() || info.size > LIMIT) throw new Error('工作流文件无效或超过 256KB')
    const bytes = readFileSync(fd)
    if (bytes.length > LIMIT) throw new Error('工作流定义超过 256KB')
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
    catch { throw new Error('工作流文件需要有效 UTF-8 文本') }
  } finally { closeSync(fd) }
}
function document(name: string, scope: MiraWorkflowScope, path: string, source: string): MiraWorkflowDocument {
  const parsed = parseMiraWorkflowSource(source)
  if (parsed.ok === false) throw new Error(`工作流定义损坏（${parsed.reason}）：${parsed.detail}`)
  return { name, scope, path, source, sourceHash: hash(source), revision: hash(source), meta: parsed.meta, script: parsed.script, bodyLineOffset: parsed.bodyLineOffset, marker: parsed.marker }
}

/** Roots are workflow directories selected by the host, never renderer-provided file paths.
 * Definition existence grants no execution or trust. No read operation creates directories. */
export class MiraWorkflowDefinitions {
  private readonly roots: { globalRoot: string; projectRoot?: string }
  constructor(roots: { globalRoot: string; projectRoot?: string }) { this.roots = { ...roots } }
  private root(scope: MiraWorkflowScope) {
    if (scope !== 'global' && scope !== 'project') throw new Error('工作流范围无效')
    const value = scope === 'global' ? this.roots.globalRoot : this.roots.projectRoot
    if (!value) throw new Error(scope === 'project' ? '工作流项目目录未由宿主选定' : '工作流全局目录不可用')
    if (!isAbsolute(value)) throw new Error('工作流目录需要宿主指定的绝对路径')
    const path = checked(value), info = stat(path)
    if (info && !info.isDirectory()) throw new Error('工作流目录无效')
    return path
  }
  private path(scope: MiraWorkflowScope, name: string) { validName(name); return checked(join(this.root(scope), name + EXTENSION)) }
  list(scope?: MiraWorkflowScope): MiraWorkflowEntry[] {
    const scopes: MiraWorkflowScope[] = scope ? [scope] : this.roots.projectRoot ? ['project', 'global'] : ['global']
    const seen = new Set<string>(), entries: MiraWorkflowEntry[] = []
    for (const current of scopes) {
      const root = this.root(current)
      if (!stat(root)) continue
      for (const file of readdirSync(root).sort()) {
        if (!file.endsWith(EXTENSION)) continue
        const name = file.slice(0, -EXTENSION.length), path = join(root, file)
        const entry: MiraWorkflowEntry = { name, scope: current, path, ...(seen.has(name) ? { shadowed: true } : {}) }; seen.add(name)
        try {
          validName(name); const source = readSource(path)
          if (source === undefined) throw new Error('工作流文件已移除，请刷新后重试')
          entry.revision = hash(source)
          const parsed = parseMiraWorkflowSource(source)
          if (parsed.ok === true) entry.meta = parsed.meta
          else entry.diagnostic = { reason: parsed.reason, detail: parsed.detail }
        } catch (error) { entry.diagnostic = { reason: 'read_error', detail: errorText(error) } }
        entries.push(entry)
      }
    }
    return entries
  }
  read(name: string, scope?: MiraWorkflowScope): MiraWorkflowDocument | undefined {
    validName(name)
    for (const current of scope ? [scope] : this.roots.projectRoot ? ['project', 'global'] as const : ['global'] as const) {
      const path = this.path(current, name), source = readSource(path)
      if (source !== undefined) return document(name, current, path, source)
    }
  }
  preview(input: Omit<MiraWorkflowWrite, 'expectedRevision'>): MiraWorkflowPreview {
    if (Object.keys(input).some(key => !['scope', 'name', 'meta', 'script', 'expectedRevision'].includes(key))) throw new Error('工作流保存包含未知字段')
    const path = this.path(input.scope, input.name), source = serializeMiraWorkflowSource(input.meta, input.script)
    const previous = this.read(input.name, input.scope), other = input.scope === 'project' ? 'global' : 'project'
    const hasOther = (other !== 'project' || this.roots.projectRoot) && Boolean(stat(this.path(other, input.name)))
    return { ...(previous ? { previous } : {}), next: document(input.name, input.scope, path, source), ...(hasOther ? { shadowing: input.scope === 'project' ? 'hides_global' : 'hidden_by_project' } : {}) }
  }
  save(input: MiraWorkflowWrite): MiraWorkflowDocument {
    const preview = this.preview(input), { next, previous } = preview
    if (previous?.revision !== input.expectedRevision) throw new Error(CONFLICT)
    const root = this.root(input.scope)
    mkdirSync(root, { recursive: true }); checked(root)
    const temporary = checked(join(root, `.mira-workflow-${randomUUID()}.tmp`))
    try {
      const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      try { writeFileSync(fd, next.source, 'utf8'); fsyncSync(fd) }
      finally { closeSync(fd) }
      // Re-read immediately before commit: the approved snapshot must still match.
      const current = readSource(next.path)
      if (current !== previous?.source) throw new Error(CONFLICT)
      if (previous) renameSync(temporary, checked(next.path))
      else { try { linkSync(temporary, checked(next.path)) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(CONFLICT); throw error } }
    } finally { if (stat(temporary)) unlinkSync(temporary) }
    return this.read(input.name, input.scope)!
  }
}
