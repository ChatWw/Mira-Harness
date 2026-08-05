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
          :sync="false"
          :fiber="runtime.fiber"
          :prefix="runtime.prefix"
          :props="childProps"
          :after-mount="handleWujieMounted"
          @load-error="handleWujieError"
        />
        <EmbeddedWebFrame
          v-else
          :url="entryUrl"
          :title="app.name"
          :policy="runtime.iframe"
        />
      </template>
    </el-card>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WujieVue from 'wujie-vue3'
import PageContainer from '@/components/PageContainer/index.vue'
import { resolveHttpUrl } from '@/config/iframe'
import { findMicroApp } from '@/config/microApps'
import { getMicroAppChildPath, resolveMicroAppEntryUrl, resolvePlatformPathForChild } from '@/config/navigation'
import { useThemeStore } from '@/stores/theme'
import type { MicroApp, MicroAppRuntimeConfig, PlatformContext, PlatformNavigatePayload } from '@/types'
import EmbeddedWebFrame from './components/EmbeddedWebFrame.vue'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()
const app = ref<MicroApp>()
const runtime = ref<MicroAppRuntimeConfig>()
const entryUrl = ref('')
const loading = ref(true)
const error = ref('')

const childRoute = computed(() => app.value ? getMicroAppChildPath(app.value, route.path) : '')

const childProps = computed(() => {
  if (!runtime.value) return {}
  const context: PlatformContext = Object.freeze({
    version: 1,
    theme: runtime.value.props.theme || themeStore.themeMode,
    language: runtime.value.props.language || navigator.language,
    ...(runtime.value.props.tenantId ? { tenantId: runtime.value.props.tenantId } : {}),
    user: Object.freeze({ id: 'platform', name: 'Core Platform' }),
  })
  return Object.freeze({
    platformContext: context,
    platformRoute: childRoute.value,
    navigate: (path: string) => handleChildNavigate({ appCode: app.value?.code || '', path }),
  })
})

function handleWujieError() {
  error.value = 'Wujie 子应用加载失败，请检查入口、静态资源基路径或应用准入配置'
}

function openInNewWindow() {
  window.open(entryUrl.value, '_blank', 'noopener,noreferrer')
}

function emitRouteToChild() {
  if (!app.value || runtime.value?.routeMode !== 'platform') return
  const payload: PlatformNavigatePayload = { appCode: app.value.code, path: childRoute.value }
  WujieVue.bus.$emit('platform:route-change', payload)
  WujieVue.bus.$emit(`platform:route-change:${app.value.code}`, payload)
}

function handleWujieMounted() {
  emitRouteToChild()
}

function handleChildNavigate(payload: PlatformNavigatePayload) {
  if (!app.value || runtime.value?.routeMode !== 'platform') return
  if (!payload || typeof payload.path !== 'string') return
  if (payload.appCode && payload.appCode !== app.value.code) return
  router.push(resolvePlatformPathForChild(app.value, payload.path))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const code = String(route.params.code)
    const microApp = findMicroApp(code)
    if (!microApp) throw new Error('未找到该微应用')
    if (microApp.status !== 'published') throw new Error('该应用未上架')
    if (!microApp.embedAllowed) throw new Error('该应用未获准嵌入平台')
    if (microApp.healthStatus === 'unavailable') throw new Error('该应用当前不可用')
    const nextEntryUrl = resolveMicroAppEntryUrl(microApp, route.path)
    const reuseMountedWujie = app.value?.code === microApp.code
      && microApp.integrationMode === 'wujie'
      && Boolean(entryUrl.value)
    app.value = microApp
    runtime.value = microApp.runtimeConfig
    if (!reuseMountedWujie) entryUrl.value = nextEntryUrl
    if (microApp.integrationMode === 'wujie' && microApp.runtimeConfig.preload) {
      WujieVue.preloadApp({
        name: microApp.code,
        url: resolveHttpUrl(microApp.url),
        props: childProps.value,
        exec: microApp.runtimeConfig.exec,
      })
    }
  } catch (cause: any) {
    app.value = undefined
    runtime.value = undefined
    entryUrl.value = ''
    error.value = cause.message || '获取微应用配置失败'
  } finally {
    loading.value = false
  }
}

WujieVue.bus.$on('platform:navigate', handleChildNavigate)
watch(() => route.fullPath, load, { immediate: true })
watch(childRoute, emitRouteToChild)
onBeforeUnmount(() => WujieVue.bus.$off('platform:navigate', handleChildNavigate))
</script>

<style scoped lang="scss">
.micro-app-host { min-height: 620px; }
.micro-app-frame { display: block; width: 100%; min-height: 560px; border: 0; }
</style>
