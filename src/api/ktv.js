import request from './request'

// —— KTV 配置 BFF（platform-admin-service，租户后台）——

// 计价方案
export function getPricingPlans(params) {
  return request.get('/api/v1/admin/ktv/pricing-plans', { params })
}
export function createPricingPlan(data) {
  return request.post('/api/v1/admin/ktv/pricing-plans', data)
}
export function updatePricingPlan(id, data) {
  return request.put('/api/v1/admin/ktv/pricing-plans/' + id, data)
}

// 支付开关
export function getPaymentSwitches(params) {
  return request.get('/api/v1/admin/ktv/payment-switches', { params })
}
export function createPaymentSwitch(data) {
  return request.post('/api/v1/admin/ktv/payment-switches', data)
}
export function updatePaymentSwitch(id, data) {
  return request.put('/api/v1/admin/ktv/payment-switches/' + id, data)
}

// 服务人员
export function getServerCatalog(params) {
  return request.get('/api/v1/admin/ktv/server-catalog', { params })
}
export function createServerCatalogItem(data) {
  return request.post('/api/v1/admin/ktv/server-catalog', data)
}
export function updateServerCatalogItem(id, data) {
  return request.put('/api/v1/admin/ktv/server-catalog/' + id, data)
}

// 储值（代币，展示名取租户配置）不在 KTV 配置 BFF：储值是租户级资产，唯一入口是「储值管理」页
// （src/views/tenant/wallet.vue，直连 customer 域 /admin/wallets/* 与 /business/members/{id}/wallet[/ledger]）。
// 原先的 /admin/ktv/wallet-recharge 已随「充值」页签一并删除，避免同一功能两套入口。
