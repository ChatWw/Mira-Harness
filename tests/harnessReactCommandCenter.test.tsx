import * as React from 'react'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HarnessCommandCenter, type HarnessCommandCenterProps, type HarnessSearchCommand } from '../apps/harness-react/src/components/search/HarnessCommandCenter'
import { harnessSearchHighlight, matchesHarnessCommand, parseHarnessSearch, setHarnessSearchScope } from '../apps/harness-react/src/components/search/command-center-query'
import { appendHarnessSearchHistory, HarnessSearchHistoryStore, harnessSearchHistoryPreferenceKey, normalizeHarnessSearchHistory, type HarnessSearchHistoryEntry } from '../apps/harness-react/src/components/search/command-center-history'
import type { HarnessConversationSearchResult, HarnessWorkspaceFileSearchResult } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (value: unknown) => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true } }]
  },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useMemo: (callback: () => unknown, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = callback(); slot.deps = deps }
    return slot.value
  },
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.value !== subscribe) { slot.cleanup?.(); slot.value = subscribe; slot.cleanup = subscribe(() => { hooks.dirty = true }) }
    return getSnapshot()
  },
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  },
}))

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail }); return { promise, resolve, reject } }
const conversations: HarnessConversationSearchResult[] = [{ id: 'research', title: '研究记录', messageId: 'answer', snippet: '正文中包含关键事实', projectName: '资料库', updatedAt: 1 }]
const files: HarnessWorkspaceFileSearchResult = { entries: [{ type: 'file', name: 'README.md', path: 'docs/README.md' }, { type: 'directory', name: 'docs', path: 'docs' }], truncated: false }
function mount(options: { conversations?: (query: string) => Promise<HarnessConversationSearchResult[]>; files?: (sessionId: string, query: string) => Promise<HarnessWorkspaceFileSearchResult>; readHistory?: (key: string) => Promise<unknown>; writeHistory?: (key: string, value: unknown) => Promise<void> } = {}) {
  let session: HarnessCommandCenterProps['session'] = { id: 'current', workingDirectory: '/project', projectId: 'project' }
  let open = true, mounted = true, tree: React.ReactNode
  const action = vi.fn(async (): Promise<void | boolean> => undefined)
  const commands: HarnessSearchCommand[] = [{ id: 'new', label: '新建对话', keywords: 'new conversation', shortcut: 'Ctrl+N', action }, { id: 'settings', label: '设置', action: vi.fn(async () => undefined) }]
  const controller = { searchConversations: vi.fn(options.conversations || (async () => conversations)), searchFilesFor: vi.fn(options.files || (async () => files)), getPreference: vi.fn(options.readHistory || (async () => [])), setPreference: vi.fn(options.writeHistory || (async () => undefined)) }
  const onOpenSession = vi.fn(async (_result: HarnessConversationSearchResult): Promise<void | boolean> => undefined), onOpenFile = vi.fn(async (_sessionId: string, _path: string): Promise<void | boolean> => undefined)
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

beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.useFakeTimers(); vi.stubGlobal('React', React); vi.stubGlobal('window', { setTimeout, clearTimeout }); vi.stubGlobal('crypto', { subtle: { digest: async (_algorithm: string, input: Uint8Array) => new Uint8Array(createHash('sha256').update(input).digest()).buffer } }) })
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

describe('Harness workspace-scoped search-history persistence', () => {
  const entry = (query: string, scope: 'commands' | 'files' | 'conversations' = 'files', updatedAt = 1) => ({ query, scope, updatedAt })
  it('keeps at most twenty valid, trimmed, case-insensitively unique searches', () => {
    expect(normalizeHarnessSearchHistory([entry('  README  '), entry('readme', 'commands'), entry(''), entry('>'), entry('@'), entry('#'), { query: 'bad scope', scope: 'other', updatedAt: 1 }, entry('bad date', 'files', NaN)])).toEqual([entry('README')])
    const history = Array.from({ length: 25 }, (_, index) => entry(`query-${index}`))
    expect(normalizeHarnessSearchHistory(history)).toHaveLength(20)
    expect(appendHarnessSearchHistory(history, entry('QUERY-10', 'commands', 2)).slice(0, 2)).toEqual([entry('QUERY-10', 'commands', 2), entry('query-0')])
  })
  it('uses distinct allowed preference keys for unicode roots and unscoped drafts', async () => {
    const roots = ['directory:/工程/项目', 'directory:/工程/另一个', 'unscoped']
    const keys = await Promise.all(roots.map(harnessSearchHistoryPreferenceKey))
    expect(new Set(keys).size).toBe(3)
    keys.forEach(key => { expect(key).toMatch(/^[\w.-]+$/); expect(key.length).toBeLessThanOrEqual(128) })
    expect(await harnessSearchHistoryPreferenceKey(roots[0]!)).toBe(keys[0])
  })
  it('merges a successful search into a late read and never writes defaults before hydration', async () => {
    const reading = deferred<unknown>(), getPreference = vi.fn(() => reading.promise), setPreference = vi.fn(async () => undefined)
    const store = new HarnessSearchHistoryStore({ getPreference, setPreference }, 'directory:/project')
    store.remember('latest', 'commands')
    expect(setPreference).not.toHaveBeenCalled()
    reading.resolve([entry('older')]); await store.load(); await store.save()
    expect(store.getSnapshot().entries.map(item => item.query)).toEqual(['latest', 'older'])
    expect(setPreference).toHaveBeenLastCalledWith(await harnessSearchHistoryPreferenceKey('directory:/project'), store.getSnapshot().entries, true)
  })
  it('does not resurrect stored history when clearing during a late read', async () => {
    const reading = deferred<unknown>(), host = { getPreference: vi.fn(() => reading.promise), setPreference: vi.fn(async () => undefined) }
    const store = new HarnessSearchHistoryStore(host, 'directory:/project')
    const loaded = store.load(); store.clear(); reading.resolve([entry('older')]); await loaded; await store.save()
    expect(store.getSnapshot().entries).toEqual([]); expect(host.setPreference).toHaveBeenLastCalledWith(expect.any(String), [], true)
  })
  it('retains pending searches on read failure and retries without overwriting stored entries', async () => {
    const host = { getPreference: vi.fn().mockRejectedValueOnce(new Error('read')).mockResolvedValue([entry('older')]), setPreference: vi.fn(async () => undefined) }
    const store = new HarnessSearchHistoryStore(host, 'directory:/project')
    await expect(store.load()).rejects.toThrow('搜索历史读取失败'); store.remember('latest', 'conversations'); await store.retry()
    expect(store.getSnapshot()).toMatchObject({ ready: true, error: '' }); expect(store.getSnapshot().entries.map(item => item.query)).toEqual(['latest', 'older'])
    expect(host.setPreference).toHaveBeenCalledTimes(1)
  })
  it('serializes writes, retains newer changes and retries failed storage', async () => {
    const first = deferred<void>(), host = { getPreference: vi.fn(async () => []), setPreference: vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('write')).mockResolvedValue(undefined) }
    const store = new HarnessSearchHistoryStore(host, 'directory:/project'); await store.load()
    store.remember('first', 'files'); await Promise.resolve(); store.remember('second', 'commands')
    expect(host.setPreference).toHaveBeenCalledTimes(1)
    first.resolve(); await expect(store.save()).rejects.toThrow('搜索历史保存失败')
    expect(store.getSnapshot().entries.map(item => item.query)).toEqual(['second', 'first']); await store.retry()
    expect(store.getSnapshot().error).toBe(''); expect(host.setPreference).toHaveBeenLastCalledWith(expect.any(String), store.getSnapshot().entries, true)
  })
  it('can finish successful persistence after its UI subscriber unmounts', async () => {
    const reading = deferred<unknown>(), host = { getPreference: vi.fn(() => reading.promise), setPreference: vi.fn(async () => undefined) }
    const store = new HarnessSearchHistoryStore(host, 'directory:/project'), listener = vi.fn(), unsubscribe = store.subscribe(listener)
    const loaded = store.load(); unsubscribe(); store.remember('latest', 'files'); reading.resolve([entry('older')]); await loaded; await store.save()
    expect(listener).not.toHaveBeenCalled(); expect(host.setPreference).toHaveBeenCalledOnce()
  })
})

describe('shipped Harness command-center callbacks and request guards', () => {
  it('keeps an explicitly cancelled action open without recording it', async () => {
    const view = mount(); await view.drain(); await view.search('new'); view.action.mockResolvedValueOnce(false); await view.key('Enter')
    expect(view.onOpenChange).not.toHaveBeenCalled(); expect(view.controller.setPreference).not.toHaveBeenCalled()
    expect(view.props(p => p.role === 'combobox')?.value).toBe('new')
    await view.key('Enter'); expect(view.onOpenChange).toHaveBeenCalledWith(false)
    await view.setOpen(true); expect(view.props(p => p['aria-label'] === '搜索历史：> new')).toBeDefined()
  })
  it('records only successful selected results with their real scope and recalls the query without executing', async () => {
    const view = mount(); await view.drain(); await view.search('new'); await view.key('Enter'); await view.setOpen(true)
    const chip = view.props(p => p['aria-label'] === '搜索历史：> new')!
    expect(chip).toBeDefined(); (chip.onClick as () => void)(); await view.drain()
    expect(view.props(p => p.role === 'combobox')?.value).toBe('> new'); expect(view.action).toHaveBeenCalledOnce()
    await view.type(''); const pending = deferred<void>(); await view.search('@ README'); view.onOpenFile.mockReturnValueOnce(pending.promise)
    ;(view.props(p => p.title === 'docs/README.md')!.onClick as () => void)(); await view.drain()
    pending.reject(new Error('open failed')); await view.drain(); await view.type('')
    expect(view.props(p => p['aria-label'] === '搜索历史：@ README')).toBeUndefined()
  })
  it('restores history per root, clears only the current root and expands more than six chips', async () => {
    const rootA = await harnessSearchHistoryPreferenceKey('directory:/project'), rootB = await harnessSearchHistoryPreferenceKey('directory:/other')
    const saved = new Map<string, HarnessSearchHistoryEntry[]>([[rootA, Array.from({ length: 8 }, (_, index) => ({ query: `query-${index}`, scope: 'files', updatedAt: index }))], [rootB, [{ query: 'other', scope: 'commands', updatedAt: 1 }]]])
    const view = mount({ readHistory: async key => saved.get(key), writeHistory: async (key, value) => { saved.set(key, value as HarnessSearchHistoryEntry[]) } }); await view.drain()
    expect(view.props(p => p['aria-label'] === '搜索历史：@ query-6')).toBeUndefined()
    ;(view.props(p => p['aria-label'] === '展开搜索历史')!.onClick as () => void)(); await view.drain()
    expect(view.props(p => p['aria-label'] === '搜索历史：@ query-7')).toBeDefined()
    await view.setSession({ id: 'second', workingDirectory: '/other' }); await view.drain()
    expect(view.props(p => p['aria-label'] === '搜索历史：> other')).toBeDefined(); expect(view.props(p => p['aria-label'] === '搜索历史：@ query-0')).toBeUndefined()
    ;(view.props(p => p['aria-label'] === '清空搜索历史')!.onClick as () => void)(); await view.drain()
    expect(saved.get(rootB)).toEqual([]); expect(saved.get(rootA)).toHaveLength(8)
    await view.setSession({ id: 'current', workingDirectory: '/project' }); expect(view.props(p => p['aria-label'] === '搜索历史：@ query-0')).toBeDefined()
  })
  it('ignores late history hydration from the previous root without losing it on return', async () => {
    const first = deferred<unknown>(), second = deferred<unknown>(), rootA = await harnessSearchHistoryPreferenceKey('directory:/project')
    const view = mount({ readHistory: key => key === rootA ? first.promise : second.promise }); await view.drain(); await view.setSession({ id: 'second', workingDirectory: '/other' })
    second.resolve([{ query: 'second', scope: 'commands', updatedAt: 1 }]); await view.drain()
    first.resolve([{ query: 'first', scope: 'files', updatedAt: 1 }]); await view.drain()
    expect(view.props(p => p['aria-label'] === '搜索历史：> second')).toBeDefined(); expect(view.props(p => p['aria-label'] === '搜索历史：@ first')).toBeUndefined()
    await view.setSession({ id: 'current', workingDirectory: '/project' }); expect(view.props(p => p['aria-label'] === '搜索历史：@ first')).toBeDefined()
  })
  it('records a late successful action in its original root after the dialog was closed and reopened elsewhere', async () => {
    const action = deferred<void>(), view = mount(); await view.drain(); await view.search('README'); view.onOpenFile.mockReturnValueOnce(action.promise)
    ;(view.props(p => p.title === 'docs/README.md')!.onClick as () => void)(); await view.drain()
    await view.setOpen(false); await view.setSession({ id: 'second', workingDirectory: '/other' }); await view.setOpen(true)
    action.resolve(); await view.drain()
    expect(view.props(p => p['aria-label'] === '搜索历史：@ README')).toBeUndefined(); expect(view.onOpenChange).not.toHaveBeenCalled()
    expect(view.controller.setPreference).toHaveBeenLastCalledWith(await harnessSearchHistoryPreferenceKey('directory:/project'), [expect.objectContaining({ query: 'README', scope: 'files' })], true)
    await view.setSession({ id: 'current', workingDirectory: '/project' }); expect(view.props(p => p['aria-label'] === '搜索历史：@ README')).toBeDefined()
  })
  it('shows commands immediately, wraps arrow keys, and executes only the selected action', async () => {
    const view = mount(); await view.drain()
    expect(view.controller.searchConversations).not.toHaveBeenCalled(); expect(view.controller.searchFilesFor).not.toHaveBeenCalled()
    await view.key('ArrowUp'); expect(view.props(p => p.role === 'option' && p['aria-selected'] === true)?.title).toBe('设置')
    await view.key('ArrowDown'); await view.key('Enter')
    expect(view.action).toHaveBeenCalledOnce(); expect(view.onOpenChange).toHaveBeenCalledWith(false)
    expect(view.controller.setPreference).not.toHaveBeenCalled()
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
