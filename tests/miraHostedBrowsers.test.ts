// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraHostedBrowsers, type MiraHostedBrowserElement } from '../src/platform/miraHostedBrowsers'

const bounds = { x: 12, y: 24, width: 400, height: 300 }
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
const navigation = (url = 'https://mira.test/one') => ({ method: 'browser.navigate' as const, sessionId: 'a', browserId: 'browser:one', url, bounds })
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren() })
function fixture(bind?: (sessionId: string, browserId: string, guestId: number) => Promise<void>) {
  const stage = document.createElement('div'); document.body.append(stage)
  Object.defineProperties(stage, { clientWidth: { value: 600 }, clientHeight: { value: 500 } })
  const original = document.createElement.bind(document), guests: Array<MiraHostedBrowserElement & { url: string }> = []
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'webview') return original(tag)
    const guest = original('div') as MiraHostedBrowserElement & { url: string }; guest.url = ''
    Object.assign(guest, { getURL: () => guest.url || guest.getAttribute('src')!, getTitle: () => `Page ${guest.url}`, canGoBack: () => true, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn(), reload: vi.fn(), openDevTools: vi.fn(), loadURL: vi.fn(async (url: string) => { guest.url = url }) })
    Object.assign(guest, { getWebContentsId: () => guests.indexOf(guest) + 10 })
    guests.push(guest); return guest
  }) as typeof document.createElement)
  const state = vi.fn(), registry = new MiraHostedBrowsers(() => stage, state, bind)
  const ready = async (index: number) => { guests[index].dispatchEvent(new Event('did-attach')); await Promise.resolve() }
  const open = async (sessionId: string, browserId: string, url: string) => {
    const pending = registry.navigate(sessionId, url, bounds, browserId), index = guests.length - 1
    await ready(index); await pending; return guests[index]
  }
  return { registry, guests, stage, state, open, ready }
}

describe('task and resource owned native browser lifecycle', () => {
  it('registers automation only at DOM readiness, and ignores events from a removed page', async () => {
    const bind = vi.fn(async () => undefined), view = fixture(bind)
    const guest = await view.open('a', 'browser:one', 'https://mira.test/')
    expect(bind).not.toHaveBeenCalled()
    guest.dispatchEvent(new Event('dom-ready')); await Promise.resolve()
    expect(bind).toHaveBeenCalledExactlyOnceWith('a', 'browser:one', 10)
    view.registry.control('a', 'close', 'browser:one')
    guest.dispatchEvent(new Event('dom-ready')); expect(bind).toHaveBeenCalledOnce()
  })

  it('injects exact protection guest identity, protects media, pending navigation and viewport operations', async () => {
    const view = fixture(), guest = await view.open('a', 'browser:one', 'https://mira.test/one')
    const call = { method: 'browser.protection' as const, sessionId: 'a', browserId: 'browser:one', guestId: 999 }
    const read = vi.fn(async () => ({ protected: false }))
    await expect(view.registry.request(call, read)).resolves.toEqual({ protected: false }); expect(read).toHaveBeenLastCalledWith(10)
    guest.dispatchEvent(new Event('media-started-playing')); await expect(view.registry.request(call, read)).resolves.toEqual({ protected: true })
    guest.dispatchEvent(new Event('media-paused')); await expect(view.registry.request(call, read)).resolves.toEqual({ protected: false })
    const pending = deferred()
    const resize = view.registry.request({ method: 'browser.viewport', sessionId: 'a', browserId: 'browser:one', bounds, clip: bounds, viewport: null, scale: 1 }, async () => { await pending.promise; return { desktopZoomFactor: 1 } })
    await Promise.resolve(); await expect(view.registry.request(call, read)).resolves.toEqual({ protected: true })
    pending.resolve(); await resize; await expect(view.registry.request(call, read)).resolves.toEqual({ protected: false })
    const permission = deferred(), navigating = view.registry.request(navigation(), () => permission.promise)
    await expect(view.registry.request(call, read)).resolves.toEqual({ protected: true })
    permission.resolve(); await navigating
    await expect(view.registry.request(call, async () => ({ protected: true }))).resolves.toEqual({ protected: true })
    view.registry.clear(); await expect(view.registry.request(call, read)).resolves.toEqual({ protected: false }); expect(read).toHaveBeenLastCalledWith(undefined)
  })
  it('cancels a picker on hide/navigation and discards both late results and late start authorization', async () => {
    const view = fixture(), guest = await view.open('a', 'browser:one', 'https://mira.test/one')
    const call = { method: 'browser.pick' as const, sessionId: 'a', browserId: 'browser:one', action: 'start' as const, guestId: 999 }
    const authorized = vi.fn(async () => undefined), pending = deferred()
    guest.executeJavaScript = vi.fn(async script => { if (script.startsWith('(() =>')) return; await pending.promise; return { status: 'selected', element: {} } })
    const selecting = view.registry.request(call, authorized)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(authorized).toHaveBeenCalledWith(10)
    view.registry.control('a', 'hide', 'browser:one'); pending.resolve()
    await expect(selecting).resolves.toEqual({ status: 'cancelled' })
    expect(guest.executeJavaScript).toHaveBeenLastCalledWith(expect.stringContaining('picker?.runId'))
    view.registry.control('a', 'show', 'browser:one')
    const authorization = deferred(), late = view.registry.request(call, async () => authorization.promise)
    await Promise.resolve(); guest.dispatchEvent(new Event('did-start-loading')); authorization.resolve()
    await expect(late).resolves.toEqual({ status: 'cancelled' })
    expect(guest.executeJavaScript).toHaveBeenCalledTimes(2)
  })
  it('never injects before authorization and rejects hidden resources', async () => {
    const view = fixture(), guest = await view.open('a', 'browser:one', 'https://mira.test/one')
    guest.executeJavaScript = vi.fn(async () => ({ status: 'cancelled' }))
    const call = { method: 'browser.pick' as const, sessionId: 'a', browserId: 'browser:one', action: 'start' as const }
    await expect(view.registry.request(call, async () => { throw Error('denied') })).rejects.toThrow('denied')
    expect(guest.executeJavaScript).not.toHaveBeenCalled()
    view.registry.control('a', 'hide', 'browser:one')
    await expect(view.registry.request(call, async () => undefined)).rejects.toThrow('请先打开')
    expect(guest.executeJavaScript).not.toHaveBeenCalled()
  })
  it('uses the registry guest ID, keeps its DOM parent through modes, clips and ignores late closed updates', async () => {
    const view = fixture(), first = await view.open('a', 'browser:one', 'https://mira.test/one'), other = await view.open('b', 'browser:one', 'https://mira.test/two')
    const parent = first.parentElement
    const presentation = { method: 'browser.viewport' as const, sessionId: 'a', browserId: 'browser:one', guestId: 999, bounds: { x: -100, y: 24, width: 400, height: 426 }, clip: bounds, viewport: { width: 800, height: 852 }, scale: .5 }
    const authorize = vi.fn(async () => ({ desktopZoomFactor: 1 }))
    await view.registry.request(presentation, authorize)
    expect(authorize).toHaveBeenCalledWith(10); expect(first.parentElement).toBe(parent)
    expect(first.style.width).toBe('800px'); expect(first.style.transform).toBe('scale(0.5)'); expect(first.style.left).toBe('-112px')
    expect(parent!.style.overflow).toBe('hidden'); expect(parent!.style.width).toBe('288px')
    view.registry.control('a', 'show', 'browser:one'); expect(other.parentElement!.style.display).toBe('none')
    await view.registry.request({ ...presentation, viewport: null, bounds, scale: 1 }, authorize)
    expect(first.parentElement).toBe(parent); expect(first.style.transform).toBe(''); expect(first.loadURL).not.toHaveBeenCalled()
    const pending = deferred(), late = view.registry.request(presentation, async () => { await pending.promise; return { desktopZoomFactor: 1 } })
    await Promise.resolve(); view.registry.control('a', 'close', 'browser:one'); pending.resolve()
    await expect(late).rejects.toThrow('已关闭'); expect(parent!.isConnected).toBe(false); expect(other.isConnected).toBe(true)
    view.registry.clear()
  })
  it('binds favicon events to the source guest, clears them on full navigation and detaches them on close', async () => {
    const view = fixture(), guest = await view.open('a', 'browser:one', 'https://mira.test/one'), other = await view.open('b', 'browser:one', 'https://mira.test/other')
    const icon = (value: string) => guest.dispatchEvent(Object.assign(new Event('page-favicon-updated'), { favicons: [value] }))
    icon('https://mira.test/one.png')
    expect(view.state).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'a', browserId: 'browser:one', faviconUrl: 'https://mira.test/one.png' }))
    other.dispatchEvent(new Event('did-stop-loading')); expect(view.state.mock.lastCall![0]).not.toHaveProperty('faviconUrl')
    guest.dispatchEvent(new Event('did-navigate-in-page')); expect(view.state.mock.lastCall![0].faviconUrl).toBe('https://mira.test/one.png')
    guest.dispatchEvent(new Event('did-navigate')); expect(view.state.mock.lastCall![0].faviconUrl).toBe('https://mira.test/one.png')
    guest.url = 'https://mira.test/new'; guest.dispatchEvent(new Event('did-navigate')); expect(view.state.mock.lastCall![0].faviconUrl).toBeNull()
    // Chromium may omit favicon events for a cached history entry or a revisited URL.
    guest.url = 'https://mira.test/one'; guest.dispatchEvent(new Event('did-navigate')); expect(view.state.mock.lastCall![0].faviconUrl).toBe('https://mira.test/one.png')
    for (const invalid of ['file:///tmp/secret', 'javascript:alert(1)', 'https://user:secret@mira.test/icon', 'data:text/html,x', 'https://mira.test/' + 'a'.repeat(4096)]) { icon(invalid); expect(view.state.mock.lastCall![0].faviconUrl).toBeNull() }
    view.registry.control('a', 'close', 'browser:one'); view.state.mockClear(); icon('https://mira.test/late.png')
    expect(view.state).not.toHaveBeenCalled(); view.registry.clear()
  })
  it('opens devtools only for the authorized, attached resource', async () => {
    const view = fixture(), pending = view.registry.navigate('a', 'https://mira.test/one', bounds, 'browser:one')
    view.registry.control('a', 'devtools', 'browser:one'); expect(view.guests[0].openDevTools).not.toHaveBeenCalled()
    await view.ready(0); await pending
    const other = await view.open('b', 'browser:one', 'https://mira.test/other')
    const call = { method: 'browser.control' as const, sessionId: 'a', browserId: 'browser:one', action: 'devtools' as const }
    await expect(view.registry.request(call, async () => { throw new Error('授权无效') })).rejects.toThrow('授权无效')
    expect(view.guests[0].openDevTools).not.toHaveBeenCalled()
    await view.registry.request(call, async () => undefined)
    expect(view.guests[0].openDevTools).toHaveBeenCalledOnce(); expect(other.openDevTools).not.toHaveBeenCalled()
    view.registry.clear()
  })
  it('retains main-frame failure through load-stop and clears it on retry, ignoring subframe and aborted loads', async () => {
    const view = fixture(), guest = await view.open('a', 'browser:one', 'https://mira.test/first')
    const fail = (errorCode: number, isMainFrame: boolean) => guest.dispatchEvent(Object.assign(new Event('did-fail-load'), { errorCode, isMainFrame, errorDescription: 'ERR_CONNECTION_REFUSED' }))
    fail(-102, false); fail(-3, true)
    expect(view.state.mock.lastCall![0]).not.toHaveProperty('error')
    await view.registry.navigate('a', 'https://mira.test/offline', bounds, 'browser:one')
    guest.url = 'https://mira.test/first'; fail(-102, true); guest.dispatchEvent(new Event('did-stop-loading'))
    expect(view.state).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://mira.test/offline', error: 'ERR_CONNECTION_REFUSED', errorCode: -102, loading: false, ready: true }))
    guest.dispatchEvent(new Event('did-start-loading')); expect(view.state.mock.lastCall![0]).not.toHaveProperty('error')
    view.registry.clear()
  })
  it('requires successful authorization before creating or touching a guest', async () => {
    const view = fixture(), permission = deferred(), request = view.registry.request(navigation(), () => permission.promise)
    const rejected = expect(request).rejects.toThrow('授权无效')
    expect(view.guests).toHaveLength(0); permission.reject(new Error('授权无效')); await rejected
    const guest = await view.open('a', 'browser:one', 'https://mira.test/current')
    await expect(view.registry.request({ method: 'browser.control', sessionId: 'a', browserId: 'browser:one', action: 'close' }, async () => { throw new Error('授权无效') })).rejects.toThrow('授权无效')
    expect(guest.isConnected).toBe(true); view.registry.clear()
  })
  it('does not resurrect a closed resource when its navigation authorization arrives late', async () => {
    const view = fixture(), permission = deferred(), request = view.registry.request(navigation(), () => permission.promise)
    const rejected = expect(request).rejects.toThrow('浏览器请求已过期')
    await view.registry.request({ method: 'browser.control', sessionId: 'a', browserId: 'browser:one', action: 'close' }, async () => undefined)
    permission.resolve(); await rejected
    expect(view.guests).toHaveLength(0); expect(view.stage.children).toHaveLength(0); view.registry.clear()
  })
  it('keeps the newest navigation even if the old authorization completes after it', async () => {
    const view = fixture(), permission = deferred(), first = view.registry.request(navigation('https://mira.test/old'), () => permission.promise)
    const rejected = expect(first).rejects.toThrow('浏览器请求已过期')
    const latest = view.registry.request(navigation('https://mira.test/new'), async () => undefined)
    await Promise.resolve(); await view.ready(0); await expect(latest).resolves.toBe('https://mira.test/new')
    permission.resolve(); await rejected
    expect(view.guests).toHaveLength(1); expect(view.guests[0].getAttribute('src')).toBe('https://mira.test/new'); expect(view.guests[0].loadURL).not.toHaveBeenCalled()
    view.registry.clear()
  })
  it('honors hide while navigation is awaiting permission without hiding another resource', async () => {
    const view = fixture(), current = await view.open('b', 'browser:other', 'https://mira.test/other'), permission = deferred()
    const request = view.registry.request(navigation(), () => permission.promise)
    await view.registry.request({ method: 'browser.control', sessionId: 'a', browserId: 'browser:one', action: 'hide' }, async () => undefined)
    permission.resolve(); await Promise.resolve(); await view.ready(1); await request
    expect(view.guests[1].style.display).toBe('none'); expect(current.style.display).toBe('flex'); view.registry.clear()
  })
  it('revokes pending navigation when the host connection is cleared', async () => {
    const view = fixture(), permission = deferred(), request = view.registry.request(navigation(), () => permission.promise)
    const rejected = expect(request).rejects.toThrow('浏览器请求已过期')
    view.registry.clear(); permission.resolve(); await rejected
    expect(view.guests).toHaveLength(0); expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps separate guests and history controls, with one visible resource across tasks', async () => {
    const view = fixture(), first = await view.open('a', 'browser:one', 'https://mira.test/one'), second = await view.open('a', 'browser:two', 'https://mira.test/two')
    expect(view.stage.children).toHaveLength(2); expect(first.style.display).toBe('none'); expect(second.style.display).toBe('flex')
    view.registry.control('a', 'show', 'browser:one'); view.registry.control('a', 'back', 'browser:one')
    expect(first.style.display).toBe('flex'); expect(second.style.display).toBe('none'); expect(first.goBack).toHaveBeenCalledOnce(); expect(second.goBack).not.toHaveBeenCalled()
    await view.registry.navigate('a', 'https://mira.test/next', bounds, 'browser:one')
    expect(first.loadURL).toHaveBeenCalledExactlyOnceWith('https://mira.test/next'); expect(view.guests).toHaveLength(2)
    const foreign = await view.open('b', 'browser:one', 'https://mira.test/foreign')
    expect(first.style.display).toBe('none'); expect(foreign.style.display).toBe('flex')
    view.registry.control('a', 'close', 'browser:two'); expect(first.isConnected).toBe(true); expect(foreign.isConnected).toBe(true); expect(second.isConnected).toBe(false)
    view.registry.clear()
  })
  it('binds background URL/title/loading events to their source and drops detached events', async () => {
    const view = fixture(), old = await view.open('a', 'browser:one', 'https://mira.test/one'), current = await view.open('b', 'browser:two', 'https://mira.test/two')
    view.state.mockClear(); old.url = 'https://mira.test/redirect'; old.dispatchEvent(new Event('did-start-loading'))
    expect(view.state).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'a', browserId: 'browser:one', url: old.url, loading: true }))
    expect(current.style.display).toBe('flex'); expect(old.style.display).toBe('none')
    old.dispatchEvent(new Event('page-title-updated')); expect(view.state.mock.lastCall![0].title).toBe('Page https://mira.test/redirect')
    view.registry.control('a', 'close', 'browser:one'); view.state.mockClear(); old.dispatchEvent(new Event('did-stop-loading'))
    expect(view.state).not.toHaveBeenCalled(); expect(current.isConnected).toBe(true); view.registry.clear()
  })
  it('cancels old attachment and its timeout without removing the replacement of the same resource', async () => {
    const view = fixture(), pending = view.registry.navigate('a', 'https://mira.test/old', bounds, 'browser:one')
    const rejected = expect(pending).rejects.toThrow('浏览器资源已关闭')
    view.registry.control('a', 'close', 'browser:one')
    const replacement = await view.open('a', 'browser:one', 'https://mira.test/new')
    await rejected; await vi.advanceTimersByTimeAsync(3000)
    expect(replacement.isConnected).toBe(true); expect(view.stage.children).toHaveLength(1); expect(vi.getTimerCount()).toBe(0)
    view.registry.clear()
  })
  it('waits for attachment before navigating again and cleans only the guest that really timed out', async () => {
    const view = fixture(), first = view.registry.navigate('a', 'https://mira.test/first', bounds, 'browser:one'), next = view.registry.navigate('a', 'https://mira.test/next', bounds, 'browser:one')
    expect(view.guests[0].loadURL).not.toHaveBeenCalled()
    await view.ready(0); await Promise.all([first, next]); expect(view.guests[0].loadURL).toHaveBeenCalledExactlyOnceWith('https://mira.test/next')
    const timed = view.registry.navigate('a', 'https://mira.test/timed', bounds, 'browser:two'), rejected = expect(timed).rejects.toThrow('工作区浏览器未能启动')
    await vi.advanceTimersByTimeAsync(3000); await rejected
    expect(view.guests[0].isConnected).toBe(true); expect(view.guests[1].isConnected).toBe(false); view.registry.clear()
  })
  it('does not let a failed late load destroy or send metadata for a newer replacement', async () => {
    const view = fixture(), old = await view.open('a', 'browser:one', 'https://mira.test/old')
    let reject!: (cause: Error) => void
    vi.mocked(old.loadURL).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    const load = view.registry.navigate('a', 'https://mira.test/slow', bounds, 'browser:one'), rejected = expect(load).rejects.toThrow('aborted')
    await Promise.resolve(); view.registry.control('a', 'close', 'browser:one')
    const replacement = await view.open('a', 'browser:one', 'https://mira.test/new'); view.state.mockClear()
    reject(new Error('aborted')); await rejected
    expect(replacement.isConnected).toBe(true); expect(view.state).not.toHaveBeenCalled(); view.registry.clear()
  })
  it('supports legacy identity, hidden creation and exact bounds without showing another guest', async () => {
    const view = fixture(), active = await view.open('a', 'browser:one', 'https://mira.test/one')
    const hidden = view.registry.navigate('b', 'https://mira.test/hidden', { ...bounds, x: 590 }, undefined, false)
    await view.ready(1); await hidden
    expect(view.guests[1].dataset.browserResourceId).toBe('browser'); expect(view.guests[1].style.display).toBe('none'); expect(view.guests[1].style.width).toBe('10px'); expect(active.style.display).toBe('flex')
    view.registry.control('a', 'hide', 'browser:missing'); expect(active.style.display).toBe('flex')
    view.registry.clear(); expect(view.stage.children).toHaveLength(0); expect(vi.getTimerCount()).toBe(0)
  })
})
