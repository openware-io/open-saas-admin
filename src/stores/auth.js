import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSession, logout as logoutSession } from '@/api/admin'
import { parseStoredJson } from '@/utils/storage'
import { resetCurrencyRuntime } from '@/utils/currency-runtime'

export const SCOPE_LABELS = {
  PLATFORM: '平台运营后台',
  TENANT: '租户后台',
}

export const useAuthStore = defineStore('auth', () => {
  const scope = ref(localStorage.getItem('saas_admin_scope') || 'PLATFORM')
  const user = ref(readStoredUser())
  const authenticated = ref(false)
  let initialization = null
  // 本 SPA 会话内是否已确认过登录态。
  // 导航守卫每次导航都会问一次 initialize()，不能每次都打 /admin/auth/session —— 那等于把
  // 鉴权挂在每次点击的链路上。确认过一次就复用，失效路径由 clearLocalState()（退出登录 /
  // 改密 / 会话失效）与后台上下文校准的 session-expired 显式复位。
  let verified = false

  function readStoredUser() {
    return parseStoredJson(localStorage.getItem('saas_admin_user'))
  }

  // 登录态由 HttpOnly Cookie（Redis 服务端会话）承载；localStorage 只存展示用的 user/scope。
  function setAuth(userVal, scopeVal) {
    user.value = userVal
    scope.value = scopeVal
    authenticated.value = true
    verified = true
    localStorage.setItem('saas_admin_user', JSON.stringify(userVal))
    localStorage.setItem('saas_admin_scope', scopeVal)
  }

  function setScope(scopeVal) {
    scope.value = scopeVal
    localStorage.setItem('saas_admin_scope', scopeVal)
  }

  function clearLocalState() {
    user.value = null
    scope.value = 'PLATFORM'
    authenticated.value = false
    verified = false
    initialization = null
    localStorage.removeItem('saas_admin_user')
    localStorage.removeItem('saas_admin_scope')
    // 币种是租户级的：退出/会话失效后回到缺省 USD，不把上一个租户的币种带到下一个账号。
    resetCurrencyRuntime()
  }

  /** 让下一次 initialize() 重新问服务端（会话被判失效、或后台校准发现会话已没了时调用）。 */
  function invalidateSession() {
    verified = false
    initialization = null
  }

  /**
   * 确认登录态。同一 SPA 会话内只问服务端一次（`force` 可强制重问）。
   * 返回 false 表示未登录 —— 守卫据此跳登录页。
   */
  async function initialize({ force = false } = {}) {
    if (initialization) return initialization
    if (!force && verified && authenticated.value) return true
    initialization = (async () => {
      try {
        const session = await getSession()
        const sessionUser = session?.user || (session?.accountId && {
          accountId: session.accountId,
          username: session.username,
          displayName: session.displayName,
          role: session.role,
        })
        if (!session?.authenticated || !sessionUser) {
          clearLocalState()
          return false
        }
        setAuth(sessionUser, session.scope || scope.value || 'PLATFORM')
        authenticated.value = true
        return true
      } catch {
        clearLocalState()
        return false
      } finally {
        initialization = null
      }
    })()
    return initialization
  }

  async function logout() {
    try {
      await logoutSession()
    } finally {
      clearLocalState()
    }
  }

  return { scope, user, authenticated, setAuth, setScope, initialize, invalidateSession, logout, clearLocalState }
})
