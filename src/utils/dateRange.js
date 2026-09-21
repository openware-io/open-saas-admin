/**
 * 后台列表「时间区间」筛选的**唯一前端实现**（纯函数，无框架/无副作用，可直接单测）。
 *
 * 与后端 `com.gvchat.infrastructure.time.TimeRangeParams` 是同一套口径的两端：
 *  - 参数名固定 `from` / `to`，语义**闭区间**（`from <= 业务时间列 <= to`）；
 *  - 传 `yyyy-MM-dd` 即可：后端把 `from` 收口到当天 `00:00:00.000`、`to` 收口到当天 `23:59:59.999`；
 *    前端**不**自己拼时分秒，只有用户显式选了时刻（`datetimerange`）才传 `yyyy-MM-ddTHH:mm:ss`；
 *  - 区间为空 → **不发送空串**，直接不下发 `from`/`to`（后端按「没筛」处理）；
 *  - `from > to` → 前端提示且**不发起请求**（后端也会兜 400 `TIME_RANGE_INVALID`）。
 *
 * 之所以把解析/序列化/空值/收口都放在这里，是为了不让 13 个列表页各写一份判断：
 * 页面只需要 `dateRangeWarning()` 守一道门 + `dateRangeParams()` 取参数。
 */

/** `el-date-picker` 取日期时的 value-format（只到日，收口交给后端）。 */
export const DATE_RANGE_FORMAT = 'YYYY-MM-DD'

/** `el-date-picker` 取时刻时的 value-format（与后端 `yyyy-MM-ddTHH:mm:ss` 对齐前的空格形态）。 */
export const DATE_TIME_RANGE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

/** 与后端 `TimeRangeParams.MESSAGE_TIME_RANGE_INVALID` 完全一致的中文提示。 */
export const DATE_RANGE_INVALID_MESSAGE = '时间区间不合法，起始时间不能晚于结束时间'

/** 区间控件的默认占位文案（各页统一，不再各写「开始时间/结束时间」）。 */
export const DATE_RANGE_PLACEHOLDERS = ['开始日期', '结束日期']

/** 空区间：默认值（默认不筛）。每次调用返回新数组，避免调用方共享同一引用。 */
export function emptyDateRange() {
  return [null, null]
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/

/**
 * 把字符串/Date 归一化成 `{ date: 'yyyy-MM-dd', time: 'HH:mm:ss'|null }`。
 * 无法解析时返回 `null`（调用方按「空值」处理，不抛异常——界面不能因为脏值白屏）。
 *
 * @param {unknown} raw
 * @returns {{ date: string, time: string|null }|null}
 */
export function parseDateBound(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return { date: formatDateParts(raw.getFullYear(), raw.getMonth() + 1, raw.getDate()), time: null }
  }
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  const dateOnly = DATE_ONLY_PATTERN.exec(text)
  if (dateOnly) {
    if (!isRealDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))) return null
    return { date: text, time: null }
  }
  const withTime = DATE_TIME_PATTERN.exec(text)
  if (withTime) {
    if (!isRealDate(Number(withTime[1]), Number(withTime[2]), Number(withTime[3]))) return null
    const hh = Number(withTime[4])
    const mm = Number(withTime[5])
    const ss = withTime[6] === undefined ? 0 : Number(withTime[6])
    if (hh > 23 || mm > 59 || ss > 59) return null
    return { date: formatDateParts(Number(withTime[1]), Number(withTime[2]), Number(withTime[3])), time: pad(hh) + ':' + pad(mm) + ':' + pad(ss) }
  }
  return null
}

/**
 * 解析页面上的区间值（数组或对象两种形态都接受），并给出统一校验结果。
 *
 * 接受的形态：`null` / `[]` / `['2026-09-01', '2026-09-30']` / `['2026-09-01 08:00:00', null]`
 * / `{ from, to }`；无法解析的一端按空处理。
 *
 * @param {unknown} value
 * @returns {{ from: string|null, to: string|null, fromText: string|null, toText: string|null,
 *             valid: boolean, message: string|null, empty: boolean }}
 */
export function normalizeDateRange(value) {
  const rawFrom = Array.isArray(value) ? value[0] : value && typeof value === 'object' ? value.from : null
  const rawTo = Array.isArray(value) ? value[1] : value && typeof value === 'object' ? value.to : null
  const from = serializeBound(parseDateBound(rawFrom), false)
  const to = serializeBound(parseDateBound(rawTo), true)
  const empty = from === null && to === null
  const valid = empty || from === null || to === null || compareBounds(from, to) <= 0
  return {
    from,
    to,
    fromText: from,
    toText: to,
    valid,
    message: valid ? null : DATE_RANGE_INVALID_MESSAGE,
    empty,
  }
}

/**
 * 区间是否合法；不合法时返回提示文案，合法/为空时返回 `null`。
 *
 * 页面在「查询」入口用它守一道门：返回非空就提示并**不发起请求**。
 */
export function dateRangeWarning(value) {
  return normalizeDateRange(value).message
}

/**
 * 把区间值转成请求参数：为空的一端**不下发**（不发送空串），`from > to` 时返回 `{}`。
 *
 * @returns {{ from?: string, to?: string }}
 */
export function dateRangeParams(value) {
  const { from, to, valid } = normalizeDateRange(value)
  if (!valid) return {}
  const params = {}
  if (from !== null) params.from = from
  if (to !== null) params.to = to
  return params
}

/** 把区间参数合并进既有查询参数对象，不覆盖原有的同名键以外任何字段。 */
export function withDateRange(base, value) {
  return { ...base, ...dateRangeParams(value) }
}

/** 区间是否有任一端（用于「清除」按钮的可用态、空态文案）。 */
export function hasDateRange(value) {
  return !normalizeDateRange(value).empty
}

/** 区间展示文案：`2026-09-01 ~ 2026-09-30` / 单端 `2026-09-01 ~ —` / 空 `全部日期`。 */
export function dateRangeText(value) {
  const { from, to } = normalizeDateRange(value)
  if (from === null && to === null) return '全部日期'
  return (from === null ? '—' : dateOnlyText(from)) + ' ~ ' + (to === null ? '—' : dateOnlyText(to))
}

/**
 * `to` 的当天收口（仅用于**展示/前端本地判定**，请求参数不拼时分秒）。
 *
 * 与后端语义一致：日期形态的 `to` = 当天 `23:59:59.999`（不含次日零点）。
 * 用 `.999` 而不是 `.999999999`：后端列是 `DATETIME(3)`，纳秒会被 MySQL 进位到次日。
 */
export function closeToEndOfDay(raw) {
  const bound = parseDateBound(raw)
  if (bound === null) return null
  return bound.date + ' 23:59:59.999'
}

/** `from` 的当天收口（展示用）：当天 `00:00:00.000`。 */
export function openFromStartOfDay(raw) {
  const bound = parseDateBound(raw)
  if (bound === null) return null
  return bound.date + ' 00:00:00.000'
}

/** 取 `yyyy-MM-dd` 部分；无法解析返回 `null`。 */
export function dateOnlyText(raw) {
  const bound = parseDateBound(raw)
  return bound === null ? null : bound.date
}

/** 两个时间边界比较：`null` 排在最前/最后之外——任一端为空时不构成倒挂。 */
function compareBounds(a, b) {
  return normalizeBoundText(a) < normalizeBoundText(b) ? -1 : normalizeBoundText(a) > normalizeBoundText(b) ? 1 : 0
}

/** 比较用的可排序文本：日期形态补 `00:00:00`，时刻形态把 `T` 换成空格。 */
function normalizeBoundText(value) {
  return value.length === 10 ? value + ' 00:00:00' : value.replace('T', ' ')
}

/** 序列化单端：日期形态输出 `yyyy-MM-dd`；带时刻的输出 `yyyy-MM-ddTHH:mm:ss`。 */
function serializeBound(bound, isEnd) {
  if (bound === null) return null
  if (bound.time !== null) return bound.date + 'T' + bound.time
  // 日期形态原样下发（后端收口到整天）：这里保留 isEnd 只为把语义写清楚——
  // 「结束端补 23:59:59」是**后端**的职责，前端补了反而会与后端闭区间口径重复。
  return isEnd ? bound.date : bound.date
}

function isRealDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

function formatDateParts(year, month, day) {
  return year + '-' + pad(month) + '-' + pad(day)
}

function pad(value) {
  return String(value).padStart(2, '0')
}
