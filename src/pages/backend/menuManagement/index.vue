<template>
  <SettingsPageShell title="内置浏览器菜单" wide>
    <p class="page-description">管理侧边栏“内置浏览器”分组下的外部页面链接。</p>
    <el-alert
      v-if="!desktopAvailable"
      type="warning"
      :closable="false"
      show-icon
      title="浏览器中不支持编辑菜单，请在桌面端进行修改。"
      class="platform-alert"
    />
    <MenuTreeEditor
      :menus="iframeMenus"
      title="内置浏览器"
      iframe-only
      :disabled="saving || !desktopAvailable"
      @change="saveMenus"
    />
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { runtimeNavigation } from '@/config/runtime'
import { validateMenus } from '@/config/platformValidation'
import { getPlatformApi } from '@/platform'
import type { MenuItem } from '@/types'
import MenuTreeEditor from './components/MenuTreeEditor.vue'
import { filterIframeMenus } from './menuUtils'
import { applyManagementSnapshot, cloneValue, requirePlatformApi } from '../platformManagement'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const saving = ref(false)
const desktopAvailable = Boolean(getPlatformApi())
const iframeMenus = computed(() => filterIframeMenus(runtimeNavigation.mainMenus))

async function saveMenus(menus: MenuItem[]) {
  saving.value = true
  try {
    validateMenus(menus)
    const components = runtimeNavigation.mainMenus.filter(menu => menu.target?.type === 'component')
    applyManagementSnapshot(await requirePlatformApi().updateMenus(cloneValue([...components, ...menus])))
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
