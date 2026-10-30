import { parse as parseYaml } from 'yaml'
import { isMiraMcpToolRule, parseMiraAgentMcpServers } from '../../src/config/miraAgentToolRules'

const TOOL_NAMES: Record<string, string> = {
  read: 'read', list_files: 'list_files', listfiles: 'list_files', glob: 'list_files',
  edit: 'edit', write: 'write', delete_file: 'delete_file', bash: 'bash',
  web_fetch: 'web_fetch', webfetch: 'web_fetch', web_search: 'web_search', websearch: 'web_search',
}

/** Parse instructions only. Listing a profile never executes its body or loads dependencies. */
export function parseMiraPluginAgent(source: string) {
  let body = source.trim(), metadata: Record<string, unknown> = {}, name = '', description = ''
  let tools: string[] | undefined, disallowedTools: string[] | undefined, mcpServers: string[] | undefined
  const reasons: string[] = []
  const header = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(body)
  try {
    if (!header) throw new Error()
    const value = parseYaml(header[1], { maxAliasCount: 0 })
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    metadata = value; body = body.slice(header[0].length).trim()
    if (typeof metadata.name !== 'string' || !/^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/i.test(metadata.name) || metadata.name.length > 120) reasons.push('Agent name 元数据无效')
    else name = metadata.name
    if (typeof metadata.description !== 'string' || !metadata.description.trim() || metadata.description.length > 1024) reasons.push('Agent description 元数据无效')
    else description = metadata.description.trim()
    const unsupported = Object.keys(metadata).filter(key => !['name', 'description', 'tools', 'disallowedTools', 'color', 'mcpServers'].includes(key))
    if (unsupported.length) reasons.push(`Agent 元数据 ${unsupported.join('、')} 尚未支持`)
    const parseTools = (key: 'tools' | 'disallowedTools') => {
      const value = metadata[key]
      if (value === undefined) return
      const names = typeof value === 'string' ? value.split(',').map(name => name.trim()).filter(Boolean) : value
      if (!Array.isArray(names) || names.length > 64 || names.some(name => typeof name !== 'string' || !name.trim())) {
        reasons.push(`Agent ${key} 元数据无效`); return
      }
      const mapped = names.map(name => {
        const value = name.trim(), key = value.toLowerCase()
        if (key === 'mcp') return 'mcp'
        return isMiraMcpToolRule(value) ? value : Object.prototype.hasOwnProperty.call(TOOL_NAMES, key) ? TOOL_NAMES[key] : undefined
      })
      const unknown = names.filter((_name, index) => !mapped[index])
      if (unknown.length) reasons.push(`Agent ${key} 工具 ${unknown.join('、')} 尚未支持`)
      return [...new Set(mapped.filter((name): name is string => name !== undefined))]
    }
    tools = parseTools('tools'); disallowedTools = parseTools('disallowedTools')
    try { mcpServers = parseMiraAgentMcpServers(metadata.mcpServers) } catch (error) { reasons.push((error as Error).message) }
  } catch { reasons.push('Agent YAML 元数据无效，需要 name 和 description') }
  if (!body) reasons.push('Agent 正文为空')
  return { name, description, body, ...(tools !== undefined ? { tools } : {}), ...(disallowedTools !== undefined ? { disallowedTools } : {}), ...(mcpServers !== undefined ? { mcpServers } : {}), ...(reasons.length ? { unavailableReason: reasons.join('；') } : {}) }
}
