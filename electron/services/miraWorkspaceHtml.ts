import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname } from 'node:path'
import { resolveHarnessWorkspacePath } from './harnessWorkspaceFiles'

type Owner = { grantId: string; webContentsId: number }
type Preview = Owner & { root: string; server: Server; origin: string; authorize(): void }
const mediaTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.pdf': 'application/pdf',
}

/** Separate loopback origins keep executable workspace HTML away from Mira's app/API origin. */
export class MiraWorkspaceHtml {
  private previews = new Set<Preview>()
  async open(workspace: string, path: string, owner: Owner, authorize: () => void) {
    authorize()
    if (!/\.(html|htm)$/i.test(path)) throw new Error('仅 HTML 或 HTM 文件可用内置浏览器打开')
    const root = await realpath(workspace)
    const resolved = await resolveHarnessWorkspacePath(root, path)
    if (!(await stat(resolved.target)).isFile()) throw new Error('目标不是文件')
    authorize()
    let preview = [...this.previews].find(item => item.root === root && item.grantId === owner.grantId && item.webContentsId === owner.webContentsId)
    if (!preview) {
      if (this.previews.size >= 32) throw new Error('打开的 HTML 工作区过多，请重启工作台后重试')
      const entry: Preview = { ...owner, root, origin: '', authorize, server: createServer() }
      entry.server.on('request', (request, response) => {
        const fail = (status: number) => { if (!response.headersSent) response.writeHead(status, { 'Cache-Control': 'no-store' }).end(); else response.destroy() }
        void (async () => {
          if (request.headers.host !== new URL(entry.origin).host || request.headers.origin && request.headers.origin !== entry.origin) { fail(403); return }
          if (request.method !== 'GET' && request.method !== 'HEAD') { fail(405); return }
          entry.authorize()
          // Decode exactly once; the workspace resolver rejects traversal and escaping symlinks.
          const value = decodeURIComponent(new URL(request.url || '/', entry.origin).pathname).slice(1)
          if (value.includes('\0') || value.includes('\\') || value.split('/').includes('..')) { fail(403); return }
          if (await realpath(workspace) !== root) { fail(403); return }
          let file = await resolveHarnessWorkspacePath(root, value)
          if ((await stat(file.target)).isDirectory()) {
            if (!value.endsWith('/') && value) { response.writeHead(302, { Location: '/' + value.split('/').map(encodeURIComponent).join('/') + '/' }).end(); return }
            file = await resolveHarnessWorkspacePath(root, value + 'index.html')
          }
          const handle = await open(file.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
          try {
            const info = await handle.stat()
            if (!info.isFile()) { fail(404); return }
            const current = await resolveHarnessWorkspacePath(root, file.path), currentStat = await stat(current.target)
            if (current.target !== file.target || currentStat.dev !== info.dev || currentStat.ino !== info.ino || await realpath(workspace) !== root) { fail(403); return }
            entry.authorize()
            response.writeHead(200, { 'Content-Type': mediaTypes[extname(file.path).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
            if (request.method === 'HEAD') { response.end(); return }
            const stream = handle.createReadStream({ autoClose: false })
            response.once('close', () => stream.destroy())
            await new Promise<void>((resolve, reject) => {
              stream.once('error', reject); stream.once('close', resolve); stream.once('end', resolve); stream.pipe(response)
            })
          } finally { await handle.close() }
        })().catch(error => fail((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 403))
      })
      await new Promise<void>((resolve, reject) => {
        entry.server.once('error', reject)
        entry.server.listen(0, '127.0.0.1', () => { entry.server.removeListener('error', reject); resolve() })
      })
      const address = entry.server.address()
      if (!address || typeof address === 'string') throw new Error('HTML 预览服务启动失败')
      entry.origin = `http://127.0.0.1:${address.port}`
      try { authorize() } catch (error) { entry.server.close(); throw error }
      this.previews.add(entry); preview = entry
    }
    preview.authorize = authorize
    return preview.origin + '/' + resolved.path.split('/').map(encodeURIComponent).join('/')
  }
  closeForGrant(grantId: string, webContentsId: number) { for (const item of this.previews) if (item.grantId === grantId && item.webContentsId === webContentsId) this.close(item) }
  closeForWebContents(webContentsId: number) { for (const item of this.previews) if (item.webContentsId === webContentsId) this.close(item) }
  closeAll() { for (const item of this.previews) this.close(item) }
  private close(item: Preview) { this.previews.delete(item); item.server.close(); item.server.closeAllConnections() }
}
