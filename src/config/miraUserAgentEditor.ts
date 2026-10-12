/* Agent form semantics adapted from ZCode SubagentsSection.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
import { parseDocument } from 'yaml'
import type { ModelSelection } from './harness'
import { isMiraUserAgentName, MIRA_RESERVED_USER_AGENTS, type MiraUserAgentColor } from './miraUserAgents'
import { isMiraMcpToolRule, parseMiraAgentMcpServers } from './miraAgentToolRules'

export const MIRA_USER_AGENT_COLORS: readonly MiraUserAgentColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']
export const MIRA_USER_AGENT_TOOL_OPTIONS = [
  { value: 'list_files', label: '列出文件' }, { value: 'read', label: '读取文件' },
  { value: 'edit', label: '编辑文件' }, { value: 'write', label: '写入文件' },
  { value: 'delete_file', label: '删除文件' }, { value: 'bash', label: '终端命令' },
  { value: 'web_fetch', label: '读取网页' }, { value: 'web_search', label: '搜索网页' },
  { value: 'mcp', label: 'MCP 工具（当前任务已选择）' },
] as const
export interface MiraUserAgentForm {
  name: string
  description: string
  color?: MiraUserAgentColor
  modelSelection?: ModelSelection
  tools?: string[]
  disallowedTools?: string[]
  injectAgentsMd: boolean
  systemPrompt: string
}
const aliases: Record<string, string> = { glob: 'list_files', listfiles: 'list_files', webfetch: 'web_fetch', websearch: 'web_search' }
function split(source: string) {
  const header = /^(\s*---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(source)
  if (!header) throw new Error('Markdown 缺少 YAML 元数据，请在高级编辑中修正。')
  const document = parseDocument(header[2])
  if (document.errors.length) throw new Error('YAML 格式无效，请在高级编辑中修正。')
  const metadata = document.toJS({ maxAliasCount: 0 })
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('YAML 元数据需要是字段列表。')
  return { header, document, metadata: metadata as Record<string, unknown>, body: source.slice(header[0].length) }
}
function tools(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return
  const values = typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : value
  if (!Array.isArray(values) || values.length > 64 || values.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`${field} 格式无效，请在高级编辑中修正。`)
  return [...new Set(values.map(item => {
    const value = item.trim()
    if (isMiraMcpToolRule(value)) return value
    const raw = value.toLowerCase(), name = aliases[raw] || raw
    if (!MIRA_USER_AGENT_TOOL_OPTIONS.some(tool => tool.value === name)) throw new Error(`工具 ${item} 尚未支持，请在高级编辑中修正。`)
    return name
  }))]
}
function model(value: unknown): ModelSelection | undefined {
  if (value === undefined) return
  const fields = value as Record<string, unknown>
  const valid = (value: unknown, max: number) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max && !value.includes('\0')
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !valid(fields.providerId, 128) || !valid(fields.modelId, 256)
    || fields.thinkingLevel !== undefined && !['off', 'low', 'medium', 'high'].includes(String(fields.thinkingLevel))
    || Object.keys(fields).some(key => !['providerId', 'modelId', 'thinkingLevel'].includes(key))) throw new Error('modelSelection 格式无效，请在高级编辑中修正。')
  return { providerId: fields.providerId as string, modelId: fields.modelId as string, ...(fields.thinkingLevel === undefined ? {} : { thinkingLevel: fields.thinkingLevel as ModelSelection['thinkingLevel'] }) }
}
function read(metadata: Record<string, unknown>, body: string): MiraUserAgentForm {
  const unsupported = Object.keys(metadata).filter(key => !['name', 'description', 'color', 'modelSelection', 'tools', 'disallowedTools', 'injectAgentsMd', 'enabled', 'mcpServers'].includes(key))
  if (unsupported.length) throw new Error(`字段 ${unsupported.join('、')} 尚未支持，请保留高级编辑。`)
  // The structured form does not own this advanced field; validate and preserve its YAML nodes.
  parseMiraAgentMcpServers(metadata.mcpServers)
  if (typeof metadata.name !== 'string' || !isMiraUserAgentName(metadata.name)) throw new Error('名称需要 3 至 50 位小写字母、数字或横线。')
  if (typeof metadata.description !== 'string' || !metadata.description.trim() || metadata.description.length > 1024) throw new Error('请填写用途说明，最多 1024 个字符。')
  if (metadata.color !== undefined && !MIRA_USER_AGENT_COLORS.includes(metadata.color as MiraUserAgentColor)) throw new Error('颜色无效，请在高级编辑中修正。')
  if (metadata.injectAgentsMd !== undefined && typeof metadata.injectAgentsMd !== 'boolean') throw new Error('AGENTS 继承开关格式无效，请在高级编辑中修正。')
  if (metadata.enabled !== undefined && typeof metadata.enabled !== 'boolean') throw new Error('启用开关格式无效，请在高级编辑中修正。')
  if (!body.trim()) throw new Error('请填写系统指令。')
  return { name: metadata.name, description: metadata.description, systemPrompt: body, injectAgentsMd: metadata.injectAgentsMd !== false,
    ...(metadata.color === undefined ? {} : { color: metadata.color as MiraUserAgentColor }),
    ...(metadata.modelSelection === undefined ? {} : { modelSelection: model(metadata.modelSelection) }),
    ...(metadata.tools === undefined ? {} : { tools: tools(metadata.tools, 'tools') }),
    ...(metadata.disallowedTools === undefined ? {} : { disallowedTools: tools(metadata.disallowedTools, 'disallowedTools') }),
  }
}
export function readMiraUserAgentForm(source: string): MiraUserAgentForm {
  const { metadata, body } = split(source)
  return read(metadata, body)
}
/** Patch only changed form fields; a no-op preserves every source byte and omitted defaults. */
export function writeMiraUserAgentForm(source: string, form: MiraUserAgentForm): string {
  const { header, document, metadata, body } = split(source)
  const before = read(metadata, body)
  if (MIRA_RESERVED_USER_AGENTS.some(name => name === form.name)) throw new Error('不能覆盖 Mira 内置智能体。')
  const normalized = read({ name: form.name, description: form.description, color: form.color, modelSelection: form.modelSelection,
    tools: form.tools, disallowedTools: form.disallowedTools, injectAgentsMd: form.injectAgentsMd }, form.systemPrompt)
  let changed = false
  for (const key of ['name', 'description', 'color', 'modelSelection', 'tools', 'disallowedTools', 'injectAgentsMd'] as const) {
    if (JSON.stringify(before[key]) === JSON.stringify(normalized[key])) continue
    if (normalized[key] === undefined) document.delete(key)
    else document.set(key, normalized[key])
    changed = true
  }
  if (!changed && body === normalized.systemPrompt) return source
  const output = (changed ? header[1] + document.toString().replace(/\n$/, '') + header[3] : header[0]) + normalized.systemPrompt
  if (new TextEncoder().encode(output).length > 256 * 1024) throw new Error('智能体内容超过 256KB。')
  return output
}
