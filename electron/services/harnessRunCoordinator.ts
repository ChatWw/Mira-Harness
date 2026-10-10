import type { Agent } from '@earendil-works/pi-agent-core'
import type { WebContents } from 'electron'
import type { HarnessEvent, HarnessSession, ModelSelection, PermissionMode } from '../../src/config/harness'
import type { PlatformDatabase } from '../storage/database'
import type { SubtaskRuntime } from './subtaskRuntime'
import { randomUUID } from 'node:crypto'

export type HarnessRunOrigin = 'manual' | 'automation'
export type HarnessRunCompleteEvent = { session: HarnessSession, origin: HarnessRunOrigin, status: 'completed' | 'failed' | 'aborted', content?: string }

type PublishEvent = (sender: WebContents | undefined, event: HarnessEvent) => unknown
type RunningEntry = { runId: string, controller: AbortController, agent?: Agent, guideSelection?: ModelSelection, guidePermissionMode?: PermissionMode, acceptsGuidance?: boolean, subtasks?: SubtaskRuntime, finished: Promise<void>, resolveFinished: () => void, finishError?: unknown }

export class HarnessRunCoordinator {
  private readonly running = new Map<string, RunningEntry>()
  private readonly reservations = new Map<string, symbol>()
  private readonly completions = new Map<string, HarnessRunCompleteEvent>()
  private readonly completeListeners = new Set<(event: HarnessRunCompleteEvent) => void>()

  constructor(private readonly database: PlatformDatabase, private readonly publish: PublishEvent, private readonly assertAdmission: (sessionId: string) => void = () => {}) {}

  isRunning(sessionId: string) { return this.running.has(sessionId) || this.reservations.has(sessionId) }

  isExecuting(sessionId: string) { return this.running.has(sessionId) }

  currentRunId(sessionId: string) { return this.running.get(sessionId)?.runId }

  activeSessionIds() { return [...new Set([...this.running.keys(), ...this.reservations.keys()])] }

  async preemptAndWait(sessionId: string, expectedRunId?: string) {
    const entry = this.running.get(sessionId)
    if (expectedRunId !== undefined && entry?.runId !== expectedRunId) throw new Error('当前任务已变化，请刷新后重试')
    if (!entry) return
    this.abort(sessionId, entry.runId)
    await entry.finished
    if (entry.finishError) throw entry.finishError
  }

  isProjectRunning(projectId: string) {
    return this.activeSessionIds().some(sessionId => {
      try { return this.database.harness.getSession(sessionId).projectId === projectId } catch { return false }
    })
  }

  reserve(sessionId: string) {
    this.assertAdmission(sessionId)
    const token = this.reservations.get(sessionId) || Symbol(sessionId)
    this.reservations.set(sessionId, token)
    return token
  }

  release(sessionId: string, token: symbol) {
    if (this.reservations.get(sessionId) === token) this.reservations.delete(sessionId)
  }

  begin(sessionId: string, runId: string = randomUUID(), token?: symbol) {
    this.assertAdmission(sessionId)
    if (this.running.has(sessionId) || this.reservations.has(sessionId) && this.reservations.get(sessionId) !== token) throw new Error('该会话正在运行')
    const controller = new AbortController()
    let resolveFinished!: () => void
    const finished = new Promise<void>(resolve => { resolveFinished = resolve })
    this.running.set(sessionId, { runId, controller, finished, resolveFinished })
    return controller
  }

  attachAgent(sessionId: string, agent: Agent, selection?: ModelSelection, permissionMode?: PermissionMode) {
    const entry = this.requireEntry(sessionId)
    entry.agent = agent
    entry.guideSelection = selection ? { ...selection } : undefined
    entry.guidePermissionMode = permissionMode
  }

  setGuidanceAccepting(sessionId: string, runId: string, accepting: boolean) {
    const entry = this.running.get(sessionId)
    if (entry?.runId === runId) entry.acceptsGuidance = accepting
  }

  guidanceSelection(sessionId: string, runId: string) {
    const entry = this.running.get(sessionId)
    return entry?.runId === runId && entry.acceptsGuidance && !entry.controller.signal.aborted && entry.agent && entry.guideSelection ? { ...entry.guideSelection, permissionMode: entry.guidePermissionMode || 'default' } : undefined
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
    this.completions.set(event.session.id, event)
  }

  // Completion observers run only after teardown and the next manual admission are settled.
  flushComplete(sessionId: string) {
    const event = this.completions.get(sessionId)
    if (!event) return
    this.completions.delete(sessionId)
    queueMicrotask(() => this.completeListeners.forEach(listener => {
      try {
        void Promise.resolve(listener(event)).catch(error => console.warn('[Mira] 运行完成监听失败', error))
      } catch (error) { console.warn('[Mira] 运行完成监听失败', error) }
    }))
  }

  abort(sessionId: string, expectedRunId?: string) {
    const entry = this.running.get(sessionId)
    if (!entry || expectedRunId !== undefined && entry.runId !== expectedRunId) return false
    entry.controller.abort()
    entry.agent?.abort()
    entry.subtasks?.stop()
    return true
  }

  stopSubtasks(sessionId: string, ids?: string[]) {
    this.running.get(sessionId)?.subtasks?.stop(ids)
  }

  async finish(sender: WebContents | undefined, sessionId: string, expectedRunId?: string) {
    const entry = this.running.get(sessionId)
    if (!entry || expectedRunId !== undefined && entry.runId !== expectedRunId) return
    try {
      if (entry.subtasks?.active().length) await entry.subtasks.close(entry.controller.signal.aborted ? 'stopped' : 'interrupted')
      if (this.running.get(sessionId) === entry) this.database.harness.setActiveRun(sessionId, undefined)
    } catch (error) {
      entry.finishError = error
      throw error
    } finally {
      if (this.running.get(sessionId) === entry) {
        this.running.delete(sessionId)
        try { this.publish(sender, { sessionId, runId: entry.runId, type: 'status', payload: { state: 'idle' } }) }
        catch (error) { entry.finishError = error; throw error }
        finally { entry.resolveFinished() }
      }
    }
  }

  private requireEntry(sessionId: string) {
    const entry = this.running.get(sessionId)
    if (!entry) throw new Error('运行尚未开始或已结束')
    return entry
  }
}
