/* File manager layout adapted from ZCode FileManagerPane (Apache-2.0).
 * Copyright 2026 Z.AI Co., Ltd. Mira uses captured host roots and existing previews. */
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { FolderOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import type { PilotController } from '../../state/pilot-state'
import type { WorkspaceTab } from '../../state/workspace-state'
import { fileManagerPreferences } from '../../lib/file-manager-preferences'
import { useWorkspaceEditors } from '../../hooks/useWorkspaceEditors'
import { useWorkspaceWatch } from '../../lib/workspace-watch'
import { ProjectFileDrawer } from './ProjectFileDrawer'
import { FilePreviewPanel } from './FilePreviewPanel'

export function MiraFileManager({ controller, tab, active, onNavigate, onAddFile, onOpenBrowser }: {
  controller: PilotController; tab: WorkspaceTab; active: boolean
  onNavigate: (path: string) => void; onAddFile?: (path: string) => void
  onOpenBrowser: (path: string, isCurrent: () => boolean) => Promise<void>
}) {
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const target = tab.fileManager!
  const rootKey = JSON.stringify([tab.projectId, target.sessionId, target.directory])
  const preferences = useMemo(() => fileManagerPreferences(controller), [controller])
  const preference = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot)
  const navigation = preference[target.directory]?.open !== false
  const directoryPanel = usePanelRef()
  const measuredWidth = useRef(192)
  const groupRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const editorAccess = useWorkspaceEditors(controller)
  const openEditor = (path: string, editorId: string) => tab.projectId ? controller.openProjectFileInEditor(tab.projectId, path, editorId, tab.rootPath) : editorAccess.open(target.sessionId!, path, editorId)
  useEffect(() => { void preferences.load(); return controller.registerBeforeNavigation(preferences.flush) }, [controller, preferences])
  useEffect(() => {
    const update = () => { if (!resizing.current) { if (navigation) directoryPanel.current?.resize(`${preference[target.directory]?.width || 192}px`); else directoryPanel.current?.collapse() } }
    const observer = new ResizeObserver(update)
    if (groupRef.current) observer.observe(groupRef.current)
    const frame = requestAnimationFrame(update)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [navigation, directoryPanel, preference[target.directory]?.width])
  useEffect(() => {
    const finish = () => { if (!resizing.current) return; resizing.current = false; if (measuredWidth.current >= 160) preferences.update(target.directory, { width: Math.round(measuredWidth.current) }) }
    window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); window.addEventListener('blur', finish)
    return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish) }
  }, [preferences, target.directory])
  const [expanded, setExpanded] = useState<string[]>([])
  const [watched, setWatched] = useState<string[]>([])
  const projectWatchController = useMemo(() => tab.projectId ? {
    get supportsWorkspaceWatch() { return controller.supportsProjectWorkspaceWatch },
    watchFilesFor: (_id: string, paths: string[]) => controller.watchProjectFiles(tab.projectId!, target.directory, paths),
    unwatchFilesFor: (_id: string, watchId: string) => controller.unwatchProjectFiles(tab.projectId!, target.directory, watchId),
    onWorkspaceFilesChanged: controller.onWorkspaceFilesChanged,
  } : controller, [controller, tab.projectId, target.directory])
  const watchOwner = tab.projectId ? JSON.stringify(['project', tab.projectId, target.directory]) : target.sessionId
  const watch = useWorkspaceWatch(projectWatchController, watchOwner, target.directory, active ? [...new Set(['', ...(navigation ? watched : []), ...(tab.path ? [tab.path.includes('/') ? tab.path.slice(0, tab.path.lastIndexOf('/')) : ''] : [])])] : [])
  function toggleNavigation() { preferences.update(target.directory, { open: !navigation }) }
  return <section className="mira-file-manager" data-file-manager-root={target.directory}>
    <header className="mira-file-manager__header"><div ref={setToolbarContainer} className="mira-file-manager__toolbar">{!tab.path && <span>文件</span>}</div><button type="button" title={navigation ? '收起目录' : '展开目录'} aria-label={navigation ? '收起目录' : '展开目录'} aria-expanded={navigation} onClick={toggleNavigation}>{navigation ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button></header>
    <Group className="mira-file-manager__body" id={`files-${tab.id}`} elementRef={groupRef}>
      <Panel minSize="160px" className="mira-file-manager__preview">
        {tab.path ? <FilePreviewPanel toolbarContainer={toolbarContainer || undefined} controller={controller} sessionId={target.sessionId || ''} projectId={tab.projectId} rootPath={tab.rootPath} path={tab.path} directory={target.directory} active={active} workspaceWatch={watch} onAddFile={onAddFile} selectedEditor={editorAccess.selectedEditor} onOpenEditor={openEditor} /> : <div className="mira-file-manager__empty"><FolderOpen size={24} /><span>从目录中选择一个文件</span></div>}
      </Panel>
      {navigation && <Separator onPointerDown={() => { resizing.current = true }} onKeyUp={() => preferences.update(target.directory, { width: Math.round(measuredWidth.current) })} className="mira-file-manager__separator" aria-label="调整文件目录宽度" />}
      <Panel id="directory" groupResizeBehavior="preserve-pixel-size" panelRef={directoryPanel} collapsible collapsedSize="0px" defaultSize="192px" onResize={size => { if (size.inPixels >= 160) measuredWidth.current = size.inPixels }} minSize="160px" maxSize="60%" className="mira-file-manager__tree">
        <div className="mira-file-manager__tree-content" aria-hidden={!navigation} inert={!navigation}><ProjectFileDrawer key={rootKey} embedded controller={controller} projectId={tab.projectId} rootPath={tab.rootPath} sessionId={target.sessionId} directory={target.directory} expandedPaths={expanded} selectedPath={tab.path} onExpandedPathsChange={setExpanded} onOpenFile={onNavigate} onOpenBrowser={onOpenBrowser} onAddFile={onAddFile} onBack={toggleNavigation} onOpenDirectory={() => { void controller.revealWorkspaceFile(tab.projectId ? { projectId: tab.projectId, rootPath: tab.rootPath } : { sessionId: target.sessionId! }, '').catch(error => controller.reportError(error)) }} workspaceWatch={watch} onWatchDirectoriesChange={setWatched} editors={editorAccess.editors} onOpenEditor={openEditor} /></div>
      </Panel>
    </Group>
  </section>
}
