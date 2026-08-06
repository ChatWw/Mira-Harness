<template>
  <el-watermark v-bind="watermarkProps" class="layout-watermark">
    <div class="layout" :class="layoutClasses">
    <!-- 桌面窗口顶栏：macOS 红绿灯、导航与工具条统一在同一行。 -->
    <div
      class="layout-header-transition"
      :style="{ '--layout-header-height': `${layoutStore.config.headerHeight}px` }"
    >
      <GlobalHeader />
    </div>

    <div class="layout-workspace">
      <!-- 仅侧栏模式：一级应用栏常驻，二级菜单按当前应用配置显示。 -->
      <div v-if="isSidebarOnly" class="layout-navigation-group">
        <Transition name="rail-slide">
          <div class="layout-rail-transition">
            <GlobalHeader variant="rail" />
          </div>
        </Transition>
        <AppSidebar v-if="showSidebar" :show-brand="true" text-only-brand />
      </div>

      <!-- 默认布局：品牌置于顶栏下方的工作区导航内。 -->
      <AppSidebar v-else-if="showSidebar" :show-brand="true" />

      <!-- 主容器 -->
      <div class="main-container">
        <!-- 多标签页 -->
        <TabsBar v-if="layoutStore.config.enableTabs" />

        <!-- 主内容区 -->
        <AppMain />

        <!-- 底栏 -->
        <AppFooter v-if="layoutStore.config.showFooter" />
      </div>
    </div>

    <!-- 全局配置面板 -->
    <AppSettings />
    <SearchBar />
    </div>
  </el-watermark>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElWatermark } from 'element-plus'
import { useRoute } from 'vue-router'
import { getVisibleMenus, resolveNavigation } from '@/config/navigation'
import { useAppStore } from '@/stores/app'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import AppSidebar from './components/AppSidebar.vue'
import GlobalHeader from './components/GlobalHeader.vue'
import TabsBar from './components/TabsBar.vue'
import AppMain from './components/AppMain.vue'
import AppFooter from './components/AppFooter.vue'
import AppSettings from './components/AppSettings.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const isSidebarOnly = computed(() => layoutStore.config.mode === 'sidebar-only')
const navigation = computed(() => resolveNavigation(route.path))

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
    `layout--${layoutStore.config.mode}`,
    `layout--sidebar-style-${layoutStore.config.sidebarStyle}`,
  ]

  if (appStore.sidebarCollapsed) {
    classes.push('sidebar-collapsed')
  }

  if (layoutStore.config.enableTabs) {
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

  .layout-navigation-group {
    display: flex;
    flex-shrink: 0;
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
      margin: 12px 12px 12px 0;
      background: var(--cp-bg);
      border: 1px solid var(--cp-layout-border);
      border-radius: calc(1rem * 1.4);
      box-shadow: 0 10px 30px rgb(24 24 27 / 4%);
    }

    :deep(.global-header),
    :deep(.global-rail),
    :deep(.app-sidebar) {
      background: var(--cp-bg-elevated);
    }

    :deep(.global-header),
    :deep(.app-sidebar),
    :deep(.global-rail) {
      border-color: var(--cp-layout-border);
    }

    &.layout--sidebar-header {
      :deep(.el-sub-menu .el-menu) {
        background: transparent;
      }
    }

    &.layout--sidebar-only {
      :deep(.el-sub-menu .el-menu) {
        background: transparent;
      }
    }

    &.layout--sidebar-only .main-container {
      margin-left: 12px;
    }

    &.layout--sidebar-header.layout--without-workspace-menu .main-container {
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

    .layout-navigation-group,
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

    &.layout--sidebar-header {
      :deep(.app-sidebar) {
        margin-right: 12px;
      }
    }

    &.layout--sidebar-only {
      .layout-navigation-group {
        margin-right: 12px;
      }

      :deep(.app-sidebar) {
        margin: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      :deep(.global-rail) {
        height: 100%;
        background: transparent;
      }
    }
  }

  // 侧边栏：常规贴边分区，不突出任何容器。
  &--sidebar-style-docked {
    :deep(.global-header),
    :deep(.app-header),
    :deep(.sidebar-header) {
      border-bottom: 1px solid var(--cp-layout-border);
    }

    :deep(.app-sidebar),
    :deep(.global-rail) {
      border-right: 1px solid var(--cp-layout-border);
    }

    :deep(.app-sidebar),
    :deep(.global-rail) {
      background: transparent;
    }

    :deep(.el-sub-menu .el-menu) {
      background: transparent;
    }

    &.layout--sidebar-only {
      :deep(.app-sidebar) {
        background: transparent;
      }
    }
  }

  // 1. 侧边栏+顶栏模式（默认）
  &--sidebar-header {
    // 默认布局，无需额外样式
  }

  // 2. 仅侧边栏模式：应用栏、二级菜单和主工作区均在同一个三栏工作区中。
  &--sidebar-only {
    :deep(.app-sidebar) {
      background: var(--cp-bg);
    }

    :deep(.sidebar-header) {
      border-bottom: none;
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
      .layout-navigation-group,
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

.layout-rail-transition {
  width: 72px;
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
}

.rail-slide-enter-active,
.rail-slide-leave-active {
  overflow: hidden;
  transition: width var(--cp-animation-duration) ease, opacity var(--cp-animation-duration) ease, transform var(--cp-animation-duration) ease;
}

.rail-slide-enter-from,
.rail-slide-leave-to {
  width: 0;
  opacity: 0;
  transform: translateX(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .rail-slide-enter-active,
  .rail-slide-leave-active {
    transition: none;
  }
}
</style>
