import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraBrowserProtection } from '../electron/services/miraBrowserProtection'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
const electron = vi.hoisted(() => ({ fromId: vi.fn(), partition: vi.fn(), on: vi.fn() }))
vi.mock('electron', () => ({ webContents: { fromId: electron.fromId }, session: { fromPartition: electron.partition } }))
beforeEach(() => { vi.clearAllMocks(); electron.partition.mockReturnValue({ on: electron.on }) })
function fixture() {
  const owner = {}, guest = { isDestroyed: () => false, getType: () => 'webview', hostWebContents: owner, isLoading: () => false, isCurrentlyAudible: () => false, isBeingCaptured: () => false }
  electron.fromId.mockReturnValue(guest)
  const service = new MiraBrowserProtection(); service.start()
  const download = (item: EventEmitter, target = guest) => electron.on.mock.calls[0][1]({}, item, target)
  return { owner: owner as never, guest, service, download }
}
describe('actual native guest protection and ownership', () => {
  it.each(['isLoading', 'isCurrentlyAudible', 'isBeingCaptured'] as const)('protects %s and reads only its own guest', field => {
    const view = fixture(); expect(view.service.read(view.owner, 10)).toEqual({ protected: false })
    view.guest[field] = () => true; expect(view.service.read(view.owner, 10)).toEqual({ protected: true })
    expect(() => view.service.read({} as never, 10)).toThrow('不属于当前窗口')
  })
  it('counts concurrent downloads through completion/cancellation and registers once', () => {
    const view = fixture(), first = new EventEmitter(), second = new EventEmitter()
    view.service.start(); expect(electron.on).toHaveBeenCalledOnce(); expect(electron.partition).toHaveBeenCalledWith('persist:mira-harness-browser')
    view.download(first); view.download(second); expect(view.service.read(view.owner, 10).protected).toBe(true)
    first.emit('done', {}, 'cancelled'); expect(view.service.read(view.owner, 10).protected).toBe(true)
    second.emit('done', {}, 'completed'); expect(view.service.read(view.owner, 10).protected).toBe(false)
  })
  it('rejects nonexistent, destroyed and non-webview targets but permits a logical tab without a guest', () => {
    const view = fixture(); expect(view.service.read(view.owner)).toEqual({ protected: false })
    view.guest.isDestroyed = () => true; expect(() => view.service.read(view.owner, 10)).toThrow()
    view.guest.isDestroyed = () => false; view.guest.getType = () => 'window'; expect(() => view.service.read(view.owner, 10)).toThrow()
    electron.fromId.mockReturnValue(undefined); expect(() => view.service.read(view.owner, 10)).toThrow()
  })
  it('validates resource identities and bounded native targets', () => {
    const params = { sessionId: 's', browserId: 'browser:one' }
    expect(parseFirstPartyHarnessCall('browser.protection', params)).toEqual({ method: 'browser.protection', ...params })
    for (const guestId of [0, -1, 1.5, NaN, Infinity, '10']) expect(() => parseFirstPartyHarnessCall('browser.protection', { ...params, guestId })).toThrow()
    expect(() => parseFirstPartyHarnessCall('browser.protection', { ...params, browserId: 'foreign' })).toThrow()
  })
})
