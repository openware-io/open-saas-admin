import { describe, expect, it } from 'vitest'
import {
  canCancelOrder,
  filterOrders,
  isActiveOrder,
  matchesOrderKeyword,
  orderLiveAmountOf,
  orderSummary,
  paginateOrders,
  sortOrdersByCreatedAtDesc,
} from './orderList'

/**
 * 订单管理（后台列表）纯函数口径（领域重构后）：
 *  - 状态筛选按**交易状态 tradeStatus**（不再读兼容列 ord_order.status）；
 *  - 金额合计只在命中行币种一致时给出，混币种不求和（16_CURRENCY_CONVENTIONS §3）；
 *  - 取消入口只给非终态（COMPLETED/CANCELLED；已收款由后端 409 兜底）；
 *  - 分页越界回落到最后一页。
 */
const rows = [
  { id: 1, orderNo: 'O202609190001', tradeStatus: 'DRAFT', sessionStatus: 'OPEN', roomName: 'K01', roomCode: 'K01', customerId: 77, totalAmount: 20000, paidAmount: 0, currencyCode: 'CNY', createdAt: '2026-09-19T20:00:00' },
  { id: 2, orderNo: 'O202609190002', tradeStatus: 'PENDING_PAYMENT', sessionStatus: 'CLOSED', roomName: 'K02', customerId: 88, totalAmount: 30000, paidAmount: 0, currencyCode: 'CNY', createdAt: '2026-09-19T21:00:00' },
  { id: 3, orderNo: 'O202609190003', tradeStatus: 'COMPLETED', sessionStatus: 'CLOSED', roomName: 'K03', customerId: 99, totalAmount: 15000, paidAmount: 15000, currencyCode: 'CNY', createdAt: '2026-09-19T18:00:00' },
  { id: 4, orderNo: 'O202609190004', tradeStatus: 'CANCELLED', sessionStatus: 'CANCELLED', roomName: 'K04', totalAmount: 9000, paidAmount: 0, currencyCode: 'CNY', createdAt: '2026-09-19T17:00:00' },
]

describe('订单管理筛选与匹配', () => {
  it('按交易状态筛选', () => {
    expect(filterOrders(rows, { status: 'DRAFT' }).map((row) => row.id)).toEqual([1])
    expect(filterOrders(rows, { status: 'PENDING_PAYMENT' }).map((row) => row.id)).toEqual([2])
    expect(filterOrders(rows, { status: '' })).toHaveLength(4)
  })

  it('兼容旧后端：缺 tradeStatus 时按兼容列 status 推导', () => {
    expect(filterOrders([{ id: 9, status: 'WAITING_PAYMENT' }], { status: 'PENDING_PAYMENT' }).map((row) => row.id))
      .toEqual([9])
  })

  it('关键字匹配订单号 / 包厢名 / 包厢编号 / 客户ID / 订单ID', () => {
    expect(matchesOrderKeyword(rows[0], 'o202609190001')).toBe(true)
    expect(matchesOrderKeyword(rows[0], 'k01')).toBe(true)
    expect(matchesOrderKeyword(rows[0], '77')).toBe(true)
    expect(matchesOrderKeyword(rows[0], '不存在')).toBe(false)
    expect(matchesOrderKeyword(rows[0], '   ')).toBe(true)
    expect(filterOrders(rows, { keyword: 'K02' }).map((row) => row.id)).toEqual([2])
  })

  it('状态 + 关键字叠加过滤', () => {
    expect(filterOrders(rows, { status: 'PENDING_PAYMENT', keyword: 'k02' }).map((row) => row.id)).toEqual([2])
    expect(filterOrders(rows, { status: 'DRAFT', keyword: 'k02' })).toEqual([])
  })

  it('按创建时间倒序（同刻按 id 倒序）', () => {
    expect(sortOrdersByCreatedAtDesc(rows).map((row) => row.id)).toEqual([2, 1, 3, 4])
    const sameTime = [
      { id: 10, createdAt: '2026-09-19T20:00:00' },
      { id: 11, createdAt: '2026-09-19T20:00:00' },
    ]
    expect(sortOrdersByCreatedAtDesc(sameTime).map((row) => row.id)).toEqual([11, 10])
  })
})

describe('订单管理汇总', () => {
  it('统计交易状态与在场订单数，并给出应收/已收合计（同币种）', () => {
    const summary = orderSummary(rows)
    expect(summary.total).toBe(4)
    expect(summary.active).toBe(1)
    expect(summary.waitingPayment).toBe(1)
    expect(summary.paid).toBe(0)
    expect(summary.completed).toBe(1)
    expect(summary.voided).toBe(1)
    expect(summary.payableAmount).toBe(74000)
    expect(summary.paidAmount).toBe(15000)
    expect(summary.currencyCode).toBe('CNY')
    expect(summary.mixedCurrency).toBe(false)
  })

  it('混币种不求和：currencyCode 为空且标记 mixedCurrency（禁止跨币种相加）', () => {
    const summary = orderSummary([
      { tradeStatus: 'DRAFT', totalAmount: 100, paidAmount: 0, currencyCode: 'CNY' },
      { tradeStatus: 'DRAFT', totalAmount: 200, paidAmount: 0, currencyCode: 'USD' },
    ])
    expect(summary.currencyCode).toBeNull()
    expect(summary.mixedCurrency).toBe(true)
  })

  /**
   * 汇总金额与列表行同口径：有服务端实时合计时用它（开台中金额随计费时长增长，
   * 库内合计是上一次刷新的快照）。否则会出现「行显示 70150、汇总显示 10150」。
   */
  it('汇总金额取服务端实时合计（缺字段才退回库内合计）', () => {
    const summary = orderSummary([
      { tradeStatus: 'DRAFT', totalAmount: 10150, liveTotalAmount: 70150, paidAmount: 0, currencyCode: 'CNY' },
      { tradeStatus: 'COMPLETED', totalAmount: 4000, paidAmount: 4000, currencyCode: 'CNY' },
    ])
    expect(summary.payableAmount).toBe(74150)
    expect(summary.paidAmount).toBe(4000)
    expect(orderLiveAmountOf({ totalAmount: 900 })).toBe(900)
    expect(orderLiveAmountOf({ totalAmount: 900, liveTotalAmount: 1500 })).toBe(1500)
    expect(orderLiveAmountOf(null)).toBe(0)
  })

  it('空列表与 null 安全', () => {
    expect(orderSummary(null).total).toBe(0)
    expect(orderSummary([]).currencyCode).toBeNull()
    expect(orderSummary([]).mixedCurrency).toBe(false)
  })
})

describe('在场与可取消判定', () => {
  it('在场看会话状态（待开台/开台中/挂单中）', () => {
    expect(isActiveOrder({ sessionStatus: 'RESERVED' })).toBe(true)
    expect(isActiveOrder({ sessionStatus: 'OPEN' })).toBe(true)
    expect(isActiveOrder({ sessionStatus: 'PAUSED' })).toBe(true)
    expect(isActiveOrder({ sessionStatus: 'CLOSED', tradeStatus: 'PENDING_PAYMENT' })).toBe(false)
    expect(isActiveOrder({ tradeStatus: 'DRAFT' })).toBe(true)
  })

  it('终态（已完成/已取消/已作废）不给取消入口', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'VOIDED']) {
      expect(`${status}:${canCancelOrder({ tradeStatus: status })}`).toBe(`${status}:false`)
    }
    for (const status of ['DRAFT', 'PENDING_PAYMENT', 'PAID']) {
      expect(`${status}:${canCancelOrder({ tradeStatus: status })}`).toBe(`${status}:true`)
    }
    // 旧后端：兼容列兜底（VOIDED 是审批作废，与取消分开）
    expect(canCancelOrder({ status: 'VOIDED' })).toBe(false)
    expect(canCancelOrder({ status: 'CANCELLED' })).toBe(false)
  })
})

describe('客户端分页', () => {
  it('按页切片并回传归一化页码', () => {
    const result = paginateOrders(rows, 2, 2)
    expect(result.rows.map((row) => row.id)).toEqual([3, 4])
    expect(result.total).toBe(4)
    expect(result.page).toBe(2)
  })

  it('页码越界回落到最后一页（筛选后页数变少的场景）', () => {
    const result = paginateOrders(rows, 9, 3)
    expect(result.page).toBe(2)
    expect(result.rows.map((row) => row.id)).toEqual([4])
  })

  it('非法页码/页大小按默认值兜底', () => {
    expect(paginateOrders(rows, 0, 0).page).toBe(1)
    expect(paginateOrders(rows, 1, 0).pageSize).toBe(20)
  })
})
