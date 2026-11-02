import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  MENU_ITEM_PERMISSIONS,
  derivePlatformPermissions,
  filterMenusByPermission,
  isMenuItemVisible,
  normalizeMenuPath,
  routePermissionDenied,
} from './menuPermission'

/**
 * 「币种」入口收归后端菜单（前端侧）的守卫：
 *  1. 菜单主体由后端下发，前端只在 `utils/menuPermission` 里登记「路径 → 权限码」的附加门禁，
 *     不再于 AdminLayout 模板里自拼固定 el-menu-item；
 *  2. 币种的可见性口径仍是 `tenant.currency.manage`（与改造前的 showCurrencyEntry 一致）；
 *  3. 路由 `/admin/tenant/currency` 与门店页的页内快捷入口保留（后端未下发时仍可直达/进入）。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

/** 去掉注释后再做负向断言，避免「说明为什么不再这么写」的注释被误判成实现（同 terms.test 的做法）。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const CURRENCY_MENU = { id: 27, name: '币种', path: '/admin/tenant/currency', children: [] }
const STORE_MENU = { id: 10, name: '门店', path: '/admin/tenant/stores', children: [] }
const STORE_APPROVAL_MENU = { id: 30, name: '门店审批', path: '/admin/platform/store-approvals', children: [] }

describe('菜单权限映射（后端菜单 + 前端附加门禁）', () => {
  it('只登记币种一项，路径与后端下发的路由一致', () => {
    expect(MENU_ITEM_PERMISSIONS['/admin/tenant/currency']).toBe('tenant.currency.manage')
    expect(MENU_ITEM_PERMISSIONS['/admin/tenant/overview']).toBe('tenant.overview.view')
  })

  it('门店写操作改为申请制：门店菜单与平台审批菜单都登记了新权限码', () => {
    // 门店（租户侧）：提交/撤销申请用租户级 tenant.tenant.manage（店长不持有）
    expect(MENU_ITEM_PERMISSIONS['/admin/tenant/stores']).toBe('tenant.tenant.manage')
    // 平台「门店审批」：新增平台权限码，服务端菜单 V14 同码下发
    expect(MENU_ITEM_PERMISSIONS['/admin/platform/store-approvals']).toBe('platform.store.change.approve')
  })

  it('权限快照的四种形态都容错（数组 / {code} / {permissionCode} / {code:true}）', () => {
    expect(isMenuItemVisible(CURRENCY_MENU, ['tenant.currency.manage'])).toBe(true)
    expect(isMenuItemVisible(CURRENCY_MENU, [{ code: 'tenant.currency.manage' }])).toBe(true)
    expect(isMenuItemVisible(CURRENCY_MENU, [{ permissionCode: 'tenant.currency.manage' }])).toBe(true)
    expect(isMenuItemVisible(CURRENCY_MENU, { 'tenant.currency.manage': true })).toBe(true)
    expect(isMenuItemVisible(CURRENCY_MENU, { 'tenant.currency.manage': false })).toBe(false)
    expect(isMenuItemVisible(CURRENCY_MENU, ['reservation.cancel'])).toBe(false)
  })

  it('拿不到权限快照时币种隐藏（与改造前 showCurrencyEntry 的严格判定一致）', () => {
    expect(isMenuItemVisible(CURRENCY_MENU, undefined)).toBe(false)
    expect(isMenuItemVisible(CURRENCY_MENU, null)).toBe(false)
    expect(isMenuItemVisible(CURRENCY_MENU, [])).toBe(false)
  })

  it('未登记权限的菜单一律可见：快照缺失时不误伤其它菜单', () => {
    const unmapped = { id: 99, name: '报表', path: '/admin/reports', children: [] }
    expect(isMenuItemVisible(unmapped, undefined)).toBe(true)
    expect(filterMenusByPermission([unmapped], undefined)).toEqual([unmapped])
  })

  it('租户/门店入口没有权限时直接隐藏，而不是渲染后 403', () => {
    expect(isMenuItemVisible(STORE_MENU, ['tenant.overview.view'])).toBe(false)
    expect(isMenuItemVisible(STORE_MENU, ['tenant.tenant.manage'])).toBe(true)
    expect(isMenuItemVisible(STORE_MENU, ['tenant.store.manage'])).toBe(false)
    expect(isMenuItemVisible({ path: '/admin/ktv/config' }, [])).toBe(false)
    expect(isMenuItemVisible({ path: '/admin/ktv/config' }, ['tenant.business.manage'])).toBe(true)
    expect(isMenuItemVisible({ path: '/admin/roles', requiredPermission: 'iam.role.manage' }, [])).toBe(false)
    expect(isMenuItemVisible({ path: '/admin/roles', requiredPermission: 'iam.role.manage' }, ['iam.role.manage'])).toBe(true)
  })

  it('平台「门店审批」菜单：只有持 platform.store.change.approve 才可见', () => {
    expect(isMenuItemVisible(STORE_APPROVAL_MENU, ['platform.store.change.approve'])).toBe(true)
    expect(isMenuItemVisible(STORE_APPROVAL_MENU, ['tenant.tenant.manage'])).toBe(false)
    // 后端已声明 requiredPermission 时优先用它（服务端菜单 V14 会下发同码）
    expect(isMenuItemVisible(
      { path: '/admin/platform/store-approvals', requiredPermission: 'platform.store.change.approve' },
      ['tenant.tenant.manage'],
    )).toBe(false)
  })

  it('过滤时保留原菜单顺序与结构，子项同样适用映射', () => {
    const tree = [
      { id: 3, name: '权限管理', path: '/admin/iam', children: [{ id: 31, name: '角色', path: '/admin/iam/roles' }] },
      CURRENCY_MENU,
      STORE_MENU,
    ]
    const filtered = filterMenusByPermission(tree, ['tenant.currency.manage'])
    expect(filtered.map((item) => item.path)).toEqual(['/admin/iam', '/admin/tenant/currency'])
    expect(filtered[0].children).toHaveLength(1)

    const hidden = filterMenusByPermission(tree, [])
    expect(hidden.map((item) => item.path)).toEqual(['/admin/iam'])
  })

  it('非数组入参（菜单还没加载）返回空数组，不抛错', () => {
    expect(filterMenusByPermission(undefined, [])).toEqual([])
    expect(filterMenusByPermission(null, [])).toEqual([])
  })

  it('路径归一化：空白 / 尾斜杠 / 查询串', () => {
    expect(normalizeMenuPath(' /admin/tenant/currency/ ')).toBe('/admin/tenant/currency')
    expect(normalizeMenuPath('/admin/tenant/currency?tab=1')).toBe('/admin/tenant/currency')
    expect(normalizeMenuPath(null)).toBe('')
    expect(isMenuItemVisible({ path: '/admin/tenant/currency/' }, ['tenant.currency.manage'])).toBe(true)
  })
})

describe('AdminLayout 源码守卫：币种入口归后端菜单', () => {
  it('不再自拼固定 /admin/tenant/currency 菜单项（模板 + computed + import 都清干净）', async () => {
    const source = await read('../layout/AdminLayout.vue')
    expect(source).not.toContain('showCurrencyEntry')
    expect(source).not.toContain('index="/admin/tenant/currency"')
    expect(source).not.toContain('Coin')
    // 仍按同一口径过滤后端菜单（不是直接渲染 menuStore.menus）
    expect(source).toContain('filterMenusByPermission')
    expect(source).toContain('visibleMenus')
  })

  it('路由仍保留 /admin/tenant/currency → views/tenant/currency.vue', async () => {
    const source = await read('../router/index.js')
    expect(source).toContain("path: 'admin/tenant/currency'")
    expect(source).toContain("import('@/views/tenant/currency.vue')")
  })

  it('门店页的页内快捷入口保留（后端菜单未下发时的兜底入口）', async () => {
    const source = await read('../views/tenant/stores.vue')
    expect(source).toContain("router.push('/admin/tenant/currency')")
    expect(source).toContain('canManageCurrency')
  })
})

describe('路由级权限门禁（meta.permission）', () => {
  it('同工作区且快照缺权限 → 回退；有权限 → 放行', () => {
    const tenantContext = { scopeType: 'TENANT', permissions: ['tenant.tenant.manage'] }
    expect(routePermissionDenied('TENANT', tenantContext, 'tenant.tenant.manage')).toBe(false)
    expect(routePermissionDenied('TENANT', tenantContext, 'platform.store.change.approve')).toBe(true)

    const platformContext = { scopeType: 'PLATFORM', permissions: ['platform.store.change.approve'] }
    expect(routePermissionDenied('PLATFORM', platformContext, 'platform.store.change.approve')).toBe(false)
    expect(routePermissionDenied('PLATFORM', platformContext, 'tenant.tenant.manage')).toBe(true)
  })

  it('没配权限码时不拦；租户页快照缺失保持兼容（旧会话），由后端 403 兜底', () => {
    expect(routePermissionDenied('TENANT', { scopeType: 'TENANT', permissions: ['x'] }, undefined)).toBe(false)
    expect(routePermissionDenied('TENANT', { scopeType: 'TENANT' }, 'tenant.tenant.manage')).toBe(false)
  })

  // P0 评审结论：平台菜单曾被前端二次过滤（平台快照缺失 + 严格 hasPermission）。
  // 根因修复是进入 PLATFORM 工作区先 ensureContext('PLATFORM')；守卫对「平台快照缺失」必须 fail-closed，
  // 否则 fail-open 会把根因永远掩盖掉（菜单剪掉但路由还能进，或反过来）。
  it('平台快照缺失/不是平台快照 → 平台权限路由回退（fail-closed）', () => {
    expect(routePermissionDenied('PLATFORM', null, 'platform.store.change.approve')).toBe(true)
    expect(routePermissionDenied('PLATFORM', { scopeType: 'TENANT', permissions: ['tenant.tenant.manage'] }, 'platform.store.change.approve'))
      .toBe(true)
    expect(routePermissionDenied('PLATFORM', { scopeType: 'PLATFORM' }, 'platform.store.change.approve')).toBe(true)
  })

  it('平台运营切到租户上下文时，租户页面仍按租户快照判定（跨工作区快照不反向误伤）', () => {
    expect(routePermissionDenied('TENANT', { scopeType: 'PLATFORM', permissions: ['platform.store.change.approve'] }, 'tenant.tenant.manage'))
      .toBe(false)
  })
})

describe('平台权限快照根因修复（源码守卫）', () => {
  it('PLATFORM 工作区不再调用 ensureContext/select（平台令牌无上下文可选）', async () => {
    const source = stripComments(await read('../router/index.js'))
    // 平台账号 5 个候选 select 全 403，绝不能再用上下文选择取平台权限
    expect(source).not.toContain("ensureContext('PLATFORM')")
    expect(source).not.toContain('contextStore.select(')
    // 租户/门店分支仍保留 ensureContext（未受平台修复影响）
    expect(source).toContain("ensureContext(to.meta.scope)")
    expect(source).toContain("ensureContext('STORE')")
  })

  it('平台快照改由已剪枝的平台菜单派生，并写入 contextStore（synthetic）', async () => {
    const source = await read('../router/index.js')
    expect(source).toContain('ensurePlatformPermissionSnapshot')
    expect(source).toContain("fetchMenus('PLATFORM')")
    expect(source).toContain('derivePlatformPermissions')
    expect(source).toContain('applyPlatformSnapshot')
    expect(source).toContain('PLATFORM_SNAPSHOT_TTL_MS')
    // 菜单缺失必须 fail-closed：不写快照
    expect(source).toMatch(/if \(!permissions\) return/)
    // 离开平台工作区要清 synthetic 快照，避免后台校准把它判成上下文变化
    expect(source).toContain('clearPlatformSnapshot')
  })

  it('平台审批页按钮使用严格 hasPermission（快照存在时），不再 hasPermissionOrMissing', async () => {
    const source = await read('../views/platform/store-approvals.vue')
    expect(source).toContain('hasPermission')
    expect(source).not.toContain('hasPermissionOrMissing')
    expect(source).toContain('permissionSnapshot')
    expect(source).toContain('reviewFooterHint')
  })

  it('平台菜单在权限快照晚到时重新拉取（与租户/门店同一份快照口径）', async () => {
    const source = await read('../layout/AdminLayout.vue')
    expect(source).toMatch(/authStore\.scope === 'PLATFORM'\) menuStore\.fetchMenus\('PLATFORM'\)/)
    // 菜单可见性仍走同一映射过滤（不新增 fail-open 分支）
    expect(source).toContain("filterMenusByPermission(source, contextStore.current?.permissions)")
  })
})

describe('从平台菜单派生权限快照（derivePlatformPermissions）', () => {
  const PLATFORM_MENUS = [
    { id: 1, code: 'platform.tenant', name: '租户管理', path: '/admin/platform/tenants' },
    {
      id: 2,
      code: 'platform.iam',
      name: 'IAM',
      children: [
        { id: 21, code: 'iam.role', name: '角色', path: '/admin/iam/roles', requiredPermission: 'iam.role.manage' },
        {
          id: 22,
          code: 'iam.permission',
          name: '权限',
          children: [
            { id: 221, code: 'iam.permission.view', name: '权限清单', path: '/admin/iam/permissions', requiredPermission: 'iam.permission.view' },
          ],
        },
      ],
    },
    {
      id: 3,
      code: 'store.approval',
      name: '门店审批',
      path: '/admin/platform/store-approvals',
      requiredPermission: 'platform.store.change.approve',
    },
  ]

  it('递归收集 requiredPermission（含嵌套 children）并去重', () => {
    expect(derivePlatformPermissions(PLATFORM_MENUS)).toEqual([
      'iam.role.manage',
      'iam.permission.view',
      'platform.store.change.approve',
    ])
    expect(derivePlatformPermissions([
      { requiredPermission: 'a' },
      { children: [{ requiredPermission: 'a' }, { requiredPermission: 'b' }] },
      { requiredPermission: '  ' },
      null,
    ])).toEqual(['a', 'b'])
  })

  it('菜单缺失/空菜单 → null（fail-closed，不写快照）', () => {
    expect(derivePlatformPermissions(undefined)).toBeNull()
    expect(derivePlatformPermissions(null)).toBeNull()
    expect(derivePlatformPermissions([])).toBeNull()

    // 空快照下平台审批路由必须回退（不允许 fail-open）
    expect(routePermissionDenied('PLATFORM', { scopeType: 'PLATFORM', permissions: [] }, 'platform.store.change.approve'))
      .toBe(true)
    expect(routePermissionDenied('PLATFORM', null, 'platform.store.change.approve')).toBe(true)
  })

  it('菜单存在但没有 requiredPermission 时返回空数组（纯展示菜单也是有效快照）', () => {
    expect(derivePlatformPermissions([{ name: '租户管理', path: '/admin/platform/tenants' }])).toEqual([])
  })

  it('派生快照可直接驱动菜单剪枝与路由守卫', () => {
    const permissions = derivePlatformPermissions(PLATFORM_MENUS)
    const filtered = filterMenusByPermission(PLATFORM_MENUS, permissions)
    expect(filtered.map((item) => item.code)).toEqual(['platform.tenant', 'platform.iam', 'store.approval'])
    expect(routePermissionDenied('PLATFORM', { scopeType: 'PLATFORM', permissions }, 'platform.store.change.approve'))
      .toBe(false)
  })
})

describe('路由源码守卫：门店申请制与平台审批页', () => {
  it('平台「门店审批」路由 scope=PLATFORM 且 meta.permission 同码', async () => {
    const source = await read('../router/index.js')
    expect(source).toContain("path: 'admin/platform/store-approvals'")
    expect(source).toContain("import('@/views/platform/store-approvals.vue')")
    expect(source).toContain("permission: 'platform.store.change.approve'")
    expect(source).toContain("scope: 'PLATFORM'")
  })

  it('租户门店路由 meta.permission=tenant.tenant.manage，并接入守卫兜底', async () => {
    const source = await read('../router/index.js')
    expect(source).toContain("permission: 'tenant.tenant.manage'")
    expect(source).toContain('routePermissionDenied')
  })
})
