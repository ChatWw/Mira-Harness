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
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('starts on opening and stops without restarting until reopened', async () => {
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
  await act(async () => trigger.click())
  expect(remoteControl.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1)
  expect(document.querySelector('img[alt="手机连接二维码"]')).not.toBeNull()
  expect(document.querySelector('.mira-remote-overlay')).toBeNull()
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).not.toBe('true')
  expect(trigger.dataset.connectionState).toBe('waiting')
  const stop = [...document.querySelectorAll('button')].find(button => button.textContent === '停止')!
  await act(async () => stop.click())
  expect(document.querySelector('img[alt="手机连接二维码"]')).toBeNull()
  expect(trigger.dataset.connectionState).toBe('idle')
  expect(remoteControl.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1)
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click())
  await act(async () => trigger.click())
  expect(remoteControl.mock.calls.filter(([action]) => action === 'start')).toHaveLength(2)
})
