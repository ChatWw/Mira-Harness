import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MiraComputerSettings } from '../electron/services/miraComputerSettings'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs() })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mira-cu-settings-')); roots.push(root)
  const configPath = join(root, 'config/computer-use.json'), bin = join(root, 'macos/plugin/bin')
  mkdirSync(bin, { recursive: true })
  for (const name of ['dsh-cu', 'dsh-cursor-overlay']) { writeFileSync(join(bin, name), 'fixture'); chmodSync(join(bin, name), 0o755) }
  const run = vi.fn(async (_file: string, _args: string[]) => JSON.stringify({ screenRecording: false, accessibility: true }))
  const openExternal = vi.fn(async () => undefined)
  return { root, bin, configPath, run, openExternal, settings: new MiraComputerSettings({ resourceRoot: root, configPath, platform: 'darwin', run, openExternal }) }
}
describe('Mac computer control configuration', () => {
  it('uses the native helper to report independent permissions without requesting access on page load', async () => {
    const { settings, run, openExternal, bin } = fixture()
    expect(await settings.status()).toMatchObject({ engineAvailable: true, cursorAvailable: true, screenRecording: false, accessibility: true, showCursor: true })
    expect(run).toHaveBeenCalledExactlyOnceWith(join(bin, 'dsh-cu'), ['permissions'])
    expect(openExternal).not.toHaveBeenCalled()
  })
  it('reports missing, nonexecutable and broken helpers without inventing permission state', async () => {
    const { settings, run, bin } = fixture()
    run.mockResolvedValueOnce('{}')
    expect(await settings.status()).toMatchObject({ screenRecording: null, accessibility: null, error: expect.stringContaining('无法检测') })
    chmodSync(join(bin, 'dsh-cu'), 0o644)
    expect(await settings.status()).toMatchObject({ engineAvailable: false, screenRecording: null })
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('persists the switch and exposes the same configuration to an existing backend', async () => {
    const { settings, configPath } = fixture()
    vi.stubEnv('MIRA_CU_CONFIG', configPath)
    const { readConfig } = await import('../resources/plugins/computer-use/macos/plugin/setup.js')
    expect(readConfig()).toEqual({ showCursor: true })
    settings.setCursor(false)
    expect(readConfig()).toEqual({ showCursor: false })
    expect((await settings.status()).showCursor).toBe(false)
    settings.setCursor(true)
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({ showCursor: true })
    expect(readConfig()).toEqual({ showCursor: true })
  })
  it('requests only the selected native permission and opens a fixed macOS settings pane', async () => {
    const { settings, run, openExternal } = fixture()
    await settings.openPermission('accessibility')
    expect(run.mock.calls[0]?.[1]).toEqual(['request-permission', 'accessibility'])
    expect(openExternal).toHaveBeenLastCalledWith('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    await settings.openPermission('screen-recording')
    expect(openExternal).toHaveBeenLastCalledWith('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    await expect(settings.openPermission('https://example.com' as never)).rejects.toThrow('权限类型无效')
    expect(openExternal).toHaveBeenCalledTimes(2)
  })
  it('rejects forged switch and permission requests at the first-party boundary', () => {
    expect(parseFirstPartyHarnessCall('computer-use.set-cursor', { showCursor: false })).toEqual({ method: 'computer-use.set-cursor', showCursor: false })
    for (const value of ['false', 0, null]) expect(() => parseFirstPartyHarnessCall('computer-use.set-cursor', { showCursor: value })).toThrow('光标开关')
    expect(() => parseFirstPartyHarnessCall('computer-use.open-permission', { permission: 'Privacy_AllFiles', url: 'file:///secret' })).toThrow('权限类型无效')
  })
})
