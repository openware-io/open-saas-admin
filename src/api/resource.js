import request from './request'

// —— 包厢/资源管理（platform-resource-service）——
export function listResources(params) {
  return request.get('/api/v1/admin/resources', { params })
}
export function createResource(data) {
  return request.post('/api/v1/admin/resources', data)
}
/** 编辑包厢：名称/容纳人数/图片/描述（编号与类型不可改，服务端同样拒绝这两项变更）。 */
export function updateResource(resourceId, data) {
  return request.put('/api/v1/admin/resources/' + resourceId, data)
}
/** 置包厢清洁状态：清洁中的包厢不可开台、不可预约（结台后自动进入，清洁完成置回空闲）。 */
export function setRoomCleaningStatus(resourceId, cleaning) {
  return request.put('/api/v1/business/resources/' + resourceId + '/cleaning-status', { cleaning })
}

// —— 房型字典（门店级，挂在 /admin/resources/types 下，复用 resource.manage 权限）——
// 金额字段（unitPrice/serverUnitPrice）是「最小货币单位/计费单位」，页面用主单位输入、提交前 yuanToFen。
// 图片字段（imageUrls/mainImageUrl）与包厢同一套规则：最多 9 张，主图必须属于列表；空数组 = 清空图片。
// 列表不带 storeId：服务端按运行上下文里的门店过滤（传别的门店会 403 STORE_SCOPE_DENIED）。
export function listResourceTypes(params) {
  return request.get('/api/v1/admin/resources/types', { params })
}
export function createResourceType(data) {
  return request.post('/api/v1/admin/resources/types', data)
}
/** 编辑房型：字段为 null 表示本次不修改；unitPrice/serverUnitPrice 传 0 表示清空（回退门店级单价）。 */
export function updateResourceType(id, data) {
  return request.put('/api/v1/admin/resources/types/' + id, data)
}
/** 删除房型：仍被包厢引用时服务端返回 409 ROOM_TYPE_IN_USE，需先把包厢改到其他房型。 */
export function deleteResourceType(id) {
  return request.delete('/api/v1/admin/resources/types/' + id)
}
