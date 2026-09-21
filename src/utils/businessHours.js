/**
 * KTV 营业时间的**唯一前端口径**（C 端/B 端/后台展示与选择器都走这里）。
 *
 * 服务端（platform-order-service）在**创建预约**时统一强制「到店时间必须落在营业时段内」，
 * 配置本身来自租户域（`GET /admin/tenant/business-hours`，门店级覆盖租户默认，缺省 18:00–05:00）。
 * 前端只用同一份配置做两件事：
 *  1. 告诉运营/客人「现在能选哪一段」（营业时间文案 + 越界标记）；
 *  2. 提交前先挡掉必然被服务端拒绝的时段（错误提示更早、更清楚）。
 * 判定语义必须与服务端一致，否则会出现「界面能选、服务端拒绝」的不一致：
 *  **左闭右开 `[open, close)`；`close < open` 表示跨自然日（18:00–05:00 覆盖凌晨）；`open == close` 全天营业。**
 */

/** 缺省营业时间：KTV 夜间业态（与服务端 DEFAULT 一致，不要各写一份）。 */
export const DEFAULT_BUSINESS_HOURS = Object.freeze({
  openTime: '18:00',
  closeTime: '05:00',
  source: 'DEFAULT',
  crossesMidnight: true,
  allDay: false,
  displayText: '18:00 – 次日 05:00',
})

/** 时刻字符串归一化为 `HH:mm`（接受 `HH:mm` / `HH:mm:ss` / Date 之外的字符串）；无法解析返回 null。 */
export function normalizeTime(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  const matched = /^(\d{1,2}):(\d{2})/.exec(text)
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function isBefore(a, b) {
  return a < b
}

/** 营业时间文案：全天营业 / 跨自然日带「次日」/ 普通区间。 */
export function businessHoursText(hours) {
  const parsed = hours || DEFAULT_BUSINESS_HOURS
  if (parsed.allDay) return '全天营业'
  return `${parsed.openTime}${parsed.crossesMidnight ? ' – 次日 ' : ' – '}${parsed.closeTime}`
}

/**
 * 接口响应 → 内部结构；缺字段或格式非法一律回退缺省值（读路径绝不抛异常）。
 */
export function parseBusinessHours(json) {
  if (!json || typeof json !== 'object') return { ...DEFAULT_BUSINESS_HOURS }
  const openTime = normalizeTime(json.openTime)
  const closeTime = normalizeTime(json.closeTime)
  if (!openTime || !closeTime) return { ...DEFAULT_BUSINESS_HOURS }
  const allDay = openTime === closeTime
  const crossesMidnight = !allDay && isBefore(closeTime, openTime)
  return {
    openTime,
    closeTime,
    source: json.source || 'TENANT',
    crossesMidnight,
    allDay,
    displayText: businessHoursText({ openTime, closeTime, crossesMidnight, allDay }),
  }
}

/**
 * 某个时刻是否落在营业时段内（与服务端同一语义）。
 *
 * @param {string} time `HH:mm` / `HH:mm:ss`
 * @param {object} hours `parseBusinessHours` 的结果（缺省用默认营业时间）
 */
export function isWithinBusinessHours(time, hours) {
  const parsed = hours || DEFAULT_BUSINESS_HOURS
  const value = normalizeTime(time)
  if (!value) return false
  if (parsed.allDay) return true
  if (parsed.crossesMidnight) return value >= parsed.openTime || value < parsed.closeTime
  return value >= parsed.openTime && value < parsed.closeTime
}

/**
 * 从后端的门店本地时间串（`2026-09-20T20:30:00`，无时区）取 `HH:mm`；
 * 解析不出来返回 null（调用方不做越界标记，不臆造）。
 */
export function timeOfStoreDateTime(value) {
  if (value === null || value === undefined || value === '') return null
  const matched = /[T ](\d{2}):(\d{2})/.exec(String(value))
  if (matched) return `${matched[1]}:${matched[2]}`
  return normalizeTime(value)
}
