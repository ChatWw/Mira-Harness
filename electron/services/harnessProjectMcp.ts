/* Workspace MCP ownership follows ZCode's user/workspace configuration boundary.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { McpManager } from '../adapters/mcpManager'
import type { McpConfigStore, McpServerConfig } from '../storage/mcpConfigStore'

/** Project connections belong to one run; children borrow the parent's snapshot. */
export class HarnessProjectMcp {
  private readonly frozen = new Map<string, McpServerConfig>()
  constructor(private readonly store: McpConfigStore, private readonly ids: string[], private readonly manager = new McpManager()) {}

  private assertCurrent(id: string) {
    const current = this.store.list().find(server => server.id === id)
    if (!current?.enabled) throw new Error('项目 MCP 服务已停用或删除，请重新选择后发送')
    const frozen = this.frozen.get(id)
    if (frozen && JSON.stringify(current) !== JSON.stringify(frozen)) throw new Error('项目 MCP 配置已变更，请重新发送任务')
    return current
  }

  async start(signal: AbortSignal) {
    const configs = [...new Set(this.ids)].map(id => this.assertCurrent(id))
    configs.forEach(config => this.frozen.set(config.id, config))
    await this.manager.refresh(configs, signal)
    signal.throwIfAborted()
    for (const config of configs) {
      this.assertCurrent(config.id)
      const status = this.manager.getStatus(config.id)
      if (status.state !== 'connected') throw new Error(status.error || '项目 MCP 连接已断开，请重试')
    }
  }

  getTools() {
    return this.manager.getTools().map(tool => ({
      ...tool,
      execute: async (...args: Parameters<typeof tool.execute>) => {
        this.assertCurrent(tool.miraMcpServerId)
        if (this.manager.getStatus(tool.miraMcpServerId).state !== 'connected') throw new Error('项目 MCP 连接已断开，请重新发送')
        return tool.execute(...args)
      },
    }))
  }

  getStatus(id: string) { return this.manager.getStatus(id) }
  close() { return this.manager.closeAll() }
}
