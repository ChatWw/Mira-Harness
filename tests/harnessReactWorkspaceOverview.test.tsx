// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceTabs } from '../apps/harness-react/src/components/workspace/WorkspaceTabs'
import { useHarnessSessionShortcuts } from '../apps/harness-react/src/components/session/SessionSidebar'
import { miraSearchWorkspaceTabs, miraWorkspaceTabTime } from '../apps/harness-react/src/lib/mira-workspace-tab-presentation'
import { closeWorkspaceTab, createWorkspaceSession, restoreWorkspaceTab, type WorkspaceTab, type WorkspaceTabId } from '../apps/harness-react/src/state/workspace-state'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const tabs: WorkspaceTab[] = [
  { id: 'browser:a', label: '同名页面', url: 'https://mira.test/first', openedAt: Date.now() - 120_000 },
  { id: 'browser:b', label: '同名页面', url: 'https://mira.test/second' },
  { id: 'file:docs/guide.md', label: 'guide.md', path: 'docs/guide.md' },
]
async function fixture(initial = tabs, delayed = false) {
  const activate = vi.fn(), reopen = vi.fn(), close = vi.fn()
  const shortcuts = { newTask: vi.fn(), search: vi.fn(), sidebar: vi.fn() }
  let finish: (() => void) | undefined
  function View() {
    useHarnessSessionShortcuts(shortcuts.newTask, shortcuts.search, shortcuts.sidebar)
    const [state, setState] = useState({ ...createWorkspaceSession(), tabs: initial, activeTab: initial[0]?.id || 'overview' as WorkspaceTabId })
    return <><WorkspaceTabs tabs={state.tabs} active={state.activeTab} recentClosedTabs={state.recentClosedTabs} changes={0} onOpen={() => undefined} onReorder={() => undefined} onDismiss={() => undefined} onCloseAll={() => undefined} onCloseOthers={() => undefined} onActivate={id => { activate(id); setState(previous => ({ ...previous, activeTab: id })) }} onReopen={id => { reopen(id); setState(previous => restoreWorkspaceTab(previous, id)) }} onClose={id => {
      close(id); const apply = () => setState(previous => closeWorkspaceTab(previous, id)); if (delayed) finish = apply; else apply()
    }} /><textarea aria-label="草稿" /></>
  }
  await act(async () => root.render(<View />))
  const open = async () => { await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="标签页"]')!.click()) }
  await open()
  const search = async (query: string) => { const input = container.querySelector<HTMLInputElement>('[aria-label="搜索标签页"]')!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query); input.dispatchEvent(new Event('input', { bubbles: true })) }) }
  const key = async (key: string, element: Element = document.activeElement!) => { await act(async () => { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)) }) }
  return { open, search, key, activate, reopen, close, shortcuts, finish: async () => { await act(async () => finish?.()) } }
}
const items = () => [...container.querySelectorAll<HTMLElement>('[cmdk-item]')]

describe('workspace overview search and resource actions', () => {
  it('keeps workbench shortcuts from opening another task/search/sidebar behind the real Popover', async () => {
    const view = await fixture()
    for (const modifier of ['metaKey', 'ctrlKey']) for (const key of ['n', 'k', 'b']) await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, [modifier]: true, bubbles: true, cancelable: true })))
    Object.values(view.shortcuts).forEach(action => expect(action).not.toHaveBeenCalled())
    expect(container.querySelector('.mira-workspace-tab-menu')).not.toBeNull()
    await view.key('Escape'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true })))
    expect(view.shortcuts.newTask).toHaveBeenCalledOnce()
  })
  it('matches every query term across title, path, type and URL, ranks title matches first, keeps ties stable', () => {
    expect(miraSearchWorkspaceTabs(tabs, '  BROWSER SECOND  ').map(tab => tab.id)).toEqual(['browser:b'])
    expect(miraSearchWorkspaceTabs(tabs, '文件 docs/guide').map(tab => tab.id)).toEqual(['file:docs/guide.md'])
    expect(miraSearchWorkspaceTabs(tabs, 'browser missing')).toEqual([])
    const titleMatch = { id: 'browser:c', label: 'Mira test', url: 'https://unrelated.test' } as WorkspaceTab
    expect(miraSearchWorkspaceTabs([...tabs, titleMatch], 'mira').map(tab => tab.id)).toEqual(['browser:c', 'browser:a', 'browser:b'])
    expect(miraWorkspaceTabTime(undefined, Date.now())).toBe('')
    expect(miraWorkspaceTabTime(1000, 121_000)).toBe('2分钟前')
  })
  it('focuses search, filters duplicate titles by URL, activates the exact identity and resets on reopen', async () => {
    const view = await fixture()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('搜索标签页')
    await view.search('second'); expect(items()).toHaveLength(1)
    await view.key('Enter')
    expect(view.activate).toHaveBeenCalledExactlyOnceWith('browser:b')
    expect(container.querySelector('.mira-workspace-tab-menu')).toBeNull()
    await view.open(); expect(items()).toHaveLength(3)
    expect((document.activeElement as HTMLInputElement).value).toBe('')
  })
  it('uses unique values to traverse identically named tabs with ArrowDown and Enter', async () => {
    const view = await fixture(tabs.slice(0, 2))
    expect(items()[0].getAttribute('data-selected')).toBe('true')
    await view.key('ArrowDown'); await view.key('Enter')
    expect(view.activate).toHaveBeenCalledExactlyOnceWith('browser:b')
  })
  it('does not activate a result while the input method is committing Enter', async () => {
    const view = await fixture()
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
    expect(view.activate).not.toHaveBeenCalled(); expect(container.querySelector('.mira-workspace-tab-menu')).not.toBeNull()
  })
  it('closes a background result without activating it or dismissing the search and can restore it', async () => {
    const view = await fixture()
    const button = items()[1].querySelector<HTMLButtonElement>('button')!
    await act(async () => button.click())
    expect(view.close).toHaveBeenCalledExactlyOnceWith('browser:b'); expect(view.activate).not.toHaveBeenCalled()
    expect(container.querySelector('.mira-workspace-tab-menu')).not.toBeNull()
    expect(container.querySelector('[cmdk-group-heading]')?.textContent).toBe('已打开的标签页')
    const restored = items().find(item => item.dataset.value === 'closed:browser:b')!
    await act(async () => restored.click())
    expect(view.reopen).toHaveBeenCalledExactlyOnceWith('browser:b'); expect(container.querySelector('.mira-workspace-tab-menu')).toBeNull()
  })
  it('preserves focus for failed/delayed close, then returns a removed close control to search', async () => {
    const view = await fixture(tabs, true), button = items()[1].querySelector<HTMLButtonElement>('button')!
    await act(async () => { button.focus(); button.click() })
    expect(document.activeElement).toBe(button); expect(items().filter(item => item.dataset.value?.startsWith('open:'))).toHaveLength(3)
    await view.finish(); expect(document.activeElement?.getAttribute('aria-label')).toBe('搜索标签页')
  })
  it('does not steal newer draft focus when a delayed close succeeds', async () => {
    const view = await fixture(tabs, true), button = items()[1].querySelector<HTMLButtonElement>('button')!
    await act(async () => { button.focus(); button.click() })
    const draft = container.querySelector<HTMLTextAreaElement>('[aria-label="草稿"]')!
    await act(async () => draft.focus()); await view.finish(); expect(document.activeElement).toBe(draft)
  })
  it('shows no-result and empty states, and Escape restores the overview trigger', async () => {
    const view = await fixture([])
    expect(container.querySelector('[cmdk-empty]')?.textContent).toBe('暂无标签页')
    await view.search('missing'); expect(container.querySelector('[cmdk-empty]')?.textContent).toBe('没有匹配的标签页')
    await view.key('Escape'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }); expect(container.querySelector('.mira-workspace-tab-menu')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('标签页')
  })
})
