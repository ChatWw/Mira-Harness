import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ exists: vi.fn(), get: vi.fn(), close: vi.fn() }))
vi.mock('node:fs', () => ({ existsSync: mocks.exists }))
vi.mock('better-sqlite3', () => ({ default: class { prepare() { return { get: mocks.get } } close = mocks.close } }))
import { applyHardwareAcceleration } from '../electron/bootstrap/hardwareAcceleration'

beforeEach(() => { vi.clearAllMocks(); mocks.exists.mockReturnValue(true) })
describe('hardware acceleration startup', () => {
  it.each([undefined, 'true', 'false', 'null'])('only disables when saved value is false (%s)', value => {
    mocks.get.mockReturnValueOnce({ name: 'preferences' }).mockReturnValueOnce(value === undefined ? undefined : { value })
    const app = { disableHardwareAcceleration: vi.fn() }
    applyHardwareAcceleration(app, '/state.sqlite')
    expect(app.disableHardwareAcceleration).toHaveBeenCalledTimes(value === 'false' ? 1 : 0)
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  it('keeps acceleration enabled on a first launch without a state database', () => {
    mocks.exists.mockReturnValue(false)
    const app = { disableHardwareAcceleration: vi.fn() }
    applyHardwareAcceleration(app, '/missing.sqlite')
    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
  })
})
