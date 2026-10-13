// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MiraPresentationReader from '../apps/harness-react/src/components/workspace/MiraPresentationReader'
import type { MiraPresentationDocument, MiraPresentationElement, MiraPresentationRenderOptions } from '../apps/harness-react/src/lib/presentation/mira-presentation-types'

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

describe('presentation element selection and references', () => {
  const shape: MiraPresentationElement = { slideIndex: 0, slidePart: 'ppt/slides/slide1.xml', nodeId: 'title', nodeName: '标题', nodeType: 'shape', text: '幻灯片标题', bounds: { x: 20, y: 20, width: 400, height: 100 }, zIndex: 1 }
  const table: MiraPresentationElement = { ...shape, nodeId: 'table', nodeName: '表格', nodeType: 'table', text: undefined, bounds: { x: 100, y: 200, width: 300, height: 100 }, zIndex: 2 }
  const cell: MiraPresentationElement = { ...table, nodeType: 'table-cell', rowIndex: 0, cellIndex: 0, text: '第一格', bounds: { x: 100, y: 200, width: 150, height: 100 } }
  function setup() { const view = presentation('selection'); vi.mocked(view.doc.getPageElements).mockReturnValue([shape, table, cell]); engine.open.mockResolvedValue(view.doc); return view }
  async function show(buffer: ArrayBuffer, onAddElement?: (element: MiraPresentationElement, comment: string, selectedText?: string) => Promise<void>, navigation?: React.ComponentProps<typeof MiraPresentationReader>['navigation'], fingerprint = 'source-one') {
    await act(async () => root.render(<MiraPresentationReader buffer={buffer} path="selection.pptx" onError={onError} onOpenLink={onOpenLink} onAddElement={onAddElement} navigation={navigation} sourceFingerprint={fingerprint} />))
    await act(async () => undefined)
  }
  const element = (label: string) => container.querySelector<HTMLButtonElement>(`.mira-presentation__selection-layer button[aria-label="${label}"]`)!
  const action = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.mira-presentation__actions button')].find(button => button.textContent === label)!
  async function edit() { await act(async () => action('AI 编辑').click()) }
  async function comment(value: string) {
    const input = document.querySelector<HTMLTextAreaElement>('[aria-label="元素修改说明"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  it('hides selection without the authorized add callback and preserves rendering and keyboard targets while selecting', async () => {
    const view = setup(), buffer = new ArrayBuffer(8), add = vi.fn().mockResolvedValue(undefined)
    await show(buffer); expect(control('选择幻灯片元素')).toBeNull(); expect(view.doc.getPageElements).not.toHaveBeenCalled()
    await show(buffer, add); await act(async () => control('选择幻灯片元素').click())
    expect(view.doc.getPageElements).toHaveBeenCalledWith(0)
    const target = element('幻灯片标题'); target.focus()
    await act(async () => target.click()); expect(target.isConnected).toBe(true); expect(document.activeElement).toBe(target)
    expect(target.getAttribute('aria-pressed')).toBe('true'); expect(element('第一格').style.zIndex).toBe('1000002')
    expect(document.querySelector('[role="toolbar"][aria-label="幻灯片元素 AI 编辑"]')).not.toBeNull()
    expect(container.querySelector('.mira-presentation__actions')).toBeNull() // portal escapes the clipped slide
    expect(view.renders).toHaveLength(1); expect(add).not.toHaveBeenCalled()
  })
  it('keeps native text interaction inside the chosen element and blocks ordinary links only during selection mode', async () => {
    const view = setup(), buffer = new ArrayBuffer(8), add = vi.fn().mockResolvedValue(undefined)
    await show(buffer, add); await act(async () => control('选择幻灯片元素').click()); await act(async () => element('幻灯片标题').click())
    const mount = view.renders[0].mount
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 540 } as DOMRect)
    const inside = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 })
    await act(async () => mount.dispatchEvent(inside)); expect(inside.defaultPrevented).toBe(false)
    const cellPoint = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 120, clientY: 220 })
    await act(async () => mount.dispatchEvent(cellPoint)); expect(cellPoint.defaultPrevented).toBe(true); expect(element('第一格').getAttribute('aria-pressed')).toBe('true')
    await act(async () => { mount.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); view.renders[0].options!.onNavigate!({ pageIndex: 2 }) })
    expect(onOpenLink).not.toHaveBeenCalled(); expect(pageIndex()).toBe('0')
    await act(async () => control('退出元素选择').click())
    await act(async () => mount.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    expect(onOpenLink).toHaveBeenLastCalledWith('https://example.com/slide'); expect(view.renders).toHaveLength(1)
  })
  it('adds one element with trimmed comment without sending and retains the complete element text', async () => {
    setup(); const buffer = new ArrayBuffer(8), pending = deferred<void>(), add = vi.fn().mockReturnValue(pending.promise)
    await show(buffer, add); await act(async () => control('选择幻灯片元素').click()); await act(async () => element('幻灯片标题').click()); await edit(); await comment('  改成短标题  ')
    expect(add).not.toHaveBeenCalled()
    await act(async () => { action('添加到对话').click(); action('正在添加…')?.click() })
    expect(add).toHaveBeenCalledExactlyOnceWith(shape, '改成短标题', undefined)
    await act(async () => pending.resolve()); expect(action('AI 编辑')).toBeTruthy(); expect(document.querySelector('textarea[aria-label="元素修改说明"]')).toBeNull()
  })
  it('captures only selected text from the chosen element while retaining complete source text for validation', async () => {
    const view = setup(), buffer = new ArrayBuffer(8), add = vi.fn().mockResolvedValue(undefined)
    await show(buffer, add); await act(async () => control('选择幻灯片元素').click()); await act(async () => element('幻灯片标题').click())
    const mount = view.renders[0].mount, text = document.createTextNode(shape.text!), neighbor = document.createTextNode('邻居内容')
    mount.append(text, neighbor)
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 960, height: 540 } as DOMRect)
    const nativeRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = nativeRange()
      Object.defineProperty(range, 'getClientRects', { value: () => range.startContainer === text ? [{ left: 40, right: 100, top: 40, bottom: 80 }] : [{ left: 600, right: 900, top: 40, bottom: 80 }] })
      return range
    })
    const range = nativeRange(); range.setStart(text, 3); range.setEnd(neighbor, 2)
    document.getSelection()!.addRange(range)
    await edit(); await comment('改为英文'); await act(async () => action('添加到对话').click())
    expect(add).toHaveBeenCalledExactlyOnceWith(shape, '改为英文', '标题')
    expect(add.mock.calls[0][0].text).toBe('幻灯片标题')
  })
  it('preserves comment after failure, retries, and treats IME Escape as input before canceling only the comment', async () => {
    setup(); const buffer = new ArrayBuffer(8), add = vi.fn().mockRejectedValueOnce(new Error('owner failed')).mockResolvedValue(undefined)
    await show(buffer, add); await act(async () => control('选择幻灯片元素').click()); await act(async () => element('幻灯片标题').click()); await edit(); await comment('保留修改说明')
    await act(async () => action('添加到对话').click())
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('评论已保留'); expect(document.querySelector<HTMLTextAreaElement>('[aria-label="元素修改说明"]')!.value).toBe('保留修改说明')
    const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="元素修改说明"]')!
    await act(async () => textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await key(textarea, 'Escape'); expect(document.querySelector('[aria-label="元素修改说明"]')).not.toBeNull()
    await act(async () => textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await key(textarea, 'Escape'); expect(action('AI 编辑')).toBeTruthy(); expect(control('退出元素选择')).toBeTruthy()
    await edit(); await comment('重试修改'); await act(async () => action('添加到对话').click())
    expect(add).toHaveBeenLastCalledWith(shape, '重试修改', undefined)
    await key(container.querySelector('[role="region"]')!, 'Escape'); expect(control('选择幻灯片元素')).toBeTruthy()
  })
  it('ignores a late add failure after changing page and a late success after replacing the source', async () => {
    setup(); const buffer = new ArrayBuffer(8), first = deferred<void>(), second = deferred<void>(), add = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await show(buffer, add); await act(async () => control('选择幻灯片元素').click()); await act(async () => element('幻灯片标题').click()); await edit(); await comment('旧页')
    await act(async () => action('添加到对话').click()); await act(async () => control('下一张幻灯片').click()); await act(async () => first.reject(new Error('late')))
    expect(document.querySelector('.mira-presentation__actions')).toBeNull(); expect(document.querySelector('[role="alert"]')).toBeNull()
    await act(async () => control('上一张幻灯片').click()); await act(async () => element('幻灯片标题').click()); await edit(); await comment('旧文件'); await act(async () => action('添加到对话').click())
    const next = presentation('next'); vi.mocked(next.doc.getPageElements).mockReturnValue([shape]); engine.open.mockResolvedValueOnce(next.doc)
    await show(new ArrayBuffer(9), add); await act(async () => control('选择幻灯片元素').click()); await act(async () => element('幻灯片标题').click()); await edit(); await comment('新文件说明')
    await act(async () => second.resolve()); expect(document.querySelector<HTMLTextAreaElement>('[aria-label="元素修改说明"]')!.value).toBe('新文件说明')
  })
  it('applies each navigation once, positions the original page and refuses mismatched sources or removed pages', async () => {
    setup(); const buffer = new ArrayBuffer(8), add = vi.fn().mockResolvedValue(undefined), target = { ...shape, slideIndex: 2 }
    const request = { requestId: 'one', reference: { sourceFingerprint: 'source-one', element: target } }
    await show(buffer, add, request); expect(pageIndex()).toBe('2'); expect(container.querySelector('.mira-presentation__selection-layer')).toBeNull()
    await act(async () => control('上一张幻灯片').click()); await show(buffer, add, { ...request }); expect(pageIndex()).toBe('1')
    await show(buffer, add, { requestId: 'two', reference: { sourceFingerprint: 'old-source', element: target } }); expect(pageIndex()).toBe('1'); expect(container.textContent).toContain('文件已变更')
    await show(buffer, add, { requestId: 'three', reference: { sourceFingerprint: 'source-one', element: { ...target, slideIndex: 99 } } }); expect(container.textContent).toContain('幻灯片不存在'); expect(pageIndex()).toBe('1')
    await show(buffer, add, { requestId: 'four', reference: { sourceFingerprint: 'source-one', element: shape } }); expect(pageIndex()).toBe('0'); expect(container.textContent).not.toContain('幻灯片不存在')
  })
})
