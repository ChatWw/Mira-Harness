<template>
  <aside
    class="app-sidebar"
    :class="{ collapsed: appStore.sidebarCollapsed }"
    :style="{
      width: appStore.sidebarCollapsed ? `${layoutStore.config.collapsedWidth}px` : `${layoutStore.config.sidebarWidth}px`,
      '--sidebar-width': appStore.sidebarCollapsed ? `${layoutStore.config.collapsedWidth}px` : `${layoutStore.config.sidebarWidth}px`,
    }"
  >
    <div v-if="showBrand" class="sidebar-header">
      <div class="brand">
        <div v-if="!textOnlyBrand && layoutStore.config.showLogo" class="brand-icon">
          <Sparkles :size="20" />
        </div>
        <transition name="fade">
          <span v-show="!appStore.sidebarCollapsed" class="brand-text brand-text-shimmer">
            {{ layoutStore.config.dynamicTitle }}
          </span>
        </transition>
      </div>
    </div>

    <el-menu
      ref="menuRef"
      :default-active="currentRoute"
      :collapse="appStore.sidebarCollapsed"
      :collapse-transition="layoutStore.config.sidebarCollapseAnimation"
      :unique-opened="layoutStore.config.uniqueOpened"
      :style="appStore.sidebarCollapsed
        ? { '--el-menu-base-level-padding': `${(layoutStore.config.collapsedWidth - 24) / 2}px` }
        : undefined"
      router
      class="sidebar-menu"
      @open="handleMenuOpen"
      @close="handleMenuClose"
    >
      <template v-for="item in displayedMenuList.filter((item: any) => item.visible !== false)" :key="item.id">
        <el-sub-menu v-if="item.children?.some((child: any) => child.visible !== false)" :index="item.id">
          <template #title>
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.title }}</span>
          </template>
          <el-menu-item
            v-for="child in item.children.filter((child: any) => child.visible !== false)"
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
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Sparkles } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useLayoutStore } from '@/stores/layout'
import { usePermissionStore } from '@/stores/permission'

const route = useRoute()
withDefaults(defineProps<{ showBrand?: boolean; textOnlyBrand?: boolean }>(), {
  showBrand: true,
  textOnlyBrand: false,
})
const appStore = useAppStore()
const layoutStore = useLayoutStore()
const permissionStore = usePermissionStore()
const menuRef = ref<{ close: (index: string) => void }>()
const openedSubmenuIndexes = ref<string[]>([])

const currentRoute = computed(() => route.path)
const displayedMenuList = computed(() => permissionStore.menuRoutes)

function handleMenuOpen(index: string) {
  if (layoutStore.config.uniqueOpened) {
    openedSubmenuIndexes.value = [index]
    return
  }

  if (!openedSubmenuIndexes.value.includes(index)) {
    openedSubmenuIndexes.value.push(index)
  }
}

function handleMenuClose(index: string) {
  openedSubmenuIndexes.value = openedSubmenuIndexes.value.filter(item => item !== index)
}

watch(
  () => layoutStore.config.uniqueOpened,
  enabled => {
    if (!enabled || openedSubmenuIndexes.value.length < 2) {
      return
    }

    const currentIndex = openedSubmenuIndexes.value[openedSubmenuIndexes.value.length - 1]
    openedSubmenuIndexes.value
      .filter(index => index !== currentIndex)
      .forEach(index => menuRef.value?.close(index))
    openedSubmenuIndexes.value = [currentIndex]
  }
)
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

      .brand-text-shimmer {
        display: inline-block;
        background: linear-gradient(
          110deg,
          var(--cp-text) 38%,
          color-mix(in srgb, var(--cp-text) 35%, var(--cp-primary)) 46%,
          var(--cp-primary) 52%,
          color-mix(in srgb, var(--cp-text) 35%, var(--cp-primary)) 58%,
          var(--cp-text) 66%
        );
        background-size: 250% 100%;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: title-shimmer 5s ease-in-out infinite;
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

@keyframes title-shimmer {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -150% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-text-shimmer {
    animation: none;
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
