import { createHash, randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import type { DriverFactory, RunMiraFlowOptions, runMiraFlowScript } from '../../../packages/mira-flow-runtime/src/mira-index'
import type { JournalStorePort, JsonSchema, MiraFlowDriver, RunEvent, RunRecord, RunSettlement } from '../../../packages/mira-flow-kit/src/mira-index'
import { validate } from '../../../packages/mira-flow-kit/src/schema/mira-validate'
import type { MiraFlowCompilation } from './miraFlowCompile'
import type { MiraFlowReviewGraph } from '../../../src/config/miraFlowReview'

type Executable = NonNullable<MiraFlowCompilation['executable']>
type Compiler = { compile(source: string, signal?: AbortSignal): Promise<MiraFlowCompilation>; dispose(): void }
export type MiraFlowLaunch = {
  parentSessionId: string
  cwd: string
  source: string
  name?: string
  args?: Record<string, unknown>
  maxConcurrency: number
  toolCallId?: string
  launch?: RunMiraFlowOptions['launch']
  signal?: AbortSignal
}
export type MiraFlowExecution = { runId: string; settled: Promise<RunSettlement> }
export type MiraFlowDriverContext = {
  runId: string; parentSessionId: string; cwd: string; signal: AbortSignal
  executable: Executable; journal: JournalStorePort; emit(event: RunEvent): void
}
export type MiraFlowRunHost = {
  journal: JournalStorePort
  reviewGraphs?: { putReviewGraph(runId: string, sourceHash: string, graph: MiraFlowReviewGraph): void; getReviewGraph(runId: string, sourceHash: string): MiraFlowReviewGraph | undefined }
  createCompiler(): Compiler
  run: typeof runMiraFlowScript
  makeDriver(context: MiraFlowDriverContext): (sink: Parameters<DriverFactory>[0]) => MiraFlowDriver & { waitForIdle?(): Promise<void> }
  emit(runId: string, event: RunEvent): void
  timeoutMs?: number
}
type ActiveRun = {
  controller: AbortController; parentSessionId: string
  control?: Parameters<NonNullable<RunMiraFlowOptions['control']>['bind']>[0]
  settled?: Promise<RunSettlement>
}
const hash = (source: string) => createHash('sha256').update(source, 'utf8').digest('hex')

/** Host-only ownership layer. The renderer supplies neither lowered code nor a driver. */
export class MiraFlowRunService {
  private readonly active = new Map<string, ActiveRun>()
  private readonly compilers = new Set<Compiler>()
  private readonly preparing = new Set<string>()
  private closed = false

  constructor(private readonly host: MiraFlowRunHost) {}

  async start(input: MiraFlowLaunch, confirm?: (review: { source: string; sourceHash: string; graph: Executable['graph']; reviewGraph: Executable['reviewGraph']; commands: string[] }) => Promise<boolean>): Promise<MiraFlowExecution> {
    this.assertOpen()
    if (!input.parentSessionId.trim()) throw new Error('工作流需要所属会话')
    this.assertConcurrency(input.maxConcurrency)
    const source = input.source, cwd = realpathSync(input.cwd)
    // Freeze caller-owned parameters before a compiler/approval await.
    const args = this.cloneArgs(input.args ?? {})
    const parentSessionId = input.parentSessionId, name = input.name, maxConcurrency = input.maxConcurrency, signal = input.signal
    const toolCallId = input.toolCallId, launch = input.launch ? structuredClone(input.launch) : undefined
    const compiled = await this.compile(source, signal)
    if (launch && !launch.phaseNames) {
      const phases = compiled.executable.reviewGraph.phases.filter(phase => phase.id !== 'unphased')
      launch.phaseNames = phases.map(phase => phase.name)
      launch.phaseAlongside = phases.map(phase => (phase.alongside ?? []).flatMap(id => {
        const index = phases.findIndex(candidate => candidate.id === id)
        return index < 0 ? [] : [index]
      }))
    }
    this.assertOpen(); signal?.throwIfAborted()
    if (confirm && !await confirm({ source, sourceHash: compiled.sourceHash, graph: structuredClone(compiled.executable.graph), reviewGraph: structuredClone(compiled.executable.reviewGraph), commands: [...compiled.executable.commands] })) throw new Error('工作流运行未获批准')
    this.assertOpen(); signal?.throwIfAborted()
    return this.launch({ runId: randomUUID(), parentSessionId, cwd, source, name, args, maxConcurrency, signal, toolCallId, launch }, compiled.executable)
  }

  async resume(runId: string, parentSessionId: string, cwd: string, signal?: AbortSignal): Promise<MiraFlowExecution> {
    this.assertOpen()
    if (this.active.has(runId) || this.preparing.has(runId)) throw new Error('工作流已经运行中')
    const saved = this.requireOwned(runId, parentSessionId)
    if (saved.status !== 'stopped' || saved.stopReason === 'superseded' || saved.resumedFrom) throw new Error('这个工作流不能原样续跑')
    if (!saved.scriptText || !saved.scriptHash || !saved.cwd || realpathSync(cwd) !== saved.cwd || hash(saved.scriptText) !== saved.scriptHash) throw new Error('工作流脚本或工作目录身份不一致')
    const source = saved.scriptText, args = this.cloneArgs(saved.args ?? {})
    this.preparing.add(runId)
    try {
      const compiled = await this.compile(source, signal)
      this.assertOpen(); signal?.throwIfAborted()
      const current = this.requireOwned(runId, parentSessionId)
      if (current.status !== 'stopped' || current.stopReason === 'superseded' || current.scriptHash !== saved.scriptHash || current.scriptText !== source || current.cwd !== saved.cwd || JSON.stringify(current.args ?? {}) !== JSON.stringify(saved.args ?? {})) throw new Error('工作流已变化，请刷新后续跑')
      const launchEvent = this.host.journal.listEvents(runId).find(item => item.event.type === 'run-launched')?.event
      const launch = launchEvent?.type === 'run-launched' ? { inputId: launchEvent.inputId, ...(launchEvent.subagentModel ? { subagentModel: launchEvent.subagentModel } : {}), ...(launchEvent.phaseNames ? { phaseNames: [...launchEvent.phaseNames] } : {}), ...(launchEvent.phaseAlongside ? { phaseAlongside: structuredClone(launchEvent.phaseAlongside) } : {}) } : undefined
      return this.launch({ runId, parentSessionId, cwd: saved.cwd, source, name: saved.name, args, maxConcurrency: current.caps.maxConcurrency, signal, toolCallId: saved.toolCallId, launch }, compiled.executable)
    } finally { this.preparing.delete(runId) }
  }

  stop(runId: string, parentSessionId: string, initiator: 'user' | 'model' = 'user'): boolean {
    this.requireOwned(runId, parentSessionId)
    const running = this.active.get(runId)
    if (!running) return false
    running.controller.abort(initiator)
    return true
  }

  setConcurrency(runId: string, parentSessionId: string, maxConcurrency: number): void {
    this.assertConcurrency(maxConcurrency)
    this.requireOwned(runId, parentSessionId)
    const running = this.active.get(runId)
    if (!running?.control) throw new Error('工作流未运行')
    running.control.setMaxConcurrency(maxConcurrency)
  }

  snapshot(runId: string, parentSessionId: string, afterSequence?: number, limit = 200) {
    const run = this.requireOwned(runId, parentSessionId)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || afterSequence !== undefined && (!Number.isSafeInteger(afterSequence) || afterSequence < -1)) throw new Error('无效的工作流事件分页')
    const graph = run.scriptHash ? this.host.reviewGraphs?.getReviewGraph(runId, run.scriptHash) : undefined
    return { run, actors: this.host.journal.listActors(runId), nodes: this.host.journal.listNodes(runId), events: this.host.journal.listEvents(runId, { afterSequence, limit }), ...(graph ? { graph } : {}) }
  }

  async dispose(): Promise<void> {
    this.closed = true
    for (const compiler of this.compilers) compiler.dispose()
    for (const running of this.active.values()) running.controller.abort('interrupted')
    await Promise.allSettled([...this.active.values()].flatMap(running => running.settled ? [running.settled] : []))
  }

  private async compile(source: string, signal?: AbortSignal): Promise<MiraFlowCompilation & { executable: Executable }> {
    this.assertOpen(); signal?.throwIfAborted()
    const compiler = this.host.createCompiler()
    this.compilers.add(compiler)
    try {
      const compiled = await compiler.compile(source, signal)
      if (!compiled.ok || !compiled.executable) throw new Error('工作流编译失败：\n' + (compiled.diagnostics.map(item => item.message).join('\n') || '请检查脚本'))
      if (compiled.sourceHash !== hash(source)) throw new Error('工作流编译产物与源文件不一致')
      return { ...compiled, executable: compiled.executable }
    } finally { this.compilers.delete(compiler); compiler.dispose() }
  }

  private launch(input: MiraFlowLaunch & { runId: string }, executable: Executable): MiraFlowExecution {
    this.assertConcurrency(input.maxConcurrency)
    if (realpathSync(input.cwd) !== input.cwd) throw new Error('工作流工作目录已变化')
    const controller = new AbortController(), running: ActiveRun = { controller, parentSessionId: input.parentSessionId }
    const abort = () => controller.abort(input.signal?.reason)
    if (input.signal?.aborted) abort()
    else input.signal?.addEventListener('abort', abort, { once: true })
    this.active.set(input.runId, running)
    const context: MiraFlowDriverContext = { ...input, signal: controller.signal, executable, journal: this.host.journal, emit: event => {
      try { this.host.emit(input.runId, event) }
      catch { console.warn(`Mira workflow ${input.runId}: event observer failed; durable execution continues`) }
    } }
    let resolve!: (value: RunSettlement) => void, reject!: (reason: unknown) => void
    const settled = new Promise<RunSettlement>((accept, fail) => { resolve = accept; reject = fail })
    running.settled = settled.finally(() => {
      if (this.active.get(input.runId) === running) this.active.delete(input.runId)
      input.signal?.removeEventListener('abort', abort)
    })
    void running.settled.catch(() => undefined)
    let driver: (MiraFlowDriver & { waitForIdle?(): Promise<void> }) | undefined
    try {
      const factory = this.host.makeDriver(context)
      const execution = this.host.run({
        runId: input.runId, parentSessionId: input.parentSessionId, cwd: input.cwd,
        scriptText: input.source, scriptHash: hash(input.source), lowered: executable.code,
        args: input.args, name: input.name, caps: { maxConcurrency: input.maxConcurrency },
        toolCallId: input.toolCallId, launch: input.launch,
        askSpecs: new Map(executable.askSpecs), validate: (schema, value) => validate(schema as JsonSchema, value),
        signal: controller.signal, timeoutMs: this.host.timeoutMs,
        makeDriver: sink => {
          driver = factory(sink)
          if (driver.journal !== this.host.journal) throw new Error('工作流执行器使用了不同的日志存储')
          return driver
        },
        control: { bind: control => {
          running.control = control
          // The engine has created its journal row; persist before spawning the script child.
          this.host.reviewGraphs?.putReviewGraph(input.runId, hash(input.source), executable.reviewGraph)
        } },
      })
      void execution.then(async result => { await driver?.waitForIdle?.(); return result }, error => this.releaseFailedRun(input.runId, driver, error)).then(resolve, reject)
    } catch (error) {
      void this.releaseFailedRun(input.runId, driver, error).then(resolve, reject)
      throw error
    }
    // The caller can attach later without an unhandled rejection in the host.
    void running.settled.catch(() => undefined)
    return { runId: input.runId, settled: running.settled }
  }

  private async releaseFailedRun(runId: string, driver: (MiraFlowDriver & { waitForIdle?(): Promise<void> }) | undefined, error: unknown): Promise<never> {
    try { driver?.dispose?.(); await driver?.waitForIdle?.() }
    finally {
      const saved = this.host.journal.getRun(runId)
      if (saved?.status === 'pending' || saved?.status === 'running') {
        const failure = { code: 'Interrupted' as const, message: 'The workflow host failed before execution settled' }
        this.host.journal.updateRunStatus(runId, 'stopped', { stopReason: 'interrupted', failure })
        const event: RunEvent = { type: 'run-settled', status: 'stopped', stopReason: 'interrupted', error: failure }
        this.host.journal.appendEvent(runId, event)
        try { this.host.emit(runId, event) }
        catch { console.warn(`Mira workflow ${runId}: event observer failed; durable execution continues`) }
      }
    }
    throw error
  }

  private requireOwned(runId: string, parentSessionId: string): RunRecord {
    const run = this.host.journal.getRun(runId)
    if (!run || run.parentSessionId !== parentSessionId) throw new Error('工作流不属于当前会话')
    return run
  }
  private assertOpen() { if (this.closed) throw new Error('工作流宿主已关闭') }
  private assertConcurrency(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw new Error('工作流并发数需要正整数') }
  private cloneArgs(args: Record<string, unknown>) {
    const ancestors = new Set<object>()
    const check = (value: unknown): void => {
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return
      if (value && typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)) {
        if (ancestors.has(value)) throw new Error('工作流参数不能循环引用')
        ancestors.add(value)
        for (const child of Array.isArray(value) ? value : Object.values(value)) check(child)
        ancestors.delete(value)
        return
      }
      throw new Error('工作流参数必须是有限 JSON 值')
    }
    if (!args || Array.isArray(args) || Object.getPrototypeOf(args) !== Object.prototype) throw new Error('工作流参数需要对象')
    check(args)
    return JSON.parse(JSON.stringify(args)) as Record<string, unknown>
  }
}
