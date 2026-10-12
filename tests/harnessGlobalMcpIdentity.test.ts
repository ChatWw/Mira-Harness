import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Agent } from '@earendil-works/pi-agent-core'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { McpManager } from '../electron/adapters/mcpManager'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import { matchesMiraAgentToolRule } from '../src/config/miraAgentToolRules'

const nameFor = (id: string, name: string) => `mira_mcp_${createHash('sha256').update(id).digest('hex').slice(0, 10)}_${name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28)}_${createHash('sha256').update(name).digest('hex').slice(0, 8)}`
function setup(names = ['echo', 'echo']) {
  const calls: { server: string; name: string; arguments: unknown }[] = [], manager = new McpManager()
  const remote = names.map((name, index) => ({ ...(manager as any).toAgentTool({ name, inputSchema: { type: 'object', properties: {}, additionalProperties: false } }, { callTool: async (request: any) => { calls.push({ server: `server-${index}`, ...request }); return { content: [{ type: 'text', text: `server-${index}` }] } } }, `Server ${index}`, `server-${index}`), miraMcpServerId: `server-${index}` }))
  const database = { memories: { enabled: () => false }, harness: { getSession: () => ({ permissionMode: 'default', activeMcpServerIds: names.map((_name, index) => `server-${index}`) }), getPermissionConfig: () => ({ globalDefaultMode: 'default', dangerousCommands: [] }), recordTool: vi.fn(), updateTool: vi.fn() } }
  const runtime = new HarnessRuntime(database as any, manager)
  const registered = (options = {}) => (runtime as any).tools(undefined, 'probe', { mcpTools: remote, ...options })
  return { calls, remote, runtime, registered }
}
describe('global MCP execution identity', () => {
  it('gives same-named services stable distinct names, preserving exact original identity and remote dispatch', async () => {
    const view = setup()
    expect(view.remote.map(tool => tool.name)).toEqual([nameFor('server-0', 'echo'), nameFor('server-1', 'echo')])
    expect(view.remote[0]).toMatchObject({ label: 'echo', miraMcpToolName: 'echo', miraMcpServerName: 'Server 0' })
    expect(view.remote[0].description).toContain('MCP 服务“Server 0”的工具“echo”')
    expect(view.remote[1].description).toContain('MCP 服务“Server 1”的工具“echo”')
    for (const tool of view.remote) await tool.execute('call', {})
    expect(view.calls).toEqual([{ server: 'server-0', name: 'echo', arguments: {} }, { server: 'server-1', name: 'echo', arguments: {} }])
  })
  it('keeps built-in read/bash schemas and permission risk separate from same-named MCP tools', () => {
    const view = setup(['read', 'bash']), registered = view.registered()
    expect(registered.tools.filter((tool: any) => tool.name === 'read')).toHaveLength(1)
    expect(registered.tools.filter((tool: any) => tool.name === 'bash')).toHaveLength(1)
    expect(registered.descriptors.get('read').risk).toBe('read')
    expect(registered.descriptors.get('bash').risk).toBe('command')
    expect(registered.tools.find((tool: any) => tool.name === 'bash').parameters.properties.command).toBeDefined()
    for (const [index, original] of ['read', 'bash'].entries()) {
      const name = nameFor(`server-${index}`, original)
      expect(registered.descriptors.get(name).risk).toBe('mcp')
      expect(registered.descriptors.get(name).detail({})).toContain(`Server ${index} / ${original}`)
    }
  })
  it('real pi Agent approval and execution select the same requested service among duplicate original names', async () => {
    const view = setup(), registered = view.registered(), requests: any[] = []
    const requestedName = nameFor('server-1', 'echo')
    let response = 0
    const streamFn = () => {
      const stream = createAssistantMessageEventStream(), first = response++ === 0
      const message: any = { role: 'assistant', content: first ? [{ type: 'toolCall', id: 'identity-probe', name: requestedName, arguments: {} }] : [{ type: 'text', text: 'done' }], api: 'openai-completions', provider: 'probe', model: 'probe', timestamp: Date.now(), stopReason: first ? 'toolUse' : 'stop', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
      queueMicrotask(() => { stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: message.stopReason, message }) })
      return stream
    }
    const sender = { isDestroyed: () => false, send: (_channel: string, event: any) => { if (event.type === 'permission-request') { requests.push(event.payload); view.runtime.resolvePermission(event.payload.requestId, true) } } }
    const agent = new Agent({ initialState: { systemPrompt: 'probe', model: { id: 'probe', provider: 'probe', api: 'openai-completions' }, tools: registered.tools }, streamFn,
      beforeToolCall: ({ toolCall, args }: any) => (view.runtime as any).preflightToolCall(sender, 'probe', registered.descriptors, toolCall.name, args) } as any)
    await agent.prompt('Use second service echo')
    expect(requests).toHaveLength(1)
    expect(requests[0].detail).toContain('Server 1 / echo')
    expect(view.calls).toEqual([{ server: 'server-1', name: 'echo', arguments: {} }])
    expect(agent.state.messages.find((message: any) => message.role === 'toolResult')).toMatchObject({ toolName: requestedName, isError: false, content: [{ type: 'text', text: 'server-1' }] })
  })
  it.each(['explorer', 'reviewer'] as const)('does not mix a selected MCP named read/bash into the %s local tool surface', role => {
    const registered = setup(['read', 'bash']).registered({ role })
    expect(registered.tools.filter((tool: any) => typeof tool.miraMcpServerId === 'string')).toEqual([])
    expect(registered.tools.filter((tool: any) => tool.name === 'read')).toHaveLength(1)
    expect(registered.descriptors.get('read').risk).toBe('read')
  })
  it('Plan exposes only actual built-in read tools even if selected MCP uses built-in names', () => {
    const registered = setup(['read', 'web_fetch', 'ask_user', 'present_plan']).registered({ planning: true })
    expect(registered.tools.filter((tool: any) => typeof tool.miraMcpServerId === 'string')).toEqual([])
    for (const name of ['read', 'web_fetch', 'ask_user', 'present_plan']) expect(registered.tools.filter((tool: any) => tool.name === name)).toHaveLength(1)
  })
  it.each(['tester', 'implementer'] as const)('borrows the same stable identities for parent and %s while matching original selectors', role => {
    const view = setup(), parent = view.registered(), child = view.registered({ role, subtaskId: 'child' })
    const names = (registered: any) => registered.tools.filter((tool: any) => typeof tool.miraMcpServerId === 'string').map((tool: any) => tool.name)
    expect(names(parent)).toEqual([nameFor('server-0', 'echo'), nameFor('server-1', 'echo')])
    expect(names(child)).toEqual(names(parent))
    // Rule fields intentionally use a server selector that follows the supported no-space syntax.
    const tool = { ...view.remote[1], miraMcpServerName: 'SecondServer' }
    expect(matchesMiraAgentToolRule('mcp__SecondServer__echo', tool)).toBe(true)
    expect(matchesMiraAgentToolRule('mcp__SecondServer__echo', view.remote[0])).toBe(false)
  })
})
