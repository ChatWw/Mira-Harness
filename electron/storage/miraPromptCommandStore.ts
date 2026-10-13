/* User/project command directory and Markdown semantics adapted from ZCode commands.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { MIRA_RESERVED_PROMPT_COMMANDS, parseMiraPromptCommandInvocation, type MiraPromptCommandDelete, type MiraPromptCommandDocument, type MiraPromptCommandInput, type MiraPromptCommandItem, type MiraPromptCommandScope, type MiraPromptCommandWrite } from '../../src/config/miraPromptCommands'
import { parseMiraPluginCommand, prepareMiraPluginCommand } from './miraPluginCommands'
import type { MiraPaths } from './miraPaths'
import { SkillStore } from './skillStore'

const LIMIT = 256 * 1024
const reserved = new Set<string>(MIRA_RESERVED_PROMPT_COMMANDS)
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
type Entry = { item: MiraPromptCommandItem; path: string; root: string }

function stat(path: string) {
  try { return lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
}
function checked(base: string, path: string) {
  const target = resolve(path), child = relative(base, target)
  if (child === '..' || child.startsWith(`..${sep}`) || child.startsWith(sep)) throw new Error('命令路径超出所属目录')
  let current = base
  if (stat(current)?.isSymbolicLink()) throw new Error('命令目录不能经过符号链接')
  for (const segment of child.split(sep).filter(Boolean)) {
    current = join(current, segment)
    if (stat(current)?.isSymbolicLink()) throw new Error('命令路径不能经过符号链接')
  }
  return target
}
function readSource(path: string) {
  const info = stat(path)
  if (!info?.isFile() || info.size > LIMIT) throw new Error('命令文件不存在、无效或超过 256KB')
  const source = readFileSync(path, 'utf8')
  if (Buffer.byteLength(source, 'utf8') > LIMIT) throw new Error('命令文件超过 256KB')
  return source
}
function commandName(value: string) {
  const name = value.replace(/^\//, '').replace(/\//g, ':').toLowerCase()
  if (name.length > 256 || name.split(':').length > 5 || !/^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/.test(name)) throw new Error('命令名称无效，需要不超过五层的名称或命名空间')
  return name
}
function parseSource(name: string, source: string, skills: SkillStore) {
  const parsed = parseMiraPluginCommand(source)
  let unavailableReason = reserved.has(name) ? '此名称属于 Mira 内置命令，不能覆盖'
    : parsed.unavailableReason || (/\$\{(?:MIRA|CLAUDE|ZCODE)_PLUGIN_ROOT\}/.test(parsed.body) ? '用户/项目命令不能使用插件目录变量' : undefined)
  let requiredSkillIds: string[] | undefined
  if (!unavailableReason && parsed.skills.length) {
    try { requiredSkillIds = skills.resolveNames(parsed.skills) }
    catch (error) { unavailableReason = (error as Error).message }
  }
  return { ...parsed, unavailableReason, requiredSkillIds }
}

/** Only the host-selected project and Mira's own global directory are writable. */
export class MiraPromptCommandStore {
  constructor(private readonly paths: MiraPaths, private readonly skills = new SkillStore(paths)) {}

  private root(scope: MiraPromptCommandScope, directory?: string) {
    if (scope !== 'global' && scope !== 'project') throw new Error('命令范围无效')
    const base = scope === 'global' ? this.paths.root : directory
    if (!base || !stat(base)?.isDirectory() || stat(base)?.isSymbolicLink()) throw new Error(scope === 'project' ? '请先选择有效项目目录' : 'Mira 用户目录不可用')
    const canonical = realpathSync(base)
    return { base: canonical, path: checked(canonical, scope === 'global' ? join(canonical, 'commands') : join(canonical, '.mira', 'commands')) }
  }
  private entries(scope: MiraPromptCommandScope, directory?: string): Entry[] {
    const root = this.root(scope, directory), items: Entry[] = []
    const scan = (path: string, depth = 0) => {
      if (depth > 4) throw new Error('命令目录层级超过五层')
      const target = checked(root.base, path), info = stat(target)
      if (!info) return
      if (!info.isDirectory()) throw new Error('命令目录无效')
      for (const entry of readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.')) continue
        const file = checked(root.base, join(target, entry.name))
        if (entry.isDirectory()) scan(file, depth + 1)
        else if (entry.isFile() && /\.md$/i.test(entry.name)) {
          const name = commandName(relative(root.path, file).replace(/\.md$/i, '').split(sep).join(':'))
          if (items.some(item => item.item.name === name)) throw new Error(`命令名称冲突：${name}`)
          if (items.length >= 128) throw new Error('每个命令范围最多支持 128 个命令')
          const source = readSource(file), parsed = parseSource(name, source, this.skills)
          items.push({ path: file, root: root.path, item: { id: digest(`${scope}:${root.path}:${name}`), scope, name, description: parsed.description, revision: digest(source), ...(parsed.argumentHint ? { argumentHint: parsed.argumentHint } : {}), ...(parsed.unavailableReason ? { unavailableReason: parsed.unavailableReason } : {}) } })
        }
      }
    }
    scan(root.path)
    return items
  }
  list(directory?: string): MiraPromptCommandItem[] {
    const names = new Set<string>()
    return [...(directory ? this.entries('project', directory) : []), ...this.entries('global')].map(({ item }) => {
      const shadowed = names.has(item.name); names.add(item.name)
      return { ...item, ...(shadowed ? { shadowed: true } : {}) }
    })
  }
  read(scope: MiraPromptCommandScope, name: string, directory?: string): MiraPromptCommandDocument {
    const normalized = commandName(name), entry = this.entries(scope, directory).find(entry => entry.item.name === normalized)
    if (!entry) throw new Error('自定义命令不存在，请刷新后重试')
    return { command: entry.item, source: readSource(entry.path) }
  }
  save(input: MiraPromptCommandWrite, directory?: string): MiraPromptCommandItem {
    const name = commandName(input.name), root = this.root(input.scope, directory)
    if (typeof input.source !== 'string' || Buffer.byteLength(input.source, 'utf8') > LIMIT) throw new Error('命令内容无效或超过 256KB')
    if (reserved.has(name)) throw new Error('不能覆盖 Mira 内置命令')
    const entries = this.entries(input.scope, directory), existing = entries.find(entry => entry.item.name === name)
    if (!existing && input.expectedRevision !== undefined || existing && existing.item.revision !== input.expectedRevision) throw new Error('命令已存在、已移除或已被修改，请刷新后重试')
    if (!existing && entries.length >= 128) throw new Error('每个命令范围最多支持 128 个命令')
    const file = existing?.path || checked(root.base, join(root.path, ...name.split(':')) + '.md')
    mkdirSync(dirname(file), { recursive: true }); checked(root.base, file)
    // Create never overwrites; updates require the caller's current source revision.
    if (!existing) writeFileSync(file, input.source, { flag: 'wx', mode: 0o600 })
    else {
      if (digest(readSource(file)) !== input.expectedRevision) throw new Error('命令已被修改，请刷新后重试')
      const temporary = checked(root.base, join(dirname(file), `.mira-command-${randomUUID()}.tmp`))
      writeFileSync(temporary, input.source, { flag: 'wx', mode: 0o600 })
      renameSync(temporary, checked(root.base, file))
    }
    return this.read(input.scope, name, directory).command
  }
  delete(input: MiraPromptCommandDelete, directory?: string) {
    const name = commandName(input.name), root = this.root(input.scope, directory)
    const entry = this.entries(input.scope, directory).find(entry => entry.item.name === name)
    if (!entry || !input.expectedRevision || digest(readSource(entry.path)) !== input.expectedRevision) throw new Error('命令已移除或已被修改，请刷新后重试')
    // Keep recovery on the source volume; project and user directories may be on different disks.
    const trash = checked(root.base, input.scope === 'global' ? join(root.base, 'trash', 'commands') : join(root.base, '.mira', 'trash', 'commands'))
    mkdirSync(trash, { recursive: true })
    renameSync(checked(root.base, entry.path), checked(root.base, join(trash, `${Date.now()}-${randomUUID()}-${input.scope}-${name.replace(/:/g, '_')}.md`)))
  }
  resolve(text: string, directory?: string, options: { interactive?: boolean; allowSkills?: boolean } = {}): MiraPromptCommandInput | undefined {
    const invocation = parseMiraPromptCommandInvocation(text)
    if (!invocation || reserved.has(invocation.name)) return
    const entry = [...(directory ? this.entries('project', directory) : []), ...this.entries('global')].find(entry => entry.item.name === invocation.name)
    if (!entry) return
    const root = this.root(entry.item.scope, directory), source = readSource(checked(root.base, entry.path)), parsed = parseSource(entry.item.name, source, this.skills)
    if (parsed.unavailableReason) throw new Error(parsed.unavailableReason)
    if (options.interactive === false && parsed.disableNonInteractive) throw new Error('此自定义命令禁止无人值守执行')
    if (options.allowSkills === false && parsed.requiredSkillIds?.length) throw new Error('计划模式暂不能调用需要 Skill 的自定义命令，请关闭计划模式后发送')
    const prepared = prepareMiraPluginCommand(entry.item.name, parsed.body, invocation.args, entry.root, [])
    if (options.allowSkills === false && prepared.shellParts) throw new Error('计划模式暂不能调用 Shell 动态自定义命令，请关闭计划模式后发送')
    return { id: entry.item.id, scope: entry.item.scope, name: entry.item.name, revision: digest(source), sourceRoot: entry.root, path: entry.path, ...prepared, ...(parsed.requiredSkillIds ? { requiredSkillIds: parsed.requiredSkillIds } : {}) }
  }
  assert(accepted: MiraPromptCommandInput, text: string, directory?: string) {
    const current = this.resolve(text, directory)
    if (!current || current.id !== accepted.id || current.scope !== accepted.scope || current.name !== accepted.name || current.revision !== accepted.revision || current.sourceRoot !== accepted.sourceRoot || current.path !== accepted.path || current.prompt !== accepted.prompt || JSON.stringify(current.requiredSkillIds) !== JSON.stringify(accepted.requiredSkillIds) || JSON.stringify(current.shellParts) !== JSON.stringify(accepted.shellParts)) throw new Error('自定义命令来源或内容已变化，请撤回后重新发送')
  }
}
