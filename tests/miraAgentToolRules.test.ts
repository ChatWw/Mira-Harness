import { describe, expect, it } from 'vitest'
import { isMiraMcpToolRule, matchesMiraAgentToolRule } from '../src/config/miraAgentToolRules'
import { parseMiraPluginAgent } from '../electron/storage/miraPluginAgents'

const executionName = 'mira_mcp_0123456789_Echo_tool_abcdef01'
const remote = { name: executionName, miraMcpServerName: 'plugin:Probe@local:Echo.server-1', miraMcpToolName: 'Echo.tool_1' }
const profile = (fields: string) => `---\nname: reviewer-agent\ndescription: Review work\n${fields}\n---\nReview the files.`

describe('Agent tool rules', () => {
  it.each(['mcp', 'mcp__plugin:probe:echo__*', 'mcp__plugin:Probe@local:Echo.server-1__Echo.tool_1', executionName])('accepts the supported MCP rule %s', rule => {
    expect(isMiraMcpToolRule(rule)).toBe(true)
  })
  it.each(['*', 'mcp__*__*', 'mcp__server__tool*', 'mcp__server__', 'mcp____echo', 'mcp__server with spaces__*', 'mcp__server__/tool', 'mcp__server__tool?', 'mira_mcp_fake_tool', 'mira_mcp_0123456789_echo_abcdefgh'])('rejects arbitrary globs and malformed MCP rules %s', rule => {
    expect(isMiraMcpToolRule(rule)).toBe(false)
    expect(parseMiraPluginAgent(profile(`tools: [${JSON.stringify(rule)}]`)).unavailableReason).toContain('尚未支持')
  })
  it('matches every selected host MCP tool without granting any local tool', () => {
    expect(matchesMiraAgentToolRule('mcp', remote)).toBe(true)
    expect(matchesMiraAgentToolRule('mcp', { name: 'search', miraMcpServerName: 'Normal server' })).toBe(true)
    for (const tool of [{ name: 'read' }, { name: executionName }, { name: 'mcp', miraMcpServerName: 7 }, { name: 'mcp', miraMcpServerName: '' }]) expect(matchesMiraAgentToolRule('mcp', tool)).toBe(false)
  })
  it('uses case-sensitive host server and original tool identities rather than execution-name labels', () => {
    expect(matchesMiraAgentToolRule('mcp__plugin:Probe@local:Echo.server-1__*', remote)).toBe(true)
    expect(matchesMiraAgentToolRule('mcp__plugin:Probe@local:Echo.server-1__Echo.tool_1', remote)).toBe(true)
    expect(matchesMiraAgentToolRule('mcp__plugin:probe@local:echo.server-1__*', remote)).toBe(false)
    expect(matchesMiraAgentToolRule('mcp__plugin:Probe@local:Echo.server-1__echo.tool_1', remote)).toBe(false)
    expect(matchesMiraAgentToolRule('mcp__different__*', remote)).toBe(false)
    expect(matchesMiraAgentToolRule('mcp__Echo.server-1__*', remote)).toBe(false)
    expect(matchesMiraAgentToolRule('mcp__plugin:Probe@local:Echo.server-1__Echo.tool_1', { name: 'Echo.tool_1' })).toBe(false)
  })
  it('matches the actual exact Mira execution name only on host MCP tools', () => {
    expect(matchesMiraAgentToolRule(executionName, remote)).toBe(true)
    expect(matchesMiraAgentToolRule(executionName, { ...remote, name: executionName.replace('Echo_tool', 'Other_tool') })).toBe(false)
    expect(matchesMiraAgentToolRule(executionName, { name: executionName })).toBe(false)
  })
  it('supports normal MCP names and does not apply local aliases to remote tool identity', () => {
    expect(matchesMiraAgentToolRule('mcp__server__Read', { name: 'Read', miraMcpServerName: 'server' })).toBe(true)
    expect(matchesMiraAgentToolRule('mcp__server__read', { name: 'Read', miraMcpServerName: 'server' })).toBe(false)
    expect(matchesMiraAgentToolRule('read', { name: 'read' })).toBe(true)
    expect(matchesMiraAgentToolRule('read', { name: 'read', miraMcpServerName: 'server' })).toBe(false)
  })
  it('shares identical matching for allowed and disallowed selectors without extending the input pool', () => {
    const rules = ['mcp__plugin:Probe@local:Echo.server-1__*', 'read']
    const candidates = [remote, { name: 'read' }, { name: 'bash' }, { ...remote, miraMcpServerName: 'other' }]
    const allowed = candidates.filter(tool => rules.some(rule => matchesMiraAgentToolRule(rule, tool)))
    expect(allowed).toEqual([remote, { name: 'read' }])
    expect(allowed.filter(tool => !matchesMiraAgentToolRule('mcp__plugin:Probe@local:Echo.server-1__Echo.tool_1', tool))).toEqual([{ name: 'read' }])
  })
  it('parses both MCP list fields preserving selectors and normalizing only local aliases', () => {
    const parsed = parseMiraPluginAgent(profile(`tools: [Read, Glob, MCP, mcp__plugin:Probe@local:Echo.server-1__*, ${executionName}]\ndisallowedTools: [WebFetch, mcp__plugin:Probe@local:Echo.server-1__Echo.tool_1]`))
    expect(parsed.unavailableReason).toBeUndefined()
    expect(parsed.tools).toEqual(['read', 'list_files', 'mcp', 'mcp__plugin:Probe@local:Echo.server-1__*', executionName])
    expect(parsed.disallowedTools).toEqual(['web_fetch', 'mcp__plugin:Probe@local:Echo.server-1__Echo.tool_1'])
  })
  it('parses only parent service names, preserving exact case and an empty inherited scope', () => {
    const parsed = parseMiraPluginAgent(profile('tools: [mcp]\nmcpServers: [" plugin:Probe:Echo ", Search, Search]'))
    expect(parsed).toMatchObject({ tools: ['mcp'], mcpServers: ['plugin:Probe:Echo', 'Search'] })
    expect(parsed.unavailableReason).toBeUndefined()
    expect(parseMiraPluginAgent(profile('mcpServers: []')).mcpServers).toEqual([])
    expect(parseMiraPluginAgent(profile('tools: [Read]')).mcpServers).toBeUndefined()
  })
  it.each(['Search', 'null', '[" "]', '[7]', '[true]', '[{search: {command: node}}]', '{search: {command: node}}', '[[search]]'])('rejects independent connection definitions or malformed server names (%s)', value => {
    expect(parseMiraPluginAgent(profile(`mcpServers: ${value}`)).unavailableReason).toContain('mcpServers')
  })
})
