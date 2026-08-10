<template>
  <SettingsPageShell title="菜单管理" wide>
    <p class="page-description">以树形结构管理平台导航。目录负责分组，页面菜单负责打开具体内容。</p>
    <el-alert
      v-if="!desktopAvailable"
      type="warning"
      :closable="false"
      show-icon
      title="浏览器中不支持编辑菜单，请在桌面端进行修改。"
      class="platform-alert"
    />
    <MenuTreeEditor
      :menus="runtimeNavigation.mainMenus"
      title="平台主菜单"
      :component-options="BUILT_IN_PAGE_OPTIONS"
      :protected-ids="PROTECTED_MAIN_MENU_IDS"
      :disabled="saving || !desktopAvailable"
      @change="saveMenus"
    />
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { BUILT_IN_PAGE_OPTIONS, PROTECTED_MAIN_MENU_IDS } from '@/config/menus'
import { runtimeNavigation } from '@/config/runtime'
import { validateMenus } from '@/config/platformValidation'
import { getPlatformApi } from '@/platform'
import type { MenuItem } from '@/types'
import MenuTreeEditor from './components/MenuTreeEditor.vue'
import { applyManagementSnapshot, requirePlatformApi } from '../platformManagement'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const saving = ref(false)
const desktopAvailable = Boolean(getPlatformApi())

async function saveMenus(menus: MenuItem[]) {
  saving.value = true
  try {
    validateMenus(menus)
    applyManagementSnapshot(await requirePlatformApi().updateMenus(menus))
    ElMessage.success('菜单配置已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '菜单配置保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.page-description { margin: 0 0 $spacing-xl; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.platform-alert { margin-bottom: $spacing-md; }
</style>
