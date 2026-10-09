import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraBranchPicker, type MiraBranchPickerProps } from '../apps/harness-react/src/components/git/MiraBranchPicker'
import type { HarnessGitContext, HarnessProject } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => { const slot = hooks.slots[hooks.cursor++] ??= {}; if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return; slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) },
}))
const project = (id = 'p'): HarnessProject => ({ id, name: `Mira ${id}`, icon: '', directory: `/project/${id}`, directoryExists: true, isGitRepository: true, gitBranch: 'main', createdAt: 1, updatedAt: 1, sessionCount: 1 })
const context = (id = 'p', branchName = 'main'): HarnessGitContext => ({ projectId: id, directory: `/project/${id}`, isRepository: true, headType: 'branch', branchName, uncommittedFileCount: 2, branches: [{ name: 'main', current: branchName === 'main' }, { name: 'mira/topic', current: branchName === 'mira/topic' }], snapshotToken: 'a'.repeat(64), mutationBlocked: false })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React)
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals() })
function mount() {
  const controller = { supportsGitActions: true, getGitContext: vi.fn(async (id: string) => context(id)), checkoutGitBranch: vi.fn(async (id: string, branch: string) => context(id, branch)), createGitBranch: vi.fn(async (id: string, branch: string) => context(id, branch)) }
  const props: MiraBranchPickerProps = { controller: controller as never, project: project(), placement: 'composer' }
  let tree: React.ReactNode
  const find = (node: React.ReactNode, match: (props: Record<string, unknown>, type: unknown) => boolean): Record<string, unknown> | undefined => Array.isArray(node) ? node.map(child => find(child, match)).find(Boolean) : React.isValidElement<Record<string, unknown>>(node) ? match(node.props, node.type) ? node.props : find(node.props.children as React.ReactNode, match) : undefined
  const text = (node: React.ReactNode): string => Array.isArray(node) ? node.map(text).join(' ') : React.isValidElement<Record<string, unknown>>(node) ? text(node.props.children as React.ReactNode) : typeof node === 'string' ? node : ''
  const render = () => { hooks.cursor = 0; tree = MiraBranchPicker(props); hooks.effects.splice(0).forEach(effect => effect()) }
  const drain = async () => { for (let index = 0; index < 10; index++) { await Promise.resolve(); render() } }
  render()
  const node = (match: (props: Record<string, unknown>, type: unknown) => boolean) => { const result = find(tree, match); if (!result) throw new Error('Branch control missing'); return result }
  const open = () => (node((_, type) => type === Popover.Root).onOpenChange as (open: boolean) => void)(true)
  const select = (branch = 'mira/topic') => (node((p, type) => type === Command.Item && p.value === branch).onSelect as () => void)()
  return { controller, props, render, drain, node, open, select, text: () => text(tree), tree: () => tree }
}

describe('Mira Git picker real callbacks', () => {
  it('loads only when opened, deduplicates opens and marks the current branch with the actual dirty count', async () => {
    const view = mount(), pending = deferred<HarnessGitContext>()
    view.controller.getGitContext.mockReturnValueOnce(pending.promise)
    expect(view.controller.getGitContext).not.toHaveBeenCalled()
    view.open(); view.open(); await view.drain()
    expect(view.controller.getGitContext).toHaveBeenCalledExactlyOnceWith('p')
    expect(view.text()).toContain('正在读取本地分支')
    pending.resolve(context()); await view.drain()
    expect(view.node((p, type) => type === Command.Item && p.value === 'main')['data-branch-current']).toBe('true')
    expect(view.text()).toContain('2 个未提交文件')
    expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled()
  })
  it('uses the captured host snapshot for a switch and treats selecting the current branch as a no-op', async () => {
    const view = mount(); view.open(); await view.drain(); view.select('main'); await view.drain()
    expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled()
    view.open(); await view.drain(); view.select(); await view.drain()
    expect(view.controller.checkoutGitBranch).toHaveBeenCalledExactlyOnceWith('p', 'mira/topic', 'a'.repeat(64))
    expect(view.node((_, type) => type === Popover.Root).open).toBe(false)
    expect(view.node(p => p['aria-label'] === '选择 Git 分支').title).toBe('mira/topic')
  })
  it('does not let stale callbacks write after a task starts or the host reports a paused backlog', async () => {
    const view = mount(); view.open(); await view.drain()
    const stale = view.node((p, type) => type === Command.Item && p.value === 'mira/topic').onSelect as () => void
    view.props.blocked = true; view.render(); stale(); await view.drain()
    expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled()
    view.props.blocked = false; view.controller.getGitContext.mockResolvedValueOnce({ ...context(), mutationBlocked: true }); view.open(); await view.drain(); view.select(); await view.drain()
    expect(view.text()).toContain('处理待发送消息')
    expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled()
  })
  it('retains the create draft on failure and requires a new read before trying again', async () => {
    const view = mount(); view.open(); await view.drain()
    ;(view.node(p => typeof p.onClick === 'function' && JSON.stringify(p.children).includes('创建并切换分支')).onClick as () => void)(); view.render()
    ;(view.node(p => p['aria-label'] === '新分支名称').onChange as (event: unknown) => void)({ target: { value: 'mira/新分支' } }); view.render()
    view.controller.createGitBranch.mockRejectedValueOnce(new Error('分支已存在'))
    const submit = () => (view.node(p => typeof p.onSubmit === 'function').onSubmit as (event: unknown) => void)({ preventDefault() {} })
    submit(); await view.drain()
    expect(view.text()).toContain('分支已存在'); expect(view.node(p => p['aria-label'] === '新分支名称').value).toBe('mira/新分支')
    submit(); await view.drain(); expect(view.controller.createGitBranch).toHaveBeenCalledTimes(1)
    ;(view.node(p => p['aria-label'] === '重新读取分支').onClick as () => void)(); await view.drain()
    submit(); await view.drain()
    expect(view.controller.createGitBranch).toHaveBeenLastCalledWith('p', 'mira/新分支', 'a'.repeat(64))
  })
  it('rejects late query data from another project and ignores stale branch callbacks after navigation', async () => {
    const view = mount(); view.open(); await view.drain()
    const stale = view.node((p, type) => type === Command.Item && p.value === 'mira/topic').onSelect as () => void
    const pending = deferred<HarnessGitContext>(); view.controller.getGitContext.mockReturnValueOnce(pending.promise)
    view.open(); await view.drain(); view.props.project = project('next'); view.render(); stale(); view.open(); await view.drain()
    pending.resolve({ ...context(), branchName: 'stale/old' }); await view.drain()
    expect(view.text()).not.toContain('stale/old'); expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled()
  })
  it('does not let late mutations close a new project menu or change its label', async () => {
    const view = mount(); view.open(); await view.drain()
    const pending = deferred<HarnessGitContext>(); view.controller.checkoutGitBranch.mockReturnValueOnce(pending.promise)
    view.select(); await view.drain(); view.props.project = project('next'); view.render(); view.open(); await view.drain()
    pending.resolve(context('p', 'old/completed')); await view.drain()
    expect(view.node((_, type) => type === Popover.Root).open).toBe(true)
    expect(view.text()).not.toContain('old/completed')
  })
  it('distinguishes detached, unborn and non-repository states instead of inventing a branch', async () => {
    const view = mount(); view.controller.getGitContext.mockResolvedValueOnce({ ...context(), headType: 'detached', branchName: undefined, commit: '1234567890', branches: [] }); view.open(); await view.drain()
    expect(view.node(p => p['aria-label'] === '选择 Git 分支').title).toBe('游离 HEAD'); expect(view.text()).toContain('12345678')
    view.controller.getGitContext.mockResolvedValueOnce({ ...context(), headType: 'unborn' }); view.open(); await view.drain(); expect(view.text()).toContain('当前分支尚无提交')
    view.controller.getGitContext.mockResolvedValueOnce({ ...context(), isRepository: false, headType: 'none', branches: [] }); view.open(); await view.drain(); expect(view.text()).toContain('已不再是 Git 仓库')
    expect(view.controller.checkoutGitBranch).not.toHaveBeenCalled()
  })
  it('does not render actions for unsupported hosts, missing directories or personal workspaces', () => {
    const view = mount(); view.controller.supportsGitActions = false; view.render(); expect(view.tree()).toBeNull()
    view.controller.supportsGitActions = true; view.props.project = { ...project(), directoryExists: false }; view.render(); expect(view.tree()).toBeNull()
    view.props.project = undefined; view.render(); expect(view.tree()).toBeNull()
    expect(view.controller.getGitContext).not.toHaveBeenCalled()
  })
  it('ignores a query after the application becomes inactive', async () => {
    const view = mount(), pending = deferred<HarnessGitContext>(); view.controller.getGitContext.mockReturnValueOnce(pending.promise)
    view.open(); await view.drain(); view.props.active = false; view.render()
    pending.resolve(context('p', 'late/inactive')); await view.drain()
    expect(view.text()).not.toContain('late/inactive'); expect(view.node((_, type) => type === Popover.Root).open).toBe(false)
  })
  it('refreshes an externally changed HEAD without leaving a create draft unable to submit', async () => {
    const view = mount(); view.open(); await view.drain()
    ;(view.node(p => typeof p.onClick === 'function' && JSON.stringify(p.children).includes('创建并切换分支')).onClick as () => void)(); view.render()
    ;(view.node(p => p['aria-label'] === '新分支名称').onChange as (event: unknown) => void)({ target: { value: 'mira/kept-draft' } }); view.render()
    const fresh = { ...context('p', 'mira/topic'), snapshotToken: 'b'.repeat(64) }
    view.controller.getGitContext.mockResolvedValueOnce(fresh)
    view.props.project = { ...project(), gitBranch: 'mira/topic' }; view.render(); await view.drain()
    expect(view.node(p => p['aria-label'] === '新分支名称').value).toBe('mira/kept-draft')
    ;(view.node(p => typeof p.onSubmit === 'function').onSubmit as (event: unknown) => void)({ preventDefault() {} }); await view.drain()
    expect(view.controller.createGitBranch).toHaveBeenCalledExactlyOnceWith('p', 'mira/kept-draft', 'b'.repeat(64))
  })
})
