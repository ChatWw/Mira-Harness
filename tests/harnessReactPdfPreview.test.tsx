// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraDocumentPreview } from '../apps/harness-react/src/components/workspace/MiraDocumentPreview'
import { FilePreviewPanel } from '../apps/harness-react/src/components/workspace/FilePreviewPanel'
import { filePreviewKind } from '../apps/harness-react/src/lib/file-preview'
import type { MiraMediaPreview } from '../src/config/miraMedia'

const decoder = vi.hoisted(() => ({ throws: false }))
vi.mock('../apps/harness-react/src/components/workspace/MiraPdfReader', () => ({ default: (props: any) => { if (decoder.throws) throw new Error('Reader module failed'); return <div data-reader={props.url}><button onClick={() => { props.onPage(3); props.onScale(1.5) }}>Navigate</button><button onClick={() => props.onError('文件损坏')}>Fail</button><span>{props.page}/{props.scale}</span></div> } }))
let root: Root, container: HTMLDivElement
beforeEach(() => { decoder.throws = false; vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const source = (id = 'a'.repeat(64)): MiraMediaPreview => ({ id, path: 'book.pdf', kind: 'pdf', mediaType: 'application/pdf', byteLength: 1000, url: `http://127.0.0.1:2345/mira-media/${id}` })
describe('PDF authorized reader lifecycle', () => {
  it('contains a reader module failure inside the resource panel and releases its authorization', async () => {
    decoder.throws = true; vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const host = { openMediaFor: vi.fn(async () => source()), closeMedia: vi.fn(async () => undefined) }
    await act(async () => root.render(<><p data-composer>Composer remains available</p><MiraDocumentPreview controller={host} sessionId="owner" path="book.pdf" active refresh={0} onRetry={() => undefined} /></>))
    await act(async () => undefined)
    expect(container.querySelector('[data-composer]')).toBeTruthy(); expect(container.querySelector('[role="alert"]')?.textContent).toContain('重新加载 Mira'); expect(host.closeMedia).toHaveBeenCalledWith(source().id)
  })
  it('releases on hiding, unmounts the decoder and restores this tab page/zoom without stale URL reuse', async () => {
    const host = { openMediaFor: vi.fn().mockResolvedValueOnce(source()).mockResolvedValueOnce(source('b'.repeat(64))), closeMedia: vi.fn(async () => undefined) }
    const render = async (active: boolean) => act(async () => root.render(<MiraDocumentPreview controller={host} sessionId="owner" path="book.pdf" active={active} refresh={0} onRetry={() => undefined} />))
    await render(true); await act(async () => undefined)
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(container.textContent).toContain('3/1.5')
    await render(false); expect(container.querySelector('[data-reader]')).toBeNull(); expect(host.closeMedia).toHaveBeenCalledWith(source().id)
    await render(true); expect(container.querySelector('[data-reader]')?.getAttribute('data-reader')).toBe(source('b'.repeat(64)).url); expect(container.textContent).toContain('3/1.5')
  })
  it('releases a late response belonging to a hidden tab without mounting PDF.js', async () => {
    let resolve!: (value: MiraMediaPreview) => void
    const host = { openMediaFor: vi.fn(() => new Promise<MiraMediaPreview>(yes => { resolve = yes })), closeMedia: vi.fn(async () => undefined) }
    const render = async (active: boolean) => act(async () => root.render(<MiraDocumentPreview controller={host} sessionId="owner" path="book.pdf" active={active} refresh={0} onRetry={() => undefined} />))
    await render(true); await render(false); await act(async () => resolve(source()))
    expect(container.querySelector('[data-reader]')).toBeNull(); expect(host.closeMedia).toHaveBeenCalledWith(source().id)
  })
  it('rejects mismatched sources and recovers from host and decoder errors using explicit retry', async () => {
    const host = { openMediaFor: vi.fn().mockResolvedValueOnce({ ...source(), url: 'https://external.example/book.pdf' }).mockRejectedValueOnce(new Error('文件已删除')).mockResolvedValue(source()), closeMedia: vi.fn(async () => undefined) }, retry = vi.fn()
    const render = async (refresh: number) => act(async () => root.render(<MiraDocumentPreview controller={host} sessionId="owner" path="book.pdf" active refresh={refresh} onRetry={retry} />))
    await render(0); expect(container.textContent).toContain('响应不匹配'); expect(host.closeMedia).toHaveBeenCalledWith(source().id)
    await render(1); expect(container.textContent).toContain('文件已删除'); await act(async () => container.querySelector<HTMLButtonElement>('button')!.click()); expect(retry).toHaveBeenCalledOnce()
    await render(2); await act(async () => container.querySelectorAll<HTMLButtonElement>('button')[1].click()); expect(container.querySelector('[role="alert"]')?.textContent).toContain('文件损坏'); expect(host.closeMedia).toHaveBeenCalledWith(source().id)
    await render(3); expect(container.querySelector('[data-reader]')).toBeTruthy()
  })
  it('routes PDF separately, avoids text reads and watch-triggered reopening, and disables unimplemented model attachments', async () => {
    expect(filePreviewKind('BOOK.PDF')).toBe('pdf'); expect(filePreviewKind('book.pdf.ts')).toBe('text')
    const host = { openMediaFor: vi.fn(async () => source()), closeMedia: vi.fn(async () => undefined), readFileFor: vi.fn() }
    let snapshot = { revision: 0, paths: [] as string[] }, notify!: () => void
    const watch = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { notify = listener; return () => undefined } }
    await act(async () => root.render(<FilePreviewPanel controller={host as never} workspaceWatch={watch as never} sessionId="owner" path="book.pdf" active onAddFile={() => undefined} />))
    expect(host.readFileFor).not.toHaveBeenCalled(); expect(container.querySelector<HTMLButtonElement>('[aria-label="将当前文件加入对话"]')!.disabled).toBe(true)
    await act(async () => { snapshot = { revision: 1, paths: [''] }; notify() }); expect(host.openMediaFor).toHaveBeenCalledOnce()
  })
})
