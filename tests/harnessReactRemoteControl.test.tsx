// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MiraRemoteControl } from '../apps/harness-react/src/components/session/MiraRemoteControl'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import type { MiraRemoteStatus } from '../src/config/miraRemote'
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') } }))
let root: Root
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('starts on opening and reopening after stop, with a stop notification', async () => {
  let status: MiraRemoteStatus = { enabled: false, urls: [] }
  const remoteControl = vi.fn(async (action: string) => {
    if (action === 'start') status = { enabled: true, urls: ['http://192.168.1.2:1234/#key'] }
    if (action === 'stop') status = { enabled: false, urls: [] }
    return status
  })
  await act(async () => root.render(<Tooltip.Provider><MiraRemoteControl controller={{ remoteControl } as unknown as PilotController} /></Tooltip.Provider>))
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="移动端远程控制"]')!
  await act(async () => trigger.focus())
  expect(document.querySelector('[role="tooltip"]')).toBeNull()
  expect(trigger.dataset.connectionState).toBe('idle')
  expect(remoteControl.mock.calls.every(([action]) => action === 'status')).toBe(true)
  await act(async () => trigger.click())
  expect(remoteControl.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1)
  expect(document.querySelector('img[alt="手机连接二维码"]')).not.toBeNull()
  expect(document.querySelector('.mira-remote-overlay')).toBeNull()
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).not.toBe('true')
  expect(trigger.dataset.connectionState).toBe('waiting')
  const stop = [...document.querySelectorAll('button')].find(button => button.textContent === '停止')!
  vi.useFakeTimers()
  await act(async () => stop.click())
  expect(document.querySelector('img[alt="手机连接二维码"]')).toBeNull()
  expect(trigger.dataset.connectionState).toBe('idle')
  expect(remoteControl.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.querySelector('.mira-remote-toast')?.textContent).toBe('已关闭 Web 远程控制')
  await act(async () => trigger.click())
  expect(remoteControl.mock.calls.filter(([action]) => action === 'start')).toHaveLength(2)
  expect(document.querySelector('img[alt="手机连接二维码"]')).not.toBeNull()
  await act(async () => vi.advanceTimersByTime(3000))
  expect(document.querySelector('.mira-remote-toast')?.getAttribute('data-visible')).toBe('false')
  await act(async () => vi.advanceTimersByTime(200))
  expect(document.querySelector('.mira-remote-toast')).toBeNull()
})

it('keeps an existing service running when opening, closing and reopening', async () => {
  const remoteControl = vi.fn(async (_action: string) => ({ enabled: true, urls: ['http://192.168.1.2:1234/#key'] }))
  await act(async () => root.render(<Tooltip.Provider><MiraRemoteControl controller={{ remoteControl } as unknown as PilotController} /></Tooltip.Provider>))
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="移动端远程控制"]')!
  await act(async () => trigger.click())
  expect(document.querySelector('img[alt="手机连接二维码"]')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click())
  await act(async () => trigger.click())
  expect(remoteControl.mock.calls.every(args => args.length === 1 && args[0] === 'status')).toBe(true)
  expect(trigger.dataset.connectionState).toBe('waiting')
})
it('disables the stop button while pending and keeps the dialog open on failure', async () => {
  let rejectStop!: (error: Error) => void
  const remoteControl = vi.fn((action: string) => action === 'stop'
    ? new Promise<MiraRemoteStatus>((_, reject) => { rejectStop = reject })
    : Promise.resolve({ enabled: true, urls: ['http://192.168.1.2:1234/#key'] }))
  await act(async () => root.render(<Tooltip.Provider><MiraRemoteControl controller={{ remoteControl } as unknown as PilotController} /></Tooltip.Provider>))
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="移动端远程控制"]')!.click())
  const stop = [...document.querySelectorAll('button')].find(button => button.textContent === '停止')!
  await act(async () => stop.click())
  expect(stop.disabled).toBe(true)
  await act(async () => stop.click())
  expect(remoteControl.mock.calls.filter(([action]) => action === 'stop')).toHaveLength(1)
  await act(async () => rejectStop(new Error('停止失败')))
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('停止失败')
  expect(document.querySelector('.mira-remote-toast')).toBeNull()
  expect(stop.disabled).toBe(false)
})

it('shows the number of simultaneously connected devices', async () => {
  const remoteControl = vi.fn(async () => ({ enabled: true, urls: ['http://192.168.1.2:1234/#key'], devices: [{ name: '手机', connectedAt: 1 }, { name: '平板', connectedAt: 2 }] }))
  await act(async () => root.render(<Tooltip.Provider><MiraRemoteControl controller={{ remoteControl } as unknown as PilotController} /></Tooltip.Provider>))
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="移动端远程控制"]')!.click())
  expect(document.querySelector('.mira-remote-status-label strong')?.textContent).toBe('已连接 2 台设备')
  expect(document.querySelector('[aria-label="移动端远程控制"]')?.getAttribute('data-connection-state')).toBe('connected')
  expect(document.body.textContent).toContain('支持多台设备同时扫码')
})
