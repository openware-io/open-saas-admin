/**
 * 从候选上下文里挑一个可用的。
 *
 * 背景（2026-09-10 修复）：
 * 1) 旧实现只在候选“恰好 1 个”时才返回，账号有多个上下文（默认租户 + A380）时一个都不选，
 *    导致业务接口全部 401 SAAS_CONTEXT_REQUIRED；
 * 2) 只对 TENANT 路由确保上下文也不够——平台运营后台的部分页面（如支付方式授权）会调用
 *    租户维度接口，没有上下文同样 401，而 401 会被当作会话失效把用户踢回登录页。
 *
 * 选择优先级：
 *  - 指定 PLATFORM：PLATFORM 上下文 > 第一个候选
 *  - 指定 TENANT  ：带门店的上下文（开台/订单需要 storeId）> TENANT 上下文 > 第一个候选
 *  - 未指定       ：带门店的上下文 > 第一个候选
 * 多候选时不强制用户先显式选择，进入后台后仍可用顶部上下文切换器更换。
 */
export function chooseSingleContext(items, preferredScope) {
  const list = Array.isArray(items) ? items : (items && items.items) || []
  if (!list.length) return null
  const scoped = preferredScope ? list.filter((c) => c.scopeType === preferredScope) : []
  if (preferredScope === 'PLATFORM') {
    return scoped[0] || list[0]
  }
  const withStore = list.filter((c) => c.storeId != null)
  if (withStore.length) return withStore[0]
  if (scoped.length) return scoped[0]
  return list[0]
}

/**
 * 把上下文还原成服务端口径的 contextId（`tenantId:organizationId:storeId`，空段留空）。
 *
 * 用途：前端缓存下来的上下文要与服务端会话里的 `selectedContextId` 比对。
 * 「另一个标签页切了门店」只有靠这个比对才能发现——两边必须用同一套拼接规则，
 * 所以统一放这里，选择器与 store 共用一份，不各写一份。
 */
export function contextIdOf(ctx) {
  if (!ctx || ctx.tenantId == null) return ''
  const organization = ctx.organizationId != null ? ctx.organizationId : ''
  const store = ctx.storeId != null ? ctx.storeId : ''
  return `${ctx.tenantId}:${organization}:${store}`
}

/**
 * 上下文里是否含某个权限码（权限快照由服务端在「选择上下文」时签进 token）。
 *
 * 后端快照形态在不同服务/版本里出现过数组与对象两种，这里统一容错：
 *  - `['tenant.currency.manage']`
 *  - `[{ code: 'tenant.currency.manage' }]` / `[{ permissionCode: ... }]`
 *  - `{ 'tenant.currency.manage': true }`
 * 拿不到快照时返回 false（按「未授权」显示，越权仍由后端强制 403）。
 */
export function hasPermission(permissions, code) {
  if (!code || !permissions) return false
  if (Array.isArray(permissions)) {
    return permissions.some((item) => {
      if (typeof item === 'string') return item === code
      return !!item && (item.code === code || item.permissionCode === code)
    })
  }
  if (typeof permissions === 'object') return permissions[code] === true || permissions[code] === 1
  return false
}

/**
 * 操作按钮的权限门禁（容错写法）：权限快照缺失（旧会话 / 平台上下文 / 后端未签权限）时按「可见」处理，
 * 避免整页操作按钮凭空消失；只有快照确实存在且不含该权限码时才判定不可见。
 * 这只是展示层收敛，越权仍由后端 PermissionGuard 403 强制。
 */
export function hasPermissionOrMissing(permissions, code) {
  if (!permissions) return true
  if (Array.isArray(permissions)) return !permissions.length || hasPermission(permissions, code)
  if (typeof permissions === 'object') return !Object.keys(permissions).length || hasPermission(permissions, code)
  return true
}
