import { beforeEach, describe, expect, it, vi } from 'vitest'
const invoke = vi.hoisted(() => vi.fn(async () => 'host-result'))
vi.mock('electron', () => ({ ipcRenderer: { invoke } }))
import { platformApi } from '../electron/preload/platformApi'
beforeEach(() => invoke.mockClear())
describe('Hook preload bridge', () => {
  it('requests the global catalog by default and retains host results', async () => {
    await expect(platformApi.hooks.list()).resolves.toBe('host-result')
    expect(invoke).toHaveBeenCalledExactlyOnceWith('platform:hooks', 'hooks.list', {})
  })
  it.each(['list', 'save', 'delete', 'setEnabled', 'trust', 'revokeTrust'] as const)('routes %s to the settings channel with caller values preserved', async method => {
    const params = { projectId: 'selected-project', scope: 'project', id: 'hook', expectedRevision: 'revision' }
    await expect(platformApi.hooks[method](params)).resolves.toBe('host-result')
    expect(invoke).toHaveBeenCalledExactlyOnceWith('platform:hooks', `hooks.${method}`, params)
  })
})
