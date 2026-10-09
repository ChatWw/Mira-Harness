/* File drawer adapted from ZCode's WorkspaceFileTree, RowView and data hook.
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * Mira changes: captured Harness session, supported host actions and accessible roving focus.
 * See third-party-licenses/zcode/{LICENSE,NOTICE.md,ADAPTATIONS.md}. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, ChevronRight, CircleAlert, Copy, ExternalLink, FileText, Folder, FolderOpen, GitCommitVertical, LoaderCircle, MoreHorizontal, Plus, RefreshCw, Search, X } from 'lucide-react'
import { FileTreeDataSource, fileTreeAbsolutePath, fileTreeAncestors, fileTreeFocusPath, fileTreeKeyAction, flattenFileTree, type FileTreeRow } from '../../lib/file-tree'
import { FileSearchDataSource, fileSearchRows } from '../../lib/file-search'
import { FileGitDataSource, fileGitChangedRows, fileGitDecoration, fileGitStatusLabel, fileGitTreeDirectories } from '../../lib/file-git'
import { filePreviewKind } from '../../lib/file-preview'
import { getEmptyWorkspaceWatch, subscribeWithoutWorkspaceWatch, type WorkspaceWatchDataSource } from '../../lib/workspace-watch'
import type { PilotController } from '../../state/pilot-state'
import type { WorkspaceEditorInfo } from '../../lib/workspace-editors'

export type ProjectFileDrawerProps = {
  controller: PilotController
  sessionId: string
  directory?: string
  selectedPath?: string
  expandedPaths: string[]
  onExpandedPathsChange: (paths: string[]) => void
  onOpenFile: (path: string) => void
  onAddFile: (path: string) => void
  onBack: () => void
  onOpenDirectory: () => void
  openingDirectory?: boolean
  workspaceWatch?: WorkspaceWatchDataSource
  onWatchDirectoriesChange?: (paths: string[]) => void
  editors?: WorkspaceEditorInfo[]
  onOpenEditor?: (path: string, editorId: string) => Promise<void>
}

const ROW_HEIGHT = 28

export function ProjectFileDrawer({ controller, sessionId, directory, selectedPath, expandedPaths, onExpandedPathsChange, onOpenFile, onAddFile, onBack, onOpenDirectory, openingDirectory, workspaceWatch, onWatchDirectoriesChange, editors = [], onOpenEditor }: ProjectFileDrawerProps) {
  const source = useMemo(() => new FileTreeDataSource(async path => (await controller.listFilesFor(sessionId, path)).entries), [controller, sessionId, directory])
  const data = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const searchSource = useMemo(() => new FileSearchDataSource((query, refresh) => controller.searchFilesFor(sessionId, query, refresh)), [controller, sessionId, directory])
  const search = useSyncExternalStore(searchSource.subscribe, searchSource.getSnapshot, searchSource.getSnapshot)
  const gitSource = useMemo(() => new FileGitDataSource(
    controller.supportsWorkspaceGit ? () => controller.getWorkspaceGitFor(sessionId) : undefined,
    controller.supportsWorkspaceGit ? paths => controller.getWorkspaceIgnoredFor(sessionId, paths) : undefined,
  ), [controller, sessionId, directory, controller.supportsWorkspaceGit])
  const git = useSyncExternalStore(gitSource.subscribe, gitSource.getSnapshot, gitSource.getSnapshot)
  const watch = useSyncExternalStore(workspaceWatch?.subscribe || subscribeWithoutWorkspaceWatch, workspaceWatch?.getSnapshot || getEmptyWorkspaceWatch, getEmptyWorkspaceWatch)
  const searching = Boolean(search.query.trim())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingFocus = useRef<string | undefined>(undefined)
  const pendingReveal = useRef<string | undefined>(undefined)
  const menuDismissedOutside = useRef(false)
  const treeHasFocus = useRef(false)
  const [focusedPath, setFocusedPath] = useState<string>()
  const [selectionPath, setSelectionPath] = useState(selectedPath)
  const [actionError, setActionError] = useState('')
  const [showChangedOnly, setShowChangedOnly] = useState(false)
  const changedOnly = showChangedOnly && (git.available || git.loading)
  const treeDirectories = useMemo(() => fileGitTreeDirectories(data.directories, git.index), [data.directories, git.index])
  const treeRows = useMemo(() => flattenFileTree(treeDirectories, expandedPaths), [treeDirectories, expandedPaths])
  const watchedDirectories = treeRows.filter(row => row.expanded).map(row => row.path).sort()
  const watchedDirectoriesKey = JSON.stringify(watchedDirectories)
  const rows = useMemo(() => {
    const candidates = searching ? fileSearchRows(search.entries) : treeRows
    return changedOnly ? fileGitChangedRows(candidates, git.index, searching) : candidates
  }, [searching, search.entries, treeRows, changedOnly, git.index])
  const focusPath = fileTreeFocusPath(rows, focusedPath, selectionPath)
  const focusIndex = rows.findIndex(row => row.path === focusPath)
  const virtualizer = useVirtualizer({
    count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT,
    getItemKey: index => rows[index].path, overscan: 12,
    rangeExtractor: range => [...new Set([...defaultRangeExtractor(range), ...(focusIndex >= 0 ? [focusIndex] : [])])].sort((left, right) => left - right),
  })
  const virtualRows = virtualizer.getVirtualItems()
  const visibleGitPaths = virtualRows.map(item => rows[item.index].path)
  const visibleGitPathsKey = JSON.stringify(visibleGitPaths)
  const root = data.directories['']
  const portal = document.getElementById('root')
  const rootName = directory?.split(/[\\/]/).filter(Boolean).pop() || (directory ? '项目文件' : '未关联项目')

  useEffect(() => {
    source.activate()
    searchSource.activate()
    gitSource.activate()
    setFocusedPath(undefined)
    setActionError('')
    setShowChangedOnly(false)
    pendingFocus.current = undefined
    treeHasFocus.current = false
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    if (directory) { void source.loadDirectory(''); void gitSource.refresh() }
    return () => { source.deactivate(); searchSource.deactivate(); gitSource.deactivate() }
  }, [source, searchSource, gitSource, directory])

  useEffect(() => { if (!git.available && !git.loading) setShowChangedOnly(false) }, [git.available, git.loading])

  useEffect(() => { gitSource.setVisiblePaths(visibleGitPaths) }, [gitSource, visibleGitPathsKey])

  useEffect(() => {
    treeRows.forEach(row => {
      if (row.expanded && !data.directories[row.path]) void source.loadDirectory(row.path)
    })
  }, [source, treeRows, data.directories])

  useEffect(() => {
    if (!watch.revision) return
    if (watch.paths.length) { void source.refreshChanged(watch.paths); searchSource.refresh() }
    void gitSource.refresh()
  }, [source, searchSource, gitSource, watch.revision])

  useEffect(() => { onWatchDirectoriesChange?.(watchedDirectories) }, [onWatchDirectoriesChange, watchedDirectoriesKey])

  useEffect(() => {
    setSelectionPath(selectedPath)
    pendingReveal.current = selectedPath
    if (!selectedPath) return
    const next = [...new Set([...expandedPaths, ...fileTreeAncestors(selectedPath)])]
    if (next.length !== expandedPaths.length) onExpandedPathsChange(next)
    void source.revealPath(selectedPath)
  }, [selectedPath, source])

  useLayoutEffect(() => {
    const path = pendingFocus.current || (treeHasFocus.current ? focusPath : undefined)
    if (path) {
      const element = rowRefs.current.get(path)
      if (element) { element.focus({ preventScroll: true }); pendingFocus.current = undefined }
    }
    if (pendingReveal.current && !searching) {
      const index = rows.findIndex(row => row.path === pendingReveal.current)
      if (index >= 0) { virtualizer.scrollToIndex(index, { align: 'auto' }); pendingReveal.current = undefined }
    }
  }, [focusPath, rows, virtualizer, searching])

  useEffect(() => {
    if (searching && scrollRef.current) scrollRef.current.scrollTop = 0
  }, [search.query])

  function focusRow(path: string) {
    setFocusedPath(path)
    pendingFocus.current = path
    const index = rows.findIndex(row => row.path === path)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
    const element = rowRefs.current.get(path)
    if (element) { element.focus({ preventScroll: true }); pendingFocus.current = undefined }
  }
  function setSearchQuery(query: string) {
    if (!query.trim()) pendingReveal.current = selectionPath
    searchSource.setQuery(query)
  }
  function setExpanded(path: string, expanded: boolean) {
    onExpandedPathsChange(expanded ? [...new Set([...expandedPaths, path])] : expandedPaths.filter(value => value !== path))
    if (expanded) void source.loadDirectory(path)
  }
  function selectRow(row: FileTreeRow) { setSelectionPath(row.path); focusRow(row.path) }
  function isDeletedFile(row: FileTreeRow) { return row.type === 'file' && git.index.direct.get(row.path) === 'deleted' }
  function openRow(row: FileTreeRow) {
    selectRow(row)
    if (isDeletedFile(row)) return
    if (row.type === 'file') onOpenFile(row.path)
    else if (searching) {
      searchSource.setQuery('')
      pendingReveal.current = row.path
      pendingFocus.current = row.path
      onExpandedPathsChange([...new Set([...expandedPaths, ...fileTreeAncestors(row.path), row.path])])
      void source.revealPath(row.path, true)
    }
    else if (row.expanded && row.error) void source.loadDirectory(row.path, true)
    else setExpanded(row.path, !row.expanded)
  }
  function toggleChangedFiles() {
    setShowChangedOnly(value => !value)
    pendingReveal.current = selectionPath
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }
  function handleKey(event: KeyboardEvent<HTMLDivElement>, row: FileTreeRow) {
    if (searching && row.type === 'directory' && event.key === 'ArrowRight') { event.preventDefault(); openRow(row); return }
    const action = fileTreeKeyAction(rows, row.path, event.key, event.shiftKey)
    if (action.kind === 'none') return
    event.preventDefault()
    if (action.kind === 'focus') focusRow(action.path)
    else if (action.kind === 'open') openRow(row)
    else if (action.kind === 'reload') void source.loadDirectory(action.path, true)
    else if (action.kind === 'menu') {
      // Radix positions and manages the menu; bridge keyboard triggers to its contextmenu handler.
      const rect = event.currentTarget.getBoundingClientRect()
      event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 16, clientY: rect.bottom }))
    } else if (searching) openRow(row)
    else { selectRow(row); setExpanded(action.path, action.kind === 'expand') }
  }
  function refreshFiles() { if (watch.error) workspaceWatch?.retry(); searchSource.refresh(); void source.refresh(expandedPaths); void gitSource.refresh() }
  async function copyPath(path: string) {
    const isCurrent = source.guard()
    setActionError('')
    try { await navigator.clipboard.writeText(path) }
    catch (cause) { if (isCurrent()) setActionError(cause instanceof Error ? `复制失败：${cause.message}` : '复制失败，请重试') }
  }
  function restoreTreeFocus(event: Event) {
    event.preventDefault()
    if (menuDismissedOutside.current) { menuDismissedOutside.current = false; return }
    if (focusPath) focusRow(focusPath)
    else scrollRef.current?.focus({ preventScroll: true })
  }

  return <aside className="mira-file-drawer" aria-label="项目文件">
    <div className="mira-file-drawer__back"><button type="button" onClick={onBack}><ArrowLeft size={16} /><span>返回任务</span></button></div>
    <div className="mira-file-drawer__search"><Search size={14} aria-hidden="true" /><input ref={searchInputRef} type="text" aria-label="搜索文件" placeholder="搜索文件" maxLength={256} disabled={!directory} value={search.query} onChange={event => setSearchQuery(event.target.value)} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape' && search.query) { event.preventDefault(); setSearchQuery('') }
      else if (event.key === 'ArrowDown' && rows.length) { event.preventDefault(); focusRow(rows[0].path) }
    }} />{search.query && <button type="button" title="清除文件搜索" aria-label="清除文件搜索" onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}><X size={14} /></button>}</div>
    <header className="mira-file-drawer__header">
      <h2 title={directory || undefined}>{rootName}</h2>
      <button type="button" className="mira-file-drawer__icon" title="打开项目目录" aria-label="打开项目目录" disabled={!directory || openingDirectory} onClick={onOpenDirectory}>{openingDirectory ? <LoaderCircle size={14} className="pilot-spin" /> : <FolderOpen size={14} />}</button>
      <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-file-drawer__icon" title="项目文件操作" aria-label="项目文件操作"><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={portal}><DropdownMenu.Content align="end" sideOffset={4} className="mira-session-menu">
        <DropdownMenu.Item className="mira-session-menu__item" disabled={!directory || openingDirectory} onSelect={onOpenDirectory}><FolderOpen size={14} />打开项目目录</DropdownMenu.Item>
        <DropdownMenu.Item className="mira-session-menu__item" disabled={!directory} onSelect={() => void copyPath(directory!)}><Copy size={14} />复制项目路径</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      {(git.available || showChangedOnly) && <button type="button" className="mira-file-drawer__icon" title={showChangedOnly ? '显示全部文件' : '只看变更'} aria-label={showChangedOnly ? '显示全部文件' : '只看变更'} aria-pressed={showChangedOnly} onClick={toggleChangedFiles}><GitCommitVertical size={14} /></button>}
      <button type="button" className="mira-file-drawer__icon" title="刷新文件" aria-label="刷新文件" disabled={!directory || root?.loading || data.refreshing || search.loading} onClick={refreshFiles}><RefreshCw size={14} className={root?.loading || data.refreshing || search.loading || git.loading ? 'pilot-spin' : undefined} /></button>
    </header>
    {actionError && <div className="mira-file-drawer__error" role="alert"><CircleAlert size={14} /><span>{actionError}</span></div>}
    {watch.error && <div className="mira-file-drawer__error" role="alert"><CircleAlert size={14} /><span>{watch.error}</span><button type="button" title="重试文件自动刷新" aria-label="重试文件自动刷新" onClick={workspaceWatch?.retry}><RefreshCw size={14} /></button></div>}
    {git.error && <div className="mira-file-drawer__error" role="alert"><CircleAlert size={14} /><span>{git.error}</span><button type="button" title="重试读取 Git 状态" aria-label="重试读取 Git 状态" onClick={() => void gitSource.refresh()}><RefreshCw size={14} /></button></div>}
    {searching && search.error ? <div className="mira-file-drawer__error" role="alert"><CircleAlert size={14} /><span>{search.error}</span><button type="button" title="重试文件搜索" aria-label="重试文件搜索" onClick={() => searchSource.refresh()}><RefreshCw size={14} /></button></div> : !searching && root?.error ? <div className="mira-file-drawer__error" role="alert"><CircleAlert size={14} /><span>{root.error}</span><button type="button" title="重试加载文件" aria-label="重试加载文件" disabled={root.loading} onClick={refreshFiles}><RefreshCw size={14} /></button></div> : null}
    {searching && search.truncated && <div className="mira-file-drawer__state" role="status">仅显示前 1000 项匹配结果</div>}
    <div ref={scrollRef} className="mira-file-drawer__tree" role="tree" aria-label={`${rootName} ${searching ? '搜索结果' : '文件'}`} aria-busy={Boolean(searching ? search.loading : root?.loading || data.refreshing)} tabIndex={rows.length ? undefined : 0} onFocusCapture={() => { treeHasFocus.current = true }} onBlurCapture={event => { treeHasFocus.current = event.currentTarget.contains(event.relatedTarget as Node | null) }}>
      {changedOnly && git.loading ? <div className="mira-file-drawer__state" role="status"><LoaderCircle size={14} className="pilot-spin" />正在读取 Git 状态</div> : searching ? search.loading ? <div className="mira-file-drawer__state" role="status"><LoaderCircle size={14} className="pilot-spin" />正在搜索文件</div> : !search.error && !rows.length ? <div className="mira-file-drawer__state" role="status">{changedOnly ? '没有匹配的变更文件' : '没有匹配的文件'}</div> : null : !directory ? <div className="mira-file-drawer__state" role="status">未关联项目目录</div> : !root?.entries && !root?.error ? <div className="mira-file-drawer__state" role="status"><LoaderCircle size={14} className="pilot-spin" />正在加载文件</div> : !root?.error && !rows.length ? <div className="mira-file-drawer__state" role="status">{changedOnly ? '没有变更文件' : '此目录为空'}</div> : null}
      <div className="mira-file-drawer__rows" role="presentation" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map(item => {
          const row = rows[item.index]
          const deleted = isDeletedFile(row)
          const decoration = fileGitDecoration(git.index, row.path, row.type)
          const descendantLabel = decoration.statuses.map(status => fileGitStatusLabel[status]).join('、')
          return <ContextMenu.Root key={row.path}><ContextMenu.Trigger asChild><div
            ref={element => { if (element) rowRefs.current.set(row.path, element); else rowRefs.current.delete(row.path) }}
            className={`mira-file-drawer__row${selectionPath === row.path ? ' is-selected' : ''}`} role="treeitem" data-file-tree-path={row.path}
            aria-level={row.depth + 1} aria-posinset={row.position} aria-setsize={row.siblings} aria-expanded={!searching && row.type === 'directory' ? row.expanded : undefined} aria-selected={selectionPath === row.path}
            aria-label={`${searching ? row.path : row.name}${decoration.label ? `，${decoration.label}` : ''}${row.error ? '，加载失败' : row.loading ? '，正在加载' : row.expanded && row.empty ? '，空目录' : ''}`}
            tabIndex={row.path === focusPath ? 0 : -1} title={row.error ? `${row.path}\n${row.error}` : row.path}
            style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)`, paddingLeft: 8 + row.depth * 12 }}
            onFocus={() => setFocusedPath(row.path)} onClick={event => { if (event.detail <= 1) openRow(row) }} onContextMenu={() => selectRow(row)} onKeyDown={event => handleKey(event, row)}>
            <span className="mira-file-drawer__chevron" aria-hidden="true">{row.type === 'directory' && <ChevronRight size={12} className={row.expanded ? 'is-open' : undefined} />}</span>
            {row.type === 'directory' ? <Folder size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
            <span className={`mira-file-drawer__name${decoration.status ? ` is-git-${decoration.status}` : ''}`} data-file-git-color={decoration.status}>{searching ? row.path : row.name}</span>
            {decoration.indicator && <span className="mira-file-drawer__git-indicator" data-file-git-color={decoration.status} data-file-git-status={decoration.status} title={decoration.label} aria-label={decoration.label}>{decoration.indicator}</span>}
            {!row.loading && decoration.statuses.length > 0 && <span className="mira-file-drawer__git-dot" data-file-git-color={decoration.statuses[0]} data-file-git-dot={decoration.statuses[0]} role="img" title={descendantLabel} aria-label={`目录包含：${descendantLabel}`} />}
            {row.loading ? <LoaderCircle size={12} className="pilot-spin" aria-hidden="true" /> : row.error ? <CircleAlert size={12} className="mira-file-drawer__warning" aria-hidden="true" /> : row.expanded && row.empty ? <span className="mira-file-drawer__empty">空</span> : null}
          </div></ContextMenu.Trigger><ContextMenu.Portal container={portal}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={restoreTreeFocus} onInteractOutside={() => { menuDismissedOutside.current = true }}>
            <ContextMenu.Item className="mira-session-menu__item" disabled={deleted} onSelect={() => openRow(row)}>{row.type === 'directory' ? <FolderOpen size={14} /> : <FileText size={14} />}{row.type === 'directory' ? row.expanded ? '收起目录' : '展开目录' : '打开'}</ContextMenu.Item>
            <ContextMenu.Sub><ContextMenu.SubTrigger className="mira-session-menu__item" disabled={deleted || !editors.some(editor => row.type === 'file' || !editor.fileOnly) || !onOpenEditor}><ExternalLink size={14} />打开方式<ChevronRight size={13} /></ContextMenu.SubTrigger><ContextMenu.Portal container={portal}><ContextMenu.SubContent className="mira-session-menu mira-editor-menu" sideOffset={4}>
              {editors.filter(editor => row.type === 'file' || !editor.fileOnly).map(editor => <ContextMenu.Item key={editor.id} className="mira-session-menu__item" disabled={deleted} onSelect={() => { if (deleted) return; setActionError(''); void onOpenEditor?.(row.path, editor.id).catch(cause => setActionError(cause instanceof Error ? cause.message : '编辑器打开失败，请重试')) }}>{editor.name}</ContextMenu.Item>)}
            </ContextMenu.SubContent></ContextMenu.Portal></ContextMenu.Sub>
            {row.error && <ContextMenu.Item className="mira-session-menu__item" disabled={row.loading} onSelect={() => void source.loadDirectory(row.path, true)}><RefreshCw size={14} />重新加载</ContextMenu.Item>}
            <ContextMenu.Separator className="mira-session-menu__separator" />
            <ContextMenu.Item className="mira-session-menu__item" onSelect={() => void copyPath(row.path)}><Copy size={14} />复制相对路径</ContextMenu.Item>
            <ContextMenu.Item className="mira-session-menu__item" disabled={!directory} onSelect={() => void copyPath(fileTreeAbsolutePath(directory!, row.path))}><Copy size={14} />复制绝对路径</ContextMenu.Item>
            {row.type === 'file' && <><ContextMenu.Separator className="mira-session-menu__separator" /><ContextMenu.Item className="mira-session-menu__item" disabled={filePreviewKind(row.path) === 'bitmap'} onSelect={() => { if (filePreviewKind(row.path) !== 'bitmap') onAddFile(row.path) }}><Plus size={14} />加入对话</ContextMenu.Item></>}
          </ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>
        })}
      </div>
    </div>
  </aside>
}
