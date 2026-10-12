import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type { MiraFlowWorkbenchRequest } from '../src/config/miraFlowWorkbench'
import type { PlatformApi, PlatformContext } from '../src/types'
import { firstPartyAppManifests } from '../src/config/firstPartyApps'
import { FirstPartyGrantStore } from '../electron/security/firstPartyGrant'

const electron = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), owner: true, invoke: vi.fn(async (_channel: string, _request: unknown) => 'host-result') }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => electron.handlers.set(channel, handler) },
  ipcRenderer: { invoke: electron.invoke }, BrowserWindow: { fromWebContents: () => electron.owner ? {} : null },
  session: {}, webContents: {}, clipboard: {}, dialog: {}, shell: {},
}))
import { registerPlatformIpcHandlers } from '../electron/ipc/platformIpc'
import { registerMiraFlowIpc } from '../electron/ipc/miraFlowIpc'
import { miraFlowApi } from '../electron/preload/miraFlowApi'
import { handleFirstPartyRequest } from '../src/platform/firstPartyBridge'
import { FirstPartyHarnessHost } from '../apps/harness-react/src/platform/first-party-host'
import { PilotController } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessEvent } from '../src/config/harness'

beforeEach(() => { electron.handlers.clear(); electron.owner = true; electron.invoke.mockClear() })
function setup() {
  const frame = { parent: null as unknown }
  const sender = { id: 7, mainFrame: frame, isDestroyed: vi.fn(() => false) }
  const event = { sender, senderFrame: frame as typeof frame | undefined }
  const flows = { request: vi.fn(async (_sender: WebContents, request: MiraFlowWorkbenchRequest, _assert?: () => void): Promise<unknown> => request) }
  const grants = new FirstPartyGrantStore(), manifests = structuredClone(firstPartyAppManifests)
  const grantId = grants.issue('mira-harness', sender.id, ['harness:workbench'])
  registerPlatformIpcHandlers({ database: {} as never, localMicroAppServer: {} as never, flows, firstPartyGrantStore: grants, firstPartyManifests: manifests })
  registerMiraFlowIpc({ flows })
  const direct = (request: unknown) => electron.handlers.get('platform:mira-workflow')!(event, request)
  const firstParty = (request: unknown, id = grantId) => electron.handlers.get('platform:first-party-harness')!(event, id, 'workflows.request', { request })
  return { event, sender, flows, grants, manifests, grantId, direct, firstParty }
}
describe('actual authorized Mira workflow communication', () => {
  it('uses the dedicated shell preload channel without forwarding a renderer driver', async () => {
    const request = { action: 'definitions.list' as const }
    await expect(miraFlowApi.requestMiraWorkflow(request)).resolves.toBe('host-result')
    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith('platform:mira-workflow', request)
  })
  it('forwards only parsed requests through the same host controller for shell and first-party', async () => {
    const view = setup(), request = { action: 'runs.snapshot', sessionId: 'owner', runId: 'run', afterSequence: 5, limit: 50 }
    await expect(view.direct(request)).resolves.toEqual(request)
    await expect(view.firstParty(request)).resolves.toEqual(request)
    expect(view.flows.request.mock.calls.every(([sender, parsed, assert]) => sender === view.sender as unknown as WebContents && parsed !== request && typeof assert === 'function')).toBe(true)
    await expect(view.direct({ ...request, loweredJs: 'unsafe' })).rejects.toThrow('工作流请求无效')
    expect(view.flows.request).toHaveBeenCalledTimes(2)
  })
  it.each(['subframe', 'missing', 'foreign', 'destroyed', 'ownerless'])('rejects %s before touching the host controller', async kind => {
    const view = setup()
    if (kind === 'subframe') view.event.senderFrame!.parent = {}
    if (kind === 'missing') view.event.senderFrame = undefined
    if (kind === 'foreign') view.event.senderFrame = { parent: null }
    if (kind === 'destroyed') view.sender.isDestroyed.mockReturnValue(true)
    if (kind === 'ownerless') electron.owner = false
    await expect(view.direct({ action: 'definitions.list' })).rejects.toThrow('工作流只能由宿主工作台管理')
    expect(view.flows.request).not.toHaveBeenCalled()
  })
  it('isolates first-party grants by sender, app and capability', () => {
    const view = setup(), request = { action: 'definitions.list' }
    const foreign = view.grants.issue('mira-harness', 99, ['harness:workbench'])
    const novel = view.grants.issue('mira-novel-studio', 7, ['harness:workbench'])
    const noCapability = view.grants.issue('mira-harness', 7, [])
    for (const grantId of [foreign, novel, noCapability, 'fake']) expect(() => view.firstParty(request, grantId)).toThrow()
    expect(view.flows.request).not.toHaveBeenCalled()
  })
  it.each(['revoked', 'disabled', 'destroyed'])('rechecks an async lease after %s and before controller mutation', async kind => {
    const view = setup()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const mutate = vi.fn()
    view.flows.request.mockImplementation(async (_sender, _request, assertAuthorized) => { await gate; assertAuthorized!(); mutate(); return [] })
    const pending = view.firstParty({ action: 'definitions.list' })
    if (kind === 'revoked') view.grants.revoke(view.grantId, 7)
    if (kind === 'disabled') view.manifests[0]!.enabled = false
    if (kind === 'destroyed') view.sender.isDestroyed.mockReturnValue(true)
    release()
    await expect(pending).rejects.toThrow()
    expect(mutate).not.toHaveBeenCalled()
  })
  it('rechecks a revoked grant after a host response and redacts host/provider details', async () => {
    const view = setup()
    view.flows.request.mockImplementation(async () => { view.grants.revoke(view.grantId, 7); return 'sensitive stale response' })
    await expect(view.firstParty({ action: 'definitions.list' })).rejects.toThrow('第一方授权无效')
    view.flows.request.mockRejectedValue(new Error('ENOENT /private/secret/provider.json token=host-key'))
    await expect(view.direct({ action: 'definitions.list' })).rejects.toThrow('工作流操作失败，请刷新后重试')
    const diagnostic = '工作流编译失败：\n2:7 TS2322 Type string is not assignable to number.'
    view.flows.request.mockRejectedValue(new Error(diagnostic))
    await expect(view.direct({ action: 'definitions.preview', input: { name: 'review', scope: 'global', meta: { description: 'Review' }, script: 'const value: number = "string";' } })).rejects.toThrow(diagnostic)
  })
  it('uses the first-party request envelope from React through Vue with capability enforcement', async () => {
    const port = { onmessage: undefined as ((message: { data: unknown }) => void) | undefined, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }
    const host = new FirstPartyHarnessHost(port as unknown as MessagePort)
    const request = { action: 'definitions.list' as const, projectId: 'project' }
    const pending = host.requestWorkflow<string[]>(request)
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'mira:request', id: '1', method: 'harness.workflows.request', params: { request } })
    port.onmessage?.({ data: { type: 'mira:response', id: '1', ok: true, value: ['workflow'] } })
    await expect(pending).resolves.toEqual(['workflow']); host.close()
    const invokeFirstPartyHarness = vi.fn(async () => ['workflow'])
    const options = { manifest: firstPartyAppManifests[0]!, grantId: 'grant', api: { invokeFirstPartyHarness } as unknown as PlatformApi, context: {} as PlatformContext, route: '/', navigate: vi.fn() }
    await expect(handleFirstPartyRequest(options, { type: 'mira:request', id: '1', method: 'harness.workflows.request', params: { request } })).resolves.toEqual(['workflow'])
    expect(invokeFirstPartyHarness).toHaveBeenCalledWith('grant', 'workflows.request', { request })
    await expect(handleFirstPartyRequest({ ...options, manifest: { ...options.manifest, appId: 'mira-novel-studio' } }, { type: 'mira:request', id: '2', method: 'harness.workflows.request', params: { request } })).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' })
  })
  it('redacts bridge failures while preserving useful workflow revision conflicts', async () => {
    const api = { invokeFirstPartyHarness: vi.fn(async () => { throw new Error('host token=secret /private/file') }) }
    const options = { manifest: firstPartyAppManifests[0]!, grantId: 'grant', api: api as unknown as PlatformApi, context: {} as PlatformContext, route: '/', navigate: vi.fn() }
    const request = { type: 'mira:request' as const, id: '1', method: 'harness.workflows.request', params: { request: { action: 'definitions.list' } } }
    await expect(handleFirstPartyRequest(options, request)).rejects.toMatchObject({ code: 'WORKFLOW_FAILED', message: '工作流操作失败，请刷新后重试' })
    api.invokeFirstPartyHarness.mockRejectedValue(new Error("Error invoking remote method 'platform:first-party-harness': Error: 工作流已变化，请刷新后重试"))
    await expect(handleFirstPartyRequest(options, request)).rejects.toMatchObject({ message: '工作流已变化，请刷新后重试' })
    const diagnostic = `工作流编译失败：\n2:7 TS2322 ${'x'.repeat(5000)}`
    api.invokeFirstPartyHarness.mockRejectedValue(new Error(diagnostic))
    await expect(handleFirstPartyRequest(options, request)).rejects.toMatchObject({ message: diagnostic.slice(0, 4000) })
  })
  it('exposes minimal controller workflow calls and filters ordinary conversation events', async () => {
    let listener!: (event: HarnessEvent) => void
    const unsubscribe = vi.fn(), requestWorkflow = vi.fn(async () => ['definition'])
    const controller = new PilotController({ requestWorkflow, onEvent: (callback: typeof listener) => { listener = callback; return unsubscribe } } as never)
    await expect(controller.requestWorkflow({ action: 'definitions.list' })).resolves.toEqual(['definition'])
    const consumer = vi.fn(), stop = controller.onWorkflowEvent(consumer)
    listener({ type: 'message-delta', sessionId: 'ordinary', payload: {} })
    expect(consumer).not.toHaveBeenCalled()
    const event: HarnessEvent = { type: 'workflow-event', sessionId: 'owner', payload: { runId: 'run', event: {} } }
    listener(event); expect(consumer).toHaveBeenCalledExactlyOnceWith(event)
    stop(); expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
