<template>
  <PageContainer :title="app?.name || '微应用'" :description="app?.description || '正在加载微应用配置'">
    <el-card shadow="never" class="micro-app-host" v-loading="loading">
      <el-result v-if="error" icon="error" title="微应用无法加载" :sub-title="error">
        <template #extra>
          <el-button v-if="entryUrl" type="primary" @click="openInNewWindow">在新窗口打开</el-button>
          <el-button @click="load">重试</el-button>
        </template>
      </el-result>

      <template v-else-if="app && runtime && entryUrl">
        <WujieVue
          v-if="app.integrationMode === 'wujie'"
          :key="app.code"
          class="micro-app-frame"
          width="100%"
          height="100%"
          :name="app.code"
          :url="entryUrl"
          :alive="runtime.alive"
          :sync="runtime.sync"
          :fiber="runtime.fiber"
          :prefix="runtime.prefix"
          :props="childProps"
          @load-error="handleWujieError"
        />
        <iframe
          v-else
          ref="iframeRef"
          class="micro-app-frame"
          :src="entryUrl"
          :sandbox="runtime.iframe.sandbox"
          :referrerpolicy="runtime.iframe.referrerPolicy"
          title="微应用"
          @load="handleIframeLoad"
          @error="handleIframeError"
        />
      </template>
    </el-card>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import WujieVue from 'wujie-vue3'
import PageContainer from '@/components/PageContainer/index.vue'
import { findMicroApp } from '@/config/microApps'
import { useThemeStore } from '@/stores/theme'
import type { MicroApp, MicroAppRuntimeConfig, PlatformContext } from '@/types'

const route = useRoute()
const themeStore = useThemeStore()
const app = ref<MicroApp>()
const runtime = ref<MicroAppRuntimeConfig>()
const entryUrl = ref('')
const loading = ref(true)
const error = ref('')
const iframeRef = ref<HTMLIFrameElement>()
let iframeTimer: number | undefined

const childProps = computed(() => {
  if (!runtime.value) return {}
  const context: PlatformContext = Object.freeze({
    version: 1,
    theme: runtime.value.props.theme || themeStore.themeMode,
    language: runtime.value.props.language || navigator.language,
    ...(runtime.value.props.tenantId ? { tenantId: runtime.value.props.tenantId } : {}),
    user: Object.freeze({ id: 'platform', name: 'Core Platform' }),
  })
  return Object.freeze({ platformContext: context })
})

function resolveEntryUrl(url: string) {
  const resolved = new URL(url, window.location.origin)
  if (resolved.origin !== window.location.origin || !resolved.pathname.startsWith('/')) {
    throw new Error('入口必须是同源路径')
  }
  return resolved.href
}

function clearIframeTimer() {
  if (iframeTimer !== undefined) window.clearTimeout(iframeTimer)
  iframeTimer = undefined
}

function startIframeTimer() {
  clearIframeTimer()
  const timeout = runtime.value?.iframe.timeout || 15
  iframeTimer = window.setTimeout(() => {
    error.value = `应用加载超过 ${timeout} 秒，请检查入口或嵌入策略`
  }, timeout * 1000)
}

function handleIframeLoad() { clearIframeTimer() }
function handleIframeError() { clearIframeTimer(); error.value = 'iframe 加载失败，请检查入口或嵌入策略' }
function handleWujieError() { error.value = 'Wujie 子应用加载失败，请检查入口、静态资源基路径或应用准入配置' }
function openInNewWindow() { window.open(entryUrl.value, '_blank', 'noopener,noreferrer') }

async function load() {
  clearIframeTimer()
  loading.value = true
  error.value = ''
  entryUrl.value = ''
  try {
    const code = String(route.params.code)
    const microApp = findMicroApp(code)
    if (!microApp) throw new Error('未找到该微应用')
    if (microApp.status !== 'published') throw new Error('该应用未上架')
    if (!microApp.embedAllowed) throw new Error('该应用未获准嵌入平台')
    if (microApp.healthStatus === 'unavailable') throw new Error('该应用当前不可用')
    app.value = microApp
    runtime.value = microApp.runtimeConfig
    entryUrl.value = resolveEntryUrl(microApp.url)
    if (microApp.integrationMode === 'iframe') startIframeTimer()
    if (microApp.integrationMode === 'wujie' && microApp.runtimeConfig.preload) {
      WujieVue.preloadApp({ name: microApp.code, url: entryUrl.value, props: childProps.value, exec: microApp.runtimeConfig.exec })
    }
  } catch (cause: any) {
    error.value = cause.message || '获取微应用配置失败'
  } finally {
    loading.value = false
  }
}

watch(() => route.params.code, load, { immediate: true })
onBeforeUnmount(clearIframeTimer)
</script>

<style scoped lang="scss">
.micro-app-host { min-height: 620px; }
.micro-app-frame { display: block; width: 100%; min-height: 560px; border: 0; }
</style>
