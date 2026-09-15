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
          <TabsBar v-if="!isWorkspaceRoute" />
          <AppMain />
        </div>
      </div>

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
          <AppIcon :name="appStore.sidebarCollapsed ? 'tabler:layout-sidebar-left-expand' : 'tabler:layout-sidebar-right-expand'" />
        </button>
      </div>

      <SearchBar />
    </div>
  </el-watermark>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElWatermark } from 'element-plus'
import { useRoute } from 'vue-router'
import { getVisibleMenus, isWorkspacePath, resolveNavigation } from '@/config/navigation'
import { useAppStore } from '@/stores/app'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import AppSidebar from './components/AppSidebar.vue'
import TabsBar from './components/TabsBar.vue'
import AppMain from './components/AppMain.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const windowChrome = window.platform?.windowChrome ?? 'standard'
const navigation = computed(() => resolveNavigation(route.path))
const isWorkspaceRoute = computed(() => isWorkspacePath(route.path))
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
  --cp-window-controls-inset: 0px;
  --cp-mac-collapsed-safe-inset: 0px;

  &--windows-overlay {
    --cp-window-controls-inset: max(150px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 150px))));
  }

  &--macos-overlay.sidebar-collapsed {
    --cp-mac-collapsed-safe-inset: 112px;
  }

  &--macos-overlay.layout--without-workspace-menu {
    --cp-mac-collapsed-safe-inset: 80px;
  }

  .layout-workspace {
    width: 100%;
    height: 100%;
    display: flex;
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

    &.is-collapsed {
      width: 0;
      flex-basis: 0;
      z-index: 100;
      overflow: visible;

      :deep(.app-sidebar) {
        position: fixed;
        top: 8px;
        bottom: 8px;
        left: 8px;
        width: 240px !important;
        height: auto;
        border: 1px solid var(--cp-layout-border);
        border-radius: var(--cp-radius-xl);
        box-shadow: 0 12px 32px rgb(24 24 27 / 12%);
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
    transform: translateX(-12px);
  }

  .sidebar-window-controls {
    position: fixed;
    z-index: 110;
    top: 15px;
    left: 20px;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    -webkit-app-region: drag;
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
      margin: 12px 12px 12px 0;
      background: var(--cp-bg);
      border: 1px solid var(--cp-layout-border);
      border-radius: var(--cp-radius-xl);
      box-shadow: 0 10px 30px rgb(24 24 27 / 4%);
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

  // 浮动：Main 保持平面，仅侧栏内缩并悬浮。
  &--sidebar-style-floating {
    .layout-workspace {
      background: var(--cp-bg);
    }

    .main-container {
      background: var(--cp-bg);
    }

    :deep(.app-sidebar) {
      align-self: stretch;
      height: auto;
      margin: 12px;
      overflow: hidden;
      background: var(--cp-bg-elevated);
      border: 1px solid var(--cp-layout-border);
      border-radius: var(--cp-radius-xl);
      box-shadow: 0 10px 26px rgb(24 24 27 / 7%);
    }

    :deep(.el-sub-menu .el-menu) {
      background: var(--cp-bg-elevated);
    }

  }

  // 分栏：两栏贴边，只用分隔线表达层级。
  &--sidebar-style-docked {
    :deep(.app-sidebar) {
      border-right: 1px solid var(--cp-layout-border);
    }

    :deep(.app-sidebar) {
      background: transparent;
    }

    :deep(.el-sub-menu .el-menu) {
      background: transparent;
    }

  }

  // 收起态是跨布局悬浮层，必须使用不透明表面，避免主页面内容透出。
  &.sidebar-collapsed .sidebar-host.is-collapsed :deep(.app-sidebar) {
    z-index: 100;
    background: var(--cp-sidebar-bg) !important;
    border-color: var(--cp-layout-border);
    box-shadow: 0 12px 32px rgb(24 24 27 / 16%);
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
