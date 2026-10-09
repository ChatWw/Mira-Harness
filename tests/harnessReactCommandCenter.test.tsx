import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessCommandCenter, type HarnessCommandCenterProps, type HarnessSearchCommand } from '../apps/harness-react/src/components/search/HarnessCommandCenter'
import { harnessSearchHighlight, matchesHarnessCommand, parseHarnessSearch, setHarnessSearchScope } from '../apps/harness-react/src/components/search/command-center-query'
import type { HarnessConversationSearchResult, HarnessWorkspaceFileSearchResult } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail }); return { promise, resolve, reject } }
const conversations: HarnessConversationSearchResult[] = [{ id: 'research', title: '研究记录', messageId: 'answer', snippet: '正文中包含关键事实', projectName: '资料库', updatedAt: 1 }]
const files: HarnessWorkspaceFileSearchResult = { entries: [{ type: 'file', name: 'README.md', path: 'docs/README.md' }, { type: 'directory', name: 'docs', path: 'docs' }], truncated: false }
function mount(options: { conversations?: (query: string) => Promise<HarnessConversationSearchResult[]>; files?: (sessionId: string, query: string) => Promise<HarnessWorkspaceFileSearchResult> } = {}) {
  let session: HarnessCommandCenterProps['session'] = { id: 'current', workingDirectory: '/project', projectId: 'project' }
  let open = true, mounted = true, tree: React.ReactNode
  const action = vi.fn(async () => undefined)
  const commands: HarnessSearchCommand[] = [{ id: 'new', label: '新建对话', keywords: 'new conversation', shortcut: 'Ctrl+N', action }, { id: 'settings', label: '设置', action: vi.fn(async () => undefined) }]
  const controller = { searchConversations: vi.fn(options.conversations || (async () => conversations)), searchFilesFor: vi.fn(options.files || (async () => files)) }
  const onOpenSession = vi.fn(async (_result: HarnessConversationSearchResult) => undefined), onOpenFile = vi.fn(async (_sessionId: string, _path: string) => undefined)
  const onOpenChange = vi.fn((value: boolean) => { open = value; render() })
  const input = { focus: vi.fn() }, list = { querySelector: () => null }
  const visit = (node: React.ReactNode, callback: (element: React.ReactElement<Record<string, unknown>>) => void) => { if (Array.isArray(node)) { node.forEach(child => visit(child, callback)); return }; if (!React.isValidElement<Record<string, unknown>>(node)) return; callback(node); visit(node.props.children as React.ReactNode, callback) }
  const props = (match: (props: Record<string, unknown>) => boolean) => { let found: Record<string, unknown> | undefined; visit(tree, element => { if (!found && match(element.props)) found = element.props }); return found }
  const render = () => {
    hooks.cursor = 0; hooks.dirty = false
    tree = HarnessCommandCenter({ open, session, commands, controller, onOpenChange, onOpenSession, onOpenFile })
    visit(tree, element => { if (element.type === 'input') (element.props.ref as React.RefObject<unknown>).current = input; if (element.props.role === 'listbox') (element.props.ref as React.RefObject<unknown>).current = list })
    hooks.effects.splice(0).forEach(effect => effect())
  }
  const drain = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); if (hooks.dirty && mounted) render() } }
  const type = async (value: string) => { (props(p => p.role === 'combobox')!.onChange as (event: unknown) => void)({ target: { value } }); await drain() }
  const search = async (value: string) => { await type(value); await vi.advanceTimersByTimeAsync(120); await drain() }
  const key = async (value: string, composing = false) => { const event = { key: value, keyCode: 0, nativeEvent: { isComposing: composing }, preventDefault: vi.fn(), stopPropagation: vi.fn() }; (props(p => p.role === 'combobox')!.onKeyDown as (event: unknown) => void)(event); await drain(); return event }
  const click = async (title: string) => { (props(p => p.role === 'option' && p.title === title)!.onClick as () => void)(); await drain() }
  render()
  return { controller, onOpenSession, onOpenFile, onOpenChange, action, props, type, search, key, click, drain, setSession: async (next: typeof session) => { session = next; render(); await drain() }, setOpen: async (value: boolean) => { open = value; render(); await drain() }, unmount: () => { mounted = false; hooks.slots.forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined }) } }
}

beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.useFakeTimers(); vi.stubGlobal('React', React); vi.stubGlobal('window', { setTimeout, clearTimeout }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Harness command query and literal highlights', () => {
  it('normalizes blank input and recognizes only leading scope prefixes', () => {
    expect(parseHarnessSearch('   ')).toEqual({ query: '', scope: 'all' })
    expect(parseHarnessSearch('  # 正文  ')).toEqual({ query: '正文', scope: 'conversations' })
    expect(parseHarnessSearch('>')).toEqual({ query: '', scope: 'commands' })
    expect(parseHarnessSearch('README @tools')).toEqual({ query: 'README @tools', scope: 'all' })
    expect(setHarnessSearchScope('# 关键事实', 'files')).toBe('@ 关键事实')
    expect(setHarnessSearchScope('@ 资料', 'all')).toBe('资料')
  })
  it('matches all command terms and does not interpret search text as a regular expression or HTML', () => {
    expect(matchesHarnessCommand({ label: '新建对话', keywords: 'new conversation' }, 'new conversation')).toBe(true)
    expect(matchesHarnessCommand({ label: '新建对话', keywords: 'new' }, 'new absent')).toBe(false)
    const text = '<script>[a+b]</script>'
    const segments = harnessSearchHighlight(text, '[a+b]')
    expect(segments.filter(segment => segment.match)).toEqual([{ text: '[a+b]', match: true }])
    expect(segments.map(segment => segment.text).join('')).toBe(text)
    expect(harnessSearchHighlight('README ReadMe', 'readme').filter(segment => segment.match)).toHaveLength(2)
  })
})

describe('shipped Harness command-center callbacks and request guards', () => {
  it('shows commands immediately, wraps arrow keys, and executes only the selected action', async () => {
    const view = mount(); await view.drain()
    expect(view.controller.searchConversations).not.toHaveBeenCalled(); expect(view.controller.searchFilesFor).not.toHaveBeenCalled()
    await view.key('ArrowUp'); expect(view.props(p => p.role === 'option' && p['aria-selected'] === true)?.title).toBe('设置')
    await view.key('ArrowDown'); await view.key('Enter')
    expect(view.action).toHaveBeenCalledOnce(); expect(view.onOpenChange).toHaveBeenCalledWith(false)
  })
  it('uses real full-text and project-file callbacks and passes the exact message result to navigation', async () => {
    const view = mount(); await view.drain(); await view.search('  关键事实  ')
    expect(view.controller.searchConversations).toHaveBeenCalledExactlyOnceWith('关键事实')
    expect(view.controller.searchFilesFor).toHaveBeenCalledExactlyOnceWith('current', '关键事实')
    expect(view.props(p => p.role === 'option' && p.title === 'docs')).toBeUndefined()
    await view.click('正文中包含关键事实')
    expect(view.onOpenSession).toHaveBeenCalledExactlyOnceWith(conversations[0]); expect(view.onOpenFile).not.toHaveBeenCalled()
  })
  it('narrows the backend calls to the selected prefix and keeps blank input local', async () => {
    const view = mount(); await view.drain(); await view.search('> new')
    expect(view.controller.searchConversations).not.toHaveBeenCalled(); expect(view.controller.searchFilesFor).not.toHaveBeenCalled()
    await view.search('# 正文'); expect(view.controller.searchConversations).toHaveBeenCalledExactlyOnceWith('正文'); expect(view.controller.searchFilesFor).not.toHaveBeenCalled()
    await view.search('@ README'); expect(view.controller.searchFilesFor).toHaveBeenCalledExactlyOnceWith('current', 'README')
    await view.type('  # '); expect(view.props(p => p.children === '尚未输入关键词')).toBeDefined()
  })
  it('preserves query text while switching scope controls and restores focus to search', async () => {
    const view = mount(); await view.drain(); await view.type('# 正文')
    const group = view.props(p => p.role === 'group' && p['aria-label'] === '搜索范围')!
    const button = (group.children as React.ReactElement<Record<string, unknown>>[]).find(child => child.props['aria-pressed'] === false && JSON.stringify(child.props.children).includes('文件'))!
    ;(button.props.onClick as () => void)(); await view.drain()
    expect(view.props(p => p.role === 'combobox')!.value).toBe('@ 正文')
  })
  it('opens a file only in the searched session and excludes directories from file results', async () => {
    const view = mount(); await view.drain(); await view.search('@ README'); await view.click('docs/README.md')
    expect(view.onOpenFile).toHaveBeenCalledExactlyOnceWith('current', 'docs/README.md')
    expect(view.onOpenSession).not.toHaveBeenCalled()
  })
  it('rejects old query results and old option callbacks after the current workspace changes', async () => {
    const old = deferred<HarnessWorkspaceFileSearchResult>(), next = deferred<HarnessWorkspaceFileSearchResult>()
    const view = mount({ files: (_id, query) => query === 'old' ? old.promise : next.promise }); await view.drain(); await view.search('@ old'); await view.search('@ next')
    next.resolve(files); await view.drain(); const stale = view.props(p => p.role === 'option' && p.title === 'docs/README.md')!.onClick as () => void
    old.resolve({ entries: [{ name: 'old.md', path: 'old.md', type: 'file' }], truncated: false }); await view.drain()
    expect(view.props(p => p.title === 'old.md')).toBeUndefined()
    await view.setSession({ id: 'second', workingDirectory: '/other' }); stale(); await view.drain()
    expect(view.onOpenFile).not.toHaveBeenCalled(); expect(view.props(p => p.title === 'docs/README.md')).toBeUndefined()
  })
  it('does not scan files without a valid current workspace and still searches conversations', async () => {
    const view = mount(); await view.drain(); await view.setSession(undefined); await view.search('正文')
    expect(view.controller.searchFilesFor).not.toHaveBeenCalled(); expect(view.controller.searchConversations).toHaveBeenCalledOnce()
    expect(view.props(p => p.children === '当前会话未关联工作目录')).toBeDefined()
  })
  it('keeps independent search failures visible and retries the current query', async () => {
    const view = mount({ conversations: vi.fn().mockRejectedValueOnce(new Error('正文索引读取失败')).mockResolvedValue(conversations) }); await view.drain(); await view.search('正文')
    expect(view.props(p => p.role === 'alert')).toBeDefined(); expect(view.props(p => p.title === 'docs/README.md')).toBeDefined()
    ;(view.props(p => typeof p.onClick === 'function' && JSON.stringify(p.children).includes('重试'))!.onClick as () => void)(); await view.drain(); await vi.advanceTimersByTimeAsync(120); await view.drain()
    expect(view.controller.searchConversations).toHaveBeenNthCalledWith(2, '正文'); expect(view.props(p => p.role === 'alert')).toBeUndefined()
  })
  it('does not duplicate result actions, keeps navigation errors visible, and allows retry', async () => {
    const view = mount(); await view.drain(); await view.search('@ README')
    const pending = deferred<void>(); view.onOpenFile.mockReturnValueOnce(pending.promise)
    const click = view.props(p => p.title === 'docs/README.md')!.onClick as () => void
    click(); click(); await view.drain(); expect(view.onOpenFile).toHaveBeenCalledOnce(); expect(view.onOpenChange).not.toHaveBeenCalled()
    pending.reject(new Error('预览读取失败')); await view.drain(); expect(view.props(p => p.role === 'alert')).toBeDefined()
    await view.click('docs/README.md'); expect(view.onOpenFile).toHaveBeenCalledTimes(2); expect(view.onOpenChange).toHaveBeenCalledWith(false)
  })
  it('discards late results and operation completion after closing and reopening', async () => {
    const late = deferred<HarnessConversationSearchResult[]>(), navigation = deferred<void>()
    const view = mount({ conversations: () => late.promise }); await view.drain(); await view.search('# 正文'); await view.setOpen(false)
    late.resolve(conversations); await view.drain(); await view.setOpen(true)
    expect(view.props(p => p.role === 'combobox')!.value).toBe(''); expect(view.props(p => p.title === '正文中包含关键事实')).toBeUndefined()
    await view.search('@ README'); view.onOpenFile.mockReturnValueOnce(navigation.promise)
    ;(view.props(p => p.title === 'docs/README.md')!.onClick as () => void)(); await view.drain(); await view.setOpen(false); await view.setOpen(true)
    navigation.resolve(); await view.drain(); expect(view.onOpenChange).not.toHaveBeenCalled()
  })
  it('respects IME composition and lets the mature Dialog own Escape while stopping Composer propagation', async () => {
    const view = mount(); await view.drain(); const composing = await view.key('Enter', true)
    expect(composing.preventDefault).not.toHaveBeenCalled(); expect(view.action).not.toHaveBeenCalled()
    const escaped = await view.key('Escape'); expect(escaped.stopPropagation).toHaveBeenCalledOnce(); expect(escaped.preventDefault).not.toHaveBeenCalled()
    const nativeEscape = { stopPropagation: vi.fn() }; (view.props(p => typeof p.onEscapeKeyDown === 'function')!.onEscapeKeyDown as (event: unknown) => void)(nativeEscape)
    expect(nativeEscape.stopPropagation).toHaveBeenCalledOnce()
  })
  it('does not update state after unmount during a pending search', async () => {
    const pending = deferred<HarnessConversationSearchResult[]>(), view = mount({ conversations: () => pending.promise }); await view.drain(); await view.search('# 正文'); view.unmount(); hooks.dirty = false
    pending.resolve(conversations); await view.drain(); expect(hooks.dirty).toBe(false)
  })
})
