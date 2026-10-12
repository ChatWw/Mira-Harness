// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MiraWordReader from '../apps/harness-react/src/components/workspace/MiraWordReader'

const renderer = vi.hoisted(() => ({ render: vi.fn(), links: vi.fn(), disposeLinks: vi.fn() }))
vi.mock('docx-preview', () => ({ renderAsync: renderer.render }))
vi.mock('../apps/harness-react/src/lib/mira-document-links', () => ({ installMiraDocumentLinks: renderer.links }))

let root: Root, container: HTMLDivElement
let resized: (() => void) | undefined
const disconnected = vi.fn()
function appendDocument(body: HTMLElement, styles: HTMLElement, text = '中文正文') {
  styles.innerHTML = '<style>body { background: red; } .mira-word-page { color: black; }</style>'
  body.innerHTML = `<div class="mira-word-page-wrapper"><section class="mira-word-page"><header>页眉</header><p>${text}</p><img src="data:image/png;base64,AA=="><footer>脚注</footer></section><section class="mira-word-page"><p>第二节</p></section></div>`
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback } observe() {} disconnect() { disconnected() } })
  renderer.render.mockReset().mockImplementation(async (_buffer, body, styles) => { appendDocument(body, styles) })
  renderer.links.mockReset().mockReturnValue(renderer.disposeLinks)
  renderer.disposeLinks.mockClear(); disconnected.mockClear(); resized = undefined
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const buffer = new ArrayBuffer(8)
describe('Word resource reader', () => {
  it('isolates OOXML styles while preserving document sections, images, headers and text', async () => {
    const onError = vi.fn(), open = vi.fn()
    await act(async () => root.render(<MiraWordReader buffer={buffer} path="notes.docx" onError={onError} onOpenLink={open} />))
    const shadow = container.querySelector('[data-mira-word-document]')!.shadowRoot!
    expect(container.querySelector('style')).toBeNull()
    expect(shadow.querySelectorAll('section')).toHaveLength(2)
    expect(shadow.textContent).toContain('中文正文')
    expect(shadow.querySelector('header')?.textContent).toBe('页眉')
    expect(shadow.querySelector('footer')?.textContent).toBe('脚注')
    expect(shadow.querySelector('img')?.src).toBe('data:image/png;base64,AA==')
    expect(renderer.links).toHaveBeenCalledWith(expect.any(HTMLElement), expect.any(Function))
    renderer.links.mock.calls[0][1]('https://example.com'); expect(open).toHaveBeenCalledWith('https://example.com')
    expect(renderer.render.mock.calls[0][3]).toMatchObject({ breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFootnotes: true, renderAltChunks: false, useBase64URL: true })
    expect(onError).not.toHaveBeenCalled()
  })
  it('never attaches a late render after switching files and disposes the current links and DOM', async () => {
    let release!: () => void
    let oldBody!: HTMLElement
    renderer.render.mockImplementationOnce((_buffer, body, styles) => {
      oldBody = body
      return new Promise<void>(resolve => { release = () => { appendDocument(body, styles, '旧文件'); resolve() } })
    })
    await act(async () => root.render(<MiraWordReader buffer={buffer} path="old.docx" onError={vi.fn()} />))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('加载')
    expect(oldBody.isConnected).toBe(false)
    await act(async () => root.render(<MiraWordReader buffer={new ArrayBuffer(9)} path="new.docx" onError={vi.fn()} />))
    const current = container.querySelector('[data-mira-word-document]')!
    await act(async () => release())
    expect(container.querySelector('[data-mira-word-document]')).toBe(current)
    expect(current.shadowRoot!.textContent).not.toContain('旧文件')
    expect(oldBody.isConnected).toBe(false)
    await act(async () => root.render(null))
    expect(renderer.disposeLinks).toHaveBeenCalledOnce()
    expect(current.shadowRoot!.childNodes).toHaveLength(0)
    expect(disconnected).toHaveBeenCalledOnce()
  })
  it('reports parse errors with recovery guidance and ignores errors from disposed renders', async () => {
    let reject!: (error: Error) => void
    renderer.render.mockImplementationOnce(() => new Promise<void>((_yes, no) => { reject = no }))
    const onError = vi.fn()
    await act(async () => root.render(<MiraWordReader buffer={buffer} path="old.docx" onError={onError} />))
    await act(async () => root.render(<MiraWordReader buffer={buffer} path="new.docx" onError={onError} />))
    await act(async () => reject(new Error('old failure')))
    expect(onError).not.toHaveBeenCalled()
    renderer.render.mockRejectedValueOnce(new Error('invalid zip'))
    await act(async () => root.render(<MiraWordReader buffer={buffer} path="bad.docx" onError={onError} />))
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('外部应用'))
    expect(container.querySelector('[data-word-state="error"]')).toBeTruthy()
    expect(container.querySelector('[data-mira-word-document]')).toBeNull()
  })
  it('fits a narrow desktop pane without retaining unscaled scroll dimensions or enlarging pages', async () => {
    let available = 400, width = 800, height = 2000
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () { return this.classList.contains('mira-word-reader__viewport') ? available : 0 })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.classList.contains('mira-word-reader__content') ? width : 0 })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-word-reader__content') ? height : 0 })
    await act(async () => root.render(<MiraWordReader buffer={buffer} path="notes.docx" onError={vi.fn()} />))
    const frame = container.querySelector<HTMLElement>('.mira-word-reader__frame')!, content = container.querySelector<HTMLElement>('.mira-word-reader__content')!
    expect(content.style.transform).toBe('scale(0.5)')
    expect(frame.style.width).toBe('400px'); expect(frame.style.height).toBe('1000px')
    available = 1200
    await act(async () => resized!())
    expect(content.style.transform).toBe('scale(1)'); expect(frame.style.width).toBe('800px')
    width = 1000; height = 2200
    await act(async () => resized!())
    expect(frame.style.width).toBe('1000px'); expect(frame.style.height).toBe('2200px')
    available = 0
    await act(async () => resized!())
    expect(frame.style.width).toBe('1000px')
  })
})
