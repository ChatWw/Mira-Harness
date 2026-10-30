<template>
  <el-config-provider :size="layoutStore.config.componentSize">
    <AppErrorBoundary><AppRouterView /></AppErrorBoundary>
    <AppLoadingOverlay :active="globalLoading.active.value" :text="globalLoading.text.value" global />
  </el-config-provider>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useLayoutStore } from '@/stores/layout'
import { useAppNavigationStore } from '@/stores/appNavigation'
import { miraAppNavigationShortcut } from '@/platform/appNavigation'
import { isMiraPrimaryModifier, miraWorkbenchShortcut } from '@/platform/workbenchShortcuts'
import { getPlatformApi } from '@/platform'
import AppLoadingOverlay from '@/components/AppLoadingOverlay.vue'
import AppErrorBoundary from '@/components/AppErrorBoundary.vue'
import AppRouterView from './AppRouterView.vue'
import { useLoading } from '@/hooks/useLoading'

const themeStore = useThemeStore()
const layoutStore = useLayoutStore()
const appNavigation = useAppNavigationStore()
const globalLoading = useLoading()
const router = useRouter()

function handleGlobalKeydown(event: KeyboardEvent) {
  if (miraWorkbenchShortcut(event) === 'theme') {
    const target = event.target instanceof Element ? event.target : document.activeElement
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .xterm') || [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], .el-dialog, .el-drawer, .mira-app-switcher-popper')].some(element => element.getClientRects().length > 0)) return
    event.preventDefault()
    void themeStore.toggleThemeModeWithTransition(undefined, layoutStore.config.themeTransitionAnimation)
    return
  }
  const direction = miraAppNavigationShortcut(event)
  if (direction && router.currentRoute.value.path === '/workspace/harness-react') {
    const modalOpen = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], .el-dialog, .el-drawer, .mira-app-switcher-popper')].some(element => element.getClientRects().length > 0)
    if (!modalOpen && appNavigation.go(direction)) event.preventDefault()
    return
  }
  if (!isMiraPrimaryModifier(event) || event.defaultPrevented || event.shiftKey || event.altKey || event.repeat || event.isComposing || event.keyCode === 229) return

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
let removeWindowCloseListener: (() => void) | undefined
let removeNotificationListener: (() => void) | undefined

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
  removeWindowNavigateListener = window.platform?.onWindowNavigate(path => { void openSettingsPage(path) })
  removeWindowCloseListener = window.platform?.onWindowCloseContext?.(() => {
    const request = new Event('mira:close-active-context', { cancelable: true })
    window.dispatchEvent(request)
    if (!request.defaultPrevented) void window.platform?.windowCommand('close')
  })
  removeNotificationListener = getPlatformApi()?.onNotificationSession?.(async sessionId => {
    const failure = await router.push('/workspace/harness-react')
    if (isNavigationFailure(failure) && !isNavigationFailure(failure, NavigationFailureType.duplicated)) return
    appNavigation.openNotificationSession(sessionId)
  })
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
  removeWindowNavigateListener?.()
  removeWindowCloseListener?.()
  removeNotificationListener?.()
})
// 主题已在 store 初始化时应用
</script>
