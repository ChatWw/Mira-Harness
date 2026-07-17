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
    <div class="header-right"><span>当前工作区</span></div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Expand, Fold } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useLayoutStore } from '@/stores/layout'
import Breadcrumb from '@/components/Breadcrumb/index.vue'

const appStore = useAppStore()
const layoutStore = useLayoutStore()
const hasSidebar = computed(() => ['sidebar-header', 'sidebar-only', 'mixed'].includes(layoutStore.config.mode))
</script>

<style scoped lang="scss">
.app-header {
  width: 100%;
  height: 48px;
  background: var(--cp-bg);
  border-bottom: 1px solid var(--cp-border);
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
    color: var(--cp-text-tertiary);
    font-size: $font-xs;
  }

  @include media-max($breakpoint-md) {
    padding: 0 $spacing-md;
  }
}

</style>
