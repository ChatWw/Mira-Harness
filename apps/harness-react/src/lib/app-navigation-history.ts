// Adapted from ZCode taskNavigationHistory (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira adds guarded replay and detached draft handling.
import { readMiraAppNavigationTarget, type MiraAppNavigationDirection, type MiraAppNavigationSnapshot, type MiraAppNavigationTarget } from '../../../../src/platform/appNavigation'

export function emptyMiraNavigationHistory(): MiraAppNavigationSnapshot {
  return { entries: [], cursor: -1, detached: false }
}

export function recordMiraNavigation(history: MiraAppNavigationSnapshot, target: MiraAppNavigationTarget): MiraAppNavigationSnapshot {
  const entry = readMiraAppNavigationTarget(target)
  if (!entry) return history
  const current = history.entries[history.cursor]
  if (current && JSON.stringify(current) === JSON.stringify(entry)) return history.detached ? { entries: history.entries, cursor: history.cursor, detached: false } : history
  const entries = [...history.entries.slice(0, history.cursor + 1), entry].slice(-50)
  return { entries, cursor: entries.length - 1, detached: false }
}

/** Drafts stay outside the stack; back first returns to the last displayed entry. */
export function detachMiraNavigation(history: MiraAppNavigationSnapshot, draft: 'conversation' | 'automations' = 'conversation'): MiraAppNavigationSnapshot {
  return history.detached && history.draft === draft ? history : { ...history, detached: true, draft }
}

/** The caller commits this plan only after draft saving and target opening succeed. */
export function planMiraNavigation(history: MiraAppNavigationSnapshot, direction: MiraAppNavigationDirection): { history: MiraAppNavigationSnapshot; target: MiraAppNavigationTarget } | undefined {
  if (history.detached && direction === 'forward') return undefined
  const cursor = history.cursor + (history.detached ? 0 : direction === 'back' ? -1 : 1)
  const target = history.entries[cursor]
  return target ? { history: { entries: history.entries, cursor, detached: false }, target } : undefined
}

export function removeMiraNavigationSession(history: MiraAppNavigationSnapshot, id: string): MiraAppNavigationSnapshot {
  return removeMiraTarget(history, entry => entry.kind === 'conversation' && entry.sessionId === id)
}

export function removeMiraNavigationAutomation(history: MiraAppNavigationSnapshot, id: string): MiraAppNavigationSnapshot {
  return removeMiraTarget(history, entry => entry.kind === 'automations' && (entry.taskId === id || entry.runTaskId === id))
}

function removeMiraTarget(history: MiraAppNavigationSnapshot, matches: (entry: MiraAppNavigationTarget) => boolean): MiraAppNavigationSnapshot {
  const current = history.entries[history.cursor]
  const entries = history.entries.filter(entry => !matches(entry))
  if (entries.length === history.entries.length) return history
  const currentIndex = current ? entries.indexOf(current) : -1
  return {
    entries,
    cursor: currentIndex >= 0 ? currentIndex : Math.min(history.cursor, entries.length - 1),
    detached: history.detached || Boolean(current && matches(current)),
    ...(history.detached && history.draft ? { draft: history.draft } : {}),
  }
}
