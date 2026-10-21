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
  invoke: (method: string, params: unknown) => Promise<unknown>
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
  private device?: Device
  private streams = new Set<ServerResponse>()
  private unsubscribe?: () => void
  private heartbeat?: ReturnType<typeof setInterval>
  private attempts: number[] = []
  constructor(private readonly dependencies: RemoteDependencies) {}
  status(): MiraRemoteStatus {
    this.expire()
    return { enabled: Boolean(this.server), urls: this.urls, ...(this.device && this.device.lastSeen > Date.now() - 15000 ? { device: { name: this.device.name, connectedAt: this.device.connectedAt } } : {}) }
  }
  private expire() {
    if (this.device && this.device.expiresAt <= Date.now()) this.revoke()
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
      if (!this.device) return
      for (const stream of this.streams) {
        // Slow/disconnected subscribers must reconnect from a snapshot, never buffer indefinitely.
        if (!stream.write(`data: ${JSON.stringify(event)}\n\n`)) { stream.destroy(); this.streams.delete(stream) }
      }
    })
    this.heartbeat = setInterval(() => { this.expire(); for (const stream of this.streams) stream.write(': heartbeat\n\n') }, 15000)
    return this.status()
  }
  private revoke() { this.device = undefined; for (const stream of this.streams) stream.end(); this.streams.clear() }
  async stop() {
    if (this.starting) await this.starting
    this.revoke(); this.unsubscribe?.(); this.unsubscribe = undefined
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
        if (this.device && equal(cookie, this.device.token)) { this.device.lastSeen = Date.now(); return this.json(response, 200, { state: 'connected' }) }
        if (this.device && this.device.lastSeen > Date.now() - 15000) return this.json(response, 409, { error: '已有设备连接，请先在电脑停止服务后重新开启' })
        this.revoke()
        const now = Date.now()
        this.device = { token: secret(), name: typeof body.name === 'string' ? body.name.trim().slice(0, 60) || '移动设备' : '移动设备', connectedAt: now, lastSeen: now, expiresAt: now + 12 * 60 * 60000 }
        response.setHeader('Set-Cookie', `mira_remote=${this.device.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`)
        return this.json(response, 200, { state: 'connected' })
      }
      if (url.pathname === '/connection' && request.method === 'GET') {
        if (this.device && equal(cookie, this.device.token)) { this.device.lastSeen = Date.now(); return this.json(response, 200, { state: 'connected' }) }
        return this.json(response, 401, { error: '未连接或服务已停止' })
      }
      if (url.pathname === '/rpc' || url.pathname === '/events') {
        if (!this.device || !equal(cookie, this.device.token)) return this.json(response, 401, { error: '连接已失效，请重新扫码' })
        if (url.pathname === '/events' && request.method === 'GET') {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); response.write(': connected\n\n')
          this.streams.add(response); request.on('close', () => this.streams.delete(response)); return
        }
        if (request.method !== 'POST') return this.json(response, 405, { error: '请求方式无效' })
        const token = this.device.token
        const body = await this.body(request)
        if (!this.device || !equal(cookie, this.device.token) || this.device.token !== token) return this.json(response, 401, { error: '连接已撤销' })
        if (typeof body.method !== 'string') throw new Error('请求无效')
        const result = await this.dependencies.invoke(body.method, body.params)
        if (!this.device || this.device.token !== token) return this.json(response, 401, { error: '连接已撤销' })
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
