import request from './request'

/** 租户已开通业务类型（总部业务组合与门店工作台的可见性来源）。 */
export function listBusinessEntitlements() {
  return request.get('/api/v1/admin/tenant/businesses')
}

export function enableBusiness(businessType) {
  return request.post(`/api/v1/admin/tenant/businesses/${encodeURIComponent(businessType)}/enable`)
}
