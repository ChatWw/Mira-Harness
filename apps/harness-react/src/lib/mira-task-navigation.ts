/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode quickPickConversationNavigation: workspace-scoped tasks
 * use Mira's existing sidebar order, with no wrap at either boundary.
 */
import type { HarnessSession, HarnessSessionSummary } from '../../../../src/config/harness'
import { isMiraPrimaryModifier } from '../../../../src/platform/workbenchShortcuts'
import type { SidebarPreferences } from '../components/session/sidebar-preferences'
import { sidebarRootItems } from '../components/session/session-groups'

export function miraAdjacentTasks(sessions: Array<HarnessSessionSummary & Partial<Pick<HarnessSession, 'archivedAt' | 'draftState'>>>, scope: { workingDirectory?: string; projectId?: string }, activeId: string | undefined, preferences: SidebarPreferences) {
  if (!scope.workingDirectory && !scope.projectId) return { previous: undefined, next: undefined }
  const tasks = [...new Map(sessions.filter(task => !task.archivedAt && task.draftState !== 'prepared' && (scope.workingDirectory ? task.workingDirectory === scope.workingDirectory : task.projectId === scope.projectId)).map(task => [task.id, task])).values()]
  const sort = preferences.view === 'group' ? preferences.groupSort : preferences.sort
  const sorted = (items: HarnessSessionSummary[], order?: string[]) => {
    const positions = new Map([...new Set(order)].map((id, index) => [id, index]))
    const first = items[0]
    const manual = preferences.view === 'project' && preferences.projectView !== 'timeline' && first && preferences.manualSessionScopes?.includes(first.pinned ? 'pinned' : first.projectId ? `project:${first.projectId}` : 'recent')
    return [...items].sort((left, right) => sort === 'manual' || manual ? (positions.get(left.id) ?? positions.size) - (positions.get(right.id) ?? positions.size) : sort === 'created' ? right.createdAt - left.createdAt : right.updatedAt - left.updatedAt)
  }
  const pinned = sorted(tasks.filter(task => task.pinned)).map(task => task.id)
  const remaining = tasks.filter(task => !task.pinned)
  let ids: string[]
  if (preferences.view === 'group') {
    const groups = new Map(preferences.groups.map(group => [group.id, group]))
    const members = new Set(preferences.groups.flatMap(group => group.sessionIds))
    const roots = sorted(remaining.filter(task => !members.has(task.id)), preferences.ungroupedSessionOrder)
    ids = sidebarRootItems(preferences.groups, roots.map(task => task.id), sort === 'manual' ? preferences.groupedRootOrder : []).flatMap(item => {
      if (item.type === 'session') return [item.id]
      const group = groups.get(item.id)!
      return sorted(remaining.filter(task => group.sessionIds.includes(task.id)), group.sessionIds).map(task => task.id)
    })
  } else ids = sorted(remaining).map(task => task.id)
  ids = [...pinned, ...ids]
  const index = activeId ? ids.indexOf(activeId) : -1
  return { previous: ids[(index < 0 ? ids.length : index) - 1], next: ids[index + 1] }
}

export function miraTaskNavigationShortcut(event: KeyboardEvent): 'previous' | 'next' | undefined {
  if (event.defaultPrevented || !isMiraPrimaryModifier(event) || !event.shiftKey || event.altKey || event.repeat || event.isComposing || event.keyCode === 229) return
  // Shift changes event.key to braces on common desktop layouts.
  if (event.code === 'BracketLeft' || event.key === '[' || event.key === '{') return 'previous'
  if (event.code === 'BracketRight' || event.key === ']' || event.key === '}') return 'next'
}
