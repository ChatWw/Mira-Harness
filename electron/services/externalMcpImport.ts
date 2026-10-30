import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { MIRA_MCP_CONFIG_ERRORS, type McpConfigStore } from '../storage/mcpConfigStore'
import type { MiraExternalMcpSource, MiraMcpImportResult, MiraMcpServerConfig, MiraMcpTransport } from '../../src/config/miraMcp'

const sources = [
  ['claudeCode', 'Claude Code', '.claude/settings.json', 'mcpServers'],
  ['codexCli', 'Codex CLI', '.codex/config.toml', 'toml'],
  ['openCode', 'OpenCode', '.config/opencode/opencode.json', 'mcp'],
  ['openClaw', 'OpenClaw', '.openclaw/settings.json', 'mcpServers'],
  ['qwenCode', 'Qwen Code', '.qwen/settings.json', 'mcpServers'],
  ['qoder', 'Qoder', '.qoder/settings.json', 'mcpServers'],
  ['qoderCn', 'Qoder CN', '.qoder-cn/settings.json', 'mcpServers'],
  ['trae', 'Trae', '.trae/settings.json', 'mcpServers'],
  ['kiroCli', 'Kiro CLI', '.kiro/settings.json', 'mcpServers'],
  ['roo', 'Roo Code', '.roo/settings.json', 'mcpServers'],
  ['codeBuddy', 'CodeBuddy', '.codebuddy/settings.json', 'mcpServers'],
  ['agents', '通用 .agents', '.agents/mcp.json', 'mcpServers'],
] as const
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nameKey = (name: string) => name.trim().toLowerCase()
type Candidate = { id: string; name: string; config?: Partial<MiraMcpServerConfig>; reason?: string }

function stringMap(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!record(value) || Object.values(value).some(item => typeof item !== 'string')) throw new Error('环境变量或请求头必须是字符串映射')
  return value as Record<string, string>
}

function normalize(name: string, value: unknown): Partial<MiraMcpServerConfig> {
  if (!record(value) || !name.trim() || /[\x00-\x1f\x7f]/.test(name)) throw new Error('服务器配置无效')
  let command = value.command, args = value.args ?? []
  if (Array.isArray(command)) { args = command.slice(1); command = command[0] }
  const rawType = value.type ?? (value.url ? 'http' : 'stdio')
  const types: Record<string, MiraMcpTransport> = { stdio: 'stdio', local: 'stdio', http: 'streamableHttp', remote: 'streamableHttp', streamableHttp: 'streamableHttp', 'streamable-http': 'streamableHttp', sse: 'sse' }
  const type = typeof rawType === 'string' ? types[rawType] : undefined
  if (!type) throw new Error('暂不支持此连接类型')
  const enabled = value.enabled ?? (value.disabled === true ? false : true)
  if (typeof enabled !== 'boolean') throw new Error('启用状态无效')
  if (type === 'stdio') {
    if (typeof command !== 'string' || !command.trim() || /[\x00-\x1f\x7f]/.test(command)) throw new Error('缺少有效的启动命令')
    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('启动参数必须是字符串列表')
    const env = { ...stringMap(value.env ?? value.environment) }
    if (value.env_vars !== undefined) {
      if (!Array.isArray(value.env_vars) || value.env_vars.some(key => typeof key !== 'string')) throw new Error('环境变量名称列表无效')
      for (const key of value.env_vars as string[]) if (process.env[key] !== undefined) env[key] = process.env[key]!
    }
    return { name: name.trim(), type, command: command.trim(), args: args as string[], env, enabled }
  }
  let url: URL
  try { url = new URL(value.url as string) } catch { throw new Error('服务地址无效') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('服务地址必须为不含凭据的 HTTP 或 HTTPS 地址')
  const headers = { ...stringMap(value.headers ?? value.http_headers) }
  const envHeaders = stringMap(value.env_http_headers)
  for (const [key, envKey] of Object.entries(envHeaders || {})) {
    if (!process.env[envKey]) throw new Error('请求头引用的环境变量未设置')
    headers[key] = process.env[envKey]!
  }
  if (value.bearer_token_env_var !== undefined) {
    if (typeof value.bearer_token_env_var !== 'string' || !process.env[value.bearer_token_env_var]) throw new Error('认证引用的环境变量未设置')
    headers.Authorization = `Bearer ${process.env[value.bearer_token_env_var]}`
  }
  if (value.authentication !== undefined && value.authentication !== 'headers' && value.authentication !== 'oauth') throw new Error('认证方式无效')
  return { name: name.trim(), type, command: '', args: [], url: (value.url as string).trim(), headers, enabled, ...(value.authentication === 'oauth' ? { authentication: 'oauth' } : {}) }
}

async function scan(home: string) {
  return Promise.all(sources.map(async ([id, name, relativePath, format]) => {
    const path = join(home, relativePath), candidates: Candidate[] = []
    let error: string | undefined
    try {
      const raw = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
      const parsed: unknown = format === 'toml' ? parseToml(raw) : JSON.parse(raw)
      if (!record(parsed)) throw new Error()
      const servers = format === 'toml' ? parsed.mcp_servers ?? parsed.mcpServers : parsed[format]
      if (servers !== undefined && !record(servers)) throw new Error()
      for (const [serverName, config] of Object.entries(servers || {})) {
        const candidate: Candidate = { id: createHash('sha256').update(JSON.stringify([id, serverName])).digest('hex'), name: serverName }
        try { candidate.config = normalize(serverName, config) } catch (cause) { candidate.reason = (cause as Error).message }
        candidates.push(candidate)
      }
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') error = '配置无法读取或格式无效，请检查来源文件后刷新'
    }
    return { id, name, path, candidates, ...(error ? { error } : {}) }
  }))
}

export async function discoverExternalMcpServers(store: McpConfigStore, home = homedir()): Promise<MiraExternalMcpSource[]> {
  const existing = new Set(store.list().map(server => nameKey(server.name)))
  return (await scan(home)).filter(source => source.candidates.length || source.error).map(({ candidates, ...source }) => ({
    ...source,
    servers: candidates.map(candidate => {
      const reason = existing.has(nameKey(candidate.name)) ? '已存在同名服务器，保留现有配置' : candidate.reason
      return { id: candidate.id, name: candidate.name, type: candidate.config?.type, importable: !reason, ...(reason ? { reason } : {}) }
    }),
  }))
}

export async function importExternalMcpServers(store: McpConfigStore, ids: unknown, home = homedir(), assertOwner = () => {}): Promise<MiraMcpImportResult[]> {
  if (!Array.isArray(ids) || ids.length > 2000 || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) throw new Error('MCP 导入选择无效，请刷新后重试')
  // Re-read only known source paths; renderer-supplied paths/configurations are never accepted.
  const candidates = (await scan(home)).flatMap(source => source.candidates)
  assertOwner()
  const existing = new Set(store.list().map(server => nameKey(server.name)))
  return [...new Set(ids as string[])].map(id => {
    const candidate = candidates.find(item => item.id === id)
    const name = candidate?.name || '来源已失效'
    if (!candidate?.config) return { id, name, status: 'failed', message: candidate?.reason || '来源已变化或不可用，请刷新后重试' }
    if (existing.has(nameKey(name))) return { id, name, status: 'skipped', message: '已存在同名服务器，保留现有配置' }
    try {
      store.save(candidate.config)
      existing.add(nameKey(name))
      return { id, name, status: 'imported' }
    } catch (cause) {
      const message = (cause as Error).message
      return { id, name, status: 'failed', message: MIRA_MCP_CONFIG_ERRORS.includes(message) ? message : '导入失败，请检查配置及文件权限后重试' }
    }
  })
}
