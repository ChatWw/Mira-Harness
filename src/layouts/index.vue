<template>
  <el-watermark v-bind="watermarkProps" class="layout-watermark">
    <div class="layout" :class="layoutClasses">
    <!-- 桌面窗口顶栏：macOS 红绿灯、导航与工具条统一在同一行。 -->
    <div
      class="layout-header-transition"
      :style="{ '--layout-header-height': `${desktopHeaderHeight}px` }"
    >
      <GlobalHeader />
    </div>

    <div class="layout-workspace">
      <!-- 经典布局：品牌置于顶栏下方的工作区导航内。 -->
      <AppSidebar v-if="showSidebar" :show-brand="true" />

      <!-- 主容器 -->
      <div class="main-container">
        <!-- 多标签页 -->
        <TabsBar v-if="layoutStore.config.enableTabs && !isWorkspaceRoute" />

        <!-- 主内容区 -->
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
import GlobalHeader from './components/GlobalHeader.vue'
import TabsBar from './components/TabsBar.vue'
import AppMain from './components/AppMain.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const isMacDesktop = Boolean(window.platform) && navigator.userAgent.includes('Macintosh')
const desktopHeaderHeight = computed(() => isMacDesktop
  ? 34
  : layoutStore.config.headerHeight)
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
  ]

  if (appStore.sidebarCollapsed) {
    classes.push('sidebar-collapsed')
  }

  if (layoutStore.config.enableTabs && !isWorkspaceRoute.value) {
    classes.push('layout--with-tabs')
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cp-bg);

  .layout-workspace {
    min-height: 0;
    flex: 1;
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

  // 内嵌：顶栏和导航组成框架，内容主体以卡片方式突出。
  &--sidebar-style-embedded {
    background: var(--cp-bg-elevated);

    .layout-header-transition,
    .layout-workspace {
      background: var(--cp-bg-elevated);
    }

    .main-container {
      margin: 0 12px 12px 0;
      background: var(--cp-bg);
      border: 1px solid var(--cp-layout-border);
      border-radius: calc(1rem * 1.4);
      box-shadow: 0 10px 30px rgb(24 24 27 / 4%);
    }

    :deep(.global-header),
    :deep(.app-sidebar) {
      background: var(--cp-bg-elevated);
    }

    :deep(.global-header),
    :deep(.app-sidebar) {
      border-color: var(--cp-layout-border);
    }

    :deep(.el-sub-menu .el-menu) {
      background: transparent;
    }

    &.layout--without-workspace-menu .main-container {
      margin-left: 12px;
    }

  }

  // 浮动：顶栏和内容处于同一平面，仅菜单区域作为卡片被突出。
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
      margin: 12px 0 12px 12px;
      overflow: hidden;
      background: transparent;
    }

    :deep(.app-sidebar .sidebar-menu) {
      background: var(--cp-bg-elevated);
      border: 1px solid var(--cp-layout-border);
      border-radius: var(--cp-radius-xl);
    }

    :deep(.el-sub-menu .el-menu) {
      background: var(--cp-bg-elevated);
    }

    :deep(.app-sidebar) {
      margin-right: 12px;
    }
  }

  // 侧边栏：常规贴边分区，不突出任何容器。
  &--sidebar-style-docked {
    :deep(.global-header),
    :deep(.app-header),
    :deep(.sidebar-header) {
      border-bottom: 1px solid var(--cp-layout-border);
    }

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

  // ========== 响应式 ==========
  @include media-max($breakpoint-md) {
    .main-container {
      margin-left: 0 !important;
    }

    &--sidebar-style-embedded .main-container,
    &--sidebar-style-floating .main-container {
      margin: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    &--sidebar-style-floating {
      :deep(.app-sidebar) {
        margin: 0;
        border-radius: 0;
        box-shadow: none;
      }
    }

    // 移动端：侧边栏变为抽屉式（这里简化处理）
    :deep(.app-sidebar) {
      position: fixed;
      z-index: $z-modal;
      transform: translateX(-100%);
      transition: transform $transition-base;

      &.is-open {
        transform: translateX(0);
      }
    }
  }
}

.layout-header-transition {
  height: var(--layout-header-height);
  max-height: var(--layout-header-height);
  flex-shrink: 0;
  overflow: hidden;
}

</style>
