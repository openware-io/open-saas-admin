/**
 * 订单管理（后台列表）的**纯函数**实现：筛选、汇总、可取消判定、分页。
 *
 * 单独放在 utils 而不是页面里，是为了让「状态词表/取消口径/金额汇总」可以直接单测，
 * 也避免页面里再写一份与收银台（`views/tenant/orders.vue`）不一致的判断。
 *
 * **状态口径（领域重构后）**：订单主表只表达交易状态 `tradeStatus`，KTV 业务状态在
 * `sessionStatus`（`ord_ktv_session.status`）。本文件不再读取 `ord_order.status`（收口前的兼容列），
 * 判定一律委托 `constants/ktvOrderStatus.js`（与收银台/看板共用同一份口径）。
 *
 * 数据来源：`GET /api/v1/business/orders`（可选 `from`/`to` 闭区间，见 `utils/dateRange`），
 * 返回的是**当前租户**的订单数组；门店维度由调用方按会话门店过滤（与收银台同口径）。
 * 金额一律是**最小货币单位 + 单据币种快照**（`currencyCode`），不做任何跨币种相加。
 */

import {
  TRADE_STATUS_OPTIONS,
  isActiveOrder,
  canCancelOrder,
  orderTradeStatus,
} from '@/constants/ktvOrderStatus'

/** 订单交易状态筛选项（value = `ord_order.trade_status`，文案与 KTV 状态词表同源）。 */
export const ORDER_STATUS_OPTIONS = TRADE_STATUS_OPTIONS

/** 是否在场（会话占用包厢：待开台/开台中/挂单中）。 */
export { isActiveOrder }

/** 是否可取消：非终态才给入口（后端仍会兜底：已收款 409 先退款、已完成/已作废 409）。 */
export { canCancelOrder }

/** 关键字匹配：订单号 / 包厢名 / 包厢编号 / 客户 ID（空关键字恒命中）。 */
export function matchesOrderKeyword(order, keyword) {
  const text = typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''
  if (!text) return true
  return [order && order.orderNo, order && order.roomName, order && order.roomCode, order && order.customerId,
    order && order.id]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .some((value) => String(value).toLowerCase().includes(text))
}

/**
 * 客户端筛选（交易状态 + 关键字）。时间区间不在这里做：它由服务端按 `created_at` 过滤，
 * 避免前后端两套时间口径（见 `utils/dateRange` 的说明）。
 */
export function filterOrders(rows, { status, keyword } = {}) {
  const list = Array.isArray(rows) ? rows : []
  return list.filter((order) => {
    if (status && orderTradeStatus(order) !== status) return false
    return matchesOrderKeyword(order, keyword)
  })
}

/** 按创建时间倒序（同刻按 id 倒序，保证翻页稳定）。 */
export function sortOrdersByCreatedAtDesc(rows) {
  const list = Array.isArray(rows) ? rows : []
  return [...list].sort((a, b) => {
    const left = Date.parse((a && a.createdAt) || '') || 0
    const right = Date.parse((b && b.createdAt) || '') || 0
    if (left !== right) return right - left
    return (Number(b && b.id) || 0) - (Number(a && a.id) || 0)
  })
}

/**
 * 汇总：各交易状态计数 + 在场订单数 + 应收/已收合计。
 *
 * 键名沿用页面既有字段（active / waitingPayment / completed / voided）；`waitingSettlement` 保留为 0
 * 以兼容旧模板，新的「待收款」统一看 `waitingPayment`（tradeStatus=PENDING_PAYMENT，含原待结算+待支付）。
 *
 * 金额合计**只在全部命中行币种一致时**给出 `currencyCode`，混币种返回 `null`
 * （规范 16 §3：禁止跨币种相加；调用方拿不到币种时按「多币种」展示，不求和）。
 */
export function orderSummary(rows) {
  const list = Array.isArray(rows) ? rows : []
  const summary = {
    total: list.length,
    active: 0,
    completed: 0,
    voided: 0,
    waitingSettlement: 0,
    waitingPayment: 0,
    paid: 0,
    payableAmount: 0,
    paidAmount: 0,
    currencyCode: null,
    mixedCurrency: false,
  }
  const currencies = new Set()
  list.forEach((order) => {
    if (!order) return
    if (isActiveOrder(order)) summary.active += 1
    const trade = orderTradeStatus(order)
    if (trade === 'COMPLETED') summary.completed += 1
    if (trade === 'CANCELLED') summary.voided += 1
    if (trade === 'PENDING_PAYMENT') summary.waitingPayment += 1
    if (trade === 'PAID') summary.paid += 1
    // 消费金额一律取服务端**实时合计**（开台中＝明细 − 房费快照 + 实时房费）：与订单管理列表、
    // 收银台卡片、账单同一口径；旧后端没有 liveTotalAmount 时才退回库内合计。
    summary.payableAmount += orderLiveAmountOf(order)
    summary.paidAmount += Number(order.paidAmount) || 0
    const code = order.currencyCode ? String(order.currencyCode) : ''
    if (code) currencies.add(code)
  })
  if (currencies.size === 1) {
    summary.currencyCode = [...currencies][0]
  } else if (currencies.size > 1) {
    summary.mixedCurrency = true
  }
  return summary
}

/**
 * 单据展示金额：优先服务端**实时合计** {@code liveTotalAmount}（开台中＝明细 − 房费明细快照 + 实时房费，
 * 与账单/收银台同一套差额法），旧后端没有该字段时才退回库内 {@code totalAmount}。
 * 前端绝不把 {@code roomEstimatedFee} 加上去——那正是「包厢费算两遍」的历史缺陷。
 */
export function orderLiveAmountOf(order) {
  if (!order) return 0
  const live = Number(order.liveTotalAmount)
  if (order.liveTotalAmount != null && Number.isFinite(live)) return live
  return Number(order.totalAmount) || 0
}

/** 客户端分页：越界页回落到最后一页（筛选变化后页码可能超出范围）。 */
export function paginateOrders(rows, page = 1, pageSize = 20) {
  const list = Array.isArray(rows) ? rows : []
  const size = Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 20
  const lastPage = Math.max(1, Math.ceil(list.length / size))
  const current = Math.min(Math.max(1, Math.floor(Number(page) || 1)), lastPage)
  const start = (current - 1) * size
  return { rows: list.slice(start, start + size), page: current, pageSize: size, total: list.length }
}
