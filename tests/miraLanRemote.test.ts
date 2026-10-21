import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiraLanRemote, isLanAddress } from '../electron/services/miraLanRemote'
import { createRemoteHarness } from '../electron/services/miraRemoteHarness'
import { createHarnessEventPublisher } from '../electron/services/harnessEventPublisher'
import { get } from 'node:http'

const running: MiraLanRemote[] = []
afterEach(async () => { await Promise.all(running.splice(0).map(server => server.stop())) })
async function setup() {
  const invoke = vi.fn(async () => ({ ok: true }))
  const server = new MiraLanRemote({ root: 'dist/harness-react-app', invoke, subscribe: () => () => undefined, addresses: () => ['127.0.0.1'] })
  running.push(server)
  const status = await server.start(); const url = new URL(status.urls[0]); const code = url.hash.slice(1); url.hash = ''
  const base = url.origin
  const post = (path: string, body: unknown, cookie?: string, origin = base) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
  return { server, invoke, base, post, code }
}
describe('LAN remote gateway', () => {
  it('recognizes private IPv4 only, excludes public/link-local/IPv6', () => {
    for (const address of ['10.0.0.1', '192.168.1.2', '172.16.0.2', '172.31.1.1', '::ffff:192.168.1.3']) expect(isLanAddress(address)).toBe(true)
    for (const address of ['8.8.8.8', '172.32.0.1', '169.254.1.1', '::1', '2001:db8::1']) expect(isLanAddress(address)).toBe(false)
  })
  it('opens a scanned link directly with same-origin and revocable cookie boundaries', async () => {
    const { server, invoke, post, code, base } = await setup()
    expect((await post('/rpc', { method: 'sessions.list' })).status).toBe(401)
    expect((await post('/connect', { key: code }, undefined, 'https://evil.test')).status).toBe(403)
    expect((await post('/connect', { key: 'wrong' })).status).toBe(403)
    const connect = await post('/connect', { key: code, name: '测试手机' })
    const cookie = connect.headers.get('set-cookie')!.split(';')[0]
    expect(await connect.json()).toEqual({ state: 'connected' })
    expect(server.status().device?.name).toBe('测试手机')
    expect((await post('/rpc', { method: 'sessions.list' }, cookie)).status).toBe(200)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect((await post('/connect', { key: code }, cookie)).status).toBe(200)
    expect((await post('/connect', { key: code })).status).toBe(409)
    expect((await post('/pair', { code })).status).toBe(405)
    expect((await fetch(base + '/../../../package.json')).status).toBe(404)
    const rebound = await new Promise<number | undefined>((accept, reject) => { get(base + '/', { headers: { Host: 'evil.test' } }, response => { response.resume(); accept(response.statusCode) }).on('error', reject) })
    expect(rebound).toBe(403)
    await server.stop()
    expect(server.status()).toEqual({ enabled: false, urls: [] })
    const next = await server.start(); const nextUrl = new URL(next.urls[0])
    expect(nextUrl.hash.slice(1)).not.toBe(code)
    expect((await fetch(nextUrl.origin + '/rpc', { method: 'POST', headers: { Origin: nextUrl.origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ method: 'sessions.list' }) })).status).toBe(401)
  })
  it('keeps the QR link valid while running and derives connected status from mobile heartbeats', async () => {
    const { server, post, code, base } = await setup()
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60000)
    try {
      const connect = await post('/connect', { key: code })
      expect(connect.status).toBe(200)
      const cookie = connect.headers.get('set-cookie')!.split(';')[0]
      expect(server.status().device).toBeDefined()
      now.mockReturnValue(Date.now() + 16000)
      expect(server.status().device).toBeUndefined()
      expect((await fetch(base + '/connection', { headers: { Cookie: cookie } })).status).toBe(200)
      expect(server.status().device).toBeDefined()
    } finally { now.mockRestore() }
  })
  it('coalesces simultaneous starts into one listener', async () => {
    const server = new MiraLanRemote({ root: 'dist/harness-react-app', invoke: async () => null, subscribe: () => () => undefined, addresses: () => ['127.0.0.1'] })
    running.push(server)
    const [a, b] = await Promise.all([server.start(), server.start()])
    expect(a.urls).toEqual(b.urls)
  })
})
function harnessSetup() {
  const sessions: Record<string, any> = { project: { id: 'project', projectId: 'p' }, loose: { id: 'loose' }, side: { id: 'side', projectId: 'p', parentSessionId: 'project' }, archived: { id: 'archived', projectId: 'p', archivedAt: 1 } }
  const database = { harness: { listProjects: () => [{ id: 'p', name: 'Mira', directory: 'secret' }], getSession: (id: string) => sessions[id], setPermission: vi.fn(), importMessageAttachments: () => [{ path: 'uploaded', name: 'a.txt', localPath: 'secret' }] }, models: { list: () => [{ id: 'm', name: 'model', providerKey: 'custom', endpoint: 'https://secret-endpoint.test', authMode: 'none', enabled: true, apiKey: 'secret', models: [{ id: 'a', enabled: true }] }] } }
  const runtime = { listSessions: () => Object.values(sessions), getSession: vi.fn(id => sessions[id]), submitMessage: vi.fn(), listPendingPermissions: () => [], onPublicEvent: () => () => undefined }
  return { database, runtime, remote: createRemoteHarness(database as any, runtime as any, () => ({}) as any) }
}
describe('remote Harness boundary', () => {
  it('excludes non-project, archived and side tasks including direct IDs', async () => {
    const { remote, runtime } = harnessSetup()
    expect(await remote.invoke('sessions.list', {})).toEqual([{ id: 'project', projectId: 'p' }])
    for (const id of ['loose', 'side', 'archived']) await expect(remote.invoke('session.get', { id })).rejects.toThrow('项目空间')
    expect(runtime.getSession).not.toHaveBeenCalled()
    for (const method of ['terminal.open', 'files.read', 'providers.save', 'remote.control']) await expect(remote.invoke(method, {})).rejects.toThrow('此功能需要在电脑上使用')
  })
  it('projects models without endpoint/credentials and denies arbitrary desktop references', async () => {
    const { remote } = harnessSetup()
    expect(JSON.stringify(await remote.invoke('providers.list', {}))).not.toContain('secret')
    const input = { sessionId: 'project', submissionId: 'submission', text: 'hello', references: [{ path: 'desktop.txt', name: 'desktop.txt' }], selection: { providerId: 'm', modelId: 'a' }, planning: false }
    await expect(remote.invoke('message.submit', input)).rejects.toThrow('手机文件')
    await expect(remote.invoke('session.create', {})).rejects.toThrow('项目空间')
  })
  it('observes desktop and background events without duplicate desktop delivery', () => {
    const observer = vi.fn(); const fallback = vi.fn(); const sender = { isDestroyed: () => false, send: vi.fn() }
    const publish = createHarnessEventPublisher(fallback, observer)
    publish(sender as any, { sessionId: 'a', type: 'status', payload: { state: 'idle' } })
    expect(sender.send).toHaveBeenCalledTimes(1); expect(observer).toHaveBeenCalledTimes(1); expect(fallback).not.toHaveBeenCalled()
    publish(undefined, { sessionId: 'a', type: 'status', payload: { state: 'idle' } })
    expect(fallback).toHaveBeenCalledTimes(1); expect(observer).toHaveBeenCalledTimes(2)
  })
})
