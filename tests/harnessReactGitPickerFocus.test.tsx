// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraBranchPicker } from '../apps/harness-react/src/components/git/MiraBranchPicker'
import type { HarnessGitContext, HarnessProject } from '../src/config/harness'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const project = { id: 'p', directory: '/project/p', directoryExists: true, isGitRepository: true, gitBranch: 'main' } as HarnessProject
const snapshot: HarnessGitContext = { projectId: 'p', directory: project.directory, isRepository: true, headType: 'branch', branchName: 'main', uncommittedFileCount: 0, branches: [{ name: 'main', current: true }, { name: 'mira/topic', current: false }], snapshotToken: 'a'.repeat(64), mutationBlocked: false }
async function fixture(placement: 'composer' | 'summary' = 'composer') {
  const controller = { supportsGitActions: true, getGitContext: vi.fn(async () => snapshot), checkoutGitBranch: vi.fn(async () => snapshot), createGitBranch: vi.fn(async () => snapshot) }
await act(async () => root.render(<><form className="harness-composer"><div className="mira-prompt-editor" role="textbox" aria-label="任务内容" contentEditable suppressContentEditableWarning>主草稿</div></form><form className="harness-composer"><div className="mira-prompt-editor" role="textbox" aria-label="旁路任务内容" contentEditable suppressContentEditableWarning>旁草稿</div>{placement === 'composer' && <MiraBranchPicker controller={controller as never} project={project} placement={placement} onReturnFocus={() => container.querySelector<HTMLElement>('[aria-label="旁路任务内容"]')?.focus()} />}</form>{placement === 'summary' && <MiraBranchPicker controller={controller as never} project={project} placement={placement} />}<button aria-label="外部操作">外部</button></>))
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="选择 Git 分支"]')!
  await act(async () => { trigger.click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  const input = container.querySelector<HTMLInputElement>('[aria-label="搜索 Git 分支"]')!
  const key = async (key: string, options: KeyboardEventInit = {}) => { await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
  return { controller, trigger, input, key }
}

describe('Git picker input and focus ownership', () => {
  it.each([{ isComposing: true }, { keyCode: 229 }])('does not checkout a branch when Tab belongs to an active input method (%j)', async composing => {
    const view = await fixture()
    await view.key('ArrowDown')
    await view.key('Tab', composing)
    expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled()
    expect(container.querySelector('.mira-branch-popover')).not.toBeNull()
    await view.key('Tab')
    expect(view.controller.checkoutGitBranch).toHaveBeenCalledExactlyOnceWith('p', 'mira/topic', snapshot.snapshotToken)
  })
  it('returns Escape to the owning Lexical composer, preserving both drafts', async () => {
    const view = await fixture()
    expect(document.activeElement).toBe(view.input)
    await view.key('Escape')
    expect(document.activeElement).toBe(container.querySelector('[aria-label="旁路任务内容"]'))
    expect(container.querySelector('[aria-label="任务内容"]')?.textContent).toBe('主草稿')
    expect(container.querySelector('[aria-label="旁路任务内容"]')?.textContent).toBe('旁草稿')
  })
  it('keeps outside focus instead of returning to a composer or the branch trigger', async () => {
    await fixture()
    const outside = container.querySelector<HTMLButtonElement>('[aria-label="外部操作"]')!
    await act(async () => { outside.focus(); await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(container.querySelector('.mira-branch-popover')).toBeNull()
    expect(document.activeElement).toBe(outside)
  })
  it('returns a summary picker to its trigger instead of another pane composer', async () => {
    const view = await fixture('summary')
    await view.key('Escape')
    expect(document.activeElement).toBe(view.trigger)
  })
})
