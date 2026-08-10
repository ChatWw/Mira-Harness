import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { MicroApp } from '../src/types'

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1'])

/**
 * 本地微应用服务只接受回环来源的跨源请求：
 * 桌面端渲染进程（dev 为 http://localhost:*，打包后为 file://，Origin 为 null）与
 * 本机页面可以访问，远程网页无法借用本地 API 代理。
 */
export function corsHeadersFor(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin
  if (origin == null) return {}
  if (origin === 'null') return { 'Access-Control-Allow-Origin': 'null' }
  try {
    const url = new URL(origin)
    const isLoopback = url.protocol === 'http:' || url.protocol === 'https:'
      ? LOOPBACK_HOSTNAMES.has(url.hostname)
      : false
    return isLoopback ? { 'Access-Control-Allow-Origin': origin } : {}
  } catch {
    return {}
  }
}

export type LocalMicroAppApiHandler = (
  subpath: string,
  request: IncomingMessage,
  response: ServerResponse,
) => void

export interface LocalMicroAppServerOptions {
  /** 内置资源包名 -> 绝对目录（随安装包分发，dev/打包路径不同）。 */
  builtinRoots?: Record<string, string>
  /** 按微应用 id 注册的 POST API 处理器（如内置小说代理）。 */
  apiHandlers?: ReadonlyMap<string, LocalMicroAppApiHandler>
}

export class LocalMicroAppServer {
  private readonly roots = new Map<string, string>()
  private readonly builtinRoots: Record<string, string>
  private readonly apiHandlers: ReadonlyMap<string, LocalMicroAppApiHandler>
  private server?: Server
  private _port?: number

  constructor(options: LocalMicroAppServerOptions = {}) {
    this.builtinRoots = options.builtinRoots ?? {}
    this.apiHandlers = options.apiHandlers ?? new Map()
  }

  get port() {
    return this._port
  }

  start(apps: MicroApp[], preferredPort?: number) {
    this.setApps(apps)
    if (this.server) return Promise.resolve()
    this.server = createServer((request, response) => this.handleRequest(request, response))
    return new Promise<void>((resolveStart, rejectStart) => {
      const server = this.server
      if (!server) {
        rejectStart(new Error('本地微应用服务启动失败'))
        return
      }
      const onListening = () => {
        server.removeListener('error', onError)
        const address = server.address()
        if (!address || typeof address === 'string') {
          rejectStart(new Error('本地微应用服务启动失败'))
          return
        }
        this._port = address.port
        resolveStart()
      }
      const onError = (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && preferredPort !== undefined) {
          // 固定端口被占用时回退到随机端口，保证本地微应用始终可用。
          preferredPort = undefined
          server.listen(0, '127.0.0.1', onListening)
          return
        }
        rejectStart(error)
      }
      server.on('error', onError)
      server.listen(preferredPort ?? 0, '127.0.0.1', onListening)
    })
  }

  stop() {
    return new Promise<void>(resolveStop => this.server?.close(() => resolveStop()) || resolveStop())
  }

  setApps(apps: MicroApp[]) {
    const nextRoots = this.collectRoots(apps, false)
    this.roots.clear()
    nextRoots.forEach((root, id) => this.roots.set(id, root))
  }

  validateApps(apps: MicroApp[]) {
    this.collectRoots(apps, true)
  }

  private collectRoots(apps: MicroApp[], strict: boolean) {
    const nextRoots = new Map<string, string>()
    for (const app of apps) {
      if (!app.enabled) continue
      try {
        if (app.entry.type === 'local-directory') {
          // 目录型入口仍仅限 Wujie 模式使用，内置资源包不限集成模式。
          if (app.integrationMode !== 'wujie') continue
          nextRoots.set(app.id, this.validateDirectory(app.entry.directory))
        } else if (app.entry.type === 'builtin') {
          const root = this.builtinRoots[app.entry.package]
          if (!root) throw new Error(`内置微应用资源包不存在: ${app.entry.package}`)
          nextRoots.set(app.id, this.validateDirectory(root))
        }
      } catch (error) {
        if (strict) throw error
      }
    }
    return nextRoots
  }

  validateDirectory(directory: string) {
    if (!directory?.trim()) throw new Error('请选择本地构建目录')
    let root: string
    try {
      root = realpathSync(directory)
      if (!statSync(root).isDirectory()) throw new Error('not a directory')
    } catch {
      throw new Error('所选目录不存在或无法访问')
    }
    const entry = resolve(root, 'index.html')
    if (!existsSync(entry) || !statSync(entry).isFile()) throw new Error('所选目录必须直接包含 index.html')
    return root
  }

  getEntryUrl(appId: string) {
    if (!this._port) throw new Error('本地微应用服务尚未启动')
    if (!this.roots.has(appId)) throw new Error('本地微应用入口不可用，请检查已选目录')
    return `http://127.0.0.1:${this._port}/apps/${encodeURIComponent(appId)}/`
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse) {
    let url: URL
    try { url = new URL(request.url || '/', 'http://127.0.0.1') } catch {
      response.writeHead(400, corsHeadersFor(request)).end()
      return
    }
    const match = url.pathname.match(/^\/apps\/([^/]+)\/?(.*)$/)
    if (!match) {
      response.writeHead(404, corsHeadersFor(request)).end()
      return
    }
    let appId: string
    try { appId = decodeURIComponent(match[1]) } catch {
      response.writeHead(400, corsHeadersFor(request)).end()
      return
    }
    if (request.method === 'OPTIONS') {
      const corsHeaders = corsHeadersFor(request)
      if (Object.keys(corsHeaders).length === 0) {
        response.writeHead(403).end()
        return
      }
      response.writeHead(204, {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      }).end()
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const handler = this.apiHandlers.get(appId)
      if (request.method === 'POST' && handler) {
        handler(match[2] || '', request, response)
        return
      }
      response.writeHead(405, corsHeadersFor(request)).end()
      return
    }
    const root = this.roots.get(appId)
    if (!root) {
      response.writeHead(404, corsHeadersFor(request)).end()
      return
    }
    let requestedPath: string
    try { requestedPath = decodeURIComponent(match[2] || '') } catch {
      response.writeHead(400, corsHeadersFor(request)).end()
      return
    }
    const resolved = resolve(root, requestedPath || 'index.html')
    const isInsideRoot = !isAbsolute(relative(root, resolved)) && !relative(root, resolved).startsWith('..')
    if (!isInsideRoot) {
      response.writeHead(403, corsHeadersFor(request)).end()
      return
    }
    const filePath = existsSync(resolved) && statSync(resolved).isFile()
      ? resolved
      : extname(requestedPath) ? '' : resolve(root, 'index.html')
    if (!filePath || !existsSync(filePath)) {
      response.writeHead(404, corsHeadersFor(request)).end()
      return
    }
    const realFilePath = realpathSync(filePath)
    const fileIsInsideRoot = !isAbsolute(relative(root, realFilePath)) && !relative(root, realFilePath).startsWith('..')
    if (!fileIsInsideRoot) {
      response.writeHead(403, corsHeadersFor(request)).end()
      return
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(realFilePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...corsHeadersFor(request),
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(realFilePath).on('error', () => response.destroy()).pipe(response)
  }
}
