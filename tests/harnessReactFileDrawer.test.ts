import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectFileDrawer } from '../apps/harness-react/src/components/workspace/ProjectFileDrawer'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessWorkspaceFileEntry, HarnessWorkspaceGitSnapshot } from '../src/config/harness'
import { emptyWorkspaceWatch, type WorkspaceWatchDataSource, type WorkspaceWatchSnapshot } from '../apps/harness-react/src/lib/workspace-watch'
import type { WorkspaceEditorInfo } from '../apps/harness-react/src/lib/workspace-editors'

type VirtualizerOptions = {
  count: number
  getScrollElement: () => { scrollTop: number; clientHeight: number } | null
  rangeExtractor: (range: { startIndex: number; endIndex: number; overscan: number; count: number }) => number[]
}

const hooks = vi.hoisted(() => ({
  cursor: 0, dirty: false,
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>,
  effects: [] as Array<() => void>,
}))
const virtualization = vi.hoisted(() => {
  const state = {
    options: undefined as VirtualizerOptions | undefined,
    instance: {
      scrollToIndex: vi.fn((index: number) => {
        const element = state.options?.getScrollElement()
        if (element) element.scrollTop = index * 28
      }),
      getTotalSize: () => (state.options?.count || 0) * 28,
      getVirtualItems: () => {
        const options = state.options!
        if (!options.count) return []
        const element = options.getScrollElement()
        const startIndex = Math.min(options.count - 1, Math.floor((element?.scrollTop || 0) / 28))
        const endIndex = Math.min(options.count - 1, startIndex + Math.ceil((element?.clientHeight || 112) / 28) - 1)
        return options.rangeExtractor({ startIndex, endIndex, overscan: 12, count: options.count })
          .map(index => ({ index, start: index * 28, size: 28, end: (index + 1) * 28, key: index }))
      },
    },
  }
  return state
})

// Run the drawer's hooks and callbacks while leaving its Radix descendants unmounted.
vi.mock('react', async importOriginal => {
  const effect = (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (slot.deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps![index]))) return
    slot.deps = deps
    hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() })
  }
  return {
    ...await importOriginal<typeof import('react')>(),
    useState: (initial: unknown) => {
      const slot = hooks.slots[hooks.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, (value: unknown) => {
        const next = typeof value === 'function' ? value(slot.value) : value
        if (!Object.is(next, slot.value)) { slot.value = next; hooks.dirty = true }
      }]
    },
    useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
      const slot = hooks.slots[hooks.cursor++] ??= {}
      if (!slot.deps || deps.length !== slot.deps.length || deps.some((value, index) => !Object.is(value, slot.deps![index]))) { slot.value = factory(); slot.deps = deps }
      return slot.value
    },
    useSyncExternalStore: (subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown) => {
      const slot = hooks.slots[hooks.cursor++] ??= {}
      if (slot.value !== subscribe) { slot.cleanup?.(); slot.cleanup = subscribe(() => { hooks.dirty = true }); slot.value = subscribe }
      return getSnapshot()
    },
    useEffect: effect,
    useLayoutEffect: effect,
  }
})
vi.mock('@tanstack/react-virtual', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-virtual')>(),
  useVirtualizer: (options: VirtualizerOptions) => { virtualization.options = options; return virtualization.instance },
}))

const TARGET = 'transient.md'
const TARGET_INDEX = 200
const entries: HarnessWorkspaceFileEntry[] = [
  ...Array.from({ length: TARGET_INDEX }, (_, index) => ({ name: `file-${String(index).padStart(3, '0')}.md`, path: `file-${String(index).padStart(3, '0')}.md`, type: 'file' as const })),
  { name: TARGET, path: TARGET, type: 'file' },
]
type ClearMode = 'button' | 'escape' | 'input'
type MountOptions = { directories?: Record<string, HarnessWorkspaceFileEntry[]>; searchEntries?: HarnessWorkspaceFileEntry[]; editors?: WorkspaceEditorInfo[]; projectId?: string; detached?: boolean; supportsSessionGit?: boolean }

function mount(workspaceWatch?: WorkspaceWatchDataSource, fileEntries = entries, git?: { read: (sessionId: string) => Promise<HarnessWorkspaceGitSnapshot>; ignored: (sessionId: string, paths: string[]) => Promise<string[]> }, options: MountOptions = {}) {
  const listFilesFor = vi.fn(async (_sessionId: string, path: string) => ({ entries: options.directories?.[path] ?? (path ? [] : fileEntries) }))
  const searchFilesFor = vi.fn(async () => ({ entries: options.searchEntries ?? [entries[TARGET_INDEX]], truncated: false }))
  const listProjectFiles = vi.fn(async (_projectId: string, path: string) => ({ entries: options.directories?.[path] ?? (path ? [] : fileEntries) }))
  const searchProjectFiles = vi.fn(async () => ({ entries: options.searchEntries ?? [entries[TARGET_INDEX]], truncated: false }))
  const controller = { listFilesFor, searchFilesFor, listProjectFiles, searchProjectFiles, supportsWorkspaceGit: options.supportsSessionGit ?? Boolean(git), supportsProjectWorkspaceGit: Boolean(git), getWorkspaceGitFor: git?.read, getWorkspaceIgnoredFor: git?.ignored, getProjectWorkspaceGit: git?.read, getProjectWorkspaceIgnored: git?.ignored } as unknown as PilotController
  const scroll = { scrollTop: 0, clientHeight: 112, focus: vi.fn() }
  const input = { focus: vi.fn() }
  const rowElements = new Map<string, { focus: ReturnType<typeof vi.fn> }>()
  let tree: React.ReactElement
  let selectedPath: string | undefined
  let expandedPaths: string[] = []
  let sessionId: string | undefined = options.detached ? undefined : 'session', directory = '/project', projectId = options.projectId
  const onOpenFile = vi.fn((path: string) => {
    if (path !== selectedPath) { selectedPath = path; hooks.dirty = true }
  })
  const onAddFile = vi.fn()
  const onOpenEditor = vi.fn(async (_path: string, _editorId: string) => undefined)
  const onOpenDirectory = vi.fn()
  const onWatchDirectoriesChange = vi.fn()
  const onExpandedPathsChange = vi.fn((paths: string[]) => { expandedPaths = paths; hooks.dirty = true })
  const visit = (node: React.ReactNode, callback: (props: Record<string, unknown>, element: React.ReactElement<Record<string, unknown>>) => void) => {
    if (Array.isArray(node)) { node.forEach(child => visit(child, callback)); return }
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    callback(node.props, node)
    visit(node.props.children as React.ReactNode, callback)
  }
  const render = () => {
    hooks.cursor = 0; hooks.dirty = false
    tree = ProjectFileDrawer({ controller, projectId, sessionId, directory, selectedPath, expandedPaths, onExpandedPathsChange, onOpenFile: options.detached ? undefined : onOpenFile, onAddFile: options.detached ? undefined : onAddFile, onBack: vi.fn(), onOpenDirectory, workspaceWatch, onWatchDirectoriesChange, editors: options.editors, onOpenEditor: options.detached ? undefined : onOpenEditor })
    visit(tree, props => {
      if (props.role === 'tree') (props.ref as React.RefObject<unknown>).current = scroll
      else if (props['aria-label'] === '搜索文件') (props.ref as React.RefObject<unknown>).current = input
      else if (typeof props['data-file-tree-path'] === 'string') {
        const path = props['data-file-tree-path']
        const element = rowElements.get(path) || { focus: vi.fn() }
        rowElements.set(path, element)
        ;(props.ref as (element: unknown) => void)(element)
      }
    })
    hooks.effects.splice(0).forEach(effect => effect())
  }
  const drain = async () => {
    for (let index = 0; index < 24; index++) {
      await Promise.resolve()
      if (hooks.dirty) render()
    }
  }
  const props = (match: (props: Record<string, unknown>) => boolean) => {
    let found: Record<string, unknown> | undefined
    visit(tree, props => { if (!found && match(props)) found = props })
    if (!found) throw new Error('File drawer control not found')
    return found
  }
  const allProps = (match: (props: Record<string, unknown>) => boolean) => {
    const found: Array<Record<string, unknown>> = []
    visit(tree, props => { if (match(props)) found.push(props) })
    return found
  }
  const rowProps = (path: string, match: (props: Record<string, unknown>) => boolean) => {
    let found: Record<string, unknown> | undefined
    visit(tree, (_, element) => {
      if (element.key !== path) return
      visit(element, props => { if (!found && match(props)) found = props })
    })
    if (!found) throw new Error(`File drawer row control not found: ${path}`)
    return found
  }
  const changeContext = async (nextSession: string | undefined, nextDirectory: string, nextProject = projectId) => {
    if (nextProject !== projectId || nextDirectory !== directory) { selectedPath = undefined; expandedPaths = [] }
    sessionId = nextSession; directory = nextDirectory; projectId = nextProject; render(); await drain()
  }
  const search = async (query = 'transient') => {
    ;(props(props => props['aria-label'] === '搜索文件').onChange as (event: unknown) => void)({ target: { value: query } })
    await drain()
    await vi.advanceTimersByTimeAsync(120)
    await drain()
  }
  const open = async (path = TARGET) => {
    ;(props(props => props['data-file-tree-path'] === path).onClick as (event: unknown) => void)({ detail: 1 })
    await drain()
  }
  const clear = async (mode: ClearMode, value = '') => {
    const searchInput = props(props => props['aria-label'] === '搜索文件')
    if (mode === 'button') (props(props => props['aria-label'] === '清除文件搜索').onClick as () => void)()
    else if (mode === 'escape') (searchInput.onKeyDown as (event: unknown) => void)({ key: 'Escape', nativeEvent: { isComposing: false }, preventDefault: vi.fn() })
    else (searchInput.onChange as (event: unknown) => void)({ target: { value } })
    await drain()
  }
  render()
  return { drain, search, open, clear, scroll, props, allProps, rowProps, changeContext, render, onOpenFile, onAddFile, onOpenEditor, onOpenDirectory, onWatchDirectoriesChange, onExpandedPathsChange, getExpandedPaths: () => expandedPaths, listFilesFor, searchFilesFor, listProjectFiles, searchProjectFiles }
}

beforeEach(() => {
  hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []
  virtualization.options = undefined
  virtualization.instance.scrollToIndex.mockClear()
  vi.useFakeTimers()
  vi.stubGlobal('React', React)
  vi.stubGlobal('document', { getElementById: () => null })
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } })
})
afterEach(() => {
  hooks.slots.forEach(slot => slot.cleanup?.())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('React Harness project-scoped file drawer', () => {
  const text = (label: string) => (props: Record<string, unknown>) => props.children === label || Array.isArray(props.children) && props.children.includes(label)

  it('browses, searches, copies and opens the project directory without a session', async () => {
    const read = vi.fn(async () => ({ available: true, entries: [{ path: 'file.md', status: 'modified' as const }] }))
    const ignored = vi.fn(async () => ['ignored.tmp'])
    const files: HarnessWorkspaceFileEntry[] = [{ path: 'src', name: 'src', type: 'directory' }, { path: 'file.md', name: 'file.md', type: 'file' }, { path: 'ignored.tmp', name: 'ignored.tmp', type: 'file' }]
    const view = mount(undefined, files, { read, ignored }, { projectId: 'project-a', detached: true, supportsSessionGit: false, directories: { src: [{ path: 'src/child.md', name: 'child.md', type: 'file' }] }, searchEntries: [files[1]] })
    await view.drain()
    expect(view.listProjectFiles.mock.calls).toEqual([['project-a', '']])
    expect(read).toHaveBeenCalledWith('project-a')
    expect(ignored.mock.calls.every(([scope]) => scope === 'project-a')).toBe(true)
    expect(view.props(props => props['data-file-tree-path'] === 'file.md')['aria-label']).toBe('file.md，已修改')
    expect(view.props(props => props['data-file-tree-path'] === 'ignored.tmp')['aria-label']).toBe('ignored.tmp，已忽略')
    await view.open('src')
    expect(view.listProjectFiles).toHaveBeenCalledWith('project-a', 'src')
    expect(view.getExpandedPaths()).toEqual(['src'])
    await view.search('file')
    expect(view.searchProjectFiles).toHaveBeenCalledWith('project-a', 'file', true)
    await view.open('file.md')
    expect(view.props(props => props['data-file-tree-path'] === 'file.md')['aria-selected']).toBe(true)
    ;(view.rowProps('file.md', text('复制相对路径')).onSelect as () => void)()
    ;(view.rowProps('file.md', text('复制绝对路径')).onSelect as () => void)()
    ;(view.props(props => props['aria-label'] === '打开项目目录').onClick as () => void)()
    await view.drain()
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(1, 'file.md')
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(2, '/project/file.md')
    expect(view.onOpenDirectory).toHaveBeenCalledOnce()
    expect(view.listFilesFor).not.toHaveBeenCalled(); expect(view.searchFilesFor).not.toHaveBeenCalled()
    expect(view.onOpenFile).not.toHaveBeenCalled(); expect(view.onAddFile).not.toHaveBeenCalled()
  })

  it('selects by keyboard but disables session actions when their callbacks are absent', async () => {
    const view = mount(undefined, [{ path: 'file.md', name: 'file.md', type: 'file' }], undefined, { projectId: 'project-a', detached: true, editors: [{ id: 'mira-editor', name: 'Test Editor', fileOnly: true }] })
    await view.drain()
    for (const key of ['Enter', ' ']) {
      ;(view.props(props => props['data-file-tree-path'] === 'file.md').onKeyDown as (event: unknown) => void)({ key, shiftKey: false, preventDefault: vi.fn() })
      await view.drain()
      expect(view.props(props => props['data-file-tree-path'] === 'file.md')['aria-selected']).toBe(true)
    }
    for (const label of ['打开', '打开方式', 'Test Editor', '加入对话']) expect(view.rowProps('file.md', text(label)).disabled).toBe(true)
    for (const label of ['打开', 'Test Editor', '加入对话']) (view.rowProps('file.md', text(label)).onSelect as () => void)()
    await view.drain()
    expect(view.onOpenFile).not.toHaveBeenCalled(); expect(view.onAddFile).not.toHaveBeenCalled(); expect(view.onOpenEditor).not.toHaveBeenCalled()
  })

  it('retains explicit same-project session actions without querying the session file root', async () => {
    const view = mount(undefined, [{ path: 'file.md', name: 'file.md', type: 'file' }], undefined, { projectId: 'project-a', editors: [{ id: 'mira-editor', name: 'Test Editor', fileOnly: true }] })
    await view.drain(); await view.open('file.md')
    ;(view.rowProps('file.md', text('加入对话')).onSelect as () => void)()
    ;(view.rowProps('file.md', text('Test Editor')).onSelect as () => void)()
    await view.drain()
    expect(view.onOpenFile).toHaveBeenCalledWith('file.md'); expect(view.onAddFile).toHaveBeenCalledWith('file.md'); expect(view.onOpenEditor).toHaveBeenCalledWith('file.md', 'mira-editor')
    expect(view.listFilesFor).not.toHaveBeenCalled()
    view.listProjectFiles.mockClear()
    await view.changeContext('other-session', '/project')
    expect(view.listProjectFiles).not.toHaveBeenCalled()
    expect(view.props(props => props['data-file-tree-path'] === 'file.md')['aria-selected']).toBe(true)
  })

  it('ignores session watchers in project mode and keeps manual refresh functional', async () => {
    const workspaceWatch = { getSnapshot: vi.fn(() => ({ revision: 5, paths: [''], error: 'wrong-session watcher' })), subscribe: vi.fn(() => vi.fn()), retry: vi.fn() } as unknown as WorkspaceWatchDataSource
    const read = vi.fn(async () => ({ available: true, entries: [] }))
    const view = mount(workspaceWatch, [{ path: 'file.md', name: 'file.md', type: 'file' }], { read, ignored: vi.fn(async () => []) }, { projectId: 'project-a', detached: true })
    await view.drain(); await view.search()
    expect(workspaceWatch.subscribe).not.toHaveBeenCalled(); expect(workspaceWatch.getSnapshot).not.toHaveBeenCalled()
    expect(view.onWatchDirectoriesChange).not.toHaveBeenCalled()
    expect(view.allProps(props => props['aria-label'] === '重试文件自动刷新')).toEqual([])
    view.listProjectFiles.mockClear(); view.searchProjectFiles.mockClear(); read.mockClear()
    ;(view.props(props => props['aria-label'] === '刷新文件').onClick as () => void)()
    await view.drain()
    expect(view.listProjectFiles).toHaveBeenCalledWith('project-a', '')
    expect(view.searchProjectFiles).toHaveBeenCalledWith('project-a', 'transient', true)
    expect(read).toHaveBeenCalledWith('project-a')
    expect(workspaceWatch.retry).not.toHaveBeenCalled()
  })

  it('suppresses late tree, search and Git results when the project changes at the same directory', async () => {
    let finishTree!: (value: { entries: HarnessWorkspaceFileEntry[] }) => void, finishSearch!: (value: { entries: HarnessWorkspaceFileEntry[]; truncated: boolean }) => void, finishGit!: (value: HarnessWorkspaceGitSnapshot) => void
    const read = vi.fn().mockReturnValueOnce(new Promise(resolve => { finishGit = resolve })).mockResolvedValue({ available: true, entries: [{ path: 'new.md', status: 'added' }] })
    const ignored = vi.fn(async () => [])
    const view = mount(undefined, [], { read, ignored }, { projectId: 'project-a', detached: true })
    await view.drain()
    view.listProjectFiles.mockImplementationOnce(() => new Promise(resolve => { finishTree = resolve }))
    view.searchProjectFiles.mockImplementationOnce(() => new Promise(resolve => { finishSearch = resolve }))
    ;(view.props(props => props['aria-label'] === '刷新文件').onClick as () => void)()
    await view.drain(); await view.search('old')
    view.listProjectFiles.mockResolvedValue({ entries: [{ path: 'new.md', name: 'new.md', type: 'file' }] })
    await view.changeContext(undefined, '/project', 'project-b')
    finishTree({ entries: [{ path: 'old.md', name: 'old.md', type: 'file' }] })
    finishSearch({ entries: [{ path: 'old.md', name: 'old.md', type: 'file' }], truncated: false })
    finishGit({ available: true, entries: [{ path: 'old.md', status: 'deleted' }] })
    await view.drain()
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['new.md'])
    expect(view.props(props => props['data-file-tree-path'] === 'new.md')['aria-label']).toBe('new.md，已新增')
    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('')
    expect(view.getExpandedPaths()).toEqual([])
    expect(view.listProjectFiles).toHaveBeenCalledWith('project-b', '')
    expect(ignored.mock.calls.every(([scope]) => scope === 'project-b')).toBe(true)
  })

  it('does not query any file scope when neither project nor session is supplied', async () => {
    const view = mount(undefined, entries, undefined, { detached: true })
    await view.drain(); await view.search()
    ;(view.props(props => props['aria-label'] === '刷新文件').onClick as () => void)()
    await view.drain()
    expect(view.props(props => props['aria-label'] === '搜索文件').disabled).toBe(true)
    expect(view.props(props => props.role === 'status' && props.children === '未关联项目目录')).toBeDefined()
    expect(view.listFilesFor).not.toHaveBeenCalled(); expect(view.searchFilesFor).not.toHaveBeenCalled()
    expect(view.listProjectFiles).not.toHaveBeenCalled(); expect(view.searchProjectFiles).not.toHaveBeenCalled()
  })

  it('keeps project rows virtualized and restores local selection after clearing search without preview', async () => {
    const view = mount(undefined, entries, undefined, { projectId: 'project-a', detached: true })
    await view.drain()
    expect(view.allProps(props => props.role === 'treeitem').length).toBeLessThan(entries.length)
    await view.search(); await view.open(); await view.clear('button')
    expect(view.props(props => props['data-file-tree-path'] === TARGET)['aria-selected']).toBe(true)
    expect(virtualization.instance.scrollToIndex).toHaveBeenLastCalledWith(TARGET_INDEX, { align: 'auto' })
    expect(view.onOpenFile).not.toHaveBeenCalled()
    expect(view.allProps(props => props.role === 'treeitem').every(props => (props.style as { height: number }).height === 28)).toBe(true)
  })

  it('ignores an editor error from the previously browsed project', async () => {
    let fail!: (cause: Error) => void
    const view = mount(undefined, [{ path: 'file.md', name: 'file.md', type: 'file' }], undefined, { projectId: 'project-a', editors: [{ id: 'mira-editor', name: 'Test Editor', fileOnly: true }] })
    await view.drain()
    view.onOpenEditor.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    ;(view.rowProps('file.md', text('Test Editor')).onSelect as () => void)()
    await view.changeContext('session', '/other-project', 'project-b')
    fail(new Error('old-project editor failure')); await view.drain()
    expect(view.allProps(props => props.role === 'alert')).toEqual([])
  })
})

describe('React Harness file drawer search clearing', () => {
  it.each(['mira.png', 'mira.JPG', 'mira.jpeg', 'mira@2x.webp', 'mira.gif'])('adds supported image %s through its exact workspace path while preserving file opening', async path => {
    const view = mount(undefined, [{ path, name: path, type: 'file' }])
    await view.drain()
    const add = view.props(props => Array.isArray(props.children) && props.children.includes('加入对话'))
    expect(add.disabled).toBe(false)
    ;(add.onSelect as () => void)()
    expect(view.onAddFile).toHaveBeenCalledExactlyOnceWith(path)
    ;(view.props(props => props['data-file-tree-path'] === path).onClick as (event: unknown) => void)({ detail: 1 })
    expect(view.onOpenFile).toHaveBeenCalledWith(path)
  })

  it.each(['mira.avif', 'mira.apng', 'mira.bmp', 'mira.ico'])('explains unsupported image %s and refuses attachment while preserving preview', async path => {
    const view = mount(undefined, [{ path, name: path, type: 'file' }])
    await view.drain()
    const add = view.props(props => Array.isArray(props.children) && props.children.includes('加入对话'))
    expect(add.disabled).toBe(true)
    expect(add.title).toContain('PNG、JPEG、GIF 或 WebP')
    ;(add.onSelect as () => void)()
    expect(view.onAddFile).not.toHaveBeenCalled()
    await view.open(path)
    expect(view.onOpenFile).toHaveBeenCalledExactlyOnceWith(path)
  })

  it.each(['mira.svg', 'mira.md'])('retains the text conversation attachment action for %s', async path => {
    const view = mount(undefined, [{ path, name: path, type: 'file' }])
    await view.drain()
    const add = view.props(props => Array.isArray(props.children) && props.children.includes('加入对话'))
    expect(add.disabled).toBe(false)
    ;(add.onSelect as () => void)()
    expect(view.onAddFile).toHaveBeenCalledExactlyOnceWith(path)
  })

  it.each([
    { label: 'the clear button', mode: 'button' as const, value: '' },
    { label: 'Escape', mode: 'escape' as const, value: '' },
    { label: 'deleting the query', mode: 'input' as const, value: '' },
    { label: 'a whitespace query', mode: 'input' as const, value: '   ' },
  ])('reveals the same selected file after repeated search/open and clearing via $label', async ({ mode, value }) => {
    const view = mount()
    await view.drain()
    await view.search(); await view.open(); await view.clear(mode, value)
    expect(virtualization.instance.scrollToIndex).toHaveBeenLastCalledWith(TARGET_INDEX, { align: 'auto' })
    expect(view.scroll.scrollTop).toBe(TARGET_INDEX * 28)

    await view.search()
    expect(view.scroll.scrollTop).toBe(0)
    await view.open()
    expect(view.onOpenFile.mock.calls).toEqual([[TARGET], [TARGET]])
    virtualization.instance.scrollToIndex.mockClear()
    await view.clear(mode, value)

    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe(value)
    expect(view.props(props => props['data-file-tree-path'] === TARGET)['aria-selected']).toBe(true)
    expect(virtualization.instance.scrollToIndex).toHaveBeenLastCalledWith(TARGET_INDEX, { align: 'auto' })
    expect(view.scroll.scrollTop).toBe(TARGET_INDEX * 28)
  })

  it('clears a search without a selected file safely', async () => {
    const view = mount()
    await view.drain()
    await view.search()
    virtualization.instance.scrollToIndex.mockClear()
    await view.clear('button')

    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('')
    expect(view.onOpenFile).not.toHaveBeenCalled()
    expect(virtualization.instance.scrollToIndex).not.toHaveBeenCalled()
    expect(view.scroll.scrollTop).toBe(0)
  })

  it('keeps the selected file, query and scroll while watch changes reload only its affected parents', async () => {
    let snapshot = emptyWorkspaceWatch
    const listeners = new Set<() => void>()
    const workspaceWatch = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, retry: vi.fn() } as unknown as WorkspaceWatchDataSource
    const publish = (next: WorkspaceWatchSnapshot) => { snapshot = next; listeners.forEach(listener => listener()) }
    const view = mount(workspaceWatch)
    await view.drain(); await view.search(); await view.open(); await view.clear('button')
    const scrollBefore = view.scroll.scrollTop
    view.listFilesFor.mockClear()
    publish({ revision: 1, paths: [''] }); await view.drain()
    expect(view.listFilesFor.mock.calls).toEqual([['session', '']])
    expect(view.scroll.scrollTop).toBe(scrollBefore)
    expect(view.props(props => props['data-file-tree-path'] === TARGET)['aria-selected']).toBe(true)
    await view.search()
    view.searchFilesFor.mockClear(); view.listFilesFor.mockClear()
    publish({ revision: 2, paths: ['', 'unloaded'] }); await view.drain()
    expect(view.listFilesFor.mock.calls).toEqual([['session', '']])
    expect(view.searchFilesFor.mock.calls).toEqual([['session', 'transient', true]])
    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('transient')
    expect(view.props(props => props['data-file-tree-path'] === TARGET)['aria-selected']).toBe(true)
    publish({ revision: 2, paths: [], error: '目录监听已停止，请重试' }); await view.drain()
    ;(view.props(props => props['aria-label'] === '重试文件自动刷新').onClick as () => void)()
    expect(workspaceWatch.retry).toHaveBeenCalledOnce()
  })
})

describe('React Harness file drawer Git overlay', () => {
  it('adds deleted files only after their immediate parent is loaded and expanded, without inventing missing ancestors', async () => {
    const fileEntries: HarnessWorkspaceFileEntry[] = [{ path: 'src', name: 'src', type: 'directory' }, { path: 'live.ts', name: 'live.ts', type: 'file' }]
    const read = vi.fn(async () => ({ available: true, entries: [
      { path: 'gone.ts', status: 'deleted' as const }, { path: 'src/gone.ts', status: 'deleted' as const },
      { path: 'src/missing/deep.ts', status: 'deleted' as const }, { path: 'absent/gone.ts', status: 'deleted' as const },
    ] }))
    const view = mount(undefined, fileEntries, { read, ignored: vi.fn(async () => []) }, { directories: { src: [] } }); await view.drain()
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['src', 'gone.ts', 'live.ts'])
    expect(view.props(props => props['data-file-tree-path'] === 'gone.ts')['aria-label']).toBe('gone.ts，已删除')
    await view.open('src')
    expect(view.getExpandedPaths()).toEqual(['src'])
    expect(view.listFilesFor.mock.calls).toContainEqual(['session', 'src'])
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['src', 'src/gone.ts', 'gone.ts', 'live.ts'])
    expect(view.props(props => props['data-file-tree-path'] === 'src/gone.ts')).toMatchObject({ 'aria-level': 2, 'aria-posinset': 1, 'aria-setsize': 1 })
    expect(view.props(props => props['data-file-tree-path'] === 'src')['aria-label']).not.toContain('空目录')
    expect(view.allProps(props => props.role === 'treeitem').every(props => (props.style as { height: number }).height === 28)).toBe(true)
    expect(view.onOpenFile).not.toHaveBeenCalled()
  })

  it('selects deleted rows with click, Enter and Space, guards opening actions, and retains copy and nonbitmap conversation references', async () => {
    const read = vi.fn(async () => ({ available: true, entries: [{ path: 'gone.md', status: 'deleted' as const }] }))
    const view = mount(undefined, [{ path: 'live.md', name: 'live.md', type: 'file' }], { read, ignored: vi.fn(async () => []) }, { editors: [{ id: 'mira-test-editor', name: 'Test Editor', fileOnly: true }] }); await view.drain()
    await view.open('gone.md')
    expect(view.props(props => props['data-file-tree-path'] === 'gone.md')['aria-selected']).toBe(true)
    for (const key of ['Enter', ' ']) {
      const preventDefault = vi.fn()
      ;(view.props(props => props['data-file-tree-path'] === 'gone.md').onKeyDown as (event: unknown) => void)({ key, shiftKey: false, preventDefault })
      await view.drain()
      expect(preventDefault).toHaveBeenCalledOnce()
      expect(view.props(props => props['data-file-tree-path'] === 'gone.md')['aria-selected']).toBe(true)
    }
    const text = (label: string) => (props: Record<string, unknown>) => props.children === label || Array.isArray(props.children) && props.children.includes(label)
    const open = view.rowProps('gone.md', text('打开'))
    const openWith = view.rowProps('gone.md', text('打开方式'))
    const editor = view.rowProps('gone.md', text('Test Editor'))
    const add = view.rowProps('gone.md', text('加入对话'))
    expect(open.disabled).toBe(true); expect(openWith.disabled).toBe(true); expect(editor.disabled).toBe(true)
    ;(open.onSelect as () => void)(); (editor.onSelect as () => void)()
    await view.drain()
    expect(view.onOpenFile).not.toHaveBeenCalled(); expect(view.onOpenEditor).not.toHaveBeenCalled()
    expect(add.disabled).not.toBe(true)
    ;(add.onSelect as () => void)()
    expect(view.onAddFile).toHaveBeenCalledWith('gone.md')
    const relative = view.rowProps('gone.md', text('复制相对路径'))
    const absolute = view.rowProps('gone.md', text('复制绝对路径'))
    expect(relative.disabled).not.toBe(true); expect(absolute.disabled).not.toBe(true)
    ;(relative.onSelect as () => void)(); (absolute.onSelect as () => void)()
    await view.drain()
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(1, 'gone.md')
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(2, '/project/gone.md')
    ;(view.rowProps('live.md', text('Test Editor')).onSelect as () => void)()
    await view.open('live.md')
    expect(view.onOpenEditor).toHaveBeenCalledWith('live.md', 'mira-test-editor')
    expect(view.onOpenFile.mock.calls).toEqual([['live.md']])
  })

  it('keeps the bitmap conversation guard when a deleted bitmap file is synthesized', async () => {
    const read = vi.fn(async () => ({ available: true, entries: [{ path: 'gone.png', status: 'deleted' as const }] }))
    const view = mount(undefined, [], { read, ignored: vi.fn(async () => []) }); await view.drain()
    const add = view.rowProps('gone.png', props => Array.isArray(props.children) && props.children.includes('加入对话'))
    expect(add.disabled).toBe(true)
    ;(add.onSelect as () => void)()
    expect(view.onAddFile).not.toHaveBeenCalled()
    expect(view.allProps(props => props.role === 'status' && props.children === '此目录为空')).toEqual([])
  })

  it.each(['unsupported', 'nonrepository'])('hides the changed-only control for an %s host without hiding files', async host => {
    const read = vi.fn(async () => ({ available: false, entries: [] }))
    const view = mount(undefined, [{ path: 'clean.md', name: 'clean.md', type: 'file' }], host === 'unsupported' ? undefined : { read, ignored: vi.fn(async () => []) }); await view.drain()
    expect(view.allProps(props => props['aria-label'] === '只看变更' || props['aria-label'] === '显示全部文件')).toEqual([])
    expect(view.props(props => props['data-file-tree-path'] === 'clean.md')).toBeDefined()
    expect(view.allProps(props => props.role === 'alert')).toEqual([])
    if (host === 'unsupported') expect(read).not.toHaveBeenCalled()
    else expect(read).toHaveBeenCalledWith('session')
  })

  it('filters tree and exact search changes without changing the query, expansion or selected file, and recomputes sibling accessibility', async () => {
    const fileEntries: HarnessWorkspaceFileEntry[] = [{ path: 'src', name: 'src', type: 'directory' }, { path: 'clean.md', name: 'clean.md', type: 'file' }]
    const children: HarnessWorkspaceFileEntry[] = [{ path: 'src/changed.ts', name: 'changed.ts', type: 'file' }, { path: 'src/clean.ts', name: 'clean.ts', type: 'file' }, { path: 'src/ignored.tmp', name: 'ignored.tmp', type: 'file' }]
    const read = vi.fn(async () => ({ available: true, entries: [{ path: 'src/changed.ts', status: 'modified' as const }, { path: 'src/gone.ts', status: 'deleted' as const }] }))
    const view = mount(undefined, fileEntries, { read, ignored: vi.fn(async (_sessionId: string, paths: string[]) => paths.filter(path => path === 'src/ignored.tmp')) }, { directories: { src: children }, searchEntries: [fileEntries[0], ...children] }); await view.drain()
    expect(view.props(props => props['aria-label'] === '只看变更')['aria-pressed']).toBe(false)
    await view.open('src'); await view.open('src/changed.ts'); await view.search('src')
    view.onExpandedPathsChange.mockClear()
    ;(view.props(props => props['aria-label'] === '只看变更').onClick as () => void)(); await view.drain()
    expect(view.props(props => props['aria-label'] === '显示全部文件')['aria-pressed']).toBe(true)
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['src/changed.ts'])
    expect(view.props(props => props['data-file-tree-path'] === 'src/changed.ts')).toMatchObject({ 'aria-level': 1, 'aria-posinset': 1, 'aria-setsize': 1, 'aria-selected': true })
    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('src')
    expect(view.getExpandedPaths()).toEqual(['src'])
    expect(view.onExpandedPathsChange).not.toHaveBeenCalled()
    expect(view.onOpenFile.mock.calls).toEqual([['src/changed.ts']])
    ;(view.props(props => props['aria-label'] === '显示全部文件').onClick as () => void)(); await view.drain()
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['src', ...children.map(entry => entry.path)])
    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('src')
    expect(view.props(props => props['data-file-tree-path'] === 'src/changed.ts')['aria-selected']).toBe(true)
    ;(view.props(props => props['aria-label'] === '只看变更').onClick as () => void)(); await view.drain()
    await view.clear('button')
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['src', 'src/changed.ts', 'src/gone.ts'])
    expect(view.props(props => props['data-file-tree-path'] === 'src')).toMatchObject({ 'aria-expanded': true, 'aria-posinset': 1, 'aria-setsize': 1 })
    expect(view.props(props => props['data-file-tree-path'] === 'src/changed.ts')).toMatchObject({ 'aria-posinset': 1, 'aria-setsize': 2, 'aria-selected': true })
    expect(view.props(props => props['data-file-tree-path'] === 'src/gone.ts')).toMatchObject({ 'aria-posinset': 2, 'aria-setsize': 2 })
    expect(view.getExpandedPaths()).toEqual(['src'])
    expect(view.onExpandedPathsChange).not.toHaveBeenCalled()
  })

  it('shows distinct filtered empty states for the tree and search while restoring the original rows on toggle-off', async () => {
    const fileEntries: HarnessWorkspaceFileEntry[] = [{ path: 'clean.md', name: 'clean.md', type: 'file' }, { path: 'ignored.tmp', name: 'ignored.tmp', type: 'file' }]
    const read = vi.fn(async () => ({ available: true, entries: [] }))
    const view = mount(undefined, fileEntries, { read, ignored: vi.fn(async () => ['ignored.tmp']) }, { searchEntries: [fileEntries[0]] }); await view.drain()
    ;(view.props(props => props['aria-label'] === '只看变更').onClick as () => void)(); await view.drain()
    expect(view.allProps(props => props.role === 'treeitem')).toEqual([])
    expect(view.props(props => props.role === 'status' && props.children === '没有变更文件')).toBeDefined()
    await view.search('clean')
    expect(view.props(props => props.role === 'status' && props.children === '没有匹配的变更文件')).toBeDefined()
    ;(view.props(props => props['aria-label'] === '显示全部文件').onClick as () => void)(); await view.drain()
    expect(view.props(props => props['data-file-tree-path'] === 'clean.md')).toBeDefined()
    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('clean')
  })

  it('restores a selected clean file after changed-only mode temporarily hides it, without reopening or collapsing its parent', async () => {
    const read = vi.fn(async () => ({ available: true, entries: [{ path: 'src/changed.ts', status: 'modified' as const }] }))
    const view = mount(undefined, [{ path: 'src', name: 'src', type: 'directory' }], { read, ignored: vi.fn(async () => []) }, { directories: { src: [
      { path: 'src/changed.ts', name: 'changed.ts', type: 'file' }, { path: 'src/clean.ts', name: 'clean.ts', type: 'file' },
    ] } }); await view.drain()
    await view.open('src'); await view.open('src/clean.ts')
    view.onExpandedPathsChange.mockClear()
    ;(view.props(props => props['aria-label'] === '只看变更').onClick as () => void)(); await view.drain()
    expect(view.allProps(props => props['data-file-tree-path'] === 'src/clean.ts')).toEqual([])
    expect(view.getExpandedPaths()).toEqual(['src'])
    ;(view.props(props => props['aria-label'] === '显示全部文件').onClick as () => void)(); await view.drain()
    expect(view.props(props => props['data-file-tree-path'] === 'src/clean.ts')['aria-selected']).toBe(true)
    expect(view.props(props => props['data-file-tree-path'] === 'src')['aria-expanded']).toBe(true)
    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('')
    expect(view.onOpenFile.mock.calls).toEqual([['src/clean.ts']])
    expect(view.onExpandedPathsChange).not.toHaveBeenCalled()
  })

  it('retains changed-only mode during an in-flight refresh and applies the fresh statuses afterward', async () => {
    let finish!: (snapshot: HarnessWorkspaceGitSnapshot) => void
    const pending = new Promise<HarnessWorkspaceGitSnapshot>(resolve => { finish = resolve })
    const read = vi.fn().mockResolvedValueOnce({ available: true, entries: [{ path: 'modified.ts', status: 'modified' }] }).mockReturnValueOnce(pending)
    const view = mount(undefined, [{ path: 'modified.ts', name: 'modified.ts', type: 'file' }, { path: 'clean.ts', name: 'clean.ts', type: 'file' }], { read, ignored: vi.fn(async () => []) }); await view.drain()
    ;(view.props(props => props['aria-label'] === '只看变更').onClick as () => void)(); await view.drain()
    ;(view.props(props => props['aria-label'] === '刷新文件').onClick as () => void)(); await view.drain()
    expect(view.props(props => props['aria-label'] === '显示全部文件')['aria-pressed']).toBe(true)
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['modified.ts'])
    expect(view.allProps(props => props.role === 'status' && Array.isArray(props.children) && props.children.includes('正在读取 Git 状态'))).toHaveLength(1)
    finish({ available: true, entries: [{ path: 'clean.ts', status: 'added' }] }); await view.drain()
    expect(view.props(props => props['aria-label'] === '显示全部文件')['aria-pressed']).toBe(true)
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['clean.ts'])
    expect(view.props(props => props['data-file-tree-path'] === 'clean.ts')['aria-label']).toBe('clean.ts，已新增')
  })

  it.each(['failure', 'nonrepository'])('returns to ordinary browsing after Git %s without clearing search or selection', async outcome => {
    const repository = { available: true, entries: [{ path: 'modified.ts', status: 'modified' as const }, { path: 'gone.ts', status: 'deleted' as const }] }
    const read = vi.fn().mockResolvedValueOnce(repository)
    if (outcome === 'failure') read.mockRejectedValueOnce(new Error('Git unavailable'))
    else read.mockResolvedValueOnce({ available: false, entries: [] })
    read.mockResolvedValue(repository)
    const fileEntries: HarnessWorkspaceFileEntry[] = [{ path: 'modified.ts', name: 'modified.ts', type: 'file' }, { path: 'clean.ts', name: 'clean.ts', type: 'file' }]
    const view = mount(undefined, fileEntries, { read, ignored: vi.fn(async () => []) }, { searchEntries: fileEntries }); await view.drain()
    await view.open('modified.ts'); await view.search('file')
    ;(view.props(props => props['aria-label'] === '只看变更').onClick as () => void)(); await view.drain()
    ;(view.props(props => props['aria-label'] === '刷新文件').onClick as () => void)(); await view.drain()
    expect(view.allProps(props => props['aria-label'] === '只看变更' || props['aria-label'] === '显示全部文件')).toEqual([])
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['modified.ts', 'clean.ts'])
    expect(view.props(props => props['aria-label'] === '搜索文件').value).toBe('file')
    expect(view.props(props => props['data-file-tree-path'] === 'modified.ts')['aria-selected']).toBe(true)
    const retryLabel = outcome === 'failure' ? '重试读取 Git 状态' : '刷新文件'
    ;(view.props(props => props['aria-label'] === retryLabel).onClick as () => void)(); await view.drain()
    expect(view.props(props => props['aria-label'] === '只看变更')['aria-pressed']).toBe(false)
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['modified.ts', 'clean.ts'])
    expect(view.onOpenFile.mock.calls).toEqual([['modified.ts']])
  })

  it.each([
    { label: 'session', session: 'next-session', directory: '/project' },
    { label: 'root', session: 'session', directory: '/next-project' },
  ])('resets changed-only mode when only the $label changes', async ({ session, directory }) => {
    const read = vi.fn(async () => ({ available: true, entries: [{ path: 'modified.ts', status: 'modified' as const }] }))
    const fileEntries: HarnessWorkspaceFileEntry[] = [{ path: 'modified.ts', name: 'modified.ts', type: 'file' }, { path: 'clean.ts', name: 'clean.ts', type: 'file' }]
    const view = mount(undefined, fileEntries, { read, ignored: vi.fn(async () => []) }); await view.drain()
    ;(view.props(props => props['aria-label'] === '只看变更').onClick as () => void)(); await view.drain()
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['modified.ts'])
    await view.changeContext(session, directory)
    expect(view.props(props => props['aria-label'] === '只看变更')['aria-pressed']).toBe(false)
    expect(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path'])).toEqual(['clean.ts', 'modified.ts'])
    expect(read.mock.calls).toEqual([['session'], [session]])
  })

  it('keeps a direct directory letter alongside one descendant dot and hides only the dot while directory contents load', async () => {
    const read = vi.fn(async () => ({ available: true, entries: [{ path: 'src', status: 'untracked' as const }, { path: 'src/child.ts', status: 'modified' as const }] }))
    const view = mount(undefined, [{ path: 'src', name: 'src', type: 'directory' }], { read, ignored: vi.fn(async () => []) }); await view.drain()
    expect(view.props(props => props['data-file-git-status'] === 'untracked').children).toBe('U')
    expect(view.allProps(props => props['data-file-git-dot'] === 'modified')).toHaveLength(1)
    expect(view.props(props => props['data-file-tree-path'] === 'src')['aria-label']).toBe('src，未跟踪')
    view.listFilesFor.mockImplementation(() => new Promise(() => {}))
    ;(view.props(props => props['data-file-tree-path'] === 'src').onClick as (event: unknown) => void)({ detail: 1 })
    await view.drain()
    expect(view.allProps(props => props['data-file-git-dot'])).toEqual([])
    expect(view.props(props => props['data-file-git-status'] === 'untracked').children).toBe('U')
  })

  it('renders exact letters and dots within loaded-parent scope, without adding unloaded deleted children or changing 28px geometry', async () => {
    const paths = ['modified.ts', 'added.ts', 'deleted.ts', 'renamed.ts', 'untracked.ts', 'ignored.tmp']
    const fileEntries: HarnessWorkspaceFileEntry[] = [{ path: 'src', name: 'src', type: 'directory' }, ...paths.map(path => ({ path, name: path, type: 'file' as const }))]
    const read = vi.fn(async () => ({ available: true, entries: [
      { path: 'modified.ts', status: 'modified' as const }, { path: 'added.ts', status: 'added' as const }, { path: 'deleted.ts', status: 'deleted' as const },
      { path: 'renamed.ts', status: 'renamed' as const }, { path: 'untracked.ts', status: 'untracked' as const },
      { path: 'src/missing.ts', status: 'deleted' as const }, { path: 'src/changed.ts', status: 'modified' as const },
    ] }))
    const ignored = vi.fn(async () => ['ignored.tmp'])
    const view = mount(undefined, fileEntries, { read, ignored }); await view.drain()
    expect(read.mock.calls).toEqual([['session']])
    expect(view.allProps(props => typeof props['data-file-git-status'] === 'string').map(props => props.children)).toEqual(['A', 'D', 'M', 'R', 'U'])
    expect(view.props(props => props['data-file-git-dot'] === 'modified')['aria-label']).toBe('目录包含：已修改、已删除')
    expect(view.props(props => props['data-file-tree-path'] === 'modified.ts')['aria-label']).toBe('modified.ts，已修改')
    expect(view.props(props => props['data-file-tree-path'] === 'ignored.tmp')['aria-label']).toBe('ignored.tmp，已忽略')
    expect(view.allProps(props => props['data-file-tree-path'] === 'src/missing.ts')).toEqual([])
    expect(view.allProps(props => props.role === 'treeitem').every(props => (props.style as { height: number }).height === 28)).toBe(true)
    expect(view.allProps(props => props.className === 'mira-file-drawer__name is-git-ignored').map(props => props.children)).toEqual(['ignored.tmp'])
    ;(view.props(props => props['data-file-tree-path'] === 'modified.ts').onClick as (event: unknown) => void)({ detail: 1 })
    expect(view.onOpenFile).toHaveBeenCalledWith('modified.ts')
  })

  it('queries only mounted virtual rows plus roving focus, supplements new scrolled rows and refreshes from the real refresh callback', async () => {
    const read = vi.fn(async () => ({ available: true, entries: [] }))
    const ignored = vi.fn(async () => [])
    const view = mount(undefined, entries, { read, ignored }); await view.drain()
    const queried = ignored.mock.calls.flatMap(([, paths]) => paths)
    expect(queried.length).toBeLessThan(entries.length)
    expect(queried).toEqual(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path']))
    ignored.mockClear()
    view.scroll.scrollTop = 100 * 28; view.render(); await view.drain()
    const later = ignored.mock.calls.flatMap(([, paths]) => paths)
    expect(later.length).toBeGreaterThan(0)
    expect(later.every(path => !queried.includes(path))).toBe(true)
    expect(read).toHaveBeenCalledOnce()
    ;(view.props(props => props['aria-label'] === '刷新文件').onClick as () => void)()
    await view.drain()
    expect(read).toHaveBeenCalledTimes(2)
    expect(ignored.mock.calls.at(-1)![1]).toEqual(view.allProps(props => props.role === 'treeitem').map(props => props['data-file-tree-path']))
  })

  it('refreshes the snapshot on watch revisions, clears failed decoration and exposes a working Git-only retry', async () => {
    let snapshot = emptyWorkspaceWatch
    const listeners = new Set<() => void>()
    const workspaceWatch = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } } as unknown as WorkspaceWatchDataSource
    const read = vi.fn().mockResolvedValueOnce({ available: true, entries: [{ path: 'modified.ts', status: 'modified' }] }).mockRejectedValueOnce(new Error('Git busy')).mockResolvedValue({ available: true, entries: [{ path: 'modified.ts', status: 'added' }] })
    const view = mount(workspaceWatch, [{ path: 'modified.ts', name: 'modified.ts', type: 'file' }], { read, ignored: vi.fn(async () => []) }); await view.drain()
    snapshot = { revision: 1, paths: [''] }; listeners.forEach(listener => listener()); await view.drain()
    expect(view.allProps(props => props['data-file-git-status'])).toEqual([])
    expect(view.props(props => props.role === 'alert').children).toBeDefined()
    const treeReads = view.listFilesFor.mock.calls.length
    ;(view.props(props => props['aria-label'] === '重试读取 Git 状态').onClick as () => void)()
    await view.drain()
    expect(read).toHaveBeenCalledTimes(3)
    expect(view.listFilesFor.mock.calls.length).toBe(treeReads)
    expect(view.props(props => props['data-file-tree-path'] === 'modified.ts')['aria-label']).toBe('modified.ts，已新增')
  })

  it('captures a new session/root and suppresses an old pending response after the actual component lifecycle cleanup', async () => {
    let finish!: (value: HarnessWorkspaceGitSnapshot) => void
    const old = new Promise<HarnessWorkspaceGitSnapshot>(resolve => { finish = resolve })
    const read = vi.fn().mockReturnValueOnce(old).mockResolvedValue({ available: true, entries: [{ path: 'file.ts', status: 'added' }] })
    const ignored = vi.fn(async () => [])
    const view = mount(undefined, [{ path: 'file.ts', name: 'file.ts', type: 'file' }], { read, ignored }); await view.drain()
    await view.changeContext('next-session', '/other-project')
    finish({ available: true, entries: [{ path: 'file.ts', status: 'deleted' }] }); await view.drain()
    expect(read.mock.calls).toEqual([['session'], ['next-session']])
    expect(ignored.mock.calls.every(([sessionId]) => sessionId === 'next-session')).toBe(true)
    expect(view.props(props => props['data-file-tree-path'] === 'file.ts')['aria-label']).toBe('file.ts，已新增')
  })
})
