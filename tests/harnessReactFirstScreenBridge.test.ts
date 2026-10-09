import { describe, expect, it, vi } from 'vitest'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'

describe('first-screen contracts', () => {
  it('preserves the expected run ID at both stop boundaries and rejects invalid IDs', () => {
    const first = parseFirstPartyHarnessCall('run.abort', { sessionId: 's', expectedRunId: 'run-1', injected: 'other' })
    const { method, ...params } = first
    expect(first).toEqual({ method: 'run.abort', sessionId: 's', expectedRunId: 'run-1' })
    expect(parseFirstPartyHarnessCall(method, params)).toEqual(first)
    expect(parseFirstPartyHarnessCall(method, { sessionId: 's' })).toEqual({ method: 'run.abort', sessionId: 's' })
    for (const expectedRunId of ['', '\0', 42, 'x'.repeat(129)]) expect(() => parseFirstPartyHarnessCall(method, { sessionId: 's', expectedRunId })).toThrow()
  })

  it('transports a run-specific stop without discarding its identity', async () => {
    const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    const stopped = host.abortRun('s', 'run-1')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.run.abort', params: { sessionId: 's', expectedRunId: 'run-1' } })
    port.onmessage!({ data: { type: 'mira:response', id: '1', ok: true, value: true } })
    await stopped
    host.close()
  })
  it('allows parameter-free MCP listing on both sides of the bridge', () => {
    expect(parseFirstPartyHarnessCall('mcp.list', undefined)).toEqual({ method: 'mcp.list' })
    expect(parseFirstPartyHarnessCall('mcp.list', {})).toEqual({ method: 'mcp.list' })
  })
  it('preserves archive filters through renderer and Electron parsing', () => {
    const first = parseFirstPartyHarnessCall('sessions.history', { archiveView: 'archived', sort: 'created-desc', page: 3, pageSize: 20, q: '正文' })
    const { method, ...params } = first
    expect(parseFirstPartyHarnessCall(method, params)).toEqual(first)
    expect(() => parseFirstPartyHarnessCall(method, { query: { archiveView: 'all', pageSize: 999 } })).toThrow()
  })

  it('validates automation inputs at both boundaries without changing permissions', () => {
    const input = { name: '整理任务', projectId: 'project', prompt: '整理文档', model: { providerId: 'provider', modelId: 'model', thinkingLevel: 'low' }, permissionMode: 'default', enabled: true, trigger: { type: 'cron', expression: '0 9 * * 1-5' }, target: { type: 'new-session' }, injected: '/root' }
    const first = parseFirstPartyHarnessCall('automations.save', { input })
    const { method, ...params } = first
    expect(parseFirstPartyHarnessCall(method, params)).toEqual(first)
    expect(first).toMatchObject({ input: { permissionMode: 'default' } })
    expect(first).not.toHaveProperty('input.injected')
    for (const patch of [{ enabled: 'yes' }, { permissionMode: 'unsafe' }, { prompt: 'x'.repeat(100_001) }, { trigger: { type: 'once', scheduledAt: NaN } }, { target: { type: 'unknown' } }]) expect(() => parseFirstPartyHarnessCall(method, { input: { ...input, ...patch } })).toThrow()
  })

  it('accepts only bounded conversation queries and project targets', () => {
    expect(parseFirstPartyHarnessCall('sessions.search', { query: '  内容%  ', url: 'https://invalid' })).toEqual({ method: 'sessions.search', query: '内容%' })
    for (const query of ['', ' ', '\0', 'x'.repeat(257)]) expect(() => parseFirstPartyHarnessCall('sessions.search', { query })).toThrow()
    expect(() => parseFirstPartyHarnessCall('projects.open', { projectId: 'project', target: '/tmp/other' })).toThrow()
  })

  it('uses a host-owned event for the shared command center and cleans its subscription', () => {
    const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    const listener = vi.fn(), unsubscribe = host.onCommandCenterOpen(listener)
    port.onmessage!({ data: { type: 'mira:command-center-open' } })
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    port.onmessage!({ data: { type: 'mira:command-center-open' } })
    expect(listener).toHaveBeenCalledOnce()
    host.close()
  })
})
