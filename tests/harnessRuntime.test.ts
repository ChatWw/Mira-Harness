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
})
