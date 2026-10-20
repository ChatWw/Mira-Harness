// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FilePreviewPanel } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import { WorkspaceWatchDataSource } from '../apps/harness-react/src/lib/workspace-watch'
import type { PilotController, PilotWorkspaceFileEvent } from '../apps/harness-react/src/state/pilot-state'

let root: Root, container: HTMLDivElement, source: WorkspaceWatchDataSource | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  source?.deactivate(); source = undefined
  document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals()
})
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
async function fixture(path = 'note.md', commandOutput?: { runId: string; toolId: string }) {
  let sequence = 0, emit!: (event: PilotWorkspaceFileEvent) => void
  const controller = {
    readFileFor: vi.fn(async () => ({ path, content: '# Original\n\nFile preview retained' })),
    readImageFor: vi.fn(async () => ({ path, mediaType: 'image/png', dataBase64: 'original', byteLength: 8 })),
    readCommandOutputFor: vi.fn(async () => 'command output'),
    supportsWorkspaceWatch: true,
    watchFilesFor: vi.fn(async () => ({ watchId: `watch-${++sequence}` })),
    unwatchFilesFor: vi.fn(async () => undefined),
    onWorkspaceFilesChanged: (listener: typeof emit) => { emit = listener; return () => {} },
  }
  const watch = source = new WorkspaceWatchDataSource(controller, 'a')
  watch.activate(); watch.setPaths([''])
  const render = async (active = true) => { await act(async () => root.render(<FilePreviewPanel controller={controller as unknown as PilotController} sessionId="a" path={path} directory="/project" workspaceWatch={watch} active={active} commandOutput={commandOutput} />)) }
  const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(300) }) }
  const expand = async () => { await act(async () => watch.setPaths(['', 'other'])); await tick() }
  const changed = async () => { await act(async () => emit({ sessionId: 'a', watchId: `watch-${sequence}`, directory: '/project', paths: [''] })); await tick() }
  await render()
  return { controller, watch, render, tick, expand, changed }
}

it.each(['note.md', 'note.txt'])('keeps the %s DOM and scroll position across watcher registration and folder expansion', async path => {
  const view = await fixture(path)
  const selector = path.endsWith('.md') ? '.mira-file-preview__markdown' : '.mira-file-source'
  const preview = container.querySelector(selector)!
  preview.scrollTop = 120
  await view.tick()
  expect(container.querySelector(selector)).toBe(preview)
  await view.expand()
  expect(view.controller.watchFilesFor).toHaveBeenCalledTimes(2)
  expect(view.controller.readFileFor).toHaveBeenCalledTimes(3)
  expect(container.querySelector(selector)).toBe(preview)
  expect(preview.scrollTop).toBe(120)
})

it('keeps loaded content visible during a directory check and updates real changes without unmounting', async () => {
  const view = await fixture(); await view.tick()
  const preview = container.querySelector('.mira-file-preview__markdown')!
  const pending = deferred<{ path: string; content: string }>()
  view.controller.readFileFor.mockReturnValueOnce(pending.promise)
  await view.expand()
  expect(container.querySelector('.mira-file-preview__markdown')).toBe(preview)
  expect(container.textContent).not.toContain('正在读取文件')
  await act(async () => pending.resolve({ path: 'note.md', content: '# Updated' }))
  expect(container.querySelector('.mira-file-preview__markdown')).toBe(preview)
  expect(preview.textContent).toContain('Updated')
})

it('preserves a decoded bitmap on unrelated changes and replaces its image only when bytes change', async () => {
  const view = await fixture('logo.png'); await view.tick()
  const image = container.querySelector('.mira-image-preview__image')!
  await act(async () => image.dispatchEvent(new Event('load')))
  const canvas = container.querySelector('.mira-image-preview')!
  await view.expand()
  expect(container.querySelector('.mira-image-preview')).toBe(canvas)
  expect(container.querySelector('.mira-image-preview__image')).toBe(image)
  expect(canvas.getAttribute('aria-busy')).toBe('false')
  view.controller.readImageFor.mockResolvedValueOnce({ path: 'logo.png', mediaType: 'image/png', dataBase64: 'changed', byteLength: 7 })
  await view.changed()
  expect(container.querySelector('.mira-image-preview__image')).not.toBe(image)
  expect(container.querySelector('img.mira-image-preview__image')?.getAttribute('src')).toContain('changed')
})

it('still explicitly reloads on the refresh button and ignores an older background response', async () => {
  const view = await fixture(); await view.tick()
  const stale = deferred<{ path: string; content: string }>(), fresh = deferred<{ path: string; content: string }>()
  view.controller.readFileFor.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
  await view.expand()
  await act(async () => (container.querySelector('[aria-label="刷新文件"]') as HTMLButtonElement).click())
  expect(container.textContent).toContain('正在读取文件')
  await act(async () => fresh.resolve({ path: 'note.md', content: '# Fresh' }))
  await act(async () => stale.resolve({ path: 'note.md', content: '# Stale' }))
  expect(container.textContent).toContain('Fresh')
  expect(container.textContent).not.toContain('Stale')
})

it('defers hidden invalidations and cancels an interrupted background read without losing the preview', async () => {
  const view = await fixture(); await view.tick()
  const preview = container.querySelector('.mira-file-preview__markdown')!
  const stale = deferred<{ path: string; content: string }>()
  view.controller.readFileFor.mockReturnValueOnce(stale.promise)
  await view.expand(); await view.render(false)
  await act(async () => stale.resolve({ path: 'note.md', content: '# Stale' }))
  const reads = view.controller.readFileFor.mock.calls.length
  await view.changed(); await view.changed()
  expect(view.controller.readFileFor).toHaveBeenCalledTimes(reads)
  await view.render()
  expect(view.controller.readFileFor).toHaveBeenCalledTimes(reads + 1)
  expect(container.querySelector('.mira-file-preview__markdown')).toBe(preview)
  expect(preview.textContent).not.toContain('Stale')
})

it('reports deletion and recovers when the watched file reappears', async () => {
  const view = await fixture(); await view.tick()
  view.controller.readFileFor.mockRejectedValueOnce(new Error('文件已被删除'))
  await view.changed()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('文件已被删除')
  await view.changed()
  expect(container.querySelector('.mira-file-preview__markdown')?.textContent).toContain('Original')
})

it('does not reread command output on workspace directory notifications', async () => {
  const view = await fixture('output.log', { runId: 'run', toolId: 'tool' })
  await view.tick(); await view.expand()
  expect(view.controller.readCommandOutputFor).toHaveBeenCalledOnce()
})
