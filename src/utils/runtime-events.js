/**
 * 浏览器运行时事件（跨层解耦用）。
 *
 * `api/request.js` 不能 import stores（request → api/admin → stores 会形成循环依赖，
 * 本仓一直刻意避免），但「会话已被判定失效」这类事实必须让导航守卫缓存的登录态立即作废，
 * 否则用户在跳登录页之前又点回后台路由时会被放行。这里用 window 事件广播，
 * 由 main.js 落到 auth store 上。
 */

export const SESSION_EXPIRED_EVENT = 'saas-admin:session-expired'

/** 广播一个无载荷运行时事件；非浏览器环境（单测）安全空转。 */
export function emitRuntimeEvent(name) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new Event(name))
}
