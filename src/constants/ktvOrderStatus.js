/**
 * KTV 订单状态词表与动作判定（领域重构目标契约 ORDER_ROOM_INVENTORY_TARGET §2/§4）。
 *
 * 为什么要独立于 `constants/terms.js`：订单主表只表达交易状态（`tradeStatus`），KTV 业务状态在
 * `sessionStatus`（`ord_ktv_session.status`），结算进度由后端派生为 `settlementStatus`。三个字段各有
 * 自己的词表与动作口径，混进通用 terms 会和酒店/支付的状态词互相干扰。
 *
 * 数据来源：`GET /api/v1/business/orders`（OrderView），KTV 订单现在同时返回：
 *   - `tradeStatus`：DRAFT / PENDING_PAYMENT / PAID / COMPLETED / CANCELLED
 *   - `refundStatus`：NONE / PARTIAL / FULL
 *   - `sessionStatus`：RESERVED / OPEN / PAUSED / CLOSED / CANCELLED
 *   - `settlementStatus`：UNSETTLED / PENDING_PAYMENT / PAID / COMPLETED / CANCELLED /
 *                        REFUNDED / PARTIALLY_REFUNDED
 *
 * `order.status` 只是收口前的兼容列（后端最终迁移会删掉），本文件只在**旧后端/历史缓存**缺新字段时
 * 由它兜底推导，页面不得直接用它做业务判断。
 */

/** 交易状态（订单主表）。CANCELLED=用户取消；VOIDED=审批作废/冲正（报表独立统计，不与取消混算）。 */
export const TRADE_STATUS_TEXT = Object.freeze({
  DRAFT: '开台中',
  PENDING_PAYMENT: '待收款',
  PAID: '已收款',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  VOIDED: '已作废',
})

/** 订单管理页的交易状态筛选项（value 传给客户端过滤，文案与词表同源）。 */
export const TRADE_STATUS_OPTIONS = Object.freeze(
  Object.keys(TRADE_STATUS_TEXT).map((value) => ({ value, label: TRADE_STATUS_TEXT[value] })),
)

/** KTV 会话状态（`ord_ktv_session.status`）：KTV 业务状态的唯一事实来源。 */
export const KTV_SESSION_STATUS_TEXT = Object.freeze({
  RESERVED: '待开台',
  OPEN: '开台中',
  PAUSED: '挂单中',
  CLOSED: '已结台',
  CANCELLED: '已取消',
})

/** 结算派生状态（后端由 tradeStatus + refundStatus 推出，不落列）。 */
export const SETTLEMENT_STATUS_TEXT = Object.freeze({
  UNSETTLED: '未结算',
  PENDING_PAYMENT: '待收款',
  PAID: '已收款',
  COMPLETED: '已结算',
  CANCELLED: '已取消',
  VOIDED: '已作废',
  REFUNDED: '已退款',
  PARTIALLY_REFUNDED: '部分退款',
})

/** 订单退款状态（`ord_order.refund_status`，与 pay_refund.status 的审批态不是同一套枚举）。 */
export const REFUND_STATUS_TEXT = Object.freeze({
  NONE: '未退款',
  PARTIAL: '部分退款',
  FULL: '已全额退款',
})

/** 枚举没有映射时的唯一回落：不把英文枚举原文透到界面上。 */
function unknownEnumText(value) {
  if (value === null || value === undefined || value === '') return '—'
  return `未知（${String(value).trim()}）`
}

export function tradeStatusText(status) {
  if (!status) return '—'
  return TRADE_STATUS_TEXT[status] || unknownEnumText(status)
}

export function ktvSessionStatusText(status) {
  if (!status) return '—'
  return KTV_SESSION_STATUS_TEXT[status] || unknownEnumText(status)
}

export function settlementStatusText(status) {
  if (!status) return '—'
  return SETTLEMENT_STATUS_TEXT[status] || unknownEnumText(status)
}

/** 订单退款状态文案（NONE/PARTIAL/FULL）；与支付域退款审批态（PENDING/APPROVED/…）不是同一枚举。 */
export function orderRefundStatusText(status) {
  if (!status) return '—'
  return REFUND_STATUS_TEXT[status] || unknownEnumText(status)
}

/** 旧 `ord_order.status` → 交易状态（只用于旧后端/历史行兜底，不参与新写入）。 */
export function tradeStatusFromLegacy(legacyStatus) {
  switch (legacyStatus) {
    case 'COMPLETED':
    case 'REFUNDED':
    case 'PARTIAL_REFUNDED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'VOIDED':
      return 'VOIDED'
    case 'WAITING_SETTLEMENT':
    case 'WAITING_PAYMENT':
      return 'PENDING_PAYMENT'
    case 'PAID':
      return 'PAID'
    default:
      // DRAFT / SERVING / WAITING_ARRIVAL / 空 = 已建单未结算
      return 'DRAFT'
  }
}

/** 订单交易状态（优先服务端新字段，缺字段时按兼容列推导）。 */
export function orderTradeStatus(order) {
  if (!order) return ''
  return order.tradeStatus || tradeStatusFromLegacy(order.status)
}

/** 订单会话状态（无会话返回空串：非 KTV 单/未选包厢）。 */
export function orderSessionStatus(order) {
  return (order && order.sessionStatus) || ''
}

/** 结算派生状态（缺字段时按交易状态 + 退款状态本地推导，仅兜底）。 */
export function orderSettlementStatus(order) {
  if (!order) return ''
  if (order.settlementStatus) return order.settlementStatus
  if (order.refundStatus === 'FULL') return 'REFUNDED'
  if (order.refundStatus === 'PARTIAL') return 'PARTIALLY_REFUNDED'
  return orderTradeStatus(order)
}

/** 是否交易终态（已完成/已取消/已作废）。 */
export function isTerminalOrder(order) {
  const trade = orderTradeStatus(order)
  return trade === 'COMPLETED' || trade === 'CANCELLED' || trade === 'VOIDED'
}

/** 是否在场（会话占用包厢：待开台/开台中/挂单中）。 */
export function isActiveOrder(order) {
  const session = orderSessionStatus(order)
  if (session) return session === 'RESERVED' || session === 'OPEN' || session === 'PAUSED'
  // 无会话信息的旧数据：未结算即视为在场
  return orderTradeStatus(order) === 'DRAFT'
}

/** 是否待收款（已结台/已结算但未全额收款）。 */
export function isCheckoutOrder(order) {
  return orderTradeStatus(order) === 'PENDING_PAYMENT'
}

/** 是否已全额收款（尚未关单或已关单）。 */
export function isPaidOrder(order) {
  const trade = orderTradeStatus(order)
  return trade === 'PAID' || trade === 'COMPLETED'
}

/** 是否可加项/点单：只有开台中（未进入结算）的订单。 */
export function canAddItems(order) {
  return orderTradeStatus(order) === 'DRAFT'
}

/** 是否可确认（加项完成、进入结算）：DRAFT 且没有开台中的会话（结台会由会话流程自动推进）。 */
export function canConfirmOrder(order) {
  return orderTradeStatus(order) === 'DRAFT' && !orderSessionStatus(order)
}

/** 是否可结台：会话 OPEN/PAUSED。 */
export function canCloseSession(order) {
  const session = orderSessionStatus(order)
  return session === 'OPEN' || session === 'PAUSED'
}

/** 是否可结算：已结台且交易状态仍是待收款（结台即结算会跳过这一步，仅待确认加项场景需要）。 */
export function canSettleOrder(order) {
  return orderTradeStatus(order) === 'PENDING_PAYMENT' && orderSessionStatus(order) === 'CLOSED'
}

/** 是否可收银：待收款且仍有未收金额。 */
export function canCollectOrder(order) {
  if (!order || orderTradeStatus(order) !== 'PENDING_PAYMENT') return false
  const total = Number(order.liveTotalAmount != null ? order.liveTotalAmount : order.totalAmount) || 0
  const paid = Number(order.paidAmount) || 0
  return total - paid > 0
}

/** 是否可取消/作废：未进入终态；已收款订单后端会以「先退款」409 兜底。 */
export function canCancelOrder(order) {
  return !isTerminalOrder(order)
}

/** 是否可作废（与取消同一状态口径，审批规则由后端判定）。 */
export function canVoidOrder(order) {
  return canCancelOrder(order) && orderTradeStatus(order) !== 'PAID'
}

/** 状态标签色（KTV 看板/列表/详情共用）。 */
export function orderStatusTagType(order) {
  const session = orderSessionStatus(order)
  if (session === 'OPEN' || session === 'PAUSED') return 'primary'
  if (session === 'RESERVED') return 'info'
  const trade = orderTradeStatus(order)
  if (trade === 'PAID' || trade === 'COMPLETED') return 'success'
  if (trade === 'CANCELLED' || trade === 'VOIDED') return 'info'
  return 'warning'
}

/**
 * 列表「状态」列的统一文案：优先显示会话状态（KTV 业务阶段），已结台/无会话再看交易状态。
 * 例：OPEN → 开台中；PAUSED → 挂单中；CLOSED + PENDING_PAYMENT → 待收款；COMPLETED → 已完成。
 */
export function orderDisplayStatusText(order) {
  const session = orderSessionStatus(order)
  if (session === 'OPEN') return '开台中'
  if (session === 'PAUSED') return '挂单中'
  if (session === 'RESERVED') return '待开台'
  if (session === 'CANCELLED') return '已取消'
  return tradeStatusText(orderTradeStatus(order))
}
