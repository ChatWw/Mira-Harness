<template>
  <el-config-provider :size="layoutStore.config.componentSize">
    <router-view />
    <AppLoadingOverlay :active="globalLoading.active.value" :text="globalLoading.text.value" global />
  </el-config-provider>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useLayoutStore } from '@/stores/layout'
import { useHarnessStore } from '@/stores/harness'
import { getPlatformApi } from '@/platform'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'
import { useLoading } from '@/hooks/useLoading'

const themeStore = useThemeStore()
const layoutStore = useLayoutStore()
const harnessStore = useHarnessStore()
const globalLoading = useLoading()
const router = useRouter()

function handleGlobalKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey && !event.metaKey) return

  if (event.key === ',') {
    event.preventDefault()
    void openSettingsPage('/settings/general')
  } else if (event.key.toLowerCase() === 'i') {
    event.preventDefault()
    void openSettingsPage('/settings/about')
  }
}

function openSettingsPage(path: string) {
  const currentRoute = router.currentRoute.value
  if (currentRoute.path === path) return
  return router.push({
    path,
    query: currentRoute.path.startsWith('/settings') ? currentRoute.query : { from: currentRoute.fullPath },
  })
}

let removeWindowNavigateListener: (() => void) | undefined
let removeHarnessEventListener: (() => void) | undefined

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
  removeWindowNavigateListener = window.platform?.onWindowNavigate(path => { void openSettingsPage(path) })
  removeHarnessEventListener = getPlatformApi()?.onHarnessEvent(harnessStore.applyEvent)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
  removeWindowNavigateListener?.()
  removeHarnessEventListener?.()
})
// 主题已在 store 初始化时应用
</script>
