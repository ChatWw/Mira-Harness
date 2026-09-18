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

      <div class="window-titlebar-drag-region" aria-hidden="true" />

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

      <nav
        v-if="windowChrome === 'windows-overlay'"
        class="windows-titlebar-menu"
        :class="{ 'is-without-sidebar': !showSidebar }"
        aria-label="应用菜单"
      >
        <el-dropdown
          v-for="group in windowsMenuGroups"
          :key="group.label"
          trigger="click"
          placement="bottom-start"
          :show-arrow="false"
          popper-class="windows-titlebar-menu-popper"
          @command="runWindowCommand"
        >
          <button type="button" class="windows-titlebar-menu__trigger">{{ group.label }}</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="item in group.items"
                :key="item.action"
                :command="item.action"
                :divided="item.divided"
              >
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>

      <div class="window-titlebar-actions">
        <el-tooltip content="全局搜索 (Ctrl+K)" placement="bottom">
          <button type="button" class="titlebar-search" aria-label="全局搜索" @click="openSearch"><AppIcon name="Search" /></button>
        </el-tooltip>
        <div v-if="windowChrome === 'windows-overlay'" class="windows-window-controls" aria-label="窗口控制">
          <button type="button" class="windows-window-control" aria-label="最小化" @click="runWindowCommand('minimize')"><span class="windows-window-control__glyph windows-window-control__glyph--minimize" /></button>
          <button type="button" class="windows-window-control" aria-label="最大化或还原" @click="runWindowCommand('maximize')"><span class="windows-window-control__glyph windows-window-control__glyph--maximize" /></button>
          <button type="button" class="windows-window-control windows-window-control--close" aria-label="关闭窗口" @click="runWindowCommand('close')"><span class="windows-window-control__glyph windows-window-control__glyph--close" /></button>
        </div>
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
import { useCommandPaletteStore } from '@/stores/commandPalette'
import AppSidebar from './components/AppSidebar.vue'
import TabsBar from './components/TabsBar.vue'
import AppMain from './components/AppMain.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const commandPaletteStore = useCommandPaletteStore()
const route = useRoute()
const windowChrome = window.platform?.windowChrome ?? 'standard'
const navigation = computed(() => resolveNavigation(route.path))
const isWorkspaceRoute = computed(() => isWorkspacePath(route.path))
type WindowMenuGroup = { label: string; items: Array<{ label: string; action: string; divided?: boolean }> }
const windowsMenuGroups: WindowMenuGroup[] = [
  { label: '应用', items: [{ label: '关于 Mira', action: 'about' }, { label: '退出 Mira', action: 'quit', divided: true }] },
  { label: '编辑', items: [{ label: '撤销', action: 'undo' }, { label: '重做', action: 'redo' }, { label: '剪切', action: 'cut', divided: true }, { label: '复制', action: 'copy' }, { label: '粘贴', action: 'paste' }, { label: '全选', action: 'selectAll' }] },
  { label: '视图', items: [...(import.meta.env.DEV ? [{ label: '重新加载', action: 'reload' }, { label: '开发者工具', action: 'toggleDevTools' }] : []), { label: '切换全屏', action: 'toggleFullscreen', divided: import.meta.env.DEV }] },
  { label: '窗口', items: [{ label: '最小化', action: 'minimize' }, { label: '最大化/还原', action: 'maximize' }, { label: '关闭窗口', action: 'close' }] },
]
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

function runWindowCommand(action: string) {
  void window.platform?.windowCommand(action)
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
    z-index: 110;
    top: 2px;
    left: 20px;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    -webkit-app-region: drag;
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

  .windows-titlebar-menu {
    position: fixed;
    z-index: 110;
    top: 0;
    left: 60px;
    display: flex;
    height: var(--cp-titlebar-height);
    align-items: center;
    -webkit-app-region: no-drag;

    &.is-without-sidebar {
      left: 20px;
    }
  }

  .windows-titlebar-menu__trigger {
    height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--cp-radius-sm);
    color: var(--cp-text-secondary);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 13px;

    &:hover,
    &:focus-visible {
      color: var(--cp-text);
      background: var(--cp-bg-hover);
      outline: none;
    }
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

  .windows-window-controls {
    display: flex;
    height: 100%;
    margin-right: -16px;
  }

  .windows-window-control {
    display: grid;
    width: 44px;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    color: var(--cp-text-secondary);
    background: transparent;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: var(--cp-text);
      background: var(--cp-bg-hover);
      outline: none;
    }

    &--close:hover,
    &--close:focus-visible {
      color: #fff;
      background: #c42b1c;
    }
  }

  .windows-window-control__glyph {
    position: relative;
    display: block;
    width: 10px;
    height: 10px;

    &--minimize::after {
      position: absolute;
      right: 0;
      bottom: 1px;
      left: 0;
      height: 1px;
      background: currentcolor;
      content: '';
    }

    &--maximize {
      width: 10px;
      height: 10px;
      border: 1px solid currentcolor;
    }

    &--close::before,
    &--close::after {
      position: absolute;
      top: 4px;
      left: 0;
      width: 12px;
      height: 1px;
      background: currentcolor;
      content: '';
    }

    &--close::before { transform: rotate(45deg); }
    &--close::after { transform: rotate(-45deg); }
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

<style lang="scss">
.el-popper.windows-titlebar-menu-popper,
.windows-titlebar-menu-popper {
  min-width: 160px;
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-md);
  background: var(--cp-bg-elevated) !important;
  box-shadow: 0 8px 24px rgb(24 24 27 / 14%);

  .el-dropdown-menu {
    padding: 4px;
    background: transparent;
  }

  .el-dropdown-menu__item {
    min-height: 30px;
    padding: 0 10px;
    border-radius: var(--cp-radius-sm);
    color: var(--cp-text);
    font-size: 13px;

    &:hover,
    &:focus {
      color: var(--cp-text);
      background: var(--cp-bg-hover);
    }
  }
}
</style>
