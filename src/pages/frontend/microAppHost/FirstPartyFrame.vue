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
let loaded = false

function connect() {
  if (loaded) {
    port?.close()
    port = undefined
    emit('error', '应用页面已离开受控入口')
    return
  }
  const target = frame.value?.contentWindow
  if (!target) return
  loaded = true
  const channel = new MessageChannel()
  port = channel.port1
  port.onmessage = async event => {
    if (!isFirstPartyRequest(event.data)) return
    const request = event.data
    try {
      const value = await handleFirstPartyRequest({
        manifest: props.manifest,
        api: props.api,
        context: props.context,
        route: props.route,
        navigate: props.navigate,
      }, request)
      if (port === channel.port1) port.postMessage({ type: 'mira:response', id: request.id, ok: true, value })
    } catch (error) {
      const known = error instanceof FirstPartyBridgeError
      if (port === channel.port1) port.postMessage({
        type: 'mira:response', id: request.id, ok: false,
        error: { code: known ? error.code : 'PLATFORM_ERROR', message: known ? error.message : '平台调用失败' },
      })
    }
  }
  port.start()
  target.postMessage({ type: 'mira:connect', apiVersion: { ...PLATFORM_API_VERSION } }, '*', [channel.port2])
}

watch(() => props.route, route => port?.postMessage({ type: 'mira:route', route }))
watch(() => props.context, context => port?.postMessage({ type: 'mira:context', context }), { deep: true })
onBeforeUnmount(() => { port?.close(); port = undefined })
</script>

<style scoped>
.first-party-frame { display: block; width: 100%; height: 100%; flex: 1; min-height: 0; border: 0; }
</style>
