import { describe, expect, it } from 'vitest'
import {
  collectionLegs,
  collectionMethodSummary,
  hasCollections,
  hasRefunds,
  indexOrderCollections,
  isCombinedPayment,
  mergedLegsByMethod,
  viewCurrency,
} from './orderPayments'

/**
 * 订单收款明细的展示口径：组合支付要「一条不漏」，又不能把不同币种的钱加在一起。
 * 数据源是服务端 `/business/payments/order-collections`，这里只测「怎么显示」的纯函数。
 */

function collection(overrides = {}) {
  return {
    collectNo: 'PC-1',
    currencyCode: 'CNY',
    payable: 3900,
    collectedAt: '2026-09-19T12:00:00',
    customerId: 7,
    combined: true,
    legs: [
      { method: 'POINT', amount: 300 },
      { method: 'WALLET', amount: 600 },
      { method: 'ALIPAY', amount: 2000 },
      { method: 'CASH', amount: 1000 },
    ],
    ...overrides,
  }
}

function view(overrides = {}) {
  return {
    orderId: 69,
    currencyCode: 'CNY',
    mixedCurrency: false,
    totalCollected: 3900,
    refundedAmount: 0,
    collections: [collection()],
    transactions: [],
    refunds: [],
    ...overrides,
  }
}

describe('indexOrderCollections', () => {
  it('按 orderId 建索引，兼容数组与 data/items 包装', () => {
    expect(Object.keys(indexOrderCollections([view()]))).toEqual(['69'])
    expect(Object.keys(indexOrderCollections({ data: [view()] }))).toEqual(['69'])
    expect(Object.keys(indexOrderCollections({ items: [view()] }))).toEqual(['69'])
    expect(indexOrderCollections(null)).toEqual({})
  })
})

describe('hasCollections / isCombinedPayment', () => {
  it('没有收款记录时既不是组合支付，也不能当成 0 元', () => {
    const empty = view({ collections: [] })
    expect(hasCollections(empty)).toBe(false)
    expect(isCombinedPayment(empty)).toBe(false)
    expect(collectionMethodSummary(empty, 'A380币')).toBe('')
  })

  it('单腿不算组合支付，多腿才算', () => {
    const single = view({ collections: [collection({ combined: false, legs: [{ method: 'CASH', amount: 3900 }] })] })
    expect(isCombinedPayment(single)).toBe(false)
    expect(isCombinedPayment(view())).toBe(true)
  })

  it('后端漏标 combined 时按分腿数兜底判断（线上渠道 + 现金也算组合）', () => {
    const unmarked = view({
      collections: [collection({ combined: undefined, legs: [{ method: 'WECHAT', amount: 2000 }, { method: 'CASH', amount: 1900 }] })],
    })
    expect(isCombinedPayment(unmarked)).toBe(true)
  })
})

describe('collectionLegs / collectionMethodSummary', () => {
  it('分腿一条不漏，按抵扣顺序 积分→储值→现金/线上 排列', () => {
    const legs = collectionLegs(collection())
    expect(legs.map((leg) => leg.method)).toEqual(['POINT', 'WALLET', 'ALIPAY', 'CASH'])
    expect(legs.map((leg) => leg.amount)).toEqual([300, 600, 2000, 1000])
  })

  it('摘要把多笔收款的方式去重后按抵扣顺序拼接（储值用租户品牌名）', () => {
    const twoCollections = view({
      collections: [
        collection({ collectNo: 'PC-1', legs: [{ method: 'CASH', amount: 1000 }] }),
        collection({ collectNo: 'PC-2', legs: [{ method: 'POINT', amount: 100 }, { method: 'WALLET', amount: 200 }, { method: 'CASH', amount: 300 }] }),
      ],
    })
    expect(collectionMethodSummary(twoCollections, 'A380币')).toBe('积分+A380币+现金')
    expect(collectionMethodSummary(twoCollections, '皇冠币')).toBe('积分+皇冠币+现金')
  })

  it('未知支付方式回落「未知（CODE）」而不是英文原文', () => {
    const unknown = view({ collections: [collection({ legs: [{ method: 'PAYPAL', amount: 100 }] })] })
    expect(collectionMethodSummary(unknown, 'A380币')).toContain('未知')
  })
})

describe('mergedLegsByMethod', () => {
  it('单币种时把多笔收款按方式合并，供列表列展示', () => {
    const twoCollections = view({
      collections: [
        collection({ collectNo: 'PC-1', legs: [{ method: 'POINT', amount: 100 }, { method: 'CASH', amount: 900 }] }),
        collection({ collectNo: 'PC-2', legs: [{ method: 'POINT', amount: 50 }, { method: 'WALLET', amount: 950 }] }),
      ],
    })
    expect(mergedLegsByMethod(twoCollections)).toEqual([
      { method: 'POINT', amount: 150 },
      { method: 'WALLET', amount: 950 },
      { method: 'CASH', amount: 900 },
    ])
  })

  it('混币种时不给合并结果（禁止跨币种相加）', () => {
    expect(mergedLegsByMethod(view({ mixedCurrency: true, currencyCode: null }))).toEqual([])
    expect(mergedLegsByMethod(view({ currencyCode: null }))).toEqual([])
  })
})

describe('viewCurrency', () => {
  it('单一币种用收款快照；混币种退回订单快照，不给单一币种', () => {
    expect(viewCurrency(view(), 'USD')).toBe('CNY')
    expect(viewCurrency(view({ mixedCurrency: true, currencyCode: null }), 'USD')).toBe('USD')
    expect(viewCurrency(null, 'USD')).toBe('USD')
  })
})

describe('hasRefunds', () => {
  it('退款记录（含被拒）都要能展示出来', () => {
    expect(hasRefunds(view())).toBe(false)
    expect(hasRefunds(view({ refunds: [{ id: 1, status: 'REJECTED' }] }))).toBe(true)
  })
})
