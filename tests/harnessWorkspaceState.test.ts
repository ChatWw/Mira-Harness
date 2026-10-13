import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miraInitialTaskLayout, miraTaskPaneIds, splitMiraTaskLayout, removeMiraTaskPane, resizeMiraTaskSplit, readMiraTaskLayout, miraTaskLayoutGeometry, miraTaskDropSide } from '../apps/harness-react/src/state/mira-task-layout'
import { closeAllWorkspaceTabs, closeOtherWorkspaceTabs, closeWorkspaceTab, createWorkspaceBrowserTab, createWorkspaceFileTab, createWorkspacePlanTab, createWorkspaceSession, isWorkspaceRelativePath, labelWorkspaceTab, openWorkspaceTab, readWorkspaceSessions, reorderWorkspaceTabs, restoreWorkspaceTab, workspaceTabLabel, createWorkspaceTaskTab, withoutWorkspaceTaskOwners, placeWorkspaceTask, replaceWorkspaceTask } from '../apps/harness-react/src/state/workspace-state'
import { miraSearchWorkspaceTabs } from '../apps/harness-react/src/lib/mira-workspace-tab-presentation'

const NOW = 1_791_664_800_000
beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW))
afterEach(() => vi.restoreAllMocks())

describe('React Harness workspace state', () => {
  it('restores multiple historical plan tabs by immutable tool identity, without persisting copied plan content', () => {
    const first = createWorkspacePlanTab('first', '首版方案'), revised = createWorkspacePlanTab('revised', '修订方案')
    let state = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), first), revised)
    state = openWorkspaceTab(state, first)
    expect(state.tabs).toHaveLength(2)
    expect(state.activeTab).toBe(first.id)
    state = reorderWorkspaceTabs(state, revised.id, first.id)
    const closed = closeWorkspaceTab(state, first.id)
    const restored = readWorkspaceSessions({ task: JSON.parse(JSON.stringify(closed)) }).task
    expect(restored.tabs).toEqual(closed.tabs)
    expect(restored.recentClosedTabs[0]).toMatchObject({ id: first.id, planToolId: 'first' })
    const reopened = restoreWorkspaceTab(restored, first.id)
    expect(reopened.tabs.map(tab => tab.planToolId)).toEqual(['revised', 'first'])
    expect(reopened.activeTab).toBe(first.id)
    expect(miraSearchWorkspaceTabs(reopened.tabs, '历史方案 首版')).toEqual([reopened.tabs[1]])
    expect(workspaceTabLabel(first.id)).toBe('方案')
    const malformed = [
      { ...first, id: 'plan:another' }, { ...first, planToolId: '' },
      { ...first, planToolId: 'bad\nidentity', id: 'plan:bad\nidentity' },
      { ...first, planToolId: 'x'.repeat(513), id: `plan:${'x'.repeat(513)}` },
    ]
    expect(readWorkspaceSessions({ task: { ...state, tabs: malformed } }).task.tabs).toEqual([])
    expect(readWorkspaceSessions({ task: { ...state, tabs: [{ ...first, markdown: 'must not persist', runId: 'unrelated' }] } }).task.tabs[0]).toEqual(first)
  })
  it('replaces a task in its exact split leaf while keeping resource identity, ratios and reopen history', () => {
    let state = placeWorkspaceTask(createWorkspaceSession(), createWorkspaceTaskTab('b', '原任务'), '$primary', 'left')
    state = placeWorkspaceTask(state, createWorkspaceTaskTab('c', '邻近任务'), 'b', 'down')
    state = { ...state, taskLayout: resizeMiraTaskSplit(state.taskLayout!, state.taskLayout!.kind === 'split' ? state.taskLayout!.id : '', .35) }
    state = openWorkspaceTab(state, createWorkspaceFileTab('notes.md'))
    const resource = state.tabs.find(tab => tab.path === 'notes.md')!
    const before = state.taskLayout!
    const next = replaceWorkspaceTask(state, 'b', createWorkspaceTaskTab('d', '新任务'))
    expect(next.activeTab).toBe(resource.id); expect(next.tabs.find(tab => tab.id === resource.id)).toBe(resource)
    expect(miraTaskPaneIds(next.taskLayout!)).toEqual(['d', 'c', '$primary'])
    expect(next.taskLayout).toMatchObject({ kind: 'split', ratio: .35, id: before.kind === 'split' ? before.id : undefined })
    expect(next.recentClosedTabs[0]).toMatchObject({ taskSessionId: 'b', closedAt: NOW })
    expect(readWorkspaceSessions({ draft: next }).draft).toEqual(next)
    expect(replaceWorkspaceTask(next, 'c', createWorkspaceTaskTab('d', '重复'))).toBe(next)
    expect(replaceWorkspaceTask(next, 'missing', createWorkspaceTaskTab('e', '不存在'))).toBe(next)
  })

  it('migrates excess legacy task tabs to the reopen list instead of retaining invisible group members', () => {
    const tasks = ['b', 'c', 'd', 'e', 'f'].map(id => createWorkspaceTaskTab(id, `Task ${id}`))
    const restored = readWorkspaceSessions({ a: { ...createWorkspaceSession(), tabs: [...tasks, createWorkspaceFileTab('notes.md')], activeTab: 'task:f' } }).a
    expect(restored.tabs.flatMap(tab => tab.taskSessionId ? [tab.taskSessionId] : [])).toEqual(['b', 'c', 'd'])
    expect(restored.recentClosedTabs.map(tab => tab.taskSessionId)).toEqual(['e', 'f'])
    expect(restored.activeTab).toBe('file:notes.md')
    expect(restored.tabs.find(tab => tab.path === 'notes.md')).toBeDefined()
    expect(readWorkspaceSessions({ a: restored }).a).toEqual(restored)
    // At capacity, reopen retains history; after closing one pane it can open the original task identity.
    expect(restoreWorkspaceTab(restored, 'task:e')).toBe(restored)
    const reopened = restoreWorkspaceTab(closeWorkspaceTab(restored, 'task:c'), 'task:e')
    expect(miraTaskPaneIds(reopened.taskLayout!)).toEqual(['$primary', 'e', 'd', 'b'])
    expect(reopened.tabs.find(tab => tab.taskSessionId === 'e')?.label).toBe('Task e')
    expect(reopened.recentClosedTabs.some(tab => tab.taskSessionId === 'f')).toBe(true)
  })

  it.each(['left', 'right', 'up', 'down'] as const)('places a task on the requested %s edge without duplicating primary or changing other bindings', side => {
    const layout = splitMiraTaskLayout(miraInitialTaskLayout(), '$primary', 'b', side)
    expect(layout.kind).toBe('split'); if (layout.kind !== 'split') throw new Error('No split')
    expect(layout.axis).toBe(side === 'left' || side === 'right' ? 'horizontal' : 'vertical')
    expect(layout.first).toEqual({ kind: 'task', id: side === 'left' || side === 'up' ? 'b' : '$primary' })
    expect(splitMiraTaskLayout(layout, '$primary', 'b', side)).toBe(layout)
    expect(removeMiraTaskPane(layout, 'b')).toEqual(miraInitialTaskLayout())
    expect(removeMiraTaskPane(layout, '$primary')).toBe(layout)
  })

  it('retains nested ratios and stable leaf ids, clamps persisted data and enforces four panes', () => {
    let layout = splitMiraTaskLayout(miraInitialTaskLayout(), '$primary', 'b', 'right')
    layout = splitMiraTaskLayout(layout, '$primary', 'c', 'down')
    layout = splitMiraTaskLayout(layout, 'b', 'd', 'down')
    expect(splitMiraTaskLayout(layout, 'd', 'e', 'left')).toBe(layout)
    if (layout.kind !== 'split') throw new Error('No split')
    layout = resizeMiraTaskSplit(layout, layout.id, .7)
    expect(readMiraTaskLayout(JSON.parse(JSON.stringify(layout)), ['b', 'c', 'd'])).toEqual(layout)
    const geometry = miraTaskLayoutGeometry(layout)
    expect(geometry.panes.map(pane => pane.id)).toEqual(['$primary', 'c', 'b', 'd'])
    expect(geometry.panes.reduce((area, pane) => area + pane.rect.width * pane.rect.height, 0)).toBeCloseTo(1)
    const restored = readMiraTaskLayout({ ...layout, ratio: 9, second: { kind: 'task', id: 'stale' } }, ['b', 'c'])
    expect(miraTaskPaneIds(restored).sort()).toEqual(['$primary', 'b', 'c'])
    expect(miraTaskPaneIds(removeMiraTaskPane(layout, 'c'))).toEqual(['$primary', 'b', 'd'])
    const duplicated = readMiraTaskLayout({ ...layout, first: { kind: 'task', id: 'b' }, second: { kind: 'task', id: 'b' } }, ['b'])
    expect(miraTaskPaneIds(duplicated)).toEqual(['$primary', 'b'])
  })

  it('limits drop preview to the nearest 32 percent edge and leaves the center/outside untouched', () => {
    const rect = { left: 100, top: 50, width: 500, height: 300 }
    expect(miraTaskDropSide(rect, 110, 200)).toBe('left')
    expect(miraTaskDropSide(rect, 590, 200)).toBe('right')
    expect(miraTaskDropSide(rect, 350, 55)).toBe('up')
    expect(miraTaskDropSide(rect, 350, 340)).toBe('down')
    expect(miraTaskDropSide(rect, 350, 200)).toBeUndefined()
    expect(miraTaskDropSide(rect, 90, 200)).toBeUndefined()
  })
  it('restores existing task identities, activates without duplicates and rejects self or mismatched tabs', () => {
    const task = createWorkspaceTaskTab('b', 'Task B')
    const state = openWorkspaceTab(createWorkspaceSession(), task)
    expect(openWorkspaceTab(state, task).tabs).toHaveLength(1)
    const restored = readWorkspaceSessions({ a: { ...state, tabs: [task, task, { ...task, id: 'task:c' }, createWorkspaceTaskTab('a', 'Self')] }, draft: state })
    expect(restored.a.tabs).toEqual([task]); expect(restored.draft.tabs).toEqual(state.tabs)
    const reopened = restoreWorkspaceTab(closeWorkspaceTab(state, task.id), task.id)
    expect(reopened.tabs).toEqual(state.tabs); expect(reopened.recentClosedTabs).toEqual([])
  })

  it('removes deleted tasks from all open and recently closed panes and selects a neighboring resource', () => {
    const task = createWorkspaceTaskTab('deleted', 'Deleted'), keep = createWorkspaceTaskTab('kept', 'Kept')
    const opened = openWorkspaceTab(openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), keep), task), createWorkspaceFileTab('notes.md'))
    const sessions = { a: { ...opened, activeTab: task.id }, draft: closeWorkspaceTab(opened, task.id), deleted: createWorkspaceSession() }
    const cleaned = withoutWorkspaceTaskOwners(sessions, new Set(['deleted']))
    expect(cleaned.deleted).toBeUndefined()
    expect(cleaned.a.tabs.map(tab => tab.id)).toEqual([keep.id, 'file:notes.md'])
    expect(cleaned.a.activeTab).toBe('file:notes.md')
    expect(cleaned.draft.recentClosedTabs).toEqual([])
    expect(sessions.a.tabs).toHaveLength(3)
  })
  it('records real lifecycle times, keeps opening time on activation, and gives restored resources a new time', () => {
    const tab = createWorkspaceFileTab('notes.md')
    const state = openWorkspaceTab(createWorkspaceSession(), tab)
    expect(state.tabs[0].openedAt).toBe(NOW)
    vi.mocked(Date.now).mockReturnValue(NOW + 60_000)
    expect(openWorkspaceTab(state, tab).tabs[0].openedAt).toBe(NOW)
    const closed = closeWorkspaceTab(state, tab.id)
    expect(closed.recentClosedTabs[0]).toEqual({ ...tab, openedAt: NOW, closedAt: NOW + 60_000 })
    expect(readWorkspaceSessions({ a: closed }).a.recentClosedTabs).toEqual(closed.recentClosedTabs)
    vi.mocked(Date.now).mockReturnValue(NOW + 120_000)
    expect(restoreWorkspaceTab(closed, tab.id).tabs[0]).toEqual({ ...tab, openedAt: NOW + 120_000 })
  })
  it('does not fabricate times for legacy data or accept invalid persisted date ranges', () => {
    const tab = createWorkspaceFileTab('legacy.md')
    expect(readWorkspaceSessions({ a: { tabs: [tab] } }).a.tabs).toEqual([tab])
    for (const timestamp of [0, -1, NaN, Infinity, '123', 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(readWorkspaceSessions({ a: { tabs: [{ ...tab, openedAt: timestamp, closedAt: timestamp }] } }).a.tabs).toEqual([tab])
    }
  })
  it('restores browser icon metadata including cleared icons and rejects non-web/credentialed icon URLs', () => {
    const browser = { ...createWorkspaceBrowserTab('https://mira.test/final'), label: 'Final page', faviconUrl: 'https://mira.test/icon.png' }
    const state = openWorkspaceTab(createWorkspaceSession(), browser)
    expect(readWorkspaceSessions(JSON.parse(JSON.stringify({ a: state }))).a).toEqual(state)
    const reopened = restoreWorkspaceTab(closeWorkspaceTab(state, browser.id), browser.id)
    expect(reopened.tabs[0]).toMatchObject({ label: browser.label, url: browser.url, faviconUrl: browser.faviconUrl }); expect(reopened.tabs[0].id).not.toBe(browser.id)
    for (const faviconUrl of [null, 'file:///tmp/icon.png', 'javascript:alert(1)', 'https://user:secret@mira.test/icon']) {
      expect(readWorkspaceSessions({ a: { tabs: [{ ...browser, faviconUrl }] } }).a.tabs[0].faviconUrl).toBeNull()
      expect(readWorkspaceSessions({ a: { tabs: [{ id: 'browser', label: 'legacy', faviconUrl }] } }).a.tabs[0].faviconUrl).toBeNull()
    }
  })
  it('persists independent browser URLs and titles while discarding invalid resource identities', () => {
    const first = createWorkspaceBrowserTab('https://mira.test/one'), second = { ...createWorkspaceBrowserTab('https://mira.test/two'), label: 'Second page' }
    expect(first.id).not.toBe(second.id)
    const state = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), first), second)
    expect(readWorkspaceSessions(JSON.parse(JSON.stringify({ a: state }))).a).toEqual(state)
    expect(readWorkspaceSessions({ a: { tabs: [{ id: 'browser:', label: 'Empty ID' }, { id: 'browser:bad/id', label: 'Bad ID' }, { id: 'browser:safe', label: 'Safe', url: 'javascript:alert(1)' }] } }).a.tabs).toEqual([{ id: 'browser:safe', label: 'Safe', url: '' }])
  })
  it('reopens a browser with a new resource identity while retaining its last URL and title', () => {
    const browser = { ...createWorkspaceBrowserTab('https://mira.test/final'), label: 'Redirected page' }, kept = createWorkspaceBrowserTab('https://mira.test/kept')
    const closed = closeWorkspaceTab(openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), browser), kept), browser.id)
    const reopened = restoreWorkspaceTab(closed, browser.id), restored = reopened.tabs.find(tab => tab.id === reopened.activeTab)!
    expect(restored.id).toMatch(/^browser:/); expect(restored.id).not.toBe(browser.id)
    expect(restored).toMatchObject({ label: browser.label, url: browser.url }); expect(reopened.tabs).toContainEqual({ ...kept, openedAt: NOW })
    expect(reopened.recentClosedTabs).toEqual([]); expect(restoreWorkspaceTab(reopened, browser.id)).toBe(reopened)
  })
  it('migrates a closed legacy browser using the stored session URL into a fresh resource', () => {
    const old = readWorkspaceSessions({ a: { tabs: [], browserUrl: 'https://mira.test/legacy', recentClosedTabs: [{ id: 'browser', label: 'Legacy page' }] } }).a
    const restored = restoreWorkspaceTab(old, 'browser')
    expect(restored.tabs).toEqual([{ id: restored.activeTab, label: 'Legacy page', url: old.browserUrl, openedAt: NOW }]); expect(restored.activeTab).toMatch(/^browser:/)
  })
  it('starts with an empty launcher until a tool is opened', () => {
    expect(createWorkspaceSession()).toEqual({ tabs: [], activeTab: 'overview', fileTreeOpen: false, expandedFilePaths: [], browserUrl: '', recentClosedTabs: [] })
  })

  it('keeps each session tab selection and browser URL independent', () => {
    const alpha = { ...openWorkspaceTab(createWorkspaceSession(), { id: 'terminal', label: '终端' }), browserUrl: 'https://example.com' }
    const beta = openWorkspaceTab(createWorkspaceSession(), { id: 'changes', label: '变更' })
    const sessions = { alpha, beta }
    expect(sessions.alpha.activeTab).toBe('terminal')
    expect(sessions.alpha.browserUrl).toBe('https://example.com')
    expect(sessions.beta.tabs.map(tab => tab.id)).toEqual(['changes'])
    expect(sessions.beta.browserUrl).toBe('')
  })

  it('does not duplicate tabs and returns to the last available tab when closing', () => {
    const file = createWorkspaceFileTab('src/notes.ts')
    const files = openWorkspaceTab(createWorkspaceSession(), file)
    const changes = openWorkspaceTab(files, { id: 'changes', label: '变更' })
    const renamed = labelWorkspaceTab(changes, 'changes', 'notes.ts')
    expect(openWorkspaceTab(renamed, { id: 'changes', label: '变更' }).tabs).toHaveLength(2)
    expect(closeWorkspaceTab(renamed, 'changes')).toMatchObject({ activeTab: file.id, tabs: [file] })
    expect(closeWorkspaceTab(renamed, 'overview')).toBe(renamed)
  })

  it('returns to the empty launcher after closing the last tab including task activities', () => {
    for (const tab of [createWorkspaceFileTab('notes.ts'), { id: 'overview', label: '任务活动' } as const]) {
      const state = openWorkspaceTab(createWorkspaceSession(), tab)
      expect(closeWorkspaceTab(state, tab.id)).toEqual({ ...createWorkspaceSession(), recentClosedTabs: [{ ...tab, openedAt: NOW, closedAt: NOW }] })
    }
  })

  it('preserves the active selection when closing another tab', () => {
    const file = createWorkspaceFileTab('notes.ts')
    const state = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), file), { id: 'terminal', label: '终端' })
    expect(closeWorkspaceTab(state, file.id)).toMatchObject({ activeTab: 'terminal', tabs: [{ id: 'terminal' }] })
  })

  it('restores valid per-session preferences without trusting malformed stored tabs or URLs', () => {
    expect(readWorkspaceSessions({ a: { tabs: [{ id: 'terminal', label: '终端' }, { id: 'terminal', label: '重复' }, { id: 'unknown', label: '无效' }], activeTab: 'terminal', browserUrl: 'https://example.com' }, b: { tabs: [], activeTab: 'browser', browserUrl: 'javascript:alert(1)' } })).toMatchObject({
      a: { tabs: [{ id: 'terminal', label: '终端' }], activeTab: 'terminal', browserUrl: 'https://example.com' },
      b: { tabs: [], activeTab: 'overview', browserUrl: '' },
    })
  })

  it('preserves a legacy overview while migrating its old files tab to the independent drawer', () => {
    expect(readWorkspaceSessions({ legacy: { tabs: [{ id: 'overview', label: '任务活动' }, { id: 'files', label: '文件' }], activeTab: 'overview' }, fallback: { tabs: [{ id: 'files', label: '文件' }, { id: 'browser', label: '浏览器' }], activeTab: 'overview' } })).toMatchObject({
      legacy: { tabs: [{ id: 'overview', label: '任务活动' }], activeTab: 'overview', fileTreeOpen: true },
      fallback: { tabs: [{ id: 'browser', label: '浏览器' }], activeTab: 'browser', fileTreeOpen: true },
    })
  })

  it('deduplicates valid entries without discarding a later valid label after a malformed entry', () => {
    const file = createWorkspaceFileTab('notes.ts')
    expect(readWorkspaceSessions({ a: { tabs: [null, 'files', { ...file, label: 5 }, file, { ...file, label: '重复' }], activeTab: file.id } }).a.tabs).toEqual([file])
  })

  it('selects the tab to the right of a closed active tab, or the left at the end', () => {
    const file = createWorkspaceFileTab('notes.ts')
    const files = openWorkspaceTab(createWorkspaceSession(), file)
    const terminal = openWorkspaceTab(files, { id: 'terminal', label: '终端' })
    const browser = openWorkspaceTab(terminal, { id: 'browser', label: '浏览器' })
    expect(closeWorkspaceTab({ ...browser, activeTab: file.id }, file.id).activeTab).toBe('terminal')
    expect(closeWorkspaceTab({ ...browser, activeTab: 'terminal' }, 'terminal').activeTab).toBe('browser')
    expect(closeWorkspaceTab(browser, 'browser').activeTab).toBe('terminal')
  })

  it('reorders tabs without changing the active tab or resource preferences', () => {
    const file = createWorkspaceFileTab('notes.ts')
    const state = { ...openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), file), { id: 'browser', label: '浏览器' }), browserUrl: 'https://example.com' }
    const moved = reorderWorkspaceTabs(state, 'browser', file.id)
    expect(moved.tabs.map(tab => tab.id)).toEqual(['browser', file.id])
    expect(moved).toMatchObject({ activeTab: 'browser', browserUrl: 'https://example.com' })
    expect(reorderWorkspaceTabs(state, file.id, file.id)).toBe(state)
    expect(reorderWorkspaceTabs(state, 'terminal', file.id)).toBe(state)
  })

  it('closes other tabs and selects the kept tab, then closes all back to the launcher', () => {
    const file = createWorkspaceFileTab('notes.ts')
    const state = openWorkspaceTab(openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), file), { id: 'terminal', label: '终端' }), { id: 'browser', label: '浏览器' })
    const remaining = closeOtherWorkspaceTabs(state, file.id)
    expect(remaining).toMatchObject({ tabs: [file], activeTab: file.id, recentClosedTabs: [{ id: 'terminal' }, { id: 'browser' }] })
    const empty = closeAllWorkspaceTabs(remaining)
    expect(empty).toMatchObject({ tabs: [], activeTab: 'overview', recentClosedTabs: [file, { id: 'terminal' }, { id: 'browser' }] })
    expect(closeOtherWorkspaceTabs(state, 'changes')).toBe(state)
    expect(closeAllWorkspaceTabs(empty)).toBe(empty)
  })

  it('restores the original label and keeps recent history independent per session', () => {
    const file = createWorkspaceFileTab('src/notes.ts')
    const renamed = { ...file, label: 'My notes' }
    const alpha = closeWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), renamed), file.id)
    const beta = closeWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), { id: 'terminal', label: '终端' }), 'terminal')
    const restored = restoreWorkspaceTab(alpha, file.id)
    expect(restored).toMatchObject({ tabs: [renamed], activeTab: file.id, recentClosedTabs: [] })
    expect(beta.recentClosedTabs).toEqual([{ id: 'terminal', label: '终端', openedAt: NOW, closedAt: NOW }])
    expect(restoreWorkspaceTab(alpha, 'terminal')).toBe(alpha)
  })

  it('removes reopened resources from recent history and remembers only their newest label', () => {
    const file = createWorkspaceFileTab('notes.ts')
    const closed = closeWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), { ...file, label: 'Old label' }), file.id)
    const reopened = openWorkspaceTab(closed, { ...file, label: 'New label' })
    expect(reopened.recentClosedTabs).toEqual([])
    expect(closeWorkspaceTab(reopened, file.id).recentClosedTabs).toEqual([{ ...file, label: 'New label', openedAt: NOW, closedAt: NOW }])
  })

  it('restores sanitized recent history and excludes resources already open', () => {
    const file = createWorkspaceFileTab('notes.ts')
    const restored = readWorkspaceSessions({ alpha: { tabs: [{ id: 'browser', label: '浏览器' }], recentClosedTabs: [null, { ...file, label: 2 }, file, { ...file, label: 'duplicate.ts' }, { id: 'browser', label: 'already open' }, { id: 'unknown', label: '无效' }] }, beta: { tabs: [] } })
    expect(restored.alpha.recentClosedTabs).toEqual([file])
    expect(restored.beta.recentClosedTabs).toEqual([])
  })

  it('uses full relative paths for distinct same-name file tabs and duplicate activation', () => {
    const source = createWorkspaceFileTab('src/index.ts')
    const test = createWorkspaceFileTab('tests/index.ts')
    const state = openWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), source), test)
    expect(state.tabs).toEqual([{ ...source, openedAt: NOW }, { ...test, openedAt: NOW }])
    expect(state.tabs.map(tab => tab.label)).toEqual(['index.ts', 'index.ts'])
    expect(openWorkspaceTab(state, source)).toMatchObject({ tabs: [source, test], activeTab: source.id })
    expect(workspaceTabLabel(source.id)).toBe('index.ts')
    expect(workspaceTabLabel('files')).toBe('文件')
    expect(workspaceTabLabel('terminal')).toBe('终端')
    expect(workspaceTabLabel('file:')).toBe('文件')
  })

  it.each(['', '/', '/tmp/notes.ts', 'C:/notes.ts', 'C:notes.ts', 'src\\notes.ts', '../notes.ts', 'src/../notes.ts', 'src/./notes.ts', 'src//notes.ts', 'src/', 'notes\0.ts'])('rejects non-canonical or unsafe file path %j', path => {
    expect(isWorkspaceRelativePath(path)).toBe(false)
    expect(() => createWorkspaceFileTab(path)).toThrow('文件路径无效')
    expect(readWorkspaceSessions({ a: { tabs: [{ id: `file:${path}`, path, label: 'Invalid' }], selectedFilePath: path, expandedFilePaths: [path] } }).a).toMatchObject({ tabs: [], selectedFilePath: undefined, expandedFilePaths: [] })
  })

  it('allows dotfiles, spaces and non-ASCII names without changing file identity', () => {
    for (const path of ['.env', '.github/workflows/build.yml', 'draft notes.md', '小说/设定.md', 'notes..md']) {
      const tab = createWorkspaceFileTab(path)
      expect(tab).toEqual({ id: `file:${path}`, path, label: path.split('/').pop() })
      expect(readWorkspaceSessions({ a: { tabs: [tab], activeTab: tab.id } }).a.tabs).toEqual([tab])
    }
  })

  it('requires exact persisted file id and path agreement in open and closed tabs', () => {
    const valid = createWorkspaceFileTab('src/notes.ts')
    const invalid = [{ id: valid.id, label: 'Missing path' }, { ...valid, path: 'tests/notes.ts' }, { ...valid, path: 4 }, { id: 'files', label: 'Legacy closed file' }]
    const state = readWorkspaceSessions({ a: { tabs: [...invalid, valid], activeTab: 'file:tests/notes.ts', recentClosedTabs: [...invalid, createWorkspaceFileTab('tests/notes.ts'), valid] } }).a
    expect(state.tabs).toEqual([valid])
    expect(state.activeTab).toBe(valid.id)
    expect(state.recentClosedTabs).toEqual([createWorkspaceFileTab('tests/notes.ts')])
  })

  it('migrates an active legacy files-only view to the drawer and empty right-side launcher', () => {
    const state = readWorkspaceSessions({ old: { tabs: [{ id: 'files', label: 'notes.ts' }], activeTab: 'files', fileTreeOpen: false, recentClosedTabs: [{ id: 'files', label: 'old.ts' }] } }).old
    expect(state).toMatchObject({ tabs: [], activeTab: 'overview', fileTreeOpen: true, recentClosedTabs: [], expandedFilePaths: [] })
    expect(state.selectedFilePath).toBeUndefined()
  })

  it('does not reopen a drawer for malformed legacy tabs or recently closed legacy files', () => {
    const sessions = readWorkspaceSessions({ malformed: { tabs: [{ id: 'files', label: 4 }] }, closed: { tabs: [], recentClosedTabs: [{ id: 'files', label: '文件' }] } })
    expect(sessions.malformed.fileTreeOpen).toBe(false)
    expect(sessions.closed.fileTreeOpen).toBe(false)
    expect(sessions.closed.recentClosedTabs).toEqual([])
  })

  it('sanitizes persisted file-tree selection and expansion independently from right-side tabs', () => {
    const file = createWorkspaceFileTab('src/notes.ts')
    const state = readWorkspaceSessions({ a: { tabs: [file], fileTreeOpen: true, selectedFilePath: 'src/notes.ts', expandedFilePaths: ['src', '.github', 'src', null, '../outside', '/tmp', 'src\\bad'] } }).a
    expect(state).toMatchObject({ tabs: [file], fileTreeOpen: true, selectedFilePath: 'src/notes.ts', expandedFilePaths: ['src', '.github'] })
    expect(readWorkspaceSessions({ a: { fileTreeOpen: 'true', selectedFilePath: 5, expandedFilePaths: 'src' } }).a).toMatchObject({ fileTreeOpen: false, selectedFilePath: undefined, expandedFilePaths: [] })
  })

  it('keeps the drawer open when closing all preview tabs and keeps tabs when closing the drawer', () => {
    const file = createWorkspaceFileTab('src/notes.ts')
    const state = { ...openWorkspaceTab(createWorkspaceSession(), file), fileTreeOpen: true, selectedFilePath: file.path, expandedFilePaths: ['src'] }
    expect(closeAllWorkspaceTabs(state)).toMatchObject({ tabs: [], fileTreeOpen: true, selectedFilePath: file.path, expandedFilePaths: ['src'] })
    expect({ ...state, fileTreeOpen: false }).toMatchObject({ tabs: [file], activeTab: file.id, selectedFilePath: file.path, expandedFilePaths: ['src'] })
  })

  it('restores file metadata and independent tree state across A/B session persistence', () => {
    const alphaFile = createWorkspaceFileTab('src/index.ts')
    const betaFile = createWorkspaceFileTab('tests/index.ts')
    const alpha = { ...closeWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), alphaFile), alphaFile.id), fileTreeOpen: true, selectedFilePath: alphaFile.path, expandedFilePaths: ['src'] }
    const beta = { ...openWorkspaceTab(createWorkspaceSession(), betaFile), fileTreeOpen: false, selectedFilePath: betaFile.path, expandedFilePaths: ['tests'] }
    const restored = readWorkspaceSessions(JSON.parse(JSON.stringify({ alpha, beta })))
    expect(restoreWorkspaceTab(restored.alpha, alphaFile.id)).toMatchObject({ tabs: [alphaFile], activeTab: alphaFile.id, fileTreeOpen: true, selectedFilePath: alphaFile.path, expandedFilePaths: ['src'] })
    expect(restored.beta).toEqual(beta)
    expect(restored.alpha.expandedFilePaths).not.toBe(restored.beta.expandedFilePaths)
    expect(createWorkspaceSession().expandedFilePaths).not.toBe(createWorkspaceSession().expandedFilePaths)
  })
})
