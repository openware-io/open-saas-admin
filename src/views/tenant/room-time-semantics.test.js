import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 「包厢消费时间 / 开台时长」口径守卫。
 *
 * 背景（真实缺陷）：收银台是**包厢维度**、订单管理是**订单维度**，两者的「消费时间」都只能来自
 * 当前这一次开台（会话）。历史上收银台的计时链用 `order.createdAt` 兜底、订单管理用
 * 「下单时间 → 结束时间」相减，多次开台时看起来像把多次消费累计成一段。
 *
 * 这里用源码守卫锁死：①计时函数必须接收「结束时刻 + 暂停秒数」（结台定格、暂停扣除）；
 * ②不得再用订单/预约时间兜底；③订单管理必须展示会话时段。
 */
const orders = readFileSync(new URL('./orders.vue', import.meta.url), 'utf8')
const orderManagement = readFileSync(new URL('./order-management.vue', import.meta.url), 'utf8')

describe('收银台（包厢维度）开台时长口径', () => {
  it('计时函数接收开始/结束/暂停三个入参，结台后定格并扣除暂停', () => {
    expect(orders).toContain('function elapsedText(startAt, endAt, pausedSeconds)')
    expect(orders).toContain('const finished = dateValue(endAt)')
    expect(orders).toContain('- (Number.isFinite(paused) ? paused : 0)')
  })

  it('没有任何一处用订单/预约时间兜底开台时长', () => {
    expect(orders).not.toContain('order?.startedAt, order?.createdAt')
    expect(orders).not.toContain('order.openedAt, order.startedAt, order.createdAt')
    // 计时调用必须带结束时刻与暂停秒数，不允许退回单参数调用
    expect(orders).not.toMatch(/elapsedText\([a-zA-Z]+\)/)
  })

  it('包厢卡片与订单卡片都从当前会话取开始/结束时刻', () => {
    expect(orders).toContain('const sessionStartedAt = firstValue(session.openedAt')
    expect(orders).toContain('const sessionEndedAt = firstValue(session.closedAt')
    expect(orders.match(/elapsed: elapsedText\(sessionStartedAt, sessionEndedAt, sessionPausedSeconds\)/g)?.length)
      .toBe(2)
  })
})

describe('订单管理（订单维度）消费时间口径', () => {
  it('展示会话时段，而不是「下单时间 → 结束时间」相减', () => {
    expect(orderManagement).toContain('function sessionSpanText(order)')
    expect(orderManagement).toContain("label=\"本次开台\"")
    expect(orderManagement).toContain('order.sessionOpenedAt')
  })
})
