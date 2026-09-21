import request from './request'

// —— 门店管理（platform-tenant-service）——
export function listStores(params) {
  return request.get('/api/v1/admin/tenant/stores', { params })
}
