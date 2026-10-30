const mcpSelector = /^mcp__[A-Za-z0-9:@._-]+__(?:\*|[A-Za-z0-9:@._-]+)$/
const miraMcpName = /^mira_mcp_[a-f0-9]{10}_[A-Za-z0-9_-]{1,28}_[a-f0-9]{8}$/

/** Profile names reference the parent's connected services, never standalone connection definitions. */
export function parseMiraAgentMcpServers(value: unknown): string[] | undefined {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > 64 || value.some(name => typeof name !== 'string' || !name.trim() || name.length > 256 || /[\u0000-\u001f\u007f]/.test(name))) throw new Error('Agent mcpServers 必须是父任务 MCP 服务名称的字符串数组')
  return [...new Set(value.map(name => name.trim()))]
}

export function isMiraMcpToolRule(value: string): boolean {
  return value === 'mcp' || mcpSelector.test(value) || miraMcpName.test(value)
}

/** Host metadata identifies MCP tools; a profile never broadens the supplied tool pool. */
export function matchesMiraAgentToolRule(rule: string, tool: { name: string; miraMcpServerName?: unknown; miraMcpToolName?: unknown }): boolean {
  const server = typeof tool.miraMcpServerName === 'string' && tool.miraMcpServerName ? tool.miraMcpServerName : undefined
  if (!isMiraMcpToolRule(rule)) return !server && rule === tool.name
  if (!server) return false
  if (rule === 'mcp') return true
  if (miraMcpName.test(rule)) return rule === tool.name
  const originalName = typeof tool.miraMcpToolName === 'string' && tool.miraMcpToolName ? tool.miraMcpToolName : tool.name
  return rule === `mcp__${server}__*` || rule === `mcp__${server}__${originalName}`
}
