/**
 * 账单「怎么算出来的」文案口径（包厢费 + 合计构成）。
 *
 * 为什么单独一份：账单要在收银台账单弹窗、订单管理账单区、C 端 H5 三处展示同一套解释，
 * 文案与判定必须同源，否则同一张单三处说法不一。**这里只做文案**——所有数字（时长、块数、
 * 单价、标准时长、超时秒数、超时倍率）都由服务端账单字段给出，前端不做任何金额算术，
 * 也不自行判断「算不算超时」「几块」。
 *
 * 服务端字段（{@code BillResult.RoomFee}）：
 * - {@code source}: LIVE（开台中实时值）/ CLOSED（结台固化）/ HISTORICAL（历史固化，未记录结台时刻）
 * - {@code durationKnown}: 计费时长是否可信（HISTORICAL 为 false，页面必须说「时长未记录」）
 * - {@code quantity}: 计费块数；{@code unitPrice}: 每递增粒度单价；{@code incrementMinutes}: 每档分钟数
 * - {@code standardSeconds}/{@code overSeconds}/{@code overtimeRate}: 标准时长 / 超时秒数 / 超时倍率
 * - {@code roomFeeIncludesServer}: 包厢费是否已含 1 名标准服务人员
 * - {@code snapshotAt}: 固化金额的生成时刻（历史金额的唯一时间锚点）
 */

/**
 * 秒 → 「X 小时 Y 分钟」文案。只做单位换算，不参与金额计算。
 * 30 分钟以内按分钟展示；不足 1 分钟显示「不足 1 分钟」（而不是 0 分钟，避免看起来像没计费）。
 */
export function durationTextFromSeconds(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)))
  if (total <= 0) return '0 分钟'
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  if (minutes <= 0) return '不足 1 分钟'
  return `${minutes} 分钟`
}

/**
 * 包厢费金额的来源说明：决定页面是说「实时值」「结台固化」还是「时长未记录的历史固化值」。
 * 历史固化值（会话已取消/未结台、没有结台时刻）绝不能用「0 分钟」冒充——
 * 那正是线上订单 72「0 分钟却收 40」看起来没法解释的根因。
 */
export function roomFeeSourceText(roomFee) {
  switch (roomFee?.source) {
    case 'LIVE': return '开台中实时值，结台后按结台时间固化'
    case 'CLOSED': return '结台固化值'
    case 'HISTORICAL': return '会话已取消/未结台，金额为历史固化值（不再随时间变化）'
    default: return '金额来自服务端账单'
  }
}

/** 计费时长文案：时长可信才给时长，否则明确说明不可知（页面不得显示 0 分钟）。 */
export function roomFeeDurationText(roomFee) {
  if (!roomFee) return ''
  if (roomFee.durationKnown === false) return `时长未记录（${roomFeeSourceText(roomFee)}）`
  return durationTextFromSeconds(roomFee.durationSeconds)
}

/** 是否展示「单价 × 块数」：块数由服务端给出（0 也是有效信息：不足一档让利不计）。 */
export function roomFeeHasBlockFormula(roomFee) {
  return roomFee != null && roomFee.quantity != null
}

/** 明细行「单价 × 数量」是否可展示（数量缺失的历史数据不展示，避免出现「× —」）。 */
export function roomFeeBlockFormulaText(roomFee) {
  if (!roomFeeHasBlockFormula(roomFee)) return ''
  const increment = Number(roomFee.incrementMinutes) > 0 ? `（每 ${roomFee.incrementMinutes} 分钟一档）` : ''
  return `${roomFee.quantity} 个计费单位${increment}`
}
