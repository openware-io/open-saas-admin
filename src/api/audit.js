import request from './request'

// —— 审计日志（平台 / 租户只读查询）———————————————————————————————
// 后端契约（平台侧并行开发，以 common-audit-service 的 AuditController 为准）：
//   GET /api/v1/admin/audits?page=&pageSize=&tenantId=&organizationId=&storeId=&operatorId=&operatorKeyword=
//        &action=&actionPrefix=&resourceType=&resourceId=&result=&operatorType=&requestId=&traceId=
//        &from=&to=&fromAt=&toAt=&occurredFrom=&occurredTo=&order=&skipCount=
//     → { scope, effectiveTenantId, page, pageSize, total, totalPages, totalCapped, retentionFloor,
//         items: [{ id, tenantId, tenantName, organizationId, storeId, operatorId, operatorName, operatorType,
//                   action, actionLabel, resourceType, resourceId, resourceName, result, errorCode, ip,
//                   userAgent, requestId, traceId, sourceService, detailJson, occurredAt, createdAt }] }
//
// 时间区间口径（与全仓其它列表统一）：**from/to 优先**，闭区间；日期形态的 to 由后端收口到当天末尾
// （审计仓储是 [from, to)，后端把 to 换算成次日 00:00:00）。fromAt/toAt 与 occurredFrom/occurredTo
// 是既有别名、优先级更低，仅为兼容旧调用方保留。
//   GET /api/v1/admin/audits/{id}      → 单条详情（同上字段）
//   GET /api/v1/admin/audits/actions   → { items: [{ code, label }], total }  动作码字典（筛选下拉用）
//
// 总数语义（审计表是大表，COUNT 是列表接口的主要成本）：
//   * skipCount=true（第 2 页起）→ 后端跳过统计并回 total=-1，前端沿用上一页总数；
//   * totalCapped=true → 统计到达后端上界，total 只是下限，界面显示「仅统计到 N 条」。
//
// 保留策略：retentionFloor 非空时，早于它的月份已归档并移出可查范围（列表左边界被后端收敛）；
// 界面必须提示，否则运营会把「查不到」误解成「没有记录」。
//
// 字段可能缺失（平台与前端并行开发）：容错与展示口径统一在 utils/audit.js，页面不因缺字段报错。

/** 审计列表；筛选项全部可选，空值不会下发（由 utils/audit.js 的 buildAuditQuery 处理）。 */
export function listAudits(params) {
  return request.get('/api/v1/admin/audits', { params })
}

/** 单条审计详情（列表已带 detailJson 时作为补齐）。 */
export function getAudit(id) {
  return request.get('/api/v1/admin/audits/' + id)
}

/** 动作码字典（已接入的动作与中文标签）；接口未上线时页面用本地兜底词表。 */
export function listAuditActions() {
  return request.get('/api/v1/admin/audits/actions')
}

