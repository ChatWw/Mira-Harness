import type { AutomationRunStatus } from '../config/harness'

export type MiraAppNavigationDirection = 'back' | 'forward'
export type MiraAppNavigationTarget =
  | { kind: 'conversation'; sessionId: string }
  | { kind: 'automations'; taskId?: string; tab?: 'settings' | 'history'; section?: 'tasks' | 'runs'; filter?: 'all' | 'active' | 'paused' | 'failed' | 'ended'; runTaskId?: string; runStatus?: 'all' | AutomationRunStatus }
  | { kind: 'extensions' }
export interface MiraAppNavigationSnapshot { entries: MiraAppNavigationTarget[]; cursor: number; detached: boolean; draft?: 'conversation' | 'automations' }
export interface MiraAppNavigationState {
  type: 'mira:app-navigation-state'; revision: number; canGoBack: boolean; canGoForward: boolean; busy: boolean; snapshot: MiraAppNavigationSnapshot
}
export interface MiraAppNavigationCommand { type: 'mira:app-navigation-command'; direction: MiraAppNavigationDirection; expectedRevision: number }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))
const isRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)

/** Normalize defaults so omitted and explicit default automation views share one identity. */
export function readMiraAppNavigationTarget(value: unknown): MiraAppNavigationTarget | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === 'conversation') return hasOnly(value, ['kind', 'sessionId']) && isId(value.sessionId) ? { kind: 'conversation', sessionId: value.sessionId } : undefined
  if (value.kind === 'extensions') return hasOnly(value, ['kind']) ? { kind: 'extensions' } : undefined
  if (value.kind !== 'automations' || !hasOnly(value, ['kind', 'taskId', 'tab', 'section', 'filter', 'runTaskId', 'runStatus'])) return undefined
  if (value.taskId !== undefined && !isId(value.taskId) || value.runTaskId !== undefined && !isId(value.runTaskId)) return undefined
  if (value.tab !== undefined && value.tab !== 'settings' && value.tab !== 'history') return undefined
  if (value.section !== undefined && value.section !== 'tasks' && value.section !== 'runs') return undefined
  if (value.filter !== undefined && !['all', 'active', 'paused', 'failed', 'ended'].includes(value.filter as string)) return undefined
  if (value.runStatus !== undefined && !['all', 'running', 'completed', 'failed', 'interrupted', 'skipped'].includes(value.runStatus as string)) return undefined
  return {
    kind: 'automations',
    ...(value.taskId === undefined ? {} : { taskId: value.taskId as string }),
    ...(value.tab === undefined || value.tab === 'settings' ? {} : { tab: value.tab as 'history' }),
    ...(value.section === undefined || value.section === 'tasks' ? {} : { section: value.section as 'runs' }),
    ...(value.filter === undefined || value.filter === 'all' ? {} : { filter: value.filter as 'active' | 'paused' | 'failed' | 'ended' }),
    ...(value.runTaskId === undefined ? {} : { runTaskId: value.runTaskId as string }),
    ...(value.runStatus === undefined || value.runStatus === 'all' ? {} : { runStatus: value.runStatus as AutomationRunStatus }),
  }
}

export function readMiraAppNavigationSnapshot(value: unknown): MiraAppNavigationSnapshot | undefined {
  if (!isRecord(value) || !hasOnly(value, ['entries', 'cursor', 'detached', 'draft']) || !Array.isArray(value.entries) || value.entries.length > 50 || typeof value.detached !== 'boolean') return undefined
  if (value.draft !== undefined && (!value.detached || value.draft !== 'conversation' && value.draft !== 'automations')) return undefined
  if (typeof value.cursor !== 'number' || !Number.isInteger(value.cursor) || (value.entries.length ? value.cursor < 0 || value.cursor >= value.entries.length : value.cursor !== -1)) return undefined
  const entries: MiraAppNavigationTarget[] = []
  for (const candidate of value.entries) { const entry = readMiraAppNavigationTarget(candidate); if (!entry) return undefined; entries.push(entry) }
  return { entries, cursor: value.cursor, detached: value.detached, ...(value.draft === undefined ? {} : { draft: value.draft as 'conversation' | 'automations' }) }
}

export function readMiraAppNavigationState(value: unknown): MiraAppNavigationState | undefined {
  if (!isRecord(value) || !hasOnly(value, ['type', 'revision', 'canGoBack', 'canGoForward', 'busy', 'snapshot']) || value.type !== 'mira:app-navigation-state' || !isRevision(value.revision) || typeof value.canGoBack !== 'boolean' || typeof value.canGoForward !== 'boolean' || typeof value.busy !== 'boolean') return undefined
  const snapshot = readMiraAppNavigationSnapshot(value.snapshot)
  return snapshot ? { type: value.type, revision: value.revision, canGoBack: value.canGoBack, canGoForward: value.canGoForward, busy: value.busy, snapshot } : undefined
}

export function readMiraAppNavigationCommand(value: unknown): MiraAppNavigationCommand | undefined {
  if (!isRecord(value) || !hasOnly(value, ['type', 'direction', 'expectedRevision']) || value.type !== 'mira:app-navigation-command' || value.direction !== 'back' && value.direction !== 'forward' || !isRevision(value.expectedRevision)) return undefined
  return { type: value.type, direction: value.direction, expectedRevision: value.expectedRevision }
}

export function miraAppNavigationShortcut(event: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; shiftKey?: boolean; altKey?: boolean; repeat?: boolean; isComposing?: boolean; keyCode?: number; defaultPrevented?: boolean }, platform = typeof navigator === 'undefined' ? '' : navigator.platform): MiraAppNavigationDirection | undefined {
  const modifier = platform ? /Mac/i.test(platform) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey : event.metaKey || event.ctrlKey
  if (!modifier || event.shiftKey || event.altKey || event.repeat || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return undefined
  if (event.key === '[') return 'back'
  if (event.key === ']') return 'forward'
  if (event.code === 'BracketLeft') return 'back'
  if (event.code === 'BracketRight') return 'forward'
  return undefined
}
