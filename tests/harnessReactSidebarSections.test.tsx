// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionSidebar } from '../apps/harness-react/src/components/session/SessionSidebar'
import { SidebarPreferenceStore } from '../apps/harness-react/src/components/session/sidebar-preferences'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals() })

async function mount(saved: Record<string, unknown> = {}, projectIds = ['p', 'q'], selectedProjectId = 'p') {
  const project = (id: string) => ({ id, name: id.toUpperCase(), directory: `/tmp/${id}`, directoryExists: true, createdAt: 1, updatedAt: 1 })
  const tasks = (prefix: string, count: number, projectId?: string) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}`, title: `${prefix}任务${index}`, projectId, status: 'active' as const, createdAt: index + 1, updatedAt: index + 1 }))
  let state: PilotState = { sessions: [...tasks('p', 12, 'p'), ...tasks('q', 11, 'q'), ...tasks('personal', 3)], projects: projectIds.map(project), messages: [], providers: [], running: false, runningSessionIds: [], unreadSessionIds: [], pendingPermissions: {} }
  const write = vi.fn(async (_value: unknown) => undefined)
  const store = new SidebarPreferenceStore(async () => ({ expandedProjectIds: ['p', 'q'], ...saved }), write)
  await store.load()
  const newTask = vi.fn(), open = vi.fn(), selectProject = vi.fn(async () => project(selectedProjectId))
  const controller = { getSnapshot: () => state, reportError: vi.fn(), open, selectProject, newConversation: vi.fn(), create: vi.fn() } as unknown as PilotController
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container)
  root = createRoot(container)
  const render = async () => { await act(async () => root!.render(<React.StrictMode><SessionSidebar state={state} controller={controller} width={264} onClose={() => undefined} preferenceStore={store} onNewConversation={newTask} onOpenSession={open} /></React.StrictMode>)) }
  await render()
  const section = (id: string) => { const element = document.querySelector<HTMLElement>(`[data-sidebar-section="${id}"]`); if (!element) throw new Error(`Missing section ${id}`); return element }
  const button = (label: string, scope: ParentNode = document) => { const element = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); if (!element) throw new Error(`Missing button ${label}`); return element }
  const click = async (element: HTMLElement) => { await act(async () => element.click()); await store.save() }
  const rows = (scope: ParentNode) => [...scope.querySelectorAll('[data-sidebar-session-id]')].map(row => row.getAttribute('data-sidebar-session-id'))
  const collection = (id: string) => section('projects').querySelector<HTMLElement>(`[data-collection-id="sidebar-project:${id}"]`)!
  const toggleProject = async (id: string) => { await click(collection(id).querySelector<HTMLButtonElement>('.mira-collection-title')!) }
  return { section, button, click, rows, collection, toggleProject, store, write, newTask, open, controller, selectProject, emptyPersonal: async () => { state = { ...state, sessions: state.sessions.filter(session => session.projectId) }; await render() } }
}

describe('sidebar purpose sections through real React DOM', () => {
  it('restores the saved section order without changing expansion, project order or navigation', async () => {
    const view = await mount({ sectionOrder: ['personal', 'projects'], personalSectionOpen: false })
    expect([...document.querySelectorAll('[data-sidebar-section]')].map(node => node.getAttribute('data-sidebar-section'))).toEqual(['personal', 'projects'])
    expect(view.rows(view.section('personal'))).toEqual([])
    expect(view.rows(view.section('projects'))).toHaveLength(10)
    expect(view.button('拖拽排序 个人工作区分区')).toBeDefined()
    expect(view.button('拖拽排序 项目分区')).toBeDefined()
    expect(view.write).not.toHaveBeenCalled()
    expect(view.open).not.toHaveBeenCalled()
  })

  it('shows all tasks in a small custom group and restores them after folding without a pagination button', async () => {
    const group = (id: string, prefix: string, count: number) => ({ id, name: id.toUpperCase(), color: 'blue', collapsed: false, sessionIds: Array.from({ length: count }, (_, index) => `${prefix}${index}`) })
    const view = await mount({ view: 'group', groups: [group('a', 'p', 12), group('b', 'q', 11)] })
    const collection = (id: string) => document.querySelector<HTMLElement>(`[data-collection-id="sidebar-group:${id}"]`)!
    expect(view.rows(collection('a'))).toHaveLength(12)
    expect(view.rows(collection('b'))).toHaveLength(11)
    expect(collection('a').querySelector('.mira-session-more')).toBeNull()
    await view.click(collection('a').querySelector<HTMLButtonElement>('.mira-collection-title')!)
    expect(view.rows(collection('a'))).toEqual([])
    await view.click(collection('a').querySelector<HTMLButtonElement>('.mira-collection-title')!)
    expect(view.rows(collection('a'))).toHaveLength(12)
    expect(view.rows(collection('b'))).toHaveLength(11)
    expect(view.open).not.toHaveBeenCalled()
  })

  it('includes all ungrouped tasks without the old twelve-task cutoff', async () => {
    const view = await mount({ view: 'group' })
    expect(view.rows(document.querySelector('[data-sidebar-root]')!)).toHaveLength(26)
    expect(document.querySelector('[data-sidebar-root] .mira-session-more')).toBeNull()
    expect(view.write).not.toHaveBeenCalled()
    expect(view.open).not.toHaveBeenCalled()
  })

  it('includes the parent project section in bulk collapse/expand and saves each action once', async () => {
    const view = await mount()
    await view.click(view.button('全部折叠'))
    expect(view.rows(view.section('projects'))).toEqual([])
    expect(view.store.getSnapshot().preferences).toMatchObject({ projectSectionOpen: false, personalSectionOpen: true, expandedProjectIds: [] })
    expect(view.rows(view.section('personal'))).toHaveLength(3)
    expect(view.write).toHaveBeenCalledTimes(1)
    await view.click(view.button('全部展开'))
    expect(view.rows(view.section('projects'))).toHaveLength(10)
    expect(view.store.getSnapshot().preferences).toMatchObject({ projectSectionOpen: true, personalSectionOpen: true, expandedProjectIds: ['p', 'q'] })
    expect(view.write).toHaveBeenCalledTimes(2)
    await view.click(view.button('项目', view.section('projects')))
    expect(view.button('全部展开')).toBeDefined()
    await view.click(view.button('全部展开'))
    expect(view.rows(view.section('projects'))).toHaveLength(10)
  })
  it('folds the project and personal sections independently without navigating or changing child expansion', async () => {
    const view = await mount()
    expect(view.rows(view.section('projects'))).toHaveLength(10)
    expect(view.rows(view.section('personal'))).toHaveLength(3)
    await view.click(view.button('项目', view.section('projects')))
    expect(view.rows(view.section('projects'))).toEqual([])
    expect(view.rows(view.section('personal'))).toHaveLength(3)
    await view.click(view.button('个人工作区', view.section('personal')))
    expect(view.rows(view.section('personal'))).toEqual([])
    expect(view.store.getSnapshot().preferences).toMatchObject({ projectSectionOpen: false, personalSectionOpen: false, expandedProjectIds: ['p', 'q'] })
    await view.click(view.button('项目', view.section('projects')))
    expect(view.rows(view.section('projects'))).toHaveLength(10)
    expect(view.open).not.toHaveBeenCalled()
    const restored = new SidebarPreferenceStore(async () => view.write.mock.calls.at(-1)?.[0], async () => undefined)
    await restored.load()
    expect(restored.getSnapshot().preferences).toMatchObject({ projectSectionOpen: true, personalSectionOpen: false })
  })

  it('keeps the personal new-task entry available when empty or folded and uses the existing draft callback', async () => {
    const view = await mount({ personalSectionOpen: false })
    await view.emptyPersonal()
    expect(view.button('个人工作区', view.section('personal')).getAttribute('aria-expanded')).toBe('false')
    await view.click(view.button('在个人工作区新建任务', view.section('personal')))
    expect(view.newTask).toHaveBeenCalledOnce()
    expect(view.controller.create).not.toHaveBeenCalled()
    expect(view.open).not.toHaveBeenCalled()
  })

  it('shows five more project tasks per click without expanding another project', async () => {
    const view = await mount()
    const more = () => view.button('显示 P 的更多任务', view.collection('p'))
    expect(view.rows(view.collection('p'))).toHaveLength(5)
    await view.click(more()); expect(view.rows(view.collection('p'))).toHaveLength(10)
    expect(view.rows(view.collection('q'))).toHaveLength(5)
    await view.click(more()); expect(view.rows(view.collection('p'))).toHaveLength(12)
    expect(view.collection('p').querySelector('[aria-label="显示 P 的更多任务"]')).toBeNull()
    expect(view.open).not.toHaveBeenCalled(); expect(view.write).not.toHaveBeenCalled()
  })

  it('resets project pagination when its collection or parent section is folded', async () => {
    const view = await mount()
    await view.click(view.button('显示 P 的更多任务', view.collection('p')))
    await view.toggleProject('p'); await view.toggleProject('p')
    expect(view.rows(view.collection('p'))).toHaveLength(5)
    await view.click(view.button('显示 P 的更多任务', view.collection('p')))
    await view.click(view.button('项目', view.section('projects')))
    await view.click(view.button('项目', view.section('projects')))
    expect(view.rows(view.collection('p'))).toHaveLength(5)
  })

  it('reveals a selected project when adding from the folded section', async () => {
    const view = await mount({ projectSectionOpen: false })
    await view.click(view.button('添加项目', view.section('projects')))
    expect(view.selectProject).toHaveBeenCalledOnce()
    expect(view.button('项目', view.section('projects')).getAttribute('aria-expanded')).toBe('true')
    expect(view.rows(view.collection('p'))).toHaveLength(5)
    expect(view.open).not.toHaveBeenCalled()
  })

  it.each([false, true])('reveals a reselected seventh project without changing order or creating a task (hidden: %s)', async hidden => {
    const projectIds = ['p', 'q', 'r', 's', 't', 'u', 'v']
    const view = await mount({ hiddenProjectIds: hidden ? ['v'] : [] }, projectIds, 'v')
    expect(view.section('projects').querySelectorAll('[data-collection-id]')).toHaveLength(6)
    expect(view.collection('v')).toBeNull()
    await view.click(view.button('项目', view.section('projects')))
    await view.click(view.button('添加项目', view.section('projects')))
    expect(view.selectProject).toHaveBeenCalledOnce()
    expect(view.collection('v')).not.toBeNull()
    expect(view.collection('v').querySelector('.mira-collection-title')?.getAttribute('aria-expanded')).toBe('true')
    expect([...view.section('projects').querySelectorAll('[data-collection-id]')].map(element => element.getAttribute('data-collection-id'))).toEqual(projectIds.map(id => `sidebar-project:${id}`))
    expect(view.store.getSnapshot().preferences).toMatchObject({ projectSectionOpen: true, hiddenProjectIds: [], expandedProjectIds: ['p', 'q', 'v'] })
    expect(view.controller.create).not.toHaveBeenCalled()
    expect(view.newTask).not.toHaveBeenCalled()
    expect(view.open).not.toHaveBeenCalled()
  })

  it('temporarily reveals filtered results without overwriting the saved folded state', async () => {
    const view = await mount({ projectSectionOpen: false, personalSectionOpen: false })
    await view.click(view.button('搜索会话'))
    const input = document.querySelector<HTMLInputElement>('[aria-label="搜索任务或项目"]')!
    const type = async (value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) }) }
    await type('p任务')
    expect(view.rows(view.section('projects'))).toHaveLength(12)
    expect(view.store.getSnapshot().preferences).toMatchObject({ projectSectionOpen: false, personalSectionOpen: false })
    await type('')
    expect(view.rows(view.section('projects'))).toEqual([])
    expect(view.write).not.toHaveBeenCalled()
  })
})
