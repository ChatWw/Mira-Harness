// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserMessageEditor } from '../apps/harness-react/src/components/conversation/message-parts'
import type { HarnessMessage } from '../src/config/harness'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function mount() {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const props = { original: { id: 'user', role: 'user', content: '原始要求', createdAt: 1 } as HarnessMessage, content: '原始要求', onCancel: vi.fn(), onConfirm: vi.fn<(next: string) => Promise<boolean>>(async () => false), disabled: false }
  const render = async () => { await act(async () => root!.render(<React.StrictMode><UserMessageEditor {...props} /></React.StrictMode>)) }
  await render()
  const input = () => container.querySelector<HTMLTextAreaElement>('textarea')!
  const change = async (text: string) => { await act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!; set.call(input(), text); input().dispatchEvent(new Event('input', { bubbles: true })) }) }
  const submit = () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => /保存并重跑|重新发送中/.test(button.textContent!))!
  const click = async (element: HTMLElement) => { await act(async () => element.click()) }
  return { props, container, input, change, submit, render, click }
}

describe('history edit real DOM admission and draft recovery', () => {
  it('retains modified text after a refused submission and permits one successful retry', async () => {
    const view = await mount(); await view.change('修改后的要求')
    await view.click(view.submit())
    expect(view.input().value).toBe('修改后的要求')
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('重新发送')
    expect(view.submit().disabled).toBe(false)
    view.props.onConfirm.mockResolvedValueOnce(true)
    await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenCalledTimes(2)
    expect(view.props.onConfirm).toHaveBeenLastCalledWith('修改后的要求')
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
  })

  it('preserves text on a rejected promise and shows the actual failure', async () => {
    const view = await mount(); await view.change('保留这段草稿')
    view.props.onConfirm.mockRejectedValueOnce(new Error('模型暂不可用'))
    await view.click(view.submit())
    expect(view.input().value).toBe('保留这段草稿')
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('模型暂不可用')
    expect(view.submit().disabled).toBe(false)
  })

  it('blocks waiting/loading state and ignores duplicate submissions while admission is pending', async () => {
    const view = await mount(); view.props.disabled = true; await view.render()
    expect(view.submit().disabled).toBe(true)
    await view.click(view.submit()); expect(view.props.onConfirm).not.toHaveBeenCalled()
    view.props.disabled = false; await view.render()
    const pending = deferred<boolean>(); view.props.onConfirm.mockReturnValueOnce(pending.promise)
    await view.click(view.submit()); await view.click(view.submit())
    expect(view.props.onConfirm).toHaveBeenCalledOnce()
    expect(view.input().disabled).toBe(true)
    expect(view.container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
    await act(async () => pending.resolve(false))
    expect(view.submit().disabled).toBe(false)
    expect(view.input().value).toBe('原始要求')
  })

  it('uses Escape to cancel but yields Escape to an active Chinese input composition', async () => {
    const view = await mount()
    await act(async () => { view.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); view.input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })) })
    expect(view.props.onCancel).not.toHaveBeenCalled()
    await act(async () => { view.input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); view.input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })) })
    expect(view.props.onCancel).toHaveBeenCalledOnce()
  })
})
