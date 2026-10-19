import { ShortcutKeys } from '../shared/ShortcutKeys'
import { fileManagerLabel } from '../../lib/file-manager-label'
import { SessionDeleteDialog } from './SessionDeleteDialog'
/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode sidebar view, expansion and chronological task interactions.
 * Upstream license: third-party-licenses/zcode/.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as SidebarTabs from '@radix-ui/react-tabs'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, rectIntersection, useDndContext, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Activity, Archive, ArrowDownWideNarrow, ArrowUpToLine, Blocks, CalendarClock, Check, ChevronRight, CircleAlert, Clock3, Copy, Folder, FolderOpen, Hash, ListFilter, ListTree, LoaderCircle, Maximize2, MessageCirclePlus, Minimize2, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, TerminalSquare, Trash2, X } from 'lucide-react'
import type { HarnessProject, HarnessSessionOrderScope, HarnessSessionSummary } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { dispatchMiraCommandShortcut } from '../../hooks/useMiraCommandShortcut'
import { isMiraPrimaryModifier, miraPrimaryKeyShortcuts, miraShortcutLabel } from '../../../../../src/platform/workbenchShortcuts'
import { groupSessions, moveSidebarTask, relativeSessionTime, sessionBadge, sessionMarkdown, sidebarRootItems, splitSessionQueues, type SidebarDropTarget } from './session-groups'
import { SIDEBAR_PREFERENCE_KEY, SidebarPreferenceStore, type SidebarGroupingOrder, type SidebarTaskGroup } from './sidebar-preferences'
import { collectionSortingStrategy, restrictSidebarCollectionDrag } from './sidebar-drag'
import { ArchivedSessions } from './ArchivedSessions'
import { SidebarActionHint, SidebarCollectionSection, type SidebarCollectionProps } from './SidebarCollectionSection'
import { MiraSidebarSection } from './MiraSidebarSection'
import { MiraSidebarStickyHeader } from './MiraSidebarStickyHeader'
import { MiraSidebarVirtualList } from './MiraSidebarVirtualList'
import { MiraSidebarTaskTitle } from './MiraSidebarTaskTitle'
import { SidebarFooter } from './SidebarFooter'
import { beginMiraTaskDrag, endMiraTaskDrag, miraTaskPointerDrag } from '../workspace/MiraTaskGrid'

const PROJECT_LIMIT = 6
const SESSION_LIMIT = 12
const PROJECT_SESSION_LIMIT = 5
const TIMELINE_PAGE_SIZE = 20
type GroupId = 'pinned' | 'recent' | 'ungrouped' | `project:${string}` | `custom:${string}`

export interface SessionDrawerProps {
  state: ReturnType<PilotController['getSnapshot']>
  controller: PilotController
  width: number
  activeSessionId?: string | null
  modal?: boolean
  newTaskOpen?: boolean
  onToggleNewTask?: () => void
  onNewConversation?: () => void
  onNewPersonalConversation?: () => void
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
  onOpenExecution?: (id: string) => Promise<unknown>
  onOpenModelTrace?: (id: string) => Promise<unknown>
  taskPaneEntry?: { open: (id: string) => Promise<unknown>; canOpen: (id: string) => boolean; canDrag?: (id: string) => boolean }
  preferenceStore?: SidebarPreferenceStore
}

/** Keep app shortcuts mounted with the workbench, including when its sidebar is closed. */
export function useHarnessSessionShortcuts(onNewConversation: () => void, onSearch: () => void, onToggleSidebar: () => void) {
  const actions = useRef({ onNewConversation, onSearch, onToggleSidebar })
  actions.current = { onNewConversation, onSearch, onToggleSidebar }
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.repeat || event.isComposing || event.keyCode === 229) return
      const key = event.key.toLowerCase()
      if (event.shiftKey ? key !== 'p' : key !== 'n' && key !== 'k' && key !== 'b') return
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"][data-state="open"], dialog[open]')) return
      // PlainText Composer follows the workbench binding; file editors and terminals own B.
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (target?.closest('[role="dialog"]:not(.mira-conversation-find)')) return
      if (key === 'b' && !target?.closest('.mira-prompt-editor') && target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .xterm')) return
      if (key === 'b' && dispatchMiraCommandShortcut(event)) return true
      if (!isMiraPrimaryModifier(event)) return
      event.preventDefault()
      if (key === 'n') actions.current.onNewConversation()
      else if (key === 'b') actions.current.onToggleSidebar()
      else actions.current.onSearch()
      return true
    }
    const onComposerSidebarShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (event.key.toLowerCase() === 'b' && target?.closest('.mira-prompt-editor') && onShortcut(event)) event.stopPropagation()
    }
    window.addEventListener('keydown', onComposerSidebarShortcut, true)
    window.addEventListener('keydown', onShortcut)
    return () => { window.removeEventListener('keydown', onComposerSidebarShortcut, true); window.removeEventListener('keydown', onShortcut) }
  }, [])
}

export function SessionSidebar({ state, controller, width, activeSessionId = state.session?.id, modal, onNewConversation, onNewPersonalConversation, searchRequest, onClose, onOpenExtensions, extensionsActive, onOpenSession, onSearch, onOpenAutomations, automationsActive, onNewProjectConversation, draft, onNewGroupConversation, onOpenDraft, onCloseDraft, onOpenProjectFiles, onOpenSessionFiles, onOpenExecution, onOpenModelTrace, taskPaneEntry, preferenceStore: sharedPreferenceStore }: SessionDrawerProps) {
  const preferenceStore = useMemo(() => sharedPreferenceStore ?? new SidebarPreferenceStore(() => controller.getPreference(SIDEBAR_PREFERENCE_KEY), value => controller.setPreference(SIDEBAR_PREFERENCE_KEY, value, true)), [controller, sharedPreferenceStore])
  const preferenceState = useSyncExternalStore(preferenceStore.subscribe, preferenceStore.getSnapshot)
  const [dragPreview, setDragPreview] = useState<SidebarGroupingOrder>()
  const [draggingId, setDraggingId] = useState('')
  const [draggedGroupId, setDraggedGroupId] = useState('')
  const [draggedProjectId, setDraggedProjectId] = useState('')
  const [dragOverlayWidth, setDragOverlayWidth] = useState<number>()
  const [draggedSectionId, setDraggedSectionId] = useState('')
  const dragOrigin = useRef<{ id: string; groupId?: string } | undefined>(undefined)
  const dragActiveId = useRef('')
  const lastDrop = useRef<SidebarDropTarget | undefined>(undefined)
  const dragDirection = useRef<'before' | 'after'>('after')
  const dragY = useRef(0)
  const previewPosition = useRef<{ x: number; y: number } | undefined>(undefined)
  const { projectSectionOpen, personalSectionOpen, sectionOrder, expandedProjectIds, view, projectView, sort: projectSort, groupSort } = preferenceState.preferences
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
  const renameEpoch = useRef(0)
  const renameRevision = renameEpoch.current
  const [archiveConfirmingId, setArchiveConfirmingId] = useState('')
  const [renamingCollection, setRenamingCollection] = useState('')
  const [addingProject, setAddingProject] = useState(false)
  const [projectSelectionError, setProjectSelectionError] = useState('')
  const [removingProject, setRemovingProject] = useState<HarnessProject>()
  const [removeProjectBusy, setRemoveProjectBusy] = useState(false)
  const [removeProjectError, setRemoveProjectError] = useState('')
  const projectSelection = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const activeProjectId = state.sessions.find(session => session.id === activeSessionId)?.projectId ?? (activeSessionId === state.session?.id ? state.session?.projectId : undefined)
  const sort = view === 'group' && !archived ? dragPreview ? 'manual' : groupSort : projectSort
  const timeline = view === 'project' && projectView === 'timeline'
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
  const manualScope = (session: HarnessSessionSummary) => session.pinned ? 'pinned' : session.projectId && state.projects.some(project => project.id === session.projectId) ? `project:${session.projectId}` : 'recent'
  const ordered = (sessions: HarnessSessionSummary[], manualOrder?: string[], order = sort) => {
    if (order === 'manual' || view === 'project' && !timeline && !archived && sessions.length > 0 && preferenceState.preferences.manualSessionScopes?.includes(manualScope(sessions[0]))) {
      if (!manualOrder) return sessions
      const positions = new Map(manualOrder.map((id, index) => [id, index]))
      return [...sessions].sort((left, right) => (positions.get(left.id) ?? manualOrder.length) - (positions.get(right.id) ?? manualOrder.length))
    }
    return [...sessions].sort((left, right) => order === 'created' ? right.createdAt - left.createdAt : right.updatedAt - left.updatedAt)
  }
  const groupBySession = new Map(groups.flatMap(group => group.sessionIds.map(id => [id, group.id] as const)))
  const groupedIds = new Set(groupBySession.keys())
  const sessionById = new Map(sessions.map(session => [session.id, session]))
  const unreadIds = new Set(state.unreadSessionIds)
  const runningIds = new Set(state.runningSessionIds)
  const collectionStatus = (members: HarnessSessionSummary[]) => {
    let hasUnread = false, runningCount = 0, waitingCount = 0
    for (const session of members) {
      hasUnread ||= Boolean(session.unread || unreadIds.has(session.id))
      if (state.pendingPermissions[session.id] || session.planStatus === 'needs_input' || session.planStatus === 'awaiting_confirmation') waitingCount++
      else if (runningIds.has(session.id) || session.planStatus === 'executing') runningCount++
    }
    return { hasUnread, runningCount, waitingCount }
  }
  const projectIds = new Set(state.projects.map(project => project.id))
  const pinned = ordered(model.pinned.filter(matches))
  const attention = ordered(queues.attention.filter(session => matches(session) && (view !== 'group' || !groupedIds.has(session.id))))
  const running = ordered(queues.running.filter(session => matches(session) && (view !== 'group' || !groupedIds.has(session.id))))
  const recent = ordered([...queues.projects.flatMap(entry => entry.sessions), ...queues.recent].filter(matches))
  const allProjects = model.projects.map(entry => ({ ...entry, sessions: ordered(entry.sessions.filter(matches)) })).filter(entry => !query || entry.sessions.length > 0 || entry.project.name.toLocaleLowerCase().includes(query))
  const projects = query || showAllProjects ? allProjects : allProjects.slice(0, PROJECT_LIMIT)
  const visibleProjectIds = JSON.stringify(projects.map(entry => entry.project.id))
  useEffect(() => {
    const visible = new Set(view === 'project' && !timeline && !archived && projectSectionOpen ? projects.filter(entry => expandedProjectIds.includes(entry.project.id)).map(entry => entry.project.id) : [])
    setProjectTaskLimits(previous => {
      const entries = Object.entries(previous).filter(([id]) => visible.has(id))
      return entries.length === Object.keys(previous).length ? previous : Object.fromEntries(entries)
    })
  }, [view, timeline, archived, projectSectionOpen, expandedProjectIds, visibleProjectIds])
  const toggleableProjects = state.projects.map(project => project.id)
  const canToggleCollections = !archived && !timeline && !query && (view === 'group' ? groups.length > 0 : toggleableProjects.length > 0)
  const allCollectionsExpanded = view === 'group' ? groups.every(group => !group.collapsed) : projectSectionOpen && toggleableProjects.every(id => expandedProjectIds.includes(id))
  const toggleCollectionsLabel = allCollectionsExpanded ? '全部折叠' : '全部展开'
  const timelineSort = sort === 'created' ? 'created' : 'updated'
  const timelineSessions = useMemo(() => timeline ? [...sessions].filter(session => !session.pinned && (!query || `${session.title} ${session.projectName || ''}`.toLocaleLowerCase().includes(query))).sort((left, right) => timelineSort === 'created' ? right.createdAt - left.createdAt : right.updatedAt - left.updatedAt) : [], [timeline, sessions, query, timelineSort])
  const timelineGroups = useMemo(() => groupSidebarTimeline(timelineSessions.slice(0, query ? timelineSessions.length : timelineLimit), timelineSort), [timelineSessions, query, timelineLimit, timelineSort])
  const draftGroupId = groups.some(group => group.id === draft?.groupId) ? draft?.groupId : undefined
  const showDraft = Boolean(draft && (!query || `新任务 ${draft.workspaceLabel || '个人工作区'} ${groups.find(group => group.id === draftGroupId)?.name || ''}`.toLocaleLowerCase().includes(query)))
  const ungrouped = ordered(sessions.filter(session => !session.pinned && !groupedIds.has(session.id) && matches(session)), ungroupedSessionOrder)
  const customGroups = useMemo(() => groups.map(group => ({ group, sessions: ordered(sessions.filter(session => !session.pinned && group.sessionIds.includes(session.id) && (!query || group.name.toLocaleLowerCase().includes(query) || matches(session))), group.sessionIds) })).filter(entry => !query || entry.sessions.length || entry.group.name.toLocaleLowerCase().includes(query) || showDraft && entry.group.id === draftGroupId), [groups, sessions, sort, query, showDraft, draftGroupId])
  const stickyGroups = useMemo(() => customGroups.map(({ group, sessions }) => ({ id: group.id, name: group.name, color: group.color, count: sessions.length + (showDraft && draftGroupId === group.id ? 1 : 0), collapsed: !query && (group.collapsed || group.id === draggedGroupId), renaming: renamingCollection === `sidebar-group:${group.id}` })), [customGroups, query, showDraft, draftGroupId, draggedGroupId, renamingCollection])
  const rootItems = sidebarRootItems(customGroups.map(item => item.group), ungrouped.map(session => session.id), sort === 'manual' ? groupedRootOrder : [])
  const rootSessionById = new Map(ungrouped.map(session => [session.id, session]))
  const collectionById = new Map(customGroups.map(entry => [entry.group.id, entry]))
  const sortable = !timeline && !query && !archived && preferenceState.ready
  const sectionSortable = view === 'project' && !timeline && !query && !archived && preferenceState.ready
  const groupOf = (id: string): GroupId | undefined => {
    const session = sessionById.get(id)
    if (!session) return
    if (session.pinned) return 'pinned'
    if (view === 'group') { const groupId = groupBySession.get(id); return groupId ? `custom:${groupId}` : 'ungrouped' }
    return session.projectId && projectIds.has(session.projectId) ? `project:${session.projectId}` : 'recent'
  }
  const idsOf = (group: GroupId) => group === 'pinned' ? ordered(model.pinned).map(item => item.id) : group === 'recent' ? ordered(model.recent).map(item => item.id) : group === 'ungrouped' ? ungrouped.map(item => item.id) : group.startsWith('custom:') ? groups.find(entry => `custom:${entry.id}` === group)?.sessionIds || [] : ordered(model.projects.find(entry => `project:${entry.project.id}` === group)?.sessions || []).map(item => item.id)
  const resetDrag = () => { if (typeof window !== 'undefined') endMiraTaskDrag(); dragOrigin.current = undefined; dragActiveId.current = ''; lastDrop.current = undefined; previewPosition.current = undefined; dragY.current = 0; dragDirection.current = 'after'; setDragPreview(undefined); setDraggingId(''); setDraggedGroupId(''); setDraggedProjectId(''); setDraggedSectionId('') }
  const handleDragStart = ({ active }: DragStartEvent) => {
    resetDrag()
    const id = String(active.id)
    if (id.startsWith('sidebar-section:')) { if (sectionSortable) { dragActiveId.current = id; setDraggedSectionId(id) }; return }
    if (!sortable) return
    dragActiveId.current = id
    setDragOverlayWidth(active.rect?.current.initial?.width)
    if (id.startsWith('sidebar-project:')) setDraggedProjectId(id.slice('sidebar-project:'.length))
    if (view === 'group' && id.startsWith('sidebar-group:')) setDraggedGroupId(id.slice('sidebar-group:'.length))
    const session = controller.getSnapshot().sessions.find(item => item.id === id && item.id !== draft?.preparedSessionId)
    if (session) setDraggingId(id)
    if (view === 'group' && session && !session.pinned) { const groupId = preferenceStore.getSnapshot().preferences.groups.find(group => group.sessionIds.includes(id))?.id; dragOrigin.current = { id, groupId } }
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
    return ordered(controller.getSnapshot().sessions.filter(session => !session.pinned && !assigned.has(session.id) && session.id !== draft?.preparedSessionId), preferences.ungroupedSessionOrder, preferences.view === 'group' ? preferences.groupSort : preferences.sort).map(session => session.id)
  }
  // The first manual move starts from the visible recent order, including untouched groups.
  const groupingOrder = (preferences = preferenceStore.getSnapshot().preferences): SidebarGroupingOrder => ({
    groups: preferences.groupSort === 'manual' ? preferences.groups : preferences.groups.map(group => ({ ...group, sessionIds: [...group.sessionIds].sort((left, right) => (sessionById.get(right)?.updatedAt ?? 0) - (sessionById.get(left)?.updatedAt ?? 0)) })),
    ungroupedSessionOrder: rootIds(preferences),
    groupedRootOrder: preferences.groupSort === 'manual' ? preferences.groupedRootOrder : [],
  })
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
    setDragPreview(target ? moveSidebarTask(groupingOrder(), rootIds(), dragOrigin.current.id, target) : undefined)
  }
  const pointerTaskDrag = (event: DragMoveEvent | DragEndEvent, drop = false) => {
    const pointer = event.activatorEvent as PointerEvent | undefined
    const id = String(event.active.id)
    if (typeof pointer?.clientX !== 'number' || !(taskPaneEntry?.canDrag ?? taskPaneEntry?.canOpen)?.(id)) return false
    return miraTaskPointerDrag(id, pointer.clientX + event.delta.x, pointer.clientY + event.delta.y, drop)
  }
  const handleDragMove = (event: DragMoveEvent) => {
    pointerTaskDrag(event)
    if (event.delta.y !== dragY.current) { dragDirection.current = event.delta.y > dragY.current ? 'after' : 'before'; dragY.current = event.delta.y }
    previewDrop(event)
  }
  const collisionDetection: CollisionDetection = args => {
    const id = String(args.active.id)
    if (id.startsWith('sidebar-section:')) {
      const sections = { ...args, droppableContainers: args.droppableContainers.filter(container => String(container.id).startsWith('sidebar-section:')) }
      const hits = args.pointerCoordinates ? pointerWithin(sections) : []
      const targets = hits.filter(hit => String(hit.id) !== id)
      return targets.length ? targets : hits.length ? hits : closestCenter(sections)
    }
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
      // Sortable task lists keep their original slots while siblings translate.
      // The active slot must remain a target so returning there cancels the swap.
      if (targetId === id && (id.startsWith('sidebar-') || view === 'group' && groupOf(id) !== 'pinned')) return false
      if (id.startsWith('sidebar-project:')) return targetId.startsWith('sidebar-project:')
      if (id.startsWith('sidebar-group:')) return targetId.startsWith('sidebar-group:') || Boolean(session && !session.pinned && !groupedIds.has(targetId))
      if (view === 'group' && groupOf(id) !== 'pinned') return !targetId.startsWith('sidebar-group:') && (targetId.startsWith('sidebar-head:') || targetId.startsWith('sidebar-tail:') || targetId.startsWith('sidebar-drop:') || targetId === 'sidebar-root:end' || Boolean(session && !session.pinned))
      return Boolean(session && groupOf(id) === groupOf(targetId))
    })
    const hits = args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers: containers }) : rectIntersection({ ...args, droppableContainers: containers })
    return hits.length ? hits : closestCenter({ ...args, droppableContainers: containers })
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (pointerTaskDrag(event, true)) { resetDrag(); return }
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
    if (!preferenceStore.getSnapshot().ready || preferences.view !== view || preferences.view === 'project' && preferences.projectView === 'timeline') return
    if (view === 'group' && !activeId.startsWith('sidebar-group:') && groupOf(activeId) !== 'pinned') {
      const session = controller.getSnapshot().sessions.find(item => item.id === activeId && !item.pinned && item.id !== draft?.preparedSessionId)
      const sourceGroupId = preferences.groups.find(group => group.sessionIds.includes(activeId))?.id
      if (!session || !target || !origin || origin.id !== activeId || origin.groupId !== sourceGroupId) return
      if (target.type === 'session' && !controller.getSnapshot().sessions.some(item => item.id === target.id && !item.pinned)) return
      if (target.type === 'group' && preferences.groups.find(group => group.id === target.id)?.collapsed) return
      const patch = moveSidebarTask(groupingOrder(preferences), rootIds(preferences), activeId, target)
      if (patch) void preferenceStore.applyGroupDrop(patch).catch(() => undefined)
      return
    }
    if (view === 'group' && activeId.startsWith('sidebar-group:')) {
      const roots = sidebarRootItems(preferences.groups, rootIds(preferences), preferences.groupSort === 'manual' ? preferences.groupedRootOrder : [])
      const activeIndex = roots.findIndex(item => item.type === 'group' && `sidebar-group:${item.id}` === activeId)
      const overIndex = roots.findIndex(item => item.type === 'group' ? `sidebar-group:${item.id}` === overId : item.id === overId)
      if (activeIndex < 0 || overIndex < 0) return
      const next = arrayMove(roots, activeIndex, overIndex)
      const byId = new Map(groupingOrder(preferences).groups.map(group => [group.id, group]))
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
    const scopes = [...new Set([...(preferences.manualSessionScopes ?? []), group])]
    if (view === 'project') preferenceStore.change({ manualSessionScopes: scopes })
    void controller.reorderSessions(scope, arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId))).then(saved => {
      if (saved === false && preferenceStore.getSnapshot().preferences.manualSessionScopes === scopes) preferenceStore.change({ manualSessionScopes: preferences.manualSessionScopes })
    })
  }
  const moveTaskToTop = async (id: string) => {
    const { ready, preferences } = preferenceStore.getSnapshot()
    if (!ready || preferences.view !== 'group' || !controller.getSnapshot().sessions.some(session => session.id === id && !session.pinned)) return
    const roots = rootIds(preferences)
    const group = preferences.groups.find(group => group.sessionIds.includes(id))
    const near = sidebarRootItems(preferences.groups, roots, preferences.groupSort === 'manual' ? preferences.groupedRootOrder : []).find(item => item.type !== 'session' || item.id !== id)
    const patch = moveSidebarTask(groupingOrder(preferences), roots, id, group ? { type: 'group', id: group.id, position: 'start' } : { type: 'root', near, position: 'before' })
    if (patch) await preferenceStore.applyGroupDrop(patch)
  }
  const rowProps = (session: HarnessSessionSummary) => ({ session, state, controller, groups, groupsReady: preferenceState.ready, taskPaneEntry, currentGroupId: groups.find(group => group.sessionIds.includes(session.id))?.id, onMoveGroup: (groupId?: string) => { if (!controller.getSnapshot().sessions.some(item => item.id === session.id)) return; preferenceStore.moveSessionToGroup(session.id, groupId, groups.find(group => group.sessionIds.includes(session.id))?.id ?? null) }, groupedActions: view === 'group' && !session.pinned, onMoveTop: view === 'group' && !session.pinned && sortable ? () => moveTaskToTop(session.id) : undefined, onOpenFiles: onOpenSessionFiles && (session.workingDirectory?.trim() || state.projects.some(project => project.id === session.projectId && project.directoryExists)) ? () => onOpenSessionFiles(session.id) : undefined, onOpenExecution: onOpenExecution ? () => onOpenExecution(session.id) : undefined, onOpenModelTrace: onOpenModelTrace ? () => onOpenModelTrace(session.id) : undefined, archiveConfirming: archiveConfirmingId === session.id, onArchiveConfirmation: (confirming: boolean) => setArchiveConfirmingId(previous => confirming ? session.id : previous === session.id ? '' : previous), sortable, active: !extensionsActive && !automationsActive && !draft?.selected && session.id === activeSessionId, renaming: renamingId === session.id, renameRevision, onBeginRename: () => { renameEpoch.current++; setRenamingId(session.id) }, onRename: (title: string) => controller.renameSession(session.id, title), onCancelRename: () => { if (renameEpoch.current === renameRevision) { renameEpoch.current++; setRenamingId(previous => previous === session.id ? '' : previous) } }, onOpen: () => openSession(session.id) })
  const retainedSessionKeys = [draggingId, renamingId, archiveConfirmingId].filter(Boolean)
  const renderRows = (sessions: HarnessSessionSummary[], limit = SESSION_LIMIT, allowSort = sortable, showProject = false, listId?: string) => <SortableContext items={sessions.map(item => item.id)} strategy={verticalListSortingStrategy}><MiraSidebarVirtualList items={sessions.slice(0, limit)} getItemKey={session => session.id} scrollElement={sidebarScrollElement} retainedKeys={retainedSessionKeys} listId={listId} estimateSize={() => 35} renderItem={session => <SessionRow key={session.id} {...rowProps(session)} sortable={allowSort} showProject={showProject} />} /></SortableContext>
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
    projectSelection.current = true; setAddingProject(true); setProjectSelectionError('')
    try {
      const project = await controller.selectProject()
      if (project) { setShowAllProjects(true); preferenceStore.change({ projectSectionOpen: true }); preferenceStore.setProjectsExpanded([project.id], true) }
    } catch (error) { setProjectSelectionError(error instanceof Error ? error.message : '添加项目失败，请重试。') }
    finally { projectSelection.current = false; setAddingProject(false) }
  }
  const confirmRemoveProject = async () => {
    const project = removingProject
    if (!project || removeProjectBusy) return
    setRemoveProjectBusy(true); setRemoveProjectError('')
    try {
      await controller.removeProject(project.id)
      if (preferenceState.ready) preferenceStore.change({ expandedProjectIds: expandedProjectIds.filter(id => id !== project.id) })
      setRemovingProject(undefined)
    } catch (error) { setRemoveProjectError(error instanceof Error ? error.message : '项目移除失败，请重试。') }
    finally { setRemoveProjectBusy(false) }
  }

  const overlayGroup = groups.find(group => group.id === draggedGroupId)
  const overlayProject = state.projects.find(project => project.id === draggedProjectId)
  const overlaySession = state.sessions.find(session => session.id === draggingId)

  const overlayContainer = document.getElementById('root')
  const dragOverlay = <DragOverlay dropAnimation={null}>{(overlayGroup || overlayProject || overlaySession) && <div className={`mira-session-drag-overlay${overlayGroup ? ' mira-session-drag-overlay--group' : overlayProject ? ' mira-session-drag-overlay--project' : ' mira-session-drag-overlay--task'}`} data-sidebar-drag-overlay={overlayGroup ? 'group' : overlayProject ? 'project' : 'task'} data-group-color={overlayGroup?.color} style={{ width: dragOverlayWidth }}>
      {overlayGroup ? <span className="mira-collection-color"><Hash size={12} /></span> : overlayProject ? <Folder size={14} /> : overlaySession?.pinned || view === 'project' ? <Pin size={14} /> : null}<span>{overlayGroup?.name || overlayProject?.name || overlaySession?.title || '新任务'}</span>{overlayGroup && <span className="mira-session-drag-overlay__count">{overlayGroup.sessionIds.filter(id => sessionById.has(id) && !sessionById.get(id)?.pinned).length}</span>}
      {overlaySession && (view === 'project' ? <Archive size={14} /> : <X size={14} />)}
    </div>}</DragOverlay>

  return <Tooltip.Provider delayDuration={350}><SidebarTabs.Root value={view} onValueChange={value => { if (value === 'group' || value === 'project') { setArchived(false); preferenceStore.change({ view: value }) } }} asChild><aside id="pilot-sessions" className="pilot-nav" style={{ width }} role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label="会话">
    {modal && <button type="button" className="pilot-drawer__close" aria-label="关闭会话" onClick={onClose}><X size={15} /></button>}
    <nav className="mira-session-actions" aria-label="任务导航">
      <button type="button" onClick={newTask} aria-label="新建任务" aria-keyshortcuts={miraPrimaryKeyShortcuts('N')}><MessageCirclePlus size={16} /><span>新建任务</span><ShortcutKeys shortcut={miraShortcutLabel('N')} /></button>
      {!onSearch && <SidebarActionHint title="搜索会话"><button type="button" onClick={() => { setSearchOpen(value => !value); if (searchOpen) setSearch('') }} aria-label="搜索会话" aria-expanded={searchOpen}><Search size={16} /><span>搜索</span><ShortcutKeys shortcut={miraShortcutLabel('K')} /></button></SidebarActionHint>}
      <button type="button" aria-current={automationsActive ? 'page' : undefined} onClick={onOpenAutomations || (() => void controller.navigate('/workspace/automations'))}><CalendarClock size={16} /><span>自动化</span></button>
      <button type="button" aria-current={extensionsActive ? 'page' : undefined} onClick={onOpenExtensions || (() => void controller.navigate('/settings/personalization'))}><Blocks size={16} /><span>{onOpenExtensions ? '插件市场' : '技能管理'}</span></button>
    </nav>
    {searchOpen && <div className="mira-session-search"><Search size={14} /><input ref={searchRef} autoFocus value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSearch(''); setSearchOpen(false) } }} placeholder="搜索任务或项目" aria-label="搜索任务或项目" /><SidebarActionHint title="关闭搜索"><button type="button" aria-label="关闭搜索" onClick={() => { setSearch(''); setSearchOpen(false) }}><X size={13} /></button></SidebarActionHint></div>}
    <div className="mira-session-toolbar">
      <SidebarTabs.List className="mira-session-view" aria-label="任务视图"><SidebarTabs.Trigger value="group" onClick={() => setArchived(false)}><Hash size={12} aria-hidden="true" />分组</SidebarTabs.Trigger><SidebarTabs.Trigger value="project" onClick={() => setArchived(false)}><Folder size={12} aria-hidden="true" />项目</SidebarTabs.Trigger></SidebarTabs.List>
      {canToggleCollections && <SidebarActionHint title={toggleCollectionsLabel}><button type="button" className="mira-session-icon" aria-label={toggleCollectionsLabel} disabled={!preferenceState.ready} onClick={() => { if (view === 'group') preferenceStore.setGroupsExpanded(!allCollectionsExpanded); else preferenceStore.setProjectsExpanded(toggleableProjects, !allCollectionsExpanded, !allCollectionsExpanded) }}>{allCollectionsExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></SidebarActionHint>}
      {!archived && view === 'group' && <SidebarActionHint title="新建分组"><button type="button" className="mira-session-icon" aria-label="新建分组" disabled={!preferenceState.ready} onClick={() => setRenamingCollection(`sidebar-group:${preferenceStore.createGroup()}`)}><Hash size={15} /></button></SidebarActionHint>}
      {!archived && timeline && <SidebarActionHint title="添加项目"><button type="button" className="mira-session-icon" aria-label="添加项目" disabled={!preferenceState.ready || addingProject} onClick={() => { void addProject() }}>{addingProject ? <LoaderCircle size={15} className="pilot-spin" /> : <Plus size={15} />}</button></SidebarActionHint>}
      {(view === 'project' || archived) && <DropdownMenu.Root><SidebarActionHint title={view === 'project' && !archived ? '任务视图选项' : '任务排序'}><DropdownMenu.Trigger asChild><button type="button" className="mira-session-icon" aria-label={view === 'project' && !archived ? '任务视图选项' : '任务排序'}>{view === 'project' && !archived ? <ListFilter size={15} /> : <ArrowDownWideNarrow size={15} />}</button></DropdownMenu.Trigger></SidebarActionHint><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content align="end" sideOffset={6} className="mira-session-menu">
        {!archived && view === 'project' && <><DropdownMenu.Label className="mira-session-menu__label">显示方式</DropdownMenu.Label><DropdownMenu.RadioGroup value={projectView} onValueChange={value => { if (value === 'collections' || value === 'timeline') { preferenceStore.change({ projectView: value }); setTimelineLimit(TIMELINE_PAGE_SIZE) } }}><DropdownMenu.RadioItem value="collections" className="mira-session-menu__item"><Folder size={14} />按项目<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem><DropdownMenu.RadioItem value="timeline" className="mira-session-menu__item"><Clock3 size={14} />时间线<DropdownMenu.ItemIndicator className="mira-session-menu__arrow"><Check size={13} /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem></DropdownMenu.RadioGroup><DropdownMenu.Separator className="mira-session-menu__separator" /></>}
        <DropdownMenu.Label className="mira-session-menu__label">任务排序</DropdownMenu.Label><DropdownMenu.RadioGroup value={sort === 'created' ? 'created' : 'updated'} >{[{ id: 'updated', label: '最近更新' }, { id: 'created', label: '创建时间' }].map(option => <DropdownMenu.RadioItem key={option.id} value={option.id} onSelect={() => { preferenceStore.change({ sort: option.id as 'updated' | 'created', manualSessionScopes: [] }); setTimelineLimit(TIMELINE_PAGE_SIZE) }} className="mira-session-menu__item"><span className="mira-session-menu__indicator"><DropdownMenu.ItemIndicator><Check size={13} /></DropdownMenu.ItemIndicator></span>{option.label}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}
      {archived && <div ref={setArchivedActions} className="mira-session-archived-actions" />}
      <SidebarActionHint title={archived ? '返回任务列表' : '查看已归档任务'}><button type="button" className="mira-session-icon" aria-label={archived ? '返回任务列表' : '查看已归档任务'} aria-pressed={archived} onClick={() => setArchived(value => !value)}>{archived ? <X size={15} /> : <Archive size={15} />}</button></SidebarActionHint>
    </div>
    {preferenceState.error && <div className="mira-session-feedback" role="alert"><CircleAlert size={13} /><span>{preferenceState.error}</span><button type="button" onClick={() => void preferenceStore.retry().catch(() => undefined)}>重试</button></div>}
    {projectSelectionError && view === 'project' && !archived && <p className="mira-session-feedback" role="alert">{projectSelectionError}</p>}
    <DndContext sensors={sensors} modifiers={[restrictSidebarCollectionDrag]} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragOver={previewDrop} onDragCancel={resetDrag} onDragEnd={handleDragEnd}><SidebarDragCursor /><SidebarDropMeasurements preview={dragPreview} /><SidebarTabs.Content value={view} className="mira-session-scroll" tabIndex={-1}><MiraSidebarStickyHeader scrollElement={sidebarScrollElement} groups={stickyGroups} active={view === 'group' && !archived} dragging={Boolean(draggingId || draggedGroupId || draggedProjectId || draggedSectionId)} onToggle={id => { const group = preferenceStore.getSnapshot().preferences.groups.find(group => group.id === id); if (group) preferenceStore.updateGroup(id, { collapsed: !group.collapsed }) }} onNewTask={createGroupTask} onColor={(id, color) => preferenceStore.updateGroup(id, { color })} onUngroup={id => preferenceStore.removeGroup(id)} onError={error => controller.reportError(error)} /><div ref={setSidebarScrollElement} className="mira-session-list">
      {pinned.length > 0 && <GroupSection title="置顶" icon={<Pin size={12} />}>{renderRows(pinned, pinned.length, sortable && (view !== 'group' || sort === 'manual'))}</GroupSection>}
      {archived ? <ArchivedSessions controller={controller} sort={sort === 'created' ? 'created' : 'updated'} refreshKey={state.sessions.map(item => item.id).join(',')} activeId={extensionsActive || automationsActive ? undefined : activeSessionId ?? undefined} active={!extensionsActive && !automationsActive} actionsContainer={archivedActions} onOpen={openSession} /> : <>
      {timeline && <><div aria-label="任务时间线">{timelineGroups.map(group => <GroupSection key={group.label} title={group.label}>{renderRows(group.sessions, group.sessions.length, false, true)}</GroupSection>)}</div>{!query && timelineSessions.length > timelineLimit && <button type="button" className="mira-session-more" onClick={() => setTimelineLimit(limit => limit + TIMELINE_PAGE_SIZE)}>显示更多任务</button>}{!timelineSessions.length && !query && <p className="mira-session-hint">暂无任务</p>}</>}
      {!timeline && <>
      {view === 'group' ? <div data-sidebar-root role="group" aria-label="分组任务">{!draftGroupId && draftRow}<SortableContext items={rootItems.map(item => item.type === 'group' ? `sidebar-group:${item.id}` : item.id)} strategy={draggedGroupId ? collectionSortingStrategy : verticalListSortingStrategy}><MiraSidebarVirtualList items={rootItems} getItemKey={item => item.type === 'group' ? `sidebar-group:${item.id}` : item.id} scrollElement={sidebarScrollElement} listId="root" retainedKeys={[...retainedSessionKeys, ...groups.filter(group => group.sessionIds.some(id => retainedSessionKeys.includes(id))).map(group => `sidebar-group:${group.id}`), ...(draggedGroupId ? [`sidebar-group:${draggedGroupId}`] : []), renamingCollection].filter(Boolean)} estimateSize={item => item.type === 'session' ? 35 : 40 + (collectionById.get(item.id)?.group.collapsed ? 0 : Math.min(collectionById.get(item.id)?.sessions.length ?? 0, 24) * 35)} renderItem={item => {
        if (item.type === 'session') {
          const entry = rootSessionById.get(item.id)
          return entry ? <SessionRow key={item.id} {...rowProps(entry)} /> : null
        }
        const entry = collectionById.get(item.id)!
        const { group, sessions } = entry
        const hasDraft = showDraft && draftGroupId === group.id
        return <SidebarTaskCollection key={group.id} id={`sidebar-group:${group.id}`} name={group.name} color={group.color} count={sessions.length + (hasDraft ? 1 : 0)} {...collectionStatus(sessions)} expanded={Boolean(query) || !group.collapsed && group.id !== draggedGroupId} sortable={sortable} renaming={renamingCollection === `sidebar-group:${group.id}`} onToggle={() => preferenceStore.updateGroup(group.id, { collapsed: !group.collapsed })} onBeginRename={() => setRenamingCollection(`sidebar-group:${group.id}`)} onCancelRename={() => setRenamingCollection('')} onRename={name => preferenceStore.updateGroup(group.id, { name })} onColor={color => preferenceStore.updateGroup(group.id, { color })} onNewTask={() => createGroupTask(group.id)} onUngroup={() => preferenceStore.removeGroup(group.id)}>{hasDraft && draftRow}{renderRows(sessions, sessions.length, sortable, false, `group:${group.id}`)}{!sessions.length && !hasDraft && <SidebarEmptyDropZone groupId={group.id} name={group.name} disabled={!sortable} onNewTask={() => void createGroupTask(group.id).catch(error => controller.reportError(error))} />}</SidebarTaskCollection>
      }} /></SortableContext><SidebarRootDropZone disabled={!sortable} dragging={Boolean(draggingId)} /></div> : <SortableContext items={sectionOrder.map(id => `sidebar-section:${id}`)} strategy={verticalListSortingStrategy}>{sectionOrder.map(sectionId => sectionId === 'projects' ? <MiraSidebarSection key="projects" sortable={sectionSortable} id="projects" title="项目" open={Boolean(query) || projectSectionOpen} disabled={!preferenceState.ready} onOpenChange={open => { if (!query) preferenceStore.change({ projectSectionOpen: open }) }} action={<SidebarActionHint title="添加项目"><button type="button" className="mira-session-icon" aria-label="添加项目" disabled={!preferenceState.ready || addingProject} onClick={() => { void addProject() }}>{addingProject ? <LoaderCircle size={15} className="pilot-spin" /> : <Plus size={15} />}</button></SidebarActionHint>}><SortableContext items={projects.map(({ project }) => `sidebar-project:${project.id}`)} strategy={collectionSortingStrategy}>
        {projects.map(({ project, sessions }) => {
          const expanded = Boolean(query) || expandedProjectIds.includes(project.id) && project.id !== draggedProjectId
          const limit = projectTaskLimits[project.id] ?? PROJECT_SESSION_LIMIT
          return <SidebarCollectionSection key={project.id} id={`sidebar-project:${project.id}`} name={project.name} directory={project.directory} count={sessions.length} {...collectionStatus(sessions)} expanded={expanded} sortable={sortable} unavailableReason={!project.directoryExists ? '项目目录不可用，请恢复原路径后重新打开项目；历史任务仍可查看。' : undefined} renaming={renamingCollection === `sidebar-project:${project.id}`} onToggle={() => { if (preferenceState.ready) preferenceStore.setProjectsExpanded([project.id], !expandedProjectIds.includes(project.id)) }} onBeginRename={() => setRenamingCollection(`sidebar-project:${project.id}`)} onCancelRename={() => setRenamingCollection('')} onRename={name => controller.renameProject(project.id, name)} onNewTask={() => onNewProjectConversation ? onNewProjectConversation(project.id) : controller.create(project.id).then(() => undefined)} onOpenFiles={onOpenProjectFiles ? () => onOpenProjectFiles(project.id) : undefined} onOpenDirectory={target => controller.openProject(project.id, target)} onRemove={controller.supportsProjectRemoval ? () => { setRemoveProjectError(''); setRemovingProject(project) } : undefined}>{renderRows(sessions, query ? sessions.length : limit)}{!sessions.length && <p className="mira-session-hint">暂无任务</p>}{sessions.length > limit && !query && <button type="button" className="mira-session-more" aria-label={`显示 ${project.name} 的更多任务`} onClick={() => setProjectTaskLimits(previous => ({ ...previous, [project.id]: (previous[project.id] ?? PROJECT_SESSION_LIMIT) + PROJECT_SESSION_LIMIT }))}>显示更多</button>}</SidebarCollectionSection>
        })}
        </SortableContext>
        {allProjects.length > PROJECT_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllProjects(value => !value)}>{showAllProjects ? '收起项目' : '显示更多项目'}</button>}
        {!allProjects.length && !query && <p className="mira-session-hint">添加项目以开始工作。</p>}</MiraSidebarSection>
        : <MiraSidebarSection key="personal" sortable={sectionSortable} id="personal" title="个人工作区" open={Boolean(query) || personalSectionOpen} disabled={!preferenceState.ready} onOpenChange={open => { if (!query) preferenceStore.change({ personalSectionOpen: open }) }} action={<SidebarActionHint title="新建个人任务"><button type="button" className="mira-session-icon" aria-label="在个人工作区新建任务" onClick={onNewPersonalConversation || newTask}><MessageCirclePlus size={14} /></button></SidebarActionHint>}>{renderRows(ordered(model.recent.filter(matches)), showAllRecent || query ? model.recent.length : SESSION_LIMIT)}{!model.recent.length && !query && <p className="mira-session-hint">暂无个人任务</p>}{model.recent.length > SESSION_LIMIT && !query && <button type="button" className="mira-session-more" onClick={() => setShowAllRecent(value => !value)}>{showAllRecent ? '收起' : '显示更多'}</button>}</MiraSidebarSection>
      )}</SortableContext>}
      {query && !pinned.length && !attention.length && !running.length && !recent.length && !(view === 'group' && showDraft) && <p className="mira-session-hint">没有匹配的任务</p>}
      {!query && !sessions.length && !(view === 'group' && showDraft) && <p className="mira-session-hint">新建任务后，对话会显示在这里。</p>}
      </>}
      {timeline && query && !pinned.length && !timelineSessions.length && <p className="mira-session-hint">没有匹配的任务</p>}
      </>}
    </div></SidebarTabs.Content>{/* The live preview is already at the drop position; avoid animating a second copy. */}{overlayContainer ? createPortal(dragOverlay, overlayContainer) : dragOverlay}</DndContext>
    <SidebarFooter controller={controller} />
    {removingProject && <Dialog.Root open onOpenChange={open => { if (!open && !removeProjectBusy) { setRemovingProject(undefined); setRemoveProjectError('') } }}><Dialog.Portal container={document.getElementById('root')}><Dialog.Overlay className="mira-confirm-overlay" /><Dialog.Content className="mira-confirm" onEscapeKeyDown={event => { if (removeProjectBusy) event.preventDefault() }} onPointerDownOutside={event => { if (removeProjectBusy) event.preventDefault() }}><Dialog.Title>{`移除项目「${removingProject.name}」？`}</Dialog.Title><Dialog.Description>该项目的全部任务、对话与相关自动化会一并从 Mira 删除，磁盘文件不受影响；项目内仍有运行中的任务时请先停止。</Dialog.Description>{removeProjectError && <p className="mira-confirm-error" role="alert">{removeProjectError}</p>}<div className="mira-confirm-actions"><button type="button" disabled={removeProjectBusy} onClick={() => { setRemovingProject(undefined); setRemoveProjectError('') }}>取消</button><button type="button" className="mira-confirm-danger" aria-label="确认移除项目" disabled={removeProjectBusy} onClick={() => void confirmRemoveProject()}>{removeProjectBusy ? <><LoaderCircle size={14} className="pilot-spin" />正在移除…</> : '移除项目'}</button></div><SidebarActionHint title="关闭移除确认"><Dialog.Close asChild><button type="button" className="mira-confirm-close mira-session-icon" aria-label="关闭移除确认" disabled={removeProjectBusy}><X size={16} /></button></Dialog.Close></SidebarActionHint></Dialog.Content></Dialog.Portal></Dialog.Root>}
  </aside></SidebarTabs.Root></Tooltip.Provider>
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

function SidebarDragCursor() {
  const { active } = useDndContext()
  useEffect(() => {
    if (!active) return
    document.documentElement.classList.add('mira-sidebar-dragging')
    return () => document.documentElement.classList.remove('mira-sidebar-dragging')
  }, [Boolean(active)])
  return null
}

function SidebarDraftRow({ draft, active, onOpen, onClose }: { draft: NonNullable<SessionDrawerProps['draft']>; active: boolean; onOpen: () => void; onClose: () => void }) {
  return <div data-sidebar-draft-id={draft.draftId} className={`mira-session-row mira-session-draft${active ? ' is-active' : ''}`}>
    <button type="button" className="mira-session-row__open" aria-label="打开草稿 新任务" aria-current={active ? 'page' : undefined} onClick={onOpen}><span>新任务</span></button>
    <span className="mira-session-draft__workspace" title={draft.workspaceLabel || '个人工作区'}>{draft.workspaceLabel || '个人工作区'}</span>
    <span className="mira-session-draft__status" aria-label="未发送草稿" />
    <div className="mira-session-draft__actions"><SidebarActionHint title="关闭草稿，保留输入内容"><button type="button" className="mira-session-row__action" aria-label="关闭草稿 新任务" onClick={onClose}><X size={14} /></button></SidebarActionHint></div>
  </div>
}

function SessionRow({ session, state, controller, groups, groupsReady, currentGroupId, onMoveGroup, groupedActions, onMoveTop, onOpenFiles, onOpenExecution, onOpenModelTrace, taskPaneEntry, archiveConfirming, onArchiveConfirmation, active, sortable, renaming, renameRevision, showProject, onBeginRename, onRename, onCancelRename, onOpen }: { session: HarnessSessionSummary; state: ReturnType<PilotController['getSnapshot']>; controller: PilotController; groups: SidebarTaskGroup[]; groupsReady: boolean; currentGroupId?: string; onMoveGroup: (groupId?: string) => void; groupedActions: boolean; onMoveTop?: () => Promise<void>; onOpenFiles?: () => void | Promise<void>; onOpenExecution?: () => Promise<unknown>; onOpenModelTrace?: () => Promise<unknown>; taskPaneEntry?: SessionDrawerProps['taskPaneEntry']; archiveConfirming: boolean; onArchiveConfirmation: (confirming: boolean) => void; active: boolean; sortable: boolean; renaming: boolean; renameRevision: number; showProject?: boolean; onBeginRename: () => void; onRename: (title: string) => Promise<boolean>; onCancelRename: () => void; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id, disabled: renaming || !sortable })
  const [title, setTitle] = useState(session.title)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuVisible = contextMenuOpen
  const busyRef = useRef(false)
  const [savingTitle, setSavingTitle] = useState(false)
  const renameRequest = useRef<object | undefined>(undefined)
  const composingTitle = useRef(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const setRowRef = useMemo(() => (node: HTMLDivElement | null) => { rowRef.current = node; setNodeRef(node) }, [setNodeRef])
  useEffect(() => { if (!renaming) setTitle(session.title) }, [renaming, session.title])
  useEffect(() => {
    renameRequest.current = undefined; composingTitle.current = false; setSavingTitle(false)
    if (renaming) setError('')
    return () => { renameRequest.current = undefined }
  }, [renaming, renameRevision])
  const rename = async () => {
    const next = title.trim().slice(0, 42)
    if (!renaming || renameRequest.current || composingTitle.current || !next) return
    const request = {}
    renameRequest.current = request; setSavingTitle(true); setError('')
    try {
      const saved = await onRename(next)
      if (renameRequest.current !== request) return
      if (saved) onCancelRename()
      else setError(controller.getSnapshot().error || '任务名称未保存，请重试。')
    } catch (cause) { if (renameRequest.current === request) setError(cause instanceof Error ? cause.message : '任务名称未保存，请重试。') }
    finally { if (renameRequest.current === request) { renameRequest.current = undefined; setSavingTitle(false) } }
  }
  const badge = sessionBadge(session, { running: state.runningSessionIds.includes(session.id), unread: state.unreadSessionIds.includes(session.id), pending: Boolean(state.pendingPermissions[session.id]) })
  const leadingBadge = session.status === 'failed' ? { kind: 'failed', label: '执行失败' } : state.unreadSessionIds.includes(session.id) || session.unread ? { kind: 'unread', label: '未读' } : badge
  const waiting = Boolean(state.pendingPermissions[session.id]) || session.planStatus === 'needs_input' || session.planStatus === 'awaiting_confirmation'
  const interactionLabel = session.planStatus === 'needs_input' ? '需输入' : session.planStatus === 'awaiting_confirmation' ? '待确认' : '待授权'
  const interactionDescription = session.planStatus === 'needs_input' ? '需要用户输入' : session.planStatus === 'awaiting_confirmation' ? '等待确认' : '等待审批'
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
  const menuProps = { onDelete: () => setDeleting(true), session, projects: state.projects, controller, groups, groupsReady, currentGroupId, onMoveGroup, onMoveTop, groupedActions, onRename: onBeginRename, onOpenFiles: onOpenFiles ? () => run(onOpenFiles) : undefined, onOpenExecution, onOpenModelTrace, taskPaneEntry, onArchive: archive, busy, run }
  const stopPointer = (event: React.MouseEvent | React.PointerEvent) => { event.stopPropagation() }
  const archiveLabel = `${groupedActions ? '关闭' : archiveConfirming ? '确认归档' : '归档'} ${session.title || '新任务'}`
  return <ContextMenu.Root onOpenChange={open => { setContextMenuOpen(open); if (open) onArchiveConfirmation(false) }}>
    <ContextMenu.Trigger asChild disabled={renaming}>
      <div ref={setRowRef} {...(sortable && !renaming && !busy ? attributes : {})} {...(sortable && !renaming && !busy ? listeners : {})} onKeyDown={event => { if (event.target === event.currentTarget) listeners?.onKeyDown?.(event) }} aria-label={sortable ? `拖拽排序 ${session.title || '新任务'}` : undefined} data-sidebar-draggable={sortable && !renaming && !busy || undefined} data-sidebar-session-id={session.id} data-menu-open={menuVisible || undefined} data-pending-interaction={waiting || undefined} data-archive-confirming={archiveConfirming || undefined} aria-busy={busy || savingTitle || undefined} className={`mira-session-row${showProject ? ' mira-session-row--timeline' : ''}${active ? ' is-active' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: isDragging ? undefined : transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
        {renaming ? <form className="mira-session-rename" onSubmit={event => { event.preventDefault(); void rename() }}><input autoFocus value={title} maxLength={42} aria-label="会话标题" disabled={savingTitle} aria-invalid={Boolean(error)} onChange={event => setTitle(event.target.value)} onCompositionStart={() => { composingTitle.current = true }} onCompositionEnd={() => { composingTitle.current = false }} onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return
          const ime = composingTitle.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
          event.stopPropagation()
          if (ime) { if (event.key === 'Enter') event.preventDefault(); return }
          event.preventDefault()
          if (event.key === 'Enter') void rename()
          else if (!renameRequest.current) onCancelRename()
        }} /><SidebarActionHint title="保存标题"><button type="submit" aria-label="保存标题" disabled={savingTitle || !title.trim()}>{savingTitle ? <LoaderCircle size={14} className="pilot-spin" /> : <Check size={14} />}</button></SidebarActionHint></form> : <>
          <div className={`mira-session-row__leading${!groupedActions ? ' has-pin-action' : ''}`}>
            {!waiting && leadingBadge ? <SidebarActionHint suspended={menuVisible} title={leadingBadge.label}><span tabIndex={0} className={`mira-session-status mira-session-status--${leadingBadge.kind}`} aria-label={leadingBadge.label}>{leadingBadge.kind === 'unread' || leadingBadge.kind === 'failed' ? <span /> : leadingBadge.kind === 'running' || leadingBadge.kind === 'plan' && session.planStatus === 'executing' ? <LoaderCircle size={16} className="pilot-spin" /> : <CircleAlert size={12} />}</span></SidebarActionHint> : session.pinned ? <Pin size={16} className="mira-session-row__pinned" aria-label="已置顶" /> : showProject ? <span className="mira-session-row__idle" /> : null}
            {!groupedActions && <SidebarActionHint suspended={menuVisible} title={session.pinned ? '取消置顶' : '置顶'}><button type="button" className="mira-session-row__pin" aria-label={`${session.pinned ? '取消置顶' : '置顶'} ${session.title || '新任务'}`} aria-pressed={Boolean(session.pinned)} disabled={busy} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={event => { event.stopPropagation(); run(() => controller.setSessionPinned(session.id, !session.pinned)) }}><Pin size={16} /></button></SidebarActionHint>}
          </div>
          <button type="button" className="mira-session-row__open" draggable={Boolean(!sortable && !busy && (taskPaneEntry?.canDrag ?? taskPaneEntry?.canOpen)?.(session.id))} onDragStart={event => { if (busy || !(taskPaneEntry?.canDrag ?? taskPaneEntry?.canOpen)?.(session.id)) { event.preventDefault(); return }; beginMiraTaskDrag(session.id, event.dataTransfer); event.dataTransfer.setData('text/plain', session.title || '新任务') }} onDragEnd={endMiraTaskDrag} onClick={onOpen} aria-current={active ? 'page' : undefined} aria-label={session.title || '新任务'}><MiraSidebarTaskTitle title={session.title || '新任务'} suspended={menuVisible || busy || isDragging} />{showProject && <span className="mira-session-row__project">{session.projectName || state.projects.find(project => project.id === session.projectId)?.name || '个人工作区'}</span>}</button>
          {waiting && <span className={`mira-session-status mira-session-interaction mira-session-interaction--${session.planStatus === 'needs_input' ? 'input' : 'confirmation'}`} title={interactionDescription} aria-label={interactionDescription}>{interactionLabel}</span>}
          {!waiting && <span className="mira-session-row__metadata">{session.automationId && <Clock3 size={14} aria-label="自动化任务" />}<time className="mira-session-row__time" dateTime={new Date(session.updatedAt).toISOString()} title={new Date(session.updatedAt).toLocaleString()}>{relativeSessionTime(session.updatedAt)}</time></span>}
          <div className="mira-session-row__actions">
            {!waiting && <>
              {onMoveTop && <SidebarActionHint suspended={menuVisible} title="移动到顶部"><button type="button" className="mira-session-row__action" aria-label={`移动 ${session.title} 到顶部`} disabled={busy} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={event => { event.stopPropagation(); run(onMoveTop) }}><ArrowUpToLine size={14} /></button></SidebarActionHint>}
              <SidebarActionHint suspended={menuVisible} title={groupedActions ? '关闭' : '归档任务'}><button type="button" className={`mira-session-row__action${archiveConfirming ? ' is-confirming' : ''}`} aria-label={archiveLabel} disabled={busy} onPointerDown={stopPointer} onMouseDown={stopPointer} onClick={event => { event.stopPropagation(); if (busyRef.current) return; if (groupedActions || archiveConfirming) archive(); else onArchiveConfirmation(true) }}>{busy ? <LoaderCircle size={14} className="pilot-spin" /> : archiveConfirming ? '确认' : groupedActions ? <X size={14} /> : <Archive size={14} />}</button></SidebarActionHint>
            </>}
          </div>
        </>}
        {error && <span className="mira-session-row__error" role="alert">{error}</span>}
      </div>
    </ContextMenu.Trigger>
    {deleting && <SessionDeleteDialog session={session} controller={controller} onClose={() => setDeleting(false)} />}
    <ContextMenu.Portal container={document.getElementById('root')}><ContextMenu.Content className="mira-session-menu" onCloseAutoFocus={event => { if (renaming) event.preventDefault() }}><SessionMenuItems kind="context" {...menuProps} /></ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>
}

export function SessionMenuItems({ kind = 'context', session, projects, controller, groups, groupsReady = true, currentGroupId, onMoveGroup, onMoveTop, groupedActions = false, onRename, onOpenFiles, onOpenExecution, onOpenModelTrace, taskPaneEntry, onArchive, onDelete, busy, run }: { kind?: 'context' | 'dropdown'; session: HarnessSessionSummary; projects: HarnessProject[]; controller: PilotController; groups?: SidebarTaskGroup[]; groupsReady?: boolean; currentGroupId?: string; onMoveGroup?: (groupId?: string) => void; onMoveTop?: () => Promise<void>; groupedActions?: boolean; onRename: () => void; onOpenFiles?: () => void; onOpenExecution?: () => Promise<unknown>; onOpenModelTrace?: () => Promise<unknown>; taskPaneEntry?: SessionDrawerProps['taskPaneEntry']; onArchive?: () => void; onDelete?: () => void; busy?: boolean; run: (action: () => Promise<unknown>) => void }) {
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu
  const portal = document.getElementById('root')
  const unread = Boolean(session.unread || controller.getSnapshot().unreadSessionIds.includes(session.id))
  const pinItem = <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionPinned(session.id, !session.pinned))}>{session.pinned ? <PinOff size={14} /> : <Pin size={14} />}{session.pinned ? '取消置顶' : '置顶'}</Menu.Item>
  const groupItems = <>
    {onMoveGroup && <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item" disabled={!groupsReady}><Hash size={14} />{groupsReady ? '移动到分组' : '正在读取分组…'}<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu"><Menu.Item className="mira-session-menu__item" disabled={!currentGroupId || !groupsReady} onSelect={() => { if (groupsReady && currentGroupId) onMoveGroup() }}><X size={14} />移出分组</Menu.Item><Menu.Separator className="mira-session-menu__separator" />{groups?.length ? groups.map(group => <Menu.Item key={group.id} className="mira-session-menu__item" disabled={!groupsReady || group.id === currentGroupId} onSelect={() => { if (groupsReady && group.id !== currentGroupId) onMoveGroup(group.id) }}><span className="mira-collection-swatch" data-group-color={group.color} />{group.name}</Menu.Item>) : <Menu.Item className="mira-session-menu__item" disabled>暂无分组</Menu.Item>}</Menu.SubContent></Menu.Portal></Menu.Sub>}
    {onMoveTop && <Menu.Item className="mira-session-menu__item" disabled={busy || !groupsReady} onSelect={() => { if (!busy && groupsReady) run(onMoveTop) }}><ArrowUpToLine size={14} />移动到顶部</Menu.Item>}
  </>
  return <>
    {groupedActions ? <>{groupItems}<Menu.Separator className="mira-session-menu__separator" /></> : pinItem}
    <Menu.Item className="mira-session-menu__item" onSelect={onRename}><Pencil size={14} />重命名</Menu.Item>
    <Menu.Item className="mira-session-menu__item" disabled={busy} onSelect={() => { if (onArchive) onArchive(); else run(() => controller.archiveSession(session.id)) }}><Archive size={14} />归档</Menu.Item>
    <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => controller.setSessionUnread(session.id, !unread))}><Check size={14} />{unread ? '标记为已读' : '标记为未读'}</Menu.Item>
    {taskPaneEntry && <Menu.Item className="mira-session-menu__item" disabled={busy || !taskPaneEntry.canOpen(session.id)} onSelect={() => { if (!busy && taskPaneEntry.canOpen(session.id)) run(() => taskPaneEntry.open(session.id)) }}><Maximize2 size={14} />在侧面打开任务</Menu.Item>}
    {groupedActions && pinItem}
    <Menu.Separator className="mira-session-menu__separator" />
    {!groupedActions && groupItems}
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><FolderOpen size={14} />移动到项目<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>{projects.length ? projects.map(project => <Menu.Item key={project.id} className="mira-session-menu__item" disabled={project.id === session.projectId || !project.directoryExists} onSelect={() => run(() => controller.moveSession(session.id, project.id))}><Folder size={14} />{project.name}</Menu.Item>) : <Menu.Item className="mira-session-menu__item" disabled>暂无项目</Menu.Item>}</Menu.SubContent></Menu.Portal></Menu.Sub>
    {onOpenFiles && <Menu.Item className="mira-session-menu__item" disabled={busy} onSelect={onOpenFiles}><ListTree size={14} />显示文件树</Menu.Item>}
    {(onOpenExecution || onOpenModelTrace) && <Menu.Item className="mira-session-menu__item" disabled={busy} onSelect={() => run(onOpenExecution ?? onOpenModelTrace!)}><Activity size={14} />查看调用轨迹</Menu.Item>}
    <Menu.Separator className="mira-session-menu__separator" />
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><Copy size={14} />复制<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => copyText(session.workingDirectory || ''))}>工作目录</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(async () => copyText((await controller.getTaskDiagnosticPathsFor(session.id)).sessionFile))}>任务文件路径</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(async () => copyText((await controller.getTaskDiagnosticPathsFor(session.id)).runtimeLog))}>运行日志路径</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(() => copyText(session.id))}>会话 ID</Menu.Item>
      <Menu.Item className="mira-session-menu__item" onSelect={() => run(async () => copyText(sessionMarkdown(await controller.getSession(session.id))))}>复制为 Markdown</Menu.Item>
    </Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Sub><Menu.SubTrigger className="mira-session-menu__item"><TerminalSquare size={14} />打开方式<ChevronRight size={13} className="mira-session-menu__arrow" /></Menu.SubTrigger><Menu.Portal container={portal}><Menu.SubContent className="mira-session-menu" sideOffset={3}>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => controller.openSessionProject(session.id, 'file-manager'))}><Folder size={14} />{fileManagerLabel()}</Menu.Item>
      <Menu.Item className="mira-session-menu__item" disabled={!session.workingDirectory} onSelect={() => run(() => controller.openSessionProject(session.id, 'terminal'))}><TerminalSquare size={14} />终端</Menu.Item>
    </Menu.SubContent></Menu.Portal></Menu.Sub>
    <Menu.Separator className="mira-session-menu__separator" />
    <Menu.Item className="mira-session-menu__item mira-session-menu__item--danger" disabled={busy || !onDelete} onSelect={onDelete}><Trash2 size={14} />删除会话</Menu.Item>
  </>
}
