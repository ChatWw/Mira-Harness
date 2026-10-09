import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileImagePreviewReader, createFilePreviewReader, filePreviewKind, filePreviewImageSource, type FilePreviewSnapshot } from '../apps/harness-react/src/lib/file-preview'
import { miraImagePixelRatio, miraImageDisplaySize, miraSvgImageSource } from '../apps/harness-react/src/lib/image-preview'
import { FilePreviewPanel } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const image = { path: 'logo.png', mediaType: 'image/png', dataBase64: 'iVBORw0KGgo=', byteLength: 8 }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Mira authorized image preview', () => {
  it.each(['apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'webp'])('recognizes %s as bitmap without text highlighting', extension => {
    expect(filePreviewKind(`assets/logo.${extension.toUpperCase()}`)).toBe('bitmap')
  })
  it('keeps SVG text and unknown extensions on their respective preview paths', () => {
    expect(filePreviewKind('logo.SVG')).toBe('svg')
    expect(filePreviewKind('notes.md')).toBe('text')
    expect(filePreviewKind('archive.unknown')).toBe('text')
    expect(filePreviewKind('README')).toBe('text')
    expect(filePreviewKind('png')).toBe('text')
    expect(filePreviewKind('svg')).toBe('text')
  })
  it('only constructs inline sources from host-approved bitmap MIME types', () => {
    expect(filePreviewImageSource(image)).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(() => filePreviewImageSource({ ...image, mediaType: 'text/html' })).toThrow('图片格式')
    expect(() => filePreviewImageSource({ ...image, mediaType: 'image/svg+xml' })).toThrow('图片格式')
  })
  it('reads bitmap content with captured ownership and rejects mismatched response paths', async () => {
    const read = vi.fn().mockResolvedValueOnce(image).mockResolvedValueOnce({ ...image, path: 'other.png' })
    const snapshots: FilePreviewSnapshot[] = []
    const reader = createFileImagePreviewReader(read, { sessionId: 'alpha', path: 'logo.png', directory: '/tmp/project' }, snapshot => snapshots.push(snapshot))
    reader.read(true, 0); await Promise.resolve()
    expect(read).toHaveBeenCalledExactlyOnceWith('alpha', 'logo.png')
    expect(snapshots.at(-1)).toEqual({ sessionId: 'alpha', path: 'logo.png', directory: '/tmp/project', status: 'image', image })
    reader.read(true, 1); await Promise.resolve()
    expect(snapshots.at(-1)).toMatchObject({ status: 'error', error: '文件预览响应路径不匹配，请重试。' })
    reader.dispose()
  })
  it('defers hidden bitmap changes until activation and can recover a read failure', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('图片不存在')).mockResolvedValueOnce(image)
    const snapshots: FilePreviewSnapshot[] = []
    const reader = createFileImagePreviewReader(read, { sessionId: 'alpha', path: 'logo.png' }, snapshot => snapshots.push(snapshot))
    reader.read(false, 0); expect(read).not.toHaveBeenCalled()
    reader.read(true, 0); await Promise.resolve()
    expect(snapshots.at(-1)).toMatchObject({ status: 'error', error: '图片不存在' })
    reader.read(false, 1); reader.read(false, 2); expect(read).toHaveBeenCalledOnce()
    reader.read(true, 2); await Promise.resolve()
    expect(snapshots.at(-1)).toMatchObject({ status: 'image', image })
    reader.read(false, 2); reader.read(true, 2); expect(read).toHaveBeenCalledTimes(2)
    reader.dispose()
  })
  it('reports an invalid bitmap MIME locally and recovers on refresh', async () => {
    const read = vi.fn().mockResolvedValueOnce({ ...image, mediaType: 'text/html' }).mockResolvedValueOnce(image)
    const snapshots: FilePreviewSnapshot[] = []
    const reader = createFileImagePreviewReader(read, { sessionId: 'alpha', path: 'logo.png' }, snapshot => snapshots.push(snapshot))
    reader.read(true, 0); await Promise.resolve()
    expect(snapshots.at(-1)).toMatchObject({ status: 'error', error: '图片格式不受支持，请在外部编辑器中打开。' })
    reader.read(true, 1); await Promise.resolve()
    expect(snapshots.at(-1)).toMatchObject({ status: 'image', image })
    reader.dispose()
  })
  it.each(['text', 'bitmap'])('cancels a pending same-revision %s read on hide and starts a new read on activation', async kind => {
    const stale = deferred<typeof image & { content: string }>()
    const fresh = { ...image, content: 'Fresh' }
    const read = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(fresh)
    const snapshots: FilePreviewSnapshot[] = []
    const factory = kind === 'bitmap' ? createFileImagePreviewReader : createFilePreviewReader
    const reader = factory(read, { sessionId: 'alpha', path: 'logo.png' }, snapshot => snapshots.push(snapshot))
    reader.read(true, 0); reader.read(false, 0)
    stale.resolve({ ...image, content: 'Stale' }); await stale.promise
    expect(snapshots.at(-1)).toMatchObject({ status: 'loading' })
    reader.read(true, 0); await Promise.resolve()
    expect(read).toHaveBeenCalledTimes(2)
    expect(snapshots.at(-1)?.status).toBe(kind === 'bitmap' ? 'image' : 'ready')
    reader.dispose()
  })
  it('discards a late bitmap from the previous root', async () => {
    const old = deferred<typeof image>()
    const snapshots: FilePreviewSnapshot[] = []
    const reader = createFileImagePreviewReader(() => old.promise, { sessionId: 'alpha', path: 'logo.png', directory: '/tmp/old' }, snapshot => snapshots.push(snapshot))
    reader.read(true, 0); reader.dispose()
    old.resolve(image); await old.promise
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({ status: 'loading', directory: '/tmp/old' })
  })
  it('folds retina bitmap physical pixels to CSS size and fits SVG to the available canvas', () => {
    expect(miraImagePixelRatio('assets/logo@2x.png')).toBe(2)
    expect(miraImagePixelRatio('C:\\assets\\logo@3x.PNG')).toBe(3)
    expect(miraImagePixelRatio('logo@1.5x.png')).toBe(1.5)
    expect(miraImagePixelRatio('logo@0x.png')).toBe(1)
    expect(miraImagePixelRatio('logo@2x-copy.png')).toBe(1)
    expect(miraImageDisplaySize('logo@2x.png', 240, 120, false)).toEqual({ width: 120, height: 60 })
    expect(miraImageDisplaySize('logo.png', 240, 120, false)).toBeUndefined()
    expect(miraImageDisplaySize('logo@2x.svg', 240, 120, true)).toBeUndefined()
  })
  it('encodes SVG as a data image rather than executable DOM or a remote URL', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    expect(miraSvgImageSource(svg)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  })
  it('omits unsupported image-to-conversation and source-copy controls for bitmaps', () => {
    vi.stubGlobal('React', React)
    const html = renderToStaticMarkup(React.createElement(FilePreviewPanel, { controller: {} as PilotController, sessionId: 'alpha', path: 'logo.png', directory: '/tmp/Mira', active: true, onAddFile: vi.fn() }))
    expect(html).toContain('aria-label="刷新文件"')
    expect(html).toContain('aria-label="文件预览选项"')
    expect(html).not.toContain('aria-label="将当前文件加入对话"')
  })
})
