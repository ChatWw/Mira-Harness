import type { Agent } from '@earendil-works/pi-agent-core'
import type { WebContents } from 'electron'
import type { HarnessEvent, HarnessSession } from '../src/config/harness'
import type { PlatformDatabase } from './database'
import type { SubtaskRuntime } from './subtaskRuntime'

export type HarnessRunOrigin = 'manual' | 'automation'
export type HarnessRunCompleteEvent = { session: HarnessSession, origin: HarnessRunOrigin, status: 'completed' | 'failed' | 'aborted', content?: string }

type PublishEvent = (sender: WebContents | undefined, event: HarnessEvent) => unknown
type RunningEntry = { controller: AbortController, agent?: Agent, subtasks?: SubtaskRuntime }

export class HarnessRunCoordinator {
  private readonly running = new Map<string, RunningEntry>()
  private readonly completeListeners = new Set<(event: HarnessRunCompleteEvent) => void>()

  constructor(private readonly database: PlatformDatabase, private readonly publish: PublishEvent) {}

  isRunning(sessionId: string) { return this.running.has(sessionId) }

  isProjectRunning(projectId: string) {
    return [...this.running.keys()].some(sessionId => this.database.harness.getSession(sessionId).projectId === projectId)
  }

  begin(sessionId: string) {
    if (this.running.has(sessionId)) throw new Error('该会话正在运行')
    const controller = new AbortController()
    this.running.set(sessionId, { controller })
    return controller
  }

  attachAgent(sessionId: string, agent: Agent) {
    const entry = this.requireEntry(sessionId)
    entry.agent = agent
  }

  attachSubtasks(sessionId: string, subtasks: SubtaskRuntime) {
    const entry = this.requireEntry(sessionId)
    entry.subtasks = subtasks
  }

  onComplete(listener: (event: HarnessRunCompleteEvent) => void) {
    this.completeListeners.add(listener)
    return () => this.completeListeners.delete(listener)
  }

  publishComplete(event: HarnessRunCompleteEvent) {
    queueMicrotask(() => this.completeListeners.forEach(listener => listener(event)))
  }

  abort(sessionId: string) {
    const entry = this.running.get(sessionId)
    if (!entry) return
    entry.controller.abort()
    entry.agent?.abort()
    entry.subtasks?.stop()
  }

  stopSubtasks(sessionId: string, ids?: string[]) {
    this.running.get(sessionId)?.subtasks?.stop(ids)
  }

  async finish(sender: WebContents | undefined, sessionId: string) {
    const entry = this.running.get(sessionId)
    if (!entry) return
    if (entry.subtasks?.active().length) await entry.subtasks.close(entry.controller.signal.aborted ? 'stopped' : 'interrupted')
    this.database.harness.setActiveRun(sessionId, undefined)
    this.running.delete(sessionId)
    this.publish(sender, { sessionId, type: 'status', payload: { state: 'idle' } })
  }

  private requireEntry(sessionId: string) {
    const entry = this.running.get(sessionId)
    if (!entry) throw new Error('运行尚未开始或已结束')
    return entry
  }
}
