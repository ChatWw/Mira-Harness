/*
 * Copyright 2026 Z.AI Co., Ltd
 * SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode grouped task ordering; upstream license: third-party-licenses/zcode/.
 */
import type { HarnessProject, HarnessSession, HarnessSessionSummary } from '../../../../../src/config/harness'
import type { SidebarGroupingOrder, SidebarRootItem, SidebarTaskGroup } from './sidebar-preferences'

/** One root layer, as in ZCode's grouped view; legacy preferences keep groups first. */
export function sidebarRootItems(groups: SidebarTaskGroup[], sessionIds: string[], order: SidebarRootItem[]) {
  const pending = new Map<string, SidebarRootItem>([...groups.map(group => ({ type: 'group' as const, id: group.id })), ...sessionIds.map(id => ({ type: 'session' as const, id }))].map(item => [`${item.type}:${item.id}`, item]))
  const items: SidebarRootItem[] = []
  for (const item of order) {
    const key = `${item.type}:${item.id}`, available = pending.get(key)
    if (available) { items.push(available); pending.delete(key) }
  }
  return [...items, ...pending.values()]
}

export type SidebarDropTarget =
  | { type: 'session'; id: string; position: 'before' | 'after' }
  | { type: 'group'; id: string; position: 'start' | 'end' }
  | { type: 'root'; near?: SidebarRootItem; position: 'before' | 'after' }

/** Mira adaptation of ZCode moveTaskOverTask / group start/end / root around group. */
export function moveSidebarTask(order: SidebarGroupingOrder, rootIds: string[], sessionId: string, target: SidebarDropTarget): SidebarGroupingOrder | undefined {
  const originalRoots = sidebarRootItems(order.groups, rootIds, order.groupedRootOrder)
  const roots = originalRoots.filter(item => item.type !== 'session' || item.id !== sessionId)
  const groups = order.groups.map(group => ({ ...group, sessionIds: group.sessionIds.filter(id => id !== sessionId) }))
  const groupId = target.type === 'group' ? target.id : target.type === 'session' ? order.groups.find(group => group.sessionIds.includes(target.id))?.id : undefined
  if (groupId) {
    const group = groups.find(group => group.id === groupId)
    if (!group) return
    const index = target.type === 'session' ? group.sessionIds.indexOf(target.id) : target.position === 'start' ? 0 : group.sessionIds.length
    if (index < 0) return
    group.sessionIds.splice(index + (target.type === 'session' && target.position === 'after' ? 1 : 0), 0, sessionId)
  } else {
    const near = target.type === 'session' ? { type: 'session' as const, id: target.id } : target.type === 'root' ? target.near : undefined
    const index = near ? roots.findIndex(item => item.type === near.type && item.id === near.id) : roots.length
    if (index < 0 || target.type === 'group') return
    roots.splice(index + (near && target.position === 'after' ? 1 : 0), 0, { type: 'session', id: sessionId })
  }
  if (JSON.stringify(groups) === JSON.stringify(order.groups) && JSON.stringify(roots) === JSON.stringify(originalRoots)) return
  return { groups, groupedRootOrder: roots, ungroupedSessionOrder: roots.filter(item => item.type === 'session').map(item => item.id) }
}

export function relativeSessionTime(value: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000))
  return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes}分` : minutes < 1440 ? `${Math.floor(minutes / 60)}时` : `${Math.floor(minutes / 1440)}天`
}

export interface SessionGroupModel {
  pinned: HarnessSessionSummary[]
  projects: Array<{ project: HarnessProject; sessions: HarnessSessionSummary[] }>
  recent: HarnessSessionSummary[]
}

export interface SessionQueueModel extends SessionGroupModel {
  attention: HarnessSessionSummary[]
  running: HarnessSessionSummary[]
}

/** 会话三组划分：置顶 / 项目（保持项目顺序）/ 最近（无项目且未置顶）。 */
export function groupSessions(sessions: HarnessSessionSummary[], projects: HarnessProject[]): SessionGroupModel {
  const pinned = sessions.filter(session => session.pinned)
  const projectsGroups = projects.map(project => ({ project, sessions: sessions.filter(session => !session.pinned && session.projectId === project.id) }))
  const recent = sessions.filter(session => !session.pinned && !projects.some(project => project.id === session.projectId))
  return { pinned, projects: projectsGroups, recent }
}

export function splitSessionQueues(model: SessionGroupModel, runningIds: string[], pendingIds: string[]): SessionQueueModel {
  const pending = new Set(pendingIds)
  const running = new Set(runningIds)
  const candidates = [...model.projects.flatMap(group => group.sessions), ...model.recent]
  const attention = candidates.filter(session => pending.has(session.id) || session.status === 'failed' || session.planStatus === 'needs_input' || session.planStatus === 'awaiting_confirmation')
  const attentionIds = new Set(attention.map(session => session.id))
  const active = candidates.filter(session => !attentionIds.has(session.id) && (running.has(session.id) || session.planStatus === 'executing'))
  const prioritizedIds = new Set([...attentionIds, ...active.map(session => session.id)])
  return {
    pinned: model.pinned,
    attention,
    running: active,
    projects: model.projects.map(group => ({ ...group, sessions: group.sessions.filter(session => !prioritizedIds.has(session.id)) })),
    recent: model.recent.filter(session => !prioritizedIds.has(session.id)),
  }
}

export function planStatusLabel(status: NonNullable<HarnessSessionSummary['planStatus']>) {
  return ({ needs_input: '需要用户输入', awaiting_confirmation: '等待确认', executing: '执行中', completed: '已完成', cancelled: '已取消' })[status]
}

export type SessionBadgeKind = 'plan' | 'waiting' | 'running' | 'unread'

export interface SessionBadgeInput {
  running: boolean
  unread: boolean
  pending: boolean
}

/** 徽标优先级与 Vue 侧边栏一致：计划状态 > 等待审批 > 运行中 > 未读。 */
export function sessionBadge(summary: HarnessSessionSummary, input: SessionBadgeInput): { kind: SessionBadgeKind; label: string } | undefined {
  if (summary.planStatus && summary.planStatus !== 'completed' && summary.planStatus !== 'cancelled') return { kind: 'plan', label: planStatusLabel(summary.planStatus) }
  if (input.pending) return { kind: 'waiting', label: '等待审批' }
  if (input.running) return { kind: 'running', label: '执行中' }
  if (input.unread || summary.unread) return { kind: 'unread', label: '未读' }
  return undefined
}

/** 复制为 Markdown 的格式与 Vue 工作台保持一致。 */
export function sessionMarkdown(session: HarnessSession) {
  const messages = session.messages.filter(message => !message.internal && message.content.trim())
  const body = messages.map(message => `## ${message.role === 'user' ? '用户' : 'Mira'}\n\n${message.content.trim()}`).join('\n\n')
  return `# ${session.title}\n\n- 会话 ID: ${session.id}\n\n${body}`.trim()
}
