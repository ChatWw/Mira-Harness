import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlatformDatabase } from '../electron/storage/database'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import type { HarnessMessageQueueSnapshot, HarnessMessageSubmissionReceipt, HarnessMessageWithdrawal } from '../src/config/harness'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'

describe('clarification answer bridge', () => {
  const base = { sessionId: 's', interactionId: 'question', selection: { providerId: 'p', modelId: 'm' } }
  it.each(['', '  ', '补充说明\n保留格式'])('accepts an explicitly edited custom draft %j without removing selected options', custom => {
    const answers = [{ id: 'q', selected: ['资料', '代码'], custom }]
    expect(parseFirstPartyHarnessCall('interaction.answer', { ...base, answers })).toEqual({ method: 'interaction.answer', ...base, answers })
  })
  it.each([null, 42, '\0', 'x'.repeat(20_001)])('rejects an invalid custom answer %j', custom => {
    expect(() => parseFirstPartyHarnessCall('interaction.answer', { ...base, answers: [{ id: 'q', selected: ['资料'], custom }] })).toThrow('自定义回答无效')
  })
})
describe('side first-input authority parser', () => {
  const input = { submissionId: 'side-first', text: '旁路问题', selection: { providerId: 'p', modelId: 'm', thinkingLevel: 'high' as const }, permissionMode: 'default' as const }
  it('captures bounded input while stripping credentials and injected planning or references', () => {
    const params = { parentId: 'parent', input: { ...input, planning: true, references: [{ path: 'fake' }], selection: { ...input.selection, apiKey: 'secret' } } }
    expect(parseFirstPartyHarnessCall('session.create-side', params)).toEqual({ method: 'session.create-side', parentId: 'parent', input })
  })
  it.each([null, [], {}, { ...input, text: '' }, { ...input, text: '\0' }, { ...input, text: 'x'.repeat(100_001) }, { ...input, submissionId: '' }, { ...input, selection: {} }, { ...input, permissionMode: 'full-access' }])('rejects malformed first input %j', value => {
    expect(() => parseFirstPartyHarnessCall('session.create-side', { parentId: 'parent', input: value })).toThrow()
  })
})
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'
import type { PlatformIpcDependencies } from '../electron/ipc/platformIpc'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => electron.handlers.set(channel, handler) }, BrowserWindow: {}, dialog: {}, shell: {} }))
import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'

const manifest = firstPartyAppManifests.find(app => app.appId === 'mira-harness')!
const selection = { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' as const }
const submit = { sessionId: 'session', submissionId: 'submission', text: 'continue with the selected context', references: [{ path: '/private/context.md', name: 'context.md' }], selection, planning: false }
const queue: HarnessMessageQueueSnapshot = { sessionId: 'session', revision: 3, items: [{ id: 'queued', submissionId: 'submission', sessionId: 'session', text: submit.text, references: submit.references, selection, planning: false, permissionMode: 'default', createdAt: 1 }], paused: 'stopped' }
const receipt: HarnessMessageSubmissionReceipt = { id: 'queued', submissionId: 'submission', queue }
const withdrawal: HarnessMessageWithdrawal = { item: queue.items[0], queue: { sessionId: 'session', revision: 4, items: [] } }
const calls = [
  { method: 'message.submit', params: submit, value: receipt },
  { method: 'queue.list', params: { sessionId: 'session' }, value: queue },
  { method: 'queue.withdraw', params: { sessionId: 'session', itemId: 'queued' }, value: withdrawal },
  { method: 'queue.resume', params: { sessionId: 'session' }, value: queue },
  { method: 'queue.reorder', params: { sessionId: 'session', itemId: 'queued', beforeItemId: null }, value: queue },
  { method: 'queue.send-now', params: { sessionId: 'session', itemId: 'queued', expectedRunId: 'run' }, value: queue },
] as const

function bridge(invokeFirstPartyHarness = vi.fn(async (_grant: string, _method: string, _params: unknown) => queue)) {
  const options = { manifest: { ...manifest }, grantId: 'host-held-grant', api: { invokeFirstPartyHarness } as never, context: {} as never, route: '/workspace/harness-react', navigate: vi.fn() }
  const request = (method: string, params: unknown) => handleFirstPartyRequest(options, { type: 'mira:request', id: '1', method: `harness.${method}`, params })
  return { options, request, invokeFirstPartyHarness }
}

function ipcFixture(firstPartyManifests = firstPartyAppManifests) {
  const runtime = { submitMessage: vi.fn(() => receipt), getMessageQueue: vi.fn(() => queue), withdrawMessage: vi.fn(() => withdrawal), resumeMessageQueue: vi.fn(() => queue), reorderMessageQueue: vi.fn(() => queue), sendQueuedMessageNow: vi.fn(() => queue), runMessage: vi.fn() }
  registerPlatformIpcHandlers({ database: {}, localMicroAppServer: {}, harnessRuntime: runtime, firstPartyManifests } as unknown as PlatformIpcDependencies)
  const sender = Object.assign(new EventEmitter(), { id: 1 })
  const invoke = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({ sender }, ...args)
  const grantId = invoke('platform:create-first-party-grant', 'mira-harness') as string
  return { runtime, sender, invoke, grantId }
}

describe('side first-input IPC admission', () => {
  beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })
  const input = { submissionId: 'side-first', text: '解释已完成的思路', selection, permissionMode: 'default' as const }
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'mira-side-input-ipc-')), database = new PlatformDatabase(root)
    const directory = join(root, 'project'); mkdirSync(directory)
    const project = database.harness.createProject(directory), parent = database.harness.createSession(project.id)
    const runtime = { assertMessageSelection: vi.fn(), submitMessage: vi.fn(() => receipt), getSession: vi.fn((id: string) => database.harness.getSession(id)) }
    registerPlatformIpcHandlers({ database, localMicroAppServer: {}, harnessRuntime: runtime } as unknown as PlatformIpcDependencies)
    const sender = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false })
    const invoke = (grant: string, params: unknown) => electron.handlers.get('platform:first-party-harness')!({ sender }, grant, 'session.create-side', params)
    const grantId = electron.handlers.get('platform:create-first-party-grant')!({ sender }, 'mira-harness') as string
    return { database, runtime, sender, invoke, grantId, parent, close: () => { database.close(); rmSync(root, { recursive: true, force: true }) } }
  }
  it('retains existing workbench-only capability and strips extra first-input privileges at the Vue bridge', async () => {
    const view = bridge(vi.fn(async () => ({ id: 'child' })))
    await expect(view.request('session.create-side', { parentId: 'parent', input: { ...input, selection: { ...selection, apiKey: 'secret' }, references: ['injected'], planning: true } })).resolves.toEqual({ id: 'child' })
    expect(view.invokeFirstPartyHarness).toHaveBeenCalledExactlyOnceWith('host-held-grant', 'session.create-side', { parentId: 'parent', input })
    view.options.manifest.capabilities = []
    await expect(view.request('session.create-side', { parentId: 'parent', input })).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
    expect(view.invokeFirstPartyHarness).toHaveBeenCalledOnce()
  })
  it('passes actual sender and captured input once, reuses child on retry and preserves legacy empty creation', async () => {
    const view = fixture()
    try {
      const child: any = await view.invoke(view.grantId, { parentId: view.parent.id, input })
      expect(view.runtime.submitMessage).toHaveBeenLastCalledWith(view.sender, child.id, input.submissionId, input.text, [], selection, false, { permissionMode: 'default' })
      expect(view.runtime.getSession).toHaveBeenLastCalledWith(child.id)
      view.runtime.assertMessageSelection.mockImplementation(() => { throw new Error('模型已停用') })
      const repeated: any = await view.invoke(view.grantId, { parentId: view.parent.id, input })
      expect(repeated.id).toBe(child.id); expect(view.runtime.assertMessageSelection).toHaveBeenCalledOnce()
      expect(view.database.harness.sideConversationIds(view.parent.id)).toEqual([child.id])
      const legacy: any = view.invoke(view.grantId, { parentId: view.parent.id })
      expect(legacy.id).not.toBe(child.id); expect(view.runtime.submitMessage).toHaveBeenCalledTimes(2)
      expect(() => view.invoke('forged', { parentId: view.parent.id, input })).toThrow('授权无效')
    } finally { view.close() }
  })
  it('rejects invalid model and disabled permissions before reserving any child', () => {
    const view = fixture()
    try {
      view.runtime.assertMessageSelection.mockImplementationOnce(() => { throw new Error('当前 Agent 模型不可用，请检查 Provider 配置') })
      expect(() => view.invoke(view.grantId, { parentId: view.parent.id, input })).toThrow('模型不可用')
      expect(view.database.harness.sideConversationIds(view.parent.id)).toEqual([])
      view.database.harness.savePermissionConfig({ ...view.database.harness.getPermissionConfig(), fullAccessEnabled: false })
      expect(() => view.invoke(view.grantId, { parentId: view.parent.id, input: { ...input, permissionMode: 'full' } })).toThrow('权限档位已停用')
      expect(view.database.harness.sideConversationIds(view.parent.id)).toEqual([])
      expect(view.runtime.submitMessage).not.toHaveBeenCalled()
    } finally { view.close() }
  })
  it('retains allocated child after uncertain admission and does not return it before acceptance', async () => {
    const view = fixture()
    try {
      view.runtime.submitMessage.mockImplementationOnce(() => { throw new Error('临时接收失败') })
      expect(() => view.invoke(view.grantId, { parentId: view.parent.id, input })).toThrow('临时接收失败')
      const [childId] = view.database.harness.sideConversationIds(view.parent.id)
      expect(childId).toBeTruthy(); expect(view.runtime.getSession).not.toHaveBeenCalled()
      const child: any = await view.invoke(view.grantId, { parentId: view.parent.id, input })
      expect(child.id).toBe(childId)
      expect(() => view.invoke(view.grantId, { parentId: view.parent.id, input: { ...input, text: '不同问题' } })).toThrow('内容已变化')
      view.database.harness.deleteSession(child.id)
      expect(() => view.invoke(view.grantId, { parentId: view.parent.id, input })).toThrow('已不存在')
    } finally { view.close() }
  })
  it('does not convert queue retry or delayed admission failure into successful creation', async () => {
    const view = fixture()
    try {
      view.runtime.submitMessage.mockReturnValueOnce({ retryRequired: true, reason: 'permission-mode-disabled', queue } as never)
      await expect(view.invoke(view.grantId, { parentId: view.parent.id, input })).rejects.toThrow('权限档位已停用')
      view.runtime.submitMessage.mockReturnValueOnce(Promise.reject(new Error('持久化失败')) as never)
      await expect(view.invoke(view.grantId, { parentId: view.parent.id, input })).rejects.toThrow('持久化失败')
      expect(view.runtime.getSession).not.toHaveBeenCalled()
      expect(view.database.harness.sideConversationIds(view.parent.id)).toHaveLength(1)
    } finally { view.close() }
  })
  it('rejects prepared, archived and nested parents before any model input', () => {
    const view = fixture()
    try {
      const prepared = view.database.harness.createSession(undefined, undefined, true)
      const child = view.database.harness.createSideConversation(view.parent.id)
      for (const parentId of [prepared.id, child.id]) expect(() => view.invoke(view.grantId, { parentId, input })).toThrow('可用的主任务')
      view.database.harness.archiveSessions([view.parent.id])
      expect(() => view.invoke(view.grantId, { parentId: view.parent.id, input })).toThrow('可用的主任务')
      expect(view.runtime.submitMessage).not.toHaveBeenCalled()
    } finally { view.close() }
  })
})

describe('React Harness first-party message queue contracts', () => {
  beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })

  it('preserves atomic delivery and complete paused-queue expectations through both authority parsers', async () => {
    const options = { permissionMode: 'full', delivery: 'immediate', pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: 3, expectedQueueItemIds: ['queued'] } as const
    const raw = { ...submit, options: { ...options, injectedQueue: [], apiKey: 'not-public' } }
    const parsed = parseFirstPartyHarnessCall('message.submit', raw)
    expect(parsed).toEqual({ method: 'message.submit', ...submit, options })
    const view = bridge(vi.fn(async () => ({ confirmationRequired: true, queue })))
    await expect(view.request('message.submit', raw)).resolves.toEqual({ confirmationRequired: true, queue })
    expect(view.invokeFirstPartyHarness).toHaveBeenCalledExactlyOnceWith('host-held-grant', 'message.submit', { ...submit, options })
    const ipc = ipcFixture()
    expect(ipc.invoke('platform:first-party-harness', ipc.grantId, 'message.submit', raw)).toBe(receipt)
    expect(ipc.runtime.submitMessage).toHaveBeenCalledExactlyOnceWith(ipc.sender, 'session', 'submission', submit.text, submit.references, selection, false, options)
    expect(() => ipc.invoke('platform:first-party-harness', 'forged', 'message.submit', raw)).toThrow('授权无效')
  })

  it('rejects malformed atomic choices, missing run identities and partial queue confirmations', () => {
    const confirmed = { pausedQueueDecision: 'retain', expectedRunId: null, expectedQueueRevision: 3, expectedQueueItemIds: ['queued'] }
    const invalid = [
      null, [], { permissionMode: 'full-access' }, { permissionMode: null }, { permissionMode: 1 }, { delivery: 'guide' }, { delivery: 'immediate' }, { delivery: 'immediate', expectedRunId: '' },
      { ...confirmed, pausedQueueDecision: 'clear' }, { ...confirmed, expectedRunId: undefined }, { ...confirmed, expectedRunId: '\0' },
      { ...confirmed, expectedQueueRevision: undefined }, { ...confirmed, expectedQueueRevision: -1 }, { ...confirmed, expectedQueueRevision: 1.2 }, { ...confirmed, expectedQueueRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...confirmed, expectedQueueItemIds: undefined }, { ...confirmed, expectedQueueItemIds: ['queued', 'queued'] }, { ...confirmed, expectedQueueItemIds: Array.from({ length: 33 }, (_, index) => String(index)) },
      { ...confirmed, expectedQueueItemIds: ['\0'] }, { expectedQueueRevision: 3 }, { expectedQueueItemIds: ['queued'] },
    ]
    for (const options of invalid) expect(() => parseFirstPartyHarnessCall('message.submit', { ...submit, options })).toThrow()
    expect(parseFirstPartyHarnessCall('message.submit', { ...submit, options: {} })).toMatchObject({ options: {} })
    expect(parseFirstPartyHarnessCall('message.submit', { ...submit, options: { delivery: 'immediate', expectedRunId: null } })).toMatchObject({ options: { delivery: 'immediate', expectedRunId: null } })
  })

  it.each(['default', 'auto-approve', 'full'] as const)('passes permission-only submission intent through Vue and Electron (%s)', async permissionMode => {
    const options = { permissionMode }
    const raw = { ...submit, options }
    expect(parseFirstPartyHarnessCall('message.submit', raw)).toEqual({ method: 'message.submit', ...raw })
    const view = bridge()
    await view.request('message.submit', raw)
    expect(view.invokeFirstPartyHarness).toHaveBeenCalledExactlyOnceWith('host-held-grant', 'message.submit', raw)
    const ipc = ipcFixture()
    expect(ipc.invoke('platform:first-party-harness', ipc.grantId, 'message.submit', raw)).toBe(receipt)
    expect(ipc.runtime.submitMessage.mock.calls[0]?.[7]).toEqual(options)
    expect(() => ipc.invoke('platform:first-party-harness', ipc.grantId, 'message.submit', { ...submit, options: { permissionMode: 'full-access' } })).toThrow()
    expect(ipc.runtime.submitMessage).toHaveBeenCalledOnce()
  })

  it('sends one host request for an atomic draft and returns confirmation without a second send-now call', async () => {
    const port = { onmessage: undefined as any, start: vi.fn(), postMessage: vi.fn(), close: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    expect(host.supportsQueueSubmissionOptions).toBe(true)
    const options = { delivery: 'immediate' as const, expectedRunId: 'run' }
    const pending = host.submitMessage('session', submit.text, selection, false, submit.references, 'submission', options)
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'mira:request', id: '1', method: 'harness.message.submit', params: { ...submit, options } })
    port.onmessage({ data: { type: 'mira:response', id: '1', ok: true, value: { confirmationRequired: true, queue } } })
    await expect(pending).resolves.toEqual({ confirmationRequired: true, queue })
    host.close()
  })

  it.each(calls)('$method preserves bounded fields through both parsers and drops injected routing and credentials', ({ method, params }) => {
    const raw = { ...params, grantId: 'forged', workspaceRoot: '/private/injected', permissionMode: 'full-access', ...(method === 'message.submit' ? { selection: { ...selection, apiKey: 'secret' }, references: [{ ...submit.references[0], content: 'injected' }] } : {}) }
    const parsed = parseFirstPartyHarnessCall(method, raw)
    expect(parsed).toEqual({ method, ...params })
    const { method: parsedMethod, ...parsedParams } = parsed
    expect(parseFirstPartyHarnessCall(parsedMethod, parsedParams)).toEqual(parsed)
  })

  it('rejects malformed submissions before invoking the platform', async () => {
    const view = bridge()
    const invalid = [
      { sessionId: '' }, { sessionId: '\0' }, { sessionId: 1 }, { submissionId: '' }, { submissionId: ' '.repeat(3) }, { submissionId: '\0' }, { submissionId: 'x'.repeat(129) },
      { text: '', references: [] }, { text: '\0' }, { text: 'x'.repeat(100_001) }, { text: 12 }, { planning: undefined }, { planning: 'false' },
      { references: null }, { references: Array(13).fill(submit.references[0]) }, { references: [{ path: '../secret', name: 'secret' }] }, { references: [{ path: 'C:relative', name: 'secret' }] }, { references: [{ path: '\0', name: 'secret' }] }, { references: [{ path: 'README.md', name: '' }] },
      { selection: {} }, { selection: { ...selection, thinkingLevel: 'maximum' } }, { selection: { ...selection, providerId: '\0' } },
    ]
    for (const params of invalid) await expect(view.request('message.submit', { ...submit, ...params })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(view.invokeFirstPartyHarness).not.toHaveBeenCalled()
    expect(parseFirstPartyHarnessCall('message.submit', { ...submit, references: undefined })).toEqual({ method: 'message.submit', ...submit, references: [] })
  })

  it('preserves an attachment-only submission through the Vue parser and main IPC parser', async () => {
    const params = { ...submit, text: '', references: [{ path: 'mira-attachment:8ba45489-36c1-4c0f-aa58-f97a8bcb5f08', name: 'a.png', mediaType: 'image/png' as const, size: 68 }] }
    const parsed = parseFirstPartyHarnessCall('message.submit', params)
    expect(parsed).toEqual({ method: 'message.submit', ...params })
    const view = bridge(vi.fn(async () => receipt))
    await expect(view.request('message.submit', params)).resolves.toBe(receipt)
    expect(view.invokeFirstPartyHarness).toHaveBeenCalledExactlyOnceWith('host-held-grant', 'message.submit', params)
    const ipc = ipcFixture()
    expect(ipc.invoke('platform:first-party-harness', ipc.grantId, 'message.submit', params)).toBe(receipt)
    expect(ipc.runtime.submitMessage).toHaveBeenCalledExactlyOnceWith(ipc.sender, 'session', 'submission', '', params.references, selection, false)
  })

  it.each(calls)('$method rejects missing, NUL and oversized session identities', ({ method, params }) => {
    for (const sessionId of [undefined, '', '\0', 'x'.repeat(129), 12]) expect(() => parseFirstPartyHarnessCall(method, { ...params, sessionId })).toThrow('会话 ID')
    if (['queue.withdraw', 'queue.reorder', 'queue.send-now'].includes(method)) for (const itemId of [undefined, '', '\0', 'x'.repeat(129), 12]) expect(() => parseFirstPartyHarnessCall(method, { ...params, itemId })).toThrow('排队消息 ID')
  })

  it('validates reorder anchors and expected run identities without admitting extra transport fields', () => {
    const base = { sessionId: 'session', itemId: 'queued' }
    for (const beforeItemId of [undefined, '', '\0', 12, 'x'.repeat(129)]) expect(() => parseFirstPartyHarnessCall('queue.reorder', { ...base, beforeItemId })).toThrow('排序锚点 ID')
    expect(parseFirstPartyHarnessCall('queue.reorder', { ...base, beforeItemId: 'next' })).toEqual({ method: 'queue.reorder', ...base, beforeItemId: 'next' })
    expect(parseFirstPartyHarnessCall('queue.send-now', base)).toEqual({ method: 'queue.send-now', ...base })
    for (const expectedRunId of [null, '', '\0', 12, 'x'.repeat(129)]) expect(() => parseFirstPartyHarnessCall('queue.send-now', { ...base, expectedRunId })).toThrow('运行 ID')
  })

  it('returns authoritative queue DTOs through the MessagePort without falling back to message.run', async () => {
    const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    const methods = [() => host.submitMessage('session', submit.text, selection, false, submit.references, 'submission'), () => host.getMessageQueue('session'), () => host.withdrawMessage('session', 'queued'), () => host.resumeMessageQueue('session'), () => host.reorderMessageQueue('session', 'queued', null), () => host.sendQueuedMessageNow('session', 'queued', 'run')]
    for (const [index, call] of methods.entries()) {
      const pending = call()
      expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'mira:request', id: String(index + 1), method: `harness.${calls[index].method}`, params: calls[index].params })
      port.onmessage!({ data: { type: 'mira:response', id: String(index + 1), ok: true, value: calls[index].value } })
      await expect(pending).resolves.toBe(calls[index].value)
    }
    const onEvent = vi.fn(), unsubscribe = host.onEvent(onEvent)
    const event = { sessionId: 'session', type: 'queue-updated', payload: { queue } }
    port.onmessage!({ data: { type: 'mira:harness-event', event } })
    expect(onEvent).toHaveBeenCalledExactlyOnceWith(event)
    unsubscribe(); host.close()
  })

  it.each(calls)('$method uses only a permitted active Harness manifest and the host-held grant', async ({ method, params, value }) => {
    const view = bridge(vi.fn(async () => value))
    await expect(view.request(method, { ...params, grantId: 'forged' })).resolves.toBe(value)
    expect(view.invokeFirstPartyHarness).toHaveBeenCalledExactlyOnceWith('host-held-grant', method, params)
    for (const override of [{ enabled: false }, { appId: 'other-app' }, { capabilities: [] }]) {
      Object.assign(view.options.manifest, override)
      await expect(view.request(method, params)).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
      Object.assign(view.options.manifest, manifest)
    }
    expect(view.invokeFirstPartyHarness).toHaveBeenCalledTimes(1)
  })

  it.each(['待发送消息已开始或已撤回', '待发送消息已存在且内容不同', '待发送消息已达 32 条上限', '请先处理当前任务的确认', '工作目录已变化，请撤回消息后重新发送', '请先处理待发送消息', '权限档位应为 default、auto-approve 或 full', '待发送消息正在提升，请稍后重试', '当前任务已变化，请刷新后重试', '立即发送已取消，消息仍在队列中'])('shows only the stable queue failure %s', async message => {
    for (const source of [message, `Error invoking remote method 'platform:first-party-harness': Error: ${message}`]) {
      const view = bridge(vi.fn(async () => { throw new Error(source) }))
      await expect(view.request('message.submit', submit)).rejects.toMatchObject({ code: 'MESSAGE_SUBMISSION_FAILED', message })
      await expect(view.request('queue.resume', { sessionId: 'session' })).rejects.toMatchObject({ code: 'MESSAGE_QUEUE_FAILED', message })
    }
  })

  it.each(calls)('$method never exposes unknown host failures or spoofed known-error suffixes', async ({ method, params }) => {
    for (const source of ['private apiKey=secret /private/path', '待发送消息已开始或已撤回\nprivate apiKey=secret', 'Error invoking remote method \'platform:first-party-harness\': Error: stack /private/path']) {
      const view = bridge(vi.fn(async () => { throw new Error(source) }))
      await expect(view.request(method, params)).rejects.toMatchObject({ code: method === 'message.submit' ? 'MESSAGE_SUBMISSION_FAILED' : 'MESSAGE_QUEUE_FAILED', message: method === 'message.submit' ? '消息提交失败，内容已保留，请稍后重试。' : '消息队列操作失败，请刷新后重试。' })
    }
  })

  it.each(['session.archive', 'session.delete', 'session.move'])('%s preserves only safe running and pending-queue lifecycle failures', async method => {
    const params = { id: 'session', ...(method === 'session.move' ? { projectId: 'project' } : {}) }
    for (const message of ['该会话正在运行', '请先处理待发送消息']) {
      const view = bridge(vi.fn(async () => { throw new Error(`Error invoking remote method 'platform:first-party-harness': Error: ${message}`) }))
      await expect(view.request(method, params)).rejects.toMatchObject({ code: 'SESSION_MUTATION_FAILED', message })
    }
    for (const message of ['private apiKey=secret /private/path', '该会话正在运行\nprivate apiKey=secret']) {
      const view = bridge(vi.fn(async () => { throw new Error(message) }))
      await expect(view.request(method, params)).rejects.toMatchObject({ code: 'SESSION_MUTATION_FAILED', message: '会话操作失败，请稍后重试。' })
    }
  })

  it('retains existing file-reference recovery for message.submit and hides the file path', async () => {
    const failures = [
      ['引用文件不存在：', '引用文件已不可读取，请重新选择文件后发送。'],
      ['引用文件过大：', '引用文件超过大小限制，请选择较小的文本文件。'],
      ['不支持引用二进制文件：', '无法引用二进制文件，请选择文本文件。'],
    ]
    for (const [source, message] of failures) {
      const view = bridge(vi.fn(async () => { throw new Error(`Error invoking remote method 'platform:first-party-harness': Error: ${source}/private/sensitive.md`) }))
      await expect(view.request('message.submit', submit)).rejects.toMatchObject({ code: 'FILE_REFERENCE_FAILED', message })
    }
  })

  it('routes synchronous admission and queue acknowledgements without awaiting a running model task', () => {
    const view = ipcFixture()
    for (const { method, params, value } of calls) expect(view.invoke('platform:first-party-harness', view.grantId, method, params)).toBe(value)
    expect(view.runtime.submitMessage).toHaveBeenCalledExactlyOnceWith(view.sender, 'session', 'submission', submit.text, submit.references, selection, false)
    expect(view.runtime.getMessageQueue).toHaveBeenCalledExactlyOnceWith('session')
    expect(view.runtime.withdrawMessage).toHaveBeenCalledExactlyOnceWith('session', 'queued')
    expect(view.runtime.resumeMessageQueue).toHaveBeenCalledExactlyOnceWith('session')
    expect(view.runtime.reorderMessageQueue).toHaveBeenCalledExactlyOnceWith('session', 'queued', null)
    expect(view.runtime.sendQueuedMessageNow).toHaveBeenCalledExactlyOnceWith('session', 'queued', 'run')
    expect(view.runtime.runMessage).not.toHaveBeenCalled()
  })

  it.each(calls)('$method rejects cross-window, subframe, revoked and non-Harness grants before touching the runtime', ({ method, params }) => {
    const view = ipcFixture([manifest, { ...manifest, appId: 'mira-other' }]), handler = electron.handlers.get('platform:first-party-harness')!
    const otherGrant = view.invoke('platform:create-first-party-grant', 'mira-other')
    expect(() => view.invoke('platform:first-party-harness', otherGrant, method, params)).toThrow('授权无效')
    expect(() => handler({ sender: { id: 2 } }, view.grantId, method, params)).toThrow('授权无效')
    expect(() => handler({ sender: view.sender, senderFrame: { parent: {} } }, view.grantId, method, params)).toThrow('宿主主页面')
    view.invoke('platform:revoke-first-party-grant', view.grantId)
    expect(() => view.invoke('platform:first-party-harness', view.grantId, method, params)).toThrow('授权无效')
    for (const callback of Object.values(view.runtime)) expect(callback).not.toHaveBeenCalled()
  })

  it('revalidates untrusted submission and withdrawal parameters at Electron even if the renderer parser is bypassed', () => {
    const view = ipcFixture()
    for (const params of [{ ...submit, text: '', references: [] }, { ...submit, submissionId: '\0' }, { ...submit, planning: 'false' }, { ...submit, references: [{ path: '../secret', name: 'secret' }] }]) expect(() => view.invoke('platform:first-party-harness', view.grantId, 'message.submit', params)).toThrow()
    expect(() => view.invoke('platform:first-party-harness', view.grantId, 'queue.withdraw', { sessionId: 'session', itemId: '\0' })).toThrow()
    for (const callback of Object.values(view.runtime)) expect(callback).not.toHaveBeenCalled()
  })

  it.each(calls)('$method traverses renderer and Electron parsers with no credentials or forged grant fields', async ({ method, params, value }) => {
    const ipc = ipcFixture(), renderer = bridge(vi.fn(async (grant: string, name: string, payload: unknown) => ipc.invoke('platform:first-party-harness', grant, name, payload) as typeof queue))
    renderer.options.grantId = ipc.grantId
    await expect(renderer.request(method, { ...params, grantId: 'forged', apiKey: 'secret' })).resolves.toBe(value)
    expect(ipc.runtime.runMessage).not.toHaveBeenCalled()
  })
})
