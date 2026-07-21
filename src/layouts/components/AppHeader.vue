<template>
  <header class="app-header">
    <div class="header-left">
      <el-button
        v-if="hasSidebar"
        text
        :icon="appStore.sidebarCollapsed ? Expand : Fold"
        @click="appStore.toggleSidebar()"
        class="collapse-btn"
      />

      <Breadcrumb v-if="layoutStore.config.showBreadcrumb" class="breadcrumb" />
    </div>
    <div class="header-right">
      <el-tooltip content="全局搜索 (Ctrl+K)"><el-button text :icon="Search" @click="handleSearch" /></el-tooltip>
      <Notification />
      <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'"><el-button text :icon="isFullscreen ? Crop : FullScreen" @click="toggleFullscreen" /></el-tooltip>
      <el-tooltip content="切换主题模式"><el-button text :icon="themeStore.themeMode === 'dark' ? Sunny : Moon" @click="handleThemeToggle" /></el-tooltip>
      <el-tooltip content="全局配置"><el-button text :icon="Setting" @click="layoutStore.openSettings()" /></el-tooltip>
    </div>
    <SearchBar ref="searchBarRef" />
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Crop, Expand, Fold, FullScreen, Moon, Search, Setting, Sunny } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'
import Breadcrumb from '@/components/Breadcrumb/index.vue'
import Notification from '@/components/Notification/index.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const hasSidebar = computed(() => ['sidebar-header', 'sidebar-only'].includes(layoutStore.config.mode))
const searchBarRef = ref()
const isFullscreen = ref(false)

function handleSearch() { searchBarRef.value?.open() }
function handleThemeToggle(event: MouseEvent) { themeStore.toggleThemeModeWithTransition(event) }
function toggleFullscreen() {
  if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); isFullscreen.value = true }
  else { document.exitFullscreen(); isFullscreen.value = false }
}
</script>

<style scoped lang="scss">
.app-header {
  width: 100%;
  height: 48px;
  background: var(--cp-bg);
  border-bottom: 1px solid var(--cp-layout-border);
  padding: 0 $spacing-lg;
  @include flex-between;
  gap: $spacing-md;
  flex-shrink: 0;

  .header-left {
    @include flex-center;
    justify-content: flex-start;
    flex: 1;
    gap: $spacing-md;

    .collapse-btn {
      font-size: $font-xl;
    }

    .breadcrumb {
      flex: 1;
    }
  }

  .header-right {
    @include flex-center;
    gap: 2px;

    :deep(.el-button) {
      width: 32px;
      height: 32px;
      padding: 0;
      margin: 0;
    }

    :deep(.el-button + .el-button) {
      margin-left: 0;
    }

    :deep(.notification-trigger) {
      width: 32px;
      height: 32px;
    }
  }

  @include media-max($breakpoint-md) {
    padding: 0 $spacing-md;
  }
}

</style>
