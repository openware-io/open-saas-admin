import { describe, expect, it } from 'vitest'
import {
  DATE_RANGE_INVALID_MESSAGE,
  closeToEndOfDay,
  dateOnlyText,
  dateRangeParams,
  dateRangeText,
  dateRangeWarning,
  emptyDateRange,
  hasDateRange,
  normalizeDateRange,
  openFromStartOfDay,
  parseDateBound,
  withDateRange,
} from './dateRange'

/**
 * 后台列表时间区间口径（前端唯一实现）：闭区间、`yyyy-MM-dd` 原样下发、空值不筛、倒挂不请求。
 *
 * 这些断言必须与后端 `com.gvchat.infrastructure.time.TimeRangeParams`（及
 * `TimeRangeParamsTest`）一一对应：两端各改一处会让「界面能选、服务端不认」。
 */
describe('时间区间：默认值与空值处理', () => {
  it('默认空区间 = 不筛（每次返回新数组，避免页面间共享引用）', () => {
    expect(emptyDateRange()).toEqual([null, null])
    expect(emptyDateRange()).not.toBe(emptyDateRange())
    expect(hasDateRange(null)).toBe(false)
    expect(hasDateRange(emptyDateRange())).toBe(false)
    expect(hasDateRange(['2026-09-01', null])).toBe(true)
  })

  it('空值不下发 from/to（不发送空串，后端按缺省不筛）', () => {
    expect(dateRangeParams(null)).toEqual({})
    expect(dateRangeParams([])).toEqual({})
    expect(dateRangeParams([null, null])).toEqual({})
    expect(dateRangeParams(['', ''])).toEqual({})
    // 关键：绝不能出现 from:'' / to:'' 这种「传了但没筛」的中间态
    expect(Object.keys(dateRangeParams([null, null]))).toHaveLength(0)
  })

  it('只有一端时只下发那一端', () => {
    expect(dateRangeParams(['2026-09-01', null])).toEqual({ from: '2026-09-01' })
    expect(dateRangeParams([null, '2026-09-30'])).toEqual({ to: '2026-09-30' })
    expect(dateRangeParams(['2026-09-01', ''])).toEqual({ from: '2026-09-01' })
  })
})

describe('时间区间：序列化（日期原样、时刻用 T 分隔）', () => {
  it('日期形态原样下发 yyyy-MM-dd，收口交给后端', () => {
    expect(dateRangeParams(['2026-09-01', '2026-09-30'])).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('时刻形态序列化成后端约定的 yyyy-MM-ddTHH:mm:ss', () => {
    expect(dateRangeParams(['2026-09-01 08:30:00', '2026-09-30 20:15:30']))
      .toEqual({ from: '2026-09-01T08:30:00', to: '2026-09-30T20:15:30' })
  })

  it('已经是 ISO 形态的值幂等（重复序列化不叠加）', () => {
    expect(dateRangeParams(['2026-09-01T08:30:00', '2026-09-30T20:15:30']))
      .toEqual({ from: '2026-09-01T08:30:00', to: '2026-09-30T20:15:30' })
    expect(dateRangeParams(dateRangeParams(['2026-09-01', '2026-09-30'])))
      .toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('接受 { from, to } 对象形态与 Date 形态', () => {
    expect(dateRangeParams({ from: '2026-09-01', to: '2026-09-30' }))
      .toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(dateRangeParams([new Date(2026, 8, 1), new Date(2026, 8, 30)]))
      .toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('无法解析的脏值按空处理，不抛异常（界面不能因此白屏）', () => {
    expect(dateRangeParams(['不是日期', null])).toEqual({})
    expect(dateRangeParams(['2026-02-30', null])).toEqual({})
    expect(dateRangeParams([{}, 123])).toEqual({})
    expect(() => normalizeDateRange(undefined)).not.toThrow()
    expect(parseDateBound('2026-13-01')).toBe(null)
    expect(parseDateBound('2026-09-01T25:00:00')).toBe(null)
  })
})

describe('时间区间：from > to 的倒挂校验', () => {
  it('倒挂返回统一中文提示（与后端 message 一致）', () => {
    expect(dateRangeWarning(['2026-09-30', '2026-09-01'])).toBe(DATE_RANGE_INVALID_MESSAGE)
    expect(DATE_RANGE_INVALID_MESSAGE).toBe('时间区间不合法，起始时间不能晚于结束时间')
  })

  it('倒挂（精确到秒）同样命中提示', () => {
    expect(dateRangeWarning(['2026-09-01 08:00:00', '2026-09-01 07:00:00'])).toBe(DATE_RANGE_INVALID_MESSAGE)
  })

  it('倒挂时不下发任何参数——页面据此不发起请求也不会「筛出全量」', () => {
    expect(dateRangeParams(['2026-09-30', '2026-09-01'])).toEqual({})
  })

  it('同一天不算倒挂（后端把 to 收口到当天末尾，整天可命中）', () => {
    expect(dateRangeWarning(['2026-09-01', '2026-09-01'])).toBe(null)
    expect(dateRangeParams(['2026-09-01', '2026-09-01'])).toEqual({ from: '2026-09-01', to: '2026-09-01' })
  })

  it('只有一端时永远不算倒挂', () => {
    expect(dateRangeWarning([null, '2026-09-01'])).toBe(null)
    expect(dateRangeWarning(['2026-09-30', null])).toBe(null)
    expect(dateRangeWarning(null)).toBe(null)
  })
})

describe('时间区间：to 的当天收口与 from 的当天起点（展示口径）', () => {
  it('to 收口到当天 23:59:59.999（不是次日零点）', () => {
    expect(closeToEndOfDay('2026-09-30')).toBe('2026-09-30 23:59:59.999')
    expect(closeToEndOfDay('2026-09-30 20:15:30')).toBe('2026-09-30 23:59:59.999')
    expect(closeToEndOfDay(null)).toBe(null)
  })

  it('from 起点是当天 00:00:00.000', () => {
    expect(openFromStartOfDay('2026-09-01')).toBe('2026-09-01 00:00:00.000')
    expect(openFromStartOfDay('bad')).toBe(null)
  })

  it('dateOnlyText 取日期部分', () => {
    expect(dateOnlyText('2026-09-01T08:30:00')).toBe('2026-09-01')
    expect(dateOnlyText('2026-09-01')).toBe('2026-09-01')
    expect(dateOnlyText('')).toBe(null)
  })
})

describe('时间区间：合并进查询参数与展示文案', () => {
  it('withDateRange 合并区间且不改动原有筛选字段', () => {
    expect(withDateRange({ page: 1, keyword: '可乐' }, ['2026-09-01', '2026-09-30']))
      .toEqual({ page: 1, keyword: '可乐', from: '2026-09-01', to: '2026-09-30' })
    // 空区间时原有字段保持原样，不额外注入 from/to
    expect(withDateRange({ page: 2, status: 'ACTIVE' }, null)).toEqual({ page: 2, status: 'ACTIVE' })
  })

  it('展示文案：完整区间 / 单端 / 空', () => {
    expect(dateRangeText(['2026-09-01', '2026-09-30'])).toBe('2026-09-01 ~ 2026-09-30')
    expect(dateRangeText(['2026-09-01', null])).toBe('2026-09-01 ~ —')
    expect(dateRangeText([null, '2026-09-30'])).toBe('— ~ 2026-09-30')
    expect(dateRangeText(null)).toBe('全部日期')
  })
})
