<template>
  <PageContainer title="菜单配置" description="以树形结构管理平台导航。目录负责分组，页面菜单负责打开具体内容。" max-width="1600">
    <el-alert
      v-if="!desktopAvailable"
      type="warning"
      :closable="false"
      show-icon
      title="当前为浏览器模式，菜单只读；请在 Electron 桌面版中进行修改。"
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
  </PageContainer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageContainer from '@/components/PageContainer/index.vue'
import { BUILT_IN_PAGE_OPTIONS, PROTECTED_MAIN_MENU_IDS } from '@/config/menus'
import { runtimeNavigation } from '@/config/runtime'
import { validateMenus } from '@/config/platformValidation'
import { getPlatformApi } from '@/platform'
import type { MenuItem } from '@/types'
import MenuTreeEditor from './components/MenuTreeEditor.vue'
import { applyManagementSnapshot, requirePlatformApi } from '../platformManagement'

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
.platform-alert { margin-bottom: $spacing-md; }
</style>
