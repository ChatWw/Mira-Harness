<template>
  <el-watermark v-bind="watermarkProps" class="layout-watermark">
    <div class="layout" :class="layoutClasses">
      <div class="layout-workspace">
        <div
          v-if="showSidebar"
          class="sidebar-host"
          :class="{
            'is-collapsed': appStore.sidebarCollapsed,
            'is-flyout-visible': sidebarFlyoutVisible,
          }"
        >
          <Transition name="sidebar-panel">
            <AppSidebar
              v-if="!appStore.sidebarCollapsed || sidebarFlyoutVisible"
              :show-brand="true"
              @mouseenter="handleSidebarMouseEnter"
              @mouseleave="handleSidebarMouseLeave"
              @flyout-menu-visibility-change="handleSidebarFlyoutMenuVisibilityChange"
            />
          </Transition>
        </div>

        <div class="main-container">
          <AppMain />
        </div>
      </div>

      <div v-if="windowChrome !== 'windows-overlay'" class="window-titlebar-drag-region" aria-hidden="true" />

      <WindowsTitlebar
        v-if="windowChrome === 'windows-overlay'"
        :menu-left="showSidebar ? 60 : 20"
      />

      <div v-if="showSidebar" class="sidebar-window-controls">
        <button
          type="button"
          class="sidebar-toggle"
          :aria-label="appStore.sidebarCollapsed ? '显示侧边栏' : '收起侧边栏'"
          @mouseenter="showSidebarFlyout"
          @mouseleave="armSidebarFlyout"
          @blur="scheduleSidebarFlyoutClose"
          @click="toggleSidebar"
        >
          <AppIcon :name="appStore.sidebarCollapsed ? 'tabler:layout-sidebar-filled' : 'tabler:layout-sidebar'" />
        </button>
      </div>

      <div v-if="windowChrome !== 'windows-overlay'" class="window-titlebar-actions">
        <el-tooltip content="全局搜索 (Ctrl+K)" placement="bottom">
          <button type="button" class="titlebar-search" aria-label="全局搜索" @click="openSearch"><AppIcon name="Search" /></button>
        </el-tooltip>
      </div>

      <SearchBar />
    </div>
  </el-watermark>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElWatermark } from 'element-plus'
import { useRoute } from 'vue-router'
import { getVisibleMenus, resolveNavigation } from '@/config/navigation'
import { useAppStore } from '@/stores/app'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import AppSidebar from './components/AppSidebar.vue'
import AppMain from './components/AppMain.vue'
import WindowsTitlebar from './components/WindowsTitlebar.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const commandPaletteStore = useCommandPaletteStore()
const route = useRoute()
const windowChrome = window.platform?.windowChrome ?? 'standard'
const navigation = computed(() => resolveNavigation(route.path))
const sidebarFlyoutVisible = ref(false)
const sidebarFlyoutArmed = ref(false)
const sidebarPointerInside = ref(false)
const sidebarFlyoutMenuVisible = ref(false)
let sidebarFlyoutCloseTimer: number | undefined

function showSidebarFlyout() {
  if (!appStore.sidebarCollapsed || !sidebarFlyoutArmed.value) return
  if (sidebarFlyoutCloseTimer) window.clearTimeout(sidebarFlyoutCloseTimer)
  sidebarFlyoutVisible.value = true
}

function armSidebarFlyout() {
  if (!appStore.sidebarCollapsed) return
  sidebarFlyoutArmed.value = true
  scheduleSidebarFlyoutClose()
}

function scheduleSidebarFlyoutClose() {
  if (!appStore.sidebarCollapsed) return
  if (sidebarPointerInside.value || sidebarFlyoutMenuVisible.value) return
  if (sidebarFlyoutCloseTimer) window.clearTimeout(sidebarFlyoutCloseTimer)
  sidebarFlyoutCloseTimer = window.setTimeout(() => {
    if (!sidebarPointerInside.value && !sidebarFlyoutMenuVisible.value) {
      sidebarFlyoutVisible.value = false
    }
  }, 140)
}

function handleSidebarMouseEnter() {
  sidebarPointerInside.value = true
  showSidebarFlyout()
}

function handleSidebarMouseLeave() {
  sidebarPointerInside.value = false
  scheduleSidebarFlyoutClose()
}

function handleSidebarFlyoutMenuVisibilityChange(visible: boolean) {
  sidebarFlyoutMenuVisible.value = visible
  if (visible) {
    if (sidebarFlyoutCloseTimer) window.clearTimeout(sidebarFlyoutCloseTimer)
    return
  }

  scheduleSidebarFlyoutClose()
}

function toggleSidebar() {
  if (sidebarFlyoutCloseTimer) window.clearTimeout(sidebarFlyoutCloseTimer)
  sidebarFlyoutVisible.value = false
  sidebarFlyoutArmed.value = false
  sidebarPointerInside.value = false
  sidebarFlyoutMenuVisible.value = false
  appStore.toggleSidebar()
}

function openSearch() {
  commandPaletteStore.open()
}

onBeforeUnmount(() => {
  if (sidebarFlyoutCloseTimer) window.clearTimeout(sidebarFlyoutCloseTimer)
})

const showSidebar = computed(() => {
  if (navigation.value.area === 'main') return true
  return getVisibleMenus(navigation.value.menus).length > 0
})
const watermarkProps = computed(() => {
  return {
    content: layoutStore.config.watermark
      ? layoutStore.config.watermarkText.trim() || APP_NAME
      : '',
    font: { color: 'rgba(0, 0, 0, 0.12)', fontSize: 16 },
    gap: [120, 100] as [number, number],
    zIndex: 10,
  }
})

const layoutClasses = computed(() => {
  const classes = [
    `layout--sidebar-style-${layoutStore.config.sidebarStyle}`,
    `layout--${windowChrome}`,
  ]

  if (appStore.sidebarCollapsed) {
    classes.push('sidebar-collapsed')
  }

  if (!showSidebar.value) {
    classes.push('layout--without-workspace-menu')
  }

  return classes
})
</script>

<style scoped lang="scss">
.layout-watermark {
  display: block;
  height: 100%;
}

.layout {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--cp-bg);
  --cp-titlebar-height: 36px;
  --cp-window-controls-inset: 0px;
  --cp-mac-collapsed-safe-inset: 0px;

  .layout-workspace {
    width: 100%;
    height: 100%;
    display: flex;
    padding-top: var(--cp-titlebar-height);
    overflow: hidden;
  }

  .sidebar-host {
    width: 240px;
    height: 100%;
    flex: 0 0 240px;
    position: relative;
    z-index: 20;
    overflow: hidden;
    transition:
      width var(--cp-animation-duration) cubic-bezier(0.16, 1, 0.3, 1),
      flex-basis var(--cp-animation-duration) cubic-bezier(0.16, 1, 0.3, 1);

    &:not(.is-collapsed) :deep(.sidebar-window-chrome) {
      display: none;
    }

    &.is-collapsed {
      width: 0;
      flex-basis: 0;
      z-index: 100;
      overflow: visible;

      :deep(.app-sidebar) {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        width: 240px !important;
        height: 100vh;
        border: 0;
        border-right: 1px solid var(--cp-layout-border);
        border-radius: 0;
        box-shadow: 12px 0 28px rgb(24 24 27 / 14%);
      }

    }
  }

  .sidebar-panel-enter-active,
  .sidebar-panel-leave-active {
    transition:
      opacity 180ms ease,
      transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar-panel-enter-from,
  .sidebar-panel-leave-to {
    opacity: 0;
    transform: translateX(-100%);
  }

  .sidebar-window-controls {
    position: fixed;
    z-index: 120;
    top: 2px;
    left: 20px;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    -webkit-app-region: no-drag !important;
  }

  .window-titlebar-drag-region {
    position: fixed;
    z-index: 100;
    top: 0;
    right: 0;
    left: 0;
    height: var(--cp-titlebar-height);
    -webkit-app-region: drag;
  }

  .window-titlebar-actions {
    position: fixed;
    z-index: 110;
    top: 0;
    right: 16px;
    display: flex;
    height: var(--cp-titlebar-height);
    align-items: center;
    gap: 8px;
    -webkit-app-region: no-drag;
  }

  .titlebar-search {
    display: grid;
    width: 32px;
    height: 32px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: var(--cp-radius-md);
    color: var(--cp-text-secondary);
    background: transparent;
    cursor: pointer;
    font-size: 16px;

    &:hover,
    &:focus-visible {
      color: var(--cp-text);
      background: var(--cp-sidebar-menu-hover-bg);
      outline: none;
    }
  }

  .sidebar-toggle {
    display: grid;
    width: 32px;
    height: 32px;
    font-size: 16px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: var(--cp-radius-md);
    color: var(--cp-text-secondary);
    background: transparent;
    cursor: pointer;
    -webkit-app-region: no-drag !important;

    &:hover,
    &:focus-visible {
      color: var(--cp-text);
      background: var(--cp-sidebar-menu-hover-bg);
      outline: none;
    }
  }

  &--macos-overlay .sidebar-window-controls {
    left: 92px;
  }

  .main-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  // ========== 布局模式 ==========

  // 内嵌：侧栏融入窗口底色，Main 是唯一强调面板。
  &--sidebar-style-embedded {
    background: var(--cp-bg-elevated);

    .layout-workspace {
      background: var(--cp-bg-elevated);
    }

    .main-container {
      margin: 0 12px 12px 0;
      background: var(--cp-bg);
      border: 1px solid var(--cp-layout-border);
      border-radius: var(--cp-radius-xl);
      box-shadow: 0 8px 24px rgb(24 24 27 / 5%);
    }

    :deep(.app-sidebar) {
      background: var(--cp-bg-elevated);
      border-color: var(--cp-layout-border);
    }

    :deep(.el-sub-menu .el-menu) {
      background: transparent;
    }

    &.layout--without-workspace-menu .main-container {
      margin-left: 12px;
    }

    &.sidebar-collapsed .main-container {
      margin-left: 12px;
    }

  }

  // 浮动：窗口底色包裹两块内缩面板，侧栏通过阴影强调悬浮层级。
  &--sidebar-style-floating {
    background: var(--cp-bg-elevated);

    .layout-workspace {
      background: var(--cp-bg-elevated);
    }

    .main-container {
      margin: 0 12px 12px 0;
      overflow: hidden;
      background: var(--cp-bg);
      border-radius: var(--cp-radius-xl);
    }

    .sidebar-host:not(.is-collapsed) {
      width: 264px;
      flex-basis: 264px;
      padding: 0 12px 12px;
      overflow: hidden;
    }

    .sidebar-host:not(.is-collapsed) :deep(.app-sidebar) {
      height: 100%;
      overflow: hidden;
      background: var(--cp-bg);
      border: 1px solid var(--cp-layout-border);
      border-radius: var(--cp-radius-xl);
      box-shadow: 0 8px 24px rgb(24 24 27 / 8%);
    }

    :deep(.el-sub-menu .el-menu) {
      background: var(--cp-bg-elevated);
    }

    &.layout--without-workspace-menu .main-container,
    &.sidebar-collapsed .main-container {
      margin-left: 12px;
    }

  }

  // 分栏：两栏组成一块内缩面板，内部只用分隔线划分区域。
  &--sidebar-style-docked {
    background: var(--cp-bg-elevated);

    .layout-workspace {
      padding-right: 12px;
      padding-bottom: 12px;
      padding-left: 12px;
      background: var(--cp-bg-elevated);
    }

    .main-container {
      overflow: hidden;
      background: var(--cp-bg);
      border-radius: 0 var(--cp-radius-xl) var(--cp-radius-xl) 0;
    }

    .sidebar-host:not(.is-collapsed) {
      overflow: hidden;
      background: var(--cp-bg);
      border-radius: var(--cp-radius-xl) 0 0 var(--cp-radius-xl);
    }

    :deep(.app-sidebar) {
      border-right: 1px solid var(--cp-layout-border);
      background: transparent;
    }

    :deep(.el-sub-menu .el-menu) {
      background: transparent;
    }

    &.layout--without-workspace-menu .main-container,
    &.sidebar-collapsed .main-container {
      border-radius: var(--cp-radius-xl);
    }

  }

  // 收起态是跨布局悬浮层，必须使用不透明表面，避免主页面内容透出。
  &.sidebar-collapsed .sidebar-host.is-collapsed :deep(.app-sidebar) {
    z-index: 100;
    background: var(--cp-sidebar-bg) !important;
    border-color: var(--cp-layout-border);
    box-shadow: 12px 0 28px rgb(24 24 27 / 14%);
    isolation: isolate;
  }

}

@media (prefers-reduced-motion: reduce) {
  .layout .sidebar-host,
  .layout .sidebar-panel-enter-active,
  .layout .sidebar-panel-leave-active {
    transition: none;
  }
}

</style>
