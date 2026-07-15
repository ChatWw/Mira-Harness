import type { Directive } from 'vue'
import { usePermissionStore } from '@/stores/permission'

export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const permissionStore = usePermissionStore()
    const required = binding.value

    const has = Array.isArray(required)
      ? required.some(p => permissionStore.hasPermission(p))
      : permissionStore.hasPermission(required)

    if (!has) {
      el.parentNode?.removeChild(el)
    }
  }
}
