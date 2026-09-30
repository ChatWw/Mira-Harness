export type WorkspaceTabId = 'overview' | 'files' | 'changes' | 'terminal' | 'browser'
export type WorkspaceTab = { id: WorkspaceTabId; label: string }
export type WorkspaceSessionState = {
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTabId
  selectedChangeId?: string
  browserUrl: string
}

export function workspaceTabLabel(id: WorkspaceTabId) {
  return { overview: '任务活动', files: '文件', changes: '变更', terminal: '终端', browser: '浏览器' }[id]
}

export function createWorkspaceSession(): WorkspaceSessionState {
  return { tabs: [{ id: 'overview', label: '任务活动' }], activeTab: 'overview', browserUrl: '' }
}

export function openWorkspaceTab(state: WorkspaceSessionState, tab: WorkspaceTab): WorkspaceSessionState {
  return {
    ...state,
    tabs: state.tabs.some(item => item.id === tab.id) ? state.tabs : [...state.tabs, tab],
    activeTab: tab.id,
  }
}

export function closeWorkspaceTab(state: WorkspaceSessionState, id: WorkspaceTabId): WorkspaceSessionState {
  if (id === 'overview') return state
  const tabs = state.tabs.filter(tab => tab.id !== id)
  return { ...state, tabs, activeTab: state.activeTab === id ? tabs[tabs.length - 1].id : state.activeTab }
}

export function labelWorkspaceTab(state: WorkspaceSessionState, id: WorkspaceTabId, label: string): WorkspaceSessionState {
  return { ...state, tabs: state.tabs.map(tab => tab.id === id ? { ...tab, label } : tab) }
}

export function readWorkspaceSessions(value: unknown): Record<string, WorkspaceSessionState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const validIds = new Set<WorkspaceTabId>(['overview', 'files', 'changes', 'terminal', 'browser'])
  return Object.fromEntries(Object.entries(value).flatMap(([sessionId, raw]) => {
    if (!sessionId || !raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const data = raw as Partial<WorkspaceSessionState>
    const tabs = Array.isArray(data.tabs) ? data.tabs.filter((tab, index, items) => tab && validIds.has(tab.id) && typeof tab.label === 'string' && tab.id !== 'overview' && items.findIndex(item => item?.id === tab.id) === index) : []
    const state: WorkspaceSessionState = {
      tabs: [{ id: 'overview', label: '任务活动' }, ...tabs],
      activeTab: validIds.has(data.activeTab as WorkspaceTabId) && (data.activeTab === 'overview' || tabs.some(tab => tab.id === data.activeTab)) ? data.activeTab! : 'overview',
      selectedChangeId: typeof data.selectedChangeId === 'string' ? data.selectedChangeId : undefined,
      browserUrl: typeof data.browserUrl === 'string' && /^https?:\/\//i.test(data.browserUrl) ? data.browserUrl : '',
    }
    return [[sessionId, state]]
  }))
}
