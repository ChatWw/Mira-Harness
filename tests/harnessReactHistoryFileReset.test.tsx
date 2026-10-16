// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MiraHistoryFileReset } from '../apps/harness-react/src/components/conversation/MiraHistoryFileReset'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import type { MiraFileRewindPreview, MiraHistoryEditBlocked, MiraHistoryEditWorkspace } from '../src/config/miraFileRewind'
let root: Root
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
const safe = (): MiraFileRewindPreview => ({ messageId: 'input', safeFiles: [{ path: 'new.txt', operationCount: 1 }], unsafeFiles: [], ignoredTools: [], canApply: true, snapshotToken: 'token' })
const conflict = (): MiraFileRewindPreview => ({ ...safe(), canApply: false, unsafeFiles: [{ path: 'changed.txt', operationCount: 1, reason: 'external_modified' }] })
async function mount(preview = safe(), edit = vi.fn<(workspace: MiraHistoryEditWorkspace) => Promise<boolean | MiraHistoryEditBlocked>>(async () => true)) {
  const controller = { getSnapshot: () => ({ session: { id: 'owner' } }), previewFileRewind: vi.fn(async () => preview) }
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<MiraHistoryFileReset controller={controller as unknown as PilotController} sessionId="owner" messageId="input" onEdit={edit} />))
  const click = async (text: string) => { await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label') === text || button.textContent === text)!.click()) }
  return { controller, edit, click }
}
it('submits rewind directly without opening a confirmation or invoking standalone file recovery', async () => {
  const view = await mount()
  await view.click('对话 + 文件重置')
  expect(view.edit).toHaveBeenCalledExactlyOnceWith({ mode: 'rewind', snapshotToken: 'token' })
  expect(view.controller.previewFileRewind).toHaveBeenCalledTimes(2)
  expect(document.querySelector('[role=dialog]')).toBeNull()
})
it('disables the entry when there are no recorded changes', async () => {
  const view = await mount({ ...safe(), safeFiles: [], canApply: false, snapshotToken: undefined })
  expect(document.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
  await view.click('对话 + 文件重置'); expect(view.edit).not.toHaveBeenCalled()
})
it('preserves history on conflict and cancel, and lists only unsafe effects', async () => {
  const view = await mount(conflict())
  await view.click('对话 + 文件重置')
  const dialog = document.querySelector('[role=dialog]')!
  expect(dialog.textContent).toContain('文件无法安全重置')
  expect(dialog.textContent).toContain('当前文件已被外部修改')
  expect(dialog.textContent).not.toContain('new.txt')
  expect(view.edit).not.toHaveBeenCalled()
  await view.click('取消'); expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(view.edit).not.toHaveBeenCalled()
})
it('handles a conflict detected atomically at submission and permits conversation-only fallback', async () => {
  const edit = vi.fn<(workspace: MiraHistoryEditWorkspace) => Promise<boolean | MiraHistoryEditBlocked>>().mockResolvedValueOnce({ disposition: 'blocked', message: 'conflict', preview: conflict() }).mockResolvedValueOnce(true)
  const view = await mount(safe(), edit)
  await view.click('对话 + 文件重置')
  expect(document.querySelector('[role=dialog]')).not.toBeNull()
  await view.click('仅重置对话并发送')
  expect(edit).toHaveBeenLastCalledWith({ mode: 'preserve' })
  expect(document.querySelector('[role=dialog]')).toBeNull()
})
it('keeps conflicts visible and prevents duplicate submissions while fallback is pending', async () => {
  let resolve!: (value: boolean) => void
  const edit = vi.fn(() => new Promise<boolean>(yes => { resolve = yes }))
  const view = await mount(conflict(), edit)
  await view.click('对话 + 文件重置'); await view.click('仅重置对话并发送')
  await view.click('取消')
  expect(document.querySelector('[role=dialog]')).not.toBeNull()
  expect([...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].every(button => button.disabled)).toBe(true)
  expect(edit).toHaveBeenCalledOnce()
  await act(async () => resolve(false))
  expect(document.querySelector('[role=alert]')?.textContent).toContain('编辑内容已保留')
})
it('ignores a delayed preview after unmount without sending', async () => {
  const view = await mount()
  let resolve!: (value: MiraFileRewindPreview) => void
  view.controller.previewFileRewind.mockImplementationOnce(() => new Promise(yes => { resolve = yes }))
  await view.click('对话 + 文件重置')
  await act(async () => root.unmount())
  await act(async () => resolve(safe()))
  expect(view.edit).not.toHaveBeenCalled()
})
