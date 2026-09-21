import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { currencyText, formatMoney } from './format'
import { MIXED_CURRENCY_NOTICE } from './currency-summary'
import {
  SUMMARY_UNAVAILABLE_TEXT,
  dailyClosingCurrencyGroups,
  hasDailyClosingSummary,
  isDailyClosingMixedCurrency,
} from './daily-closing-summary'

/**
 * 日结汇总（pay_daily_closing.summary_json → DailyClosingDto.summary）的展示口径。
 *
 * 后端结构（common-payment-service DailyClosingSummary，dbcb8f79）按币种分组：
 * 单币种顶层 currencyCode 有值；混币种 currencyCode=null + mixedCurrency=true，
 * 每组含收款笔数/总额、按 provider 细分、现金、退款、交班长短款，金额一律最小货币单位整数。
 * 历史行（该能力上线前的数据）summary 为 null，必须降级显示而不是报错。
 */

/** 任务书给出的混币种样例（金额为最小货币单位整数）。 */
const MIXED = {
  businessDate: '2025-01-02',
  storeId: 2,
  currencyCode: null,
  mixedCurrency: true,
  currencies: [
    {
      currencyCode: 'CNY',
      collectionCount: 2,
      collectedAmount: 8000,
      cashCount: 1,
      cashAmount: 5000,
      refundCount: 1,
      refundAmount: 2000,
      shiftCount: 2,
      shiftDifferenceAmount: 60,
      providers: [
        { provider: 'ALIPAY', count: 1, amount: 3000 },
        { provider: 'CASH', count: 1, amount: 5000 },
      ],
    },
    {
      currencyCode: 'USD',
      collectionCount: 1,
      collectedAmount: 1200,
      cashCount: 0,
      cashAmount: 0,
      refundCount: 0,
      refundAmount: 0,
      shiftCount: 1,
      shiftDifferenceAmount: -50,
      providers: [{ provider: 'STRIPE', count: 1, amount: 1200 }],
    },
  ],
}

const SINGLE = {
  businessDate: '2025-01-02',
  storeId: 2,
  currencyCode: 'CNY',
  mixedCurrency: false,
  currencies: [
    { currencyCode: 'CNY', collectionCount: 2, collectedAmount: 8000, cashCount: 1, cashAmount: 5000, refundCount: 1, refundAmount: 2000, shiftCount: 2, shiftDifferenceAmount: 60, providers: [] },
  ],
}

describe('日结汇总：按币种分组的渲染口径', () => {
  it('单币种：顶层 currencyCode 有值、mixedCurrency=false，逐组渲染同一币种', () => {
    expect(hasDailyClosingSummary(SINGLE)).toBe(true)
    expect(isDailyClosingMixedCurrency(SINGLE)).toBe(false)
    const groups = dailyClosingCurrencyGroups(SINGLE)
    expect(groups).toHaveLength(1)
    expect(groups[0].currencyCode).toBe('CNY')
    // 金额是最小货币单位整数，渲染一律走 formatMoney（不在此换算分/元）
    expect(formatMoney(groups[0].collectedAmount, groups[0].currencyCode)).toBe('¥80.00')
    expect(formatMoney(groups[0].cashAmount, groups[0].currencyCode)).toBe('¥50.00')
    expect(formatMoney(groups[0].refundAmount, groups[0].currencyCode)).toBe('¥20.00')
    expect(formatMoney(groups[0].shiftDifferenceAmount, groups[0].currencyCode)).toBe('¥0.60')
  })

  it('混币种：mixedCurrency=true，必须逐组渲染、禁止合计', () => {
    expect(isDailyClosingMixedCurrency(MIXED)).toBe(true)
    expect(MIXED_CURRENCY_NOTICE).toBe('多币种，禁止合计')
    const groups = dailyClosingCurrencyGroups(MIXED)
    expect(groups.map((line) => line.currencyCode)).toEqual(['CNY', 'USD'])
    // 同一字段在不同币种下符号不同：绝不能被相加成一个数字
    expect(formatMoney(groups[0].collectedAmount, groups[0].currencyCode)).toBe('¥80.00')
    expect(formatMoney(groups[1].collectedAmount, groups[1].currencyCode)).toBe('$12.00')
    // 短款（负数）保留符号
    expect(formatMoney(groups[1].shiftDifferenceAmount, groups[1].currencyCode)).toBe('-$0.50')
  })

  it('混币种：顶层无币种，逐组币种取自各组 currencyCode（不回落全局币种）', () => {
    const groups = dailyClosingCurrencyGroups(MIXED)
    expect(currencyText(groups[0].currencyCode)).toBe('人民币')
    expect(currencyText(groups[1].currencyCode)).toBe('美元')
    // 顶层 currencyCode 为 null 时不做任何「合计」数据加工：分组原样保留
    expect(groups.every((line) => typeof line.collectionCount === 'number')).toBe(true)
  })

  it('provider 细分原样归一（笔数缺失按 0、金额缺失为 null → 渲染「—」）', () => {
    expect(dailyClosingCurrencyGroups(MIXED)[0].providers).toEqual([
      { provider: 'ALIPAY', count: 1, amount: 3000 },
      { provider: 'CASH', count: 1, amount: 5000 },
    ])
    const partial = dailyClosingCurrencyGroups({
      currencyCode: 'CNY',
      currencies: [{ currencyCode: 'CNY', providers: [{ provider: 'CASH' }] }],
    })
    expect(partial[0].providers).toEqual([{ provider: 'CASH', count: 0, amount: null }])
    expect(partial[0].collectedAmount).toBe(null)
    expect(formatMoney(partial[0].collectedAmount, partial[0].currencyCode)).toBe('—')
  })

  it('历史行 summary 为 null 一律降级为「暂无汇总（历史数据）」，不抛错', () => {
    for (const summary of [null, undefined, '', {}, { currencies: [] }, { mixedCurrency: true }]) {
      expect(hasDailyClosingSummary(summary)).toBe(false)
      expect(isDailyClosingMixedCurrency(summary)).toBe(false)
      expect(dailyClosingCurrencyGroups(summary)).toEqual([])
    }
    expect(SUMMARY_UNAVAILABLE_TEXT).toBe('暂无汇总（历史数据）')
  })

  it('未知字段（后端未来新增）不影响解析，只取已知字段', () => {
    const groups = dailyClosingCurrencyGroups({
      currencyCode: 'CNY',
      currencies: [{ currencyCode: 'CNY', collectedAmount: 100, futureField: 'x' }],
    })
    expect(groups[0].collectedAmount).toBe(100)
    expect('futureField' in groups[0]).toBe(false)
  })
})

describe('日结页（shift.vue）接线（源码断言）', () => {
  const readShift = async () => readFile(new URL('../views/tenant/shift.vue', import.meta.url), 'utf8')

  it('展开区按 summary 分组渲染收款/现金/退款/长短款与 provider 细分', async () => {
    const source = await readShift()
    expect(source).toContain('hasDailyClosingSummary(row.summary)')
    expect(source).toContain('isDailyClosingMixedCurrency(row.summary)')
    expect(source).toContain('dailyClosingCurrencyGroups(row.summary)')
    expect(source).toContain('formatMoney(line.collectedAmount, line.currencyCode)')
    expect(source).toContain('formatMoney(line.cashAmount, line.currencyCode)')
    expect(source).toContain('formatMoney(line.refundAmount, line.currencyCode)')
    expect(source).toContain('formatMoney(line.shiftDifferenceAmount, line.currencyCode)')
    // provider 细分按值口径渲染：现金 / 线上是金额（带币种符号），储值币 / 积分只显示数量（不带单位）
    expect(source).toContain('paymentValueText(provider, walletRatio, line.currencyCode)')
    expect(source).not.toContain('formatMoney(provider.amount')
    // provider 走支付方式中文词表（WALLET 用租户品牌名），不展示英文枚举原文
    expect(source).toContain('methodLabel(provider.provider, walletBrand)')
    expect(source).toContain('resolveWalletBrandName')
  })

  it('混币种提示与历史降级文案取自唯一出处，不在页面里写第二份', async () => {
    const source = await readShift()
    expect(source).toContain('MIXED_CURRENCY_NOTICE')
    expect(source).toContain('SUMMARY_UNAVAILABLE_TEXT')
    expect(source).not.toMatch(/[¥￥]/)
    expect(source).not.toMatch(/\/\s*100\b|\*\s*100\b/)
  })
})
