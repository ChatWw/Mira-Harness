import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { LayoutConfig } from '@/types'
import { getPreference, savePreference } from '@/platform'

export const APP_NAME = 'Mira Harness'
const SUPPORTED_LAYOUT_MODES: LayoutConfig['mode'][] = ['sidebar-header', 'sidebar-only']
const SUPPORTED_SIDEBAR_STYLES: LayoutConfig['sidebarStyle'][] = ['embedded', 'floating', 'docked']
const LEGACY_TAB_STYLE_MAP: Record<string, LayoutConfig['tabStyle']> = {
  chrome: 'personalized',
  plain: 'square',
}
const ANIMATION_DURATION_MAP: Record<LayoutConfig['animationSpeed'], string> = {
  fast: '0.2s',
  normal: '0.3s',
  slow: '0.5s',
}

const CORNER_RADIUS_VALUES: Record<LayoutConfig['cornerRadius'], Record<string, string>> = {
  sharp: {
    small: '0px',
    base: '0px',
    large: '0px',
    extraLarge: '0px',
  },
  medium: {
    small: '4px',
    base: '8px',
    large: '12px',
    extraLarge: '16px',
  },
  rounded: {
    small: '8px',
    base: '12px',
    large: '16px',
    extraLarge: '20px',
  },
}

const DEFAULT_CONFIG: LayoutConfig = {
  mode: 'sidebar-header',
  sidebarStyle: 'embedded',
  sidebarWidth: 200,
  collapsedWidth: 48,
  uniqueOpened: false,
  showLogo: false,
  showFooter: false,
  headerHeight: 48,
  showBreadcrumb: true,
  breadcrumbIcon: false,
  breadcrumbStyle: 'normal',
  enableTabs: true,
  tabStyle: 'card',
  showTabIcon: true,
  tabPersist: false,
  enableContentLayoutSettings: false,
  contentMaxWidth: 'full',
  contentPadding: 'compact',
  pageTransition: 'fade-slide',
  animationSpeed: 'normal',
  themeTransitionAnimation: false,
  cornerRadius: 'medium',
  componentSize: 'default',
  watermark: false,
  watermarkText: '',
  footerStyle: 'simple',
  footerHeight: 40,
  footerCopyright: 'Mira',
  footerYearMode: 'auto',
  footerYearStart: null,
  footerYearEnd: null,
  footerIcp: '',
  footerIcpLink: 'https://beian.miit.gov.cn/',
  footerLinks: [],
  dynamicTitle: true,
}

export const useLayoutStore = defineStore('layout', () => {
  // 布局配置
  const config = ref<LayoutConfig>({ ...DEFAULT_CONFIG, ...getPreference<Partial<LayoutConfig>>('layout', {}) })

  // 布局模式
  function setLayoutMode(mode: LayoutConfig['mode']) {
    config.value.mode = mode
  }

  function setSidebarStyle(style: LayoutConfig['sidebarStyle']) {
    config.value.sidebarStyle = style
  }

  // 侧边栏设置
  function setSidebarWidth(width: number) {
    config.value.sidebarWidth = width
  }

  function setCollapsedWidth(width: number) {
    config.value.collapsedWidth = width
  }

  function setUniqueOpened(value: boolean) {
    config.value.uniqueOpened = value
  }

  function toggleLogo() {
    config.value.showLogo = !config.value.showLogo
  }

  function setShowLogo(value: boolean) {
    config.value.showLogo = value
  }

  // 底栏设置
  function setShowFooter(value: boolean) {
    config.value.showFooter = value
  }

  function setFooterStyle(style: LayoutConfig['footerStyle']) {
    config.value.footerStyle = style
  }

  function setFooterHeight(height: number) {
    config.value.footerHeight = height
  }

  function setFooterCopyright(text: string) {
    config.value.footerCopyright = text
  }

  function setFooterYearMode(mode: LayoutConfig['footerYearMode']) {
    config.value.footerYearMode = mode
  }

  function setFooterYearStart(year: number | null) {
    config.value.footerYearStart = year
  }

  function setFooterYearEnd(year: number | null) {
    config.value.footerYearEnd = year
  }

  function setFooterIcp(text: string) {
    config.value.footerIcp = text
  }

  function setFooterIcpLink(link: string) {
    config.value.footerIcpLink = link
  }

  function setFooterLinks(links: LayoutConfig['footerLinks']) {
    config.value.footerLinks = links
  }

  // 顶栏设置
  function setHeaderHeight(height: number) {
    config.value.headerHeight = height
  }

  function setShowBreadcrumb(value: boolean) {
    config.value.showBreadcrumb = value
  }

  function setBreadcrumbIcon(value: boolean) {
    config.value.breadcrumbIcon = value
  }

  function setBreadcrumbStyle(style: LayoutConfig['breadcrumbStyle']) {
    config.value.breadcrumbStyle = style
  }

  // 多标签页设置
  function setEnableTabs(value: boolean) {
    config.value.enableTabs = value
  }

  function setTabStyle(style: LayoutConfig['tabStyle']) {
    config.value.tabStyle = style
  }

  function setShowTabIcon(value: boolean) {
    config.value.showTabIcon = value
  }

  function setTabPersist(value: boolean) {
    config.value.tabPersist = value
  }

  // 内容区设置
  function setEnableContentLayoutSettings(value: boolean) {
    config.value.enableContentLayoutSettings = value
  }

  function setContentMaxWidth(width: LayoutConfig['contentMaxWidth']) {
    config.value.contentMaxWidth = width
  }

  function setContentPadding(padding: LayoutConfig['contentPadding']) {
    config.value.contentPadding = padding
  }

  // 动画设置
  function setPageTransition(transition: LayoutConfig['pageTransition']) {
    config.value.pageTransition = transition
  }

  function setAnimationSpeed(speed: LayoutConfig['animationSpeed']) {
    config.value.animationSpeed = speed
  }

  function setThemeTransitionAnimation(value: boolean) {
    config.value.themeTransitionAnimation = value
  }

  // 样式设置
  function setCornerRadius(radius: LayoutConfig['cornerRadius']) {
    config.value.cornerRadius = radius
  }

  function setComponentSize(size: LayoutConfig['componentSize']) {
    config.value.componentSize = size
  }

  function applyCornerRadius(radius: LayoutConfig['cornerRadius']) {
    const values = CORNER_RADIUS_VALUES[radius]
    const root = document.documentElement

    root.dataset.cornerRadius = radius
    root.style.setProperty('--cp-radius-sm', values.small)
    root.style.setProperty('--cp-radius-md', values.base)
    root.style.setProperty('--cp-radius-lg', values.large)
    root.style.setProperty('--cp-radius-xl', values.extraLarge)
    root.style.setProperty('--el-border-radius-small', values.small)
    root.style.setProperty('--el-border-radius-base', values.base)
  }

  function applyAnimationSpeed(speed: LayoutConfig['animationSpeed']) {
    document.documentElement.style.setProperty('--cp-animation-duration', ANIMATION_DURATION_MAP[speed])
  }

  // 水印设置
  function setWatermark(value: boolean) {
    config.value.watermark = value
  }

  function setWatermarkText(text: string) {
    config.value.watermarkText = text
  }

  // 动态标题
  function setDynamicTitle(value: boolean) {
    config.value.dynamicTitle = value
  }

  // 重置配置
  function resetConfig() {
    config.value = { ...DEFAULT_CONFIG }
  }

  // 复制配置为 JSON
  function copyConfig(): string {
    return JSON.stringify(config.value, null, 2)
  }

  watch(
    () => config.value.cornerRadius,
    applyCornerRadius,
    { immediate: true }
  )

  watch(config, value => savePreference('layout', value), { deep: true })

  watch(
    () => config.value.animationSpeed,
    applyAnimationSpeed,
    { immediate: true }
  )

  watch(
    () => config.value.mode,
    (mode) => {
      if (!SUPPORTED_LAYOUT_MODES.includes(mode)) {
        config.value.mode = DEFAULT_CONFIG.mode
      }
    },
    { immediate: true }
  )

  watch(
    () => config.value.sidebarStyle,
    (style) => {
      if (!SUPPORTED_SIDEBAR_STYLES.includes(style)) {
        config.value.sidebarStyle = DEFAULT_CONFIG.sidebarStyle
      }
    },
    { immediate: true }
  )

  watch(
    () => config.value.showTabIcon,
    (value) => {
      if (typeof value !== 'boolean') {
        config.value.showTabIcon = DEFAULT_CONFIG.showTabIcon
      }
    },
    { immediate: true }
  )

  watch(
    () => config.value.tabStyle,
    (style) => {
      const normalizedStyle = LEGACY_TAB_STYLE_MAP[style as string]
      if (normalizedStyle) {
        config.value.tabStyle = normalizedStyle
      }
    },
    { immediate: true }
  )

  return {
    config,
    setLayoutMode,
    setSidebarStyle,
    setSidebarWidth,
    setCollapsedWidth,
    setUniqueOpened,
    toggleLogo,
    setShowLogo,
    setShowFooter,
    setFooterStyle,
    setFooterHeight,
    setFooterCopyright,
    setFooterYearMode,
    setFooterYearStart,
    setFooterYearEnd,
    setFooterIcp,
    setFooterIcpLink,
    setFooterLinks,
    setHeaderHeight,
    setShowBreadcrumb,
    setBreadcrumbIcon,
    setBreadcrumbStyle,
    setEnableTabs,
    setTabStyle,
    setShowTabIcon,
    setTabPersist,
    setEnableContentLayoutSettings,
    setContentMaxWidth,
    setContentPadding,
    setPageTransition,
    setAnimationSpeed,
    setThemeTransitionAnimation,
    setCornerRadius,
    setComponentSize,
    setWatermark,
    setWatermarkText,
    setDynamicTitle,
    resetConfig,
    copyConfig,
  }
}, {
  persist: window.platform ? false : {
    key: 'cp-layout-config',
    storage: localStorage,
    pick: ['config'],
    afterHydrate: ({ store }) => {
      delete (store.config as Record<string, unknown>).sidebarCollapseAnimation
      if (!SUPPORTED_SIDEBAR_STYLES.includes(store.config.sidebarStyle)) {
        store.config.sidebarStyle = DEFAULT_CONFIG.sidebarStyle
      }
      if (typeof store.config.dynamicTitle !== 'boolean') {
        store.config.dynamicTitle = DEFAULT_CONFIG.dynamicTitle
      }
      if (typeof store.config.enableContentLayoutSettings !== 'boolean') {
        store.config.enableContentLayoutSettings = DEFAULT_CONFIG.enableContentLayoutSettings
        store.config.contentMaxWidth = DEFAULT_CONFIG.contentMaxWidth
        store.config.contentPadding = DEFAULT_CONFIG.contentPadding
      }
      store.$persist()
    },
  },
})
