// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraBrowserPanel, type MiraBrowserRequest } from '../apps/harness-react/src/components/workspace/MiraBrowserPanel'
import type { WorkspaceHtmlSource } from '../apps/harness-react/src/state/workspace-state'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
async function fixture(initial = '', preference?: Promise<unknown>, htmlSource?: WorkspaceHtmlSource) {
  const listeners = new Set<(event: any) => void>()
  const controller = {
    getWorkspaceHtmlUrl: vi.fn(async () => 'http://127.0.0.1:9876/index.html'),
    onBrowserEvent: vi.fn((callback: (event: any) => void) => { listeners.add(callback); return () => listeners.delete(callback) }),
    navigateBrowserFor: vi.fn(async (_sessionId: string, url: string, _bounds: unknown) => url),
    closeBrowserFor: vi.fn(async () => undefined), controlBrowserFor: vi.fn(async () => undefined), setBrowserBoundsFor: vi.fn(async () => undefined),
    openBrowserExternalFor: vi.fn(async () => undefined),
    pickBrowserElementFor: vi.fn<(_sessionId: string, _action: string, _browserId: string) => Promise<any>>(async () => ({ status: 'cancelled' })),
    getPreference: vi.fn(async () => preference ?? null), setPreference: vi.fn<(_key: string, _value: unknown, _reportFailure: boolean) => Promise<void>>(async () => undefined), registerBeforeNavigation: vi.fn((_callback: () => Promise<void>) => () => undefined),
    setBrowserViewportFor: vi.fn(async () => ({ desktopZoomFactor: 1 })),
  }
  const handled = vi.fn(), observed = vi.fn(), selectElement = vi.fn(() => true)
  let props = { sessionId: 'a', active: true, request: undefined as MiraBrowserRequest | undefined }
  function View() {
    const [url, setUrl] = useState(initial), [request, setRequest] = useState(props.request)
    // Externally requested navigation and browser-observed URL remain separate.
    return <MiraBrowserPanel controller={controller as unknown as PilotController} {...props} initialUrl={url} htmlSource={htmlSource} request={props.request || request} onRequestHandled={value => { handled(value); props.request = undefined; setRequest(undefined) }} onUrlChange={value => { observed(value); setUrl(value) }} onSelectElement={selectElement} />
  }
  const render = async (patch: Partial<typeof props> = {}) => { props = { ...props, ...patch }; await act(async () => root.render(<View />)) }
  const request = async (url: string, sessionId = props.sessionId) => render({ request: { url, sessionId } })
  const event = async (sessionId: string, url: string, extra: Record<string, unknown> = {}) => { await act(async () => listeners.forEach(listener => listener({ sessionId, url, canGoBack: true, canGoForward: false, loading: false, ...extra }))) }
  const address = () => (container.querySelector('[aria-label="浏览器地址"]') as HTMLInputElement).value
  await render()
  return { controller, handled, observed, selectElement, render, request, event, address }
}

describe('current-task browser explicit navigation', () => {
  it('keeps the browser visible for reference details outside its viewport and restores it after an overlapping popup closes', async () => {
    const view = await fixture('https://mira.test/one')
    const viewport = container.querySelector('.pilot-browser__view')
    expect(viewport).not.toBeNull()
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this === viewport ? new DOMRect(600, 150, 500, 500) : new DOMRect(50, 400, 400, 100)
    })
    view.controller.controlBrowserFor.mockClear()
    const details = document.createElement('div'); details.setAttribute('data-mira-browser-context-details', ''); details.setAttribute('role', 'region')
    await act(async () => { container.append(details); await new Promise(done => setTimeout(done, 5)) })
    expect(view.controller.controlBrowserFor).not.toHaveBeenCalledWith('a', 'hide', 'browser')
    vi.spyOn(details, 'getBoundingClientRect').mockReturnValue(new DOMRect(700, 400, 200, 100))
    await act(async () => { details.setAttribute('style', 'left:700px'); await new Promise(done => setTimeout(done, 5)) })
    expect(view.controller.controlBrowserFor).toHaveBeenLastCalledWith('a', 'hide', 'browser')
    await act(async () => { details.remove(); await new Promise(done => setTimeout(done, 5)) })
    expect(view.controller.controlBrowserFor).toHaveBeenLastCalledWith('a', 'show', 'browser')
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledOnce()
    expect(view.controller.closeBrowserFor).not.toHaveBeenCalled()
  })

  it.each(['menu', 'listbox', 'dialog'])('does not hide the browser for a nonmodal %s in the conversation column', async role => {
    const view = await fixture('https://mira.test/one')
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === role ? new DOMRect(20, 300, 400, 200) : new DOMRect(600, 150, 500, 500)
    })
    view.controller.controlBrowserFor.mockClear()
    const popup = document.createElement('div'); popup.setAttribute('role', role); popup.setAttribute('aria-modal', 'false')
    await act(async () => { container.append(popup); await new Promise(done => setTimeout(done, 5)) })
    expect(view.controller.controlBrowserFor).not.toHaveBeenCalledWith('a', 'hide', 'browser')
    popup.remove()
  })

  it('reauthorizes restored HTML by workspace identity instead of reusing a dead server URL', async () => {
    const view = await fixture('http://127.0.0.1:1234/index.html', undefined, { projectId: 'p', path: 'index.html' })
    expect(view.controller.getWorkspaceHtmlUrl).toHaveBeenCalledExactlyOnceWith({ projectId: 'p' }, 'index.html')
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledWith('a', 'http://127.0.0.1:9876/index.html', expect.any(Object), 'browser', true)
    expect(view.address()).toBe('http://127.0.0.1:9876/index.html')
    view.controller.getWorkspaceHtmlUrl.mockRejectedValueOnce(new Error('项目已移除'))
    await view.render({ sessionId: 'b' })
    expect(container.textContent).toContain('项目已移除')
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(1)
    await act(async () => (container.querySelector('.pilot-browser__placeholder--error button') as HTMLButtonElement).click())
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toContain('项目已移除')
  })

  it('routes selected elements to the source Composer and cancels stale hidden/task results', async () => {
    const view = await fixture('https://mira.test/one')
    await view.event('a', 'https://mira.test/one', { ready: true })
    let pending = deferred<any>()
    view.controller.pickBrowserElementFor.mockImplementation((_session, action) => action === 'start' ? pending.promise : Promise.resolve({ status: 'cancelled' }))
    const select = () => (container.querySelector('[aria-label="选择网页元素"]') as HTMLButtonElement).click()
    await act(async () => select())
    expect(container.querySelector('[aria-label="取消元素选择"]')).not.toBeNull()
    await act(async () => pending.resolve({ status: 'selected', element: { tagName: 'button' } }))
    expect(view.selectElement).toHaveBeenCalledWith({ sessionId: 'a', browserId: 'browser', element: { tagName: 'button' } })
    pending = deferred<any>(); await act(async () => select())
    await view.render({ active: false })
    expect(view.controller.pickBrowserElementFor).toHaveBeenLastCalledWith('a', 'cancel', 'browser')
    await act(async () => pending.resolve({ status: 'selected', element: { tagName: 'a' } }))
    expect(view.selectElement).toHaveBeenCalledTimes(1)
    await view.render({ active: true }); pending = deferred<any>(); await act(async () => select())
    await view.render({ sessionId: 'b' })
    await act(async () => pending.resolve({ status: 'selected', element: { tagName: 'input' } }))
    expect(view.selectElement).toHaveBeenCalledTimes(1)
  })
  it('Escape from the host toolbar cancels without triggering other task keyboard actions', async () => {
    const view = await fixture('https://mira.test/one'), pending = deferred<any>()
    await view.event('a', 'https://mira.test/one', { ready: true })
    view.controller.pickBrowserElementFor.mockImplementation((_session, action) => action === 'start' ? pending.promise : Promise.resolve({ status: 'cancelled' }))
    await act(async () => (container.querySelector('[aria-label="选择网页元素"]') as HTMLButtonElement).click())
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    await act(async () => window.dispatchEvent(escape))
    expect(escape.defaultPrevented).toBe(true)
    expect(view.controller.pickBrowserElementFor).toHaveBeenLastCalledWith('a', 'cancel', 'browser')
    await act(async () => pending.resolve({ status: 'cancelled' }))
    expect(view.selectElement).not.toHaveBeenCalled()
  })
  it('hydrates display preferences before constructing the native page or accepting mode edits', async () => {
    const preference = deferred<unknown>(), view = await fixture('https://mira.test/one', preference.promise)
    expect(view.controller.navigateBrowserFor).not.toHaveBeenCalled()
    expect((container.querySelector('[aria-label="自由尺寸"]') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => preference.resolve({ mode: 'free', size: { width: 800, height: 600 }, zoom: '75' }))
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledOnce()
    expect((container.querySelector('[aria-label="网页宽度"]') as HTMLInputElement).value).toBe('800')
    expect(container.querySelector('[aria-label="网页预览缩放"]')!.textContent).toBe('75%')
    expect(view.controller.setPreference).not.toHaveBeenCalled()
  })
  it('blocks application navigation on an in-flight preference failure, retains the value and retries it', async () => {
    const view = await fixture('https://mira.test/one'), pending = deferred<void>()
    view.controller.setPreference.mockImplementationOnce(() => pending.promise)
    await act(async () => (container.querySelector('[aria-label="自由尺寸"]') as HTMLButtonElement).click())
    const flush = view.controller.registerBeforeNavigation.mock.calls[0][0], leaving = flush()
    const rejection = expect(leaving).rejects.toThrow('disk failed')
    await act(async () => { pending.reject(new Error('disk failed')); await rejection })
    expect(container.textContent).toContain('浏览器显示偏好保存失败')
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '重试保存')!.click())
    expect(view.controller.setPreference).toHaveBeenCalledTimes(2)
    expect(view.controller.setPreference.mock.calls[1][1]).toEqual(view.controller.setPreference.mock.calls[0][1])
    expect(container.textContent).not.toContain('浏览器显示偏好保存失败')
    await flush()
  })
  it('commits valid dimensions, preserves invalid drafts, restores on Escape and keeps navigation intact', async () => {
    const view = await fixture('https://mira.test/one')
    await act(async () => (container.querySelector('[aria-label="自由尺寸"]') as HTMLButtonElement).click())
    const width = container.querySelector<HTMLInputElement>('[aria-label="网页宽度"]')!, height = container.querySelector<HTMLInputElement>('[aria-label="网页高度"]')!
    const edit = async (input: HTMLInputElement, value: string, key: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); })
    const press = async (input: HTMLInputElement, key: string) => act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
    await edit(width, '9999', 'Enter'); await press(width, 'Enter'); expect(width.value).toBe('9999'); expect(width.getAttribute('aria-invalid')).toBe('true'); expect(container.textContent).toContain('320–3840')
    await act(async () => width.focus()); await press(width, 'Escape'); expect(width.value).toBe('393'); expect(width.hasAttribute('aria-invalid')).toBe(false)
    await edit(height, 'oops', 'Enter'); await press(height, 'Enter')
    await edit(width, '800', 'Enter'); await press(width, 'Enter'); expect(width.value).toBe('800'); expect(height.value).toBe('oops'); expect(height.getAttribute('aria-invalid')).toBe('true')
    await act(async () => (container.querySelector('[data-resize-edge="right"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true })))
    expect(width.value).toBe('810')
    await act(async () => (container.querySelector('[aria-label="退出自由尺寸"]') as HTMLButtonElement).click())
    expect(container.querySelector('[aria-label="网页宽度"]')).toBeNull()
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledOnce()
    expect(view.controller.setPreference.mock.lastCall?.[1]).toMatchObject({ mode: 'normal', size: { width: 810, height: 852 }, zoom: 'fit' })
  })
  it('retries the failed request rather than the previous success and hides its native guest', async () => {
    const view = await fixture('https://mira.test/working')
    await view.event('a', 'https://mira.test/working')
    view.controller.navigateBrowserFor.mockRejectedValueOnce(new Error('连接失败'))
    await view.request('https://mira.test/offline')
    expect(container.querySelector('h3')?.textContent).toBe('网页加载失败')
    expect(view.controller.controlBrowserFor).toHaveBeenCalledWith('a', 'hide', 'browser')
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '重新加载')!.click())
    expect(view.controller.navigateBrowserFor.mock.lastCall?.slice(0, 2)).toEqual(['a', 'https://mira.test/offline'])
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
  it('shows certificate recovery and prevents hidden task controls', async () => {
    const view = await fixture('https://mira.test/working')
    await view.event('a', 'https://mira.test/invalid', { ready: true, errorCode: -202, error: 'ERR_CERT_AUTHORITY_INVALID' })
    expect(container.querySelector('h3')?.textContent).toBe('网页证书验证失败')
    expect(container.textContent).toContain('请检查网站证书或本机时间后重试')
    await view.render({ active: false }); const count = view.controller.navigateBrowserFor.mock.calls.length
    await act(async () => (container.querySelector('[aria-label="刷新"]') as HTMLButtonElement).click())
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(count)
  })
  it('submits a local address with Enter and selects the full address on focus', async () => {
    const view = await fixture('https://mira.test/working'), input = container.querySelector('input') as HTMLInputElement
    await act(async () => input.focus()); expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(input.value.length)
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'localhost:3000'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(view.controller.navigateBrowserFor.mock.lastCall?.[1]).toBe('http://localhost:3000/')
    expect(container.querySelector('button[type="submit"]')).toBeNull()
  })
  it('opens Radix menu actions against the observed page, disables external opening on errors', async () => {
    const view = await fixture('https://mira.test/initial')
    await view.event('a', 'https://mira.test/redirected', { ready: true })
    const openMenu = async () => act(async () => (container.querySelector('[aria-label="浏览器更多选项"]') as HTMLButtonElement).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })))
    await openMenu()
    let items = container.querySelectorAll<HTMLElement>('[role="menuitem"]'); expect(items).toHaveLength(2)
    await act(async () => items[0].click())
    expect(view.controller.openBrowserExternalFor).toHaveBeenCalledExactlyOnceWith('a', 'https://mira.test/redirected', 'browser')
    await openMenu(); items = container.querySelectorAll('[role="menuitem"]')
    await act(async () => items[1].click())
    expect(view.controller.controlBrowserFor).toHaveBeenCalledWith('a', 'devtools', 'browser')
    await view.event('a', 'https://mira.test/offline', { ready: true, error: '连接失败', errorCode: -102 })
    await openMenu()
    expect(container.querySelector('[role="menuitem"]')?.getAttribute('aria-disabled')).toBe('true')
  })
  it('keeps same-task resource URL, title and controls isolated while hidden tabs remain mounted', async () => {
    const listeners = new Set<(event: any) => void>(), firstTitle = vi.fn(), secondTitle = vi.fn(), firstIcon = vi.fn(), secondIcon = vi.fn()
    const controller = { onBrowserEvent: (callback: (event: any) => void) => { listeners.add(callback); return () => listeners.delete(callback) }, navigateBrowserFor: vi.fn(async (_id: string, url: string) => url), controlBrowserFor: vi.fn(async () => undefined), setBrowserBoundsFor: vi.fn(async () => undefined), closeBrowserFor: vi.fn(async () => undefined), getPreference: vi.fn(async () => null), setPreference: vi.fn(async () => undefined), registerBeforeNavigation: vi.fn(() => () => undefined), setBrowserViewportFor: vi.fn(async () => ({ desktopZoomFactor: 1 })) } as unknown as PilotController
    const render = async (selected: string) => { await act(async () => root.render(<>{['one', 'two'].map(id => <div key={id} data-resource={id}><MiraBrowserPanel controller={controller} sessionId="a" browserId={`browser:${id}`} active={selected === id} initialUrl={`https://mira.test/${id}`} onRequestHandled={() => undefined} onUrlChange={() => undefined} onPageFavicon={id === 'one' ? firstIcon : secondIcon} onPageTitle={id === 'one' ? firstTitle : secondTitle} /></div>)}</>)) }
    const address = (id: string) => (container.querySelector(`[data-resource="${id}"] input`) as HTMLInputElement).value
    await render('one'); await render('two')
    await act(async () => listeners.forEach(listener => listener({ sessionId: 'a', browserId: 'browser:one', url: 'https://mira.test/redirect', title: 'Only first page', faviconUrl: 'https://mira.test/one.png', loading: false, canGoBack: true, canGoForward: false })))
    expect(address('one')).toBe('https://mira.test/redirect'); expect(address('two')).toBe('https://mira.test/two')
    expect(firstTitle).toHaveBeenCalledExactlyOnceWith('Only first page'); expect(secondTitle).not.toHaveBeenCalled()
    expect(firstIcon).toHaveBeenCalledExactlyOnceWith('https://mira.test/one.png'); expect(secondIcon).not.toHaveBeenCalled()
    await render('one')
    expect(controller.navigateBrowserFor).toHaveBeenCalledTimes(2)
    expect(controller.controlBrowserFor).toHaveBeenCalledWith('a', 'show', 'browser:one')
    expect(controller.controlBrowserFor).toHaveBeenCalledWith('a', 'hide', 'browser:two')
    expect(controller.closeBrowserFor).not.toHaveBeenCalled()
  })
  it('restores once, follows new and repeated requests, and does not navigate again on URL/redirect feedback', async () => {
    const view = await fixture('https://mira.test/old')
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(1)
    await view.event('a', 'https://mira.test/redirect'); expect(view.address()).toBe('https://mira.test/redirect')
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(1)
    await view.request('https://mira.test/new'); await view.request('https://mira.test/new')
    expect(view.controller.navigateBrowserFor.mock.calls.map(call => call.slice(0, 2))).toEqual([['a', 'https://mira.test/old'], ['a', 'https://mira.test/new'], ['a', 'https://mira.test/new']])
    expect(view.handled).toHaveBeenCalledTimes(2)
    await view.event('a', 'https://mira.test/another-redirect'); await view.render({ active: false }); await view.render({ active: true })
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(3)
  })
  it('opens an empty browser from a request and waits while hidden, ignoring requests for a different task', async () => {
    const view = await fixture(); await view.render({ active: false }); await view.request('https://mira.test/hidden')
    expect(view.controller.navigateBrowserFor).not.toHaveBeenCalled(); expect(view.handled).not.toHaveBeenCalled()
    await view.render({ active: true }); expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(1)
    await view.request('https://mira.test/wrong', 'b'); expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(1)
  })
  it('keeps the observed redirect when the bridge later acknowledges the originally requested address', async () => {
    const view = await fixture(), load = deferred<string>()
    view.controller.navigateBrowserFor.mockImplementationOnce(() => load.promise)
    await view.request('https://mira.test/requested'); await view.event('a', 'https://mira.test/redirected')
    view.observed.mockClear(); await act(async () => load.resolve('https://mira.test/requested'))
    expect(view.address()).toBe('https://mira.test/redirected'); expect(view.observed).not.toHaveBeenCalled()
    await view.render({ active: false }); await view.render({ active: true })
    expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(1)
  })
  it('ignores late navigation completion after a newer request or task switch and closes only the original browser', async () => {
    const view = await fixture(), first = deferred<string>()
    view.controller.navigateBrowserFor.mockImplementationOnce(() => first.promise)
    await view.request('https://mira.test/slow'); await view.request('https://mira.test/latest')
    await act(async () => first.resolve('https://mira.test/stale'))
    expect(view.address()).toBe('https://mira.test/latest'); expect(view.observed).not.toHaveBeenCalledWith('https://mira.test/stale')
    const second = deferred<string>(); view.controller.navigateBrowserFor.mockImplementationOnce(() => second.promise)
    await view.request('https://mira.test/old-task'); await view.render({ sessionId: 'b', active: false })
    view.observed.mockClear(); await act(async () => second.resolve('https://mira.test/wrong-task'))
    expect(view.observed).not.toHaveBeenCalled(); expect(view.controller.closeBrowserFor).toHaveBeenCalledWith('a', 'browser')
  })
  it('hides a navigation completing behind an overlay and reports failure without replaying the request', async () => {
    const view = await fixture(), load = deferred<string>()
    view.controller.navigateBrowserFor.mockImplementationOnce(() => load.promise)
    await view.request('https://mira.test/slow')
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog')
    await act(async () => { container.append(dialog); await new Promise(done => setTimeout(done, 5)) })
    await act(async () => load.resolve('https://mira.test/slow'))
    expect(view.controller.controlBrowserFor).toHaveBeenCalledWith('a', 'hide', 'browser')
    view.controller.navigateBrowserFor.mockRejectedValueOnce(new Error('连接失败'))
    await view.request('https://mira.test/offline')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('连接失败'); expect(view.address()).toBe('https://mira.test/offline')
    await view.render(); expect(view.controller.navigateBrowserFor).toHaveBeenCalledTimes(2)
    await view.request('https://mira.test/retry'); expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
