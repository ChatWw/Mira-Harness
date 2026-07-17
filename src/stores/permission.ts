import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApplicationOption } from '@/types'

export const usePermissionStore = defineStore('permission', () => {
  const permissions = ref<string[]>([])
  const menuRoutes = ref<any[]>([])
  const applications = ref<ApplicationOption[]>([])
  const currentAppCode = ref('main')
  const isRoutesAdded = ref(false)

  function hasPermission(code: string): boolean {
    if (permissions.value.includes('*')) return true
    return permissions.value.includes(code)
  }

  function setPermissions(codes: string[]) {
    permissions.value = codes
  }

  function setMenuRoutes(menus: any[]) {
    menuRoutes.value = menus
  }

  function setApplications(items: ApplicationOption[]) {
    applications.value = items
  }

  function setCurrentAppCode(code: string) {
    currentAppCode.value = code
  }


  function setRoutesAdded(val: boolean) {
    isRoutesAdded.value = val
  }

  function reset() {
    permissions.value = []
    menuRoutes.value = []
    applications.value = []
    currentAppCode.value = 'main'
    isRoutesAdded.value = false
  }

  return {
    permissions,
    menuRoutes,
    applications,
    currentAppCode,
    isRoutesAdded,
    hasPermission,
    setPermissions,
    setMenuRoutes,
    setApplications,
    setCurrentAppCode,
    setRoutesAdded,
    reset
  }
}, {
  persist: {
    key: 'cp-permission',
    storage: localStorage,
  }
})
