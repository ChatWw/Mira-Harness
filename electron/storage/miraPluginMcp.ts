import { createHash } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import type { MiraPluginMcpServer } from '../../src/config/miraPlugins'
import type { MiraMcpServerConfig, MiraMcpTransport } from '../../src/config/miraMcp'

type Definition = { value: unknown; source: string }
type LoadedServer = { descriptor: MiraPluginMcpServer; definition: unknown }
type Context = { id: string; name: string; root: string; workingDirectory?: string; env?: NodeJS.ProcessEnv }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/

/** readFile must enforce the package boundary, symlink prohibition and 256KB bound. */
export function loadMiraPluginMcp(context: Context, manifest: Record<string, unknown>, readFile: (path: string) => string | undefined): LoadedServer[] {
  const definitions = new Map<string, Definition>()
  const diagnostics: Array<{ source: string; reason: string }> = []
  const normalize = (value: unknown, source: string) => {
    if (!record(value)) { diagnostics.push({ source, reason: '插件 MCP 配置需要对象' }); return }
    const servers = record(value.mcpServers) ? value.mcpServers : value
    for (const [key, config] of Object.entries(servers)) definitions.set(key, { value: config, source })
  }
  const file = (path: string, optional = false) => {
    let content: string | undefined
    try { content = readFile(path) } catch { diagnostics.push({ source: path, reason: '插件 MCP 配置路径无效或文件不可读取' }); return }
    if (content === undefined) { if (!optional) diagnostics.push({ source: path, reason: '插件 MCP 配置文件不可读取' }); return }
    try { normalize(JSON.parse(content), `${path}:${hash(content)}`) } catch { diagnostics.push({ source: path, reason: '插件 MCP 配置文件无法读取为有效 JSON' }) }
  }
  const spec = (value: unknown, source = 'manifest.mcpServers', depth = 0) => {
    if (depth > 4) { diagnostics.push({ source, reason: '插件 MCP 配置数组层级超过 4 层' }); return }
    if (typeof value === 'string') file(value)
    else if (Array.isArray(value)) value.forEach((item, index) => spec(item, `${source}[${index}]`, depth + 1))
    else if (value !== undefined) normalize(value, source)
  }
  file('.mcp.json', true)
  spec(manifest.mcpServers)
  const result: LoadedServer[] = []
  for (const [key, definition] of definitions) {
    const id = `plugin:${context.id}:${key}`, name = `plugin:${context.name}:${key}`
    const revision = hash(JSON.stringify([definition.source, definition.value]))
    let config: MiraMcpServerConfig | undefined, unavailableReason: string | undefined
    if (!KEY.test(key) || id.length > 256) {
      diagnostics.push({ source: `${definition.source}:${hash(key)}`, reason: '插件 MCP 服务名称无效或身份超过 256 字符' }); continue
    }
    try { config = resolveMiraPluginMcp(context, { id, key, name, revision, enabled: true }, definition.value) }
    catch (error) { unavailableReason = error instanceof Error ? error.message : '插件 MCP 服务配置无效' }
    result.push({ descriptor: { id, key, name, revision, type: config?.type, enabled: record(definition.value) && definition.value.enabled !== false, ...(unavailableReason ? { unavailableReason } : {}) }, definition: definition.value })
    if (result.length >= 64) { if (definitions.size > 64) diagnostics.push({ source: 'server-limit', reason: '插件 MCP 服务超过 64 项上限' }); break }
  }
  for (const diagnostic of diagnostics.slice(0, 16)) {
    const key = `configuration-${hash(diagnostic.source).slice(0, 16)}`
    const id = `plugin:${context.id}:${key}`
    result.push({ descriptor: { id: id.length <= 256 ? id : `plugin:${hash(context.id).slice(0, 16)}:${key}`, key, name: `plugin:${context.name}:${key}`, revision: hash(JSON.stringify(diagnostic)), enabled: false, unavailableReason: diagnostic.reason }, definition: undefined })
  }
  return result
}

export function resolveMiraPluginMcp(context: Context, descriptor: MiraPluginMcpServer, definition: unknown): MiraMcpServerConfig {
  if (!record(definition)) throw new Error('插件 MCP 服务配置需要对象')
  const unsupported = ['oauth', 'auth', 'timeoutMs'].filter(key => definition[key] !== undefined)
  if (unsupported.length) throw new Error(`插件 MCP 尚未支持 ${unsupported.join('、')}`)
  const type: MiraMcpTransport = definition.type === undefined ? typeof definition.command === 'string' ? 'stdio' : 'streamableHttp' : definition.type === 'http' ? 'streamableHttp' : definition.type as MiraMcpTransport
  if (!['stdio', 'streamableHttp', 'sse'].includes(type)) throw new Error('插件 MCP 传输类型无效')
  if (definition.enabled !== undefined && typeof definition.enabled !== 'boolean') throw new Error('插件 MCP enabled 需要布尔值')
  const workingDirectory = context.workingDirectory || context.root
  const environment = context.env || process.env
  const template = (value: string, sensitive = false) => value.replace(/\$\{([^}]+)\}/g, (match, key: string) => {
    if (['MIRA_PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT', 'ZCODE_PLUGIN_ROOT'].includes(key)) return context.root
    if (['MIRA_PROJECT_DIR', 'CLAUDE_PROJECT_DIR', 'ZCODE_PROJECT_DIR'].includes(key)) return workingDirectory
    if (['MIRA_PLUGIN_ID', 'ZCODE_PLUGIN_ID'].includes(key)) return context.id
    if (key.startsWith('user_config.') || /^(?:MIRA|CLAUDE|ZCODE)_(?:PLUGIN_DATA|(?:CODE_)?SESSION_ID|SKILL_DIR)$/.test(key)) throw new Error('插件 MCP 变量需要尚未支持的配置或上下文')
    const variable = key.startsWith('ENV:') ? key.slice(4) : key
    if ((sensitive || key.startsWith('ZCODE_')) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) {
      if (environment[variable] === undefined) throw new Error('插件 MCP 所需环境变量未配置')
      return environment[variable]!
    }
    return match
  })
  const string = (value: unknown, field: string, sensitive = false) => {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`插件 MCP ${field} 需要非空字符串`)
    return template(value, sensitive)
  }
  const strings = (value: unknown, field: string) => {
    if (value === undefined) return undefined
    if (!record(value) || Object.entries(value).some(([key, entry]) => !key || key.includes('\0') || typeof entry !== 'string' || entry.includes('\0'))) throw new Error(`插件 MCP ${field} 需要字符串映射`)
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, template(entry as string, true)]))
  }
  const config: MiraMcpServerConfig = { id: descriptor.id, name: descriptor.name, type, command: '', args: [], enabled: definition.enabled !== false, createdAt: 0, updatedAt: 0 }
  if (type === 'stdio') {
    config.command = string(definition.command, 'command')
    if (definition.args !== undefined && (!Array.isArray(definition.args) || definition.args.some(arg => typeof arg !== 'string' || arg.includes('\0')))) throw new Error('插件 MCP args 需要字符串数组')
    config.args = ((definition.args || []) as string[]).map(arg => template(arg))
    const cwd = definition.cwd === undefined ? workingDirectory : string(definition.cwd, 'cwd')
    config.cwd = isAbsolute(cwd) ? cwd : resolve(workingDirectory, cwd)
    config.env = { ...strings(definition.env, 'env'), MIRA_PLUGIN_ROOT: context.root, MIRA_PROJECT_DIR: workingDirectory, MIRA_PLUGIN_ID: context.id, CLAUDE_PLUGIN_ROOT: context.root, ZCODE_PLUGIN_ROOT: context.root, CLAUDE_PROJECT_DIR: workingDirectory, ZCODE_PROJECT_DIR: workingDirectory }
  } else {
    config.url = string(definition.url, 'url')
    try { const url = new URL(config.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error() } catch { throw new Error('插件 MCP URL 需要 HTTP 或 HTTPS 地址且不能包含账号密码') }
    config.headers = strings(definition.headers, 'headers')
  }
  return config
}
