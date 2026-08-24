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
        <div class="sidebar-brand-actions">
          <el-tooltip content="全局搜索 (Ctrl+K)" :disabled="appStore.sidebarCollapsed" placement="right">
            <button type="button" class="brand-action" @click="handleSearch"><AppIcon name="Search" /></button>
          </el-tooltip>
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

    <div class="sidebar-footer">
      <el-popover
        v-model:visible="settingsMenuVisible"
        placement="top-start"
        :width="240"
        :padding="6"
        :show-arrow="false"
        trigger="click"
        popper-class="settings-menu-popper"
      >
        <template #reference>
          <button type="button" class="sidebar-settings">
            <AppIcon name="Setting" />
            <span v-if="!appStore.sidebarCollapsed">设置</span>
          </button>
        </template>
        <div class="settings-menu">
          <button type="button" class="settings-menu-item" @click="openSettings">
            <AppIcon name="Setting" /><span>设置</span>
          </button>
          <div class="settings-menu-item settings-menu-item--appearance">
            <button type="button" class="settings-menu-item__main" @click="openAppearance">
              <AppIcon name="lucide:paintbrush-vertical" /><span>外观</span>
            </button>
            <div class="theme-segment" role="radiogroup" aria-label="主题模式">
              <button type="button" :class="{ 'is-active': themeStore.themeMode === 'light' }" @click="setTheme('light')">浅色</button>
              <button type="button" :class="{ 'is-active': themeStore.themeMode === 'dark' }" @click="setTheme('dark')">深色</button>
            </div>
          </div>
          <div class="settings-menu-item settings-menu-item--submenu">
            <el-popover
              v-model:visible="appFlyoutVisible"
              placement="right-start"
              :width="200"
              :padding="6"
              :show-arrow="false"
              :offset="20"
              trigger="click"
              popper-class="settings-app-popper"
            >
              <template #reference>
                <button type="button" class="settings-menu-item__main">
                  <AppIcon name="Grid" /><span>选择应用</span>
                  <span class="settings-submenu-label">{{ selectedAppName }}</span>
                  <AppIcon class="settings-submenu-arrow" name="ArrowRight" />
                </button>
              </template>
              <div class="settings-app-menu">
                <button
                  v-for="app in applications"
                  :key="app.code"
                  type="button"
                  class="settings-app-item"
                  :class="{ 'is-active': app.code === currentAppCode }"
                  @click="switchApp(app.code)"
                >
                  <AppIcon :name="app.icon || 'Grid'" />
                  <span class="settings-app-item__name">{{ app.name }}</span>
                  <AppIcon v-if="app.code === currentAppCode" name="Check" class="settings-app-item__check" />
                </button>
              </div>
            </el-popover>
          </div>
          <button type="button" class="settings-menu-item" @click="openHelp">
            <AppIcon name="lucide:circle-question-mark" /><span>帮助与反馈</span>
          </button>
          <button type="button" class="settings-menu-item" @click="checkUpdate">
            <AppIcon name="material-symbols:update" /><span>检查更新</span>
          </button>
        </div>
      </el-popover>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import miraLogo from '@/asset/mira-logo.png'
import { useAppStore } from '@/stores/app'
import { getAppCodeFromPath, getApplicationEntryPath, navigateToPath } from '@/config/navigation'
import { applications, runtimeNavigation } from '@/config/runtime'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import { useHarnessStore } from '@/stores/harness'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import { useThemeStore } from '@/stores/theme'
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
const commandPaletteStore = useCommandPaletteStore()
const themeStore = useThemeStore()
const menuRef = ref<{ close: (index: string) => void }>()
const openedSubmenuIndexes = ref<string[]>([])
const sidebarScrolled = ref(false)
const settingsMenuVisible = ref(false)
const appFlyoutVisible = ref(false)

const currentRoute = computed(() => route.path)
const currentAppCode = computed(() => getAppCodeFromPath(route.path))
const selectedAppName = computed(() => applications.value.find(app => app.code === currentAppCode.value)?.name || '通用')
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

function handleSearch() {
  commandPaletteStore.open()
}

function closeSettingsMenu() {
  settingsMenuVisible.value = false
}

function switchApp(code: string) {
  closeSettingsMenu()
  appFlyoutVisible.value = false
  navigateToPath(router, getApplicationEntryPath(code))
}

function openSettings() {
  closeSettingsMenu()
  void router.push({ path: '/settings/general', query: { from: route.fullPath } })
}

function openAppearance() {
  closeSettingsMenu()
  void router.push({ path: '/settings/appearance', query: { from: route.fullPath } })
}

function openHelp() {
  closeSettingsMenu()
  void router.push({ path: '/settings/about', query: { from: route.fullPath } })
}

function setTheme(mode: 'light' | 'dark') {
  themeStore.setThemeModeWithTransition(mode, undefined, layoutStore.config.themeTransitionAnimation)
}

function checkUpdate() {
  closeSettingsMenu()
  window.open('https://github.com/ChatWw/Mira-Harness/releases', '_blank')
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
    padding: 0 10px;
    flex-shrink: 0;
    overflow: hidden;

    .brand {
      @include flex-center;
      justify-content: flex-start;
      gap: $spacing-xs;
      min-width: 0;

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

    .sidebar-brand-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    .brand-action {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: $radius-md;
      background: transparent;
      color: var(--cp-text-secondary);
      font-size: 16px;
      cursor: pointer;
      transition: color $transition-fast, background $transition-fast;

      &:hover {
        color: var(--cp-text);
        background: var(--cp-bg-hover);
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

  .sidebar-footer {
    flex-shrink: 0;
    padding: 6px 8px 10px;
    border-top: 1px solid var(--cp-border-light);
  }

  .sidebar-settings {
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

  &.collapsed .sidebar-brand-actions {
    display: none;
  }

  &.collapsed .sidebar-settings {
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

<style lang="scss">
// 设置菜单通过 Teleport 挂载到 body，使用非 scoped 规则覆盖弹层样式。
.el-popper.settings-menu-popper,
.settings-menu-popper {
  background: var(--cp-bg-elevated) !important;
  border: 1px solid var(--cp-border);
  border-radius: $radius-md;
  box-shadow: $shadow-md;

  .settings-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 200px;
    max-height: 60vh;
    overflow-y: auto;
  }

  .settings-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: $radius-sm;
    background: transparent;
    color: var(--cp-text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color $transition-fast;

    .app-icon {
      font-size: 15px;
      color: var(--cp-text-secondary);
    }

    &:hover {
      background: color-mix(in srgb, var(--cp-text) 10%, transparent);
    }
  }

  .settings-menu-item--appearance {
    justify-content: space-between;
    padding: 2px 6px 2px 10px;

    &:hover {
      background: transparent;
    }

    .settings-menu-item__main {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--cp-text);
      font: inherit;
      font-size: 13px;
      cursor: pointer;

      .app-icon {
        font-size: 15px;
        color: var(--cp-text-secondary);
      }

      &:hover {
        color: var(--cp-primary);

        .app-icon {
          color: var(--cp-primary);
        }
      }
    }
  }

  .theme-segment {
    display: inline-flex;
    padding: 2px;
    background: color-mix(in srgb, var(--cp-text) 8%, transparent);
    border-radius: 999px;

    button {
      padding: 3px 9px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--cp-text-secondary);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: background-color $transition-fast, color $transition-fast;

      &.is-active {
        background: var(--cp-bg);
        color: var(--cp-text);
        box-shadow: 0 1px 3px rgb(0 0 0 / 20%);
      }
    }
  }

  // 应用切换：二级菜单（触发行，点击在右侧弹出新弹窗）
  .settings-menu-item--submenu {
    display: block;
    padding: 2px 6px 2px 10px;

    &:hover {
      background: transparent;
    }

    .settings-menu-item__main {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 34px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--cp-text);
      font: inherit;
      font-size: 13px;
      cursor: pointer;

      .app-icon {
        font-size: 15px;
        color: var(--cp-text-secondary);
      }

      .settings-submenu-label {
        margin-left: auto;
        color: var(--cp-text-secondary);
        font-size: 12px;
      }

      .settings-submenu-arrow {
        font-size: 12px;
        color: var(--cp-text-tertiary);
      }

      &:hover {
        .app-icon {
          color: var(--cp-primary);
        }
      }
    }
  }
}

// 应用切换二级弹窗（右侧 flyout）
.settings-app-popper {
  background: var(--cp-bg-elevated) !important;
  border: 1px solid var(--cp-border);
  border-radius: $radius-md;
  box-shadow: $shadow-md;

  .settings-app-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 160px;
    max-height: 60vh;
    overflow-y: auto;
  }

  .settings-app-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: $radius-sm;
    background: transparent;
    color: var(--cp-text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color $transition-fast, color $transition-fast;

    .app-icon {
      font-size: 15px;
      color: var(--cp-text-secondary);
    }

    .settings-app-item__name {
      flex: 1;
    }

    .settings-app-item__check {
      font-size: 13px;
      color: var(--cp-primary);
    }

    &:hover {
      color: var(--cp-text);
      background: color-mix(in srgb, var(--cp-text) 10%, transparent);
    }

    &.is-active {
      color: var(--cp-text);
      font-weight: $font-medium;

      .app-icon {
        color: var(--cp-primary);
      }
    }
  }
}
</style>
