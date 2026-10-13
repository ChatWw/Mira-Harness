import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import * as modelProvider from '../electron/services/harnessModelProvider'
import { miraPresentationWorkspaceIdentity } from '../electron/services/miraPresentationReferences'
import { PlatformDatabase } from '../electron/storage/database'
import { serializeMiraPresentationReference, type MiraPresentationReference } from '../src/config/miraPresentation'
import type { HarnessEvent } from '../src/config/harness'

function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
type Step = { text?: string; wait?: ReturnType<typeof deferred> }
const selection = { providerId: 'fixture', modelId: 'model' }
const changedError = '演示文稿或工作目录已变化，或文件不可读取，请重新打开并引用'
const ownerError = '演示文稿元素引用不属于当前任务，请重新引用'
const fixtures: ReturnType<typeof setup>[] = []

afterEach(async () => {
  for (const view of fixtures) { view.runtime.abort(view.sessionId); view.steps.forEach(step => step.wait?.resolve()); view.gates.forEach(gate => gate.resolve()) }
  await Promise.allSettled(fixtures.flatMap(view => view.runs))
  for (const view of fixtures) await view.idle()
  vi.restoreAllMocks()
  for (const view of fixtures.splice(0)) { view.database.close(); rmSync(view.root, { recursive: true, force: true }) }
})

/** Installed Agent, SQLite, queue and filesystem; only the model transport is deterministic. */
function setup(steps: Step[] = [{}]) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mira-presentation-runtime-'))), directory = join(root, 'project')
  mkdirSync(directory)
  const file = join(directory, 'deck.pptx'), source = Buffer.from('Exact captured local presentation version')
  writeFileSync(file, source)
  const database = new PlatformDatabase(root), project = database.harness.createProject(directory), created = database.harness.createSession(project.id)
  database.harness.updateSession({ ...created, delegationEnabled: false, titleSource: 'manual' })
  database.models.save({ id: 'fixture', name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled: true, models: [{ id: 'model', enabled: true, reasoning: false }] })
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  vi.spyOn(runtime as any, 'compactContext').mockImplementation(async (_sender, session) => session)
  vi.spyOn(database.memories, 'enabled').mockReturnValue(false)
  const contexts: any[][] = [], events: HarnessEvent[] = []
  const original = modelProvider.createHarnessModelProvider
  vi.spyOn(modelProvider, 'createHarnessModelProvider').mockImplementation((...args) => {
    const configured = original(...args)
    vi.spyOn(configured.models, 'streamSimple').mockImplementation((_model, context) => {
      const step = steps[contexts.length] || {}, text = step.text ?? 'Finished'
      contexts.push(structuredClone(context.messages))
      const stream = createAssistantMessageEventStream()
      const message: any = { role: 'assistant', content: [{ type: 'text', text }], api: 'openai-completions', provider: 'mira-openai', model: 'model', timestamp: Date.now(), stopReason: 'stop', usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }
      void (async () => {
        await Promise.resolve()
        stream.push({ type: 'start', partial: message })
        if (step.wait) await step.wait.promise
        stream.push({ type: 'done', reason: 'stop', message })
      })()
      return stream
    })
    return configured
  })
  const sender: any = { isDestroyed: () => false, send: (_channel: string, event: HarnessEvent) => events.push(structuredClone(event)) }
  const reference: MiraPresentationReference = {
    version: 1, id: 'element-reference', sessionId: created.id,
    workspaceIdentity: miraPresentationWorkspaceIdentity(directory, lstatSync(directory, { bigint: true })),
    sourcePath: 'deck.pptx', sourceFingerprint: 'sha256:' + createHash('sha256').update(source).digest('hex'),
    element: { slideIndex: 1, slidePart: 'ppt/slides/slide2.xml', nodeId: '4', nodeName: 'Title', nodeType: 'shape', text: 'Original title', bounds: { x: 10, y: 20, width: 300, height: 50 }, zIndex: 0 },
    comment: 'Make the selected title clearer', capturedAt: Date.now(),
  }
  const text = serializeMiraPresentationReference(reference).trim(), runs: Promise<unknown>[] = [], gates: ReturnType<typeof deferred>[] = []
  const track = <T,>(promise: Promise<T>) => { void promise.catch(() => {}); runs.push(promise); return promise }
  const run = (input = text) => track(runtime.runMessage(sender, created.id, input, [], selection))
  const submit = (id = 'presentation-input', input = text) => runtime.submitMessage(sender, created.id, id, input, [], selection, false)
  const session = () => database.harness.getSession(created.id)
  const idle = async () => {
    await vi.waitFor(() => {
      expect(runtime.listSessions().find(item => item.id === created.id)?.isRunning).toBe(false)
      expect(runtime.getMessageQueue(created.id).promotingItemId).toBeUndefined()
    }, { timeout: 3000 })
  }
  const view = { root, directory, file, database, runtime, sessionId: created.id, reference, text, contexts, events, sender, steps, runs, gates, track, run, submit, session, idle }
  fixtures.push(view)
  return view
}

describe('presentation references in the real Harness input lifecycle', () => {
  it('delivers exact element context without changing tool permission or authorizing a write', async () => {
    const view = setup()
    await view.run()
    expect(view.contexts[0].at(-1)).toMatchObject({ role: 'user', content: [{ type: 'text', text: view.text }] })
    expect(view.session().permissionMode).toBe('default')
    expect(view.session().toolCalls).toEqual([])
  })

  it('rejects a foreign task owner before queue admission or input-history persistence', async () => {
    const view = setup(), input = serializeMiraPresentationReference({ ...view.reference, sessionId: 'foreign-task' })
    const history = vi.spyOn(view.database.promptHistory, 'append')
    expect(() => view.submit('foreign', input)).toThrow(ownerError)
    await expect(view.run(input)).rejects.toThrow(ownerError)
    expect(view.runtime.getMessageQueue(view.sessionId).items).toEqual([])
    expect(view.session().messages).toEqual([])
    expect(history).not.toHaveBeenCalled()
    expect(view.contexts).toEqual([])
  })

  it('rejects changed source content before first admission', () => {
    const view = setup()
    writeFileSync(view.file, 'Changed source before sending')
    expect(() => view.submit()).toThrow(changedError)
    expect(view.session().messages).toEqual([])
    expect(view.runtime.getMessageQueue(view.sessionId).items).toEqual([])
  })

  it('rejects an identical file under a different current workspace identity', () => {
    const view = setup(), other = join(view.root, 'other-project')
    mkdirSync(other); writeFileSync(join(other, 'deck.pptx'), 'Exact captured local presentation version')
    view.database.harness.updateSession({ ...view.session(), workingDirectory: other })
    expect(() => view.submit()).toThrow(changedError)
    expect(view.session().messages).toEqual([])
  })

  it('rechecks queued input after its original run and preserves idempotent receipt replay', async () => {
    const gate = deferred(), view = setup([{ wait: gate }])
    const first = view.run('Original ordinary request')
    await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    const receipt = view.submit()
    expect(receipt).toHaveProperty('submissionId', 'presentation-input')
    writeFileSync(view.file, 'Changed while the referenced input is queued')
    expect(view.submit()).toHaveProperty('id', 'id' in receipt ? receipt.id : undefined)
    gate.resolve(); await first; await view.idle()
    expect(view.contexts).toHaveLength(1)
    expect(view.session().messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Original ordinary request'])
    expect(view.runtime.getMessageQueue(view.sessionId)).toMatchObject({ paused: 'failed', error: changedError, items: [{ text: view.text }] })
  })

  it('rechecks a file changed during asynchronous memory admission before accepting queued input', async () => {
    const view = setup(), gate = deferred(); view.gates.push(gate)
    ;(view.runtime as any).memoryCoordinator.writes.set(view.sessionId, gate.promise)
    view.submit()
    await vi.waitFor(() => expect(view.session().activeRun).toBeDefined())
    writeFileSync(view.file, 'Changed during the memory wait')
    gate.resolve(); await view.idle()
    expect(view.contexts).toEqual([])
    expect(view.session().messages.filter(message => message.role === 'user')).toEqual([])
    expect(view.runtime.getMessageQueue(view.sessionId)).toMatchObject({ paused: 'failed', error: changedError, items: [{ text: view.text }] })
  })

  it('rechecks after a real UserPromptSubmit process hook changes the source before the first model request', async () => {
    const view = setup(), script = join(view.directory, 'change-source.cjs')
    writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(view.file)}, 'Changed inside the real input hook'); console.log(JSON.stringify({}));`)
    view.database.hooks.save({ scope: 'project', name: 'Change source', event: 'UserPromptSubmit', type: 'process', command: process.execPath, args: [script] }, view.directory)
    await expect(view.run()).rejects.toThrow(changedError)
    expect(view.session().toolCalls.some(tool => tool.tool === 'hook' && tool.status === 'ok')).toBe(true)
    expect(view.contexts).toEqual([])
  })

  it('falls back from steering to an ordinary queued run with its own source revalidation', async () => {
    const gate = deferred(), view = setup([{ wait: gate }, {}]), first = view.run('Original task')
    await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    const receipt = await view.runtime.submitMessage(view.sender, view.sessionId, 'presentation-guide', view.text, [], selection, false, { delivery: 'guide', expectedRunId: view.session().activeRun!.id })
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ requestedDelivery: 'guide', fallbackReason: 'run-unavailable', text: view.text }] } })
    gate.resolve(); await first; await view.idle()
    expect(view.contexts).toHaveLength(2)
    expect(view.session().messages.some(message => message.delivery === 'guide')).toBe(false)
  })

  it('does not let an old reference in conversation history block ordinary follow-up', async () => {
    const view = setup([{}, {}])
    await view.run()
    writeFileSync(view.file, 'Changed after the referenced task completed')
    await view.run('Thanks. Explain the next step without using the presentation.')
    expect(view.contexts).toHaveLength(2)
    expect(view.session().messages.filter(message => message.role === 'user')).toHaveLength(2)
  })

  it('does not revalidate an original reference as new input in later goal iterations', async () => {
    const gate = deferred(), view = setup([
      { wait: gate }, { text: JSON.stringify({ passed: false, reason: 'More work remains', nextAction: 'Finish the next step' }) },
      {}, { text: JSON.stringify({ passed: true, reason: 'Requested work is present' }) },
    ])
    view.database.goals.set(view.sessionId, { objective: 'Finish the task through independent verification' })
    const first = view.run()
    await vi.waitFor(() => expect(view.contexts).toHaveLength(1))
    writeFileSync(view.file, 'Intentionally changed after the first goal request reached the model')
    gate.resolve(); await first
    expect(view.contexts).toHaveLength(4)
    expect(view.database.goals.get(view.sessionId)).toMatchObject({ status: 'complete', iteration: 2 })
  })

  it('accepts a current reference when regenerating or editing the selected message', async () => {
    const view = setup([{}, {}, {}]); await view.run()
    await view.track(view.runtime.rerun(view.sender, view.sessionId, selection))
    const user = view.session().messages.find(message => message.role === 'user')!
    const edited = serializeMiraPresentationReference({ ...view.reference, comment: 'Use a shorter title' }).trim()
    await view.track(view.runtime.editAndRerun(view.sender, view.sessionId, user.id, edited, selection))
    expect(view.contexts).toHaveLength(3)
    expect(view.contexts[2].at(-1)).toMatchObject({ role: 'user', content: [{ type: 'text', text: edited }] })
    expect(view.session().messages.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it('rejects stale regeneration before deleting the completed assistant response', async () => {
    const view = setup(); await view.run()
    const history = structuredClone(view.session().messages)
    writeFileSync(view.file, 'Changed before regeneration')
    await expect(view.track(view.runtime.rerun(view.sender, view.sessionId, selection))).rejects.toThrow(changedError)
    expect(view.session().messages).toEqual(history)
    expect(view.contexts).toHaveLength(1)
  })

  it('rejects an edited foreign reference before truncating the original conversation', async () => {
    const view = setup(); await view.run('Ordinary completed request')
    const history = structuredClone(view.session().messages), user = history.find(message => message.role === 'user')!
    const foreign = serializeMiraPresentationReference({ ...view.reference, sessionId: 'other-task' })
    await expect(view.track(view.runtime.editAndRerun(view.sender, view.sessionId, user.id, foreign, selection))).rejects.toThrow(ownerError)
    expect(view.session().messages).toEqual(history)
    expect(view.contexts).toHaveLength(1)
  })

  it('rejects stale automation input before appending a user message', async () => {
    const view = setup()
    writeFileSync(view.file, 'Changed before automation')
    await expect(view.track(view.runtime.runAutomation(view.sessionId, view.text, selection, 'default'))).rejects.toThrow(changedError)
    expect(view.session().messages).toEqual([])
    expect(view.contexts).toEqual([])
  })
})
