// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSessionSummary } from '../src/config/harness'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { miraAdjacentTasks } from '../apps/harness-react/src/lib/mira-task-navigation'
import { useMiraTaskNavigationShortcut } from '../apps/harness-react/src/hooks/useMiraTaskNavigationShortcut'
import { MiraPromptEditor } from '../apps/harness-react/src/components/composer/MiraPromptEditor'

const task = (id: string, patch: Partial<HarnessSessionSummary> = {}): HarnessSessionSummary => ({ id, title: id, workingDirectory: '/one', projectId: 'project', permissionMode: 'default', createdAt: 1, updatedAt: 1, status: 'active', pinned: false, ...patch })
const preferences = () => new SidebarPreferenceStore(async () => null, async () => undefined).getSnapshot().preferences
let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(navigator, 'platform', 'get').mockReturnValue('') })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('workspace-scoped adjacent tasks', () => {
  it('uses the active directory, excludes retired drafts and does not wrap', () => {
    const tasks = [task('a', { updatedAt: 3 }), task('foreign', { workingDirectory: '/two', updatedAt: 10 }), task('b', { projectId: 'alias', updatedAt: 2 }), { ...task('archived'), archivedAt: 5 }, { ...task('draft'), draftState: 'prepared' as const }]
    expect(miraAdjacentTasks(tasks, { workingDirectory: '/one' }, 'a', preferences())).toEqual({ previous: undefined, next: 'b' })
    expect(miraAdjacentTasks(tasks, { workingDirectory: '/one' }, 'b', preferences())).toEqual({ previous: 'a', next: undefined })
    expect(miraAdjacentTasks(tasks, {}, undefined, preferences())).toEqual({ previous: undefined, next: undefined })
  })
  it('matches pinned, created and manual sidebar ordering including interleaved groups', () => {
    const tasks = [task('a', { createdAt: 3 }), task('b', { createdAt: 2 }), task('pinned', { pinned: true }), task('c', { createdAt: 4 })]
    const prefs = preferences(); prefs.sort = 'created'
    expect(miraAdjacentTasks(tasks, { projectId: 'project' }, 'c', prefs)).toEqual({ previous: 'pinned', next: 'a' })
    prefs.view = 'group'; prefs.sort = 'created'; prefs.groupSort = 'manual'; prefs.groups = [{ id: 'group', name: 'Group', color: 'blue', collapsed: true, sessionIds: ['b', 'a', 'missing', 'b'] }]
    prefs.groupedRootOrder = [{ type: 'session', id: 'c' }, { type: 'group', id: 'group' }]
    expect(miraAdjacentTasks(tasks, { workingDirectory: '/one' }, 'b', prefs)).toEqual({ previous: 'c', next: 'a' })
    expect(miraAdjacentTasks(tasks, { workingDirectory: '/one' }, undefined, prefs)).toEqual({ previous: 'a', next: 'pinned' })
  })
  it('follows a dragged project scope without changing untouched time sorting', () => {
    const prefs = preferences(); prefs.manualSessionScopes = ['project:project']
    const tasks = [task('a', { updatedAt: 1 }), task('b', { updatedAt: 3 })]
    expect(miraAdjacentTasks(tasks, { projectId: 'project' }, 'a', prefs)).toEqual({ previous: undefined, next: 'b' })
    prefs.manualSessionScopes = []
    expect(miraAdjacentTasks(tasks, { projectId: 'project' }, 'a', prefs)).toEqual({ previous: 'b', next: undefined })
  })
  it('uses latest updates in the group view independently of the project sort', () => {
    const prefs = preferences(); prefs.view = 'group'; prefs.sort = 'created'
    prefs.groups = [{ id: 'g', name: '研究', color: 'blue', collapsed: false, sessionIds: ['a', 'b'] }]
    const tasks = [task('a', { createdAt: 3, updatedAt: 1 }), task('b', { createdAt: 1, updatedAt: 3 })]
    expect(miraAdjacentTasks(tasks, { projectId: 'project' }, 'b', prefs)).toEqual({ previous: undefined, next: 'a' })
  })
  it('reads fresh metadata and ignores duplicate and missing task identities', () => {
    const tasks = [task('a', { updatedAt: 2 }), task('b')]
    expect(miraAdjacentTasks(tasks, { workingDirectory: '/one' }, 'a', preferences()).next).toBe('b')
    tasks[1].updatedAt = 3
    expect(miraAdjacentTasks([...tasks, tasks[1]], { workingDirectory: '/one' }, 'a', preferences())).toEqual({ previous: 'b', next: undefined })
    expect(miraAdjacentTasks(tasks, { workingDirectory: '/one' }, 'gone', preferences())).toEqual({ previous: 'a', next: 'b' })
  })
})

async function mount() {
  let current = vi.fn((_direction: 'previous' | 'next') => true)
  const original = current, changed = vi.fn(), editorKey = vi.fn()
  function App() {
    useMiraTaskNavigationShortcut(current)
    return <main><MiraPromptEditor text="保留草稿" aria-label="任务输入" onChange={changed} onKeyDown={editorKey} /><input aria-label="文件编辑器" /><div className="xterm"><span>终端</span></div><button>标题动作</button></main>
  }
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  const render = async () => { await act(async () => root!.render(<React.StrictMode><App /></React.StrictMode>)) }
  await render()
  const key = async (options: KeyboardEventInit = {}, target: EventTarget = container.querySelector('[aria-label="任务输入"]')!) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, shiftKey: true, key: '}', code: 'BracketRight', ...options })
    await act(async () => target.dispatchEvent(event)); return event
  }
  return { original, changed, editorKey, container, key, replace: async (available: boolean) => { current = vi.fn(() => available); await render(); return current } }
}

describe('adjacent task shortcuts through real React and Lexical', () => {
  it.each(['MacIntel', 'Win32'])('keeps adjacent task navigation platform-specific on %s', async platform => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    const view = await mount()
    const primary = platform === 'MacIntel' ? 'metaKey' : 'ctrlKey', other = primary === 'metaKey' ? 'ctrlKey' : 'metaKey'
    await view.key({ metaKey: false, ctrlKey: false, [other]: true })
    await view.key({ metaKey: true, ctrlKey: true })
    expect(view.original).not.toHaveBeenCalled()
    await view.key({ metaKey: false, ctrlKey: false, [primary]: true })
    expect(view.original).toHaveBeenCalledExactlyOnceWith('next'); expect(view.changed).not.toHaveBeenCalled()
  })

  it.each(['metaKey', 'ctrlKey'] as const)('consumes %s+Shift+bracket once before Composer and keeps its text', async modifier => {
    const view = await mount()
    expect((await view.key({ metaKey: false, [modifier]: true })).defaultPrevented).toBe(true)
    await view.key({ key: '{', code: 'BracketLeft', metaKey: false, [modifier]: true })
    expect(view.original.mock.calls).toEqual([['next'], ['previous']])
    expect(view.changed).not.toHaveBeenCalled(); expect(view.editorKey).not.toHaveBeenCalled()
    expect(view.container.querySelector('[aria-label="任务输入"]')!.textContent).toBe('保留草稿')
  })
  it('leaves terminal, file editor, IME, repeated and history-only bindings untouched', async () => {
    const view = await mount()
    for (const target of view.container.querySelectorAll('input, .xterm span')) expect((await view.key({}, target)).defaultPrevented).toBe(false)
    for (const options of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { altKey: true }, { shiftKey: false }, { metaKey: false, ctrlKey: false }]) expect((await view.key(options)).defaultPrevented).toBe(false)
    expect(view.original).not.toHaveBeenCalled()
  })
  it.each(['modal', 'menu', 'popover'] as const)('keeps %s keyboard behavior local', async kind => {
    const view = await mount(), overlay = document.createElement('div'), input = document.createElement('input')
    overlay.setAttribute('role', kind === 'menu' ? 'menu' : 'dialog')
    if (kind === 'modal') overlay.setAttribute('aria-modal', 'true')
    if (kind === 'menu') overlay.setAttribute('data-state', 'open')
    overlay.append(input); document.body.append(overlay)
    expect((await view.key({}, kind === 'popover' ? input : document.body)).defaultPrevented).toBe(false)
    expect(view.original).not.toHaveBeenCalled()
  })
  it('uses the latest handler, passes unavailable boundaries through and removes its listener', async () => {
    const view = await mount(), current = await view.replace(false)
    expect((await view.key({}, document.body)).defaultPrevented).toBe(false)
    expect(current).toHaveBeenCalledOnce(); expect(view.original).not.toHaveBeenCalled()
    await act(async () => root!.unmount()); root = undefined
    await view.key({}, document.body); expect(current).toHaveBeenCalledOnce()
  })
})
