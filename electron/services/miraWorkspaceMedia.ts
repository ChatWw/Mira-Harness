import { randomBytes } from 'node:crypto'
import { constants, type BigIntStats, type ReadStream } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { miraMediaFormat, type MiraMediaKind } from '../../src/config/miraMedia'
import { corsHeadersFor } from '../adapters/localMicroAppServer'
import { resolveHarnessWorkspacePath } from './harnessWorkspaceFiles'

type MediaOwner = { grantId: string; webContentsId: number }
type MediaEntry = MediaOwner & { root: string; rootStat: BigIntStats; path: string; target: string; stat: BigIntStats; kind: MiraMediaKind; mediaType: string; authorize(): void; streams: Set<ReadStream> }
function sameFile(a: BigIntStats, b: BigIntStats) { return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs }
function rangeFor(value: string | undefined, size: number) {
  if (!value) return { start: 0, end: size - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || !match[1] && !match[2]) return undefined
  const first = match[1] ? Number(match[1]) : undefined, last = match[2] ? Number(match[2]) : undefined
  if (first !== undefined && !Number.isSafeInteger(first) || last !== undefined && !Number.isSafeInteger(last)) return undefined
  const start = first ?? Math.max(0, size - last!), end = first === undefined ? size - 1 : Math.min(last ?? size - 1, size - 1)
  return start < size && start <= end && !(first === undefined && last === 0) ? { start, end, partial: true } : undefined
}

/** Opaque per-file URLs; the renderer never chooses an absolute path or MIME type. */
export class MiraWorkspaceMedia {
  private entries = new Map<string, MediaEntry>()
  async open(workspace: string, path: string, owner: MediaOwner, authorize: () => void) {
    authorize()
    if (typeof path !== 'string' || !path.trim() || path.length > 2048 || path.includes('\0') || path.includes('\\') || /^[a-z][a-z\d+.-]*:/i.test(path) || path.split('/').includes('..')) throw new Error('路径无效')
    const format = miraMediaFormat(path)
    if (!format) throw new Error('此文件不是支持流式预览的 PDF 或音视频格式')
    const root = await realpath(workspace), rootStat = await lstat(root, { bigint: true })
    const resolved = await resolveHarnessWorkspacePath(root, path), stat = await lstat(resolved.target, { bigint: true })
    if (!stat.isFile()) throw new Error('目标不是文件')
    if (stat.size <= 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('媒体文件为空或大小不可读取')
    authorize()
    if (this.entries.size >= 128) throw new Error('打开的媒体过多，请关闭部分媒体标签后重试')
    const id = randomBytes(32).toString('hex')
    this.entries.set(id, { ...owner, root, rootStat, path: resolved.path, target: resolved.target, stat, ...format, authorize, streams: new Set() })
    return { id, path: resolved.path, ...format, byteLength: Number(stat.size) }
  }
  release(id: string, owner: MediaOwner) {
    const entry = this.entries.get(id)
    if (!entry || entry.grantId !== owner.grantId || entry.webContentsId !== owner.webContentsId) return
    this.entries.delete(id)
    for (const stream of entry.streams) stream.destroy()
  }
  closeForGrant(grantId: string, webContentsId: number) { for (const [id, entry] of this.entries) if (entry.grantId === grantId && entry.webContentsId === webContentsId) this.release(id, entry) }
  closeForWebContents(webContentsId: number) { for (const [id, entry] of this.entries) if (entry.webContentsId === webContentsId) this.release(id, entry) }
  closeAll() { for (const [id, entry] of this.entries) this.release(id, entry) }

  async handle(id: string, request: IncomingMessage, response: ServerResponse) {
    const cors = corsHeadersFor(request)
    const fail = (status: number) => { if (!response.destroyed && !response.headersSent) response.writeHead(status, { ...cors, 'Cache-Control': 'no-store' }).end(); else response.destroy() }
    if (request.headers.origin && !Object.keys(cors).length) { fail(403); return }
    if (request.method !== 'GET' && request.method !== 'HEAD') { fail(405); return }
    const entry = /^[a-f0-9]{64}$/.test(id) ? this.entries.get(id) : undefined
    if (!entry) { fail(404); return }
    try { entry.authorize() } catch { this.release(id, entry); fail(403); return }
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      const root = await realpath(entry.root), rootStat = await lstat(root, { bigint: true })
      const resolved = await resolveHarnessWorkspacePath(root, entry.path)
      if (root !== entry.root || rootStat.dev !== entry.rootStat.dev || rootStat.ino !== entry.rootStat.ino || resolved.target !== entry.target) { fail(409); return }
      handle = await open(entry.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      if (!sameFile(entry.stat, await handle.stat({ bigint: true }))) { fail(409); return }
      const current = await resolveHarnessWorkspacePath(root, entry.path)
      if (current.target !== entry.target || !sameFile(entry.stat, await lstat(current.target, { bigint: true }))) { fail(409); return }
      const finalRoot = await realpath(entry.root), finalRootStat = await lstat(finalRoot, { bigint: true })
      if (finalRoot !== root || finalRootStat.dev !== rootStat.dev || finalRootStat.ino !== rootStat.ino) { fail(409); return }
      try { entry.authorize() } catch { this.release(id, entry); fail(403); return }
      if (response.destroyed || this.entries.get(id) !== entry) { fail(404); return }
      const size = Number(entry.stat.size), range = rangeFor(request.headers.range, size)
      if (!range) { response.writeHead(416, { ...cors, 'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store' }).end(); return }
      response.writeHead(range.partial ? 206 : 200, {
        ...cors, 'Content-Type': entry.mediaType, 'Content-Length': String(range.end - range.start + 1),
        'Accept-Ranges': 'bytes', 'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Encoding', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        ...(range.partial ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
      })
      if (request.method === 'HEAD') { response.end(); return }
      const stream = handle.createReadStream({ start: range.start, end: range.end, highWaterMark: 64 * 1024, autoClose: true })
      handle = undefined
      entry.streams.add(stream)
      response.once('close', () => stream.destroy())
      stream.once('close', () => { entry.streams.delete(stream); if (!response.writableEnded) response.destroy() })
      stream.once('error', () => response.destroy())
      stream.pipe(response)
    } catch (error) { fail((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 409) }
    finally { await handle?.close() }
  }
}
