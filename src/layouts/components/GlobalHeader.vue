<template>
  <aside v-if="variant === 'rail'" class="global-rail">
    <div v-if="layoutStore.config.showLogo" class="rail-brand" :title="APP_NAME">
      <img :src="miraLogo" class="brand-logo" alt="Mira" />
    </div>

    <div class="rail-app-list">
      <button
        v-for="app in applications"
        :key="app.code"
        class="rail-app"
        :class="{ 'is-active': app.code === currentAppCode }"
        :title="app.name"
        @click="handleAppChange(app.code)"
      >
        <AppIcon :name="app.icon || 'Grid'" />
      </button>
    </div>

  </aside>

  <header
    v-else
    class="global-header"
    :class="{ 'is-macos-overlay': isMacOverlay && !isFullscreen }"
    :style="{ height: `${headerHeight}px` }"
  >
    <div class="global-brand">
      <el-button
        text
        class="collapse-btn"
        @click="appStore.toggleSidebar()"
      ><AppIcon :name="appStore.sidebarCollapsed ? 'tabler:layout-sidebar-left-expand' : 'tabler:layout-sidebar-right-expand'" /></el-button>
      <Breadcrumb v-if="layoutStore.config.showBreadcrumb" class="global-breadcrumb" />
    </div>

    <div class="global-actions">
      <div class="application-switcher">
        <el-dropdown trigger="click" :hide-on-click="true" popper-class="application-popper" @command="handleAppChange">
          <button class="application-trigger">
            <AppIcon class="application-icon" :name="selectedApp?.icon || 'Grid'" />
            <span>{{ selectedApp?.name || '选择应用' }}</span>
            <AppIcon class="application-arrow" name="ArrowDown" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="app in applications" :key="app.code" :command="app.code" :class="{ 'is-current': app.code === currentAppCode }">
                <AppIcon v-if="app.icon" :name="app.icon" /><span>{{ app.name }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="global-toolbar">
        <el-tooltip content="全局搜索 (Ctrl+K)"><el-button text @click="handleSearch"><AppIcon name="Search" /></el-button></el-tooltip>
        <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'"><el-button text @click="toggleFullscreen"><AppIcon :name="isFullscreen ? 'Crop' : 'FullScreen'" /></el-button></el-tooltip>
        <el-tooltip content="切换主题模式"><el-button text @click="handleThemeToggle"><AppIcon :name="themeStore.themeMode === 'dark' ? 'Sunny' : 'Moon'" /></el-button></el-tooltip>
        <el-tooltip content="全局配置"><el-button text @click="layoutStore.openSettings()"><AppIcon name="Setting" /></el-button></el-tooltip>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import miraLogo from '@/asset/mira-logo.png'
import { applications } from '@/config/runtime'
import { getAppCodeFromPath, getApplicationEntryPath, navigateToPath } from '@/config/navigation'
import Breadcrumb from '@/components/Breadcrumb/index.vue'
import { useAppStore } from '@/stores/app'
import { useCommandPaletteStore } from '@/stores/commandPalette'
import { APP_NAME, useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const route = useRoute()
const { variant = 'header' } = defineProps<{ variant?: 'header' | 'rail' }>()
const appStore = useAppStore()
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const currentAppCode = computed(() => getAppCodeFromPath(route.path))
const selectedApp = computed(() => applications.value.find(app => app.code === currentAppCode.value))
const commandPaletteStore = useCommandPaletteStore()
const isFullscreen = ref(false)
const isMacOverlay = Boolean(window.platform) && navigator.userAgent.includes('Macintosh')
const headerHeight = computed(() => isMacOverlay ? 34 : layoutStore.config.headerHeight)

function handleAppChange(code: string) {
  navigateToPath(router, getApplicationEntryPath(code))
}

function handleSearch() { commandPaletteStore.open() }
function handleThemeToggle(event: MouseEvent) {
  themeStore.toggleThemeModeWithTransition(event, layoutStore.config.themeTransitionAnimation)
}
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

function syncFullscreenState() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

onMounted(() => document.addEventListener('fullscreenchange', syncFullscreenState))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', syncFullscreenState))
</script>

<style scoped lang="scss">
.global-header { width: 100%; min-height: 48px; display: flex; align-items: center; gap: $spacing-sm; padding: 0 10px; background: var(--cp-bg); flex-shrink: 0; z-index: $z-sticky; -webkit-app-region: drag; }
.global-header.is-macos-overlay { min-height: 34px; padding-left: 88px; }
.global-rail { width: 64px; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px 0; background: var(--cp-bg-elevated); flex-shrink: 0; }
.rail-brand, .rail-app { display: grid; width: 38px; height: 38px; place-items: center; border: 0; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); background: transparent; transition: color $transition-fast, background $transition-fast; }
.rail-brand { color: #fff; background: linear-gradient(135deg, var(--cp-primary), color-mix(in srgb, var(--cp-primary) 55%, #635bff)); box-shadow: 0 5px 12px color-mix(in srgb, var(--cp-primary) 25%, transparent); overflow: hidden; .brand-logo { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; } }
.rail-app-list { display: flex; flex-direction: column; gap: 6px; &.is-loading { opacity: .6; pointer-events: none; } }
.rail-app { font-size: 18px; &:hover, &.is-active { color: var(--cp-primary); background: var(--cp-primary-lighter); } }
.global-brand { min-width: 0; display: flex; align-items: center; gap: 7px; flex: 1; overflow: hidden; }
.application-switcher { display: flex; align-items: center; }.application-trigger { height: 30px; display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border: 0; border-radius: $radius-md; background: var(--cp-bg-hover); color: var(--cp-text); font-size: 13px; font-weight: 500; cursor: pointer; transition: background $transition-base, color $transition-base; &:hover { background: var(--cp-primary-lighter); color: var(--cp-primary); }.application-icon { color: var(--cp-primary); font-size: 15px; }.application-arrow { margin-left: 1px; font-size: 12px; color: var(--cp-text-tertiary); }.is-loading { opacity: .6; pointer-events: none; } }:global(.application-popper) { padding: $spacing-xs; background: var(--cp-bg-elevated); border: 1px solid var(--cp-border); border-radius: $radius-md; box-shadow: $shadow-md; }:global(.application-popper .el-dropdown-menu) { background: transparent; }:global(.application-popper .el-dropdown-menu__item) { display: flex; align-items: center; gap: $spacing-sm; min-width: 150px; margin: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent !important; &:hover { background: var(--cp-bg-hover) !important; color: var(--cp-text); } &:global(.is-current) { color: var(--cp-primary); background: var(--cp-primary-lighter) !important; } }
.collapse-btn, .global-breadcrumb, .global-actions { -webkit-app-region: no-drag; }.collapse-btn { font-size: $font-lg; flex-shrink: 0; }.global-breadcrumb { min-width: 0; overflow: hidden; }.global-actions { display: flex; align-items: center; gap: $spacing-sm; margin-left: auto; flex-shrink: 0; }.global-toolbar { display: flex; align-items: center; gap: 2px; :deep(.el-button) { width: 28px; height: 28px; padding: 0; margin: 0; } :deep(.el-button + .el-button) { margin-left: 0; } }
@include media-max($breakpoint-md) { .global-header { padding: 0 $spacing-md; }.global-header.is-macos-overlay { padding-left: 88px; }.global-breadcrumb { display: none; }.global-actions { gap: $spacing-xs; } }
</style>

<style lang="scss">
// 下拉层 Teleport 到 body，使用非 scoped 规则明确覆盖组件库的默认状态色。
.application-popper {
  .el-dropdown-menu__item {
    color: var(--cp-text) !important;
    background-color: transparent !important;

    &:hover {
      color: var(--cp-text) !important;
      background-color: var(--cp-bg-hover) !important;
    }

    &.is-current {
      color: var(--cp-primary) !important;
      background-color: var(--cp-primary-lighter) !important;
    }
  }
}
</style>
