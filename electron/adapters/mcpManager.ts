import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Type } from '@earendil-works/pi-ai'
import type { McpServerConfig } from '../storage/mcpConfigStore'
import type { MiraMcpConnection } from '../../src/config/miraMcp'

/**
 * MCP 连接管理器：连接已配置的 stdio MCP server，把它们的工具转成 Agent 可调用的 AgentTool。
 */
export class McpManager {
  private readonly clients = new Map<string, Client>()
  private readonly toolsByServer = new Map<string, any[]>()
  private readonly connections = new Map<string, MiraMcpConnection>()
  private revision = 0

  async refresh(configs: McpServerConfig[]) {
    const revision = ++this.revision
    const previous = [...this.clients.values()]
    this.clients.clear()
    this.toolsByServer.clear()
    this.connections.clear()
    for (const config of configs) if (config.enabled) this.connections.set(config.id, { state: 'connecting', toolCount: 0 })
    await Promise.allSettled(previous.map(client => client.close()))
    for (const config of configs) {
      if (revision !== this.revision) return
      if (!config.enabled) continue
      await this.connectServer(config, revision)
    }
  }

  async reconnect(config: McpServerConfig) {
    if (!config.enabled) throw new Error('只能重连已启用的 MCP 服务')
    const state = this.getStatus(config.id).state
    if (state === 'connecting' || state === 'connected') return
    await this.connectServer(config, this.revision)
  }

  private async connectServer(config: McpServerConfig, revision: number) {
    const client = new Client({ name: 'mira', version: '0.0.10' })
    let closed = false
    client.onclose = () => {
      closed = true
      if (this.clients.get(config.id) !== client) return
      this.clients.delete(config.id); this.toolsByServer.delete(config.id)
      this.connections.set(config.id, { state: 'disconnected', toolCount: 0 })
    }
    this.clients.set(config.id, client)
    this.connections.set(config.id, { state: 'connecting', toolCount: 0 })
    try {
      await client.connect(new StdioClientTransport({ command: config.command, args: config.args }))
      if (revision !== this.revision || this.clients.get(config.id) !== client) { if (!closed) await client.close(); return }
      const result = await client.listTools()
      if (revision !== this.revision || this.clients.get(config.id) !== client) { if (!closed) await client.close(); return }
      if (closed) throw new Error('MCP 连接已结束')
      const tools = Array.isArray(result.tools) ? result.tools : []
      this.toolsByServer.set(config.id, tools.map(tool => this.toAgentTool(tool, client, config.name)))
      this.connections.set(config.id, { state: 'connected', toolCount: tools.length })
    } catch (error) {
      const current = revision === this.revision && this.clients.get(config.id) === client
      if (this.clients.get(config.id) === client) this.clients.delete(config.id)
      if (current) {
        this.connections.set(config.id, { state: 'failed', toolCount: 0 })
        console.error(`[mcp] 连接 ${config.name} 失败:`, error instanceof Error ? error.message : String(error))
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

  private toAgentTool(tool: any, client: Client, serverName: string): any {
    return {
      name: tool.name,
      label: tool.name,
      miraMcpServerName: serverName,
      description: tool.description || `MCP 工具 ${tool.name}`,
      // MCP 工具的 inputSchema 是 JSON Schema，转 typebox 成本高；这里用宽松 schema，
      // 参数校验交给 MCP server 自己做，模型仍能自由传参调用。
      parameters: Type.Object({}, { additionalProperties: true }),
      executionMode: 'sequential',
      execute: async (_id: string, params: Record<string, unknown>) => {
        const result = await client.callTool({ name: tool.name, arguments: params })
        const text = Array.isArray(result.content)
          ? result.content.map((item: any) => item.type === 'text' ? item.text : JSON.stringify(item)).join('\n')
          : String(result.content ?? '')
        if (result.isError) throw new Error(text || 'MCP 工具执行失败')
        return { content: [{ type: 'text', text }], details: { name: tool.name } }
      },
    }
  }

  async closeAll() {
    this.revision++
    const clients = [...this.clients.values()]
    this.clients.clear()
    this.toolsByServer.clear()
    this.connections.clear()
    await Promise.allSettled(clients.map(client => client.close()))
  }
}
