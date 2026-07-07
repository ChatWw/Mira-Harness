import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { LayoutMode, LayoutConfig, PageTransition } from '@/types'

const DEFAULT_APP_NAME = '中台基座'

const DEFAULT_CONFIG: LayoutConfig = {
  mode: 'sidebar-header',
  showLogo: true,
  fixedHeader: false,
  dynamicTitle: DEFAULT_APP_NAME,
  pageTransition: 'fade-slide',
}

export const useLayoutStore = defineStore('layout', () => {
  // 布局配置
  const config = ref<LayoutConfig>({ ...DEFAULT_CONFIG })

  // 配置面板显示状态
  const settingsVisible = ref(false)

  // 设置布局模式
  function setLayoutMode(mode: LayoutMode) {
    config.value.mode = mode
  }

  // 切换 Logo 显示
  function toggleLogo() {
    config.value.showLogo = !config.value.showLogo
  }

  // 切换固定顶栏
  function toggleFixedHeader() {
    config.value.fixedHeader = !config.value.fixedHeader
  }

  // 设置动态标题
  function setDynamicTitle(title: string) {
    config.value.dynamicTitle = title || DEFAULT_APP_NAME
  }

  // 设置页面切换动画
  function setPageTransition(transition: PageTransition) {
    config.value.pageTransition = transition
  }

  // 打开配置面板
  function openSettings() {
    settingsVisible.value = true
  }

  // 关闭配置面板
  function closeSettings() {
    settingsVisible.value = false
  }

  // 重置配置
  function resetConfig() {
    config.value = { ...DEFAULT_CONFIG }
  }

  // 监听动态标题变化，更新 document.title
  watch(
    () => config.value.dynamicTitle,
    (newTitle) => {
      document.title = newTitle || DEFAULT_APP_NAME
    },
    { immediate: true }
  )

  return {
    config,
    settingsVisible,
    setLayoutMode,
    toggleLogo,
    toggleFixedHeader,
    setDynamicTitle,
    setPageTransition,
    openSettings,
    closeSettings,
    resetConfig,
  }
}, {
  persist: {
    key: 'cp-layout-config',
    storage: localStorage,
    pick: ['config'],
  },
})
