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

export class LocalMicroAppServer {
  private readonly roots = new Map<string, string>()
  private server?: Server
  private port?: number

  start(apps: MicroApp[]) {
    this.setApps(apps)
    if (this.server) return Promise.resolve()
    this.server = createServer((request, response) => this.handleRequest(request, response))
    return new Promise<void>((resolveStart, rejectStart) => {
      this.server?.once('error', rejectStart)
      this.server?.listen(0, '127.0.0.1', () => {
        const address = this.server?.address()
        if (!address || typeof address === 'string') {
          rejectStart(new Error('本地微应用服务启动失败'))
          return
        }
        this.port = address.port
        resolveStart()
      })
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
      if (!app.enabled || app.integrationMode !== 'wujie' || app.entry.type !== 'local-directory') continue
      try {
        nextRoots.set(app.id, this.validateDirectory(app.entry.directory))
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
    if (!this.port) throw new Error('本地微应用服务尚未启动')
    if (!this.roots.has(appId)) throw new Error('本地微应用入口不可用，请检查已选目录')
    return `http://127.0.0.1:${this.port}/apps/${encodeURIComponent(appId)}/`
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end()
      return
    }
    let url: URL
    try { url = new URL(request.url || '/', 'http://127.0.0.1') } catch {
      response.writeHead(400).end()
      return
    }
    const match = url.pathname.match(/^\/apps\/([^/]+)\/?(.*)$/)
    if (!match) {
      response.writeHead(404).end()
      return
    }
    let appId: string
    try { appId = decodeURIComponent(match[1]) } catch {
      response.writeHead(400).end()
      return
    }
    const root = this.roots.get(appId)
    if (!root) {
      response.writeHead(404).end()
      return
    }
    let requestedPath: string
    try { requestedPath = decodeURIComponent(match[2] || '') } catch {
      response.writeHead(400).end()
      return
    }
    const resolved = resolve(root, requestedPath || 'index.html')
    const isInsideRoot = !isAbsolute(relative(root, resolved)) && !relative(root, resolved).startsWith('..')
    if (!isInsideRoot) {
      response.writeHead(403).end()
      return
    }
    const filePath = existsSync(resolved) && statSync(resolved).isFile()
      ? resolved
      : extname(requestedPath) ? '' : resolve(root, 'index.html')
    if (!filePath || !existsSync(filePath)) {
      response.writeHead(404).end()
      return
    }
    const realFilePath = realpathSync(filePath)
    const fileIsInsideRoot = !isAbsolute(relative(root, realFilePath)) && !relative(root, realFilePath).startsWith('..')
    if (!fileIsInsideRoot) {
      response.writeHead(403).end()
      return
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(realFilePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(realFilePath).on('error', () => response.destroy()).pipe(response)
  }
}
