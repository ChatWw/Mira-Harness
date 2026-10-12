// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MiraPresentationReader from '../apps/harness-react/src/components/workspace/MiraPresentationReader'
import type { MiraPresentationDocument, MiraPresentationRenderOptions } from '../apps/harness-react/src/lib/presentation/mira-presentation-types'

const engine = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('../apps/harness-react/src/lib/presentation/mira-presentation-engine', () => ({ miraPresentationEngine: { open: engine.open } }))
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function presentation(name: string, count = 3) {
  const renders: Array<{ page: number; mount: HTMLElement; options?: MiraPresentationRenderOptions; pending: ReturnType<typeof deferred<void>>; dispose: ReturnType<typeof vi.fn> }> = []
  const doc: MiraPresentationDocument = { pageCount: count, pageSize: { width: 960, height: 540 }, getPageElements: vi.fn(() => []), dispose: vi.fn(), renderPage: vi.fn((page, mount, options) => {
    const content = document.createElement('div'); content.dataset.fixture = name; content.textContent = `${name} page ${page + 1}`
    content.innerHTML += '<a href="https://example.com/slide">外链</a><a href="javascript:alert(1)">无效链接</a><textarea aria-label="幻灯片输入"></textarea><div contenteditable="true">编辑文字</div>'
    mount.append(content)
    const pending = deferred<void>(), dispose = vi.fn(() => content.remove())
    renders.push({ page, mount, options, pending, dispose })
    return { ready: pending.promise, dispose }
  }) }
  return { doc, renders }
}
let root: Root, container: HTMLDivElement
let viewportWidth = 992, viewportHeight = 572
const observers: Array<{ callback: IntersectionObserverCallback; target?: Element; disconnected: boolean }> = []
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); engine.open.mockReset(); observers.length = 0; viewportWidth = 992; viewportHeight = 572
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class {
    entry: typeof observers[number]
    constructor(callback: IntersectionObserverCallback) { this.entry = { callback, disconnected: false }; observers.push(this.entry) }
    observe(target: Element) { this.entry.target = target }
    disconnect() { this.entry.disconnected = true }
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () { return this.classList.contains('mira-presentation__viewport') ? viewportWidth : this.classList.contains('mira-presentation__thumbnail') ? 112 : 0 })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () { return this.classList.contains('mira-presentation__viewport') ? viewportHeight : 0 })
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const onError = vi.fn(), onOpenLink = vi.fn()
async function render(buffer = new ArrayBuffer(8), path = 'deck.pptx') {
  await act(async () => root.render(<MiraPresentationReader buffer={buffer} path={path} onError={onError} onOpenLink={onOpenLink} />))
  await act(async () => undefined)
}
beforeEach(() => { onError.mockClear(); onOpenLink.mockClear() })
function control(label: string) { return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)! }
const pageInput = () => container.querySelector<HTMLInputElement>('[aria-label="幻灯片页码"]')!
const pageIndex = () => container.querySelector<HTMLElement>('.mira-presentation__viewport [data-mira-slide-index]')!.dataset.miraSlideIndex
async function key(target: Element, value: string, extra = {}) { await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }))) }
async function typePage(value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(pageInput(), value); pageInput().dispatchEvent(new Event('input', { bubbles: true })) })
  await key(pageInput(), 'Enter')
}

describe('presentation reader interactions and owned lifecycle', () => {
  it('disposes late opens instead of replacing the latest file and releases the current document on hide', async () => {
    const late = deferred<MiraPresentationDocument>(), old = presentation('old'), current = presentation('current')
    engine.open.mockReturnValueOnce(late.promise).mockResolvedValueOnce(current.doc)
    await render(new ArrayBuffer(8), 'old.pptx'); expect(container.textContent).toContain('正在读取演示文稿')
    await render(new ArrayBuffer(9), 'current.pptx'); expect(container.textContent).toContain('current page 1')
    await act(async () => late.resolve(old.doc)); expect(old.doc.dispose).toHaveBeenCalledOnce(); expect(container.textContent).not.toContain('old page')
    const mount = current.renders[0].mount
    await act(async () => root.render(null))
    expect(current.doc.dispose).toHaveBeenCalledOnce(); expect(current.renders[0].dispose).toHaveBeenCalledOnce(); expect(mount.childNodes).toHaveLength(0)
    expect(observers.every(observer => observer.disconnected)).toBe(true)
  })
  it('navigates via thumbnails and arrows while leaving text inputs, IME and modifier keys alone', async () => {
    const view = presentation('visible'); engine.open.mockResolvedValue(view.doc); await render()
    expect(control('上一张幻灯片').disabled).toBe(true); expect(view.renders).toHaveLength(1)
    await act(async () => control('第 3 张幻灯片').click()); expect(pageIndex()).toBe('2'); expect(control('下一张幻灯片').disabled).toBe(true)
    expect(control('第 3 张幻灯片').getAttribute('aria-current')).toBe('page')
    await key(container.querySelector('[role="region"]')!, 'ArrowLeft'); expect(pageIndex()).toBe('1')
    for (const target of [pageInput(), container.querySelector('textarea')!, container.querySelector('[contenteditable]')!]) await key(target, 'ArrowRight')
    expect(pageIndex()).toBe('1')
    await key(container.querySelector('[role="region"]')!, 'ArrowRight', { ctrlKey: true }); await key(container.querySelector('[role="region"]')!, 'ArrowRight', { isComposing: true }); expect(pageIndex()).toBe('1')
    await key(container.querySelector('[role="region"]')!, 'ArrowRight'); expect(pageIndex()).toBe('2')
    await act(async () => control('上一张幻灯片').click()); expect(pageInput().value).toBe('2')
  })
  it('clamps page input, rejects mixed text, and bounds zoom from 25% to 300% with fit reset', async () => {
    viewportWidth = 512; viewportHeight = 302
    const view = presentation('controls'); engine.open.mockResolvedValue(view.doc); await render()
    expect(container.querySelector<HTMLElement>('.mira-presentation__viewport .mira-presentation__mount')!.style.transform).toBe('scale(0.5)')
    await typePage('999'); expect(pageIndex()).toBe('2'); expect(pageInput().value).toBe('3')
    await typePage('0'); expect(pageIndex()).toBe('0'); expect(pageInput().value).toBe('1')
    await typePage('2x'); expect(pageIndex()).toBe('0'); expect(pageInput().value).toBe('1')
    for (let count = 0; count < 12; count++) await act(async () => control('放大幻灯片').click())
    expect(control('放大幻灯片').disabled).toBe(true); expect(control('幻灯片适合窗口').textContent).toBe('300%')
    expect(container.querySelector<HTMLElement>('.mira-presentation__viewport .mira-presentation__mount')!.style.transform).toBe('scale(1.5)')
    for (let count = 0; count < 12; count++) await act(async () => control('缩小幻灯片').click())
    expect(control('缩小幻灯片').disabled).toBe(true); expect(control('幻灯片适合窗口').textContent).toBe('25%')
    await act(async () => control('幻灯片适合窗口').click()); expect(control('幻灯片适合窗口').textContent).toBe('100%')
    expect(container.querySelector<HTMLElement>('.mira-presentation__viewport .mira-presentation__mount')!.style.transform).toBe('scale(0.5)')
    expect(view.renders.filter(item => item.page === 0)).toHaveLength(2) // zoom does not recreate the render handle
  })
  it('lazily renders intersecting thumbnails and disposes their handles when they leave the rail viewport', async () => {
    const view = presentation('lazy'); engine.open.mockResolvedValue(view.doc); await render()
    const observer = observers.findLast(observer => !observer.disconnected && observer.target === control('第 2 张幻灯片'))!
    await act(async () => observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(view.renders).toHaveLength(2); expect(view.renders[1].page).toBe(1)
    await act(async () => observer.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(view.renders[1].dispose).toHaveBeenCalledOnce()
  })
  it('routes safe renderer/DOM links to the owner, maps internal page targets and resets accidental inner scrolling', async () => {
    const view = presentation('links'); engine.open.mockResolvedValue(view.doc); await render()
    const page = view.renders[0]
    await act(async () => { page.options!.onNavigate!({ url: 'https://example.com/safe' }); page.options!.onNavigate!({ url: 'javascript:alert(1)' }); page.options!.onNavigate!({ url: '#bookmark' }); page.options!.onNavigate!({ url: 'https://user:secret@example.com' }) })
    expect(onOpenLink.mock.calls).toEqual([['https://example.com/safe']])
    const anchor = page.mount.querySelector('a')!, event = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => anchor.dispatchEvent(event)); expect(event.defaultPrevented).toBe(true); expect(onOpenLink).toHaveBeenLastCalledWith('https://example.com/slide')
    expect(page.mount.querySelectorAll('a')[1].hasAttribute('href')).toBe(false)
    const inner = page.mount.firstElementChild as HTMLElement; inner.scrollTop = 10; inner.scrollLeft = 20
    inner.dispatchEvent(new Event('scroll')); expect(inner.scrollTop).toBe(0); expect(inner.scrollLeft).toBe(0)
    await act(async () => page.options!.onNavigate!({ pageIndex: 2 })); expect(pageIndex()).toBe('2')
  })
  it('preserves the pointer target when owner callback identities change and routes through the latest callbacks', async () => {
    const view = presentation('stable'), buffer = new ArrayBuffer(8), firstOpen = vi.fn(), nextOpen = vi.fn(), firstError = vi.fn(), nextError = vi.fn()
    engine.open.mockResolvedValue(view.doc)
    await act(async () => root.render(<MiraPresentationReader buffer={buffer} path="stable.pptx" onOpenLink={firstOpen} onError={firstError} />))
    await act(async () => undefined)
    const original = view.renders[0], anchor = original.mount.querySelector('a')!
    anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    // Resource focus changes the parent render between pointerdown and click.
    await act(async () => root.render(<MiraPresentationReader buffer={buffer} path="stable.pptx" onOpenLink={nextOpen} onError={nextError} />))
    expect(view.renders).toHaveLength(1); expect(original.dispose).not.toHaveBeenCalled(); expect(anchor.isConnected).toBe(true)
    await act(async () => anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    expect(firstOpen).not.toHaveBeenCalled(); expect(nextOpen).toHaveBeenCalledExactlyOnceWith('https://example.com/slide')
    await act(async () => original.options!.onNavigate!({ url: 'https://example.com/latest' }))
    expect(nextOpen).toHaveBeenLastCalledWith('https://example.com/latest')
    await act(async () => original.pending.reject(new Error('current resource')))
    expect(firstError).not.toHaveBeenCalled(); expect(nextError).toHaveBeenCalledExactlyOnceWith('幻灯片渲染失败，请刷新重试。')
  })
  it('ignores ready failures belonging to disposed pages and reports the active page failure once', async () => {
    const view = presentation('errors'); engine.open.mockResolvedValue(view.doc); await render()
    await act(async () => control('下一张幻灯片').click())
    await act(async () => view.renders[0].pending.reject(new Error('old image'))); expect(onError).not.toHaveBeenCalled()
    await act(async () => view.renders[1].pending.reject(new Error('current image'))); expect(onError).toHaveBeenCalledExactlyOnceWith('幻灯片渲染失败，请刷新重试。')
    await act(async () => root.render(null)); expect(view.renders[1].dispose).toHaveBeenCalledOnce()
  })
  it('contains open failures and ignores a rejected open after changing files', async () => {
    const late = deferred<MiraPresentationDocument>(), current = presentation('current'); engine.open.mockReturnValueOnce(late.promise).mockResolvedValueOnce(current.doc).mockRejectedValueOnce(new Error('Bad ZIP'))
    await render(new ArrayBuffer(8)); await render(new ArrayBuffer(9))
    await act(async () => late.reject(new Error('old zip'))); expect(onError).not.toHaveBeenCalled()
    await render(new ArrayBuffer(10)); expect(onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('无法解析')); expect(current.doc.dispose).toHaveBeenCalledOnce()
  })
})
