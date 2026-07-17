<template>
  <header class="global-header" :style="{ height: `${layoutStore.config.headerHeight}px` }">
    <div class="global-brand" :class="{ 'is-hidden': !layoutStore.config.showLogo }">
      <div class="brand-mark"><Sparkles :size="19" /></div>
      <span>{{ layoutStore.config.dynamicTitle }}</span>
    </div>

    <nav v-if="showNavigation" class="global-nav" aria-label="主导航">
      <template v-for="item in menuList" :key="item.id">
        <el-button v-if="item.path" text class="nav-item" :class="{ active: isActive(item) }" @click="router.push(item.path)">
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>{{ item.title }}
        </el-button>
        <el-dropdown v-else trigger="click" @command="handleMenuCommand">
          <button class="nav-item dropdown-trigger" :class="{ active: isActive(item) }">
            <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>{{ item.title }}<el-icon class="nav-arrow"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="child in item.children" :key="child.id" :command="child.path">
                <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>{{ child.title }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </nav>

    <div class="global-actions">
      <el-tooltip content="全局搜索 (Ctrl+K)"><el-button text :icon="Search" @click="handleSearch" /></el-tooltip>
      <Notification />
      <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'"><el-button text :icon="isFullscreen ? Crop : FullScreen" @click="toggleFullscreen" /></el-tooltip>
      <el-tooltip content="切换主题模式"><el-button text :icon="themeStore.themeMode === 'dark' ? Sunny : Moon" @click="handleThemeToggle" /></el-tooltip>
      <el-tooltip content="全局配置"><el-button text :icon="Setting" @click="layoutStore.openSettings()" /></el-tooltip>
      <el-dropdown trigger="click" @command="handleUserCommand">
        <div class="user-avatar"><el-avatar :size="30" :src="userStore.userInfo?.avatar">{{ userStore.userInfo?.name?.charAt(0) }}</el-avatar><span>{{ userStore.userInfo?.name }}</span></div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item>
            <el-dropdown-item command="settings"><el-icon><Setting /></el-icon>系统设置</el-dropdown-item>
            <el-dropdown-item command="layout"><el-icon><Grid /></el-icon>布局配置</el-dropdown-item>
            <el-dropdown-item divided command="logout" class="logout-item"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <SearchBar ref="searchBarRef" />
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Crop, FullScreen, Grid, Moon, Search, Setting, Sunny, SwitchButton, User } from '@element-plus/icons-vue'
import { Sparkles } from 'lucide-vue-next'
import type { MenuItem } from '@/types'
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import Notification from '@/components/Notification/index.vue'
import SearchBar from '@/components/SearchBar/index.vue'

defineProps<{ showNavigation?: boolean }>()
const router = useRouter()
const route = useRoute()
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const userStore = useUserStore()
const permissionStore = usePermissionStore()
const menuList = computed(() => permissionStore.menuRoutes)
const searchBarRef = ref()
const isFullscreen = ref(false)

const isActive = computed(() => (item: MenuItem) => item.path === route.path || item.children?.some(child => child.path === route.path))
function handleMenuCommand(path?: string) { if (path) router.push(path) }
function handleSearch() { searchBarRef.value?.open() }
function handleThemeToggle(event: MouseEvent) { themeStore.toggleThemeModeWithTransition(event) }
function toggleFullscreen() { if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); isFullscreen.value = true } else { document.exitFullscreen(); isFullscreen.value = false } }
async function handleUserCommand(command: string) {
  if (command === 'profile') router.push('/profile/info')
  else if (command === 'settings') router.push('/system/settings')
  else if (command === 'layout') layoutStore.openSettings()
  else if (command === 'logout') {
    try { await ElMessageBox.confirm('确认退出当前账号登录吗？', '退出登录', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }); userStore.logout(); router.push('/login') } catch { /* 用户取消 */ }
  }
}
</script>

<style scoped lang="scss">
.global-header { width: 100%; min-height: 52px; display: flex; align-items: center; gap: 24px; padding: 0 24px; background: var(--cp-bg); border-bottom: 1px solid var(--cp-border); flex-shrink: 0; z-index: $z-sticky; }
.global-brand { min-width: 192px; display: flex; align-items: center; gap: 9px; font-size: 16px; font-weight: 650; color: var(--cp-text); white-space: nowrap; &.is-hidden { min-width: 0; width: 0; overflow: hidden; } }
.brand-mark { width: 31px; height: 31px; display: grid; place-items: center; color: #fff; border-radius: 9px; background: linear-gradient(135deg, var(--cp-primary), color-mix(in srgb, var(--cp-primary) 55%, #635bff)); box-shadow: 0 5px 12px color-mix(in srgb, var(--cp-primary) 25%, transparent); }
.global-nav { height: 100%; display: flex; align-items: center; gap: 3px; flex: 1; overflow: hidden; }
.nav-item { height: 34px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; color: var(--cp-text-secondary); font-size: 13px; font-weight: 500; border: 0; border-radius: 7px; background: transparent; cursor: pointer; white-space: nowrap; transition: all $transition-fast; &:hover { color: var(--cp-text); background: var(--cp-bg-hover); } &.active { color: var(--cp-primary); background: var(--cp-primary-lighter); } }
.dropdown-trigger .nav-arrow { margin-left: -2px; font-size: 12px; }
.global-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; .el-button { color: var(--cp-text-secondary); &:hover { color: var(--cp-primary); } } }
.user-avatar { display: flex; align-items: center; gap: 8px; margin-left: 6px; padding: 3px 7px 3px 3px; color: var(--cp-text); font-size: 13px; border-radius: 8px; cursor: pointer; &:hover { background: var(--cp-bg-hover); } }
.logout-item { color: var(--cp-danger); }
@include media-max($breakpoint-lg) { .global-brand { min-width: auto; } .global-brand > span, .nav-item:not(.active), .user-avatar > span { display: none; } .global-nav { justify-content: center; } }
</style>
