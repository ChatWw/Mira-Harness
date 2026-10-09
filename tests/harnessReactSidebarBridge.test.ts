import { describe, expect, it, vi } from 'vitest'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'

describe('Harness sidebar real host contracts', () => {
  it('bounds archived pagination and only exposes the approved query fields', () => {
    expect(parseFirstPartyHarnessCall('sessions.history', { archiveView: 'archived', sort: 'created-desc', page: 2, pageSize: 50, q: '任务', database: '/private/user.db' })).toEqual({ method: 'sessions.history', query: { archiveView: 'archived', sort: 'created-desc', page: 2, pageSize: 50, q: '任务' } })
    for (const patch of [{ page: 0 }, { page: 1.2 }, { pageSize: 101 }, { sort: 'random' }, { archiveView: 'all' }, { q: '\0' }]) expect(() => parseFirstPartyHarnessCall('sessions.history', patch)).toThrow()
    expect(parseFirstPartyHarnessCall('session.restore', { id: 'archived', path: '/injected' })).toEqual({ method: 'session.restore', id: 'archived' })
  })
  it('transports real archive read, restore and host failure over the MessageChannel contract', async () => {
    const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    const read = host.queryHistory({ archiveView: 'archived', page: 1 })
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.sessions.history', params: { archiveView: 'archived', page: 1 } })
    port.onmessage!({ data: { type: 'mira:response', id: '1', ok: true, value: { rows: [{ id: 'archived' }], total: 1 } } })
    await expect(read).resolves.toMatchObject({ rows: [{ id: 'archived' }], total: 1 })
    const restore = host.restoreSession('archived')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.session.restore', params: { id: 'archived' } })
    port.onmessage!({ data: { type: 'mira:response', id: '2', ok: false, error: { message: '恢复失败' } } })
    await expect(restore).rejects.toThrow('恢复失败')
    host.close()
  })
  it('exposes the host-owned composer preferences without reading a renderer namespace', async () => {
    const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    const reading = host.getComposerPreferences()
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.composer.preferences', params: undefined })
    port.onmessage!({ data: { type: 'mira:response', id: '1', ok: true, value: { sendShortcut: 'mod-enter', showContextUsage: false } } })
    await expect(reading).resolves.toEqual({ sendShortcut: 'mod-enter', showContextUsage: false })
    host.close()
  })
})
