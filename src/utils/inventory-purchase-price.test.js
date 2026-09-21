import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fenToYuan, formatMoney, yuanToFen } from './format'
import { resolveAdminErrorMessage } from './adminErrorMessage'

/**
 * 仓库管理「采购价」字段契约（主单位 ↔ 最小货币单位 + 字段落点）。
 *
 * 后端唯一口径（gv_im_server，order 模块）：
 *  - `V20__ord_inventory_material_purchase_price.sql`：`ord_inventory_material.purchase_price`
 *    decimal(20,6) NULL，注释「采购价（最小货币单位，每计量单位）」，与
 *    `ord_product.sale_price` / `ord_catalog_item.unit_price` 同一形态；
 *  - `InventoryApplicationService.normalizePurchasePrice`：null = 不修改、0 = 清空（落库 NULL）、
 *    > 0 为实际采购价，为负或超过 10^13 → 400 `PURCHASE_PRICE_INVALID`。
 *
 * 因此后台表单按当前币种主单位录入（el-input-number, precision=2），提交前 `yuanToFen`；
 * 回填/列展示走 `fenToYuan` / `formatMoney`；列名走 `withCurrencyLabel`（币种名随当前币种变化），
 * 页面不得再出现裸货币符号、写死的「元」或页内 `/100`、`*100` 换算。
 */
const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8')

describe('仓库管理采购价：主单位 ↔ 最小货币单位', () => {
  it('主单位输入换算成最小货币单位整数，展示再换算回主单位，互为逆运算', () => {
    expect(yuanToFen(3.5)).toBe(350)
    expect(yuanToFen('12.34')).toBe(1234)
    expect(fenToYuan(350)).toBe(3.5)
    expect(formatMoney(yuanToFen(3.5), 'CNY')).toBe('¥3.50')
    expect(formatMoney(350, 'CNY')).toBe('¥3.50')
  })

  it('未维护采购价（null/空串）展示为占位而不是 0', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney('')).toBe('—')
  })

  it('后端 400 PURCHASE_PRICE_INVALID 映射为可读中文，不透出英文错误码', () => {
    const message = resolveAdminErrorMessage({
      response: { status: 400, data: { code: 'PURCHASE_PRICE_INVALID', message: '采购价（最小货币单位）不能为负' } },
    })
    expect(message).toContain('采购价')
    expect(/[A-Za-z]/.test(message)).toBe(false)
  })
})

describe('仓库管理页（inventory.vue）：采购价入口', () => {
  it('弹窗按当前币种主单位录入（precision=2、min=0、可留空）', async () => {
    const source = await read('../views/tenant/inventory.vue')
    expect(source).toContain("withCurrencyLabel('采购价')")
    expect(source).toContain('v-model="material.purchasePriceYuan"')
    expect(source).toContain(':precision="2"')
    expect(source).toContain(':min="0"')
    expect(source).toContain('留空表示不维护')
  })

  it('提交走 yuanToFen、回填走 fenToYuan、列表列展示走 formatMoney', async () => {
    const source = await read('../views/tenant/inventory.vue')
    expect(source).toContain('purchasePrice: purchasePriceFen(purchasePriceYuan)')
    expect(source).toContain('yuanToFen(yuan)')
    expect(source).toContain('fenToYuan(row.purchasePrice)')
    expect(source).toContain('formatMoney(row.purchasePrice)')
    // 留空提交 0（后端 0 = 清空 → NULL），不区分新建/编辑，避免「清空」静默失效
    expect(source).toContain("if (yuan === null || yuan === undefined || yuan === '') return 0")
  })

  it('页面不自造金额换算、不硬编码货币符号或「元」（与源码守卫同一口径）', async () => {
    const source = await read('../views/tenant/inventory.vue')
    expect(source).not.toMatch(/¥/)
    expect(source).not.toMatch(/元/)
    expect(source).not.toMatch(/\/\s*100\b/)
    expect(source).not.toMatch(/\*\s*100\b/)
    // 采购价字段不得出现英文枚举原文
    expect(source).not.toMatch(/purchasePrice\s*[:=]\s*'[A-Z_]+'/)
  })
})
