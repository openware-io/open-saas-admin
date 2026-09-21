import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

// adminErrorMessage 依赖 element-plus 的 ElMessage：本文件只断言「解析后的中文提示」，
// mock 掉组件库可避免为一个纯函数测试加载整包 element-plus（源码守卫用例对机器负载敏感）。
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { formatMoney, formatPercent, formatQuantity, yuanToFen } from './format'
import { costBasisText } from '@/constants/terms'
import { resolveAdminErrorMessage } from './adminErrorMessage'
import { canAggregateAmounts, isMixedCurrency, sumMinorAmounts } from './currency-summary'
import {
  COST_UNAVAILABLE_TEXT,
  costCellText,
  receiptUnitCostFen,
  withReceiptUnitCost,
} from './inventory-cost'

/**
 * 库存成本 / 入库单价 / 毛利报表的展示口径。
 *
 * 后端口径（order 域 f6732c4a，admin BFF 6635995a）：
 *  - 入库/调整入参 `unitCost`（最小货币单位/计量单位）可空：留空或 0 = 沿用物料采购价；
 *  - 库存流水每行新增 unitCost/totalCost/currencyCode，升级前历史行为 NULL（显示「—」，不用 0 冒充）；
 *  - 库存成本 = 结存数量 × 移动加权平均成本，按门店/物料/币种，混币种禁止求和；
 *  - 毛利报表 `grossMarginRate` 是比例（0.92 = 92%），收入为 0 时为 null（显示「—」）。
 */

describe('本次入库单价：主单位 ↔ 最小货币单位', () => {
  it('填了单价就按最小货币单位提交（与采购价同一换算入口）', () => {
    expect(receiptUnitCostFen('12.34')).toBe(1234)
    expect(receiptUnitCostFen(3.5)).toBe(350)
    expect(receiptUnitCostFen('12.34')).toBe(yuanToFen('12.34'))
  })

  it('留空返回 null（≠ 显式 0），显式 0 原样保留（两者后端都按沿用采购价处理）', () => {
    expect(receiptUnitCostFen(null)).toBe(null)
    expect(receiptUnitCostFen(undefined)).toBe(null)
    expect(receiptUnitCostFen('')).toBe(null)
    expect(receiptUnitCostFen(0)).toBe(0)
  })

  it('留空时请求体**不带** unitCost 字段（不把 null 透成显式覆盖），填了才带', () => {
    const blank = withReceiptUnitCost({ materialId: 7, quantity: 2, unitCostYuan: '' }, '')
    expect(blank).toEqual({ materialId: 7, quantity: 2 })
    expect('unitCost' in blank).toBe(false)

    const filled = withReceiptUnitCost({ materialId: 7, quantity: 2, unitCostYuan: '3.50' }, '3.50')
    expect(filled).toEqual({ materialId: 7, quantity: 2, unitCost: 350 })
    expect('unitCostYuan' in filled).toBe(false)
  })

  it('未显式传第二个参数时直接读表单字段（页面只传一次）', () => {
    expect(withReceiptUnitCost({ materialId: 7, unitCostYuan: 1 }, undefined)).toEqual({ materialId: 7, unitCost: 100 })
    expect(withReceiptUnitCost({ materialId: 7, unitCostYuan: null })).toEqual({ materialId: 7 })
  })
})

describe('库存流水 / 库存成本：null 占位与逐行币种', () => {
  it('历史行（unitCost/totalCost 为 null）显示「—」，不用 0 冒充成本', () => {
    expect(COST_UNAVAILABLE_TEXT).toBe('—')
    expect(costCellText(null, 'CNY')).toBe('—')
    expect(costCellText(undefined, null)).toBe('—')
    expect(costCellText('', 'USD')).toBe('—')
  })

  it('有值时按行内币种快照渲染（改设置不改历史），出库负数保留符号', () => {
    expect(costCellText(350, 'CNY')).toBe('¥3.50')
    expect(costCellText(350, 'USD')).toBe('$3.50')
    expect(costCellText(-1200, 'CNY')).toBe('-¥12.00')
    expect(costCellText(0, 'CNY')).toBe('¥0.00')
  })
})

describe('毛利率：比例 → 百分比，收入为 0 时为「—」', () => {
  it('0.92 → 92.00%（后端给的是比例，不是已乘过的百分数）', () => {
    expect(formatPercent(0.92)).toBe('92.00%')
    expect(formatPercent(0.92)).not.toBe('0.92%')
    expect(formatPercent(1)).toBe('100.00%')
    expect(formatPercent(-0.05)).toBe('-5.00%')
  })

  it('收入为 0（后端 null）显示「—」，不假装是 0%', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(undefined)).toBe('—')
    expect(formatPercent('')).toBe('—')
    expect(formatPercent('abc')).toBe('—')
    expect(formatPercent(0)).toBe('0.00%')
  })

  it('数量去掉无意义尾零，缺失显示「—」', () => {
    expect(formatQuantity(2.0)).toBe('2')
    expect(formatQuantity('2.000000')).toBe('2')
    expect(formatQuantity(0.5)).toBe('0.5')
    expect(formatQuantity(null)).toBe('—')
    expect(formatQuantity('')).toBe('—')
  })

  it('成本口径标识转中文（未知口径回落「未知（CODE）」，不展示英文原文）', () => {
    expect(costBasisText('PERIOD_END_MOVING_AVERAGE')).toBe('期末移动加权平均')
    expect(costBasisText('')).toBe('—')
    expect(costBasisText('SOMETHING_NEW')).toBe('未知（SOMETHING_NEW）')
  })
})

describe('混币种禁止求和', () => {
  const rows = [
    { currencyCode: 'CNY', revenueAmount: 10000, costAmount: 800, inventoryCost: 5000 },
    { currencyCode: 'USD', revenueAmount: 2000, costAmount: 100, inventoryCost: 1200 },
  ]

  it('mixedCurrency=true 时合计入口返回 null（页面据此不渲染合计行）', () => {
    const mixed = { currencyCode: null, mixedCurrency: true }
    expect(isMixedCurrency(mixed)).toBe(true)
    expect(canAggregateAmounts(mixed)).toBe(false)
    expect(sumMinorAmounts(rows, 'revenueAmount', mixed)).toBe(null)
    expect(sumMinorAmounts(rows, 'costAmount', mixed)).toBe(null)
    expect(sumMinorAmounts(rows, 'inventoryCost', mixed)).toBe(null)
  })

  it('单币种才允许合计（金额是最小货币单位整数，直接相加，不做任何换算）', () => {
    const single = { currencyCode: 'CNY', mixedCurrency: false }
    expect(canAggregateAmounts(single)).toBe(true)
    expect(sumMinorAmounts(rows, 'revenueAmount', single)).toBe(12000)
    expect(formatMoney(sumMinorAmounts(rows, 'revenueAmount', single), single.currencyCode)).toBe('¥120.00')
    expect(sumMinorAmounts([], 'revenueAmount', single)).toBe(0)
  })
})

describe('新错误码的中文提示（不得出现裸码 / 英文）', () => {
  it('跨币种入库被拒 → 给出可执行的下一步，不透出错误码', () => {
    const message = resolveAdminErrorMessage({ response: { status: 400, data: { code: 'INVENTORY_CURRENCY_MISMATCH' } } })
    expect(message).toContain('币种不一致')
    expect(message).toContain('库存清零')
    expect(message).not.toContain('INVENTORY_CURRENCY_MISMATCH')
    expect(/[A-Za-z]/.test(message)).toBe(false)
  })

  it('采购价 / 入库单价非法、日结缺营业日期都有中文提示', () => {
    const price = resolveAdminErrorMessage({ response: { status: 400, data: { code: 'PURCHASE_PRICE_INVALID' } } })
    expect(price).toContain('采购价')
    expect(price).toContain('入库单价')
    expect(/[A-Za-z]/.test(price)).toBe(false)

    const date = resolveAdminErrorMessage({ response: { status: 400, data: { code: 'DAILY_CLOSING_DATE_REQUIRED' } } })
    expect(date).toContain('营业日期')
    expect(/[A-Za-z]/.test(date)).toBe(false)

    const inventory = resolveAdminErrorMessage({ response: { status: 400, data: { code: 'INVENTORY_INVALID' } } })
    expect(/[A-Za-z]/.test(inventory)).toBe(false)
  })

  it('页面的失败提示统一走 notifyAdminRequestError（不自行拼接响应原文）', async () => {
    const sources = await Promise.all([
      readFile(new URL('../views/tenant/inventory.vue', import.meta.url), 'utf8'),
      readFile(new URL('../views/tenant/reports.vue', import.meta.url), 'utf8'),
      readFile(new URL('../views/tenant/shift.vue', import.meta.url), 'utf8'),
    ])
    for (const source of sources) {
      expect(source).toContain("from '@/utils/adminErrorMessage'")
      expect(source).toContain('notifyAdminRequestError')
      expect(source).not.toContain('response?.data?.message')
    }
  })
})

describe('库存页 / 报表页接线（源码断言）', () => {
  const readView = async (relative) => readFile(new URL(`../views/tenant/${relative}`, import.meta.url), 'utf8')

  it('库存页：入库表单按当前币种主单位录入本次入库单价，留空不带字段', async () => {
    const source = await readView('inventory.vue')
    expect(source).toContain("withCurrencyLabel('本次入库单价')")
    expect(source).toContain('v-model="stock.unitCostYuan"')
    expect(source).toContain('placeholder="留空表示沿用物料采购价"')
    expect(source).toContain('withReceiptUnitCost(')
    expect(source).toContain('yuanToFen')
  })

  it('库存页：流水新增单价/成本发生额列，历史 null 显示「—」；库存成本卡片消费 costs 接口', async () => {
    const source = await readView('inventory.vue')
    expect(source).toContain('costCellText(row.unitCost, row.currencyCode)')
    expect(source).toContain('costCellText(row.totalCost, row.currencyCode)')
    expect(source).toContain('listInventoryCosts')
    expect(source).toContain('formatQuantity(row.onHandQty)')
    expect(source).toContain('costsMixedCurrency')
    expect(source).toContain('MIXED_CURRENCY_NOTICE')
    // 金额展示只走统一入口，页面不得自带换算或货币符号
    expect(source).toContain('formatMoney')
    expect(source).not.toMatch(/[¥￥]/)
    expect(source).not.toMatch(/元/)
    expect(source).not.toMatch(/\/\s*100\b|\*\s*100\b/)
  })

  it('报表页：新增「库存成本与毛利」tab，毛利率走 formatPercent、混币种不显示合计行', async () => {
    const source = await readView('reports.vue')
    expect(source).toContain('库存成本与毛利')
    expect(source).toContain("name=\"inventory-gross-profit\"")
    expect(source).toContain('getInventoryGrossProfit')
    expect(source).toContain("kind: 'percent'")
    expect(source).toContain('formatPercent')
    expect(source).toContain('formatQuantity')
    expect(source).toContain(':show-summary="showSummary"')
    // 合计行只在「该 tab 有合计白名单 + 非混币种 + 有行」时出现（销售报表加入后同一条规则）
    expect(source).toContain('TOTAL_PROPS')
    expect(source).toMatch(/showSummary = computed\([\s\S]{0,260}?!mixedCurrency\.value/)
    expect(source).not.toContain(':show-summary="true"')
    expect(source).toContain('sumMinorAmounts(rows.value, prop, envelope.value)')
    expect(source).toContain('costBasisText')
    expect(source).toContain('未计成本数量')
    expect(source).toContain('MIXED_CURRENCY_NOTICE')
    expect(source).not.toMatch(/[¥￥]/)
    expect(source).not.toMatch(/元/)
    expect(source).not.toMatch(/\/\s*100\b|\*\s*100\b/)
  })

  it('报表页列定义覆盖门店/日期/币种/收入/成本/毛利/毛利率/售出数量/未计成本数量', async () => {
    const source = await readView('reports.vue')
    for (const prop of ['storeName', 'businessDate', 'currencyCode', 'revenueAmount', 'costAmount', 'grossProfitAmount', 'grossMarginRate', 'soldQuantity', 'uncostedQuantity']) {
      expect(source).toContain(`prop: '${prop}'`)
    }
  })
})
