import request from './request'

// —— 预约管理 BFF（platform-admin-service → platform-order-service）——

export function getReservations(params) {
  return request.get('/api/v1/admin/reservations', { params })
}
export function confirmReservation(id, expectedVersion) {
  return request.post('/api/v1/admin/reservations/' + id + '/confirm', { expectedVersion })
}
export function arrivalReservation(id) {
  return request.post('/api/v1/admin/reservations/' + id + '/arrival')
}
/**
 * 取消预约：`reason` 必填（空白 → 400 `CANCEL_REASON_REQUIRED`），
 * 已到店/已开台 → 409 `RESERVATION_STATUS_INVALID`（应改走「取消订单」），审计动作 `reservation.cancel`。
 */
export function cancelReservation(id, reason) {
  return request.post('/api/v1/admin/reservations/' + id + '/cancel', { reason })
}
export function openTableReservation(id) {
  return request.post('/api/v1/admin/reservations/' + id + '/open-table')
}

/**
 * 标记「未到店」（到店前且已过预约开始时间 → NO_SHOW）。
 *
 * 用于客户放鸽子的超时预约：此前没有任何入口，预约会永远停在待确认/已确认，
 * 后台「已预订」的房间既不会释放也不提示。未到预约开始时间后端 409 `RESERVATION_NOT_STARTED`。
 */
export function noShowReservation(id) {
  return request.post('/api/v1/admin/reservations/' + id + '/no-show')
}

/**
 * 到店分配包厢（预约是预约房型，到店才落具体包厢）。
 *
 * body `{ resourceId, override }`：
 *  - `override=false` 首次分配；已分配其它包厢时后端 409 `RESERVATION_ROOM_ASSIGNED`；
 *  - 用户二次确认改派后带 `override=true` 重试（页面用 utils/reservationRoom 的 submitAssignRoom 编排）。
 * 校验失败错误码见 utils/adminErrorMessage 的中文映射（房型/门店不符、包厢不可用、房态服务不可达等）。
 */
export function assignRoomReservation(id, resourceId, override) {
  return request.post('/api/v1/admin/reservations/' + id + '/assign-room', {
    resourceId,
    override: Boolean(override),
  })
}

/**
 * 分配包厢**候选列表**（只读）：`GET /admin/reservations/{id}/assignable-rooms`。
 *
 * <p>候选与「为什么某间包厢不可分配」由 platform-order-service 一次算完：
 * 资源域房态（启用/清洁/占用）+ 本预约时段的**预约冲突**（预约本身不写资源占用，
 * 所以只看房态会把「这个时段已被别的预约锁了」的包厢列成可选）。
 * 返回项：`{ resourceId, name, resourceCode, roomTypeId, roomTypeName, assignable, reason,
 * currentAssignment, conflictReservationNo, conflictWindow, roomState }`。
 *
 * <p>前端不再自己拼 `/admin/resources` + `/business/resources`：那两处任何一处读失败都会
 * 退化成「全部可分配」，运营选中后只能被后端 409 拒绝。
 */
export function getAssignableRooms(id) {
  return request.get('/api/v1/admin/reservations/' + id + '/assignable-rooms')
}
