<template>
  <header class="app-header">
    <div class="header-left">
      <el-button
        v-if="layoutStore.config.mode !== 'header-only'"
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
            <el-dropdown-item command="profile">
              <el-icon><User /></el-icon>
              个人资料
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>
              退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";
import {
  Expand,
  Fold,
  Moon,
  Sunny,
  Setting,
  User,
  SwitchButton,
} from "@element-plus/icons-vue";
import { useAppStore } from "@/stores/app";
import { useThemeStore } from "@/stores/theme";
import { useUserStore } from "@/stores/user";
import { useLayoutStore } from "@/stores/layout";

const router = useRouter();
const appStore = useAppStore();
const themeStore = useThemeStore();
const userStore = useUserStore();
const layoutStore = useLayoutStore();

function handleThemeToggle(event: MouseEvent) {
  themeStore.toggleThemeModeWithTransition(event);
}

async function handleCommand(command: string) {
  if (command === "logout") {
    try {
      await ElMessageBox.confirm("确认退出当前账号登录吗？", "退出登录", {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: "warning",
      });

      userStore.logout();
      router.push("/login");
    } catch {
      // 用户取消退出，不执行后续操作
    }
  } else if (command === "profile") {
    // 跳转到个人资料页面（待实现）
    console.log("跳转到个人资料");
  }
}
</script>

<style scoped lang="scss">
.app-header {
  height: 64px;
  background: var(--cp-bg);
  border-bottom: 1px solid var(--cp-border);
  padding: 0 $spacing-lg;
  @include flex-between;
  gap: $spacing-md;

  .header-left {
    @include flex-align-center;

    .collapse-btn {
      font-size: $font-xl;
    }
  }

  .header-right {
    @include flex-align-center;
    gap: $spacing-sm;

    .user-info {
      @include flex-align-center;
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
</style>
