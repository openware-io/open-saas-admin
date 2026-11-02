import request from './request'

/**
 * 门店管理 API（platform-tenant-service）。
 *
 * 契约口径见 `.outputs/architecture/STORE_CHANGE_APPROVAL_WORKFLOW.md`（rev3）：
 * **租户侧不保留任何直接写 `tnt_store` 的接口**。新增/编辑/停用/启用/关闭/删除一律先提交
 * 「门店变更申请」（PENDING），平台运营审批通过后由系统在同一事务内执行；因此本文件只保留：
 *  1. 只读：门店列表、建店默认值；
 *  2. 租户侧申请：提交 / 列表 / 详情 / 撤销；
 *  3. 平台侧审批：跨租户队列 / 详情 / 通过 / 驳回。
 *
 * 旧的直写端点（`POST/PUT/DELETE /admin/tenant/stores/**`、`PUT /{id}/logo`）已被后端删除，
 * 本文件刻意不再导出 `createStore / updateStore / updateStoreStatus / deleteStore / updateStoreLogo`
 * 之类的函数，页面也没有可绕过审批的写入口（`utils/storeChangeApprovalWiring.test.js` 做源码守卫）。
 */

const TENANT_STORES = '/api/v1/admin/tenant/stores'
const TENANT_CHANGE_REQUESTS = '/api/v1/admin/tenant/store-change-requests'
const PLATFORM_CHANGE_REQUESTS = '/api/v1/admin/platform/store-change-requests'

/** 当前租户门店列表（可选 status 过滤）。响应新增 `version`（申请制下作为 UPDATE/STATUS/DELETE 的 baseVersion）。 */
export function listStores(params) {
  return request.get(TENANT_STORES, { params })
}

/**
 * 新增门店表单的默认值：`{ timezone, locale, businessDayCutoff, defaultCurrency, businessTypes[], organizations[] }`。
 * 页面只用它回填表单，不写库；真正建店发生在平台审批通过后的 apply 阶段。
 */
export function getStoreCreateDefaults() {
  return request.get(`${TENANT_STORES}/create-defaults`)
}

// —— 租户侧：门店变更申请 ————————————————————————————————————————

/**
 * 提交门店变更申请。body：
 * `{ requestType, storeId?, payload?, baseVersion?, reason, idempotencyKey? }`
 * - CREATE：不带 storeId/baseVersion，payload 为建店字段；
 * - UPDATE：带 storeId + baseVersion，payload 只含变更字段；
 * - STATUS：带 storeId + baseVersion，payload = `{ targetStatus }`；
 * - DELETE：带 storeId + baseVersion，无 payload。
 */
export function submitStoreChangeRequest(data) {
  return request.post(TENANT_CHANGE_REQUESTS, data)
}

/** 本租户的变更申请列表（`?status=&storeId=&page=&pageSize=`），默认按创建时间倒序。 */
export function listStoreChangeRequests(params) {
  return request.get(TENANT_CHANGE_REQUESTS, { params })
}

/** 变更申请详情（含 diff / before / payload）。 */
export function getStoreChangeRequest(id) {
  return request.get(`${TENANT_CHANGE_REQUESTS}/${id}`)
}

/** 撤销 PENDING 申请（只能撤销本租户的申请）。 */
export function cancelStoreChangeRequest(id) {
  return request.post(`${TENANT_CHANGE_REQUESTS}/${id}/cancel`)
}

// —— 平台侧：门店审批队列（PLATFORM 工作区 + platform.store.change.approve）———

/** 跨租户审批队列（`?status=&tenantId=&requestType=&page=&pageSize=`），默认只查 PENDING。 */
export function listPlatformStoreChangeRequests(params) {
  return request.get(PLATFORM_CHANGE_REQUESTS, { params })
}

/** 平台审批详情：租户/门店名称、申请人、理由、before/after diff、payload。 */
export function getPlatformStoreChangeRequest(id) {
  return request.get(`${PLATFORM_CHANGE_REQUESTS}/${id}`)
}

/** 审批通过并执行 apply：body `{ comment }`（可选备注）。 */
export function approveStoreChangeRequest(id, comment) {
  return request.post(`${PLATFORM_CHANGE_REQUESTS}/${id}/approve`, { comment })
}

/** 驳回：body `{ comment }`（驳回理由必填，由页面与后端双重校验）。 */
export function rejectStoreChangeRequest(id, comment) {
  return request.post(`${PLATFORM_CHANGE_REQUESTS}/${id}/reject`, { comment })
}
