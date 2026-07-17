<template>
  <aside
    class="app-sidebar"
    :class="{ collapsed: appStore.sidebarCollapsed }"
    :style="{
      width: appStore.sidebarCollapsed ? `${layoutStore.config.collapsedWidth}px` : `${layoutStore.config.sidebarWidth}px`,
      '--sidebar-width': appStore.sidebarCollapsed ? `${layoutStore.config.collapsedWidth}px` : `${layoutStore.config.sidebarWidth}px`,
    }"
  >
    <div v-if="showBrand && layoutStore.config.showLogo" class="sidebar-header">
      <div class="brand">
        <div class="brand-icon">
          <Sparkles :size="20" />
        </div>
        <transition name="fade">
          <span v-show="!appStore.sidebarCollapsed" class="brand-text">
            {{ layoutStore.config.dynamicTitle }}
          </span>
        </transition>
      </div>
    </div>

    <el-menu
      :default-active="currentRoute"
      :collapse="appStore.sidebarCollapsed"
      :collapse-transition="layoutStore.config.sidebarCollapseAnimation"
      :unique-opened="layoutStore.config.uniqueOpened"
      router
      class="sidebar-menu"
    >
      <template v-for="item in displayedMenuList" :key="item.id">
        <el-sub-menu v-if="item.children" :index="item.id">
          <template #title>
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.title }}</span>
          </template>
          <el-menu-item
            v-for="child in item.children"
            :key="child.id"
            :index="child.path"
          >
            <el-icon><component :is="child.icon" /></el-icon>
            <span>{{ child.title }}</span>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item v-else :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </template>
    </el-menu>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Sparkles } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useLayoutStore } from '@/stores/layout'
import { usePermissionStore } from '@/stores/permission'

const route = useRoute()
const props = withDefaults(defineProps<{ showBrand?: boolean; activeModuleOnly?: boolean }>(), { showBrand: true, activeModuleOnly: false })
const appStore = useAppStore()
const layoutStore = useLayoutStore()
const permissionStore = usePermissionStore()

const currentRoute = computed(() => route.path)
const displayedMenuList = computed(() => {
  const menus = permissionStore.menuRoutes
  if (!props.activeModuleOnly) return menus
  const activeModule = menus.find((item: any) => item.path === route.path || item.children?.some((child: any) => child.path === route.path))
  return activeModule?.children || (activeModule ? [activeModule] : menus)
})
</script>

<style scoped lang="scss">
.app-sidebar {
  height: 100%;
  background: var(--cp-bg-elevated);
  border-right: 1px solid var(--cp-border);
  display: flex;
  flex-direction: column;
  transition: width $transition-base;
  position: relative;
  flex-shrink: 0;

  .sidebar-header {
    height: 64px;
    @include flex-center;
    border-bottom: 1px solid var(--cp-border);
    flex-shrink: 0;

    .brand {
      @include flex-center;
      justify-content: flex-start;
      gap: $spacing-sm;
      padding: 0 $spacing-md;

      .brand-icon {
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, var(--cp-primary), var(--cp-primary-hover));
        border-radius: $radius-md;
        @include flex-center;
        color: white;
        flex-shrink: 0;
      }

      .brand-text {
        font-size: $font-lg;
        font-weight: 600;
        color: var(--cp-text);
        white-space: nowrap;
      }
    }
  }

  .sidebar-menu {
    flex: 1;
    border: none;
    overflow-y: auto;
    background: transparent;

    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      height: 48px;
      line-height: 48px;
    }

    :deep(.el-menu-item.is-active) {
      background: var(--cp-primary-lighter);
      color: var(--cp-primary);

      .el-icon {
        color: var(--cp-primary);
      }
    }
  }

  @include media-max($breakpoint-md) {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: $z-fixed;
    transform: translateX(-100%);
    transition: transform $transition-base;

    &:not(.collapsed) {
      transform: translateX(0);
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity $transition-base;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
