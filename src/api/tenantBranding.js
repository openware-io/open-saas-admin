import request from './request'

export function getTenantBranding() {
  return request.get('/api/v1/admin/tenant/config/branding')
}

export function updateTenantBranding(logoUrl) {
  return request.put('/api/v1/admin/tenant/config/branding', { logoUrl })
}
