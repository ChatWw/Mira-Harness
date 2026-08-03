<template>
  <aside v-if="variant === 'rail'" class="global-rail">
    <div v-if="layoutStore.config.showLogo" class="rail-brand" :title="APP_NAME">
      <img :src="coreLogo" class="brand-logo" alt="" />
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
        <el-icon><component :is="app.icon || 'Grid'" /></el-icon>
      </button>
    </div>

  </aside>

  <header v-else class="global-header" :style="{ height: `${layoutStore.config.headerHeight}px` }">
    <div class="global-brand">
      <div v-if="layoutStore.config.showLogo" class="brand-mark"><img :src="coreLogo" class="brand-logo" alt="" /></div>
      <span class="brand-title-shimmer">{{ APP_NAME }}</span>
      <el-button
        text
        :icon="appStore.sidebarCollapsed ? Expand : Fold"
        class="collapse-btn"
        @click="appStore.toggleSidebar()"
      />
      <Breadcrumb v-if="layoutStore.config.showBreadcrumb" class="global-breadcrumb" />
    </div>

    <div class="global-actions">
      <div class="application-switcher">
        <el-dropdown trigger="click" :hide-on-click="true" popper-class="application-popper" @command="handleAppChange">
          <button class="application-trigger">
            <el-icon class="application-icon"><component :is="selectedApp?.icon || 'Grid'" /></el-icon>
            <span>{{ selectedApp?.name || '选择应用' }}</span>
            <el-icon class="application-arrow"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="app in applications" :key="app.code" :command="app.code" :class="{ 'is-current': app.code === currentAppCode }">
                <el-icon v-if="app.icon"><component :is="app.icon" /></el-icon><span>{{ app.name }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="global-toolbar">
        <el-tooltip content="全局搜索 (Ctrl+K)"><el-button text :icon="Search" @click="handleSearch" /></el-tooltip>
        <Notification />
        <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'"><el-button text :icon="isFullscreen ? Crop : FullScreen" @click="toggleFullscreen" /></el-tooltip>
        <el-tooltip content="切换主题模式"><el-button text :icon="themeStore.themeMode === 'dark' ? Sunny : Moon" @click="handleThemeToggle" /></el-tooltip>
        <el-tooltip content="全局配置"><el-button text :icon="Setting" @click="layoutStore.openSettings()" /></el-tooltip>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, Crop, Expand, Fold, FullScreen, Moon, Search, Setting, Sunny } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import coreLogo from '@/asset/core.svg'
import { applications, microMenus } from '@/config/menus'
import Breadcrumb from '@/components/Breadcrumb/index.vue'
import Notification from '@/components/Notification/index.vue'
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
const currentAppCode = ref('main')
const selectedApp = computed(() => applications.find(app => app.code === currentAppCode.value))
const commandPaletteStore = useCommandPaletteStore()
const isFullscreen = ref(false)

function handleAppChange(code: string) {
  currentAppCode.value = code
  const menu = microMenus[code]?.[0]
  router.push(code === 'main' ? '/dashboard' : menu?.path || `/micro/${code}`)
}

watch(
  () => route.path,
  () => {
    currentAppCode.value = route.path.startsWith('/micro/') ? String(route.params.code) : 'main'
  },
  { immediate: true },
)

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
</script>

<style scoped lang="scss">
.global-header { width: 100%; min-height: 48px; display: flex; align-items: center; gap: $spacing-sm; padding: 0 10px; background: var(--cp-bg); flex-shrink: 0; z-index: $z-sticky; }
.global-rail { width: 64px; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px 0; background: var(--cp-bg-elevated); flex-shrink: 0; }
.rail-brand, .rail-app { display: grid; width: 38px; height: 38px; place-items: center; border: 0; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); background: transparent; transition: color $transition-fast, background $transition-fast; }
.rail-brand { color: #fff; background: linear-gradient(135deg, var(--cp-primary), color-mix(in srgb, var(--cp-primary) 55%, #635bff)); box-shadow: 0 5px 12px color-mix(in srgb, var(--cp-primary) 25%, transparent); .brand-logo { width: 18px; height: 18px; } }
.rail-app-list { display: flex; flex-direction: column; gap: 6px; &.is-loading { opacity: .6; pointer-events: none; } }
.rail-app { font-size: 18px; &:hover, &.is-active { color: var(--cp-primary); background: var(--cp-primary-lighter); } }
.global-brand { min-width: 0; display: flex; align-items: center; gap: 7px; flex: 1; font-size: 15px; font-weight: 650; color: var(--cp-text); white-space: nowrap; overflow: hidden; }
.brand-mark { width: 28px; height: 28px; display: grid; place-items: center; color: #fff; border-radius: 8px; background: linear-gradient(135deg, var(--cp-primary), color-mix(in srgb, var(--cp-primary) 55%, #635bff)); box-shadow: 0 5px 12px color-mix(in srgb, var(--cp-primary) 25%, transparent); .brand-logo { width: 17px; height: 17px; } }
.brand-title-shimmer { display: inline-block; background: linear-gradient(110deg, var(--cp-text) 38%, color-mix(in srgb, var(--cp-text) 35%, var(--cp-title-shimmer)) 46%, var(--cp-title-shimmer) 52%, color-mix(in srgb, var(--cp-text) 35%, var(--cp-title-shimmer)) 58%, var(--cp-text) 66%); background-size: 250% 100%; background-clip: text; -webkit-text-fill-color: transparent; animation: title-shimmer 5s ease-in-out infinite; }
@keyframes title-shimmer { from { background-position: 100% 0; } to { background-position: -150% 0; } }
@media (prefers-reduced-motion: reduce) { .brand-title-shimmer { animation: none; } }
.application-switcher { display: flex; align-items: center; }.application-trigger { height: 30px; display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border: 0; border-radius: $radius-md; background: var(--cp-bg-hover); color: var(--cp-text); font-size: 13px; font-weight: 500; cursor: pointer; transition: background $transition-base, color $transition-base; &:hover { background: var(--cp-primary-lighter); color: var(--cp-primary); }.application-icon { color: var(--cp-primary); font-size: 15px; }.application-arrow { margin-left: 1px; font-size: 12px; color: var(--cp-text-tertiary); }.is-loading { opacity: .6; pointer-events: none; } }:global(.application-popper) { padding: $spacing-xs; background: var(--cp-bg-elevated); border: 1px solid var(--cp-border); border-radius: $radius-md; box-shadow: $shadow-md; }:global(.application-popper .el-dropdown-menu) { background: transparent; }:global(.application-popper .el-dropdown-menu__item) { display: flex; align-items: center; gap: $spacing-sm; min-width: 150px; margin: 0; border-radius: $radius-sm; color: var(--cp-text); background: transparent !important; &:hover { background: var(--cp-bg-hover) !important; color: var(--cp-text); } &:global(.is-current) { color: var(--cp-primary); background: var(--cp-primary-lighter) !important; } }
.collapse-btn { font-size: $font-lg; flex-shrink: 0; }.global-breadcrumb { min-width: 0; overflow: hidden; }.global-actions { display: flex; align-items: center; gap: $spacing-sm; margin-left: auto; flex-shrink: 0; }.global-toolbar { display: flex; align-items: center; gap: 2px; :deep(.el-button) { width: 28px; height: 28px; padding: 0; margin: 0; } :deep(.el-button + .el-button) { margin-left: 0; } :deep(.notification-trigger) { width: 28px; height: 28px; } }
@include media-max($breakpoint-md) { .global-header { padding: 0 $spacing-md; }.brand-title-shimmer, .global-breadcrumb { display: none; }.global-actions { gap: $spacing-xs; } }
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
