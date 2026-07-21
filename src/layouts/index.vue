<template>
  <div class="layout" :class="layoutClasses">
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

const layoutClasses = computed(() => {
  const classes = [`layout--${layoutStore.config.mode}`]

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

  // ========== 响应式 ==========
  @include media-max($breakpoint-md) {
    .main-container {
      margin-left: 0 !important;
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
