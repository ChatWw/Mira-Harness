import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiraLanRemote, isLanAddress } from '../electron/services/miraLanRemote'
import { createRemoteHarness } from '../electron/services/miraRemoteHarness'
import { createHarnessEventPublisher } from '../electron/services/harnessEventPublisher'
import { get } from 'node:http'

const running: MiraLanRemote[] = []
afterEach(async () => { await Promise.all(running.splice(0).map(server => server.stop())) })
async function setup() {
  const invoke = vi.fn(async (_method: string, _params: unknown, _connectionId: string) => ({ ok: true }))
  let publish: (event: unknown) => void = () => undefined
  const server = new MiraLanRemote({ root: 'dist/harness-react-app', invoke, subscribe: listener => { publish = listener; return () => undefined }, addresses: () => ['127.0.0.1'] })
  running.push(server)
  const status = await server.start(); const url = new URL(status.urls[0]); const code = url.hash.slice(1); url.hash = ''
  const base = url.origin
  const post = (path: string, body: unknown, cookie?: string, origin = base) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
  return { server, invoke, base, post, code, publish: (event: unknown) => publish(event) }
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
    expect(server.status().devices?.map(device => device.name)).toEqual(['测试手机'])
    expect((await post('/rpc', { method: 'sessions.list' }, cookie)).status).toBe(200)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect((await post('/connect', { key: code }, cookie)).status).toBe(200)
    const second = await post('/connect', { key: code, name: '第二台手机' })
    expect(second.status).toBe(200)
    const secondCookie = second.headers.get('set-cookie')!.split(';')[0]
    expect(secondCookie).not.toBe(cookie)
    expect(server.status().devices).toHaveLength(2)
    expect((await post('/rpc', { method: 'sessions.list' }, cookie)).status).toBe(200)
    expect((await post('/rpc', { method: 'sessions.list' }, secondCookie)).status).toBe(200)
    expect(invoke.mock.calls.at(-1)?.[2]).not.toBe(invoke.mock.calls.at(-2)?.[2])
    expect((await post('/pair', { code })).status).toBe(405)
    expect((await fetch(base + '/../../../package.json')).status).toBe(404)
    const rebound = await new Promise<number | undefined>((accept, reject) => { get(base + '/', { headers: { Host: 'evil.test' } }, response => { response.resume(); accept(response.statusCode) }).on('error', reject) })
    expect(rebound).toBe(403)
    await server.stop()
    expect(server.status()).toEqual({ enabled: false, urls: [] })
    const next = await server.start(); const nextUrl = new URL(next.urls[0])
    expect(nextUrl.hash.slice(1)).not.toBe(code)
    expect((await fetch(nextUrl.origin + '/rpc', { method: 'POST', headers: { Origin: nextUrl.origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ method: 'sessions.list' }) })).status).toBe(401)
    expect((await fetch(nextUrl.origin + '/connection', { headers: { Cookie: secondCookie } })).status).toBe(401)
  })
  it('keeps the QR link valid while running and derives connected status from mobile heartbeats', async () => {
    const { server, post, code, base } = await setup()
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60000)
    try {
      const connect = await post('/connect', { key: code })
      expect(connect.status).toBe(200)
      const cookie = connect.headers.get('set-cookie')!.split(';')[0]
      expect(server.status().devices).toHaveLength(1)
      now.mockReturnValue(Date.now() + 16000)
      expect(server.status().devices).toBeUndefined()
      expect((await fetch(base + '/connection', { headers: { Cookie: cookie } })).status).toBe(200)
      expect(server.status().devices).toHaveLength(1)
    } finally { now.mockRestore() }
  })
  it('coalesces simultaneous starts into one listener', async () => {
    const server = new MiraLanRemote({ root: 'dist/harness-react-app', invoke: async () => null, subscribe: () => () => undefined, addresses: () => ['127.0.0.1'] })
    running.push(server)
    const [a, b] = await Promise.all([server.start(), server.start()])
    expect(a.urls).toEqual(b.urls)
  })

  it('broadcasts events to multiple devices and expires only the owning connection', async () => {
    const { server, post, code, base, publish } = await setup()
    const first = await post('/connect', { key: code, name: '手机' })
    const firstCookie = first.headers.get('set-cookie')!.split(';')[0]
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 60000)
    const readers: ReadableStreamDefaultReader<Uint8Array>[] = []
    try {
      const second = await post('/connect', { key: code, name: '平板' })
      const secondCookie = second.headers.get('set-cookie')!.split(';')[0]
      for (const cookie of [firstCookie, secondCookie]) {
        const stream = await fetch(base + '/events', { headers: { Cookie: cookie } })
        expect(stream.status).toBe(200)
        const reader = stream.body!.getReader(); readers.push(reader)
        expect(new TextDecoder().decode((await reader.read()).value)).toContain(': connected')
      }
      const event = { sessionId: 'project', type: 'status', payload: { state: 'idle' } }
      publish(event)
      for (const reader of readers) expect(new TextDecoder().decode((await reader.read()).value)).toContain(JSON.stringify(event))
      now.mockReturnValue(Date.now() + 6 * 60 * 60000 + 1)
      expect((await fetch(base + '/connection', { headers: { Cookie: firstCookie } })).status).toBe(401)
      expect((await fetch(base + '/connection', { headers: { Cookie: secondCookie } })).status).toBe(200)
      expect(server.status().devices?.map(device => device.name)).toEqual(['平板'])
      expect((await readers[0].read()).done).toBe(true)
      publish(event)
      expect(new TextDecoder().decode((await readers[1].read()).value)).toContain(JSON.stringify(event))
      expect((await post('/rpc', { method: 'sessions.list' }, firstCookie)).status).toBe(401)
      expect((await post('/rpc', { method: 'sessions.list' }, secondCookie)).status).toBe(200)
      await server.stop(); const restarted = new URL((await server.start()).urls[0])
      for (const cookie of [firstCookie, secondCookie]) expect((await fetch(restarted.origin + '/connection', { headers: { Cookie: cookie } })).status).toBe(401)
    } finally { for (const reader of readers) await reader.cancel().catch(() => undefined); now.mockRestore() }
  })

  it('does not revoke an in-flight request when another device connects', async () => {
    const { post, code, invoke } = await setup()
    const first = await post('/connect', { key: code })
    const cookie = first.headers.get('set-cookie')!.split(';')[0]
    let complete!: (result: { ok: boolean }) => void
    let invoked!: () => void
    const started = new Promise<void>(done => { invoked = done })
    invoke.mockImplementationOnce(() => new Promise(done => { complete = done; invoked() }))
    const pending = post('/rpc', { method: 'sessions.list' }, cookie)
    await started
    expect((await post('/connect', { key: code })).status).toBe(200)
    complete({ ok: true })
    expect((await pending).status).toBe(200)
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

  it('isolates uploaded attachment grants by connection and releases only the expired device', async () => {
    const { remote, runtime } = harnessSetup()
    const upload = { sessionId: 'project', files: [{ name: 'a.txt', mediaType: 'text/plain', data: Buffer.from('hello').toString('base64') }] }
    await remote.invoke('attachments.import', upload, 'phone')
    const input = { sessionId: 'project', submissionId: 'submission', text: 'hello', references: [{ path: 'uploaded', name: 'a.txt' }], selection: { providerId: 'm', modelId: 'a' }, planning: false }
    await remote.invoke('message.submit', input, 'phone')
    expect(runtime.submitMessage).toHaveBeenCalledOnce()
    await expect(remote.invoke('message.submit', input, 'tablet')).rejects.toThrow('此连接')
    await remote.invoke('attachments.import', upload, 'tablet')
    remote.release('phone')
    await expect(remote.invoke('message.submit', input, 'phone')).rejects.toThrow('此连接')
    await remote.invoke('message.submit', input, 'tablet')
    expect(runtime.submitMessage).toHaveBeenCalledTimes(2)
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
