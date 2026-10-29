import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { MiraRemoteStatus } from '../../src/config/miraRemote'

export function isLanAddress(address: string) {
  const value = address.replace(/^::ffff:/, '')
  return /^10\.\d+\.\d+\.\d+$/.test(value) || /^192\.168\.\d+\.\d+$/.test(value) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(value) || value === '127.0.0.1'
}
type Device = { token: string; name: string; expiresAt: number; connectedAt: number; lastSeen: number }
type RemoteDependencies = {
  root: string
  invoke: (method: string, params: unknown, connectionId: string) => Promise<unknown>
  release?: (connectionId: string) => void
  subscribe: (listener: (event: unknown) => void) => () => void
  addresses?: () => string[]
}
const secret = () => randomBytes(32).toString('hex')
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Default-off LAN gateway. Desktop grant/preload and resource APIs never cross this boundary. */
export class MiraLanRemote {
  private server?: Server
  private hosts = new Set<string>()
  private urls: string[] = []
  private accessKey = ''
  private starting?: Promise<MiraRemoteStatus>
  private devices = new Map<string, Device>()
  private streams = new Map<ServerResponse, string>()
  private unsubscribe?: () => void
  private heartbeat?: ReturnType<typeof setInterval>
  private attempts: number[] = []
  constructor(private readonly dependencies: RemoteDependencies) {}
  status(): MiraRemoteStatus {
    this.expire()
    const devices = [...this.devices.values()].filter(device => device.lastSeen > Date.now() - 15000).map(({ name, connectedAt }) => ({ name, connectedAt }))
    return { enabled: Boolean(this.server), urls: this.urls, ...(devices.length ? { devices } : {}) }
  }
  private expire() {
    for (const [token, device] of this.devices) if (device.expiresAt <= Date.now()) this.revoke(token)
  }
  async start() {
    if (this.starting) return this.starting
    if (this.server) return this.status()
    this.starting = this.startServer()
    try { return await this.starting } finally { this.starting = undefined }
  }
  private async startServer() {
    const addresses = this.dependencies.addresses?.() ?? Object.values(networkInterfaces()).flatMap(entries => (entries ?? []).filter(entry => entry.family === 'IPv4' && !entry.internal && isLanAddress(entry.address)).map(entry => entry.address))
    if (!addresses.length) throw new Error('没有可用的局域网地址，请先连接 Wi-Fi 或有线网络')
    const server = createServer((request, response) => { void this.handle(request, response) })
    server.requestTimeout = 30000
    server.headersTimeout = 10000
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', () => { server.removeListener('error', reject); accept() }) })
    this.server = server
    const port = (server.address() as { port: number }).port
    this.accessKey = secret()
    this.hosts = new Set([...addresses, '127.0.0.1'].map(address => `${address}:${port}`))
    this.urls = addresses.map(address => `http://${address}:${port}/#${this.accessKey}`)
    this.unsubscribe = this.dependencies.subscribe(event => {
      this.expire()
      for (const stream of this.streams.keys()) {
        // Slow/disconnected subscribers must reconnect from a snapshot, never buffer indefinitely.
        if (!stream.write(`data: ${JSON.stringify(event)}\n\n`)) { stream.destroy(); this.streams.delete(stream) }
      }
    })
    this.heartbeat = setInterval(() => { this.expire(); for (const stream of this.streams.keys()) stream.write(': heartbeat\n\n') }, 15000)
    return this.status()
  }
  private revoke(token: string) {
    this.devices.delete(token); this.dependencies.release?.(token)
    for (const [stream, owner] of this.streams) if (owner === token) { stream.end(); this.streams.delete(stream) }
  }
  async stop() {
    if (this.starting) await this.starting
    for (const token of this.devices.keys()) this.revoke(token)
    this.unsubscribe?.(); this.unsubscribe = undefined
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = undefined
    const server = this.server; this.server = undefined; this.urls = []; this.hosts.clear(); this.accessKey = ''; this.attempts = []
    if (server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
    return this.status()
  }
  private json(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
  private async body(request: IncomingMessage) {
    if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('请求格式无效')
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of request) { size += chunk.length; if (size > 58 * 1024 * 1024) throw new Error('请求超过大小限制'); chunks.push(Buffer.from(chunk)) }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  }
  private async handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    try {
      this.expire()
      const host = request.headers.host ?? ''
      if (!isLanAddress(request.socket.remoteAddress ?? '') || !this.hosts.has(host)) return this.json(response, 403, { error: '仅允许局域网连接' })
      const url = new URL(request.url ?? '/', `http://${host}`)
      if (request.method === 'POST' && request.headers.origin !== `http://${host}`) return this.json(response, 403, { error: '请求来源无效' })
      const cookie = /(?:^|;\s*)mira_remote=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie ?? '')?.[1] ?? ''
      if (url.pathname === '/connect' && request.method === 'POST') {
        this.attempts = this.attempts.filter(time => time > Date.now() - 60000)
        if (this.attempts.length >= 10) return this.json(response, 429, { error: '请求过于频繁，请稍后重试' })
        this.attempts.push(Date.now())
        const body = await this.body(request)
        if (!this.accessKey || typeof body.key !== 'string' || !equal(body.key, this.accessKey)) return this.json(response, 403, { error: '连接链接已失效，请重新扫码' })
        const existing = this.devices.get(cookie)
        if (existing) { existing.lastSeen = Date.now(); return this.json(response, 200, { state: 'connected' }) }
        const now = Date.now()
        const device = { token: secret(), name: typeof body.name === 'string' ? body.name.trim().slice(0, 60) || '移动设备' : '移动设备', connectedAt: now, lastSeen: now, expiresAt: now + 12 * 60 * 60000 }
        this.devices.set(device.token, device)
        response.setHeader('Set-Cookie', `mira_remote=${device.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`)
        return this.json(response, 200, { state: 'connected' })
      }
      if (url.pathname === '/connection' && request.method === 'GET') {
        const device = this.devices.get(cookie)
        if (device) { device.lastSeen = Date.now(); return this.json(response, 200, { state: 'connected' }) }
        return this.json(response, 401, { error: '未连接或服务已停止' })
      }
      if (url.pathname === '/rpc' || url.pathname === '/events') {
        const device = this.devices.get(cookie)
        if (!device) return this.json(response, 401, { error: '连接已失效，请重新扫码' })
        device.lastSeen = Date.now()
        if (url.pathname === '/events' && request.method === 'GET') {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); response.write(': connected\n\n')
          this.streams.set(response, device.token); request.on('close', () => this.streams.delete(response)); return
        }
        if (request.method !== 'POST') return this.json(response, 405, { error: '请求方式无效' })
        const body = await this.body(request)
        this.expire()
        if (this.devices.get(cookie) !== device) return this.json(response, 401, { error: '连接已撤销' })
        if (typeof body.method !== 'string') throw new Error('请求无效')
        const result = await this.dependencies.invoke(body.method, body.params, device.token)
        this.expire()
        if (this.devices.get(cookie) !== device) return this.json(response, 401, { error: '连接已撤销' })
        return this.json(response, 200, { result })
      }
      if (request.method !== 'GET') return this.json(response, 405, { error: '请求方式无效' })
      // Public app assets contain no task data. Resource/media/file routes are never served.
      const name = url.pathname === '/' ? 'mobile.html' : decodeURIComponent(url.pathname.slice(1))
      if (!/^(?:mobile\.html|mobile\.js|app\.css|mira-code-highlight\.worker\.js|chunks\/[\w-]+\.js)$/.test(name)) return this.json(response, 404, { error: '资源不存在' })
      const root = resolve(this.dependencies.root); const path = resolve(root, name)
      if (!path.startsWith(root + sep)) throw new Error('资源路径无效')
      const data = await readFile(path)
      response.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'application/javascript')
      response.end(data)
    } catch (error) { if (!response.headersSent) this.json(response, 400, { error: error instanceof Error ? error.message : '请求失败' }); else response.end() }
  }
}
