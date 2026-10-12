import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { MiraPaths } from './miraPaths'
import type { MiraMcpServerConfig, MiraMcpTransport } from '../../src/config/miraMcp'

export type McpServerConfig = MiraMcpServerConfig
export const MIRA_MCP_CONFIG_ERRORS = [
  'MCP 环境变量必须是字符串映射', 'MCP 请求头必须是字符串映射',
  'MCP 环境变量格式无效', 'MCP 请求头格式无效', 'MCP 连接类型无效',
  '请填写 MCP 服务地址', 'MCP 服务地址必须是有效的 HTTP 或 HTTPS 地址；认证请使用请求头',
  'MCP 启用状态无效', '请填写 MCP server 名称', '请填写 MCP server 启动命令',
  'MCP 启动参数必须是字符串列表', 'MCP 配置读取失败，请检查配置文件后重试', 'MCP 配置保存失败，请检查文件权限后重试',
  'MCP 配置参数无效', 'MCP 服务 ID无效', 'MCP server 名称格式无效', 'MCP server 启动命令格式无效',
  'MCP 项目范围无效', 'MCP 项目目录无效', '项目 MCP 配置路径无效', '项目 MCP 服务 ID无效',
  'MCP 认证方式无效', 'OAuth 仅支持远程 MCP 服务', 'OAuth 认证不能同时设置 Authorization 请求头',
]

function stringMap(value: unknown, field: 'env' | 'headers'): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`MCP ${field === 'env' ? '环境变量' : '请求头'}必须是字符串映射`)
  const entries = Object.entries(value)
  if (entries.some(([key, item]) => typeof item !== 'string' || (field === 'env'
    ? !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || item.includes('\0')
    : !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /[\r\n\0]/.test(item)))) {
    throw new Error(`MCP ${field === 'env' ? '环境变量' : '请求头'}格式无效`)
  }
  return Object.fromEntries(entries)
}

function transport(value: unknown): MiraMcpTransport {
  if (value === undefined) return 'stdio'
  if (value !== 'stdio' && value !== 'streamableHttp' && value !== 'sse') throw new Error('MCP 连接类型无效')
  return value
}

function authentication(value: unknown, type: MiraMcpTransport, headers?: Record<string, string>): 'headers' | 'oauth' {
  if (value !== undefined && value !== 'headers' && value !== 'oauth') throw new Error('MCP 认证方式无效')
  if (value === 'oauth' && type === 'stdio') throw new Error('OAuth 仅支持远程 MCP 服务')
  if (value === 'oauth' && Object.keys(headers || {}).some(key => key.toLowerCase() === 'authorization')) throw new Error('OAuth 认证不能同时设置 Authorization 请求头')
  return value === 'oauth' ? 'oauth' : 'headers'
}

function remoteUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请填写 MCP 服务地址')
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) throw new Error()
    return value.trim()
  } catch { throw new Error('MCP 服务地址必须是有效的 HTTP 或 HTTPS 地址；认证请使用请求头') }
}

export class McpConfigStore {
  private readonly configPath: string
  private readonly canonicalDirectory?: string
  private readonly projectPrefix?: string

  constructor(private readonly input: MiraPaths | string, private readonly projectDirectory?: string) {
    if (projectDirectory !== undefined) {
      try {
        if (typeof projectDirectory !== 'string' || !isAbsolute(projectDirectory)) throw new Error()
        const info = lstatSync(projectDirectory)
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error()
        this.canonicalDirectory = realpathSync(projectDirectory)
      } catch { throw new Error('MCP 项目目录无效') }
      this.configPath = join(this.canonicalDirectory, '.mira', 'mcp.json')
      this.projectPrefix = `project:${createHash('sha256').update(this.canonicalDirectory).digest('hex').slice(0, 10)}:`
      return
    }
    const paths = typeof input === 'string' ? new MiraPaths(input) : input
    this.configPath = paths.mcpConfig()
    mkdirSync(paths.config, { recursive: true })
    if (!existsSync(this.configPath)) this.write([])
  }

  forProject(directory: string): McpConfigStore {
    if (typeof directory !== 'string' || !directory) throw new Error('MCP 项目目录无效')
    return new McpConfigStore(this.input, directory)
  }

  private checkProjectPath(): boolean {
    if (!this.canonicalDirectory) return true
    try {
      const info = lstatSync(this.projectDirectory!)
      if (info.isSymbolicLink() || !info.isDirectory() || realpathSync(this.projectDirectory!) !== this.canonicalDirectory) throw new Error()
      for (const path of [join(this.canonicalDirectory, '.mira'), this.configPath]) {
        let info
        try { info = lstatSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
        if (info.isSymbolicLink() || (path === this.configPath ? !info.isFile() : !info.isDirectory())) throw new Error()
      }
      return true
    } catch { throw new Error('项目 MCP 配置路径无效') }
  }

  private rawId(id: string): string {
    if (typeof id !== 'string' || !id.trim() || /[\x00-\x1f\x7f]/.test(id)) throw new Error('MCP 服务 ID无效')
    if (!this.projectPrefix) {
      if (id.startsWith('project:')) throw new Error('项目 MCP 服务 ID无效')
      return id
    }
    if (!id.startsWith(this.projectPrefix) || id.length === this.projectPrefix.length) throw new Error('项目 MCP 服务 ID无效')
    const raw = id.slice(this.projectPrefix.length)
    if (raw.startsWith('project:')) throw new Error('项目 MCP 服务 ID无效')
    return raw
  }

  private exposed(record: McpServerConfig): McpServerConfig {
    if (!this.projectPrefix) return record
    const { cwd: _ignored, ...config } = record
    return { ...config, id: this.projectPrefix + record.id, ...(transport(record.type) === 'stdio' ? { cwd: this.canonicalDirectory } : {}) }
  }

  path() {
    return this.configPath
  }

  private read(): McpServerConfig[] {
    if (!this.checkProjectPath()) return []
    try {
      const fd = this.canonicalDirectory ? openSync(this.configPath, constants.O_RDONLY | constants.O_NOFOLLOW) : undefined
      let source: string
      try { source = readFileSync(fd ?? this.configPath, 'utf8') } finally { if (fd !== undefined) closeSync(fd) }
      const parsed = JSON.parse(source)
      const values = Array.isArray(parsed) ? parsed : parsed?.servers
      if (!Array.isArray(values) || values.some((item: McpServerConfig) => !item || typeof item.id !== 'string' || typeof item.name !== 'string'
        || typeof item.command !== 'string' || typeof item.enabled !== 'boolean' || !Array.isArray(item.args) || item.args.some(arg => typeof arg !== 'string'))) throw new Error()
      for (const record of values as McpServerConfig[]) {
        authentication(record.authentication, transport(record.type), record.headers)
        if (record.authentication === 'oauth') remoteUrl(record.url)
      }
      if (this.projectPrefix) {
        const ids = new Set<string>()
        for (const record of values as McpServerConfig[]) {
          if (!record.id.trim() || record.id.startsWith('project:') || /[\x00-\x1f\x7f]/.test(record.id) || ids.has(record.id)) throw new Error()
          ids.add(record.id)
          const type = transport(record.type)
          stringMap(record.env, 'env'); stringMap(record.headers, 'headers')
          authentication(record.authentication, type, record.headers)
          if (type !== 'stdio') remoteUrl(record.url)
          if (!record.name.trim() || type === 'stdio' && !record.command.trim() || /[\x00-\x1f\x7f]/.test(record.name) || /[\x00-\x1f\x7f]/.test(record.command) || record.args.some(arg => arg.includes('\0'))) throw new Error()
        }
      }
      return values
    } catch {
      throw new Error('MCP 配置读取失败，请检查配置文件后重试')
    }
  }

  private write(records: McpServerConfig[]) {
    this.checkProjectPath()
    if (this.canonicalDirectory) {
      try { mkdirSync(join(this.canonicalDirectory, '.mira'), { recursive: true }) } catch { throw new Error('MCP 配置保存失败，请检查文件权限后重试') }
      this.checkProjectPath()
    }
    try {
      const fd = this.canonicalDirectory ? openSync(this.configPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600) : undefined
      try { writeFileSync(fd ?? this.configPath, `${JSON.stringify({ version: 1, servers: records }, null, 2)}\n`, 'utf8') } finally { if (fd !== undefined) closeSync(fd) }
    }
    catch { throw new Error('MCP 配置保存失败，请检查文件权限后重试') }
  }

  list(): McpServerConfig[] {
    return this.read().sort((a, b) => a.createdAt - b.createdAt).map(record => this.exposed(record))
  }

  save(input: Partial<McpServerConfig>): McpServerConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('MCP 配置参数无效')
    if (input.type !== undefined) transport(input.type)
    if (input.id !== undefined && (typeof input.id !== 'string' || !input.id.trim() || /[\x00-\x1f\x7f]/.test(input.id))) throw new Error('MCP 服务 ID无效')
    if (input.id !== undefined) input = { ...input, id: this.rawId(input.id) }
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new Error('MCP 启用状态无效')
    const records = this.read()
    const existing = input.id ? records.find(item => item.id === input.id) : undefined
    const name = input.name !== undefined ? input.name : existing?.name
    if (typeof name !== 'string' || !name.trim()) throw new Error('请填写 MCP server 名称')
    if (/[\x00-\x1f\x7f]/.test(name)) throw new Error('MCP server 名称格式无效')
    const type = transport(input.type ?? existing?.type)
    const sameTransport = type === transport(existing?.type)
    const command = type === 'stdio' ? input.command !== undefined ? input.command : sameTransport ? existing?.command : undefined : ''
    if (type === 'stdio' && (typeof command !== 'string' || !command.trim())) throw new Error('请填写 MCP server 启动命令')
    if (typeof command === 'string' && /[\x00-\x1f\x7f]/.test(command)) throw new Error('MCP server 启动命令格式无效')
    if (input.args !== undefined && (!Array.isArray(input.args) || input.args.some(item => typeof item !== 'string' || item.includes('\0')))) throw new Error('MCP 启动参数必须是字符串列表')
    const env = stringMap(input.env !== undefined ? input.env : sameTransport ? existing?.env : undefined, 'env')
    const headers = stringMap(input.headers !== undefined ? input.headers : sameTransport ? existing?.headers : undefined, 'headers')
    const auth = authentication(input.authentication !== undefined ? input.authentication : sameTransport ? existing?.authentication : undefined, type, headers)
    const url = type !== 'stdio' ? remoteUrl(input.url !== undefined ? input.url : sameTransport ? existing?.url : undefined) : undefined
    const now = Date.now()
    const record: McpServerConfig = {
      id: input.id || randomUUID(),
      name: name.trim(),
      command: typeof command === 'string' ? command.trim() : '',
      args: type === 'stdio' ? input.args ?? (sameTransport ? existing?.args : undefined) ?? [] : [],
      type,
      ...(type === 'stdio' ? env && { env } : { url, ...(headers && { headers }), ...(auth === 'oauth' ? { authentication: auth } : {}) }),
      enabled: input.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    const next = existing ? records.map(item => item.id === record.id ? record : item) : [...records, record]
    this.write(next)
    return this.exposed(record)
  }

  delete(id: string) {
    const rawId = this.rawId(id), records = this.read()
    if (!this.canonicalDirectory || records.some(item => item.id === rawId)) this.write(records.filter(item => item.id !== rawId))
  }
}
