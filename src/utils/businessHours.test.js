import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUSINESS_HOURS,
  businessHoursText,
  isWithinBusinessHours,
  normalizeTime,
  parseBusinessHours,
  timeOfStoreDateTime,
} from './businessHours'

/**
 * 营业时间判定：与服务端（KtvBusinessHoursApplicationService / TenantBusinessHoursClient）
 * 同一语义 —— 左闭右开、跨自然日、全天营业；缺省 KTV 夜间业态 18:00 – 次日 05:00。
 */
describe('营业时间：缺省与文案', () => {
  it('缺省就是 KTV 夜间业态 18:00 – 次日 05:00', () => {
    expect(DEFAULT_BUSINESS_HOURS.openTime).toBe('18:00')
    expect(DEFAULT_BUSINESS_HOURS.closeTime).toBe('05:00')
    expect(DEFAULT_BUSINESS_HOURS.crossesMidnight).toBe(true)
    expect(businessHoursText(DEFAULT_BUSINESS_HOURS)).toBe('18:00 – 次日 05:00')
  })

  it('同一天区间与全天营业的文案', () => {
    expect(businessHoursText({ openTime: '09:00', closeTime: '22:00', crossesMidnight: false }))
      .toBe('09:00 – 22:00')
    expect(businessHoursText({ openTime: '00:00', closeTime: '00:00', allDay: true })).toBe('全天营业')
  })
})

describe('营业时间：接口响应解析', () => {
  it('正常响应按接口值解析（门店覆盖 09:00–22:00）', () => {
    const hours = parseBusinessHours({ openTime: '09:00', closeTime: '22:00', source: 'STORE' })
    expect(hours).toMatchObject({ openTime: '09:00', closeTime: '22:00', source: 'STORE', crossesMidnight: false })
  })

  it('跨自然日响应自动识别 crossesMidnight', () => {
    const hours = parseBusinessHours({ openTime: '20:00', closeTime: '04:00', source: 'TENANT' })
    expect(hours.crossesMidnight).toBe(true)
    expect(hours.displayText).toBe('20:00 – 次日 04:00')
  })

  it('缺字段 / 非法格式 / 空响应一律回退缺省值，不抛异常', () => {
    for (const bad of [null, undefined, {}, { openTime: '晚上六点', closeTime: '05:00' }, { openTime: '18:00' }]) {
      expect(() => parseBusinessHours(bad)).not.toThrow()
      expect(parseBusinessHours(bad)).toEqual({ ...DEFAULT_BUSINESS_HOURS })
    }
  })

  it('时刻归一化：补零、拒绝越界值', () => {
    expect(normalizeTime('9:05')).toBe('09:05')
    expect(normalizeTime('18:00:30')).toBe('18:00')
    expect(normalizeTime('25:00')).toBe(null)
    expect(normalizeTime('18:75')).toBe(null)
  })
})

describe('营业时间：时刻是否在时段内（左闭右开）', () => {
  const night = parseBusinessHours({ openTime: '18:00', closeTime: '05:00' })
  const day = parseBusinessHours({ openTime: '09:00', closeTime: '22:00' })

  it('跨自然日：18:00 起、次日 05:00 前；凌晨属于营业时段', () => {
    expect(isWithinBusinessHours('18:00', night)).toBe(true)
    expect(isWithinBusinessHours('23:59', night)).toBe(true)
    expect(isWithinBusinessHours('00:00', night)).toBe(true)
    expect(isWithinBusinessHours('04:59', night)).toBe(true)
    expect(isWithinBusinessHours('05:00', night)).toBe(false)
    expect(isWithinBusinessHours('17:59', night)).toBe(false)
  })

  it('同一天区间：09:00–22:00', () => {
    expect(isWithinBusinessHours('09:00', day)).toBe(true)
    expect(isWithinBusinessHours('21:59', day)).toBe(true)
    expect(isWithinBusinessHours('22:00', day)).toBe(false)
    expect(isWithinBusinessHours('08:59', day)).toBe(false)
  })

  it('全天营业恒为真；缺省（不传 hours）按默认营业时间判定', () => {
    const allDay = parseBusinessHours({ openTime: '00:00', closeTime: '00:00' })
    expect(allDay.allDay).toBe(true)
    expect(isWithinBusinessHours('03:00', allDay)).toBe(true)
    expect(isWithinBusinessHours('15:00')).toBe(false)
    expect(isWithinBusinessHours('20:00')).toBe(true)
  })

  it('无法解析的时刻一律判为不在时段内（宁可让服务端放行，也不误判为可下单）', () => {
    expect(isWithinBusinessHours('', night)).toBe(false)
    expect(isWithinBusinessHours(null, night)).toBe(false)
  })
})

describe('营业时间：预约门店本地时间取时刻', () => {
  it('从 ord_reservation.startAt（门店本地墙上时间）取 HH:mm', () => {
    expect(timeOfStoreDateTime('2026-09-20T20:30:00')).toBe('20:30')
    expect(timeOfStoreDateTime('2026-09-20 01:05:00')).toBe('01:05')
    expect(timeOfStoreDateTime('')).toBe(null)
    expect(timeOfStoreDateTime(null)).toBe(null)
  })
})
