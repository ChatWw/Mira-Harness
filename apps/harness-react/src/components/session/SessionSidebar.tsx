/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode sidebar view, expansion and chronological task interactions.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Archive, ArrowDownWideNarrow, Blocks, CalendarClock, ChartNoAxesCombined, Check, ChevronRight, CircleAlert, Clock3, Copy, Folder, FolderOpen, GripVertical, Hash, ListFilter, LoaderCircle, Maximize2, MessageCirclePlus, Minimize2, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Settings, TerminalSquare, Trash2, X } from 'lucide-react'
import type { HarnessProject, HarnessSessionOrderScope, HarnessSessionSummary } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { groupSessions, sessionBadge, sessionMarkdown, splitSessionQueues } from './session-groups'
import { SIDEBAR_PREFERENCE_KEY, SidebarPreferenceStore, type SidebarTaskGroup } from './sidebar-preferences'
import { ArchivedSessions } from './ArchivedSessions'
import { SidebarActionHint, SidebarCollectionSection } from './SidebarCollectionSection'

const PROJECT_LIMIT = 6
const SESSION_LIMIT = 12
const PROJECT_SESSION_LIMIT = 5
const TIMELINE_PAGE_SIZE = 20
type GroupId = 'pinned' | 'recent' | 'ungrouped' | `project:${string}` | `custom:${string}`

export interface SessionDrawerProps {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  width: number
  modal?: boolean
  newTaskOpen?: boolean
  onToggleNewTask?: () => void
  onNewConversation?: () => void
  searchRequest?: number
  onClose: () => void
  onOpenExtensions?: () => void
  extensionsActive?: boolean
  onOpenSession?: (id: string) => void
  onSearch?: () => void
  onOpenAutomations?: () => void
  automationsActive?: boolean
  onNewProjectConversation?: (projectId: string) => void
  onOpenProjectFiles?: (projectId: string) => void
  preferenceStore?: SidebarPreferenceStore
}

/** Keep app shortcuts mounted with the workbench, including when its sidebar is closed. */
export function useHarnessSessionShortcuts(onNewConversation: () => void, onSearch: () => void) {
  const actions = useRef({ onNewConversation, onSearch })
  actions.current = { onNewConversation, onSearch }
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return
      const key = event.key.toLowerCase()
      if (key !== 'n' && key !== 'k') return
      event.preventDefault()
      if (key === 'n') actions.current.onNewConversation()
      else actions.current.onSearch()
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])
}

export function SessionSidebar({ state, controller, width, modal, onNewConversation, searchRequest, onClose, onOpenExtensions, extensionsActive, onOpenSession, onSearch, onOpenAutomations, automationsActive, onNewProjectConversation, onOpenProjectFiles, preferenceStore: sharedPreferenceStore }: SessionDrawerProps) {
  const preferenceStore = useMemo(() => sharedPreferenceStore ?? new SidebarPreferenceStore(() => controller.getPreference(SIDEBAR_PREFERENCE_KEY), value => controller.setPreference(SIDEBAR_PREFERENCE_KEY, value, true)), [controller, sharedPreferenceStore])
  const preferenceState = useSyncExternalStore(preferenceStore.subscribe, preferenceStore.getSnapshot)
  const { expandedProjectIds, view, projectView, sort, groups, hiddenProjectIds, ungroupedSessionOrder } = preferenceState.preferences
  const [archived, setArchived] = useState(false)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [timelineLimit, setTimelineLimit] = useState(TIMELINE_PAGE_SIZE)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [extendedGroups, setExtendedGroups] = useState<Record<string, boolean>>({})
  const [renamingId, setRenamingId] = useState('')
  const [renamingCollection, setRenamingCollection] = useState('')
  const [addingProject, setAddingProject] = useState(false)
  const projectSelection = useRef(false)
  const navigationVersion = useRef(0)
  const latestView = useRef({ extensionsActive, automationsActive })
  latestView.current = { extensionsActive, automationsActive }
  const searchRef = useRef<HTMLInputElement>(null)
  const activeProjectId = state.session?.projectId
  const timeline = view === 'project' && projectView === 'timeline'
  const commandKey = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl '
  const newTask = () => { navigationVersion.current++; if (onNewConversation) onNewConversation(); else controller.newConversation() }
  const openSession = (id: string) => { navigationVersion.current++; if (onOpenSession) onOpenSession(id); else void controller.open(id); if (modal) onClose() }

  useEffect(() => {
    if (sharedPreferenceStore) return
    void preferenceStore.load().catch(() => undefined)
    return controller.registerBeforeNavigation(() => preferenceStore.save())
  }, [controller, preferenceStore, sharedPreferenceStore])
  useEffect(() => {
    if (!preferenceState.ready) return
    const ids = preferenceStore.getSnapshot().preferences.expandedProjectIds
    if (activeProjectId && !ids.includes(activeProjectId) && !preferenceStore.getSnapshot().preferences.collapsedProjectIds.includes(activeProjectId)) preferenceStore.setProjectsExpanded([activeProjectId], true)
  }, [activeProjectId, preferenceStore, preferenceState.ready])
  useEffect(() => {
    if (!searchRequest) return
    setSearchOpen(true)
    searchRef.current?.focus()
  }, [searchRequest])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const model = useMemo(() => groupSessions(state.sessions, state.projects), [state.sessions, state.projects])
  const queues = useMemo(() => splitSessionQueues(model, state.runningSessionIds, Object.keys(state.pendingPermissions)), [model, state.runningSessionIds, state.pendingPermissions])
  const query = search.trim().toLocaleLowerCase()
  const matches = (session: HarnessSessionSummary) => !query || `${session.title} ${session.projectName || ''}`.toLocaleLowerCase().includes(query)
  const ordered = (sessions: HarnessSessionSummary[], manualOrder?: string[]) => {
    if (sort === 'manual') {
      if (!manualOrder) return sessions
      const positions = new Map(manualOrder.map((id, index) => [id, index]))
      return [...sessions].sort((left, right) => (positions.get(left.id) ?? manualOrder.length) - (positions.get(right.id) ?? manualOrder.length))
    }
    return [...sessions].sort((left, right) => sort === 'created' ? right.createdAt - left.createdAt : right.updatedAt - left.updatedAt)
  }
  const groupedIds = new Set(groups.flatMap(group => group.sessionIds))
  const pinned = ordered(model.pinned.filter(matches))
  const attention = ordered(queues.attention.filter(session => matches(session) && (view !== 'group' || !groupedIds.has(session.id))))
  const running = ordered(queues.running.filter(session => matches(session) && (view !== 'group' || !groupedIds.has(session.id))))
  const recent = ordered([...queues.projects.flatMap(entry => entry.sessions), ...queues.recent].filter(matches))
  const allProjects = queues.projects.filter(entry => !hiddenProjectIds.includes(entry.project.id)).map(entry => ({ ...entry, sessions: ordered(entry.sessions.filter(matches)) })).filter(entry => !query || entry.sessions.length > 0 || entry.project.name.toLocaleLowerCase().includes(query))
  const projects = query || showAllProjects ? allProjects : allProjects.slice(0, PROJECT_LIMIT)
  const hiddenProjects = state.projects.filter(project => hiddenProjectIds.includes(project.id))
  const toggleableProjects = state.projects.filter(project => !hiddenProjectIds.includes(project.id)).map(project => project.id)
  const canToggleCollections = !archived && !timeline && !query && (view === 'group' ? groups.length > 0 : toggleableProjects.length > 0)
  const allCollectionsExpanded = view === 'group' ? groups.every(group => !group.collapsed) : toggleableProjects.every(id => expandedProjectIds.includes(id))
  const toggleCollectionsLabel = allCollectionsExpanded ? '全部折叠' : '全部展开'
  const timelineSort = sort === 'created' ? 'created' : 'updated'
  const timelineSessions = useMemo(() => timeline ? [...state.sessions].filter(session => !session.pinned && (!session.projectId || !hiddenProjectIds.includes(session.projectId)) && (!query || `${session.title} ${session.projectName || ''}`.toLocaleLowerCase().includes(query))).sort((left, right) => timelineSort === 'created' ? right.createdAt - left.createdAt : right.updatedAt - left.updatedAt) : [], [timeline, state.sessions, hiddenProjectIds, query, timelineSort])
  const timelineGroups = useMemo(() => groupSidebarTimeline(timelineSessions.slice(0, query ? timelineSessions.length : timelineLimit), timelineSort), [timelineSessions, query, timelineLimit, timelineSort])
  const ungrouped = ordered(recent.filter(session => !groupedIds.has(session.id)), ungroupedSessionOrder)
  const customGroups = groups.map(group => ({ group, sessions: ordered(state.sessions.filter(session => !session.pinned && group.sessionIds.includes(session.id) && (!query || group.name.toLocaleLowerCase().includes(query) || matches(session))), group.sessionIds) })).filter(entry => !query || entry.sessions.length || entry.group.name.toLocaleLowerCase().includes(query))
  const sortable = sort === 'manual' && !timeline && !query && preferenceState.ready
  const groupOf = (id: string): GroupId | undefined => {
    if (model.pinned.some(item => item.id === id)) return 'pinned'
    if (view === 'group') { const group = groups.find(group => group.sessionIds.includes(id)); return group ? `custom:${group.id}` : 'ungrouped' }
    if (model.recent.some(item => item.id === id)) return 'recent'
    const project = model.projects.find(entry => entry.sessions.some(item => item.id === id))
    return project ? `project:${project.project.id}` : undefined
  }
  const idsOf = (group: GroupId) => group === 'pinned' ? model.pinned.map(item => item.id) : group === 'recent' ? model.recent.map(item => item.id) : group === 'ungrouped' ? ungrouped.map(item => item.id) : group.startsWith('custom:') ? groups.find(entry => `custom:${entry.id}` === group)?.sessionIds || [] : model.projects.find(entry => `project:${entry.project.id}` === group)?.sessions.map(item => item.id) || []
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!sortable || !over || active.id === over.id) return
    const activeId = String(active.id), overId = String(over.id)
    if (activeId.startsWith('sidebar-group:') && overId.startsWith('sidebar-group:')) {
      const ids = groups.map(group => `sidebar-group:${group.id}`)
      preferenceStore.change({ groups: arrayMove(groups, ids.indexOf(activeId), ids.indexOf(overId)) })
      return
    }
    if (activeId.startsWith('sidebar-project:') && overId.startsWith('sidebar-project:')) {
      const ids = state.projects.map(project => `sidebar-project:${project.id}`)
      void controller.reorderProjects(arrayMove(state.projects.map(project => project.id), ids.indexOf(activeId), ids.indexOf(overId)))
      return
    }
    const group = groupOf(String(active.id))
    if (!group || group !== groupOf(String(over.id))) return
    const ids = idsOf(group)
    if (group.startsWith('custom:')) { preferenceStore.updateGroup(group.slice('custom:'.length), { sessionIds: arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId)) }); return }
    if (group === 'ungrouped') { preferenceStore.change({ ungroupedSessionOrder: arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId)) }); return }
    const scope: HarnessSessionOrderScope = group === 'pinned' ? { type: 'pinned' } : group === 'recent' ? { type: 'recent' } : { type: 'project', projectId: group.slice('project:'.length) }
    void controller.reorderSessions(scope, arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }
  const rowProps = (session: HarnessSessionSummary) => ({ session, state, controller, groups, groupsReady: preferenceState.ready, currentGroupId: groups.find(group => group.sessionIds.includes(session.id))?.id, onMoveGroup: (groupId?: string) => { if (!controller.getSnapshot().sessions.some(item => item.id === session.id)) return; preferenceStore.moveSessionToGroup(session.id, groupId, groups.find(group => group.sessionIds.includes(session.id))?.id ?? null) }, sortable, active: !extensionsActive && !automationsActive && session.id === state.session?.id, renaming: renamingId === session.id, onBeginRename: () => setRenamingId(session.id), onRename: (title: string) => { setRenamingId(''); if (title.trim()) void controller.renameSession(session.id, title.trim().slice(0, 42)) }, onCancelRename: () => setRenamingId(''), onOpen: () => openSession(session.id) })
  const renderRows = (sessions: HarnessSessionSummary[], limit = SESSION_LIMIT, allowSort = sortable, showProject = false) => <SortableContext items={sessions.map(item => item.id)} strategy={verticalListSortingStrategy}>{sessions.slice(0, limit).map(session => <SessionRow key={session.id} {...rowProps(session)} sortable={allowSort} showProject={showProject} />)}</SortableContext>
  const createGroupTask = async (groupId: string) => {
    const activeId = controller.getSnapshot().session?.id
    const version = navigationVersion.current
    const view = latestView.current
    const session = await controller.createConversation()
    preferenceStore.moveSessionToGroup(session.id, groupId)
    await preferenceStore.save()
    if (navigationVersion.current === version && controller.getSnapshot().session?.id === activeId && latestView.current.extensionsActive === view.extensionsActive && latestView.current.automationsActive === view.automationsActive) openSession(session.id)
  }
  const addProject = async () => {
    if (projectSelection.current) return
    projectSelection.current = true; setAddingProject(true)
    try {
      const project = await controller.selectProject()
      if (project) { const preferences = preferenceStore.getSnapshot().preferences; preferenceStore.change({ hiddenProjectIds: preferences.hiddenProjectIds.filter(id => id !== project.id) }); preferenceStore.setProjectsExpanded([project.id], true) }
    } catch (error) { controller.reportError(error) }
    finally { projectSelection.current = false; setAddingProject(false) }
  }

  return <Tooltip.Provider delayDuration={350}><aside id="pilot-sessions" className="pilot-nav" style={{ width }} role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label="会话">
    {modal && <button type="button" className="pilot-drawer__close" aria-label="关闭会话" onClick={onClose}><X size={15} /></button>}
    <nav className="mira-session-actions" aria-label="任务导航">
      <button type="button" onClick={newTask} aria-label="新建任务"><MessageCirclePlus size={17} /><span>新建任务</span><kbd>{commandKey}N</kbd></button>
      <button type="button" onClick={onSearch || (() => { setSearchOpen(value => !value); if (searchOpen) setSearch('') })} aria-label="搜索会话" aria-expanded={onSearch ? undefined : searchOpen}><Search size={17} /><span>搜索</span><kbd>{commandKey}K</kbd></button>
      <button type="button" aria-current={automationsActive ? 'page' : undefined} onClick={onOpenAutomations || (() => void controller.navigate('/workspace/automations'))}><CalendarClock size={17} /><span>自动化</span></button>
      <button type="button" aria-current={extensionsActive ? 'page' : undefined} onClick={onOpenExtensions || (() => void controller.navigate('/settings/personalization'))}><Blocks size={17} /><span>{onOpenExtensions ? '插件市场' : '技能管理'}</span></button>
    </nav>
    {searchOpen && <div className="mira-session-search"><Search size={14} /><input ref={searchRef} autoFocus value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSearch(''); setSearchOpen(false) } }} placeholder="搜索任务或项目" aria-label="搜索任务或项目" /><button type="button" title="关闭搜索" aria-label="关闭搜索" onClick={() => { setSearch(''); setSearchOpen(false) }}><X size={13} /></button></div>}
    <div className="mira-session-toolbar">
      <div className="mira-session-view" role="group" aria-label="任务视图"><button type="button" aria-pressed={view === 'group' && !archived} onClick={() => { setArchived(false); preferenceStore.change({ view: 'group' }) }}><Hash size={13} />分组</button><button type="button" aria-pressed={view === 'project' && !archived} onClick={() => { setArchived(false); preferenceStore.change({ view: 'project' }) }}><Folder size={13} />项目</button></div>
      {canToggleCollections && <SidebarActionHint title={toggleCollectionsLabel}><button type="button" className="mira-session-icon" aria-label={toggleCollectionsLabel} disabled={!preferenceState.ready} onClick={() => { if (view === 'group') preferenceStore.setGroupsExpanded(!allCollectionsExpanded); else preferenceStore.setProjectsExpanded(toggleableProjects, !allCollectionsExpanded) }}>{allCollectionsExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></SidebarActionHint>}
      {!archived && view === 'group' && <button type="button" className="mira-session-icon" title="新建分组" aria-label="新建分组" disabled={!preferenceState.ready} onClick={() => setRenamingCollection(`sidebar-group:${preferenceStore.createGroup()}`)}><Plus size={15} /></button>}
      {!archived && view === 'project' && <button type="button" className="mira-session-icon" title="添加项目" aria-label="添加项目" disabled={!preferenceState.ready || addingProject} onClick={() => { void addProject() }}>{addingProject ? <LoaderCircle size={15} className="pilot-spin" /> : <Plus size={15} />}</button>}
      <DropdownMenu.Root><SidebarActionHint title={view === 'project' && !archived ? '任务视图选项' : '任务排序'}><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label={view === 'project' && !archived ? '任务视图选项' : '任务排序'}>{view === 'project' && !archived ? <ListFilter size={15} /> : <ArrowDownWideNarrow size={15} />}</button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="end" sideOffset={6} className="mira-session-menu">
        {!archived && view === 'project' && <><DropdownMenu.Label className="mira-session-menu__label">显示方式</DropdownMenu.Label><DropdownMenu.RadioGroup value={projectView} onValueChange={value => { if (value === 'collections' || value === 'timeline') { preferenceStore.change({ projectView: value }); setTimelineLimit(TIMELINE_PAGE_SIZE) } }}><DropdownMenu.RadioItem value="collections" className="mira-session-menu__item"><Folder size={14} />按项目<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem><DropdownMenu.RadioItem value="timeline" className="mira-session-menu__item"><Clock3 size={14} />时间线<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem></DropdownMenu.RadioGroup><DropdownMenu.Separator className="mira-session-menu__separator" /></>}
        <DropdownMenu.Label className="mira-session-menu__label">任务排序</DropdownMenu.Label><DropdownMenu.RadioGroup value={timeline ? timelineSort : sort} onValueChange={value => { preferenceStore.change({ sort: value as typeof sort }); setTimelineLimit(TIMELINE_PAGE_SIZE) }}>{[{ id: 'updated', label: '最近更新' }, { id: 'created', label: '创建时间' }, ...(!archived && !timeline ? [{ id: 'manual', label: '手动排序' }] : [])].map(option => <DropdownMenu.RadioItem key={option.id} value={option.id} className="mira-session-menu__item"><span className="mira-session-menu__indicator"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator></span>{option.label}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
        {!archived && view === 'project' && hiddenProjects.length > 0 && <><DropdownMenu.Separator className="mira-session-menu__separator" /><DropdownMenu.Label className="mira-session-menu__label">恢复隐藏项目</DropdownMenu.Label>{hiddenProjects.map(project => <DropdownMenu.Item key={project.id} className="mira-session-menu__item" onSelect={() => preferenceStore.change({ hiddenProjectIds: hiddenProjectIds.filter(id => id !== project.id) })}><Folder size={14} />{project.name}</DropdownMenu.Item>)}</>}
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      <button type="button" className="mira-session-icon" title={archived ? '返回任务列表' : '查看已归档任务'} aria-label={archived ? '返回任务列表' : '查看已归档任务'} aria-pressed={archived} onClick={() => setArchived(value => !value)}><Archive size={15} /></button>
    </div>
    {preferenceState.error && <div className="mira-session-feedback" role="alert"><CircleAlert size={13} /><span>{preferenceState.error}</span><button type="button" onClick={() => void preferenceStore.retry().catch(() => undefined)}>重试</button></div>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><div className="mira-session-list">
      {pinned.length > 0 && <GroupSection title="置顶" icon={<Pin size={12} />}>{renderRows(pinned, pinned.length)}</GroupSection>}
      {archived ? <ArchivedSessions controller={controller} sort={sort === 'created' ? 'created' : 'updated'} refreshKey={state.sessions.map(item => item.id).join(',')} activeId={extensionsActive || automationsActive ? undefined : state.session?.id} onOpen={openSession} /> : <>
      {!timeline && attention.length > 0 && <GroupSection title="需要处理">{renderRows(attention, attention.length, false)}</GroupSection>}
      {!timeline && running.length > 0 && <GroupSection title="运行中">{renderRows(running, running.length, false)}</GroupSection>}
      {timeline && <><div aria-label="任务时间线">{timelineGroups.map(group => <GroupSection key={group.label} title={group.label}>{renderRows(group.sessions, group.sessions.length, false, true)}</GroupSection>)}</div>{!query && timelineSessions.length > timelineLimit && <button type="button" className="mira-session-more" onClick={() => setTimelineLimit(limit => limit + TIMELINE_PAGE_SIZE)}>显示更多任务</button>}{!timelineSessions.length && !query && <p className="mira-session-hint">暂无任务</p>}</>}
      {!timeline && <>
      {view === 'group' ? <><SortableContext items={customGroups.map(({ group }) => `sidebar-group:${group.id}`)} strategy={verticalListSortingStrategy}>{customGroups.map(({ group, sessions }) => <SidebarCollectionSection key={group.id} id={`sidebar-group:${group.id}`} name={group.name} color={group.color} count={sessions.length} expanded={Boolean(query) || !group.collapsed} sortable={sortable} renaming={renamingCollection === `sidebar-group:${group.id}`} onToggle={() => preferenceStore.updateGroup(group.id, { collapsed: !group.collapsed })} onBeginRename={() => setRenamingCollection(`sidebar-group:${group.id}`)} onCancelRename={() => setRenamingCollection('')} onRename={name => preferenceStore.updateGroup(group.id, { name })} onColor={color => preferenceStore.updateGroup(group.id, { color })} onNewTask={() => createGroupTask(group.id)} onUngroup={() => preferenceStore.removeGroup(group.id)}>{renderRows(sessions, extendedGroups[`group:${group.id}`] || query ? sessions.length : PROJECT_SESSION_LIMIT)}{!sessions.length && <p className="mira-session-hint">暂无任务</p>}{sessions.length > PROJECT_SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setExtendedGroups(previous => ({ ...previous, [`group:${group.id}`]: !previous[`group:${group.id}`] }))}>{extendedGroups[`group:${group.id}`] ? '收起' : `显示全部 ${sessions.length} 个任务`}</button>}</SidebarCollectionSection>)}</SortableContext><GroupSection title="未分组"><div role="group" aria-label="未分组任务">{renderRows(ungrouped, showAllRecent || query ? ungrouped.length : SESSION_LIMIT)}{ungrouped.length > SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllRecent(value => !value)}>{showAllRecent ? '收起' : '显示更多'}</button>}</div></GroupSection></> : <><SortableContext items={projects.map(({ project }) => `sidebar-project:${project.id}`)} strategy={verticalListSortingStrategy}>
        {projects.map(({ project, sessions }) => {
          const expanded = Boolean(query) || expandedProjectIds.includes(project.id)
          const showAll = Boolean(extendedGroups[project.id])
          return <SidebarCollectionSection key={project.id} id={`sidebar-project:${project.id}`} name={project.name} directory={project.directory} count={sessions.length} expanded={expanded} sortable={sortable} disabled={!project.directoryExists} renaming={renamingCollection === `sidebar-project:${project.id}`} onToggle={() => { if (preferenceState.ready) preferenceStore.setProjectsExpanded([project.id], !expandedProjectIds.includes(project.id)) }} onBeginRename={() => setRenamingCollection(`sidebar-project:${project.id}`)} onCancelRename={() => setRenamingCollection('')} onRename={name => controller.renameProject(project.id, name)} onNewTask={() => { navigationVersion.current++; return onNewProjectConversation ? onNewProjectConversation(project.id) : controller.create(project.id).then(() => undefined) }} onOpenFiles={onOpenProjectFiles ? () => { navigationVersion.current++; onOpenProjectFiles(project.id) } : undefined} onOpenDirectory={target => controller.openProject(project.id, target)} onHide={preferenceState.ready ? () => preferenceStore.change({ hiddenProjectIds: [...hiddenProjectIds, project.id] }) : undefined}>{renderRows(sessions, showAll || query ? sessions.length : PROJECT_SESSION_LIMIT)}{!sessions.length && <p className="mira-session-hint">暂无任务</p>}{sessions.length > PROJECT_SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setExtendedGroups(previous => ({ ...previous, [project.id]: !previous[project.id] }))}>{showAll ? '收起' : `显示全部 ${sessions.length} 个任务`}</button>}</SidebarCollectionSection>
        })}
        </SortableContext>
        {allProjects.length > PROJECT_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllProjects(value => !value)}>{showAllProjects ? '收起项目' : '显示更多项目'}</button>}
        {queues.recent.filter(matches).length > 0 && <GroupSection title="个人工作区">{renderRows(ordered(queues.recent.filter(matches)), showAllRecent || query ? queues.recent.length : SESSION_LIMIT)}{queues.recent.length > SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllRecent(value => !value)}>{showAllRecent ? '收起' : '显示更多'}</button>}</GroupSection>}
      </>}
      {query && !pinned.length && !attention.length && !running.length && !recent.length && <p className="mira-session-hint">没有匹配的任务</p>}
      {!query && !state.sessions.length && <p className="mira-session-hint">新建任务后，对话会显示在这里。</p>}
      </>}
      {timeline && query && !pinned.length && !timelineSessions.length && <p className="mira-session-hint">没有匹配的任务</p>}
      </>}
    </div></DndContext>
    <SidebarFooter controller={controller} />
  </aside></Tooltip.Provider>
}

export const SessionDrawer = SessionSidebar

/** Same date buckets as ZCode, using local calendar days across daylight-saving changes. */
export function groupSidebarTimeline(sessions: HarnessSessionSummary[], sort: 'created' | 'updated', now = Date.now()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const week = new Date(today)
  week.setDate(week.getDate() - (week.getDay() + 6) % 7)
  const lastWeek = new Date(week)
  lastWeek.setDate(lastWeek.getDate() - 7)
  const month = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime()
  const groups: Array<{ label: string; sessions: HarnessSessionSummary[] }> = []
  for (const session of sessions) {
    const date = new Date(sort === 'created' ? session.createdAt : session.updatedAt)
    date.setHours(0, 0, 0, 0)
    const days = (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86_400_000
    const label = days <= 0 ? '今天' : days === 1 ? '昨天' : days <= 3 ? `${days} 天前` : date >= week ? '本周' : date >= lastWeek ? '上周' : date.getTime() >= month ? '本月' : date.getTime() >= lastMonth ? '上个月' : '更早'
    const group = groups.find(group => group.label === label)
    if (group) group.sessions.push(session)
    else groups.push({ label, sessions: [session] })
  }
  return groups
}

function SidebarFooter({ controller }: { controller: PilotController }) {
  return <footer className="mira-session-footer" aria-label="工作台设置">
    <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-session-footer__profile" aria-label="工作台菜单"><span className="mira-session-footer__avatar">M</span><span>Mira</span><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-session-menu" side="top" align="start" sideOffset={6}>
      <DropdownMenu.Item className="mira-session-menu__item" onSelect={() => void controller.navigate('/settings/personalization')}><Blocks size={14} />技能管理</DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" onSelect={() => void controller.navigate('/settings/mcp')}><TerminalSquare size={14} />MCP 工具</DropdownMenu.Item>
      <DropdownMenu.Item className="mira-session-menu__item" onSelect={() => void controller.navigate('/workspace/usage')}><ChartNoAxesCombined size={14} />用量与成本</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    <button type="button" className="mira-session-icon" aria-label="打开设置" title="设置" onClick={() => void controller.navigate('/settings/general')}><Settings size={16} /></button>
  </footer>
}

async function copyText(value: string) { try { await navigator.clipboard.writeText(value) } catch { const area = document.createElement('textarea'); area.value = value; document.body.appendChild(area); area.select(); try { document.execCommand('copy') } finally { area.remove() } } }
function GroupSection({ title, icon, expanded, onToggle, children }: { title: string; icon?: ReactNode; expanded?: boolean; onToggle?: () => void; children: ReactNode }) { return <section className="mira-session-group">{onToggle ? <button type="button" className="mira-session-group__head" aria-expanded={expanded} onClick={onToggle}><ChevronRight size={12} className={expanded ? 'is-open' : ''} /><Folder size={13} /><span>{title}</span></button> : <div className="mira-session-group__head">{icon}<span>{title}</span></div>}{children}</section> }
function relativeTime(value: number) { const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000)); return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes}分` : minutes < 1440 ? `${Math.floor(minutes / 60)}时` : `${Math.floor(minutes / 1440)}天` }

function SessionRow({ session, state, controller, groups, groupsReady, currentGroupId, onMoveGroup, active, sortable, renaming, showProject, onBeginRename, onRename, onCancelRename, onOpen }: { session: HarnessSessionSummary; state: ReturnType<PilotController['getSnapshot']>; controller: PilotController; groups: SidebarTaskGroup[]; groupsReady: boolean; currentGroupId?: string; onMoveGroup: (groupId?: string) => void; active: boolean; sortable: boolean; renaming: boolean; showProject?: boolean; onBeginRename: () => void; onRename: (title: string) => void; onCancelRename: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id, disabled: renaming || !sortable })
  const [title, setTitle] = useState(session.title)
  const [error, setError] = useState('')
  useEffect(() => { if (!renaming) setTitle(session.title) }, [renaming, session.title])
  const badge = sessionBadge(session, { running: state.runningSessionIds.includes(session.id), unread: state.unreadSessionIds.includes(session.id), pending: Boolean(state.pendingPermissions[session.id]) })
  const run = (action: () => Promise<unknown>) => {
    setError('')
    void action().then(value => { if (typeof value === 'string' && value) throw new Error(value) }).catch(cause => setError(cause instanceof Error ? cause.message : '操作失败，请重试'))
  }
  const menuProps = { session, projects: state.projects, controller, groups, groupsReady, currentGroupId, onMoveGroup, onRename: onBeginRename, run }
  return <ContextMenu.Root>
    <ContextMenu.Trigger asChild disabled={renaming}>
      <div ref={setNodeRef} className={`mira-session-row${showProject ? ' mira-session-row--timeline' : ''}${active ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
        {renaming ? <form className="mira-session-rename" onSubmit={event => { event.preventDefault(); onRename(title) }}><input autoFocus value={title} maxLength={42} aria-label="会话标题" onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancelRename() } }} /><button type="submit" aria-label="保存标题"><Check size={14} /></button></form> : <>
          {sortable && <button type="button" className="mira-session-row__grip" aria-label={`拖拽排序 ${session.title}`} {...attributes} {...listeners}><GripVertical size={12} /></button>}
          <button type="button" className="mira-session-row__open" onClick={onOpen} aria-current={active ? 'page' : undefined} title={`${session.title}\n${session.workingDirectory || session.projectName || '个人工作区'}`}><span>{session.title || '新任务'}</span>{showProject && <span className="mira-session-row__project">{session.projectName || state.projects.find(project => project.id === session.projectId)?.name || '个人工作区'}</span>}</button>
          {badge && <span className={`mira-session-status mira-session-status--${badge.kind}`} title={badge.label} aria-label={badge.label}>{badge.kind === 'unread' ? <span /> : badge.kind === 'running' || badge.kind === 'plan' && session.planStatus === 'executing' ? <LoaderCircle size={12} className="pilot-spin" /> : <CircleAlert size={12} />}</span>}
          {!badge && session.status === 'failed' && <CircleAlert size={12} className="mira-session-status--failed" aria-label="执行失败" />}
          <time className="mira-session-row__time" dateTime={new Date(session.updatedAt).toISOString()} title={new Date(session.updatedAt).toLocaleString()}>{relativeTime(session.updatedAt)}</time>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="mira-session-row__more" title="任务操作" aria-label={`${session.title} 的操作`}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="start" sideOffset={4} className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}><SessionMenuItems kind="dropdown" {...menuProps} /></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        </>}
        {error && <span className="mira-session-row__error" role="alert">{error}</span>}
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Portal container={document.getElementById('root')}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}><SessionMenuItems kind="context" {...menuProps} /></ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>
}

export function SessionMenuItems({ kind = 'context', session, projects, controller, groups, groupsReady = true, currentGroupId, onMoveGroup, onRename, run }: { kind?: 'context' | 'dropdown'; session: HarnessSessionSummary; projects: HarnessProject[]; controller: PilotController; groups?: SidebarTaskGroup[]; groupsReady?: boolean; currentGroupId?: string; onMoveGroup?: (groupId?: string) => void; onRename: () => void; run: (action: () => Promise<unknown>) => void }) {
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu
  const portal = document.getElementById('root')
  return <>
    <Menu.Item className="mira-session-menu__item" onSelect={onRename}><Pencil size={14} />重命名</Menu.Item>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionPinned(session.id, !session.pinned))}>{session.pinned ? <PinOff size={14} /> : <Pin size={14} />}{session.pinned ? '取消置顶' : '置顶'}</Menu.Item>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionUnread(session.id, !session.unread))}><Check size={14} />{session.unread ? '标记为已读' : '标记为未读'}</Menu.Item>
    {onMoveGroup && <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item" disabled={!groupsReady}><Hash size={14} />{groupsReady ? '移动到分组' : '正在读取分组…'}<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu"><Menu.Item className="mira-session-menu__item" disabled={!currentGroupId || !groupsReady} onSelect={() => { if (groupsReady && currentGroupId) onMoveGroup() }}><X size={14} />移出分组</Menu.Item><Menu.Separator className="mira-session-menu__separator" />{groups?.length ? groups.map(group => <Menu.Item key={group.id} className="mira-session-menu__item" disabled={!groupsReady || group.id === currentGroupId} onSelect={() => { if (groupsReady && group.id !== currentGroupId) onMoveGroup(group.id) }}><span className="mira-collection-swatch" data-group-color={group.color} />{group.name}</Menu.Item>) : <Menu.Item className="mira-session-menu__item" disabled>暂无分组</Menu.Item>}</Menu.SubContent></Menu.Portal></Menu.Sub>}
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><FolderOpen size={14} />移动到项目<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>{projects.length ? projects.map(project => <Menu.Item key={project.id} className="mira-session-menu__item" disabled={project.id === session.projectId || !project.directoryExists} onSelect={() => run(() => controller.moveSession(session.id, project.id))}><Folder size={14} />{project.name}</Menu.Item>) : <Menu.Item className="mira-session-menu__item" disabled>暂无项目</Menu.Item>}</Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.archiveSession(session.id))}><Archive size={14} />归档</Menu.Item>
    <Menu.Separator className="mira-session-menu__separator" />
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><Copy size={14} />复制<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => copyText(session.workingDirectory || ''))}>工作目录</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => copyText(session.id))}>会话 ID</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(async () => copyText(sessionMarkdown(await controller.getSession(session.id))))}>复制为 Markdown</Menu.Item>
    </Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><TerminalSquare size={14} />打开方式<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => controller.openSessionProject(session.id, 'file-manager'))}>文件管理器</Menu.Item>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => controller.openSessionProject(session.id, 'terminal'))}>终端</Menu.Item>
    </Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Separator className="mira-session-menu__separator" />
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item mira-session-menu__item--danger"><Trash2 size={14} />删除会话<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}><Menu.Label className="mira-session-menu__label">删除后无法恢复</Menu.Label><Menu.Item className="mira-session-menu__item mira-session-menu__item--danger" onSelect={() => run(() => controller.deleteSession(session.id))}>确认删除「{session.title || '新任务'}」</Menu.Item></Menu.SubContent></Menu.Portal></Menu.Sub>
  </>
}
