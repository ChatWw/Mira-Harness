<template>
  <aside
    class="app-sidebar"
    :class="[`app-sidebar--${windowChrome}`, { collapsed: appStore.sidebarCollapsed }]"
    :style="{
      width: appStore.sidebarCollapsed ? '48px' : '240px',
    }"
  >
    <div class="sidebar-window-chrome">
      <el-dropdown
        v-if="isWindowsOverlay && showBrand && !appStore.sidebarCollapsed"
        trigger="click"
        placement="bottom-start"
        popper-class="windows-mira-menu-popper"
        @command="handleWindowCommand"
      >
        <button type="button" class="sidebar-brand sidebar-brand--button">
          <img v-if="layoutStore.config.showLogo" :src="miraLogo" class="brand-logo" alt="" />
          <span class="brand-text" :class="{ 'brand-text-shimmer': layoutStore.config.titleShimmerAnimation }">Mira</span>
          <AppIcon name="ArrowDown" class="brand-arrow" />
        </button>
        <template #dropdown><WindowMenuItems :groups="windowsMenuGroups" /></template>
      </el-dropdown>
      <div v-else-if="showBrand && !appStore.sidebarCollapsed" class="sidebar-brand">
        <img v-if="layoutStore.config.showLogo" :src="miraLogo" class="brand-logo" alt="" />
        <span class="brand-text" :class="{ 'brand-text-shimmer': layoutStore.config.titleShimmerAnimation }">Mira</span>
      </div>
      <el-tooltip v-else-if="isWindowsOverlay && showBrand" content="Mira 菜单" placement="right">
        <el-dropdown trigger="click" placement="bottom-start" popper-class="windows-mira-menu-popper" @command="handleWindowCommand">
          <button type="button" class="compact-brand" aria-label="打开 Mira 菜单">M</button>
          <template #dropdown><WindowMenuItems :groups="windowsMenuGroups" /></template>
        </el-dropdown>
      </el-tooltip>

      <div v-if="!appStore.sidebarCollapsed" class="sidebar-chrome-actions">
        <el-tooltip content="全局搜索 (Ctrl+K)" placement="bottom">
          <button type="button" class="chrome-action" aria-label="全局搜索" @click="handleSearch"><AppIcon name="Search" /></button>
        </el-tooltip>
        <el-tooltip content="折叠侧边栏" placement="bottom">
          <button type="button" class="chrome-action" aria-label="折叠侧边栏" @click="appStore.toggleSidebar()"><AppIcon name="tabler:layout-sidebar-right-expand" /></button>
        </el-tooltip>
      </div>
    </div>

    <div v-if="appStore.sidebarCollapsed" class="sidebar-compact-actions">
      <el-tooltip content="展开侧边栏" placement="right"><button type="button" class="compact-action" aria-label="展开侧边栏" @click="appStore.toggleSidebar()"><AppIcon name="tabler:layout-sidebar-left-expand" /></button></el-tooltip>
      <el-tooltip content="全局搜索 (Ctrl+K)" placement="right"><button type="button" class="compact-action" aria-label="全局搜索" @click="handleSearch"><AppIcon name="Search" /></button></el-tooltip>
      <el-tooltip content="新对话" placement="right"><button type="button" class="compact-action" aria-label="新对话" @click="newSession"><AppIcon name="tabler:edit" /></button></el-tooltip>
    </div>

    <div v-else class="sidebar-fixed-action" :class="{ 'is-scrolled': sidebarScrolled }">
      <button type="button" class="sidebar-new-session" @click="newSession"><AppIcon name="tabler:edit" /><span>新对话</span></button>
    </div>

    <div class="sidebar-content" @scroll="handleSidebarScroll">
      <WorkspaceNavigation :collapsed="appStore.sidebarCollapsed" />
      <el-menu ref="menuRef" :default-active="currentRoute" :collapse="appStore.sidebarCollapsed" :unique-opened="layoutStore.config.uniqueOpened" :style="appStore.sidebarCollapsed ? { '--el-menu-base-level-padding': '8px' } : undefined" class="sidebar-menu" @select="handleMenuSelect" @open="handleMenuOpen" @close="handleMenuClose">
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
import { computed, defineComponent, h, ref, watch } from 'vue'
import { ElDropdownItem, ElDropdownMenu } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import miraLogo from '@/asset/mira-logo.png'
import { useAppStore } from '@/stores/app'
import { getAppCodeFromPath, getApplicationEntryPath, navigateToPath } from '@/config/navigation'
import { applications, runtimeNavigation } from '@/config/runtime'
import { useLayoutStore } from '@/stores/layout'
import { useHarnessStore } from '@/stores/harness'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import { useThemeStore } from '@/stores/theme'
import type { MenuItem } from '@/types'
import SidebarMenuItem from './SidebarMenuItem.vue'
import WorkspaceNavigation from './WorkspaceNavigation.vue'

const route = useRoute()
const router = useRouter()
withDefaults(defineProps<{ showBrand?: boolean }>(), {
  showBrand: true,
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
const windowChrome = window.platform?.windowChrome ?? 'standard'
const isWindowsOverlay = windowChrome === 'windows-overlay'
type WindowMenuGroup = { label: string; items: Array<{ label: string; action: string; divided?: boolean }> }
const windowsMenuGroups: WindowMenuGroup[] = [
  { label: '应用', items: [{ label: '关于 Mira', action: 'about' }, { label: '退出 Mira', action: 'quit', divided: true }] },
  { label: '编辑', items: [{ label: '撤销', action: 'undo' }, { label: '重做', action: 'redo' }, { label: '剪切', action: 'cut', divided: true }, { label: '复制', action: 'copy' }, { label: '粘贴', action: 'paste' }, { label: '全选', action: 'selectAll' }] },
  { label: '视图', items: [...(import.meta.env.DEV ? [{ label: '重新加载', action: 'reload' }, { label: '开发者工具', action: 'toggleDevTools' }] : []), { label: '切换全屏', action: 'toggleFullscreen', divided: import.meta.env.DEV }] },
  { label: '窗口', items: [{ label: '最小化', action: 'minimize' }, { label: '最大化/还原', action: 'maximize' }, { label: '关闭窗口', action: 'close' }] },
]
const WindowMenuItems = defineComponent({
  props: { groups: { type: Array as () => WindowMenuGroup[], required: true } },
  setup: props => () => h(ElDropdownMenu, null, () => props.groups.flatMap(group => [
    h('div', { class: 'windows-menu-group-label' }, group.label),
    ...group.items.map(item => h(ElDropdownItem, { key: item.action, command: item.action, divided: item.divided }, () => item.label)),
  ])),
})

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

function handleWindowCommand(action: string) {
  void window.platform?.windowCommand(action)
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

  .sidebar-window-chrome {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 0 8px;
    flex-shrink: 0;
    overflow: hidden;
    -webkit-app-region: drag;
  }

  &--macos-overlay:not(.collapsed) .sidebar-window-chrome {
    padding-left: 78px;
  }

  .sidebar-brand {
    display: flex;
    min-width: 0;
    height: 32px;
    align-items: center;
    gap: 7px;
    color: var(--cp-text);
    -webkit-app-region: no-drag;

    &--button {
      padding: 0 6px;
      border: 0;
      border-radius: var(--cp-radius-md);
      background: transparent;
      cursor: pointer;

      &:hover {
        background: var(--cp-bg-hover);
      }
    }
  }

  .brand-logo {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border-radius: var(--cp-radius-sm);
    object-fit: cover;
  }

  .brand-text {
    min-width: 0;
    overflow: hidden;
    color: var(--cp-text);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .brand-arrow {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    color: var(--cp-text-tertiary);
  }

  .sidebar-chrome-actions,
  .sidebar-compact-actions {
    display: flex;
    align-items: center;
  }

  .sidebar-chrome-actions {
    gap: 2px;
    flex: 0 0 auto;
    -webkit-app-region: no-drag;
  }

  .sidebar-compact-actions {
    flex-direction: column;
    gap: 2px;
    padding: 4px 4px 6px;
    border-bottom: 1px solid transparent;
  }

  .chrome-action,
  .compact-action,
  .compact-brand {
    display: grid;
    width: 32px;
    height: 32px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: var(--cp-radius-md);
    color: var(--cp-text-secondary);
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 16px;
    -webkit-app-region: no-drag;

    &:hover {
      color: var(--cp-text);
      background: var(--cp-sidebar-menu-hover-bg);
    }
  }

  .compact-brand {
    font-size: 13px;
    font-weight: 700;
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

  &.collapsed .sidebar-settings {
    width: 38px;
    justify-content: center;
    padding: 0;
    margin: 0 auto;
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

.el-popper.windows-mira-menu-popper,
.windows-mira-menu-popper {
  min-width: 220px;

  .windows-menu-group-label {
    padding: 8px 12px 4px;
    color: var(--cp-text-tertiary);
    font-size: 11px;
    font-weight: 600;
  }

  .el-dropdown-menu__item {
    color: var(--cp-text);

    &:hover {
      color: var(--cp-text);
      background: var(--cp-bg-hover);
    }
  }
}
</style>
