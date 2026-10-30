import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { Type } from '@earendil-works/pi-ai'
import { createHash } from 'node:crypto'
import type { McpServerConfig } from '../storage/mcpConfigStore'
import type { MiraMcpConnection } from '../../src/config/miraMcp'
import type { MiraMcpAuthorization } from '../services/miraMcpAuthorization'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { MIRA_COMPUTER_SERVER_ID } from '../../src/config/miraComputerUse'
import { createMiraComputerConnection, type MiraComputerConnection, type MiraComputerFeedback } from '../services/miraComputerUse'
import { join } from 'node:path'

/**
 * MCP 连接管理器：连接已配置的 MCP server，把工具转成 Agent 可调用的 AgentTool。
 */
export class McpManager {
  private readonly clients = new Map<string, Client>()
  private readonly toolsByServer = new Map<string, any[]>()
  private readonly connections = new Map<string, MiraMcpConnection>()
  private revision = 0
  private readonly configs = new Map<string, McpServerConfig>()
  private readonly computerFeedback = new Map<Client, MiraComputerFeedback>()
  constructor(private readonly authorization?: MiraMcpAuthorization, private readonly authorizationRoot = authorization, private readonly computerConnection: () => MiraComputerConnection = () => createMiraComputerConnection({ resourceRoot: join(process.cwd(), 'resources/plugins/computer-use') }), private readonly browserTransport?: () => Promise<Transport>) {
    authorization?.subscribe(event => {
      const config = this.configs.get(event.configId)
      if (!config?.enabled || config.authentication !== 'oauth' || new URL(config.url!).href !== event.serverUrl) return
      if (event.state === 'required') {
        this.toolsByServer.delete(config.id)
        this.connections.set(config.id, { state: 'authorization-required', toolCount: 0, authorization: authorization.getPending(config.id, config.url!) })
      }
      else if (event.state === 'authorized') void this.connectServer(config, this.revision)
      else this.connections.set(config.id, { state: 'failed', toolCount: 0, error: event.error || 'MCP 授权已取消，请重新连接' })
    })
  }
  createSibling(browserTransport?: () => Promise<Transport>) { return new McpManager(this.authorizationRoot?.fork(), this.authorizationRoot, this.computerConnection, browserTransport) }

  async refresh(configs: McpServerConfig[], signal?: AbortSignal) {
    signal?.throwIfAborted()
    const revision = ++this.revision
    const previous = [...this.clients.values()]
    const feedback = [...this.computerFeedback.values()]
    this.computerFeedback.clear()
    this.clients.clear()
    this.toolsByServer.clear()
    this.connections.clear()
    this.configs.clear()
    for (const config of configs) if (config.enabled) this.connections.set(config.id, { state: 'connecting', toolCount: 0 })
    await Promise.allSettled(feedback.map(item => item.close()))
    await Promise.all([this.authorization?.closeAll(), Promise.allSettled(previous.map(client => client.close()))])
    if (revision !== this.revision) return
    for (const config of configs) this.configs.set(config.id, { ...config })
    const abort = () => { void this.closeAll() }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      signal?.throwIfAborted()
      for (const config of configs) {
        if (revision !== this.revision) return
        if (!config.enabled) continue
        await this.connectServer(config, revision)
      }
      signal?.throwIfAborted()
    } finally { signal?.removeEventListener('abort', abort) }
  }

  async reconnect(config: McpServerConfig) {
    if (!config.enabled) throw new Error('只能重连已启用的 MCP 服务')
    const state = this.getStatus(config.id).state
    if (state === 'connecting' || state === 'connected') return
    this.configs.set(config.id, { ...config })
    await this.connectServer(config, this.revision)
  }

  private async connectServer(config: McpServerConfig, revision: number) {
    const previous = this.clients.get(config.id)
    this.clients.delete(config.id); this.toolsByServer.delete(config.id)
    const client = new Client({ name: 'mira', version: '0.0.10' })
    let closed = false
    let initialized = false
    let cancelConnect: (() => void) | undefined
    client.onclose = () => {
      const feedback = this.computerFeedback.get(client)
      this.computerFeedback.delete(client)
      void feedback?.close()
      closed = true
      cancelConnect?.()
      if (this.clients.get(config.id) !== client) return
      if (!initialized) return
      this.clients.delete(config.id); this.toolsByServer.delete(config.id)
      this.connections.set(config.id, { state: 'disconnected', toolCount: 0 })
    }
    this.clients.set(config.id, client)
    this.connections.set(config.id, { state: 'connecting', toolCount: 0 })
    await previous?.close().catch(() => undefined)
    if (revision !== this.revision || this.clients.get(config.id) !== client) { await client.close().catch(() => undefined); return }
    let authStatus: number | undefined
    const remote = config.type === 'streamableHttp' || config.type === 'sse'
    const safeError = () => authStatus === 401
      ? config.authentication === 'oauth' ? 'MCP 授权未完成，请在设置中打开授权或重新连接' : 'MCP 服务需要认证，请检查认证请求头，或选择浏览器登录后重连'
      : authStatus === 403
        ? 'MCP 服务拒绝访问，请在设置中检查凭据或服务权限后重连'
        : remote ? 'MCP 远程连接失败，请检查服务地址、网络和服务状态后重连' : 'MCP 连接失败，请检查启动命令、参数和环境变量后重连'
    let provider: OAuthClientProvider | undefined
    const bundledComputer = config.id === MIRA_COMPUTER_SERVER_ID && config.command === 'mira:computer-use'
    const remoteFetch: typeof fetch = async (url, init) => {
      const response = provider && this.authorization ? await this.authorization.fetch(provider, url, init) : await fetch(url, { ...init, redirect: 'error' })
      authStatus = response.status === 401 || response.status === 403 ? response.status : undefined
      return response
    }
    try {
      if (config.command === 'mira:computer-use' && !bundledComputer) throw new Error('内置电脑控制仅可由 Mira 插件使用')
      const computer = bundledComputer ? this.computerConnection() : undefined
      if (computer) this.computerFeedback.set(client, computer.feedback)
      if (remote && config.authentication === 'oauth') {
        if (!this.authorization) throw new Error('MCP 浏览器授权服务不可用')
        provider = await this.authorization.createProvider(config.id, config.url!)
        if (revision !== this.revision || this.clients.get(config.id) !== client) { await client.close(); return }
      }
      const options = { requestInit: { headers: config.headers }, fetch: remoteFetch, ...(provider ? { authProvider: provider } : {}) }
      const embeddedBrowser = config.id === 'plugin:browser-use@mira-builtin:browser' && config.command === 'mira:embedded-browser'
      if (config.command === 'mira:embedded-browser' && (!embeddedBrowser || !this.browserTransport)) throw new Error('内置浏览器仅可由桌面任务使用')
      const connection = computer ? computer.transport : embeddedBrowser ? await this.browserTransport!() : config.type === 'streamableHttp'
        ? new StreamableHTTPClientTransport(new URL(config.url || ''), options)
        : config.type === 'sse'
          ? new SSEClientTransport(new URL(config.url || ''), options)
          : new StdioClientTransport({ command: config.command, args: config.args, ...(config.cwd && { cwd: config.cwd }), ...(config.env && { env: { ...getDefaultEnvironment(), ...config.env } }), stderr: 'ignore' })
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          client.connect(connection, { timeout: 15_000 }),
          new Promise<never>((_, reject) => {
            cancelConnect = () => reject(new Error('MCP 连接已结束'))
            timer = setTimeout(() => reject(new Error('MCP 连接超时')), 15_000)
          }),
        ])
      } finally { clearTimeout(timer); cancelConnect = undefined }
      initialized = true
      if (revision !== this.revision || this.clients.get(config.id) !== client) { if (!closed) await client.close(); return }
      const result = await client.listTools(undefined, { timeout: 15_000 })
      if (revision !== this.revision || this.clients.get(config.id) !== client) { if (!closed) await client.close(); return }
      if (closed) throw new Error('MCP 连接已结束')
      const tools = Array.isArray(result.tools) ? result.tools : []
      const secrets = [...Object.values(config.headers || {}), ...Object.values(config.env || {})]
      for (const [key, value] of Object.entries(config.headers || {})) if (/authorization/i.test(key)) secrets.push(value.replace(/^(?:Bearer|Basic)\s+/i, ''))
      if (remote) for (const value of new URL(config.url!).searchParams.values()) secrets.push(value, encodeURIComponent(value))
      const redactions = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length)
      const redact = (value: string) => {
        const tokens = provider?.tokens(), information = provider?.clientInformation()
        // This host provider is synchronous; read current tokens again after SDK refresh.
        const oauth = tokens && !('then' in tokens) ? [tokens.access_token, tokens.refresh_token] : []
        if (information && !('then' in information) && 'client_secret' in information) oauth.push(information.client_secret)
        return [...redactions, ...oauth.filter((secret): secret is string => typeof secret === 'string' && !!secret)].sort((a, b) => b.length - a.length).reduce((text, secret) => text.split(secret).join('[REDACTED]'), value)
      }
      const feedback = computer?.feedback
      this.toolsByServer.set(config.id, tools.map(tool => this.toAgentTool(tool, client, config.name, config.id, remote ? safeError : undefined, redact, feedback)))
      this.connections.set(config.id, { state: 'connected', toolCount: tools.length })
    } catch (error) {
      const current = revision === this.revision && this.clients.get(config.id) === client
      if (this.clients.get(config.id) === client) this.clients.delete(config.id)
      if (current) {
        const message = error instanceof Error && ['系统安全存储不可用，MCP 授权凭据未写入', 'MCP 授权凭据不可读取，请重新授权；原文件未被覆盖', 'MCP 本机授权回调无法启动，请重试', 'Mira 电脑控制组件缺失，请修复安装；开发环境请运行 npm run tools:build'].includes(error.message) ? error.message : safeError()
        const pending = remote && config.authentication === 'oauth' ? this.authorization?.getPending(config.id, config.url!) : undefined
        this.connections.set(config.id, pending ? { state: 'authorization-required', toolCount: 0, authorization: pending } : { state: 'failed', toolCount: 0, error: message })
        if (!pending) console.error('[mcp]', message)
        if (!pending && provider) await this.authorization?.close(config.id, config.url!)
      }
      if (!closed) await client.close().catch(() => undefined)
    }
  }

  getTools(serverIds?: string[]): any[] {
    if (!serverIds) return [...this.toolsByServer.values()].flat()
    return [...new Set(serverIds)].flatMap(id => this.toolsByServer.get(id) || [])
  }

  getStatus(serverId: string): MiraMcpConnection {
    return { ...(this.connections.get(serverId) || { state: 'disconnected', toolCount: 0 }) }
  }

    private toAgentTool(tool: any, client: Client, serverName: string, serverId: string, connectionError?: () => string, redact: (text: string) => string = text => text, feedback?: MiraComputerFeedback): any {
    return {
      name: `mira_mcp_${createHash('sha256').update(serverId).digest('hex').slice(0, 10)}_${tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28)}_${createHash('sha256').update(tool.name).digest('hex').slice(0, 8)}`,
      label: tool.name,
      miraMcpServerId: serverId,
      miraMcpServerName: serverName,
      miraMcpToolName: tool.name,
      miraComputerUse: serverId === MIRA_COMPUTER_SERVER_ID,
      description: `MCP 服务“${serverName}”的工具“${tool.name}”：${tool.description || `MCP 工具 ${tool.name}`}`,
      parameters: tool.inputSchema ? Type.Unsafe(tool.inputSchema) : Type.Object({}, { additionalProperties: true }),
      executionMode: 'sequential',
      execute: async (_id: string, params: Record<string, unknown>, signal?: AbortSignal) => {
        const cancelled = () => new DOMException('运行已停止', 'AbortError')
        if (signal?.aborted) throw cancelled()
        if (this.clients.get(serverId) !== client || this.getStatus(serverId).state !== 'connected') throw new Error('MCP 连接已变更，请重新发送任务')
        const call = (callSignal?: AbortSignal) => client.callTool({ name: tool.name, arguments: params }, undefined, { signal: callSignal })
        const result = await (feedback ? feedback.execute(tool.name, params, signal, call) : call(signal)).catch(error => {
          // The SDK currently wraps an in-flight abort as RequestTimeout; the task signal distinguishes it.
          if (signal?.aborted) throw cancelled()
          if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) throw new Error('MCP 工具调用超时，请重试；如果持续超时，请检查服务状态')
          throw connectionError ? new Error(connectionError()) : error
        })
        const content = Array.isArray(result.content) ? result.content.map((item: any) => {
          if (item.type === 'image') {
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(item.mimeType) || typeof item.data !== 'string' || item.data.length > 28 * 1024 * 1024 || item.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data) || Buffer.byteLength(item.data, 'base64') > 20 * 1024 * 1024) throw new Error('MCP 返回的图片格式无效或超过 20 MiB')
            return { type: 'image', data: item.data, mimeType: item.mimeType }
          }
          return { type: 'text', text: redact(item.type === 'text' ? item.text : JSON.stringify(item)) }
        }) : [{ type: 'text', text: redact(String(result.content ?? '')) }]
        if (result.isError) throw new Error(content.filter(item => item.type === 'text').map(item => item.text).join('\n') || 'MCP 工具执行失败')
        return { content, details: { name: tool.name } }
      },
    }
  }

  async closeAll() {
    this.revision++
    const clients = [...this.clients.values()]
    const feedback = [...this.computerFeedback.values()]
    this.computerFeedback.clear()
    this.clients.clear()
    this.toolsByServer.clear()
    this.connections.clear()
    this.configs.clear()
    await Promise.allSettled(feedback.map(item => item.close()))
    await Promise.allSettled(clients.map(client => client.close()))
    await this.authorization?.closeAll()
  }
}
