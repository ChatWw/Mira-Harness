import { describe, expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../electron/services/harnessRuntime'

describe('computer action records in the Harness runtime', () => {
  it('records redacted action summaries, updates changed arguments and marks native Esc as cancellation', async () => {
    const records: any[] = []
    const recordTool = vi.fn((_session, record) => records.push(record))
    const updateTool = vi.fn((_session, id, patch) => Object.assign(records.find(row => row.id === id), patch))
    const database = { memories: { enabled: () => false }, harness: {
      getSession: () => ({ permissionMode: 'full', toolCalls: records }),
      getPermissionConfig: () => ({ dangerousCommands: [] }), recordTool, updateTool,
    } }
    const tool = { name: 'mcp_desktop', label: 'click', miraMcpToolName: 'click', miraComputerUse: true, miraMcpServerName: '电脑控制', execute: vi.fn(async () => { throw new DOMException('用户按 Esc 停止了电脑控制', 'AbortError') }) }
    const runtime = new HarnessRuntime(database as any, { getTools: () => [tool] } as any)
    const sender = { isDestroyed: () => false, send: vi.fn() }
    const registry = (runtime as any).tools(sender, 'session', { runId: 'run', secrets: ['private-name'] })
    registry.prepareTool('call', tool.name, { target: { name: 'private-name' }, x: 10, y: 20 })
    expect(records[0].computerUse.action).toBe('点击')
    expect(records[0].computerUse.target).not.toContain('private-name')
    registry.prepareTool('call', tool.name, { x: 30, y: 40 })
    expect(records[0].computerUse.target).toBe('(30, 40)')
    await expect(registry.tools.find((item: any) => item.name === tool.name).execute('call', { x: 30, y: 40 })).rejects.toMatchObject({ name: 'AbortError' })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ status: 'cancelled', error: '用户按 Esc 停止了电脑控制', computerUse: { action: '点击', target: '(30, 40)' } })
  })
})
