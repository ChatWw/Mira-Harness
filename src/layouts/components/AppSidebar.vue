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
            <img :src="miraLogo" class="brand-logo" alt="Mira" />
          </div>
          <transition name="fade" type="transition">
            <span v-show="!appStore.sidebarCollapsed" class="brand-text brand-text-shimmer">
              {{ APP_NAME }}
            </span>
          </transition>
        </div>
      </div>
    </Transition>

    <div class="sidebar-fixed-action" :class="{ 'is-scrolled': sidebarScrolled }">
      <el-tooltip :disabled="!appStore.sidebarCollapsed" content="新对话" placement="right">
        <button type="button" class="sidebar-new-session" @click="newSession"><AppIcon name="tabler:edit" /><span v-if="!appStore.sidebarCollapsed">新对话</span></button>
      </el-tooltip>
    </div>

    <div class="sidebar-content" @scroll="handleSidebarScroll">
      <WorkspaceNavigation :collapsed="appStore.sidebarCollapsed" />
      <el-menu ref="menuRef" :default-active="currentRoute" :collapse="appStore.sidebarCollapsed" :unique-opened="layoutStore.config.uniqueOpened" :style="appStore.sidebarCollapsed ? { '--el-menu-base-level-padding': `${(layoutStore.config.collapsedWidth - 24 - 8) / 2}px` } : undefined" class="sidebar-menu" @select="handleMenuSelect" @open="handleMenuOpen" @close="handleMenuClose">
        <template v-if="!appStore.sidebarCollapsed"><div class="menu-group-label">应用</div></template>
        <SidebarMenuItem v-for="item in applicationMenus" :key="item.id" :item="item" />
        <template v-if="!appStore.sidebarCollapsed"><div class="menu-group-label">菜单</div></template>
        <SidebarMenuItem v-for="item in browserMenus" :key="item.id" :item="item" />
      </el-menu>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import miraLogo from '@/asset/mira-logo.png'
import { useAppStore } from '@/stores/app'
import { navigateToPath } from '@/config/navigation'
import { runtimeNavigation } from '@/config/runtime'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import { useHarnessStore } from '@/stores/harness'
import type { MenuItem } from '@/types'
import SidebarMenuItem from './SidebarMenuItem.vue'
import WorkspaceNavigation from './WorkspaceNavigation.vue'

const route = useRoute()
const router = useRouter()
withDefaults(defineProps<{ showBrand?: boolean; textOnlyBrand?: boolean }>(), {
  showBrand: true,
  textOnlyBrand: false,
})
const appStore = useAppStore()
const layoutStore = useLayoutStore()
const harnessStore = useHarnessStore()
const menuRef = ref<{ close: (index: string) => void }>()
const openedSubmenuIndexes = ref<string[]>([])
const sidebarScrolled = ref(false)

const currentRoute = computed(() => route.path)
const applicationMenus = computed(() => runtimeNavigation.mainMenus.filter(item => item.target?.type === 'component'))
function iframeTree(items: MenuItem[]): MenuItem[] { return items.flatMap(item => { if (item.target?.type === 'iframe') return [{ ...item, children: item.children ? iframeTree(item.children) : undefined }]; const children = item.children ? iframeTree(item.children) : []; return children.length ? [{ ...item, children }] : [] }) }
const browserMenus = computed(() => iframeTree(runtimeNavigation.mainMenus))
const displayedMenuList = computed(() => [...applicationMenus.value, ...browserMenus.value])

function handleMenuSelect(path: string) {
  navigateToPath(router, path)
}

async function newSession() {
  const draft = harnessStore.startDraft()
  await router.push({ path: '/workspace/chat', query: { draft } })
}

function handleSidebarScroll(event: Event) {
  sidebarScrolled.value = (event.currentTarget as HTMLElement).scrollTop > 0
}

function handleMenuOpen(index: string) {
  if (layoutStore.config.uniqueOpened) {
    openedSubmenuIndexes.value = findMenuIdPath(displayedMenuList.value, index) || [index]
    return
  }

  if (!openedSubmenuIndexes.value.includes(index)) {
    openedSubmenuIndexes.value.push(index)
  }
}

function handleMenuClose(index: string) {
  openedSubmenuIndexes.value = openedSubmenuIndexes.value.filter(item => item !== index)
}

function findMenuIdPath(menus: MenuItem[], id: string): string[] | undefined {
  for (const menu of menus) {
    if (menu.id === id) return [menu.id]
    const childPath = menu.children && findMenuIdPath(menu.children, id)
    if (childPath) return [menu.id, ...childPath]
  }
}

watch(
  () => layoutStore.config.uniqueOpened,
  enabled => {
    if (!enabled || openedSubmenuIndexes.value.length < 2) {
      return
    }

    const currentIndex = openedSubmenuIndexes.value[openedSubmenuIndexes.value.length - 1]
    const keepIndexes = findMenuIdPath(displayedMenuList.value, currentIndex) || [currentIndex]
    openedSubmenuIndexes.value
      .filter(index => !keepIndexes.includes(index))
      .forEach(index => menuRef.value?.close(index))
    openedSubmenuIndexes.value = keepIndexes
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
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: inherit;
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

  .sidebar-content {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .sidebar-fixed-action {
    flex-shrink: 0;
    padding: 10px 8px 2px;
    border-bottom: 1px solid transparent;
    transition: border-color var(--cp-animation-duration);

    &.is-scrolled {
      border-bottom-color: var(--cp-border-light);
    }
  }

  .sidebar-new-session {
    display: flex;
    width: 100%;
    height: 32px;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    color: var(--cp-sidebar-menu-text);
    background: transparent;
    border: 0;
    border-radius: $radius-md;
    font: inherit;
    font-size: 14px;
    font-weight: $font-medium;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--cp-sidebar-menu-hover-bg);
    }
  }

  .sidebar-menu {
    border: none;
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

    :deep(.el-menu-item > .app-icon),
    :deep(.el-sub-menu__title > .app-icon) {
      flex: 0 0 var(--el-menu-icon-width);
      width: var(--el-menu-icon-width);
      margin-right: 5px;
      text-align: center;
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

  .menu-group-label { padding: 16px 14px 4px; color: var(--cp-text-tertiary); font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: uppercase; }

  &.collapsed .sidebar-menu {
    width: 100%;

    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      width: calc(100% - 8px);
      margin: 2px 4px;
    }
  }

  &.collapsed .sidebar-fixed-action {
    padding-right: 4px;
    padding-left: 4px;
  }

  &.collapsed .sidebar-new-session {
    width: 38px;
    justify-content: center;
    padding: 0;
    margin: 0 auto;
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
