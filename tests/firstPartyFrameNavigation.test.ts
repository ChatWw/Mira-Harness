import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive, ref } from 'vue'
import FirstPartyFrame from '../src/pages/frontend/microAppHost/FirstPartyFrame.vue'
import { createVueNodeRenderer, withVueClientRender } from './helpers/vueNodeRenderer'
import type { MiraAppNavigationCommand, MiraAppNavigationSnapshot } from '../src/platform/appNavigation'

vi.mock('@/platform/firstPartyBridge', () => ({
  FirstPartyBridgeError: class extends Error {}, isFirstPartyRequest: () => false, handleFirstPartyRequest: vi.fn(),
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
  const states = vi.fn(), resets = vi.fn(), errors = vi.fn()
  const props = reactive({
    url: 'https://mira.test/harness', title: 'Mira Harness', api,
    manifest: { appId: options.appId || 'mira-harness', capabilities: options.capabilities || ['harness:workbench'] },
    context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'platform', name: 'Mira' } },
    route: '/', navigate: vi.fn(), navigationSnapshot: options.restore,
  })
  const exposed = ref<{ navigateHistory(command: MiraAppNavigationCommand): boolean }>()
  const renderer = createVueNodeRenderer()
  const { app } = renderer.mount({ setup: () => () => h(Frame, { ...props, ref: exposed, onNavigationState: states, onNavigationReset: resets, onError: errors } as never) })
  mounts.push(app)
  const iframe = renderer.all().find(node => node.type === 'iframe')!
  const target = { postMessage: vi.fn() }; iframe.contentWindow = target
  const connect = () => (iframe.props.onLoad as () => Promise<void>)()
  return { api, states, resets, errors, props, exposed, target, connect, app }
}

beforeEach(() => {
  channels.length = 0
  vi.stubGlobal('MessageChannel', class { port1 = new Port(); port2 = new Port(); constructor() { channels.push(this) } })
})
afterEach(() => { for (const app of mounts.splice(0)) app.unmount(); vi.unstubAllGlobals() })

describe('authorized first-party navigation messages', () => {
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
