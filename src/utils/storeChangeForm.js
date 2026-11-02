import {
  STORE_CHANGE_ACTION_LABEL,
  STORE_CHANGE_FIELD_TEXT,
  STORE_CHANGE_REQUEST_STATUS_TEXT,
  STORE_CHANGE_REQUEST_STATUS_TYPE,
  STORE_CHANGE_REQUEST_TYPE_TEXT,
  STORE_CHANGE_VALIDATION_TEXT,
  businessTypeText,
  storeChangeActionText,
  storeChangeRequestStatusText,
  storeChangeRequestStatusType,
  storeChangeRequestTypeText,
  storeStatusText,
  organizationFallbackName,
  unknownEnumText,
} from '@/constants/terms'

/** 校验文案统一别名：页面 rules 与纯函数共用同一份，避免两处口径漂移。 */
const VALIDATION = STORE_CHANGE_VALIDATION_TEXT

/**
 * 门店变更申请（申请 → 审批 → 执行）的纯函数层。
 *
 * 契约见 `.outputs/architecture/STORE_CHANGE_APPROVAL_WORKFLOW.md` §6/§9：
 * 租户侧不再直写 `tnt_store`，新增/编辑/停用/启用/关闭/删除都先提交 `StoreChangeRequest`；
 * 平台运营审批通过后由系统执行。页面只做「展示 + 调用 API」，所有「表单默认值 / payload 构建 /
 * 字段校验 / 状态机 / diff 摘要 / 状态文案」收敛到本文件，便于单测（仓库无组件测试框架）。
 *
 * 文案唯一出处仍是 `constants/terms`：本文件只做「英文枚举 → 词表函数」的转发与业务组合，
 * 不新增用户可见中文（`terms.test.js` 会扫描）。
 */

/** 申请类型（与后端 `request_type` 一一对应）。 */
export const STORE_CHANGE_REQUEST_TYPES = Object.freeze(['CREATE', 'UPDATE', 'STATUS', 'DELETE'])

/** STATUS 申请允许的目标状态（DELETE 单独成申请类型，不在 STATUS 里）。 */
export const STORE_CHANGE_STATUS_TARGETS = Object.freeze(['ACTIVE', 'SUSPENDED', 'CLOSED'])

/** 门店状态机：ACTIVE ⇄ SUSPENDED；ACTIVE|SUSPENDED → CLOSED（CLOSED 终态，删除另走 DELETE 申请）。 */
export const STORE_STATUS_TRANSITIONS = Object.freeze({
  ACTIVE: Object.freeze(['SUSPENDED', 'CLOSED']),
  SUSPENDED: Object.freeze(['ACTIVE', 'CLOSED']),
  CLOSED: Object.freeze([]),
})

/** 门店编号规则：2–64 位，以字母/数字开头，允许字母数字与 `._-`（与后端唯一键口径一致）。 */
export const STORE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
export const STORE_NAME_MAX_LENGTH = 128
export const STORE_CHANGE_REASON_MAX_LENGTH = 512
export const CUTOFF_MIN = '00:00'
export const CUTOFF_MAX = '12:00'

const CUTOFF_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const EDITABLE_FIELDS = Object.freeze(['name', 'businessType', 'timezone', 'businessDayCutoff', 'organizationId', 'logoUrl', 'locale'])

/** 词表转发（页面统一从本文件取展示函数，避免各页自建英文枚举映射）。 */
export function requestTypeText(type) {
  return storeChangeRequestTypeText(type)
}
export function requestStatusText(status) {
  return storeChangeRequestStatusText(status)
}
export function requestStatusType(status) {
  return storeChangeRequestStatusType(status)
}
export function storeChangeActionLabelText(action) {
  return storeChangeActionText(action)
}
export function requestStatusOptions() {
  return Object.keys(STORE_CHANGE_REQUEST_STATUS_TEXT).map((value) => ({
    value,
    label: STORE_CHANGE_REQUEST_STATUS_TEXT[value],
  }))
}
export function requestTypeOptions() {
  return Object.keys(STORE_CHANGE_REQUEST_TYPE_TEXT).map((value) => ({
    value,
    label: STORE_CHANGE_REQUEST_TYPE_TEXT[value],
  }))
}

/** JSON 字符串 / null / 非对象容错成普通对象（`before/payload` 可能是 text 列回读的字符串）。 */
function toObject(value) {
  if (value === null || value === undefined || value === '') return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function trimmed(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

/** 营业日切点归一到 `HH:mm`（后端 `time` 列可能回读成 `04:00:00`）。 */
export function normalizeBusinessDayCutoff(value) {
  const text = trimmed(value)
  if (!text) return ''
  return text.slice(0, 5)
}

/** 时区必须是合法 IANA 时区（如 Asia/Shanghai）；偏移写法（+08:00 / Z）由服务端拒绝，前端先拦。 */
export function isValidTimezone(value) {
  const text = trimmed(value)
  if (!text) return false
  // 新版 ICU 会把 `+08:00` / `Z` 当成「偏移时区」接受，但后端 StoreTimeService 只认 IANA 名称，
  // 因此这里先按协议口径显式拒绝偏移写法，避免前端放行、后端 400。
  if (/^[+-]/.test(text) || /^(UTC|GMT)[+-]/i.test(text) || text === 'Z') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: text })
    return true
  } catch {
    return false
  }
}

export function isValidBusinessDayCutoff(value) {
  const text = normalizeBusinessDayCutoff(value)
  return CUTOFF_PATTERN.test(text) && text >= CUTOFF_MIN && text <= CUTOFF_MAX
}

/** 建店默认值归一：`businessTypes` / `organizations` 兼容字符串数组与 `{code,name}` / `{id,name}` 对象数组。 */
export function normalizeCreateDefaults(data) {
  const source = data && typeof data === 'object' ? data : {}
  const businessTypes = (Array.isArray(source.businessTypes) ? source.businessTypes : [])
    .map((item) => (typeof item === 'string' ? item : item?.code || item?.value || item?.businessType))
    .filter(Boolean)
  const organizations = (Array.isArray(source.organizations) ? source.organizations : [])
    .map((item) => {
      if (item === null || item === undefined) return null
      if (typeof item === 'object') {
        const id = Number(item.id ?? item.organizationId)
        if (!Number.isFinite(id)) return null
        return { id, name: trimmed(item.name) || organizationFallbackName(id) }
      }
      const id = Number(item)
      return Number.isFinite(id) ? { id, name: organizationFallbackName(id) } : null
    })
    .filter(Boolean)
  return {
    timezone: trimmed(source.timezone) || 'Asia/Shanghai',
    locale: trimmed(source.locale) || 'zh-CN',
    businessDayCutoff: normalizeBusinessDayCutoff(source.businessDayCutoff) || '04:00',
    defaultCurrency: trimmed(source.defaultCurrency),
    businessTypes: businessTypes.length ? businessTypes : ['KTV'],
    organizations,
  }
}

/**
 * 表单默认值。组织兜底 `0`（rev2：一期不开放组织选择，`0` = 未归属组织）；
 * 时区/语言/营业日切点取服务端 `create-defaults`，拿不到时用与后端一致的缺省值。
 */
export function emptyStoreChangeForm(defaults) {
  const normalized = normalizeCreateDefaults(defaults)
  return {
    code: '',
    name: '',
    businessType: normalized.businessTypes[0] || 'KTV',
    timezone: normalized.timezone,
    locale: normalized.locale,
    businessDayCutoff: normalized.businessDayCutoff,
    organizationId: 0,
    logoUrl: '',
  }
}

/**
 * 业态下拉兜底：`create-defaults` 失败时只有本地缺省 `KTV`，编辑 HOTEL 门店会看不到当前值；
 * 当前值不在候选里时补进选项（展示名仍由 `businessTypeText` 给出）。
 */
export function withCurrentOption(options, value) {
  const list = Array.isArray(options) ? options : []
  const text = trimmed(value)
  if (!text) return list
  return list.includes(text) ? list : [...list, text]
}

/** 组织下拉兜底：门店归属组织不在 `create-defaults` 候选里时补「组织 #ID」，避免下拉空标签。 */
export function organizationOptionsWithCurrent(organizations, organizationId) {
  const list = Array.isArray(organizations) ? organizations : []
  const id = Number(organizationId)
  if (!Number.isFinite(id) || id <= 0) return list
  if (list.some((org) => Number(org?.id) === id)) return list
  return [...list, { id, name: organizationFallbackName(id) }]
}

/** 编辑申请的回填：code 不可改（只读展示），其余可编辑字段按门店当前值回填。 */
export function storeChangeFormFromRow(row) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    code: trimmed(source.code),
    name: trimmed(source.name),
    businessType: trimmed(source.businessType),
    timezone: trimmed(source.timezone),
    locale: trimmed(source.locale),
    businessDayCutoff: normalizeBusinessDayCutoff(source.businessDayCutoff),
    organizationId: source.organizationId === null || source.organizationId === undefined
      ? 0
      : Number(source.organizationId),
    logoUrl: trimmed(source.logoUrl),
  }
}

/**
 * CREATE payload：只带服务端 `create-defaults` 白名单里的建店字段。
 * `status/tenantId/version` 由服务端决定，前端不得提交（否则会被 payload 白名单拒绝）。
 */
export function buildCreatePayload(form) {
  const source = form && typeof form === 'object' ? form : {}
  const payload = {
    code: trimmed(source.code),
    name: trimmed(source.name),
    businessType: trimmed(source.businessType),
    timezone: trimmed(source.timezone),
    locale: trimmed(source.locale),
    businessDayCutoff: normalizeBusinessDayCutoff(source.businessDayCutoff),
    organizationId: Number.isFinite(Number(source.organizationId)) ? Number(source.organizationId) : 0,
  }
  for (const key of ['countryCode', 'regionCode', 'logoUrl']) {
    const value = trimmed(source[key])
    if (value) payload[key] = value
  }
  return payload
}

function sameField(field, current, row) {
  if (field === 'businessDayCutoff') {
    return normalizeBusinessDayCutoff(current) === normalizeBusinessDayCutoff(row?.businessDayCutoff)
  }
  if (field === 'organizationId') {
    return Number(current ?? 0) === Number(row?.organizationId ?? 0)
  }
  return trimmed(current) === trimmed(row?.[field])
}

/**
 * UPDATE payload：只提交**发生变化的字段**（服务端据此生成 before/after diff 与摘要）。
 * `code` 不可改，不进入 payload；没有任何变化时返回 `null`（调用方拦下，不提交空申请）。
 */
export function buildUpdatePayload(form, row) {
  const source = form && typeof form === 'object' ? form : {}
  const payload = {}
  for (const field of EDITABLE_FIELDS) {
    if (sameField(field, source[field], row)) continue
    if (field === 'organizationId') {
      payload[field] = Number(source[field] ?? 0)
    } else if (field === 'businessDayCutoff') {
      payload[field] = normalizeBusinessDayCutoff(source[field])
    } else {
      payload[field] = trimmed(source[field])
    }
  }
  return Object.keys(payload).length ? payload : null
}

/** STATUS payload：目标状态（ACTIVE / SUSPENDED / CLOSED，删除另走 DELETE 申请）。 */
export function buildStatusPayload(targetStatus) {
  return { targetStatus: trimmed(targetStatus).toUpperCase() }
}

/**
 * 组装提交 body（`requestType` 决定字段形状）：
 * - CREATE：`{ requestType, payload, reason, idempotencyKey? }`
 * - UPDATE：`{ requestType, storeId, baseVersion, payload, reason, idempotencyKey? }`
 * - STATUS：`{ requestType, storeId, baseVersion, payload:{targetStatus}, reason, idempotencyKey? }`
 * - DELETE：`{ requestType, storeId, baseVersion, reason, idempotencyKey? }`（无 payload）
 */
export function buildChangeRequestBody({
  requestType,
  form,
  row,
  targetStatus,
  reason,
  idempotencyKey,
  baseVersion,
}) {
  const type = trimmed(requestType).toUpperCase()
  if (!STORE_CHANGE_REQUEST_TYPES.includes(type)) return null
  const body = { requestType: type, reason: trimmed(reason) }
  if (type === 'CREATE') {
    body.payload = buildCreatePayload(form)
  } else {
    const storeId = row?.id ?? null
    if (storeId !== null && storeId !== undefined) body.storeId = storeId
    const version = baseVersion !== undefined && baseVersion !== null ? baseVersion : row?.version
    if (version !== null && version !== undefined) body.baseVersion = Number(version)
    if (type === 'UPDATE') {
      const payload = buildUpdatePayload(form, row)
      if (payload) body.payload = payload
    } else if (type === 'STATUS') {
      body.payload = buildStatusPayload(targetStatus)
    }
  }
  const key = trimmed(idempotencyKey)
  if (key) body.idempotencyKey = key
  return body
}

/** 门店状态是否允许转移（前端预检；服务端仍会权威判定，非法 → 409）。 */
export function canTransitionStoreStatus(from, to) {
  const targets = STORE_STATUS_TRANSITIONS[trimmed(from).toUpperCase()] || []
  return targets.includes(trimmed(to).toUpperCase())
}

/** 校验表单字段（CREATE 与 UPDATE 复用）：返回第一条错误 `{ field, message }` 或 null。 */
function validateFormFields(form, { requireCode = false } = {}) {
  const source = form && typeof form === 'object' ? form : {}
  if (requireCode) {
    const code = trimmed(source.code)
    if (!code) return { field: 'code', message: VALIDATION.codeRequired }
    if (!STORE_CODE_PATTERN.test(code)) {
      return { field: 'code', message: VALIDATION.codePattern }
    }
  }
  const name = trimmed(source.name)
  if (!name) return { field: 'name', message: VALIDATION.nameRequired }
  if (name.length > STORE_NAME_MAX_LENGTH) {
    return { field: 'name', message: VALIDATION.nameTooLong }
  }
  if (!trimmed(source.businessType)) return { field: 'businessType', message: VALIDATION.businessTypeRequired }
  if (!trimmed(source.timezone)) return { field: 'timezone', message: VALIDATION.timezoneRequired }
  if (!isValidTimezone(source.timezone)) {
    return { field: 'timezone', message: VALIDATION.timezoneInvalid }
  }
  if (!trimmed(source.businessDayCutoff)) return { field: 'businessDayCutoff', message: VALIDATION.cutoffRequired }
  if (!isValidBusinessDayCutoff(source.businessDayCutoff)) {
    return { field: 'businessDayCutoff', message: VALIDATION.cutoffInvalid }
  }
  return null
}

/**
 * 提交前校验（唯一入口）：返回 `{ ok, field?, message? }`。
 * 理由必填是硬约束（`STORE_CHANGE_REASON_REQUIRED`），其余按申请类型分别校验。
 */
export function validateChangeRequest({ requestType, form, row, targetStatus, reason }) {
  const type = trimmed(requestType).toUpperCase()
  if (!STORE_CHANGE_REQUEST_TYPES.includes(type)) {
    return { ok: false, field: 'requestType', message: VALIDATION.typeUnsupported }
  }
  const reasonText = trimmed(reason)
  if (!reasonText) return { ok: false, field: 'reason', message: VALIDATION.reasonRequired }
  if (reasonText.length > STORE_CHANGE_REASON_MAX_LENGTH) {
    return { ok: false, field: 'reason', message: VALIDATION.reasonTooLong }
  }
  if (type === 'CREATE') {
    const error = validateFormFields(form, { requireCode: true })
    return error ? { ok: false, ...error } : { ok: true }
  }
  const version = row?.version
  if (version === null || version === undefined) {
    return { ok: false, field: 'baseVersion', message: VALIDATION.baseVersionRequired }
  }
  if (type === 'UPDATE') {
    const error = validateFormFields(form)
    if (error) return { ok: false, ...error }
    if (!buildUpdatePayload(form, row)) {
      return { ok: false, field: 'payload', message: VALIDATION.noChanges }
    }
    return { ok: true }
  }
  if (type === 'STATUS') {
    const target = trimmed(targetStatus).toUpperCase()
    if (!STORE_CHANGE_STATUS_TARGETS.includes(target)) {
      return { ok: false, field: 'targetStatus', message: VALIDATION.targetStatusRequired }
    }
    if (!canTransitionStoreStatus(row?.status, target)) {
      return { ok: false, field: 'targetStatus', message: VALIDATION.statusTransitionInvalid }
    }
    return { ok: true }
  }
  // DELETE：只有停用/已关闭的门店可以申请删除（服务端还会校验无 ACTIVE 门店级绑定）。
  const status = trimmed(row?.status).toUpperCase()
  if (status !== 'SUSPENDED' && status !== 'CLOSED') {
    return { ok: false, field: 'status', message: VALIDATION.deleteRequiresInactive }
  }
  return { ok: true }
}

/**
 * 门店行可提交的申请动作（按状态与是否有 PENDING 申请给出，页面操作列直接渲染）：
 * - ACTIVE：申请编辑 / 申请停用 / 申请关闭
 * - SUSPENDED：申请编辑 / 申请启用 / 申请关闭 / 申请删除
 * - CLOSED：申请删除
 * 有 PENDING 申请时全部置灰（服务端同门店只允许一张 PENDING，前端先拦）。
 */
export function buildStoreChangeActions(row, pendingRequest) {
  const status = trimmed(row?.status).toUpperCase()
  const blocked = Boolean(pendingRequest)
  const actions = []
  const push = (key, requestType, targetStatus) => actions.push({
    key,
    requestType,
    targetStatus: targetStatus || null,
    label: storeChangeActionText(key),
    disabled: blocked,
  })
  if (status === 'ACTIVE') {
    push('UPDATE', 'UPDATE')
    push('SUSPEND', 'STATUS', 'SUSPENDED')
    push('CLOSE', 'STATUS', 'CLOSED')
  } else if (status === 'SUSPENDED') {
    push('UPDATE', 'UPDATE')
    push('RESUME', 'STATUS', 'ACTIVE')
    push('CLOSE', 'STATUS', 'CLOSED')
    push('DELETE', 'DELETE')
  } else if (status === 'CLOSED') {
    push('DELETE', 'DELETE')
  }
  return actions
}

/** 把 PENDING 申请合并到门店行上（`pendingRequest`），列表据此显示「审批中」标签。 */
export function mergePendingRequests(stores, requests) {
  const pendingByStore = new Map()
  for (const request of Array.isArray(requests) ? requests : []) {
    if (!request || trimmed(request.status).toUpperCase() !== 'PENDING') continue
    // CREATE 审批通过前不建行（storeId 为空），不会也不该挂到任何既有门店行上。
    if (trimmed(request.requestType).toUpperCase() === 'CREATE') continue
    if (request.storeId === null || request.storeId === undefined) continue
    pendingByStore.set(Number(request.storeId), request)
  }
  return (Array.isArray(stores) ? stores : []).map((store) => (
    pendingByStore.has(Number(store?.id))
      ? { ...store, pendingRequest: pendingByStore.get(Number(store.id)) }
      : store
  ))
}

/** 待审批的新增门店申请（CREATE 在审批通过前不建行，因此单独以卡片展示）。 */
export function pendingCreateRequests(requests) {
  return (Array.isArray(requests) ? requests : []).filter((request) => (
    request
    && trimmed(request.requestType).toUpperCase() === 'CREATE'
    && trimmed(request.status).toUpperCase() === 'PENDING'
  ))
}

/**
 * 申请的动作短标签（中文取 `STORE_CHANGE_ACTION_LABEL`）：
 * UPDATE=编辑；STATUS 按目标状态=启用/停用/关闭；DELETE=删除；CREATE=新增门店。
 */
export function changeActionLabel(request) {
  const type = trimmed(request?.requestType).toUpperCase()
  if (type === 'STATUS') {
    const target = trimmed(request?.payload?.targetStatus ?? request?.targetStatus).toUpperCase()
    const actionKey = target === 'ACTIVE' ? 'RESUME' : target === 'SUSPENDED' ? 'SUSPEND' : target === 'CLOSED' ? 'CLOSE' : ''
    return actionKey ? STORE_CHANGE_ACTION_LABEL[actionKey] : '状态变更'
  }
  return STORE_CHANGE_ACTION_LABEL[type] || ''
}

/** 行内「审批中」标签文案：审批中：停用申请。 */
export function pendingRequestLabel(request) {
  const label = changeActionLabel(request)
  return label ? `审批中：${label}申请` : '审批中'
}

/** 申请单展示摘要：服务端 `summary` 优先；缺失时用本地规则兜底（不出现英文字段名/枚举原文）。 */
export function requestSummaryText(request) {
  if (!request) return '—'
  const summary = trimmed(request.summary)
  if (summary) return summary
  const type = trimmed(request.requestType).toUpperCase()
  const storeName = trimmed(request.storeName) || trimmed(request.before?.name) || `门店 #${request.storeId ?? '—'}`
  if (type === 'CREATE') {
    const code = trimmed(request.payload?.code) || trimmed(request.targetCode)
    const name = trimmed(request.payload?.name) || '新增门店'
    return `新增门店：${name}${code ? `（${code}）` : ''}`
  }
  if (type === 'STATUS') {
    return `${changeActionLabel(request)}门店：${storeName}`
  }
  if (type === 'DELETE') {
    return `删除门店：${storeName}（归档）`
  }
  if (type === 'UPDATE') {
    const changes = buildChangeDiffForRequest(request).slice(0, 2)
      .map((row) => `${row.label}「${row.before}」→「${row.after}」`)
    return changes.length ? `编辑：${changes.join('、')}` : `编辑门店：${storeName}`
  }
  return '门店变更申请'
}

/** diff 里字段值的展示口径：枚举走词表，图片只显示「已上传/未设置」，避免把 URL 铺满抽屉。 */
function formatChangeValue(field, value) {
  if (field === 'businessType') return businessTypeText(value)
  if (field === 'status') return storeStatusText(value)
  if (field === 'organizationId') {
    const id = Number(value)
    return Number.isFinite(id) && id > 0 ? `#${id}` : '未归属组织'
  }
  if (field === 'logoUrl') return trimmed(value) ? '已上传' : '未设置'
  const text = trimmed(value)
  return text || '—'
}

const DIFF_FIELD_ORDER = Object.keys(STORE_CHANGE_FIELD_TEXT)

/**
 * 计算字段级 diff：`before` 为提交时快照、`after` 为变更后的值。
 *  - `after == null`：DELETE —— 展示 `before` 的全部字段，变更后统一「—」；
 *  - `before == null`：CREATE —— 展示 `after` 的全部非空字段，变更前统一「—」；
 *  - 其它（UPDATE/STATUS）：只展示真正变化的字段。
 */
export function buildChangeDiff(before, after) {
  const beforeObject = before === null || before === undefined ? null : toObject(before)
  const afterObject = after === null || after === undefined ? null : toObject(after)
  if (!beforeObject && !afterObject) return []
  const rows = []
  for (const field of DIFF_FIELD_ORDER) {
    const hasBefore = beforeObject ? Object.prototype.hasOwnProperty.call(beforeObject, field) : false
    const hasAfter = afterObject ? Object.prototype.hasOwnProperty.call(afterObject, field) : false
    if (!hasBefore && !hasAfter) continue
    const beforeText = hasBefore ? formatChangeValue(field, beforeObject[field]) : '—'
    const afterText = hasAfter ? formatChangeValue(field, afterObject[field]) : '—'
    if (!beforeObject || !afterObject) {
      // CREATE / DELETE：跳过空值，避免整屏「未归属组织/未设置」噪音。
      if (beforeObject && beforeText === '—') continue
      if (afterObject && afterText === '—') continue
    } else {
      // UPDATE/STATUS 的 `after` 只带变更字段：before 里有、after 里没有 = 未变更，不能显示成「—」。
      if (!hasAfter) continue
      if (beforeText === afterText) continue
    }
    rows.push({ field, label: STORE_CHANGE_FIELD_TEXT[field] || field, before: beforeText, after: afterText })
  }
  return rows
}

/** 服务端下发的 diff 兼容解析：数组 `{field,before,after}` 或对象 `{field:[before,after]}`。 */
export function normalizeServerDiff(diff) {
  const rows = []
  if (Array.isArray(diff)) {
    for (const item of diff) {
      if (!item || typeof item !== 'object') continue
      const field = trimmed(item.field ?? item.key)
      if (!field) continue
      rows.push({
        field,
        label: trimmed(item.label) || STORE_CHANGE_FIELD_TEXT[field] || field,
        before: item.before === null || item.before === undefined ? '—' : formatChangeValue(field, item.before),
        after: item.after === null || item.after === undefined ? '—' : formatChangeValue(field, item.after),
      })
    }
    return rows
  }
  if (diff && typeof diff === 'object') {
    for (const [field, value] of Object.entries(diff)) {
      const pair = Array.isArray(value) ? value : [value?.before, value?.after]
      rows.push({
        field,
        label: STORE_CHANGE_FIELD_TEXT[field] || field,
        before: formatChangeValue(field, pair[0]),
        after: formatChangeValue(field, pair[1]),
      })
    }
  }
  return rows
}

/**
 * 申请单的 diff（页面详情/变更记录用）：
 * 优先按 `before` + `payload` 本地计算（可解释、口径固定），计算不出来时再退回服务端 `diff`。
 */
export function buildChangeDiffForRequest(request) {
  if (!request) return []
  const type = trimmed(request.requestType).toUpperCase()
  const before = toObject(request.before)
  const payload = toObject(request.payload)
  if (type === 'CREATE') {
    const rows = buildChangeDiff(null, payload)
    if (rows.length) return rows
  } else if (type === 'DELETE') {
    const rows = buildChangeDiff(before, null)
    if (rows.length) return rows
  } else if (type === 'STATUS') {
    const targetStatus = trimmed(payload.targetStatus ?? request.targetStatus).toUpperCase()
    const rows = buildChangeDiff(before, { ...before, status: targetStatus })
    if (rows.length) return rows
  } else if (type === 'UPDATE') {
    const rows = buildChangeDiff(before, payload)
    if (rows.length) return rows
  }
  return normalizeServerDiff(request.diff)
}

/** 列表响应归一：兼容数组 / `{items,total}` / `{records,total}`（MyBatis-Plus）/ `{list,total}` / `{rows,total}`。 */
export function normalizeChangeRequestPage(data) {
  if (Array.isArray(data)) return { items: data, total: data.length }
  if (!data || typeof data !== 'object') return { items: [], total: 0 }
  const items = Array.isArray(data.items) ? data.items
    : Array.isArray(data.records) ? data.records
      : Array.isArray(data.list) ? data.list
        : Array.isArray(data.rows) ? data.rows
          : []
  const rawTotal = data.total ?? data.count
  const total = Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : items.length
  return { items, total }
}

/** 纯列表响应归一（不关心分页）。 */
export function normalizeChangeRequestList(data) {
  return normalizeChangeRequestPage(data).items
}

/** 提交幂等键：同一次表单提交只应产生一张申请单（双击/网络重试由服务端按 key 去重）。 */
export function createIdempotencyKey() {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  return `scr-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

/** 未知枚举兜底（供页面在展示服务端额外字段时复用，保证不透英文原文）。 */
export function changeEnumText(value) {
  return unknownEnumText(value)
}
