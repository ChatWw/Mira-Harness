// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miraFileTreeIcon } from '../apps/harness-react/src/lib/mira-file-tree-icon'
import { MiraMediaPreview } from '../apps/harness-react/src/components/workspace/MiraMediaPreview'
import { FilePreviewPanel } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import { filePreviewKind } from '../apps/harness-react/src/lib/file-preview'
import type { MiraMediaPreview as MediaSource } from '../src/config/miraMedia'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () { this.currentTime = 0 })
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const source = (path = 'clip.webm'): MediaSource => ({ id: 'a'.repeat(64), path, kind: path.endsWith('.wav') ? 'audio' : 'video', mediaType: path.endsWith('.wav') ? 'audio/wav' : 'video/webm', byteLength: 500, url: `http://127.0.0.1:2345/mira-media/${'a'.repeat(64)}` })
describe('workspace media preview lifecycle', () => {
  it('uses native controls without autoplay and pauses/releases on hiding, preserving the reading position', async () => {
    const host = { openMediaFor: vi.fn(async (_session: string, path: string) => source(path)), closeMedia: vi.fn(async () => undefined) }
    const render = async (active: boolean) => act(async () => root.render(<MiraMediaPreview controller={host} sessionId="owner" path="clip.webm" active={active} refresh={0} onRetry={() => undefined} />))
    await render(true)
    const video = container.querySelector('video')!
    expect(video.controls).toBe(true); expect(video.autoplay).toBe(false); expect(video.preload).toBe('metadata')
    video.currentTime = 12; Object.defineProperty(video, 'duration', { value: 60 })
    await act(async () => video.dispatchEvent(new Event('loadedmetadata')))
    await render(false)
    expect(video.pause).toHaveBeenCalled(); expect(video.getAttribute('src')).toBeNull()
    expect(host.closeMedia).toHaveBeenCalledWith(source().id)
    await render(true)
    const restored = container.querySelector('video')!; Object.defineProperty(restored, 'duration', { value: 60 })
    await act(async () => restored.dispatchEvent(new Event('loadedmetadata')))
    expect(restored.currentTime).toBe(12)
  })
  it('releases a delayed response after changing the panel owner without applying it to the new player', async () => {
    let resolve!: (value: MediaSource) => void
    const pending = new Promise<MediaSource>(yes => { resolve = yes })
    const host = { openMediaFor: vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(source('sound.wav')), closeMedia: vi.fn(async () => undefined) }
    await act(async () => root.render(<MiraMediaPreview key="old" controller={host} sessionId="old" path="clip.webm" active refresh={0} onRetry={() => undefined} />))
    await act(async () => root.render(<MiraMediaPreview key="new" controller={host} sessionId="new" path="sound.wav" active refresh={0} onRetry={() => undefined} />))
    await act(async () => resolve(source()))
    expect(container.querySelector('video')).toBeNull(); expect(container.querySelector('audio')).toBeTruthy()
    expect(host.closeMedia).toHaveBeenCalledWith(source().id)
  })
  it('rejects another file URL and supports read failures/retry and decoder failures', async () => {
    const host = { openMediaFor: vi.fn().mockResolvedValueOnce({ ...source(), url: 'https://unrelated.example/track' }).mockRejectedValueOnce(new Error('文件已不存在')).mockResolvedValue(source()), closeMedia: vi.fn(async () => undefined) }
    const retry = vi.fn(), render = async (refresh: number) => act(async () => root.render(<MiraMediaPreview controller={host} sessionId="owner" path="clip.webm" active refresh={refresh} onRetry={retry} />))
    await render(0); expect(container.querySelector('video')).toBeNull(); expect(container.textContent).toContain('响应不匹配')
    expect(host.closeMedia).toHaveBeenCalledWith(source().id)
    await render(1); expect(host.closeMedia).toHaveBeenCalledWith(source().id); expect(container.textContent).toContain('文件已不存在')
    await act(async () => container.querySelector('button')!.click()); expect(retry).toHaveBeenCalledOnce()
    await render(2)
    const video = container.querySelector('video')!; Object.defineProperty(video, 'error', { value: { code: 4 } })
    video.currentTime = 7
    await act(async () => video.dispatchEvent(new Event('error')))
    expect(container.textContent).toContain('编码无法在应用内播放')
    expect(container.querySelector('[role="alert"]')).toBeTruthy()
    expect(video.getAttribute('src')).toBeNull()
    await render(3)
    const restored = container.querySelector('video')!; Object.defineProperty(restored, 'duration', { value: 60 })
    await act(async () => restored.dispatchEvent(new Event('loadedmetadata')))
    expect(restored.currentTime).toBe(7)
  })
  it('routes supported audio and video separately from text/image previews', () => {
    for (const path of ['clip.MP4', 'demo.mov', 'clip.webm', 'clip.m4v', 'sound.mp3', 'sound.wav', 'sound.m4a', 'sound.ogg', 'sound.opus', 'sound.flac', 'sound.weba']) expect(filePreviewKind(path)).toBe('media')
    expect(filePreviewKind('clip.mp4.ts')).toBe('text'); expect(filePreviewKind('image.png')).toBe('bitmap'); expect(filePreviewKind('drawing.svg')).toBe('svg')
  })
  it('keeps playback attached when directory-watch registration or sibling changes refresh the file list', async () => {
    const host = { openMediaFor: vi.fn(async () => source()), closeMedia: vi.fn(async () => undefined) }
    let snapshot = { revision: 0, paths: [] as string[] }, notify!: () => void
    const watch = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { notify = listener; return () => undefined } }
    await act(async () => root.render(<FilePreviewPanel controller={host as never} workspaceWatch={watch as never} sessionId="owner" path="clip.webm" active onAddFile={() => undefined} />))
    const video = container.querySelector('video')!; video.currentTime = 4
    await act(async () => { snapshot = { revision: 1, paths: [''] }; notify() })
    expect(host.openMediaFor).toHaveBeenCalledOnce(); expect(host.closeMedia).not.toHaveBeenCalled()
    expect(video.getAttribute('src')).toBe(source().url); expect(video.currentTime).toBe(4)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="刷新文件"]')!.click())
    expect(host.openMediaFor).toHaveBeenCalledTimes(2); expect(host.closeMedia).toHaveBeenCalledWith(source().id)
  })
})


it('reads a project file without a task, ignores late project responses and supports refresh', async () => {
  vi.stubGlobal('React', React)
  let resolve!: (value: { path: string; content: string }) => void
  const pending = new Promise<{ path: string; content: string }>(yes => { resolve = yes })
  const host = { readProjectFile: vi.fn().mockReturnValueOnce(pending).mockResolvedValue({ path: 'same.txt', content: 'Project B text' }), readFileFor: vi.fn() }
  const render = async (projectId: string) => act(async () => root.render(<FilePreviewPanel controller={host as never} sessionId="" projectId={projectId} path="same.txt" directory={`/projects/${projectId}`} active />))
  await render('a'); expect(host.readProjectFile).toHaveBeenCalledWith('a', 'same.txt')
  await render('b'); expect(host.readProjectFile).toHaveBeenLastCalledWith('b', 'same.txt')
  await act(async () => resolve({ path: 'same.txt', content: 'Old Project A text' }))
  expect(container.textContent).not.toContain('Old Project A text')
  expect(container.querySelector<HTMLButtonElement>('[aria-label="将当前文件加入对话"]')!.disabled).toBe(true)
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="刷新文件"]')!.click())
  expect(host.readProjectFile).toHaveBeenCalledTimes(3)
  expect(host.readFileFor).not.toHaveBeenCalled()
})

it('reads project images and releases project media through the existing preview controls', async () => {
  vi.stubGlobal('React', React)
  const host = {
    readProjectImage: vi.fn(async () => ({ path: 'image.png', mediaType: 'image/png', dataBase64: 'aW1hZ2U=', byteLength: 5 })),
    openProjectMedia: vi.fn(async (_project: string, path: string) => source(path)), closeMedia: vi.fn(async () => undefined),
    readImageFor: vi.fn(), openMediaFor: vi.fn(),
  }
  await act(async () => root.render(<FilePreviewPanel controller={host as never} sessionId="" projectId="project" path="image.png" active />))
  expect(host.readProjectImage).toHaveBeenCalledExactlyOnceWith('project', 'image.png')
  expect(container.querySelector('.mira-file-preview__body img')?.getAttribute('src')).toContain('data:image/png;base64,')
  await act(async () => root.render(<FilePreviewPanel controller={host as never} sessionId="" projectId="project" path="clip.webm" active />))
  expect(host.openProjectMedia).toHaveBeenCalledExactlyOnceWith('project', 'clip.webm')
  expect(container.querySelector('video')).not.toBeNull()
  await act(async () => root.render(<FilePreviewPanel controller={host as never} sessionId="" projectId="project" path="clip.webm" active={false} />))
  expect(host.closeMedia).toHaveBeenCalledWith(source().id)
  expect(host.readImageFor).not.toHaveBeenCalled(); expect(host.openMediaFor).not.toHaveBeenCalled()
})


it('uses the same type icon in the preview breadcrumb and updates it when the file changes', async () => {
  vi.stubGlobal('React', React)
  const host = { readFileFor: vi.fn(async (_id: string, path: string) => ({ path, content: '' })) }
  for (const path of ['main.py', 'main.java', 'README.md', 'unknown.mira-unknown']) {
    await act(async () => root.render(<FilePreviewPanel controller={host as never} sessionId="owner" path={path} active />))
    const icon = container.querySelector('.mira-file-preview__breadcrumb img')!
    expect(icon.getAttribute('src')).toBe(miraFileTreeIcon(path))
    expect(icon.getAttribute('width')).toBe('16')
    expect(icon.getAttribute('alt')).toBe('')
  }
})
