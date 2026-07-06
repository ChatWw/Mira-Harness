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

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: var(--cp-bg);
}

.sidebar {
  width: 240px;
  background: var(--cp-sidebar-bg);
  border-right: 1px solid var(--cp-border);
  transition: width 0.3s;
  flex-shrink: 0;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--cp-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--cp-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--cp-text);
  white-space: nowrap;
}

.sidebar-menu {
  border: none;
  background: var(--cp-sidebar-bg);
}

.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  color: var(--cp-sidebar-text);
}

.sidebar-menu :deep(.el-menu-item:hover),
.sidebar-menu :deep(.el-sub-menu__title:hover) {
  color: var(--cp-primary);
  background: var(--cp-bg-elevated);
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  color: var(--cp-primary);
  background: var(--cp-sidebar-active-bg);
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header {
  height: 60px;
  background: var(--cp-header-bg);
  border-bottom: 1px solid var(--cp-header-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collapse-btn {
  font-size: 20px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.check-icon {
  margin-left: auto;
  color: var(--cp-primary);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.user-info:hover {
  background: var(--cp-bg-elevated);
}

.user-name {
  font-size: 14px;
  color: var(--cp-text);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content {
  flex: 1;
  overflow: auto;
  background: var(--cp-bg);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 1000;
  }

  .sidebar.collapsed {
    transform: translateX(-100%);
  }

  .user-name {
    display: none;
  }
}
</style>
