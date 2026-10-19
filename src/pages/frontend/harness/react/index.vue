<template>
  <main class="harness-react-host">
    <p v-if="error" class="harness-react-host__error" role="alert">{{ error }} <router-link to="/workspace/chat">使用旧版工作台</router-link></p>
    <p v-else-if="!url" class="harness-react-host__loading">正在加载 Harness…</p>
    <FirstPartyFrame v-else ref="appFrame" :url="url" title="Mira Harness" :manifest="manifest" :api="api!" :context="context" :toggle-theme="toggleShellTheme" :get-appearance="getAppearance" :set-theme="setShellTheme" route="/" :navigate="navigate" :navigation-snapshot="navigationSnapshot" @navigation-state="navigationOwner.receive" @navigation-reset="navigationOwner.reset" @error="error = $event" />
    <p v-if="routeError" class="harness-react-host__route-error" role="alert">{{ routeError }}</p>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { firstPartyAppManifests } from '@/config/firstPartyApps'
import { getPlatformApi } from '@/platform'
import { navigateHarnessHost } from '@/platform/firstPartyNavigation'
import { useThemeStore } from '@/stores/theme'
import { useAppNavigationStore } from '@/stores/appNavigation'
import FirstPartyFrame from '@/pages/frontend/microAppHost/FirstPartyFrame.vue'

const api = getPlatformApi()
const router = useRouter()
const theme = useThemeStore()
function toggleShellTheme() { theme.toggleThemeMode(); return theme.themeMode }
const getAppearance = () => ({ theme: theme.themePreference, zoomFactor: api?.getDesktopZoomFactor?.() ?? 1 })
const setShellTheme = (value: 'system' | 'light' | 'dark') => theme.setThemePreference(value)
const manifest = firstPartyAppManifests.find(item => item.appId === 'mira-harness')!
const context = computed(() => ({ version: 1 as const, theme: theme.themeMode, language: navigator.language, primaryColor: theme.primaryColor, onPrimary: theme.onPrimaryColor, user: { id: 'platform', name: 'Mira' } }))
const url = ref('')
const error = ref('')
const routeError = ref('')
const appFrame = ref<InstanceType<typeof FirstPartyFrame>>()
const appNavigation = useAppNavigationStore()
const navigationSnapshot = appNavigation.getSavedSnapshot('mira-harness')
const navigationOwner = appNavigation.register('mira-harness', command => appFrame.value?.navigateHistory(command) ?? false)
const navigate = (path: string) => navigateHarnessHost(router, path)
const openCommandCenter = () => appFrame.value?.openCommandCenter()
let disposed = false
let closing = false
function closeContext(event: Event) {
  event.preventDefault()
  if (closing) return
  closing = true; routeError.value = ''
  const activeFrame = appFrame.value
  void (async () => {
    try {
      if (!activeFrame || error.value) throw new Error('Harness 连接尚未就绪，已保留当前窗口')
      const consumed = await activeFrame.closeContext()
      if (!consumed && !disposed && appFrame.value === activeFrame) await api?.windowCommand('close')
    } catch (cause) { if (!disposed) routeError.value = cause instanceof Error ? cause.message : '关闭失败，已保留当前窗口' }
    finally { closing = false }
  })()
}
onBeforeUnmount(() => { disposed = true; navigationOwner.release(); window.removeEventListener('mira:open-harness-command-center', openCommandCenter); window.removeEventListener('mira:close-active-context', closeContext) })
onBeforeRouteLeave(async () => {
  if (!url.value || error.value) return true
  routeError.value = ''
  try {
    if (!appFrame.value) throw new Error('Harness 连接尚未就绪，无法确认草稿保存')
    await appFrame.value.prepareLeave()
    return true
  } catch (cause) {
    routeError.value = cause instanceof Error ? cause.message : '草稿保存失败，已保留当前页面'
    return false
  }
})
onMounted(async () => {
  window.addEventListener('mira:open-harness-command-center', openCommandCenter)
  window.addEventListener('mira:close-active-context', closeContext)
  if (!api) { error.value = 'Harness 仅在 Mira 桌面版可用'; return }
  try { url.value = new URL(manifest.entry.path, await api.resolveLocalMicroAppUrl('micro-mira-harness')).href }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Harness 资源加载失败' }
})
</script>

<style scoped>
.harness-react-host { position: relative; display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column; color: var(--cp-text); background: var(--cp-bg); }
.harness-react-host__error a { color: var(--cp-text-secondary); }
.harness-react-host__error, .harness-react-host__loading { padding: 24px; font-size: 13px; }
.harness-react-host__route-error { position: absolute; z-index: 3; top: 12px; right: 16px; max-width: min(460px, calc(100% - 32px)); margin: 0; padding: 10px 14px; border: 1px solid var(--cp-border); border-radius: 8px; color: var(--cp-text); background: var(--cp-bg); box-shadow: 0 4px 16px rgb(0 0 0 / .12); font-size: 13px; line-height: 1.5; }
</style>
