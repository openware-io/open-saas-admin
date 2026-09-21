import request from './request'

// —— 租户币种（platform-tenant-service，租户级唯一来源）——
// 接口一律取签名上下文租户，不接受 tenantId 参数；平台运营改别的租户 = 先切到目标租户上下文。

/** 读取当前租户币种：`{ currencyCode, symbol, minorUnitDigits, supported:[{code,symbol,label}] }`。 */
export function getTenantCurrency() {
  return request.get('/api/v1/admin/tenant/currency')
}

/** 修改当前租户币种（需权限 tenant.currency.manage），响应同 GET。 */
export function updateTenantCurrency(currencyCode) {
  return request.put('/api/v1/admin/tenant/currency', { currencyCode })
}
