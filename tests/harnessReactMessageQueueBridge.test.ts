import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import type { HarnessMessageQueueSnapshot, HarnessMessageSubmissionReceipt, HarnessMessageWithdrawal } from '../src/config/harness'
import { parseFirstPartyHarnessCall } from '../src/platform/firstPartyHarness'
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

describe('React Harness first-party message queue contracts', () => {
  beforeEach(() => { electron.handlers.clear(); vi.clearAllMocks() })

  it('preserves atomic delivery and complete paused-queue expectations through both authority parsers', async () => {
    const options = { delivery: 'immediate', pausedQueueDecision: 'discard', expectedRunId: null, expectedQueueRevision: 3, expectedQueueItemIds: ['queued'] } as const
    const raw = { ...submit, options: { ...options, injectedQueue: [], permissionMode: 'full', apiKey: 'not-public' } }
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
      null, [], { delivery: 'guide' }, { delivery: 'immediate' }, { delivery: 'immediate', expectedRunId: '' },
      { ...confirmed, pausedQueueDecision: 'clear' }, { ...confirmed, expectedRunId: undefined }, { ...confirmed, expectedRunId: '\0' },
      { ...confirmed, expectedQueueRevision: undefined }, { ...confirmed, expectedQueueRevision: -1 }, { ...confirmed, expectedQueueRevision: 1.2 }, { ...confirmed, expectedQueueRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...confirmed, expectedQueueItemIds: undefined }, { ...confirmed, expectedQueueItemIds: ['queued', 'queued'] }, { ...confirmed, expectedQueueItemIds: Array.from({ length: 33 }, (_, index) => String(index)) },
      { ...confirmed, expectedQueueItemIds: ['\0'] }, { expectedQueueRevision: 3 }, { expectedQueueItemIds: ['queued'] },
    ]
    for (const options of invalid) expect(() => parseFirstPartyHarnessCall('message.submit', { ...submit, options })).toThrow()
    expect(parseFirstPartyHarnessCall('message.submit', { ...submit, options: {} })).toMatchObject({ options: {} })
    expect(parseFirstPartyHarnessCall('message.submit', { ...submit, options: { delivery: 'immediate', expectedRunId: null } })).toMatchObject({ options: { delivery: 'immediate', expectedRunId: null } })
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
