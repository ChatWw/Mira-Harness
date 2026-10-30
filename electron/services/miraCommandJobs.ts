import type { MiraCommandJob } from '../../src/config/miraCommandJobs'
import type { HarnessToolText } from '../../src/config/harness'

export interface MiraCommandIdentity { sessionId: string; runId: string; toolId: string; directory: string }
type Entry = {
  identity: MiraCommandIdentity
  job: MiraCommandJob
  controller: AbortController
  background: () => boolean
  finished: Promise<void>
}

const key = (sessionId: string, toolId: string) => JSON.stringify([sessionId, toolId])

/** Owns live handles only. Persisted snapshots never grant process control. */
export class MiraCommandJobs {
  private readonly active = new Map<string, Entry>()
  private closing = false

  execute(identity: MiraCommandIdentity, options: {
    explicit: boolean; deadlineSeconds?: number; signal?: AbortSignal; allowBackground?: boolean
    run: (signal: AbortSignal, update: (result: unknown) => void) => Promise<any>
    output: (result: unknown, final: boolean) => HarnessToolText | undefined
    publish: (job: MiraCommandJob) => void
    onUpdate?: (result: unknown) => void
    fullOutputAvailable?: () => boolean
  }): Promise<any> {
    if (this.closing) return Promise.reject(new Error('应用正在退出，无法执行新命令'))
    if (options.explicit && options.allowBackground === false) return Promise.reject(new Error('自动化命令必须在前台完成，请移除run_in_background'))
    options.signal?.throwIfAborted()
    if (options.deadlineSeconds !== undefined && (!Number.isFinite(options.deadlineSeconds) || options.deadlineSeconds <= 0 || options.deadlineSeconds > 600)) return Promise.reject(new Error('前台等待时间应为0至600秒之间的正数'))
    const id = key(identity.sessionId, identity.toolId)
    if (this.active.has(id)) return Promise.reject(new Error('这次命令已经在执行'))
    const controller = new AbortController()
    let resolveOutcome!: (result: any) => void, rejectOutcome!: (error: unknown) => void
    const outcome = new Promise<any>((resolve, reject) => { resolveOutcome = resolve; rejectOutcome = reject })
    let resolveFinished!: () => void
    const finished = new Promise<void>(resolve => { resolveFinished = resolve })
    let timer: ReturnType<typeof setTimeout> | undefined
    let outputTimer: ReturnType<typeof setTimeout> | undefined
    let latestOutput: HarnessToolText | undefined
    let settled = false
    const job: MiraCommandJob = { mode: 'foreground', status: 'running', revision: 0, startedAt: Date.now(), ...(options.allowBackground === false ? { backgroundAllowed: false as const } : {}) }
    const publish = () => { if (options.fullOutputAvailable?.()) job.fullOutputAvailable = true; job.revision++; options.publish(structuredClone(job)) }
    const clearDeadline = () => { if (timer) clearTimeout(timer); timer = undefined }
    const parentAbort = () => { if (job.mode === 'foreground') controller.abort() }
    const removeParent = () => options.signal?.removeEventListener('abort', parentAbort)
    const background = () => {
      if (settled || job.mode === 'background' || job.backgroundAllowed === false || controller.signal.aborted || this.closing) return false
      job.mode = 'background'
      job.output = latestOutput
      try { publish() } catch (error) { job.mode = 'foreground'; controller.abort(); rejectOutcome(error); throw error }
      clearDeadline(); removeParent()
      resolveOutcome({ content: [{ type: 'text', text: `命令已转入后台，执行 ID：${identity.toolId}。使用 command_status 查询输出或停止；后台命令与其他工具可能同时访问工作目录。` }], details: { miraBackgroundCommand: identity.toolId } })
      return true
    }
    const entry: Entry = { identity, job, controller, background, finished }
    this.active.set(id, entry)
    options.signal?.addEventListener('abort', parentAbort, { once: true })
    try { publish() } catch (error) { removeParent(); this.active.delete(id); return Promise.reject(error) }
    const update = (result: unknown) => {
      if (settled || controller.signal.aborted) return
      latestOutput = options.output(result, false) ?? latestOutput
      if (!job.fullOutputAvailable && options.fullOutputAvailable?.()) publish()
      if (job.mode === 'background' && latestOutput && !outputTimer) outputTimer = setTimeout(() => {
        outputTimer = undefined
        if (settled) return
        job.output = latestOutput
        try { publish() } catch (error) { controller.abort(); rejectOutcome(error) }
      }, 250)
      if (job.mode === 'foreground') options.onUpdate?.(result)
    }
    // Attach both fulfillment and rejection before releasing a background result.
    void Promise.resolve().then(() => {
      const execution = options.run(controller.signal, update)
      if (options.explicit) { try { background() } catch { /* keep draining the already-started execution after persistence failure. */ } }
      else if (options.allowBackground !== false && options.deadlineSeconds !== undefined) timer = setTimeout(() => { try { background() } catch { /* background already aborts and rejects on publication failure. */ } }, options.deadlineSeconds * 1000)
      return execution
    }).then(result => finish(result), error => finish(undefined, error)).catch(error => {
      // A failed persistence callback must not leak a live command or an unhandled rejection.
      controller.abort(); rejectOutcome(error)
    }).finally(() => { this.active.delete(id); resolveFinished() })
    const finish = (result: any, error?: unknown) => {
      settled = true; clearDeadline(); removeParent()
      if (outputTimer) clearTimeout(outputTimer)
      job.output = options.output(result, true) ?? latestOutput
      job.status = controller.signal.aborted ? 'cancelled' : error || result?.isError ? 'failed' : 'completed'
      job.completedAt = Date.now()
      if (error) job.error = options.output({ content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }, true)?.text
      publish()
      if (job.mode === 'foreground') { if (error) rejectOutcome(error); else resolveOutcome(result) }
    }
    return outcome
  }

  background(sessionId: string, runId: string, toolId: string) {
    const entry = this.active.get(key(sessionId, toolId))
    if (!entry || entry.identity.runId !== runId || !entry.background()) throw new Error('命令已经结束或不能转入后台，请刷新状态')
  }

  async stop(sessionId: string, runId: string, toolId: string) {
    const entry = this.active.get(key(sessionId, toolId))
    if (!entry || entry.identity.runId !== runId) throw new Error('这次命令已结束或不可用')
    entry.controller.abort()
    await entry.finished
  }

  identities() { return [...this.active.values()].filter(entry => entry.job.status === 'running').map(entry => entry.identity) }

  async stopOwned(sessionId: string, runId: string | undefined, toolIds: Iterable<string>) {
    const owned = new Set(toolIds)
    const entries = [...this.active.values()].filter(entry => entry.identity.sessionId === sessionId && entry.identity.runId === runId && owned.has(entry.identity.toolId))
    for (const entry of entries) entry.controller.abort()
    await Promise.all(entries.map(entry => entry.finished))
  }

  async dispose() {
    this.closing = true
    const entries = [...this.active.values()]
    for (const entry of entries) entry.controller.abort()
    await Promise.all(entries.map(entry => entry.finished))
  }
}
