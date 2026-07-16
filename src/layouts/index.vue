<template>
  <div
    class="layout"
    :class="layoutClasses"
    :style="{ '--layout-sidebar-width': `${sidebarOffset}px` }"
  >
    <!-- 侧边栏 -->
    <AppSidebar v-if="showSidebar" />

    <!-- 主容器 -->
    <div class="main-container">
      <!-- 顶栏 -->
      <AppHeader v-if="showHeader" />

      <!-- 多标签页 -->
      <TabsBar v-if="layoutStore.config.enableTabs && showHeader" />

      <!-- 主内容区 -->
      <AppMain />

      <!-- 底栏 -->
      <AppFooter v-if="layoutStore.config.showFooter" />
    </div>

    <!-- 全局配置面板 -->
    <AppSettings />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useLayoutStore } from '@/stores/layout'
import AppSidebar from './components/AppSidebar.vue'
import AppHeader from './components/AppHeader.vue'
import TabsBar from './components/TabsBar.vue'
import AppMain from './components/AppMain.vue'
import AppFooter from './components/AppFooter.vue'
import AppSettings from './components/AppSettings.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()

// 根据布局模式显示/隐藏侧边栏和顶栏
const showSidebar = computed(() => {
  const mode = layoutStore.config.mode
  return mode === 'sidebar-header' || mode === 'sidebar-only' || mode === 'mixed'
})

const showHeader = computed(() => {
  const mode = layoutStore.config.mode
  return mode === 'sidebar-header' || mode === 'header-only' || mode === 'mixed' || mode === 'top-menu'
})

// 固定侧边栏会脱离 flex 文档流，主容器需要使用同一个实时宽度预留空间。
// 将这个值集中在布局根节点，避免顶栏、标签栏和内容区各自计算偏移量。
const sidebarOffset = computed(() => (
  appStore.sidebarCollapsed
    ? layoutStore.config.collapsedWidth
    : layoutStore.config.sidebarWidth
))

const layoutClasses = computed(() => {
  const classes = [`layout--${layoutStore.config.mode}`]

  if (layoutStore.config.fixedHeader) {
    classes.push('layout--fixed-header')
  }

  if (layoutStore.config.fixedSidebar) {
    classes.push('layout--fixed-sidebar')
  }

  if (appStore.sidebarCollapsed) {
    classes.push('sidebar-collapsed')
  }

  if (layoutStore.config.enableTabs) {
    classes.push('layout--with-tabs')
  }

  return classes
})
</script>

<style scoped lang="scss">
.layout {
  width: 100%;
  height: 100vh;
  display: flex;
  overflow: hidden;
  background: var(--cp-bg);

  .main-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  // ========== 布局模式 ==========

  // 1. 侧边栏+顶栏模式（默认）
  &--sidebar-header {
    // 默认布局，无需额外样式
  }

  // 2. 仅顶栏模式
  &--header-only {
    .main-container {
      width: 100%;
    }
  }

  // 3. 仅侧边栏模式
  &--sidebar-only {
    .main-container {
      width: 100%;
    }
  }

  // 4. 混合模式（侧边栏 + 顶栏，顶栏包含二级菜单）
  &--mixed {
    // 与 sidebar-header 类似，但顶栏可能包含额外菜单
  }

  // 5. 顶部菜单模式（菜单在顶栏）
  &--top-menu {
    .main-container {
      width: 100%;
    }
  }

  // ========== 固定顶栏 ==========
  // 页面只有 app-main 可以滚动，顶栏和标签栏处于 main-container 的普通 flex
  // 文档流中时已经天然固定在视口顶部。不要再使用 position: fixed，否则它们
  // 会按视口宽度计算，同时脱离主容器，导致侧边栏折叠时出现横向溢出。
  &--fixed-header {
    :deep(.app-header),
    :deep(.tabs-bar) {
      position: relative;
    }
  }

  // ========== 固定侧边栏 ==========
  &--fixed-sidebar {
    :deep(.app-sidebar) {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: $z-sticky;
    }

    &.layout--sidebar-header,
    &.layout--sidebar-only,
    &.layout--mixed {
      .main-container {
        margin-left: var(--layout-sidebar-width);
        transition: margin-left $transition-base;
      }
    }
  }

  // ========== 响应式 ==========
  @include media-max($breakpoint-md) {
    .main-container {
      margin-left: 0 !important;
    }

    // 移动端：侧边栏收起，固定头部不偏移
    &--fixed-header {
      :deep(.app-header),
      :deep(.tabs-bar) {
        left: 0 !important;
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
</style>
