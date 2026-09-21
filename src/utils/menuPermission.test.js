import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  MENU_ITEM_PERMISSIONS,
  filterMenusByPermission,
  isMenuItemVisible,
  normalizeMenuPath,
} from './menuPermission'

/**
 * 「币种」入口收归后端菜单（前端侧）的守卫：
 *  1. 菜单主体由后端下发，前端只在 `utils/menuPermission` 里登记「路径 → 权限码」的附加门禁，
 *     不再于 AdminLayout 模板里自拼固定 el-menu-item；
 *  2. 币种的可见性口径仍是 `tenant.currency.manage`（与改造前的 showCurrencyEntry 一致）；
 *  3. 路由 `/admin/tenant/currency` 与门店页的页内快捷入口保留（后端未下发时仍可直达/进入）。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

const CURRENCY_MENU = { id: 27, name: '币种', path: '/admin/tenant/currency', children: [] }
const STORE_MENU = { id: 10, name: '门店', path: '/admin/tenant/stores', children: [] }

describe('菜单权限映射（后端菜单 + 前端附加门禁）', () => {
  it('只登记币种一项，路径与后端下发的路由一致', () => {
    expect(MENU_ITEM_PERMISSIONS).toEqual({ '/admin/tenant/currency': 'tenant.currency.manage' })
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
    expect(isMenuItemVisible(STORE_MENU, undefined)).toBe(true)
    expect(filterMenusByPermission([STORE_MENU], undefined)).toEqual([STORE_MENU])
  })

  it('过滤时保留原菜单顺序与结构，子项同样适用映射', () => {
    const tree = [
      { id: 3, name: '权限管理', path: '/admin/iam', children: [{ id: 31, name: '角色', path: '/admin/iam/roles' }] },
      CURRENCY_MENU,
      STORE_MENU,
    ]
    const filtered = filterMenusByPermission(tree, ['tenant.currency.manage'])
    expect(filtered.map((item) => item.path)).toEqual(['/admin/iam', '/admin/tenant/currency', '/admin/tenant/stores'])
    expect(filtered[0].children).toHaveLength(1)

    const hidden = filterMenusByPermission(tree, [])
    expect(hidden.map((item) => item.path)).toEqual(['/admin/iam', '/admin/tenant/stores'])
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
