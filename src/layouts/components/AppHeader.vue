<template>
  <header class="app-header">
    <div class="header-left">
      <el-button
        v-if="hasSidebar"
        text
        @click="appStore.toggleSidebar()"
        class="collapse-btn"
      ><AppIcon :name="appStore.sidebarCollapsed ? 'Expand' : 'Fold'" /></el-button>

      <Breadcrumb v-if="layoutStore.config.showBreadcrumb" class="breadcrumb" />
    </div>
    <div class="header-right">
      <el-tooltip content="全局搜索 (Ctrl+K)"><el-button text @click="handleSearch"><AppIcon name="Search" /></el-button></el-tooltip>
      <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'"><el-button text @click="toggleFullscreen"><AppIcon :name="isFullscreen ? 'Crop' : 'FullScreen'" /></el-button></el-tooltip>
      <el-tooltip content="切换主题模式"><el-button text @click="handleThemeToggle"><AppIcon :name="themeStore.themeMode === 'dark' ? 'Sunny' : 'Moon'" /></el-button></el-tooltip>
      <el-tooltip content="设置"><el-button text @click="openSettings"><AppIcon name="Setting" /></el-button></el-tooltip>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'
import Breadcrumb from '@/components/Breadcrumb/index.vue'
import { useCommandPaletteStore } from '@/stores/commandPalette'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const hasSidebar = computed(() => ['sidebar-header', 'sidebar-only'].includes(layoutStore.config.mode))
const commandPaletteStore = useCommandPaletteStore()
const route = useRoute()
const router = useRouter()
const isFullscreen = ref(false)

function handleSearch() { commandPaletteStore.open() }
function openSettings() { void router.push({ path: '/settings/general', query: { from: route.fullPath } }) }
function handleThemeToggle(event: MouseEvent) {
  themeStore.toggleThemeModeWithTransition(event, layoutStore.config.themeTransitionAnimation)
}
function toggleFullscreen() {
  if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); isFullscreen.value = true }
  else { document.exitFullscreen(); isFullscreen.value = false }
}
</script>

<style scoped lang="scss">
.app-header {
  width: 100%;
  height: 44px;
  background: var(--cp-bg);
  padding: 0 $spacing-md;
  @include flex-between;
  gap: $spacing-sm;
  flex-shrink: 0;

  .header-left {
    @include flex-center;
    justify-content: flex-start;
    flex: 1;
    gap: $spacing-sm;

    .collapse-btn {
      font-size: $font-lg;
    }

    .breadcrumb {
      flex: 1;
    }
  }

  .header-right {
    @include flex-center;
    gap: 2px;

    :deep(.el-button) {
      width: 28px;
      height: 28px;
      padding: 0;
      margin: 0;
    }

    :deep(.el-button + .el-button) {
      margin-left: 0;
    }

  }

  @include media-max($breakpoint-md) {
    padding: 0 $spacing-md;
  }
}

</style>
