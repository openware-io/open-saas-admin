import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMenuStore } from '@/stores/menu'
import { useContextStore } from '@/stores/context'

export const IM_ADMIN_BASE_URL = import.meta.env.VITE_IM_ADMIN_BASE_URL || 'https://admin.dev.example.com'

// 统一登录后按后台 code 路由：
//  - platform -> 平台运营后台（PLATFORM 作用域，内部路由）
//  - tenant   -> 租户后台（TENANT 作用域，内部路由）
//  - im       -> IM 后台（外部链接，新窗口打开）
export function useBackend() {
  const router = useRouter()
  const authStore = useAuthStore()
  const menuStore = useMenuStore()

  async function activateScope(scope) {
    authStore.setScope(scope)
    if (scope === 'TENANT') await useContextStore().ensureContext(scope)
    await menuStore.fetchMenus(scope)
    const target = menuStore.firstLeafPath() || (scope === 'TENANT' ? '/admin/tenant/stores' : '/select')
    await router.push(target)
  }

  function openImAdmin() {
    window.open(IM_ADMIN_BASE_URL, '_blank', 'noopener')
  }

  async function enterBackend(code) {
    if (code === 'platform') {
      await activateScope('PLATFORM')
    } else if (code === 'tenant') {
      await activateScope('TENANT')
    } else if (code === 'im') {
      openImAdmin()
    } else {
      await router.push('/select')
    }
  }

  // 登录后按可用后台数量分流：单个后台直接进入，多个后台进入选择页
  async function routeAfterLogin(backends) {
    if (!backends || backends.length === 0) {
      await router.replace('/select')
      return
    }
    if (backends.length === 1) {
      const code = backends[0].code
      if (code === 'im') {
        openImAdmin()
        await router.replace('/select') // 外链后台无内部页面，保底落地入口页
      } else {
        await enterBackend(code)
      }
      return
    }
    await router.replace('/select')
  }

  function goToSelect() {
    router.push('/select')
  }

  return { activateScope, enterBackend, routeAfterLogin, goToSelect, openImAdmin, IM_ADMIN_BASE_URL }
}
