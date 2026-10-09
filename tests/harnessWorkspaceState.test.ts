import { describe, expect, it } from 'vitest'
import { closeAllWorkspaceTabs, closeOtherWorkspaceTabs, closeWorkspaceTab, createWorkspaceFileTab, createWorkspaceSession, isWorkspaceRelativePath, labelWorkspaceTab, openWorkspaceTab, readWorkspaceSessions, reorderWorkspaceTabs, restoreWorkspaceTab, workspaceTabLabel } from '../apps/harness-react/src/state/workspace-state'

describe('React Harness workspace state', () => {
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
      expect(closeWorkspaceTab(state, tab.id)).toEqual({ ...createWorkspaceSession(), recentClosedTabs: [tab] })
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
    expect(beta.recentClosedTabs).toEqual([{ id: 'terminal', label: '终端' }])
    expect(restoreWorkspaceTab(alpha, 'terminal')).toBe(alpha)
  })

  it('removes reopened resources from recent history and remembers only their newest label', () => {
    const file = createWorkspaceFileTab('notes.ts')
    const closed = closeWorkspaceTab(openWorkspaceTab(createWorkspaceSession(), { ...file, label: 'Old label' }), file.id)
    const reopened = openWorkspaceTab(closed, { ...file, label: 'New label' })
    expect(reopened.recentClosedTabs).toEqual([])
    expect(closeWorkspaceTab(reopened, file.id).recentClosedTabs).toEqual([{ ...file, label: 'New label' }])
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
    expect(state.tabs).toEqual([source, test])
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
