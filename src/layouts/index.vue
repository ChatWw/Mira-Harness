<template>
  <el-watermark v-bind="watermarkProps" class="layout-watermark">
    <div class="layout" :class="layoutClasses">
      <div class="layout-workspace">
        <AppSidebar v-if="showSidebar" :show-brand="true" />

        <div class="main-container">
          <TabsBar v-if="!isWorkspaceRoute" />
          <AppMain />
        </div>
      </div>

      <SearchBar />
    </div>
  </el-watermark>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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
    --cp-mac-collapsed-safe-inset: 40px;
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

}

</style>
