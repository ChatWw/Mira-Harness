// @vitest-environment happy-dom
import React, { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MiraLegacyWordReader from '../apps/harness-react/src/components/workspace/MiraLegacyWordReader'

const reader = vi.hoisted(() => ({ wasm: vi.fn(), editor: vi.fn(), props: {} as any, mode: 'ready', release: vi.fn(), pending: [] as { resolve(value: any): void }[], mounted: vi.fn(), unmounted: vi.fn() }))
vi.mock('@extend-ai/react-docx', () => ({
  setWasmSource: reader.wasm,
  useDocxModel: (buffer: ArrayBuffer) => {
    const [result, setResult] = useState<any>(() => reader.mode === 'ready' ? { isLoading: false, model: { title: `文件${buffer.byteLength}` } } : reader.mode === 'error' ? { isLoading: false, error: new Error('parse failed') } : { isLoading: true })
    useEffect(() => {
      let active = true
      if (reader.mode === 'pending') reader.pending.push({ resolve: value => { if (active) setResult(value) } })
      return () => { active = false; reader.release() }
    }, [buffer])
    return result
  },
  useDocxEditor: (options: any) => { reader.editor(options); return { model: options.starterModel } },
  DocxEditorViewer: (props: any) => {
    reader.props = props
    useEffect(() => { reader.mounted(); return () => reader.unmounted() }, [])
    return <article data-full-viewer><p>{props.editor.model.title}</p><a href="https://example.com" target="_blank"><span>参考资料</span></a></article>
  },
}))
let root: Root, container: HTMLDivElement, resized: (() => void) | undefined
const disconnect = vi.fn()
const buffer = new ArrayBuffer(10)
beforeEach(() => {
  reader.mode = 'ready'; reader.pending = []; reader.editor.mockClear(); reader.release.mockClear(); reader.mounted.mockClear(); reader.unmounted.mockClear(); disconnect.mockClear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback } observe() {} disconnect() { disconnect() } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('Mira legacy Word full editor preview', () => {
  it('uses local WASM and the complete editor layout in fixed light read-only mode', async () => {
    await act(async () => root.render(<MiraLegacyWordReader buffer={buffer} path="旧文档.doc" onError={vi.fn()} />))
    expect(reader.wasm).toHaveBeenCalledWith(new URL('office/docx_wasm_bg.wasm', document.baseURI).href)
    expect(reader.editor.mock.calls[0][0]).toMatchObject({ initialDocumentTheme: 'light', initialFileName: '旧文档.doc', starterModel: { title: '文件10' } })
    expect(reader.props.mode).toBe('read-only'); expect(reader.props.pageGapBackgroundColor).toBe('transparent')
    expect(reader.props.pageVirtualization.zoomScale).toBe(1)
    expect(container.querySelector('[data-full-viewer]')).toBeTruthy()
  })
  it('matches virtualized page coordinates to width-fit scaling and retains the full scaled height', async () => {
    let available = 400
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () { return this.classList.contains('mira-legacy-word-reader__viewport') ? available : 0 })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.classList.contains('mira-legacy-word-reader__content') ? 800 : 0 })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-legacy-word-reader__content') ? 4000 : 0 })
    await act(async () => root.render(<MiraLegacyWordReader buffer={buffer} path="long.doc" onError={vi.fn()} />))
    const frame = container.querySelector<HTMLElement>('.mira-legacy-word-reader__frame')!
    expect(frame.style.width).toBe('400px'); expect(frame.style.height).toBe('2000px')
    expect(reader.props.pageVirtualization.zoomScale).toBe(.5)
    expect(reader.props.pageVirtualization.scrollElement).toBe(container.querySelector('.mira-legacy-word-reader'))
    available = 1200; await act(async () => resized!())
    expect(frame.style.width).toBe('800px'); expect(frame.style.height).toBe('4000px'); expect(reader.props.pageVirtualization.zoomScale).toBe(1)
  })
  it('routes safe document links without remounting when callbacks change and cleans up on unmount', async () => {
    const first = vi.fn(), second = vi.fn()
    await act(async () => root.render(<MiraLegacyWordReader buffer={buffer} path="old.doc" onOpenLink={first} onError={vi.fn()} />))
    const page = container.querySelector('[data-full-viewer]')!
    await act(async () => root.render(<MiraLegacyWordReader buffer={buffer} path="old.doc" onOpenLink={second} onError={vi.fn()} />))
    const link = container.querySelector('span')!, event = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => { link.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true); expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledWith('https://example.com')
    expect(container.querySelector('[data-full-viewer]')).toBe(page); expect(reader.mounted).toHaveBeenCalledOnce()
    await act(async () => root.render(null))
    expect(reader.release).toHaveBeenCalledOnce(); expect(reader.unmounted).toHaveBeenCalledOnce(); expect(disconnect).toHaveBeenCalledOnce()
    page.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(second).toHaveBeenCalledOnce()
  })
  it('remounts parsing on new bytes and discards late results from the replaced or unmounted input', async () => {
    reader.mode = 'pending'
    const onError = vi.fn()
    await act(async () => root.render(<MiraLegacyWordReader buffer={buffer} path="old.doc" onError={onError} />))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('正在读取')
    await act(async () => root.render(<MiraLegacyWordReader buffer={new ArrayBuffer(11)} path="new.doc" onError={onError} />))
    expect(reader.release).toHaveBeenCalledOnce()
    await act(async () => reader.pending[0].resolve({ isLoading: false, error: new Error('late') }))
    expect(onError).not.toHaveBeenCalled(); expect(container.querySelector('[data-full-viewer]')).toBeNull()
    await act(async () => reader.pending[1].resolve({ isLoading: false, model: { title: '新正文' } }))
    expect(container.textContent).toContain('新正文')
    await act(async () => root.render(null))
    await act(async () => reader.pending[1].resolve({ isLoading: false, error: new Error('unmounted') }))
    expect(onError).not.toHaveBeenCalled(); expect(container.textContent).toBe('')
  })
  it('reports a parse failure with a recovery path after commit without repeating on callback changes', async () => {
    reader.mode = 'error'; const first = vi.fn(), second = vi.fn()
    await act(async () => root.render(<MiraLegacyWordReader buffer={buffer} path="broken.doc" onError={first} />))
    expect(first).toHaveBeenCalledOnce(); expect(first.mock.calls[0][0]).toContain('外部应用')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('刷新重试')
    expect(container.querySelector('[data-full-viewer]')).toBeNull()
    await act(async () => root.render(<MiraLegacyWordReader buffer={buffer} path="broken.doc" onError={second} />))
    expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled()
  })
})
