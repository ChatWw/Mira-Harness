/* Hook event/configuration semantics adapted from ZCode hooks.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { createHash, randomUUID } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { MIRA_HOOK_DEFAULT_TIMEOUT, MIRA_HOOK_EVENTS, type MiraHookConfig, type MiraHookDelete, type MiraHookEnabled, type MiraHookItem, type MiraHookEditableScope, type MiraHookWrite } from '../../src/config/miraHooks'
import type { MiraPluginHookInput } from '../../src/config/miraPlugins'
import type { MiraPaths } from './miraPaths'

const FILE_LIMIT = 256 * 1024
const COUNT_LIMIT = 128
const TRUST_LIMIT = 4096
const CONFLICT = 'Hook 已移除或已被修改，请刷新后重试'
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
type Row = Required<Pick<MiraHookConfig, 'name' | 'event' | 'type' | 'command' | 'args' | 'async' | 'timeout' | 'enabled'>> & Omit<MiraHookConfig, 'name' | 'event' | 'type' | 'command' | 'args' | 'async' | 'timeout' | 'enabled'> & { id: string; createdAt: number; updatedAt: number }
type Root = { base: string; path: string; scope: MiraHookEditableScope }
type Snapshot = { source?: string; rows: Row[] }
const rowKeys = new Set(['id', 'name', 'event', 'type', 'command', 'args', 'async', 'shell', 'statusMessage', 'timeout', 'custom', 'matcher', 'enabled', 'createdAt', 'updatedAt'])

function stat(path: string) {
  try { return lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
}
function checked(base: string, path: string) {
  const target = resolve(path), child = relative(base, target)
  if (child === '..' || child.startsWith(`..${sep}`) || child.startsWith(sep)) throw new Error('Hook 路径超出所属目录')
  let current = base
  if (stat(current)?.isSymbolicLink()) throw new Error('Hook 路径不能经过符号链接')
  for (const segment of child.split(sep).filter(Boolean)) {
    current = join(current, segment)
    if (stat(current)?.isSymbolicLink()) throw new Error('Hook 路径不能经过符号链接')
  }
  return target
}
function read(base: string, path: string, limit = FILE_LIMIT): string | undefined {
  const target = checked(base, path)
  if (!stat(target)) return
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = fstatSync(fd)
    if (!info.isFile() || info.size > limit) throw new Error('Hook 配置文件无效或超过大小限制')
    const source = readFileSync(fd, 'utf8')
    if (Buffer.byteLength(source) > limit) throw new Error('Hook 配置文件超过大小限制')
    return source
  } finally { closeSync(fd) }
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function text(value: unknown, label: string, limit: number, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > limit || value.includes('\0')) throw new Error(`Hook ${label}无效`)
  return value
}
function configuration(input: MiraHookConfig): Omit<Row, 'id' | 'createdAt' | 'updatedAt'> {
  if (!object(input)) throw new Error('Hook 配置无效')
  const name = text(input.name, '名称', 120).trim(), command = text(input.command, '命令', 8192)
  if (!MIRA_HOOK_EVENTS.includes(input.event) || !['command', 'process'].includes(input.type)) throw new Error('Hook 事件或执行类型无效')
  const timeout = input.timeout === undefined ? MIRA_HOOK_DEFAULT_TIMEOUT : input.timeout
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600) throw new Error('Hook 超时需要 1 至 600 秒的整数')
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean' || input.async !== undefined && typeof input.async !== 'boolean') throw new Error('Hook 启用或异步状态无效')
  if (input.args !== undefined && (!Array.isArray(input.args) || input.args.length > 128)) throw new Error('Hook 参数无效或超过 128 项')
  const args = (input.args ?? []).map(value => text(value, '参数', 8192, true))
  if (Buffer.byteLength(JSON.stringify(args)) > 32 * 1024) throw new Error('Hook 参数超过大小限制')
  if (input.shell !== undefined && input.shell !== true && (typeof input.shell !== 'string' || !input.shell.trim() || input.shell.length > 1024 || input.shell.includes('\0'))) throw new Error('Hook Shell 无效')
  let custom: Record<string, unknown> | undefined
  if (input.custom !== undefined) {
    if (!object(input.custom)) throw new Error('Hook 自定义参数需要 JSON 对象')
    let source: string
    try { source = JSON.stringify(input.custom) } catch { throw new Error('Hook 自定义参数需要有效 JSON') }
    if (Buffer.byteLength(source) > 8192) throw new Error('Hook 自定义参数超过 8KB')
    const visit = (value: unknown, depth: number): void => {
      if (depth > 8) throw new Error('Hook 自定义参数层级超过限制')
      if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)) return
      if (Array.isArray(value)) { value.forEach(child => visit(child, depth + 1)); return }
      if (object(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) { Object.values(value).forEach(child => visit(child, depth + 1)); return }
      throw new Error('Hook 自定义参数需要有效 JSON')
    }
    visit(input.custom, 0)
    custom = JSON.parse(source)
  }
  return { name, event: input.event, type: input.type, command, args, async: input.async ?? false, timeout, enabled: input.enabled ?? true,
    ...(input.matcher !== undefined ? { matcher: text(input.matcher, '匹配规则', 1024, true) } : {}),
    ...(input.shell !== undefined ? { shell: input.shell } : {}),
    ...(input.statusMessage !== undefined ? { statusMessage: text(input.statusMessage, '状态说明', 256, true) } : {}), ...(custom ? { custom } : {}),
  }
}
function identifier(value: unknown) { return text(value, '标识', 128) }
function revision(row: Row) { return digest(JSON.stringify(row)) }

/** Only an explicit host settings action trusts the current declaration; project files never contain trust. */
export class MiraHookStore {
  constructor(private readonly paths: MiraPaths) {}
  private root(scope: MiraHookEditableScope, directory?: string): Root {
    if (scope !== 'global' && scope !== 'project') throw new Error('Hook 范围无效')
    const base = scope === 'global' ? this.paths.root : directory
    if (!base || !stat(base)?.isDirectory() || stat(base)?.isSymbolicLink()) throw new Error(scope === 'project' ? '请先选择有效项目目录' : 'Mira 用户目录不可用')
    const canonical = realpathSync(base)
    return { base: canonical, scope, path: checked(canonical, scope === 'global' ? join(canonical, 'hooks.json') : join(canonical, '.mira', 'hooks.json')) }
  }
  private snapshot(root: Root): Snapshot {
    const source = read(root.base, root.path)
    if (source === undefined) return { rows: [] }
    try {
      const parsed = JSON.parse(source)
      if (!object(parsed) || parsed.version !== 1 || Object.keys(parsed).some(key => !['version', 'hooks'].includes(key)) || !Array.isArray(parsed.hooks) || parsed.hooks.length > COUNT_LIMIT) throw new Error('格式错误')
      const ids = new Set<string>()
      const rows = parsed.hooks.map((value: unknown): Row => {
        if (!object(value) || Object.keys(value).some(key => !rowKeys.has(key))) throw new Error('条目格式错误')
        const id = identifier(value.id)
        if (ids.has(id) || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt) || (value.createdAt as number) < 0 || (value.updatedAt as number) < (value.createdAt as number)) throw new Error('条目标识或时间错误')
        ids.add(id)
        return { id, ...configuration(value as unknown as MiraHookConfig), createdAt: value.createdAt as number, updatedAt: value.updatedAt as number }
      })
      return { source, rows }
    } catch { throw new Error('Hook 配置文件损坏或无效，请修复后重试；原文件未被覆盖') }
  }
  private trustFile() { const root = this.root('global'); return { base: root.base, path: checked(root.base, join(root.base, 'config', 'hook-trust.json')) } }
  private trustRecords() {
    const file = this.trustFile(), source = read(file.base, file.path, 1024 * 1024)
    if (source === undefined) return { file, source, records: {} as Record<string, string> }
    try {
      const parsed = JSON.parse(source)
      if (!object(parsed) || parsed.version !== 1 || Object.keys(parsed).some(key => !['version', 'records'].includes(key)) || !object(parsed.records) || Object.keys(parsed.records).length > TRUST_LIMIT || Object.entries(parsed.records).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key) || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) throw new Error('格式错误')
      return { file, source, records: parsed.records as Record<string, string> }
    } catch { throw new Error('Hook 信任记录损坏，请修复后重试；原文件未被覆盖') }
  }
  private key(root: Root, row: Row) { return digest(JSON.stringify([root.scope, root.base, row.id])) }
  private item(root: Root, row: Row, records: Record<string, string>): MiraHookItem {
    const trusted = records[this.key(root, row)] === revision(row)
    return { ...row, scope: root.scope, revision: revision(row), sourcePath: root.path, sourceRoot: root.base, trusted, ...(!trusted ? { unavailableReason: '此 Hook 尚未确认信任或内容已变化，请在设置中检查并确认后启用' } : {}) }
  }
  private atomic(base: string, path: string, source: string, expected?: string, limit = FILE_LIMIT) {
    if (Buffer.byteLength(source) > limit) throw new Error('Hook 配置超过大小限制')
    checked(base, path); mkdirSync(dirname(path), { recursive: true }); checked(base, path)
    const temporary = checked(base, join(dirname(path), `.mira-hook-${randomUUID()}.tmp`))
    writeFileSync(temporary, source, { flag: 'wx', mode: 0o600 })
    try {
      if (read(base, path, limit) !== expected) throw new Error(CONFLICT)
      renameSync(temporary, checked(base, path))
    } finally { if (stat(temporary)) unlinkSync(temporary) }
  }
  private commit(root: Root, snapshot: Snapshot, rows: Row[], trusted?: Row, removed?: Row) {
    const trust = this.trustRecords(), records = { ...trust.records }
    if (trusted) records[this.key(root, trusted)] = revision(trusted)
    if (removed) delete records[this.key(root, removed)]
    if (Object.keys(records).length > TRUST_LIMIT) throw new Error('Hook 信任记录超过限制')
    const next = JSON.stringify({ version: 1, hooks: rows }, null, 2) + '\n'
    if (Buffer.byteLength(next) > FILE_LIMIT) throw new Error('Hook 配置超过大小限制')
    // Write declaration first; a failed trust write leaves it safely unavailable, never implicitly executable.
    this.atomic(root.base, root.path, next, snapshot.source)
    this.atomic(trust.file.base, trust.file.path, JSON.stringify({ version: 1, records }, null, 2) + '\n', trust.source, 1024 * 1024)
    return records
  }
  list(directory?: string): MiraHookItem[] {
    const roots = [...(directory ? [this.root('project', directory)] : []), this.root('global')]
    const snapshots = roots.map(root => ({ root, snapshot: this.snapshot(root) }))
    if (!snapshots.some(({ snapshot }) => snapshot.rows.length)) return []
    const records = this.trustRecords().records
    return snapshots.flatMap(({ root, snapshot }) => snapshot.rows.map(row => this.item(root, row, records)))
  }
  save(input: MiraHookWrite, directory?: string): MiraHookItem {
    const config = configuration(input), root = this.root(input.scope, directory), snapshot = this.snapshot(root)
    const existing = input.id ? snapshot.rows.find(row => row.id === identifier(input.id)) : undefined
    if (input.id && !existing || !existing && input.expectedRevision !== undefined || existing && revision(existing) !== input.expectedRevision) throw new Error(CONFLICT)
    if (!existing && snapshot.rows.length >= COUNT_LIMIT) throw new Error('每个 Hook 范围最多支持 128 项')
    const now = Math.max(Date.now(), existing ? existing.updatedAt + 1 : 0)
    const row: Row = { id: existing?.id ?? randomUUID(), ...config, createdAt: existing?.createdAt ?? now, updatedAt: now }
    const rows = existing ? snapshot.rows.map(value => value.id === row.id ? row : value) : [...snapshot.rows, row]
    return this.item(root, row, this.commit(root, snapshot, rows, row))
  }
  private current(input: MiraHookDelete, directory?: string) {
    const root = this.root(input.scope, directory), snapshot = this.snapshot(root), id = identifier(input.id)
    const row = snapshot.rows.find(value => value.id === id)
    if (!row || typeof input.expectedRevision !== 'string' || revision(row) !== input.expectedRevision) throw new Error(CONFLICT)
    return { root, snapshot, row }
  }
  delete(input: MiraHookDelete, directory?: string) {
    const { root, snapshot, row } = this.current(input, directory)
    this.trustRecords() // A damaged host record must not silently erase declarations.
    const trash = checked(root.base, root.scope === 'global' ? join(root.base, 'trash', 'hooks') : join(root.base, '.mira', 'trash', 'hooks'))
    mkdirSync(trash, { recursive: true })
    writeFileSync(checked(root.base, join(trash, `${Date.now()}-${randomUUID()}.json`)), snapshot.source!, { flag: 'wx', mode: 0o600 })
    this.commit(root, snapshot, snapshot.rows.filter(value => value.id !== row.id), undefined, row)
  }
  setEnabled(input: MiraHookEnabled, directory?: string): MiraHookItem {
    if (typeof input.enabled !== 'boolean') throw new Error('Hook 启用状态无效')
    const { row } = this.current(input, directory)
    return this.save({ ...row, scope: input.scope, enabled: input.enabled, expectedRevision: input.expectedRevision }, directory)
  }
  trust(input: MiraHookDelete, directory?: string): MiraHookItem {
    const { root, snapshot, row } = this.current(input, directory), trust = this.trustRecords()
    const records = { ...trust.records, [this.key(root, row)]: revision(row) }
    if (Object.keys(records).length > TRUST_LIMIT) throw new Error('Hook 信任记录超过限制')
    if (read(root.base, root.path) !== snapshot.source) throw new Error(CONFLICT)
    this.atomic(trust.file.base, trust.file.path, JSON.stringify({ version: 1, records }, null, 2) + '\n', trust.source, 1024 * 1024)
    return this.item(root, row, records)
  }
  assert(accepted: MiraHookItem, directory?: string): void {
    if (accepted.scope === 'plugin') throw new Error('Hook 插件声明需要重新校验插件来源')
    const { root, row } = this.current({ scope: accepted.scope, id: accepted.id, expectedRevision: accepted.revision }, directory)
    const current = this.item(root, row, this.trustRecords().records)
    if (!current.enabled || !current.trusted || JSON.stringify(current) !== JSON.stringify(accepted)) throw new Error('Hook 已禁用、来源或信任状态已变化，请重新读取后重试')
  }
  private pluginKey(hook: MiraPluginHookInput) { return digest(JSON.stringify(['plugin', hook.pluginId, hook.sourceRoot, hook.id])) }
  pluginItem(hook: MiraPluginHookInput): MiraHookItem {
    const trusted = this.trustRecords().records[this.pluginKey(hook)] === hook.revision
    const root = this.root('global')
    return { ...hook, scope: 'plugin', createdAt: 0, updatedAt: 0, trusted,
      sourcePath: join(hook.sourceRoot, hook.sourcePath),
      pluginDataPath: checked(root.base, join(root.base, 'plugin-data', digest(hook.pluginId))),
      ...(!hook.unavailableReason && !trusted ? { unavailableReason: '此 Hook 尚未确认信任或内容已变化，请在设置中检查并确认后启用' } : {}),
    }
  }
  /** Store approval separately: third-party declarations are never edited or copied. */
  trustPlugin(hook: MiraPluginHookInput, expectedRevision: string, trusted: boolean): MiraHookItem {
    if (hook.revision !== expectedRevision) throw new Error(CONFLICT)
    if (trusted && (!hook.enabled || hook.unavailableReason)) throw new Error('Hook 插件已停用或声明不可用，请刷新后重试')
    const trust = this.trustRecords(), records = { ...trust.records }, key = this.pluginKey(hook)
    if (trusted) records[key] = hook.revision
    else delete records[key]
    if (Object.keys(records).length > TRUST_LIMIT) throw new Error('Hook 信任记录超过限制')
    this.atomic(trust.file.base, trust.file.path, JSON.stringify({ version: 1, records }, null, 2) + '\n', trust.source, 1024 * 1024)
    return this.pluginItem(hook)
  }
  assertPlugin(accepted: MiraHookItem, hook: MiraPluginHookInput): void {
    const current = this.pluginItem(hook)
    if (!current.enabled || !current.trusted || JSON.stringify(current) !== JSON.stringify(accepted)) throw new Error('Hook 已禁用、来源或信任状态已变化，请重新读取后重试')
  }
}
