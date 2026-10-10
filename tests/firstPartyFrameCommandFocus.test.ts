// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createApp, h, nextTick, reactive, ref, ssrContextKey, type App } from 'vue'
import FirstPartyFrame from '../src/pages/frontend/microAppHost/FirstPartyFrame.vue'
import { withVueClientRender } from './helpers/vueNodeRenderer'

vi.mock('@/platform/firstPartyBridge', () => ({
  FirstPartyBridgeError: class extends Error {}, isFirstPartyRequest: () => false, handleFirstPartyRequest: vi.fn(),
}))

class Port {
  postMessage = vi.fn(); close = vi.fn(); start = vi.fn()
  onmessage?: (event: { data: unknown }) => unknown
  receive(data: unknown) { return this.onmessage?.({ data }) }
}
const channels: { port1: Port; port2: Port }[] = []
const Frame = withVueClientRender(FirstPartyFrame, pathToFileURL(resolve('src/pages/frontend/microAppHost/FirstPartyFrame.vue')))
let app: App | undefined
const settle = async () => { await nextTick(); await Promise.resolve(); await nextTick() }

async function mountFrame() {
  const api = { createFirstPartyGrant: vi.fn(async () => 'grant-' + channels.length), revokeFirstPartyGrant: vi.fn(async () => undefined), onHarnessEvent: vi.fn(() => vi.fn()) }
  const props = reactive({ url: 'about:blank', title: 'Mira Harness', api, manifest: { appId: 'mira-harness', capabilities: ['harness:workbench'] }, context: { version: 1, theme: 'light', language: 'zh-CN', user: { id: 'platform', name: 'Mira' } }, route: '/', navigate: vi.fn() })
  const exposed = ref<{ openCommandCenter(): void }>()
  const container = document.createElement('div'); document.body.append(container)
  app = createApp({ setup: () => () => h(Frame, { ...props, ref: exposed } as never) })
  app.provide(ssrContextKey, {}); app.mount(container)
  const iframe = container.querySelector('iframe')!
  const target = { postMessage: vi.fn() }; Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: target })
  iframe.dispatchEvent(new Event('load')); await settle()
  const opener = document.createElement('button'); opener.textContent = 'Shell 搜索'; document.body.append(opener)
  const open = () => { opener.focus(); exposed.value!.openCommandCenter(); return channels.at(-1)!.port1.postMessage.mock.calls.at(-1)![0] as { type: string; focusRequestId: string } }
  const dismiss = (focusRequestId: unknown, port = channels.at(-1)!.port1) => port.receive({ type: 'mira:command-center-dismiss', focusRequestId })
  return { props, exposed, iframe, opener, open, dismiss }
}

beforeEach(() => {
  channels.length = 0
  vi.stubGlobal('MessageChannel', class { port1 = new Port(); port2 = new Port(); constructor() { channels.push(this) } })
  window.happyDOM.settings.disableIframePageLoading = true
  const consoleError = console.error
  vi.spyOn(console, 'error').mockImplementation((...values) => {
    // happy-dom reports deliberately disabled page loading; preserve every unrelated error.
    if (values[0] instanceof DOMException && values[0].name === 'NotSupportedError' && values[0].message.endsWith('Iframe page loading is disabled.')) return
    consoleError(...values)
  })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Shell command center dismissal focus through real Vue DOM', () => {
  it('restores the actual parent opener once after a matching dismissal from the active granted port', async () => {
    const frame = await mountFrame(), request = frame.open()
    expect(request.type).toBe('mira:command-center-open'); expect(request.focusRequestId).toEqual(expect.any(String))
    frame.iframe.focus(); expect(document.activeElement).toBe(frame.iframe)
    await frame.dismiss(request.focusRequestId); expect(document.activeElement).toBe(frame.opener)
    frame.iframe.focus(); await frame.dismiss(request.focusRequestId)
    expect(document.activeElement).toBe(frame.iframe)
  })

  it('rejects old, malformed and superseded replies without consuming the latest opening', async () => {
    const frame = await mountFrame(), old = frame.open(), current = frame.open()
    expect(current.focusRequestId).not.toBe(old.focusRequestId)
    frame.iframe.focus()
    for (const invalid of [old.focusRequestId, undefined, null, {}, 1]) await frame.dismiss(invalid)
    await channels[0].port1.receive({ type: 'mira:command-center-dismiss', focusRequestId: current.focusRequestId, selector: 'button' })
    expect(document.activeElement).toBe(frame.iframe)
    await frame.dismiss(current.focusRequestId); expect(document.activeElement).toBe(frame.opener)
  })

  it('preserves a newer control focus and consumes its request so a late duplicate cannot steal it', async () => {
    const frame = await mountFrame(), request = frame.open()
    const other = document.createElement('input'); document.body.append(other); other.focus()
    await frame.dismiss(request.focusRequestId); expect(document.activeElement).toBe(other)
    frame.iframe.focus(); await frame.dismiss(request.focusRequestId); expect(document.activeElement).toBe(frame.iframe)
  })

  it('restores from an unfocused document body and clears a failed send before its stale reply arrives', async () => {
    const frame = await mountFrame(), request = frame.open()
    frame.opener.blur(); expect(document.activeElement).toBe(document.body)
    await frame.dismiss(request.focusRequestId); expect(document.activeElement).toBe(frame.opener)
    const port = channels[0].port1
    port.postMessage.mockImplementationOnce(() => { throw new Error('port closed during send') })
    const failed = frame.open(); frame.iframe.focus(); await frame.dismiss(failed.focusRequestId)
    expect(document.activeElement).toBe(frame.iframe)
    const retry = frame.open(); frame.iframe.focus(); await frame.dismiss(retry.focusRequestId)
    expect(document.activeElement).toBe(frame.opener)
  })

  it.each(['route', 'url', 'manifest', 'unmount'] as const)('invalidates a pending opener on %s changes', async kind => {
    const frame = await mountFrame(), request = frame.open(), oldPort = channels[0].port1
    if (kind === 'route') frame.props.route = '/settings/general'
    else if (kind === 'url') frame.props.url = 'about:blank#retry'
    else if (kind === 'manifest') frame.props.manifest.capabilities = []
    else { app!.unmount(); app = undefined }
    await settle()
    const other = document.createElement('button'); document.body.append(other); other.focus(); other.blur()
    await frame.dismiss(request.focusRequestId, oldPort)
    expect(document.activeElement).toBe(document.body)
  })

  it.each(['removed', 'disabled', 'hidden', 'inert', 'aria-hidden', 'display-none', 'visibility-hidden'] as const)('does not restore an opener that becomes %s', async kind => {
    const frame = await mountFrame(), request = frame.open()
    if (kind === 'removed') frame.opener.remove()
    else if (kind === 'disabled') frame.opener.disabled = true
    else if (kind === 'hidden') frame.opener.hidden = true
    else if (kind === 'inert') frame.opener.setAttribute('inert', '')
    else if (kind === 'aria-hidden') frame.opener.setAttribute('aria-hidden', 'true')
    else if (kind === 'display-none') frame.opener.style.display = 'none'
    else frame.opener.style.visibility = 'hidden'
    frame.iframe.focus(); await frame.dismiss(request.focusRequestId)
    expect(document.activeElement).toBe(frame.iframe)
  })

  it('checks ancestor visibility and leaves openings originating inside the iframe without a parent target', async () => {
    const frame = await mountFrame()
    const wrapper = document.createElement('div'); document.body.append(wrapper); wrapper.append(frame.opener)
    const request = frame.open(); wrapper.style.display = 'none'; frame.iframe.focus()
    await frame.dismiss(request.focusRequestId); expect(document.activeElement).toBe(frame.iframe)
    frame.exposed.value!.openCommandCenter()
    const inside = channels[0].port1.postMessage.mock.calls.at(-1)![0] as { focusRequestId: string }
    frame.iframe.blur(); await frame.dismiss(inside.focusRequestId)
    expect(document.activeElement).toBe(document.body)
  })
})
