export const MIRA_PANE_PREFERENCE_KEY = 'harness-react-pane-widths'
export const MIRA_WORKSPACE_RATIO = .45
export const MIRA_WORKSPACE_MIN_WIDTH = 240
export const MIRA_WORKSPACE_MAX_RATIO = .65
// CSS animates for 200ms; the extra 40ms allows transition completion before cleanup.
export const MIRA_PANE_TRANSITION_MS = 240

export function miraSidebarWidth(width: number) { return Math.min(420, Math.max(280, width)) }

export function miraPanePreferences(value: unknown): { sessions: number; workspaceRatio: number } {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  return {
    sessions: finite(saved.sessions) ? miraSidebarWidth(saved.sessions) : 280,
    workspaceRatio: finite(saved.workspaceRatio) && saved.workspaceRatio > 0 ? Math.min(MIRA_WORKSPACE_MAX_RATIO, saved.workspaceRatio) : MIRA_WORKSPACE_RATIO,
  }
}

export function miraWorkspaceRatio(ratio: number, bodyWidth: number) {
  return Math.min(MIRA_WORKSPACE_MAX_RATIO, Math.max(bodyWidth > 0 ? Math.min(MIRA_WORKSPACE_MAX_RATIO, MIRA_WORKSPACE_MIN_WIDTH / bodyWidth) : 0, ratio))
}

export function miraNarrowPaneAction(chatWidth: number, workspaceOpen: boolean, sessionsOpen: boolean) {
  if (workspaceOpen && chatWidth < 480) return 'workspace'
  if (sessionsOpen && chatWidth < 360) return 'sessions'
}
