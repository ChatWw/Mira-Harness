import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive, ref } from 'vue'
import FirstPartyFrame from '../src/pages/frontend/microAppHost/FirstPartyFrame.vue'
import { createVueNodeRenderer, withVueClientRender } from './helpers/vueNodeRenderer'
import type { MiraAppNavigationCommand, MiraAppNavigationSnapshot } from '../src/platform/appNavigation'
import { handleFirstPartyRequest, isFirstPartyRequest } from '../src/platform/firstPartyBridge'

vi.mock('@/platform/firstPartyBridge', () => ({
  FirstPartyBridgeError: class extends Error {}, isFirstPartyRequest: vi.fn(() => false), handleFirstPartyRequest: vi.fn(),
}))

class Port {
  postMessage = vi.fn(); close = vi.fn(); start = vi.fn()
  onmessage?: (event: { data: unknown }) => unknown
  receive(data: unknown) { return this.onmessage?.({ data }) }
}
const channels: { port1: Port; port2: Port }[] = []
const Frame = withVueClientRender(FirstPartyFrame, new URL('../src/pages/frontend/microAppHost/FirstPartyFrame.vue', import.meta.url))
const mounts: { unmount(): void }[] = []
const command = (): MiraAppNavigationCommand => ({ type: 'mira:app-navigation-command', direction: 'back', expectedRevision: 3 })
const snapshot = (): MiraAppNavigationSnapshot => ({ entries: [{ kind: 'conversation', sessionId: 'a' }, { kind: 'extensions' }], cursor: 1, detached: false })
const navigationState = () => ({ type: 'mira:app-navigation-state', revision: 3, canGoBack: true, canGoForward: false, busy: false, snapshot: snapshot() })

function mountFrame(options: { appId?: string; capabilities?: string[]; restore?: MiraAppNavigationSnapshot } = {}) {
  const api = { createFirstPartyGrant: vi.fn(async () => 'grant-' + channels.length), revokeFirstPartyGrant: vi.fn(async () => undefined), onHarnessEvent: vi.fn(() => vi.fn()) }
  const states = vi.fn(), controls = vi.fn(), resets = vi.fn(), errors = vi.fn()
  const props = reactive({
    url: 'https://mira.test/harness', title: 'Mira Harness', api,
    manifest: { appId: options.appId || 'mira-harness', capabilities: options.capabilities || ['harness:workbench'] },
    context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'platform', name: 'Mira' } },
    route: '/', navigate: vi.fn(), navigationSnapshot: options.restore, active: true,
    toggleTheme: vi.fn(() => { props.context.theme = props.context.theme === 'light' ? 'dark' : 'light'; return props.context.theme }),
  })
  const exposed = ref<{ navigateHistory(command: MiraAppNavigationCommand): boolean; harnessControl(command: { type: 'mira:harness-control'; action: 'toggle-sidebar' | 'new-task' }): boolean; closeContext(): Promise<boolean> }>()
  const renderer = createVueNodeRenderer()
  const { app } = renderer.mount({ setup: () => () => h(Frame, { ...props, ref: exposed, onControlsState: controls, onNavigationState: states, onNavigationReset: resets, onError: errors } as never) })
  mounts.push(app)
  const iframe = renderer.all().find(node => node.type === 'iframe')!
  const target = { postMessage: vi.fn() }; iframe.contentWindow = target
  const connect = () => (iframe.props.onLoad as () => Promise<void>)()
  return { api, states, controls, resets, errors, props, exposed, target, connect, app }
}

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', { querySelectorAll: () => [] })
  channels.length = 0
  vi.mocked(isFirstPartyRequest).mockReturnValue(false)
  vi.mocked(handleFirstPartyRequest).mockReset()
  vi.stubGlobal('MessageChannel', class { port1 = new Port(); port2 = new Port(); constructor() { channels.push(this) } })
})
afterEach(() => { for (const app of mounts.splice(0)) app.unmount(); vi.unstubAllGlobals() })

describe('authorized first-party navigation messages', () => {
  it('refreshes on return from settings without reconnecting or restoring navigation again', async () => {
    const frame = mountFrame(); await frame.connect(); const port = channels[0].port1
    port.postMessage.mockClear()
    frame.props.active = false; await nextTick()
    expect(port.postMessage).not.toHaveBeenCalled()
    frame.props.active = true; await nextTick()
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'mira:resume' })
    expect(frame.api.createFirstPartyGrant).toHaveBeenCalledOnce()
    expect(frame.api.revokeFirstPartyGrant).not.toHaveBeenCalled()
    expect(port.close).not.toHaveBeenCalled()
  })
  it('waits for its active port close acknowledgement and rejects on grant replacement', async () => {
    const frame = mountFrame(); await frame.connect(); const active = channels[0].port1
    const closing = frame.exposed.value!.closeContext(), id = active.postMessage.mock.lastCall![0].id
    expect(active.postMessage).toHaveBeenLastCalledWith({ type: 'mira:close-context', id })
    await active.receive({ type: 'mira:close-ready', id, ok: true, consumed: true }); await expect(closing).resolves.toBe(true)
    const late = frame.exposed.value!.closeContext(), assertion = expect(late).rejects.toThrow('连接已失效')
    frame.props.url = 'https://mira.test/other'; await nextTick(); await assertion
    await active.receive({ type: 'mira:close-ready', id, ok: true, consumed: false })
    await expect(frame.exposed.value!.closeContext()).rejects.toThrow('连接尚未就绪')
  })
  it('passes theme changes through the active Shell owner and blocks a revoked port', async () => {
    const frame = mountFrame(); await frame.connect(); const active = channels[0].port1
    vi.mocked(isFirstPartyRequest).mockReturnValue(true)
    vi.mocked(handleFirstPartyRequest).mockImplementation(async options => options.toggleTheme?.())
    const request = { type: 'mira:request', id: 'theme', method: 'appearance.toggle-theme' }
    await active.receive(request); await nextTick()
    expect(frame.props.toggleTheme).toHaveBeenCalledOnce()
    expect(active.postMessage.mock.calls.map(([message]) => message)).toContainEqual({ type: 'mira:context', context: frame.props.context })
    expect(active.postMessage.mock.calls.map(([message]) => message)).toContainEqual({ type: 'mira:response', id: 'theme', ok: true, value: 'dark' })
    frame.props.url = 'https://mira.test/replaced'; await nextTick()
    await active.receive(request); expect(frame.props.toggleTheme).toHaveBeenCalledOnce()
    expect(frame.api.revokeFirstPartyGrant).toHaveBeenCalledWith('grant-1')
  })
  it('sends context followed by one initial restore only after the grant activates', async () => {
    const saved = snapshot(), frame = mountFrame({ restore: saved })
    expect(frame.exposed.value?.navigateHistory(command())).toBe(false)
    await frame.connect()
    expect(frame.target.postMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'mira:connect', grantId: 'grant-1' }), '*', [channels[0].port2])
    expect(channels[0].port1.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'mira:context', context: frame.props.context }, { type: 'mira:app-navigation-restore', snapshot: saved },
    ])
    frame.props.context.theme = 'dark'; await nextTick()
    expect(channels[0].port1.postMessage.mock.calls.filter(([message]) => message.type === 'mira:app-navigation-restore')).toHaveLength(1)
    expect(channels[0].port1.postMessage).toHaveBeenLastCalledWith({ type: 'mira:context', context: frame.props.context })
    expect(frame.exposed.value?.navigateHistory(command())).toBe(true)
    expect(channels[0].port1.postMessage).toHaveBeenLastCalledWith(command())
  })

  it('uses an undefined initial snapshot to let the new app initialize its own history', async () => {
    const frame = mountFrame(); await frame.connect()
    expect(channels[0].port1.postMessage).toHaveBeenLastCalledWith({ type: 'mira:app-navigation-restore', snapshot: undefined })
  })

  it('forwards only parsed states from the active granted port', async () => {
    const frame = mountFrame(); await frame.connect()
    const input = navigationState(); await channels[0].port1.receive(input)
    expect(frame.states).toHaveBeenCalledExactlyOnceWith(input)
    expect(frame.states.mock.calls[0][0]).not.toBe(input)
    for (const invalid of [null, { ...input, revision: -1 }, { ...input, snapshot: { ...snapshot(), cursor: 99 } }, { ...input, snapshot: undefined }, { ...input, appId: 'mira-novel-studio' }]) await channels[0].port1.receive(invalid)
    expect(frame.states).toHaveBeenCalledOnce()
  })

  it.each([
    ['mira-harness', []], ['mira-novel-studio', ['harness:workbench']], ['mira-novel-studio', []],
  ])('rejects navigation outside the authorized Harness manifest: %s %j', async (appId, capabilities) => {
    const frame = mountFrame({ appId, capabilities }); await frame.connect()
    await channels[0].port1.receive(navigationState())
    expect(frame.states).not.toHaveBeenCalled(); expect(frame.exposed.value?.navigateHistory(command())).toBe(false)
    expect(channels[0].port1.postMessage.mock.calls.map(([message]) => message.type)).toEqual(['mira:context'])
  })

  it('revokes a reloaded page and rejects its old port before a new URL reconnects', async () => {
    const frame = mountFrame({ restore: snapshot() }); await frame.connect()
    const oldPort = channels[0].port1
    await frame.connect(); expect(oldPort.close).toHaveBeenCalledOnce(); expect(frame.api.revokeFirstPartyGrant).toHaveBeenCalledWith('grant-1')
    expect(frame.exposed.value?.navigateHistory(command())).toBe(false)
    await oldPort.receive(navigationState()); expect(frame.states).not.toHaveBeenCalled()
    expect(frame.errors).toHaveBeenCalledOnce(); expect(channels).toHaveLength(1)
    frame.props.url = 'https://mira.test/retry'; await nextTick(); await frame.connect()
    expect(channels).toHaveLength(2); expect(channels[1].port1.postMessage).toHaveBeenLastCalledWith({ type: 'mira:app-navigation-restore', snapshot: snapshot() })
    await oldPort.receive(navigationState()); expect(frame.states).not.toHaveBeenCalled()
    await channels[1].port1.receive({ ...navigationState(), revision: 0 }); expect(frame.states).toHaveBeenCalledOnce()
  })

  it('invalidates the old port when the manifest loses its Harness capability', async () => {
    const frame = mountFrame(); await frame.connect(); const oldPort = channels[0].port1
    frame.props.manifest.capabilities = []; await nextTick()
    expect(oldPort.close).toHaveBeenCalledOnce(); expect(frame.resets).toHaveBeenCalledTimes(2)
    await oldPort.receive(navigationState()); expect(frame.states).not.toHaveBeenCalled()
    expect(frame.exposed.value?.navigateHistory(command())).toBe(false)
  })

  it('keeps a failed send retryable and rejects malformed command payloads', async () => {
    const frame = mountFrame(); await frame.connect(); const port = channels[0].port1
    port.postMessage.mockClear(); port.postMessage.mockImplementationOnce(() => { throw new Error('closed during send') })
    expect(frame.exposed.value?.navigateHistory(command())).toBe(false)
    expect(frame.exposed.value?.navigateHistory(command())).toBe(true); expect(port.postMessage).toHaveBeenCalledTimes(2)
    expect(frame.exposed.value?.navigateHistory({ ...command(), expectedRevision: -1 })).toBe(false)
    expect(port.postMessage).toHaveBeenCalledTimes(2)
  })

  it('lets a failed grant retry without forwarding anything from the failed channel', async () => {
    const frame = mountFrame(); frame.api.createFirstPartyGrant.mockRejectedValueOnce(new Error('grant denied'))
    await frame.connect(); expect(channels[0].port1.close).toHaveBeenCalledOnce(); expect(frame.errors).toHaveBeenCalledWith('grant denied')
    expect(frame.target.postMessage).not.toHaveBeenCalled(); expect(frame.exposed.value?.navigateHistory(command())).toBe(false)
    await frame.connect(); expect(channels[1].port1.postMessage).toHaveBeenLastCalledWith({ type: 'mira:app-navigation-restore', snapshot: undefined })
  })

  it('revokes a pending grant after unmount without reconnecting the abandoned frame', async () => {
    const frame = mountFrame(); let resolveGrant!: (value: string) => void
    frame.api.createFirstPartyGrant.mockReturnValueOnce(new Promise(resolve => { resolveGrant = resolve }))
    const pending = frame.connect(); frame.app.unmount(); mounts.splice(mounts.indexOf(frame.app), 1)
    resolveGrant('pending-grant'); await pending
    expect(frame.api.revokeFirstPartyGrant).toHaveBeenCalledWith('pending-grant')
    expect(channels[0].port1.close).toHaveBeenCalledOnce(); expect(frame.target.postMessage).not.toHaveBeenCalled()
    await frame.connect(); expect(frame.api.createFirstPartyGrant).toHaveBeenCalledOnce()
  })
})


it('forwards full-view shortcuts from the Shell without focusing the iframe and stops after unmount', async () => {
  const frame = mountFrame(); await frame.connect()
  const event = () => Object.assign(new Event('keydown', { cancelable: true }), { key: 'F', code: 'KeyF', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false, repeat: false, isComposing: false, keyCode: 70 })
  vi.stubGlobal('navigator', { platform: 'MacIntel' })
  vi.stubGlobal('document', { querySelectorAll: () => [{ getClientRects: () => [] }] })
  const first = event(); window.dispatchEvent(first)
  expect(first.defaultPrevented).toBe(true)
  expect(channels[0].port1.postMessage).toHaveBeenLastCalledWith({ type: 'mira:full-view-toggle' })
  let count = channels[0].port1.postMessage.mock.calls.length
  frame.props.active = false; await nextTick()
  const hidden = event(); window.dispatchEvent(hidden)
  expect(hidden.defaultPrevented).toBe(false)
  expect(channels[0].port1.postMessage).toHaveBeenCalledTimes(count)
  frame.props.active = true; await nextTick()
  count = channels[0].port1.postMessage.mock.calls.length
  window.dispatchEvent(Object.assign(event(), { repeat: true }))
  expect(channels[0].port1.postMessage).toHaveBeenCalledTimes(count)
  vi.stubGlobal('document', { querySelectorAll: () => [{ getClientRects: () => [{}] }] })
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }))
  const blocked = event(); window.dispatchEvent(blocked)
  expect(blocked.defaultPrevented).toBe(false)
  expect(channels[0].port1.postMessage).toHaveBeenCalledTimes(count)
  frame.app.unmount()
  window.dispatchEvent(event())
  expect(channels[0].port1.postMessage).toHaveBeenCalledTimes(count)
})


describe('Harness frame titlebar controls', () => {
  it('forwards controls and state only while its granted connection is active', async () => {
    const frame = mountFrame(), command = { type: 'mira:harness-control' as const, action: 'toggle-sidebar' as const }
    expect(frame.exposed.value?.harnessControl(command)).toBe(false)
    await frame.connect(); const port = channels[0].port1
    expect(frame.exposed.value?.harnessControl(command)).toBe(true)
    expect(port.postMessage).toHaveBeenLastCalledWith(command)
    const state = { type: 'mira:harness-controls-state', sidebarOpen: false }
    await port.receive({ ...state, extra: true }); expect(frame.controls).not.toHaveBeenCalled()
    await port.receive(state); expect(frame.controls).toHaveBeenCalledExactlyOnceWith(state)
    frame.props.url = 'https://mira.test/replaced'; await nextTick()
    expect(frame.exposed.value?.harnessControl(command)).toBe(false)
    await port.receive(state); expect(frame.controls).toHaveBeenCalledOnce()
  })
  it.each([{ appId: 'mira-novel-studio' }, { capabilities: [] }])('does not expose Harness controls to another app or an ungranted frame %j', async options => {
    const frame = mountFrame(options); await frame.connect()
    expect(frame.exposed.value?.harnessControl({ type: 'mira:harness-control', action: 'new-task' })).toBe(false)
    await channels[0].port1.receive({ type: 'mira:harness-controls-state', sidebarOpen: true })
    expect(frame.controls).not.toHaveBeenCalled()
  })
})
