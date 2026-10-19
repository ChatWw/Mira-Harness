<template>
  <div ref="stage" class="first-party-stage">
    <iframe
      ref="frame"
      class="first-party-frame"
      :src="url"
      :title="title"
      sandbox="allow-scripts allow-forms"
      :allow="manifest.appId === 'mira-harness' && manifest.capabilities.includes('harness:workbench') ? 'clipboard-write *' : undefined"
      referrerpolicy="no-referrer"
      @load="connect"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { PLATFORM_API_VERSION, type FirstPartyAppManifest } from '@/config/firstPartyApps'
import { FirstPartyBridgeError, handleFirstPartyRequest, isFirstPartyRequest } from '@/platform/firstPartyBridge'
import { FirstPartyConnectionSession } from '@/platform/firstPartySession'
import { parseFirstPartyHarnessCall } from '@/platform/firstPartyHarness'
import { MiraHostedBrowsers } from '@/platform/miraHostedBrowsers'
import { readMiraAppNavigationCommand, readMiraAppNavigationState, type MiraAppNavigationCommand, type MiraAppNavigationSnapshot, type MiraAppNavigationState } from '@/platform/appNavigation'
import type { PlatformApi, PlatformContext } from '@/types'


const props = defineProps<{
  url: string
  title: string
  manifest: FirstPartyAppManifest
  api: PlatformApi
  context: PlatformContext
  route: string
  navigate: (path: string) => void | Promise<void>
  toggleTheme?: () => 'light' | 'dark'
  getAppearance?: () => { theme: string; zoomFactor: number }
  setTheme?: (theme: 'system' | 'light' | 'dark') => void
  navigationSnapshot?: MiraAppNavigationSnapshot
}>()
const emit = defineEmits<{ error: [message: string]; navigationState: [state: MiraAppNavigationState]; navigationReset: [] }>()
const stage = ref<HTMLDivElement>()
const frame = ref<HTMLIFrameElement>()
let port: MessagePort | undefined
let unsubscribeHarness: (() => void) | undefined
const browsers = new MiraHostedBrowsers(() => stage.value, event => send({ type: 'mira:browser-event', event }), (sessionId, browserId, guestId) => props.api.bindHostedBrowser?.(sessionId, browserId, guestId) ?? Promise.resolve())
let disposed = false
let connectedOnce = false
let commandFocus: { id: string; port: MessagePort; target?: HTMLElement } | undefined
const session = new FirstPartyConnectionSession(id => props.api.revokeFirstPartyGrant(id))

function invalidateConnection() { commandFocus = undefined; browsers.clear(); unsubscribeHarness?.(); unsubscribeHarness = undefined; session.invalidate(); port = undefined; emit('navigationReset') }

function send(message: unknown) {
  try { port?.postMessage(message) } catch { /* 页面切换时端口可能已被关闭 */ }
}

function visibleFocusTarget(target: HTMLElement) {
  if (!target.isConnected || target.closest('[hidden], [inert], [aria-hidden="true"]') || target.matches(':disabled, [aria-disabled="true"]')) return false
  for (let element: HTMLElement | null = target; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}
function openCommandCenter() {
  if (disposed || !port || !hasHarnessNavigation()) return
  const active = document.activeElement
  const target = active instanceof HTMLElement && active !== frame.value && active !== document.body && active !== document.documentElement && !stage.value?.contains(active) && visibleFocusTarget(active) ? active : undefined
  const request = { id: crypto.randomUUID(), port, target }
  commandFocus = request
  try { port.postMessage({ type: 'mira:command-center-open', focusRequestId: request.id }) }
  catch { if (commandFocus === request) commandFocus = undefined }
}
function restoreCommandFocus(message: unknown, activePort: MessagePort) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || !('type' in message) || message.type !== 'mira:command-center-dismiss') return false
  const request = commandFocus
  if (Object.keys(message).length !== 2 || !request || request.port !== activePort || port !== activePort || !('focusRequestId' in message) || message.focusRequestId !== request.id) return true
  commandFocus = undefined
  const active = document.activeElement
  if (!request.target || !visibleFocusTarget(request.target) || active !== frame.value && active !== document.body && active !== document.documentElement) return true
  request.target.focus({ preventScroll: true })
  return true
}
function hasHarnessNavigation() { return props.manifest.appId === 'mira-harness' && props.manifest.capabilities.includes('harness:workbench') }
function navigateHistory(command: MiraAppNavigationCommand) {
  const message = readMiraAppNavigationCommand(command)
  if (disposed || !port || !hasHarnessNavigation() || !message) return false
  try { port.postMessage(message); return true } catch { return false }
}
function prepareLeave() {
  const activePort = port
  if (disposed || !activePort) return Promise.reject(new Error('Harness 连接尚未就绪，无法确认草稿保存'))
  return session.prepareLeave(message => activePort.postMessage(message))
}
function closeContext() {
  const activePort = port
  if (disposed || !activePort || !hasHarnessNavigation()) return Promise.reject(new Error('Harness 连接尚未就绪，已保留当前窗口'))
  return session.closeContext(message => activePort.postMessage(message))
}
defineExpose({ prepareLeave, openCommandCenter, navigateHistory, closeContext })


async function connect() {
  if (connectedOnce) {
    invalidateConnection()
    emit('error', '应用页面已重新导航，授权已撤销。请从平台重试加载。')
    return
  }
  const currentGeneration = session.begin()
  commandFocus = undefined
  port = undefined
  emit('navigationReset')
  const target = frame.value?.contentWindow
  if (!target) return
  const channel = new MessageChannel()
  let nextGrant: string
  try {
    nextGrant = await props.api.createFirstPartyGrant(props.manifest.appId)
  } catch (error) {
    connectedOnce = false
    channel.port1.close()
    if (!disposed && session.isCurrent(currentGeneration)) emit('error', error instanceof Error ? error.message : '应用授权失败')
    return
  }
  if (disposed || !session.isCurrent(currentGeneration) || target !== frame.value?.contentWindow) {
    connectedOnce = false
    channel.port1.close()
    void props.api.revokeFirstPartyGrant(nextGrant).catch(() => undefined)
    return
  }
  const activePort = channel.port1
  if (!session.activate(currentGeneration, nextGrant, activePort)) {
    connectedOnce = false
    activePort.close()
    void props.api.revokeFirstPartyGrant(nextGrant).catch(() => undefined)
    return
  }
  port = activePort
  connectedOnce = true
  if (props.manifest.appId === 'mira-harness' && props.manifest.capabilities.includes('harness:workbench')) {
    unsubscribeHarness = props.api.onHarnessEvent(event => {
      if (session.canForwardHarnessEvent(nextGrant, activePort, event)) send({ type: 'mira:harness-event', event })
    })
  }
  activePort.onmessage = async event => {
    if (!session.isActive(nextGrant, activePort)) return
    if (restoreCommandFocus(event.data, activePort)) return
    const navigationState = readMiraAppNavigationState(event.data)
    if (navigationState) { if (hasHarnessNavigation()) emit('navigationState', navigationState); return }
    if (session.receiveLeaveReady(event.data)) return
    if (session.receiveCloseReady(event.data)) return
    if (!isFirstPartyRequest(event.data)) return
    const request = event.data
    try {
      const invoke = async (guestId?: number) => {
        const value = await handleFirstPartyRequest({
          manifest: props.manifest,
          grantId: nextGrant,
          api: props.api,
          context: props.context,
          route: props.route,
          navigate: props.navigate,
          toggleTheme: props.toggleTheme,
          getAppearance: props.getAppearance,
          setTheme: props.setTheme,
        }, ['harness.browser.viewport', 'harness.browser.pick', 'harness.browser.protection'].includes(request.method) ? { ...request, params: { ...(request.params as Record<string, unknown>), guestId } } : request)
        if (!session.isActive(nextGrant, activePort)) throw new Error('应用授权已失效')
        return value
      }
      let browserCall: ReturnType<typeof parseFirstPartyHarnessCall> | undefined
      if (['harness.browser.navigate', 'harness.browser.bounds', 'harness.browser.control', 'harness.browser.viewport', 'harness.browser.pick', 'harness.browser.protection'].includes(request.method)) {
        try { browserCall = parseFirstPartyHarnessCall(request.method.slice('harness.'.length), request.params) } catch { /* canonical bridge reports invalid requests */ }
      }
      const responseValue = browserCall && (browserCall.method === 'browser.navigate' || browserCall.method === 'browser.bounds' || browserCall.method === 'browser.control' || browserCall.method === 'browser.viewport' || browserCall.method === 'browser.pick' || browserCall.method === 'browser.protection') ? await browsers.request(browserCall, invoke) : await invoke()
      if (session.isActive(nextGrant, activePort)) activePort.postMessage({ type: 'mira:response', id: request.id, ok: true, value: responseValue })
    } catch (error) {
      const known = error instanceof FirstPartyBridgeError
      if (session.isActive(nextGrant, activePort)) activePort.postMessage({
        type: 'mira:response', id: request.id, ok: false,
        error: { code: known ? error.code : 'PLATFORM_ERROR', message: known ? error.message : '平台调用失败' },
      })
    }
  }
  activePort.start()
  try {
    target.postMessage({ type: 'mira:connect', grantId: nextGrant, apiVersion: { ...PLATFORM_API_VERSION } }, '*', [channel.port2])
    send({ type: 'mira:context', context: props.context })
    if (hasHarnessNavigation()) send({ type: 'mira:app-navigation-restore', snapshot: props.navigationSnapshot })
  } catch (error) {
    invalidateConnection()
    if (!disposed) emit('error', error instanceof Error ? error.message : '应用连接失败')
  }
}

watch(() => props.url, () => { invalidateConnection(); connectedOnce = false })
watch(() => `${props.manifest.appId}:${props.manifest.capabilities.includes('harness:workbench')}`, invalidateConnection)
watch(() => props.route, route => { commandFocus = undefined; send({ type: 'mira:route', route }) })
watch(() => props.context, context => send({ type: 'mira:context', context }), { deep: true })
onBeforeUnmount(() => { disposed = true; invalidateConnection() })
</script>

<style scoped>
.first-party-stage { position: relative; display: flex; width: 100%; min-height: 0; flex: 1; overflow: hidden; }
.first-party-frame { display: block; width: 100%; height: 100%; flex: 1; min-height: 0; border: 0; }
</style>
