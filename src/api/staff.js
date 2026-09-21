import request from './request'

// —— 运营人员管理（platform-admin-service BFF）——

/**
 * 运营人员列表。
 *
 * @param {object} [params] 筛选参数原样透传；时间区间按创建时间统一 `from`/`to`（闭区间，见 `@/utils/dateRange`）
 */
export function listStaff(params) {
  return request.get('/api/v1/admin/staff', { params })
}

export function createStaff(data) {
  return request.post('/api/v1/admin/staff', data)
}

export function getStaffOptions() {
  return request.get('/api/v1/admin/staff/options')
}

export function updateStaffStatus(id, status) {
  return request.patch('/api/v1/admin/staff/' + id + '/status', { status })
}

export function bindStaffIm(id, imAccount) {
  return request.patch('/api/v1/admin/staff/' + id + '/im-binding', { imAccount })
}

/**
 * 解除运营人员的 IM 关联（幂等，未关联也返回成功）。
 *
 * 只清 saa_admin_account.im_account：登录账号与角色权限都保留，之后可以重新关联其它 IM 账号；
 * IM 账号已被删除（员工账号上还留着已失效的 IM 用户名）时也走这个入口清干净再重新关联。
 */
export function unbindStaffIm(id) {
  return request.delete('/api/v1/admin/staff/' + id + '/im-binding')
}

export function deleteStaff(id) {
  return request.delete('/api/v1/admin/staff/' + id)
}
