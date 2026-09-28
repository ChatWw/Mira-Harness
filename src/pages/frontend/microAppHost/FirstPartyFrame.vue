<template>
  <iframe
    ref="frame"
    class="first-party-frame"
    :src="url"
    :title="title"
    sandbox="allow-scripts allow-forms"
    referrerpolicy="no-referrer"
    @load="connect"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { PLATFORM_API_VERSION, type FirstPartyAppManifest } from '@/config/firstPartyApps'
import { FirstPartyBridgeError, handleFirstPartyRequest, isFirstPartyRequest } from '@/platform/firstPartyBridge'
import { FirstPartyConnectionSession } from '@/platform/firstPartySession'
import type { PlatformApi, PlatformContext } from '@/types'

const props = defineProps<{
  url: string
  title: string
  manifest: FirstPartyAppManifest
  api: PlatformApi
  context: PlatformContext
  route: string
  navigate: (path: string) => void
}>()
const emit = defineEmits<{ error: [message: string] }>()
const frame = ref<HTMLIFrameElement>()
let port: MessagePort | undefined
let unsubscribeHarness: (() => void) | undefined
let disposed = false
let connectedOnce = false
const session = new FirstPartyConnectionSession(id => props.api.revokeFirstPartyGrant(id))

function invalidateConnection() { unsubscribeHarness?.(); unsubscribeHarness = undefined; session.invalidate(); port = undefined }

function send(message: unknown) {
  try { port?.postMessage(message) } catch { /* 页面切换时端口可能已被关闭 */ }
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
      if (session.isActive(nextGrant, activePort)) send({ type: 'mira:harness-event', event })
    })
  }
  activePort.onmessage = async event => {
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
      if (session.isActive(nextGrant, activePort)) activePort.postMessage({ type: 'mira:response', id: request.id, ok: true, value })
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
.first-party-frame { display: block; width: 100%; height: 100%; flex: 1; min-height: 0; border: 0; }
</style>
