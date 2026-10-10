// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraTaskTitleEditor } from '../apps/harness-react/src/components/workbench/MiraTaskTitleEditor'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
async function mount() {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  let state = { session: { id: 'a' }, error: undefined } as PilotState
  const controller = { getSnapshot: () => state, renameSession: vi.fn<PilotController['renameSession']>(async () => false) }
  const onClose = vi.fn()
  const render = async () => { await act(async () => root!.render(<React.StrictMode><MiraTaskTitleEditor sessionId="a" title="任务 A" controller={controller} onClose={onClose} /></React.StrictMode>)) }
  await render()
  const input = () => container.querySelector<HTMLInputElement>('input')!
  const form = () => container.querySelector<HTMLFormElement>('form')!
  const submit = async () => { await act(async () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
  const change = async (text: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), text); input().dispatchEvent(new Event('input', { bubbles: true })) }) }
  const key = async (value: string, options: KeyboardEventInit = {}) => { const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: value, ...options }); await act(async () => input().dispatchEvent(event)); return event }
  return { container, controller, onClose, render, input, form, submit, change, key, state: () => state, setState: (patch: Partial<PilotState>) => { state = { ...state, ...patch } } }
}

describe('task Header title editor actual DOM boundaries', () => {
  it('retains an unsaved title on failure and closes only after a successful retry', async () => {
    const view = await mount(); await view.change('新的任务名称')
    view.setState({ error: '名称保存失败' }); await view.submit()
    expect(view.onClose).not.toHaveBeenCalled()
    expect(view.input().value).toBe('新的任务名称')
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('名称保存失败')
    view.controller.renameSession.mockResolvedValueOnce(true); await view.submit()
    expect(view.controller.renameSession).toHaveBeenCalledTimes(2)
    expect(view.onClose).toHaveBeenCalledOnce()
  })

  it('guards the original task even when a submit event races a switch to another task', async () => {
    const view = await mount(); await view.change('A 的草稿')
    view.setState({ session: { id: 'b' } as PilotState['session'] })
    await view.submit()
    expect(view.controller.renameSession).not.toHaveBeenCalled()
    await view.render()
    expect(view.container.querySelector('form')).toBeNull()
  })

  it('keeps one request pending and does not close a different task after the old save resolves', async () => {
    const view = await mount(); const pending = deferred<boolean>()
    view.controller.renameSession.mockReturnValueOnce(pending.promise)
    await view.submit(); await view.submit()
    expect(view.controller.renameSession).toHaveBeenCalledExactlyOnceWith('a', '任务 A')
    expect(view.input().disabled).toBe(true)
    expect(view.container.querySelector<HTMLButtonElement>('[aria-label="保存任务名称"]')!.disabled).toBe(true)
    view.setState({ session: { id: 'b' } as PilotState['session'] }); await view.render()
    await act(async () => pending.resolve(true))
    expect(view.onClose).not.toHaveBeenCalled()
  })

  it('does not close a reopened editor for the same task when an unmounted old save succeeds', async () => {
    const view = await mount(); const pending = deferred<boolean>()
    view.controller.renameSession.mockReturnValueOnce(pending.promise)
    await view.submit()
    await act(async () => root!.unmount()); root = undefined
    const replacement = document.createElement('div'); document.body.append(replacement); root = createRoot(replacement)
    const closeNew = vi.fn()
    await act(async () => root!.render(<MiraTaskTitleEditor sessionId="a" title="重新打开 A" controller={view.controller} onClose={closeNew} />))
    await act(async () => pending.resolve(true))
    expect(view.onClose).not.toHaveBeenCalled()
    expect(closeNew).not.toHaveBeenCalled()
    expect(replacement.querySelector<HTMLInputElement>('input')!.value).toBe('重新打开 A')
  })

  it('yields Enter and Escape to IME candidates and submits once on the later ordinary Enter', async () => {
    const view = await mount()
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    expect((await view.key('Enter')).defaultPrevented).toBe(true)
    await view.key('Escape')
    expect(view.onClose).not.toHaveBeenCalled(); expect(view.controller.renameSession).not.toHaveBeenCalled()
    await act(async () => view.input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await view.key('Enter', { isComposing: true }); expect(view.controller.renameSession).not.toHaveBeenCalled()
    const legacy = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }); Object.defineProperty(legacy, 'keyCode', { value: 229 })
    await act(async () => view.input().dispatchEvent(legacy)); expect(view.controller.renameSession).not.toHaveBeenCalled()
    view.controller.renameSession.mockResolvedValueOnce(true)
    await view.key('Enter')
    expect(view.controller.renameSession).toHaveBeenCalledOnce(); expect(view.onClose).toHaveBeenCalledOnce()
  })
})
