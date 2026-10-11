import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
  function commandFixture(body = 'MIRA_COMMAND_ORIGINAL: $ARGUMENTS') {
    const view = setup(false), packageRoot = join(view.root, 'commands-package')
    mkdirSync(join(packageRoot, '.mira-plugin'), { recursive: true }); mkdirSync(join(packageRoot, 'commands'))
    writeFileSync(join(packageRoot, '.mira-plugin/plugin.json'), JSON.stringify({ name: 'mira-review' }))
    const file = join(packageRoot, 'commands/check.md'); writeFileSync(file, body)
    view.database.plugins.register(packageRoot)
    return { ...view, file }
  }

  it('executes dynamic plugin content through real approvals and stores stdout for later history without rerunning it', async () => {
    const view = commandFixture('Inspect !`printf x >> executions.txt; printf "MIRA_DYNAMIC_RESULT\\n"; printf "MIRA_STDERR_ONLY\\n" >&2` and $ARGUMENTS.')
    vi.mocked((view.runtime as any).tools).mockRestore()
    const effect = join(view.root, 'project/executions.txt')
    expect(view.database.plugins.catalog()).toHaveLength(1)
    expect(existsSync(effect)).toBe(false)
    const run = view.send('/mira-review:check !`touch unexpected.txt`', [])
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    expect(existsSync(effect)).toBe(false)
    expect(view.prompt).not.toHaveBeenCalled()
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    expect(view.database.harness.getSession(view.sessionId).toolCalls).toContainEqual(expect.objectContaining({ id: request.toolCallId, status: 'waiting-confirm', runId: request.runId }))
    view.runtime.resolvePermission(request.requestId, true)
    await run
    expect(readFileSync(effect, 'utf8')).toBe('x')
    expect(existsSync(join(view.root, 'project/unexpected.txt'))).toBe(false)
    expect(view.prompts[0]).toContain('Inspect MIRA_DYNAMIC_RESULT and !`touch unexpected.txt`.')
    expect(view.prompts[0]).not.toContain('MIRA_STDERR_ONLY')
    const stored = view.database.harness.getSession(view.sessionId)
    const command = stored.messages[0].command as any
    expect(command).toMatchObject({ expansionStatus: 'complete', expandedPrompt: view.prompts[0] })
    expect(command.prompt).toContain('!`printf')
    expect(stored.toolCalls).toContainEqual(expect.objectContaining({ tool: 'bash', status: 'ok' }))
    expect(stored.messages.at(-1)?.run?.activities).toContainEqual(expect.objectContaining({ label: '展开插件命令', status: 'completed' }))
    await view.send('Continue from the same result', [])
    expect(readFileSync(effect, 'utf8')).toBe('x')
    expect(JSON.stringify(view.contexts[1])).toContain('Inspect MIRA_DYNAMIC_RESULT')
    expect(JSON.stringify(view.contexts[1])).not.toContain('printf x >> executions.txt')
  })

  it.each(['deny', 'stop', 'disable'])('does not execute a dynamic command when approval is %s', async action => {
    const view = commandFixture('Inspect !`printf x > should-not-exist.txt`.')
    vi.mocked((view.runtime as any).tools).mockRestore()
    const run = view.send('/mira-review:check', []).then(value => ({ value }), error => ({ error }))
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    if (action === 'stop') view.runtime.abort(view.sessionId, request.runId)
    else {
      if (action === 'disable') view.database.plugins.setEnabled('mira-review@local', false)
      view.runtime.resolvePermission(request.requestId, action !== 'deny')
    }
    const result = await run
    expect(existsSync(join(view.root, 'project/should-not-exist.txt'))).toBe(false)
    expect(view.prompt).not.toHaveBeenCalled()
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
    const stored = view.database.harness.getSession(view.sessionId)
    expect((stored.messages[0].command as any).expansionStatus).toBe('failed')
    expect(stored.toolCalls.every(tool => tool.status === 'cancelled' || tool.status === 'failed')).toBe(true)
    if (action === 'stop') expect(result).toMatchObject({ value: { interrupted: true } })
    else expect(result).toHaveProperty('error')
  })

  it('replays an accepted submission once and treats explicit regeneration as a new dynamic execution', async () => {
    const view = commandFixture('Inspect !`printf x >> executions.txt; printf RESULT`.')
    vi.mocked((view.runtime as any).tools).mockRestore()
    view.database.harness.savePermissionConfig({ ...view.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    const submit = () => view.runtime.submitMessage(view.sender, view.sessionId, 'dynamic-once', '/mira-review:check', [], selection, false, { delivery: 'immediate', expectedRunId: null, permissionMode: 'full' })
    await submit()
    await vi.waitFor(() => expect(view.database.harness.getSession(view.sessionId).activeRun).toBeUndefined())
    expect(readFileSync(join(view.root, 'project/executions.txt'), 'utf8')).toBe('x')
    await submit()
    expect(readFileSync(join(view.root, 'project/executions.txt'), 'utf8')).toBe('x')
    await view.runtime.rerun(view.sender, view.sessionId, selection)
    expect(readFileSync(join(view.root, 'project/executions.txt'), 'utf8')).toBe('xx')
    expect(view.prompt).toHaveBeenCalledTimes(2)
  })

  it('rechecks the directory after approval and cancels the tool without running in the replacement scope', async () => {
    const view = commandFixture('Inspect !`printf x > wrong-scope.txt`.')
    vi.mocked((view.runtime as any).tools).mockRestore()
    const run = view.send('/mira-review:check', []).then(value => ({ value }), error => ({ error }))
    await vi.waitFor(() => expect(view.runtime.listPendingPermissions(view.sessionId)).toHaveLength(1))
    const request = view.runtime.listPendingPermissions(view.sessionId)[0]
    const directory = join(view.root, 'other-project'); mkdirSync(directory)
    const session = view.database.harness.getSession(view.sessionId)
    view.database.harness.updateSession({ ...session, workingDirectory: directory })
    view.runtime.resolvePermission(request.requestId, true)
    expect(await run).toHaveProperty('error')
    expect(existsSync(join(directory, 'wrong-scope.txt'))).toBe(false)
    expect(existsSync(join(view.root, 'project/wrong-scope.txt'))).toBe(false)
    expect(view.database.harness.getSession(view.sessionId).toolCalls[0].status).toBe('cancelled')
    expect(view.prompt).not.toHaveBeenCalled()
  })

  it('applies unattended and dangerous-command restrictions to dynamic expansion without a model call', async () => {
    const view = commandFixture('Inspect !`printf x > unattended.txt`.')
    vi.mocked((view.runtime as any).tools).mockRestore()
    await expect(view.runtime.runAutomation(view.sessionId, '/mira-review:check', selection, 'default')).rejects.toThrow('只读')
    expect(existsSync(join(view.root, 'project/unattended.txt'))).toBe(false)
    // The dangerous token is a comment; even a broken guard cannot run a destructive command.
    const blocked = commandFixture('Inspect !`printf x > blocked.txt # rm -rf policy-test`.')
    vi.mocked((blocked.runtime as any).tools).mockRestore()
    blocked.database.harness.savePermissionConfig({ ...blocked.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    await expect(blocked.send('/mira-review:check', [])).rejects.toThrow('危险命令')
    expect(existsSync(join(blocked.root, 'project/blocked.txt'))).toBe(false)
    expect(blocked.prompt).not.toHaveBeenCalled()
    expect(view.runtime.listPendingPermissions(view.sessionId)).toEqual([])
    expect(view.prompt).not.toHaveBeenCalled()
  })

  it('keeps partial expansion on failure and never automatically retries an already accepted queue item', async () => {
    const view = commandFixture('First !`printf x >> executions.txt; printf MIRA_PARTIAL`. Second !`printf MIRA_FAILED >&2; exit 7`.')
    vi.mocked((view.runtime as any).tools).mockRestore()
    view.database.harness.savePermissionConfig({ ...view.database.harness.getPermissionConfig(), globalDefaultMode: 'full' })
    await view.runtime.submitMessage(view.sender, view.sessionId, 'partial-once', '/mira-review:check', [], selection, false, { delivery: 'immediate', expectedRunId: null, permissionMode: 'full' })
    await vi.waitFor(() => expect(view.database.harness.getSession(view.sessionId).activeRun).toBeUndefined())
    const stored = view.database.harness.getSession(view.sessionId)
    expect(readFileSync(join(view.root, 'project/executions.txt'), 'utf8')).toBe('x')
    expect(view.prompt).not.toHaveBeenCalled()
    expect((stored.messages[0].command as any)).toMatchObject({ expansionStatus: 'failed', expandedPrompt: expect.stringContaining('MIRA_PARTIAL') })
    expect(stored.toolCalls.map(tool => tool.status)).toEqual(['ok', 'failed'])
    expect(view.runtime.getMessageQueue(view.sessionId).items).toEqual([])
    await view.send('Explain the failed command without rerunning it', [])
    expect(readFileSync(join(view.root, 'project/executions.txt'), 'utf8')).toBe('x')
    expect(JSON.stringify(view.contexts[0])).toContain('MIRA_PARTIAL')
    expect(JSON.stringify(view.contexts[0])).not.toContain('printf x >> executions.txt')
  })

  it.each(['changed', 'disabled'])('retains queued command input for withdrawal when the plugin is %s before execution', async change => {
    const view = commandFixture()
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    const normalPrompt = view.prompt.getMockImplementation()!
    view.prompt.mockImplementationOnce(async function (this: Agent, input) { await wait; return normalPrompt.call(this, input) })
    const active = view.send('Hold current turn', [])
    await vi.waitFor(() => expect(view.database.harness.getSession(view.sessionId).activeRun).toBeDefined())
    const runId = view.database.harness.getSession(view.sessionId).activeRun!.id
    const submit = () => change === 'disabled'
      ? view.runtime.submitMessage(view.sender, view.sessionId, 'queued-command', '/mira-review:check "saved args"', [], selection, false, { delivery: 'guide', expectedRunId: runId })
      : view.runtime.submitMessage(view.sender, view.sessionId, 'queued-command', '/mira-review:check "saved args"', [], selection, false)
    const receipt = await submit()
    expect(receipt).toMatchObject({ id: expect.any(String) })
    if (change === 'disabled') expect(view.runtime.getMessageQueue(view.sessionId).items[0]).toMatchObject({ fallbackReason: 'plugins', requestedDelivery: 'guide' })
    if (change === 'changed') writeFileSync(view.file, 'MIRA_COMMAND_CHANGED: $ARGUMENTS')
    else view.database.plugins.setEnabled('mira-review@local', false)
    expect(await submit()).toMatchObject({ id: 'id' in receipt ? receipt.id : '' })
    release(); await active
    await vi.waitFor(() => expect(view.runtime.getMessageQueue(view.sessionId).paused).toBe('failed'))
    const queue = view.runtime.getMessageQueue(view.sessionId)
    expect(queue.items[0]).toMatchObject({ text: '/mira-review:check "saved args"', command: { prompt: expect.stringContaining('MIRA_COMMAND_ORIGINAL') } })
    expect(queue.error).toContain(change === 'changed' ? '变化' : '已停用')
    expect(view.prompt).toHaveBeenCalledOnce()
    expect(view.database.harness.getSession(view.sessionId).messages.filter(message => message.role === 'user')).toHaveLength(1)
    expect(view.runtime.withdrawMessage(view.sessionId, queue.items[0].id).item.text).toBe('/mira-review:check "saved args"')
  })

  it('expands automation commands and prevents noninteractive-only violations before writing messages', async () => {
    const view = commandFixture('---\ndisable-noninteractive: true\n---\nMIRA_COMMAND_ORIGINAL: $ARGUMENTS')
    await expect(view.runtime.runAutomation(view.sessionId, '/mira-review:check unattended', selection, 'default')).rejects.toThrow('无人值守')
    expect(view.database.harness.getSession(view.sessionId).messages).toEqual([])
    writeFileSync(view.file, 'MIRA_COMMAND_ORIGINAL: $ARGUMENTS')
    await view.runtime.runAutomation(view.sessionId, '/mira-review:check unattended', selection, 'default')
    expect(view.prompts[0]).toContain('MIRA_COMMAND_ORIGINAL: unattended')
    expect(view.database.harness.getSession(view.sessionId).messages[0].content).toBe('/mira-review:check unattended')
  })

  it('rejects a skill-dependent command in planning mode before creating history or running a model', async () => {
    const view = commandFixture('---\nskills: [review]\n---\nReview actual behavior.')
    const plugin = join(view.root, 'commands-package')
    mkdirSync(join(plugin, 'skills/review'), { recursive: true })
    writeFileSync(join(plugin, 'skills/review/SKILL.md'), '---\nname: review\ndescription: Review behavior\n---\nCheck actual behavior.')
    view.database.plugins.register(plugin)
    await expect(view.runtime.runMessage(view.sender, view.sessionId, '/mira-review:check', [], selection, true)).rejects.toThrow('计划模式')
    expect(view.prompt).not.toHaveBeenCalled()
    expect(view.database.harness.getSession(view.sessionId).messages).toEqual([])
  })

  it('retries the same command, re-resolves edits and clears expansion when an edited message becomes plain text', async () => {
    const view = commandFixture()
    await view.send('/mira-review:check first', [])
    const user = view.database.harness.getSession(view.sessionId).messages[0]
    await view.runtime.rerun(view.sender, view.sessionId, selection)
    expect(view.prompts[1]).toBe(view.prompts[0])
    await view.runtime.editAndRerun(view.sender, view.sessionId, user.id, '/mira-review:check changed args', selection)
    expect(view.prompts[2]).toContain('MIRA_COMMAND_ORIGINAL: changed args')
    writeFileSync(view.file, 'MIRA_COMMAND_CHANGED')
    const saved = view.database.harness.getSession(view.sessionId)
    await expect(view.runtime.rerun(view.sender, view.sessionId, selection)).rejects.toThrow('变化')
    expect(view.database.harness.getSession(view.sessionId)).toEqual(saved)
    await view.runtime.editAndRerun(view.sender, view.sessionId, user.id, 'Plain edited instruction', selection)
    expect(view.prompts[3]).toBe('Plain edited instruction')
    expect(view.database.harness.getSession(view.sessionId).messages[0]).not.toHaveProperty('command')
  })

  it('ignores a renderer-supplied expansion and rejects malformed arguments before admitting any message', async () => {
    const view = commandFixture()
    expect(() => view.runtime.submitMessage(view.sender, view.sessionId, 'bad-command', '/mira-review:check "unclosed', [], selection, false)).toThrow('引号')
    expect(view.database.harness.getSession(view.sessionId).messages).toEqual([])
    await view.runtime.submitMessage(view.sender, view.sessionId, 'owned-command', '/mira-review:check real args', [], selection, false, { delivery: 'immediate', expectedRunId: null, command: { prompt: 'RENDERER_INJECTED' } } as never)
    await vi.waitFor(() => expect(view.database.harness.getSession(view.sessionId).activeRun).toBeUndefined())
    expect(view.prompts[0]).toContain('MIRA_COMMAND_ORIGINAL: real args')
    expect(view.prompts[0]).not.toContain('RENDERER_INJECTED')
  })
  it('expands a plugin command for actual model input while preserving its short history and attachments across later turns and side conversations', async () => {
    const view = setup(), packageRoot = join(view.root, 'command-package')
    mkdirSync(join(packageRoot, '.mira-plugin'), { recursive: true }); mkdirSync(join(packageRoot, 'commands'))
    writeFileSync(join(packageRoot, '.mira-plugin/plugin.json'), JSON.stringify({ name: 'mira-review' }))
    writeFileSync(join(packageRoot, 'commands/check.md'), '---\ndescription: Review changes\nargument-hint: "[target]"\n---\nMIRA_REAL_COMMAND: review $ARGUMENTS; first=$1.')
    view.database.plugins.register(packageRoot)
    await view.send('/mira-review:check "two words"', [image, note])
    expect(JSON.stringify(view.prompts[0])).toContain('MIRA_REAL_COMMAND: review')
    expect(JSON.stringify(view.prompts[0])).toContain('first=two words.')
    expect(JSON.stringify(view.prompts[0])).toContain(note.content)
    expect(view.prompts[0].content).toContainEqual({ type: 'image', data: image.content, mimeType: image.mediaType })
    const first = view.database.harness.getSession(view.sessionId).messages.find(message => message.role === 'user')!
    expect(first.content).toBe('/mira-review:check "two words"')
    expect(first.command?.prompt).toContain('MIRA_REAL_COMMAND')
    writeFileSync(join(packageRoot, 'commands/check.md'), 'NEW_COMMAND_BODY')
    await view.send('Continue from the same command result', [])
    expect(JSON.stringify(view.contexts[1])).toContain('MIRA_REAL_COMMAND')
    expect(JSON.stringify(view.contexts[1])).not.toContain('NEW_COMMAND_BODY')
    const child = view.database.harness.createSideConversation(view.sessionId)
    expect(child.messages.find(message => message.content === first.content)?.command).toEqual(first.command)
  })

  it('freezes plugin ownership across reload and lazily reads real instructions without granting capabilities', async () => {
    const view = setup(false), packageRoot = join(view.root, 'plugin-package')
    mkdirSync(join(packageRoot, '.claude-plugin'), { recursive: true }); mkdirSync(join(packageRoot, 'skills/review'), { recursive: true })
    writeFileSync(join(packageRoot, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'review-kit', description: 'Reviews code' }))
    writeFileSync(join(packageRoot, 'skills/review/SKILL.md'), '---\nname: review\ndescription: Reviews regressions\n---\nMIRA_PLUGIN_LAZY_INSTRUCTIONS')
    view.database.plugins.register(packageRoot)
    await view.send('[@review-kit](plugin://review-kit@local)', [])
    const state = (view.prompt.mock.contexts[0] as Agent).state
    expect(state.systemPrompt).toContain('<plugin_reference>')
    expect(state.systemPrompt).toContain('review-kit:review')
    expect(state.systemPrompt).not.toContain('MIRA_PLUGIN_LAZY_INSTRUCTIONS')
    const frozen = view.database.harness.getSession(view.sessionId).pluginCatalog!
    expect(view.runtime.getSession(view.sessionId)).not.toHaveProperty('pluginCatalog')
    expect(frozen[0]).toMatchObject({ id: 'review-kit@local', root: realpathSync(packageRoot) })
    const registered = (HarnessRuntime.prototype as any).tools.call(view.runtime, view.sender, view.sessionId)
    const reader = registered.tools.find((tool: any) => tool.name === 'load_plugin_skill')
    expect((await reader.execute('call', { name: 'review-kit:review' })).content[0].text).toContain('MIRA_PLUGIN_LAZY_INSTRUCTIONS')
    expect(registered.descriptors.get('load_plugin_skill').risk).toBe('read')
    view.database.plugins.setEnabled('review-kit@local', false)
    await expect(reader.execute('call', { name: 'review-kit:review' })).rejects.toThrow('已停用')
    await view.send('[@review-kit](plugin://review-kit@local)', [])
    expect((view.prompt.mock.contexts[1] as Agent).state.systemPrompt).not.toContain('<plugin_reference>')
    expect(view.database.harness.getSession(view.sessionId).pluginCatalog).toEqual(frozen)
  })
  it('keeps plain text input out of prior history on consecutive sends', async () => {
    const view = setup(false)
    await view.send('First', [])
    await view.send('Second', [])
    expect(view.prompts).toEqual(['First', 'Second'])
    expect(view.contexts[0]).toEqual([])
    expect(view.contexts[1].filter(message => message.role === 'user').map(message => message.content)).toEqual(['First'])
  })

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
    expect(view.prompts).toEqual(['\n\n[引用文件：notes.md]\n```\nExisting UTF-8 text attachment\n```'])
    expect(view.contexts).toEqual([[]])
    expect(view.database.harness.getSession(view.sessionId).messages[0]).toMatchObject({ content: '', attachments: [note] })
  })

  it.each(['send', 'rerun', 'edit'] as const)('sends the current text and file context exactly once during %s', async action => {
    const view = setup(false)
    await view.send('Earlier instruction', [])
    const text = '分析网页\n\n网页元素快照：\n```json\n{"selector":"#first"}\n```'
    await view.send(text, [note])
    if (action === 'rerun') await view.runtime.rerun(view.sender, view.sessionId, selection)
    if (action === 'edit') {
      const current = view.database.harness.getSession(view.sessionId).messages.filter(message => message.role === 'user').at(-1)!
      await view.runtime.editAndRerun(view.sender, view.sessionId, current.id, text + '\n继续分析', selection)
    }
    const history = view.contexts.at(-1)!, prompt = view.prompts.at(-1)
    expect(prompt).toBe(text + (action === 'edit' ? '\n继续分析' : '') + '\n\n[引用文件：notes.md]\n```\nExisting UTF-8 text attachment\n```')
    expect(history.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Earlier instruction'])
    expect(JSON.stringify(history)).not.toContain('网页元素快照')
    expect(JSON.stringify(history)).not.toContain(note.content)
    expect(view.database.harness.getSession(view.sessionId).messages.filter(message => message.role === 'user')).toHaveLength(2)
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

  it('manually summarizes frozen older images while retaining the latest turn and message bytes', async () => {
    const view = setup()
    view.database.harness.addMessage(view.sessionId, 'user', 'Earlier visual question', [image])
    view.database.harness.addMessage(view.sessionId, 'assistant', 'Earlier visual response')
    view.database.harness.addMessage(view.sessionId, 'user', 'Recent question')
    const before = view.database.harness.addMessage(view.sessionId, 'assistant', 'Recent response')
    const models = { completeSimple: vi.fn(async () => ({ role: 'assistant', content: [{ type: 'text', text: 'Visual summary' }], stopReason: 'stop', usage: { input: 8, output: 4, cacheRead: 0, cacheWrite: 0, totalTokens: 12 } })) }
    const saved = await (view.runtime as any).compactContext(view.sender, before, { id: 'fixture', provider: 'custom', api: 'openai-completions', contextWindow: 100000, maxTokens: 4000 }, models, new AbortController(), 'off', [], vi.fn(), undefined, { manual: true })
    expect(saved.messages).toEqual(before.messages)
    expect(saved.context).toMatchObject({ summary: 'Visual summary', compactedThroughMessageId: before.messages[1].id })
    const blocks = (models.completeSimple.mock.calls as any)[0][1].messages[0].content
    expect(blocks).toContainEqual({ type: 'image', data: image.content, mimeType: image.mediaType })
    expect(JSON.stringify(blocks)).not.toContain('Recent question')
    expect(JSON.stringify(view.sender.send.mock.calls)).not.toContain(image.content)
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
