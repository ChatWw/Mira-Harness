<template>
  <header class="app-header" :style="{ height: `${layoutStore.config.headerHeight}px` }">
    <div class="header-left">
      <el-button
        v-if="layoutStore.config.mode !== 'header-only'"
        text
        :icon="appStore.sidebarCollapsed ? Expand : Fold"
        @click="appStore.toggleSidebar()"
        class="collapse-btn"
      />

      <Breadcrumb v-if="layoutStore.config.showBreadcrumb" class="breadcrumb" />
    </div>

    <div class="header-right">
      <el-tooltip content="全局搜索 (Ctrl+K)">
        <el-button text :icon="Search" @click="handleSearch" />
      </el-tooltip>

      <Notification />

      <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'">
        <el-button text :icon="isFullscreen ? Crop : FullScreen" @click="toggleFullscreen" />
      </el-tooltip>

      <el-tooltip content="切换主题模式">
        <el-button
          text
          :icon="themeStore.themeMode === 'dark' ? Sunny : Moon"
          @click="handleThemeToggle"
        />
      </el-tooltip>

      <el-tooltip content="全局配置">
        <el-button text :icon="Setting" @click="layoutStore.openSettings()" />
      </el-tooltip>

      <el-dropdown trigger="click" @command="handleCommand">
        <div class="user-info">
          <el-avatar :size="32" :src="userStore.userInfo?.avatar">
            {{ userStore.userInfo?.name?.charAt(0) }}
          </el-avatar>
          <span class="user-name">{{ userStore.userInfo?.name }}</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-dropdown-header">
              <el-avatar :size="48" :src="userStore.userInfo?.avatar">
                {{ userStore.userInfo?.name?.charAt(0) }}
              </el-avatar>
              <div class="user-dropdown-info">
                <div class="user-dropdown-name">{{ userStore.userInfo?.name }}</div>
                <div class="user-dropdown-role">{{ userStore.userInfo?.roles?.[0] || '用户' }}</div>
              </div>
            </div>

            <el-dropdown-item command="profile">
              <el-icon><User /></el-icon>
              个人中心
            </el-dropdown-item>
            <el-dropdown-item command="settings">
              <el-icon><Setting /></el-icon>
              系统设置
            </el-dropdown-item>
            <el-dropdown-item command="messages">
              <el-icon><Bell /></el-icon>
              消息通知
              <el-badge v-if="unreadCount > 0" :value="unreadCount" class="message-badge" />
            </el-dropdown-item>
            <el-dropdown-item command="theme">
              <el-icon><Sunny /></el-icon>
              主题设置
            </el-dropdown-item>
            <el-dropdown-item command="layout">
              <el-icon><Grid /></el-icon>
              布局配置
            </el-dropdown-item>

            <el-dropdown-item divided command="logout" class="logout-item">
              <el-icon><SwitchButton /></el-icon>
              退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <SearchBar ref="searchBarRef" />
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  Expand,
  Fold,
  Moon,
  Sunny,
  Setting,
  User,
  SwitchButton,
  Search,
  FullScreen,
  Crop,
  Bell,
  Grid,
} from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'
import { useLayoutStore } from '@/stores/layout'
import Breadcrumb from '@/components/Breadcrumb/index.vue'
import Notification from '@/components/Notification/index.vue'
import SearchBar from '@/components/SearchBar/index.vue'

const router = useRouter()
const appStore = useAppStore()
const themeStore = useThemeStore()
const userStore = useUserStore()
const layoutStore = useLayoutStore()

const searchBarRef = ref()
const isFullscreen = ref(false)
const unreadCount = ref(0) // TODO: 从 API 获取

function handleThemeToggle(event: MouseEvent) {
  themeStore.toggleThemeModeWithTransition(event)
}

function handleSearch() {
  searchBarRef.value?.open()
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

async function handleCommand(command: string) {
  switch (command) {
    case 'profile':
      router.push('/profile/info')
      break
    case 'settings':
      router.push('/system/settings')
      break
    case 'messages':
      router.push('/message/list')
      break
    case 'theme':
    case 'layout':
      layoutStore.openSettings()
      break
    case 'logout':
      try {
        await ElMessageBox.confirm('确认退出当前账号登录吗？', '退出登录', {
          confirmButtonText: '确认',
          cancelButtonText: '取消',
          type: 'warning',
        })
        userStore.logout()
        router.push('/login')
      } catch {
        // 用户取消
      }
      break
  }
}
</script>

<style scoped lang="scss">
.app-header {
  background: var(--cp-bg);
  border-bottom: 1px solid var(--cp-border);
  padding: 0 $spacing-lg;
  @include flex-between;
  gap: $spacing-md;

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
    @include flex-center;
    gap: $spacing-xs;

    .user-info {
      @include flex-center;
      gap: $spacing-sm;
      padding: $spacing-xs $spacing-sm;
      border-radius: $radius-md;
      cursor: pointer;
      transition: background $transition-base;

      &:hover {
        background: var(--cp-bg-hover);
      }

      .user-name {
        color: var(--cp-text);
        font-size: $font-sm;

        @include media-max($breakpoint-md) {
          display: none;
        }
      }
    }
  }

  @include media-max($breakpoint-md) {
    padding: 0 $spacing-md;
  }
}

.user-dropdown-header {
  @include flex-center;
  justify-content: flex-start;
  padding: $spacing-md;
  gap: $spacing-md;
  border-bottom: 1px solid var(--cp-border-light);
}

.user-dropdown-info {
  flex: 1;
}

.user-dropdown-name {
  font-size: $font-base;
  font-weight: 600;
  color: var(--cp-text);
}

.user-dropdown-role {
  font-size: $font-xs;
  color: var(--cp-text-secondary);
  margin-top: 2px;
}

.message-badge {
  margin-left: $spacing-xs;
}

.logout-item {
  color: var(--cp-danger);
}
</style>
