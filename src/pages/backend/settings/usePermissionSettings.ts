import { onMounted, reactive, ref } from 'vue'
import { DEFAULT_PERMISSION_CONFIG, type PermissionConfig } from '@/config/harness'
import { getPlatformApi } from '@/platform'

// 权限页和数据页共同使用宿主配置，保存前读取最新值，避免覆盖另一页的设置。
export function usePermissionSettings() {
  const config = reactive<PermissionConfig>({ ...DEFAULT_PERMISSION_CONFIG })
  const loaded = ref(false), saving = ref(false), error = ref('')
  function api() {
    const value = getPlatformApi()
    if (!value) throw new Error('设置仅在桌面端中可用')
    return value
  }
  async function load() {
    loaded.value = false
    error.value = ''
    try {
      Object.assign(config, await api().getHarnessPermissionConfig())
      loaded.value = true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '设置读取失败，请重试'
    }
  }
  async function save(patch: Partial<PermissionConfig>) {
    if (!loaded.value || saving.value) return
    saving.value = true
    error.value = ''
    try {
      const host = api()
      const current = await host.getHarnessPermissionConfig()
      Object.assign(config, await host.saveHarnessPermissionConfig({ ...current, ...patch }))
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '设置保存失败，请重试'
    } finally {
      saving.value = false
    }
  }
  onMounted(load)
  return { config, loaded, saving, error, load, save }
}
