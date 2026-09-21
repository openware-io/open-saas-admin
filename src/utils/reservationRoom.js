/**
 * 「预约是预约房型，到店才分配包厢」的展示与动作共用规则。
 *
 * 后端契约（platform-order-service，经 platform-admin-service BFF 暴露）：
 *  - 列表/详情响应带 `roomTypeId / roomTypeCode / roomTypeName`，以及**到店分配后才有值**的
 *    `resourceId / resourceName`；历史行没有房型，只有当初选定的 `resourceId`；
 *  - 分配包厢候选 `GET /admin/reservations/{id}/assignable-rooms`：**服务端算好的候选列表**
 *    （房态运行态 + 本预约时段的预约冲突），每项带 `assignable / reason / currentAssignment /
 *    conflictReservationNo / conflictWindow / roomState`。前端只渲染，不再自己拼资源列表 ——
 *    客户端合并 `/admin/resources` 与 `/business/resources` 时，任一读失败都会退化成
 *    「使用中/已被预约的包厢也出现在下拉里」；
 *  - 分配包厢 `POST /admin/reservations/{id}/assign-room` body `{resourceId, override}`：
 *    已分配其它包厢且未 override → 409 `RESERVATION_ROOM_ASSIGNED`（换包厢需显式覆盖）；
 *    已取消/已开台 → 409 `RESERVATION_STATUS_INVALID`；历史预约无房型 → 409
 *    `RESERVATION_ROOM_TYPE_REQUIRED`；房型/门店不符 → 400；包厢当前不可分配 → 409
 *    `ROOM_UNAVAILABLE`；**该包厢在本预约时段已被其它未取消预约占用 → 409 `ROOM_RESERVED_OVERLAP`**；
 *    房态服务不可达 → 503 `RESOURCE_STATE_UNAVAILABLE`；
 *  - 开台 `POST /admin/reservations/{id}/open-table`：**ARRIVED 或 CONFIRMED** 可开台
 *    （CONFIRMED 开台隐含登记到店时间 arrived_at）；未分配包厢 → 409
 *    `RESERVATION_ROOM_NOT_ASSIGNED`（页面上先禁用按钮，后端 409 是兜底）；
 *  - 未到店 `POST /admin/reservations/{id}/no-show`：到店前且已过预约开始时间 → `NO_SHOW`
 *    （未到点 → 409 `RESERVATION_NOT_STARTED`）。
 *
 * <p><b>分配包厢不改状态</b>：`assign-room` 只写 `resource_id`，预约仍是 PENDING/CONFIRMED，
 * 因此「提前锁房」在看板上显示「已预订」而不是「客户已到店」；到店事实只由 `arrival` 或
 * `open-table`（隐含）写入 `arrived_at`。
 *
 * 这里只放**纯函数**：文案推导、服务端候选的展示/分组、以及「409 → 二次确认 → override 重试」的
 * 提交流程，页面负责弹窗与刷新，便于单测直接覆盖。
 */

/** 换包厢未显式覆盖的后端错误码：命中它才走「二次确认 + override=true 重试」。 */
export const ASSIGN_ROOM_OVERRIDE_CODE = 'RESERVATION_ROOM_ASSIGNED'

/** 可执行「分配包厢」的预约状态（后端拒绝已取消/已开台：409 RESERVATION_STATUS_INVALID）。 */
export const ASSIGNABLE_RESERVATION_STATUSES = Object.freeze(['PENDING', 'CONFIRMED', 'ARRIVED'])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 历史预约：没有房型（`ord_reservation.room_type_id` 为 null），只有当初选定的包厢。 */
export function isHistoricalReservation(row) {
  return !row || row.roomTypeId === null || row.roomTypeId === undefined || row.roomTypeId === ''
}

/**
 * 房型列文案：`roomTypeName` → `roomTypeCode` → 历史行回退旧包厢名并标注「历史预约」。
 * 新预约拿不到展示字段（资源域读路径降级）时显示「未知房型」，不臆造房型名。
 */
export function reservationRoomTypeText(row) {
  const name = text(row && row.roomTypeName)
  if (name) return name
  const code = text(row && row.roomTypeCode)
  if (code) return code
  if (!isHistoricalReservation(row)) return '未知房型'
  const legacyName = text(row && row.resourceName)
  return legacyName ? legacyName + '（历史预约）' : '历史预约（未记录房型）'
}

/** 包厢列文案：已分配显示包厢名，未分配显示「到店后分配」（不把「待分配」伪装成已履约）。 */
export function reservationRoomText(row, fallbackName) {
  const resourceId = row && row.resourceId
  if (resourceId === null || resourceId === undefined || resourceId === '') return '到店后分配'
  const name = text(row && row.resourceName) || text(fallbackName)
  return '已分配：' + (name || '包厢 #' + resourceId)
}

/** 是否显示「分配包厢」按钮：已取消/已开台不显示。 */
export function canAssignRoom(row) {
  return ASSIGNABLE_RESERVATION_STATUSES.includes(row && row.status)
}

/** 预约是否已落到具体包厢（开台前置条件）。 */
export function isReservationRoomAssigned(row) {
  return !!(row && row.resourceId !== null && row.resourceId !== undefined && row.resourceId !== '')
}

/** 开台按钮是否可用：未分配包厢时禁用（后端 409 RESERVATION_ROOM_NOT_ASSIGNED 兜底）。 */
export function canOpenTable(row) {
  return isReservationRoomAssigned(row)
}

/**
 * 是否显示「开台」：**已到店（ARRIVED）**，或**已确认且已分配包厢（CONFIRMED）**。
 *
 * <p>后端 open-table 同时接受 ARRIVED 与 CONFIRMED，并在 CONFIRMED 开台时隐含登记到店时间
 * （{@code ord_reservation.arrived_at}）：客人到了、包厢也留好了，运营不必先点「到店」再点「开台」。
 * 未确认（PENDING）仍不可开台。
 */
export function canOpenTableAction(row) {
  const status = row && row.status
  if (status === 'ARRIVED') return true
  return status === 'CONFIRMED' && isReservationRoomAssigned(row)
}

/**
 * 解析后端返回的预约时间（门店营业本地墙上时间，形如 {@code 2026-09-18T19:30:00}，无时区偏移）。
 * 无偏移的日期时间按**本地时间**解析（ECMAScript 规范），与门店墙上时钟口径一致；解析不出来返回 null。
 */
export function parseLocalDateTime(value) {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

/** 预约是否已过开始时间（用于「未到店」与超时提示；只做展示判断，最终以后端校验为准）。 */
export function isReservationOverdue(row, now = Date.now()) {
  const startAt = parseLocalDateTime(row && row.startAt)
  if (startAt === null) return false
  return startAt <= now
}

/**
 * 是否显示「未到店」按钮：到店前（PENDING/CONFIRMED）、未开台、且已过预约开始时间。
 * 后端仍会校验（未到点 → 409 RESERVATION_NOT_STARTED；已到店/已开台 → 409 RESERVATION_STATUS_INVALID）。
 */
export function canMarkNoShow(row, now = Date.now()) {
  const status = row && row.status
  if (status !== 'PENDING' && status !== 'CONFIRMED') return false
  if (row && row.orderId) return false
  return isReservationOverdue(row, now)
}

/** 历史预约没有房型，无法按房型列出候选包厢（后端同样拒绝），按钮置灰并给出原因。 */
export function canAssignRoomOfType(row) {
  return canAssignRoom(row) && !isHistoricalReservation(row)
}

/**
 * 服务端候选 → 可选包厢列表（`assignable=true`）。
 * 候选由 `GET /admin/reservations/{id}/assignable-rooms` 给出，前端不再二次判断可用性。
 */
export function assignableRoomOptions(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter((room) => room && room.assignable)
}

/**
 * 不可分配的候选按原因聚合，用于在弹窗里说明「为什么某间包厢不出现」。
 * 返回 `[{ reason, count }]`，顺序稳定（先按出现顺序）。原因含房态（使用中/清洁中/已停用）
 * 与**本时段已被其它预约占用**（带预约号与时段），后者是「预约不写资源占用」的必然结果。
 */
export function summarizeUnavailableRooms(candidates) {
  const counts = new Map()
  ;(Array.isArray(candidates) ? candidates : [])
    .filter((room) => room && room.assignable === false)
    .forEach((room) => {
      const reason = text(room.reason) || '当前不可分配'
      counts.set(reason, (counts.get(reason) || 0) + 1)
    })
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }))
}

/**
 * 候选包厢展示名：名称 → 编号 → `包厢 #id`；当前已分配的包厢追加标注，
 * 让运营一眼看出「现在挂在哪间、是不是要改派」。
 */
export function roomDisplayName(room) {
  const name = text(room && room.name) || text(room && room.resourceCode)
  const id = room && (room.resourceId != null ? room.resourceId : room.id)
  const base = name || (id !== null && id !== undefined ? '包厢 #' + id : '未命名包厢')
  return room && room.currentAssignment ? base + '（当前已分配）' : base
}

/** 取后端统一错误体的业务错误码（无 code 时返回空串，绝不解析英文 message）。 */
export function requestErrorCode(error) {
  const code = error && error.response && error.response.data && error.response.data.code
  return typeof code === 'string' ? code.trim() : ''
}

/**
 * 提交「分配包厢」。
 *
 * 先按 `override=false` 提交；只有后端明确返回 409 `RESERVATION_ROOM_ASSIGNED`（换包厢）时，
 * 才由调用方弹二次确认，用户确认后带 `override=true` 重试。用户取消确认时
 * `confirmOverride()` 抛出的异常（ElMessageBox 的 'cancel'）原样上抛，由页面按「弹窗关闭」处理。
 *
 * @param {number|string} resourceId 目标包厢
 * @param {{ submit: (resourceId: *, override: boolean) => Promise<*>, confirmOverride: () => Promise<*> }} deps
 * @returns {Promise<{ overridden: boolean }>}
 */
export async function submitAssignRoom(resourceId, deps) {
  const { submit, confirmOverride } = deps || {}
  try {
    await submit(resourceId, false)
    return { overridden: false }
  } catch (error) {
    if (requestErrorCode(error) !== ASSIGN_ROOM_OVERRIDE_CODE) throw error
  }
  await confirmOverride()
  await submit(resourceId, true)
  return { overridden: true }
}
