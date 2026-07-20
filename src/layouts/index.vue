<template>
  <div
    class="layout"
    :class="layoutClasses"
    :style="{ '--layout-sidebar-width': `${sidebarOffset}px` }"
  >
    <!-- 系统级导航：品牌、应用选择器与账户入口 -->
    <GlobalHeader v-if="showGlobalHeader" />

    <div class="layout-workspace">
      <!-- 仅侧栏模式：窄应用栏 + 二级菜单栏 + 主工作区 -->
      <GlobalHeader v-if="isSidebarOnly" variant="rail" />

      <!-- 侧边栏：仅承担工作区导航 -->
      <AppSidebar
        v-if="showSidebar"
        :show-brand="!showGlobalHeader"
        :text-only-brand="isSidebarOnly"
      />

      <!-- 主容器 -->
      <div class="main-container">
        <!-- 工作区工具栏 -->
        <AppHeader v-if="showHeader" />

        <!-- 多标签页 -->
        <TabsBar v-if="layoutStore.config.enableTabs && showHeader" />

        <!-- 主内容区 -->
        <AppMain />

        <!-- 底栏 -->
        <AppFooter v-if="layoutStore.config.showFooter" />
      </div>
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
import GlobalHeader from './components/GlobalHeader.vue'
import AppHeader from './components/AppHeader.vue'
import TabsBar from './components/TabsBar.vue'
import AppMain from './components/AppMain.vue'
import AppFooter from './components/AppFooter.vue'
import AppSettings from './components/AppSettings.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const isSidebarOnly = computed(() => layoutStore.config.mode === 'sidebar-only')

// 根据布局模式显示/隐藏侧边栏和顶栏
const showSidebar = computed(() => true)
const showHeader = computed(() => true)

const showGlobalHeader = computed(() => layoutStore.config.mode === 'sidebar-header')

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
  &--fixed-sidebar:not(.layout--sidebar-only) {
    :deep(.app-sidebar) {
      position: fixed;
      top: v-bind('showGlobalHeader ? layoutStore.config.headerHeight + "px" : "0"');
      left: 0;
      bottom: 0;
      z-index: $z-sticky;
    }

    &.layout--sidebar-header {
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
