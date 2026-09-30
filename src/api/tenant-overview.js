import request from './request'

/** 租户总部实时经营总览；后端按当前签名租户上下文授权，不接受前端租户标识。 */
export function getTenantOverview(params) {
  return request.get('/api/v1/admin/tenant/overview', { params })
}
