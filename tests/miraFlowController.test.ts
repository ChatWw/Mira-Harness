import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { WebContents } from 'electron'
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from '@earendil-works/pi-ai'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import { MiraPaths } from '../electron/storage/miraPaths'
import { PlatformDatabase } from '../electron/storage/database'
import { MiraFlowController, type MiraFlowControllerRuntime } from '../electron/services/flows/miraFlowController'
import { createMiraFlowActorDriver } from '../electron/services/flows/miraFlowActorDriver'
import { createMiraFlowWorld } from '../electron/services/flows/miraFlowWorld'
import type { MiraFlowRunIdentity, MiraFlowRunSnapshot, MiraFlowWorkbenchRequest } from '../src/config/miraFlowWorkbench'
import type { MiraWorkflowDocument, MiraWorkflowPreview, MiraWorkflowWrite } from '../src/config/miraWorkflows'
import type { RunRecord } from '../packages/mira-flow-kit/src/mira-index'
import type { MiraFlowAuthoringContext } from '../electron/services/flows/miraFlowAuthoring'

const roots: string[] = [], views: Array<{ controller: MiraFlowController; database: PlatformDatabase; databaseOpen: boolean }> = []
const directory = () => { const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-controller-'))); roots.push(root); return root }
let resourceRoot: string
beforeAll(() => {
  resourceRoot = directory()
  execFileSync(process.execPath, ['--input-type=module', '-e', 'import {buildMiraFlow} from "./scripts/build-mira-flow.mjs"; await buildMiraFlow(process.argv[1]);', resourceRoot], { cwd: resolve('.'), stdio: 'pipe' })
}, 20_000)
afterEach(async () => { for (const view of views.splice(0)) { await view.controller.dispose(); if (view.databaseOpen) view.database.close() } })
afterAll(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })))
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
const selection = { providerId: 'fixture', modelId: 'fixture' }
const model: Model<'openai-completions'> = { ...selection, id: 'fixture', provider: 'fixture', name: 'Fixture', api: 'openai-completions', baseUrl: 'http://127.0.0.1:1', reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }

function setup(wait?: Promise<void>) {
  const home = directory(), paths = new MiraPaths(home), database = new PlatformDatabase(paths), workspace = join(home, 'project')
  mkdirSync(workspace)
  const project = database.harness.createProject(workspace)
  let guard: (id: string) => boolean = () => false, stop: ((id: string, runId?: string) => boolean) | undefined
  const requests: unknown[] = []
  const streamFn: StreamFn = (_model, context, options) => {
    requests.push(JSON.parse(JSON.stringify(context)))
    const stream = createAssistantMessageEventStream()
    const message: AssistantMessage = { role: 'assistant', content: [{ type: 'text', text: 'ACTUAL-ACTOR-RESULT' }], api: model.api, provider: model.provider, model: model.id,
      timestamp: Date.now(), stopReason: 'stop', usage: { input: 8, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
    void (async () => {
      stream.push({ type: 'start', partial: message })
      if (wait) await Promise.race([wait, new Promise<void>(done => { options?.signal?.addEventListener('abort', () => done(), { once: true }); if (options?.signal?.aborted) done() })])
      if (options?.signal?.aborted) { message.stopReason = 'aborted'; message.errorMessage = 'Aborted'; stream.push({ type: 'error', reason: 'aborted', error: message }) }
      else stream.push({ type: 'done', reason: 'stop', message })
    })()
    return stream
  }
  const runtime: MiraFlowControllerRuntime = {
    assertFlowAdmission: vi.fn(id => { if (guard(id)) throw new Error('Already busy') }),
    setWorkflowActivityGuard: vi.fn((next, stopping) => { guard = next; stop = stopping }),
    publishMiraFlowEvent: vi.fn(),
    notifySessionActivityChanged: vi.fn(),
    notifyMiraFlowCompletion: vi.fn(),
    prepareMiraFlowDriver: vi.fn((context, _sender, selected, _permissionMode, storage, artifactRoot) => {
      expect(selected).toMatchObject(selection)
      const world = createMiraFlowWorld({ workspacePath: context.cwd, signal: context.signal, artifactRoot })
      return createMiraFlowActorDriver({ ...context, contextStorage: storage, resolveActor: async (_identity, pin) => ({ model, streamFn, resolvedModel: pin ?? 'fixture/fixture' }),
        executeWorldRead: async (...args) => (await world).executeWorldRead(...args), executeArtifactPublish: async request => (await world).executeArtifactPublish(request) })
    }),
  }
  const controller = new MiraFlowController({ database, paths, runtime, resourceRoot })
  const sender = { isDestroyed: () => false } as WebContents
  const request = <T = unknown>(value: MiraFlowWorkbenchRequest, authorize?: () => void) => controller.request(sender, value, authorize) as Promise<T>
  const write = (script = 'return await agent("writer").ask("Actual request");', name = 'actual-flow'): MiraWorkflowWrite => ({ scope: 'project', name, meta: { description: 'Actual workflow' }, script })
  const save = (input = write()) => request<MiraWorkflowDocument>({ action: 'definitions.save', projectId: project.id, input })
  const launch = (document: MiraWorkflowDocument, extra: Partial<Extract<MiraFlowWorkbenchRequest, { action: 'runs.start' }>> = {}) => request<MiraFlowRunIdentity>({ action: 'runs.start', projectId: project.id, name: document.name, scope: document.scope, revision: document.revision, selection, ...extra })
  const snapshot = (id: MiraFlowRunIdentity) => request<MiraFlowRunSnapshot>({ action: 'runs.snapshot', ...id })
  const settled = async (id: MiraFlowRunIdentity) => { await vi.waitFor(() => expect(controller.hasActiveSession(id.sessionId)).toBe(false), { timeout: 5000 }); return snapshot(id) }
  const view = { home, paths, database, databaseOpen: true, project, workspace, controller, runtime, requests, sender, request, write, save, launch, snapshot, settled, stop: (id: { sessionId: string; runId?: string }) => stop?.(id.sessionId, id.runId) }
  views.push(view)
  return view
}

describe('production Mira workflow controller with real SQLite/compiler/child/Pi Agent', () => {
  it('requests a parent summary after a saved workflow releases its owner', async () => {
    const view = setup(), document = await view.save(view.write('return "SAVED-RESULT";'))
    const id = await view.launch(document)
    await view.settled(id)
    expect(view.runtime.notifyMiraFlowCompletion).toHaveBeenCalledExactlyOnceWith(view.sender, id.sessionId, id.runId, selection, expect.any(String))
  })
  const authoredContext = (view: ReturnType<typeof setup>, signal = new AbortController().signal): MiraFlowAuthoringContext => {
    const parent = view.database.harness.createSession(view.project.id)
    return { sender: view.sender, sessionId: parent.id, creatorRunId: 'ordinary-run', toolCallId: 'ordinary-tool', inputId: 'user-input', selection, permissionMode: 'default', signal, assertCurrent: () => signal.throwIfAborted() }
  }

  it('compiles and reviews exact authored source, launches in the existing session and survives ordinary completion', async () => {
    const gate = deferred(), view = setup(gate.promise), ordinary = new AbortController(), context = authoredContext(view, ordinary.signal)
    const source = 'phase("核验"); return await agent("reviewer").ask("Inspect actual content");'
    const review = vi.fn(async (value: any) => { expect(value.source).toBe(source); expect(value.graph.phases[0]?.name).toBe('核验'); expect(view.database.flowJournal.listRuns()).toHaveLength(0); return true })
    const id = await view.controller.submitFromAgent(context, { name: '同会话任务', script: source }, review)
    expect(id.sessionId).toBe(context.sessionId); expect(view.database.harness.listSessions()).toHaveLength(1)
    expect(view.database.harness.getSession(context.sessionId).title).not.toBe('同会话任务')
    await vi.waitFor(() => expect(view.requests).toHaveLength(1))
    ordinary.abort()
    expect(view.controller.hasActiveSession(context.sessionId)).toBe(true)
    expect(view.stop({ sessionId: context.sessionId, runId: 'foreign-run' })).toBe(false)
    gate.resolve()
    const released: boolean[] = []
    vi.mocked(view.runtime.notifySessionActivityChanged!).mockImplementation(() => { released.push(view.controller.hasActiveSession(id.sessionId)) })
    const snapshot = await view.settled(id)
    expect(released).toEqual([false])
    expect(snapshot.run.status).toBe('completed')
    expect(snapshot.events.find(item => item.event.type === 'run-launched')?.event).toMatchObject({ inputId: context.inputId, toolCallId: context.toolCallId, parentSessionId: context.sessionId })
    expect(review).toHaveBeenCalledOnce()
    const parent = view.database.harness.getSession(context.sessionId)
    view.database.harness.updateSession({ ...parent, modelProviderId: 'changed', modelId: 'other' })
    expect((await view.snapshot(id)).selection).toEqual(selection)
  })

  it('does not ask or create a run for invalid source and never runs a rejected review', async () => {
    const view = setup(), context = authoredContext(view), review = vi.fn(async () => false)
    await expect(view.controller.submitFromAgent(context, { script: 'return missingAuthoringSymbol;' }, review)).rejects.toThrow('missingAuthoringSymbol')
    expect(review).not.toHaveBeenCalled()
    await expect(view.controller.submitFromAgent(context, { script: 'return 1;' }, review)).rejects.toThrow('未获批准')
    expect(review).toHaveBeenCalledOnce(); expect(view.database.flowJournal.listRuns()).toHaveLength(0)
    expect(view.database.harness.listSessions()).toHaveLength(1)
    expect(view.controller.hasActiveSession(context.sessionId)).toBe(false)
  })

  it('freezes a saved definition and validated arguments before source review', async () => {
    const view = setup(), context = authoredContext(view)
    const original = await view.save({ ...view.write('return args.topic;', 'reusable'), meta: { description: 'Reusable', args: { topic: { type: 'string', required: true } } } })
    const id = await view.controller.submitFromAgent(context, { saved: { name: 'reusable', args: { topic: 'original-value' } } }, async review => {
      expect(review.source).toBe(original.source); expect(review.args).toEqual({ topic: 'original-value' })
      await view.save({ ...view.write('return "changed";', 'reusable'), meta: original.meta, expectedRevision: original.revision })
      return true
    })
    expect((await view.settled(id)).run).toMatchObject({ scriptText: original.source, result: 'original-value', args: { topic: 'original-value' } })
    expect((await view.request<MiraWorkflowDocument>({ action: 'definitions.read', projectId: view.project.id, name: 'reusable' })).script).toBe('return "changed";')
  })

  it('compiles before save review, refuses declined/stale writes and never launches saved work', async () => {
    const view = setup(), context = authoredContext(view), rejected = vi.fn(async () => false)
    const input = { name: 'reviewed-save', scope: 'project' as const, description: 'Reviewed definition', script: 'return 5;' }
    await expect(view.controller.saveFromAgent(context, { ...input, script: 'return unknownSaveSymbol;' }, rejected)).rejects.toThrow('unknownSaveSymbol')
    expect(rejected).not.toHaveBeenCalled()
    await expect(view.controller.saveFromAgent(context, input, rejected)).rejects.toThrow('未获批准')
    expect(view.controller.authoringCatalog(context.sessionId)).toEqual([])
    const saved = await view.controller.saveFromAgent(context, input, async review => { expect(review).toMatchObject({ action: 'save', overwrite: false, scope: 'project' }); return true }) as MiraWorkflowDocument
    await expect(view.controller.saveFromAgent(context, { ...input, script: 'return 6;' }, async review => {
      expect(review.overwrite).toBe(true)
      await view.save({ ...view.write('return 7;', input.name), expectedRevision: saved.revision })
      return true
    })).rejects.toThrow('已被修改')
    expect(view.database.flowJournal.listRuns()).toHaveLength(0)
    expect(view.requests).toHaveLength(0)
  })

  it('cancels an authored workflow through its creating ordinary run identity without accepting a foreign stop', async () => {
    const gate = deferred(), view = setup(gate.promise), context = authoredContext(view)
    const id = await view.controller.submitFromAgent(context, { script: 'return await agent("writer").ask("wait");' }, async () => true)
    await vi.waitFor(() => expect(view.requests).toHaveLength(1))
    expect(view.stop({ sessionId: context.sessionId, runId: 'foreign-run' })).toBe(false)
    expect(view.stop({ sessionId: context.sessionId, runId: context.creatorRunId })).toBe(true)
    expect((await view.settled(id)).run).toMatchObject({ status: 'stopped', stopReason: 'user' })
    gate.resolve()
  })
  it('manages canonical project/global definitions, compiles previews and runs the exact saved revision', async () => {
    const view = setup(), doc = await view.save()
    const preview = await view.request<MiraWorkflowPreview>({ action: 'definitions.preview', projectId: view.project.id, input: { ...view.write(), expectedRevision: doc.revision } })
    expect(preview.next.source).toBe(doc.source)
    expect(doc.path).toBe(join(view.workspace, '.mira', 'workflows', 'actual-flow.dwf.ts'))
    const global = await view.request<MiraWorkflowDocument>({ action: 'definitions.save', input: { ...view.write('return 4;', 'global-flow'), scope: 'global' } })
    expect(global.path).toBe(join(view.paths.workflows(), 'global-flow.dwf.ts'))
    const id = await view.launch(doc), snapshot = await view.settled(id)
    expect(snapshot.selection).toEqual(selection)
    expect(snapshot.run).toMatchObject({ status: 'completed', parentSessionId: id.sessionId, scriptText: doc.source, scriptHash: doc.revision, result: 'ACTUAL-ACTOR-RESULT', spentTokens: 10 })
    expect(snapshot.nodes).toHaveLength(1); expect(snapshot.actors[0]?.sessionId).toBeTruthy()
    expect(view.runtime.publishMiraFlowEvent).toHaveBeenCalledWith(view.sender, id.sessionId, id.runId, expect.objectContaining({ type: 'run-settled' }))
    const parent = view.database.harness.getSession(id.sessionId)
    expect(parent).toMatchObject({ title: doc.name, draftState: 'accepted', modelProviderId: 'fixture', modelId: 'fixture' })
    expect(await view.request<RunRecord[]>({ action: 'runs.list', projectId: view.project.id })).toEqual([expect.objectContaining(snapshot.run)])
    expect(await view.request<RunRecord[]>({ action: 'runs.list', sessionId: id.sessionId })).toEqual([expect.objectContaining(snapshot.run)])
  })

  it('rejects stale revision and invalid args before creating a parent session or model request', async () => {
    const view = setup(), input = { ...view.write(), meta: { description: 'Args workflow', args: { count: { type: 'number' as const, required: true } } } }, doc = await view.save(input)
    await expect(view.launch(doc, { revision: '0'.repeat(64) })).rejects.toThrow('工作流已变化')
    await expect(view.launch(doc)).rejects.toThrow('缺少必填参数')
    expect(view.database.harness.listSessions()).toHaveLength(0); expect(view.requests).toHaveLength(0)
  })

  it('shows real compiler diagnostics and removes the new empty parent after a failed start', async () => {
    const view = setup(), doc = await view.save(view.write('return unknownWorkflowSymbol;'))
    await expect(view.request({ action: 'definitions.preview', projectId: view.project.id, input: view.write('return unknownWorkflowSymbol;') })).rejects.toThrow('TS2304')
    await expect(view.launch(doc)).rejects.toThrow('unknownWorkflowSymbol')
    expect(view.database.harness.listSessions()).toHaveLength(0)
    expect(view.database.flowJournal.listRuns()).toHaveLength(0)
    expect(view.runtime.prepareMiraFlowDriver).not.toHaveBeenCalled()
  })

  it('rechecks revoked grants after compilation and cleans its own empty session', async () => {
    const view = setup(), doc = await view.save(); let checks = 0
    const authorize = () => { if (++checks >= 3) throw new Error('Grant revoked') }
    await expect(view.request({ action: 'runs.start', projectId: view.project.id, name: doc.name, scope: 'project', revision: doc.revision, selection }, authorize)).rejects.toThrow('Grant revoked')
    expect(view.database.harness.listSessions()).toHaveLength(0); expect(view.runtime.prepareMiraFlowDriver).not.toHaveBeenCalled()
  })

  it('guards active sessions, supports ordinary Composer stop, and resumes the pinned parent', async () => {
    const gate = deferred(), view = setup(gate.promise), doc = await view.save(), id = await view.launch(doc)
    await vi.waitFor(() => expect(view.requests).toHaveLength(1))
    expect(view.controller.hasActiveSession(id.sessionId)).toBe(true)
    await view.request({ action: 'runs.concurrency', ...id, maxConcurrency: 3 })
    expect((await view.snapshot(id)).run.caps.maxConcurrency).toBe(3)
    expect(view.stop({ ...id, runId: 'wrong-run' })).toBe(false)
    expect(view.stop(id)).toBe(true)
    expect((await view.settled(id)).run).toMatchObject({ status: 'stopped', stopReason: 'user' })
    await expect(view.request({ action: 'runs.resume', ...id, selection: { ...selection, modelId: 'other' } })).rejects.toThrow('原模型')
    gate.resolve()
    expect(await view.request({ action: 'runs.resume', ...id, selection })).toEqual(id)
    expect((await view.settled(id)).run.status).toBe('completed')
  })

  it('rejects cross-session run access without stopping the actual run', async () => {
    const gate = deferred(), view = setup(gate.promise), doc = await view.save(), id = await view.launch(doc), wrong = view.database.harness.createSession(view.project.id)
    await expect(view.request({ action: 'runs.snapshot', sessionId: wrong.id, runId: id.runId })).rejects.toThrow('不属于当前会话')
    await expect(view.request({ action: 'runs.stop', sessionId: wrong.id, runId: id.runId })).rejects.toThrow('不属于当前会话')
    expect(view.controller.hasActiveSession(id.sessionId)).toBe(true)
    gate.resolve(); await view.settled(id)
  })

  it('waits for initialization/actor abortion and keeps real workflow parents across database reopen', async () => {
    const gate = deferred(), view = setup(gate.promise), doc = await view.save(), id = await view.launch(doc)
    await vi.waitFor(() => expect(view.requests).toHaveLength(1))
    await view.controller.dispose()
    expect(view.controller.hasActiveSession(id.sessionId)).toBe(false)
    view.database.close(); view.databaseOpen = false
    const reopened = new PlatformDatabase(view.paths)
    try {
      expect(reopened.harness.getSession(id.sessionId)).toMatchObject({ draftState: 'accepted', title: doc.name })
      expect(reopened.flowJournal.getRun(id.runId)).toMatchObject({ status: 'stopped', stopReason: 'interrupted' })
      const actor = reopened.flowJournal.listActors(id.runId)[0]!
      expect((await reopened.flowActors.loadOrCreate(actor.sessionId!)).messages.length).toBeGreaterThan(0)
    } finally { reopened.close() }
  })

  it('retains a legacy empty flow parent on DB read and recovers unfinished work only at controller startup', async () => {
    const view = setup(), parent = view.database.harness.createSession(view.project.id)
    const run: RunRecord = { runId: 'old-process-run', parentSessionId: parent.id, cwd: view.workspace, status: 'running', scriptText: 'return 1;', scriptHash: 'source', caps: { maxConcurrency: 2 }, spentTokens: 0 }
    view.database.flowJournal.createRun(run)
    await view.controller.dispose(); view.database.close(); view.databaseOpen = false
    const reopened = new PlatformDatabase(view.paths)
    let controller: MiraFlowController | undefined
    try {
      expect(reopened.harness.getSession(parent.id).id).toBe(parent.id)
      expect(reopened.flowJournal.getRun(run.runId)?.status).toBe('running')
      controller = new MiraFlowController({ database: reopened, paths: view.paths, runtime: view.runtime, resourceRoot })
      expect(reopened.flowJournal.getRun(run.runId)).toMatchObject({ status: 'stopped', stopReason: 'interrupted' })
      expect(reopened.flowJournal.listEvents(run.runId)).toHaveLength(1)
    } finally { await controller?.dispose(); reopened.close() }
  })

  it('does not overwrite parent tool metadata created during launch', async () => {
    const view = setup(), doc = await view.save(), prepare = view.runtime.prepareMiraFlowDriver
    view.runtime.prepareMiraFlowDriver = vi.fn<MiraFlowControllerRuntime['prepareMiraFlowDriver']>((...args) => {
      const session = view.database.harness.getSession(args[0].parentSessionId)
      view.database.harness.updateSession({ ...session, delegationEnabled: false })
      return prepare(...args)
    })
    const id = await view.launch(doc); await view.settled(id)
    expect(view.database.harness.getSession(id.sessionId).delegationEnabled).toBe(false)
  })

  it('stops a parent still compiling without launching a child or making a model request', async () => {
    const view = setup(), doc = await view.save()
    const launch = view.launch(doc)
    const stopped = expect(launch).rejects.toThrow('取消')
    // Admission and parent publication run synchronously before the compiler await.
    const parent = view.database.harness.listSessions()[0]!
    expect(view.controller.hasActiveSession(parent.id)).toBe(true)
    expect(view.stop({ sessionId: parent.id })).toBe(true)
    await stopped
    expect(view.database.flowJournal.listRuns()).toHaveLength(0)
    expect(view.database.harness.listSessions()).toHaveLength(0)
    expect(view.runtime.prepareMiraFlowDriver).not.toHaveBeenCalled()
    expect(view.requests).toHaveLength(0)
  })

  it('reads the exact published artifact through owned journal identity and rejects foreign owners/versions', async () => {
    const view = setup(), doc = await view.save(view.write('await artifact.markdown("draft", "# Immutable published version"); return "done";'))
    const id = await view.launch(doc), snapshot = await view.settled(id)
    expect(snapshot.run.status).toBe('completed')
    const request = { action: 'artifacts.read' as const, ...id, artifactId: 'draft', version: 1 }
    const content = await view.request<{ dataBase64: string; contentType: string }>(request)
    expect(Buffer.from(content.dataBase64, 'base64').toString()).toBe('# Immutable published version')
    expect(content.contentType).toBe('text/markdown')
    const foreign = view.database.harness.createSession(view.project.id)
    await expect(view.request({ ...request, sessionId: foreign.id })).rejects.toThrow('不属于当前会话')
    await expect(view.request({ ...request, version: 2 })).rejects.toThrow('产物不存在')
    let checks = 0
    await expect(view.request(request, () => { if (++checks > 2) throw new Error('第一方授权无效或应用已停用') })).rejects.toThrow('第一方授权无效或应用已停用')
  })

  it('projects immutable run descriptions, real times and latest artifact versions into history', async () => {
    const view = setup(), doc = await view.save(view.write('await artifact.markdown("draft", "first"); await artifact.markdown("draft", "second"); return "done";'))
    const identity = await view.launch(doc), snapshot = await view.settled(identity)
    expect(snapshot.presentation).toMatchObject({ description: 'Actual workflow', savedDefinition: { name: doc.name, revision: doc.revision } })
    expect(snapshot.presentation!.endedAt).toBeGreaterThanOrEqual(snapshot.presentation!.startedAt!)
    expect(snapshot.presentation!.artifacts.map(item => [item.id, item.version])).toEqual([['draft', 2]])
    await view.save({ ...view.write('return "changed";'), meta: { description: 'New description' }, expectedRevision: doc.revision })
    const runs = await view.request<Array<{ presentation: typeof snapshot.presentation }>>({ action: 'runs.list', projectId: view.project.id })
    expect(runs[0].presentation!.description).toBe('Actual workflow')
    expect(runs[0].presentation!.savedDefinition).toBeUndefined()
  })
  it('ships the real compiler/runtime/licenses in ordinary desktop build hooks and resources', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    for (const hook of ['predesktop:dev', 'predesktop:build', 'predesktop:build:win']) expect(packageJson.scripts[hook]).toContain('npm run flow:build')
    expect(packageJson.build.extraResources).toContainEqual(expect.objectContaining({ from: 'dist/mira-flow-host', to: 'mira-flow-host' }))
    expect(readFileSync(join(resourceRoot, 'third-party-licenses', 'zcode', 'LICENSE'), 'utf8')).toContain('Apache License')
    expect(readFileSync(join(resourceRoot, 'TYPESCRIPT-LICENSE.txt'), 'utf8')).toContain('Apache License')
  })
})
