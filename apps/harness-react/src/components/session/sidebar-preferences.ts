export const SIDEBAR_PREFERENCE_KEY = 'session-drawer'
export const SIDEBAR_GROUP_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
export type SidebarGroupColor = typeof SIDEBAR_GROUP_COLORS[number]
export interface SidebarTaskGroup {
  id: string
  name: string
  color: SidebarGroupColor
  collapsed: boolean
  sessionIds: string[]
}

export interface SidebarPreferences {
  expandedProjectIds: string[]
  collapsedProjectIds: string[]
  view: 'group' | 'project'
  projectView: 'collections' | 'timeline'
  sort: 'updated' | 'created' | 'manual'
  groups: SidebarTaskGroup[]
  hiddenProjectIds: string[]
  ungroupedSessionOrder: string[]
}

const defaults = (): SidebarPreferences => ({ expandedProjectIds: [], collapsedProjectIds: [], view: 'project', projectView: 'collections', sort: 'updated', groups: [], hiddenProjectIds: [], ungroupedSessionOrder: [] })
const strings = (raw: unknown) => Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === 'string' && Boolean(id)))] : []

function readPreferences(raw: unknown): SidebarPreferences {
  const value = raw && typeof raw === 'object' ? raw as Partial<SidebarPreferences> : {}
  const seenGroups = new Set<string>(), seenSessions = new Set<string>()
  const groups: SidebarTaskGroup[] = []
  for (const group of Array.isArray(value.groups) ? value.groups : []) {
    if (!group || typeof group.id !== 'string' || !group.id || seenGroups.has(group.id) || typeof group.name !== 'string' || !group.name.trim()) continue
    seenGroups.add(group.id)
    const sessionIds = strings(group.sessionIds).filter(id => { if (seenSessions.has(id)) return false; seenSessions.add(id); return true })
    groups.push({ id: group.id, name: group.name.trim().slice(0, 64), color: SIDEBAR_GROUP_COLORS.includes(group.color) ? group.color : 'gray', collapsed: group.collapsed === true, sessionIds })
  }
  const expandedProjectIds = strings(value.expandedProjectIds)
  return {
    expandedProjectIds,
    collapsedProjectIds: strings(value.collapsedProjectIds).filter(id => !expandedProjectIds.includes(id)),
    view: value.view === 'group' ? 'group' : 'project',
    projectView: value.projectView === 'timeline' ? 'timeline' : 'collections',
    sort: value.sort === 'created' || value.sort === 'manual' ? value.sort : 'updated',
    groups,
    hiddenProjectIds: strings(value.hiddenProjectIds),
    ungroupedSessionOrder: strings(value.ungroupedSessionOrder),
  }
}

/** A failed read never writes defaults; late hydration preserves fields the user touched. */
export class SidebarPreferenceStore {
  private snapshot = { preferences: defaults(), ready: false, error: '' }
  private listeners = new Set<() => void>()
  private touched = new Set<keyof SidebarPreferences>()
  private reading?: Promise<void>
  private saving?: Promise<void>
  private revision = 0
  private savedRevision = 0
  constructor(private read: () => Promise<unknown>, private write: (value: SidebarPreferences) => Promise<void>) {}
  getSnapshot = () => this.snapshot
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  private publish(patch: Partial<typeof this.snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()) }
  load() {
    if (this.reading) return this.reading
    if (this.snapshot.ready) return Promise.resolve()
    const request = this.read().then(raw => {
      const saved = readPreferences(raw)
      for (const key of this.touched) Object.assign(saved, { [key]: this.snapshot.preferences[key] })
      this.publish({ preferences: saved, ready: true, error: '' })
      if (this.revision) void this.save().catch(() => undefined)
    }).catch(error => { this.publish({ error: error instanceof Error ? error.message : '读取侧栏偏好失败' }); throw error })
    this.reading = request
    void request.then(() => { this.reading = undefined }, () => { this.reading = undefined })
    return request
  }
  change(patch: Partial<SidebarPreferences>) {
    for (const key of Object.keys(patch) as Array<keyof SidebarPreferences>) this.touched.add(key)
    this.revision++
    this.publish({ preferences: { ...this.snapshot.preferences, ...patch } })
    if (this.snapshot.ready) void this.save().catch(() => undefined)
  }
  setProjectsExpanded(projectIds: string[], expanded: boolean) {
    const { expandedProjectIds, collapsedProjectIds } = this.snapshot.preferences
    const ids = new Set(projectIds)
    this.change({
      expandedProjectIds: expanded ? [...new Set([...expandedProjectIds, ...ids])] : expandedProjectIds.filter(id => !ids.has(id)),
      collapsedProjectIds: expanded ? collapsedProjectIds.filter(id => !ids.has(id)) : [...new Set([...collapsedProjectIds, ...ids])],
    })
  }
  setGroupsExpanded(expanded: boolean) {
    this.change({ groups: this.snapshot.preferences.groups.map(group => ({ ...group, collapsed: !expanded })) })
  }
  createGroup() {
    const group: SidebarTaskGroup = { id: crypto.randomUUID(), name: '新分组', color: 'gray', collapsed: false, sessionIds: [] }
    this.change({ groups: [...this.snapshot.preferences.groups, group], view: 'group' })
    return group.id
  }
  updateGroup(id: string, patch: Partial<Pick<SidebarTaskGroup, 'name' | 'color' | 'collapsed' | 'sessionIds'>>) {
    this.change({ groups: this.snapshot.preferences.groups.map(group => group.id === id ? { ...group, ...patch } : group) })
  }
  removeGroup(id: string) {
    const { groups, ungroupedSessionOrder } = this.snapshot.preferences
    const group = groups.find(group => group.id === id)
    if (!this.snapshot.ready || !group) return
    this.change({ groups: groups.filter(group => group.id !== id), ungroupedSessionOrder: [...new Set([...ungroupedSessionOrder, ...group.sessionIds])] })
  }
  moveSessionToGroup(sessionId: string, groupId?: string, expectedGroupId?: string | null) {
    const { groups, ungroupedSessionOrder } = this.snapshot.preferences
    const currentGroupId = groups.find(group => group.sessionIds.includes(sessionId))?.id
    // null explicitly captures an ungrouped task; stale menus cannot change newer membership.
    if (!this.snapshot.ready || !sessionId) return false
    if (expectedGroupId !== undefined && expectedGroupId !== (currentGroupId ?? null)) return false
    if (groupId === currentGroupId || groupId && !groups.some(group => group.id === groupId)) return false
    this.change({
      groups: groups.map(group => ({ ...group, sessionIds: group.id === groupId ? [...group.sessionIds.filter(id => id !== sessionId), sessionId] : group.sessionIds.filter(id => id !== sessionId) })),
      ungroupedSessionOrder: groupId ? ungroupedSessionOrder.filter(id => id !== sessionId) : [...new Set([...ungroupedSessionOrder, sessionId])],
    })
    return true
  }
  async save(): Promise<void> {
    if (this.saving) { await this.saving; return this.save() }
    if (!this.snapshot.ready) { await this.load(); return this.save() }
    if (this.savedRevision === this.revision) return
    const revision = this.revision
    const request = this.write(this.snapshot.preferences).then(() => {
      this.savedRevision = revision
      this.publish({ error: '' })
    }).catch(error => { this.publish({ error: error instanceof Error ? error.message : '保存侧栏偏好失败' }); throw error })
    this.saving = request
    try { await request } finally { if (this.saving === request) this.saving = undefined }
    if (this.savedRevision !== this.revision) await this.save()
  }
  retry() { return this.snapshot.ready ? this.save() : this.load() }
}
