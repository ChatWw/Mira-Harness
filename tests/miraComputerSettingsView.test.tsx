// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraComputerUseSettings } from '../apps/harness-react/src/components/extensions/MiraComputerUseSettings'
import { MiraPluginDetail } from '../apps/harness-react/src/components/extensions/MiraPluginDetail'
import type { MiraComputerStatus } from '../src/config/miraComputerUse'

let root: Root, container: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
function fixture() {
  const status: MiraComputerStatus = { platform: 'darwin', engineAvailable: true, cursorAvailable: true, screenRecording: false, accessibility: false, showCursor: true }
  return { status, host: { getComputerUseStatus: vi.fn(async () => ({ ...status })), setComputerUseCursor: vi.fn(async (_on: boolean) => undefined), openComputerUsePermission: vi.fn(async (_permission: string) => undefined) } }
}
function button(text: string) { return [...container.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent?.includes(text))! }
async function mount(host: ReturnType<typeof fixture>['host']) { await act(async () => root.render(<MiraComputerUseSettings host={host} />)) }
describe('Mac computer control setup', () => {
  it('explains missing permissions, requests the selected one and refreshes after returning from settings', async () => {
    const { host, status } = fixture(); await mount(host)
    expect(container.textContent).toContain('还需要完成设置')
    expect(container.textContent).toContain('屏幕录制权限')
    expect(container.textContent).toContain('辅助功能权限')
    expect(host.openComputerUsePermission).not.toHaveBeenCalled()
    await act(async () => button('前往授权').click())
    expect(host.openComputerUsePermission).toHaveBeenCalledWith('screen-recording')
    status.screenRecording = true; status.accessibility = true
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(container.textContent).toContain('已就绪，可以控制电脑')
    expect(button('前往授权')).toBeUndefined()
  })
  it('saves the switch, keeps the previous value on failure, and retries', async () => {
    const { host } = fixture(); await mount(host)
    const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!
    host.setComputerUseCursor.mockRejectedValueOnce(new Error('配置保存失败'))
    await act(async () => toggle().click())
    expect(toggle().getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('配置保存失败')
    await act(async () => toggle().click())
    expect(toggle().getAttribute('aria-checked')).toBe('false')
    expect(host.setComputerUseCursor.mock.calls).toEqual([[false], [false]])
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
  it('never shows readiness when a required component or permission probe is missing', async () => {
    const { host, status } = fixture()
    status.engineAvailable = false; status.cursorAvailable = false; status.screenRecording = null; status.accessibility = null
    await mount(host)
    expect(container.textContent).toContain('组件缺失')
    expect(container.textContent).toContain('未检测')
    expect(container.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true)
    expect(container.textContent).not.toContain('已就绪')
  })
  it('shows detection failures and permits a fresh read', async () => {
    const { host } = fixture(); host.getComputerUseStatus.mockRejectedValueOnce(new Error('检测失败'))
    await mount(host)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('检测失败')
    await act(async () => button('重新检测').click())
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[role="switch"]')).not.toBeNull()
  })
  it('hides the Mac settings on Windows', async () => {
    const { host, status } = fixture(); status.platform = 'win32'; await mount(host)
    expect(container.childElementCount).toBe(0)
  })
  it('ignores an old host response after navigating to another plugin host', async () => {
    const old = fixture(), current = fixture()
    let resolve!: (status: MiraComputerStatus) => void
    old.host.getComputerUseStatus.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await mount(old.host); current.status.showCursor = false; await mount(current.host)
    await act(async () => resolve(old.status))
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
  })
  it('places setup on the installed builtin plugin detail, including its public-market entry', async () => {
    const { host } = fixture()
    const item = { id: 'computer-use@mira-builtin', name: 'computer-use', description: '电脑控制', installed: true, enabled: true, marketplace: 'mira-builtin', sourceName: 'Mira', repositoryUrl: '', commit: '', skills: [], unsupported: [] }
    await act(async () => root.render(<MiraPluginDetail item={item} computerSettings={host} actions={null} />))
    expect(container.querySelector('[aria-label="macOS 电脑控制设置"]')).not.toBeNull()
    await act(async () => root.render(<MiraPluginDetail item={{ ...item, id: 'other@local' }} computerSettings={host} actions={null} />))
    expect(container.querySelector('[aria-label="macOS 电脑控制设置"]')).toBeNull()
  })
  it('ignores a delayed save after replacing the host', async () => {
    const old = fixture(), current = fixture()
    let resolve!: () => void
    old.host.setComputerUseCursor.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await mount(old.host)
    await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    await mount(current.host)
    await act(async () => resolve())
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(false)
  })
})
