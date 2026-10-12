import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm, symlink, rename, mkdir } from 'node:fs/promises'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalMicroAppServer } from '../electron/adapters/localMicroAppServer'
import { MiraWorkspaceMedia } from '../electron/services/miraWorkspaceMedia'

const fixtures: Array<{ media: MiraWorkspaceMedia; server: LocalMicroAppServer; root: string }> = []
afterEach(async () => { for (const { media, server, root } of fixtures.splice(0)) { media.closeAll(); await server.stop(); await rm(root, { recursive: true, force: true }) } })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mira-media-')), media = new MiraWorkspaceMedia()
  const server = new LocalMicroAppServer({ mediaHandler: (path, request, response) => { void media.handle(path, request, response) } })
  fixtures.push({ root, media, server }); await server.start([])
  const content = Buffer.alloc(8 * 1024 * 1024, 42); await writeFile(join(root, 'sample.wav'), content)
  let authorized = true
  const owner = { grantId: 'grant', webContentsId: 1 }
  const preview = await media.open(root, 'sample.wav', owner, () => { if (!authorized) throw new Error('授权无效') })
  const url = server.getMediaUrl(preview.id)
  return { root, media, server, content, owner, preview, url, revoke: () => { authorized = false } }
}
describe('workspace media streaming', () => {
  it('streams authorized PDF ranges with the PDF MIME type and invalidates changed or revoked documents', async () => {
    const value = await fixture(), bytes = Buffer.from('%PDF-1.7\nAuthorized PDF fixture')
    await writeFile(join(value.root, 'book.PDF'), bytes)
    const document = await value.media.open(value.root, 'book.PDF', value.owner, () => undefined), url = value.server.getMediaUrl(document.id)
    expect(document).toMatchObject({ kind: 'pdf', mediaType: 'application/pdf', byteLength: bytes.length })
    const range = await fetch(url, { headers: { Range: 'bytes=0-7' } }); expect(range.status).toBe(206); expect(range.headers.get('content-type')).toBe('application/pdf'); expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(0, 8))
    const sandbox = await fetch(url, { headers: { Origin: 'null', Range: 'bytes=0-7' } }); expect(sandbox.headers.get('access-control-allow-origin')).toBe('null'); expect(sandbox.headers.get('access-control-expose-headers')).toContain('Accept-Ranges')
    await writeFile(join(value.root, 'book.PDF'), 'changed'); expect((await fetch(url)).status).toBe(409)
    value.media.release(document.id, value.owner); expect((await fetch(url)).status).toBe(404)
  })
  it('serves metadata and exact bounded, open-ended and suffix ranges without embedding file bytes', async () => {
    const value = await fixture()
    expect(value.preview).toMatchObject({ path: 'sample.wav', kind: 'audio', mediaType: 'audio/wav', byteLength: value.content.length })
    expect(JSON.stringify(value.preview)).not.toContain('dataBase64')
    const head = await fetch(value.url, { method: 'HEAD' }); expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(value.content.length)); expect(head.headers.get('accept-ranges')).toBe('bytes')
    for (const [range, start, end] of [['bytes=10-42', 10, 42], [`bytes=${value.content.length - 19}-`, value.content.length - 19, value.content.length - 1], ['bytes=-12', value.content.length - 12, value.content.length - 1]] as const) {
      const response = await fetch(value.url, { headers: { Range: range } })
      expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end}/${value.content.length}`)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(value.content.subarray(start, end + 1))
    }
    expect((await fetch(value.url)).headers.get('cache-control')).toBe('no-store')
  })
  it('rejects unsatisfiable and multipart ranges, methods and non-local origins', async () => {
    const value = await fixture()
    for (const range of ['bytes=999999999-', 'bytes=40-10', 'bytes=0-1,4-5', 'bytes=-0', 'bytes=oops']) {
      const response = await fetch(value.url, { headers: { Range: range } }); expect(response.status).toBe(416)
      expect(response.headers.get('content-range')).toBe(`bytes */${value.content.length}`)
    }
    expect((await fetch(value.url, { method: 'POST' })).status).toBe(405)
    expect((await fetch(value.url, { headers: { Origin: 'https://unrelated.example' } })).status).toBe(403)
    expect((await fetch(value.url, { headers: { Origin: 'null', Range: 'bytes=0-9' } })).status).toBe(206)
    expect((await fetch(value.url.replace(value.preview.id, '0'.repeat(64)))).status).toBe(404)
  })
  it('binds release to its owner and invalidates reads after revocation and file replacement', async () => {
    const value = await fixture()
    value.media.release(value.preview.id, { ...value.owner, webContentsId: 2 })
    expect((await fetch(value.url, { method: 'HEAD' })).status).toBe(200)
    await rename(join(value.root, 'sample.wav'), join(value.root, 'old.wav')); await writeFile(join(value.root, 'sample.wav'), 'new bytes')
    expect((await fetch(value.url)).status).toBe(409)
    const next = await value.media.open(value.root, 'sample.wav', value.owner, () => undefined)
    value.media.closeForGrant('grant', 1)
    expect((await fetch(value.server.getMediaUrl(next.id))).status).toBe(404)
    const again = await value.media.open(value.root, 'sample.wav', value.owner, () => undefined)
    value.media.closeForWebContents(1)
    expect((await fetch(value.server.getMediaUrl(again.id))).status).toBe(404)
  })
  it('checks the original authorization on subsequent HTTP requests and rejects traversal or external symlinks', async () => {
    const value = await fixture(); value.revoke()
    expect((await fetch(value.url)).status).toBe(403)
    for (const path of ['../other.wav', '/private/other.wav', 'file:///private/other.wav', 'nested\\other.wav', 'sample.wav\0']) await expect(value.media.open(value.root, path, value.owner, () => undefined)).rejects.toThrow('路径')
    await mkdir(join(value.root, 'workspace')); await writeFile(join(value.root, 'other.wav'), 'outside workspace')
    await symlink(value.root, join(value.root, 'workspace/outside'))
    await expect(value.media.open(join(value.root, 'workspace'), 'outside/other.wav', value.owner, () => undefined)).rejects.toThrow('路径')
    await writeFile(join(value.root, 'text.html'), '<script>secret</script>')
    await expect(value.media.open(value.root, 'text.html', value.owner, () => undefined)).rejects.toThrow('音视频')
  })
  it('ends an active response on explicit grant revocation and rejects a replaced root', async () => {
    const value = await fixture()
    const request = get(value.url)
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => { request.once('response', resolve); request.once('error', reject) })
    expect(response.statusCode).toBe(200); response.pause()
    const closed = new Promise<void>(resolve => response.once('close', resolve))
    value.media.closeForGrant(value.owner.grantId, value.owner.webContentsId)
    response.on('error', () => undefined); response.resume(); await closed
    expect(response.complete).toBe(false)
    expect((await fetch(value.url, { method: 'HEAD' })).status).toBe(404)
    await mkdir(join(value.root, 'workspace')); await writeFile(join(value.root, 'workspace/clip.webm'), 'original')
    const preview = await value.media.open(join(value.root, 'workspace'), 'clip.webm', value.owner, () => undefined)
    await rename(join(value.root, 'workspace'), join(value.root, 'old-workspace')); await mkdir(join(value.root, 'workspace'))
    await writeFile(join(value.root, 'workspace/clip.webm'), 'original')
    expect((await fetch(value.server.getMediaUrl(preview.id), { method: 'HEAD' })).status).toBe(409)
  })
})
