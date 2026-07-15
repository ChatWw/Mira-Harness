import { usePermissionStore } from '@/stores/permission'

export function usePermission() {
  const permissionStore = usePermissionStore()

  function hasPermission(code: string | string[]): boolean {
    if (Array.isArray(code)) {
      return code.some(c => permissionStore.hasPermission(c))
    }
    return permissionStore.hasPermission(code)
  }

  function hasAllPermissions(codes: string[]): boolean {
    return codes.every(c => permissionStore.hasPermission(c))
  }

  return { hasPermission, hasAllPermissions }
}
