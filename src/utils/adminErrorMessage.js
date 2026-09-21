import { ElMessage } from 'element-plus'
import { CANCEL_REASON_MAX_LENGTH } from './cancelAction'

/**
 * 后台统一错误提示（F12）。
 *
 * 后端约定是「统一错误体」：HTTP 非 2xx + JSON `{ code, message }`。
 * 但线上存在两类不带 `code/message` 的响应，直接把 axios 英文原文抛给运营人员是不可接受的：
 *  1) Spring 默认错误体（如缺少 Idempotency-Key / 请求头缺失时 `{timestamp,status,error,path}`）；
 *  2) 网络层失败（无 response，axios 抛出 `Request failed with status code ...` / `timeout of ...`）。
 * 因此解析顺序固定为：业务错误码 → 中文服务端 message → 状态码兜底 → 页面语义兜底，
 * 任何情况下都不会返回英文原文或空串。
 */

/** 已知业务错误码 → 可执行的中文提示（服务端 message 缺失或不可读时使用）。 */
const ERROR_CODE_MESSAGES = Object.freeze({
  // 订单 / 加项
  CATALOG_ITEM_REQUIRED: '加项必须选择点单目录中的商品或服务。',
  CATALOG_ITEM_INVALID: '该目录项不存在或已停用，请刷新目录后重试。',
  CATALOG_SCOPE_DENIED: '无权使用其他门店的点单目录项。',
  CATALOG_NAME_REQUIRED: '请填写目录项名称。',
  CATALOG_PRICE_INVALID: '目录项单价需大于 0。',
  ORDER_NOT_FOUND: '订单不存在或已被移除，请刷新后重试。',
  ORDER_STATUS_INVALID: '当前订单状态不允许该操作，请刷新后重试。',
  ORDER_ITEM_INVALID: '加项数量需为正数且最多三位小数。',
  ORDER_ITEM_NOT_FOUND: '加项不存在或已被移除，请刷新后重试。',
  ORDER_ITEM_STATUS_INVALID: '仅待确认的加项可以确认或拒绝，请刷新后重试。',
  PRODUCT_NOT_AVAILABLE: '该商品未上架或未关联仓库商品，暂时无法加项。',
  // 资源 / 清洁
  CLEANING_STATUS_REQUIRED: '缺少清洁状态参数，请刷新后重试。',
  AREA_NAME_TOO_LONG: '区域名称不能超过 64 个字符，请缩短后重试。',
  // 预约改房型（服务端 6dffcf55）：预约按房型创建，到店再分配具体包厢
  RESERVATION_STATUS_INVALID: '该预约已取消或已开台，不能执行此操作，请刷新后重试。',
  RESERVATION_ROOM_TYPE_REQUIRED: '该预约未记录房型（历史预约），无法分配包厢；历史预约可直接开台。',
  RESERVATION_ROOM_ASSIGNED: '该预约已分配包厢；如需改派，请确认覆盖后再提交。',
  RESERVATION_ROOM_NOT_ASSIGNED: '该预约尚未分配包厢，请先到店分配包厢再开台。',
  // 未到店（NO_SHOW）：预约开始时间还没到就点「未到店」会被服务端拒绝
  RESERVATION_NOT_STARTED: '预约开始时间还没到，不能标记未到店。',
  ROOM_TYPE_MISMATCH: '所选包厢与预约房型不一致，请选择该房型下的包厢。',
  ROOM_STORE_MISMATCH: '所选包厢不属于当前门店，请切换门店后重新选择。',
  ROOM_UNAVAILABLE: '所选包厢当前不可分配（使用中或清洁中），请改选其它包厢。',
  RESOURCE_STATE_UNAVAILABLE: '包厢状态服务暂时不可用，请稍后重试。',
  // 创建预约只认房型（传具体包厢资源会被显式拒绝）
  RESOURCE_ID_NOT_ALLOWED: '创建预约只能选择房型，不能直接指定包厢，请改为选择房型。',
  // 房型字典（/api/v1/admin/resources/types）
  ROOM_TYPE_CODE_EXISTS: '房型编码在该门店已存在，请换一个编码。',
  ROOM_TYPE_NAME_EXISTS: '房型名称在该门店已存在，请换一个名称。',
  ROOM_TYPE_IN_USE: '该房型仍被包厢使用，请先把这些包厢改到其他房型再删除。',
  ROOM_TYPE_INVALID: '房型信息不合法：请确认该房型属于当前门店，且编码/名称/人数/单价（不能为负）填写正确。',
  ROOM_TYPE_NOT_FOUND: '房型不存在或已被删除，请刷新后重试。',
  // 开台人数（ord_ktv_session.party_size）
  PARTY_SIZE_INVALID: '到店人数不合法：须大于 0，且不超过包厢容量上限。',
  // 仓库商品采购价 / 本次入库批次单价（ord_inventory_material.purchase_price、
  // ord_inventory_transaction.unit_cost，最小货币单位）——两者共用同一错误码
  PURCHASE_PRICE_INVALID: '采购价或本次入库单价不合法：金额不能为负，也不能超过系统上限。',
  // 移动加权平均成本跨币种（InventoryApplicationService#movingAverageCost）：
  // 旧成本基准非 0 且币种与本批次不一致时直接拒绝，绝不静默混合两种货币
  INVENTORY_CURRENCY_MISMATCH: '该物料库存的平均成本币种与本次入库批次币种不一致，跨币种不能直接加权；'
    + '请先完成成本调整，或待该物料库存清零后再入库。',
  // 库存入库/调整的通用参数校验（数量必须为正、物料必须属于当前门店等）
  INVENTORY_INVALID: '库存变更参数不合法：数量需大于 0，且物料属于当前门店。',
  INVENTORY_INSUFFICIENT: '库存不足，无法按该数量出库，请刷新后核对结存数量。',
  MATERIAL_NOT_FOUND: '该仓库物料不存在或已被删除，请刷新后重试。',
  MATERIAL_INVALID: '仓库物料信息不合法：请确认编码、名称、单位与分类已正确填写。',
  // 日结（pay_daily_closing：按门店 + 营业日唯一）
  DAILY_CLOSING_DATE_REQUIRED: '请选择营业日期后再提交日结。',
  DAILY_CLOSING_AMOUNT_INVALID: '日结金额不合法：金额不能为负，请核对收款与交班数据后重试。',
  // 审计日志（iam_audit_log，/api/v1/admin/audits）
  AUDIT_NOT_FOUND: '该审计记录不存在或已被清理，请刷新列表后重试。',
  AUDIT_TENANT_FORBIDDEN: '只能查看当前租户的审计日志，无法跨租户查询。',
  // 上下文 / 权限
  STORE_SCOPE_DENIED: '当前门店上下文与目标门店不一致，请先在右上角切换门店。',
  TENANT_SCOPE_DENIED: '无权访问其他租户的数据。',
  TENANT_CONTEXT_MISSING: '缺少租户上下文，请重新选择门店后重试。',
  PERMISSION_DENIED: '当前账号没有执行此操作的权限。',
  CONTEXT_FORBIDDEN: '当前上下文没有该操作权限，请重新选择门店上下文后重试。',
  SAAS_CONTEXT_REQUIRED: '请先选择租户 / 门店上下文。',
  SAAS_CONTEXT_INVALID: '运营上下文已失效，请重新选择门店上下文。',
  CSRF_TOKEN_INVALID: '登录凭证已过期，请重试。',
  IDEMPOTENCY_KEY_REQUIRED: '本次操作缺少幂等标识，已被服务端拦截，请刷新页面后重试。',
  // 运营人员 / IM 关联（platform-admin-service：关联 / 换绑 / 解绑）
  STAFF_IM_ALREADY_BOUND: '该 IM 账号已被其他后台账号占用，请核对该 IM 账号后重试。',
  STAFF_IM_REBIND_UNBIND_FIRST: '该运营人员已关联其他 IM 账号，请先解绑后再关联。',
  STAFF_ROLE_REQUIRED: '该运营人员没有有效角色，不能关联 IM 账号。',
  IM_ACCOUNT_REQUIRED: '请填写 IM 账号。',
  IM_ACCOUNT_NOT_FOUND: 'IM 账号不存在（可能已被删除），请核对后重试。',
  STAFF_NOT_FOUND: '运营人员不存在或已被删除，请刷新后重试。',
})

/**
 * 已收款订单不可直接取消的提示（后端 409 `ORDER_HAS_PAYMENT_REFUND_FIRST`）。
 * 导出给页面做提交前预检，保证「预检提示」与「错误码映射」是同一句文案，不会漂移。
 */
export const ORDER_HAS_PAYMENT_REFUND_FIRST_TEXT = '该订单已有收款，请先退款后再取消。'

/**
 * 「取消预约 / 取消订单」专属错误码 → 中文提示。
 *
 * 取消流程比通用表更需要「下一步该做什么」：已收款要先退款、已到店/已开台要改走另一条入口。
 * 因此这里覆盖 ORDER_STATUS_INVALID 的通用文案——通用表还要服务结算/确认等动作（那些场景下
 * 「已完成或已取消」并不准确），只有取消流程能确定它的含义。
 */
const CANCEL_ERROR_CODE_MESSAGES = Object.freeze({
  CANCEL_REASON_REQUIRED: '请填写取消原因。',
  CANCEL_REASON_TOO_LONG: '取消原因不能超过 ' + CANCEL_REASON_MAX_LENGTH + ' 个字符。',
  ORDER_HAS_PAYMENT_REFUND_FIRST: ORDER_HAS_PAYMENT_REFUND_FIRST_TEXT,
  ORDER_STATUS_INVALID: '该订单已完成或已取消。',
  RESERVATION_STATUS_INVALID: '已到店/已开台的预约不能取消，请改为取消订单。',
})

/**
 * 解析「取消预约 / 取消订单」失败的中文提示：命中取消专属错误码优先，其余走通用解析
 * （仍然不会返回空串，也不会把服务端/axios 英文原文或裸错误码展示给运营人员）。
 * @param {unknown} error 捕获到的异常
 * @param {string} [fallback] 页面语义兜底（如「取消订单失败」）
 */
export function resolveCancelErrorMessage(error, fallback = '操作未完成，请稍后重试。') {
  const code = typeof error?.response?.data?.code === 'string' ? error.response.data.code.trim() : ''
  if (code && CANCEL_ERROR_CODE_MESSAGES[code]) return CANCEL_ERROR_CODE_MESSAGES[code]
  return resolveAdminErrorMessage(error, fallback)
}

/** 取消动作的失败提示出口：解析中文提示并弹出，返回实际展示文案（便于单测）。 */
export function notifyCancelRequestError(error, fallback) {
  const message = resolveCancelErrorMessage(error, fallback)
  ElMessage.error(message)
  return message
}

const STATUS_MESSAGES = Object.freeze({
  400: '请求参数有误，请检查后重试。',
  401: '登录状态已失效，请重新登录。',
  403: '没有操作权限，请联系管理员。',
  404: '接口不存在，请确认后端服务版本。',
  405: '请求方式不被支持。',
  408: '请求超时，请稍后重试。',
  409: '数据已被其他操作更新，请刷新后重试。',
  429: '操作过于频繁，请稍后再试。',
  500: '后端服务异常（500），请稍后重试或联系管理员。',
  502: '后端服务暂时不可用（502），请稍后重试。',
  503: '后端服务暂时不可用（503），请稍后重试。',
  504: '后端服务响应超时（504），请稍后重试。',
})

/** 框架默认英文短语：命中即视为「无业务 message」，一律走状态码兜底中文。 */
const GENERIC_SERVER_MESSAGES = new Set([
  'Internal Server Error', 'Bad Request', 'Unauthorized', 'Forbidden', 'Not Found',
  'Method Not Allowed', 'Bad Gateway', 'Service Unavailable', 'Gateway Timeout',
  'No message available', 'Validation failed',
])

/** 只有包含中日韩统一表意文字的服务端 message 才允许直接展示，其余（英文原文）不展示。 */
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 解析可展示的中文错误提示。永不返回空串，也永不返回服务端/axios 的英文原文。
 * @param {unknown} error 捕获到的异常（通常是 axios error）
 * @param {string} [fallback] 页面语义兜底（如「加项失败」），仅在状态码也无映射时使用
 */
export function resolveAdminErrorMessage(error, fallback = '操作未完成，请稍后重试。') {
  const data = error?.response?.data
  const code = typeof data?.code === 'string' ? data.code.trim() : ''
  if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code]

  const serverMessage = typeof data?.message === 'string' ? data.message.trim() : ''
  if (serverMessage && !GENERIC_SERVER_MESSAGES.has(serverMessage) && CJK_PATTERN.test(serverMessage)) {
    return serverMessage
  }

  if (!error?.response) {
    if (error?.code === 'ECONNABORTED' || String(error?.message || '').includes('timeout')) {
      return '请求超时，请检查网络后重试。'
    }
    return '网络连接异常，请检查网络后重试。'
  }

  const status = error.response.status
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
  return fallback || '操作未完成，请稍后重试。'
}

/** 统一的失败提示出口：解析中文提示并弹出，返回实际展示文案（便于单测与日志）。 */
export function notifyAdminRequestError(error, fallback) {
  const message = resolveAdminErrorMessage(error, fallback)
  ElMessage.error(message)
  return message
}
