<template>
  <div class="layout" :class="layoutClasses">
    <!-- 侧边栏 -->
    <AppSidebar v-if="showSidebar" />

    <!-- 主容器 -->
    <div class="main-container">
      <!-- 头部 -->
      <AppHeader v-if="showHeader" />

      <!-- 主体内容 -->
      <AppMain />

      <!-- 底栏 -->
      <AppFooter />
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
import AppMain from './components/AppMain.vue'
import AppFooter from './components/AppFooter.vue'
import AppSettings from './components/AppSettings.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()

const showSidebar = computed(() => layoutStore.config.mode !== 'header-only')
const showHeader = computed(() => layoutStore.config.mode !== 'sidebar-only')

const layoutClasses = computed(() => {
  const classes = [`layout--${layoutStore.config.mode}`]

  if (layoutStore.config.fixedHeader) {
    classes.push('layout--fixed-header')
  }

  if (appStore.sidebarCollapsed) {
    classes.push('sidebar-collapsed')
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

  .main-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  // 侧边栏+顶栏模式（默认）
  &--sidebar-header {
    // 默认布局，无需额外样式
  }

  // 仅顶栏模式
  &--header-only {
    .main-container {
      width: 100%;
    }
  }

  // 仅侧边栏模式
  &--sidebar-only {
    .main-container {
      width: 100%;
    }
  }

  // 固定顶栏模式
  &--fixed-header {
    &.layout--sidebar-header {
      :deep(.app-header) {
        position: fixed;
        top: 0;
        right: 0;
        left: 240px;
        z-index: 100;
        transition: left $transition-base;
      }

      &.sidebar-collapsed {
        :deep(.app-header) {
          left: 64px;
        }
      }
    }

    &.layout--header-only {
      :deep(.app-header) {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
      }
    }
  }

  @include media-max($breakpoint-md) {
    &--fixed-header {
      :deep(.app-header) {
        left: 0 !important;
      }
    }
  }
}
</style>
