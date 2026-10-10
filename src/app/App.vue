<template>
  <el-config-provider :size="layoutStore.config.componentSize">
    <AppErrorBoundary><router-view /></AppErrorBoundary>
    <AppLoadingOverlay :active="globalLoading.active.value" :text="globalLoading.text.value" global />
  </el-config-provider>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useLayoutStore } from '@/stores/layout'
import { useHarnessStore } from '@/stores/harness'
import { useAppNavigationStore } from '@/stores/appNavigation'
import { miraAppNavigationShortcut } from '@/platform/appNavigation'
import { getPlatformApi } from '@/platform'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'
import AppErrorBoundary from '@/components/AppErrorBoundary.vue'
import { useLoading } from '@/hooks/useLoading'

const themeStore = useThemeStore()
const layoutStore = useLayoutStore()
const harnessStore = useHarnessStore()
const appNavigation = useAppNavigationStore()
const globalLoading = useLoading()
const router = useRouter()

function handleGlobalKeydown(event: KeyboardEvent) {
  const direction = miraAppNavigationShortcut(event)
  if (direction && router.currentRoute.value.path === '/workspace/harness-react') {
    const modalOpen = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], .el-dialog, .el-drawer, .mira-app-switcher-popper')].some(element => element.getClientRects().length > 0)
    if (!modalOpen && appNavigation.go(direction)) event.preventDefault()
    return
  }
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
