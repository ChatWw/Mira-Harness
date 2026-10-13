// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionSidebar } from '../apps/harness-react/src/components/session/SessionSidebar'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import { miraPanePreferences, miraSidebarWidth } from '../apps/harness-react/src/lib/pane-geometry'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'

let root: Root | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })

async function mount() {
  const state = { projects: [{ id: 'p', name: '项目', directory: '/tmp/project', directoryExists: true }], sessions: [{ id: 's', title: '测试任务', projectId: 'p', status: 'active', createdAt: 1, updatedAt: 1, changeSummary: { added: 13, removed: 0, files: [], incomplete: false, estimated: false } }], messages: [], providers: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} } as unknown as PilotState
  const controller = { getSnapshot: () => state, open: vi.fn(), create: vi.fn(async () => undefined), archiveSession: vi.fn(async () => undefined) } as unknown as PilotController
  const store = new SidebarPreferenceStore(async () => ({ view: 'project', expandedProjectIds: ['p'] }), async () => undefined)
  await store.load()
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  const files = vi.fn()
  await act(async () => root!.render(<SessionSidebar state={state} controller={controller} preferenceStore={store} width={280} onClose={() => undefined} onSearch={() => undefined} onOpenProjectFiles={files} onOpenSessionFiles={files} />))
  return { container, controller, files }
}

describe('October 13 desktop bug feedback', () => {
  it('removes duplicate search and footer actions while showing the Mira logo', async () => {
    const { container } = await mount()
    expect(container.querySelector('[aria-label="搜索会话"]')).toBeNull()
    expect(container.querySelector('.mira-session-footer img')).not.toBeNull()
    expect(container.querySelector('.mira-session-footer button')).toBeNull()
  })

  it('keeps the project label free of tooltips/counts and orders its actions', async () => {
    const { container, files, controller } = await mount()
    const collection = container.querySelector('[data-collection-id="sidebar-project:p"]')!
    expect(collection.querySelector('.mira-collection-count')).toBeNull()
    const label = collection.querySelector<HTMLElement>('.mira-collection-title')!
    await act(async () => label.focus())
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
    expect([...collection.querySelectorAll('.mira-collection-actions button')].map(button => button.getAttribute('aria-label'))).toEqual(['项目 的菜单', '显示 项目 的文件树', '在 项目 新建任务'])
    await act(async () => collection.querySelector<HTMLButtonElement>('[aria-label="显示 项目 的文件树"]')!.click())
    expect(files).toHaveBeenCalledExactlyOnceWith('p')
    await act(async () => collection.querySelector<HTMLButtonElement>('[aria-label="在 项目 新建任务"]')!.click())
    expect(controller.create).toHaveBeenCalledExactlyOnceWith('p')
  })

  it('removes row paths, change counts and extra actions while retaining archive and context menus', async () => {
    const { container } = await mount(), row = container.querySelector('[data-sidebar-session-id="s"]')!
    expect(row.querySelector('.mira-session-row__changes')).toBeNull()
    expect(row.querySelector('.mira-session-row__more')).toBeNull()
    expect(row.querySelector('[aria-label="显示 测试任务 的文件树"]')).toBeNull()
    await act(async () => row.querySelector<HTMLButtonElement>('.mira-session-row__open')!.focus())
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
    const archive = row.querySelector<HTMLButtonElement>('[aria-label="归档 测试任务"]')!
    await act(async () => archive.focus())
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe('归档任务')
    expect(container.querySelector('.mira-sidebar-tooltip')?.getAttribute('data-side')).toBe('top')
    await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })))
    expect([...container.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toContain('重命名')
  })

  it('clamps narrow persisted and dragged sidebar widths to 280px', () => {
    expect(miraSidebarWidth(220)).toBe(280)
    expect(miraPanePreferences({ sessions: 220 }).sessions).toBe(280)
    expect(miraPanePreferences(undefined).sessions).toBeGreaterThanOrEqual(280)
  })
})
