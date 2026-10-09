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
import type { HarnessBrowserBounds } from '@/platform/firstPartyHarness'
import type { PlatformApi, PlatformContext } from '@/types'

type HostedWebview = HTMLElement & {
  getWebContentsId(): number
  getURL(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  loadURL(url: string): Promise<void>
}
type BrowserGuestEvent = Event & { url?: string; errorCode?: number; errorDescription?: string }

const props = defineProps<{
  url: string
  title: string
  manifest: FirstPartyAppManifest
  api: PlatformApi
  context: PlatformContext
  route: string
  navigate: (path: string) => void | Promise<void>
}>()
const emit = defineEmits<{ error: [message: string] }>()
const stage = ref<HTMLDivElement>()
const frame = ref<HTMLIFrameElement>()
let port: MessagePort | undefined
let unsubscribeHarness: (() => void) | undefined
let browser: HostedWebview | undefined
let browserSessionId = ''
let browserLoading = false
let disposed = false
let connectedOnce = false
const session = new FirstPartyConnectionSession(id => props.api.revokeFirstPartyGrant(id))

function removeBrowser() { browser?.remove(); browser = undefined; browserSessionId = ''; browserLoading = false }
function invalidateConnection() { removeBrowser(); unsubscribeHarness?.(); unsubscribeHarness = undefined; session.invalidate(); port = undefined }

function send(message: unknown) {
  try { port?.postMessage(message) } catch { /* 页面切换时端口可能已被关闭 */ }
}

function openCommandCenter() { if (props.manifest.appId === 'mira-harness' && !disposed) send({ type: 'mira:command-center-open' }) }
function prepareLeave() {
  const activePort = port
  if (disposed || !activePort) return Promise.reject(new Error('Harness 连接尚未就绪，无法确认草稿保存'))
  return session.prepareLeave(message => activePort.postMessage(message))
}
defineExpose({ prepareLeave, openCommandCenter })

function browserState(error?: string) {
  if (!browser || !browserSessionId) return
  let url = browser.getAttribute('src') || ''
  let canGoBack = false
  let canGoForward = false
  try { url = browser.getURL() || url; canGoBack = browser.canGoBack(); canGoForward = browser.canGoForward() } catch { /* guest 尚未挂载 */ }
  send({ type: 'mira:browser-event', event: { sessionId: browserSessionId, url, canGoBack, canGoForward, loading: browserLoading, ...(error ? { error } : {}) } })
}

function positionBrowser(bounds: HarnessBrowserBounds) {
  if (!browser || !stage.value) return
  const width = stage.value.clientWidth
  const height = stage.value.clientHeight
  const x = Math.min(bounds.x, width)
  const y = Math.min(bounds.y, height)
  Object.assign(browser.style, {
    position: 'absolute', left: `${x}px`, top: `${y}px`,
    width: `${Math.min(bounds.width, width - x)}px`, height: `${Math.min(bounds.height, height - y)}px`,
    border: '0', zIndex: '2', background: '#fff',
  })
}

function controlBrowser(sessionId: string, action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close') {
  if (sessionId !== browserSessionId || !browser) return
  if (action === 'close') { removeBrowser(); return }
  if (action === 'hide' || action === 'show') { browser.style.display = action === 'hide' ? 'none' : 'block'; return }
  if (action === 'back' && browser.canGoBack()) browser.goBack()
  if (action === 'forward' && browser.canGoForward()) browser.goForward()
  if (action === 'reload') browser.reload()
}

async function navigateBrowser(sessionId: string, url: string, bounds: HarnessBrowserBounds) {
  if (!stage.value) throw new Error('工作区浏览器不可用')
  if (browser && browserSessionId === sessionId) {
    positionBrowser(bounds)
    await browser.loadURL(url)
    return
  }
  removeBrowser()
  const guest = document.createElement('webview') as HostedWebview
  guest.setAttribute('partition', 'persist:mira-harness-browser')
  guest.setAttribute('src', url)
  guest.addEventListener('did-start-loading', () => { browserLoading = true; browserState() })
  guest.addEventListener('did-stop-loading', () => { browserLoading = false; browserState() })
  guest.addEventListener('did-navigate', () => browserState())
  guest.addEventListener('did-navigate-in-page', () => browserState())
  guest.addEventListener('did-fail-load', event => {
    const failure = event as BrowserGuestEvent
    if (failure.errorCode !== -3) { browserLoading = false; browserState(failure.errorDescription || '网页加载失败') }
  })
  browser = guest
  browserSessionId = sessionId
  positionBrowser(bounds)
  const attached = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('工作区浏览器未能启动')), 3000)
    guest.addEventListener('did-attach', () => { window.clearTimeout(timeout); resolve() }, { once: true })
  })
  stage.value.appendChild(guest)
  await attached.catch(error => { removeBrowser(); throw error })
  browserState()
}

async function connect() {
  if (connectedOnce) {
    invalidateConnection()
    emit('error', '应用页面已重新导航，授权已撤销。请从平台重试加载。')
    return
  }
  const currentGeneration = session.begin()
  port = undefined
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
    if (session.receiveLeaveReady(event.data)) return
    if (!isFirstPartyRequest(event.data)) return
    const request = event.data
    try {
      const value = await handleFirstPartyRequest({
        manifest: props.manifest,
        grantId: nextGrant,
        api: props.api,
        context: props.context,
        route: props.route,
        navigate: props.navigate,
      }, request)
      if (!session.isActive(nextGrant, activePort)) return
      let responseValue = value
      if (request.method === 'harness.browser.navigate') {
        const result = value as { sessionId: string; url: string; bounds: HarnessBrowserBounds }
        await navigateBrowser(result.sessionId, result.url, result.bounds)
        responseValue = result.url
      } else if (request.method === 'harness.browser.bounds') {
        const result = value as { sessionId: string; bounds: HarnessBrowserBounds }
        if (browserSessionId === result.sessionId) positionBrowser(result.bounds)
        responseValue = null
      } else if (request.method === 'harness.browser.control') {
        const result = value as { sessionId: string; action: 'back' | 'forward' | 'reload' | 'hide' | 'show' | 'close' }
        controlBrowser(result.sessionId, result.action)
        responseValue = null
      }
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
  } catch (error) {
    invalidateConnection()
    if (!disposed) emit('error', error instanceof Error ? error.message : '应用连接失败')
  }
}

watch(() => props.url, () => { invalidateConnection(); connectedOnce = false })
watch(() => props.manifest.appId, invalidateConnection)
watch(() => props.route, route => send({ type: 'mira:route', route }))
watch(() => props.context, context => send({ type: 'mira:context', context }), { deep: true })
onBeforeUnmount(() => { disposed = true; invalidateConnection() })
</script>

<style scoped>
.first-party-stage { position: relative; display: flex; width: 100%; min-height: 0; flex: 1; overflow: hidden; }
.first-party-frame { display: block; width: 100%; height: 100%; flex: 1; min-height: 0; border: 0; }
</style>
