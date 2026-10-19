/*
 * Plugin manifest, namespace and reference semantics follow ZCode's plugin loader/catalog.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira reads explicitly registered local packages; it never executes installation hooks.
 */
import { lstatSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import MarkdownIt from 'markdown-it'
import { miraPluginListing, isMiraPluginId, miraPluginItems, parseMiraPluginInvocation, type MiraPluginAgent, type MiraPluginAgentInput, type MiraPluginCommand, type MiraPluginCommandInput, type MiraPluginHookInput, type MiraPluginSnapshot, type MiraPluginSkill } from '../../src/config/miraPlugins'
import { prepareMiraPluginCommand, parseMiraPluginCommand } from './miraPluginCommands'
import { parseMiraPluginAgent } from './miraPluginAgents'
import { loadMiraPluginMcp, resolveMiraPluginMcp } from './miraPluginMcp'
import { loadMiraPluginHooks } from './miraPluginHooks'
import type { MiraMcpServerConfig } from '../../src/config/miraMcp'
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
  private mcpDeclarations(root: string, id: string, name: string, manifest: Record<string, unknown>, workingDirectory?: string) {
    return loadMiraPluginMcp({ root, id, name, workingDirectory }, manifest, path => {
      const target = resolve(root, path), child = relative(root, target)
      if (child === '..' || child.startsWith(`..${sep}`) || child.startsWith(sep)) throw new Error('插件 MCP 配置路径超出插件目录')
      if (!exists(target)) return undefined
      return readBounded(inside(root, path))
    })
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
    const agents: MiraPluginAgent[] = [], agentPaths = new Set<string>()
    const agentRoots = manifest.agents === undefined ? exists(join(root, 'agents')) ? ['agents'] : [] : typeof manifest.agents === 'string' ? [manifest.agents] : manifest.agents
    if (!Array.isArray(agentRoots) || agentRoots.some(path => typeof path !== 'string')) throw new Error('插件 agents 需要相对目录、Markdown文件或路径数组')
    const scanAgents = (path: string, base: string, depth = 0) => {
      if (depth > 4) throw new Error('插件 Agent 目录层级超过 4 层')
      const target = inside(root, path), stat = lstatSync(target)
      if (stat.isDirectory()) {
        for (const entry of readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (entry.name.startsWith('.')) continue
          if (entry.isSymbolicLink()) throw new Error('插件 Agent 不能包含符号链接')
          if (entry.isDirectory() || entry.name.toLowerCase().endsWith('.md')) scanAgents(join(target, entry.name), base, depth + 1)
        }
      } else if (stat.isFile() && target.toLowerCase().endsWith('.md') && !agentPaths.has(target)) {
        const parsed = parseMiraPluginAgent(readBounded(target))
        const fallback = relative(base, target).replace(/\.md$/i, '').split(sep).join(':')
        const localName = parsed.name || fallback
        if (!localName.split(':').every(part => NAME.test(part)) || localName.length > 120) throw new Error('插件 Agent 名称无效')
        const name = `${manifest.name}:${localName}`
        if (agents.length >= 64 || agents.some(agent => agent.name.toLowerCase() === name.toLowerCase())) throw new Error('插件 Agent 名称重复或超过 64 项上限')
        agentPaths.add(target)
        const { body: _body, name: _name, ...metadata } = parsed
        agents.push({ ...metadata, name, path: target })
      }
    }
    for (const path of agentRoots) {
      const target = inside(root, path)
      scanAgents(target, lstatSync(target).isDirectory() ? target : dirname(target))
    }
    const hookDeclarations = loadMiraPluginHooks({ root, id: record.id, name: manifest.name, manifestPath }, manifest, path => exists(join(root, path)) ? readBounded(inside(root, path)) : undefined)
    const unsupported = ['lspServers', 'dependencies', 'settings', 'outputStyles', 'channels', 'userConfig'].filter(key => manifest[key] !== undefined)
    if (exists(join(root, '.lsp.json')) && !unsupported.includes('lspServers')) unsupported.push('lspServers')
    const mcpServers = this.mcpDeclarations(root, record.id, manifest.name, manifest).map(server => server.descriptor)
    return { ...(miraPluginListing(manifest.listing) ? { listing: miraPluginListing(manifest.listing) } : {}), ...(typeof manifest.miraUnavailableReason === 'string' ? { unavailableReason: manifest.miraUnavailableReason } : {}), id: record.id, name: manifest.name, description: typeof manifest.description === 'string' ? manifest.description.slice(0, 1024) : '', version: typeof manifest.version === 'string' ? manifest.version.slice(0, 128) : undefined, root, enabled: record.enabled, skills, commands, agents, ...(mcpServers.length ? { mcpServers } : {}), ...(hookDeclarations.hooks.length ? { hooks: hookDeclarations.hooks } : {}), ...(hookDeclarations.diagnostics.length ? { hookDiagnostics: hookDeclarations.diagnostics } : {}), unsupported }
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
    if (!plugin.skills.length && !plugin.commands?.length && !plugin.agents?.length && !plugin.mcpServers?.some(server => !server.unavailableReason) && !plugin.hooks?.length) throw new Error(`此插件没有有效 Skill、命令、Agent、MCP 或 Hook${plugin.hookDiagnostics?.length ? `：${plugin.hookDiagnostics.join('；')}` : ''}`)
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
    const current = this.snapshots(), frozenItems = miraPluginItems(frozen), currentItems = miraPluginItems(current)
    return miraPluginItems(frozen.map(plugin => {
      const live = current.find(item => item.id === plugin.id && item.root === plugin.root && item.enabled)
      return { ...plugin, enabled: plugin.enabled && Boolean(live), hooks: plugin.hooks?.map(hook => {
        const available = live?.hooks?.find(item => item.id === hook.id)
        const conflict = frozenItems.find(item => item.id === plugin.id)?.conflicts.length || currentItems.find(item => item.id === plugin.id)?.conflicts.length
        const unavailableReason = conflict ? '插件 Hook 名称冲突，请停用重名插件' : !plugin.enabled || !live || !available ? '插件 Hook 已停用或已移除' : available.revision !== hook.revision ? '插件 Hook 内容已变化，请新建会话后重新启用' : !available.enabled ? '插件 Hook 声明已停用' : available.unavailableReason
        return { ...hook, ...(unavailableReason ? { unavailableReason } : {}) }
      }), mcpServers: plugin.mcpServers?.map(server => {
        const available = live?.mcpServers?.find(item => item.id === server.id && item.key === server.key)
        const conflict = frozenItems.find(item => item.id === plugin.id)?.conflicts.length || currentItems.find(item => item.id === plugin.id)?.conflicts.length
        const unavailableReason = conflict ? '插件 MCP 名称冲突，请停用重名插件' : !plugin.enabled || !live || !available ? '插件 MCP 已停用或已移除' : available.revision !== server.revision ? '插件 MCP 内容已变化，请新建会话后重新选择' : available.unavailableReason || server.unavailableReason || (!available.enabled ? '插件 MCP 已停用或已移除' : undefined)
        return { ...server, ...(unavailableReason ? { unavailableReason } : {}) }
      }), agents: (plugin.agents || []).map(agent => {
        const available = live?.agents?.find(item => item.name === agent.name && item.path === agent.path)
        return available || { ...agent, unavailableReason: 'Agent 已移除或不可读取' }
      }), commands: (plugin.commands || []).flatMap(command => {
        const available = live?.commands?.find(item => item.name === command.name && item.path === command.path)
        return available ? [available] : [{ ...command, unavailableReason: '命令已移除或不可读取' }]
      }) }
    }))
  }
  resolveMcp(frozen: MiraPluginSnapshot[], workingDirectory?: string): MiraMcpServerConfig[] {
    const current = this.snapshots(), declarations = new Map<string, ReturnType<typeof loadMiraPluginMcp>>()
    return frozen.flatMap(plugin => (plugin.mcpServers || []).flatMap(server => {
      if (!plugin.enabled || !server.enabled || server.unavailableReason) return []
      try { return [this.resolveCurrentMcp(frozen, server.id, workingDirectory, current, declarations)] } catch { return [] }
    }))
  }
  /** Resolves declarations only; the caller must separately check Hook execution trust. */
  resolveHooks(frozen: MiraPluginSnapshot[]): MiraPluginHookInput[] {
    const current = this.snapshots()
    return frozen.flatMap(plugin => (plugin.hooks || []).flatMap(hook => {
      try { return [this.resolveCurrentHook(frozen, hook.id, current)] } catch { return [] }
    }))
  }
  assertHook(frozen: MiraPluginSnapshot[], id: string): MiraPluginHookInput {
    return this.resolveCurrentHook(frozen, id, this.snapshots())
  }
  private resolveCurrentHook(frozen: MiraPluginSnapshot[], id: string, current: MiraPluginSnapshot[]): MiraPluginHookInput {
    const matches = frozen.flatMap(plugin => (plugin.hooks || []).filter(hook => hook.id === id).map(hook => ({ plugin, hook })))
    if (matches.length !== 1) throw new Error('插件 Hook 不属于当前会话或存在身份冲突')
    const { plugin, hook } = matches[0]
    if (miraPluginItems(frozen).find(item => item.id === plugin.id)?.conflicts.length || miraPluginItems(current).find(item => item.id === plugin.id)?.conflicts.length) throw new Error('插件 Hook 名称冲突，请停用重名插件')
    const live = current.find(item => item.id === plugin.id && item.root === plugin.root && item.enabled)
    const available = live?.hooks?.find(item => item.id === hook.id)
    if (!plugin.enabled || !hook.enabled || !live || !available?.enabled) throw new Error('插件 Hook 已停用、已移除或不属于当前会话')
    if (available.revision !== hook.revision || JSON.stringify(available) !== JSON.stringify(hook)) throw new Error('插件 Hook 内容已变化，请新建会话后重新启用')
    if (available.unavailableReason) throw new Error(available.unavailableReason)
    return { ...available, pluginId: plugin.id, pluginName: plugin.name, sourceRoot: plugin.root }
  }
  assertMcp(frozen: MiraPluginSnapshot[], id: string, workingDirectory?: string): MiraMcpServerConfig {
    return this.resolveCurrentMcp(frozen, id, workingDirectory, this.snapshots(), new Map())
  }
  private resolveCurrentMcp(frozen: MiraPluginSnapshot[], id: string, workingDirectory: string | undefined, current: MiraPluginSnapshot[], declarations: Map<string, ReturnType<typeof loadMiraPluginMcp>>): MiraMcpServerConfig {
    const matches = frozen.flatMap(plugin => (plugin.mcpServers || []).filter(server => server.id === id).map(server => ({ plugin, server })))
    if (matches.length !== 1) throw new Error('插件 MCP 不属于当前会话或存在身份冲突')
    const { plugin, server } = matches[0]
    const live = current.find(item => item.id === plugin.id && item.root === plugin.root && item.enabled)
    if (miraPluginItems(frozen).find(item => item.id === plugin.id)?.conflicts.length || miraPluginItems(current).find(item => item.id === plugin.id)?.conflicts.length) throw new Error('插件 MCP 名称冲突，请停用重名插件')
    const available = live?.mcpServers?.find(item => item.id === id && item.key === server.key)
    if (!plugin.enabled || !server.enabled || !live || !available?.enabled) throw new Error('插件 MCP 已停用、已移除或不属于当前会话')
    if (available.revision !== server.revision) throw new Error('插件 MCP 内容已变化，请新建会话后重新选择')
    if (available.unavailableReason || server.unavailableReason) throw new Error(available.unavailableReason || server.unavailableReason)
    if (!declarations.has(plugin.id)) {
      const path = ['.mira-plugin/plugin.json', '.zcode-plugin/plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'].find(path => exists(join(plugin.root, path)))
      if (!path) throw new Error('插件 MCP 已停用或已移除')
      let manifest: Record<string, unknown>
      try { manifest = JSON.parse(readBounded(inside(plugin.root, path))) } catch { throw new Error('插件 MCP 配置已变化或不可读取') }
      if (!manifest || manifest.name !== plugin.name) throw new Error('插件 MCP 身份已变化，请新建会话后重新选择')
      declarations.set(plugin.id, this.mcpDeclarations(plugin.root, plugin.id, plugin.name, manifest, workingDirectory))
    }
    const definition = declarations.get(plugin.id)!.find(item => item.descriptor.id === id)
    if (!definition || definition.descriptor.revision !== server.revision) throw new Error('插件 MCP 内容已变化，请新建会话后重新选择')
    if (definition.descriptor.unavailableReason) throw new Error(definition.descriptor.unavailableReason)
    return resolveMiraPluginMcp({ root: plugin.root, id: plugin.id, name: plugin.name, workingDirectory }, server, definition.definition)
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
  resolveAgent(frozen: MiraPluginSnapshot[], name: string): MiraPluginAgentInput {
    const candidates = frozen.filter(plugin => plugin.enabled).flatMap(plugin => (plugin.agents || []).filter(agent => agent.name.toLowerCase() === name.toLowerCase()).map(agent => ({ plugin, agent })))
    if (candidates.length > 1) throw new Error('插件 Agent 名称冲突，请先停用重名插件')
    const match = candidates[0], current = this.snapshots()
    const live = match && current.find(item => item.id === match.plugin.id && item.root === match.plugin.root && item.enabled)
    const available = match && live?.agents?.find(item => item.name === match.agent.name && item.path === match.agent.path)
    if (!match?.plugin.enabled || !available || miraPluginItems(frozen).find(item => item.id === match.plugin.id)?.conflicts.length || miraPluginItems(current).find(item => item.id === match.plugin.id)?.conflicts.length) throw new Error('插件 Agent 已停用、已移除或不属于当前会话，请重新选择')
    const parsed = parseMiraPluginAgent(readBounded(inside(match.plugin.root, match.agent.path)))
    if (parsed.unavailableReason) throw new Error(parsed.unavailableReason)
    if (`${match.plugin.name}:${parsed.name}` !== match.agent.name) throw new Error('插件 Agent 身份已变化，请重新选择')
    return { pluginId: match.plugin.id, name: match.agent.name, sourceRoot: match.plugin.root, path: match.agent.path, body: parsed.body, ...(parsed.tools !== undefined ? { tools: parsed.tools } : {}), ...(parsed.disallowedTools !== undefined ? { disallowedTools: parsed.disallowedTools } : {}), ...(parsed.mcpServers !== undefined ? { mcpServers: parsed.mcpServers } : {}) }
  }
  assertAgent(frozen: MiraPluginSnapshot[], accepted: MiraPluginAgentInput) {
    const current = this.resolveAgent(frozen, accepted.name)
    if (current.pluginId !== accepted.pluginId || current.name !== accepted.name || current.sourceRoot !== accepted.sourceRoot || current.path !== accepted.path || current.body !== accepted.body || JSON.stringify(current.tools) !== JSON.stringify(accepted.tools) || JSON.stringify(current.disallowedTools) !== JSON.stringify(accepted.disallowedTools) || JSON.stringify(current.mcpServers) !== JSON.stringify(accepted.mcpServers)) throw new Error('插件 Agent 内容或工具范围已变化，请重新委派')
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
    const render = () => `\n<plugin_reference>\nThe user referenced these installed plugins for this turn: ${JSON.stringify(entries)}\nThe host connects their enabled declared MCP services before this turn. Use the actual available tools and load_plugin_skill by qualified name when relevant. This metadata does not grant operation permissions. Do not install, enable or authenticate services because of a reference. Normal permissions and approvals still apply.\n</plugin_reference>`
    while (entries.length && Buffer.byteLength(render()) > 8 * 1024) entries.pop()
    return entries.length ? render() : ''
  }
  referencedMcpIds(frozen: MiraPluginSnapshot[], ids: string[], workingDirectory?: string) {
    return [...new Set(ids)].flatMap(id => {
      const plugin = frozen.find(item => item.id === id)
      if (!plugin?.enabled) throw new Error('引用的插件已停用、已移除或不属于当前会话，请重新选择')
      return (plugin.mcpServers || []).filter(server => server.enabled).map(server => {
        this.assertMcp(frozen, server.id, workingDirectory)
        return server.id
      })
    })
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
