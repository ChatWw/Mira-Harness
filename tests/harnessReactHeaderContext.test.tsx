import * as React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessWorkspaceContext, type HarnessWorkspaceContextProps } from '../apps/harness-react/src/components/workbench/HarnessWorkspaceContext'
import type { HarnessProject } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))
beforeEach(() => { hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })
const project = (id = 'p'): HarnessProject => ({ id, name: `Mira ${id}`, icon: '', directory: `/project/${id}`, directoryExists: true, isGitRepository: true, gitBranch: `mira/${id}`, createdAt: 1, updatedAt: 1, sessionCount: 1 })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
function mount() {
  const controller = { listGitBranches: vi.fn(async (_id: string) => [{ name: 'mira/current', current: true, uncommittedFileCount: 2 }]), checkoutGitBranch: vi.fn(), createGitBranch: vi.fn() }
  const props: HarnessWorkspaceContextProps = { controller: controller as never, project: project(), sessionId: 'task', directory: '/project/p', onAction: vi.fn() }
  let tree: React.ReactNode
  const find = (node: React.ReactNode, match: (props: Record<string, unknown>, type: unknown) => boolean): Record<string, unknown> | undefined => Array.isArray(node) ? node.map(child => find(child, match)).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props, node.type) ? node.props : find(node.props.children as React.ReactNode, match) : undefined
  const text = (node: React.ReactNode): string => Array.isArray(node) ? node.map(text).join(' ') : React.isValidElement<Record<string, unknown>>(node) ? text(node.props.children as React.ReactNode) : typeof node === 'string' ? node : ''
  const render = () => { hooks.cursor = 0; tree = HarnessWorkspaceContext(props); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let index = 0; index < 12; index++) { await Promise.resolve(); render() } }
  render()
  return { controller, props, render, drain, text: () => text(tree), node: (match: (props: Record<string, unknown>, type: unknown) => boolean) => find(tree, match)!, open: () => (find(tree, (_, type) => type === DropdownMenu.Root)!.onOpenChange as (open: boolean) => void)(true), hover: () => (find(tree, (_, type) => type === Tooltip.Root)!.onOpenChange as (open: boolean) => void)(true), unmount: () => hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) }
}

describe('Header project context shows real read-only Git information', () => {
  it('shows known project branch and queries lazily only once while menu and hover load together', async () => {
    const view = mount()
    expect(view.text()).toContain('mira/p'); expect(view.controller.listGitBranches).not.toHaveBeenCalled()
    const loading = deferred<unknown>(); view.controller.listGitBranches.mockReturnValueOnce(loading.promise as never)
    view.open(); view.hover(); await view.drain()
    expect(view.controller.listGitBranches).toHaveBeenCalledExactlyOnceWith('p')
    expect(view.node(p => p['aria-label'] === '正在读取 Git 分支')).toBeDefined()
    loading.resolve([{ name: 'mira/live', current: true, uncommittedFileCount: 3 }]); await view.drain()
    expect(view.text()).toContain('mira/live'); expect(view.text()).toContain('3 个未提交文件')
    expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled(); expect(view.controller.createGitBranch).not.toHaveBeenCalled()
  })
  it('does not query or invent a branch for a personal working directory or a non-Git project', async () => {
    const view = mount(); view.props.project = undefined; view.props.directory = '/personal/git-looking-path'; view.render()
    view.open(); view.hover(); await view.drain()
    expect(view.text()).toContain('个人工作区'); expect(view.text()).not.toContain('当前分支'); expect(view.text()).not.toContain('mira/p')
    view.props.project = { ...project(), isGitRepository: false }; view.render(); view.open(); await view.drain()
    expect(view.text()).not.toContain('mira/p'); expect(view.controller.listGitBranches).not.toHaveBeenCalled()
  })
  it('displays query errors and retries in the menu without closing it or changing the task', async () => {
    const view = mount(); view.controller.listGitBranches.mockRejectedValueOnce(new Error('Git 暂时不可用'))
    view.open(); await view.drain()
    expect(view.node(p => p.role === 'alert')).toBeDefined(); expect(view.text()).toContain('Git 暂时不可用')
    const event = { preventDefault: vi.fn() }
    ;(view.node(p => typeof p.onSelect === 'function' && JSON.stringify(p.children).includes('重试读取分支')).onSelect as (event: unknown) => void)(event); await view.drain()
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(view.node(p => p.role === 'alert')).toBeUndefined()
    expect(view.text()).toContain('mira/current'); expect(view.props.sessionId).toBe('task')
  })
  it('drops late responses and errors after changing project identity', async () => {
    const view = mount(), old = deferred<unknown>()
    view.controller.listGitBranches.mockReturnValueOnce(old.promise as never)
    view.open(); await view.drain()
    view.props.project = project('next'); view.props.directory = '/project/next'; view.render(); view.open(); await view.drain()
    old.resolve([{ name: 'stale/old', current: true }]); await view.drain()
    expect(view.text()).toContain('mira/current'); expect(view.text()).not.toContain('stale/old')
    expect(view.controller.listGitBranches.mock.calls.map(([id]) => id)).toEqual(['p', 'next'])
  })
  it('keeps missing directories explicit and distinguishes no local branch from an unattached HEAD', async () => {
    const view = mount(); view.props.project = { ...project(), directoryExists: false }; view.render(); view.open(); await view.drain()
    expect(view.text()).toContain('项目目录不可用'); expect(view.controller.listGitBranches).not.toHaveBeenCalled()
    view.props.project = project(); view.render(); view.controller.listGitBranches.mockResolvedValueOnce([]); view.open(); await view.drain()
    expect(view.text()).toContain('尚无本地分支')
    view.controller.listGitBranches.mockResolvedValueOnce([{ name: 'main', current: false }]); view.open(); await view.drain()
    expect(view.text()).toContain('HEAD 未关联本地分支'); expect(view.text()).not.toContain('工作树干净')
  })
  it('reports a malformed response instead of labeling an unknown branch as clean', async () => {
    const view = mount(); view.controller.listGitBranches.mockResolvedValueOnce({ currentBranch: 'invented' } as never)
    view.open(); await view.drain()
    expect(view.text()).toContain('Git 分支响应无效'); expect(view.text()).not.toContain('工作树干净')
  })
  it('invalidates a pending query when the context component unmounts', async () => {
    const view = mount(), pending = deferred<unknown>()
    view.controller.listGitBranches.mockReturnValueOnce(pending.promise as never)
    view.open(); await view.drain(); view.unmount()
    pending.resolve([{ name: 'late/branch', current: true }]); await Promise.resolve(); await Promise.resolve()
    expect(view.text()).not.toContain('late/branch')
  })
})
