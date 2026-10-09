import { describe, expect, it, vi } from 'vitest'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'

function fixture() {
  const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
  const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
  const receive = (data: unknown) => port.onmessage?.({ data })
  return { host, port, receive }
}

describe('React Harness prepare-leave handshake', () => {
  it('reads Git decorations using the captured session and exact relative paths', async () => {
    const { host, port, receive } = fixture()
    const status = host.getWorkspaceGit('session-a')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.git-status', params: { sessionId: 'session-a' } })
    const value = { available: true, entries: [{ path: 'src/mira.ts', status: 'modified' }] }
    receive({ type: 'mira:response', id: '1', ok: true, value })
    await expect(status).resolves.toEqual(value)
    const ignored = host.getWorkspaceIgnored('session-a', ['src/mira.ts', 'node_modules'])
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.files.git-ignored', params: { sessionId: 'session-a', paths: ['src/mira.ts', 'node_modules'] } })
    receive({ type: 'mira:response', id: '2', ok: true, value: ['node_modules'] })
    await expect(ignored).resolves.toEqual(['node_modules'])
    host.close()
  })
  it('reads a bitmap through a session-scoped image method without renderer MIME or size controls', async () => {
    const { host, port, receive } = fixture()
    const reading = host.readImage('session-a', 'assets/mira@2x.png')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.read-image', params: { sessionId: 'session-a', path: 'assets/mira@2x.png' } })
    const value = { path: 'assets/mira@2x.png', mediaType: 'image/png', dataBase64: 'aW1hZ2U=', byteLength: 5 }
    receive({ type: 'mira:response', id: '1', ok: true, value })
    await expect(reading).resolves.toEqual(value)
    const failure = host.readImage('session-a', 'assets/missing.png')
    receive({ type: 'mira:response', id: '2', ok: false, error: { message: '文件或目录不存在' } })
    await expect(failure).rejects.toThrow('文件或目录不存在')
    host.close()
  })
  it('sends scoped file watches and editor operations through the first-party contract', async () => {
    const { host, port, receive } = fixture()
    const watching = host.watchFiles('session', ['', 'src'])
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '1', method: 'harness.files.watch', params: { sessionId: 'session', paths: ['', 'src'] } })
    receive({ type: 'mira:response', id: '1', ok: true, value: { watchId: 'watch' } })
    await expect(watching).resolves.toEqual({ watchId: 'watch' })
    const unwatching = host.unwatchFiles('session', 'watch')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '2', method: 'harness.files.unwatch', params: { sessionId: 'session', watchId: 'watch' } })
    receive({ type: 'mira:response', id: '2', ok: true })
    await unwatching
    const editors = host.listEditors(true)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '3', method: 'harness.editors.list', params: { refresh: true } })
    receive({ type: 'mira:response', id: '3', ok: true, value: [{ id: 'code', name: 'Visual Studio Code' }] })
    await expect(editors).resolves.toEqual([{ id: 'code', name: 'Visual Studio Code' }])
    const editing = host.openFileInEditor('session', 'src/main.ts', 'code')
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: '4', method: 'harness.files.open-editor', params: { sessionId: 'session', path: 'src/main.ts', editorId: 'code' } })
    receive({ type: 'mira:response', id: '4', ok: true })
    await editing
    host.close()
  })
  it('acknowledges the shell only after the registered draft flush completes', async () => {
    const { host, port, receive } = fixture()
    let finishSave: (() => void) | undefined
    host.onPrepareLeave(() => new Promise<void>(resolve => { finishSave = resolve }))
    receive({ type: 'mira:prepare-leave', id: 'leave-1' })
    await Promise.resolve()
    expect(port.postMessage).not.toHaveBeenCalled()
    finishSave!()
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'mira:leave-ready', id: 'leave-1', ok: true }))
    host.close()
  })

  it('reports a rejected save instead of acknowledging a successful leave', async () => {
    const { host, port, receive } = fixture()
    host.onPrepareLeave(async () => { throw new Error('无法保存草稿') })
    receive({ type: 'mira:prepare-leave', id: 'leave-2' })
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'mira:leave-ready', id: 'leave-2', ok: false, error: '无法保存草稿' }))
    host.onPrepareLeave(() => Promise.reject())
    receive({ type: 'mira:prepare-leave', id: 'leave-3' })
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'mira:leave-ready', id: 'leave-3', ok: false, error: '草稿保存失败' }))
    host.close()
  })

  it('does not reply from a disconnected frame after a late save resolves', async () => {
    const { host, port, receive } = fixture()
    let finishSave: (() => void) | undefined
    host.onPrepareLeave(() => new Promise<void>(resolve => { finishSave = resolve }))
    receive({ type: 'mira:prepare-leave', id: 'leave-4' })
    await Promise.resolve()
    host.close()
    finishSave!()
    await Promise.resolve()
    await Promise.resolve()
    expect(port.postMessage).not.toHaveBeenCalled()
    expect(port.close).toHaveBeenCalledOnce()
  })
})
