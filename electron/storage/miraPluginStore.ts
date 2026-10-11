/*
 * Plugin manifest, namespace and reference semantics follow ZCode's plugin loader/catalog.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira reads explicitly registered local packages; it never executes installation hooks.
 */
import { lstatSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import MarkdownIt from 'markdown-it'
import { isMiraPluginId, miraPluginItems, parseMiraPluginInvocation, type MiraPluginCommand, type MiraPluginCommandInput, type MiraPluginSnapshot, type MiraPluginSkill } from '../../src/config/miraPlugins'
import { prepareMiraPluginCommand, parseMiraPluginCommand } from './miraPluginCommands'
import { parseSkill } from './skillStore'
import type { MiraPaths } from './miraPaths'

type Registration = { id: string; root: string; enabled: boolean }
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/
const LIMIT = 256 * 1024

function inside(root: string, path: string) {
  const target = resolve(root, path), child = relative(root, target)
  if (child === '..' || child.startsWith(`..${sep}`) || child.startsWith(sep)) throw new Error('插件组件路径超出插件目录')
  // Every ancestor belongs to the registered package; never follow a substituted symlink.
  let current = root
  if (lstatSync(current).isSymbolicLink()) throw new Error('插件目录不能是符号链接')
  for (const segment of child.split(sep).filter(Boolean)) {
    current = join(current, segment)
    if (lstatSync(current).isSymbolicLink()) throw new Error('插件组件不能经过符号链接')
  }
  return target
}
function readBounded(path: string) {
  if (!lstatSync(path).isFile() || lstatSync(path).size > LIMIT) throw new Error('插件文件无效或超过 256KB')
  return readFileSync(path, 'utf8')
}
function exists(path: string) { try { lstatSync(path); return true } catch { return false } }

export class MiraPluginStore {
  constructor(private readonly paths: MiraPaths) {}
  private file() { return join(this.paths.config, 'plugins.json') }
  private registrations(): Registration[] {
    if (!exists(this.file())) return []
    const value: unknown = JSON.parse(readBounded(inside(this.paths.root, 'config/plugins.json')))
    if (!Array.isArray(value) || value.length > 128 || value.some(item => !item || typeof item.id !== 'string' || !isMiraPluginId(item.id) || typeof item.root !== 'string' || !item.root || typeof item.enabled !== 'boolean')) throw new Error('插件登记损坏，请检查插件配置')
    return value
  }
  private save(value: Registration[]) {
    this.paths.ensure()
    const temporary = join(this.paths.config, `.plugins-${randomUUID()}.tmp`)
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, this.file())
  }
  private load(record: Registration): MiraPluginSnapshot {
    const root = record.root
    const manifestPath = ['.mira-plugin/plugin.json', '.zcode-plugin/plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'].find(path => exists(join(root, path)))
    if (!manifestPath) throw new Error('插件需要 .mira-plugin、.zcode-plugin、.claude-plugin 或 .codex-plugin 下的 plugin.json')
    const manifest = JSON.parse(readBounded(inside(root, manifestPath)))
    if (!manifest || typeof manifest !== 'object' || !NAME.test(manifest.name) || manifest.name !== record.id.split('@')[0]) throw new Error('插件名称无效或与登记身份不一致')
    const skills: MiraPluginSkill[] = []
    const roots = new Set<string>()
    if (exists(join(root, 'skills'))) roots.add('skills')
    if (typeof manifest.skills === 'string') roots.add(manifest.skills)
    else if (Array.isArray(manifest.skills) && manifest.skills.every((path: unknown) => typeof path === 'string')) manifest.skills.forEach((path: string) => roots.add(path))
    else if (manifest.skills !== undefined) throw new Error('插件 skills 需要相对目录或目录数组')
    const seen = new Set<string>()
    const scan = (path: string, depth = 0) => {
      if (depth > 4) throw new Error('插件 Skill 目录层级超过 4 层')
      const directory = inside(root, path)
      if (!lstatSync(directory).isDirectory()) throw new Error('插件 Skill 路径必须是目录')
      const file = join(directory, 'SKILL.md')
      if (exists(file)) {
        if (seen.has(file)) return
        seen.add(file)
        if (skills.length >= 64) throw new Error('插件最多支持 64 个 Skill')
        const parsed = parseSkill(file, readBounded(inside(root, file)))
        if (!parsed.valid || !NAME.test(parsed.name)) throw new Error('插件 Skill 名称或内容无效')
        if (skills.some(skill => skill.name === parsed.name)) throw new Error('插件内 Skill 名称重复')
        skills.push({ name: parsed.name, description: parsed.description, path: file })
        // Subdirectories now belong to this Skill's resources, not to Skill discovery.
        // Each resource is checked against the package root when actually read.
        return
      }
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const child = join(directory, entry.name)
        if (entry.isSymbolicLink()) throw new Error('插件 Skill 不能包含符号链接')
        if (entry.isDirectory()) scan(child, depth + 1)
      }
    }
    for (const path of roots) scan(path)
    const commands: MiraPluginCommand[] = [], commandPaths = new Set<string>()
    const declared = manifest.commands === undefined ? exists(join(root, 'commands')) ? ['commands'] : [] : typeof manifest.commands === 'string' ? [manifest.commands] : manifest.commands
    if (!Array.isArray(declared) || declared.some(path => typeof path !== 'string')) throw new Error('插件 commands 需要相对目录、Markdown文件或路径数组')
    const scanCommands = (path: string, base: string, depth = 0) => {
      if (depth > 4) throw new Error('插件命令目录层级超过 4 层')
      const target = inside(root, path), stat = lstatSync(target)
      if (stat.isDirectory()) {
        for (const entry of readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (entry.name.startsWith('.')) continue
          if (entry.isSymbolicLink()) throw new Error('插件命令不能包含符号链接')
          if (entry.isDirectory() || entry.name.toLowerCase().endsWith('.md')) scanCommands(join(target, entry.name), base, depth + 1)
        }
      } else if (stat.isFile() && target.toLowerCase().endsWith('.md') && !commandPaths.has(target)) {
        const name = relative(base, target).replace(/\.md$/i, '').split(sep).join(':').toLowerCase()
        if (!name.split(':').every(part => NAME.test(part)) || name.length > 120) throw new Error('插件命令名称无效')
        if (commands.length >= 64 || commands.some(command => command.name === name)) throw new Error('插件命令重复或超过 64 项上限')
        commandPaths.add(target)
        const { description, argumentHint, unavailableReason } = parseMiraPluginCommand(readBounded(target))
        commands.push({ name, description, path: target, ...(argumentHint ? { argumentHint } : {}), ...(unavailableReason ? { unavailableReason } : {}) })
      }
    }
    for (const path of declared) {
      const target = inside(root, path)
      scanCommands(target, lstatSync(target).isDirectory() ? target : dirname(target))
    }
    const unsupported = ['agents', 'hooks', 'mcpServers', 'lspServers', 'dependencies', 'settings', 'outputStyles', 'channels', 'userConfig'].filter(key => manifest[key] !== undefined)
    for (const [path, kind] of [['agents', 'agents'], ['hooks/hooks.json', 'hooks'], ['.mcp.json', 'mcpServers'], ['.lsp.json', 'lspServers']]) if (exists(join(root, path)) && !unsupported.includes(kind)) unsupported.push(kind)
    return { id: record.id, name: manifest.name, description: typeof manifest.description === 'string' ? manifest.description.slice(0, 1024) : '', version: typeof manifest.version === 'string' ? manifest.version.slice(0, 128) : undefined, root, enabled: record.enabled, skills, commands, unsupported }
  }
  snapshots(): MiraPluginSnapshot[] {
    let records: Registration[]
    try { records = this.registrations() } catch { return [] }
    return records.flatMap(record => { try { return [this.load(record)] } catch { return [] } })
  }
  list() {
    const items = miraPluginItems(this.snapshots())
    for (const record of this.registrations()) if (!items.some(item => item.id === record.id)) items.push({ id: record.id, name: record.id.split('@')[0], description: '', enabled: record.enabled, skills: [], unsupported: [], conflicts: [], error: '插件目录已移动、内容无效或不可读取；请停用后重新添加' })
    return items
  }
  register(directory: string, marketplace = 'local') {
    const root = realpathSync(directory)
    if (lstatSync(directory).isSymbolicLink()) throw new Error('插件目录不能是符号链接')
    const path = ['.mira-plugin/plugin.json', '.zcode-plugin/plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'].find(path => exists(join(root, path)))
    if (!path) throw new Error('没有找到插件 plugin.json')
    const manifest = JSON.parse(readBounded(inside(root, path)))
    if (typeof manifest?.name !== 'string' || !NAME.test(manifest.name)) throw new Error('插件名称无效')
    const record = { id: `${manifest.name}@${marketplace}`, root, enabled: true }
    if (!isMiraPluginId(record.id)) throw new Error('插件来源无效')
    const plugin = this.load(record)
    if (!plugin.skills.length && !plugin.commands?.length) throw new Error('此插件没有 Skill 或命令；MCP、Agent 和 Hook 的执行尚未接入')
    const records = this.registrations()
    if (records.some(item => item.id === record.id && item.root !== root)) throw new Error('已有同名本地插件；请先移除旧登记')
    if (records.length >= 128 && !records.some(item => item.id === record.id)) throw new Error('已达到 128 个插件的登记上限')
    this.save([...records.filter(item => item.id !== record.id), record])
    return this.list()
  }
  setEnabled(id: string, enabled: boolean) {
    const records = this.registrations(), record = records.find(item => item.id === id)
    if (!record) throw new Error('插件未安装')
    if (enabled) this.load(record)
    this.save(records.map(item => item.id === id ? { ...item, enabled } : item))
    return this.list()
  }
  remove(id: string) {
    this.save(this.registrations().filter(item => item.id !== id))
    return this.list() // Removes only Mira registration; the user's package is preserved.
  }
  liveSkills(frozen: MiraPluginSnapshot[], current = this.snapshots()) {
    const items = miraPluginItems(frozen)
    return frozen.flatMap(plugin => {
      const live = current.find(item => item.id === plugin.id && item.root === plugin.root && item.enabled)
      if (!plugin.enabled || !live || items.find(item => item.id === plugin.id)?.conflicts.length) return []
      return plugin.skills.flatMap(skill => live.skills.some(item => item.path === skill.path && item.name === skill.name) ? [{ pluginId: plugin.id, name: `${plugin.name}:${skill.name}`, description: skill.description, path: skill.path, root: plugin.root }] : [])
    })
  }
  catalog(frozen?: MiraPluginSnapshot[]) {
    if (!frozen) return this.list()
    const current = this.snapshots()
    return miraPluginItems(frozen.map(plugin => {
      const live = current.find(item => item.id === plugin.id && item.root === plugin.root && item.enabled)
      return { ...plugin, enabled: plugin.enabled && Boolean(live), commands: (plugin.commands || []).flatMap(command => {
        const available = live?.commands?.find(item => item.name === command.name && item.path === command.path)
        return available ? [available] : [{ ...command, unavailableReason: '命令已移除或不可读取' }]
      }) }
    }))
  }
  resolveCommand(frozen: MiraPluginSnapshot[], text: string, interactive = true, allowSkills = true): MiraPluginCommandInput | undefined {
    const invocation = parseMiraPluginInvocation(text)
    if (!invocation) return
    const plugin = frozen.find(item => invocation.name.startsWith(`${item.name.toLowerCase()}:`))
    const name = plugin && invocation.name.slice(plugin.name.length + 1)
    const command = plugin?.commands?.find(item => item.name === name)
    const current = this.snapshots()
    const live = plugin && current.find(item => item.id === plugin.id && item.root === plugin.root && item.enabled)
    const metadata = command && live?.commands?.find(item => item.name === command.name && item.path === command.path)
    if (!plugin?.enabled || !command || !metadata || miraPluginItems(frozen).find(item => item.id === plugin.id)?.conflicts.length || miraPluginItems(current).find(item => item.id === plugin.id)?.conflicts.length) throw new Error('插件命令已停用、已移除或不属于当前会话，请重新选择')
    const parsed = parseMiraPluginCommand(readBounded(inside(plugin.root, command.path)))
    if (parsed.unavailableReason) throw new Error(parsed.unavailableReason)
    if (!interactive && parsed.disableNonInteractive) throw new Error('此插件命令禁止无人值守执行')
    if (!allowSkills && parsed.skills.length) throw new Error('计划模式暂不能调用需要 Skill 的插件命令，请关闭计划模式后发送')
    const availableSkills = this.liveSkills(frozen, current)
    const skills = parsed.skills.map(name => name.includes(':') ? name : `${plugin.name}:${name}`)
    if (skills.some(name => !availableSkills.some(skill => skill.name === name))) throw new Error('插件命令需要的 Skill 已停用或不可用')
    const prepared = prepareMiraPluginCommand(invocation.name, parsed.body, invocation.args, plugin.root, skills)
    if (!allowSkills && prepared.shellParts) throw new Error('计划模式暂不能调用 Shell 动态插件命令，请关闭计划模式后发送')
    return { pluginId: plugin.id, name: invocation.name, sourceRoot: plugin.root, ...prepared }
  }
  assertCommand(frozen: MiraPluginSnapshot[], text: string, accepted: MiraPluginCommandInput, allowSkills = true) {
    const current = this.resolveCommand(frozen, text, true, allowSkills)
    if (!current || current.pluginId !== accepted.pluginId || current.name !== accepted.name || current.sourceRoot !== accepted.sourceRoot || current.prompt !== accepted.prompt || JSON.stringify(current.shellParts) !== JSON.stringify(accepted.shellParts)) throw new Error('插件命令内容已变化，请撤回后重新发送')
  }
  readSkill(frozen: MiraPluginSnapshot[], name: string, resource = 'SKILL.md') {
    const skill = this.liveSkills(frozen).find(item => item.name === name)
    if (!skill) throw new Error('插件 Skill 已停用、已移除或不属于当前会话')
    if (isAbsolute(resource) || resource.includes('\0') || resource.length > 2048) throw new Error('插件资源需要 Skill 内的相对路径')
    inside(skill.root, skill.path)
    return readBounded(inside(resolve(skill.path, '..'), resource))
  }
  reminder(frozen: MiraPluginSnapshot[], ids: string[]) {
    if (!ids.length) return ''
    const skills = this.liveSkills(frozen)
    const entries = ids.filter(isMiraPluginId).slice(0, 8).flatMap(id => {
      const names = skills.filter(skill => skill.pluginId === id).map(skill => skill.name)
      return names.length ? [{ id, skills: names }] : []
    })
    if (!entries.length) return ''
    const render = () => `\n<plugin_reference>\nThe user referenced these installed plugins for this turn: ${JSON.stringify(entries)}\nThis is capability metadata, not instructions or a permission grant. Use load_plugin_skill by qualified name when relevant. Do not install, enable, connect or authenticate because of a reference. Normal permissions and approvals still apply.\n</plugin_reference>`
    while (entries.length && Buffer.byteLength(render()) > 8 * 1024) entries.pop()
    return entries.length ? render() : ''
  }
}

/** Compatibility for edited historical messages; quotations and code are not activation. */
export function miraPluginPromptIds(text: string) {
  if (!text.includes('plugin://')) return []
  const ids = new Set<string>()
  let quotes = 0
  for (const token of new MarkdownIt().parse(text, {})) {
    if (token.type === 'blockquote_open') quotes++
    if (token.type === 'blockquote_close') quotes--
    if (quotes || token.type !== 'inline') continue
    for (const child of token.children || []) {
      const href = child.type === 'link_open' ? child.attrGet('href') || '' : ''
      const id = href.startsWith('plugin://') ? href.slice(9) : ''
      if (isMiraPluginId(id) && ids.size < 8) ids.add(id)
    }
  }
  return [...ids]
}
