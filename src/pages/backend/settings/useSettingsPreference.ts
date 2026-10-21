import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { platformPreferences } from '@/config/runtime'
import { getPlatformApi } from '@/platform'

export function useSettingsPreference() {
  const saving = ref('')
  async function save(key: string, value: unknown) {
    if (saving.value) return false
    saving.value = key
    try {
      const api = getPlatformApi()
      if (!api) throw new Error('设置仅在桌面端中可用')
      await api.savePreference(key, value)
      platformPreferences[key] = value
      return true
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '设置保存失败，请重试')
      return false
    } finally {
      saving.value = ''
    }
  }
  return { saving, save }
}
