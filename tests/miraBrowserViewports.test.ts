import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
import { miraBrowserScale, readMiraBrowserPreference } from '../src/config/miraBrowserViewport'
const electron = vi.hoisted(() => ({ fromId: vi.fn() }))
vi.mock('electron', () => ({ webContents: { fromId: electron.fromId } }))
import { MiraBrowserViewports } from '../electron/services/miraBrowserViewports'
function fixture(zoom = 1) {
  let attached = false, destroyed = false
  const owner = { getZoomFactor: () => zoom }
  const guest = Object.assign(new EventEmitter(), { isDestroyed: () => destroyed, hostWebContents: owner, getType: () => 'webview', setZoomFactor: vi.fn(), debugger: { isAttached: () => attached, attach: vi.fn(() => { attached = true }), sendCommand: vi.fn(async () => undefined) } })
  electron.fromId.mockReturnValue(guest)
  return { service: new MiraBrowserViewports(), owner: owner as never, guest, disconnect: () => { attached = false }, destroy: () => { destroyed = true; guest.emit('destroyed') } }
}
const size = { width: 393, height: 852 }
const bounds = { x: 0, y: 0, width: 400, height: 300 }
beforeEach(() => vi.clearAllMocks())
describe('real browser viewport ownership and metrics', () => {
  it('rejects foreign, non-webview, missing and destroyed targets before CDP', async () => {
    const view = fixture()
    await expect(view.service.update({} as never, 10, size)).rejects.toThrow('不属于当前窗口')
    view.guest.getType = () => 'window'
    await expect(view.service.update(view.owner, 10, size)).rejects.toThrow('不属于当前窗口')
    view.guest.getType = () => 'webview'; view.destroy()
    await expect(view.service.update(view.owner, 10, size)).rejects.toThrow('不属于当前窗口')
    await expect(view.service.update(view.owner, undefined, size)).rejects.toThrow('不属于当前窗口')
    expect(view.guest.debugger.attach).not.toHaveBeenCalled()
  })
  it.each([.75, 1, 1.25])('uses real CSS dimensions and native surface compensation at desktop zoom %s', async zoom => {
    const view = fixture(zoom)
    expect(await view.service.update(view.owner, 10, size)).toEqual({ desktopZoomFactor: zoom })
    expect(view.guest.debugger.sendCommand).toHaveBeenCalledExactlyOnceWith('Emulation.setDeviceMetricsOverride', { ...size, mobile: false, deviceScaleFactor: 1, dontSetVisibleSize: true, ...(zoom > 1 ? { scale: zoom } : {}) })
    expect(view.guest.setZoomFactor).toHaveBeenCalledWith(1)
    await view.service.update(view.owner, 10, size); expect(view.guest.debugger.sendCommand).toHaveBeenCalledOnce()
    await view.service.update(view.owner, 10, null); expect(view.guest.debugger.sendCommand).toHaveBeenLastCalledWith('Emulation.clearDeviceMetricsOverride', undefined)
  })
  it('serializes changes, recovers a rejected command, restores after DevTools and removes listeners', async () => {
    const view = fixture()
    view.guest.debugger.sendCommand.mockRejectedValueOnce(new Error('CDP failed'))
    const first = view.service.update(view.owner, 10, size), second = view.service.update(view.owner, 10, { width: 800, height: 600 })
    await expect(first).rejects.toThrow('CDP failed'); await second
    expect(view.guest.debugger.sendCommand.mock.calls.map(call => (call[1] as any).width)).toEqual([393, 800])
    view.disconnect(); view.guest.emit('devtools-closed'); await vi.waitFor(() => expect(view.guest.debugger.sendCommand).toHaveBeenCalledTimes(3))
    view.destroy(); expect(view.guest.listenerCount('did-finish-load')).toBe(0); expect(view.guest.listenerCount('devtools-closed')).toBe(0)
  })
  it('validates bounded dimensions, zoom and host target while accepting clipped negative frame positions', () => {
    const params = { sessionId: 'a', browserId: 'browser:one', bounds, clip: bounds, viewport: size, scale: .5 }
    expect(parseFirstPartyHarnessCall('browser.viewport', { ...params, bounds: { ...bounds, x: -500 } })).toMatchObject({ bounds: { x: -500 } })
    for (const width of [319, 3841, 393.5, NaN, Infinity, '393']) expect(() => parseFirstPartyHarnessCall('browser.viewport', { ...params, viewport: { ...size, width } })).toThrow()
    for (const scale of [0, -1, 2.1, NaN, 'fit']) expect(() => parseFirstPartyHarnessCall('browser.viewport', { ...params, scale })).toThrow()
    for (const guestId of [0, -1, 2.5, '10']) expect(() => parseFirstPartyHarnessCall('browser.viewport', { ...params, guestId })).toThrow()
  })
  it('keeps persisted defaults and fit calculations in physical preview pixels', () => {
    expect(readMiraBrowserPreference({ mode: 'free', size: { width: 393, height: 9999 }, zoom: '100' }).mode).toBe('normal')
    expect(miraBrowserScale({ width: 432, height: 832 }, { width: 800, height: 800 }, 'fit', 1)).toBe(.5)
    expect(miraBrowserScale({ width: 432, height: 832 }, { width: 800, height: 800 }, 'fit', 1.25)).toBe(.625)
    expect(miraBrowserScale({ width: 432, height: 832 }, size, '200', .75)).toBe(2)
  })
})
