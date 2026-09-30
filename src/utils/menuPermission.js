import { hasPermission } from './context'

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
  // 租户级币种设置（入口归后端菜单，权限口径沿用原前端固定项）。
  '/admin/tenant/currency': 'tenant.currency.manage',
})

/** 归一化菜单路径：去空白、去查询串、去尾部斜杠（后端 path 与路由可能带/不带尾斜杠）。 */
export function normalizeMenuPath(path) {
  if (typeof path !== 'string') return ''
  const trimmed = path.trim().split('?')[0].replace(/\/+$/, '')
  return trimmed || (path.trim() ? '/' : '')
}

/** 单个菜单项是否可见：未登记权限码 → 恒可见；登记了 → 必须命中权限快照。 */
export function isMenuItemVisible(item, permissions) {
  const code = MENU_ITEM_PERMISSIONS[normalizeMenuPath(item && item.path)]
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
