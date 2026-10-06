import request from './request'

// —— 收银/支付/交班/日结/退款（服务端按会话上下文授权）——

/**
 * 支付流水（pay_intent 口径）。
 *
 * @param {object} [params] 筛选参数原样透传；时间区间统一 `from`/`to`（闭区间，见 `@/utils/dateRange`）
 */
export function listPayments(params) {
  return request.get('/api/v1/business/payments', { params })
}

// 组合收款：POST /business/orders/{orderId}/collect，幂等键 Idempotency-Key
export function collect(orderId, data) {
  const operationKey = data?.idempotencyKey || collectKeys.get(orderId) || crypto.randomUUID()
  collectKeys.set(orderId, operationKey)
  return request.post('/api/v1/business/orders/' + orderId + '/collect', data, {
    headers: { 'Idempotency-Key': operationKey },
  }).then((result) => {
    collectKeys.delete(orderId)
    return result
  })
}

export function getOrderBill(orderId) {
  return request.get('/api/v1/business/orders/' + orderId + '/bill')
}

const collectKeys = new Map()

/**
 * 交班列表。
 *
 * @param {object} [params] 筛选参数原样透传；时间区间统一 `from`/`to`（闭区间，见 `@/utils/dateRange`）
 */
export function listShifts(params) {
  return request.get('/api/v1/business/shifts', { params })
}

export function openShift(data) {
  return request.post('/api/v1/business/shifts/open', data)
}

export function closeShift(id, data) {
  return request.post('/api/v1/business/shifts/' + id + '/close', data)
}

/**
 * 日结列表。
 *
 * @param {object} [params] 筛选参数原样透传；时间区间统一 `from`/`to`（闭区间，见 `@/utils/dateRange`）
 */
export function listDailyClosings(params) {
  return request.get('/api/v1/admin/daily-closings', { params })
}

export function submitDailyClosing(id, data) {
  return request.post('/api/v1/admin/daily-closings/' + id + '/submit', data)
}

export function listRefunds(params) {
  return request.get('/api/v1/business/refund-requests', { params })
}

export function requestRefund(data) {
  // 退款门店由当前租户/门店上下文固化；data.storeId 仅用于一致性校验。
  return request.post('/api/v1/business/refund-requests', data)
}

export function approveRefund(id, data) {
  return request.post('/api/v1/admin/refund-requests/' + id + '/approve', data)
}

export function rejectRefund(id, data) {
  return request.post('/api/v1/admin/refund-requests/' + id + '/reject', data)
}

export function markRefunded(id, data) {
  return request.post('/api/v1/admin/refund-requests/' + id + '/refund', data)
}

// —— 支付方式配置化（统一口径：B端收银 view=admin；C端支付 view=user）——
export function listPaymentMethods(view = 'admin') {
  return request.get('/api/v1/business/payment-methods', { params: { view } })
}
export function listPaymentMethodGrants(tenantId) {
  return request.get('/api/v1/admin/payment-methods/grants', { params: { tenantId } })
}
export function setPaymentMethodGrant(tenantId, method, granted) {
  return request.post('/api/v1/admin/payment-methods/grants', { tenantId, method, granted })
}
export function setPaymentMethodSwitch(tenantId, method, enabled) {
  return request.post('/api/v1/admin/payment-methods/switch', { tenantId, method, enabled })
}

// —— 储值充值/退还（品牌展示名取租户配置 wallet_brand_name）——
export function walletRecharge(customerId, data) {
  return request.post('/api/v1/admin/wallets/recharge', { customerId, ...data }, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
}
export function walletRefund(customerId, data) {
  return request.post('/api/v1/admin/wallets/refund', { customerId, ...data }, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
}
