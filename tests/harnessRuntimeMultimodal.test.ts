import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@earendil-works/pi-agent-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformDatabase } from '../electron/storage/database'
import { HarnessRuntime } from '../electron/services/harnessRuntime'
import type { HarnessMessageAttachment } from '../src/config/harness'

const roots: string[] = [], databases: PlatformDatabase[] = []
afterEach(() => {
  vi.restoreAllMocks()
  databases.splice(0).forEach(database => database.close())
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+sMioAAAAASUVORK5CYII=', 'base64')
const image: HarnessMessageAttachment = { path: 'screen.png', name: 'screen.png', content: png.toString('base64'), mediaType: 'image/png', size: png.length }
const note: HarnessMessageAttachment = { path: 'notes.md', name: 'notes.md', content: 'Existing UTF-8 text attachment' }
const selection = { providerId: 'provider', modelId: 'fixture' }
const metadataImage = () => expect.objectContaining({ path: expect.stringMatching(/^mira-attachment:[a-f0-9-]{36}$/), name: image.name, content: '', mediaType: image.mediaType, size: png.length })

function setup(multimodal = true) {
  const root = mkdtempSync(join(tmpdir(), 'mira-multimodal-runtime-')); roots.push(root)
  const database = new PlatformDatabase(root); databases.push(database)
  const directory = join(root, 'project'); mkdirSync(directory)
  const project = database.harness.createProject(directory), session = database.harness.createSession(project.id)
  database.harness.renameSession(session.id, 'Multimodal fixture')
  const configure = (support: boolean, modelId = selection.modelId) => database.models.save({ id: selection.providerId, name: 'Fixture', endpoint: 'http://127.0.0.1:1/v1', authMode: 'none', enabled: true, models: [{ id: modelId, enabled: true, reasoning: false, contextWindow: 100000, multimodal: support }] })
  configure(multimodal)
  const runtime = new HarnessRuntime(database, { getTools: () => [] } as any)
  vi.spyOn(runtime as any, 'tools').mockReturnValue({ tools: [], descriptors: new Map(), cancelPending: vi.fn() })
  const resolveAttachments = vi.spyOn(database.harness, 'resolveMessageAttachments').mockImplementation((_id, references = []) => references.map(reference => structuredClone(reference.path === image.path ? image : note)))
  let notify!: (event: any) => void
  vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(listener => { notify = event => { void listener(event, new AbortController().signal) }; return () => {} })
  const contexts: any[][] = [], prompts: any[] = []
  const prompt = vi.spyOn(Agent.prototype, 'prompt').mockImplementation(async function (this: Agent, input) {
    contexts.push(structuredClone(this.state.messages)); prompts.push(structuredClone(input))
    notify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Fixture reply' } })
  })
  const sender: any = { isDestroyed: () => false, send: vi.fn() }
  const send = (text = '', attachments: HarnessMessageAttachment[] = [image]) => runtime.runMessage(sender, session.id, text, attachments.map(({ path, name }) => ({ path, name })), selection)
  return { root, database, runtime, sessionId: session.id, configure, resolveAttachments, sender, send, prompt, contexts, prompts }
}

describe('Harness multimodal message ownership', () => {
  it('sends an image-only message once as real SDK image blocks and keeps its empty persisted text', async () => {
    const view = setup()
    await view.send()
    expect(view.prompts).toEqual([{ role: 'user', content: [{ type: 'text', text: '[图片：screen.png]' }, { type: 'image', data: image.content, mimeType: 'image/png' }], timestamp: expect.any(Number) }])
    expect(view.contexts).toEqual([[]])
    const saved = view.database.harness.getSession(view.sessionId).messages[0]
    expect(saved).toMatchObject({ role: 'user', content: '', attachments: [metadataImage()] })
    expect(JSON.stringify(view.sender.send.mock.calls)).not.toContain(image.content)
    view.database.close(); databases.splice(databases.indexOf(view.database), 1)
    const reopened = new PlatformDatabase(view.root); databases.push(reopened)
    expect(reopened.harness.getSession(view.sessionId).messages[0]).toEqual(saved)
    expect(reopened.harness.hydrateMessageAttachments(view.sessionId, saved).attachments?.[0].content).toBe(image.content)
  })

  it('keeps mixed text attachments compatible while replaying previous images as typed model history', async () => {
    const view = setup()
    await view.send('Explain this screen', [image, note])
    expect(view.prompts[0].content).toEqual([
      { type: 'text', text: 'Explain this screen\n\n[引用文件：notes.md]\n```\nExisting UTF-8 text attachment\n```' },
      { type: 'text', text: '[图片：screen.png]' }, { type: 'image', data: image.content, mimeType: 'image/png' },
    ])
    expect(view.database.harness.getSession(view.sessionId).messages[0].attachments).toEqual([metadataImage(), note])
    await view.send('Continue', [])
    expect(view.prompts[1]).toBe('Continue')
    expect(view.contexts[1][0].content).toEqual(view.prompts[0].content)
    expect(view.contexts[1][0].content.filter((block: any) => block.type === 'image')).toHaveLength(1)
    expect(view.database.harness.getSession(view.sessionId).messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Explain this screen', 'Continue'])
  })

  it('uses the current attachment-only request instead of a previous user prompt', async () => {
    const view = setup()
    await view.send('Old instruction', [])
    await view.send('', [image])
    expect(view.prompts[1].content.some((block: any) => block.type === 'text' && block.text.includes('Old instruction'))).toBe(false)
    expect(view.prompts[1].content.at(-1)).toEqual({ type: 'image', data: image.content, mimeType: 'image/png' })
    expect(view.database.harness.getSession(view.sessionId).messages.filter(message => message.role === 'user').at(-1)?.content).toBe('')
  })

  it('accepts a text-file-only request while preserving the old UTF-8 model context format', async () => {
    const view = setup(false)
    await view.send('', [note])
    expect(view.prompts).toEqual(['notes.md'])
    expect(view.contexts[0][0].content).toBe('\n\n[引用文件：notes.md]\n```\nExisting UTF-8 text attachment\n```')
    expect(view.database.harness.getSession(view.sessionId).messages[0]).toMatchObject({ content: '', attachments: [note] })
  })

  it('rejects an empty request without reading files, publishing a run, or committing a message', async () => {
    const view = setup()
    await expect(view.send(' ', [])).rejects.toThrow('请输入消息或添加附件')
    expect(view.resolveAttachments).not.toHaveBeenCalled(); expect(view.prompt).not.toHaveBeenCalled()
    expect(view.sender.send).not.toHaveBeenCalled()
    expect(view.database.harness.getSession(view.sessionId).messages).toEqual([])
  })

  it.each(['queued', 'immediate'] as const)('allows the same unaccepted %s image submission to retry with a supported model', async delivery => {
    const view = setup(false), references = [{ path: image.path, name: image.name }]
    const before = view.runtime.getMessageQueue(view.sessionId)
    const submit = (model: typeof selection) => delivery === 'immediate'
      ? view.runtime.submitMessage(view.sender, view.sessionId, 'image-only', '', references, model, false, { delivery: 'immediate', expectedRunId: null })
      : view.runtime.submitMessage(view.sender, view.sessionId, 'image-only', '', references, model, false)
    expect(await submit(selection)).toEqual({ retryRequired: true, reason: 'image-model-unsupported', queue: before })
    expect(view.runtime.getMessageQueue(view.sessionId)).toEqual(before)
    expect(view.database.harness.getSession(view.sessionId).messages).toEqual([])
    expect(view.sender.send).not.toHaveBeenCalled(); expect(view.prompt).not.toHaveBeenCalled()

    const supported = { ...selection, modelId: 'vision' }
    view.configure(true, supported.modelId)
    expect(await submit(supported)).toMatchObject({ submissionId: 'image-only', id: expect.any(String) })
    await vi.waitFor(() => expect(view.database.harness.getSession(view.sessionId).activeRun).toBeUndefined())
    expect(view.prompt).toHaveBeenCalledOnce()
    expect(view.prompts[0].content.at(-1)).toEqual({ type: 'image', data: image.content, mimeType: 'image/png' })
    expect(view.database.harness.getSession(view.sessionId).messages.filter(message => message.role === 'user')).toEqual([expect.objectContaining({ content: '', attachments: [metadataImage()] })])
  })

  it('requires a supported model before accepting plain text that will replay image history', async () => {
    const view = setup(); await view.send('Current image')
    const saved = view.database.harness.getSession(view.sessionId), before = view.runtime.getMessageQueue(view.sessionId)
    view.configure(false); view.sender.send.mockClear(); view.prompt.mockClear()
    expect(view.runtime.submitMessage(view.sender, view.sessionId, 'history-image', 'Next', [], selection, false)).toEqual({ retryRequired: true, reason: 'image-model-unsupported', queue: before })
    expect(view.runtime.getMessageQueue(view.sessionId)).toEqual(before)
    expect(view.database.harness.getSession(view.sessionId)).toEqual(saved)
    expect(view.sender.send).not.toHaveBeenCalled(); expect(view.prompt).not.toHaveBeenCalled()
  })

  it.each(['send', 'rerun', 'edit'] as const)('rejects a text-only model switch on image history before %s changes stored messages', async action => {
    const view = setup(); await view.send('Current image')
    const saved = view.database.harness.getSession(view.sessionId); view.configure(false)
    view.sender.send.mockClear(); view.prompt.mockClear()
    const operation = action === 'send' ? view.send('Next', []) : action === 'rerun' ? view.runtime.rerun(view.sender, view.sessionId, selection) : view.runtime.editAndRerun(view.sender, view.sessionId, saved.messages[0].id, 'Changed', selection)
    await expect(operation).rejects.toThrow('所选模型不支持图片输入')
    expect(view.database.harness.getSession(view.sessionId)).toEqual(saved)
    expect(view.sender.send).not.toHaveBeenCalled(); expect(view.prompt).not.toHaveBeenCalled()
  })

  it('reruns an image-only stored request without losing the image or creating another user entry', async () => {
    const view = setup(); await view.send()
    await view.runtime.rerun(view.sender, view.sessionId, selection)
    expect(view.prompts[1]).toEqual(view.prompts[0])
    expect(view.contexts[1]).toEqual([])
    expect(view.database.harness.getSession(view.sessionId).messages.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it('admits an image-only immediate submission without converting its persisted content to placeholder text', async () => {
    const view = setup()
    const receipt = await view.runtime.submitMessage(view.sender, view.sessionId, 'immediate-image', '', [{ path: image.path, name: image.name }], selection, false, { delivery: 'immediate', expectedRunId: null })
    expect(receipt).toMatchObject({ submissionId: 'immediate-image' })
    await vi.waitFor(() => expect(view.prompt).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(view.database.harness.getSession(view.sessionId).activeRun).toBeUndefined())
    expect(view.prompts[0].content.at(-1)).toEqual({ type: 'image', data: image.content, mimeType: 'image/png' })
    expect(view.database.harness.getSession(view.sessionId).messages[0]).toMatchObject({ content: '', attachments: [metadataImage()] })
  })

  it('uses an attachment name for internal planning while sending the real image with an empty user body', async () => {
    const view = setup()
    view.prompt.mockImplementationOnce(async () => {
      const session = view.database.harness.getSession(view.sessionId)
      view.database.harness.setPendingInteraction(view.sessionId, { id: 'review', kind: 'plan-review', status: 'waiting', planId: session.activePlan!.id, createdAt: 1 })
    })
    await view.runtime.runMessage(view.sender, view.sessionId, '', [{ path: image.path, name: image.name }], selection, true)
    const [input] = view.prompt.mock.calls[0] as unknown as [any]
    expect(input.content.at(-1)).toEqual({ type: 'image', data: image.content, mimeType: 'image/png' })
    expect(view.database.harness.getSession(view.sessionId)).toMatchObject({ activePlan: { request: 'screen.png' }, messages: [expect.objectContaining({ content: '', attachments: [metadataImage()] }), expect.anything()] })
  })

  it('passes actual older images to the SDK summary request and counts pending image-only input', async () => {
    const view = setup()
    view.database.harness.addMessage(view.sessionId, 'user', 'Earlier request '.repeat(9000), [image])
    view.database.harness.addMessage(view.sessionId, 'assistant', 'Earlier response '.repeat(9000))
    const session = view.database.harness.addMessage(view.sessionId, 'user', 'Retain this recent question')
    expect(session.messages[0].attachments).toEqual([metadataImage()])
    const hydrate = vi.spyOn(view.database.harness, 'hydrateMessageAttachments')
    const completeSimple = vi.fn(async () => ({ role: 'assistant', content: [{ type: 'text', text: 'Older image context retained' }], stopReason: 'stop', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }))
    const models = { completeSimple }, model = { id: 'fixture', api: 'openai-completions', provider: 'mira-openai', contextWindow: 10000, maxTokens: 8192 }
    const saved = await (view.runtime as any).compactContext(view.sender, session, model, models, new AbortController(), 'off', [], vi.fn(), { text: '', attachments: [image] })
    expect(completeSimple).toHaveBeenCalledOnce()
    const [_model, context, options] = (completeSimple.mock.calls[0] as unknown as [unknown, any, any])
    expect(context.messages[0].content.filter((block: any) => block.type === 'image')).toEqual([{ type: 'image', data: image.content, mimeType: 'image/png' }])
    expect(context.messages[0].content.some((block: any) => block.type === 'text' && block.text.includes('Older') || block.type === 'text' && block.text.includes('<conversation>'))).toBe(true)
    expect(context.messages[0].content.some((block: any) => block.type === 'text' && block.text.includes(`消息 ${session.messages[0].id} 的图片`))).toBe(true)
    expect(options).toMatchObject({ signal: expect.any(AbortSignal), cacheRetention: 'none', maxTokens: 4000 })
    expect(saved.context).toMatchObject({ summary: 'Older image context retained', compactedThroughMessageId: session.messages[1].id })
    expect(saved.context.usage.usedTokens).toBeGreaterThanOrEqual(1200)
    expect(hydrate).toHaveBeenCalledWith(view.sessionId, expect.objectContaining({ id: session.messages[0].id, attachments: [metadataImage()] }))
    expect(hydrate.mock.calls.map(([, message]) => message.id)).toEqual([session.messages[0].id])
    expect(view.database.harness.getSession(view.sessionId).messages[0].attachments).toEqual(session.messages[0].attachments)
    expect(JSON.stringify(view.sender.send.mock.calls)).not.toContain(image.content)
  })

  it('freezes image bytes for an attachment-only queued request and preserves guide fallback', async () => {
    const view = setup(), running = (view.runtime as any).runCoordinator.begin(view.sessionId, 'existing-run')
    const frozen = { ...image }, resolve = view.resolveAttachments.mockReturnValue([frozen])
    const receipt = view.runtime.submitMessage(view.sender, view.sessionId, 'queued-image', '', [{ path: image.path, name: image.name }], selection, false, { delivery: 'guide', expectedRunId: 'existing-run' })
    expect(receipt).toMatchObject({ delivery: 'queue', queue: { items: [{ text: '', fallbackReason: 'attachments', references: [{ path: image.path, name: image.name }] }] } })
    frozen.content = 'Changed'; resolve.mockImplementation(() => { throw new Error('Source deleted') })
    expect(running.signal.aborted).toBe(false)
    await (view.runtime as any).runCoordinator.finish(view.sender, view.sessionId, 'existing-run')
    ;(view.runtime as any).messageQueue.onRunSettled(view.sessionId, 'completed')
    await vi.waitFor(() => expect(view.prompt).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(view.database.harness.getSession(view.sessionId).activeRun).toBeUndefined())
    expect(resolve).toHaveBeenCalledOnce()
    expect(view.prompts[0].content.at(-1)).toEqual({ type: 'image', data: image.content, mimeType: 'image/png' })
    expect(view.database.harness.getSession(view.sessionId).messages[0]).toMatchObject({ content: '', attachments: [metadataImage()] })
  })
})
