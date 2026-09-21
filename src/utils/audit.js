import {
  auditActionText,
  auditOperatorTypeText,
  auditResourceTypeText,
  auditResultText,
  auditResultType,
} from '@/constants/terms'
import { formatTime } from './format'

/**
 * 审计日志列表 / 详情的展示口径唯一出处（纯函数，便于单测）。
 *
 * 后端契约（平台侧并行开发）：
 *   GET /api/v1/admin/audits?page=&pageSize=&from=&to=&operatorKeyword=&action=&resourceType=&resourceId=&result=&tenantId=
 *   `{ items: [{ id, createdAt, tenantId, tenantName, operatorId, operatorName, operatorType, action, actionLabel,
 *                resourceType, resourceId, resourceName, result, errorCode, ip, userAgent, requestId, detailJson }],
 *      total, page, pageSize }`
 *
 * 约束：
 *  - 字段缺失一律容错（不抛错、不显示 undefined/null），操作列缺 actionLabel 时回落 action 词表；
 *  - 结果 tag 类型与文案统一走 constants/terms 的 AUDIT_RESULT_TEXT / AUDIT_RESULT_TYPE；
 *  - detailJson 只做「格式化 + 脱敏」展示，绝不把原始 JSON 字符串塞进页面；
 *  - 租户列只在平台视角展示（视图层用 shouldShowTenantColumn 决定，接口仍由后端做越权拦截）。
 */

/** 分页尺寸与其它后台页面保持一致。 */
export const AUDIT_PAGE_SIZES = [10, 20, 50]

function text(value) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value)
}

/**
 * 列表响应容错：items / records / list / rows 都收，total 缺失时退回当前页条数。
 *
 * <p>总数语义（配合后端 `skipCount` 与 countCap）：
 *  - `totalSkipped=true`（后端回 `total=-1`）：本次按约定没统计总数，调用方必须沿用上一次的 total；
 *  - `totalCapped=true`：匹配行数到达后端统计上界，total 只是下限，界面应显示「N+」。
 *
 * <p>`retentionFloor`（保留策略回执）：早于它的月份已登记归档、移出可查范围（数据仍在库里）。
 * 界面必须提示，否则运营会把「查不到」误解成「没有记录」。
 *
 * @returns {{ items: object[], total: number, page: number, pageSize: number,
 *             totalSkipped: boolean, totalCapped: boolean, retentionFloor: string|null }}
 */
export function parseAuditListResponse(data) {
  const items = Array.isArray(data)
    ? data
    : (data && (data.items || data.records || data.list || data.rows)) || []
  const list = Array.isArray(items) ? items : []
  const rawTotal = Number(data && data.total != null ? data.total : (data && data.totalCount))
  const totalSkipped = rawTotal === -1
  const total = Number.isFinite(rawTotal) && !totalSkipped ? rawTotal : list.length
  const floor = data && data.retentionFloor
  return {
    items: list,
    total,
    totalSkipped,
    totalCapped: Boolean(data && data.totalCapped),
    retentionFloor: typeof floor === 'string' && floor.trim() ? floor.trim() : null,
    page: Number(data && data.page) || 1,
    pageSize: Number(data && data.pageSize) || AUDIT_PAGE_SIZES[0],
  }
}

/** 查询参数：空值不下发（空串会被后端当成真实筛选条件，导致「筛不到数据」）。 */
export function buildAuditQuery(form = {}) {
  const params = {}
  const assign = (key, value) => {
    if (value === null || value === undefined || value === '') return
    if (typeof value === 'string' && !value.trim()) return
    params[key] = typeof value === 'string' ? value.trim() : value
  }
  assign('page', form.page)
  assign('pageSize', form.pageSize)
  // skipCount：第 2 页起为真，让后端跳过 COUNT（审计表高频写入，列表接口的主要成本就是它）。
  // 后端回 total=-1，前端沿用上一页总数；筛选条件变化时必须重新统计，所以只在翻页时下发。
  if (form.skipCount === true) params.skipCount = true
  assign('tenantId', form.tenantId)
  assign('operatorKeyword', form.operatorKeyword)
  assign('action', form.action)
  assign('resourceType', form.resourceType)
  assign('resourceId', form.resourceId)
  // result 只允许 SUCCESS / FAILURE（后端 AuditQueryRequest 强校验，其它值 400）；
  // 历史拼写（FAILED/DENIED）在展示层兼容，但不下发。
  assign('result', form.result)
  // 时间区间：后端统一口径是 from/to（闭区间；日期形态的 to 由后端收口到当天末尾）。
  // 审计仓储内部按 [from, to) 过滤，后端把 to 换算成「次日 00:00:00」，
  // 因此「查到 9-30 为止」不会漏掉当天最后一毫秒。
  // fromAt/toAt 与 occurredFrom/occurredTo 是既有别名，优先级**低于** from/to，继续下发只为兼容旧调用方
  // （两者取值总是一致，不会产生歧义）。
  assign('fromAt', form.fromAt ?? form.from)
  assign('toAt', form.toAt ?? form.to)
  assign('from', form.fromAt ?? form.from)
  assign('to', form.toAt ?? form.to)
  return params
}

/** 租户列只在平台视角展示；租户视角由后端按会话上下文过滤，不需要这一列。 */
export function shouldShowTenantColumn(scope) {
  return scope === 'PLATFORM'
}

/** 资源展示：类型 · 名称（无名称退 resourceId，都没有退占位）。 */
export function auditResourceText(row) {
  const type = text(row && row.resourceType) ? auditResourceTypeText(row.resourceType) : ''
  const name = text(row && row.resourceName)
  const identity = name || (text(row && row.resourceId) ? `#${row.resourceId}` : '')
  if (type && identity) return `${type} · ${identity}`
  return type || identity || '—'
}

/** 操作人展示：姓名 → 账号 → #ID，都缺失给占位。 */
export function auditOperatorText(row) {
  const name = text(row && row.operatorName)
  if (name) return name
  const account = text(row && row.operatorAccount)
  if (account) return account
  const id = text(row && row.operatorId)
  return id ? `#${id}` : '—'
}

/**
 * 行 → 展示模型：所有字段都做了缺失兜底，页面只读展示模型。
 * @param {object} row 后端返回的审计记录
 */
export function normalizeAuditRow(row) {
  const source = row || {}
  const action = text(source.action)
  const actionLabel = text(source.actionLabel)
  const tenantName = text(source.tenantName)
  const tenantId = text(source.tenantId)
  // 时间列口径：优先 createdAt（落库时间，契约字段），后端补了业务发生时间 occurredAt 时作为兼容。
  const time = source.createdAt ?? source.created_at ?? source.occurredAt ?? source.occurred_at ?? null
  return {
    id: source.id ?? source.auditId ?? null,
    createdAt: time,
    createdAtText: formatTime(time),
    tenantId: tenantId || null,
    tenantName: tenantName || null,
    tenantText: tenantName || (tenantId ? `#${tenantId}` : '—'),
    operatorId: source.operatorId ?? null,
    operatorType: text(source.operatorType) || null,
    operatorTypeText: text(source.operatorType) ? auditOperatorTypeText(source.operatorType) : '',
    operatorText: auditOperatorText(source),
    action: action || null,
    actionLabel: actionLabel || null,
    // 有中文 actionLabel 用中文；没有则按动作码推导；都没有才回落「未知（CODE）」。
    actionText: auditActionText(action, actionLabel),
    resourceType: text(source.resourceType) || null,
    resourceId: text(source.resourceId) || null,
    resourceName: text(source.resourceName) || null,
    resourceText: auditResourceText(source),
    result: text(source.result) || null,
    resultText: auditResultText(text(source.result) || null),
    resultType: auditResultType(text(source.result) || null),
    errorCode: text(source.errorCode) || null,
    ipText: text(source.ip) || '—',
    userAgentText: text(source.userAgent) || '—',
    requestIdText: text(source.requestId) || '—',
    traceId: text(source.traceId) || null,
    sourceService: text(source.sourceService) || null,
    detailJson: source.detailJson ?? source.detail_json ?? null,
  }
}

// —— detailJson：格式化 + 脱敏 ————————————————————————————————————

/** 明细里常见的字段名 → 中文标签；没登记的字段保留后端原名（便于与后端契约对照）。 */
export const AUDIT_DETAIL_LABEL_TEXT = {
  id: 'ID',
  tenantId: '租户 ID',
  tenantName: '租户',
  storeId: '门店 ID',
  storeName: '门店',
  operatorId: '操作人 ID',
  operatorName: '操作人',
  operatorType: '操作人类型',
  accountId: '账号 ID',
  action: '操作',
  actionLabel: '操作名称',
  resourceType: '资源类型',
  resourceId: '资源 ID',
  resourceName: '资源名称',
  result: '结果',
  errorCode: '错误码',
  ip: 'IP',
  userAgent: '客户端',
  requestId: '请求 ID',
  idempotencyKey: '幂等键',
  reason: '原因',
  remark: '备注',
  before: '变更前',
  after: '变更后',
  orderId: '订单 ID',
  orderNo: '订单号',
  productId: '商品 ID',
  productCode: '商品编码',
  quantity: '数量',
  count: '数量',
  status: '状态',
  detail: '明细',
}

const SENSITIVE_SECRET_KEY = /(password|passwd|pwd|secret|token|credential|authorization|cookie|sessionkey|apikey|api_key|privatekey)/i
const SENSITIVE_PHONE_KEY = /(phone|mobile|telephone)/i
const SENSITIVE_EMAIL_KEY = /(email|mail)/i
const SENSITIVE_ID_KEY = /(idcard|id_card|identity|bankcard|bank_card|cardno|card_no)/i

const MAX_DETAIL_DEPTH = 3
const MAX_DETAIL_ENTRIES = 60
const MAX_ARRAY_ITEMS = 20
const MAX_VALUE_LENGTH = 200

function lastKeySegment(key) {
  return String(key).split('.').pop().replace(/\[\d+\]$/, '')
}

/** 明细标签：登记过用中文，没登记保留后端字段名。 */
export function auditDetailLabel(key) {
  const leaf = lastKeySegment(key)
  if (AUDIT_DETAIL_LABEL_TEXT[leaf]) return AUDIT_DETAIL_LABEL_TEXT[leaf]
  // 数组/嵌套字段：保留完整路径，便于定位后端契约。
  return key
}

/** 脱敏：密码/令牌整值打码，手机号/邮箱/证件号保留可辨识片段，其余超长截断。 */
export function maskAuditDetailValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  const raw = typeof value === 'string' ? value : String(value)
  if (SENSITIVE_SECRET_KEY.test(key)) return '***'
  if (SENSITIVE_PHONE_KEY.test(key)) {
    return raw.length >= 7 ? raw.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2') : '***'
  }
  if (SENSITIVE_EMAIL_KEY.test(key)) {
    const [name, domain] = raw.split('@')
    if (!domain) return '***'
    return `${name.slice(0, 1) || '*'}***@${domain}`
  }
  if (SENSITIVE_ID_KEY.test(key)) {
    return raw.length > 4 ? `${raw.slice(0, 2)}****${raw.slice(-2)}` : '***'
  }
  return raw.length > MAX_VALUE_LENGTH ? `${raw.slice(0, MAX_VALUE_LENGTH)}…` : raw
}

/** 明细标量展示：审计已知枚举按统一词表转中文，其余脱敏后原样展示。 */
function displayDetailScalar(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  const leaf = lastKeySegment(key)
  const raw = typeof value === 'string' ? value : String(value)
  // 先走脱敏：`status` 之类的键不会命中敏感词，不影响下面的枚举映射。
  if (SENSITIVE_SECRET_KEY.test(key)) return maskAuditDetailValue(key, value)
  if (leaf === 'result') return auditResultText(raw)
  if (leaf === 'action') return auditActionText(raw)
  if (leaf === 'resourceType') return auditResourceTypeText(raw)
  if (leaf === 'operatorType') return auditOperatorTypeText(raw)
  return maskAuditDetailValue(key, value)
}

/** detailJson 可能是对象、JSON 字符串或空；解析失败返回 ok:false（页面隐藏原始内容）。 */
export function parseAuditDetail(detailJson) {
  if (detailJson === null || detailJson === undefined || detailJson === '') return { ok: true, value: null }
  if (typeof detailJson === 'object') return { ok: true, value: detailJson }
  const raw = String(detailJson).trim()
  if (!raw) return { ok: true, value: null }
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false, value: null }
  }
}

function collectDetailEntries(value, prefix, depth, entries) {
  if (entries.length >= MAX_DETAIL_ENTRIES) return
  const isObject = value !== null && typeof value === 'object'
  if (!isObject) {
    // 顶层就是标量（detailJson 形如 "abc"）：也要展示出来，不能静默丢数据。
    const key = prefix || 'detail'
    entries.push({ key, label: auditDetailLabel(key), value: displayDetailScalar(key, value) })
    return
  }
  if (depth >= MAX_DETAIL_DEPTH) {
    entries.push({ key: prefix, label: auditDetailLabel(prefix), value: '（层级过深，已省略）' })
    return
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      entries.push({ key: prefix, label: auditDetailLabel(prefix || 'items'), value: '—' })
      return
    }
    const rest = value.length - MAX_ARRAY_ITEMS
    value.slice(0, MAX_ARRAY_ITEMS).forEach((item, index) => {
      collectDetailEntries(item, `${prefix}[${index}]`, depth + 1, entries)
    })
    if (rest > 0 && entries.length < MAX_DETAIL_ENTRIES) {
      entries.push({ key: prefix, label: auditDetailLabel(prefix), value: `…… 其余 ${rest} 项已省略` })
    }
    return
  }
  for (const [key, item] of Object.entries(value)) {
    collectDetailEntries(item, prefix ? `${prefix}.${key}` : key, depth + 1, entries)
  }
}

/**
 * detailJson → 可渲染的「字段 / 值」行（已脱敏、已限深限量）。
 * @returns {{ ok: boolean, entries: { key: string, label: string, value: string }[] }}
 *   ok:false 表示 detailJson 不是合法 JSON —— 页面必须隐藏原始内容，只提示无法解析。
 */
export function flattenAuditDetail(detailJson) {
  const parsed = parseAuditDetail(detailJson)
  if (!parsed.ok) return { ok: false, entries: [] }
  if (parsed.value === null) return { ok: true, entries: [] }
  const entries = []
  collectDetailEntries(parsed.value, '', 0, entries)
  return { ok: true, entries }
}
