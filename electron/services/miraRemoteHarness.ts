import type { WebContents } from 'electron'
import { isModelProviderAvailable, type HarnessEvent, type HarnessFileReference } from '../../src/config/harness'
import { parseFirstPartyHarnessCall } from '../../src/platform/firstPartyHarness'
import type { PlatformDatabase } from '../storage/database'
import type { HarnessRuntime } from './harnessRuntime'

const allowed = new Set(['sessions.list', 'projects.list', 'providers.list', 'session.get', 'session.create', 'session.set-permission', 'permissions.config', 'permissions.pending', 'permission.respond', 'message.submit', 'queue.list', 'queue.withdraw', 'queue.resume', 'run.abort', 'plan.confirm', 'plan.cancel', 'plan.continue', 'interaction.answer', 'attachments.import'])

/** Separate allowlist: never forwards a remote call to the full desktop IPC switch. */
export function createRemoteHarness(database: PlatformDatabase, runtime: HarnessRuntime, owner: () => WebContents) {
  const attachments = new Map<string, Map<string, Set<string>>>()
  function scope(id: string) {
    const session = database.harness.getSession(id)
    if (!session.projectId || session.archivedAt || session.parentSessionId || !database.harness.listProjects().some(project => project.id === session.projectId)) throw new Error('此任务不在可访问的项目空间内')
    return session
  }
  function references(connectionId: string, id: string, values: HarnessFileReference[]) {
    if (values.some(value => !attachments.get(connectionId)?.get(id)?.has(value.path))) throw new Error('仅允许引用此连接上传的手机文件或照片')
  }
  return {
    reset() { attachments.clear() },
    release(connectionId: string) { attachments.delete(connectionId) },
    subscribe(listener: (event: unknown) => void) {
      return runtime.onPublicEvent((event: HarnessEvent) => {
        try { scope(event.sessionId) } catch { return }
        // Full snapshots and public runtime events are authoritative; no settings/trace APIs.
        listener(event)
      })
    },
    async invoke(method: string, params: unknown, connectionId = '') {
      if (!allowed.has(method)) throw new Error('此功能需要在电脑上使用')
      const call = parseFirstPartyHarnessCall(method, params)
      if ('sessionId' in call && typeof call.sessionId === 'string') scope(call.sessionId)
      if ('id' in call && typeof call.id === 'string') scope(call.id)
      switch (call.method) {
        case 'projects.list': return database.harness.listProjects().map(({ id, name, directoryExists }) => ({ id, name, directory: '', directoryExists }))
        case 'sessions.list': return runtime.listSessions().filter(session => { try { scope(session.id); return true } catch { return false } })
        case 'providers.list': return database.models.list().filter(isModelProviderAvailable).map(provider => ({ id: provider.id, name: provider.name, providerKey: provider.providerKey, endpoint: 'http://mira.local', authMode: 'none', hasApiKey: false, enabled: true, models: provider.models.filter(model => model.enabled), createdAt: provider.createdAt, updatedAt: provider.updatedAt }))
        case 'session.get': return runtime.getSession(call.id)
        case 'session.create': {
          if (!call.projectId || !database.harness.listProjects().some(project => project.id === call.projectId)) throw new Error('请选择项目空间')
          // Synchronous lookup + create also coalesces simultaneous mobile requests.
          for (const item of runtime.listSessions()) {
            if (item.projectId !== call.projectId || item.title !== '新对话' || item.status !== 'active' || item.isRunning || item.pinned || item.automationId) continue
            const session = scope(item.id)
            if (session.titleSource !== 'manual' && !session.messages.length && !session.toolCalls.length && !session.activeRun && !session.activePlan && !session.pendingInteraction && !session.goal) return session
          }
          return database.harness.createSession(call.projectId)
        }
        case 'session.set-permission': return database.harness.setPermission(call.id, call.mode)
        case 'permissions.config': { const config = database.harness.getPermissionConfig(); return { autoApproveEnabled: config.autoApproveEnabled, fullAccessEnabled: config.fullAccessEnabled } }
        case 'permissions.pending': return runtime.listPendingPermissions(call.sessionId)
        case 'permission.respond': {
          const request = runtime.listSessions().flatMap(session => { try { scope(session.id); return runtime.listPendingPermissions(session.id) } catch { return [] } }).find(item => item.requestId === call.requestId)
          if (!request) throw new Error('确认请求已失效')
          return runtime.resolvePermission(call.requestId, call.allowed)
        }
        case 'attachments.import': {
          const result = database.harness.importMessageAttachments(call.sessionId, call.files)
          const sessions = attachments.get(connectionId) ?? new Map<string, Set<string>>()
          const paths = sessions.get(call.sessionId) ?? new Set<string>()
          result.forEach(file => paths.add(file.path)); sessions.set(call.sessionId, paths); attachments.set(connectionId, sessions)
          return result.map(({ path, name, mediaType, size }) => ({ path, name, mediaType, size }))
        }
        case 'message.submit': {
          references(connectionId, call.sessionId, call.references)
          // No plugin/skill/structured reference or desktop submission extras over the mobile API.
          if (call.options && Object.keys(call.options).some(key => !['delivery', 'expectedRunId', 'permissionMode'].includes(key))) throw new Error('移动端不支持此消息操作')
          if (call.options === undefined) return runtime.submitMessage(owner(), call.sessionId, call.submissionId, call.text, call.references, call.selection, call.planning)
          return runtime.submitMessage(owner(), call.sessionId, call.submissionId, call.text, call.references, call.selection, call.planning, call.options)
        }
        case 'queue.list': return runtime.getMessageQueue(call.sessionId)
        case 'queue.withdraw': return runtime.withdrawMessage(call.sessionId, call.itemId)
        case 'queue.resume': return runtime.resumeMessageQueue(call.sessionId)
        case 'run.abort': return runtime.abort(call.sessionId, call.expectedRunId)
        case 'plan.confirm': return runtime.confirmPlan(owner(), call.sessionId, call.planId, call.selection)
        case 'plan.cancel': return runtime.cancelPlan(owner(), call.sessionId, call.planId)
        case 'plan.continue': references(connectionId, call.sessionId, call.references); return runtime.continuePlan(owner(), call.sessionId, call.planId, call.message, call.references, call.selection)
        case 'interaction.answer': return runtime.answerInteraction(owner(), call.sessionId, call.interactionId, call.answers, call.selection)
        default: throw new Error('此功能需要在电脑上使用')
      }
    },
  }
}
