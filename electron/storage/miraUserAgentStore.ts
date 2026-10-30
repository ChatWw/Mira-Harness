import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'
import { isMiraUserAgentName, MIRA_RESERVED_USER_AGENTS, type MiraUserAgentColor, type MiraUserAgentDelete, type MiraUserAgentDocument, type MiraUserAgentEnabled, type MiraUserAgentInput, type MiraUserAgentItem, type MiraUserAgentScope, type MiraUserAgentWrite } from '../../src/config/miraUserAgents'
import type { ModelSelection } from '../../src/config/harness'
import { parseMiraPluginAgent } from './miraPluginAgents'
import type { MiraPaths } from './miraPaths'

const LIMIT = 256 * 1024
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const reserved = new Set<string>(MIRA_RESERVED_USER_AGENTS)
const colors = new Set<string>(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'])
type Entry = { agent: MiraUserAgentItem; root: string; path: string }

function stat(path: string) {
  try { return lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
}
function checked(base: string, path: string) {
  const target = resolve(path), child = relative(base, target)
  if (child === '..' || child.startsWith(`..${sep}`) || child.startsWith(sep)) throw new Error('Agent 路径超出所属目录')
  let current = base
  if (stat(current)?.isSymbolicLink()) throw new Error('Agent 目录不能经过符号链接')
  for (const segment of child.split(sep).filter(Boolean)) {
    current = join(current, segment)
    if (stat(current)?.isSymbolicLink()) throw new Error('Agent 路径不能经过符号链接')
  }
  return target
}
function readSource(path: string) {
  const info = stat(path)
  if (!info?.isFile() || info.size > LIMIT) throw new Error('Agent 文件不存在、无效或超过 256KB')
  const source = readFileSync(path, 'utf8')
  if (Buffer.byteLength(source, 'utf8') > LIMIT) throw new Error('Agent 文件超过 256KB')
  return source
}
function agentName(value: string) {
  if (typeof value !== 'string' || !isMiraUserAgentName(value)) throw new Error('Agent 名称需要 3 至 50 位小写字母、数字或横线，不接受插件命名空间')
  return value
}
function frontmatter(source: string) {
  const header = /^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  if (!header) throw new Error('Agent YAML 元数据无效，需要 name 和 description')
  const document = parseDocument(header[1])
  if (document.errors.length) throw new Error('Agent YAML 元数据无效')
  const metadata = document.toJS({ maxAliasCount: 0 })
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Agent YAML 元数据无效')
  return { document, metadata, body: source.slice(header[0].length) }
}

/** Only user profiles accept enabled; plugin parsing retains its original unsupported-field policy. */
export function parseMiraUserAgent(source: string) {
  try {
    const { document, metadata, body } = frontmatter(source.trimStart())
    const enabled = metadata.enabled === undefined ? true : metadata.enabled
    for (const key of ['enabled', 'modelSelection', 'injectAgentsMd', 'color']) document.delete(key)
    const parsed = parseMiraPluginAgent(`---\n${document.toString()}---\n${body}`)
    const reasons: Array<string | undefined> = []
    let modelSelection: ModelSelection | undefined
    if (metadata.modelSelection !== undefined) {
      const model = metadata.modelSelection
      const validText = (value: unknown, max: number) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max && !value.includes('\0')
      if (!model || typeof model !== 'object' || Array.isArray(model) || !validText(model.providerId, 128) || !validText(model.modelId, 256) || model.thinkingLevel !== undefined && !['off', 'low', 'medium', 'high'].includes(model.thinkingLevel) || Object.keys(model).some(key => !['providerId', 'modelId', 'thinkingLevel'].includes(key))) reasons.push('Agent modelSelection 元数据无效，需要 providerId、modelId 和可选推理档位')
      else modelSelection = { providerId: model.providerId, modelId: model.modelId, ...(model.thinkingLevel !== undefined ? { thinkingLevel: model.thinkingLevel } : {}) }
    }
    if (metadata.injectAgentsMd !== undefined && typeof metadata.injectAgentsMd !== 'boolean') reasons.push('Agent injectAgentsMd 元数据必须是布尔值')
    if (metadata.color !== undefined && !colors.has(metadata.color)) reasons.push('Agent color 元数据无效')
    reasons.push(parsed.unavailableReason,
      !isMiraUserAgentName(parsed.name) ? 'Agent name 需要 3 至 50 位小写字母、数字或横线' : undefined,
      typeof enabled !== 'boolean' ? 'Agent enabled 元数据必须是布尔值' : undefined,
    )
    return { ...parsed, enabled: enabled === true, injectAgentsMd: metadata.injectAgentsMd !== false, ...(modelSelection ? { modelSelection } : {}), ...(colors.has(metadata.color) ? { color: metadata.color as MiraUserAgentColor } : {}), ...(reasons.some(Boolean) ? { unavailableReason: reasons.filter(Boolean).join('；') } : {}) }
  } catch { return { name: '', description: '', body: '', enabled: false, unavailableReason: 'Agent YAML 元数据无效，需要 name 和 description' } }
}

function capabilities(parsed: ReturnType<typeof parseMiraUserAgent>) {
  return {
    ...('tools' in parsed && parsed.tools !== undefined ? { tools: parsed.tools } : {}),
    ...('disallowedTools' in parsed && parsed.disallowedTools !== undefined ? { disallowedTools: parsed.disallowedTools } : {}),
    ...('mcpServers' in parsed && parsed.mcpServers !== undefined ? { mcpServers: parsed.mcpServers } : {}),
    ...('modelSelection' in parsed && parsed.modelSelection ? { modelSelection: parsed.modelSelection } : {}),
    ...('injectAgentsMd' in parsed ? { injectAgentsMd: parsed.injectAgentsMd } : {}),
    ...('color' in parsed && parsed.color ? { color: parsed.color } : {}),
  }
}

export class MiraUserAgentStore {
  constructor(private readonly paths: MiraPaths) {}

  private root(scope: MiraUserAgentScope, directory?: string) {
    if (scope !== 'global' && scope !== 'project') throw new Error('Agent 范围无效')
    const base = scope === 'global' ? this.paths.root : directory
    if (!base || !stat(base)?.isDirectory() || stat(base)?.isSymbolicLink()) throw new Error(scope === 'project' ? '请先选择有效项目目录' : 'Mira 用户目录不可用')
    const canonical = realpathSync(base)
    return { base: canonical, path: checked(canonical, scope === 'global' ? join(canonical, 'agents') : join(canonical, '.mira', 'agents')) }
  }
  private entries(scope: MiraUserAgentScope, directory?: string): Entry[] {
    const root = this.root(scope, directory), items: Entry[] = [], info = stat(root.path)
    if (!info) return items
    if (!info.isDirectory()) throw new Error('Agent 目录无效')
    for (const file of readdirSync(root.path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (file.name.startsWith('.')) continue
      const path = checked(root.base, join(root.path, file.name))
      if (!file.isFile() || !/\.md$/i.test(file.name)) continue
      const name = agentName(file.name.replace(/\.md$/i, '').toLowerCase())
      if (items.some(entry => entry.agent.name === name)) throw new Error(`Agent 名称冲突：${name}`)
      if (items.length >= 128) throw new Error('每个 Agent 范围最多支持 128 项')
      const source = readSource(path), parsed = parseMiraUserAgent(source)
      const unavailableReason = reserved.has(name) ? '此名称属于 Mira 内置智能体，不能覆盖' : parsed.unavailableReason || (parsed.name !== name ? 'Agent name 与文件名不一致，请修正后重试' : undefined)
      items.push({ root: root.path, path, agent: { id: digest(`${scope}:${root.path}:${name}`), scope, name, description: parsed.description, enabled: parsed.enabled, revision: digest(source), ...capabilities(parsed), ...(unavailableReason ? { unavailableReason } : {}) } })
    }
    return items
  }
  list(directory?: string): MiraUserAgentItem[] {
    const names = new Set<string>()
    return [...(directory ? this.entries('project', directory) : []), ...this.entries('global')].map(({ agent }) => {
      const shadowed = names.has(agent.name); names.add(agent.name)
      return { ...agent, ...(shadowed ? { shadowed: true } : {}) }
    })
  }
  read(scope: MiraUserAgentScope, name: string, directory?: string): MiraUserAgentDocument {
    const entry = this.entries(scope, directory).find(entry => entry.agent.name === agentName(name))
    if (!entry) throw new Error('自定义 Agent 不存在，请刷新后重试')
    return { agent: entry.agent, source: readSource(entry.path) }
  }
  save(input: MiraUserAgentWrite, directory?: string): MiraUserAgentItem {
    const name = agentName(input.name), root = this.root(input.scope, directory)
    if (reserved.has(name)) throw new Error('不能覆盖 Mira 内置智能体')
    if (typeof input.source !== 'string' || Buffer.byteLength(input.source, 'utf8') > LIMIT) throw new Error('Agent 内容无效或超过 256KB')
    if (parseMiraUserAgent(input.source).name !== name) throw new Error('Agent name 与文件名不一致或无效，请修正后保存')
    const entries = this.entries(input.scope, directory), existing = entries.find(entry => entry.agent.name === name)
    if (!existing && input.expectedRevision !== undefined || existing && existing.agent.revision !== input.expectedRevision) throw new Error('Agent 已存在、已移除或已被修改，请刷新后重试')
    if (!existing && entries.length >= 128) throw new Error('每个 Agent 范围最多支持 128 项')
    const path = existing?.path || checked(root.base, join(root.path, `${name}.md`))
    mkdirSync(root.path, { recursive: true }); checked(root.base, path)
    if (!existing) writeFileSync(path, input.source, { flag: 'wx', mode: 0o600 })
    else {
      if (digest(readSource(path)) !== input.expectedRevision) throw new Error('Agent 已被修改，请刷新后重试')
      const temporary = checked(root.base, join(root.path, `.mira-agent-${randomUUID()}.tmp`))
      writeFileSync(temporary, input.source, { flag: 'wx', mode: 0o600 })
      renameSync(temporary, checked(root.base, path))
    }
    return this.read(input.scope, name, directory).agent
  }
  delete(input: MiraUserAgentDelete, directory?: string) {
    const name = agentName(input.name), root = this.root(input.scope, directory)
    const entry = this.entries(input.scope, directory).find(entry => entry.agent.name === name)
    if (!entry || !input.expectedRevision || digest(readSource(entry.path)) !== input.expectedRevision) throw new Error('Agent 已移除或已被修改，请刷新后重试')
    const trash = checked(root.base, input.scope === 'global' ? join(root.base, 'trash', 'agents') : join(root.base, '.mira', 'trash', 'agents'))
    mkdirSync(trash, { recursive: true })
    renameSync(checked(root.base, entry.path), checked(root.base, join(trash, `${Date.now()}-${randomUUID()}-${name}.md`)))
  }
  setEnabled(input: MiraUserAgentEnabled, directory?: string): MiraUserAgentItem {
    if (typeof input.enabled !== 'boolean') throw new Error('Agent 启用状态无效')
    const current = this.read(input.scope, input.name, directory)
    if (!input.expectedRevision || current.agent.revision !== input.expectedRevision) throw new Error('Agent 已被修改，请刷新后重试')
    const trimmed = current.source.trimStart(), leading = current.source.slice(0, current.source.length - trimmed.length)
    const { document, body } = frontmatter(trimmed)
    document.set('enabled', input.enabled)
    return this.save({ scope: input.scope, name: input.name, expectedRevision: input.expectedRevision, source: `${leading}---\n${document.toString()}---\n${body}` }, directory)
  }
  resolve(name: string, directory?: string): MiraUserAgentInput | undefined {
    if (!isMiraUserAgentName(name) || reserved.has(name)) return
    const entry = [...(directory ? this.entries('project', directory) : []), ...this.entries('global')].find(entry => entry.agent.name === name)
    if (!entry) return
    if (!entry.agent.enabled) throw new Error('自定义 Agent 已停用，请启用后重试')
    if (entry.agent.unavailableReason) throw new Error(entry.agent.unavailableReason)
    const root = this.root(entry.agent.scope, directory), parsed = parseMiraUserAgent(readSource(checked(root.base, entry.path)))
    if (!parsed.enabled || parsed.unavailableReason || parsed.name !== name) throw new Error(parsed.unavailableReason || 'Agent 已停用或身份已变化')
    return { id: entry.agent.id, scope: entry.agent.scope, name, revision: entry.agent.revision, sourceRoot: entry.root, path: entry.path, body: parsed.body, ...capabilities(parsed) }
  }
  assert(accepted: MiraUserAgentInput, directory?: string) {
    const current = this.resolve(accepted.name, directory)
    if (!current || current.id !== accepted.id || current.scope !== accepted.scope || current.revision !== accepted.revision || current.sourceRoot !== accepted.sourceRoot || current.path !== accepted.path || current.body !== accepted.body || JSON.stringify(current.tools) !== JSON.stringify(accepted.tools) || JSON.stringify(current.disallowedTools) !== JSON.stringify(accepted.disallowedTools) || JSON.stringify(current.mcpServers) !== JSON.stringify(accepted.mcpServers) || JSON.stringify(current.modelSelection) !== JSON.stringify(accepted.modelSelection) || current.injectAgentsMd !== accepted.injectAgentsMd || current.color !== accepted.color) throw new Error('自定义 Agent 来源或内容已变化，请重新委派')
  }
}
