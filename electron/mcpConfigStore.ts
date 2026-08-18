import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export class McpConfigStore {
  private readonly configPath: string

  constructor(userDataPath: string) {
    this.configPath = join(userDataPath, 'mcp-servers.json')
    mkdirSync(dirname(this.configPath), { recursive: true })
    if (!existsSync(this.configPath)) this.write([])
  }

  path() {
    return this.configPath
  }

  private read(): McpServerConfig[] {
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8'))
      return Array.isArray(parsed)
        ? parsed.filter((item: unknown) => item && typeof (item as McpServerConfig).command === 'string')
        : []
    } catch {
      return []
    }
  }

  private write(records: McpServerConfig[]) {
    writeFileSync(this.configPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  }

  list(): McpServerConfig[] {
    return this.read().sort((a, b) => a.createdAt - b.createdAt)
  }

  save(input: Partial<McpServerConfig> & { name?: string, command?: string }): McpServerConfig {
    if (!input.name?.trim() || !input.command?.trim()) throw new Error('请填写 MCP server 名称和启动命令')
    const records = this.read()
    const existing = input.id ? records.find(item => item.id === input.id) : undefined
    const now = Date.now()
    const record: McpServerConfig = {
      id: input.id || randomUUID(),
      name: input.name.trim(),
      command: input.command.trim(),
      args: Array.isArray(input.args) ? input.args.filter((item): item is string => typeof item === 'string') : (existing?.args || []),
      enabled: input.enabled !== false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    const next = existing ? records.map(item => item.id === record.id ? record : item) : [...records, record]
    this.write(next)
    return record
  }

  delete(id: string) {
    this.write(this.read().filter(item => item.id !== id))
  }
}
