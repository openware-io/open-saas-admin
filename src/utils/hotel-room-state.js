/**
 * 酒店房态卡派生规则。
 *
 * 房态由三组字段表达，前端不再读取单一 room.status：
 *   occupancyStatus     VACANT / OCCUPIED
 *   housekeepingStatus  CLEAN / DIRTY / CLEANING / INSPECTED
 *   outOfOrderStatus    NONE / OUT_OF_ORDER / OUT_OF_SERVICE
 * 再加上有效保留（RESERVED / GROUP_BLOCK / HOUSE_USE）派生“已预留”。
 *
 * 展示态固定为：空闲 / 已入住 / 待清扫 / 已预留 / 维修中。
 */
export const ROOM_BOARD_STATE_TEXT = {
  active: '空闲',
  occupied: '已入住',
  dirty: '待清扫',
  reserved: '已预留',
  maintenance: '维修中',
}

export const ROOM_BOARD_STATE_KEYS = ['active', 'occupied', 'dirty', 'reserved', 'maintenance']

const SELLABLE_HOUSEKEEPING = new Set(['CLEAN', 'INSPECTED'])
const GUEST_HOLD_REASONS = new Set(['RESERVED', 'GROUP_BLOCK', 'HOUSE_USE', 'LOCKED'])

export function roomBoardTone(room) {
  if (!room) return 'maintenance'
  if (room.outOfOrderStatus === 'OUT_OF_ORDER' || room.outOfOrderStatus === 'OUT_OF_SERVICE') return 'maintenance'
  if (room.holdReason && GUEST_HOLD_REASONS.has(room.holdReason)) return 'reserved'
  if (room.occupancyStatus === 'OCCUPIED') return 'occupied'
  if (room.housekeepingStatus === 'DIRTY' || room.housekeepingStatus === 'CLEANING') return 'dirty'
  return 'active'
}

export function roomBoardLabel(room) {
  return ROOM_BOARD_STATE_TEXT[roomBoardTone(room)]
}

/** 可入住：空闲、清扫完成、非维修/停售、未被保留。 */
export function canCheckInRoom(room) {
  if (!room) return false
  if (room.occupancyStatus !== 'VACANT') return false
  if (room.outOfOrderStatus !== 'NONE') return false
  if (room.holdReason && GUEST_HOLD_REASONS.has(room.holdReason)) return false
  return SELLABLE_HOUSEKEEPING.has(room.housekeepingStatus)
}

/** 房态卡摘要计数；只从三组字段派生。 */
export function roomBoardSummary(rooms) {
  const counts = { active: 0, occupied: 0, dirty: 0, reserved: 0, maintenance: 0 }
  for (const room of rooms || []) {
    counts[roomBoardTone(room)] += 1
  }
  return counts
}

/** 维修/停售的具体原因，用于房态卡提示文案。 */
export function outOfOrderText(room) {
  if (!room) return ''
  if (room.outOfOrderStatus === 'OUT_OF_SERVICE') return '停售中'
  if (room.outOfOrderStatus === 'OUT_OF_ORDER') return '维修中'
  return ''
}

/** 清扫状态的中文说明（清扫任务与房态卡共用）。 */
export function housekeepingText(room) {
  const status = room?.housekeepingStatus
  return { CLEAN: '已清扫', DIRTY: '待清扫', CLEANING: '清扫中', INSPECTED: '已检查' }[status] || '—'
}

/** 占用状态的中文说明。 */
export function occupancyText(room) {
  return room?.occupancyStatus === 'OCCUPIED' ? '已入住' : '空闲'
}
