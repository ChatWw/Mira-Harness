import type { PilotHost } from '../state/pilot-state'
import type { HarnessEvent } from '../../../../src/config/harness'

export async function remoteCall<T>(method: string, params?: unknown): Promise<T> {
  const response = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, params: params ?? {} }) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || '连接失败，请重试')
  return body.result as T
}
const blocked = async (): Promise<never> => { throw new Error('此功能需要在电脑上使用') }
export function createMobileHost(): PilotHost {
  return {
    listSessions: () => remoteCall('sessions.list'), listProjects: () => remoteCall('projects.list'), listProviders: () => remoteCall('providers.list'),
    getSession: id => remoteCall('session.get', { id }), createSession: projectId => remoteCall('session.create', { projectId }),
    runMessage: blocked,
    submitMessage: (sessionId, text, selection, planning, references, submissionId) => remoteCall('message.submit', { sessionId, text, selection, planning, references, submissionId }),
    getMessageQueue: sessionId => remoteCall('queue.list', { sessionId }),
    withdrawMessage: (sessionId, itemId) => remoteCall('queue.withdraw', { sessionId, itemId }),
    resumeMessageQueue: sessionId => remoteCall('queue.resume', { sessionId }),
    listPendingPermissions: sessionId => remoteCall('permissions.pending', { sessionId }),
    respondPermission: (requestId, allowed) => remoteCall('permission.respond', { requestId, allowed }),
    abortRun: (sessionId, expectedRunId) => remoteCall('run.abort', { sessionId, expectedRunId }),
    confirmPlan: (sessionId, planId, selection) => remoteCall('plan.confirm', { sessionId, planId, selection }),
    cancelPlan: (sessionId, planId) => remoteCall('plan.cancel', { sessionId, planId }),
    continuePlan: (sessionId, planId, message, references, selection) => remoteCall('plan.continue', { sessionId, planId, message, references, selection }),
    answerInteraction: (sessionId, interactionId, answers, selection) => remoteCall('interaction.answer', { sessionId, interactionId, answers, selection }),
    setSessionPermission: (id, mode) => remoteCall('session.set-permission', { id, mode }),
    importAttachments: (sessionId, files) => remoteCall('attachments.import', { sessionId, files }),
    getPreference: async key => { try { return JSON.parse(sessionStorage.getItem(`mira-mobile:${key}`) ?? 'null') } catch { return undefined } },
    setPreference: async (key, value) => { sessionStorage.setItem(`mira-mobile:${key}`, JSON.stringify(value)) },
    onEvent: listener => {
      const events = new EventSource('/events')
      events.onmessage = event => { try { listener(JSON.parse(event.data) as HarnessEvent) } catch { /* Reconnect snapshots remain canonical. */ } }
      return () => events.close()
    },
    listFiles: blocked, readFile: blocked, openSessionProject: blocked, openTerminal: blocked,
    writeTerminal: blocked, resizeTerminal: blocked, closeTerminal: blocked,
    navigateBrowser: blocked, setBrowserBounds: blocked, controlBrowser: blocked, onBrowserEvent: () => () => undefined,
  }
}
