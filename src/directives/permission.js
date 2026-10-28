import { useAuthStore } from '@/stores/auth'
import { useContextStore } from '@/stores/context'

/** 动作级权限判断：上下文权限优先；平台超管没有租户上下文时按平台角色放行。 */
export function can(permissionCode) {
  if (!permissionCode) return true
  const auth = useAuthStore()
  if (auth.user?.role === 'SUPER_ADMIN' && !useContextStore().current) return true
  const permissions = useContextStore().current?.permissions || []
  return permissions.includes(permissionCode)
}

export const permissionDirective = {
  mounted(el, binding) {
    if (!can(binding.value)) el.parentNode?.removeChild(el)
  },
}
