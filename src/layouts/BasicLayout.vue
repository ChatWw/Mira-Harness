<template>
  <div class="layout">
    <aside class="sidebar" :class="{ collapsed: appStore.sidebarCollapsed }">
      <div class="sidebar-header">
        <div class="brand">
          <div class="brand-icon">
            <Sparkles :size="20" />
          </div>
          <transition name="fade">
            <span v-show="!appStore.sidebarCollapsed" class="brand-text">{{ appStore.appName }}</span>
          </transition>
        </div>
      </div>

      <el-menu
        :default-active="currentRoute"
        :collapse="appStore.sidebarCollapsed"
        :collapse-transition="false"
        router
        class="sidebar-menu"
      >
        <template v-for="item in menuList" :key="item.id">
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

    <div class="main-container">
      <header class="header">
        <div class="header-left">
          <el-button
            text
            :icon="appStore.sidebarCollapsed ? Expand : Fold"
            @click="appStore.toggleSidebar()"
            class="collapse-btn"
          />
        </div>

        <div class="header-right">
          <el-tooltip content="切换主题模式">
            <el-button
              text
              :icon="themeStore.themeMode === 'dark' ? Sunny : Moon"
              @click="themeStore.toggleThemeMode()"
            />
          </el-tooltip>

          <el-dropdown trigger="click">
            <el-button text :icon="Brush">
              <span style="margin-left: 4px;">主题色</span>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="color in themeStore.presetColors"
                  :key="color.value"
                  @click="themeStore.setPrimaryColor(color.value)"
                >
                  <div class="color-item">
                    <div
                      class="color-dot"
                      :style="{ background: color.value }"
                    />
                    <span>{{ color.name }}</span>
                    <el-icon v-if="themeStore.primaryColor === color.value" class="check-icon">
                      <Check />
                    </el-icon>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-dropdown trigger="click">
            <div class="user-info">
              <el-avatar :size="32" :src="userStore.userInfo?.avatar">
                {{ userStore.userInfo?.name?.[0] }}
              </el-avatar>
              <span class="user-name">{{ userStore.userInfo?.name }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>
                  <el-icon><User /></el-icon>
                  <span>个人中心</span>
                </el-dropdown-item>
                <el-dropdown-item>
                  <el-icon><Setting /></el-icon>
                  <span>设置</span>
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>
                  <span>退出登录</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Sparkles } from 'lucide-vue-next'
import {
  Fold,
  Expand,
  Moon,
  Sunny,
  Brush,
  Check,
  User,
  Setting,
  SwitchButton,
} from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'
import { MENU_LIST } from '@/config/menu'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const userStore = useUserStore()
const themeStore = useThemeStore()

const menuList = MENU_LIST
const currentRoute = computed(() => route.path)

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    userStore.logout()
    router.push('/login')
  } catch {
    // User cancelled
  }
}
</script>

<style scoped lang="scss">
// ==================== 布局容器 ====================
.layout {
  display: flex;
  min-height: 100vh;
  background: $bg;
}

// ==================== 侧边栏 ====================
.sidebar {
  width: $sidebar-width;
  background: $sidebar-bg;
  border-right: 1px solid $border;
  transition: width $transition-base;
  flex-shrink: 0;

  &.collapsed {
    width: $sidebar-collapsed-width;
  }

  &-header {
    height: $header-height;
    @include flex-align-center;
    padding: 0 $spacing-md;
    border-bottom: 1px solid $border;
  }

  &-menu {
    border: none;
    background: $sidebar-bg;

    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      color: $sidebar-text;
    }

    :deep(.el-menu-item:hover),
    :deep(.el-sub-menu__title:hover) {
      color: $primary;
      background: $bg-elevated;
    }

    :deep(.el-menu-item.is-active) {
      color: $primary;
      background: $sidebar-active-bg;
    }
  }
}

// ==================== 品牌标识 ====================
.brand {
  @include flex-align-center;
  gap: 12px;

  &-icon {
    width: 36px;
    height: 36px;
    border-radius: $radius-md;
    background: $primary;
    color: white;
    @include flex-center;
    flex-shrink: 0;
  }

  &-text {
    font-size: $font-lg;
    font-weight: $font-semibold;
    color: $text;
    white-space: nowrap;
  }
}

// ==================== 主容器 ====================
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

// ==================== 头部 ====================
.header {
  height: $header-height;
  background: $header-bg;
  border-bottom: 1px solid $header-border;
  @include flex-between;
  padding: 0 20px;
  flex-shrink: 0;

  &-left {
    @include flex-align-center;
    gap: $spacing-md;
  }

  &-right {
    @include flex-align-center;
    gap: 12px;
  }
}

.collapse-btn {
  font-size: 20px;
}

// ==================== 主题色选择器 ====================
.color-item {
  @include flex-align-center;
  gap: $spacing-sm;
  min-width: 120px;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: $radius-full;
  flex-shrink: 0;
}

.check-icon {
  margin-left: auto;
  color: $primary;
}

// ==================== 用户信息 ====================
.user-info {
  @include flex-align-center;
  gap: $spacing-sm;
  cursor: pointer;
  padding: 4px $spacing-sm;
  border-radius: 6px;
  transition: background $transition-base;

  &:hover {
    background: $bg-elevated;
  }
}

.user-name {
  font-size: $font-sm;
  color: $text;
  max-width: 100px;
  @include text-ellipsis;
}

// ==================== 内容区域 ====================
.content {
  flex: 1;
  overflow: auto;
  background: $bg;
}

// ==================== 过渡动画 ====================
.fade-enter-active,
.fade-leave-active {
  transition: opacity $transition-fast;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// ==================== 响应式设计 ====================
@include media-max($breakpoint-md) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: $z-sticky;

    &.collapsed {
      transform: translateX(-100%);
    }
  }

  .user-name {
    display: none;
  }
}
</style>
