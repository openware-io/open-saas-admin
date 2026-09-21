import request from './request'

// 后端列表：SaaS 管理后台下挂载的各业务后台（IM / 平台 / 租户）
export function getBackends() {
  return request.get('/api/v1/admin/backends')
}

// 按作用域拉取菜单树（PLATFORM 平台运营后台 / TENANT 租户后台）
export function getMenus(scope) {
  return request.get('/api/v1/admin/menus', { params: { scope } })
}

// IDaaS SSO 免二次登录：用门户透传的一次性 sso_ticket 换 SaaS 后台 token
export function ssoLogin(ticket) {
  return request.post('/api/v1/admin/auth/sso', { ticket })
}

// SaaS 后台账号密码登录（ttlHours：登录有效期小时数，默认 2，可选 24/168/720）
export function login(username, password, ttlHours) {
  return request.post('/api/v1/admin/auth/login', { username, password, ttlHours })
}

export function getSession() {
  return request.get('/api/v1/admin/auth/session')
}

export function logout() {
  return request.post('/api/v1/admin/auth/logout')
}

export function changePassword(data) {
  return request.post('/api/v1/admin/auth/password', data)
}

// 平台：租户列表（支付方式授权下拉等）
// params 透传：时间区间统一 from/to（按创建时间闭区间，见 @/utils/dateRange）；下拉调用不传即为不筛。
export function listTenants(params) {
  return request.get('/api/v1/admin/platform/tenants', { params })
}

// 平台：创建租户
export function createTenant(data) {
  return request.post('/api/v1/admin/platform/tenants', data)
}

// 脱敏权限管理（租户级安全：member.pii.view）
export function listMaskingRoles() {
  return request.get('/api/v1/admin/iam/masking')
}
export function toggleRolePermission(roleId, permissionCode, granted) {
  return request.post('/api/v1/admin/iam/roles/' + roleId + '/permissions/toggle', { permissionCode, granted })
}

// 租户钱包代币配置（名称 + 金额:代币比例）
export function getWalletTokenConfig(tenantId) {
  return request.get('/api/v1/admin/tenant/config', { params: { tenantId } })
}
export function updateWalletTokenConfig(data) {
  return request.put('/api/v1/admin/tenant/config', data)
}

/**
 * KTV 营业时间（门店级覆盖租户默认；缺省 18:00 – 次日 05:00）。
 *
 * 返回 `{storeId, openTime, closeTime, source, crossesMidnight, allDay, displayText}`；
 * `source` 说明该值来自门店配置（STORE）、租户默认（TENANT）还是代码缺省（DEFAULT）。
 * 预约「到店时间必须落在营业时段内」由服务端统一校验，本接口只提供同一份配置给界面展示/编辑。
 */
export function getBusinessHours(storeId) {
  return request.get('/api/v1/admin/tenant/business-hours', { params: { storeId } })
}
export function updateBusinessHours(data) {
  return request.put('/api/v1/admin/tenant/business-hours', data)
}
