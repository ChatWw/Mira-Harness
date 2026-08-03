<template>
  <aside
    class="app-sidebar"
    :class="{ collapsed: appStore.sidebarCollapsed }"
    :style="{
      width: appStore.sidebarCollapsed ? `${layoutStore.config.collapsedWidth}px` : `${layoutStore.config.sidebarWidth}px`,
      '--sidebar-width': appStore.sidebarCollapsed ? `${layoutStore.config.collapsedWidth}px` : `${layoutStore.config.sidebarWidth}px`,
    }"
  >
    <Transition name="sidebar-header-slide">
      <div v-if="showBrand" class="sidebar-header">
        <div class="brand">
          <div v-if="!textOnlyBrand && layoutStore.config.showLogo" class="brand-icon">
            <img :src="coreLogo" class="brand-logo" alt="" />
          </div>
          <transition name="fade">
            <span v-show="!appStore.sidebarCollapsed" class="brand-text brand-text-shimmer">
              {{ APP_NAME }}
            </span>
          </transition>
        </div>
      </div>
    </Transition>

    <el-menu
      ref="menuRef"
      :default-active="currentRoute"
      :collapse="appStore.sidebarCollapsed"
      :unique-opened="layoutStore.config.uniqueOpened"
      :style="appStore.sidebarCollapsed
        ? { '--el-menu-base-level-padding': `${(layoutStore.config.collapsedWidth - 24 - 8) / 2}px` }
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
import coreLogo from '@/asset/core.svg'
import { useAppStore } from '@/stores/app'
import { mainMenus, microMenus } from '@/config/menus'
import { APP_NAME, useLayoutStore } from '@/stores/layout'

const route = useRoute()
withDefaults(defineProps<{ showBrand?: boolean; textOnlyBrand?: boolean }>(), {
  showBrand: true,
  textOnlyBrand: false,
})
const appStore = useAppStore()
const layoutStore = useLayoutStore()
const menuRef = ref<{ close: (index: string) => void }>()
const openedSubmenuIndexes = ref<string[]>([])

const currentRoute = computed(() => route.path)
const displayedMenuList = computed(() => {
  const appCode = route.path.startsWith('/micro/') ? String(route.params.code) : 'main'
  return appCode === 'main' ? mainMenus : microMenus[appCode] || []
})

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
  background: var(--cp-sidebar-bg);
  display: flex;
  flex-direction: column;
  transition: width var(--cp-animation-duration);
  position: relative;
  flex-shrink: 0;

  .sidebar-header {
    height: 52px;
    @include flex-center;
    flex-shrink: 0;
    overflow: hidden;

    .brand {
      @include flex-center;
      justify-content: flex-start;
      gap: $spacing-xs;
      padding: 0 12px;

      .brand-icon {
        width: 28px;
        height: 28px;
        background: linear-gradient(135deg, var(--cp-primary), var(--cp-primary-hover));
        border-radius: $radius-md;
        @include flex-center;
        color: white;
        flex-shrink: 0;

        .brand-logo {
          width: 17px;
          height: 17px;
        }
      }

      .brand-text {
        font-size: $font-sm;
        font-weight: 600;
        color: var(--cp-text);
        white-space: nowrap;
      }

      .brand-text-shimmer {
        display: inline-block;
        background: linear-gradient(
          110deg,
          var(--cp-text) 38%,
          color-mix(in srgb, var(--cp-text) 35%, var(--cp-title-shimmer)) 46%,
          var(--cp-title-shimmer) 52%,
          color-mix(in srgb, var(--cp-text) 35%, var(--cp-title-shimmer)) 58%,
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
      height: 40px;
      line-height: 40px;
      width: calc(100% - 12px);
      margin: 2px 6px;
      border-radius: 999px;
      font-size: 13px;
      color: var(--cp-sidebar-menu-text);
      transition: background-color var(--cp-animation-duration), color var(--cp-animation-duration);

      .el-icon {
        color: inherit;
        font-size: 16px;
      }

      .el-sub-menu__icon-arrow {
        width: auto;
      }
    }

    :deep(.el-menu-item:not(.is-active):hover),
    :deep(.el-sub-menu__title:hover) {
      background: var(--cp-sidebar-menu-hover-bg);
      color: var(--cp-sidebar-menu-text);
    }

    :deep(.el-menu-item.is-active) {
      background: var(--cp-sidebar-menu-active-bg);
      color: var(--cp-sidebar-menu-active-text);

      .el-icon {
        color: var(--cp-sidebar-menu-active-text);
      }
    }
  }

  &.collapsed .sidebar-menu {
    width: 100%;

    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      width: calc(100% - 8px);
      margin: 2px 4px;
    }
  }

  @include media-max($breakpoint-md) {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: $z-fixed;
    transform: translateX(-100%);
    transition: transform var(--cp-animation-duration);

    &:not(.collapsed) {
      transform: translateX(0);
    }
  }
}

.sidebar-header-slide-enter-active,
.sidebar-header-slide-leave-active {
  transition: height var(--cp-animation-duration) ease, opacity var(--cp-animation-duration) ease, transform var(--cp-animation-duration) ease;
}

.sidebar-header-slide-enter-from,
.sidebar-header-slide-leave-to {
  height: 0;
  opacity: 0;
  transform: translateX(-12px);
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

  .sidebar-header-slide-enter-active,
  .sidebar-header-slide-leave-active {
    transition: none;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--cp-animation-duration);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
