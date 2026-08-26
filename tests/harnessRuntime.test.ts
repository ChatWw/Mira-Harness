import { describe, expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../electron/harnessRuntime'

function setup(permissionMode: 'default' | 'auto-approve' | 'full' = 'default') {
  const sender = { isDestroyed: () => false, send: vi.fn() }
  const database = {
    memories: { enabled: () => false },
    harness: {
      getSession: () => ({ permissionMode }),
      getPermissionConfig: () => ({ dangerousCommands: [' shutdown '] }),
      recordTool: vi.fn(), updateTool: vi.fn(),
    },
  }
  const mcpManager = {
    getTools: () => [{ name: 'mcp_query', label: 'mcp_query', miraMcpServerName: '测试 MCP', execute: vi.fn() }],
  }
  const runtime = new HarnessRuntime(database as any, mcpManager as any)
  const registered = (runtime as any).tools(sender, 'session-1')
  return { runtime, sender, registered }
}

describe('HarnessRuntime tool approval', () => {
  it('does not inject MCP tools for sessions without selected services', () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const getTools = vi.fn(() => [])
    const database = {
      memories: { enabled: () => false },
      harness: {
        getSession: () => ({ permissionMode: 'default' }),
        getPermissionConfig: () => ({ dangerousCommands: [] }),
        recordTool: vi.fn(), updateTool: vi.fn(),
      },
    }
    const runtime = new HarnessRuntime(database as any, { getTools } as any)

    ;(runtime as any).tools(sender, 'session-1')

    expect(getTools).toHaveBeenCalledWith([])
  })

  it('only asks the MCP manager for tools selected by the current session', () => {
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const getTools = vi.fn(() => [{ name: 'mcp_query', label: 'mcp_query', miraMcpServerName: '测试 MCP', execute: vi.fn() }])
    const database = {
      memories: { enabled: () => false },
      harness: {
        getSession: () => ({ permissionMode: 'default', activeMcpServerIds: ['filesystem'] }),
        getPermissionConfig: () => ({ dangerousCommands: [] }),
        recordTool: vi.fn(), updateTool: vi.fn(),
      },
    }
    const runtime = new HarnessRuntime(database as any, { getTools } as any)

    ;(runtime as any).tools(sender, 'session-1')

    expect(getTools).toHaveBeenCalledWith(['filesystem'])
  })

  it('allows read and web tools by default, but requests approval for writes and MCP', async () => {
    const { runtime, sender, registered } = setup()
    const preflight = (name: string, args: unknown) => (runtime as any).preflightToolCall(sender, 'session-1', registered.descriptors, name, args)

    await expect(preflight('read', { path: 'README.md' })).resolves.toBeUndefined()
    await expect(preflight('web_search', { query: 'PI Agent' })).resolves.toBeUndefined()
    const pending = preflight('mcp_query', { token: 'secret-value', query: 'hello' })
    const request = sender.send.mock.calls.at(-1)?.[1].payload
    expect(request.title).toContain('mcp_query')
    expect(request.detail).toContain('测试 MCP / mcp_query')
    expect(request.detail).toContain('token=***')
    ;(runtime as any).resolvePermission(request.requestId, true)
    await expect(pending).resolves.toBeUndefined()
  })

  it('keeps dangerous bash commands blocked in every permission mode', async () => {
    const { runtime, sender, registered } = setup('full')
    await expect((runtime as any).preflightToolCall(sender, 'session-1', registered.descriptors, 'bash', { command: 'rm -rf build' }))
      .resolves.toEqual({ block: true, reason: '危险命令已被永久拦截' })
  })

  it('registers set_plan as an auto-approved read tool', async () => {
    const { runtime, sender, registered } = setup()
    const planTool = registered.tools.find((tool: any) => tool.name === 'set_plan')
    expect(planTool).toBeTruthy()
    expect(registered.descriptors.get('set_plan')?.risk).toBe('read')
    await expect((runtime as any).preflightToolCall(sender, 'session-1', registered.descriptors, 'set_plan', { steps: [{ label: '读取配置' }] }))
      .resolves.toBeUndefined()
  })

  it('set_plan.execute is a no-op that returns a confirmation', async () => {
    const { registered } = setup()
    const planTool = registered.tools.find((tool: any) => tool.name === 'set_plan')
    const result = await planTool.execute('plan-id', { steps: [{ label: '读取配置' }] })
    expect(result.content?.[0]?.text).toContain('计划已记录')
  })
})
