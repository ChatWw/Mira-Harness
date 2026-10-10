/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode sidebar view, expansion and chronological task interactions.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, rectIntersection, useDndContext, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Archive, ArrowDownWideNarrow, ArrowUpToLine, Blocks, CalendarClock, ChartNoAxesCombined, Check, ChevronRight, CircleAlert, Clock3, Copy, Folder, FolderOpen, GripVertical, Hash, ListFilter, ListTree, LoaderCircle, Maximize2, MessageCirclePlus, Minimize2, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Settings, TerminalSquare, Trash2, X } from 'lucide-react'
import type { HarnessProject, HarnessSessionOrderScope, HarnessSessionSummary } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { groupSessions, moveSidebarTask, relativeSessionTime, sessionBadge, sessionMarkdown, sidebarRootItems, splitSessionQueues, type SidebarDropTarget } from './session-groups'
import { SIDEBAR_PREFERENCE_KEY, SidebarPreferenceStore, type SidebarGroupingOrder, type SidebarTaskGroup } from './sidebar-preferences'
import { ArchivedSessions } from './ArchivedSessions'
import { SidebarActionHint, SidebarCollectionSection, type SidebarCollectionProps } from './SidebarCollectionSection'
import { MiraSidebarSection } from './MiraSidebarSection'
import { MiraSidebarStickyHeader } from './MiraSidebarStickyHeader'
import { MiraSidebarVirtualList } from './MiraSidebarVirtualList'

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
  draft?: { draftId: string; groupId?: string; selected: boolean; preparedSessionId?: string; workspaceLabel?: string }
  onNewGroupConversation?: (groupId: string) => void | Promise<unknown>
  onOpenDraft?: (draftId: string) => void | Promise<unknown>
  onCloseDraft?: (draftId: string) => void | Promise<unknown>
  onOpenProjectFiles?: (projectId: string) => void
  onOpenSessionFiles?: (id: string) => void | Promise<void>
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

export function SessionSidebar({ state, controller, width, modal, onNewConversation, searchRequest, onClose, onOpenExtensions, extensionsActive, onOpenSession, onSearch, onOpenAutomations, automationsActive, onNewProjectConversation, draft, onNewGroupConversation, onOpenDraft, onCloseDraft, onOpenProjectFiles, onOpenSessionFiles, preferenceStore: sharedPreferenceStore }: SessionDrawerProps) {
  const preferenceStore = useMemo(() => sharedPreferenceStore ?? new SidebarPreferenceStore(() => controller.getPreference(SIDEBAR_PREFERENCE_KEY), value => controller.setPreference(SIDEBAR_PREFERENCE_KEY, value, true)), [controller, sharedPreferenceStore])
  const preferenceState = useSyncExternalStore(preferenceStore.subscribe, preferenceStore.getSnapshot)
  const [dragPreview, setDragPreview] = useState<SidebarGroupingOrder>()
  const [draggingId, setDraggingId] = useState('')
  const [draggedGroupId, setDraggedGroupId] = useState('')
  const [draggedSectionId, setDraggedSectionId] = useState('')
  const dragOrigin = useRef<{ id: string; groupId?: string } | undefined>(undefined)
  const dragActiveId = useRef('')
  const lastDrop = useRef<SidebarDropTarget | undefined>(undefined)
  const dragDirection = useRef<'before' | 'after'>('after')
  const dragY = useRef(0)
  const previewPosition = useRef<{ x: number; y: number } | undefined>(undefined)
  const { projectSectionOpen, personalSectionOpen, sectionOrder, expandedProjectIds, view, projectView, sort, hiddenProjectIds } = preferenceState.preferences
  const { groups, ungroupedSessionOrder, groupedRootOrder } = dragPreview ?? preferenceState.preferences
  const [archived, setArchived] = useState(false)
  const [archivedActions, setArchivedActions] = useState<HTMLDivElement | null>(null)
  const [sidebarScrollElement, setSidebarScrollElement] = useState<HTMLDivElement | null>(null)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [timelineLimit, setTimelineLimit] = useState(TIMELINE_PAGE_SIZE)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [projectTaskLimits, setProjectTaskLimits] = useState<Record<string, number>>({})
  const [renamingId, setRenamingId] = useState('')
  const [archiveConfirmingId, setArchiveConfirmingId] = useState('')
  const [renamingCollection, setRenamingCollection] = useState('')
  const [addingProject, setAddingProject] = useState(false)
  const projectSelection = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const activeProjectId = state.session?.projectId
  const timeline = view === 'project' && projectView === 'timeline'
  const commandKey = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl '
  const newTask = () => { if (onNewConversation) onNewConversation(); else controller.newConversation() }
  const openSession = (id: string) => { if (onOpenSession) onOpenSession(id); else void controller.open(id); if (modal) onClose() }

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
  useEffect(() => { setArchiveConfirmingId('') }, [view, projectView, archived, renamingId])
  useEffect(() => {
    if (archiveConfirmingId && !state.sessions.some(session => session.id === archiveConfirmingId)) setArchiveConfirmingId('')
  }, [archiveConfirmingId, state.sessions])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: (event, args) => {
    if (!String(args.context.active?.id).startsWith('sidebar-section:')) return sortableKeyboardCoordinates(event, args)
    // Section keys must skip nested project/task droppables in this shared context.
    const containers = args.context.droppableContainers.getEnabled().filter(container => String(container.id).startsWith('sidebar-section:'))
    if (!args.context.collisionRect || !['ArrowUp', 'ArrowDown'].includes(event.code)) return
    const currentId = String(args.context.over?.id).startsWith('sidebar-section:') ? args.context.over?.id : args.context.active?.id
    const index = sectionOrder.findIndex(id => `sidebar-section:${id}` === String(currentId))
    const nextId = sectionOrder[index + (event.code === 'ArrowDown' ? 1 : -1)]
    const rectangle = containers.find(container => container.id === `sidebar-section:${nextId}`) && args.context.droppableRects.get(`sidebar-section:${nextId}`)
    if (!rectangle) return
    event.preventDefault()
    return { x: rectangle.left, y: rectangle.top }
  } }))
  const sessions = useMemo(() => state.sessions.filter(session => session.id !== draft?.preparedSessionId), [state.sessions, draft?.preparedSessionId])
  const model = useMemo(() => groupSessions(sessions, state.projects), [sessions, state.projects])
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
  const groupBySession = new Map(groups.flatMap(group => group.sessionIds.map(id => [id, group.id] as const)))
  const groupedIds = new Set(groupBySession.keys())
  const sessionById = new Map(sessions.map(session => [session.id, session]))
  const projectIds = new Set(state.projects.map(project => project.id))
  const pinned = ordered(model.pinned.filter(matches))
  const attention = ordered(queues.attention.filter(session => matches(session) && (view !== 'group' || !groupedIds.has(session.id))))
  const running = ordered(queues.running.filter(session => matches(session) && (view !== 'group' || !groupedIds.has(session.id))))
  const recent = ordered([...queues.projects.flatMap(entry => entry.sessions), ...queues.recent].filter(matches))
  const allProjects = model.projects.filter(entry => !hiddenProjectIds.includes(entry.project.id)).map(entry => ({ ...entry, sessions: ordered(entry.sessions.filter(matches)) })).filter(entry => !query || entry.sessions.length > 0 || entry.project.name.toLocaleLowerCase().includes(query))
  const projects = query || showAllProjects ? allProjects : allProjects.slice(0, PROJECT_LIMIT)
  const visibleProjectIds = JSON.stringify(projects.map(entry => entry.project.id))
  useEffect(() => {
    const visible = new Set(view === 'project' && !timeline && !archived && projectSectionOpen ? projects.filter(entry => expandedProjectIds.includes(entry.project.id)).map(entry => entry.project.id) : [])
    setProjectTaskLimits(previous => {
      const entries = Object.entries(previous).filter(([id]) => visible.has(id))
      return entries.length === Object.keys(previous).length ? previous : Object.fromEntries(entries)
    })
  }, [view, timeline, archived, projectSectionOpen, expandedProjectIds, visibleProjectIds])
  const hiddenProjects = state.projects.filter(project => hiddenProjectIds.includes(project.id))
  const toggleableProjects = state.projects.filter(project => !hiddenProjectIds.includes(project.id)).map(project => project.id)
  const canToggleCollections = !archived && !timeline && !query && (view === 'group' ? groups.length > 0 : toggleableProjects.length > 0)
  const allCollectionsExpanded = view === 'group' ? groups.every(group => !group.collapsed) : projectSectionOpen && toggleableProjects.every(id => expandedProjectIds.includes(id))
  const toggleCollectionsLabel = allCollectionsExpanded ? '全部折叠' : '全部展开'
  const timelineSort = sort === 'created' ? 'created' : 'updated'
  const timelineSessions = useMemo(() => timeline ? [...sessions].filter(session => !session.pinned && (!session.projectId || !hiddenProjectIds.includes(session.projectId)) && (!query || `${session.title} ${session.projectName || ''}`.toLocaleLowerCase().includes(query))).sort((left, right) => timelineSort === 'created' ? right.createdAt - left.createdAt : right.updatedAt - left.updatedAt) : [], [timeline, sessions, hiddenProjectIds, query, timelineSort])
  const timelineGroups = useMemo(() => groupSidebarTimeline(timelineSessions.slice(0, query ? timelineSessions.length : timelineLimit), timelineSort), [timelineSessions, query, timelineLimit, timelineSort])
  const draftGroupId = groups.some(group => group.id === draft?.groupId) ? draft?.groupId : undefined
  const showDraft = Boolean(draft && (!query || `新任务 ${draft.workspaceLabel || '个人工作区'} ${groups.find(group => group.id === draftGroupId)?.name || ''}`.toLocaleLowerCase().includes(query)))
  const ungrouped = ordered(sessions.filter(session => !session.pinned && !groupedIds.has(session.id) && matches(session)), ungroupedSessionOrder)
  const customGroups = useMemo(() => groups.map(group => ({ group, sessions: ordered(sessions.filter(session => !session.pinned && group.sessionIds.includes(session.id) && (!query || group.name.toLocaleLowerCase().includes(query) || matches(session))), group.sessionIds) })).filter(entry => !query || entry.sessions.length || entry.group.name.toLocaleLowerCase().includes(query) || showDraft && entry.group.id === draftGroupId), [groups, sessions, sort, query, showDraft, draftGroupId])
  const stickyGroups = useMemo(() => customGroups.map(({ group, sessions }) => ({ id: group.id, name: group.name, color: group.color, count: sessions.length + (showDraft && draftGroupId === group.id ? 1 : 0), collapsed: !query && (group.collapsed || group.id === draggedGroupId), renaming: renamingCollection === `sidebar-group:${group.id}` })), [customGroups, query, showDraft, draftGroupId, draggedGroupId, renamingCollection])
  const rootItems = sidebarRootItems(customGroups.map(item => item.group), ungrouped.map(session => session.id), sort === 'manual' ? groupedRootOrder : [])
  const rootSessionById = new Map(ungrouped.map(session => [session.id, session]))
  const collectionById = new Map(customGroups.map(entry => [entry.group.id, entry]))
  const sortable = sort === 'manual' && !timeline && !query && !archived && preferenceState.ready
  const sectionSortable = view === 'project' && !timeline && !query && !archived && preferenceState.ready
  const groupOf = (id: string): GroupId | undefined => {
    const session = sessionById.get(id)
    if (!session) return
    if (session.pinned) return 'pinned'
    if (view === 'group') { const groupId = groupBySession.get(id); return groupId ? `custom:${groupId}` : 'ungrouped' }
    return session.projectId && projectIds.has(session.projectId) ? `project:${session.projectId}` : 'recent'
  }
  const idsOf = (group: GroupId) => group === 'pinned' ? model.pinned.map(item => item.id) : group === 'recent' ? model.recent.map(item => item.id) : group === 'ungrouped' ? ungrouped.map(item => item.id) : group.startsWith('custom:') ? groups.find(entry => `custom:${entry.id}` === group)?.sessionIds || [] : model.projects.find(entry => `project:${entry.project.id}` === group)?.sessions.map(item => item.id) || []
  const resetDrag = () => { dragOrigin.current = undefined; dragActiveId.current = ''; lastDrop.current = undefined; previewPosition.current = undefined; dragY.current = 0; dragDirection.current = 'after'; setDragPreview(undefined); setDraggingId(''); setDraggedGroupId(''); setDraggedSectionId('') }
  const handleDragStart = ({ active }: DragStartEvent) => {
    resetDrag()
    const id = String(active.id)
    if (id.startsWith('sidebar-section:')) { if (sectionSortable) { dragActiveId.current = id; setDraggedSectionId(id) }; return }
    if (!sortable) return
    dragActiveId.current = id
    if (view === 'group' && id.startsWith('sidebar-group:')) setDraggedGroupId(id.slice('sidebar-group:'.length))
    const session = controller.getSnapshot().sessions.find(item => item.id === id && item.id !== draft?.preparedSessionId)
    if (view === 'group' && session && !session.pinned) { const groupId = preferenceStore.getSnapshot().preferences.groups.find(group => group.sessionIds.includes(id))?.id; dragOrigin.current = { id, groupId }; setDraggingId(id) }
  }
  const taskDropTarget = (event: DragOverEvent | DragMoveEvent | DragEndEvent): SidebarDropTarget | undefined => {
    if (!event.over) return
    const id = String(event.over.id), preferences = preferenceStore.getSnapshot().preferences
    const position = dragDirection.current
    const section = /^(sidebar-head|sidebar-tail|sidebar-drop):(.+)$/.exec(id)
    if (section) {
      const group = preferences.groups.find(group => group.id === section[2])
      if (!group) return
      if (section[1] === 'sidebar-drop') return { type: 'group', id: group.id, position: 'start' }
      if (group.collapsed || section[1] === 'sidebar-head' && position === 'before' || section[1] === 'sidebar-tail' && position === 'after') return { type: 'root', near: { type: 'group', id: group.id }, position }
      return { type: 'group', id: group.id, position: section[1] === 'sidebar-head' ? 'start' : 'end' }
    }
    if (id === 'sidebar-root:end') return { type: 'root', position: 'after' }
    if (!controller.getSnapshot().sessions.some(session => session.id === id && !session.pinned && session.id !== draft?.preparedSessionId) || id === String(event.active.id)) return
    return { type: 'session', id, position }
  }
  const rootIds = (preferences = preferenceStore.getSnapshot().preferences) => {
    const assigned = new Set(preferences.groups.flatMap(group => group.sessionIds))
    return ordered(controller.getSnapshot().sessions.filter(session => !session.pinned && !assigned.has(session.id) && session.id !== draft?.preparedSessionId), preferences.ungroupedSessionOrder).map(session => session.id)
  }
  const previewDrop = (event: DragOverEvent | DragMoveEvent) => {
    if (!dragOrigin.current || !sortable) return
    if (event.over?.id === event.active.id) return
    const target = taskDropTarget(event)
    if (JSON.stringify(target) === JSON.stringify(lastDrop.current)) return
    // Layout measurement can change `over` after a preview without sensor movement.
    // Accept one placement per position; another pointer/key move can retarget it.
    if (previewPosition.current?.x === event.delta.x && previewPosition.current.y === event.delta.y) return
    previewPosition.current = { x: event.delta.x, y: event.delta.y }
    lastDrop.current = target
    setDragPreview(target ? moveSidebarTask(preferenceStore.getSnapshot().preferences, rootIds(), dragOrigin.current.id, target) : undefined)
  }
  const handleDragMove = (event: DragMoveEvent) => {
    if (event.delta.y !== dragY.current) { dragDirection.current = event.delta.y > dragY.current ? 'after' : 'before'; dragY.current = event.delta.y }
    previewDrop(event)
  }
  const collisionDetection: CollisionDetection = args => {
    const id = String(args.active.id)
    if (id.startsWith('sidebar-section:')) return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => String(container.id).startsWith('sidebar-section:')) })
    // A cross-group preview replaces an empty target with the active placeholder.
    // Keep that target while the pointer is inside it, instead of bouncing to an edge.
    if (dragOrigin.current && lastDrop.current && args.pointerCoordinates) {
      const placeholder = args.droppableContainers.filter(container => String(container.id) === id)
      const hits = pointerWithin({ ...args, droppableContainers: placeholder })
      if (hits.length) return hits
    }
    const containers = args.droppableContainers.filter(container => {
      const targetId = String(container.id)
      const session = sessionById.get(targetId)
      if (targetId === id) return false
      if (id.startsWith('sidebar-project:')) return targetId.startsWith('sidebar-project:')
      if (id.startsWith('sidebar-group:')) return targetId.startsWith('sidebar-group:') || Boolean(session && !session.pinned && !groupedIds.has(targetId))
      if (view === 'group' && groupOf(id) !== 'pinned') return !targetId.startsWith('sidebar-group:') && (targetId.startsWith('sidebar-head:') || targetId.startsWith('sidebar-tail:') || targetId.startsWith('sidebar-drop:') || targetId === 'sidebar-root:end' || Boolean(session && !session.pinned))
      return Boolean(session && groupOf(id) === groupOf(targetId))
    })
    const hits = args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers: containers }) : rectIntersection({ ...args, droppableContainers: containers })
    return hits.length ? hits : closestCenter({ ...args, droppableContainers: containers })
  }
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (dragActiveId.current !== String(active.id)) { resetDrag(); return }
    const origin = dragOrigin.current, target = lastDrop.current ?? taskDropTarget({ active, over } as DragEndEvent)
    resetDrag()
    if (String(active.id).startsWith('sidebar-section:')) {
      const preferences = preferenceStore.getSnapshot().preferences
      if (!sectionSortable || !over || !preferenceStore.getSnapshot().ready || preferences.view !== 'project' || preferences.projectView !== 'collections') return
      const from = preferences.sectionOrder.findIndex(id => `sidebar-section:${id}` === String(active.id)), to = preferences.sectionOrder.findIndex(id => `sidebar-section:${id}` === String(over.id))
      if (from >= 0 && to >= 0 && from !== to) void preferenceStore.applySectionDrop(arrayMove(preferences.sectionOrder, from, to)).catch(() => undefined)
      return
    }
    if (!sortable || !over || active.id === over.id && !origin) return
    const activeId = String(active.id), overId = String(over.id)
    const preferences = preferenceStore.getSnapshot().preferences
    if (!preferenceStore.getSnapshot().ready || preferences.sort !== 'manual' || preferences.view !== view || preferences.view === 'project' && preferences.projectView === 'timeline') return
    if (view === 'group' && !activeId.startsWith('sidebar-group:') && groupOf(activeId) !== 'pinned') {
      const session = controller.getSnapshot().sessions.find(item => item.id === activeId && !item.pinned && item.id !== draft?.preparedSessionId)
      const sourceGroupId = preferences.groups.find(group => group.sessionIds.includes(activeId))?.id
      if (!session || !target || !origin || origin.id !== activeId || origin.groupId !== sourceGroupId) return
      if (target.type === 'session' && !controller.getSnapshot().sessions.some(item => item.id === target.id && !item.pinned)) return
      if (target.type === 'group' && preferences.groups.find(group => group.id === target.id)?.collapsed) return
      const patch = moveSidebarTask(preferences, rootIds(preferences), activeId, target)
      if (patch) void preferenceStore.applyGroupDrop(patch).catch(() => undefined)
      return
    }
    if (view === 'group' && activeId.startsWith('sidebar-group:')) {
      const roots = sidebarRootItems(preferences.groups, rootIds(preferences), preferences.groupedRootOrder)
      const activeIndex = roots.findIndex(item => item.type === 'group' && `sidebar-group:${item.id}` === activeId)
      const overIndex = roots.findIndex(item => item.type === 'group' ? `sidebar-group:${item.id}` === overId : item.id === overId)
      if (activeIndex < 0 || overIndex < 0) return
      const next = arrayMove(roots, activeIndex, overIndex)
      const byId = new Map(preferences.groups.map(group => [group.id, group]))
      void preferenceStore.applyGroupDrop({ groups: next.filter(item => item.type === 'group').map(item => byId.get(item.id)!), groupedRootOrder: next, ungroupedSessionOrder: next.filter(item => item.type === 'session').map(item => item.id) }).catch(() => undefined)
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
  const moveTaskToTop = async (id: string) => {
    const { ready, preferences } = preferenceStore.getSnapshot()
    if (!ready || preferences.view !== 'group' || preferences.sort !== 'manual' || !controller.getSnapshot().sessions.some(session => session.id === id && !session.pinned)) return
    const roots = rootIds(preferences)
    const near = sidebarRootItems(preferences.groups, roots, preferences.groupedRootOrder).find(item => item.type !== 'session' || item.id !== id)
    const patch = moveSidebarTask(preferences, roots, id, { type: 'root', near, position: 'before' })
    if (patch) await preferenceStore.applyGroupDrop(patch)
  }
  const rowProps = (session: HarnessSessionSummary) => ({ session, state, controller, groups, groupsReady: preferenceState.ready, currentGroupId: groups.find(group => group.sessionIds.includes(session.id))?.id, onMoveGroup: (groupId?: string) => { if (!controller.getSnapshot().sessions.some(item => item.id === session.id)) return; preferenceStore.moveSessionToGroup(session.id, groupId, groups.find(group => group.sessionIds.includes(session.id))?.id ?? null) }, groupedActions: view === 'group' && !session.pinned, onMoveTop: view === 'group' && !session.pinned && sortable ? () => moveTaskToTop(session.id) : undefined, onOpenFiles: onOpenSessionFiles && (session.workingDirectory?.trim() || state.projects.some(project => project.id === session.projectId && project.directoryExists)) ? () => onOpenSessionFiles(session.id) : undefined, archiveConfirming: archiveConfirmingId === session.id, onArchiveConfirmation: (confirming: boolean) => setArchiveConfirmingId(previous => confirming ? session.id : previous === session.id ? '' : previous), sortable, active: !extensionsActive && !automationsActive && !draft?.selected && session.id === state.session?.id, renaming: renamingId === session.id, onBeginRename: () => setRenamingId(session.id), onRename: (title: string) => { setRenamingId(''); if (title.trim()) void controller.renameSession(session.id, title.trim().slice(0, 42)) }, onCancelRename: () => setRenamingId(''), onOpen: () => openSession(session.id) })
  const retainedSessionKeys = [draggingId, renamingId, archiveConfirmingId].filter(Boolean)
  const renderRows = (sessions: HarnessSessionSummary[], limit = SESSION_LIMIT, allowSort = sortable, showProject = false, listId?: string) => <SortableContext items={sessions.map(item => item.id)} strategy={verticalListSortingStrategy}><MiraSidebarVirtualList items={sessions.slice(0, limit)} getItemKey={session => session.id} scrollElement={sidebarScrollElement} retainedKeys={retainedSessionKeys} listId={listId} renderItem={session => <SessionRow key={session.id} {...rowProps(session)} sortable={allowSort} showProject={showProject} />} /></SortableContext>
  const createGroupTask = async (groupId: string) => {
    if (!onNewGroupConversation) { controller.reportError(new Error('分组草稿入口不可用')); return }
    if (!preferenceStore.getSnapshot().preferences.groups.some(group => group.id === groupId)) return
    preferenceStore.updateGroup(groupId, { collapsed: false })
    await onNewGroupConversation(groupId)
  }
  const draftAction = (action: SessionDrawerProps['onOpenDraft'], label: string) => {
    if (!draft) return
    if (!action) { controller.reportError(new Error(`${label}不可用`)); return }
    void Promise.resolve().then(() => action(draft.draftId)).catch(error => controller.reportError(error))
  }
  const draftRow = showDraft && draft ? <SidebarDraftRow draft={draft} active={draft.selected && !extensionsActive && !automationsActive} onOpen={() => draftAction(onOpenDraft, '打开草稿')} onClose={() => draftAction(onCloseDraft, '关闭草稿')} /> : null
  const addProject = async () => {
    if (projectSelection.current) return
    projectSelection.current = true; setAddingProject(true)
    try {
      const project = await controller.selectProject()
      if (project) { setShowAllProjects(true); const preferences = preferenceStore.getSnapshot().preferences; preferenceStore.change({ projectSectionOpen: true, hiddenProjectIds: preferences.hiddenProjectIds.filter(id => id !== project.id) }); preferenceStore.setProjectsExpanded([project.id], true) }
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
      {canToggleCollections && <SidebarActionHint title={toggleCollectionsLabel}><button type="button" className="mira-session-icon" aria-label={toggleCollectionsLabel} disabled={!preferenceState.ready} onClick={() => { if (view === 'group') preferenceStore.setGroupsExpanded(!allCollectionsExpanded); else preferenceStore.setProjectsExpanded(toggleableProjects, !allCollectionsExpanded, !allCollectionsExpanded) }}>{allCollectionsExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></SidebarActionHint>}
      {!archived && view === 'group' && <button type="button" className="mira-session-icon" title="新建分组" aria-label="新建分组" disabled={!preferenceState.ready} onClick={() => setRenamingCollection(`sidebar-group:${preferenceStore.createGroup()}`)}><Plus size={15} /></button>}
      {!archived && timeline && <button type="button" className="mira-session-icon" title="添加项目" aria-label="添加项目" disabled={!preferenceState.ready || addingProject} onClick={() => { void addProject() }}>{addingProject ? <LoaderCircle size={15} className="pilot-spin" /> : <Plus size={15} />}</button>}
      <DropdownMenu.Root><SidebarActionHint title={view === 'project' && !archived ? '任务视图选项' : '任务排序'}><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label={view === 'project' && !archived ? '任务视图选项' : '任务排序'}>{view === 'project' && !archived ? <ListFilter size={15} /> : <ArrowDownWideNarrow size={15} />}</button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="end" sideOffset={6} className="mira-session-menu">
        {!archived && view === 'project' && <><DropdownMenu.Label className="mira-session-menu__label">显示方式</DropdownMenu.Label><DropdownMenu.RadioGroup value={projectView} onValueChange={value => { if (value === 'collections' || value === 'timeline') { preferenceStore.change({ projectView: value }); setTimelineLimit(TIMELINE_PAGE_SIZE) } }}><DropdownMenu.RadioItem value="collections" className="mira-session-menu__item"><Folder size={14} />按项目<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem><DropdownMenu.RadioItem value="timeline" className="mira-session-menu__item"><Clock3 size={14} />时间线<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem></DropdownMenu.RadioGroup><DropdownMenu.Separator className="mira-session-menu__separator" /></>}
        <DropdownMenu.Label className="mira-session-menu__label">任务排序</DropdownMenu.Label><DropdownMenu.RadioGroup value={timeline ? timelineSort : sort} onValueChange={value => { preferenceStore.change({ sort: value as typeof sort }); setTimelineLimit(TIMELINE_PAGE_SIZE) }}>{[{ id: 'updated', label: '最近更新' }, { id: 'created', label: '创建时间' }, ...(!archived && !timeline ? [{ id: 'manual', label: '手动排序' }] : [])].map(option => <DropdownMenu.RadioItem key={option.id} value={option.id} className="mira-session-menu__item"><span className="mira-session-menu__indicator"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator></span>{option.label}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
        {!archived && view === 'project' && hiddenProjects.length > 0 && <><DropdownMenu.Separator className="mira-session-menu__separator" /><DropdownMenu.Label className="mira-session-menu__label">恢复隐藏项目</DropdownMenu.Label>{hiddenProjects.map(project => <DropdownMenu.Item key={project.id} className="mira-session-menu__item" onSelect={() => preferenceStore.change({ hiddenProjectIds: hiddenProjectIds.filter(id => id !== project.id) })}><Folder size={14} />{project.name}</DropdownMenu.Item>)}</>}
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      {archived && <div ref={setArchivedActions} className="mira-session-archived-actions" />}
      <SidebarActionHint title={archived ? '返回任务列表' : '查看已归档任务'}><button type="button" className="mira-session-icon" aria-label={archived ? '返回任务列表' : '查看已归档任务'} aria-pressed={archived} onClick={() => setArchived(value => !value)}>{archived ? <X size={15} /> : <Archive size={15} />}</button></SidebarActionHint>
    </div>
    {preferenceState.error && <div className="mira-session-feedback" role="alert"><CircleAlert size={13} /><span>{preferenceState.error}</span><button type="button" onClick={() => void preferenceStore.retry().catch(() => undefined)}>重试</button></div>}
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragOver={previewDrop} onDragCancel={resetDrag} onDragEnd={handleDragEnd}><SidebarDropMeasurements preview={dragPreview} /><div className="mira-session-scroll"><MiraSidebarStickyHeader scrollElement={sidebarScrollElement} groups={stickyGroups} active={view === 'group' && !archived} dragging={Boolean(draggingId || draggedGroupId || draggedSectionId)} onToggle={id => { const group = preferenceStore.getSnapshot().preferences.groups.find(group => group.id === id); if (group) preferenceStore.updateGroup(id, { collapsed: !group.collapsed }) }} onNewTask={createGroupTask} onColor={(id, color) => preferenceStore.updateGroup(id, { color })} onUngroup={id => preferenceStore.removeGroup(id)} onError={error => controller.reportError(error)} /><div ref={setSidebarScrollElement} className="mira-session-list">
      {pinned.length > 0 && <GroupSection title="置顶" icon={<Pin size={12} />}>{renderRows(pinned, pinned.length)}</GroupSection>}
      {archived ? <ArchivedSessions controller={controller} sort={sort === 'created' ? 'created' : 'updated'} refreshKey={state.sessions.map(item => item.id).join(',')} activeId={extensionsActive || automationsActive ? undefined : state.session?.id} active={!extensionsActive && !automationsActive} actionsContainer={archivedActions} onOpen={openSession} /> : <>
      {timeline && <><div aria-label="任务时间线">{timelineGroups.map(group => <GroupSection key={group.label} title={group.label}>{renderRows(group.sessions, group.sessions.length, false, true)}</GroupSection>)}</div>{!query && timelineSessions.length > timelineLimit && <button type="button" className="mira-session-more" onClick={() => setTimelineLimit(limit => limit + TIMELINE_PAGE_SIZE)}>显示更多任务</button>}{!timelineSessions.length && !query && <p className="mira-session-hint">暂无任务</p>}</>}
      {!timeline && <>
      {view === 'group' ? <div data-sidebar-root role="group" aria-label="分组任务">{!draftGroupId && draftRow}<SortableContext items={rootItems.map(item => item.type === 'group' ? `sidebar-group:${item.id}` : item.id)} strategy={verticalListSortingStrategy}><MiraSidebarVirtualList items={rootItems} getItemKey={item => item.type === 'group' ? `sidebar-group:${item.id}` : item.id} scrollElement={sidebarScrollElement} listId="root" retainedKeys={[...retainedSessionKeys, ...groups.filter(group => group.sessionIds.some(id => retainedSessionKeys.includes(id))).map(group => `sidebar-group:${group.id}`), ...(draggedGroupId ? [`sidebar-group:${draggedGroupId}`] : []), renamingCollection].filter(Boolean)} estimateSize={item => item.type === 'session' ? 32 : 40 + (collectionById.get(item.id)?.group.collapsed ? 0 : Math.min(collectionById.get(item.id)?.sessions.length ?? 0, 24) * 32)} renderItem={item => {
        if (item.type === 'session') {
          const entry = rootSessionById.get(item.id)
          return entry ? <SessionRow key={item.id} {...rowProps(entry)} /> : null
        }
        const entry = collectionById.get(item.id)!
        const { group, sessions } = entry
        const hasDraft = showDraft && draftGroupId === group.id
        return <SidebarTaskCollection key={group.id} id={`sidebar-group:${group.id}`} name={group.name} color={group.color} count={sessions.length + (hasDraft ? 1 : 0)} expanded={Boolean(query) || !group.collapsed && group.id !== draggedGroupId} sortable={sortable} renaming={renamingCollection === `sidebar-group:${group.id}`} onToggle={() => preferenceStore.updateGroup(group.id, { collapsed: !group.collapsed })} onBeginRename={() => setRenamingCollection(`sidebar-group:${group.id}`)} onCancelRename={() => setRenamingCollection('')} onRename={name => preferenceStore.updateGroup(group.id, { name })} onColor={color => preferenceStore.updateGroup(group.id, { color })} onNewTask={() => createGroupTask(group.id)} onUngroup={() => preferenceStore.removeGroup(group.id)}>{hasDraft && draftRow}{renderRows(sessions, sessions.length, sortable, false, `group:${group.id}`)}{!sessions.length && !hasDraft && <SidebarEmptyDropZone groupId={group.id} name={group.name} disabled={!sortable} onNewTask={() => void createGroupTask(group.id).catch(error => controller.reportError(error))} />}</SidebarTaskCollection>
      }} /></SortableContext><SidebarRootDropZone disabled={!sortable} dragging={Boolean(draggingId)} /></div> : <SortableContext items={sectionOrder.map(id => `sidebar-section:${id}`)} strategy={verticalListSortingStrategy}>{sectionOrder.map(sectionId => sectionId === 'projects' ? <MiraSidebarSection key="projects" sortable={sectionSortable} id="projects" title="项目" open={Boolean(query) || projectSectionOpen} disabled={!preferenceState.ready} onOpenChange={open => { if (!query) preferenceStore.change({ projectSectionOpen: open }) }} action={<SidebarActionHint title="添加项目"><button type="button" className="mira-session-icon" aria-label="添加项目" disabled={!preferenceState.ready || addingProject} onClick={() => { void addProject() }}>{addingProject ? <LoaderCircle size={15} className="pilot-spin" /> : <Plus size={15} />}</button></SidebarActionHint>}><SortableContext items={projects.map(({ project }) => `sidebar-project:${project.id}`)} strategy={verticalListSortingStrategy}>
        {projects.map(({ project, sessions }) => {
          const expanded = Boolean(query) || expandedProjectIds.includes(project.id)
          const limit = projectTaskLimits[project.id] ?? PROJECT_SESSION_LIMIT
          return <SidebarCollectionSection key={project.id} id={`sidebar-project:${project.id}`} name={project.name} directory={project.directory} count={sessions.length} expanded={expanded} sortable={sortable} disabled={!project.directoryExists} renaming={renamingCollection === `sidebar-project:${project.id}`} onToggle={() => { if (preferenceState.ready) preferenceStore.setProjectsExpanded([project.id], !expandedProjectIds.includes(project.id)) }} onBeginRename={() => setRenamingCollection(`sidebar-project:${project.id}`)} onCancelRename={() => setRenamingCollection('')} onRename={name => controller.renameProject(project.id, name)} onNewTask={() => onNewProjectConversation ? onNewProjectConversation(project.id) : controller.create(project.id).then(() => undefined)} onOpenFiles={onOpenProjectFiles ? () => onOpenProjectFiles(project.id) : undefined} onOpenDirectory={target => controller.openProject(project.id, target)} onHide={preferenceState.ready ? () => preferenceStore.change({ hiddenProjectIds: [...hiddenProjectIds, project.id] }) : undefined}>{renderRows(sessions, query ? sessions.length : limit)}{!sessions.length && <p className="mira-session-hint">暂无任务</p>}{sessions.length > limit && !query && <button type="button" className="mira-session-more" aria-label={`显示 ${project.name} 的更多任务`} onClick={() => setProjectTaskLimits(previous => ({ ...previous, [project.id]: (previous[project.id] ?? PROJECT_SESSION_LIMIT) + PROJECT_SESSION_LIMIT }))}>显示更多</button>}</SidebarCollectionSection>
        })}
        </SortableContext>
        {allProjects.length > PROJECT_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllProjects(value => !value)}>{showAllProjects ? '收起项目' : '显示更多项目'}</button>}
        {!allProjects.length && !query && <p className="mira-session-hint">添加项目以开始工作。</p>}</MiraSidebarSection>
        : <MiraSidebarSection key="personal" sortable={sectionSortable} id="personal" title="个人工作区" open={Boolean(query) || personalSectionOpen} disabled={!preferenceState.ready} onOpenChange={open => { if (!query) preferenceStore.change({ personalSectionOpen: open }) }} action={<SidebarActionHint title="新建个人任务"><button type="button" className="mira-session-icon" aria-label="在个人工作区新建任务" onClick={newTask}><MessageCirclePlus size={14} /></button></SidebarActionHint>}>{renderRows(ordered(model.recent.filter(matches)), showAllRecent || query ? model.recent.length : SESSION_LIMIT)}{!model.recent.length && !query && <p className="mira-session-hint">暂无个人任务</p>}{model.recent.length > SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllRecent(value => !value)}>{showAllRecent ? '收起' : '显示更多'}</button>}</MiraSidebarSection>
      )}</SortableContext>}
      {query && !pinned.length && !attention.length && !running.length && !recent.length && !(view === 'group' && showDraft) && <p className="mira-session-hint">没有匹配的任务</p>}
      {!query && !sessions.length && !(view === 'group' && showDraft) && <p className="mira-session-hint">新建任务后，对话会显示在这里。</p>}
      </>}
      {timeline && query && !pinned.length && !timelineSessions.length && <p className="mira-session-hint">没有匹配的任务</p>}
      </>}
    </div></div><DragOverlay dropAnimation={null}>{draggingId && <div className="mira-session-drag-overlay"><MessageCirclePlus size={13} /><span>{state.sessions.find(session => session.id === draggingId)?.title || '新任务'}</span></div>}</DragOverlay></DndContext>
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

function SidebarDropMeasurements({ preview }: { preview?: SidebarGroupingOrder }) {
  const { droppableContainers, measureDroppableContainers } = useDndContext()
  useLayoutEffect(() => {
    // Sortable items omit group heads/tails, whose positions also change in a preview.
    if (preview) measureDroppableContainers(droppableContainers.getEnabled().map(container => container.id))
  }, [preview, measureDroppableContainers])
  return null
}

function SidebarTaskCollection(props: SidebarCollectionProps) {
  const groupId = props.id.slice('sidebar-group:'.length)
  const head = useDroppable({ id: `sidebar-head:${groupId}`, disabled: !props.sortable || props.renaming })
  const tail = useDroppable({ id: `sidebar-tail:${groupId}`, disabled: !props.sortable || !props.expanded })
  return <SidebarCollectionSection {...props} headerDropRef={head.setNodeRef} headerDropId={`sidebar-head:${groupId}`} footerDropRef={tail.setNodeRef} footerDropId={`sidebar-tail:${groupId}`} />
}
function SidebarEmptyDropZone({ groupId, name, disabled, onNewTask }: { groupId: string; name: string; disabled: boolean; onNewTask: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sidebar-drop:${groupId}`, disabled })
  return <button ref={setNodeRef} type="button" data-sidebar-drop-id={`sidebar-drop:${groupId}`} className={`mira-sidebar-empty-drop${isOver ? ' is-over' : ''}`} aria-label={`在 ${name} 新建任务或放入任务`} onClick={onNewTask}><MessageCirclePlus size={13} /><span>开始新任务</span></button>
}
function SidebarRootDropZone({ disabled, dragging }: { disabled: boolean; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'sidebar-root:end', disabled })
  return <div ref={setNodeRef} data-sidebar-drop-id="sidebar-root:end" className={`mira-sidebar-root-drop${dragging ? ' is-dragging' : ''}${isOver ? ' is-over' : ''}`}>{dragging && <span>移出分组</span>}</div>
}

function SidebarDraftRow({ draft, active, onOpen, onClose }: { draft: NonNullable<SessionDrawerProps['draft']>; active: boolean; onOpen: () => void; onClose: () => void }) {
  return <div data-sidebar-draft-id={draft.draftId} className={`mira-session-row mira-session-draft${active ? ' is-active' : ''}`}>
    <button type="button" className="mira-session-row__open" aria-label="打开草稿 新任务" aria-current={active ? 'page' : undefined} onClick={onOpen}><span>新任务</span></button>
    <span className="mira-session-draft__workspace" title={draft.workspaceLabel || '个人工作区'}>{draft.workspaceLabel || '个人工作区'}</span>
    <span className="mira-session-draft__status" aria-label="未发送草稿" />
    <div className="mira-session-draft__actions"><SidebarActionHint title="关闭草稿，保留输入内容"><button type="button" className="mira-session-row__action" aria-label="关闭草稿 新任务" onClick={onClose}><X size={14} /></button></SidebarActionHint></div>
  </div>
}

function SessionRow({ session, state, controller, groups, groupsReady, currentGroupId, onMoveGroup, groupedActions, onMoveTop, onOpenFiles, archiveConfirming, onArchiveConfirmation, active, sortable, renaming, showProject, onBeginRename, onRename, onCancelRename, onOpen }: { session: HarnessSessionSummary; state: ReturnType<PilotController['getSnapshot']>; controller: PilotController; groups: SidebarTaskGroup[]; groupsReady: boolean; currentGroupId?: string; onMoveGroup: (groupId?: string) => void; groupedActions: boolean; onMoveTop?: () => Promise<void>; onOpenFiles?: () => void | Promise<void>; archiveConfirming: boolean; onArchiveConfirmation: (confirming: boolean) => void; active: boolean; sortable: boolean; renaming: boolean; showProject?: boolean; onBeginRename: () => void; onRename: (title: string) => void; onCancelRename: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id, disabled: renaming || !sortable })
  const [title, setTitle] = useState(session.title)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const setRowRef = useMemo(() => (node: HTMLDivElement | null) => { rowRef.current = node; setNodeRef(node) }, [setNodeRef])
  useEffect(() => { if (!renaming) setTitle(session.title) }, [renaming, session.title])
  const badge = sessionBadge(session, { running: state.runningSessionIds.includes(session.id), unread: state.unreadSessionIds.includes(session.id), pending: Boolean(state.pendingPermissions[session.id]) })
  const waiting = Boolean(state.pendingPermissions[session.id]) || session.planStatus === 'needs_input' || session.planStatus === 'awaiting_confirmation'
  useEffect(() => {
    if (!archiveConfirming) return
    if (waiting) { onArchiveConfirmation(false); return }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onArchiveConfirmation(false) } }
    const onPointer = (event: PointerEvent) => { if (!rowRef.current?.contains(event.target as Node)) onArchiveConfirmation(false) }
    window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onPointer, true)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPointer, true) }
  }, [archiveConfirming, waiting, onArchiveConfirmation])
  const run = (action: () => void | Promise<unknown>, archiving = false) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    void Promise.resolve().then(action).then(value => { if (typeof value === 'string' && value) throw new Error(value); if (archiving) onArchiveConfirmation(false) }).catch(cause => setError(cause instanceof Error ? cause.message : '操作失败，请重试')).finally(() => { busyRef.current = false; setBusy(false) })
  }
  const archive = () => run(() => controller.archiveSession(session.id), true)
  const menuProps = { session, projects: state.projects, controller, groups, groupsReady, currentGroupId, onMoveGroup, onRename: onBeginRename, onOpenFiles: onOpenFiles ? () => run(onOpenFiles) : undefined, onArchive: archive, busy, run }
  const stopPointer = (event: React.MouseEvent | React.PointerEvent) => { event.stopPropagation() }
  const archiveLabel = `${groupedActions ? '关闭' : archiveConfirming ? '确认归档' : '归档'} ${session.title || '新任务'}`
  return <ContextMenu.Root onOpenChange={open => { if (open) onArchiveConfirmation(false) }}>
    <ContextMenu.Trigger asChild disabled={renaming}>
      <div ref={setRowRef} data-sidebar-session-id={session.id} data-pending-interaction={waiting || undefined} data-archive-confirming={archiveConfirming || undefined} aria-busy={busy || undefined} className={`mira-session-row${showProject ? ' mira-session-row--timeline' : ''}${active ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
        {renaming ? <form className="mira-session-rename" onSubmit={event => { event.preventDefault(); onRename(title) }}><input autoFocus value={title} maxLength={42} aria-label="会话标题" onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancelRename() } }} /><button type="submit" aria-label="保存标题"><Check size={14} /></button></form> : <>
          {sortable && <button type="button" className="mira-session-row__grip" aria-label={`拖拽排序 ${session.title}`} {...attributes} {...listeners}><GripVertical size={12} /></button>}
          <button type="button" className="mira-session-row__open" onClick={onOpen} aria-current={active ? 'page' : undefined} title={`${session.title}\n${session.workingDirectory || session.projectName || '个人工作区'}`}><span>{session.title || '新任务'}</span>{showProject && <span className="mira-session-row__project">{session.projectName || state.projects.find(project => project.id === session.projectId)?.name || '个人工作区'}</span>}</button>
          {badge && <span className={`mira-session-status mira-session-status--${badge.kind}`} title={badge.label} aria-label={badge.label}>{badge.kind === 'unread' ? <span /> : badge.kind === 'running' || badge.kind === 'plan' && session.planStatus === 'executing' ? <LoaderCircle size={12} className="pilot-spin" /> : <CircleAlert size={12} />}</span>}
          {!badge && session.status === 'failed' && <CircleAlert size={12} className="mira-session-status--failed" aria-label="执行失败" />}
          {!waiting && <time className="mira-session-row__time" dateTime={new Date(session.updatedAt).toISOString()} title={new Date(session.updatedAt).toLocaleString()}>{relativeSessionTime(session.updatedAt)}</time>}
          <div className="mira-session-row__actions">
            {!waiting && <>
              {onOpenFiles && <SidebarActionHint title="显示文件树"><button type="button" className="mira-session-row__action" aria-label={`显示 ${session.title} 的文件树`} disabled={busy} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={event => { event.stopPropagation(); run(onOpenFiles) }}><ListTree size={14} /></button></SidebarActionHint>}
              {onMoveTop && <SidebarActionHint title="移动到顶部"><button type="button" className="mira-session-row__action" aria-label={`移动 ${session.title} 到顶部`} disabled={busy} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={event => { event.stopPropagation(); run(onMoveTop) }}><ArrowUpToLine size={14} /></button></SidebarActionHint>}
              <SidebarActionHint title={groupedActions ? '关闭' : '归档任务'}><button type="button" className={`mira-session-row__action${archiveConfirming ? ' is-confirming' : ''}`} aria-label={archiveLabel} disabled={busy} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={event => { event.stopPropagation(); if (busyRef.current) return; if (groupedActions || archiveConfirming) archive(); else onArchiveConfirmation(true) }}>{busy ? <LoaderCircle size={14} className="pilot-spin" /> : archiveConfirming ? '确认' : groupedActions ? <X size={14} /> : <Archive size={14} />}</button></SidebarActionHint>
            </>}
            <DropdownMenu.Root onOpenChange={open => { if (open) onArchiveConfirmation(false) }}><DropdownMenu.Trigger asChild><button type="button" className="mira-session-row__more" title="任务操作" aria-label={`${session.title} 的操作`} disabled={busy} onPointerDown={event => event.stopPropagation()} onMouseDown={stopPointer}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="end" sideOffset={4} className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}><SessionMenuItems kind="dropdown" {...menuProps} /></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
          </div>
        </>}
        {error && <span className="mira-session-row__error" role="alert">{error}</span>}
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Portal container={document.getElementById('root')}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}><SessionMenuItems kind="context" {...menuProps} /></ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>
}

export function SessionMenuItems({ kind = 'context', session, projects, controller, groups, groupsReady = true, currentGroupId, onMoveGroup, onRename, onOpenFiles, onArchive, busy, run }: { kind?: 'context' | 'dropdown'; session: HarnessSessionSummary; projects: HarnessProject[]; controller: PilotController; groups?: SidebarTaskGroup[]; groupsReady?: boolean; currentGroupId?: string; onMoveGroup?: (groupId?: string) => void; onRename: () => void; onOpenFiles?: () => void; onArchive?: () => void; busy?: boolean; run: (action: () => Promise<unknown>) => void }) {
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu
  const portal = document.getElementById('root')
  const unread = Boolean(session.unread || controller.getSnapshot().unreadSessionIds.includes(session.id))
  return <>
    <Menu.Item className="mira-session-menu__item" onSelect={onRename}><Pencil size={14} />重命名</Menu.Item>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionPinned(session.id, !session.pinned))}>{session.pinned ? <PinOff size={14} /> : <Pin size={14} />}{session.pinned ? '取消置顶' : '置顶'}</Menu.Item>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionUnread(session.id, !unread))}><Check size={14} />{unread ? '标记为已读' : '标记为未读'}</Menu.Item>
    {onMoveGroup && <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item" disabled={!groupsReady}><Hash size={14} />{groupsReady ? '移动到分组' : '正在读取分组…'}<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu"><Menu.Item className="mira-session-menu__item" disabled={!currentGroupId || !groupsReady} onSelect={() => { if (groupsReady && currentGroupId) onMoveGroup() }}><X size={14} />移出分组</Menu.Item><Menu.Separator className="mira-session-menu__separator" />{groups?.length ? groups.map(group => <Menu.Item key={group.id} className="mira-session-menu__item" disabled={!groupsReady || group.id === currentGroupId} onSelect={() => { if (groupsReady && group.id !== currentGroupId) onMoveGroup(group.id) }}><span className="mira-collection-swatch" data-group-color={group.color} />{group.name}</Menu.Item>) : <Menu.Item className="mira-session-menu__item" disabled>暂无分组</Menu.Item>}</Menu.SubContent></Menu.Portal></Menu.Sub>}
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><FolderOpen size={14} />移动到项目<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>{projects.length ? projects.map(project => <Menu.Item key={project.id} className="mira-session-menu__item" disabled={project.id === session.projectId || !project.directoryExists} onSelect={() => run(() => controller.moveSession(session.id, project.id))}><Folder size={14} />{project.name}</Menu.Item>) : <Menu.Item className="mira-session-menu__item" disabled>暂无项目</Menu.Item>}</Menu.SubContent></Menu.Portal></Menu.Sub>
    {onOpenFiles && <Menu.Item className="mira-session-menu__item" disabled={busy} onSelect={onOpenFiles}><ListTree size={14} />显示文件树</Menu.Item>}
    <Menu.Item className="mira-session-menu__item" disabled={busy} onSelect={() => { if (onArchive) onArchive(); else run(() => controller.archiveSession(session.id)) }}><Archive size={14} />归档</Menu.Item>
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
