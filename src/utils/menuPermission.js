import { hasPermission, hasPermissionOrMissing } from './context'

/**
 * 后端下发菜单 → 前端附加权限门禁。
 *
 * 背景：侧边栏菜单主体由后端 `GET /admin/menus` 下发，服务端已经按上下文权限过滤
 * （`AdminMenuApplicationService.filterTenantMenus`：储值管理/脱敏权限/运营人员/审计日志
 * 都按权限码或授权状态取子集）。前端 `layout/components/SidebarMenuItem.vue` 只负责渲染，
 * 没有逐项权限过滤机制。
 *
 * 「币种」（`/admin/tenant/currency`）在 2.1.x 里是前端**固定挂**的一项
 * （AdminLayout 模板里自拼 `el-menu-item` + `showCurrencyEntry`）。归后端菜单后，
 * 入口本身由后端下发，但「无 `tenant.currency.manage` 就不显示」的可见性口径必须保留：
 * 后端菜单来自服务端会话上下文，前端权限快照（`contextStore.current.permissions`）
 * 是同一份权限的展示层副本，两边不一致时按更保守的一侧隐藏，越权仍由后端 403 兜底。
 *
 * 因此这里把「路径 → 权限码」登记成映射，由 {@link filterMenusByPermission} 统一过滤，
 * 而不是让页面再拼一个固定菜单项。
 *
 * 只有登记在 {@link MENU_ITEM_PERMISSIONS} 里的路径才会被过滤：**未登记的菜单一律可见**，
 * 避免权限快照缺失（旧会话 / 纯平台上下文）时误伤其它菜单。
 * 权限码读取走 `utils/context` 的 `hasPermission`（数组 / `{code}` / `{permissionCode}` /
 * `{code: true}` 四种快照形态都容错），拿不到快照时判定为「无权限」——与改造前
 * `showCurrencyEntry` 的严格判定一致。
 */
export const MENU_ITEM_PERMISSIONS = Object.freeze({
  // 租户/门店业务入口：后端菜单有些只下发 path、requiredPermission 为空，
  // 前端必须补齐权限门禁，避免“看得到菜单、点进去 403”。
  '/admin/tenant/overview': 'tenant.overview.view',
  // 门店写操作改为「申请 → 平台审批 → 执行」：提交/撤销用租户级 tenant.tenant.manage（店长不持有），
  // 与 admin V14 门店菜单的 required_permission 同码。
  '/admin/tenant/stores': 'tenant.tenant.manage',
  // 平台「门店审批」队列：服务端菜单 V14 下发，前端兜底映射同码。
  '/admin/platform/store-approvals': 'platform.store.change.approve',
  '/admin/tenant/currency': 'tenant.currency.manage',
  '/admin/tenant/wallet-token-config': 'tenant.tenant.manage',
  '/admin/tenant/hotel': 'hotel.booking.view',
  '/admin/tenant/hotel-master': 'hotel.room.manage',
  '/admin/tenant/hotel-resources': 'hotel.room.availability.manage',
  '/admin/staff': 'iam.role.manage',
  '/admin/security': 'iam.role.manage',
  '/admin/audits': 'audit.view',
  '/admin/ktv/config': 'tenant.business.manage',
  '/admin/orders': 'order.view',
  '/admin/resources': 'resource.manage',
  '/admin/products': 'product.view',
  '/admin/inventory': 'inventory.view',
  '/business/payment-methods': 'payment.collect',
  '/business/reservations': 'reservation.view',
  '/business/orders': 'order.view',
  '/business/payments': 'payment.collect',
  '/business/shifts': 'order.settle',
  '/business/members': 'member.view',
  '/business/points': 'points.view',
  '/business/wallet': 'wallet.view',
})


/** 归一化菜单路径：去空白、去查询串、去尾部斜杠（后端 path 与路由可能带/不带尾斜杠）。 */
export function normalizeMenuPath(path) {
  if (typeof path !== 'string') return ''
  const trimmed = path.trim().split('?')[0].replace(/\/+$/, '')
  return trimmed || (path.trim() ? '/' : '')
}

/** 单个菜单项是否可见：未登记权限码 → 恒可见；登记了 → 必须命中权限快照。 */
export function isMenuItemVisible(item, permissions) {
  if (!item) return false
  // 后端已声明的 requiredPermission 优先；没有声明的按前端映射补门禁。
  const code = item.requiredPermission || MENU_ITEM_PERMISSIONS[normalizeMenuPath(item.path)]
  if (!code) return true
  return hasPermission(permissions, code)
}

/** 递归过滤菜单树（后端菜单是「父项 + children」两层结构，子项同样适用映射）。 */
export function filterMenusByPermission(menus, permissions) {
  if (!Array.isArray(menus)) return []
  const result = []
  for (const item of menus) {
    if (!item || typeof item !== 'object') continue
    if (!isMenuItemVisible(item, permissions)) continue
    const children = Array.isArray(item.children) ? item.children : []
    const filteredChildren = children.length ? filterMenusByPermission(children, permissions) : []
    if (children.length && !filteredChildren.length && !item.path) continue
    result.push(children.length ? { ...item, children: filteredChildren } : item)
  }
  return result
}

/**
 * 路由级权限门禁（`route.meta.permission`）：与后端菜单剪枝、接口 PermissionGuard 同码。
 *
 * 返回 true 表示「应回退」——由路由守卫跳回本工作区首页并提示，避免只看到一张 403 页面。
 * 平台与租户采用**同一份权限快照**判定，但缺失语义不同：
 *  1. 没配 `meta.permission` 的路由不拦（绝大多数既有页面）；
 *  2. **PLATFORM 页面 fail-closed**：平台页面只认平台工作区快照（`scopeType === 'PLATFORM'`）。
 *     平台令牌由网关注入、平台账号没有可选租户上下文（`/admin/context/select` 一律 403），
 *     因此平台快照**不来自上下文选择**，而由守卫从服务端已剪枝的 PLATFORM 菜单派生
 *     （见 {@link derivePlatformPermissions}）；仍然缺失说明菜单接口失败，此时回退而不是放行。
 *  3. TENANT/STORE 页面保持兼容：快照缺失（旧会话）或快照属于另一个工作区时不拦，
 *     避免误伤既有入口；越权仍由后端 403/401 自愈路径兜底。
 *
 * @param {string|undefined} metaScope 路由 `meta.scope`（PLATFORM / TENANT / STORE）
 * @param {object|null|undefined} current 运营上下文（含 `permissions` 快照与 `scopeType`）
 * @param {string|undefined} permission 路由要求的权限码
 */
export function routePermissionDenied(metaScope, current, permission) {
  if (!permission) return false
  const snapshotScope = current?.scopeType
  if (metaScope === 'PLATFORM') {
    // 非平台快照（含 null）一律视为「拿不到平台权限」：守卫会先从平台菜单派生快照，取不到就回退。
    if (snapshotScope !== 'PLATFORM') return true
    return !hasPermission(current?.permissions, permission)
  }
  if (metaScope && metaScope !== 'PLATFORM' && snapshotScope === 'PLATFORM') return false
  return !hasPermissionOrMissing(current?.permissions, permission)
}

/**
 * 递归收集菜单树里声明的 `requiredPermission`（平台菜单服务端已按 IAM 权限剪枝，
 * 下发的菜单本身就是该账号的能力清单；父项/children 都要收）。
 */
function collectMenuPermissions(menus) {
  const codes = new Set()
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (const item of nodes) {
      if (!item || typeof item !== 'object') continue
      const code = typeof item.requiredPermission === 'string' ? item.requiredPermission.trim() : ''
      if (code) codes.add(code)
      if (Array.isArray(item.children) && item.children.length) walk(item.children)
    }
  }
  walk(menus)
  return [...codes]
}

/**
 * 从服务端 `GET /admin/menus?scope=PLATFORM` 的响应派生平台权限快照。
 *
 * - 菜单存在（哪怕是空 `requiredPermission` 的纯展示菜单）→ 返回去重后的 requiredPermission 列表，
 *   可能为空数组（表示服务端未下发任何需要权限的菜单，审批按钮/路由应按空快照 fail-closed）；
 * - 菜单缺失/非数组/空树 → 返回 `null`（fail-closed：不写快照，审批路由回退、需权限菜单隐藏）。
 *
 * 口径依据（2026-11-02 真实浏览器验收）：平台令牌由网关注入，平台账号 5 个候选上下文
 * `/admin/context/select` 全部 403 CONTEXT_FORBIDDEN，`contextStore.current` 恒为 null；
 * 但菜单接口正确返回 `store.approval(requiredPermission=platform.store.change.approve)`，
 * 因此菜单是平台权限快照的唯一可靠来源。
 *
 * @param {Array|undefined|null} menus `menuStore.menus`（或任意菜单树）
 * @returns {string[]|null} 权限码列表；菜单缺失时 null
 */
export function derivePlatformPermissions(menus) {
  if (!Array.isArray(menus) || menus.length === 0) return null
  return collectMenuPermissions(menus)
}
