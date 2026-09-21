import request from './request'

// —— 租户上下文选择 BFF（platform-admin-service，TENANT 后台）——

// 当前账号可访问的经营上下文（tenantId:organizationId:storeId）
export function getContexts() {
  return request.get('/api/v1/admin/contexts')
}

// 选择上下文 → 服务端写入当前会话，响应仅供界面展示。
export function selectContext(contextId) {
  return request.post('/api/v1/admin/context/select', { contextId })
}
