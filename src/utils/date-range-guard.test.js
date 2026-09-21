import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 「每个有时间字段的后台列表都能按时间区间查询」的**源码守卫**。
 *
 * 这条守卫存在的原因：13 个列表页各写一套筛选是最容易发生的回退 —— 有人新加一个列表页，
 * 顺手抄一个 `el-date-picker type="daterange"`，于是「空区间下发空串」「to 不收口」「from > to 照发请求」
 * 这些坑各自复现一遍。这里强制三件事：
 *  1. 用**同一个**共享控件 `@/components/DateRangeFilter.vue`，不允许再出现裸的区间 `el-date-picker`；
 *  2. 用**同一个**共享工具 `@/utils/dateRange` 把区间序列化成请求参数（而不是页面自己拼 `from`/`to`）；
 *  3. `from > to` 时页面**不发起请求**（守卫里必须出现 `dateRangeWarning`），且查询会复位页码。
 *
 * 断言按「页面结构」而非「文案」写，避免措辞调整就让测试失败。
 */

const srcRoot = fileURLToPath(new URL('..', import.meta.url))

/** 与其它源码守卫同口径：去掉注释，避免「说明为什么不再这么写」的注释被当成实现。 */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const readView = async (relative) => stripComments(await readFile(path.join(srcRoot, 'views', relative), 'utf8'))

/**
 * 所有必须支持时间区间筛选的后台列表页（与需求清单一一对应）。
 *
 * `serializer` 是该页把区间转成请求参数时用的共享入口：
 *  - `dateRangeParams`：绝大多数页面（`@/utils/dateRange`）；
 *  - `buildAuditQuery`：审计页，它的时间参数要跟 `page/pageSize/skipCount` 一起组装，
 *    组装逻辑本来就集中在 `@/utils/audit`（同样是唯一实现，不复制到页面里）。
 */
const TIME_RANGE_PAGES = [
  ['tenant/members.vue', 'dateRangeParams'],
  ['tenant/points.vue', 'dateRangeParams'],
  ['tenant/wallet.vue', 'dateRangeParams'],
  ['tenant/reservations.vue', 'dateRangeParams'],
  ['tenant/orders.vue', 'dateRangeParams'],
  ['tenant/payments.vue', 'dateRangeParams'],
  ['tenant/audits.vue', 'buildAuditQuery'],
  ['tenant/inventory.vue', 'dateRangeParams'],
  ['tenant/shift.vue', 'dateRangeParams'],
  ['tenant/products.vue', 'dateRangeParams'],
  ['tenant/staff.vue', 'dateRangeParams'],
  ['tenant/resources.vue', 'dateRangeParams'],
  // 报表页原来自带一套 daterange 选择器（第二套交互与口径），2026-09 统一到共享控件
  ['tenant/reports.vue', 'dateRangeParams'],
  ['platform/tenants.vue', 'dateRangeParams'],
]

describe('时间区间筛选：所有带时间字段的列表都用同一个共享控件', () => {
  it.each(TIME_RANGE_PAGES)('%s 使用 @/components/DateRangeFilter.vue', async (page) => {
    const source = await readView(page)
    expect(source).toContain("import DateRangeFilter from '@/components/DateRangeFilter.vue'")
    expect(source).toContain('<DateRangeFilter')
  })

  it.each(TIME_RANGE_PAGES)('%s 不再自带区间日期选择器（避免第二套交互与口径）', async (page) => {
    const source = await readView(page)
    // 单点日期（type="date"，如开班表单的营业日期）不受影响；只有**区间型**选择器必须走共享控件
    expect(source).not.toMatch(/<el-date-picker[\s\S]{0,400}?type="(daterange|datetimerange|monthrange)"/)
  })

  it.each(TIME_RANGE_PAGES)('%s 用共享工具序列化区间参数（%s）', async (page, serializer) => {
    const source = await readView(page)
    expect(source).toMatch(
      new RegExp(`import \\{[^}]*${serializer}[^}]*\\} from '@/utils/(dateRange|audit)'`),
    )
    expect(source).toContain(`${serializer}(`)
  })

  it.each(TIME_RANGE_PAGES)('%s 在 from > to 时不发起请求（有 dateRangeWarning 守卫）', async (page) => {
    const source = await readView(page)
    expect(source).toMatch(/import \{[^}]*dateRangeWarning[^}]*\} from '@\/utils\/dateRange'/)
    // 守卫必须真的用警告结果提前 return，而不是只 import 不用
    expect(source).toMatch(/dateRangeWarning\([^)]*\)[\s\S]{0,200}?return/)
  })

  it.each(TIME_RANGE_PAGES)('%s 的查询入口会把页码复位到 1', async (page) => {
    const source = await readView(page)
    // 页码可能是 `query.page = 1`（reactive）/ `materialQuery.page = 1` / `page.value = 1`（ref）；
    // 不匹配 `pageSize`（page 后面必须直接是 `=` 或 `.value`）。
    const resetsPage = /(?:\w+\.)?page(?:\.value)?\s*=\s*1\b/.test(source)
    const loadsDirectly = /@change="[^"]*load/.test(source) || /@clear="[^"]*load/.test(source)
    expect(resetsPage || loadsDirectly).toBe(true)
  })
})

describe('时间区间筛选：预约（BFF）与审计页的特殊口径', () => {
  it('audits.vue 走统一 from/to（不再把区间塞进 fromAt/toAt，否则结束日会漏）', async () => {
    const source = await readView('tenant/audits.vue')
    expect(source).toContain('from: range.value?.[0]')
    expect(source).toContain('to: range.value?.[1]')
    expect(source).not.toContain('fromAt: range.value?.[0]')
    expect(source).not.toContain('toAt: range.value?.[1]')
    expect(source).toContain('dateRangeWarning(range.value)')
  })

  it('inventory.vue 的物料与流水两个页签都带时间区间，且空区间判定用 hasDateRange', async () => {
    const source = await readView('tenant/inventory.vue')
    expect(source).toContain('dateRangeParams(materialQuery.range)')
    expect(source).toContain('dateRangeParams(transactionQuery.dateRange)')
    // (dateRange || []).length 对 [null, null] 恒为真 → 空列表会被误判成「筛过但没命中」
    expect(source).not.toMatch(/dateRange \|\| \[\]\)\.length/)
    expect(source).toContain('hasDateRange(')
  })
})

describe('时间区间筛选：api 层透传 params', () => {
  const API_CALLS = [
    ['api/order.js', "request.get('/api/v1/business/orders', { params })"],
    ['api/payment.js', "request.get('/api/v1/business/payments', { params })"],
    ['api/payment.js', "request.get('/api/v1/business/shifts', { params })"],
    ['api/payment.js', "request.get('/api/v1/admin/daily-closings', { params })"],
    ['api/staff.js', "request.get('/api/v1/admin/staff', { params })"],
    ['api/admin.js', "request.get('/api/v1/admin/platform/tenants', { params })"],
    ['api/member.js', "request.get('/api/v1/business/members', { params })"],
    ['api/member.js', "request.get('/api/v1/business/members/points', { params })"],
    ['api/member.js', "request.get('/api/v1/business/members/wallets', { params })"],
    ['api/reservation.js', "request.get('/api/v1/admin/reservations', { params })"],
    ['api/resource.js', "request.get('/api/v1/admin/resources', { params })"],
    ['api/audit.js', "request.get('/api/v1/admin/audits', { params })"],
    ['api/order.js', "request.get('/api/v1/admin/products', { params })"],
    ['api/order.js', "request.get('/api/v1/admin/inventory/materials', { params })"],
    ['api/order.js', "request.get('/api/v1/admin/inventory/transactions', { params })"],
    ['api/report.js', "request.get('/api/v1/admin/reports/sales', { params })"],
    ['api/report.js', "request.get('/api/v1/admin/reports/payments', { params })"],
  ]

  it.each(API_CALLS)('%s 的 %s 原样透传 params（时间区间因此可以下发）', async (file, expected) => {
    const source = stripComments(await readFile(path.join(srcRoot, file), 'utf8'))
    expect(source).toContain(expected)
  })
})
