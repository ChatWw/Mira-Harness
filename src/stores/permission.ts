import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePermissionStore = defineStore('permission', () => {
  const permissions = ref<string[]>([])
  const menuRoutes = ref<any[]>([])
  const routeDefinitions = ref<any[]>([])
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

  function setRouteDefinitions(routes: any[]) {
    routeDefinitions.value = routes
  }

  function setRoutesAdded(val: boolean) {
    isRoutesAdded.value = val
  }

  function reset() {
    permissions.value = []
    menuRoutes.value = []
    routeDefinitions.value = []
    isRoutesAdded.value = false
  }

  return {
    permissions,
    menuRoutes,
    routeDefinitions,
    isRoutesAdded,
    hasPermission,
    setPermissions,
    setMenuRoutes,
    setRouteDefinitions,
    setRoutesAdded,
    reset
  }
}, {
  persist: {
    key: 'cp-permission',
    storage: localStorage,
  }
})
