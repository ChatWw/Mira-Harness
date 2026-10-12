import { describe, expect, it } from 'vitest'
import { MIRA_USER_AGENT_TOOL_OPTIONS, readMiraUserAgentForm, writeMiraUserAgentForm } from '../src/config/miraUserAgentEditor'
import { parseMiraUserAgent } from '../electron/storage/miraUserAgentStore'

const source = '\n---\r\n# retain header comment\r\nname: code-review\r\ndescription: Review files # retain inline comment\r\ntools: Read, Glob\r\nenabled: false\r\n---\r\n\r\nKeep exact body.\r\n'
describe('user Agent structured Markdown editor', () => {
  it('preserves all bytes, aliases, disabled state and absent defaults in an unchanged form', () => {
    const form = readMiraUserAgentForm(source)
    expect(form.tools).toEqual(['read', 'list_files'])
    expect(form.injectAgentsMd).toBe(true)
    expect(writeMiraUserAgentForm(source, form)).toBe(source)
  })
  it('changes only chosen metadata, retaining comments and the complete body', () => {
    const form = readMiraUserAgentForm(source)
    const edited = writeMiraUserAgentForm(source, { ...form, description: 'New description', tools: [], color: 'cyan', injectAgentsMd: false,
      modelSelection: { providerId: 'actual-provider', modelId: 'actual-model', thinkingLevel: 'low' } })
    expect(edited).toContain('# retain header comment')
    expect(edited).toContain('# retain inline comment')
    expect(edited.endsWith(form.systemPrompt)).toBe(true)
    expect(parseMiraUserAgent(edited)).toMatchObject({ name: 'code-review', description: 'New description', enabled: false, tools: [], color: 'cyan', injectAgentsMd: false,
      modelSelection: { providerId: 'actual-provider', modelId: 'actual-model', thinkingLevel: 'low' } })
    expect(parseMiraUserAgent(edited).unavailableReason).toBeUndefined()
  })
  it('preserves the header unchanged when editing only the system prompt', () => {
    const form = readMiraUserAgentForm(source)
    expect(writeMiraUserAgentForm(source, { ...form, systemPrompt: 'New body\n' })).toBe(source.slice(0, -form.systemPrompt.length) + 'New body\n')
  })
  it('removes explicit model and tools only when inheritance is chosen', () => {
    const customized = '---\nname: code-review\ndescription: Review\ntools: []\nmodelSelection: {providerId: actual, modelId: model}\n---\nPrompt'
    const edited = writeMiraUserAgentForm(customized, { ...readMiraUserAgentForm(customized), tools: undefined, modelSelection: undefined })
    expect(parseMiraUserAgent(edited).tools).toBeUndefined()
    expect(parseMiraUserAgent(edited).modelSelection).toBeUndefined()
  })
  it.each(['background: true', 'tools: [FutureTool]', 'modelSelection: {providerId: p, modelId: m, hidden: true}', 'color: unknown', 'injectAgentsMd: no', 'enabled: no'])('refuses unsupported structured conversion without replacing the source (%s)', field => {
    const raw = `---\nname: code-review\ndescription: Review\n${field}\n---\nBody`
    expect(() => readMiraUserAgentForm(raw)).toThrow()
  })
  it('rejects malformed YAML, duplicate keys and empty instructions', () => {
    for (const raw of ['plain Markdown', '---\nname: [\n---\nBody', '---\nname: code-review\nname: new-review\ndescription: Review\n---\nBody', '---\nname: code-review\ndescription: Review\n---\n']) expect(() => readMiraUserAgentForm(raw)).toThrow()
  })
  it('rejects reserved names, empty description and instruction before producing Markdown', () => {
    const form = readMiraUserAgentForm(source)
    for (const patch of [{ name: 'reviewer' }, { description: '' }, { systemPrompt: ' ' }]) expect(() => writeMiraUserAgentForm(source, { ...form, ...patch })).toThrow()
  })
  it('offers selected-task MCP tools and preserves advanced selectors through form editing', () => {
    expect(MIRA_USER_AGENT_TOOL_OPTIONS).toContainEqual({ value: 'mcp', label: 'MCP 工具（当前任务已选择）' })
    const raw = '---\nname: code-review\ndescription: Review\ntools: [MCP, Read, mcp__plugin:Probe@local:Echo.server-1__*, mira_mcp_0123456789_Echo_tool_abcdef01]\ndisallowedTools: [mcp__plugin:Probe@local:Echo.server-1__Echo.tool_1]\n---\nPrompt\n'
    const form = readMiraUserAgentForm(raw)
    expect(form.tools).toEqual(['mcp', 'read', 'mcp__plugin:Probe@local:Echo.server-1__*', 'mira_mcp_0123456789_Echo_tool_abcdef01'])
    expect(writeMiraUserAgentForm(raw, form)).toBe(raw)
    const edited = writeMiraUserAgentForm(raw, { ...form, description: 'Edited review', color: 'cyan' })
    const parsed = parseMiraUserAgent(edited)
    expect(parsed.unavailableReason).toBeUndefined()
    expect(parsed.tools).toEqual(form.tools)
    expect(parsed.disallowedTools).toEqual(form.disallowedTools)
  })
  it('round-trips comma-separated MCP selectors without changing their case', () => {
    const raw = '---\nname: code-review\ndescription: Review\ntools: "Read, mcp__plugin:Echo__Echo.tool, mcp"\ndisallowedTools: "mcp__plugin:Echo__*"\n---\nPrompt'
    const form = readMiraUserAgentForm(raw)
    expect(form.tools).toEqual(['read', 'mcp__plugin:Echo__Echo.tool', 'mcp'])
    const edited = writeMiraUserAgentForm(raw, { ...form, tools: [...form.tools!, 'mcp__other__*'] })
    expect(parseMiraUserAgent(edited)).toMatchObject({ tools: ['read', 'mcp__plugin:Echo__Echo.tool', 'mcp', 'mcp__other__*'], disallowedTools: ['mcp__plugin:Echo__*'] })
  })
  it('preserves validated advanced parent MCP names while editing structured fields', () => {
    const raw = '---\nname: code-review\ndescription: Review\n# Keep parent scope\nmcpServers: ["plugin:Probe:Echo", Search] # selected connected names\n---\nPrompt'
    const form = readMiraUserAgentForm(raw)
    expect(writeMiraUserAgentForm(raw, form)).toBe(raw)
    const edited = writeMiraUserAgentForm(raw, { ...form, description: 'Updated' })
    expect(edited).toContain('# Keep parent scope')
    expect(edited).toContain('# selected connected names')
    expect(parseMiraUserAgent(edited)).toMatchObject({ description: 'Updated', mcpServers: ['plugin:Probe:Echo', 'Search'] })
    expect(parseMiraUserAgent(edited).unavailableReason).toBeUndefined()
  })
  it.each(['tools: ["mcp__server__tool*"]', 'disallowedTools: ["mcp__*__*"]', 'mcpServers: [{new: {command: node}}]', 'mcpServers: [7]', 'mcpServers: [" "]'])('keeps unsupported selectors and independent MCP declarations in advanced editing (%s)', field => {
    expect(() => readMiraUserAgentForm(`---\nname: code-review\ndescription: Review\n${field}\n---\nPrompt`)).toThrow()
  })
})
