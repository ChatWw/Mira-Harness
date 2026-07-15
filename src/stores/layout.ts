import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { LayoutConfig } from '@/types'

const DEFAULT_APP_NAME = '中台基座'

const DEFAULT_CONFIG: LayoutConfig = {
  mode: 'sidebar-header',
  sidebarWidth: 240,
  collapsedWidth: 64,
  uniqueOpened: false,
  fixedSidebar: true,
  showLogo: true,
  showFooter: false,
  fixedHeader: true,
  headerHeight: 64,
  showBreadcrumb: true,
  breadcrumbIcon: true,
  enableTabs: true,
  tabStyle: 'card',
  maxTabs: 10,
  tabPersist: true,
  contentMaxWidth: 'full',
  contentPadding: 'normal',
  pageTransition: 'fade-slide',
  animationSpeed: 'normal',
  sidebarCollapseAnimation: true,
  themeTransitionAnimation: true,
  cornerRadius: 'medium',
  componentSize: 'default',
  watermark: false,
  watermarkText: '',
  footerStyle: 'simple',
  footerHeight: 40,
  footerCopyright: '中台基座',
  footerYearMode: 'auto',
  footerYearStart: null,
  footerYearEnd: null,
  footerIcp: '',
  footerIcpLink: 'https://beian.miit.gov.cn/',
  footerLinks: [],
  dynamicTitle: DEFAULT_APP_NAME,
}

export const useLayoutStore = defineStore('layout', () => {
  // 布局配置
  const config = ref<LayoutConfig>({ ...DEFAULT_CONFIG })

  // 配置面板显示状态
  const settingsVisible = ref(false)

  // 布局模式
  function setLayoutMode(mode: LayoutConfig['mode']) {
    config.value.mode = mode
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

  function setFixedSidebar(value: boolean) {
    config.value.fixedSidebar = value
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
  function toggleFixedHeader() {
    config.value.fixedHeader = !config.value.fixedHeader
  }

  function setFixedHeader(value: boolean) {
    config.value.fixedHeader = value
  }

  function setHeaderHeight(height: number) {
    config.value.headerHeight = height
  }

  function setShowBreadcrumb(value: boolean) {
    config.value.showBreadcrumb = value
  }

  function setBreadcrumbIcon(value: boolean) {
    config.value.breadcrumbIcon = value
  }

  // 多标签页设置
  function setEnableTabs(value: boolean) {
    config.value.enableTabs = value
  }

  function setTabStyle(style: LayoutConfig['tabStyle']) {
    config.value.tabStyle = style
  }

  function setMaxTabs(count: number) {
    config.value.maxTabs = count
  }

  function setTabPersist(value: boolean) {
    config.value.tabPersist = value
  }

  // 内容区设置
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

  function setSidebarCollapseAnimation(value: boolean) {
    config.value.sidebarCollapseAnimation = value
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

  // 水印设置
  function setWatermark(value: boolean) {
    config.value.watermark = value
  }

  function setWatermarkText(text: string) {
    config.value.watermarkText = text
  }

  // 动态标题
  function setDynamicTitle(title: string) {
    config.value.dynamicTitle = title || DEFAULT_APP_NAME
  }

  // 配置面板
  function openSettings() {
    settingsVisible.value = true
  }

  function closeSettings() {
    settingsVisible.value = false
  }

  // 重置配置
  function resetConfig() {
    config.value = { ...DEFAULT_CONFIG }
  }

  // 复制配置为 JSON
  function copyConfig(): string {
    return JSON.stringify(config.value, null, 2)
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
    setSidebarWidth,
    setCollapsedWidth,
    setUniqueOpened,
    setFixedSidebar,
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
    toggleFixedHeader,
    setFixedHeader,
    setHeaderHeight,
    setShowBreadcrumb,
    setBreadcrumbIcon,
    setEnableTabs,
    setTabStyle,
    setMaxTabs,
    setTabPersist,
    setContentMaxWidth,
    setContentPadding,
    setPageTransition,
    setAnimationSpeed,
    setSidebarCollapseAnimation,
    setThemeTransitionAnimation,
    setCornerRadius,
    setComponentSize,
    setWatermark,
    setWatermarkText,
    setDynamicTitle,
    openSettings,
    closeSettings,
    resetConfig,
    copyConfig,
  }
}, {
  persist: {
    key: 'cp-layout-config',
    storage: localStorage,
    pick: ['config'],
  },
})
