/* Workbench/launch ownership adapted from ZCode saved workflow launcher and run service.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode.
 * Mira adaptation: canonical project roots, Electron sender and durable parent session. */
import type { WebContents } from 'electron'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import type { ModelSelection, PermissionMode } from '../../../src/config/harness'
import { validateMiraWorkflowArgs } from '../../../src/config/miraWorkflows'
import type { MiraFlowWorkbenchRequest } from '../../../src/config/miraFlowWorkbench'
import type { RunEvent, RunRecord } from '../../../packages/mira-flow-kit/src/engine/mira-types'
import type { DriverFactory, runMiraFlowScript } from '../../../packages/mira-flow-runtime/src/mira-index'
import type { PlatformDatabase } from '../../storage/database'
import type { MiraPaths } from '../../storage/miraPaths'
import { MiraWorkflowDefinitions, parseMiraWorkflowSource } from '../../storage/miraWorkflowDefinitions'
import type { MiraFlowRunPresentation } from '../../../src/config/miraFlowWorkbench'
import type { ArtifactVersionRecord } from '../../../packages/mira-flow-kit/src/engine/mira-types'
import { MiraFlowCompiler } from './miraFlowCompiler'
import { MiraFlowRunService, type MiraFlowDriverContext, type MiraFlowExecution } from './miraFlowRunService'
import type { MiraFlowActorContextStorage } from './miraFlowActorDriver'
import type { MiraFlowReview } from '../../../src/config/miraFlowReview'
import { readMiraFlowAuthoringSource, writeMiraFlowDraft, type MiraFlowAuthoringContext, type MiraFlowAuthoringHost, type MiraFlowAuthoringSave, type MiraFlowAuthoringSource } from './miraFlowAuthoring'
import { readMiraFlowArtifact } from './miraFlowArtifactReader'
import { saveMiraFlowArtifact } from './miraFlowArtifactSave'
import { miraFlowConversationLimits } from '../../storage/miraFlowActorStore'

export interface MiraFlowControllerRuntime {
  assertFlowAdmission(sessionId: string): void
  setWorkflowActivityGuard(guard: (sessionId: string) => boolean, stop?: (sessionId: string, expectedRunId?: string) => boolean): void
  prepareMiraFlowDriver(context: MiraFlowDriverContext, sender: WebContents, selection: ModelSelection, permissionMode: PermissionMode, contextStorage: MiraFlowActorContextStorage, artifactRoot: string): DriverFactory
  publishMiraFlowEvent(sender: WebContents, sessionId: string, runId: string, event: RunEvent): void
  notifySessionActivityChanged?(sender: WebContents, sessionId: string): void
  setWorkflowAuthoringHost?(host: MiraFlowAuthoringHost): void
  notifyMiraFlowCompletion?(sender: WebContents, sessionId: string, runId: string, selection: ModelSelection, permissionMode: PermissionMode): void
}
type Owner = { sender: WebContents; selection: ModelSelection; permissionMode: PermissionMode; controller: AbortController; authorize?: () => void; creatorRunId?: string }
export type MiraFlowControllerOptions = { database: PlatformDatabase; paths: MiraPaths; runtime: MiraFlowControllerRuntime; resourceRoot: string }

/** Renderer identities are keys only; source, paths, driver, persistence and child stay host-owned. */
export class MiraFlowController implements MiraFlowAuthoringHost {
  private readonly service: MiraFlowRunService
  private readonly owners = new Map<string, Owner>()
  private readonly launches = new Set<Promise<unknown>>()
  private readonly previewCompilers = new Set<MiraFlowCompiler>()
  private closed = false
  private disposing?: Promise<void>

  constructor(private readonly options: MiraFlowControllerOptions) {
    const runtimePath = resolve(options.resourceRoot, 'mira-flow-runtime.cjs')
    const module = createRequire(runtimePath)(runtimePath) as { runMiraFlowScript: typeof runMiraFlowScript }
    if (typeof module.runMiraFlowScript !== 'function') throw new Error('Mira 工作流运行资源无效，请重新构建桌面应用')
    options.database.flowJournal.recoverInterruptedRuns()
    this.service = new MiraFlowRunService({
      journal: options.database.flowJournal, run: module.runMiraFlowScript,
      reviewGraphs: options.database.flowJournal,
      createCompiler: () => new MiraFlowCompiler(join(options.resourceRoot, 'mira-flow-compile.worker.cjs')),
      makeDriver: context => {
        const owner = this.owners.get(context.parentSessionId)
        if (!owner) throw new Error('Mira 工作流启动上下文已失效')
        owner.authorize?.()
        return options.runtime.prepareMiraFlowDriver(context, owner.sender, owner.selection, owner.permissionMode, options.database.flowActors, options.paths.workflowArtifacts())
      },
      emit: (runId, event) => {
        const run = options.database.flowJournal.getRun(runId), owner = run?.parentSessionId ? this.owners.get(run.parentSessionId) : undefined
        if (run?.parentSessionId && owner) options.runtime.publishMiraFlowEvent(owner.sender, run.parentSessionId, runId, event)
      },
    })
    options.runtime.setWorkflowActivityGuard(sessionId => this.hasActiveSession(sessionId), (sessionId, expectedRunId) => {
      if (!this.hasActiveSession(sessionId)) return false
      const run = options.database.flowJournal.listRuns(sessionId).find(run => (run.status === 'running' || run.status === 'pending') && (!expectedRunId || run.runId === expectedRunId))
      if (run) return this.service.stop(run.runId, sessionId)
      // Compilation has no journal run yet; stopping the busy parent must still cancel launch.
      if (expectedRunId && this.owners.get(sessionId)?.creatorRunId !== expectedRunId) return false
      this.owners.get(sessionId)?.controller.abort('user')
      return true
    })
    options.runtime.setWorkflowAuthoringHost?.(this)
  }

  hasActiveSession(sessionId: string): boolean { return this.owners.has(sessionId) }

  authoringCatalog(sessionId: string) {
    const session = this.writableSession(sessionId)
    return this.definitions(session.projectId).list().filter(entry => !entry.diagnostic && !entry.shadowed).map(entry => ({ name: entry.name, scope: entry.scope, ...entry.meta }))
  }

  submitFromAgent(context: MiraFlowAuthoringContext, input: MiraFlowAuthoringSource, confirm: (review: MiraFlowReview) => Promise<boolean>) {
    return this.trackLaunch(this.submitAuthored(context, structuredClone(input), confirm))
  }

  private async submitAuthored(context: MiraFlowAuthoringContext, input: MiraFlowAuthoringSource, confirm: (review: MiraFlowReview) => Promise<boolean>) {
    if (this.closed) throw new Error('Mira 工作流宿主已关闭')
    context.assertCurrent(); context.signal.throwIfAborted()
    const session = this.writableSession(context.sessionId)
    if (!session.projectId || session.parentSessionId) throw new Error('工作流需要主项目会话')
    const directory = this.projectDirectory(session.projectId)
    if ([input.script, input.saved, input.path].filter(value => value !== undefined).length !== 1) throw new Error('script、saved、path 必须恰好提供一个')
    if (input.args !== undefined && input.path === undefined) throw new Error('args 只随 path；保存定义使用 saved.args')
    const requested = input.max_concurrency ?? 2
    if (!Number.isSafeInteger(requested) || requested < 1) throw new Error('工作流并发数需要正整数')
    const maxConcurrency = Math.min(requested, 32), selection = { ...context.selection }, controller = new AbortController()
    if (this.owners.has(session.id)) throw new Error('会话已有运行中的工作流')
    const assertCurrent = () => {
      context.assertCurrent(); context.signal.throwIfAborted()
      if (this.closed || this.projectDirectory(session.projectId!) !== directory) throw new Error('工作流启动上下文已变化')
    }
    const abortPreparation = () => controller.abort('user')
    context.signal.addEventListener('abort', abortPreparation, { once: true })
    this.owners.set(session.id, { sender: context.sender, selection, permissionMode: context.permissionMode, controller, creatorRunId: context.creatorRunId })
    let execution: MiraFlowExecution | undefined
    try {
      let source: string, args: Record<string, unknown> = {}, name = input.name || input.saved?.name || '工作流', scriptPath: string | undefined
      if (input.saved) {
        const definition = this.definitions(session.projectId).read(input.saved.name, input.saved.scope)
        if (!definition) throw new Error('工作流定义不存在')
        const checked = validateMiraWorkflowArgs(definition.meta.args, input.saved.args)
        if (checked.ok === false) throw new Error(checked.errors.join('\n'))
        source = definition.source; args = checked.args
        scriptPath = await writeMiraFlowDraft(directory, source)
      } else if (input.path !== undefined) {
        const file = await readMiraFlowAuthoringSource(directory, input.path)
        if (!file.meta && input.args !== undefined) throw new Error('这个脚本没有参数声明')
        const checked = validateMiraWorkflowArgs(file.meta?.args, input.args)
        if (checked.ok === false) throw new Error(checked.errors.join('\n'))
        source = file.source; args = checked.args; scriptPath = input.path
      } else {
        source = input.script!
        if (Buffer.byteLength(source, 'utf8') > 256 * 1024) throw new Error('工作流脚本超过 256 KiB')
        scriptPath = await writeMiraFlowDraft(directory, source)
      }
      assertCurrent()
      execution = await this.service.start({ parentSessionId: session.id, cwd: directory, source, name, args, maxConcurrency, signal: controller.signal,
        toolCallId: context.toolCallId, launch: { inputId: context.inputId, subagentModel: JSON.stringify(selection) } }, async review => {
        assertCurrent()
        const allowed = await confirm({ action: 'run', name, source: review.source, sourceHash: review.sourceHash, commands: review.commands, graph: review.reviewGraph, args, maxConcurrency, model: `${selection.providerId}/${selection.modelId}${selection.thinkingLevel ? ` · ${selection.thinkingLevel}` : ''}` })
        assertCurrent()
        return allowed
      })
      // Once accepted, background work owns its cancellation; ordinary reply teardown does not stop it.
      context.signal.removeEventListener('abort', abortPreparation)
      this.retainUntilSettled(session.id, execution)
      return { sessionId: session.id, runId: execution.runId, scriptPath }
    } catch (error) {
      context.signal.removeEventListener('abort', abortPreparation)
      if (execution) { this.service.stop(execution.runId, session.id); await execution.settled.catch(() => undefined) }
      this.releaseOwner(session.id)
      throw error
    }
  }

  saveFromAgent(context: MiraFlowAuthoringContext, input: MiraFlowAuthoringSave, confirm: (review: MiraFlowReview) => Promise<boolean>) {
    return this.trackLaunch(this.saveAuthored(context, structuredClone(input), confirm))
  }

  private async saveAuthored(context: MiraFlowAuthoringContext, input: MiraFlowAuthoringSave, confirm: (review: MiraFlowReview) => Promise<boolean>) {
    context.assertCurrent(); context.signal.throwIfAborted()
    const session = this.writableSession(context.sessionId)
    if (!session.projectId || session.parentSessionId) throw new Error('工作流需要主项目会话')
    if ((input.script !== undefined) === (input.script_path !== undefined)) throw new Error('script 和 script_path 必须恰好提供一个')
    const store = this.definitions(session.projectId), directory = this.projectDirectory(session.projectId)
    const script = input.script_path !== undefined ? (await readMiraFlowAuthoringSource(directory, input.script_path)).script : input.script!
    if (input.script !== undefined && /^\s*\/\* (?:mira|zcode)-workflow\b/.test(script)) throw new Error('script 只能包含正文，不要带工作流元数据块')
    const write = { scope: input.scope, name: input.name, script, meta: { description: input.description, ...(input.whenToUse !== undefined ? { whenToUse: input.whenToUse } : {}), ...(input.args !== undefined ? { args: input.args } : {}) } }
    const preview = store.preview(write)
    const compiler = new MiraFlowCompiler(join(this.options.resourceRoot, 'mira-flow-compile.worker.cjs'))
    this.previewCompilers.add(compiler)
    try {
      const compiled = await compiler.compile(preview.next.source, context.signal)
      if (!compiled.ok || !compiled.executable) throw new Error(`工作流编译失败：\n${compiled.diagnostics.map(item => `${item.line}:${item.column} TS${item.code} ${item.message}`).join('\n')}`)
      context.assertCurrent(); context.signal.throwIfAborted()
      if (!await confirm({ action: 'save', name: input.name, source: preview.next.source, sourceHash: compiled.sourceHash, commands: compiled.executable.commands, graph: compiled.executable.reviewGraph, scope: input.scope, overwrite: Boolean(preview.previous), meta: preview.next.meta, shadowing: preview.shadowing })) throw new Error('工作流保存未获批准')
      context.assertCurrent(); context.signal.throwIfAborted()
      if (this.closed || this.projectDirectory(session.projectId) !== directory) throw new Error('工作流保存上下文已变化')
      return store.save({ ...write, expectedRevision: preview.previous?.revision })
    } finally { this.previewCompilers.delete(compiler); compiler.dispose() }
  }

  async request(sender: WebContents, request: MiraFlowWorkbenchRequest, assertAuthorized?: () => void): Promise<unknown> {
    if (this.closed) throw new Error('Mira 工作流宿主已关闭')
    assertAuthorized?.()
    switch (request.action) {
      case 'definitions.list': return this.definitions(request.projectId).list()
      case 'definitions.read': return this.definitions(request.projectId).read(request.name, request.scope)
      case 'definitions.preview': return this.trackLaunch(this.preview(request, assertAuthorized))
      case 'definitions.move': return this.definitions(request.projectId).moveToProject(request.name, request.expectedRevision)
      case 'definitions.delete': return this.definitions(request.projectId).delete(request.name, request.scope, request.expectedRevision)
      case 'definitions.save': return this.definitions(request.projectId).save(request.input)
      case 'runs.start': return this.trackLaunch(this.start(sender, request, assertAuthorized))
      case 'runs.list': {
        if (request.sessionId) this.options.database.harness.getSession(request.sessionId)
        if (request.projectId) this.projectDirectory(request.projectId)
        return this.options.database.flowJournal.listRuns(request.sessionId).filter(run => this.matchesProject(run, request.projectId)).map(run => ({ ...run, presentation: this.presentation(run) }))
      }
      case 'runs.snapshot': {
        this.writableSession(request.sessionId, false)
        const selection = this.selectionForRun(request.runId, request.sessionId)
        const snapshot = this.service.snapshot(request.runId, request.sessionId, request.afterSequence, request.limit)
        return { ...snapshot, presentation: this.presentation(snapshot.run),
          ...(selection ? { selection } : {}) }
      }
      case 'runs.stop': this.writableSession(request.sessionId); this.service.stop(request.runId, request.sessionId); return
      case 'runs.resume': return this.trackLaunch(this.resume(sender, request, assertAuthorized))
      case 'runs.concurrency': this.writableSession(request.sessionId); this.service.setConcurrency(request.runId, request.sessionId, request.maxConcurrency); return
      case 'actors.conversation': {
        this.writableSession(request.sessionId, false)
        const { run } = this.service.snapshot(request.runId, request.sessionId, undefined, 1)
        const actor = this.options.database.flowJournal.getActor(run.runId, request.siteId, request.ordinal)
        if (!actor) throw new Error('工作流智能体不存在，请刷新后重试')
        assertAuthorized?.()
        const shared = { actorName: actor.name?.slice(0, 256), runStatus: run.status }
        if (!actor.sessionId) return { ...shared, state: 'not-started', messages: [], offset: 0, nextOffset: 0, total: 0, hasMore: false, limits: { ...miraFlowConversationLimits } }
        const page = this.options.database.flowActors.readConversation(actor.sessionId, request.offset, request.limit)
        if (!page) throw new Error('工作流对话记录不可读取，请刷新后重试')
        assertAuthorized?.()
        return { ...shared, state: 'available', ...page }
      }
      case 'artifacts.read':
      case 'artifacts.save': {
        this.writableSession(request.sessionId, false)
        const snapshot = this.service.snapshot(request.runId, request.sessionId)
        const node = snapshot.nodes.find(item => item.kind === 'artifact' && item.status === 'completed' && item.artifactId === request.artifactId
          && item.result && typeof item.result === 'object' && (item.result as { version?: unknown }).version === request.version)
        if (!node) throw new Error('工作流产物不存在，请刷新后重试')
        if (request.action === 'artifacts.read' && typeof (node.result as { bytes?: unknown }).bytes === 'number' && (node.result as { bytes: number }).bytes > 4 * 1024 * 1024) throw new Error('预览文件过大，请保存后查看')
        const { record, payload } = await readMiraFlowArtifact(this.options.paths.workflowArtifacts(), request.runId, node, assertAuthorized)
        assertAuthorized?.()
        if (request.action === 'artifacts.save') return saveMiraFlowArtifact(sender, this.options.paths.workflowArtifacts(), record, payload, assertAuthorized)
        return { contentType: record.contentType ?? 'application/octet-stream', bytes: payload.length, dataBase64: payload.toString('base64'), title: record.title || record.id }
      }
    }
  }

  private async start(sender: WebContents, request: Extract<MiraFlowWorkbenchRequest, { action: 'runs.start' }>, authorize?: () => void) {
    const directory = this.projectDirectory(request.projectId), store = this.definitions(request.projectId)
    const definition = store.read(request.name, request.scope)
    if (!definition) throw new Error('工作流定义不存在')
    if (definition.revision !== request.revision) throw new Error('工作流已变化，请刷新后重试')
    const args = validateMiraWorkflowArgs(definition.meta.args, request.args)
    if (!args.ok) throw new Error(args.errors.join('\n'))
    authorize?.()
    const permissionMode = request.permissionMode ?? this.options.database.harness.getPermissionConfig().globalDefaultMode
    const selection = { ...request.selection }
    const session = this.options.database.harness.createSession(request.projectId, permissionMode, true)
    let execution: MiraFlowExecution | undefined
    try {
      const controller = new AbortController()
      this.admit(session.id, { sender, selection, permissionMode, controller, authorize })
      this.options.database.harness.acceptPreparedSession(session.id)
      // Publish parent metadata before tools may update it; never overwrite their live rows later.
      this.options.database.harness.updateSession({ ...session, draftState: 'accepted', title: definition.name, titleSource: 'manual', titleRevision: (session.titleRevision ?? 0) + 1, modelProviderId: selection.providerId, modelId: selection.modelId, modelThinkingLevel: selection.thinkingLevel })
      execution = await this.service.start({ parentSessionId: session.id, cwd: directory, source: definition.source, name: definition.name, args: args.args, maxConcurrency: 2, signal: controller.signal, launch: { inputId: randomUUID(), subagentModel: JSON.stringify(selection) } }, async () => {
        authorize?.()
        if (this.closed || this.projectDirectory(request.projectId) !== directory || store.read(request.name, request.scope)?.revision !== definition.revision) throw new Error('工作流已变化，请刷新后重试')
        return true
      })
      this.retainUntilSettled(session.id, execution)
      return { sessionId: session.id, runId: execution.runId }
    } catch (error) {
      if (execution) { this.service.stop(execution.runId, session.id); await execution.settled.catch(() => undefined) }
      this.releaseOwner(session.id)
      const current = this.options.database.harness.getSession(session.id)
      if (!current.messages.length && !this.options.database.flowJournal.listRuns(session.id).length) this.options.database.harness.deleteSession(session.id)
      throw error
    }
  }

  private async resume(sender: WebContents, request: Extract<MiraFlowWorkbenchRequest, { action: 'runs.resume' }>, authorize?: () => void) {
    const session = this.writableSession(request.sessionId)
    if (!session.projectId) throw new Error('Mira 工作流需要项目工作目录')
    const selection = this.selectionForRun(request.runId, request.sessionId)
    if (!selection || selection.providerId !== request.selection.providerId || selection.modelId !== request.selection.modelId || (selection.thinkingLevel ?? 'off') !== (request.selection.thinkingLevel ?? 'off')) throw new Error('工作流续跑必须使用原模型和推理档位')
    const directory = this.projectDirectory(session.projectId)
    const controller = new AbortController()
    this.admit(session.id, { sender, selection, permissionMode: session.permissionMode, controller, authorize })
    try {
      const execution = await this.service.resume(request.runId, session.id, directory, controller.signal)
      this.retainUntilSettled(session.id, execution)
      return { sessionId: session.id, runId: execution.runId }
    } catch (error) { this.releaseOwner(session.id); throw error }
  }

  private async preview(request: Extract<MiraFlowWorkbenchRequest, { action: 'definitions.preview' | 'definitions.save' }>, authorize?: () => void) {
    const preview = this.definitions(request.projectId).preview(request.input)
    const compiler = new MiraFlowCompiler(join(this.options.resourceRoot, 'mira-flow-compile.worker.cjs'))
    this.previewCompilers.add(compiler)
    try {
      const compiled = await compiler.compile(preview.next.source)
      authorize?.()
      if (!compiled.ok || !compiled.executable) throw new Error(`工作流编译失败：\n${compiled.diagnostics.map(item => `${item.line}:${item.column} TS${item.code} ${item.message}`).join('\n')}`)
      return preview
    } finally { this.previewCompilers.delete(compiler); compiler.dispose() }
  }

  private admit(sessionId: string, owner: Owner): void {
    if (this.owners.has(sessionId)) throw new Error('会话已有运行中的工作流')
    this.options.runtime.assertFlowAdmission(sessionId)
    this.owners.set(sessionId, owner)
  }

  private releaseOwner(sessionId: string): void {
    const owner = this.owners.get(sessionId)
    if (!owner) return
    this.owners.delete(sessionId)
    this.options.runtime.notifySessionActivityChanged?.(owner.sender, sessionId)
  }

  private retainUntilSettled(sessionId: string, execution: MiraFlowExecution): void {
    const owner = this.owners.get(sessionId)
    const release = () => {
      if (this.owners.get(sessionId) !== owner) return
      this.releaseOwner(sessionId)
      if (owner && !this.closed) this.options.runtime.notifyMiraFlowCompletion?.(owner.sender, sessionId, execution.runId, owner.selection, owner.permissionMode)
    }
    void execution.settled.then(release, release)
  }

  private presentation(run: RunRecord): MiraFlowRunPresentation {
    const parsed = parseMiraWorkflowSource(run.scriptText ?? '')
    const artifacts = new Map<string, ArtifactVersionRecord>()
    for (const node of this.options.database.flowJournal.listNodes(run.runId)) {
      if (node.kind !== 'artifact' || node.status !== 'completed' || !node.result || typeof node.result !== 'object') continue
      const artifact = node.result as ArtifactVersionRecord
      if (!artifact.id || !artifact.version) continue
      if ((artifacts.get(artifact.id)?.version ?? 0) < artifact.version) artifacts.set(artifact.id, artifact)
    }
    const session = run.parentSessionId ? this.options.database.harness.getSession(run.parentSessionId) : undefined
    const saved = this.definitions(session?.projectId).list().find(entry => entry.name === run.name && entry.revision === run.scriptHash && !entry.diagnostic)
    return { ...this.options.database.flowJournal.runTimes(run.runId), ...(parsed.ok ? { description: parsed.meta.description } : {}), artifacts: [...artifacts.values()].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary))),
      ...(saved?.revision ? { savedDefinition: { name: saved.name, scope: saved.scope, revision: saved.revision, ...(session?.projectId ? { projectId: session.projectId } : {}) } } : {}) }
  }

  private selectionForRun(runId: string, sessionId: string): ModelSelection | undefined {
    const run = this.options.database.flowJournal.getRun(runId)
    if (!run || run.parentSessionId !== sessionId) throw new Error('工作流不属于当前会话')
    const launch = this.options.database.flowJournal.listEvents(runId, { limit: 500 }).find(item => item.event.type === 'run-launched')?.event
    if (launch?.type === 'run-launched' && launch.subagentModel) {
      try {
        const selected = JSON.parse(launch.subagentModel) as ModelSelection
        if (typeof selected.providerId === 'string' && typeof selected.modelId === 'string') return selected
      } catch { /* Older run metadata falls back to its historical parent selection. */ }
    }
    const session = this.writableSession(sessionId, false)
    return session.modelProviderId && session.modelId ? { providerId: session.modelProviderId, modelId: session.modelId, ...(session.modelThinkingLevel ? { thinkingLevel: session.modelThinkingLevel } : {}) } : undefined
  }

  private trackLaunch<T>(promise: Promise<T>): Promise<T> {
    this.launches.add(promise)
    void promise.then(() => this.launches.delete(promise), () => this.launches.delete(promise))
    return promise
  }

  private writableSession(sessionId: string, writable = true) {
    const session = this.options.database.harness.getSession(sessionId)
    if (writable && session.archivedAt) throw new Error('已归档会话不能运行或修改工作流')
    return session
  }

  private matchesProject(run: RunRecord, projectId?: string): boolean {
    if (!run.parentSessionId) return false
    try { const session = this.writableSession(run.parentSessionId, false); return !projectId || session.projectId === projectId }
    catch { return false }
  }

  private projectDirectory(projectId: string): string {
    const directory = realpathSync(this.options.database.harness.getProjectDirectory(projectId))
    return directory
  }

  private definitions(projectId?: string): MiraWorkflowDefinitions {
    return new MiraWorkflowDefinitions({ globalRoot: this.options.paths.workflows(), ...(projectId ? { projectRoot: join(this.projectDirectory(projectId), '.mira', 'workflows') } : {}) })
  }

  async dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.closed = true
    for (const compiler of this.previewCompilers) compiler.dispose()
    return this.disposing = (async () => {
      await this.service.dispose()
      await Promise.allSettled([...this.launches])
      this.owners.clear()
    })()
  }
}
