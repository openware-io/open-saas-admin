import request from './request'

// —— 门店管理（platform-tenant-service）——
export function listStores(params) {
  return request.get('/api/v1/admin/tenant/stores', { params })
}

/** 替换门店 Logo；传空字符串恢复默认。 */
export function updateStoreLogo(id, logoUrl) {
  return request.put(`/api/v1/admin/tenant/stores/${id}/logo`, { logoUrl })
}
