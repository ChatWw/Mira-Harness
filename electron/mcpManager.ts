import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Type } from '@earendil-works/pi-ai'
import type { McpServerConfig } from './mcpConfigStore'

/**
 * MCP 连接管理器：连接已配置的 stdio MCP server，把它们的工具转成 Agent 可调用的 AgentTool。
 */
export class McpManager {
  private readonly clients = new Map<string, Client>()
  private readonly toolsByServer = new Map<string, any[]>()

  async refresh(configs: McpServerConfig[]) {
    await this.closeAll()
    this.toolsByServer.clear()
    for (const config of configs) {
      if (!config.enabled) continue
      try {
        const client = new Client({ name: 'mira', version: '0.0.10' })
        await client.connect(new StdioClientTransport({ command: config.command, args: config.args }))
        const result = await client.listTools()
        const tools = Array.isArray(result.tools) ? result.tools : []
        this.clients.set(config.id, client)
        this.toolsByServer.set(config.id, tools.map(tool => this.toAgentTool(tool, client)))
      } catch (error) {
        console.error(`[mcp] 连接 ${config.name} 失败:`, error instanceof Error ? error.message : String(error))
      }
    }
  }

  getTools(): any[] {
    return [...this.toolsByServer.values()].flat()
  }

  private toAgentTool(tool: any, client: Client): any {
    return {
      name: tool.name,
      label: tool.name,
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
        return { content: [{ type: 'text', text }], details: { name: tool.name } }
      },
    }
  }

  async closeAll() {
    const clients = [...this.clients.values()]
    this.clients.clear()
    await Promise.allSettled(clients.map(client => client.close()))
  }
}
