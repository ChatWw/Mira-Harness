<template>
  <div class="micro-app-root">
  <PageContainer :title="pageTitle" :description="pageDescription" :show-header="showPageHeader">
    <AppLoadingOverlay class="micro-app-loading" :active="loading" text="正在加载微应用…">
    <el-card shadow="never" class="micro-app-host">
      <el-result v-if="error" icon="error" title="微应用无法加载" :sub-title="error">
        <template #extra>
          <el-button v-if="entryUrl" type="primary" @click="openInNewWindow">在新窗口打开</el-button>
          <el-button @click="load">重试</el-button>
        </template>
      </el-result>

      <template v-else-if="app && entryUrl">
        <WujieVue
          v-if="app.integrationMode === 'wujie' && runtime"
          :key="app.code"
          class="micro-app-frame"
          width="100%"
          height="100%"
          :name="app.code"
          :url="entryUrl"
          :alive="runtime.alive"
          :sync="false"
          :prefix="runtime.prefix"
          :props="childProps"
          :after-mount="handleWujieMounted"
          @load-error="handleWujieError"
        />
        <EmbeddedWebFrame
          v-else
          :url="entryUrl"
          :title="app.name"
          :policy="app.runtimeConfig.kind === 'iframe' ? app.runtimeConfig.iframe : undefined"
          fill
        />
      </template>
    </el-card>
    </AppLoadingOverlay>
  </PageContainer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WujieVue from 'wujie-vue3'
import PageContainer from '@/components/PageContainer/index.vue'
import { findRuntimeMicroApp } from '@/config/runtime'
import { getMicroAppChildPath, resolveMicroAppEntryUrl, resolveNavigation, resolvePlatformPathForChild } from '@/config/navigation'
import { getPlatformApi } from '@/platform'
import { useThemeStore } from '@/stores/theme'
import type { MicroApp, PlatformContext, PlatformNavigatePayload, WujieRuntimeConfig } from '@/types'
import EmbeddedWebFrame from '../components/EmbeddedWebFrame.vue'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()
const app = ref<MicroApp>()
const runtime = ref<WujieRuntimeConfig>()
const entryUrl = ref('')
const entryRootUrl = ref('')
const loading = ref(true)
const error = ref('')

const navigation = computed(() => resolveNavigation(route.path))
const pageTitle = computed(() => navigation.value.menu?.title || app.value?.name || '微应用')
const pageDescription = computed(() => navigation.value.menu?.description ?? app.value?.description ?? '正在加载微应用配置')
const showPageHeader = computed(() => navigation.value.menu?.showPageHeader !== false)
const childRoute = computed(() => app.value ? getMicroAppChildPath(app.value, route.path) : '')

const childProps = computed(() => {
  const context: PlatformContext = Object.freeze({
    version: 1,
    theme: themeStore.themeMode,
    language: navigator.language,
    user: Object.freeze({ id: 'platform', name: 'Mira' }),
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
  if (!app.value || app.value.integrationMode !== 'wujie' || runtime.value?.routeMode !== 'platform') return
  const payload: PlatformNavigatePayload = { appCode: app.value.code, path: childRoute.value }
  WujieVue.bus.$emit('platform:route-change', payload)
  WujieVue.bus.$emit(`platform:route-change:${app.value.code}`, payload)
}

function handleWujieMounted() {
  emitRouteToChild()
}

function handleChildNavigate(payload: PlatformNavigatePayload) {
  if (!app.value || app.value.integrationMode !== 'wujie' || runtime.value?.routeMode !== 'platform') return
  if (!payload || typeof payload.path !== 'string') return
  if (payload.appCode && payload.appCode !== app.value.code) return
  router.push(resolvePlatformPathForChild(app.value, payload.path))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const code = String(route.params.code)
    const microApp = findRuntimeMicroApp(code)
    if (!microApp) throw new Error('未找到该微应用')
    if (!microApp.enabled) throw new Error('该应用已停用')
    const entryRoot = microApp.entry.type === 'local-directory'
      ? await getPlatformApi()?.resolveLocalMicroAppUrl(microApp.id)
      : microApp.entry.url
    if (!entryRoot) throw new Error('本地微应用仅能在桌面端中加载')
    const nextEntryUrl = resolveMicroAppEntryUrl(microApp, route.path, entryRoot)
    const reuseMountedWujie = app.value?.code === microApp.code
      && microApp.integrationMode === 'wujie'
      && Boolean(entryUrl.value)
    app.value = microApp
    runtime.value = microApp.runtimeConfig.kind === 'wujie' ? microApp.runtimeConfig : undefined
    entryRootUrl.value = entryRoot
    if (!reuseMountedWujie) entryUrl.value = nextEntryUrl
    if (microApp.integrationMode === 'wujie' && microApp.runtimeConfig.kind === 'wujie' && microApp.runtimeConfig.preload) {
      WujieVue.preloadApp({
        name: microApp.code,
        url: entryRootUrl.value,
        props: childProps.value,
      })
    }
  } catch (cause: any) {
    app.value = undefined
    runtime.value = undefined
    entryUrl.value = ''
    entryRootUrl.value = ''
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
.micro-app-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.page-container) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    .page-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  }
}

.micro-app-loading {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.micro-app-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.el-card__body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.micro-app-frame { display: block; width: 100%; flex: 1; min-height: 0; border: 0; }
</style>
