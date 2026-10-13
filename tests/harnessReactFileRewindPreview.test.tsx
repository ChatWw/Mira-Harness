// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraFileRewindPreviewButton } from '../apps/harness-react/src/components/conversation/MiraFileRewindPreview'
import { PilotController, type PilotHost } from '../apps/harness-react/src/state/pilot-state'
import type { MiraFileRewindPreview, MiraHistoryEditBlocked, MiraHistoryEditWorkspace } from '../src/config/miraFileRewind'
import type { MiraFileRewindResult } from '../src/config/miraFileRewind'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
const empty = (): MiraFileRewindPreview => ({ messageId: 'input', safeFiles: [], unsafeFiles: [], ignoredTools: [], canApply: false })
async function mount() {
  const host = { previewFileRewind: vi.fn(async () => empty()) }
  const controller = new PilotController(host as unknown as PilotHost)
  const state = { ...controller.getSnapshot(), session: { id: 'owner' } as any }
  vi.spyOn(controller, 'getSnapshot').mockImplementation(() => state)
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  const props = { controller, sessionId: 'owner', messageId: 'input', disabled: false, onEdit: undefined as undefined | ((workspace: MiraHistoryEditWorkspace) => Promise<boolean | MiraHistoryEditBlocked>) }
  const render = async () => { await act(async () => root!.render(<React.StrictMode><MiraFileRewindPreviewButton {...props} /></React.StrictMode>)) }
  await render()
  const button = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
  const click = async (element: HTMLElement) => { await act(async () => element.click()) }
  return { host, state, props, render, button, click }
}

describe('file rewind read-only dialog lifecycle', () => {
  it('uses one edit-and-rewind command and protects the dialog during admission', async () => {
    const view = await mount(), pending = deferred<boolean>()
    vi.spyOn(view.props.controller, 'supportsFileRewindApply', 'get').mockReturnValue(true)
    view.props.onEdit = vi.fn(() => pending.promise); await view.render()
    view.host.previewFileRewind.mockResolvedValue({ ...empty(), canApply: true, snapshotToken: 'a'.repeat(64), safeFiles: [{ path: 'new.txt', operationCount: 1 }] })
    await view.click(view.button('恢复文件并重跑')); await view.click(document.querySelector<HTMLButtonElement>('.mira-rewind-apply')!)
    view.props.disabled = true; await view.render()
    expect(view.props.onEdit).toHaveBeenLastCalledWith({ mode: 'rewind', snapshotToken: 'a'.repeat(64) })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull(); expect(view.button('关闭文件恢复预览').disabled).toBe(true)
    await act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => pending.resolve(true)); expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows revalidated edit conflicts and permits explicit preserve-file fallback', async () => {
    const view = await mount()
    vi.spyOn(view.props.controller, 'supportsFileRewindApply', 'get').mockReturnValue(true)
    const blocked = { disposition: 'blocked' as const, message: '文件在确认后被修改', preview: { ...empty(), unsafeFiles: [{ path: 'new.txt', operationCount: 1, reason: 'external_modified' as const }] } }
    view.props.onEdit = vi.fn().mockResolvedValueOnce(blocked).mockResolvedValueOnce(true); await view.render()
    view.host.previewFileRewind.mockResolvedValue({ ...empty(), canApply: true, snapshotToken: 'a'.repeat(64), safeFiles: [{ path: 'new.txt', operationCount: 1 }] })
    await view.click(view.button('恢复文件并重跑')); await view.click(document.querySelector<HTMLButtonElement>('.mira-rewind-apply')!)
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('文件在记录之外被修改'); expect(document.querySelector('.mira-rewind-apply')).toBeNull()
    await view.click([...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保留文件并重跑')!)
    expect(view.props.onEdit).toHaveBeenLastCalledWith({ mode: 'preserve' }); expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('keeps failed edits open and allows returning to the editor', async () => {
    const view = await mount()
    vi.spyOn(view.props.controller, 'supportsFileRewindApply', 'get').mockReturnValue(true)
    view.props.onEdit = vi.fn(async () => false); await view.render()
    view.host.previewFileRewind.mockResolvedValue({ ...empty(), canApply: true, snapshotToken: 'a'.repeat(64), safeFiles: [{ path: 'new.txt', operationCount: 1 }] })
    await view.click(view.button('恢复文件并重跑')); await view.click(document.querySelector<HTMLButtonElement>('.mira-rewind-apply')!)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('编辑内容已保留')
    await view.click([...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '返回编辑')!)
    expect(view.props.onEdit).toHaveBeenCalledOnce(); expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('confirms real recovery once, blocks dismissal while applying and shows authoritative success', async () => {
    const view = await mount(), pending = deferred<MiraFileRewindResult>()
    vi.spyOn(view.props.controller, 'supportsFileRewindApply', 'get').mockReturnValue(true)
    const apply = vi.spyOn(view.props.controller, 'applyFileRewind').mockReturnValue(pending.promise)
    view.host.previewFileRewind.mockResolvedValue({ ...empty(), canApply: true, snapshotToken: 'a'.repeat(64), safeFiles: [{ path: 'new.txt', operationCount: 1, action: 'delete' }] })
    await view.click(view.button('预览文件恢复'))
    const restore = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '恢复 1 个文件')!
    await view.click(restore); await view.click(restore)
    expect(apply).toHaveBeenCalledOnce(); expect(apply).toHaveBeenLastCalledWith('owner', 'input', 'a'.repeat(64))
    expect(view.button('关闭文件恢复预览').disabled).toBe(true)
    await act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => pending.resolve({ applied: true, preview: empty(), message: '已恢复 1 个文件，对话保持不变。' }))
    expect(document.querySelector('[role="status"]')?.textContent).toContain('已恢复 1 个文件')
    expect(document.querySelector('.mira-rewind-apply')).toBeNull()
  })

  it('disables recovery with conflicts and renders the revalidated conflict result', async () => {
    const view = await mount()
    vi.spyOn(view.props.controller, 'supportsFileRewindApply', 'get').mockReturnValue(true)
    const conflict = { ...empty(), unsafeFiles: [{ path: 'new.txt', operationCount: 1, reason: 'external_modified' as const }] }
    const apply = vi.spyOn(view.props.controller, 'applyFileRewind').mockResolvedValue({ applied: false, preview: conflict, message: '文件已变化，请重新核对。' })
    view.host.previewFileRewind.mockResolvedValue({ ...empty(), canApply: true, snapshotToken: 'a'.repeat(64), safeFiles: [{ path: 'new.txt', operationCount: 1, action: 'delete' }] })
    await view.click(view.button('预览文件恢复'))
    await view.click(document.querySelector<HTMLButtonElement>('.mira-rewind-apply')!)
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('文件在记录之外被修改')
    expect(document.querySelector('.mira-rewind-apply')).toBeNull(); expect(apply).toHaveBeenCalledOnce()
  })

  it('offers explicit compensation retry for an unfinished recovery instead of applying again', async () => {
    const view = await mount()
    vi.spyOn(view.props.controller, 'supportsFileRewindApply', 'get').mockReturnValue(true)
    const recover = vi.spyOn(view.props.controller, 'recoverFileRewind').mockResolvedValue({ applied: false, preview: empty(), message: '已撤销未完成的恢复' })
    view.host.previewFileRewind.mockResolvedValue({ ...empty(), recoveryId: 'pending', unsafeFiles: [{ path: 'new.txt', operationCount: 0, reason: 'recovery_incomplete' }] })
    await view.click(view.button('预览文件恢复'))
    await view.click([...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '重试撤销本次恢复')!)
    expect(recover).toHaveBeenLastCalledWith('owner', 'pending')
    expect(document.querySelector('[role="status"]')?.textContent).toContain('已撤销未完成的恢复')
    expect(document.body.textContent).not.toContain('重试撤销本次恢复')
  })

  it('lists safe, conflicting and untracked effects without a fake apply action', async () => {
    const view = await mount()
    view.host.previewFileRewind.mockResolvedValue({ ...empty(), safeFiles: [{ path: 'new.txt', operationCount: 2, action: 'delete' }], unsafeFiles: [{ path: 'old.txt', operationCount: 1, reason: 'external_modified' }], ignoredTools: [{ name: '终端命令', count: 1 }] })
    await view.click(view.button('预览文件恢复'))
    expect(view.host.previewFileRewind).toHaveBeenLastCalledWith('owner', 'input')
    const text = document.querySelector('[role="dialog"]')!.textContent!
    expect(text).toContain('移除本段新建文件'); expect(text).toContain('文件在记录之外被修改'); expect(text).toContain('未追踪的操作')
    expect([...document.querySelectorAll('button')].some(button => /确认恢复|恢复文件/.test(button.textContent!))).toBe(false)
    await view.click(view.button('关闭文件恢复预览'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('discards a delayed preview after close without reopening the dialog', async () => {
    const view = await mount(), result = deferred<MiraFileRewindPreview>()
    view.host.previewFileRewind.mockReturnValue(result.promise)
    await view.click(view.button('预览文件恢复'))
    expect(document.querySelector('[role="status"]')?.textContent).toContain('正在核对')
    await view.click(view.button('关闭文件恢复预览'))
    await act(async () => result.resolve({ ...empty(), safeFiles: [{ path: 'late.txt', operationCount: 1 }] }))
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.textContent).not.toContain('late.txt')
  })

  it('retains owner and supports retry after a failed read', async () => {
    const view = await mount()
    view.host.previewFileRewind.mockRejectedValueOnce(new Error('目录不可读')).mockResolvedValueOnce(empty())
    await view.click(view.button('预览文件恢复'))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('目录不可读')
    await view.click([...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '重试')!)
    expect(view.host.previewFileRewind.mock.calls).toEqual([['owner', 'input'], ['owner', 'input']])
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('没有已记录的文件修改')
  })

  it.each(['owner', 'disabled'])('invalidates late responses on %s changes', async change => {
    const view = await mount(), result = deferred<MiraFileRewindPreview>()
    view.host.previewFileRewind.mockReturnValue(result.promise)
    await view.click(view.button('预览文件恢复'))
    if (change === 'owner') { view.props.sessionId = 'next'; view.state.session.id = 'next' }
    else view.props.disabled = true
    await view.render()
    await act(async () => result.resolve({ ...empty(), safeFiles: [{ path: 'old-owner.txt', operationCount: 1 }] }))
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.textContent).not.toContain('old-owner.txt')
    if (change === 'disabled') expect(view.button('预览文件恢复').disabled).toBe(true)
  })
})
