<template>
  <header class="global-header" :style="{ height: `${layoutStore.config.headerHeight}px` }">
    <div class="global-brand" :class="{ 'is-hidden': !layoutStore.config.showLogo }">
      <div class="brand-mark"><Sparkles :size="19" /></div>
      <span>{{ layoutStore.config.dynamicTitle }}</span>
    </div>

    <div class="global-actions">
      <div class="application-switcher">
        <span class="switcher-label">当前应用</span>
        <el-select v-model="currentAppCode" class="application-select" :loading="loadingApps" @change="handleAppChange">
          <el-option v-for="app in permissionStore.applications" :key="app.code" :label="app.name" :value="app.code">
            <div class="application-option"><el-icon v-if="app.icon"><component :is="app.icon" /></el-icon><span>{{ app.name }}</span><el-tag v-if="app.type === 'main'" size="small" type="info">主应用</el-tag></div>
          </el-option>
        </el-select>
      </div>
      <el-dropdown trigger="click" @command="handleUserCommand">
        <div class="user-avatar"><el-avatar :size="30" :src="userStore.userInfo?.avatar">{{ userStore.userInfo?.name?.charAt(0) }}</el-avatar><span>{{ userStore.userInfo?.name }}</span></div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item>
            <el-dropdown-item command="layout"><el-icon><Grid /></el-icon>布局配置</el-dropdown-item>
            <el-dropdown-item divided command="logout" class="logout-item"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Grid, SwitchButton, User } from '@element-plus/icons-vue'
import { Sparkles } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { applicationApi, menuApi } from '@/api/system'
import { useLayoutStore } from '@/stores/layout'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'

const router = useRouter()
const layoutStore = useLayoutStore()
const userStore = useUserStore()
const permissionStore = usePermissionStore()
const loadingApps = ref(false)
const currentAppCode = computed({ get: () => permissionStore.currentAppCode, set: code => permissionStore.setCurrentAppCode(code) })

async function loadApplications() {
  loadingApps.value = true
  try {
    const apps = await applicationApi.getMyApps()
    permissionStore.setApplications(apps)
    if (!apps.some(app => app.code === currentAppCode.value)) currentAppCode.value = 'main'
  } finally {
    loadingApps.value = false
  }
}

async function handleAppChange(code: string) {
  try {
    const menus = await menuApi.getMyMenus({ app_code: code })
    permissionStore.setMenuRoutes(menus)
    await router.push(code === 'main' ? '/dashboard' : `/micro/${code}`)
  } catch (error: any) {
    ElMessage.error(error.message || '切换应用失败')
  }
}

async function handleUserCommand(command: string) {
  if (command === 'profile') router.push('/profile/info')
  else if (command === 'layout') layoutStore.openSettings()
  else if (command === 'logout') {
    try { await ElMessageBox.confirm('确认退出当前账号登录吗？', '退出登录', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }); userStore.logout(); router.push('/login') } catch { /* 用户取消 */ }
  }
}

onMounted(loadApplications)
</script>

<style scoped lang="scss">
.global-header { width: 100%; min-height: 52px; display: flex; align-items: center; padding: 0 24px; background: var(--cp-bg); border-bottom: 1px solid var(--cp-border); flex-shrink: 0; z-index: $z-sticky; }
.global-brand { min-width: 220px; display: flex; align-items: center; gap: 9px; font-size: 16px; font-weight: 650; color: var(--cp-text); white-space: nowrap; &.is-hidden { min-width: 0; width: 0; overflow: hidden; } }
.brand-mark { width: 31px; height: 31px; display: grid; place-items: center; color: #fff; border-radius: 9px; background: linear-gradient(135deg, var(--cp-primary), color-mix(in srgb, var(--cp-primary) 55%, #635bff)); box-shadow: 0 5px 12px color-mix(in srgb, var(--cp-primary) 25%, transparent); }
.application-switcher { display: flex; align-items: center; gap: $spacing-sm; }.switcher-label { color: var(--cp-text-secondary); font-size: $font-sm; }.application-select { width: 190px; }.application-option { display: flex; align-items: center; gap: $spacing-sm; }.application-option .el-tag { margin-left: auto; }
.global-actions { display: flex; align-items: center; gap: $spacing-md; margin-left: auto; flex-shrink: 0; }.user-avatar { display: flex; align-items: center; gap: 8px; padding: 3px 7px 3px 3px; color: var(--cp-text); font-size: 13px; border-radius: 8px; cursor: pointer; &:hover { background: var(--cp-bg-hover); } }.logout-item { color: var(--cp-danger); }
@include media-max($breakpoint-md) { .global-header { padding: 0 $spacing-md; }.global-brand { min-width: auto; }.global-brand > span, .switcher-label, .user-avatar > span { display: none; }.application-select { width: 140px; } }
</style>
