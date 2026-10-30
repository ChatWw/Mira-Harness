import { McpManager } from '../adapters/mcpManager'
import type { MiraPluginStore } from '../storage/miraPluginStore'
import type { MiraPluginSnapshot } from '../../src/config/miraPlugins'

/** Connections belong to one run, so different project directories never share a plugin process. */
export class HarnessPluginMcp {
  constructor(private readonly store: MiraPluginStore, private readonly frozen: MiraPluginSnapshot[], private readonly ids: string[], private readonly directory?: string, private readonly manager = new McpManager()) {}

  async start(signal: AbortSignal) {
    const configs = [...new Set(this.ids)].map(id => this.store.assertMcp(this.frozen, id, this.directory))
    await this.manager.refresh(configs, signal)
    signal.throwIfAborted()
    for (const config of configs) {
      this.store.assertMcp(this.frozen, config.id, this.directory)
      const status = this.manager.getStatus(config.id)
      if (status.state !== 'connected') throw new Error(status.error || '插件 MCP 连接已断开，请重试')
    }
  }

  getTools() {
    return this.manager.getTools().map(tool => {
      const id = tool.miraMcpServerId as string
      return {
        ...tool,
        execute: async (...args: Parameters<typeof tool.execute>) => {
          this.store.assertMcp(this.frozen, id, this.directory)
          if (this.manager.getStatus(id).state !== 'connected') throw new Error('插件 MCP 连接已断开，请重新发送')
          return tool.execute(...args)
        },
      }
    })
  }

  getStatus(id: string) { return this.manager.getStatus(id) }
  close() { return this.manager.closeAll() }
}
