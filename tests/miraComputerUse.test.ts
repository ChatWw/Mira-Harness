import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MiraComputerSession, miraComputerLaunch } from '../electron/services/miraComputerUse'
import { miraComputerUseStep } from '../src/config/miraComputerUse'

const sessions: MiraComputerSession[] = []
const roots: string[] = []
const session = (stop = vi.fn(async () => undefined)) => { const value = new MiraComputerSession(stop); sessions.push(value); return { value, stop } }
afterEach(async () => { await Promise.all(sessions.splice(0).map(value => value.close())); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })

describe('platform computer sessions', () => {
  it('prevents overlapping runs and releases the desktop after cleanup', async () => {
    const first = session(), second = session()
    await first.value.execute('click', {}, undefined, async () => 'ok')
    await expect(second.value.execute('click', {}, undefined, async () => 'bad')).rejects.toThrow('另一个任务')
    await first.value.close()
    expect(await second.value.execute('click', {}, undefined, async () => 'next')).toBe('next')
    expect(first.stop).toHaveBeenCalledOnce()
  })
  it('stops native processes on task cancellation and rejects subsequent input', async () => {
    const { value, stop } = session(), controller = new AbortController()
    const pending = value.execute('type_text', {}, controller.signal, signal => new Promise((_yes, no) => signal.addEventListener('abort', () => no(signal.reason))))
    const assertion = expect(pending).rejects.toBeDefined()
    controller.abort(); await assertion
    expect(stop).toHaveBeenCalledOnce()
    await expect(value.execute('click', {}, undefined, async () => 'bad')).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('treats native Esc as cancellation and never resumes input in the same run', async () => {
    const { value, stop } = session()
    await expect(value.execute('click', {}, undefined, async () => ({ isError: true, content: [{ text: 'COMPUTER_USE_STOPPED_BY_USER' }] }))).rejects.toMatchObject({ name: 'AbortError' })
    expect(stop).toHaveBeenCalledOnce()
    await expect(value.execute('click', {}, undefined, async () => 'bad')).rejects.toThrow('已停止')
  })
  it('selects only owned platform backends with Electron Node mode and no PATH driver', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-native-select-')); roots.push(root)
    for (const path of ['windows/mcp', 'macos/plugin/bin']) mkdirSync(join(root, path), { recursive: true })
    for (const path of ['windows/mcp/server.mjs', 'macos/server.mjs', 'macos/plugin/bin/dsh-cu', 'macos/plugin/bin/dsh-cursor-overlay']) writeFileSync(join(root, path), 'fixture')
    for (const [platform, script] of [['win32', 'windows/mcp/server.mjs'], ['darwin', 'macos/server.mjs']] as const) {
      const launch = miraComputerLaunch({ resourceRoot: root, platform, executable: '/owned/Mira' })
      expect(launch.command).toBe('/owned/Mira')
      expect(launch.args).toEqual([join(root, script)])
      expect(launch.env.ELECTRON_RUN_AS_NODE).toBe('1')
      if (platform === 'win32') expect(launch.env.PATHEXT).toContain('.EXE')
    }
    expect(() => miraComputerLaunch({ resourceRoot: root, platform: 'linux' })).toThrow('Windows 和 macOS')
    rmSync(join(root, 'macos/plugin/bin/dsh-cu'))
    expect(() => miraComputerLaunch({ resourceRoot: root, platform: 'darwin' })).toThrow('组件缺失')
  })
})

describe('computer summaries from both backends', () => {
  it('shows actual Windows and Mac targets, keys and text lengths', () => {
    expect(miraComputerUseStep('windows_computer_use_click', { x: 10, y: 20, windowTitle: '测试' })).toEqual({ action: '点击', target: '测试 · (10, 20)' })
    expect(miraComputerUseStep('desktop_type', { pid: 42, text: 'secret🔑' })).toEqual({ action: '输入文字', target: '窗口 42 · 7 个字符' })
    expect(miraComputerUseStep('desktop_key', { keycode: 36, flags: ['cmd'] }).target).toBe('cmd + 键码 36')
    expect(miraComputerUseStep('windows_computer_use_ocr').action).toBe('识别文字')
    expect(miraComputerUseStep('desktop_screenshot').action).toBe('截图')
    expect(miraComputerUseStep('desktop_click', { pid: 42, text: '提交' }).target).toBe('窗口 42 · 提交')
    expect(miraComputerUseStep('windows_computer_use_drag', { path: [{ x: 1, y: 2 }, { x: 30, y: 40 }] }).target).toBe('(1, 2) → (30, 40)')
  })
})
