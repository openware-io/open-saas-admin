import { describe, expect, it } from 'vitest'
import {
  canAddItems,
  canCloseSession,
  canCollectOrder,
  canSettleOrder,
  isActiveOrder,
  isTerminalOrder,
  ktvSessionStatusText,
  orderDisplayStatusText,
  orderRefundStatusText,
  orderSettlementStatus,
  orderTradeStatus,
  settlementStatusText,
  tradeStatusFromLegacy,
  tradeStatusText,
} from './ktvOrderStatus'

/**
 * KTV 订单状态口径（目标契约 ORDER_ROOM_INVENTORY_TARGET §2/§4）：
 *  - 订单只表达 tradeStatus（DRAFT/PENDING_PAYMENT/PAID/COMPLETED/CANCELLED）；
 *  - KTV 业务状态在 sessionStatus（RESERVED/OPEN/PAUSED/CLOSED/CANCELLED）；
 *  - settlementStatus 由后端派生；前端不做状态推断，缺字段只按兼容列兜底。
 */
describe('KTV 状态词表', () => {
  it('交易/会话/结算状态都有中文文案，未知枚举不把英文透出', () => {
    expect(tradeStatusText('DRAFT')).toBe('开台中')
    expect(tradeStatusText('PENDING_PAYMENT')).toBe('待收款')
    expect(tradeStatusText('PAID')).toBe('已收款')
    expect(tradeStatusText('COMPLETED')).toBe('已完成')
    expect(tradeStatusText('CANCELLED')).toBe('已取消')
    expect(tradeStatusText('VOIDED')).toBe('已作废')
    expect(ktvSessionStatusText('OPEN')).toBe('开台中')
    expect(ktvSessionStatusText('PAUSED')).toBe('挂单中')
    expect(settlementStatusText('UNSETTLED')).toBe('未结算')
    expect(orderRefundStatusText('FULL')).toBe('已全额退款')
    expect(tradeStatusText('SOME_NEW_CODE')).toBe('未知（SOME_NEW_CODE）')
    expect(tradeStatusText('')).toBe('—')
  })

  it('旧 ord_order.status 只在缺新字段时兜底推导交易状态', () => {
    expect(tradeStatusFromLegacy('SERVING')).toBe('DRAFT')
    expect(tradeStatusFromLegacy('WAITING_SETTLEMENT')).toBe('PENDING_PAYMENT')
    expect(tradeStatusFromLegacy('WAITING_PAYMENT')).toBe('PENDING_PAYMENT')
    expect(tradeStatusFromLegacy('VOIDED')).toBe('VOIDED')
    expect(tradeStatusFromLegacy('CANCELLED')).toBe('CANCELLED')
    expect(tradeStatusFromLegacy('COMPLETED')).toBe('COMPLETED')
    expect(orderTradeStatus({ tradeStatus: 'PAID', status: 'VOIDED' })).toBe('PAID')
    expect(orderTradeStatus({ status: 'SERVING' })).toBe('DRAFT')
  })

  it('结算状态缺字段时按交易/退款状态兜底', () => {
    expect(orderSettlementStatus({ settlementStatus: 'PENDING_PAYMENT' })).toBe('PENDING_PAYMENT')
    expect(orderSettlementStatus({ tradeStatus: 'PAID' })).toBe('PAID')
    expect(orderSettlementStatus({ tradeStatus: 'COMPLETED', refundStatus: 'FULL' })).toBe('REFUNDED')
    expect(orderSettlementStatus({ tradeStatus: 'COMPLETED', refundStatus: 'PARTIAL' })).toBe('PARTIALLY_REFUNDED')
  })
})

describe('KTV 动作判定', () => {
  it('加项/确认只给未进入结算的订单', () => {
    expect(canAddItems({ tradeStatus: 'DRAFT' })).toBe(true)
    expect(canAddItems({ tradeStatus: 'PENDING_PAYMENT' })).toBe(false)
  })

  it('结台只看会话状态（OPEN/PAUSED）', () => {
    expect(canCloseSession({ sessionStatus: 'OPEN' })).toBe(true)
    expect(canCloseSession({ sessionStatus: 'PAUSED' })).toBe(true)
    expect(canCloseSession({ sessionStatus: 'CLOSED' })).toBe(false)
    expect(canCloseSession({ tradeStatus: 'DRAFT' })).toBe(false)
  })

  it('结算/收银都以交易状态为准', () => {
    expect(canSettleOrder({ tradeStatus: 'PENDING_PAYMENT', sessionStatus: 'CLOSED' })).toBe(true)
    expect(canSettleOrder({ tradeStatus: 'PENDING_PAYMENT', sessionStatus: 'OPEN' })).toBe(false)
    expect(canCollectOrder({ tradeStatus: 'PENDING_PAYMENT', totalAmount: 100, paidAmount: 0 })).toBe(true)
    expect(canCollectOrder({ tradeStatus: 'PENDING_PAYMENT', totalAmount: 100, paidAmount: 100 })).toBe(false)
    expect(canCollectOrder({ tradeStatus: 'COMPLETED', totalAmount: 100, paidAmount: 100 })).toBe(false)
  })

  it('在场与终态判定', () => {
    expect(isActiveOrder({ sessionStatus: 'RESERVED' })).toBe(true)
    expect(isActiveOrder({ sessionStatus: 'CLOSED', tradeStatus: 'COMPLETED' })).toBe(false)
    expect(isTerminalOrder({ tradeStatus: 'COMPLETED' })).toBe(true)
    expect(isTerminalOrder({ tradeStatus: 'CANCELLED' })).toBe(true)
    expect(isTerminalOrder({ tradeStatus: 'VOIDED' })).toBe(true)
    expect(isTerminalOrder({ tradeStatus: 'PENDING_PAYMENT' })).toBe(false)
  })
})

describe('列表展示状态', () => {
  it('优先展示会话业务状态，已结台/无会话回落到交易状态', () => {
    expect(orderDisplayStatusText({ sessionStatus: 'OPEN', tradeStatus: 'DRAFT' })).toBe('开台中')
    expect(orderDisplayStatusText({ sessionStatus: 'PAUSED', tradeStatus: 'DRAFT' })).toBe('挂单中')
    expect(orderDisplayStatusText({ sessionStatus: 'RESERVED', tradeStatus: 'DRAFT' })).toBe('待开台')
    expect(orderDisplayStatusText({ sessionStatus: 'CLOSED', tradeStatus: 'PENDING_PAYMENT' })).toBe('待收款')
    expect(orderDisplayStatusText({ tradeStatus: 'COMPLETED' })).toBe('已完成')
  })
})
