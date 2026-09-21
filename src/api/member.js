import request from './request'

// —— 客户管理（platform-customer-service；表名仍是 cst_member，业务口径是「客户」）——
export function listMembers(params) {
  return request.get('/api/v1/business/members', { params })
}
// 积分管理列表：客户 + 积分账户余额
export function listPointsAccounts(params) {
  return request.get('/api/v1/business/members/points', { params })
}
// 建档：accountId / imAccount 命中既有客户时服务端返回那条客户（幂等，不会生成重复客户）
export function createMember(data) {
  return request.post('/api/v1/business/members', data)
}
// 把客户绑定到 IM 账号；IM 账号已被其它客户占用时返回 409 IM_ACCOUNT_ALREADY_BOUND
export function bindMemberIm(id, data) {
  return request.put('/api/v1/business/members/' + id + '/im-binding', data)
}
// 姓名盲索引存量回填（权限 member.pii.view；tenantId 省略 = 当前租户）
export function rebuildMemberNameIndex(data) {
  return request.post('/api/v1/business/members/name-index/rebuild', data)
}
export function getMemberPoints(id, params) {
  return request.get('/api/v1/business/members/' + id + '/points', { params })
}
export function adjustPoints(id, data) {
  return request.post('/api/v1/business/members/' + id + '/points/adjust', data)
}
export function getMemberWallet(id) {
  return request.get('/api/v1/business/members/' + id + '/wallet')
}
// 储值管理列表：客户 + 储值余额（一次分页 + 一次批量余额查询；没有账户的客户余额 0 且 accountOpened=false）
export function listMemberWallets(params) {
  return request.get('/api/v1/business/members/wallets', { params })
}
// 客户储值流水（真实账本分页：充值/消费/退还/释放逐笔，含变动后余额）
export function getMemberWalletLedger(id, params) {
  return request.get('/api/v1/business/members/' + id + '/wallet/ledger', { params })
}
/**
 * 清理「无 IM 关联」的客户档案（垃圾数据）。
 *
 * 后端两道闸：有 IM 关联 → 409 `MEMBER_HAS_IM_BINDING`；有业务引用（订单/预约/储值/积分/券）
 * → 409 `MEMBER_HAS_REFERENCES`（提示里带引用类型与条数）。前端把中文原因原样展示，不自己编话术。
 */
export function purgeUnlinkedMember(id) {
  return request.post('/api/v1/business/members/' + id + '/purge-unlinked')
}